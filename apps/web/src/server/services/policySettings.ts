import { prisma, type Prisma } from "@ogfi/database";
import { z } from "zod";
import { permissions, requirePermission } from "./authorization";
import { assertCanManageCompanyScope } from "./coreAdmin";
import { requireSessionContext, type SessionContext } from "./context";

export const policySettingCategories = [
  {
    id: "purchasing",
    label: "Purchasing controls",
    description: "Approval, quotation, emergency-buying, and supplier guardrails."
  },
  {
    id: "inventory",
    label: "Inventory controls",
    description: "Stock counts, lot/expiry discipline, and controlled stock posting."
  },
  {
    id: "reporting",
    label: "Reporting trust gates",
    description: "Source-record, export, reconciliation, and dashboard confidence rules."
  },
  {
    id: "finance",
    label: "Finance controls",
    description: "Payment evidence, settlement, reconciliation, and close-control defaults."
  },
  {
    id: "projects",
    label: "Work management",
    description: "Project visibility and task-control defaults for implementation work."
  },
  {
    id: "security",
    label: "Security and continuity",
    description: "Retention, backup, restore, and privacy-control defaults."
  },
  {
    id: "release",
    label: "Release readiness",
    description: "UAT, training, evidence, and rollout readiness requirements."
  }
] as const;

type PolicySettingCategory = (typeof policySettingCategories)[number]["id"];
type PolicyValueType = "BOOLEAN" | "NUMBER" | "TEXT" | "JSON" | "SELECT";

type PolicyOption = {
  value: string;
  label: string;
};

type PolicySettingDefinition = {
  key: string;
  category: PolicySettingCategory;
  label: string;
  description: string;
  valueType: PolicyValueType;
  defaultValue: Prisma.InputJsonValue;
  unit?: string;
  options?: readonly PolicyOption[];
};

const policySettingKeys = [
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
  "finance.payment_release.evidence_requirements_by_method",
  "finance.payment_release.settlement_policy",
  "finance.budget.source_hook_policy",
  "finance.cash_advance.recovery_policy",
  "finance.expense_request.handoff_policy",
  "finance.period_close.reopen_window_hours",
  "reporting.export.require_scope_filters",
  "reporting.dashboard.unreconciled_mode",
  "projects.restricted_visibility_default",
  "projects.blocker_reason_required",
  "security.privileged_mfa.enforcement_mode",
  "security.authorization_denial.window_minutes",
  "security.evidence_storage.default_policy",
  "security.retention.matrix",
  "security.backup_restore.default_policy",
  "release.uat_required_before_rollout",
  "release.training_impact_required"
] as const;
export type PolicySettingKey = (typeof policySettingKeys)[number];
export type DashboardTrustGateMode = "block" | "warn_and_link" | "show_only";
export type PaymentReleaseEvidencePolicy = Record<
  "BANK_TRANSFER" | "CHECK" | "CASH" | "MANUAL_REFERENCE",
  {
    executionEvidenceRequired: boolean;
    evidenceLabel: string;
  }
>;
export type PaymentReleaseSettlementPolicy = {
  releaseExecutionMode: "manual_evidence_only";
  apSettlementMutationAllowed: boolean;
  bankApiMutationAllowed: boolean;
  journalPostingAllowed: boolean;
  reconciliationRequiredBeforeSettlement: boolean;
  reversalRequiresReconciliationRecovery: boolean;
  uatRequiredBeforeSettlement: boolean;
  decisionBasis: string;
};
export type ControlledEvidenceStoragePolicy = {
  storageProvider: "environment-isolated";
  uploadLimitMb: number;
  allowedMimePolicy: "allowlist";
  malwareScanMode: "required_before_availability";
  malwareScanWaiverReason: string;
  retentionPolicy: "preserve_until_approved_transaction_retention";
  recoveryPolicy: "paired_database_evidence_restore_required";
  downloadAuditRequired: boolean;
};
export type BudgetSourceHookPolicy = {
  rolloutMode: "warning_only";
  commitmentProjectionEnabled: boolean;
  hardBlockEnabled: boolean;
  exceptionOverrideRequired: boolean;
  formalBackfillRequiredBeforeHardBlock: boolean;
  uatRequiredBeforeHardBlock: boolean;
  decisionBasis: string;
};
export type CashAdvanceRecoveryPolicy = {
  dueSoonDays: number;
  overdueEscalationDays: number;
  recoveryOwnerRole: "finance_controller";
  requireEvidenceForDueDateExtension: boolean;
  uatRequiredBeforeCollections: boolean;
  decisionBasis: string;
};
export type ExpenseRequestHandoffPolicy = {
  requiredHandoffPath: "expense_to_ap_to_payment_request";
  allowDirectPaymentRequest: boolean;
  duplicateApDraftGuardRequired: boolean;
  settlementMutationAllowed: boolean;
  uatRequiredBeforeSettlement: boolean;
  decisionBasis: string;
};

