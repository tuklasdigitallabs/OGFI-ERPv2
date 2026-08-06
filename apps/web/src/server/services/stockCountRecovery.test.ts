import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const service = readFileSync(
  fileURLToPath(new URL("./stockCounts.ts", import.meta.url)),
  "utf8"
);
const authorization = readFileSync(
  fileURLToPath(new URL("./authorization.ts", import.meta.url)),
  "utf8"
);

describe("DEC-0264 stock-count recount recovery", () => {
  it("keeps recovery structurally default-off behind dedicated authority", () => {
    expect(authorization).toContain(
      'stockCountRecovery: "inventory.stock_count.recovery"'
    );
    expect(service).toContain("STOCK_COUNT_RECOUNT_RECOVERY_V1_ENABLED");
    expect(service).toContain('throw new Error("STOCK_COUNT_RECOUNT_DISABLED")');
    expect(service).toContain(
      "await requirePermission(session, permissions.stockCountRecovery)"
    );
    expect(service).toContain(
      "CONTROLLED_EVIDENCE_QUALIFICATION_RUNTIME_ENABLED"
    );
    expect(service).toContain(
      'throw new Error("CONTROLLED_EVIDENCE_POLICY_UNCONFIRMED")'
    );
    expect(service).toContain(
      "requireControlledEvidenceQualificationForRecount"
    );
  });

  it("uses adjustment-before-location ordering and revalidates under locks", () => {
    const command = service.slice(
      service.indexOf("export async function requestStockCountRecount"),
      service.indexOf("export async function cancelStockCount")
    );
    expect(command.indexOf('FROM "StockAdjustment"')).toBeGreaterThan(0);
    expect(command.indexOf('FROM "StockAdjustment"')).toBeLessThan(
      command.indexOf("await lockInventoryLocationForPosting")
    );
    expect(command.indexOf("FOR SHARE OF il, l")).toBeLessThan(
      command.indexOf('FROM "StockAdjustmentLine"')
    );
    expect(command.indexOf('FROM "StockAdjustmentLine"')).toBeLessThan(
      command.indexOf('FROM "ApprovalInstance"')
    );
    expect(command.indexOf('FROM "ApprovalInstance"')).toBeLessThan(
      command.indexOf("await lockInventoryLocationForPosting")
    );
    expect(command).toContain("await lockScopedStockCount");
    expect(command).toContain("assertLiveStockCountRecoveryAuthority");
    expect(command).toContain("assertPrivilegedMfaForAction");
  });

  it("reauthorizes before business locks and makes committed replay reachable", () => {
    const command = service.slice(
      service.indexOf("export async function requestStockCountRecount"),
      service.indexOf("export async function cancelStockCount")
    );
    const livePreflight = command.indexOf(
      "await prisma.$transaction((tx) =>\n    assertLiveStockCountRecoveryAuthority"
    );
    expect(livePreflight).toBeGreaterThan(0);
    expect(livePreflight).toBeLessThan(
      command.indexOf("return withApprovalProducerTransaction")
    );
    expect(command.indexOf("const existing =")).toBeLessThan(
      command.indexOf("const preflight =")
    );
    expect(command).toContain("replayed: true");
    expect(command).toContain("STOCK_COUNT_RECOUNT_IDEMPOTENCY_CONFLICT");
  });

  it("pins and rechecks exact active stock-count review authority", () => {
    expect(service).toContain("attestStockCountRecountReviewAuthority");
    expect(service).toContain("reviewConfigurationRevisionId");
    expect(service).toContain("reviewConfigurationDigest");
    expect(service).toContain("reviewActivationEventId");
    expect(service).toContain("reviewActivationGeneration");
    expect(service).toContain("STOCK_COUNT_RECOUNT_REVIEW_AUTHORITY_STALE");
    expect(service).toContain("STOCK_COUNT_RECOUNT_REVIEW_APPROVAL_REQUIRED");
  });

  it("settles exact adjustment obligations and notifies scoped stakeholders", () => {
    expect(service).toContain("actionableAdjustmentNotifications");
    expect(service).toContain("STOCK_COUNT_RECOVERY_NOTIFICATION_CONFLICT");
    expect(service).toContain("STOCK_COUNT_RECOUNT_RECOVERY_OUTCOME");
    expect(service).toContain("RECOUNT_RECOVERY_STAKEHOLDER");
    expect(service).toContain("lockedAdjustmentApprovalSteps");
    expect(service).toContain(
      "STOCK_COUNT_RECOVERY_ADJUSTMENT_APPROVAL_NOT_TERMINAL"
    );
  });

  it("admits only safe adjustment dispositions before the successor switch", () => {
    expect(service).toContain("STOCK_COUNT_RECOVERY_CANCEL_ADJUSTMENT_FIRST");
    expect(service).toContain("STOCK_COUNT_RECOVERY_REVERSE_ADJUSTMENT_FIRST");
    expect(service).toContain('status: "VOIDED_FOR_RECOUNT"');
    expect(service).toContain('status: "RECOUNT_REQUESTED"');
    const command = service.slice(
      service.indexOf("export async function requestStockCountRecount"),
      service.indexOf("export async function cancelStockCount")
    );
    expect(command.indexOf('status: "VOIDED_FOR_RECOUNT"')).toBeLessThan(
      command.indexOf("const moved =")
    );
  });

  it("keeps attempt 2+ lines attempt-native with a fresh locked cutoff", () => {
    expect(service).toContain("legacyStockCountLineId: null");
    expect(service).toContain('count.status === "RECOUNT_REQUESTED"');
    expect(service).toContain("systemQuantityBaseUom: balance.qtyOnHand");
    expect(service).toContain("cutoffAt: count.databaseNow");
    expect(service).toContain("stock_count.recount_entries_saved");
  });
});
