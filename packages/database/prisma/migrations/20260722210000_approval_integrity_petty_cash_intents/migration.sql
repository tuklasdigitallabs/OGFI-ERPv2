BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '5min';

-- Fail closed when legacy data would violate the one-active-instance invariant.
-- Operators must investigate and reconcile through controlled workflow actions;
-- this migration never selects a winner or removes approval history.
DO $preflight$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM public."ApprovalInstance"
     WHERE status = 'PENDING'
     GROUP BY "tenantId", "companyId", "documentType", "documentId"
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23505',
      MESSAGE = 'APPROVAL_INSTANCE_PENDING_DUPLICATE';
  END IF;
END;
$preflight$;

CREATE UNIQUE INDEX "ApprovalInstance_one_pending_document_key"
  ON public."ApprovalInstance" (
    "tenantId", "companyId", "documentType", "documentId"
  )
  WHERE status = 'PENDING';

ALTER TABLE public."PettyCashRequest"
  ADD COLUMN "currentProposedAmountPhp" DECIMAL(18,6),
  ADD COLUMN "approvalProposalVersion" INTEGER NOT NULL DEFAULT 0;

-- Only active chains with complete normalized lineage are safe to initialize.
-- Terminal approvedAmountPhp remains authoritative; incomplete legacy awaiting
-- rows stay NULL/version 0 and remain visible as readiness blockers.
UPDATE public."PettyCashRequest" request
   SET "currentProposedAmountPhp" = request."requestedAmountPhp",
       "approvalProposalVersion" = 1
  FROM public."ApprovalInstance" instance
 WHERE request.status = 'AWAITING_APPROVAL'
   AND request."requestedAmountPhp" > 0
   AND request."approvalInstanceId" = instance.id
   AND instance.status = 'PENDING'
   AND instance."documentType" = 'PettyCashRequest'
   AND instance."documentId" = request.id
   AND instance."tenantId" = request."tenantId"
   AND instance."companyId" = request."companyId";

ALTER TABLE public."PettyCashRequest"
  ADD CONSTRAINT "PettyCashRequest_approval_proposal_state_check"
  CHECK (
    -- Do not bind the expand-stage columns to the new application's status
    -- cleanup yet: the predecessor release must remain able to terminalize a
    -- backfilled request during rollback without knowing these columns.
    "approvalProposalVersion" >= 0
    AND (
      "currentProposedAmountPhp" IS NULL
      OR (
        "currentProposedAmountPhp" > 0
        AND "currentProposedAmountPhp" <= "requestedAmountPhp"
        AND "approvalProposalVersion" >= 1
        AND "approvalInstanceId" IS NOT NULL
      )
    )
  );

