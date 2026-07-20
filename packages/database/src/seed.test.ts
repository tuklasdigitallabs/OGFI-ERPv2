import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const seedSource = readFileSync(
  fileURLToPath(new URL("./seed.ts", import.meta.url)),
  "utf8",
);

describe("database seed DEC-0036 policy defaults", () => {
  test("persists configurable pilot defaults as company policy rows", () => {
    expect(seedSource).toContain("dec0036CompanyPolicyDefaults");
    expect(seedSource).toContain("seedDec0036CompanyPolicyDefaults");
    expect(seedSource).toContain("prisma.companyPolicySetting.upsert");
    expect(seedSource).toContain('sourceDecisionId: "DEC-0036"');

    for (const key of [
      "purchasing.approval.standard_threshold_php",
      "purchasing.approval.high_value_threshold_php",
      "purchasing.approval.senior_threshold_php",
      "purchasing.emergency.max_amount_php",
      "purchasing.quotation.required_threshold_php",
      "purchasing.quotation.minimum_quotes",
      "purchasing.supplier.po_allowed_statuses",
      "inventory.stock_count.standard_frequency_days",
      "inventory.stock_count.high_risk_frequency_days",
      "inventory.lot_expiry.required_categories",
      "inventory.adjustment.opening_balance_evidence_required",
      "finance.payment_release.settlement_policy",
      "finance.budget.source_hook_policy",
      "finance.cash_advance.recovery_policy",
      "finance.expense_request.handoff_policy",
      "reporting.export.require_scope_filters",
      "reporting.dashboard.unreconciled_mode",
      "projects.restricted_visibility_default",
      "projects.blocker_reason_required",
      "security.privileged_mfa.enforcement_mode",
      "security.evidence_storage.default_policy",
      "security.retention.matrix",
      "security.backup_restore.default_policy",
      "release.uat_required_before_rollout",
      "release.training_impact_required",
    ]) {
      expect(seedSource, `${key} is seeded`).toContain(key);
    }
    expect(seedSource).toContain('value: ["APPROVED"]');
    expect(seedSource).toContain('accreditationStatus: "APPROVED"');
  });
});
