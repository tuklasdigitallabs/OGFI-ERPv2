CREATE TABLE "PurchaseOrderAmendment" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "purchaseOrderId" UUID NOT NULL,
    "requestedByUserId" UUID NOT NULL,
    "approvedByUserId" UUID,
    "status" TEXT NOT NULL DEFAULT 'PENDING_APPROVAL',
    "reason" TEXT NOT NULL,
    "supplierNoticeReference" TEXT,
    "supplierNoticeUnavailableReason" TEXT,
    "beforeSnapshot" JSONB NOT NULL,
    "proposedSnapshot" JSONB NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "appliedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PurchaseOrderAmendment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PurchaseOrderAmendment_tenantId_companyId_status_requestedAt_idx" ON "PurchaseOrderAmendment"("tenantId", "companyId", "status", "requestedAt");
CREATE INDEX "PurchaseOrderAmendment_purchaseOrderId_status_idx" ON "PurchaseOrderAmendment"("purchaseOrderId", "status");
CREATE INDEX "PurchaseOrderAmendment_requestedByUserId_idx" ON "PurchaseOrderAmendment"("requestedByUserId");
CREATE INDEX "PurchaseOrderAmendment_approvedByUserId_idx" ON "PurchaseOrderAmendment"("approvedByUserId");

ALTER TABLE "PurchaseOrderAmendment" ADD CONSTRAINT "PurchaseOrderAmendment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PurchaseOrderAmendment" ADD CONSTRAINT "PurchaseOrderAmendment_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PurchaseOrderAmendment" ADD CONSTRAINT "PurchaseOrderAmendment_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PurchaseOrderAmendment" ADD CONSTRAINT "PurchaseOrderAmendment_requestedByUserId_fkey" FOREIGN KEY ("requestedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PurchaseOrderAmendment" ADD CONSTRAINT "PurchaseOrderAmendment_approvedByUserId_fkey" FOREIGN KEY ("approvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "Permission" (
    "id",
    "tenantId",
    "code",
    "module",
    "action",
    "description"
)
SELECT
    '00000000-0000-4000-8000-000000000098'::uuid,
    t."id",
    'purchasing.purchase_order.amend',
    'purchasing',
    'purchase_order.amend',
    'Request controlled amendments for issued, unreceived purchase orders'
FROM "Tenant" t
WHERE NOT EXISTS (
    SELECT 1
    FROM "Permission" p
    WHERE p."tenantId" = t."id"
      AND p."code" = 'purchasing.purchase_order.amend'
);

INSERT INTO "ApprovalRule" (
    "id",
    "tenantId",
    "companyId",
    "transactionType",
    "priority",
    "isActive",
    "scopeFilters",
    "createdAt"
)
SELECT
    gen_random_uuid(),
    c."tenantId",
    c."id",
    'PurchaseOrderAmendment',
    1,
    true,
    '{"appliesTo":"issued_unreceived_po_amendment"}'::jsonb,
    CURRENT_TIMESTAMP
FROM "Company" c
WHERE NOT EXISTS (
    SELECT 1
    FROM "ApprovalRule" ar
    WHERE ar."tenantId" = c."tenantId"
      AND ar."companyId" = c."id"
      AND ar."transactionType" = 'PurchaseOrderAmendment'
);

INSERT INTO "ApprovalRuleStep" (
    "id",
    "approvalRuleId",
    "stepOrder",
    "approverType",
    "roleId",
    "userId",
    "required"
)
SELECT
    gen_random_uuid(),
    ar."id",
    1,
    'ROLE',
    r."id",
    NULL,
    true
FROM "ApprovalRule" ar
JOIN "Role" r
  ON r."tenantId" = ar."tenantId"
 AND r."code" = 'CONFIGURED_APPROVER'
WHERE ar."transactionType" = 'PurchaseOrderAmendment'
  AND NOT EXISTS (
    SELECT 1
    FROM "ApprovalRuleStep" ars
    WHERE ars."approvalRuleId" = ar."id"
      AND ars."stepOrder" = 1
  );

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT r."id", p."id"
FROM "Role" r
JOIN "Permission" p
  ON p."tenantId" = r."tenantId"
 AND p."code" = 'purchasing.purchase_order.amend'
WHERE r."code" = 'CONFIGURED_ADMIN'
  AND NOT EXISTS (
    SELECT 1
    FROM "RolePermission" rp
    WHERE rp."roleId" = r."id"
      AND rp."permissionId" = p."id"
  );
