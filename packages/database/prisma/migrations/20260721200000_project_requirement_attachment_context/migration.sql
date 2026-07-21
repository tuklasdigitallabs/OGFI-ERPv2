BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '5min';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "ProjectAttachment"
    WHERE
      ("commentId" IS NOT NULL AND ("taskId" IS NOT NULL OR "requirementId" IS NOT NULL))
      OR
      ("commentId" IS NULL AND "taskId" IS NULL AND "requirementId" IS NULL)
  ) THEN
    RAISE EXCEPTION 'ProjectAttachment contains an invalid attachment context';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "ProjectAttachment" attachment
    JOIN "ProjectRequirement" requirement
      ON requirement."id" = attachment."requirementId"
     AND requirement."tenantId" = attachment."tenantId"
     AND requirement."companyId" = attachment."companyId"
     AND requirement."projectId" = attachment."projectId"
    WHERE attachment."requirementId" IS NOT NULL
      AND attachment."taskId" IS DISTINCT FROM requirement."taskId"
  ) THEN
    RAISE EXCEPTION 'ProjectAttachment requirement task context mismatch';
  END IF;
END
$$;

ALTER TABLE "ProjectAttachment"
  ADD CONSTRAINT "ProjectAttachment_valid_context_candidate_chk" CHECK (
    (
      "commentId" IS NOT NULL
      AND "taskId" IS NULL
      AND "requirementId" IS NULL
    )
    OR
    (
      "commentId" IS NULL
      AND ("taskId" IS NOT NULL OR "requirementId" IS NOT NULL)
    )
  ) NOT VALID;

ALTER TABLE "ProjectAttachment"
  VALIDATE CONSTRAINT "ProjectAttachment_valid_context_candidate_chk";

ALTER TABLE "ProjectAttachment"
  DROP CONSTRAINT "ProjectAttachment_exactly_one_parent_chk";

ALTER TABLE "ProjectAttachment"
  RENAME CONSTRAINT "ProjectAttachment_valid_context_candidate_chk"
  TO "ProjectAttachment_valid_context_chk";

CREATE UNIQUE INDEX "ProjectAttachment_active_requirement_attachment_unique_idx"
  ON "ProjectAttachment"("requirementId", "attachmentId")
  WHERE "requirementId" IS NOT NULL
    AND "status" = 'ACTIVE'
    AND "archivedAt" IS NULL;

CREATE OR REPLACE FUNCTION "enforce_project_attachment_requirement_context"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  requirement_task_id UUID;
BEGIN
  IF NEW."requirementId" IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT requirement."taskId"
    INTO requirement_task_id
  FROM "ProjectRequirement" requirement
  WHERE requirement."id" = NEW."requirementId"
    AND requirement."tenantId" = NEW."tenantId"
    AND requirement."companyId" = NEW."companyId"
    AND requirement."projectId" = NEW."projectId";

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ProjectAttachment requirement is missing or outside its scope';
  END IF;

  IF NEW."commentId" IS NOT NULL
     OR NEW."taskId" IS DISTINCT FROM requirement_task_id THEN
    RAISE EXCEPTION 'ProjectAttachment requirement task context mismatch';
  END IF;

  RETURN NEW;
END
$$;

CREATE TRIGGER "ProjectAttachment_requirement_context_trg"
BEFORE INSERT OR UPDATE OF
  "tenantId", "companyId", "projectId", "taskId", "commentId", "requirementId"
ON "ProjectAttachment"
FOR EACH ROW
EXECUTE FUNCTION "enforce_project_attachment_requirement_context"();

CREATE OR REPLACE FUNCTION "prevent_project_requirement_task_context_drift"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."taskId" IS DISTINCT FROM OLD."taskId"
     AND EXISTS (
       SELECT 1
       FROM "ProjectAttachment" attachment
       WHERE attachment."requirementId" = NEW."id"
         AND attachment."tenantId" = NEW."tenantId"
         AND attachment."companyId" = NEW."companyId"
         AND attachment."projectId" = NEW."projectId"
         AND attachment."taskId" IS DISTINCT FROM NEW."taskId"
     ) THEN
    RAISE EXCEPTION 'ProjectRequirement task context has linked attachments';
  END IF;

  RETURN NEW;
END
$$;

CREATE TRIGGER "ProjectRequirement_attachment_task_context_trg"
BEFORE UPDATE OF "taskId", "tenantId", "companyId", "projectId"
ON "ProjectRequirement"
FOR EACH ROW
EXECUTE FUNCTION "prevent_project_requirement_task_context_drift"();

COMMIT;
