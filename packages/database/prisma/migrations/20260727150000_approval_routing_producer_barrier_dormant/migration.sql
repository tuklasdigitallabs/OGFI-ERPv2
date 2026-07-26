-- DEC-0247 dormant producer-barrier foundation only.
-- This migration creates no generation, provenance, readiness, activation, or
-- result rows and grants no evidence-table authority.

BEGIN;

CREATE TABLE "ApprovalRoutingProducerBarrierGeneration" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL,
  "companyId" UUID NOT NULL,
  "generationNumber" BIGINT NOT NULL,
  "state" VARCHAR(16) NOT NULL DEFAULT 'DORMANT',
  "routingSchemaVersion" INTEGER NOT NULL DEFAULT 1,
  "routingMappingVersion" VARCHAR(64) NOT NULL,
  "routingMappingHash" CHAR(64) NOT NULL,
  "capabilityVersion" VARCHAR(64) NOT NULL,
  "capabilityHash" CHAR(64) NOT NULL,
  "releaseIdentity" VARCHAR(128) NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT "ApprovalProducerBarrierGeneration_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ApprovalProducerBarrierGeneration_dormant_check" CHECK ("state" = 'DORMANT'),
  CONSTRAINT "ApprovalProducerBarrierGeneration_number_check" CHECK ("generationNumber" > 0),
  CONSTRAINT "ApprovalProducerBarrierGeneration_schema_check" CHECK ("routingSchemaVersion" = 1),
  CONSTRAINT "ApprovalProducerBarrierGeneration_identity_check" CHECK (
    BTRIM("routingMappingVersion") <> ''
    AND "routingMappingHash" ~ '^[0-9a-f]{64}$'
    AND BTRIM("capabilityVersion") <> ''
    AND "capabilityHash" ~ '^[0-9a-f]{64}$'
    AND BTRIM("releaseIdentity") <> ''
  ),
  CONSTRAINT "ApprovalProducerBarrierGeneration_tenant_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ApprovalProducerBarrierGeneration_company_scope_fkey"
    FOREIGN KEY ("companyId", "tenantId") REFERENCES "Company"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ApprovalProducerBarrierGeneration_scope_key"
  ON "ApprovalRoutingProducerBarrierGeneration"("id", "tenantId", "companyId");
CREATE UNIQUE INDEX "ApprovalProducerBarrierGeneration_number_key"
  ON "ApprovalRoutingProducerBarrierGeneration"("tenantId", "companyId", "generationNumber");
CREATE INDEX "ApprovalProducerBarrierGeneration_scope_created_idx"
  ON "ApprovalRoutingProducerBarrierGeneration"("tenantId", "companyId", "createdAt");

