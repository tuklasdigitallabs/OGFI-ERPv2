CREATE TYPE "ProjectCalendarDateKind" AS ENUM ('DATE_ONLY', 'SCHEDULED_DATETIME');
CREATE TYPE "ProjectMilestoneStatus" AS ENUM ('PLANNED', 'ACHIEVED', 'CANCELLED');

ALTER TABLE "Project"
  ADD COLUMN "startDate" DATE,
  ADD COLUMN "targetEndDate" DATE,
  ADD COLUMN "actualEndDate" DATE;

ALTER TABLE "ProjectTask"
  ADD COLUMN "startDate" DATE,
  ADD COLUMN "dueDate" DATE;

UPDATE "Project"
SET
  "startDate" = COALESCE("startDate", ("startAt" AT TIME ZONE 'Asia/Manila')::date),
  "targetEndDate" = COALESCE("targetEndDate", ("targetEndAt" AT TIME ZONE 'Asia/Manila')::date),
  "actualEndDate" = COALESCE("actualEndDate", ("actualEndAt" AT TIME ZONE 'Asia/Manila')::date)
WHERE "startAt" IS NOT NULL OR "targetEndAt" IS NOT NULL OR "actualEndAt" IS NOT NULL;

UPDATE "ProjectTask"
SET
  "startDate" = COALESCE("startDate", ("startAt" AT TIME ZONE 'Asia/Manila')::date),
  "dueDate" = COALESCE("dueDate", ("dueAt" AT TIME ZONE 'Asia/Manila')::date)
WHERE "startAt" IS NOT NULL OR "dueAt" IS NOT NULL;

ALTER TABLE "Project"
  ADD CONSTRAINT "Project_date_only_order_check"
  CHECK (
    ("startDate" IS NULL OR "targetEndDate" IS NULL OR "startDate" <= "targetEndDate")
    AND ("actualEndDate" IS NULL OR "startDate" IS NULL OR "startDate" <= "actualEndDate")
  );

ALTER TABLE "ProjectTask"
  ADD CONSTRAINT "ProjectTask_date_only_order_check"
  CHECK ("startDate" IS NULL OR "dueDate" IS NULL OR "startDate" <= "dueDate");

CREATE TABLE "ProjectMilestone" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL,
  "companyId" UUID NOT NULL,
  "projectId" UUID NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "status" "ProjectMilestoneStatus" NOT NULL DEFAULT 'PLANNED',
  "dateKind" "ProjectCalendarDateKind" NOT NULL DEFAULT 'DATE_ONLY',
  "targetDate" DATE,
  "targetAt" TIMESTAMP(3),
  "ownerUserId" UUID NOT NULL,
  "isAtRisk" BOOLEAN NOT NULL DEFAULT false,
  "atRiskReason" TEXT,
  "achievedAt" TIMESTAMP(3),
  "achievedByUserId" UUID,
  "cancelledAt" TIMESTAMP(3),
  "cancelledByUserId" UUID,
  "cancelReason" TEXT,
  "version" INTEGER NOT NULL DEFAULT 1,
  "archivedAt" TIMESTAMP(3),
  "createdByUserId" UUID NOT NULL,
  "updatedByUserId" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ProjectMilestone_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProjectMilestone_title_check" CHECK (length(trim("title")) >= 2),
  CONSTRAINT "ProjectMilestone_date_kind_check"
    CHECK (
      ("dateKind" = 'DATE_ONLY' AND "targetDate" IS NOT NULL AND "targetAt" IS NULL)
      OR ("dateKind" = 'SCHEDULED_DATETIME' AND "targetAt" IS NOT NULL AND "targetDate" IS NULL)
    ),
  CONSTRAINT "ProjectMilestone_at_risk_reason_check"
    CHECK (
      ("isAtRisk" = false AND "atRiskReason" IS NULL)
      OR ("isAtRisk" = true AND "atRiskReason" IS NOT NULL AND length(trim("atRiskReason")) >= 5)
    ),
  CONSTRAINT "ProjectMilestone_achieved_fields_check"
    CHECK (
      (
        "status" = 'ACHIEVED'
        AND "achievedAt" IS NOT NULL
        AND "achievedByUserId" IS NOT NULL
      )
      OR (
        "status" <> 'ACHIEVED'
        AND "achievedAt" IS NULL
        AND "achievedByUserId" IS NULL
      )
    ),
  CONSTRAINT "ProjectMilestone_cancelled_fields_check"
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
    )
);

CREATE UNIQUE INDEX "ProjectMilestone_id_tenantId_companyId_projectId_key"
  ON "ProjectMilestone"("id", "tenantId", "companyId", "projectId");

CREATE INDEX "ProjectMilestone_tenantId_companyId_projectId_status_idx"
  ON "ProjectMilestone"("tenantId", "companyId", "projectId", "status");

CREATE INDEX "ProjectMilestone_tenantId_companyId_targetDate_status_idx"
  ON "ProjectMilestone"("tenantId", "companyId", "targetDate", "status");

CREATE INDEX "ProjectMilestone_tenantId_companyId_targetAt_status_idx"
  ON "ProjectMilestone"("tenantId", "companyId", "targetAt", "status");

CREATE INDEX "ProjectMilestone_ownerUserId_status_idx"
  ON "ProjectMilestone"("ownerUserId", "status");

ALTER TABLE "ProjectMilestone"
  ADD CONSTRAINT "ProjectMilestone_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ProjectMilestone_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ProjectMilestone_projectId_tenantId_companyId_fkey" FOREIGN KEY ("projectId", "tenantId", "companyId") REFERENCES "Project"("id", "tenantId", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ProjectMilestone_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ProjectMilestone_achievedByUserId_fkey" FOREIGN KEY ("achievedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "ProjectMilestone_cancelledByUserId_fkey" FOREIGN KEY ("cancelledByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "ProjectMilestone_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ProjectMilestone_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
