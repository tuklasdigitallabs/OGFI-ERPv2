import { describe, expect, test } from "vitest";
import type { EligibleApprovalStep } from "./approvalRouting";
import {
  assertBoundedInventoryReviewSourceGuard,
  canonicalApprovalInventoryReviewJson,
  digestApprovalInventoryReviewSnapshot,
  mapStockCountAttemptReview,
  mapWastageReportReview,
  type WastageReportReviewInput,
} from "./boundedApprovalInventoryReview";

const approvalStep = {
  approvalInstanceId: "00000000-0000-4000-8000-000000000101",
  approvalInstanceStepId: "00000000-0000-4000-8000-000000000102",
  stepOrder: 2,
  activatedAt: "2026-08-06T01:00:00.000Z",
  dueAt: "2026-08-06T09:00:00.000Z",
};

const eligible: EligibleApprovalStep = {
  ...approvalStep,
  documentType: "WastageReport",
  documentId: "00000000-0000-4000-8000-000000000103",
  assignedUserId: null,
  assignedRoleId: "00000000-0000-4000-8000-000000000104",
  requiredPermissionCode: "wastage.approve",
  activatedAt: new Date(approvalStep.activatedAt),
  dueAt: new Date(approvalStep.dueAt),
};

function wastageInput(
  policyFlags: WastageReportReviewInput["policyFlags"],
): WastageReportReviewInput {
  return {
    tenantId: "00000000-0000-4000-8000-000000000001",
    companyId: "00000000-0000-4000-8000-000000000002",
    companyCode: "OGFI",
    companyName: "One Gourmet Foods Inc.",
    currencyCode: "PHP",
    documentId: eligible.documentId,
    publicReference: "WST-0001",
    status: "PENDING_APPROVAL",
    wastageType: "PREPARATION_LOSS",
    reasonCode: "PREP_TRIM_LOSS",
    evidenceReference: "evidence/report-1.jpg",
    evidenceRequired: true,
    evidenceSatisfied: true,
    notes: "Chef and storekeeper verified the loss.",
    totalEstimatedCost: "325.50",
    policyFlags,
    policySnapshot: { policyVersion: "v2", requiresEvidence: true },
    location: {
      id: "00000000-0000-4000-8000-000000000005",
      code: "BGC-KITCHEN",
      name: "BGC Kitchen",
      brandId: "00000000-0000-4000-8000-000000000006",
      brandName: "Yakiniku Like",
    },
    reportedByUserId: "00000000-0000-4000-8000-000000000007",
    reportedByName: "Branch Storekeeper",
    submittedAt: "2026-08-06T00:40:00.000Z",
    createdAt: "2026-08-06T00:30:00.000Z",
    updatedAt: "2026-08-06T00:45:00.000Z",
    lines: [
      {
        id: "00000000-0000-4000-8000-000000000110",
        lineNumber: 1,
        itemId: "00000000-0000-4000-8000-000000000111",
        itemCode: "BEEF-SKIRT",
        itemName: "Beef Harami Skirt",
        description: "Beef Harami Skirt",
        uomId: "00000000-0000-4000-8000-000000000112",
        uomCode: "KG",
        quantity: "1.250000",
        quantityBaseUom: "1.250000",
        estimatedUnitCost: "250.00",
        estimatedTotalCost: "312.50",
        reasonCode: "PREP_TRIM_LOSS",
        evidenceReference: "evidence/line-1.jpg",
        photoRequired: true,
        lotNumber: "LOT-20260806-A",
        expiryDate: "2026-08-08T00:00:00.000Z",
        notes: "Trim weighed before disposal.",
      },
      {
        id: "00000000-0000-4000-8000-000000000120",
        lineNumber: 2,
        itemId: "00000000-0000-4000-8000-000000000121",
        itemCode: "ONION-SPRING",
        itemName: "Spring Onion",
        description: "Spring Onion",
        uomId: "00000000-0000-4000-8000-000000000122",
        uomCode: "BUNCH",
        quantity: "2.000000",
        quantityBaseUom: "2.000000",
        estimatedUnitCost: "6.50",
        estimatedTotalCost: "13.00",
        reasonCode: "QUALITY_REJECT",
        evidenceReference: null,
        photoRequired: false,
        lotNumber: null,
        expiryDate: null,
        notes: null,
      },
    ],
    approvalStep,
  };
}