CREATE TABLE "ApprovalRoutingProducerProvenance" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL,
  "companyId" UUID NOT NULL,
  "generationId" UUID NOT NULL,
  "approvalInstanceId" UUID NOT NULL,
  "documentType" VARCHAR(128) NOT NULL,
  "documentId" UUID NOT NULL,
  "routingSchemaVersion" INTEGER NOT NULL DEFAULT 1,
  "routingMappingVersion" VARCHAR(64) NOT NULL,
  "routingMappingHash" CHAR(64) NOT NULL,
  "capabilityVersion" VARCHAR(64) NOT NULL,
  "capabilityHash" CHAR(64) NOT NULL,
  "releaseIdentity" VARCHAR(128) NOT NULL,
  "sourceTransactionId" NUMERIC(20,0) NOT NULL DEFAULT (pg_current_xact_id()::text)::numeric,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT "ApprovalProducerProvenance_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ApprovalProducerProvenance_schema_check" CHECK ("routingSchemaVersion" = 1),
  CONSTRAINT "ApprovalProducerProvenance_family_check" CHECK ("documentType" IN (
    'PurchaseRequest', 'QuotationRecommendation', 'PurchaseOrder',
    'PurchaseOrderBalanceClosure', 'PurchaseOrderAmendment', 'WastageReport',
    'StockAdjustment', 'FinanceCloseRun', 'BudgetRevision', 'ExpenseRequest',
    'CashAdvanceRequest', 'PettyCashRequest', 'PaymentRequest', 'PaymentRelease',
    'EmployeeLeaveRequest', 'EmployeeOvertimeRecord', 'WorkforceSchedule',
    'AttendanceImportBatch'
  )),
  CONSTRAINT "ApprovalProducerProvenance_identity_check" CHECK (
    BTRIM("routingMappingVersion") <> ''
    AND "routingMappingHash" ~ '^[0-9a-f]{64}$'
    AND BTRIM("capabilityVersion") <> ''
    AND "capabilityHash" ~ '^[0-9a-f]{64}$'
    AND BTRIM("releaseIdentity") <> ''
    AND "sourceTransactionId" > 0
  ),
  CONSTRAINT "ApprovalProducerProvenance_tenant_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ApprovalProducerProvenance_company_scope_fkey"
    FOREIGN KEY ("companyId", "tenantId") REFERENCES "Company"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ApprovalProducerProvenance_generation_scope_fkey"
    FOREIGN KEY ("generationId", "tenantId", "companyId")
    REFERENCES "ApprovalRoutingProducerBarrierGeneration"("id", "tenantId", "companyId")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ApprovalProducerProvenance_instance_scope_fkey"
    FOREIGN KEY ("approvalInstanceId", "tenantId", "companyId")
    REFERENCES "ApprovalInstance"("id", "tenantId", "companyId")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ApprovalProducerProvenance_instance_key"
  ON "ApprovalRoutingProducerProvenance"("approvalInstanceId", "tenantId", "companyId");
CREATE INDEX "ApprovalProducerProvenance_generation_idx"
  ON "ApprovalRoutingProducerProvenance"("generationId", "tenantId", "companyId");
CREATE INDEX "ApprovalProducerProvenance_document_idx"
  ON "ApprovalRoutingProducerProvenance"("tenantId", "companyId", "documentType", "documentId");

CREATE OR REPLACE FUNCTION acquire_approval_routing_producer_barrier_shared(
  scope_tenant_id UUID,
  scope_company_id UUID,
  producer_document_type TEXT
)
RETURNS void
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  barrier_lock_key BIGINT;
BEGIN
  IF scope_tenant_id IS NULL OR scope_company_id IS NULL OR NOT EXISTS (
    SELECT 1
      FROM public."Company" company
     WHERE company."id" = scope_company_id
       AND company."tenantId" = scope_tenant_id
  ) THEN
    RAISE EXCEPTION 'APPROVAL_ROUTING_PRODUCER_BARRIER_SCOPE_INVALID'
      USING ERRCODE = '55000';
  END IF;

  IF producer_document_type IS NULL OR producer_document_type NOT IN (
    'PurchaseRequest', 'QuotationRecommendation', 'PurchaseOrder',
    'PurchaseOrderBalanceClosure', 'PurchaseOrderAmendment', 'WastageReport',
    'StockAdjustment', 'FinanceCloseRun', 'BudgetRevision', 'ExpenseRequest',
    'CashAdvanceRequest', 'PettyCashRequest', 'PaymentRequest', 'PaymentRelease',
    'EmployeeLeaveRequest', 'EmployeeOvertimeRecord', 'WorkforceSchedule',
    'AttendanceImportBatch'
  ) THEN
    RAISE EXCEPTION 'APPROVAL_ROUTING_PRODUCER_FAMILY_UNSUPPORTED'
      USING ERRCODE = '55000';
  END IF;

  barrier_lock_key := pg_catalog.hashtextextended(
    'ogfi:approval-routing-producer-barrier:v1:'
      || scope_tenant_id::text || ':' || scope_company_id::text,
    6510615555426900570::bigint
  );

  IF NOT pg_catalog.pg_try_advisory_xact_lock_shared(barrier_lock_key) THEN
    RAISE EXCEPTION 'APPROVAL_ROUTING_PRODUCER_BARRIER_RETRY'
      USING ERRCODE = '40001';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION acquire_approval_routing_graph_barrier_shared()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  old_tenant_id UUID;
  old_company_id UUID;
  old_document_type TEXT;
  new_tenant_id UUID;
  new_company_id UUID;
  new_document_type TEXT;
  related_ids UUID[];
  barrier_scope RECORD;
