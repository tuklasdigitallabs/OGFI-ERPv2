CREATE TYPE "ExpenseRequestStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'AWAITING_APPROVAL', 'RETURNED_FOR_REVISION', 'APPROVED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'REJECTED', 'ON_HOLD', 'REVERSED', 'VOIDED');
CREATE TYPE "ExpenseRequestUrgency" AS ENUM ('NORMAL', 'URGENT', 'EMERGENCY');
CREATE TYPE "ExpenseBudgetStatus" AS ENUM ('BUDGETED', 'PARTIALLY_BUDGETED', 'UNBUDGETED', 'OVER_BUDGET', 'NOT_APPLICABLE');
CREATE TYPE "ExpenseRequestSourceType" AS ENUM ('AP_INVOICE', 'AP_INVOICE_LINE', 'PAYMENT_REQUEST', 'PAYMENT_REQUEST_LINE', 'PURCHASE_REQUEST', 'PURCHASE_ORDER', 'GOODS_RECEIPT', 'PROJECT', 'MANUAL');

CREATE TABLE "ExpenseRequest" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "publicReference" TEXT NOT NULL,
    "currencyCode" TEXT NOT NULL DEFAULT 'PHP',
    "totalRequestedAmount" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "settledAmount" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "status" "ExpenseRequestStatus" NOT NULL DEFAULT 'DRAFT',
    "urgency" "ExpenseRequestUrgency" NOT NULL DEFAULT 'NORMAL',
    "budgetStatus" "ExpenseBudgetStatus" NOT NULL DEFAULT 'NOT_APPLICABLE',
    "requestDate" TIMESTAMP(3) NOT NULL,
    "requiredByDate" TIMESTAMP(3),
    "title" TEXT NOT NULL,
    "requestReason" TEXT NOT NULL,
    "categoryCode" TEXT NOT NULL,
    "expenseType" TEXT NOT NULL DEFAULT 'OPERATING',
    "branchImpactFlag" BOOLEAN NOT NULL DEFAULT false,
    "supplierId" UUID,
    "brandId" UUID,
    "locationId" UUID NOT NULL,
    "departmentId" UUID,
    "costCenterId" UUID,
    "projectId" UUID,
    "requestedByUserId" UUID NOT NULL,
    "submittedByUserId" UUID,
    "approvedByUserId" UUID,
    "returnedByUserId" UUID,
    "rejectedByUserId" UUID,
    "cancelledByUserId" UUID,
    "completedByUserId" UUID,
    "reversedByUserId" UUID,
    "approvalInstanceId" UUID,
    "submittedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "returnedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "reversedAt" TIMESTAMP(3),
    "returnReason" TEXT,
    "rejectionReason" TEXT,
    "cancellationReason" TEXT,
    "completionNotes" TEXT,
    "reversalReason" TEXT,
    "evidenceReference" TEXT,
    "budgetSnapshot" JSONB,
    "idempotencyKey" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExpenseRequest_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ExpenseRequest_php_only_check" CHECK ("currencyCode" = 'PHP'),
    CONSTRAINT "ExpenseRequest_amount_check" CHECK ("totalRequestedAmount" >= 0 AND "settledAmount" >= 0 AND "settledAmount" <= "totalRequestedAmount"),
    CONSTRAINT "ExpenseRequest_version_check" CHECK ("version" >= 1),
    CONSTRAINT "ExpenseRequest_submitted_at_check" CHECK ("status" NOT IN ('SUBMITTED', 'AWAITING_APPROVAL') OR "submittedAt" IS NOT NULL),
    CONSTRAINT "ExpenseRequest_approved_actor_check" CHECK ("approvedByUserId" IS NULL OR "approvedByUserId" <> "requestedByUserId"),
    CONSTRAINT "ExpenseRequest_approved_at_check" CHECK ("status" NOT IN ('APPROVED', 'IN_PROGRESS', 'COMPLETED') OR ("approvedByUserId" IS NOT NULL AND "approvedAt" IS NOT NULL)),
    CONSTRAINT "ExpenseRequest_return_reason_check" CHECK ("status" <> 'RETURNED_FOR_REVISION' OR ("returnedByUserId" IS NOT NULL AND "returnedAt" IS NOT NULL AND "returnReason" IS NOT NULL)),
    CONSTRAINT "ExpenseRequest_reject_reason_check" CHECK ("status" <> 'REJECTED' OR ("rejectedByUserId" IS NOT NULL AND "rejectedAt" IS NOT NULL AND "rejectionReason" IS NOT NULL)),
    CONSTRAINT "ExpenseRequest_cancel_reason_check" CHECK ("status" <> 'CANCELLED' OR ("cancelledByUserId" IS NOT NULL AND "cancelledAt" IS NOT NULL AND "cancellationReason" IS NOT NULL)),
    CONSTRAINT "ExpenseRequest_reverse_reason_check" CHECK ("status" <> 'REVERSED' OR ("reversedByUserId" IS NOT NULL AND "reversedAt" IS NOT NULL AND "reversalReason" IS NOT NULL))
);