export const defaultPolicySettings: readonly PolicySettingDefinition[] = [
  {
    key: "purchasing.approval.standard_threshold_php",
    category: "purchasing",
    label: "Standard purchase approval threshold",
    description:
      "Purchase requests at or above this amount require the configured approver route.",
    valueType: "NUMBER",
    defaultValue: 10000,
    unit: "PHP"
  },
  {
    key: "purchasing.approval.high_value_threshold_php",
    category: "purchasing",
    label: "High-value purchase threshold",
    description:
      "Purchases at or above this amount require senior review before supplier commitment.",
    valueType: "NUMBER",
    defaultValue: 50000,
    unit: "PHP"
  },
  {
    key: "purchasing.approval.senior_threshold_php",
    category: "purchasing",
    label: "Senior purchase approval threshold",
    description:
      "Purchases at or above this amount require executive review before supplier commitment.",
    valueType: "NUMBER",
    defaultValue: 200000,
    unit: "PHP"
  },
  {
    key: "purchasing.emergency.max_amount_php",
    category: "purchasing",
    label: "Emergency purchase ceiling",
    description:
      "Maximum emergency buy amount allowed before a normal purchase request is required.",
    valueType: "NUMBER",
    defaultValue: 5000,
    unit: "PHP"
  },
  {
    key: "purchasing.quotation.required_threshold_php",
    category: "purchasing",
    label: "Quotation comparison threshold",
    description:
      "Purchase requests at or above this estimated amount require controlled quotation comparison unless a documented single-source exception is approved.",
    valueType: "NUMBER",
    defaultValue: 50000,
    unit: "PHP"
  },
  {
    key: "purchasing.quotation.minimum_quotes",
    category: "purchasing",
    label: "Minimum quotes for controlled buying",
    description:
      "Minimum supplier quotes expected when quotation comparison is required.",
    valueType: "NUMBER",
    defaultValue: 3,
    unit: "quotes"
  },
  {
    key: "purchasing.supplier.po_allowed_statuses",
    category: "purchasing",
    label: "Supplier accreditation statuses allowed for normal POs",
    description:
      "Supplier accreditation statuses allowed for normal Purchase Order creation, approval submission, and issue. Pilot default allows approved suppliers only; emergency supplier exceptions must use a controlled workflow when implemented.",
    valueType: "JSON",
    defaultValue: ["APPROVED"],
    options: [
      { value: "PENDING_REVIEW", label: "Pending review" },
      { value: "APPROVED", label: "Approved" },
      { value: "SUSPENDED", label: "Suspended" },
      { value: "BLOCKED", label: "Blocked" }
    ]
  },
  {
    key: "inventory.stock_count.standard_frequency_days",
    category: "inventory",
    label: "Standard stock-count frequency",
    description:
      "Default cycle-count interval for ordinary inventory items and locations.",
    valueType: "NUMBER",
    defaultValue: 30,
    unit: "days"
  },
  {
    key: "inventory.stock_count.high_risk_frequency_days",
    category: "inventory",
    label: "High-risk stock-count frequency",
    description:
      "Cycle-count interval for high-value, high-shrinkage, or food-safety-sensitive items.",
    valueType: "NUMBER",
    defaultValue: 7,
    unit: "days"
  },
  {
    key: "inventory.lot_expiry.required_categories",
    category: "inventory",
    label: "Lot and expiry required categories",
    description:
      "Item category codes that should require lot and expiry capture on controlled stock entries.",
    valueType: "JSON",
    defaultValue: [
      "BEEF_CUTS",
      "POULTRY",
      "SEAFOOD",
      "FRESH_PRODUCE",
      "SAUCES",
      "READY_TO_EAT"
    ],
    options: [
      { value: "BEEF_CUTS", label: "Beef cuts" },
      { value: "POULTRY", label: "Poultry" },
      { value: "SEAFOOD", label: "Seafood" },
      { value: "FRESH_PRODUCE", label: "Fresh produce" },
      { value: "SAUCES", label: "Sauces" },
      { value: "READY_TO_EAT", label: "Ready to eat" }
    ]
  },
  {
    key: "inventory.adjustment.opening_balance_evidence_required",
    category: "inventory",
    label: "Opening balance evidence required",
    description:
      "Requires a count sheet, import reference, or signed source document for opening balances.",
    valueType: "BOOLEAN",
    defaultValue: true
  },
  {
    key: "finance.payment_release.evidence_requirements_by_method",
    category: "finance",
    label: "Payment release evidence by method",
    description:
      "Defines the recommended evidence reference required before recording a manual payment release by payment method.",
    valueType: "JSON",
    defaultValue: {
      BANK_TRANSFER: {
        executionEvidenceRequired: true,
        evidenceLabel: "Bank transfer confirmation or screenshot"
      },
      CHECK: {
        executionEvidenceRequired: true,
        evidenceLabel: "Check voucher and check number"
      },
      CASH: {
        executionEvidenceRequired: true,
        evidenceLabel: "Cash disbursement voucher and recipient acknowledgement"
      },
      MANUAL_REFERENCE: {
        executionEvidenceRequired: true,
        evidenceLabel: "Approved external payment proof"
      }
    }
  },
  {
    key: "finance.payment_release.settlement_policy",
    category: "finance",
    label: "Payment release settlement policy",
    description:
      "Defines the Phase 3 boundary for manual payment release, AP settlement, bank mutation, journal posting, reconciliation, reversal, and UAT.",
    valueType: "JSON",
    defaultValue: {
      releaseExecutionMode: "manual_evidence_only",
      apSettlementMutationAllowed: false,
      bankApiMutationAllowed: false,
      journalPostingAllowed: false,
      reconciliationRequiredBeforeSettlement: true,
      reversalRequiresReconciliationRecovery: true,
      uatRequiredBeforeSettlement: true,
      decisionBasis:
        "F&B pilot default allows manual evidence-backed payment release control and reconciliation matching only; AP settlement, bank mutation, and journal posting remain UAT-gated."
    }
  },
  {
    key: "finance.budget.source_hook_policy",
    category: "finance",
    label: "Budget source-hook rollout policy",
    description:
      "Controls whether PR, PO, AP, and expense source hooks operate in warning-only projection mode or hard-block mode after backfill and UAT approval.",
    valueType: "JSON",
    defaultValue: {
      rolloutMode: "warning_only",
      commitmentProjectionEnabled: true,
      hardBlockEnabled: false,
      exceptionOverrideRequired: true,
      formalBackfillRequiredBeforeHardBlock: true,
      uatRequiredBeforeHardBlock: true,
      decisionBasis:
        "F&B pilot default uses warning-mode budget projections until source-line backfill and UAT signoff are complete."
    }
  },
  {
    key: "finance.cash_advance.recovery_policy",
    category: "finance",
    label: "Cash advance recovery policy",
    description:
      "Defines due-soon, overdue escalation, evidence, and UAT gates for employee/custodian cash-advance follow-up.",
    valueType: "JSON",
    defaultValue: {
      dueSoonDays: 3,
      overdueEscalationDays: 7,
      recoveryOwnerRole: "finance_controller",
      requireEvidenceForDueDateExtension: true,
      uatRequiredBeforeCollections: true,
      decisionBasis:
        "F&B pilot default flags liquidation due soon within 3 days and escalates unresolved overdue advances after 7 days; formal collection/recovery execution remains UAT-gated."
    }
  },
  {
    key: "finance.expense_request.handoff_policy",
    category: "finance",
    label: "Expense request handoff policy",
    description:
      "Defines the approved path from operational expense request to AP/payment readiness without direct payment or settlement mutation.",
    valueType: "JSON",
    defaultValue: {
      requiredHandoffPath: "expense_to_ap_to_payment_request",
      allowDirectPaymentRequest: false,
      duplicateApDraftGuardRequired: true,
      settlementMutationAllowed: false,
      uatRequiredBeforeSettlement: true,
      decisionBasis:
        "F&B pilot default requires expense requests to hand off to an AP invoice draft before payment-request preparation; direct payment and settlement mutation remain UAT-gated."
    }
  },
  {
    key: "reporting.export.require_scope_filters",
    category: "reporting",
    label: "Exports require scope filters",
    description:
      "Report exports must preserve the company, brand, location, and date filters used on screen.",
    valueType: "BOOLEAN",
    defaultValue: true
  },
  {
    key: "reporting.dashboard.unreconciled_mode",
    category: "reporting",
    label: "Unreconciled dashboard mode",
    description:
      "How dashboards should behave when source ledgers or operational records are unreconciled.",
    valueType: "SELECT",
    defaultValue: "warn_and_link",
    options: [
      { value: "block", label: "Block metric until reconciled" },
      { value: "warn_and_link", label: "Show warning and source link" },
      { value: "show_only", label: "Show metric without trust gate" }
    ]
  },
  {
    key: "finance.period_close.reopen_window_hours",
    category: "finance",
    label: "Period reopen window",
    description:
      "Maximum time window for an authorized accounting-period reopen before the period must be reviewed and closed again.",
    valueType: "NUMBER",
    defaultValue: 48,
    unit: "hours"
  },
  {
    key: "projects.restricted_visibility_default",
    category: "projects",
    label: "Restricted project visibility default",
    description:
      "Sensitive work projects default to explicit member visibility instead of broad discovery.",
    valueType: "BOOLEAN",
    defaultValue: true
  },
  {
    key: "projects.blocker_reason_required",
    category: "projects",
    label: "Blocker reason required",
    description:
      "Blocked tasks must record the blocker reason, owner, severity, and next action.",
    valueType: "BOOLEAN",
    defaultValue: true
  },
  {
    key: "security.privileged_mfa.enforcement_mode",
    category: "security",
    label: "Privileged MFA enforcement mode",
    description:
      "Controls whether sensitive administrative and security mutations only warn/audit missing verified MFA evidence or hard-block them.",
    valueType: "SELECT",
    defaultValue: "warn_and_audit",
    options: [
      {
        value: "warn_and_audit",
        label: "Warn and audit missing evidence"
      },
      {
        value: "enforce_admin_security",
        label: "Block high-risk admin and security actions"
      },
      {
        value: "enforce_all_sensitive",
        label: "Block all guarded sensitive actions"
      }
    ]
  },
  {
    key: "security.authorization_denial.window_minutes",
    category: "security",
    label: "Authorization denial aggregation window",
    description:
      "Minutes used to aggregate repeated authorization denials across bounded server-derived dimensions.",
    valueType: "NUMBER",
    defaultValue: 15,
    unit: "minutes"
  },
  {
    key: "security.evidence_storage.default_policy",
    category: "security",
    label: "Controlled evidence storage policy",
    description:
      "Private evidence upload defaults for environment isolation, MIME allowlist, required hosted scanning, preservation, paired recovery, and download auditing.",
    valueType: "JSON",
    defaultValue: {
      storageProvider: "environment-isolated",
      uploadLimitMb: 10,
      allowedMimePolicy: "allowlist",
      malwareScanMode: "required_before_availability",
      malwareScanWaiverReason:
        "Only local development may use an explicit test scan result; every hosted upload must pass the private ClamAV boundary before availability.",
      retentionPolicy: "preserve_until_approved_transaction_retention",
      recoveryPolicy: "paired_database_evidence_restore_required",
      downloadAuditRequired: true
    }
  },
  {
    key: "security.retention.matrix",
    category: "security",
    label: "Data retention matrix",
    description:
      "Company retention defaults for audit/security/control records, operational working records, attachments, and PII minimization.",
    valueType: "JSON",
    defaultValue: {
      audit_security_financial_control_years: 10,
      operational_working_record_years: 5,
      attachment_retention: "follow_transaction_retention",
      pii_minimization_required: true,
      export_redaction_required_where_not_needed: true
    }
  },
  {
    key: "security.backup_restore.default_policy",
    category: "security",
    label: "Backup and restore policy",
    description:
      "Recommended backup, offsite copy, checksum, restore rehearsal, and pre-release evidence defaults.",
    valueType: "JSON",
    defaultValue: {
      database_backup_frequency: "daily",
      encryption_required: true,
      offsite_copy_required: true,
      checksum_verification_required: true,
      restore_rehearsal_frequency: "quarterly",
      pre_release_backup_restore_evidence_required: true
    }
  },
  {
    key: "release.uat_required_before_rollout",
    category: "release",
    label: "UAT required before rollout",
    description:
      "Release readiness requires workflow UAT evidence before a module is marked pilot-ready.",
    valueType: "BOOLEAN",
    defaultValue: true
  },
  {
    key: "release.training_impact_required",
    category: "release",
    label: "Training impact assessment required",
    description:
      "Every behavior-changing release requires a KB, release-note, or training impact assessment.",
    valueType: "BOOLEAN",
    defaultValue: true
  }
] as const;