BEGIN
  IF TG_TABLE_NAME = 'ApprovalInstance' THEN
    IF TG_OP <> 'INSERT' THEN
      old_tenant_id := OLD."tenantId";
      old_company_id := OLD."companyId";
      old_document_type := OLD."documentType";
    END IF;
    IF TG_OP <> 'DELETE' THEN
      new_tenant_id := NEW."tenantId";
      new_company_id := NEW."companyId";
      new_document_type := NEW."documentType";
    END IF;

    FOR barrier_scope IN
      SELECT DISTINCT candidate.tenant_id, candidate.company_id, candidate.document_type,
             pg_catalog.hashtextextended(
               'ogfi:approval-routing-producer-barrier:v1:'
                 || candidate.tenant_id::text || ':' || candidate.company_id::text,
               6510615555426900570::bigint
             ) AS lock_key
        FROM (VALUES
          (old_tenant_id, old_company_id, old_document_type),
          (new_tenant_id, new_company_id, new_document_type)
        ) AS candidate(tenant_id, company_id, document_type)
       WHERE candidate.document_type IN (
         'PurchaseRequest', 'QuotationRecommendation', 'PurchaseOrder',
         'PurchaseOrderBalanceClosure', 'PurchaseOrderAmendment', 'WastageReport',
         'StockAdjustment', 'FinanceCloseRun', 'BudgetRevision', 'ExpenseRequest',
         'CashAdvanceRequest', 'PettyCashRequest', 'PaymentRequest', 'PaymentRelease',
         'EmployeeLeaveRequest', 'EmployeeOvertimeRecord', 'WorkforceSchedule',
         'AttendanceImportBatch'
       )
       ORDER BY lock_key
    LOOP
      PERFORM public.acquire_approval_routing_producer_barrier_shared(
        barrier_scope.tenant_id,
        barrier_scope.company_id,
        barrier_scope.document_type
      );
    END LOOP;
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'ApprovalInstanceStep' THEN
    related_ids := CASE TG_OP
      WHEN 'INSERT' THEN ARRAY[NEW."approvalInstanceId"]
      WHEN 'DELETE' THEN ARRAY[OLD."approvalInstanceId"]
      ELSE ARRAY[OLD."approvalInstanceId", NEW."approvalInstanceId"]
    END;
  ELSIF TG_TABLE_NAME = 'ApprovalInstanceStepScopeGroup' THEN
    related_ids := CASE TG_OP
      WHEN 'INSERT' THEN ARRAY[NEW."approvalInstanceStepId"]
      WHEN 'DELETE' THEN ARRAY[OLD."approvalInstanceStepId"]
      ELSE ARRAY[OLD."approvalInstanceStepId", NEW."approvalInstanceStepId"]
    END;
  ELSIF TG_TABLE_NAME = 'ApprovalInstanceStepScopeTarget' THEN
    related_ids := CASE TG_OP
      WHEN 'INSERT' THEN ARRAY[NEW."scopeGroupId"]
      WHEN 'DELETE' THEN ARRAY[OLD."scopeGroupId"]
      ELSE ARRAY[OLD."scopeGroupId", NEW."scopeGroupId"]
    END;
  ELSIF TG_TABLE_NAME = 'ApprovalInstanceStepProhibitedActor' THEN
    related_ids := CASE TG_OP
      WHEN 'INSERT' THEN ARRAY[NEW."approvalInstanceStepId"]
      WHEN 'DELETE' THEN ARRAY[OLD."approvalInstanceStepId"]
      ELSE ARRAY[OLD."approvalInstanceStepId", NEW."approvalInstanceStepId"]
    END;
  ELSIF TG_TABLE_NAME = 'ApprovalRoutingProducerProvenance' THEN
    IF TG_OP <> 'INSERT' THEN
      old_tenant_id := OLD."tenantId";
      old_company_id := OLD."companyId";
      old_document_type := OLD."documentType";
    END IF;
    IF TG_OP <> 'DELETE' THEN
      new_tenant_id := NEW."tenantId";
      new_company_id := NEW."companyId";
      new_document_type := NEW."documentType";
    END IF;
    FOR barrier_scope IN
      SELECT DISTINCT candidate.tenant_id, candidate.company_id, candidate.document_type,
             pg_catalog.hashtextextended(
               'ogfi:approval-routing-producer-barrier:v1:'
                 || candidate.tenant_id::text || ':' || candidate.company_id::text,
               6510615555426900570::bigint
             ) AS lock_key
        FROM (VALUES
          (old_tenant_id, old_company_id, old_document_type),
          (new_tenant_id, new_company_id, new_document_type)
        ) AS candidate(tenant_id, company_id, document_type)
       WHERE candidate.document_type IS NOT NULL
       ORDER BY lock_key
    LOOP
      PERFORM public.acquire_approval_routing_producer_barrier_shared(
        barrier_scope.tenant_id,
        barrier_scope.company_id,
        barrier_scope.document_type
      );
    END LOOP;
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  ELSE
    RAISE EXCEPTION 'APPROVAL_ROUTING_PRODUCER_BARRIER_TRIGGER_TABLE_INVALID'
      USING ERRCODE = '55000';
  END IF;

  FOR barrier_scope IN
    SELECT DISTINCT instance."tenantId" AS tenant_id,
                    instance."companyId" AS company_id,
                    instance."documentType" AS document_type,
                    pg_catalog.hashtextextended(
                      'ogfi:approval-routing-producer-barrier:v1:'
                        || instance."tenantId"::text || ':' || instance."companyId"::text,
                      6510615555426900570::bigint
                    ) AS lock_key
      FROM public."ApprovalInstance" instance
      LEFT JOIN public."ApprovalInstanceStep" step
        ON step."approvalInstanceId" = instance."id"
      LEFT JOIN public."ApprovalInstanceStepScopeGroup" scope_group
        ON scope_group."approvalInstanceStepId" = step."id"
     WHERE (
       (TG_TABLE_NAME = 'ApprovalInstanceStep'
        AND instance."id" = ANY(related_ids))
       OR (TG_TABLE_NAME = 'ApprovalInstanceStepProhibitedActor'
        AND step."id" = ANY(related_ids))
       OR (TG_TABLE_NAME = 'ApprovalInstanceStepScopeGroup'
        AND step."id" = ANY(related_ids))
       OR (TG_TABLE_NAME = 'ApprovalInstanceStepScopeTarget'
        AND scope_group."id" = ANY(related_ids))
     )
       AND instance."documentType" IN (
         'PurchaseRequest', 'QuotationRecommendation', 'PurchaseOrder',
         'PurchaseOrderBalanceClosure', 'PurchaseOrderAmendment', 'WastageReport',
         'StockAdjustment', 'FinanceCloseRun', 'BudgetRevision', 'ExpenseRequest',
         'CashAdvanceRequest', 'PettyCashRequest', 'PaymentRequest', 'PaymentRelease',
         'EmployeeLeaveRequest', 'EmployeeOvertimeRecord', 'WorkforceSchedule',
         'AttendanceImportBatch'
       )
     ORDER BY lock_key
  LOOP
    PERFORM public.acquire_approval_routing_producer_barrier_shared(
      barrier_scope.tenant_id,
      barrier_scope.company_id,
      barrier_scope.document_type
    );
  END LOOP;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION validate_approval_routing_provenance_lineage()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  generation public."ApprovalRoutingProducerBarrierGeneration"%ROWTYPE;
  instance public."ApprovalInstance"%ROWTYPE;
