-- DEC-0245: additive, backfill-free durable approval-routing orchestration.
-- This migration creates no run, batch, blocker, routing, or audit rows.
BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

CREATE TABLE "ApprovalRoutingBackfillRun" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL,
  "companyId" UUID NOT NULL,
  "mode" VARCHAR(16) NOT NULL,
  "status" VARCHAR(32) NOT NULL,
  "routingSchemaVersion" INTEGER NOT NULL,
  "routingMappingVersion" VARCHAR(64) NOT NULL,
  "routingMappingHash" CHAR(64) NOT NULL,
  "capabilityVersion" VARCHAR(64) NOT NULL,
  "capabilityHash" CHAR(64) NOT NULL,
  "releaseIdentity" VARCHAR(128) NOT NULL,
  "startRequestId" VARCHAR(128) NOT NULL,
  "idempotencyKey" VARCHAR(128) NOT NULL,
  "requestHash" CHAR(64) NOT NULL,
  "leaseOwner" VARCHAR(128),
  "leaseExpiresAt" TIMESTAMPTZ(3),
  "fencingToken" BIGINT NOT NULL DEFAULT 0,
  "currentPass" INTEGER NOT NULL DEFAULT 1,
  "lastCursorCreatedAt" TIMESTAMP(3),
  "lastCursorId" UUID,
  "nextBatchSequence" INTEGER NOT NULL DEFAULT 1,
  "previousReceiptHash" CHAR(64),
  "scannedCount" BIGINT NOT NULL DEFAULT 0,
  "eligibleCount" BIGINT NOT NULL DEFAULT 0,
  "appliedCount" BIGINT NOT NULL DEFAULT 0,
  "alreadyCurrentCount" BIGINT NOT NULL DEFAULT 0,
  "terminalCount" BIGINT NOT NULL DEFAULT 0,
  "blockerCount" BIGINT NOT NULL DEFAULT 0,
  "startedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT clock_timestamp(),
  "completedAt" TIMESTAMPTZ(3),
  "stoppedAt" TIMESTAMPTZ(3),
  "stopAuditEventId" UUID,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT clock_timestamp(),
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT "ApprovalRoutingBackfillRun_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ApprovalRoutingBackfillRun_mode_check" CHECK ("mode" = 'APPLY'),
  CONSTRAINT "ApprovalRoutingBackfillRun_status_check" CHECK (
    "status" IN ('ACTIVE', 'BLOCKED', 'BARRIER_REQUIRED', 'INCOMPATIBLE', 'STOPPED', 'COMPLETED')
  ),
  CONSTRAINT "ApprovalRoutingBackfillRun_contract_check" CHECK (
    "routingSchemaVersion" > 0
    AND BTRIM("routingMappingVersion") <> ''
    AND "routingMappingHash" ~ '^[0-9a-f]{64}$'
    AND BTRIM("capabilityVersion") <> ''
    AND "capabilityHash" ~ '^[0-9a-f]{64}$'
    AND BTRIM("releaseIdentity") <> ''
  ),
  CONSTRAINT "ApprovalRoutingBackfillRun_request_check" CHECK (
    BTRIM("startRequestId") <> ''
    AND BTRIM("idempotencyKey") <> ''
    AND "requestHash" ~ '^[0-9a-f]{64}$'
  ),
  CONSTRAINT "ApprovalRoutingBackfillRun_lease_pair_check" CHECK (
    ("leaseOwner" IS NULL AND "leaseExpiresAt" IS NULL)
    OR ("leaseOwner" IS NOT NULL AND BTRIM("leaseOwner") <> '' AND "leaseExpiresAt" IS NOT NULL)
  ),
  CONSTRAINT "ApprovalRoutingBackfillRun_cursor_pair_check" CHECK (
    ("lastCursorCreatedAt" IS NULL) = ("lastCursorId" IS NULL)
  ),
  CONSTRAINT "ApprovalRoutingBackfillRun_receipt_check" CHECK (
    "previousReceiptHash" IS NULL OR "previousReceiptHash" ~ '^[0-9a-f]{64}$'
  ),
  CONSTRAINT "ApprovalRoutingBackfillRun_progress_check" CHECK (
    "fencingToken" >= 0
    AND "currentPass" > 0
    AND "nextBatchSequence" > 0
    AND "scannedCount" >= 0
    AND "eligibleCount" >= 0
    AND "appliedCount" >= 0
    AND "alreadyCurrentCount" >= 0
    AND "terminalCount" >= 0
    AND "blockerCount" >= 0
  ),
  CONSTRAINT "ApprovalRoutingBackfillRun_terminal_time_check" CHECK (
    (("status" = 'COMPLETED') = ("completedAt" IS NOT NULL))
    AND (("status" = 'STOPPED') = ("stoppedAt" IS NOT NULL))
    AND (("status" = 'STOPPED') = ("stopAuditEventId" IS NOT NULL))
    AND NOT ("completedAt" IS NOT NULL AND "stoppedAt" IS NOT NULL)
    AND ("status" NOT IN ('COMPLETED', 'STOPPED') OR "leaseOwner" IS NULL)
  ),
  CONSTRAINT "ApprovalRoutingBackfillRun_tenant_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ApprovalRoutingBackfillRun_company_scope_fkey"
    FOREIGN KEY ("companyId", "tenantId") REFERENCES "Company"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ApprovalRoutingBackfillRun_stop_audit_scope_fkey"
    FOREIGN KEY ("stopAuditEventId", "tenantId") REFERENCES "AuditEvent"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ApprovalRoutingBackfillRun_scope_key"
  ON "ApprovalRoutingBackfillRun"("id", "tenantId", "companyId");
