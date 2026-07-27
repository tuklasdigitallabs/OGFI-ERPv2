-- DEC-0247 C1 dormant, private structural shadow observers.
-- These routines are binary, non-authoritative, read-only diagnostics. They
-- grant no runtime authority and deliberately exclude workflow and policy facts.

BEGIN;

CREATE SCHEMA approval_shadow;
REVOKE ALL ON SCHEMA approval_shadow FROM PUBLIC;

CREATE FUNCTION approval_shadow.observe_purchase_request_v1(
  p_tenant_id UUID,
  p_company_id UUID,
  p_approval_instance_id UUID
)
RETURNS TEXT
LANGUAGE sql
STABLE
CALLED ON NULL INPUT
SECURITY INVOKER
SET search_path = pg_catalog
AS $function$
  SELECT CASE WHEN EXISTS (
    SELECT 1
      FROM public."ApprovalInstance" ai
      JOIN public."PurchaseRequest" source
        ON source."id" = ai."documentId"
       AND source."tenantId" = p_tenant_id
       AND source."companyId" = p_company_id
      JOIN public."Location" request_location
        ON request_location."id" = source."requestLocationId"
       AND request_location."tenantId" = p_tenant_id
       AND request_location."companyId" = p_company_id
     WHERE ai."id" = p_approval_instance_id
       AND ai."tenantId" = p_tenant_id
       AND ai."companyId" = p_company_id
       AND ai."documentType" = 'PurchaseRequest'
       AND (
         source."brandId" IS NULL
         OR EXISTS (
           SELECT 1
             FROM public."Brand" brand
            WHERE brand."id" = source."brandId"
              AND brand."tenantId" = p_tenant_id
              AND brand."companyId" = p_company_id
         )
       )
  ) THEN 'SHADOW_MATCH' ELSE 'SHADOW_NO_MATCH' END;
$function$;

CREATE FUNCTION approval_shadow.observe_quotation_recommendation_v1(
  p_tenant_id UUID,
  p_company_id UUID,
  p_approval_instance_id UUID
)
RETURNS TEXT
LANGUAGE sql
STABLE
CALLED ON NULL INPUT
SECURITY INVOKER
SET search_path = pg_catalog
AS $function$
  SELECT CASE WHEN EXISTS (
    SELECT 1
      FROM public."ApprovalInstance" ai
      JOIN public."QuotationRecommendation" source
        ON source."id" = ai."documentId"
       AND source."tenantId" = p_tenant_id
       AND source."companyId" = p_company_id
      JOIN public."QuotationRequest" qr
        ON qr."id" = source."quotationRequestId"
       AND qr."tenantId" = p_tenant_id
       AND qr."companyId" = p_company_id
      JOIN public."PurchaseRequest" pr
        ON pr."id" = qr."purchaseRequestId"
       AND pr."tenantId" = p_tenant_id
       AND pr."companyId" = p_company_id
      JOIN public."Location" request_location
        ON request_location."id" = pr."requestLocationId"
       AND request_location."tenantId" = p_tenant_id
       AND request_location."companyId" = p_company_id
     WHERE ai."id" = p_approval_instance_id
       AND ai."tenantId" = p_tenant_id
       AND ai."companyId" = p_company_id
       AND ai."documentType" = 'QuotationRecommendation'
  ) THEN 'SHADOW_MATCH' ELSE 'SHADOW_NO_MATCH' END;
$function$;

CREATE FUNCTION approval_shadow.observe_purchase_order_v1(
  p_tenant_id UUID,
  p_company_id UUID,
  p_approval_instance_id UUID
)
RETURNS TEXT
LANGUAGE sql
STABLE
CALLED ON NULL INPUT
SECURITY INVOKER
SET search_path = pg_catalog
AS $function$
  SELECT CASE WHEN EXISTS (
    SELECT 1
      FROM public."ApprovalInstance" ai
      JOIN public."PurchaseOrder" source
        ON source."id" = ai."documentId"
       AND source."tenantId" = p_tenant_id
       AND source."companyId" = p_company_id
      JOIN public."PurchaseRequest" pr
        ON pr."id" = source."purchaseRequestId"
       AND pr."tenantId" = p_tenant_id
       AND pr."companyId" = p_company_id
      JOIN public."QuotationRecommendation" recommendation
        ON recommendation."id" = source."quotationRecommendationId"
       AND recommendation."tenantId" = p_tenant_id
       AND recommendation."companyId" = p_company_id
      JOIN public."QuotationRequest" qr
        ON qr."id" = source."quotationRequestId"
       AND qr."id" = recommendation."quotationRequestId"
       AND qr."purchaseRequestId" = pr."id"
       AND qr."tenantId" = p_tenant_id
       AND qr."companyId" = p_company_id
      JOIN public."Location" request_location
        ON request_location."id" = pr."requestLocationId"
       AND request_location."tenantId" = p_tenant_id
       AND request_location."companyId" = p_company_id
      JOIN public."Location" delivery_location
        ON delivery_location."id" = source."deliveryLocationId"
       AND delivery_location."tenantId" = p_tenant_id
       AND delivery_location."companyId" = p_company_id
     WHERE ai."id" = p_approval_instance_id
       AND ai."tenantId" = p_tenant_id
       AND ai."companyId" = p_company_id
       AND ai."documentType" = 'PurchaseOrder'
  ) THEN 'SHADOW_MATCH' ELSE 'SHADOW_NO_MATCH' END;