BEGIN
  SELECT * INTO STRICT generation
    FROM public."ApprovalRoutingProducerBarrierGeneration"
   WHERE "id" = NEW."generationId"
     AND "tenantId" = NEW."tenantId"
     AND "companyId" = NEW."companyId";

  SELECT * INTO STRICT instance
    FROM public."ApprovalInstance"
   WHERE "id" = NEW."approvalInstanceId"
     AND "tenantId" = NEW."tenantId"
     AND "companyId" = NEW."companyId";

  IF generation."state" <> 'DORMANT'
    OR NEW."documentType" IS DISTINCT FROM instance."documentType"
    OR NEW."documentId" IS DISTINCT FROM instance."documentId"
    OR NEW."routingSchemaVersion" IS DISTINCT FROM generation."routingSchemaVersion"
    OR NEW."routingMappingVersion" IS DISTINCT FROM generation."routingMappingVersion"
    OR NEW."routingMappingHash" IS DISTINCT FROM generation."routingMappingHash"
    OR NEW."capabilityVersion" IS DISTINCT FROM generation."capabilityVersion"
    OR NEW."capabilityHash" IS DISTINCT FROM generation."capabilityHash"
    OR NEW."releaseIdentity" IS DISTINCT FROM generation."releaseIdentity"
    OR NEW."sourceTransactionId" IS DISTINCT FROM (pg_current_xact_id()::text)::numeric
  THEN
    RAISE EXCEPTION 'APPROVAL_ROUTING_PRODUCER_PROVENANCE_LINEAGE_INVALID'
      USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
