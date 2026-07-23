import { readFileSync } from "node:fs";
import { Prisma } from "@ogfi/database";
import { describe, expect, test } from "vitest";
import { buildPettyCashApprovalStepIntent } from "./approvals";

const base = {
  tenantId: "00000000-0000-4000-8000-000000000001",
  companyId: "00000000-0000-4000-8000-000000000002",
  pettyCashRequestId: "00000000-0000-4000-8000-000000000003",
  approvalInstanceId: "00000000-0000-4000-8000-000000000004",
  approvalStepId: "00000000-0000-4000-8000-000000000005",
  stepOrder: 2,
  actorUserId: "00000000-0000-4000-8000-000000000006",
  action: "APPROVE" as const,
  requestedAmountSnapshotPhp: new Prisma.Decimal("125.5"),
  beforeAmountPhp: new Prisma.Decimal("100"),
  effectiveAmountPhp: new Prisma.Decimal("100.000000"),
  requestVersionBefore: 7,
  reason: "  Within policy  ",
  supplementalEvidenceReference: "  evidence://approval/42  "
};

describe("Petty Cash approval step intent canonicalization", () => {
  test("is deterministic, normalizes text, and fixes every amount to six decimals", () => {
    const first = buildPettyCashApprovalStepIntent(base);
    const equivalent = buildPettyCashApprovalStepIntent({
      ...base,
      requestedAmountSnapshotPhp: new Prisma.Decimal("125.500000"),
      beforeAmountPhp: new Prisma.Decimal("100.0"),
      reason: "Within policy",
      supplementalEvidenceReference: "evidence://approval/42"
    });

    expect(equivalent).toEqual(first);
    expect(first.decisionPayloadHash).toMatch(/^[a-f0-9]{64}$/);
    expect(first.idempotencyKey).toBe(
      `petty-cash-approval-intent:v1:${first.decisionPayloadHash}`
    );
    expect(first.requestVersionAfter).toBe(8);
    expect(JSON.parse(first.canonicalPayload)).toEqual({
      schemaVersion: 1,
      action: "APPROVE",
      tenantId: base.tenantId,
      companyId: base.companyId,
      pettyCashRequestId: base.pettyCashRequestId,
      approvalInstanceId: base.approvalInstanceId,
      approvalStepId: base.approvalStepId,
      stepOrder: 2,
      actorUserId: base.actorUserId,
      requestedAmountSnapshotPhp: "125.500000",
      beforeAmountPhp: "100.000000",
      effectiveAmountPhp: "100.000000",
      requestVersionBefore: 7,
      requestVersionAfter: 8,
      reason: "Within policy",
      supplementalEvidenceReference: "evidence://approval/42"
    });
  });

  test("keeps full-graph locking opt-in and wires only normalized Petty Cash decisions", () => {
    const routingSource = readFileSync(
      new URL("./approvalRouting.ts", import.meta.url),
      "utf8"
    );
    const approvalSource = readFileSync(
      new URL("./approvals.ts", import.meta.url),
      "utf8"
    );
    expect(routingSource).toContain('lockMode?: "ACTIONABLE_PAIR"');
    expect(routingSource).toContain('lockMode: "FULL_GRAPH"');
    expect(routingSource).toContain(
      'ORDER BY step."stepOrder" ASC, step.id ASC'
    );
    expect(routingSource).toContain('FOR UPDATE OF request');
    expect(routingSource).toContain('FOR SHARE OF fund, location');
    expect(routingSource).toContain(
      "assertNormalizedPettyCashSourceRoutingScope"
    );
    expect(routingSource).toContain(
      "lockNormalizedApprovalStepScopeMetadata"
    );
    expect(approvalSource.match(/lockMode: "FULL_GRAPH"/g)).toHaveLength(2);
    expect(approvalSource).toContain(
      "await appendPettyCashApprovalIntentAndAdvanceProposal"
    );
    expect(approvalSource).toContain(
      "approvalProposalVersion: { increment: 1 }"
    );
    expect(approvalSource).toContain(
      '"PETTY_CASH_REQUEST_EVIDENCE_REQUIRED"'
    );
    const noRelockTerminalSlice = approvalSource.slice(
      approvalSource.indexOf(
        "async function skipLockedPettyCashFutureApprovalSteps"
      ),
      approvalSource.indexOf(
        "async function finalizeNormalizedPettyCashApproval"
      )
    );
    expect(noRelockTerminalSlice).toContain("input.lockedGraph.steps.filter");
    expect(noRelockTerminalSlice).not.toContain("$queryRaw");
    const pettyCashDecisionSlice = approvalSource.slice(
      approvalSource.indexOf(
        "async function appendPettyCashApprovalIntentAndAdvanceProposal"
      ),
      approvalSource.indexOf("export async function approvePaymentRequestApproval")
    );
    expect(pettyCashDecisionSlice).not.toMatch(
      /pettyCashFund\.(?:create|update)|pettyCashLedgerEntry\.create|paymentRequest\.create|bankAccount\.update|financeJournal\.create/
    );
    expect(pettyCashDecisionSlice).not.toContain(
      "await assertApprovalScope(session"
    );
  });

  test.each([
    ["action", { action: "REJECT" as const }],
    ["lineage", { approvalStepId: "00000000-0000-4000-8000-000000000007" }],
    ["actor", { actorUserId: "00000000-0000-4000-8000-000000000008" }],
    ["amount", { effectiveAmountPhp: new Prisma.Decimal("99.999999") }],
    ["version", { requestVersionBefore: 8 }],
    ["reason", { reason: "Different reason" }],
    ["evidence", { supplementalEvidenceReference: "evidence://approval/43" }]
  ])("binds %s into the hash and v1 idempotency key", (_field, change) => {
    const original = buildPettyCashApprovalStepIntent(base);
    const changed = buildPettyCashApprovalStepIntent({ ...base, ...change });
    expect(changed.decisionPayloadHash).not.toBe(original.decisionPayloadHash);
    expect(changed.idempotencyKey).not.toBe(original.idempotencyKey);
  });

  test("canonicalizes blank optional context to null", () => {
    const intent = buildPettyCashApprovalStepIntent({
      ...base,
      reason: "   ",
      supplementalEvidenceReference: "   "
    });
    expect(intent.reason).toBeNull();
    expect(intent.supplementalEvidenceReference).toBeNull();
    expect(JSON.parse(intent.canonicalPayload)).toMatchObject({
      reason: null,
      supplementalEvidenceReference: null
    });
  });
});