CREATE UNIQUE INDEX "ApprovalRoutingBackfillRun_start_request_key"
  ON "ApprovalRoutingBackfillRun"("tenantId", "companyId", "startRequestId");
CREATE UNIQUE INDEX "ApprovalRoutingBackfillRun_idempotency_key"
  ON "ApprovalRoutingBackfillRun"("tenantId", "companyId", "idempotencyKey");
CREATE UNIQUE INDEX "ApprovalRoutingBackfillRun_stop_audit_key"
  ON "ApprovalRoutingBackfillRun"("stopAuditEventId", "tenantId");
CREATE UNIQUE INDEX "ApprovalRoutingBackfillRun_one_authoritative_key"
  ON "ApprovalRoutingBackfillRun"("tenantId", "companyId")
  WHERE "status" IN ('ACTIVE', 'BLOCKED', 'BARRIER_REQUIRED', 'INCOMPATIBLE');
CREATE INDEX "ApprovalRoutingBackfillRun_scope_status_idx"
  ON "ApprovalRoutingBackfillRun"("tenantId", "companyId", "status", "createdAt");

CREATE TABLE "ApprovalRoutingBackfillBatch" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL,
  "companyId" UUID NOT NULL,
  "runId" UUID NOT NULL,
  "requestId" VARCHAR(128) NOT NULL,
  "fencingToken" BIGINT NOT NULL,
  "passNo" INTEGER NOT NULL,
  "batchSequence" INTEGER NOT NULL,
  "cursorFromCreatedAt" TIMESTAMP(3),
  "cursorFromId" UUID,
  "cursorToCreatedAt" TIMESTAMP(3),
  "cursorToId" UUID,
  "scannedCount" BIGINT NOT NULL,
  "eligibleCount" BIGINT NOT NULL,
  "appliedCount" BIGINT NOT NULL,
  "alreadyCurrentCount" BIGINT NOT NULL,
  "terminalCount" BIGINT NOT NULL,
  "blockerCount" BIGINT NOT NULL,
  "hasMore" BOOLEAN NOT NULL,
  "outcome" VARCHAR(32) NOT NULL,
  "previousReceiptHash" CHAR(64),
  "receiptHash" CHAR(64) NOT NULL,
  "committedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT "ApprovalRoutingBackfillBatch_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ApprovalRoutingBackfillBatch_outcome_check" CHECK (
    "outcome" IN ('CONTINUE', 'BLOCKED', 'BARRIER_REQUIRED')
  ),
  CONSTRAINT "ApprovalRoutingBackfillBatch_cursor_from_pair_check" CHECK (
    ("cursorFromCreatedAt" IS NULL) = ("cursorFromId" IS NULL)
  ),
  CONSTRAINT "ApprovalRoutingBackfillBatch_cursor_to_pair_check" CHECK (
    ("cursorToCreatedAt" IS NULL) = ("cursorToId" IS NULL)
  ),
  CONSTRAINT "ApprovalRoutingBackfillBatch_progress_check" CHECK (
    "fencingToken" > 0
    AND "passNo" > 0
    AND "batchSequence" > 0
    AND "scannedCount" >= 0
    AND "eligibleCount" >= 0
    AND "appliedCount" >= 0
    AND "alreadyCurrentCount" >= 0
    AND "terminalCount" >= 0
    AND "blockerCount" >= 0
    AND "eligibleCount" = "appliedCount"
    AND "scannedCount" = "appliedCount" + "alreadyCurrentCount" + "terminalCount" + "blockerCount"
  ),
  CONSTRAINT "ApprovalRoutingBackfillBatch_outcome_count_check" CHECK (
    "blockerCount" = 0 OR "outcome" = 'BLOCKED'
  ),
  CONSTRAINT "ApprovalRoutingBackfillBatch_identity_check" CHECK (
    BTRIM("requestId") <> ''
    AND "receiptHash" ~ '^[0-9a-f]{64}$'
    AND ("previousReceiptHash" IS NULL OR "previousReceiptHash" ~ '^[0-9a-f]{64}$')
  ),
  CONSTRAINT "ApprovalRoutingBackfillBatch_tenant_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ApprovalRoutingBackfillBatch_company_scope_fkey"
    FOREIGN KEY ("companyId", "tenantId") REFERENCES "Company"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ApprovalRoutingBackfillBatch_run_scope_fkey"
    FOREIGN KEY ("runId", "tenantId", "companyId") REFERENCES "ApprovalRoutingBackfillRun"("id", "tenantId", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ApprovalRoutingBackfillBatch_scope_key"
  ON "ApprovalRoutingBackfillBatch"("id", "runId", "tenantId", "companyId");
CREATE UNIQUE INDEX "ApprovalRoutingBackfillBatch_sequence_key"
  ON "ApprovalRoutingBackfillBatch"("runId", "batchSequence");
CREATE UNIQUE INDEX "ApprovalRoutingBackfillBatch_request_key"
  ON "ApprovalRoutingBackfillBatch"("runId", "requestId");
CREATE UNIQUE INDEX "ApprovalRoutingBackfillBatch_receipt_key"
  ON "ApprovalRoutingBackfillBatch"("runId", "receiptHash");
CREATE INDEX "ApprovalRoutingBackfillBatch_run_pass_idx"
  ON "ApprovalRoutingBackfillBatch"("tenantId", "companyId", "runId", "passNo", "batchSequence");

CREATE TABLE "ApprovalRoutingBackfillBlockerObservation" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL,
  "companyId" UUID NOT NULL,
  "runId" UUID NOT NULL,
  "batchId" UUID NOT NULL,
  "passNo" INTEGER NOT NULL,
  "approvalInstanceId" UUID NOT NULL,
  "documentFamily" VARCHAR(128) NOT NULL,
  "blockerCode" VARCHAR(64) NOT NULL,
  "observedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT "ApprovalRoutingBackfillBlockerObservation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ApprovalRoutingBackfillBlocker_pass_check" CHECK ("passNo" > 0),
  CONSTRAINT "ApprovalRoutingBackfillBlocker_family_check" CHECK (BTRIM("documentFamily") <> ''),
  CONSTRAINT "ApprovalRoutingBackfillBlocker_code_check" CHECK ("blockerCode" IN (
    'UNSUPPORTED_PROJECT_REQUIREMENT', 'UNSUPPORTED_DOCUMENT_TYPE',
    'CURRENT_STEP_ORDER_MISSING', 'ZERO_STEPS', 'MULTIPLE_PENDING_STEPS',
    'CURRENT_PENDING_STEP_MISMATCH', 'ORPHAN_STEP_STRUCTURE',
    'ASSIGNMENT_XOR_INVALID', 'DELEGATED_STEP_UNSUPPORTED', 'SOURCE_NOT_FOUND',
    'SOURCE_SCOPE_MISMATCH', 'SOURCE_STATUS_INVALID', 'SOURCE_LOCATION_REQUIRED',
    'SOURCE_ACTOR_REQUIRED', 'SOURCE_APPROVAL_INTENT_REQUIRED',
    'ROUTING_DESCRIPTOR_DRIFT', 'BACKFILL_AUDIT_MISSING',
    'BACKFILL_AUDIT_DRIFT', 'CURRENT_ELIGIBLE_ACTOR_MISSING',
    'ROLE_NOTIFICATION_PRESENT', 'BACKFILL_TRANSACTION_FAILED'
  )),
  CONSTRAINT "ApprovalRoutingBackfillBlocker_tenant_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ApprovalRoutingBackfillBlocker_company_scope_fkey"
    FOREIGN KEY ("companyId", "tenantId") REFERENCES "Company"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ApprovalRoutingBackfillBlocker_run_scope_fkey"
    FOREIGN KEY ("runId", "tenantId", "companyId") REFERENCES "ApprovalRoutingBackfillRun"("id", "tenantId", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ApprovalRoutingBackfillBlocker_batch_scope_fkey"
    FOREIGN KEY ("batchId", "runId", "tenantId", "companyId") REFERENCES "ApprovalRoutingBackfillBatch"("id", "runId", "tenantId", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ApprovalRoutingBackfillBlocker_instance_scope_fkey"
    FOREIGN KEY ("approvalInstanceId", "tenantId", "companyId") REFERENCES "ApprovalInstance"("id", "tenantId", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ApprovalRoutingBackfillBlocker_retry_key"
  ON "ApprovalRoutingBackfillBlockerObservation"("runId", "passNo", "approvalInstanceId", "blockerCode");
CREATE INDEX "ApprovalRoutingBackfillBlocker_run_family_idx"
  ON "ApprovalRoutingBackfillBlockerObservation"("tenantId", "companyId", "runId", "passNo", "documentFamily");
CREATE INDEX "ApprovalRoutingBackfillBlocker_batch_idx"
  ON "ApprovalRoutingBackfillBlockerObservation"("batchId", "runId", "tenantId", "companyId");

-- Stable total keyset for company-scoped pending scans. UUID remains the tie-breaker,
-- while createdAt prevents a random UUID from being mistaken for insertion order.
CREATE INDEX "ApprovalInstance_pending_created_id_idx"
  ON "ApprovalInstance"("tenantId", "companyId", "createdAt", "id")
  WHERE "status" = 'PENDING';

CREATE OR REPLACE FUNCTION validate_approval_routing_backfill_run_transition()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  committed_batch public."ApprovalRoutingBackfillBatch"%ROWTYPE;
  stop_audit public."AuditEvent"%ROWTYPE;
BEGIN
  IF NEW."leaseOwner" IS NOT NULL AND (
    NEW."leaseExpiresAt" <= clock_timestamp()
    OR NEW."leaseExpiresAt" > clock_timestamp() + INTERVAL '10 minutes'
  ) THEN
    RAISE EXCEPTION 'APPROVAL_ROUTING_BACKFILL_LEASE_WINDOW_INVALID';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW."status" <> 'ACTIVE'
      OR NEW."fencingToken" <> 1
      OR NEW."currentPass" <> 1
      OR NEW."nextBatchSequence" <> 1
      OR NEW."lastCursorCreatedAt" IS NOT NULL
      OR NEW."lastCursorId" IS NOT NULL
      OR NEW."previousReceiptHash" IS NOT NULL
      OR NEW."scannedCount" <> 0
      OR NEW."eligibleCount" <> 0
      OR NEW."appliedCount" <> 0
      OR NEW."alreadyCurrentCount" <> 0
      OR NEW."terminalCount" <> 0
      OR NEW."blockerCount" <> 0
      OR NEW."leaseOwner" IS NULL
      OR NEW."leaseExpiresAt" IS NULL
      OR NEW."completedAt" IS NOT NULL
      OR NEW."stoppedAt" IS NOT NULL
      OR NEW."stopAuditEventId" IS NOT NULL
      OR NEW."startedAt" IS DISTINCT FROM NEW."createdAt"
      OR NEW."updatedAt" IS DISTINCT FROM NEW."createdAt"
    THEN
      RAISE EXCEPTION 'APPROVAL_ROUTING_BACKFILL_START_SHAPE_INVALID';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW."id" IS DISTINCT FROM OLD."id"
    OR NEW."tenantId" IS DISTINCT FROM OLD."tenantId"
    OR NEW."companyId" IS DISTINCT FROM OLD."companyId"
    OR NEW."mode" IS DISTINCT FROM OLD."mode"
    OR NEW."routingSchemaVersion" IS DISTINCT FROM OLD."routingSchemaVersion"
    OR NEW."routingMappingVersion" IS DISTINCT FROM OLD."routingMappingVersion"
    OR NEW."routingMappingHash" IS DISTINCT FROM OLD."routingMappingHash"
    OR NEW."capabilityVersion" IS DISTINCT FROM OLD."capabilityVersion"
    OR NEW."capabilityHash" IS DISTINCT FROM OLD."capabilityHash"
    OR NEW."releaseIdentity" IS DISTINCT FROM OLD."releaseIdentity"
    OR NEW."startRequestId" IS DISTINCT FROM OLD."startRequestId"
    OR NEW."idempotencyKey" IS DISTINCT FROM OLD."idempotencyKey"
    OR NEW."requestHash" IS DISTINCT FROM OLD."requestHash"
    OR NEW."startedAt" IS DISTINCT FROM OLD."startedAt"
    OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
  THEN
    RAISE EXCEPTION 'APPROVAL_ROUTING_BACKFILL_RUN_BINDING_IMMUTABLE';
  END IF;

  IF OLD."status" IN ('STOPPED', 'COMPLETED') AND NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'APPROVAL_ROUTING_BACKFILL_RUN_TERMINAL';
  END IF;

  IF NEW."fencingToken" < OLD."fencingToken"
    OR NEW."fencingToken" > OLD."fencingToken" + 1
  THEN
    RAISE EXCEPTION 'APPROVAL_ROUTING_BACKFILL_FENCE_INVALID';
  END IF;
  IF NEW."fencingToken" = OLD."fencingToken" + 1
    AND (NEW."leaseOwner" IS NULL OR NEW."leaseExpiresAt" <= clock_timestamp())
  THEN
    RAISE EXCEPTION 'APPROVAL_ROUTING_BACKFILL_FENCE_REQUIRES_LEASE';
  END IF;
  IF NEW."fencingToken" = OLD."fencingToken"
    AND OLD."leaseOwner" IS NOT NULL
    AND NEW."leaseOwner" IS NOT NULL
    AND NEW."leaseOwner" IS DISTINCT FROM OLD."leaseOwner"
  THEN
    RAISE EXCEPTION 'APPROVAL_ROUTING_BACKFILL_OWNER_REQUIRES_NEW_FENCE';
  END IF;

  IF NEW."currentPass" < OLD."currentPass" OR NEW."currentPass" > OLD."currentPass" + 1
    OR NEW."nextBatchSequence" < OLD."nextBatchSequence"
    OR NEW."nextBatchSequence" > OLD."nextBatchSequence" + 1
    OR NEW."scannedCount" < OLD."scannedCount"
    OR NEW."eligibleCount" < OLD."eligibleCount"
    OR NEW."appliedCount" < OLD."appliedCount"
    OR NEW."alreadyCurrentCount" < OLD."alreadyCurrentCount"
    OR NEW."terminalCount" < OLD."terminalCount"
    OR NEW."blockerCount" < OLD."blockerCount"
  THEN
    RAISE EXCEPTION 'APPROVAL_ROUTING_BACKFILL_PROGRESS_NOT_MONOTONIC';
  END IF;

  IF NEW."nextBatchSequence" = OLD."nextBatchSequence" THEN
    IF NEW."currentPass" IS DISTINCT FROM OLD."currentPass"
      OR NEW."lastCursorCreatedAt" IS DISTINCT FROM OLD."lastCursorCreatedAt"
      OR NEW."lastCursorId" IS DISTINCT FROM OLD."lastCursorId"
      OR NEW."previousReceiptHash" IS DISTINCT FROM OLD."previousReceiptHash"
      OR NEW."scannedCount" IS DISTINCT FROM OLD."scannedCount"
      OR NEW."eligibleCount" IS DISTINCT FROM OLD."eligibleCount"
      OR NEW."appliedCount" IS DISTINCT FROM OLD."appliedCount"
      OR NEW."alreadyCurrentCount" IS DISTINCT FROM OLD."alreadyCurrentCount"
      OR NEW."terminalCount" IS DISTINCT FROM OLD."terminalCount"
      OR NEW."blockerCount" IS DISTINCT FROM OLD."blockerCount"
    THEN
      RAISE EXCEPTION 'APPROVAL_ROUTING_BACKFILL_CHECKPOINT_REQUIRES_BATCH';
    END IF;

    IF NEW."status" IS DISTINCT FROM OLD."status" THEN
      IF NEW."status" <> 'STOPPED'
        OR OLD."status" IN ('STOPPED', 'COMPLETED')
        OR OLD."leaseOwner" IS NULL
        OR OLD."leaseExpiresAt" <= clock_timestamp()
        OR OLD."fencingToken" <= 0
        OR NEW."fencingToken" IS DISTINCT FROM OLD."fencingToken"
        OR NEW."leaseOwner" IS NOT NULL
        OR NEW."leaseExpiresAt" IS NOT NULL
        OR NEW."stoppedAt" IS NULL
        OR NEW."completedAt" IS NOT NULL
        OR NEW."stopAuditEventId" IS NULL
      THEN
        RAISE EXCEPTION 'APPROVAL_ROUTING_BACKFILL_STATUS_REQUIRES_BATCH_OR_STOP';
      END IF;

      SELECT * INTO stop_audit
      FROM public."AuditEvent"
      WHERE "id" = NEW."stopAuditEventId"
        AND "tenantId" = NEW."tenantId"
        AND "companyId" = NEW."companyId"
        AND xmin::text::numeric = mod(
          pg_current_xact_id()::text::numeric,
          4294967296::numeric
        );
      IF NOT FOUND
        OR stop_audit."entityType" <> 'ApprovalRoutingBackfillRun'
        OR stop_audit."entityId" IS DISTINCT FROM NEW."id"
        OR stop_audit."eventType" <> 'approval.routing_backfill_stopped'
        OR stop_audit."occurredAt" AT TIME ZONE 'UTC' IS DISTINCT FROM NEW."stoppedAt"
        OR stop_audit."requestId" IS NULL
        OR BTRIM(stop_audit."requestId") = ''
        OR stop_audit."afterData" ->> 'status' IS DISTINCT FROM 'STOPPED'
        OR stop_audit."beforeData" ->> 'status' IS DISTINCT FROM OLD."status"
        OR stop_audit."metadata" ->> 'requestId' IS DISTINCT FROM stop_audit."requestId"
        OR stop_audit."metadata" ->> 'leaseOwner' IS DISTINCT FROM OLD."leaseOwner"
        OR stop_audit."metadata" ->> 'fencingToken' IS DISTINCT FROM OLD."fencingToken"::text
        OR stop_audit."metadata" ->> 'releaseIdentity' IS DISTINCT FROM OLD."releaseIdentity"
      THEN
        RAISE EXCEPTION 'APPROVAL_ROUTING_BACKFILL_STOP_AUDIT_INVALID';
      END IF;
    ELSIF NEW."stoppedAt" IS DISTINCT FROM OLD."stoppedAt"
      OR NEW."stopAuditEventId" IS DISTINCT FROM OLD."stopAuditEventId"
      OR NEW."completedAt" IS DISTINCT FROM OLD."completedAt"
    THEN
      RAISE EXCEPTION 'APPROVAL_ROUTING_BACKFILL_TERMINAL_EVIDENCE_INVALID';
    END IF;
    RETURN NEW;
  END IF;

  SELECT * INTO committed_batch
  FROM public."ApprovalRoutingBackfillBatch"
  WHERE "runId" = OLD."id" AND "batchSequence" = OLD."nextBatchSequence";
  IF NOT FOUND
    OR committed_batch."tenantId" IS DISTINCT FROM OLD."tenantId"
    OR committed_batch."companyId" IS DISTINCT FROM OLD."companyId"
    OR committed_batch."fencingToken" IS DISTINCT FROM NEW."fencingToken"
    OR committed_batch."passNo" IS DISTINCT FROM OLD."currentPass"
    OR committed_batch."cursorFromCreatedAt" IS DISTINCT FROM OLD."lastCursorCreatedAt"
    OR committed_batch."cursorFromId" IS DISTINCT FROM OLD."lastCursorId"
    OR committed_batch."previousReceiptHash" IS DISTINCT FROM OLD."previousReceiptHash"
    OR NEW."previousReceiptHash" IS DISTINCT FROM committed_batch."receiptHash"
    OR NEW."scannedCount" <> OLD."scannedCount" + committed_batch."scannedCount"
    OR NEW."eligibleCount" <> OLD."eligibleCount" + committed_batch."eligibleCount"
    OR NEW."appliedCount" <> OLD."appliedCount" + committed_batch."appliedCount"
    OR NEW."alreadyCurrentCount" <> OLD."alreadyCurrentCount" + committed_batch."alreadyCurrentCount"
    OR NEW."terminalCount" <> OLD."terminalCount" + committed_batch."terminalCount"
    OR NEW."blockerCount" <> OLD."blockerCount" + committed_batch."blockerCount"
  THEN
    RAISE EXCEPTION 'APPROVAL_ROUTING_BACKFILL_BATCH_CHECKPOINT_MISMATCH';
  END IF;

  IF NEW."currentPass" = OLD."currentPass" THEN
    IF NEW."lastCursorCreatedAt" IS DISTINCT FROM committed_batch."cursorToCreatedAt"
      OR NEW."lastCursorId" IS DISTINCT FROM committed_batch."cursorToId"
    THEN
      RAISE EXCEPTION 'APPROVAL_ROUTING_BACKFILL_CURSOR_MISMATCH';
    END IF;
  ELSIF NEW."currentPass" = OLD."currentPass" + 1 THEN
    IF NEW."lastCursorCreatedAt" IS NOT NULL OR NEW."lastCursorId" IS NOT NULL THEN
      RAISE EXCEPTION 'APPROVAL_ROUTING_BACKFILL_PASS_RESET_INVALID';
    END IF;
  ELSE
    RAISE EXCEPTION 'APPROVAL_ROUTING_BACKFILL_PASS_INVALID';
  END IF;

  IF NEW."stoppedAt" IS NOT NULL
    OR NEW."stopAuditEventId" IS NOT NULL
    OR NEW."completedAt" IS NOT NULL
    OR NEW."status" IS DISTINCT FROM CASE committed_batch."outcome"
      WHEN 'CONTINUE' THEN 'ACTIVE'
      WHEN 'BLOCKED' THEN 'BLOCKED'
      WHEN 'BARRIER_REQUIRED' THEN 'BARRIER_REQUIRED'
    END
  THEN
    RAISE EXCEPTION 'APPROVAL_ROUTING_BACKFILL_BATCH_STATUS_INVALID';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "ApprovalRoutingBackfillRun_transition_guard_trg"
BEFORE INSERT OR UPDATE ON "ApprovalRoutingBackfillRun"
FOR EACH ROW EXECUTE FUNCTION validate_approval_routing_backfill_run_transition();
ALTER TABLE "ApprovalRoutingBackfillRun"
  ENABLE ALWAYS TRIGGER "ApprovalRoutingBackfillRun_transition_guard_trg";

CREATE OR REPLACE FUNCTION validate_approval_routing_backfill_batch_commit()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  run_row public."ApprovalRoutingBackfillRun"%ROWTYPE;
  prior_receipt CHAR(64);
  observed_blockers BIGINT;
BEGIN
  SELECT * INTO run_row FROM public."ApprovalRoutingBackfillRun" WHERE "id" = NEW."runId";
  IF NOT FOUND
    OR run_row."tenantId" IS DISTINCT FROM NEW."tenantId"
    OR run_row."companyId" IS DISTINCT FROM NEW."companyId"
    OR run_row."fencingToken" IS DISTINCT FROM NEW."fencingToken"
    OR run_row."nextBatchSequence" IS DISTINCT FROM NEW."batchSequence" + 1
    OR run_row."previousReceiptHash" IS DISTINCT FROM NEW."receiptHash"
  THEN
    RAISE EXCEPTION 'APPROVAL_ROUTING_BACKFILL_BATCH_NOT_CHECKPOINTED';
  END IF;

  IF NEW."batchSequence" = 1 THEN
    prior_receipt := NULL;
  ELSE
    SELECT "receiptHash" INTO prior_receipt
    FROM public."ApprovalRoutingBackfillBatch"
    WHERE "runId" = NEW."runId" AND "batchSequence" = NEW."batchSequence" - 1;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'APPROVAL_ROUTING_BACKFILL_RECEIPT_PREDECESSOR_MISSING';
    END IF;
  END IF;
  IF NEW."previousReceiptHash" IS DISTINCT FROM prior_receipt THEN
    RAISE EXCEPTION 'APPROVAL_ROUTING_BACKFILL_RECEIPT_CHAIN_INVALID';
  END IF;

  SELECT COUNT(*) INTO observed_blockers
  FROM public."ApprovalRoutingBackfillBlockerObservation"
  WHERE "batchId" = NEW."id";
  IF observed_blockers IS DISTINCT FROM NEW."blockerCount" THEN
    RAISE EXCEPTION 'APPROVAL_ROUTING_BACKFILL_BLOCKER_COUNT_MISMATCH';
  END IF;

  IF (NEW."outcome" = 'BLOCKED' AND run_row."status" <> 'BLOCKED')
    OR (NEW."outcome" = 'BARRIER_REQUIRED' AND run_row."status" <> 'BARRIER_REQUIRED')
    OR (NEW."outcome" = 'CONTINUE' AND run_row."status" <> 'ACTIVE')
  THEN
    RAISE EXCEPTION 'APPROVAL_ROUTING_BACKFILL_OUTCOME_STATUS_MISMATCH';
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER "ApprovalRoutingBackfillBatch_commit_guard_trg"
AFTER INSERT ON "ApprovalRoutingBackfillBatch"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION validate_approval_routing_backfill_batch_commit();
ALTER TABLE "ApprovalRoutingBackfillBatch"
  ENABLE ALWAYS TRIGGER "ApprovalRoutingBackfillBatch_commit_guard_trg";

CREATE OR REPLACE FUNCTION validate_approval_routing_backfill_blocker_insert()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  batch_pass INTEGER;
BEGIN
  SELECT "passNo" INTO batch_pass
  FROM public."ApprovalRoutingBackfillBatch"
  WHERE "id" = NEW."batchId"
    AND "runId" = NEW."runId"
    AND "tenantId" = NEW."tenantId"
    AND "companyId" = NEW."companyId";
  IF NOT FOUND OR batch_pass IS DISTINCT FROM NEW."passNo" THEN
    RAISE EXCEPTION 'APPROVAL_ROUTING_BACKFILL_BLOCKER_BATCH_MISMATCH';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "ApprovalRoutingBackfillBlocker_insert_guard_trg"
BEFORE INSERT ON "ApprovalRoutingBackfillBlockerObservation"
FOR EACH ROW EXECUTE FUNCTION validate_approval_routing_backfill_blocker_insert();
ALTER TABLE "ApprovalRoutingBackfillBlockerObservation"
  ENABLE ALWAYS TRIGGER "ApprovalRoutingBackfillBlocker_insert_guard_trg";

CREATE OR REPLACE FUNCTION reject_approval_routing_backfill_evidence_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  RAISE EXCEPTION USING
    ERRCODE = '55000',
    MESSAGE = format('%s is append-only; %s is prohibited', TG_TABLE_NAME, TG_OP);
END;
$$;

CREATE TRIGGER "ApprovalRoutingBackfillBatch_append_only_guard_trg"
BEFORE UPDATE OR DELETE ON "ApprovalRoutingBackfillBatch"
FOR EACH ROW EXECUTE FUNCTION reject_approval_routing_backfill_evidence_mutation();
CREATE TRIGGER "ApprovalRoutingBackfillBatch_truncate_guard_trg"
BEFORE TRUNCATE ON "ApprovalRoutingBackfillBatch"
FOR EACH STATEMENT EXECUTE FUNCTION reject_approval_routing_backfill_evidence_mutation();
CREATE TRIGGER "ApprovalRoutingBackfillBlocker_append_only_guard_trg"
BEFORE UPDATE OR DELETE ON "ApprovalRoutingBackfillBlockerObservation"
FOR EACH ROW EXECUTE FUNCTION reject_approval_routing_backfill_evidence_mutation();
CREATE TRIGGER "ApprovalRoutingBackfillBlocker_truncate_guard_trg"
BEFORE TRUNCATE ON "ApprovalRoutingBackfillBlockerObservation"
FOR EACH STATEMENT EXECUTE FUNCTION reject_approval_routing_backfill_evidence_mutation();

ALTER TABLE "ApprovalRoutingBackfillBatch" ENABLE ALWAYS TRIGGER "ApprovalRoutingBackfillBatch_append_only_guard_trg";
ALTER TABLE "ApprovalRoutingBackfillBatch" ENABLE ALWAYS TRIGGER "ApprovalRoutingBackfillBatch_truncate_guard_trg";
ALTER TABLE "ApprovalRoutingBackfillBlockerObservation" ENABLE ALWAYS TRIGGER "ApprovalRoutingBackfillBlocker_append_only_guard_trg";
ALTER TABLE "ApprovalRoutingBackfillBlockerObservation" ENABLE ALWAYS TRIGGER "ApprovalRoutingBackfillBlocker_truncate_guard_trg";

REVOKE ALL ON TABLE "ApprovalRoutingBackfillRun" FROM PUBLIC;
REVOKE ALL ON TABLE "ApprovalRoutingBackfillBatch" FROM PUBLIC;
REVOKE ALL ON TABLE "ApprovalRoutingBackfillBlockerObservation" FROM PUBLIC;
REVOKE ALL ON FUNCTION validate_approval_routing_backfill_run_transition() FROM PUBLIC;
REVOKE ALL ON FUNCTION validate_approval_routing_backfill_batch_commit() FROM PUBLIC;
REVOKE ALL ON FUNCTION validate_approval_routing_backfill_blocker_insert() FROM PUBLIC;
REVOKE ALL ON FUNCTION reject_approval_routing_backfill_evidence_mutation() FROM PUBLIC;

COMMIT;
