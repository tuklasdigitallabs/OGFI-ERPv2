import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { privilegedMfaEnforcementModes } from "./privilegedMfaGuard";

describe("privileged MFA sensitive-action guard", () => {
  test("uses configurable mode, verified evidence, audited warning, and hard-block path", () => {
    const guardSource = readFileSync(
      path.resolve(__dirname, "privilegedMfaGuard.ts"),
      "utf8"
    );
    const coreAdminSource = readFileSync(path.resolve(__dirname, "coreAdmin.ts"), "utf8");
    const breakGlassSource = readFileSync(
      path.resolve(__dirname, "breakGlassAccess.ts"),
      "utf8"
    );
    const receivingSource = readFileSync(path.resolve(__dirname, "receiving.ts"), "utf8");
    const stockAdjustmentsSource = readFileSync(
      path.resolve(__dirname, "stockAdjustments.ts"),
      "utf8"
    );
    const wastageSource = readFileSync(path.resolve(__dirname, "wastage.ts"), "utf8");
    const transfersSource = readFileSync(path.resolve(__dirname, "transfers.ts"), "utf8");
    const policySource = readFileSync(path.resolve(__dirname, "policySettings.ts"), "utf8");
    const feedbackSource = readFileSync(path.resolve(__dirname, "actionFeedback.ts"), "utf8");

    expect(privilegedMfaEnforcementModes).toEqual([
      "warn_and_audit",
      "enforce_admin_security",
      "enforce_all_sensitive"
    ]);
    expect(policySource).toContain("security.privileged_mfa.enforcement_mode");
    expect(policySource).toContain("Warn and audit missing evidence");
    expect(policySource).toContain("Block high-risk admin and security actions");
    expect(policySource).toContain("Block all guarded sensitive actions");
    expect(guardSource).toContain('status: "VERIFIED"');
    expect(guardSource).toContain("isSensitivePermissionCode");
    expect(guardSource).toContain("enforcementScope");
    expect(guardSource).toContain("privileged_mfa.required_warning");
    expect(guardSource).toContain("privileged_mfa.required_denied");
    expect(guardSource).toContain("PRIVILEGED_MFA_REQUIRED");
    expect(guardSource).toContain("transaction?: TransactionClient");
    expect(guardSource).toContain("deferDenialThrow?: boolean");
    expect(guardSource).toContain("const db = options.transaction ?? prisma");
    expect(coreAdminSource).toContain(
      "{ transaction: tx, deferDenialThrow: true }"
    );
    expect(coreAdminSource).toContain("return { deniedError: deferredMfaDenial }");
    expect(coreAdminSource).toContain("role_permissions.update_sensitive");
    expect(coreAdminSource).toContain("high_risk_scope_request.create");
    expect(coreAdminSource).toContain("high_risk_scope_request.approve");
    expect(breakGlassSource).toContain("break_glass_access.request");
    expect(breakGlassSource).toContain("break_glass_access.approve");
    expect(breakGlassSource).toContain("break_glass_access.revoke");
    expect(receivingSource).toContain("goods_receipt.post");
    expect(receivingSource).toContain("goods_receipt.reverse");
    expect(stockAdjustmentsSource).toContain("stock_adjustment.post");
    expect(stockAdjustmentsSource).toContain("stock_adjustment.reverse");
    expect(wastageSource).toContain("wastage_report.post");
    expect(wastageSource).toContain("wastage_report.reverse");
    expect(transfersSource).toContain("inventory_transfer_receipt.reverse");
    expect(feedbackSource).toContain("PRIVILEGED_MFA_REQUIRED");
  });
});
