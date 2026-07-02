CREATE TABLE "ProjectAttachment" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL,
  "companyId" UUID NOT NULL,
  "projectId" UUID NOT NULL,
  "taskId" UUID,
  "commentId" UUID,
  "attachmentId" UUID NOT NULL,
  "purpose" TEXT NOT NULL,
  "caption" TEXT,
  "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
  "archivedAt" TIMESTAMP(3),
  "archivedByUserId" UUID,
  "archiveReason" TEXT,
  "createdByUserId" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ProjectAttachment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProjectAttachment_exactly_one_parent_chk" CHECK (
    (("taskId" IS NOT NULL)::int + ("commentId" IS NOT NULL)::int) = 1
  )
);

ALTER TABLE "ProjectAttachment"
  ADD CONSTRAINT "ProjectAttachment_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ProjectAttachment"
  ADD CONSTRAINT "ProjectAttachment_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ProjectAttachment"
  ADD CONSTRAINT "ProjectAttachment_projectId_tenantId_companyId_fkey"
  FOREIGN KEY ("projectId", "tenantId", "companyId") REFERENCES "Project"("id", "tenantId", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ProjectAttachment"
  ADD CONSTRAINT "ProjectAttachment_taskId_tenantId_companyId_projectId_fkey"
  FOREIGN KEY ("taskId", "tenantId", "companyId", "projectId") REFERENCES "ProjectTask"("id", "tenantId", "companyId", "projectId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ProjectAttachment"
  ADD CONSTRAINT "ProjectAttachment_commentId_fkey"
  FOREIGN KEY ("commentId") REFERENCES "ProjectComment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ProjectAttachment"
  ADD CONSTRAINT "ProjectAttachment_attachmentId_fkey"
  FOREIGN KEY ("attachmentId") REFERENCES "Attachment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ProjectAttachment"
  ADD CONSTRAINT "ProjectAttachment_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ProjectAttachment"
  ADD CONSTRAINT "ProjectAttachment_archivedByUserId_fkey"
  FOREIGN KEY ("archivedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "ProjectAttachment_tenantId_companyId_projectId_status_idx"
  ON "ProjectAttachment"("tenantId", "companyId", "projectId", "status");

CREATE INDEX "ProjectAttachment_tenantId_companyId_taskId_status_idx"
  ON "ProjectAttachment"("tenantId", "companyId", "taskId", "status");

CREATE INDEX "ProjectAttachment_tenantId_companyId_commentId_status_idx"
  ON "ProjectAttachment"("tenantId", "companyId", "commentId", "status");

CREATE INDEX "ProjectAttachment_attachmentId_status_idx"
  ON "ProjectAttachment"("attachmentId", "status");

CREATE UNIQUE INDEX "ProjectAttachment_active_task_attachment_unique_idx"
  ON "ProjectAttachment"("taskId", "attachmentId")
  WHERE "taskId" IS NOT NULL AND "status" = 'ACTIVE' AND "archivedAt" IS NULL;

CREATE UNIQUE INDEX "ProjectAttachment_active_comment_attachment_unique_idx"
  ON "ProjectAttachment"("commentId", "attachmentId")
  WHERE "commentId" IS NOT NULL AND "status" = 'ACTIVE' AND "archivedAt" IS NULL;
