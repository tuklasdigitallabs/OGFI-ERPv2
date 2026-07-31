import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";
import {
  canonicalOpeningInventoryJson,
  openingInventoryDigest,
} from "./openingInventoryCutovers";

describe("opening inventory cutover foundation", () => {
  test("canonicalizes equivalent digest input deterministically", () => {
    const first = { locationId: "location", lines: [{ itemId: "item", qty: 0 }], effectiveAt: new Date("2026-07-31T00:00:00.000Z") };
    const second = { effectiveAt: new Date("2026-07-31T00:00:00.000Z"), lines: [{ qty: 0, itemId: "item" }], locationId: "location" };
    expect(canonicalOpeningInventoryJson(first)).toBe(canonicalOpeningInventoryJson(second));
    expect(openingInventoryDigest(first)).toBe(openingInventoryDigest(second));
  });

  test("binds each location cutover to its own selected immutable evidence", () => {
    const locationOneManifest = [
      { controlledEvidenceAttachmentId: "11111111-1111-4111-8111-111111111111", attachmentId: "a", objectVersionId: "v1", checksum: "a".repeat(64) },
    ];
    const locationTwoManifest = [
      { controlledEvidenceAttachmentId: "22222222-2222-4222-8222-222222222222", attachmentId: "b", objectVersionId: "v2", checksum: "b".repeat(64) },
    ];
    const unrelatedLaterAttachment = { controlledEvidenceAttachmentId: "33333333-3333-4333-8333-333333333333", attachmentId: "c", objectVersionId: "v3", checksum: "c".repeat(64) };

    expect(openingInventoryDigest(locationOneManifest)).not.toBe(openingInventoryDigest(locationTwoManifest));
    expect(openingInventoryDigest(locationOneManifest)).toBe(openingInventoryDigest(locationOneManifest));
    expect(openingInventoryDigest([...locationTwoManifest, unrelatedLaterAttachment])).not.toBe(openingInventoryDigest(locationTwoManifest));
  });

  test("fails closed by source contract for expiry, session, evidence, custody, and command fencing", () => {
    const source = readFileSync(resolve(__dirname, "openingInventoryCutovers.ts"), "utf8");
    expect(source).toContain('AND: [\n        { OR: [{ endsAt: null }, { endsAt: { gt: now } }] }');
    expect(source).toContain('privilegeEpochAtIssue: actor.privilegeEpoch');
    expect(source).toContain('countType !== "OPENING"');
    expect(source).toContain('currentAttemptId !== attempt.id');
    expect(source).toContain('attempt.cutoffAt.getTime() > cohort.effectiveAt.getTime()');
    expect(source).toContain('OPENING_INVENTORY_CUTOVER_WINDOW_NOT_CONFIGURED');
    expect(source).toContain('predecessorCohortId');
    expect(source).toContain('predecessor.status !== "REVERSED"');
    expect(source).toContain('controlledEvidenceAttachmentIds');
    expect(source).toContain('sourceType: "OPENING_INVENTORY_COHORT"');
    expect(source).toContain('evidenceManifestJson: evidenceManifest.canonicalJson');
    expect(source).toContain('cutover.evidenceManifestJson !== evidenceManifest.canonicalJson');
    expect(source).toContain('attachment.scanState !== "CLEAN"');
    expect(source).toContain('attachment.scanVerifiedObjectVersionId !== attachment.objectVersionId');
    expect(source).toContain('quantity > 0 && valuation.unitCost <= 0');
    expect(source).toContain('status: "SEALED"');
    expect(source).toContain('FREEZE_COHORT');
    expect(source).toContain('sealOpeningInventoryCohort');
    expect(source).toContain('getOpeningInventoryFormOptions');
    expect(source).toContain('getOpeningInventoryPreparationFormOptions');
    expect(source).toContain('statusSummary');
    expect(source).toContain('executorSeparated: true');
    expect(source).toContain('sourceVarianceQuantity = line.varianceQuantityBaseUom === null');
    expect(source).toContain('sourceCountedQuantity - sourceSystemQuantity');
    expect(source).toContain('sourceSystemQuantityBaseUom: sourceSystemQuantity');
    expect(source).toContain('sourceCountedQuantityBaseUom: sourceCountedQuantity');
    expect(source).toContain('sourceVarianceQuantityBaseUom: sourceVarianceQuantity');
    expect(source).toContain('requestedMfaValidUntil');
    expect(source).toContain('requiredPermissionCode: requiredPermission');
    expect(source).toContain('requestReason: input.reason');
    expect(source).toContain('const requestedMfaMode = "runtime_mfa"');
    expect(source).toContain("pg_advisory_xact_lock");
    expect(source).toContain('cutover?.status !== "RECONCILED"');
    expect(source).toContain('"RECONCILED", "ACTIVE"');
    expect(source).not.toContain('STAGED_POSTED');
  });

  test("keeps generic stock adjustments out of the opening cutover service", () => {
    const source = readFileSync(resolve(__dirname, "openingInventoryCutovers.ts"), "utf8");
    expect(source).not.toContain("postInventoryMovementInTransaction");
    expect(source).not.toContain("stockBalance.update");
    expect(source).not.toContain("openingInventoryExecutionCommand.update");
  });

  test("serializes semantic command targets and rejects unresolved duplicates", () => {
    const source = readFileSync(resolve(__dirname, "openingInventoryCutovers.ts"), "utf8");
    expect(source).toContain("opening-inventory-command:${cohort.id}:${semanticTarget}:${commandType}");
    expect(source).toContain('FOR UPDATE`');
    expect(source).toContain("OPENING_INVENTORY_COMMAND_IN_FLIGHT");
    expect(source).toContain('status: { in: ["PENDING", "CLAIMED", "FAILED_RETRYABLE"] }');
  });

  test("returns tab-paged minimal command and shared-scope projections", () => {
    const source = readFileSync(resolve(__dirname, "openingInventoryCutovers.ts"), "utf8");
    const detailStart = source.indexOf("export async function getOpeningInventoryCutoverDetail");
    const detailEnd = source.indexOf("export async function getOpeningInventoryFormOptions", detailStart);
    const detail = source.slice(detailStart, detailEnd);

    expect(source).toContain("openingInventoryDetailViewSchema");
    expect(source).toContain("cohortSharedVisible");
    expect(source).toContain("safeOpeningCommandFailureCode");
    expect(detail).toContain("linesPage:");
    expect(detail).toContain("activityPage:");
    expect(detail).toContain("evidencePage:");
    expect(detail).toContain("$queryRaw");
    expect(detail).not.toContain("const activityAll");
    expect(detail).not.toContain("activityAll.slice");
    expect(detail).not.toContain("localAudit");
    expect(detail).not.toContain("cohortEvents");
  });

  test("preflights every command target before command locks and rechecks scope inside the lock window", () => {
    const source = readFileSync(resolve(__dirname, "openingInventoryCutovers.ts"), "utf8");
    const commandStart = source.indexOf("export async function requestOpeningInventoryExecutionCommand");
    const commandEnd = source.indexOf("const cutoverStatusSchema", commandStart);
    const command = source.slice(commandStart, commandEnd);
    const rowLockIndex = command.indexOf("FOR UPDATE");
    const advisoryLockIndex = command.indexOf("pg_advisory_xact_lock");
    const firstLockIndex = Math.min(rowLockIndex, advisoryLockIndex);
    const firstScopeCheckIndex = command.indexOf("await assertLiveScopedPermission");

    expect(firstLockIndex).toBeGreaterThan(-1);
    expect(firstScopeCheckIndex).toBeGreaterThan(-1);
    expect(command.indexOf("const preflightLocations")).toBeLessThan(firstLockIndex);
    expect(firstScopeCheckIndex).toBeLessThan(firstLockIndex);
    expect((command.match(/await assertLiveScopedPermission/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  test("derives evidence selection from an authorized cohort instead of the raw cohort id", () => {
    const source = readFileSync(resolve(__dirname, "openingInventoryCutovers.ts"), "utf8");
    const optionsStart = source.indexOf("export async function getOpeningInventoryFormOptions");
    const optionsEnd = source.indexOf("const preparationFormOptionsSchema", optionsStart);
    const options = source.slice(optionsStart, optionsEnd);
    const evidenceStart = options.indexOf("const evidenceWhere");
    const evidenceEnd = options.indexOf("const [evidenceLinks", evidenceStart);
    const evidenceWhere = options.slice(evidenceStart, evidenceEnd);
    const selectedCohortGuard = options.indexOf("if (selectedCohort)");
    const selectedScopeCheck = options.indexOf(
      "await assertLiveScopedPermission",
      selectedCohortGuard,
    );
    const selectedAssignment = options.indexOf("selectedCohortId = selectedCohort.id");

    expect(options).toContain("const selectedCohort = requestedCohortId");
    expect(options).toContain("cohorts.find((cohort) => cohort.id === requestedCohortId)");
    expect(options).toContain("selectedCohortId = selectedCohort.id");
    expect(selectedCohortGuard).toBeGreaterThan(-1);
    expect(selectedScopeCheck).toBeGreaterThan(selectedCohortGuard);
    expect(selectedScopeCheck).toBeLessThan(selectedAssignment);
    expect(evidenceWhere).toContain("sourceRecordId: selectedCohortId");
    expect(evidenceWhere).not.toContain("input.cohortId");
    expect(evidenceWhere).not.toContain("requestedCohortId");
  });

  test("derives shared detail scope from every sealed revision endpoint and fails closed on malformed evidence", () => {
    const source = readFileSync(resolve(__dirname, "openingInventoryCutovers.ts"), "utf8");
    const detailStart = source.indexOf("export async function getOpeningInventoryCutoverDetail");
    const detailEnd = source.indexOf("export async function getOpeningInventoryFormOptions", detailStart);
    const detail = source.slice(detailStart, detailEnd);

    expect(detail).toContain("configurationRevision");
    expect(detail).toContain("endpointMemberships");
    expect(detail).toContain("OPENING_STOCK_LOCATION");
    expect(detail).not.toContain("const cohortLocations = await prisma.openingInventoryCutover.findMany");
    expect(detail).toContain("const cohortActivityUnion = cohortSharedVisible ? Prisma.sql`");
    expect(detail).toContain("cohortSharedVisible ? prisma.openingInventoryCohortEvent.count");
    expect(detail).toContain("cohortSharedVisible ? prisma.openingInventoryExecutionCommand.count");
    expect(detail).toContain("let evidenceUnavailable = cohortSharedUnavailable");
    expect(detail).toContain("evidenceUnavailable = true");
    expect(detail).toContain("evidenceUnavailable,");
  });

  test("checks the exact live location scope before taking the approval-routing barrier", () => {
    const source = readFileSync(resolve(__dirname, "openingInventoryCutovers.ts"), "utf8");
    const submitStart = source.indexOf("export async function submitOpeningInventoryCutoverForApproval");
    const submitEnd = source.indexOf("export async function requestOpeningInventoryExecutionCommand", submitStart);
    const submit = source.slice(submitStart, submitEnd);

    expect(submit).toContain("return prisma.$transaction(async (tx) =>");
    expect(submit).toContain("acquireApprovalProducerBarrierShared");
    expect(submit.indexOf("assertLiveScopedPermission")).toBeLessThan(
      submit.indexOf("acquireApprovalProducerBarrierShared"),
    );
    expect(submit.indexOf("acquireApprovalProducerBarrierShared")).toBeLessThan(
      submit.indexOf("tx.approvalRule.findFirst"),
    );
  });

  test("records approval attestations with a bounded runtime-MFA validity window", () => {
    const source = readFileSync(resolve(__dirname, "approvals.ts"), "utf8");
    expect(source).toContain('mfaMode !== "runtime_mfa"');
    expect(source).toContain('authSession.idleExpiresAt.getTime()');
    expect(source).toContain('authSession.absoluteExpiresAt.getTime()');
    expect(source).toContain('mfaValidUntil: attestation.mfaValidUntil.toISOString()');
    expect(source).toContain('mfaValidUntil: attestation.mfaValidUntil');
  });
});
