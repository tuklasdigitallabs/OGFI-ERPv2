import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const migrationSource = readFileSync(
  fileURLToPath(
    new URL(
      "../prisma/migrations/20260727160000_approval_routing_shadow_observers/migration.sql",
      import.meta.url,
    ),
  ),
  "utf8",
);

const observers = [
  ["purchase_request", "PurchaseRequest"],
  ["quotation_recommendation", "QuotationRecommendation"],
  ["purchase_order", "PurchaseOrder"],
  ["purchase_order_balance_closure", "PurchaseOrderBalanceClosure"],
  ["purchase_order_amendment", "PurchaseOrderAmendment"],
  ["wastage_report", "WastageReport"],
  ["stock_adjustment", "StockAdjustment"],
  ["finance_close_run", "FinanceCloseRun"],
  ["budget_revision", "BudgetRevision"],
  ["expense_request", "ExpenseRequest"],
  ["cash_advance_request", "CashAdvanceRequest"],
  ["petty_cash_request", "PettyCashRequest"],
  ["payment_request", "PaymentRequest"],
  ["payment_release", "PaymentRelease"],
  ["employee_leave_request", "EmployeeLeaveRequest"],
  ["employee_overtime_record", "EmployeeOvertimeRecord"],
  ["workforce_schedule", "WorkforceSchedule"],
  ["attendance_import_batch", "AttendanceImportBatch"],
] as const;

function observerDefinition(slug: string) {
  const match = migrationSource.match(
    new RegExp(
      `CREATE FUNCTION approval_shadow\\.observe_${slug}_v1\\([\\s\\S]*?\\$function\\$;`,
    ),
  );
  expect(match, `observer definition for ${slug}`).not.toBeNull();
  return match![0];
}

