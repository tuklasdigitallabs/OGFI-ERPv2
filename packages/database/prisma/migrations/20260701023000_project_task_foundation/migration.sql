CREATE TYPE "ProjectTaskStatus" AS ENUM ('BACKLOG', 'PLANNED', 'IN_PROGRESS', 'WAITING_FOR_APPROVAL', 'BLOCKED', 'FOR_REVIEW', 'COMPLETED', 'CANCELLED');
CREATE TYPE "ProjectTaskPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'CRITICAL');
CREATE TYPE "ProjectBlockerStatus" AS ENUM ('OPEN', 'RESOLVED', 'ACCEPTED', 'CANCELLED');
CREATE TYPE "ProjectBlockerSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

ALTER TABLE "Project"
  ADD CONSTRAINT "Project_id_tenantId_companyId_key" UNIQUE ("id", "tenantId", "companyId");

CREATE TABLE "ProjectTask" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL,
  "companyId" UUID NOT NULL,
  "projectId" UUID NOT NULL,
  "taskKey" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "status" "ProjectTaskStatus" NOT NULL DEFAULT 'BACKLOG',
  "priority" "ProjectTaskPriority" NOT NULL DEFAULT 'NORMAL',
  "ownerUserId" UUID NOT NULL,
  "startAt" TIMESTAMP(3),
  "dueAt" TIMESTAMP(3),
  "isBlocked" BOOLEAN NOT NULL DEFAULT false,
  "blockedReason" TEXT,
  "blockedAt" TIMESTAMP(3),
  "blockedByUserId" UUID,
  "completedAt" TIMESTAMP(3),
  "completedByUserId" UUID,
  "completionNote" TEXT,
  "cancelledAt" TIMESTAMP(3),
  "cancelledByUserId" UUID,
  "cancelReason" TEXT,
  "lastReopenedAt" TIMESTAMP(3),
  "lastReopenedByUserId" UUID,
  "lastReopenReason" TEXT,
  "version" INTEGER NOT NULL DEFAULT 1,
  "archivedAt" TIMESTAMP(3),
  "createdByUserId" UUID NOT NULL,
  "updatedByUserId" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ProjectTask_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProjectTask_taskKey_check" CHECK (length(trim("taskKey")) >= 2),
  CONSTRAINT "ProjectTask_title_check" CHECK (length(trim("title")) >= 2),
  CONSTRAINT "ProjectTask_due_order_check" CHECK ("startAt" IS NULL OR "dueAt" IS NULL OR "startAt" <= "dueAt"),
  CONSTRAINT "ProjectTask_blocked_fields_check"
    CHECK (
      (
        "status" = 'BLOCKED'
        AND "isBlocked" = true
        AND "blockedReason" IS NOT NULL
        AND length(trim("blockedReason")) >= 5
        AND "blockedAt" IS NOT NULL
        AND "blockedByUserId" IS NOT NULL
      )
      OR (
        "status" <> 'BLOCKED'
        AND "isBlocked" = false
        AND "blockedReason" IS NULL
        AND "blockedAt" IS NULL
        AND "blockedByUserId" IS NULL
      )
    ),
  CONSTRAINT "ProjectTask_completed_fields_check"
    CHECK (
      (
        "status" = 'COMPLETED'
        AND "completedAt" IS NOT NULL
        AND "completedByUserId" IS NOT NULL
      )
      OR (
        "status" <> 'COMPLETED'
        AND "completedAt" IS NULL
        AND "completedByUserId" IS NULL
      )
    ),
  CONSTRAINT "ProjectTask_cancelled_fields_check"
    CHECK (
      (
        "status" = 'CANCELLED'
        AND "cancelledAt" IS NOT NULL
        AND "cancelledByUserId" IS NOT NULL
        AND "cancelReason" IS NOT NULL
        AND length(trim("cancelReason")) >= 5
      )
      OR (
        "status" <> 'CANCELLED'
        AND "cancelledAt" IS NULL
        AND "cancelledByUserId" IS NULL
        AND "cancelReason" IS NULL
      )
    ),
  CONSTRAINT "ProjectTask_reopen_fields_check"
    CHECK (
      (
        "lastReopenedAt" IS NULL
        AND "lastReopenedByUserId" IS NULL
        AND "lastReopenReason" IS NULL
      )
      OR (
        "lastReopenedAt" IS NOT NULL
        AND "lastReopenedByUserId" IS NOT NULL
        AND "lastReopenReason" IS NOT NULL
        AND length(trim("lastReopenReason")) >= 5
      )
    )
);

