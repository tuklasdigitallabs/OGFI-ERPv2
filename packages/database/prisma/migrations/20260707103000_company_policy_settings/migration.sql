CREATE TABLE "CompanyPolicySetting" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "defaultValue" JSONB NOT NULL,
    "valueType" TEXT NOT NULL,
    "unit" TEXT,
    "options" JSONB,
    "sourceDecisionId" TEXT NOT NULL DEFAULT 'DEC-0036',
    "isDefault" BOOLEAN NOT NULL DEFAULT true,
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "updatedByUserId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyPolicySetting_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CompanyPolicySetting_companyId_key_key" ON "CompanyPolicySetting"("companyId", "key");
CREATE INDEX "CompanyPolicySetting_tenantId_companyId_category_status_idx" ON "CompanyPolicySetting"("tenantId", "companyId", "category", "status");

ALTER TABLE "CompanyPolicySetting" ADD CONSTRAINT "CompanyPolicySetting_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CompanyPolicySetting" ADD CONSTRAINT "CompanyPolicySetting_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
