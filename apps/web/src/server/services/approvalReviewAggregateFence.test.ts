import { readFileSync } from "node:fs";
import type { TransactionClient } from "@ogfi/database";
import { describe, expect, it, vi } from "vitest";
import {
  approvalReviewAggregateFenceKeyForTest,
  approvalReviewSourceFrozenError,
  assertApprovalReviewEvidenceSourceMutable,
  assertApprovalReviewQuotationRequestMutable,
} from "./approvalReviewAggregateFence";

const ids = {
  tenant: "00000000-0000-4000-8000-000000000001",
  company: "00000000-0000-4000-8000-000000000002",
  source: "00000000-0000-4000-8000-000000000003",
};

const source = (name: string) =>
  readFileSync(new URL(`./${name}`, import.meta.url), "utf8");

describe("approval reviewed-state aggregate writer fence", () => {
  it("derives a deterministic, scope- and family-bound advisory key", () => {
    const input = {
      tenantId: ids.tenant,
      companyId: ids.company,
      sourceType: "PURCHASE_REQUEST" as const,
      sourceRecordId: ids.source,
    };
    const key = approvalReviewAggregateFenceKeyForTest(input);

    expect(approvalReviewAggregateFenceKeyForTest(input)).toEqual(key);
    expect(key).not.toEqual(
      approvalReviewAggregateFenceKeyForTest({
        ...input,
        sourceType: "PURCHASE_ORDER",
      }),
    );
    expect(key).not.toEqual(
      approvalReviewAggregateFenceKeyForTest({
        ...input,
        companyId: "00000000-0000-4000-8000-000000000004",
      }),
    );
  });

  it("locks before rejecting a pending direct-source approval", async () => {
    const queryRaw = vi
      .fn()
      .mockResolvedValueOnce([{ approvalId: "approval-1", status: "PENDING" }])
      .mockResolvedValueOnce([{ status: "APPROVED" }])
      .mockResolvedValueOnce([{ approvalId: "approval-1", status: "APPROVED" }]);
    const executeRaw = vi.fn().mockResolvedValueOnce(1);
    const tx = {
      $queryRaw: queryRaw,
      $executeRaw: executeRaw,
    } as unknown as TransactionClient;

    await expect(
      assertApprovalReviewEvidenceSourceMutable(tx, {
        tenantId: ids.tenant,
        companyId: ids.company,
        sourceType: "PURCHASE_REQUEST",
        sourceRecordId: ids.source,
      }),
    ).rejects.toThrow(approvalReviewSourceFrozenError);
    expect(queryRaw).toHaveBeenCalledTimes(3);
    expect(executeRaw).toHaveBeenCalledTimes(1);
  });

  it("allows a new post-decision writer when APPROVED is stable across the lock", async () => {
    const queryRaw = vi
      .fn()
      .mockResolvedValueOnce([{ approvalId: "approval-1", status: "APPROVED" }])
      .mockResolvedValueOnce([{ status: "APPROVED" }])
      .mockResolvedValueOnce([{ approvalId: "approval-1", status: "APPROVED" }]);
    const executeRaw = vi.fn().mockResolvedValueOnce(1);
    const tx = {
      $queryRaw: queryRaw,
      $executeRaw: executeRaw,
    } as unknown as TransactionClient;

    await assertApprovalReviewEvidenceSourceMutable(tx, {
      tenantId: ids.tenant,
      companyId: ids.company,
      sourceType: "PURCHASE_REQUEST",
      sourceRecordId: ids.source,
    });
    expect(queryRaw).toHaveBeenCalledTimes(3);
    expect(executeRaw).toHaveBeenCalledTimes(1);
  });

  it("allows legitimate revision when RETURNED is stable across the lock", async () => {
    const returned = [{ approvalId: "approval-1", status: "RETURNED" }];
    const queryRaw = vi
      .fn()
      .mockResolvedValueOnce(returned)
      .mockResolvedValueOnce([{ status: "RETURNED" }])
      .mockResolvedValueOnce(returned);
    const executeRaw = vi.fn().mockResolvedValueOnce(1);
    const tx = {
      $queryRaw: queryRaw,
      $executeRaw: executeRaw,
    } as unknown as TransactionClient;

    await expect(
      assertApprovalReviewEvidenceSourceMutable(tx, {
        tenantId: ids.tenant,
        companyId: ids.company,
        sourceType: "PURCHASE_REQUEST",
        sourceRecordId: ids.source,
      }),
    ).resolves.toBeUndefined();
  });

  it("does not query or lock unrelated evidence families", async () => {
    const queryRaw = vi.fn();
    const tx = { $queryRaw: queryRaw } as unknown as TransactionClient;

    await assertApprovalReviewEvidenceSourceMutable(tx, {
      tenantId: ids.tenant,
      companyId: ids.company,
      sourceType: "WORKFORCE_LEAVE",
      sourceRecordId: ids.source,
    });
    expect(queryRaw).not.toHaveBeenCalled();
  });

  it("rejects a new-quote writer that waited while recommendation approval changed", async () => {
    const queryRaw = vi
      .fn()
      .mockResolvedValueOnce([{ approvalId: "approval-1", status: "PENDING" }])
      .mockResolvedValueOnce([{ status: "OPEN" }])
      .mockResolvedValueOnce([{ approvalId: "approval-1", status: "APPROVED" }]);
    const executeRaw = vi.fn().mockResolvedValueOnce(1);
    const tx = {
      $queryRaw: queryRaw,
      $executeRaw: executeRaw,
    } as unknown as TransactionClient;

    await expect(
      assertApprovalReviewQuotationRequestMutable(tx, {
        tenantId: ids.tenant,
        companyId: ids.company,
        quotationRequestId: ids.source,
      }),
    ).rejects.toThrow(approvalReviewSourceFrozenError);
    expect(queryRaw).toHaveBeenCalledTimes(3);
    expect(executeRaw).toHaveBeenCalledTimes(1);
  });

  it("allows stable post-decision quote lifecycle writes", async () => {
    const approved = [{ approvalId: "approval-1", status: "APPROVED" }];
    const queryRaw = vi
      .fn()
      .mockResolvedValueOnce(approved)
      .mockResolvedValueOnce([{ status: "OPEN" }])
      .mockResolvedValueOnce(approved);
    const executeRaw = vi.fn().mockResolvedValueOnce(1);
    const tx = {
      $queryRaw: queryRaw,
      $executeRaw: executeRaw,
    } as unknown as TransactionClient;

    await expect(
      assertApprovalReviewQuotationRequestMutable(tx, {
        tenantId: ids.tenant,
        companyId: ids.company,
        quotationRequestId: ids.source,
      }),
    ).resolves.toBeUndefined();
  });

  it("binds all controlled-evidence and PR-comment writer transactions", () => {
    const fence = source("approvalReviewAggregateFence.ts");
    const attachments = source("attachments.ts");
    const uploads = source("evidenceUploads.ts");
    const purchaseRequests = source("purchaseRequests.ts");
    const quotes = source("quotes.ts");

    expect(fence).toContain("pg_advisory_xact_lock");
    expect(fence).toContain("::int, ${key.aggregateKey}::int");
    expect(fence).toContain('approval.status::text AS status');
    expect(fence).toContain('approval.status === "PENDING"');
    expect(fence).toContain("JSON.stringify(beforeLock)");
    expect(fence).toContain('ORDER BY quotation.id');
    const decisionFenceStart = fence.indexOf(
      "export async function acquireApprovalReviewDecisionAggregateFences",
    );
    const decisionFenceSource = fence.slice(decisionFenceStart);
    expect(decisionFenceSource.indexOf('sourceType: "QUOTATION_REQUEST"'))
      .toBeLessThan(decisionFenceSource.indexOf('ORDER BY quotation.id'));
    expect(fence).toContain("acquireApprovalReviewDecisionAggregateFences");
    expect(fence).toContain("APPROVAL_REVIEW_SOURCE_FROZEN");
    expect(
      attachments.match(/assertApprovalReviewEvidenceSourceMutable\(tx,/g),
    ).toHaveLength(4);
    expect(
      uploads.match(/assertApprovalReviewEvidenceSourceMutable\(tx,/g),
    ).toHaveLength(5);

    const commentStart = purchaseRequests.indexOf(
      "export async function addPurchaseRequestComment",
    );
    const commentSource = purchaseRequests.slice(commentStart);
    expect(commentSource.indexOf("assertApprovalReviewEvidenceSourceMutable"))
      .toBeGreaterThan(-1);
    expect(commentSource.indexOf("assertApprovalReviewEvidenceSourceMutable"))
      .toBeLessThan(commentSource.indexOf("purchaseRequestComment.create"));

    const createQuoteStart = quotes.indexOf(
      "export async function createSupplierQuote",
    );
    const createQuoteSource = quotes.slice(createQuoteStart);
    expect(createQuoteSource.indexOf("assertApprovalReviewQuotationRequestMutable"))
      .toBeGreaterThan(-1);
    expect(createQuoteSource.indexOf("assertApprovalReviewQuotationRequestMutable"))
      .toBeLessThan(createQuoteSource.indexOf('INSERT INTO "SupplierQuotation"'));
  });
});