$function$;

CREATE FUNCTION approval_shadow.observe_purchase_order_balance_closure_v1(
  p_tenant_id UUID,
  p_company_id UUID,
  p_approval_instance_id UUID
)
RETURNS TEXT
LANGUAGE sql
STABLE
CALLED ON NULL INPUT
SECURITY INVOKER
SET search_path = pg_catalog
AS $function$
  SELECT CASE WHEN EXISTS (
    SELECT 1
      FROM public."ApprovalInstance" ai
      JOIN public."PurchaseOrderBalanceClosure" source
        ON source."id" = ai."documentId"
       AND source."tenantId" = p_tenant_id
       AND source."companyId" = p_company_id
      JOIN public."PurchaseOrder" po
        ON po."id" = source."purchaseOrderId"
       AND po."tenantId" = p_tenant_id
       AND po."companyId" = p_company_id
      JOIN public."PurchaseRequest" pr
        ON pr."id" = po."purchaseRequestId"
       AND pr."tenantId" = p_tenant_id
       AND pr."companyId" = p_company_id
      JOIN public."QuotationRecommendation" recommendation
        ON recommendation."id" = po."quotationRecommendationId"
       AND recommendation."tenantId" = p_tenant_id
       AND recommendation."companyId" = p_company_id
      JOIN public."QuotationRequest" qr
        ON qr."id" = po."quotationRequestId"
       AND qr."id" = recommendation."quotationRequestId"
       AND qr."purchaseRequestId" = pr."id"
       AND qr."tenantId" = p_tenant_id
       AND qr."companyId" = p_company_id
      JOIN public."Location" request_location
        ON request_location."id" = pr."requestLocationId"
       AND request_location."tenantId" = p_tenant_id
       AND request_location."companyId" = p_company_id
      JOIN public."Location" delivery_location
        ON delivery_location."id" = po."deliveryLocationId"
       AND delivery_location."tenantId" = p_tenant_id
       AND delivery_location."companyId" = p_company_id
     WHERE ai."id" = p_approval_instance_id
       AND ai."tenantId" = p_tenant_id
       AND ai."companyId" = p_company_id
       AND ai."documentType" = 'PurchaseOrderBalanceClosure'
  ) THEN 'SHADOW_MATCH' ELSE 'SHADOW_NO_MATCH' END;
$function$;

CREATE FUNCTION approval_shadow.observe_purchase_order_amendment_v1(
  p_tenant_id UUID,
  p_company_id UUID,
  p_approval_instance_id UUID
)
RETURNS TEXT
LANGUAGE sql
STABLE
CALLED ON NULL INPUT
SECURITY INVOKER
SET search_path = pg_catalog
AS $function$
  SELECT CASE WHEN EXISTS (
    SELECT 1
      FROM public."ApprovalInstance" ai
      JOIN public."PurchaseOrderAmendment" source
        ON source."id" = ai."documentId"
       AND source."tenantId" = p_tenant_id
       AND source."companyId" = p_company_id
      JOIN public."PurchaseOrder" po
        ON po."id" = source."purchaseOrderId"
       AND po."tenantId" = p_tenant_id
       AND po."companyId" = p_company_id
      JOIN public."PurchaseRequest" pr
        ON pr."id" = po."purchaseRequestId"
       AND pr."tenantId" = p_tenant_id
       AND pr."companyId" = p_company_id
      JOIN public."QuotationRecommendation" recommendation
        ON recommendation."id" = po."quotationRecommendationId"
       AND recommendation."tenantId" = p_tenant_id
       AND recommendation."companyId" = p_company_id
      JOIN public."QuotationRequest" qr
        ON qr."id" = po."quotationRequestId"
       AND qr."id" = recommendation."quotationRequestId"
       AND qr."purchaseRequestId" = pr."id"
       AND qr."tenantId" = p_tenant_id
       AND qr."companyId" = p_company_id
      JOIN public."Location" request_location
        ON request_location."id" = pr."requestLocationId"
       AND request_location."tenantId" = p_tenant_id
       AND request_location."companyId" = p_company_id
      JOIN public."Location" delivery_location
        ON delivery_location."id" = po."deliveryLocationId"
       AND delivery_location."tenantId" = p_tenant_id
       AND delivery_location."companyId" = p_company_id
     WHERE ai."id" = p_approval_instance_id
       AND ai."tenantId" = p_tenant_id
       AND ai."companyId" = p_company_id
       AND ai."documentType" = 'PurchaseOrderAmendment'
  ) THEN 'SHADOW_MATCH' ELSE 'SHADOW_NO_MATCH' END;
