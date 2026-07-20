CREATE TABLE "BreakGlassAccessGrant" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL,
  "companyId" UUID NOT NULL,
  "targetUserId" UUID NOT NULL,
  "locationId" UUID NOT NULL,
  "accessLevel" "AccessLevel" NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING_REVIEW',
  "reason" TEXT NOT NULL,
  "evidenceReference" TEXT NOT NULL,
  "requestedUntil" TIMESTAMP(3) NOT NULL,
  "assignmentId" UUID,
  "requestedByUserId" UUID NOT NULL,
  "approvedByUserId" UUID,
  "approvalReason" TEXT,
  "approvedAt" TIMESTAMP(3),
  "revokedByUserId" UUID,
  "revocationReason" TEXT,
  "revokedAt" TIMESTAMP(3),
  "postReviewedByUserId" UUID,
  "postReviewOutcome" TEXT,
  "postReviewReason" TEXT,
  "postReviewEvidenceReference" TEXT,
  "postReviewedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "BreakGlassAccessGrant_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "BreakGlassAccessGrant"
  ADD CONSTRAINT "BreakGlassAccessGrant_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "BreakGlassAccessGrant"
  ADD CONSTRAINT "BreakGlassAccessGrant_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "BreakGlassAccessGrant"
  ADD CONSTRAINT "BreakGlassAccessGrant_targetUserId_fkey"
  FOREIGN KEY ("targetUserId") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "BreakGlassAccessGrant"
  ADD CONSTRAINT "BreakGlassAccessGrant_locationId_fkey"
  FOREIGN KEY ("locationId") REFERENCES "Location"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "BreakGlassAccessGrant"
  ADD CONSTRAINT "BreakGlassAccessGrant_requestedByUserId_fkey"
  FOREIGN KEY ("requestedByUserId") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "BreakGlassAccessGrant"
  ADD CONSTRAINT "BreakGlassAccessGrant_approvedByUserId_fkey"
  FOREIGN KEY ("approvedByUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "BreakGlassAccessGrant"
  ADD CONSTRAINT "BreakGlassAccessGrant_revokedByUserId_fkey"
  FOREIGN KEY ("revokedByUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "BreakGlassAccessGrant"
  ADD CONSTRAINT "BreakGlassAccessGrant_postReviewedByUserId_fkey"
  FOREIGN KEY ("postReviewedByUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "BreakGlassAccessGrant_tenantId_companyId_status_idx"
  ON "BreakGlassAccessGrant"("tenantId", "companyId", "status");

CREATE INDEX "BreakGlassAccessGrant_targetUserId_status_idx"
  ON "BreakGlassAccessGrant"("targetUserId", "status");

CREATE INDEX "BreakGlassAccessGrant_locationId_status_idx"
  ON "BreakGlassAccessGrant"("locationId", "status");

CREATE INDEX "BreakGlassAccessGrant_requestedUntil_status_idx"
  ON "BreakGlassAccessGrant"("requestedUntil", "status");
