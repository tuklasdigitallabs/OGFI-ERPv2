import { describe, expect, test, vi } from "vitest";
import { assertRequiredLossEvidence, lossEstimateAssurance } from "./lossEvidence";
import { buildWastagePolicyEvaluation, evaluateWastagePolicy } from "./wastage";
import type { SessionContext } from "./context";

describe("inventory loss evidence and repeated-loss controls", () => {
  const required = { required: true, errorCode: "EVIDENCE_REQUIRED" };
  test("required references cover every line without treating a filename as verified evidence", () => {
    expect(() => assertRequiredLossEvidence({ ...required, lines: [{ evidenceReference: "one" }, { evidenceReference: " " }] })).toThrow("EVIDENCE_REQUIRED");
    expect(() => assertRequiredLossEvidence({ ...required, evidenceReference: " ", lines: [] })).toThrow("EVIDENCE_REQUIRED");
    expect(assertRequiredLossEvidence({ ...required, evidenceReference: "external custody record", lines: [{}, {}] })).toMatchObject({ coveredLineCount: 2, assurance: "REFERENCE_PRESENCE_ONLY" });
    expect(assertRequiredLossEvidence({ ...required, lines: [{ evidenceReference: "one" }, { evidenceReference: "two" }] }).coveredLineCount).toBe(2);
    expect(() => assertRequiredLossEvidence({ ...required, required: false, lines: [{}] })).not.toThrow();
  });

  test("zero and positive requester estimates never become verified valuations", () => {
    expect(lossEstimateAssurance(0)).toContain("Value unknown");
    expect(lossEstimateAssurance(0.01)).toContain("Unverified estimate");
    for (const amount of [0, 0.01, 10_000]) {
      const result = buildWastagePolicyEvaluation({ policy: null, totalEstimatedCost: amount, evidenceReference: null, categoryPhotoRequired: false, repeatItemLocationPriorCount: 0, repeatReporterPriorCount: 0 });
      expect(result.policySnapshot.valuationAssurance).toBe(amount > 0 ? "UNVERIFIED_ESTIMATE" : "UNKNOWN");
      expect(result.flags).toContain(amount > 0 ? "VALUATION_UNVERIFIED" : "VALUATION_UNKNOWN");
    }
  });

  test("repeat detection covers later and duplicate items, excludes its own draft, and retains the reporter", async () => {
    const groupBy = vi.fn().mockResolvedValue([{ itemId: "repeated", _count: { _all: 4 } }]);
    const count = vi.fn().mockResolvedValue(3);
    const db = {
      wastagePolicy: { findFirst: vi.fn().mockResolvedValue({ id: "policy", name: "Repeat", policyVersion: "v1", minimumEstimatedCost: null, requiresEvidence: false, repeatLookbackDays: 30, repeatItemLocationCount: 3, repeatReporterCount: 5 }) },
      wastageLine: { groupBy },
      wastageReport: { count },
    };
    const input = {
      db: db as never,
      session: { context: { tenantId: "tenant", companyId: "company" }, user: { id: "other-submitter" } } as SessionContext,
      inventoryLocationId: "location",
      itemIds: ["new", "repeated", "repeated"],
      currentReportId: "current-draft",
      reportedByUserId: "original-reporter",
      wastageType: "DAMAGE",
      reasonCode: "DAMAGE",
      estimatedTotalCost: 10,
      categoryPhotoRequired: false,
      reasonCodeRequiresEvidence: true,
      evidenceReference: "custody record",
    };
    const result = await evaluateWastagePolicy(input);
    const reordered = await evaluateWastagePolicy({ ...input, itemIds: ["repeated", "new"] });
    expect(result.flags).toContain("REPEAT_ITEM_LOCATION");
    expect(result.flags).not.toContain("REPEAT_REPORTER");
    expect(result.evidenceRequired).toBe(true);
    expect(result.policySnapshot.repeatItemIds).toEqual(["repeated"]);
    expect(result.policySnapshot.repeatItemHistory).toEqual(reordered.policySnapshot.repeatItemHistory);
    expect(groupBy).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ tenantId: "tenant", companyId: "company", inventoryLocationId: "location", itemId: { in: ["new", "repeated"] }, wastageReportId: { not: "current-draft" } }) }));
    expect(count).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ reportedByUserId: "original-reporter", id: { not: "current-draft" } }) }));
  });
});
