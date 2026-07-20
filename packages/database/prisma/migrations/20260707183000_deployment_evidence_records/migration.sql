CREATE TABLE "DeploymentEvidenceRecord" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "evidenceType" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "evidenceReference" TEXT NOT NULL,
    "environment" TEXT NOT NULL,
    "performedAt" TIMESTAMP(3) NOT NULL,
    "performedBy" TEXT NOT NULL,
    "verificationStatus" TEXT NOT NULL DEFAULT 'RECORDED',
    "verifiedAt" TIMESTAMP(3),
    "verifiedByUserId" UUID,
    "rejectedAt" TIMESTAMP(3),
    "rejectedByUserId" UUID,
    "notes" TEXT,
    "sourceDecisionId" TEXT NOT NULL DEFAULT 'DEC-0036',
    "createdByUserId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeploymentEvidenceRecord_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "DeploymentEvidenceRecord_type_check" CHECK ("evidenceType" IN ('MIGRATION', 'BACKUP', 'RESTORE_REHEARSAL', 'ROLLBACK_PLAN', 'SMOKE_TEST', 'MONITORING_HYPERCARE')),
    CONSTRAINT "DeploymentEvidenceRecord_status_check" CHECK ("verificationStatus" IN ('RECORDED', 'VERIFIED', 'REJECTED')),
    CONSTRAINT "DeploymentEvidenceRecord_verification_fields_check" CHECK (
        ("verificationStatus" = 'VERIFIED' AND "verifiedAt" IS NOT NULL AND "verifiedByUserId" IS NOT NULL AND "rejectedAt" IS NULL AND "rejectedByUserId" IS NULL)
        OR ("verificationStatus" = 'REJECTED' AND "rejectedAt" IS NOT NULL AND "rejectedByUserId" IS NOT NULL AND "verifiedAt" IS NULL AND "verifiedByUserId" IS NULL)
        OR ("verificationStatus" = 'RECORDED' AND "verifiedAt" IS NULL AND "verifiedByUserId" IS NULL AND "rejectedAt" IS NULL AND "rejectedByUserId" IS NULL)
    )
);

CREATE INDEX "DeploymentEvidenceRecord_tenantId_companyId_evidenceType_verificationStatus_idx" ON "DeploymentEvidenceRecord"("tenantId", "companyId", "evidenceType", "verificationStatus");
CREATE INDEX "DeploymentEvidenceRecord_tenantId_companyId_performedAt_idx" ON "DeploymentEvidenceRecord"("tenantId", "companyId", "performedAt");

ALTER TABLE "DeploymentEvidenceRecord" ADD CONSTRAINT "DeploymentEvidenceRecord_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DeploymentEvidenceRecord" ADD CONSTRAINT "DeploymentEvidenceRecord_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DeploymentEvidenceRecord" ADD CONSTRAINT "DeploymentEvidenceRecord_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DeploymentEvidenceRecord" ADD CONSTRAINT "DeploymentEvidenceRecord_verifiedByUserId_fkey" FOREIGN KEY ("verifiedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DeploymentEvidenceRecord" ADD CONSTRAINT "DeploymentEvidenceRecord_rejectedByUserId_fkey" FOREIGN KEY ("rejectedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