const policySettingKeySchema = z.enum(policySettingKeys);

const updatePolicySettingSchema = z.object({
  key: policySettingKeySchema,
  value: z.string().trim().min(1).max(5000),
  reason: z.string().trim().min(5).max(500)
});

const resetPolicySettingSchema = z.object({
  key: policySettingKeySchema
});

function asJsonValue(value: Prisma.InputJsonValue): Prisma.InputJsonValue {
  return value;
}

function stringifyPolicyValue(value: Prisma.JsonValue | Prisma.InputJsonValue) {
  if (typeof value === "string") {
    return value;
  }
  return JSON.stringify(value, null, 2);
}

function jsonValuesEqual(
  left: Prisma.JsonValue | Prisma.InputJsonValue,
  right: Prisma.JsonValue | Prisma.InputJsonValue
) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function normalizePolicyValue(
  definition: PolicySettingDefinition,
  rawValue: string
): Prisma.InputJsonValue {
  if (definition.valueType === "BOOLEAN") {
    if (rawValue === "true") {
      return true;
    }
    if (rawValue === "false") {
      return false;
    }
    throw new Error("POLICY_SETTING_BOOLEAN_INVALID");
  }

  if (definition.valueType === "NUMBER") {
    const numberValue = Number(rawValue);
    if (!Number.isFinite(numberValue) || numberValue < 0) {
      throw new Error("POLICY_SETTING_NUMBER_INVALID");
    }
    if (
      definition.key === "security.authorization_denial.window_minutes" &&
      (!Number.isInteger(numberValue) || numberValue < 5 || numberValue > 60)
    ) {
      throw new Error("AUTHORIZATION_DENIAL_WINDOW_MINUTES_INVALID");
    }
    return numberValue;
  }

  if (definition.valueType === "JSON") {
    try {
      return JSON.parse(rawValue) as Prisma.InputJsonValue;
    } catch {
      throw new Error("POLICY_SETTING_JSON_INVALID");
    }
  }

  if (definition.valueType === "SELECT") {
    if (!definition.options?.some((option) => option.value === rawValue)) {
      throw new Error("POLICY_SETTING_SELECT_INVALID");
    }
    return rawValue;
  }

  return rawValue;
}

