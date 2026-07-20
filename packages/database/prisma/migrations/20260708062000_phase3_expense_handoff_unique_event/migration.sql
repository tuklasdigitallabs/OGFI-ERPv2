-- Phase 3 expense request AP handoff duplicate-prevention guard.
-- Preflight for populated environments:
--   SELECT "tenantId", "companyId", "expenseRequestId", "sourceEventKey", COUNT(*)
--   FROM "ExpenseRequestSourceLink"
--   GROUP BY "tenantId", "companyId", "expenseRequestId", "sourceEventKey"
--   HAVING COUNT(*) > 1;
-- Resolve any returned duplicates through a controlled data-fix script before applying.
CREATE UNIQUE INDEX "ExpenseRequestSourceLink_tenant_company_request_event_key"
ON "ExpenseRequestSourceLink" ("tenantId", "companyId", "expenseRequestId", "sourceEventKey");