CREATE TABLE public."PettyCashApprovalStepIntent" (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL,
  "companyId" UUID NOT NULL,
  "pettyCashRequestId" UUID NOT NULL,
  "approvalInstanceId" UUID NOT NULL,
  "approvalStepId" UUID NOT NULL,
  "stepOrder" INTEGER NOT NULL,
  "requestedAmountSnapshotPhp" DECIMAL(18,6) NOT NULL,
  "beforeAmountPhp" DECIMAL(18,6) NOT NULL,
  "effectiveAmountPhp" DECIMAL(18,6) NOT NULL,
  "actorUserId" UUID NOT NULL,
  reason TEXT,
  "requestVersionBefore" INTEGER NOT NULL,
  "requestVersionAfter" INTEGER NOT NULL,
  "decisionPayloadHash" VARCHAR(64) NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "PettyCashApprovalStepIntent_pkey" PRIMARY KEY (id),
  CONSTRAINT "PettyCashApprovalStepIntent_amounts_check" CHECK (
    "requestedAmountSnapshotPhp" > 0
    AND "beforeAmountPhp" > 0
    AND "beforeAmountPhp" <= "requestedAmountSnapshotPhp"
    AND "effectiveAmountPhp" > 0
    AND "effectiveAmountPhp" <= "requestedAmountSnapshotPhp"
  ),
  CONSTRAINT "PettyCashApprovalStepIntent_step_order_check"
    CHECK ("stepOrder" >= 1),
  CONSTRAINT "PettyCashApprovalStepIntent_version_sequence_check" CHECK (
    "requestVersionBefore" >= 0
    AND "requestVersionAfter" = "requestVersionBefore" + 1
  ),
  CONSTRAINT "PettyCashApprovalStepIntent_payload_hash_check"
    CHECK ("decisionPayloadHash" ~ '^[a-f0-9]{64}$'),
  CONSTRAINT "PettyCashApprovalStepIntent_idempotency_key_check"
    CHECK (length(btrim("idempotencyKey")) > 0),
  CONSTRAINT "PettyCashApprovalStepIntent_reason_check"
    CHECK (reason IS NULL OR length(btrim(reason)) > 0),
  CONSTRAINT "PettyCashApprovalStepIntent_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PettyCashApprovalStepIntent_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES public."Company"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PettyCashApprovalStepIntent_pettyCashRequestId_fkey"
    FOREIGN KEY ("pettyCashRequestId") REFERENCES public."PettyCashRequest"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PettyCashApprovalStepIntent_approvalInstanceId_fkey"
    FOREIGN KEY ("approvalInstanceId") REFERENCES public."ApprovalInstance"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PettyCashApprovalStepIntent_approvalStepId_fkey"
    FOREIGN KEY ("approvalStepId") REFERENCES public."ApprovalInstanceStep"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PettyCashApprovalStepIntent_actorUserId_fkey"
    FOREIGN KEY ("actorUserId") REFERENCES public."User"(id) ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "PettyCashApprovalStepIntent_approvalStepId_key"
  ON public."PettyCashApprovalStepIntent" ("approvalStepId");
CREATE UNIQUE INDEX "PettyCashApprovalStepIntent_instance_step_order_key"
  ON public."PettyCashApprovalStepIntent" ("approvalInstanceId", "stepOrder");
CREATE UNIQUE INDEX "PettyCashApprovalStepIntent_idempotency_key"
  ON public."PettyCashApprovalStepIntent" ("tenantId", "companyId", "idempotencyKey");
CREATE INDEX "PettyCashApprovalStepIntent_request_created_idx"
  ON public."PettyCashApprovalStepIntent" ("tenantId", "companyId", "pettyCashRequestId", "createdAt");
CREATE INDEX "PettyCashApprovalStepIntent_instance_order_idx"
  ON public."PettyCashApprovalStepIntent" ("tenantId", "companyId", "approvalInstanceId", "stepOrder");
CREATE INDEX "PettyCashApprovalStepIntent_actor_created_idx"
  ON public."PettyCashApprovalStepIntent" ("actorUserId", "createdAt");

CREATE FUNCTION public.validate_petty_cash_approval_step_intent_lineage()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $lineage$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM public."PettyCashRequest" request
      JOIN public."ApprovalInstance" instance
        ON instance.id = NEW."approvalInstanceId"
       AND instance."tenantId" = NEW."tenantId"
       AND instance."companyId" = NEW."companyId"
       AND instance."documentType" = 'PettyCashRequest'
       AND instance."documentId" = request.id
       AND instance.status = 'PENDING'
      JOIN public."ApprovalInstanceStep" step
        ON step.id = NEW."approvalStepId"
       AND step."approvalInstanceId" = instance.id
       AND step."stepOrder" = NEW."stepOrder"
      JOIN public."User" actor
        ON actor.id = NEW."actorUserId"
       AND actor."tenantId" = NEW."tenantId"
      JOIN public."Company" company_scope
        ON company_scope.id = NEW."companyId"
       AND company_scope."tenantId" = NEW."tenantId"
     WHERE request.id = NEW."pettyCashRequestId"
       AND request."tenantId" = NEW."tenantId"
       AND request."companyId" = NEW."companyId"
       AND request."approvalInstanceId" = instance.id
       AND request.status = 'AWAITING_APPROVAL'
       AND request."requestedAmountPhp" = NEW."requestedAmountSnapshotPhp"
       AND request."currentProposedAmountPhp" = NEW."beforeAmountPhp"
       AND request."approvalProposalVersion" = NEW."requestVersionBefore"
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'PETTY_CASH_APPROVAL_INTENT_LINEAGE_INVALID';
  END IF;

  RETURN NEW;
END;
$lineage$;

CREATE TRIGGER "PettyCashApprovalStepIntent_lineage_trg"
BEFORE INSERT ON public."PettyCashApprovalStepIntent"
FOR EACH ROW
EXECUTE FUNCTION public.validate_petty_cash_approval_step_intent_lineage();

ALTER TABLE public."PettyCashApprovalStepIntent"
  ENABLE ALWAYS TRIGGER "PettyCashApprovalStepIntent_lineage_trg";

CREATE FUNCTION public.reject_petty_cash_approval_step_intent_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $append_only$
BEGIN
  RAISE EXCEPTION USING
    ERRCODE = '55000',
    MESSAGE = 'PETTY_CASH_APPROVAL_INTENT_APPEND_ONLY';
END;
$append_only$;

CREATE TRIGGER "PettyCashApprovalStepIntent_append_only_guard_trg"
BEFORE UPDATE OR DELETE OR TRUNCATE ON public."PettyCashApprovalStepIntent"
FOR EACH STATEMENT
EXECUTE FUNCTION public.reject_petty_cash_approval_step_intent_mutation();

ALTER TABLE public."PettyCashApprovalStepIntent"
  ENABLE ALWAYS TRIGGER "PettyCashApprovalStepIntent_append_only_guard_trg";

COMMIT;