describe("DEC-0247 C1 private approval-routing shadow observers", () => {
  test("installs the exact closed 18-family binary observer catalog", () => {
    expect(observers).toHaveLength(18);
    expect(
      migrationSource.match(/CREATE FUNCTION approval_shadow\.observe_[a-z_]+_v1\(/g),
    ).toHaveLength(18);

    for (const [slug, family] of observers) {
      const definition = observerDefinition(slug);
      expect(definition).toContain("p_tenant_id UUID");
      expect(definition).toContain("p_company_id UUID");
      expect(definition).toContain("p_approval_instance_id UUID");
      expect(definition).toContain("RETURNS TEXT");
      expect(definition).toContain("LANGUAGE sql");
      expect(definition).toContain("STABLE");
      expect(definition).toContain("CALLED ON NULL INPUT");
      expect(definition).toContain("SECURITY INVOKER");
      expect(definition).toContain("SET search_path = pg_catalog");
      expect(definition).toContain(`ai.\"documentType\" = '${family}'`);
      expect(definition).toContain("THEN 'SHADOW_MATCH' ELSE 'SHADOW_NO_MATCH' END");
      expect(migrationSource).toContain(
        `REVOKE ALL ON FUNCTION approval_shadow.observe_${slug}_v1(UUID, UUID, UUID) FROM PUBLIC;`,
      );
    }
  });

  test("uses exact identity and tenant/company scope in every observer", () => {
    for (const [slug] of observers) {
      const definition = observerDefinition(slug);
      for (const binding of [
        'ai."id" = p_approval_instance_id',
        'ai."tenantId" = p_tenant_id',
        'ai."companyId" = p_company_id',
        'source."id" = ai."documentId"',
        'source."tenantId" = p_tenant_id',
        'source."companyId" = p_company_id',
      ]) {
        expect(definition, `${slug}: ${binding}`).toContain(binding);
      }
    }
  });

  test("pins the reviewed structural lineage predicates", () => {
    const requiredByObserver = {
      purchase_request: ['public."Location"', 'public."Brand"'],
      quotation_recommendation: [
        'public."QuotationRequest"',
        'public."PurchaseRequest"',
        'public."Location"',
      ],
      purchase_order: [
        'public."PurchaseRequest"',
        'public."QuotationRecommendation"',
        'public."QuotationRequest"',
        'public."Location"',
      ],
      purchase_order_balance_closure: [
        'public."PurchaseOrder"',
        'public."PurchaseRequest"',
        'public."QuotationRecommendation"',
        'public."QuotationRequest"',
        'public."Location"',
      ],
      purchase_order_amendment: [
        'public."PurchaseOrder"',
        'public."PurchaseRequest"',
        'public."QuotationRecommendation"',
        'public."QuotationRequest"',
        'public."Location"',
      ],
      wastage_report: ['public."InventoryLocation"', 'public."Location"'],
      stock_adjustment: ['public."InventoryLocation"', 'public."Location"'],
      finance_close_run: ['public."Company"'],
      budget_revision: ['public."Budget"', 'public."BudgetLine"', 'public."Location"'],
      expense_request: [
        'public."Location"',
        'public."ExpenseRequestLine"',
        'public."ExpenseRequestSourceLink"',
      ],
      cash_advance_request: [
        'public."Location"',
        'public."User"',
        'public."ExpenseRequest"',
        'public."PaymentRequest"',
        'public."BudgetCommitment"',
        'public."BankAccount"',
      ],
      petty_cash_request: ['public."PettyCashFund"', 'public."Location"'],
      payment_request: [
        'public."Location"',
        'public."PaymentRequestLine"',
        'public."ApInvoice"',
      ],
      payment_release: [
        'public."PaymentRequest"',
        'public."BankAccount"',
        'public."Location"',
        'public."PaymentReleaseAllocation"',
        'public."PaymentRequestLine"',
        'public."ApInvoice"',
      ],
      employee_leave_request: ['public."Employee"', 'public."Location"'],
      employee_overtime_record: ['public."Employee"', 'public."Location"'],
      workforce_schedule: [
        'public."Location"',
        'public."WorkforceScheduleLine"',
        'public."Employee"',
      ],
      attendance_import_batch: [
        'public."Location"',
        'public."AttendanceImportLine"',
        'public."Employee"',
      ],
    } as const;

    for (const [slug, relations] of Object.entries(requiredByObserver)) {
      const definition = observerDefinition(slug);
      expect(definition).toContain('public."ApprovalInstance"');
      for (const relation of relations) expect(definition).toContain(relation);
    }

    const finance = observerDefinition("finance_close_run");
    for (const key of ["approvalAction", "requestedByUserId", "requestedAt"]) {
      expect(finance).toContain(`pendingSensitiveApproval,${key}`);
    }
  });

  test("is private, read-only, deterministic in shape, and carries no workflow authority", () => {
    expect(migrationSource).toContain("CREATE SCHEMA approval_shadow;");
    expect(migrationSource).toContain("REVOKE ALL ON SCHEMA approval_shadow FROM PUBLIC;");
    expect(migrationSource).not.toMatch(/^\s*GRANT\b/im);
    expect(migrationSource).not.toMatch(/SECURITY\s+DEFINER/i);
    expect(migrationSource).not.toMatch(/\b(?:INSERT|UPDATE|DELETE|MERGE|TRUNCATE|LOCK)\b/i);
    expect(migrationSource).not.toMatch(/\bEXECUTE\s+FORMAT\b|\bEXECUTE\s+[^;]+/i);
    expect(migrationSource).not.toMatch(
      /ApprovalRule|ApprovalInstanceStep|routingSchemaVersion|requiredPermission|prohibitedActor|dueAt|submittedAt|approvedAt|totalAmount|requestedAmount|releaseAmount|attachment|evidence/i,
    );
    expect(migrationSource).not.toMatch(
      /V1_PRODUCER_BARRIER_READY|DRAIN_CLEAN|SHADOW_READY|SHADOW_ACTIVATED/i,
    );
  });
});