CREATE TABLE "ProjectTaskAssignee" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL,
  "companyId" UUID NOT NULL,
  "projectId" UUID NOT NULL,
  "taskId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
  "assignedByUserId" UUID NOT NULL,
  "removedAt" TIMESTAMP(3),
  "removedByUserId" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ProjectTaskAssignee_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProjectTaskAssignee_removed_fields_check"
    CHECK (
      ("status" = 'ACTIVE' AND "removedAt" IS NULL AND "removedByUserId" IS NULL)
      OR ("status" <> 'ACTIVE' AND "removedAt" IS NOT NULL AND "removedByUserId" IS NOT NULL)
    )
);

CREATE TABLE "ProjectTaskChecklistItem" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL,
  "companyId" UUID NOT NULL,
  "projectId" UUID NOT NULL,
  "taskId" UUID NOT NULL,
  "title" TEXT NOT NULL,
  "position" INTEGER NOT NULL,
  "isRequired" BOOLEAN NOT NULL DEFAULT false,
  "isCompleted" BOOLEAN NOT NULL DEFAULT false,
  "completedAt" TIMESTAMP(3),
  "completedByUserId" UUID,
  "archivedAt" TIMESTAMP(3),
  "createdByUserId" UUID NOT NULL,
  "updatedByUserId" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ProjectTaskChecklistItem_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProjectTaskChecklistItem_title_check" CHECK (length(trim("title")) >= 2),
  CONSTRAINT "ProjectTaskChecklistItem_position_check" CHECK ("position" >= 1),
  CONSTRAINT "ProjectTaskChecklistItem_completed_fields_check"
    CHECK (
      ("isCompleted" = false AND "completedAt" IS NULL AND "completedByUserId" IS NULL)
      OR ("isCompleted" = true AND "completedAt" IS NOT NULL AND "completedByUserId" IS NOT NULL)
    )
);

CREATE TABLE "ProjectComment" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL,
  "companyId" UUID NOT NULL,
  "projectId" UUID NOT NULL,
  "taskId" UUID NOT NULL,
  "authorUserId" UUID NOT NULL,
  "body" TEXT NOT NULL,
  "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
  "editedAt" TIMESTAMP(3),
  "editedByUserId" UUID,
  "archivedAt" TIMESTAMP(3),
  "archivedByUserId" UUID,
  "archiveReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ProjectComment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProjectComment_body_check" CHECK (length(trim("body")) >= 1),
  CONSTRAINT "ProjectComment_edited_fields_check"
    CHECK (
      ("editedAt" IS NULL AND "editedByUserId" IS NULL)
      OR ("editedAt" IS NOT NULL AND "editedByUserId" IS NOT NULL)
    ),
  CONSTRAINT "ProjectComment_archived_fields_check"
    CHECK (
      ("status" = 'ACTIVE' AND "archivedAt" IS NULL AND "archivedByUserId" IS NULL AND "archiveReason" IS NULL)
      OR (
        "status" <> 'ACTIVE'
        AND "archivedAt" IS NOT NULL
        AND "archivedByUserId" IS NOT NULL
        AND "archiveReason" IS NOT NULL
        AND length(trim("archiveReason")) >= 5
      )
    )
);