$function$;

CREATE FUNCTION approval_shadow.observe_wastage_report_v1(
  p_tenant_id UUID,
  p_company_id UUID,
  p_approval_instance_id UUID
)
RETURNS TEXT
LANGUAGE sql
STABLE
CALLED ON NULL INPUT
SECURITY INVOKER
SET search_path = pg_catalog
AS $function$
  SELECT CASE WHEN EXISTS (
    SELECT 1
      FROM public."ApprovalInstance" ai
      JOIN public."WastageReport" source
        ON source."id" = ai."documentId"
       AND source."tenantId" = p_tenant_id
       AND source."companyId" = p_company_id
      JOIN public."InventoryLocation" inventory_location
        ON inventory_location."id" = source."inventoryLocationId"
       AND inventory_location."tenantId" = p_tenant_id
       AND inventory_location."companyId" = p_company_id
      JOIN public."Location" location
        ON location."id" = inventory_location."locationId"
       AND location."tenantId" = p_tenant_id
       AND location."companyId" = p_company_id
     WHERE ai."id" = p_approval_instance_id
       AND ai."tenantId" = p_tenant_id
       AND ai."companyId" = p_company_id
       AND ai."documentType" = 'WastageReport'
  ) THEN 'SHADOW_MATCH' ELSE 'SHADOW_NO_MATCH' END;
$function$;

CREATE FUNCTION approval_shadow.observe_stock_adjustment_v1(
  p_tenant_id UUID,
  p_company_id UUID,
  p_approval_instance_id UUID
)
RETURNS TEXT
LANGUAGE sql
STABLE
CALLED ON NULL INPUT
SECURITY INVOKER
SET search_path = pg_catalog
AS $function$
  SELECT CASE WHEN EXISTS (
    SELECT 1
      FROM public."ApprovalInstance" ai
      JOIN public."StockAdjustment" source
        ON source."id" = ai."documentId"
       AND source."tenantId" = p_tenant_id
       AND source."companyId" = p_company_id
      JOIN public."InventoryLocation" inventory_location
        ON inventory_location."id" = source."inventoryLocationId"
       AND inventory_location."tenantId" = p_tenant_id
       AND inventory_location."companyId" = p_company_id
      JOIN public."Location" location
        ON location."id" = inventory_location."locationId"
       AND location."tenantId" = p_tenant_id
       AND location."companyId" = p_company_id
     WHERE ai."id" = p_approval_instance_id
       AND ai."tenantId" = p_tenant_id
       AND ai."companyId" = p_company_id
       AND ai."documentType" = 'StockAdjustment'
  ) THEN 'SHADOW_MATCH' ELSE 'SHADOW_NO_MATCH' END;
$function$;

