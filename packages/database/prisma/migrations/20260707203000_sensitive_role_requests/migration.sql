CREATE TABLE "SensitiveRoleRequest" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL,
  "companyId" UUID NOT NULL,
  "targetUserId" UUID NOT NULL,
  "roleId" UUID NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "reason" TEXT NOT NULL,
  "evidenceReference" TEXT NOT NULL,
  "requestedByUserId" UUID NOT NULL,
  "reviewedByUserId" UUID,
  "reviewReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reviewedAt" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "SensitiveRoleRequest_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "SensitiveRoleRequest"
  ADD CONSTRAINT "SensitiveRoleRequest_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SensitiveRoleRequest"
  ADD CONSTRAINT "SensitiveRoleRequest_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SensitiveRoleRequest"
  ADD CONSTRAINT "SensitiveRoleRequest_targetUserId_fkey"
  FOREIGN KEY ("targetUserId") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SensitiveRoleRequest"
  ADD CONSTRAINT "SensitiveRoleRequest_roleId_fkey"
  FOREIGN KEY ("roleId") REFERENCES "Role"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SensitiveRoleRequest"
  ADD CONSTRAINT "SensitiveRoleRequest_requestedByUserId_fkey"
  FOREIGN KEY ("requestedByUserId") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SensitiveRoleRequest"
  ADD CONSTRAINT "SensitiveRoleRequest_reviewedByUserId_fkey"
  FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "SensitiveRoleRequest_tenantId_companyId_status_idx"
  ON "SensitiveRoleRequest"("tenantId", "companyId", "status");

CREATE INDEX "SensitiveRoleRequest_targetUserId_status_idx"
  ON "SensitiveRoleRequest"("targetUserId", "status");

CREATE INDEX "SensitiveRoleRequest_roleId_status_idx"
  ON "SensitiveRoleRequest"("roleId", "status");