CREATE TABLE "ExpenseRequestLine" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "expenseRequestId" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "lineNumber" INTEGER NOT NULL,
    "lineDate" TIMESTAMP(3) NOT NULL,
    "description" TEXT NOT NULL,
    "categoryCode" TEXT NOT NULL,
    "requestedAmountPhp" DECIMAL(18,6) NOT NULL,
    "taxAmountPhp" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "discountAmountPhp" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "lineTotalPhp" DECIMAL(18,6) NOT NULL,
    "budgetLineId" UUID,
    "brandId" UUID,
    "locationId" UUID,
    "departmentId" UUID,
    "costCenterId" UUID,
    "projectId" UUID,
    "evidenceReference" TEXT,
    "idempotencyKey" TEXT,
    "createdByUserId" UUID NOT NULL,
    "updatedByUserId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExpenseRequestLine_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ExpenseRequestLine_line_number_check" CHECK ("lineNumber" >= 1),
    CONSTRAINT "ExpenseRequestLine_amount_check" CHECK ("requestedAmountPhp" > 0 AND "taxAmountPhp" >= 0 AND "discountAmountPhp" >= 0 AND "lineTotalPhp" > 0)
);

CREATE TABLE "ExpenseRequestSourceLink" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "expenseRequestId" UUID NOT NULL,
    "expenseRequestLineId" UUID,
    "sourceDocumentType" "ExpenseRequestSourceType" NOT NULL,
    "sourceDocumentId" TEXT NOT NULL,
    "sourceDocumentLineId" TEXT,
    "sourceEventKey" TEXT NOT NULL,
    "sourceAmountSnapshotPhp" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "remainingAmountSnapshotPhp" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "sourceDocumentSnapshot" JSONB,
    "createdByUserId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExpenseRequestSourceLink_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ExpenseRequestSourceLink_amount_check" CHECK ("sourceAmountSnapshotPhp" >= 0 AND "remainingAmountSnapshotPhp" >= 0)
);

CREATE UNIQUE INDEX "ExpenseRequest_companyId_publicReference_key" ON "ExpenseRequest"("companyId", "publicReference");
CREATE UNIQUE INDEX "ExpenseRequest_tenantId_companyId_idempotencyKey_key" ON "ExpenseRequest"("tenantId", "companyId", "idempotencyKey");
CREATE UNIQUE INDEX "ExpenseRequest_approvalInstanceId_key" ON "ExpenseRequest"("approvalInstanceId");
CREATE INDEX "ExpenseRequest_tenantId_companyId_status_createdAt_idx" ON "ExpenseRequest"("tenantId", "companyId", "status", "createdAt");
CREATE INDEX "ExpenseRequest_tenantId_companyId_locationId_status_idx" ON "ExpenseRequest"("tenantId", "companyId", "locationId", "status");
CREATE INDEX "ExpenseRequest_tenantId_companyId_supplierId_status_idx" ON "ExpenseRequest"("tenantId", "companyId", "supplierId", "status");
CREATE INDEX "ExpenseRequest_tenantId_companyId_departmentId_status_idx" ON "ExpenseRequest"("tenantId", "companyId", "departmentId", "status");
CREATE INDEX "ExpenseRequest_tenantId_companyId_costCenterId_status_idx" ON "ExpenseRequest"("tenantId", "companyId", "costCenterId", "status");
CREATE INDEX "ExpenseRequest_tenantId_companyId_projectId_status_idx" ON "ExpenseRequest"("tenantId", "companyId", "projectId", "status");
CREATE INDEX "ExpenseRequest_requestedByUserId_status_idx" ON "ExpenseRequest"("requestedByUserId", "status");