describe("bounded inventory approval review snapshots", () => {
  test("accepts only an exact eligible source and non-prohibited actor", () => {
    expect(() =>
      assertBoundedInventoryReviewSourceGuard({
        expectedFamily: "WastageReport",
        eligible,
        sessionTenantId: "00000000-0000-4000-8000-000000000001",
        sessionCompanyId: "00000000-0000-4000-8000-000000000002",
        sourceTenantId: "00000000-0000-4000-8000-000000000001",
        sourceCompanyId: "00000000-0000-4000-8000-000000000002",
        sourceStatus: "PENDING_APPROVAL",
        expectedStatus: "PENDING_APPROVAL",
        sourceId: eligible.documentId,
        prohibitedActorIds: ["00000000-0000-4000-8000-000000000007"],
        actorUserId: "00000000-0000-4000-8000-000000000008",
      }),
    ).not.toThrow();
  });

  test("produces deterministic canonical JSON and digest for semantically equal nested policy data", () => {
    const left = mapWastageReportReview(
      wastageInput({ repeatIncident: true, thresholds: { count: 3, days: 30 } }),
    );
    const right = mapWastageReportReview(
      wastageInput({ thresholds: { days: 30, count: 3 }, repeatIncident: true }),
    );

    expect(left.canonicalRawSnapshot).toBe(right.canonicalRawSnapshot);
    expect(left.snapshotDigest).toBe(right.snapshotDigest);
    expect(left.snapshotDigest).toHaveLength(64);
    expect(canonicalApprovalInventoryReviewJson(left.canonicalSnapshot)).toBe(
      left.canonicalRawSnapshot,
    );
    expect(digestApprovalInventoryReviewSnapshot(left.canonicalSnapshot)).toBe(
      left.snapshotDigest,
    );
  });

  test("preserves every material line and its own UOM instead of aggregating mixed quantities", () => {
    const review = mapWastageReportReview(wastageInput({ repeatIncident: false }));

    expect(review.presentation.materialLines).toHaveLength(2);
    expect(review.presentation.materialLines.map((line) => line.uomCode)).toEqual([
      "KG",
      "BUNCH",
    ]);
    expect(review.presentation.materialLines[0]?.quantities).toEqual([
      { label: "Entered", value: "1.250000", uomCode: "KG" },
      { label: "Base", value: "1.250000", uomCode: "KG" },
    ]);
    expect(review.presentation.materialLines[1]?.reasonCode).toBe("QUALITY_REJECT");
  });

  test("exposes system, counted, and variance quantities plus evidence and recount facts", () => {
    const review = mapStockCountAttemptReview({
      tenantId: "00000000-0000-4000-8000-000000000001",
      companyId: "00000000-0000-4000-8000-000000000002",
      companyCode: "OGFI",
      companyName: "One Gourmet Foods Inc.",
      documentId: "00000000-0000-4000-8000-000000000201",
      stockCountSessionId: "00000000-0000-4000-8000-000000000202",
      publicReference: "SC-0001",
      status: "SUBMITTED",
      attemptVersion: 3,
      sessionVersion: 5,
      attemptNumber: 2,
      countType: "CYCLE",
      scopeType: "HIGH_RISK_ITEMS",
      blindCount: true,
      freezeMovements: true,
      location: {
        id: "00000000-0000-4000-8000-000000000005",
        code: "BGC-KITCHEN",
        name: "BGC Kitchen",
        brandId: null,
        brandName: null,
      },
      createdByUserId: "00000000-0000-4000-8000-000000000203",
      createdByName: "Count Lead",
      assignedToUserId: "00000000-0000-4000-8000-000000000204",
      assignedToName: "Counter",
      reason: "High-risk count",
      reviewNotes: "Variance independently checked.",
      evidenceReference: "evidence/count-sheet.pdf",
      cutoffAt: "2026-08-06T00:00:00.000Z",
      scheduledDate: "2026-08-06T00:00:00.000Z",
      startedAt: "2026-08-06T00:10:00.000Z",
      submittedAt: "2026-08-06T01:00:00.000Z",
      createdAt: "2026-08-05T23:00:00.000Z",
      updatedAt: "2026-08-06T01:00:00.000Z",
      lines: [
        {
          id: "00000000-0000-4000-8000-000000000205",
          lineNumber: 1,
          itemId: "00000000-0000-4000-8000-000000000206",
          itemCode: "BEEF-SKIRT",
          itemName: "Beef Harami Skirt",
          uomId: "00000000-0000-4000-8000-000000000207",
          uomCode: "KG",
          lotKey: "LOT-A|2026-08-08",
          lotNumber: "LOT-A",
          expiryDate: "2026-08-08T00:00:00.000Z",
          systemQuantityBaseUom: "10.000000",
          countedQuantityBaseUom: "8.500000",
          varianceQuantityBaseUom: "-1.500000",
          notes: "Second count confirmed.",
          countedByUserId: "00000000-0000-4000-8000-000000000204",
          countedByName: "Counter",
          countedAt: "2026-08-06T00:50:00.000Z",
        },
      ],
      recountTransitions: [
        {
          id: "00000000-0000-4000-8000-000000000208",
          successorAttemptId: "00000000-0000-4000-8000-000000000209",
          linkedStockAdjustmentId: null,
          adjustmentDisposition: "NONE",
          cutoffDisposition: "SAME_CUTOFF",
          reason: "Independent recount required",
          evidenceReference: "evidence/recount.pdf",
          occurredAt: "2026-08-06T01:10:00.000Z",
        },
      ],
      reviewIntent: {
        id: "00000000-0000-4000-8000-000000000210",
        attemptVersionBefore: 2,
        attemptVersionAfter: 3,
        sessionVersionBefore: 4,
        sessionVersionAfter: 5,
        evidenceCanonicalHash: "a".repeat(64),
        configurationRevisionId: "00000000-0000-4000-8000-000000000211",
        configurationRevisionNumber: 2,
        configurationDigest: "b".repeat(64),
        activationEventId: "00000000-0000-4000-8000-000000000212",
        activationFamily: "StockCountAttemptReview",
        activationStatus: "ACTIVE",
        activationGeneration: 1,
        requestHash: "c".repeat(64),
      },
      approvalStep,
    });

    expect(review.presentation.materialLines[0]?.quantities).toEqual([
      { label: "System", value: "10.000000", uomCode: "KG" },
      { label: "Counted", value: "8.500000", uomCode: "KG" },
      { label: "Variance", value: "-1.500000", uomCode: "KG" },
    ]);
    expect(review.presentation.evidence).toContain("evidence/count-sheet.pdf");
    expect(review.presentation.evidence).toContain("evidence/recount.pdf");
    expect(review.presentation.risks).toContain(
      "Recount successor 00000000-0000-4000-8000-000000000209: Independent recount required",
    );
  });

  test.each([
    ["family", { eligible: { ...eligible, documentType: "StockAdjustment" } }],
    ["document", { eligible: { ...eligible, documentId: "00000000-0000-4000-8000-000000000999" } }],
    ["tenant", { sourceTenantId: "00000000-0000-4000-8000-000000000999" }],
    ["company", { sourceCompanyId: "00000000-0000-4000-8000-000000000999" }],
    ["status", { sourceStatus: "APPROVED" }],
    ["segregation", { prohibitedActorIds: ["00000000-0000-4000-8000-000000000008"] }],
  ])("fails the source guard closed for %s mismatch", (_label, override) => {
    expect(() =>
      assertBoundedInventoryReviewSourceGuard({
        expectedFamily: "WastageReport",
        eligible,
        sessionTenantId: "00000000-0000-4000-8000-000000000001",
        sessionCompanyId: "00000000-0000-4000-8000-000000000002",
        sourceTenantId: "00000000-0000-4000-8000-000000000001",
        sourceCompanyId: "00000000-0000-4000-8000-000000000002",
        sourceStatus: "PENDING_APPROVAL",
        expectedStatus: "PENDING_APPROVAL",
        sourceId: eligible.documentId,
        prohibitedActorIds: ["00000000-0000-4000-8000-000000000007"],
        actorUserId: "00000000-0000-4000-8000-000000000008",
        ...override,
      }),
    ).toThrow("APPROVAL_REVIEW_SOURCE_UNAVAILABLE");
  });
});