function normalizePolicyValueFromFormData(
  definition: PolicySettingDefinition,
  formData: FormData
) {
  const rawValue = String(formData.get("value") ?? "").trim();

  if (
    definition.valueType === "JSON" &&
    rawValue === "__VALUE_ITEMS__" &&
    Array.isArray(definition.defaultValue)
  ) {
    const allowedValues = new Set(
      (definition.options?.map((option) => option.value) ??
        definition.defaultValue
          .filter((value) => typeof value === "string")
          .map((value) => value as string))
    );
    const selectedValues = formData
      .getAll("valueItem")
      .map((value) => String(value).trim())
      .filter((value) => allowedValues.has(value));

    if (selectedValues.length === 0) {
      throw new Error("POLICY_SETTING_JSON_ARRAY_EMPTY");
    }

    return selectedValues as Prisma.InputJsonArray;
  }

  return normalizePolicyValue(definition, rawValue);
}

function findPolicyDefinition(key: string) {
  const definition = defaultPolicySettings.find((setting) => setting.key === key);
  if (!definition) {
    throw new Error("POLICY_SETTING_NOT_FOUND");
  }
  return definition;
}

function sourceDecisionForPolicy(key: string) {
  if (key === "security.evidence_storage.default_policy") return "DEC-0046";
  if (key === "security.authorization_denial.window_minutes") return "DEC-0050";
  return "DEC-0036";
}

type PolicyReadClient = Pick<typeof prisma, "companyPolicySetting">;

export async function getSavedPolicyValue(
  session: SessionContext,
  key: PolicySettingKey,
  client: PolicyReadClient = prisma
) {
  const saved = await client.companyPolicySetting.findUnique({
    where: {
      companyId_key: {
        companyId: session.context.companyId,
        key
      }
    },
    select: {
      value: true,
      isDefault: true,
      sourceDecisionId: true,
      status: true
    }
  });

  if (!saved || saved.status !== "ACTIVE") {
    return null;
  }

  return saved;
}

export async function getDashboardTrustGatePolicy(session: SessionContext) {
  const key = "reporting.dashboard.unreconciled_mode" satisfies PolicySettingKey;
  const definition = findPolicyDefinition(key);
  const saved = await getSavedPolicyValue(session, key);
  const rawMode = saved?.value ?? definition.defaultValue;
  const mode =
    rawMode === "block" || rawMode === "warn_and_link" || rawMode === "show_only"
      ? rawMode
      : "warn_and_link";
  const label =
    definition.options?.find((option) => option.value === mode)?.label ??
    "Show warning and source link";

  return {
    key,
    mode: mode as DashboardTrustGateMode,
    label,
    isOverridden: saved ? !saved.isDefault : false,
    sourceDecisionId: saved?.sourceDecisionId ?? sourceDecisionForPolicy(key)
  };
}

export async function getReportExportPolicy(session: SessionContext) {
  const requireScopeFilters = await getBooleanPolicyValue(
    session,
    "reporting.export.require_scope_filters",
    true
  );
  const trustGate = await getDashboardTrustGatePolicy(session);

  return {
    requireScopeFilters,
    trustGate
  };
}

function getStringArrayPolicyValue(
  session: SessionContext,
  key: PolicySettingKey,
  fallback: readonly string[]
) {
  return getSavedPolicyValue(session, key).then((saved) => {
    const rawValue = saved?.value ?? findPolicyDefinition(key).defaultValue;
    if (
      Array.isArray(rawValue) &&
      rawValue.every((value) => typeof value === "string")
    ) {
      return rawValue;
    }
    return [...fallback];
  });
}

async function getBooleanPolicyValue(
  session: SessionContext,
  key: PolicySettingKey,
  fallback: boolean
) {
  const saved = await getSavedPolicyValue(session, key);
  const rawValue = saved?.value ?? findPolicyDefinition(key).defaultValue;
  return typeof rawValue === "boolean" ? rawValue : fallback;
}

