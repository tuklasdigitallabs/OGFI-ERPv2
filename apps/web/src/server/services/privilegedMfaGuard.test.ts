import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  assertPrivilegedMfaForAction,
  privilegedMfaEnforcementModes
} from "./privilegedMfaGuard";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

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
    expect(guardSource).not.toContain("privileged_mfa.required_denied");
    expect(guardSource).not.toContain("privileged_mfa.step_up_denied");
    expect(guardSource).toContain("recordSessionDeniedDecisionInTransactionSafely");
    expect(guardSource).toContain('resource: "ADMINISTRATION"');
    expect(guardSource).toContain('action: "ADMINISTER"');
    expect(guardSource).toContain('reason: "MFA_REQUIRED"');
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

  test("keeps the non-blocking missing-evidence warning as its lifecycle audit event", async () => {
    vi.stubEnv("AUTH_MODE", "demo");
    const transaction = {
      privilegedMfaEnrollment: {
        findFirst: vi.fn().mockResolvedValue(null)
      },
      companyPolicySetting: {
        findUnique: vi.fn().mockResolvedValue(null)
      },
      auditEvent: {
        create: vi.fn().mockResolvedValue({})
      }
    };
    const result = await assertPrivilegedMfaForAction(
      {
        user: { id: "33333333-3333-4333-8333-333333333333" },
        context: {
          tenantId: "11111111-1111-4111-8111-111111111111",
          companyId: "22222222-2222-4222-8222-222222222222",
          locationId: null
        }
      } as never,
      {
        action: "Update sensitive role permissions",
        permissionCode: "goods_receipt.post"
      },
      { transaction: transaction as never }
    );

    expect(result).toEqual({
      required: true,
      mode: "warn_and_audit",
      enrollmentId: null,
      deniedError: null
    });
    expect(transaction.auditEvent.create).toHaveBeenCalledOnce();
    expect(transaction.auditEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        eventType: "privileged_mfa.required_warning",
        afterData: expect.objectContaining({ outcome: "WARNED" })
      })
    });
  });

  test("preserves the deferred MFA denial and caller transaction after denial persistence fails", async () => {
    vi.stubEnv("AUTH_MODE", "local");
    let transactionAborted = false;
    const transaction = {
      $executeRawUnsafe: vi.fn(async (sql: string) => {
        if (sql === "ROLLBACK TO SAVEPOINT authorization_denial_persistence") {
          transactionAborted = false;
        }
        return 0;
      }),
      $queryRaw: vi.fn(async () => {
        transactionAborted = true;
        throw new Error("forced denial write failure");
      }),
      companyPolicySetting: {
        findUnique: vi.fn().mockResolvedValue({
          value: 15,
          isDefault: true,
          sourceDecisionId: "DEC-0050",
          status: "ACTIVE"
        })
      },
      auditEvent: {
        create: vi.fn(async () => {
          if (transactionAborted) throw new Error("current transaction is aborted");
          return { id: "caller-controlled-evidence" };
        })
      }
    };
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const result = await assertPrivilegedMfaForAction(
      {
        user: { id: "33333333-3333-4333-8333-333333333333" },
        context: {
          tenantId: "11111111-1111-4111-8111-111111111111",
          companyId: "22222222-2222-4222-8222-222222222222",
          locationId: null
        },
        authentication: { assuranceLevel: "PASSWORD", mfaAuthenticatedAt: null }
      } as never,
      { action: "Update sensitive role permissions" },
      { transaction: transaction as never, deferDenialThrow: true }
    );
    const controlledEvidence = await transaction.auditEvent.create();

    expect(result).toEqual({
      required: true,
      mode: "runtime_mfa",
      enrollmentId: null,
      deniedError: "PRIVILEGED_MFA_STEP_UP_REQUIRED"
    });
    expect(transaction.$executeRawUnsafe).toHaveBeenCalledWith(
      "ROLLBACK TO SAVEPOINT authorization_denial_persistence"
    );
    expect(controlledEvidence).toEqual({ id: "caller-controlled-evidence" });
    expect(consoleError).toHaveBeenCalledWith(
      "AUTHORIZATION_DENIAL_PERSISTENCE_FAILED",
      expect.objectContaining({
        resource: "ADMINISTRATION",
        action: "ADMINISTER"
      })
    );
    consoleError.mockRestore();
  });
});
