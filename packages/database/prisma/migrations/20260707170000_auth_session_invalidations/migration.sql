CREATE TABLE "AuthSessionInvalidation" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL,
  "companyId" UUID,
  "targetUserId" UUID NOT NULL,
  "requestedByUserId" UUID,
  "status" TEXT NOT NULL DEFAULT 'PENDING_PROVIDER',
  "reason" TEXT NOT NULL,
  "sourceEventType" TEXT NOT NULL,
  "sourceRecordId" TEXT,
  "demoEpochEnforced" BOOLEAN NOT NULL DEFAULT true,
  "providerName" TEXT,
  "providerReference" TEXT,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AuthSessionInvalidation_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "AuthSessionInvalidation"
  ADD CONSTRAINT "AuthSessionInvalidation_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AuthSessionInvalidation"
  ADD CONSTRAINT "AuthSessionInvalidation_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AuthSessionInvalidation"
  ADD CONSTRAINT "AuthSessionInvalidation_targetUserId_fkey"
  FOREIGN KEY ("targetUserId") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AuthSessionInvalidation"
  ADD CONSTRAINT "AuthSessionInvalidation_requestedByUserId_fkey"
  FOREIGN KEY ("requestedByUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "AuthSessionInvalidation_tenantId_companyId_status_idx"
  ON "AuthSessionInvalidation"("tenantId", "companyId", "status");

CREATE INDEX "AuthSessionInvalidation_targetUserId_status_idx"
  ON "AuthSessionInvalidation"("targetUserId", "status");

CREATE INDEX "AuthSessionInvalidation_createdAt_status_idx"
  ON "AuthSessionInvalidation"("createdAt", "status");
