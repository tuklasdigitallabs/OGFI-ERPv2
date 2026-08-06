import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { BoundedApprovalReview } from "@/server/services/boundedApprovalReview";
import { BoundedApprovalReviewPanel } from "./BoundedApprovalReviewPanel";
import type { ApprovalDecisionActionState } from "./ApprovalDecisionComposer";

const action = vi.fn(async (): Promise<ApprovalDecisionActionState> => ({ status: "idle" }));
const routing = {
  assignedUserId: null,
  assignedUserName: null,
  assignedRoleId: "role-1",
  assignedRoleName: "Purchasing Manager",
  requiredPermissionCode: "procurement.approve",
  fingerprint: "routing-digest",
};

function render(review: BoundedApprovalReview, decisions = ["APPROVE", "RETURN", "REJECT"]) {
  vi.stubGlobal("React", React);
  return renderToStaticMarkup(
    <BoundedApprovalReviewPanel
      action={action}
      decisionPresentation={{
        family: review.family,
        supportsSupplementalEvidence: false,
        decisions: decisions.map((decision) => ({
          decision,
          label: decision,
          supported: true,
          available: true,
        })),
      }}
      review={review}
    />,
  );
}

describe("Bounded approval review panel", () => {
  it("shows complete commercial quote comparisons without collapsing mixed UOM lines", () => {
    const evidence = {
      id: "evidence-1",
      sourceRecordId: "quote-1",
      sourceLineId: null,
      purpose: "SUPPLIER_QUOTE",
      caption: "Signed supplier quotation",
      requiredForAction: "APPROVE",
      originalFilename: "freshfarm-quotation.pdf",
      mimeType: "application/pdf",
      sizeBytes: 2048,
      uploadState: "COMPLETED",
      scanState: "CLEAN",
      availabilityState: "AVAILABLE",
      createdAt: "2026-08-05T01:00:00.000Z",
      updatedAt: "2026-08-05T01:00:00.000Z",
    };
    const line = (id: string, itemName: string, quantity: string, uomCode: string) => ({
      id,
      lineNumber: 1,
      itemCode: id.toUpperCase(),
      itemName,
      description: itemName,
      quantity: { raw: quantity, uomCode },
      unitAmount: { raw: "125.50", currencyCode: "PHP" },
      lineAmount: { raw: "251.00", currencyCode: "PHP" },
      purpose: null,
      availabilityStatus: "AVAILABLE",
      leadTimeDays: 2,
      notes: "Deliver chilled",
    });
    const review = {
      family: "QuotationRecommendation",
      sourceRevision: "version:2",
      reviewDigest: "review-digest",
      sourceHref: "/quotes?requestId=pr-1",
      sourceAccess: "AUTHORIZED",
      reviewToken: "review-token",
      routing,
      canonicalSnapshot: {
        approval: { approvalInstanceId: "approval-1" },
        source: { updatedAt: "2026-08-05T02:00:00.000Z" },
      },
      presentation: {
        heading: "Quotation Recommendation for PR-1001",
        publicReference: "PR-1001",
        status: "PENDING_APPROVAL",
        scope: {
          company: { id: "company-1", code: "OGF", name: "One Gourmet Foods" },
          brand: { id: "brand-1", code: "YL", name: "Yakiniku Like" },
          location: { id: "location-1", code: "BGC", name: "BGC Branch" },
          department: { id: "department-1", code: "OPS", name: "Operations" },
          costCenter: { id: "cost-1", code: "BGC-OPS", name: "BGC Operations" },
        },
        owner: { userId: "user-1", displayName: "Ana Buyer", roleLabel: "Prepared by" },
        dates: [
          { label: "Required date", value: "2026-08-10T00:00:00.000Z" },
          { label: "Recommendation updated", value: "2026-08-05T02:00:00.000Z" },
        ],
        approval: { stepOrder: 2, activatedAt: "2026-08-05T03:00:00.000Z", dueAt: "2026-08-06T03:00:00.000Z" },
        amounts: [
          { label: "Selected evaluated total", raw: "251.00", currencyCode: "PHP" },
          { label: "Lowest evaluated total", raw: "240.00", currencyCode: "PHP" },
        ],
        rationale: [{ label: "Selection reason", value: "Cold-chain reliability" }],
        riskFlags: ["NON_LOWEST_QUOTE_SELECTED"],
        evidence: [evidence],
        lines: [line("item-1", "Japanese cucumber", "2", "KG")],
        quoteComparisons: [
          {
            quoteId: "quote-1",
            quoteReference: "FF-001",
            supplierName: "FreshFarm Manila",
            supplierAccreditationStatus: "APPROVED",
            status: "SUBMITTED",
            selected: true,
            quoteDate: "2026-08-04T00:00:00.000Z",
            validityDate: "2026-08-14T00:00:00.000Z",
            currencyCode: "PHP",
            subtotalAmount: "251.00",
            taxAmount: "0.00",
            discountAmount: "0.00",
            freightAmount: "0.00",
            otherChargesAmount: "0.00",
            totalAmount: "251.00",
            terms: "Net 15 after inspected receiving",
            evidenceAccess: "AUTHORIZED",
            evidence: [evidence],
            lines: [line("cucumber", "Japanese cucumber", "2", "KG")],
          },
          {
            quoteId: "quote-2",
            quoteReference: "ALT-002",
            supplierName: "Alternative Produce",
            supplierAccreditationStatus: "APPROVED",
            status: "SUBMITTED",
            selected: false,
            quoteDate: "2026-08-04T00:00:00.000Z",
            validityDate: null,
            currencyCode: "PHP",
            subtotalAmount: "240.00",
            taxAmount: "0.00",
            discountAmount: "0.00",
            freightAmount: "0.00",
            otherChargesAmount: "0.00",
            totalAmount: "240.00",
            terms: "Cash on delivery",
            evidenceAccess: "AUTHORIZED",
            evidence: [],
            lines: [line("cucumber-case", "Japanese cucumber case", "1", "CASE")],
          },
        ],
      },
    } as unknown as BoundedApprovalReview;

    const html = render(review);

    expect(html).toContain("Source timing and value");
    expect(html).toContain("Selected evaluated total");
    expect(html).toContain("Purchasing Manager role");
    expect(html).toContain("Net 15 after inspected receiving");
    expect(html).toContain("Cash on delivery");
    expect(html).toContain("2 KG");
    expect(html).toContain("1 CASE");
    expect(html).toContain("freshfarm-quotation.pdf");
    expect(html).toContain("Signed supplier quotation");
  });

  it("shows stock-count controls, counter timestamps, revisions, recount lineage, and approve-only guidance", () => {
    const review = {
      family: "StockCountAttemptReview",
      sourceRevision: { attemptVersion: 4, sessionVersion: 7 },
      canonicalRawSnapshot: "{}",
      snapshotDigest: "digest",
      sourceHref: "/counts/session-1",
      reviewToken: "review-token",
      routing: { ...routing, assignedRoleName: "Inventory Controller", requiredPermissionCode: "inventory.count.approve" },
      canonicalSnapshot: {
        approvalStep: {
          approvalInstanceId: "approval-count-1",
          activatedAt: "2026-08-05T03:00:00.000Z",
        },
        updatedAt: "2026-08-05T04:00:00.000Z",
        attemptNumber: 2,
        attemptVersion: 4,
        sessionVersion: 7,
        countType: "CYCLE_COUNT",
        scopeType: "HIGH_RISK_ITEMS",
        blindCount: true,
        freezeMovements: true,
        assignedToName: "Carlo Counter",
        cutoffAt: "2026-08-05T00:00:00.000Z",
        scheduledDate: "2026-08-05T00:00:00.000Z",
        startedAt: "2026-08-05T01:00:00.000Z",
        submittedAt: "2026-08-05T02:00:00.000Z",
        lines: [
          { lineNumber: 1, countedByName: "Carlo Counter", countedAt: "2026-08-05T01:30:00.000Z" },
        ],
        recountTransitions: [
          {
            id: "transition-1",
            successorAttemptId: "attempt-3",
            linkedStockAdjustmentId: "adjustment-1",
            adjustmentDisposition: "REQUIRED",
            cutoffDisposition: "PRESERVED",
            reason: "Variance exceeded tolerance",
            evidenceReference: "COUNT-PHOTO-002",
            occurredAt: "2026-08-05T03:30:00.000Z",
          },
        ],
      },
      presentation: {
        title: "Stock Count Review",
        publicReference: "SC-1001-A2",
        status: "PENDING_APPROVAL",
        scope: {
          companyId: "company-1",
          companyCode: "OGF",
          companyName: "One Gourmet Foods",
          brandId: "brand-1",
          brandName: "Yakiniku Like",
          locationId: "location-1",
          locationName: "BGC Branch",
          sourceEndpoint: null,
          destinationEndpoint: null,
        },
        ownerName: "Inventory Supervisor",
        createdAt: "2026-08-05T00:00:00.000Z",
        submittedAt: "2026-08-05T02:00:00.000Z",
        requiredAt: "2026-08-05T00:00:00.000Z",
        dueAt: "2026-08-06T00:00:00.000Z",
        currentStepOrder: 1,
        rationale: ["High-risk cycle count"],
        risks: ["Line 1 variance -3 KG"],
        evidence: ["Count evidence digest: digest"],
        materialLines: [
          {
            lineNumber: 1,
            itemCode: "BEEF-001",
            itemName: "Beef Harami Skirt",
            description: "Beef Harami Skirt / lot LOT-1",
            uomCode: "KG",
            quantities: [
              { label: "System", value: "10", uomCode: "KG" },
              { label: "Counted", value: "7", uomCode: "KG" },
              { label: "Variance", value: "-3", uomCode: "KG" },
            ],
            unitCost: null,
            totalCost: null,
            reasonCode: null,
            evidenceReference: "COUNT-PHOTO-002",
            lotNumber: "LOT-1",
            expiryDate: "2026-09-01",
            notes: "Second count completed",
          },
        ],
      },
    } as unknown as BoundedApprovalReview;

    const html = render(review, ["APPROVE"]);

    expect(html).toContain("Stock-count control context");
    expect(html).toContain("Attempt 2");
    expect(html).toContain("Carlo Counter");
    expect(html).toContain("4 / 7");
    expect(html).toContain("Successor attempt attempt-3");
    expect(html).toContain("Variance exceeded tolerance");
    expect(html).toContain("Approve-only stock-count policy");
    expect(html).toContain("authoritative stock-count recovery or recount workflow");
  });
});
