import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, test, vi } from "vitest";
import {
  defaultPolicySettings,
  getAuthorizationDenialWindowMinutes,
  policySettingCategories
} from "./policySettings";

describe("DEC-0036 policy setting registry", () => {
  test("reads the denial window through a supplied transaction-compatible client", async () => {
    const findUnique = vi.fn().mockResolvedValue({
      value: 30,
      isDefault: false,
      sourceDecisionId: "DEC-0050",
      status: "ACTIVE"
    });
    const session = {
      context: { companyId: "22222222-2222-4222-8222-222222222222" }
    } as never;

    await expect(getAuthorizationDenialWindowMinutes(session, {
      companyPolicySetting: { findUnique }
    } as never)).resolves.toBe(30);
    expect(findUnique).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        companyId_key: {
          companyId: "22222222-2222-4222-8222-222222222222",
          key: "security.authorization_denial.window_minutes"
        }
      }
    }));
  });

  test("keeps every approved pilot default in the configurable registry", () => {
    expect(defaultPolicySettings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "purchasing.approval.standard_threshold_php",
          category: "purchasing",
          valueType: "NUMBER",
          defaultValue: 10000
        }),
        expect.objectContaining({
          key: "purchasing.approval.high_value_threshold_php",
          category: "purchasing",
          valueType: "NUMBER",
          defaultValue: 50000
        }),
        expect.objectContaining({
          key: "purchasing.approval.senior_threshold_php",
          category: "purchasing",
          valueType: "NUMBER",
          defaultValue: 200000
        }),
        expect.objectContaining({
          key: "purchasing.emergency.max_amount_php",
          category: "purchasing",
          valueType: "NUMBER",
          defaultValue: 5000
        }),
        expect.objectContaining({
          key: "purchasing.quotation.required_threshold_php",
          category: "purchasing",
          valueType: "NUMBER",
          defaultValue: 50000
        }),
        expect.objectContaining({
          key: "purchasing.quotation.minimum_quotes",
          category: "purchasing",
          valueType: "NUMBER",
          defaultValue: 3
        }),
        expect.objectContaining({
          key: "purchasing.supplier.po_allowed_statuses",
          category: "purchasing",
          valueType: "JSON",
          defaultValue: ["APPROVED"],
          options: expect.arrayContaining([
            expect.objectContaining({ value: "PENDING_REVIEW" }),
            expect.objectContaining({ value: "APPROVED" }),
            expect.objectContaining({ value: "SUSPENDED" }),
            expect.objectContaining({ value: "BLOCKED" })
          ])
        }),
        expect.objectContaining({
          key: "inventory.stock_count.standard_frequency_days",
          category: "inventory",
          valueType: "NUMBER",
          defaultValue: 30
        }),
        expect.objectContaining({
          key: "inventory.stock_count.high_risk_frequency_days",
          category: "inventory",
          valueType: "NUMBER",
          defaultValue: 7
        }),
        expect.objectContaining({
          key: "inventory.lot_expiry.required_categories",
          category: "inventory",
          valueType: "JSON",
          defaultValue: expect.arrayContaining([
            "BEEF_CUTS",
            "POULTRY",
            "SEAFOOD",
            "FRESH_PRODUCE",
            "SAUCES",
            "READY_TO_EAT"
          ]),
          options: expect.arrayContaining([
            expect.objectContaining({ value: "BEEF_CUTS" }),
            expect.objectContaining({ value: "READY_TO_EAT" })
          ])
        }),
        expect.objectContaining({
          key: "inventory.adjustment.opening_balance_evidence_required",
          category: "inventory",
          valueType: "BOOLEAN",
          defaultValue: true
        }),
        expect.objectContaining({
          key: "finance.payment_release.evidence_requirements_by_method",
          category: "finance",
          valueType: "JSON",
          defaultValue: expect.objectContaining({
            BANK_TRANSFER: expect.objectContaining({
              executionEvidenceRequired: true
            }),
            CHECK: expect.objectContaining({
              evidenceLabel: "Check voucher and check number"
            }),
            CASH: expect.objectContaining({
              executionEvidenceRequired: true
            }),
            MANUAL_REFERENCE: expect.objectContaining({
              executionEvidenceRequired: true
            })
          })
        }),
        expect.objectContaining({
          key: "finance.payment_release.settlement_policy",
          category: "finance",
          valueType: "JSON",
          defaultValue: expect.objectContaining({
            releaseExecutionMode: "manual_evidence_only",
            apSettlementMutationAllowed: false,
            bankApiMutationAllowed: false,
            journalPostingAllowed: false,
            reconciliationRequiredBeforeSettlement: true,
            reversalRequiresReconciliationRecovery: true,
            uatRequiredBeforeSettlement: true
          })
        }),
        expect.objectContaining({
          key: "finance.budget.source_hook_policy",
          category: "finance",
          valueType: "JSON",
          defaultValue: expect.objectContaining({
            rolloutMode: "warning_only",
            commitmentProjectionEnabled: true,
            hardBlockEnabled: false,
            exceptionOverrideRequired: true,
            formalBackfillRequiredBeforeHardBlock: true,
            uatRequiredBeforeHardBlock: true
          })
        }),
        expect.objectContaining({
          key: "finance.cash_advance.recovery_policy",
          category: "finance",
          valueType: "JSON",
          defaultValue: expect.objectContaining({
            dueSoonDays: 3,
            overdueEscalationDays: 7,
            recoveryOwnerRole: "finance_controller",
            requireEvidenceForDueDateExtension: true,
            uatRequiredBeforeCollections: true
          })
        }),
        expect.objectContaining({
          key: "finance.expense_request.handoff_policy",
          category: "finance",
          valueType: "JSON",
          defaultValue: expect.objectContaining({
            requiredHandoffPath: "expense_to_ap_to_payment_request",
            allowDirectPaymentRequest: false,
            duplicateApDraftGuardRequired: true,
            settlementMutationAllowed: false,
            uatRequiredBeforeSettlement: true
          })
        }),
        expect.objectContaining({
          key: "finance.period_close.reopen_window_hours",
          category: "finance",
          valueType: "NUMBER",
          defaultValue: 48,
          unit: "hours"
        }),
        expect.objectContaining({
          key: "reporting.export.require_scope_filters",
          category: "reporting",
          valueType: "BOOLEAN",
          defaultValue: true
        }),
        expect.objectContaining({
          key: "reporting.dashboard.unreconciled_mode",
          category: "reporting",
          valueType: "SELECT",
          defaultValue: "warn_and_link",
          options: expect.arrayContaining([
            expect.objectContaining({ value: "block" }),
            expect.objectContaining({ value: "warn_and_link" }),
            expect.objectContaining({ value: "show_only" })
          ])
        }),
        expect.objectContaining({
          key: "projects.restricted_visibility_default",
          category: "projects",
          valueType: "BOOLEAN",
          defaultValue: true
        }),
        expect.objectContaining({
          key: "projects.blocker_reason_required",
          category: "projects",
          valueType: "BOOLEAN",
          defaultValue: true
        }),
        expect.objectContaining({
          key: "release.uat_required_before_rollout",
          category: "release",
          valueType: "BOOLEAN",
          defaultValue: true
        }),
        expect.objectContaining({
          key: "release.training_impact_required",
          category: "release",
          valueType: "BOOLEAN",
          defaultValue: true
        })
      ])
    );

    for (const setting of defaultPolicySettings) {
      expect(setting.label.trim().length, `${setting.key} has a label`).toBeGreaterThan(0);
      expect(
        setting.description.trim().length,
        `${setting.key} has a user-facing description`
      ).toBeGreaterThan(0);
      expect(
        policySettingCategories.some((category) => category.id === setting.category),
        `${setting.key} category is registered`
      ).toBe(true);
    }
  });

  test("exposes security retention and backup defaults as configurable policies", () => {
    expect(policySettingCategories).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "security",
          label: "Security and continuity"
        }),
        expect.objectContaining({
          id: "finance",
          label: "Finance controls"
        })
      ])
    );

    expect(defaultPolicySettings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "security.privileged_mfa.enforcement_mode",
          category: "security",
          valueType: "SELECT",
          defaultValue: "warn_and_audit",
          options: expect.arrayContaining([
            expect.objectContaining({
              value: "enforce_admin_security"
            })
          ])
        }),
        expect.objectContaining({
          key: "security.authorization_denial.window_minutes",
          category: "security",
          valueType: "NUMBER",
          defaultValue: 15,
          unit: "minutes"
        }),
        expect.objectContaining({
          key: "security.retention.matrix",
          category: "security",
          valueType: "JSON",
          defaultValue: expect.objectContaining({
            audit_security_financial_control_years: 10,
            operational_working_record_years: 5,
            attachment_retention: "follow_transaction_retention",
            pii_minimization_required: true
          })
        }),
        expect.objectContaining({
          key: "security.evidence_storage.default_policy",
          category: "security",
          valueType: "JSON",
          defaultValue: expect.objectContaining({
            storageProvider: "environment-isolated",
            uploadLimitMb: 10,
            allowedMimePolicy: "allowlist",
            malwareScanMode: "required_before_availability",
            retentionPolicy: "preserve_until_approved_transaction_retention",
            recoveryPolicy: "paired_database_evidence_restore_required",
            downloadAuditRequired: true
          })
        }),
        expect.objectContaining({
          key: "security.backup_restore.default_policy",
          category: "security",
          valueType: "JSON",
          defaultValue: expect.objectContaining({
            database_backup_frequency: "daily",
            encryption_required: true,
            offsite_copy_required: true,
            checksum_verification_required: true,
            restore_rehearsal_frequency: "quarterly",
            pre_release_backup_restore_evidence_required: true
          })
        })
      ])
    );
  });

  test("admin settings can reset overrides to the recommended default with audit", () => {
    const serviceSource = readFileSync(
      fileURLToPath(new URL("./policySettings.ts", import.meta.url)),
      "utf8"
    );
    const pageSource = readFileSync(
      fileURLToPath(
        new URL("../../app/(app)/admin/settings/page.tsx", import.meta.url)
      ),
      "utf8"
    );

    expect(serviceSource).toContain("resetCompanyPolicySetting");
    expect(serviceSource).toContain("company_policy_setting.reset_to_default");
    expect(serviceSource).toContain(
      "Reset to ${sourceDecisionForPolicy(definition.key)} recommended default from Admin Settings."
    );
    expect(serviceSource).toContain(
      'key === "security.evidence_storage.default_policy"'
    );
  expect(serviceSource).toContain('return "DEC-0046"');
  expect(serviceSource).toContain(
    'key === "security.authorization_denial.window_minutes"',
  );
  expect(serviceSource).toContain('return "DEC-0050"');
    expect(pageSource).toContain("resetCompanyPolicySetting");
    expect(pageSource).toContain("resetPolicySettingAction");
    expect(pageSource).toContain("Use Recommended");
    expect(pageSource).toContain("setting.isOverridden ? (");
    expect(pageSource).toContain("arrayPolicyOptions");
    expect(pageSource).toContain("__VALUE_ITEMS__");
    expect(pageSource).toContain('name="valueItem"');
    expect(serviceSource).toContain("normalizePolicyValueFromFormData");
    expect(serviceSource).toContain("definition.options?.map");
    expect(serviceSource).toContain("POLICY_SETTING_JSON_ARRAY_EMPTY");
    expect(pageSource).toContain("policySummaryLines");
    expect(pageSource).toContain("Audit, security, and financial-control records");
    expect(pageSource).toContain("Pre-release backup/restore evidence required");
    expect(pageSource).toContain("Allowed supplier accreditation statuses");
    expect(pageSource).toContain("Required category codes");
  });

  test("knowledge base explains readable policy summaries and controlled overrides", () => {
    const policyKbSource = readFileSync(
      fileURLToPath(
        new URL(
          "../../../../../docs/knowledge-base/administration/configuring-policy-defaults.md",
          import.meta.url
        )
      ),
      "utf8"
    );
    const adminTrainingSource = readFileSync(
      fileURLToPath(
        new URL("../../../../../docs/training/phase-i-administrator-setup-guide.md", import.meta.url)
      ),
      "utf8"
    );

    expect(policyKbSource).toContain(
      "Structured values, such as retention, backup/restore, supplier-accreditation, and lot/expiry category policies, show a readable summary"
    );
    expect(policyKbSource).toContain("database backup frequency");
    expect(policyKbSource).toContain("pre-release backup/restore evidence requirement");
    expect(policyKbSource).toContain("Reporting And Export Settings");
    expect(adminTrainingSource).toContain("Admin > Admin Settings");
    expect(adminTrainingSource).toContain("readable retention and backup/restore summaries");
  });
});