CREATE TABLE "ProjectBlocker" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL,
  "companyId" UUID NOT NULL,
  "projectId" UUID NOT NULL,
  "taskId" UUID NOT NULL,
  "reason" TEXT NOT NULL,
  "blockerType" TEXT NOT NULL,
  "severity" "ProjectBlockerSeverity" NOT NULL DEFAULT 'MEDIUM',
  "ownerUserId" UUID NOT NULL,
  "reportedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reportedByUserId" UUID NOT NULL,
  "nextReviewAt" TIMESTAMP(3),
  "status" "ProjectBlockerStatus" NOT NULL DEFAULT 'OPEN',
  "resolvedAt" TIMESTAMP(3),
  "resolvedByUserId" UUID,
  "resolutionNote" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ProjectBlocker_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProjectBlocker_reason_check" CHECK (length(trim("reason")) >= 5),
  CONSTRAINT "ProjectBlocker_blockerType_check" CHECK (length(trim("blockerType")) >= 2),
  CONSTRAINT "ProjectBlocker_resolved_fields_check"
    CHECK (
      (
        "status" = 'OPEN'
        AND "resolvedAt" IS NULL
        AND "resolvedByUserId" IS NULL
        AND "resolutionNote" IS NULL
      )
      OR (
        "status" <> 'OPEN'
        AND "resolvedAt" IS NOT NULL
        AND "resolvedByUserId" IS NOT NULL
        AND "resolutionNote" IS NOT NULL
        AND length(trim("resolutionNote")) >= 5
      )
    )
);

CREATE UNIQUE INDEX "ProjectTask_projectId_taskKey_key"
  ON "ProjectTask"("projectId", "taskKey");

CREATE UNIQUE INDEX "ProjectTask_id_tenantId_companyId_projectId_key"
  ON "ProjectTask"("id", "tenantId", "companyId", "projectId");

CREATE INDEX "ProjectTask_tenantId_companyId_projectId_status_idx"
  ON "ProjectTask"("tenantId", "companyId", "projectId", "status");

CREATE INDEX "ProjectTask_tenantId_companyId_ownerUserId_status_idx"
  ON "ProjectTask"("tenantId", "companyId", "ownerUserId", "status");

CREATE INDEX "ProjectTask_tenantId_companyId_dueAt_status_idx"
  ON "ProjectTask"("tenantId", "companyId", "dueAt", "status");

CREATE INDEX "ProjectTask_projectId_priority_status_idx"
  ON "ProjectTask"("projectId", "priority", "status");

CREATE UNIQUE INDEX "ProjectTaskAssignee_taskId_userId_key"
  ON "ProjectTaskAssignee"("taskId", "userId");

CREATE INDEX "ProjectTaskAssignee_tenantId_companyId_userId_status_idx"
  ON "ProjectTaskAssignee"("tenantId", "companyId", "userId", "status");

CREATE INDEX "ProjectTaskAssignee_tenantId_companyId_projectId_status_idx"
  ON "ProjectTaskAssignee"("tenantId", "companyId", "projectId", "status");

CREATE INDEX "ProjectTaskAssignee_taskId_status_idx"
  ON "ProjectTaskAssignee"("taskId", "status");

CREATE UNIQUE INDEX "ProjectTaskChecklistItem_taskId_position_key"
  ON "ProjectTaskChecklistItem"("taskId", "position");

CREATE INDEX "ProjectTaskChecklistItem_tenantId_companyId_projectId_taskId_idx"
  ON "ProjectTaskChecklistItem"("tenantId", "companyId", "projectId", "taskId");

CREATE INDEX "ProjectComment_tenantId_companyId_projectId_taskId_createdAt_idx"
  ON "ProjectComment"("tenantId", "companyId", "projectId", "taskId", "createdAt");

CREATE INDEX "ProjectComment_authorUserId_createdAt_idx"
  ON "ProjectComment"("authorUserId", "createdAt");

CREATE INDEX "ProjectBlocker_tenantId_companyId_projectId_status_idx"
  ON "ProjectBlocker"("tenantId", "companyId", "projectId", "status");

