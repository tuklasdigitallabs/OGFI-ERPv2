CREATE TABLE "ProjectRecordLink" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL,
  "companyId" UUID NOT NULL,
  "projectId" UUID NOT NULL,
  "taskId" UUID,
  "milestoneId" UUID,
  "sourceRecordType" TEXT NOT NULL,
  "sourceRecordId" UUID NOT NULL,
  "relationType" TEXT NOT NULL DEFAULT 'RELATED',
  "linkLabel" TEXT NOT NULL,
  "createdByUserId" UUID NOT NULL,
  "updatedByUserId" UUID NOT NULL,
  "archivedAt" TIMESTAMP(3),
  "archivedByUserId" UUID,
  "archiveReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ProjectRecordLink_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProjectRecordLink_source_type_check"
    CHECK ("sourceRecordType" IN (
      'PURCHASE_REQUEST',
      'PURCHASE_ORDER',
      'GOODS_RECEIPT',
      'INVENTORY_TRANSFER',
      'SUPPLIER'
    )),
  CONSTRAINT "ProjectRecordLink_context_check"
    CHECK ("taskId" IS NULL OR "milestoneId" IS NULL),
  CONSTRAINT "ProjectRecordLink_relation_type_check"
    CHECK (length(trim("relationType")) >= 2),
  CONSTRAINT "ProjectRecordLink_label_check"
    CHECK (length(trim("linkLabel")) >= 2),
  CONSTRAINT "ProjectRecordLink_archive_fields_check"
    CHECK (
      ("archivedAt" IS NULL AND "archivedByUserId" IS NULL AND "archiveReason" IS NULL)
      OR (
        "archivedAt" IS NOT NULL
        AND "archivedByUserId" IS NOT NULL
        AND "archiveReason" IS NOT NULL
        AND length(trim("archiveReason")) >= 5
      )
    )
);

CREATE UNIQUE INDEX "ProjectRecordLink_id_tenantId_companyId_projectId_key"
  ON "ProjectRecordLink"("id", "tenantId", "companyId", "projectId");

CREATE INDEX "ProjectRecordLink_tenantId_companyId_projectId_archivedAt_idx"
  ON "ProjectRecordLink"("tenantId", "companyId", "projectId", "archivedAt");

CREATE INDEX "ProjectRecordLink_tenantId_companyId_projectId_taskId_archivedAt_idx"
  ON "ProjectRecordLink"("tenantId", "companyId", "projectId", "taskId", "archivedAt");

CREATE INDEX "ProjectRecordLink_tenantId_companyId_projectId_milestoneId_archivedAt_idx"
  ON "ProjectRecordLink"("tenantId", "companyId", "projectId", "milestoneId", "archivedAt");

CREATE INDEX "ProjectRecordLink_tenantId_companyId_sourceRecordType_sourceRecordId_idx"
  ON "ProjectRecordLink"("tenantId", "companyId", "sourceRecordType", "sourceRecordId");

CREATE INDEX "ProjectRecordLink_createdByUserId_createdAt_idx"
  ON "ProjectRecordLink"("createdByUserId", "createdAt");

CREATE UNIQUE INDEX "ProjectRecordLink_active_project_source_key"
  ON "ProjectRecordLink"("tenantId", "companyId", "projectId", "sourceRecordType", "sourceRecordId")
  WHERE "taskId" IS NULL AND "milestoneId" IS NULL AND "archivedAt" IS NULL;

CREATE UNIQUE INDEX "ProjectRecordLink_active_task_source_key"
  ON "ProjectRecordLink"("tenantId", "companyId", "projectId", "taskId", "sourceRecordType", "sourceRecordId")
  WHERE "taskId" IS NOT NULL AND "milestoneId" IS NULL AND "archivedAt" IS NULL;

CREATE UNIQUE INDEX "ProjectRecordLink_active_milestone_source_key"
  ON "ProjectRecordLink"("tenantId", "companyId", "projectId", "milestoneId", "sourceRecordType", "sourceRecordId")
  WHERE "milestoneId" IS NOT NULL AND "taskId" IS NULL AND "archivedAt" IS NULL;

ALTER TABLE "ProjectRecordLink"
  ADD CONSTRAINT "ProjectRecordLink_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ProjectRecordLink_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ProjectRecordLink_projectId_tenantId_companyId_fkey" FOREIGN KEY ("projectId", "tenantId", "companyId") REFERENCES "Project"("id", "tenantId", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ProjectRecordLink_taskId_tenantId_companyId_projectId_fkey" FOREIGN KEY ("taskId", "tenantId", "companyId", "projectId") REFERENCES "ProjectTask"("id", "tenantId", "companyId", "projectId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ProjectRecordLink_milestoneId_tenantId_companyId_projectId_fkey" FOREIGN KEY ("milestoneId", "tenantId", "companyId", "projectId") REFERENCES "ProjectMilestone"("id", "tenantId", "companyId", "projectId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ProjectRecordLink_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ProjectRecordLink_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ProjectRecordLink_archivedByUserId_fkey" FOREIGN KEY ("archivedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
