CREATE TABLE "ReleaseReadinessGate" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "gateKey" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "ownerRole" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "requiredByPolicy" BOOLEAN NOT NULL DEFAULT true,
    "evidenceReference" TEXT,
    "decisionNote" TEXT,
    "blockerSummary" TEXT,
    "targetDate" TIMESTAMP(3),
    "signedOffAt" TIMESTAMP(3),
    "signedOffByUserId" UUID,
    "sourceDecisionId" TEXT NOT NULL DEFAULT 'DEC-0036',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReleaseReadinessGate_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ReleaseReadinessGate_companyId_gateKey_key" ON "ReleaseReadinessGate"("companyId", "gateKey");
CREATE INDEX "ReleaseReadinessGate_tenantId_companyId_category_status_idx" ON "ReleaseReadinessGate"("tenantId", "companyId", "category", "status");

ALTER TABLE "ReleaseReadinessGate" ADD CONSTRAINT "ReleaseReadinessGate_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReleaseReadinessGate" ADD CONSTRAINT "ReleaseReadinessGate_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