CREATE INDEX "ProjectBlocker_taskId_status_idx"
  ON "ProjectBlocker"("taskId", "status");

CREATE INDEX "ProjectBlocker_ownerUserId_status_idx"
  ON "ProjectBlocker"("ownerUserId", "status");

ALTER TABLE "ProjectTask"
  ADD CONSTRAINT "ProjectTask_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ProjectTask_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ProjectTask_projectId_tenantId_companyId_fkey" FOREIGN KEY ("projectId", "tenantId", "companyId") REFERENCES "Project"("id", "tenantId", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ProjectTask_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ProjectTask_blockedByUserId_fkey" FOREIGN KEY ("blockedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "ProjectTask_completedByUserId_fkey" FOREIGN KEY ("completedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "ProjectTask_cancelledByUserId_fkey" FOREIGN KEY ("cancelledByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "ProjectTask_lastReopenedByUserId_fkey" FOREIGN KEY ("lastReopenedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "ProjectTask_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ProjectTask_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ProjectTaskAssignee"
  ADD CONSTRAINT "ProjectTaskAssignee_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ProjectTaskAssignee_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ProjectTaskAssignee_projectId_tenantId_companyId_fkey" FOREIGN KEY ("projectId", "tenantId", "companyId") REFERENCES "Project"("id", "tenantId", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ProjectTaskAssignee_taskId_tenantId_companyId_projectId_fkey" FOREIGN KEY ("taskId", "tenantId", "companyId", "projectId") REFERENCES "ProjectTask"("id", "tenantId", "companyId", "projectId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ProjectTaskAssignee_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ProjectTaskAssignee_assignedByUserId_fkey" FOREIGN KEY ("assignedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ProjectTaskAssignee_removedByUserId_fkey" FOREIGN KEY ("removedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ProjectTaskChecklistItem"
  ADD CONSTRAINT "ProjectTaskChecklistItem_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ProjectTaskChecklistItem_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ProjectTaskChecklistItem_projectId_tenantId_companyId_fkey" FOREIGN KEY ("projectId", "tenantId", "companyId") REFERENCES "Project"("id", "tenantId", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ProjectTaskChecklistItem_taskId_tenantId_companyId_projectId_fkey" FOREIGN KEY ("taskId", "tenantId", "companyId", "projectId") REFERENCES "ProjectTask"("id", "tenantId", "companyId", "projectId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ProjectTaskChecklistItem_completedByUserId_fkey" FOREIGN KEY ("completedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "ProjectTaskChecklistItem_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ProjectTaskChecklistItem_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ProjectComment"
  ADD CONSTRAINT "ProjectComment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ProjectComment_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ProjectComment_projectId_tenantId_companyId_fkey" FOREIGN KEY ("projectId", "tenantId", "companyId") REFERENCES "Project"("id", "tenantId", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ProjectComment_taskId_tenantId_companyId_projectId_fkey" FOREIGN KEY ("taskId", "tenantId", "companyId", "projectId") REFERENCES "ProjectTask"("id", "tenantId", "companyId", "projectId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ProjectComment_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ProjectComment_editedByUserId_fkey" FOREIGN KEY ("editedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "ProjectComment_archivedByUserId_fkey" FOREIGN KEY ("archivedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ProjectBlocker"
  ADD CONSTRAINT "ProjectBlocker_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ProjectBlocker_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ProjectBlocker_projectId_tenantId_companyId_fkey" FOREIGN KEY ("projectId", "tenantId", "companyId") REFERENCES "Project"("id", "tenantId", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ProjectBlocker_taskId_tenantId_companyId_projectId_fkey" FOREIGN KEY ("taskId", "tenantId", "companyId", "projectId") REFERENCES "ProjectTask"("id", "tenantId", "companyId", "projectId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ProjectBlocker_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ProjectBlocker_reportedByUserId_fkey" FOREIGN KEY ("reportedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ProjectBlocker_resolvedByUserId_fkey" FOREIGN KEY ("resolvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
