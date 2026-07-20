CREATE TABLE "UatEvidenceRecord" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "evidenceType" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "workflowArea" TEXT NOT NULL,
    "testerName" TEXT NOT NULL,
    "environment" TEXT NOT NULL,
    "evidenceReference" TEXT NOT NULL,
    "result" TEXT NOT NULL,
    "executedAt" TIMESTAMP(3) NOT NULL,
    "policyVersion" TEXT,
    "defectReference" TEXT,
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

    CONSTRAINT "UatEvidenceRecord_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "UatEvidenceRecord_type_check" CHECK ("evidenceType" IN ('SCENARIO_EXECUTION', 'DEFECT_DISPOSITION', 'POLICY_VERSION_TRACE', 'ACCEPTANCE_MATRIX', 'DEFAULT_REVISION_REGISTER')),
    CONSTRAINT "UatEvidenceRecord_result_check" CHECK ("result" IN ('PASS', 'FAIL', 'BLOCKED', 'WAIVED', 'RETEST_PASS')),
    CONSTRAINT "UatEvidenceRecord_status_check" CHECK ("verificationStatus" IN ('RECORDED', 'VERIFIED', 'REJECTED')),
    CONSTRAINT "UatEvidenceRecord_verification_fields_check" CHECK (
        ("verificationStatus" = 'VERIFIED' AND "verifiedAt" IS NOT NULL AND "verifiedByUserId" IS NOT NULL AND "rejectedAt" IS NULL AND "rejectedByUserId" IS NULL)
        OR ("verificationStatus" = 'REJECTED' AND "rejectedAt" IS NOT NULL AND "rejectedByUserId" IS NOT NULL AND "verifiedAt" IS NULL AND "verifiedByUserId" IS NULL)
        OR ("verificationStatus" = 'RECORDED' AND "verifiedAt" IS NULL AND "verifiedByUserId" IS NULL AND "rejectedAt" IS NULL AND "rejectedByUserId" IS NULL)
    )
);

CREATE INDEX "UatEvidenceRecord_tenantId_companyId_evidenceType_verificationStatus_idx" ON "UatEvidenceRecord"("tenantId", "companyId", "evidenceType", "verificationStatus");
CREATE INDEX "UatEvidenceRecord_tenantId_companyId_workflowArea_result_idx" ON "UatEvidenceRecord"("tenantId", "companyId", "workflowArea", "result");
CREATE INDEX "UatEvidenceRecord_tenantId_companyId_executedAt_idx" ON "UatEvidenceRecord"("tenantId", "companyId", "executedAt");

ALTER TABLE "UatEvidenceRecord" ADD CONSTRAINT "UatEvidenceRecord_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "UatEvidenceRecord" ADD CONSTRAINT "UatEvidenceRecord_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "UatEvidenceRecord" ADD CONSTRAINT "UatEvidenceRecord_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "UatEvidenceRecord" ADD CONSTRAINT "UatEvidenceRecord_verifiedByUserId_fkey" FOREIGN KEY ("verifiedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "UatEvidenceRecord" ADD CONSTRAINT "UatEvidenceRecord_rejectedByUserId_fkey" FOREIGN KEY ("rejectedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