EXCEPTION
  WHEN NO_DATA_FOUND THEN
    RAISE EXCEPTION 'APPROVAL_ROUTING_PRODUCER_PROVENANCE_LINEAGE_INVALID'
      USING ERRCODE = '55000';
END;
$$;

CREATE OR REPLACE FUNCTION reject_approval_routing_producer_evidence_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  RAISE EXCEPTION '% is append-only; % is prohibited', TG_TABLE_NAME, TG_OP
    USING ERRCODE = '55000';
END;
$$;

-- Dormancy is a database invariant, not only an ACL convention. Even the
-- controlled owner and replication-role sessions cannot create a generation or
-- provenance fact until a later governed migration replaces this fail-closed
-- guard with the exact authorized writer boundary.
CREATE OR REPLACE FUNCTION reject_dormant_approval_routing_evidence_insert()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  RAISE EXCEPTION 'APPROVAL_ROUTING_PRODUCER_BARRIER_DORMANT_INSERT_PROHIBITED'
    USING ERRCODE = '55000';
END;
$$;

-- The exact complete-v1 validator is structurally dormant. ACTIVE is not a
-- representable generation state and the false WHEN predicate queues no events.
-- A later governed activation migration must replace both the state contract and
-- this fail-closed placeholder; this slice has no positive/readiness branch.
CREATE OR REPLACE FUNCTION reject_dormant_approval_routing_validator_execution()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  RAISE EXCEPTION 'APPROVAL_ROUTING_PRODUCER_VALIDATOR_DORMANT'
    USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER "00_approval_producer_barrier_lock_trg"
  BEFORE INSERT OR UPDATE OR DELETE ON "ApprovalInstance"
  FOR EACH ROW EXECUTE FUNCTION acquire_approval_routing_graph_barrier_shared();
ALTER TABLE "ApprovalInstance" ENABLE ALWAYS TRIGGER "00_approval_producer_barrier_lock_trg";

CREATE TRIGGER "00_approval_producer_barrier_lock_trg"
  BEFORE INSERT OR UPDATE OR DELETE ON "ApprovalInstanceStep"
  FOR EACH ROW EXECUTE FUNCTION acquire_approval_routing_graph_barrier_shared();
ALTER TABLE "ApprovalInstanceStep" ENABLE ALWAYS TRIGGER "00_approval_producer_barrier_lock_trg";

CREATE TRIGGER "00_approval_producer_barrier_lock_trg"
  BEFORE INSERT OR UPDATE OR DELETE ON "ApprovalInstanceStepScopeGroup"
  FOR EACH ROW EXECUTE FUNCTION acquire_approval_routing_graph_barrier_shared();
ALTER TABLE "ApprovalInstanceStepScopeGroup" ENABLE ALWAYS TRIGGER "00_approval_producer_barrier_lock_trg";

CREATE TRIGGER "00_approval_producer_barrier_lock_trg"
  BEFORE INSERT OR UPDATE OR DELETE ON "ApprovalInstanceStepScopeTarget"
  FOR EACH ROW EXECUTE FUNCTION acquire_approval_routing_graph_barrier_shared();
