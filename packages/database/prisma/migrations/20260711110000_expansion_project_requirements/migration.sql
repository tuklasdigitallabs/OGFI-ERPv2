CREATE TYPE "ProjectRequirementKind" AS ENUM ('EVIDENCE', 'SIGNOFF');
CREATE TYPE "ProjectRequirementStatus" AS ENUM ('PENDING', 'SUBMITTED', 'APPROVED', 'RETURNED', 'WAIVED', 'CANCELLED');

CREATE TABLE "ProjectRequirement" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL,
  "companyId" UUID NOT NULL,
  "projectId" UUID NOT NULL,
  "taskId" UUID,
  "kind" "ProjectRequirementKind" NOT NULL,
  "code" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "evidenceType" TEXT,
  "signoffStage" TEXT,
  "evidenceNote" TEXT,
  "isRequired" BOOLEAN NOT NULL DEFAULT true,
  "ownerUserId" UUID NOT NULL,
  "reviewerUserId" UUID,
  "status" "ProjectRequirementStatus" NOT NULL DEFAULT 'PENDING',
  "submittedAt" TIMESTAMP(3), "submittedByUserId" UUID,
  "decisionAt" TIMESTAMP(3), "decidedByUserId" UUID, "decisionReason" TEXT,
  "version" INTEGER NOT NULL DEFAULT 1, "archivedAt" TIMESTAMP(3),
  "createdByUserId" UUID NOT NULL, "updatedByUserId" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProjectRequirement_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProjectRequirement_projectId_kind_code_key" UNIQUE ("projectId", "kind", "code"),
  CONSTRAINT "ProjectRequirement_id_tenantId_companyId_projectId_key" UNIQUE ("id", "tenantId", "companyId", "projectId")
);
ALTER TABLE "ProjectAttachment" ADD COLUMN "requirementId" UUID;
ALTER TABLE "ProjectRecordLink" ADD COLUMN "requirementId" UUID;
CREATE INDEX "ProjectRequirement_tenantId_companyId_projectId_status_idx" ON "ProjectRequirement"("tenantId","companyId","projectId","status");
CREATE INDEX "ProjectAttachment_tenantId_companyId_requirementId_status_idx" ON "ProjectAttachment"("tenantId","companyId","requirementId","status");
CREATE INDEX "ProjectRecordLink_tenantId_companyId_projectId_requirementId_archivedAt_idx" ON "ProjectRecordLink"("tenantId","companyId","projectId","requirementId","archivedAt");
ALTER TABLE "ProjectRequirement" ADD CONSTRAINT "ProjectRequirement_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProjectRequirement" ADD CONSTRAINT "ProjectRequirement_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProjectRequirement" ADD CONSTRAINT "ProjectRequirement_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProjectRequirement" ADD CONSTRAINT "ProjectRequirement_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "ProjectTask"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProjectRequirement" ADD CONSTRAINT "ProjectRequirement_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProjectRequirement" ADD CONSTRAINT "ProjectRequirement_reviewerUserId_fkey" FOREIGN KEY ("reviewerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProjectRequirement" ADD CONSTRAINT "ProjectRequirement_submittedByUserId_fkey" FOREIGN KEY ("submittedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProjectRequirement" ADD CONSTRAINT "ProjectRequirement_decidedByUserId_fkey" FOREIGN KEY ("decidedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProjectRequirement" ADD CONSTRAINT "ProjectRequirement_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProjectRequirement" ADD CONSTRAINT "ProjectRequirement_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProjectAttachment" ADD CONSTRAINT "ProjectAttachment_requirementId_tenantId_companyId_projectId_fkey" FOREIGN KEY ("requirementId", "tenantId", "companyId", "projectId") REFERENCES "ProjectRequirement"("id", "tenantId", "companyId", "projectId") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProjectRecordLink" ADD CONSTRAINT "ProjectRecordLink_requirementId_tenantId_companyId_projectId_fkey" FOREIGN KEY ("requirementId", "tenantId", "companyId", "projectId") REFERENCES "ProjectRequirement"("id", "tenantId", "companyId", "projectId") ON DELETE SET NULL ON UPDATE CASCADE;
