CREATE TABLE "HighRiskScopeRequest" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL,
  "companyId" UUID NOT NULL,
  "targetUserId" UUID NOT NULL,
  "locationId" UUID NOT NULL,
  "accessLevel" "AccessLevel" NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "reason" TEXT NOT NULL,
  "evidenceReference" TEXT NOT NULL,
  "requestedByUserId" UUID NOT NULL,
  "reviewedByUserId" UUID,
  "reviewReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reviewedAt" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "HighRiskScopeRequest_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "HighRiskScopeRequest"
  ADD CONSTRAINT "HighRiskScopeRequest_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "HighRiskScopeRequest"
  ADD CONSTRAINT "HighRiskScopeRequest_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "HighRiskScopeRequest"
  ADD CONSTRAINT "HighRiskScopeRequest_targetUserId_fkey"
  FOREIGN KEY ("targetUserId") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "HighRiskScopeRequest"
  ADD CONSTRAINT "HighRiskScopeRequest_locationId_fkey"
  FOREIGN KEY ("locationId") REFERENCES "Location"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "HighRiskScopeRequest"
  ADD CONSTRAINT "HighRiskScopeRequest_requestedByUserId_fkey"
  FOREIGN KEY ("requestedByUserId") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "HighRiskScopeRequest"
  ADD CONSTRAINT "HighRiskScopeRequest_reviewedByUserId_fkey"
  FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "HighRiskScopeRequest_tenantId_companyId_status_idx"
  ON "HighRiskScopeRequest"("tenantId", "companyId", "status");

CREATE INDEX "HighRiskScopeRequest_targetUserId_status_idx"
  ON "HighRiskScopeRequest"("targetUserId", "status");

CREATE INDEX "HighRiskScopeRequest_locationId_status_idx"
  ON "HighRiskScopeRequest"("locationId", "status");