async function getNumberPolicyValue(
  session: SessionContext,
  key: PolicySettingKey,
  fallback: number
) {
  const saved = await getSavedPolicyValue(session, key);
  const rawValue = saved?.value ?? findPolicyDefinition(key).defaultValue;
  return typeof rawValue === "number" && Number.isFinite(rawValue)
    ? rawValue
    : fallback;
}

export function validateAuthorizationDenialWindowMinutes(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 5 || value > 60) {
    throw new Error("AUTHORIZATION_DENIAL_WINDOW_MINUTES_INVALID");
  }
  return value;
}

export async function getAuthorizationDenialWindowMinutes(
  session: SessionContext,
  client: PolicyReadClient = prisma
) {
  const key = "security.authorization_denial.window_minutes" satisfies PolicySettingKey;
  const saved = await getSavedPolicyValue(session, key, client);
  return validateAuthorizationDenialWindowMinutes(
    saved?.value ?? findPolicyDefinition(key).defaultValue
  );
}

function normalizePaymentReleaseEvidencePolicy(
  rawValue: Prisma.JsonValue | Prisma.InputJsonValue
): PaymentReleaseEvidencePolicy {
  const fallback = findPolicyDefinition(
    "finance.payment_release.evidence_requirements_by_method"
  ).defaultValue as PaymentReleaseEvidencePolicy;
  if (!rawValue || typeof rawValue !== "object" || Array.isArray(rawValue)) {
    return fallback;
  }
  const source = rawValue as Record<string, unknown>;
  const methods = [
    "BANK_TRANSFER",
    "CHECK",
    "CASH",
    "MANUAL_REFERENCE"
  ] as const;

  return methods.reduce((policy, method) => {
    const rawRule = source[method];
    const fallbackRule = fallback[method];
    if (!rawRule || typeof rawRule !== "object" || Array.isArray(rawRule)) {
      policy[method] = fallbackRule;
      return policy;
    }
    const rule = rawRule as Record<string, unknown>;
    policy[method] = {
      executionEvidenceRequired:
        typeof rule.executionEvidenceRequired === "boolean"
          ? rule.executionEvidenceRequired
          : fallbackRule.executionEvidenceRequired,
      evidenceLabel:
        typeof rule.evidenceLabel === "string" && rule.evidenceLabel.trim()
          ? rule.evidenceLabel.trim()
          : fallbackRule.evidenceLabel
    };
    return policy;
  }, {} as PaymentReleaseEvidencePolicy);
}

function normalizeControlledEvidenceStoragePolicy(
  rawValue: Prisma.JsonValue | Prisma.InputJsonValue
): ControlledEvidenceStoragePolicy {
  const fallback = findPolicyDefinition(
    "security.evidence_storage.default_policy"
  ).defaultValue as ControlledEvidenceStoragePolicy;
  if (!rawValue || typeof rawValue !== "object" || Array.isArray(rawValue)) {
    return fallback;
  }

  const source = rawValue as Record<string, unknown>;
  const uploadLimitMb =
    typeof source.uploadLimitMb === "number" &&
    Number.isFinite(source.uploadLimitMb) &&
    source.uploadLimitMb > 0
      ? Math.min(Math.round(source.uploadLimitMb), 25)
      : fallback.uploadLimitMb;

  return {
    storageProvider: "environment-isolated",
    uploadLimitMb,
    allowedMimePolicy: "allowlist",
    malwareScanMode: "required_before_availability",
    malwareScanWaiverReason:
      typeof source.malwareScanWaiverReason === "string" &&
      source.malwareScanWaiverReason.trim()
        ? source.malwareScanWaiverReason.trim()
        : fallback.malwareScanWaiverReason,
    retentionPolicy: "preserve_until_approved_transaction_retention",
    recoveryPolicy: "paired_database_evidence_restore_required",
    downloadAuditRequired: true
  };
}

export async function getControlledEvidenceStoragePolicy(
  session: SessionContext
) {
  const key = "security.evidence_storage.default_policy" satisfies PolicySettingKey;
  const definition = findPolicyDefinition(key);
  const saved = await getSavedPolicyValue(session, key);
  const policy = normalizeControlledEvidenceStoragePolicy(
    saved?.value ?? definition.defaultValue
  );

  return {
    key,
    policy,
    isOverridden: saved ? !saved.isDefault : false,
    sourceDecisionId: saved?.sourceDecisionId ?? sourceDecisionForPolicy(key)
  };
}

export async function getPaymentReleaseEvidencePolicy(session: SessionContext) {
  const key =
    "finance.payment_release.evidence_requirements_by_method" satisfies PolicySettingKey;
  const definition = findPolicyDefinition(key);
  const saved = await getSavedPolicyValue(session, key);
  const policy = normalizePaymentReleaseEvidencePolicy(
    saved?.value ?? definition.defaultValue
  );

  return {
    key,
    policy,
    isOverridden: saved ? !saved.isDefault : false,
    sourceDecisionId: saved?.sourceDecisionId ?? "DEC-0036"
  };
}

function normalizePaymentReleaseSettlementPolicy(
  rawValue: Prisma.JsonValue | Prisma.InputJsonValue
): PaymentReleaseSettlementPolicy {
  const fallback = findPolicyDefinition(
    "finance.payment_release.settlement_policy"
  ).defaultValue as PaymentReleaseSettlementPolicy;
  if (!rawValue || typeof rawValue !== "object" || Array.isArray(rawValue)) {
    return fallback;
  }

  const source = rawValue as Record<string, unknown>;
  return {
    releaseExecutionMode: "manual_evidence_only",
    apSettlementMutationAllowed: false,
    bankApiMutationAllowed: false,
    journalPostingAllowed: false,
    reconciliationRequiredBeforeSettlement:
      typeof source.reconciliationRequiredBeforeSettlement === "boolean"
        ? source.reconciliationRequiredBeforeSettlement
        : fallback.reconciliationRequiredBeforeSettlement,
    reversalRequiresReconciliationRecovery: true,
    uatRequiredBeforeSettlement: true,
    decisionBasis:
      typeof source.decisionBasis === "string" && source.decisionBasis.trim()
        ? source.decisionBasis.trim()
        : fallback.decisionBasis
  };
}

