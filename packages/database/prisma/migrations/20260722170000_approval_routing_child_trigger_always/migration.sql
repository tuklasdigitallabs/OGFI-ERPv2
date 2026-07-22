-- Ensure every DEC-0050 approval-routing child integrity trigger also runs
-- under replication-role paths. Trigger bodies and routing semantics are
-- unchanged from 20260722140000.

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

ALTER TABLE "ApprovalInstanceStep"
  ENABLE ALWAYS TRIGGER "ApprovalInstanceStep_routing_context_trg";

ALTER TABLE "ApprovalInstanceStepScopeGroup"
  ENABLE ALWAYS TRIGGER "ApprovalStepScopeGroup_immutable_trg";

ALTER TABLE "ApprovalInstanceStepScopeTarget"
  ENABLE ALWAYS TRIGGER "ApprovalStepScopeTarget_context_trg";
ALTER TABLE "ApprovalInstanceStepScopeTarget"
  ENABLE ALWAYS TRIGGER "ApprovalStepScopeTarget_immutable_trg";

ALTER TABLE "ApprovalInstanceStepProhibitedActor"
  ENABLE ALWAYS TRIGGER "ApprovalStepProhibitedActor_context_trg";
ALTER TABLE "ApprovalInstanceStepProhibitedActor"
  ENABLE ALWAYS TRIGGER "ApprovalStepProhibitedActor_immutable_trg";

COMMIT;
