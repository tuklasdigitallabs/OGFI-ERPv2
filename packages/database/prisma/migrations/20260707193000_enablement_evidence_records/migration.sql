CREATE TABLE "EnablementEvidenceRecord" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "evidenceType" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "audienceRole" TEXT NOT NULL,
    "evidenceReference" TEXT NOT NULL,
    "ownerName" TEXT NOT NULL,
    "completedAt" TIMESTAMP(3) NOT NULL,
    "knownLimitAcknowledged" BOOLEAN NOT NULL DEFAULT false,
    "supportRouteConfirmed" BOOLEAN NOT NULL DEFAULT false,
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

    CONSTRAINT "EnablementEvidenceRecord_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "EnablementEvidenceRecord_type_check" CHECK ("evidenceType" IN ('TRAINING_SIGNOFF', 'KNOWN_LIMIT_ACKNOWLEDGEMENT', 'SUPPORT_ROUTE_CONFIRMATION', 'KB_REVIEW', 'RELEASE_NOTES_REVIEW', 'TRAINING_IMPACT_ASSESSMENT')),
    CONSTRAINT "EnablementEvidenceRecord_status_check" CHECK ("verificationStatus" IN ('RECORDED', 'VERIFIED', 'REJECTED')),
    CONSTRAINT "EnablementEvidenceRecord_verification_fields_check" CHECK (
        ("verificationStatus" = 'VERIFIED' AND "verifiedAt" IS NOT NULL AND "verifiedByUserId" IS NOT NULL AND "rejectedAt" IS NULL AND "rejectedByUserId" IS NULL)
        OR ("verificationStatus" = 'REJECTED' AND "rejectedAt" IS NOT NULL AND "rejectedByUserId" IS NOT NULL AND "verifiedAt" IS NULL AND "verifiedByUserId" IS NULL)
        OR ("verificationStatus" = 'RECORDED' AND "verifiedAt" IS NULL AND "verifiedByUserId" IS NULL AND "rejectedAt" IS NULL AND "rejectedByUserId" IS NULL)
    )
);

CREATE INDEX "EnablementEvidenceRecord_tenantId_companyId_evidenceType_verificationStatus_idx" ON "EnablementEvidenceRecord"("tenantId", "companyId", "evidenceType", "verificationStatus");
CREATE INDEX "EnablementEvidenceRecord_tenantId_companyId_completedAt_idx" ON "EnablementEvidenceRecord"("tenantId", "companyId", "completedAt");

ALTER TABLE "EnablementEvidenceRecord" ADD CONSTRAINT "EnablementEvidenceRecord_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EnablementEvidenceRecord" ADD CONSTRAINT "EnablementEvidenceRecord_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EnablementEvidenceRecord" ADD CONSTRAINT "EnablementEvidenceRecord_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EnablementEvidenceRecord" ADD CONSTRAINT "EnablementEvidenceRecord_verifiedByUserId_fkey" FOREIGN KEY ("verifiedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EnablementEvidenceRecord" ADD CONSTRAINT "EnablementEvidenceRecord_rejectedByUserId_fkey" FOREIGN KEY ("rejectedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