CREATE UNIQUE INDEX "ExpenseRequestLine_expenseRequestId_lineNumber_key" ON "ExpenseRequestLine"("expenseRequestId", "lineNumber");
CREATE UNIQUE INDEX "ExpenseRequestLine_tenantId_companyId_idempotencyKey_key" ON "ExpenseRequestLine"("tenantId", "companyId", "idempotencyKey");
CREATE INDEX "ExpenseRequestLine_tenantId_companyId_expenseRequestId_idx" ON "ExpenseRequestLine"("tenantId", "companyId", "expenseRequestId");
CREATE INDEX "ExpenseRequestLine_tenantId_companyId_budgetLineId_idx" ON "ExpenseRequestLine"("tenantId", "companyId", "budgetLineId");
CREATE INDEX "ExpenseRequestLine_tenantId_companyId_locationId_idx" ON "ExpenseRequestLine"("tenantId", "companyId", "locationId");

CREATE UNIQUE INDEX "ExpenseRequestSourceLink_source_event_key" ON "ExpenseRequestSourceLink"("tenantId", "companyId", "sourceDocumentType", "sourceDocumentId", "sourceEventKey");
CREATE INDEX "ExpenseRequestSourceLink_request_idx" ON "ExpenseRequestSourceLink"("tenantId", "companyId", "expenseRequestId");
CREATE INDEX "ExpenseRequestSourceLink_request_line_idx" ON "ExpenseRequestSourceLink"("tenantId", "companyId", "expenseRequestLineId");
CREATE INDEX "ExpenseRequestSourceLink_source_document_idx" ON "ExpenseRequestSourceLink"("tenantId", "companyId", "sourceDocumentType", "sourceDocumentId");