ALTER TABLE "ApprovalInstanceStepScopeTarget" ENABLE ALWAYS TRIGGER "00_approval_producer_barrier_lock_trg";

CREATE TRIGGER "00_approval_producer_barrier_lock_trg"
  BEFORE INSERT OR UPDATE OR DELETE ON "ApprovalInstanceStepProhibitedActor"
  FOR EACH ROW EXECUTE FUNCTION acquire_approval_routing_graph_barrier_shared();
ALTER TABLE "ApprovalInstanceStepProhibitedActor" ENABLE ALWAYS TRIGGER "00_approval_producer_barrier_lock_trg";

CREATE TRIGGER "00_approval_producer_barrier_lock_trg"
  BEFORE INSERT OR UPDATE OR DELETE ON "ApprovalRoutingProducerProvenance"
  FOR EACH ROW EXECUTE FUNCTION acquire_approval_routing_graph_barrier_shared();
ALTER TABLE "ApprovalRoutingProducerProvenance" ENABLE ALWAYS TRIGGER "00_approval_producer_barrier_lock_trg";

CREATE TRIGGER "ApprovalProvenance_lineage_guard_trg"
  BEFORE INSERT ON "ApprovalRoutingProducerProvenance"
  FOR EACH ROW EXECUTE FUNCTION validate_approval_routing_provenance_lineage();
ALTER TABLE "ApprovalRoutingProducerProvenance" ENABLE ALWAYS TRIGGER "ApprovalProvenance_lineage_guard_trg";

CREATE TRIGGER "ApprovalGeneration_dormant_insert_guard_trg"
  BEFORE INSERT ON "ApprovalRoutingProducerBarrierGeneration"
  FOR EACH STATEMENT EXECUTE FUNCTION reject_dormant_approval_routing_evidence_insert();
ALTER TABLE "ApprovalRoutingProducerBarrierGeneration" ENABLE ALWAYS TRIGGER "ApprovalGeneration_dormant_insert_guard_trg";

CREATE TRIGGER "ApprovalProvenance_dormant_insert_guard_trg"
  BEFORE INSERT ON "ApprovalRoutingProducerProvenance"
  FOR EACH STATEMENT EXECUTE FUNCTION reject_dormant_approval_routing_evidence_insert();
ALTER TABLE "ApprovalRoutingProducerProvenance" ENABLE ALWAYS TRIGGER "ApprovalProvenance_dormant_insert_guard_trg";

CREATE TRIGGER "ApprovalGeneration_append_only_guard_trg"
  BEFORE UPDATE OR DELETE ON "ApprovalRoutingProducerBarrierGeneration"
  FOR EACH STATEMENT EXECUTE FUNCTION reject_approval_routing_producer_evidence_mutation();
ALTER TABLE "ApprovalRoutingProducerBarrierGeneration" ENABLE ALWAYS TRIGGER "ApprovalGeneration_append_only_guard_trg";
CREATE TRIGGER "ApprovalGeneration_truncate_guard_trg"
  BEFORE TRUNCATE ON "ApprovalRoutingProducerBarrierGeneration"
  FOR EACH STATEMENT EXECUTE FUNCTION reject_approval_routing_producer_evidence_mutation();
ALTER TABLE "ApprovalRoutingProducerBarrierGeneration" ENABLE ALWAYS TRIGGER "ApprovalGeneration_truncate_guard_trg";

CREATE TRIGGER "ApprovalProvenance_append_only_guard_trg"
  BEFORE UPDATE OR DELETE ON "ApprovalRoutingProducerProvenance"
  FOR EACH STATEMENT EXECUTE FUNCTION reject_approval_routing_producer_evidence_mutation();
ALTER TABLE "ApprovalRoutingProducerProvenance" ENABLE ALWAYS TRIGGER "ApprovalProvenance_append_only_guard_trg";
CREATE TRIGGER "ApprovalProvenance_truncate_guard_trg"
  BEFORE TRUNCATE ON "ApprovalRoutingProducerProvenance"
  FOR EACH STATEMENT EXECUTE FUNCTION reject_approval_routing_producer_evidence_mutation();