export async function getPaymentReleaseSettlementPolicy(
  session: SessionContext
) {
  const key = "finance.payment_release.settlement_policy" satisfies PolicySettingKey;
  const definition = findPolicyDefinition(key);
  const saved = await getSavedPolicyValue(session, key);
  const policy = normalizePaymentReleaseSettlementPolicy(
    saved?.value ?? definition.defaultValue
  );

  return {
    key,
    policy,
    isOverridden: saved ? !saved.isDefault : false,
    sourceDecisionId: saved?.sourceDecisionId ?? "DEC-0036"
  };
}

function normalizeBudgetSourceHookPolicy(
  rawValue: Prisma.JsonValue | Prisma.InputJsonValue
): BudgetSourceHookPolicy {
  const fallback = findPolicyDefinition(
    "finance.budget.source_hook_policy"
  ).defaultValue as BudgetSourceHookPolicy;
  if (!rawValue || typeof rawValue !== "object" || Array.isArray(rawValue)) {
    return fallback;
  }

  const source = rawValue as Record<string, unknown>;
  return {
    rolloutMode: "warning_only",
    commitmentProjectionEnabled:
      typeof source.commitmentProjectionEnabled === "boolean"
        ? source.commitmentProjectionEnabled
        : fallback.commitmentProjectionEnabled,
    hardBlockEnabled: false,
    exceptionOverrideRequired:
      typeof source.exceptionOverrideRequired === "boolean"
        ? source.exceptionOverrideRequired
        : fallback.exceptionOverrideRequired,
    formalBackfillRequiredBeforeHardBlock: true,
    uatRequiredBeforeHardBlock: true,
    decisionBasis:
      typeof source.decisionBasis === "string" && source.decisionBasis.trim()
        ? source.decisionBasis.trim()
        : fallback.decisionBasis
  };
}

export async function getBudgetSourceHookPolicy(session: SessionContext) {
  const key = "finance.budget.source_hook_policy" satisfies PolicySettingKey;
  const definition = findPolicyDefinition(key);
  const saved = await getSavedPolicyValue(session, key);
  const policy = normalizeBudgetSourceHookPolicy(
    saved?.value ?? definition.defaultValue
  );

  return {
    key,
    policy,
    isOverridden: saved ? !saved.isDefault : false,
    sourceDecisionId: saved?.sourceDecisionId ?? "DEC-0036"
  };
}

function normalizeCashAdvanceRecoveryPolicy(
  rawValue: Prisma.JsonValue | Prisma.InputJsonValue
): CashAdvanceRecoveryPolicy {
  const fallback = findPolicyDefinition(
    "finance.cash_advance.recovery_policy"
  ).defaultValue as CashAdvanceRecoveryPolicy;
  if (!rawValue || typeof rawValue !== "object" || Array.isArray(rawValue)) {
    return fallback;
  }

  const source = rawValue as Record<string, unknown>;
  const dueSoonDays =
    typeof source.dueSoonDays === "number" &&
    Number.isFinite(source.dueSoonDays) &&
    source.dueSoonDays >= 0
      ? Math.min(Math.round(source.dueSoonDays), 14)
      : fallback.dueSoonDays;
  const overdueEscalationDays =
    typeof source.overdueEscalationDays === "number" &&
    Number.isFinite(source.overdueEscalationDays) &&
    source.overdueEscalationDays >= 1
      ? Math.min(Math.round(source.overdueEscalationDays), 30)
      : fallback.overdueEscalationDays;

  return {
    dueSoonDays,
    overdueEscalationDays,
    recoveryOwnerRole: "finance_controller",
    requireEvidenceForDueDateExtension:
      typeof source.requireEvidenceForDueDateExtension === "boolean"
        ? source.requireEvidenceForDueDateExtension
        : fallback.requireEvidenceForDueDateExtension,
    uatRequiredBeforeCollections: true,
    decisionBasis:
      typeof source.decisionBasis === "string" && source.decisionBasis.trim()
        ? source.decisionBasis.trim()
        : fallback.decisionBasis
  };
}

export async function getCashAdvanceRecoveryPolicy(session: SessionContext) {
  const key = "finance.cash_advance.recovery_policy" satisfies PolicySettingKey;
  const definition = findPolicyDefinition(key);
  const saved = await getSavedPolicyValue(session, key);
  const policy = normalizeCashAdvanceRecoveryPolicy(
    saved?.value ?? definition.defaultValue
  );

  return {
    key,
    policy,
    isOverridden: saved ? !saved.isDefault : false,
    sourceDecisionId: saved?.sourceDecisionId ?? "DEC-0036"
  };
}

function normalizeExpenseRequestHandoffPolicy(
  rawValue: Prisma.JsonValue | Prisma.InputJsonValue
): ExpenseRequestHandoffPolicy {
  const fallback = findPolicyDefinition(
    "finance.expense_request.handoff_policy"
  ).defaultValue as ExpenseRequestHandoffPolicy;
  if (!rawValue || typeof rawValue !== "object" || Array.isArray(rawValue)) {
    return fallback;
  }

  const source = rawValue as Record<string, unknown>;
  return {
    requiredHandoffPath: "expense_to_ap_to_payment_request",
    allowDirectPaymentRequest: false,
    duplicateApDraftGuardRequired:
      typeof source.duplicateApDraftGuardRequired === "boolean"
        ? source.duplicateApDraftGuardRequired
        : fallback.duplicateApDraftGuardRequired,
    settlementMutationAllowed: false,
    uatRequiredBeforeSettlement: true,
    decisionBasis:
      typeof source.decisionBasis === "string" && source.decisionBasis.trim()
        ? source.decisionBasis.trim()
        : fallback.decisionBasis
  };
}

export async function getExpenseRequestHandoffPolicy(session: SessionContext) {
  const key = "finance.expense_request.handoff_policy" satisfies PolicySettingKey;
  const definition = findPolicyDefinition(key);
  const saved = await getSavedPolicyValue(session, key);
  const policy = normalizeExpenseRequestHandoffPolicy(
    saved?.value ?? definition.defaultValue
  );

  return {
    key,
    policy,
    isOverridden: saved ? !saved.isDefault : false,
    sourceDecisionId: saved?.sourceDecisionId ?? "DEC-0036"
  };
}