ALTER TABLE "ExpenseRequest" ADD CONSTRAINT "ExpenseRequest_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ExpenseRequest" ADD CONSTRAINT "ExpenseRequest_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ExpenseRequest" ADD CONSTRAINT "ExpenseRequest_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ExpenseRequest" ADD CONSTRAINT "ExpenseRequest_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ExpenseRequest" ADD CONSTRAINT "ExpenseRequest_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ExpenseRequest" ADD CONSTRAINT "ExpenseRequest_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ExpenseRequest" ADD CONSTRAINT "ExpenseRequest_costCenterId_fkey" FOREIGN KEY ("costCenterId") REFERENCES "CostCenter"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ExpenseRequest" ADD CONSTRAINT "ExpenseRequest_requestedByUserId_fkey" FOREIGN KEY ("requestedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ExpenseRequest" ADD CONSTRAINT "ExpenseRequest_submittedByUserId_fkey" FOREIGN KEY ("submittedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ExpenseRequest" ADD CONSTRAINT "ExpenseRequest_approvedByUserId_fkey" FOREIGN KEY ("approvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ExpenseRequest" ADD CONSTRAINT "ExpenseRequest_returnedByUserId_fkey" FOREIGN KEY ("returnedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ExpenseRequest" ADD CONSTRAINT "ExpenseRequest_rejectedByUserId_fkey" FOREIGN KEY ("rejectedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ExpenseRequest" ADD CONSTRAINT "ExpenseRequest_cancelledByUserId_fkey" FOREIGN KEY ("cancelledByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ExpenseRequest" ADD CONSTRAINT "ExpenseRequest_completedByUserId_fkey" FOREIGN KEY ("completedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ExpenseRequest" ADD CONSTRAINT "ExpenseRequest_reversedByUserId_fkey" FOREIGN KEY ("reversedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ExpenseRequest" ADD CONSTRAINT "ExpenseRequest_approvalInstanceId_fkey" FOREIGN KEY ("approvalInstanceId") REFERENCES "ApprovalInstance"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ExpenseRequestLine" ADD CONSTRAINT "ExpenseRequestLine_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ExpenseRequestLine" ADD CONSTRAINT "ExpenseRequestLine_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ExpenseRequestLine" ADD CONSTRAINT "ExpenseRequestLine_expenseRequestId_fkey" FOREIGN KEY ("expenseRequestId") REFERENCES "ExpenseRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ExpenseRequestLine" ADD CONSTRAINT "ExpenseRequestLine_budgetLineId_fkey" FOREIGN KEY ("budgetLineId") REFERENCES "BudgetLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ExpenseRequestLine" ADD CONSTRAINT "ExpenseRequestLine_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ExpenseRequestLine" ADD CONSTRAINT "ExpenseRequestLine_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ExpenseRequestLine" ADD CONSTRAINT "ExpenseRequestLine_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ExpenseRequestLine" ADD CONSTRAINT "ExpenseRequestLine_costCenterId_fkey" FOREIGN KEY ("costCenterId") REFERENCES "CostCenter"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ExpenseRequestLine" ADD CONSTRAINT "ExpenseRequestLine_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ExpenseRequestLine" ADD CONSTRAINT "ExpenseRequestLine_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ExpenseRequestSourceLink" ADD CONSTRAINT "ExpenseRequestSourceLink_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ExpenseRequestSourceLink" ADD CONSTRAINT "ExpenseRequestSourceLink_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ExpenseRequestSourceLink" ADD CONSTRAINT "ExpenseRequestSourceLink_expenseRequestId_fkey" FOREIGN KEY ("expenseRequestId") REFERENCES "ExpenseRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ExpenseRequestSourceLink" ADD CONSTRAINT "ExpenseRequestSourceLink_expenseRequestLineId_fkey" FOREIGN KEY ("expenseRequestLineId") REFERENCES "ExpenseRequestLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ExpenseRequestSourceLink" ADD CONSTRAINT "ExpenseRequestSourceLink_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "Permission" ("id", "code", "module", "action")
VALUES
  ('00000000-0000-4000-8000-000000000153', 'finance.expense_request.view', 'finance', 'expense_request.view'),
  ('00000000-0000-4000-8000-000000000154', 'finance.expense_request.create', 'finance', 'expense_request.create'),
  ('00000000-0000-4000-8000-000000000155', 'finance.expense_request.submit', 'finance', 'expense_request.submit'),
  ('00000000-0000-4000-8000-000000000156', 'finance.expense_request.approve', 'finance', 'expense_request.approve'),
  ('00000000-0000-4000-8000-000000000157', 'finance.expense_request.complete', 'finance', 'expense_request.complete')
ON CONFLICT ("code") DO UPDATE SET
  "module" = EXCLUDED."module",
  "action" = EXCLUDED."action";

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT r."id", p."id"
FROM "Role" r
JOIN "Permission" p
  ON (
    r."code" = 'CONFIGURED_ADMIN'
    AND p."code" IN (
      'finance.expense_request.view',
      'finance.expense_request.create',
      'finance.expense_request.submit',
      'finance.expense_request.approve',
      'finance.expense_request.complete'
    )
  )
  OR (
    r."code" = 'CONFIGURED_APPROVER'
    AND p."code" IN (
      'finance.expense_request.view',
      'finance.expense_request.approve'
    )
  )
  OR (
    r."code" = 'CONFIGURED_REQUESTER'
    AND p."code" IN (
      'finance.expense_request.view',
      'finance.expense_request.create',
      'finance.expense_request.submit'
    )
  )
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