ALTER TABLE "ApprovalRoutingProducerProvenance" ENABLE ALWAYS TRIGGER "ApprovalProvenance_truncate_guard_trg";

CREATE CONSTRAINT TRIGGER "ApprovalInstance_dormant_validator_trg"
  AFTER INSERT OR UPDATE OR DELETE ON "ApprovalInstance"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
  WHEN (false)
  EXECUTE FUNCTION reject_dormant_approval_routing_validator_execution();
ALTER TABLE "ApprovalInstance" ENABLE ALWAYS TRIGGER "ApprovalInstance_dormant_validator_trg";

CREATE CONSTRAINT TRIGGER "ApprovalStep_dormant_validator_trg"
  AFTER INSERT OR UPDATE OR DELETE ON "ApprovalInstanceStep"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
  WHEN (false)
  EXECUTE FUNCTION reject_dormant_approval_routing_validator_execution();
ALTER TABLE "ApprovalInstanceStep" ENABLE ALWAYS TRIGGER "ApprovalStep_dormant_validator_trg";

CREATE CONSTRAINT TRIGGER "ApprovalScopeGroup_dormant_validator_trg"
  AFTER INSERT OR UPDATE OR DELETE ON "ApprovalInstanceStepScopeGroup"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
  WHEN (false)
  EXECUTE FUNCTION reject_dormant_approval_routing_validator_execution();
ALTER TABLE "ApprovalInstanceStepScopeGroup" ENABLE ALWAYS TRIGGER "ApprovalScopeGroup_dormant_validator_trg";

CREATE CONSTRAINT TRIGGER "ApprovalScopeTarget_dormant_validator_trg"
  AFTER INSERT OR UPDATE OR DELETE ON "ApprovalInstanceStepScopeTarget"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
  WHEN (false)
  EXECUTE FUNCTION reject_dormant_approval_routing_validator_execution();
ALTER TABLE "ApprovalInstanceStepScopeTarget" ENABLE ALWAYS TRIGGER "ApprovalScopeTarget_dormant_validator_trg";

CREATE CONSTRAINT TRIGGER "ApprovalProhibitedActor_dormant_validator_trg"
  AFTER INSERT OR UPDATE OR DELETE ON "ApprovalInstanceStepProhibitedActor"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
  WHEN (false)
  EXECUTE FUNCTION reject_dormant_approval_routing_validator_execution();
ALTER TABLE "ApprovalInstanceStepProhibitedActor" ENABLE ALWAYS TRIGGER "ApprovalProhibitedActor_dormant_validator_trg";

CREATE CONSTRAINT TRIGGER "ApprovalProvenance_dormant_validator_trg"
  AFTER INSERT OR UPDATE OR DELETE ON "ApprovalRoutingProducerProvenance"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
  WHEN (false)
  EXECUTE FUNCTION reject_dormant_approval_routing_validator_execution();
ALTER TABLE "ApprovalRoutingProducerProvenance" ENABLE ALWAYS TRIGGER "ApprovalProvenance_dormant_validator_trg";

REVOKE ALL ON TABLE "ApprovalRoutingProducerBarrierGeneration" FROM PUBLIC;
REVOKE ALL ON TABLE "ApprovalRoutingProducerProvenance" FROM PUBLIC;
REVOKE ALL ON FUNCTION acquire_approval_routing_producer_barrier_shared(UUID, UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION acquire_approval_routing_graph_barrier_shared() FROM PUBLIC;
REVOKE ALL ON FUNCTION validate_approval_routing_provenance_lineage() FROM PUBLIC;
REVOKE ALL ON FUNCTION reject_approval_routing_producer_evidence_mutation() FROM PUBLIC;
REVOKE ALL ON FUNCTION reject_dormant_approval_routing_evidence_insert() FROM PUBLIC;
REVOKE ALL ON FUNCTION reject_dormant_approval_routing_validator_execution() FROM PUBLIC;

COMMIT;