export async function getFinancePeriodClosePolicy(session: SessionContext) {
  const reopenWindowHours = await getNumberPolicyValue(
    session,
    "finance.period_close.reopen_window_hours",
    48
  );

  return {
    reopenWindowHours: Math.max(1, Math.min(Math.round(reopenWindowHours), 168))
  };
}

export async function getReleaseReadinessPolicyFlags(session: SessionContext) {
  const [uatRequired, trainingImpactRequired] = await Promise.all([
    getBooleanPolicyValue(session, "release.uat_required_before_rollout", true),
    getBooleanPolicyValue(session, "release.training_impact_required", true)
  ]);

  return {
    uatRequired,
    trainingImpactRequired
  };
}

export async function getInventoryAdjustmentPolicy(session: SessionContext) {
  const openingBalanceEvidenceRequired = await getBooleanPolicyValue(
    session,
    "inventory.adjustment.opening_balance_evidence_required",
    true
  );

  return {
    openingBalanceEvidenceRequired
  };
}

export async function getPurchasingSupplierPolicy(session: SessionContext) {
  const poAllowedStatuses = await getStringArrayPolicyValue(
    session,
    "purchasing.supplier.po_allowed_statuses",
    ["APPROVED"]
  );

  return {
    poAllowedStatuses
  };
}

export async function getPurchasingControlPolicy(session: SessionContext) {
  const [
    standardApprovalThresholdPhp,
    highValueApprovalThresholdPhp,
    seniorApprovalThresholdPhp,
    emergencyMaxAmountPhp,
    quotationRequiredThresholdPhp,
    minimumQuotes
  ] = await Promise.all([
    getNumberPolicyValue(
      session,
      "purchasing.approval.standard_threshold_php",
      10000
    ),
    getNumberPolicyValue(
      session,
      "purchasing.approval.high_value_threshold_php",
      50000
    ),
    getNumberPolicyValue(
      session,
      "purchasing.approval.senior_threshold_php",
      200000
    ),
    getNumberPolicyValue(session, "purchasing.emergency.max_amount_php", 5000),
    getNumberPolicyValue(
      session,
      "purchasing.quotation.required_threshold_php",
      50000
    ),
    getNumberPolicyValue(session, "purchasing.quotation.minimum_quotes", 3)
  ]);

  return {
    standardApprovalThresholdPhp,
    highValueApprovalThresholdPhp,
    seniorApprovalThresholdPhp,
    emergencyMaxAmountPhp,
    quotationRequiredThresholdPhp,
    minimumQuotes
  };
}

export async function getStockCountCadencePolicy(session: SessionContext) {
  const [standardFrequencyDays, highRiskFrequencyDays] = await Promise.all([
    getNumberPolicyValue(session, "inventory.stock_count.standard_frequency_days", 30),
    getNumberPolicyValue(session, "inventory.stock_count.high_risk_frequency_days", 7)
  ]);

  return {
    standardFrequencyDays,
    highRiskFrequencyDays
  };
}

export async function getInventoryLotExpiryPolicy(session: SessionContext) {
  const requiredCategoryCodes = (
    await getStringArrayPolicyValue(
      session,
      "inventory.lot_expiry.required_categories",
      [
        "BEEF_CUTS",
        "POULTRY",
        "SEAFOOD",
        "FRESH_PRODUCE",
        "SAUCES",
        "READY_TO_EAT"
      ]
    )
  ).map((categoryCode) => categoryCode.trim().toUpperCase());

  return {
    requiredCategoryCodes
  };
}

export function inventoryItemLotExpiryRequirements(
  item: {
    trackLot: boolean;
    trackExpiry: boolean;
    category?: { categoryCode: string } | null;
  },
  policy: { requiredCategoryCodes: readonly string[] }
) {
  const categoryCode = item.category?.categoryCode.trim().toUpperCase();
  const categoryRequiresTracking = categoryCode
    ? policy.requiredCategoryCodes.includes(categoryCode)
    : false;

  return {
    requiresLot: item.trackLot || categoryRequiresTracking,
    requiresExpiry: item.trackExpiry || categoryRequiresTracking,
    requiredByCategoryPolicy: categoryRequiresTracking
  };
}

export function assertSupplierStatusAllowedForPurchaseOrder(
  supplierAccreditationStatus: string,
  policy: { poAllowedStatuses: readonly string[] },
  errorCode = "SUPPLIER_NOT_ACTIVE_FOR_PO"
) {
  if (!policy.poAllowedStatuses.includes(supplierAccreditationStatus)) {
    throw new Error(errorCode);
  }
}

export async function getProjectTaskPolicy(session: SessionContext) {
  const blockerReasonRequired = await getBooleanPolicyValue(
    session,
    "projects.blocker_reason_required",
    true
  );

  return {
    blockerReasonRequired
  };
}

async function assertCanManagePolicySettings(session: SessionContext) {
  await requirePermission(session, permissions.coreAdminister);
  await assertCanManageCompanyScope(session, session.context.companyId);
}

export async function listCompanyPolicySettings(session: SessionContext) {
  await requirePermission(session, permissions.coreAdminister);

  const savedSettings = await prisma.companyPolicySetting.findMany({
    where: {
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      status: "ACTIVE"
    }
  });
  const savedByKey = new Map(savedSettings.map((setting) => [setting.key, setting]));

  return defaultPolicySettings.map((definition) => {
    const saved = savedByKey.get(definition.key);
    const value = saved?.value ?? definition.defaultValue;
    const defaultValue = saved?.defaultValue ?? definition.defaultValue;

    return {
      id: saved?.id ?? null,
      key: definition.key,
      category: definition.category,
      label: definition.label,
      description: definition.description,
      value,
      defaultValue,
      valueText: stringifyPolicyValue(value),
      defaultValueText: stringifyPolicyValue(defaultValue),
      valueType: definition.valueType,
      unit: definition.unit ?? null,
      options: definition.options ?? [],
      sourceDecisionId:
        saved?.sourceDecisionId ?? sourceDecisionForPolicy(definition.key),
      isDefault: saved ? saved.isDefault : true,
      isOverridden: saved ? !jsonValuesEqual(saved.value, definition.defaultValue) : false,
      updatedAt: saved?.updatedAt.toISOString() ?? null
    };
  });
}

