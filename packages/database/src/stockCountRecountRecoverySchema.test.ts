import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const migration = readFileSync(
  fileURLToPath(new URL(
    "../prisma/migrations/20260731140000_stock_count_recount_recovery_foundation/migration.sql",
    import.meta.url,
  )),
  "utf8",
);
const schema = readFileSync(
  fileURLToPath(new URL("../prisma/schema.prisma", import.meta.url)),
  "utf8",
);
const reconcileRoles = readFileSync(
  fileURLToPath(new URL(
    "../../../infra/hostinger/postgres/reconcile-ownership-and-grants.sql",
    import.meta.url,
  )),
  "utf8",
);
const verifyRoles = readFileSync(
  fileURLToPath(new URL(
    "../../../infra/hostinger/postgres/verify-role-contract.sql",
    import.meta.url,
  )),
  "utf8",
);

describe("DEC-0264 immutable recount recovery database foundation", () => {
  test("models the immutable transition and approved-unposted void evidence", () => {
    expect(schema).toContain("model StockCountRecountTransition {");
    for (const field of [
      "sourceAttemptId",
      "successorAttemptId",
      "linkedStockAdjustmentId",
      "adjustmentDisposition",
      "cutoffDisposition",
      "idempotencyKey",
      "requestCanonicalJson",
      "requestHash",
      "actorUserId",
      "authSessionId",
      "mfaVerifiedAt",
      "controlledEvidenceQualificationId",
      "reviewConfigurationRevisionId",
      "reviewConfigurationDigest",
      "reviewActivationEventId",
      "reviewActivationGeneration",
    ]) expect(schema).toContain(field);
    expect(schema).toContain("voidedForRecountByUserId");
    expect(schema).toContain("voidedForRecountEvidenceReference");
  });

  test("enforces one transition per source and successor plus scoped idempotency", () => {
    expect(migration).toContain('UNIQUE ("sourceAttemptId")');
    expect(migration).toContain('UNIQUE ("successorAttemptId")');
    expect(migration).toContain('UNIQUE ("tenantId", "companyId", "idempotencyKey")');
    expect(migration).toContain('"requestHash" ~ \'^[0-9a-f]{64}$\'');
  });

  test("requires an exact reviewed source and always-new draft successor", () => {
    expect(migration).toContain('source_row."status" <> \'REVIEWED\'');
    expect(migration).toContain('successor_row."attemptNumber" <> source_row."attemptNumber" + 1');
    expect(migration).toContain('successor_row."status" <> \'DRAFT\'');
    expect(migration).toContain('successor_row."blindCount" IS DISTINCT FROM source_row."blindCount"');
    expect(migration).toContain('successor_row."freezeMovements" IS DISTINCT FROM source_row."freezeMovements"');
    expect(migration).toContain('successor_row."cutoffAt" IS NOT NULL');
    expect(migration).toContain('l."stockCountAttemptId" = successor_row."id"');
    expect(migration).toContain('"cutoffDisposition" = \'NEW_CUTOFF\'');
    expect(migration).toContain('"StockCountAttempt_one_open_per_session_key"');
  });

  test("fails closed unless the actor has the exact active MFA session", () => {
    expect(migration).toContain('auth_row."userId" IS DISTINCT FROM NEW."actorUserId"');
    expect(migration).toContain('auth_row."status" <> \'ACTIVE\'');
    expect(migration).toContain('auth_row."assuranceLevel" <> \'MFA\'');
    expect(migration).toContain('NEW."mfaVerifiedAt" IS DISTINCT FROM auth_row."mfaAuthenticatedAt"');
    expect(migration).toContain('auth_row."revokedAt" IS NOT NULL');
  });

  test("pins the exact active typed stock-count review authority and count endpoint", () => {
    expect(migration).toContain("StockCountRecountTransition_review_revision_exact_fkey");
    expect(migration).toContain("StockCountRecountTransition_review_activation_exact_fkey");
    expect(migration).toContain('"reviewActivationFamily" = \'StockCountAttemptReview\'');
    expect(migration).toContain('"reviewActivationStatus" = \'ACTIVE\'');
    expect(migration).toContain('activation."currentActivationEventId" = NEW."reviewActivationEventId"');
    expect(migration).toContain('activation."configurationDigest" = NEW."reviewConfigurationDigest"');
    expect(migration).toContain('activation.generation = NEW."reviewActivationGeneration"');
    expect(migration).toContain("endpoint.capability = 'COUNT_LOCATION'");
    expect(migration).toContain("Active stock-count review authority is not exact for recount recovery");
  });

  test("requires one exact-scope dormant controlled-evidence qualification without duplicating selections", () => {
    const recountModel = schema.match(/model StockCountRecountTransition \{[\s\S]*?\n\}/)?.[0];
    expect(recountModel).toBeDefined();
    expect(schema).toContain("controlledEvidenceQualificationId String  @unique @db.Uuid");
    expect(schema).toContain("StockCountRecountTransition_evidence_qualification_exact_fkey");
    expect(migration).toContain('"controlledEvidenceQualificationId" UUID NOT NULL');
    expect(migration).toContain('UNIQUE ("controlledEvidenceQualificationId")');
    expect(migration).toContain('UNIQUE ("controlledEvidenceQualificationId", "tenantId", "companyId")');
    expect(migration).toContain('FOREIGN KEY ("controlledEvidenceQualificationId", "tenantId", "companyId")');
    expect(migration).toContain('JOIN "ControlledEvidenceActionQualification" qualification');
    expect(migration).toContain("qualification.\"actionCode\" = 'STOCK_COUNT_RECOUNT_RECOVERY'");
    expect(migration).toContain("qualification.\"sourceType\" = 'StockCountAttempt'");
    expect(migration).toContain('qualification.\"sourceRecordId\" = NEW.\"sourceAttemptId\"');
    expect(migration).toContain('qualification.\"actorAuthSessionId\" = NEW.\"authSessionId\"');
    expect(migration).toContain('qualification.\"idempotencyKey\" = NEW.\"idempotencyKey\"');
    expect(migration).toContain("Controlled evidence qualification is required for recount recovery");
    expect(recountModel).not.toContain("controlledEvidenceActionSelections");
    expect(migration).not.toContain('CREATE TABLE "StockCountRecountTransitionSelection"');
  });

  test("allows only terminal adjustment dispositions before recount", () => {
    for (const disposition of [
      "NONE",
      "CANCELLED_UNPOSTED",
      "VOIDED_APPROVED_UNPOSTED",
      "REVERSED_POSTED",
    ]) expect(migration).toContain(`'${disposition}'`);
    expect(migration).toContain("Stock adjustment disposition is not terminal and recount-safe");
    expect(migration).toContain("Stock-count recount requires one unambiguous adjustment disposition");
    expect(migration).toContain('l."postedMovementId" IS NOT NULL');
    expect(migration).toContain('adjustment_row."postedByUserId" IS NOT NULL');
    expect(migration).toContain('adjustment_row."reversedByUserId" IS NULL');
    expect(migration).toContain('reversal."reversalOfMovementId" = original."id"');
    expect(migration).toContain('reversal."quantityDeltaBaseUom" = -original."quantityDeltaBaseUom"');
  });

  test("makes transition evidence append-only and validates atomic commit state", () => {
    expect(migration).toContain('BEFORE UPDATE OR DELETE ON "StockCountRecountTransition"');
    expect(migration).toContain("FOR EACH STATEMENT");
    expect(migration).toContain("DEFERRABLE INITIALLY DEFERRED");
    expect(migration).toContain('s."status" = \'RECOUNT_REQUESTED\'');
    expect(migration).toContain('s."currentAttemptId" = successor."id"');
    expect(migration).not.toMatch(/DISABLE\s+TRIGGER/i);
    expect(migration).not.toMatch(/SECURITY\s+DEFINER/i);
  });

  test("restricts approved adjustment voiding to a no-movement atomic transition", () => {
    expect(migration).toContain('OLD."status" = \'APPROVED\' AND NEW."status" = \'VOIDED_FOR_RECOUNT\'');
    expect(migration).toContain('"adjustmentType" = \'COUNT_VARIANCE\'');
    expect(migration).toContain("Recount-voided adjustment lacks its immutable transition");
    expect(migration).toContain("Recount-voided stock adjustment is immutable");
    expect(migration).toContain('adjustment_row."voidedForRecountByUserId" IS DISTINCT FROM NEW."actorUserId"');
  });

  test("prevents recount attempts from claiming migrated attempt-one lines", () => {
    expect(migration).toContain('NEW."legacyStockCountLineId" IS NOT NULL');
    expect(migration).toContain('a."attemptNumber" > 1');
    expect(migration).toContain("Recount attempt lines cannot claim legacy attempt-1 lineage");
  });

  test("keeps runtime authority append-only in both role contracts", () => {
    expect(reconcileRoles).toContain("'StockCountRecountTransition'");
    expect(verifyRoles).toContain("'StockCountRecountTransition'");
    expect(reconcileRoles).toContain("GRANT SELECT, INSERT ON TABLE public.%I");
    expect(verifyRoles).toContain("destructive effective column privilege");
  });
});