CREATE FUNCTION approval_shadow.observe_finance_close_run_v1(
  p_tenant_id UUID,
  p_company_id UUID,
  p_approval_instance_id UUID
)
RETURNS TEXT
LANGUAGE sql
STABLE
CALLED ON NULL INPUT
SECURITY INVOKER
SET search_path = pg_catalog
AS $function$
  SELECT CASE WHEN EXISTS (
    SELECT 1
      FROM public."ApprovalInstance" ai
      JOIN public."FinanceCloseRun" source
        ON source."id" = ai."documentId"
       AND source."tenantId" = p_tenant_id
       AND source."companyId" = p_company_id
      JOIN public."Company" company
        ON company."id" = source."companyId"
       AND company."id" = p_company_id
       AND company."tenantId" = p_tenant_id
     WHERE ai."id" = p_approval_instance_id
       AND ai."tenantId" = p_tenant_id
       AND ai."companyId" = p_company_id
       AND ai."documentType" = 'FinanceCloseRun'
       AND pg_catalog.jsonb_typeof(source."configSnapshot" #> '{pendingSensitiveApproval}') = 'object'
       AND pg_catalog.jsonb_typeof(source."configSnapshot" #> '{pendingSensitiveApproval,approvalAction}') = 'string'
       AND pg_catalog.btrim(source."configSnapshot" #>> '{pendingSensitiveApproval,approvalAction}') <> ''
       AND pg_catalog.jsonb_typeof(source."configSnapshot" #> '{pendingSensitiveApproval,requestedByUserId}') = 'string'
       AND pg_catalog.btrim(source."configSnapshot" #>> '{pendingSensitiveApproval,requestedByUserId}') <> ''
       AND pg_catalog.jsonb_typeof(source."configSnapshot" #> '{pendingSensitiveApproval,requestedAt}') = 'string'
       AND pg_catalog.btrim(source."configSnapshot" #>> '{pendingSensitiveApproval,requestedAt}') <> ''
  ) THEN 'SHADOW_MATCH' ELSE 'SHADOW_NO_MATCH' END;
$function$;

CREATE FUNCTION approval_shadow.observe_budget_revision_v1(
  p_tenant_id UUID,
  p_company_id UUID,
  p_approval_instance_id UUID
)
RETURNS TEXT
LANGUAGE sql
STABLE
CALLED ON NULL INPUT
SECURITY INVOKER
SET search_path = pg_catalog
AS $function$
  SELECT CASE WHEN EXISTS (
    SELECT 1
      FROM public."ApprovalInstance" ai
      JOIN public."BudgetRevision" source
        ON source."id" = ai."documentId"
       AND source."tenantId" = p_tenant_id
       AND source."companyId" = p_company_id
      JOIN public."Budget" budget
        ON budget."id" = source."budgetId"
       AND budget."tenantId" = p_tenant_id
       AND budget."companyId" = p_company_id
     WHERE ai."id" = p_approval_instance_id
       AND ai."tenantId" = p_tenant_id
       AND ai."companyId" = p_company_id
       AND ai."documentType" = 'BudgetRevision'
       AND (
         budget."locationId" IS NULL
         OR EXISTS (
           SELECT 1
             FROM public."Location" location
            WHERE location."id" = budget."locationId"
              AND location."tenantId" = p_tenant_id
              AND location."companyId" = p_company_id
         )
       )
       AND NOT EXISTS (
         SELECT 1
           FROM public."BudgetLine" line
          WHERE line."budgetId" = budget."id"
            AND (
              line."tenantId" IS DISTINCT FROM p_tenant_id
              OR line."companyId" IS DISTINCT FROM p_company_id
              OR (
                line."locationId" IS NOT NULL
                AND NOT EXISTS (
                  SELECT 1
                    FROM public."Location" line_location
                   WHERE line_location."id" = line."locationId"
                     AND line_location."tenantId" = p_tenant_id
                     AND line_location."companyId" = p_company_id
                )
              )
            )
       )
  ) THEN 'SHADOW_MATCH' ELSE 'SHADOW_NO_MATCH' END;
$function$;

CREATE FUNCTION approval_shadow.observe_expense_request_v1(
  p_tenant_id UUID,
  p_company_id UUID,
  p_approval_instance_id UUID
)
RETURNS TEXT
LANGUAGE sql
STABLE
CALLED ON NULL INPUT
SECURITY INVOKER
SET search_path = pg_catalog
AS $function$
  SELECT CASE WHEN EXISTS (
    SELECT 1
      FROM public."ApprovalInstance" ai
      JOIN public."ExpenseRequest" source
        ON source."id" = ai."documentId"
       AND source."tenantId" = p_tenant_id
       AND source."companyId" = p_company_id
       AND source."approvalInstanceId" = ai."id"
      JOIN public."Location" location
        ON location."id" = source."locationId"
       AND location."tenantId" = p_tenant_id
       AND location."companyId" = p_company_id
     WHERE ai."id" = p_approval_instance_id
       AND ai."tenantId" = p_tenant_id
       AND ai."companyId" = p_company_id
       AND ai."documentType" = 'ExpenseRequest'
       AND NOT EXISTS (
         SELECT 1
           FROM public."ExpenseRequestLine" line
          WHERE line."expenseRequestId" = source."id"
            AND (
              line."tenantId" IS DISTINCT FROM p_tenant_id
              OR line."companyId" IS DISTINCT FROM p_company_id
            )
       )
       AND NOT EXISTS (
         SELECT 1
           FROM public."ExpenseRequestSourceLink" link
          WHERE link."expenseRequestId" = source."id"
            AND (
              link."tenantId" IS DISTINCT FROM p_tenant_id
              OR link."companyId" IS DISTINCT FROM p_company_id
              OR (
                link."expenseRequestLineId" IS NOT NULL
                AND NOT EXISTS (
                  SELECT 1
                    FROM public."ExpenseRequestLine" linked_line
                   WHERE linked_line."id" = link."expenseRequestLineId"
                     AND linked_line."expenseRequestId" = source."id"
                     AND linked_line."tenantId" = p_tenant_id
                     AND linked_line."companyId" = p_company_id
                )
              )
            )
       )
  ) THEN 'SHADOW_MATCH' ELSE 'SHADOW_NO_MATCH' END;
$function$;

CREATE FUNCTION approval_shadow.observe_cash_advance_request_v1(
  p_tenant_id UUID,
  p_company_id UUID,
  p_approval_instance_id UUID
)
RETURNS TEXT
LANGUAGE sql
STABLE
CALLED ON NULL INPUT
SECURITY INVOKER
SET search_path = pg_catalog
AS $function$
  SELECT CASE WHEN EXISTS (
    SELECT 1
      FROM public."ApprovalInstance" ai
      JOIN public."CashAdvanceRequest" source
        ON source."id" = ai."documentId"
       AND source."tenantId" = p_tenant_id
       AND source."companyId" = p_company_id
       AND source."approvalInstanceId" = ai."id"
      JOIN public."Location" location
        ON location."id" = source."locationId"
       AND location."tenantId" = p_tenant_id
       AND location."companyId" = p_company_id
     WHERE ai."id" = p_approval_instance_id
       AND ai."tenantId" = p_tenant_id
       AND ai."companyId" = p_company_id
       AND ai."documentType" = 'CashAdvanceRequest'
       AND (
         source."beneficiaryUserId" IS NULL
         OR EXISTS (
           SELECT 1 FROM public."User" beneficiary
            WHERE beneficiary."id" = source."beneficiaryUserId"
              AND beneficiary."tenantId" = p_tenant_id
         )
       )
       AND (
         source."expenseRequestId" IS NULL
         OR EXISTS (
           SELECT 1 FROM public."ExpenseRequest" expense
            WHERE expense."id" = source."expenseRequestId"
              AND expense."tenantId" = p_tenant_id
              AND expense."companyId" = p_company_id
         )
       )
       AND (
         source."paymentRequestId" IS NULL
         OR EXISTS (
           SELECT 1 FROM public."PaymentRequest" payment
            WHERE payment."id" = source."paymentRequestId"
              AND payment."tenantId" = p_tenant_id
              AND payment."companyId" = p_company_id
         )
       )
       AND (
         source."budgetCommitmentId" IS NULL
         OR EXISTS (
           SELECT 1 FROM public."BudgetCommitment" commitment
            WHERE commitment."id" = source."budgetCommitmentId"
              AND commitment."tenantId" = p_tenant_id
              AND commitment."companyId" = p_company_id
         )
       )
       AND (
         source."intendedBankAccountId" IS NULL
         OR EXISTS (
           SELECT 1 FROM public."BankAccount" bank_account
            WHERE bank_account."id" = source."intendedBankAccountId"
              AND bank_account."tenantId" = p_tenant_id
              AND bank_account."companyId" = p_company_id
         )
       )
  ) THEN 'SHADOW_MATCH' ELSE 'SHADOW_NO_MATCH' END;
$function$;

CREATE FUNCTION approval_shadow.observe_petty_cash_request_v1(
  p_tenant_id UUID,
  p_company_id UUID,
  p_approval_instance_id UUID
)
RETURNS TEXT
LANGUAGE sql
STABLE
CALLED ON NULL INPUT
SECURITY INVOKER
SET search_path = pg_catalog
AS $function$
  SELECT CASE WHEN EXISTS (
    SELECT 1
      FROM public."ApprovalInstance" ai
      JOIN public."PettyCashRequest" source
        ON source."id" = ai."documentId"
       AND source."tenantId" = p_tenant_id
       AND source."companyId" = p_company_id
       AND source."approvalInstanceId" = ai."id"
      JOIN public."PettyCashFund" fund
        ON fund."id" = source."pettyCashFundId"
       AND fund."tenantId" = p_tenant_id
       AND fund."companyId" = p_company_id
      JOIN public."Location" location
        ON location."id" = fund."locationId"
       AND location."tenantId" = p_tenant_id
       AND location."companyId" = p_company_id
     WHERE ai."id" = p_approval_instance_id
       AND ai."tenantId" = p_tenant_id
       AND ai."companyId" = p_company_id
       AND ai."documentType" = 'PettyCashRequest'
       AND (source."locationId" IS NULL OR source."locationId" = fund."locationId")
  ) THEN 'SHADOW_MATCH' ELSE 'SHADOW_NO_MATCH' END;
$function$;

CREATE FUNCTION approval_shadow.observe_payment_request_v1(
  p_tenant_id UUID,
  p_company_id UUID,
  p_approval_instance_id UUID
)
RETURNS TEXT
LANGUAGE sql
STABLE
CALLED ON NULL INPUT
SECURITY INVOKER
SET search_path = pg_catalog
AS $function$
  SELECT CASE WHEN EXISTS (
    SELECT 1
      FROM public."ApprovalInstance" ai
      JOIN public."PaymentRequest" source
        ON source."id" = ai."documentId"
       AND source."tenantId" = p_tenant_id
       AND source."companyId" = p_company_id
       AND source."approvalInstanceId" = ai."id"
      JOIN public."Location" location
        ON location."id" = source."locationId"
       AND location."tenantId" = p_tenant_id
       AND location."companyId" = p_company_id
     WHERE ai."id" = p_approval_instance_id
       AND ai."tenantId" = p_tenant_id
       AND ai."companyId" = p_company_id
       AND ai."documentType" = 'PaymentRequest'
       AND NOT EXISTS (
         SELECT 1
           FROM public."PaymentRequestLine" line
          WHERE line."paymentRequestId" = source."id"
            AND (
              line."tenantId" IS DISTINCT FROM p_tenant_id
              OR line."companyId" IS DISTINCT FROM p_company_id
              OR line."locationId" IS DISTINCT FROM source."locationId"
              OR NOT EXISTS (
                SELECT 1
                  FROM public."ApInvoice" invoice
                 WHERE invoice."id" = line."apInvoiceId"
                   AND invoice."tenantId" = p_tenant_id
                   AND invoice."companyId" = p_company_id
              )
            )
       )
  ) THEN 'SHADOW_MATCH' ELSE 'SHADOW_NO_MATCH' END;
$function$;

CREATE FUNCTION approval_shadow.observe_payment_release_v1(
  p_tenant_id UUID,
  p_company_id UUID,
  p_approval_instance_id UUID
)
RETURNS TEXT
LANGUAGE sql
STABLE
CALLED ON NULL INPUT
SECURITY INVOKER
SET search_path = pg_catalog
AS $function$
  SELECT CASE WHEN EXISTS (
    SELECT 1
      FROM public."ApprovalInstance" ai
      JOIN public."PaymentRelease" source
        ON source."id" = ai."documentId"
       AND source."tenantId" = p_tenant_id
       AND source."companyId" = p_company_id
       AND source."approvalInstanceId" = ai."id"
      JOIN public."PaymentRequest" payment_request
        ON payment_request."id" = source."paymentRequestId"
       AND payment_request."tenantId" = p_tenant_id
       AND payment_request."companyId" = p_company_id
      JOIN public."BankAccount" bank_account
        ON bank_account."id" = source."bankAccountId"
       AND bank_account."tenantId" = p_tenant_id
       AND bank_account."companyId" = p_company_id
      JOIN public."Location" location
        ON location."id" = source."locationId"
       AND location."tenantId" = p_tenant_id
       AND location."companyId" = p_company_id
       AND source."locationId" = payment_request."locationId"
     WHERE ai."id" = p_approval_instance_id
       AND ai."tenantId" = p_tenant_id
       AND ai."companyId" = p_company_id
       AND ai."documentType" = 'PaymentRelease'
       AND NOT EXISTS (
         SELECT 1
           FROM public."PaymentReleaseAllocation" allocation
          WHERE allocation."paymentReleaseId" = source."id"
            AND (
              allocation."tenantId" IS DISTINCT FROM p_tenant_id
              OR allocation."companyId" IS DISTINCT FROM p_company_id
              OR NOT EXISTS (
                SELECT 1
                  FROM public."PaymentRequestLine" request_line
                  JOIN public."ApInvoice" invoice
                    ON invoice."id" = allocation."apInvoiceId"
                   AND invoice."id" = request_line."apInvoiceId"
                   AND invoice."tenantId" = p_tenant_id
                   AND invoice."companyId" = p_company_id
                 WHERE request_line."id" = allocation."paymentRequestLineId"
                   AND request_line."paymentRequestId" = payment_request."id"
                   AND request_line."tenantId" = p_tenant_id
                   AND request_line."companyId" = p_company_id
              )
            )
       )
  ) THEN 'SHADOW_MATCH' ELSE 'SHADOW_NO_MATCH' END;
$function$;

CREATE FUNCTION approval_shadow.observe_employee_leave_request_v1(
  p_tenant_id UUID,
  p_company_id UUID,
  p_approval_instance_id UUID
)
RETURNS TEXT
LANGUAGE sql
STABLE
CALLED ON NULL INPUT
SECURITY INVOKER
SET search_path = pg_catalog
AS $function$
  SELECT CASE WHEN EXISTS (
    SELECT 1
      FROM public."ApprovalInstance" ai
      JOIN public."EmployeeLeaveRequest" source
        ON source."id" = ai."documentId"
       AND source."tenantId" = p_tenant_id
       AND source."companyId" = p_company_id
       AND source."approvalInstanceId" = ai."id"
      JOIN public."Employee" employee
        ON employee."id" = source."employeeId"
       AND employee."tenantId" = p_tenant_id
       AND employee."companyId" = p_company_id
     WHERE ai."id" = p_approval_instance_id
       AND ai."tenantId" = p_tenant_id
       AND ai."companyId" = p_company_id
       AND ai."documentType" = 'EmployeeLeaveRequest'
       AND (
         source."locationId" IS NULL
         OR EXISTS (
           SELECT 1 FROM public."Location" location
            WHERE location."id" = source."locationId"
              AND location."tenantId" = p_tenant_id
              AND location."companyId" = p_company_id
         )
       )
  ) THEN 'SHADOW_MATCH' ELSE 'SHADOW_NO_MATCH' END;
$function$;

CREATE FUNCTION approval_shadow.observe_employee_overtime_record_v1(
  p_tenant_id UUID,
  p_company_id UUID,
  p_approval_instance_id UUID
)
RETURNS TEXT
LANGUAGE sql
STABLE
CALLED ON NULL INPUT
SECURITY INVOKER
SET search_path = pg_catalog
AS $function$
  SELECT CASE WHEN EXISTS (
    SELECT 1
      FROM public."ApprovalInstance" ai
      JOIN public."EmployeeOvertimeRecord" source
        ON source."id" = ai."documentId"
       AND source."tenantId" = p_tenant_id
       AND source."companyId" = p_company_id
       AND source."approvalInstanceId" = ai."id"
      JOIN public."Employee" employee
        ON employee."id" = source."employeeId"
       AND employee."tenantId" = p_tenant_id
       AND employee."companyId" = p_company_id
     WHERE ai."id" = p_approval_instance_id
       AND ai."tenantId" = p_tenant_id
       AND ai."companyId" = p_company_id
       AND ai."documentType" = 'EmployeeOvertimeRecord'
       AND (
         source."locationId" IS NULL
         OR EXISTS (
           SELECT 1 FROM public."Location" location
            WHERE location."id" = source."locationId"
              AND location."tenantId" = p_tenant_id
              AND location."companyId" = p_company_id
         )
       )
  ) THEN 'SHADOW_MATCH' ELSE 'SHADOW_NO_MATCH' END;
$function$;

CREATE FUNCTION approval_shadow.observe_workforce_schedule_v1(
  p_tenant_id UUID,
  p_company_id UUID,
  p_approval_instance_id UUID
)
RETURNS TEXT
LANGUAGE sql
STABLE
CALLED ON NULL INPUT
SECURITY INVOKER
SET search_path = pg_catalog
AS $function$
  SELECT CASE WHEN EXISTS (
    SELECT 1
      FROM public."ApprovalInstance" ai
      JOIN public."WorkforceSchedule" source
        ON source."id" = ai."documentId"
       AND source."tenantId" = p_tenant_id
       AND source."companyId" = p_company_id
       AND source."approvalInstanceId" = ai."id"
      JOIN public."Location" location
        ON location."id" = source."locationId"
       AND location."tenantId" = p_tenant_id
       AND location."companyId" = p_company_id
     WHERE ai."id" = p_approval_instance_id
       AND ai."tenantId" = p_tenant_id
       AND ai."companyId" = p_company_id
       AND ai."documentType" = 'WorkforceSchedule'
       AND NOT EXISTS (
         SELECT 1
           FROM public."WorkforceScheduleLine" line
          WHERE line."workforceScheduleId" = source."id"
            AND (
              line."tenantId" IS DISTINCT FROM p_tenant_id
              OR line."companyId" IS DISTINCT FROM p_company_id
              OR line."locationId" IS DISTINCT FROM source."locationId"
              OR (
                line."employeeId" IS NOT NULL
                AND NOT EXISTS (
                  SELECT 1 FROM public."Employee" employee
                   WHERE employee."id" = line."employeeId"
                     AND employee."tenantId" = p_tenant_id
                     AND employee."companyId" = p_company_id
                )
              )
            )
       )
  ) THEN 'SHADOW_MATCH' ELSE 'SHADOW_NO_MATCH' END;
$function$;

CREATE FUNCTION approval_shadow.observe_attendance_import_batch_v1(
  p_tenant_id UUID,
  p_company_id UUID,
  p_approval_instance_id UUID
)
RETURNS TEXT
LANGUAGE sql
STABLE
CALLED ON NULL INPUT
SECURITY INVOKER
SET search_path = pg_catalog
AS $function$
  SELECT CASE WHEN EXISTS (
    SELECT 1
      FROM public."ApprovalInstance" ai
      JOIN public."AttendanceImportBatch" source
        ON source."id" = ai."documentId"
       AND source."tenantId" = p_tenant_id
       AND source."companyId" = p_company_id
       AND source."approvalInstanceId" = ai."id"
      JOIN public."Location" location
        ON location."id" = source."locationId"
       AND location."tenantId" = p_tenant_id
       AND location."companyId" = p_company_id
     WHERE ai."id" = p_approval_instance_id
       AND ai."tenantId" = p_tenant_id
       AND ai."companyId" = p_company_id
       AND ai."documentType" = 'AttendanceImportBatch'
       AND NOT EXISTS (
         SELECT 1
           FROM public."AttendanceImportLine" line
          WHERE line."attendanceImportBatchId" = source."id"
            AND (
              line."tenantId" IS DISTINCT FROM p_tenant_id
              OR line."companyId" IS DISTINCT FROM p_company_id
              OR line."locationId" IS DISTINCT FROM source."locationId"
              OR (
                line."employeeId" IS NOT NULL
                AND NOT EXISTS (
                  SELECT 1 FROM public."Employee" employee
                   WHERE employee."id" = line."employeeId"
                     AND employee."tenantId" = p_tenant_id
                     AND employee."companyId" = p_company_id
                )
              )
            )
       )
  ) THEN 'SHADOW_MATCH' ELSE 'SHADOW_NO_MATCH' END;
$function$;

REVOKE ALL ON FUNCTION approval_shadow.observe_purchase_request_v1(UUID, UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION approval_shadow.observe_quotation_recommendation_v1(UUID, UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION approval_shadow.observe_purchase_order_v1(UUID, UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION approval_shadow.observe_purchase_order_balance_closure_v1(UUID, UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION approval_shadow.observe_purchase_order_amendment_v1(UUID, UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION approval_shadow.observe_wastage_report_v1(UUID, UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION approval_shadow.observe_stock_adjustment_v1(UUID, UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION approval_shadow.observe_finance_close_run_v1(UUID, UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION approval_shadow.observe_budget_revision_v1(UUID, UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION approval_shadow.observe_expense_request_v1(UUID, UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION approval_shadow.observe_cash_advance_request_v1(UUID, UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION approval_shadow.observe_petty_cash_request_v1(UUID, UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION approval_shadow.observe_payment_request_v1(UUID, UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION approval_shadow.observe_payment_release_v1(UUID, UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION approval_shadow.observe_employee_leave_request_v1(UUID, UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION approval_shadow.observe_employee_overtime_record_v1(UUID, UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION approval_shadow.observe_workforce_schedule_v1(UUID, UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION approval_shadow.observe_attendance_import_batch_v1(UUID, UUID, UUID) FROM PUBLIC;

COMMIT;