export async function updateCompanyPolicySetting(formData: FormData) {
  const session = await requireSessionContext();
  await assertCanManagePolicySettings(session);
  const values = updatePolicySettingSchema.parse(Object.fromEntries(formData));
  const definition = findPolicyDefinition(values.key);
  const nextValue = normalizePolicyValueFromFormData(definition, formData);
  const nextIsDefault = jsonValuesEqual(nextValue, definition.defaultValue);

  await prisma.$transaction(async (tx) => {
    const existing = await tx.companyPolicySetting.findUnique({
      where: {
        companyId_key: {
          companyId: session.context.companyId,
          key: definition.key
        }
      }
    });

    const saved = existing
      ? await tx.companyPolicySetting.update({
          where: { id: existing.id },
          data: {
            category: definition.category,
            label: definition.label,
            description: definition.description,
            value: asJsonValue(nextValue),
            defaultValue: asJsonValue(definition.defaultValue),
            valueType: definition.valueType,
            unit: definition.unit ?? null,
            ...(definition.options
              ? { options: asJsonValue([...definition.options]) }
              : {}),
            sourceDecisionId: sourceDecisionForPolicy(definition.key),
            isDefault: nextIsDefault,
            status: "ACTIVE",
            updatedByUserId: session.user.id
          }
        })
      : await tx.companyPolicySetting.create({
          data: {
            tenantId: session.context.tenantId,
            companyId: session.context.companyId,
            key: definition.key,
            category: definition.category,
            label: definition.label,
            description: definition.description,
            value: asJsonValue(nextValue),
            defaultValue: asJsonValue(definition.defaultValue),
            valueType: definition.valueType,
            unit: definition.unit ?? null,
            ...(definition.options
              ? { options: asJsonValue([...definition.options]) }
              : {}),
            sourceDecisionId: sourceDecisionForPolicy(definition.key),
            isDefault: nextIsDefault,
            status: "ACTIVE",
            updatedByUserId: session.user.id
          }
        });

    await tx.auditEvent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        actorUserId: session.user.id,
        eventType: existing
          ? "company_policy_setting.updated"
          : "company_policy_setting.created",
        entityType: "CompanyPolicySetting",
        entityId: saved.id,
        ...(existing
          ? {
              beforeData: {
                key: existing.key,
                value: existing.value,
                isDefault: existing.isDefault,
                sourceDecisionId: existing.sourceDecisionId
              }
            }
          : {}),
        afterData: {
          key: saved.key,
          category: saved.category,
          label: saved.label,
          value: saved.value,
          defaultValue: saved.defaultValue,
          valueType: saved.valueType,
          isDefault: saved.isDefault,
          sourceDecisionId: saved.sourceDecisionId
        },
        metadata: {
          reason: values.reason,
          previousValue: existing?.value ?? null
        }
      }
    });
  });
}

export async function resetCompanyPolicySetting(formData: FormData) {
  const session = await requireSessionContext();
  await assertCanManagePolicySettings(session);
  const values = resetPolicySettingSchema.parse(Object.fromEntries(formData));
  const definition = findPolicyDefinition(values.key);

  await prisma.$transaction(async (tx) => {
    const existing = await tx.companyPolicySetting.findUnique({
      where: {
        companyId_key: {
          companyId: session.context.companyId,
          key: definition.key
        }
      }
    });

    const saved = existing
      ? await tx.companyPolicySetting.update({
          where: { id: existing.id },
          data: {
            category: definition.category,
            label: definition.label,
            description: definition.description,
            value: asJsonValue(definition.defaultValue),
            defaultValue: asJsonValue(definition.defaultValue),
            valueType: definition.valueType,
            unit: definition.unit ?? null,
            ...(definition.options
              ? { options: asJsonValue([...definition.options]) }
              : {}),
            sourceDecisionId: sourceDecisionForPolicy(definition.key),
            isDefault: true,
            status: "ACTIVE",
            updatedByUserId: session.user.id
          }
        })
      : await tx.companyPolicySetting.create({
          data: {
            tenantId: session.context.tenantId,
            companyId: session.context.companyId,
            key: definition.key,
            category: definition.category,
            label: definition.label,
            description: definition.description,
            value: asJsonValue(definition.defaultValue),
            defaultValue: asJsonValue(definition.defaultValue),
            valueType: definition.valueType,
            unit: definition.unit ?? null,
            ...(definition.options
              ? { options: asJsonValue([...definition.options]) }
              : {}),
            sourceDecisionId: sourceDecisionForPolicy(definition.key),
            isDefault: true,
            status: "ACTIVE",
            updatedByUserId: session.user.id
          }
        });

    await tx.auditEvent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        actorUserId: session.user.id,
        eventType: existing
          ? "company_policy_setting.reset_to_default"
          : "company_policy_setting.created",
        entityType: "CompanyPolicySetting",
        entityId: saved.id,
        ...(existing
          ? {
              beforeData: {
                key: existing.key,
                value: existing.value,
                isDefault: existing.isDefault,
                sourceDecisionId: existing.sourceDecisionId
              }
            }
          : {}),
        afterData: {
          key: saved.key,
          category: saved.category,
          label: saved.label,
          value: saved.value,
          defaultValue: saved.defaultValue,
          valueType: saved.valueType,
          isDefault: saved.isDefault,
          sourceDecisionId: saved.sourceDecisionId
        },
        metadata: {
          reason: `Reset to ${sourceDecisionForPolicy(definition.key)} recommended default from Admin Settings.`,
          previousValue: existing?.value ?? null
        }
      }
    });
  });
}
