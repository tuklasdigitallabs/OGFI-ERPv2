CREATE TABLE "PrivilegedMfaEnrollment" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL,
  "companyId" UUID NOT NULL,
  "targetUserId" UUID NOT NULL,
  "providerName" TEXT NOT NULL,
  "providerSubject" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PENDING_VERIFICATION',
  "evidenceReference" TEXT NOT NULL,
  "attestationNote" TEXT NOT NULL,
  "attestedByUserId" UUID NOT NULL,
  "attestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "verifiedByUserId" UUID,
  "verificationNote" TEXT,
  "verifiedAt" TIMESTAMP(3),
  "revokedByUserId" UUID,
  "revocationReason" TEXT,
  "revokedAt" TIMESTAMP(3),
  "sourceDecisionId" TEXT NOT NULL DEFAULT 'DEC-0036',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "PrivilegedMfaEnrollment_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "PrivilegedMfaEnrollment"
  ADD CONSTRAINT "PrivilegedMfaEnrollment_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PrivilegedMfaEnrollment"
  ADD CONSTRAINT "PrivilegedMfaEnrollment_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PrivilegedMfaEnrollment"
  ADD CONSTRAINT "PrivilegedMfaEnrollment_targetUserId_fkey"
  FOREIGN KEY ("targetUserId") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PrivilegedMfaEnrollment"
  ADD CONSTRAINT "PrivilegedMfaEnrollment_attestedByUserId_fkey"
  FOREIGN KEY ("attestedByUserId") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PrivilegedMfaEnrollment"
  ADD CONSTRAINT "PrivilegedMfaEnrollment_verifiedByUserId_fkey"
  FOREIGN KEY ("verifiedByUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PrivilegedMfaEnrollment"
  ADD CONSTRAINT "PrivilegedMfaEnrollment_revokedByUserId_fkey"
  FOREIGN KEY ("revokedByUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE UNIQUE INDEX "PrivilegedMfaEnrollment_companyId_targetUserId_providerName_key"
  ON "PrivilegedMfaEnrollment"("companyId", "targetUserId", "providerName");

CREATE INDEX "PrivilegedMfaEnrollment_tenantId_companyId_status_idx"
  ON "PrivilegedMfaEnrollment"("tenantId", "companyId", "status");

CREATE INDEX "PrivilegedMfaEnrollment_targetUserId_status_idx"
  ON "PrivilegedMfaEnrollment"("targetUserId", "status");
