-- DEC-0247 B1 dormant same-key exclusive lock contract only.
-- This migration creates no readiness, certification, provenance, or activation
-- authority and remains unused while APPROVAL_ROUTING_V1_ENABLED is false.

BEGIN;

CREATE OR REPLACE FUNCTION public.acquire_approval_routing_producer_barrier_shared(
  scope_tenant_id UUID,
  scope_company_id UUID,
  producer_document_type TEXT
)
RETURNS void
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF scope_tenant_id IS NULL OR scope_company_id IS NULL OR NOT EXISTS (
    SELECT 1
      FROM public."Company" company
     WHERE company."id" = scope_company_id
       AND company."tenantId" = scope_tenant_id
  ) THEN
    RAISE EXCEPTION 'APPROVAL_ROUTING_PRODUCER_BARRIER_SCOPE_INVALID'
      USING ERRCODE = '55000';
  END IF;

  IF producer_document_type IS NULL OR producer_document_type NOT IN (
    'PurchaseRequest', 'QuotationRecommendation', 'PurchaseOrder',
    'PurchaseOrderBalanceClosure', 'PurchaseOrderAmendment', 'WastageReport',
    'StockAdjustment', 'FinanceCloseRun', 'BudgetRevision', 'ExpenseRequest',
    'CashAdvanceRequest', 'PettyCashRequest', 'PaymentRequest', 'PaymentRelease',
    'EmployeeLeaveRequest', 'EmployeeOvertimeRecord', 'WorkforceSchedule',
    'AttendanceImportBatch'
  ) THEN
    RAISE EXCEPTION 'APPROVAL_ROUTING_PRODUCER_FAMILY_UNSUPPORTED'
      USING ERRCODE = '55000';
  END IF;

  IF NOT pg_catalog.pg_try_advisory_xact_lock_shared(
    pg_catalog.hashtextextended(
      'ogfi:approval-routing-producer-barrier:v1:'
        || scope_tenant_id::text || ':' || scope_company_id::text,
      6510615555426900570::bigint
    )
  ) THEN
    RAISE EXCEPTION 'APPROVAL_ROUTING_PRODUCER_BARRIER_RETRY'
      USING ERRCODE = '40001';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.acquire_approval_routing_producer_barrier_exclusive(
  scope_tenant_id UUID,
  scope_company_id UUID
)
RETURNS void
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF scope_tenant_id IS NULL OR scope_company_id IS NULL OR NOT EXISTS (
    SELECT 1
      FROM public."Company" company
     WHERE company."id" = scope_company_id
       AND company."tenantId" = scope_tenant_id
  ) THEN
    RAISE EXCEPTION 'APPROVAL_ROUTING_PRODUCER_BARRIER_SCOPE_INVALID'
      USING ERRCODE = '55000';
  END IF;

  IF NOT pg_catalog.pg_try_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'ogfi:approval-routing-producer-barrier:v1:'
        || scope_tenant_id::text || ':' || scope_company_id::text,
      6510615555426900570::bigint
    )
  ) THEN
    RAISE EXCEPTION 'APPROVAL_ROUTING_PRODUCER_BARRIER_RETRY'
      USING ERRCODE = '40001';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.acquire_approval_routing_producer_barrier_exclusive(UUID, UUID) FROM PUBLIC;

COMMIT;
