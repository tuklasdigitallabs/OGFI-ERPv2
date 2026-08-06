import { createHash, randomUUID } from "node:crypto";
import { Prisma, prisma, type TransactionClient } from "@ogfi/database";
import { z } from "zod";
import { permissions, requirePermission } from "./authorization";
import { requireSessionContext, type SessionContext } from "./context";
import {
  assertAnyEligibleApprovalActorForStep,
  configureApprovalStepRouting,
} from "./approvalRouting";
import { getApprovalRoutingPolicy } from "./approvalRoutingRegistry";
import { acquireApprovalProducerBarrierShared } from "./approvalProducerBarrier";
import { assertPrivilegedMfaForAction } from "./privilegedMfaGuard";
import { getMfaStepUpMinutes } from "./authentication";
import { getInventoryPilotRevisionOpeningReadiness } from "./inventoryPilotConfiguration";

const digestPattern = /^[a-f0-9]{64}$/;
const v2ParticipantResponsibilities = ["PREPARER", "SUBMITTER", "OPERATIONS_REVIEWER", "ACCOUNTING_REVIEWER", "COMMAND_REQUESTER"] as const;
const v2ReadinessFamilies = ["PurchaseRequest", "QuotationRecommendation", "PurchaseOrder", "InventoryTransfer", "StockCountAttemptReview", "WastageReport", "StockAdjustment", "OpeningInventoryCutover"] as const;

const uuid = z.string().uuid();
const positiveVersion = z.coerce.number().int().positive();

const valuationLineSchema = z.object({
  itemId: uuid,
  lotKey: z.string().trim().min(1).max(500),
  unitCost: z.coerce.number().finite().min(0),
});

const createCohortSchema = z.object({
  configurationRevisionId: uuid,
  effectiveAt: z.coerce.date(),
  predecessorCohortId: uuid.optional(),
});

const prepareCutoverSchema = z.object({
  cohortId: uuid,
  stockCountAttemptId: uuid,
  idempotencyKey: z.string().trim().min(12).max(160),
  controlledEvidenceAttachmentIds: z.array(uuid).min(1).max(50),
  evidenceNote: z.string().trim().min(5).max(1_000).optional(),
  valuationLines: z.array(valuationLineSchema).min(1).max(10_000),
});

const expectedVersionSchema = z.object({
  id: uuid,
  expectedVersion: positiveVersion,
});

const requestCommandSchema = z.object({
  cohortId: uuid,
  cutoverId: uuid.optional(),
  expectedCohortVersion: positiveVersion,
  expectedCutoverVersion: positiveVersion.optional(),
  idempotencyKey: z.string().trim().min(12).max(160),
  reason: z.string().trim().min(5).max(1_000),
});

export const openingInventoryStableErrors = Object.freeze({
  unsupportedConfiguration: "OPENING_INVENTORY_CONFIGURATION_NOT_SEALED",
  configurationNotLatest: "OPENING_INVENTORY_CONFIGURATION_NOT_LATEST",
  configurationEvidenceInvalid: "OPENING_INVENTORY_CONFIGURATION_EVIDENCE_INVALID",
  configurationLiveReadinessBlocked: "OPENING_INVENTORY_CONFIGURATION_LIVE_READINESS_BLOCKED",
  endpointScope: "OPENING_INVENTORY_ENDPOINT_SCOPE_DENIED",
  itemScope: "OPENING_INVENTORY_ITEM_SCOPE_DENIED",
  sourceNotReviewed: "OPENING_INVENTORY_SOURCE_ATTEMPT_NOT_REVIEWED",
  sourceCoverage: "OPENING_INVENTORY_SOURCE_COUNT_COVERAGE_INVALID",
  sourceAlreadyUsed: "OPENING_INVENTORY_SOURCE_ATTEMPT_ALREADY_BOUND",
  evidenceRequired: "OPENING_INVENTORY_EVIDENCE_REQUIRED",
  valuationRequired: "OPENING_INVENTORY_VALUATION_REQUIRED",
  concurrency: "OPENING_INVENTORY_CONCURRENT_MODIFICATION",
  approvalRule: "OPENING_INVENTORY_APPROVAL_RULE_NOT_CONFIGURED",
  approvalConflict: "OPENING_INVENTORY_APPROVAL_ALREADY_SUBMITTED",
  commandState: "OPENING_INVENTORY_COMMAND_NOT_REQUESTABLE",
  commandConflict: "OPENING_INVENTORY_COMMAND_IDEMPOTENCY_CONFLICT",
  commandActorConflict: "OPENING_INVENTORY_COMMAND_REQUESTER_CONFLICT",
  commandInFlight: "OPENING_INVENTORY_COMMAND_IN_FLIGHT",
  authorityStale: "OPENING_INVENTORY_AUTHORITY_STALE",
  recoveryPredecessor: "OPENING_INVENTORY_RECOVERY_PREDECESSOR_NOT_FULLY_REVERSED",
  cutoffAfterEffectiveAt: "OPENING_INVENTORY_SOURCE_CUTOFF_AFTER_EFFECTIVE_AT",
  activationPolicy: "OPENING_INVENTORY_CUTOVER_POLICY_NOT_READY",
  activationWindow: "OPENING_INVENTORY_CUTOVER_WINDOW_NOT_CONFIGURED",
  activationFuture: "OPENING_INVENTORY_EFFECTIVE_AT_IN_FUTURE",
} as const);

const safeOpeningCommandFailureCodes = new Set<string>([
  ...Object.values(openingInventoryStableErrors),
  "OPENING_INVENTORY_EXECUTION_FAILED",
  "OPENING_INVENTORY_EXECUTION_RETRYABLE",
]);

function safeOpeningCommandFailureCode(value: string | null) {
  if (!value) return null;
  return safeOpeningCommandFailureCodes.has(value) ? value : "OPENING_INVENTORY_EXECUTION_FAILED";
}

type StableValue = null | boolean | number | string | Date | StableValue[] | {
  [key: string]: StableValue | undefined;
};

function stable(value: StableValue): StableValue {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, item]) => item !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, stable(item!)]),
    );
  }
  return value;
}

export function canonicalOpeningInventoryJson(value: StableValue) {
  return JSON.stringify(stable(value));
}

export function openingInventoryDigest(value: StableValue) {
  return createHash("sha256")
    .update(canonicalOpeningInventoryJson(value))
    .digest("hex");
}

const openingEligibleRevisionInclude = Prisma.validator<Prisma.InventoryPilotConfigurationRevisionInclude>()({
  endpointMemberships: { orderBy: [{ capability: "asc" }, { inventoryLocationId: "asc" }] },
  itemMemberships: { orderBy: { itemId: "asc" } },
  participantMemberships: { orderBy: { responsibility: "asc" } },
  routeReadinessMemberships: { orderBy: { family: "asc" } },
  successorRevision: { select: { id: true } },
});

export function hasExactInventoryPilotV2OpeningEvidence(revision: {
  schemaVersion: number;
  canonicalJson: string;
  configurationDigest: string;
  successorRevision: { id: string } | null;
  endpointMemberships: Array<{ capability: string; inventoryLocationId: string; locationId: string }>;
  itemMemberships: Array<{ itemId: string }>;
  participantMemberships: Array<{ responsibility: string; userId: string }>;
  routeReadinessMemberships: Array<{ family: string; ruleDefinitionCanonicalJson: string; ruleDefinitionDigest: string; resolverEvidenceCanonicalJson: string | null; resolverEvidenceDigest: string | null }>;
}) {
  if (revision.schemaVersion !== 2 || revision.successorRevision) return false;
  if (!digestPattern.test(revision.configurationDigest) || createHash("sha256").update(revision.canonicalJson).digest("hex") !== revision.configurationDigest) return false;
  if (!revision.endpointMemberships.some((row) => row.capability === "OPENING_STOCK_LOCATION") || revision.itemMemberships.length === 0) return false;
  const responsibilities = revision.participantMemberships.map((row) => row.responsibility).sort();
  const families = revision.routeReadinessMemberships.map((row) => row.family).sort();
  if (responsibilities.length !== v2ParticipantResponsibilities.length || responsibilities.some((value, index) => value !== [...v2ParticipantResponsibilities].sort()[index])) return false;
  if (new Set(revision.participantMemberships.map((row) => row.userId)).size !== v2ParticipantResponsibilities.length) return false;
  if (families.length !== v2ReadinessFamilies.length || families.some((value, index) => value !== [...v2ReadinessFamilies].sort()[index])) return false;
  return revision.routeReadinessMemberships.every((row) => {
    const ruleDigestValid = digestPattern.test(row.ruleDefinitionDigest) && createHash("sha256").update(row.ruleDefinitionCanonicalJson).digest("hex") === row.ruleDefinitionDigest;
    const resolverDigestValid = row.family === "PurchaseRequest"
      ? Boolean(row.resolverEvidenceCanonicalJson && row.resolverEvidenceDigest && digestPattern.test(row.resolverEvidenceDigest) && createHash("sha256").update(row.resolverEvidenceCanonicalJson).digest("hex") === row.resolverEvidenceDigest)
      : row.resolverEvidenceCanonicalJson === null && row.resolverEvidenceDigest === null;
    return ruleDigestValid && resolverDigestValid;
  });
}

async function evaluateLatestOpeningInventoryRevision(tx: TransactionClient, session: SessionContext) {
  const revision = await tx.inventoryPilotConfigurationRevision.findFirst({
    where: { tenantId: session.context.tenantId, companyId: session.context.companyId, status: "SEALED", schemaVersion: 2, successorRevision: { is: null } },
    include: openingEligibleRevisionInclude,
    orderBy: { revisionNumber: "desc" },
  });
  if (!revision) return { revision: null, code: openingInventoryStableErrors.unsupportedConfiguration, blockerCodes: [] as string[] };
  if (!hasExactInventoryPilotV2OpeningEvidence(revision)) return { revision: null, code: openingInventoryStableErrors.configurationEvidenceInvalid, blockerCodes: [] as string[] };
  const readiness = await getInventoryPilotRevisionOpeningReadiness(tx, session, revision.id);
  if (!readiness.eligible) return { revision: null, code: openingInventoryStableErrors.configurationLiveReadinessBlocked, blockerCodes: readiness.blockers.map((blocker) => blocker.code) };
  return { revision, code: null, blockerCodes: [] as string[] };
}

function requireDigest(value: string) {
  if (!digestPattern.test(value)) {
    throw new Error("OPENING_INVENTORY_DIGEST_INVALID");
  }
  return value;
}

async function nextOpeningInventoryCohortReference(
  tx: TransactionClient,
  tenantId: string,
  companyId: string,
  effectiveAt: Date,
) {
  const year = effectiveAt.getUTCFullYear();
  const rows = await tx.$queryRaw<Array<{ nextValue: number }>>`
    INSERT INTO "DocumentNumberSequence" ("tenantId", "companyId", "documentType", "year", "nextValue")
    VALUES (${tenantId}::uuid, ${companyId}::uuid, 'OPENING_INVENTORY_COHORT', ${year}, 2)
    ON CONFLICT ("companyId", "documentType", "year")
    DO UPDATE SET "nextValue" = "DocumentNumberSequence"."nextValue" + 1,
                  "updatedAt" = CURRENT_TIMESTAMP
    RETURNING "nextValue" - 1 AS "nextValue"
  `;
  const nextValue = Number(rows[0]?.nextValue);
  if (!Number.isInteger(nextValue) || nextValue < 1) {
    throw new Error("OPENING_INVENTORY_COHORT_REFERENCE_ALLOCATION_FAILED");
  }
  return `OIC-${year}-${String(nextValue).padStart(5, "0")}`;
}

const openingCutoverPolicyKeys = [
  "inventory.opening_cutover.max_count_age_minutes",
  "inventory.opening_cutover.max_freeze_minutes",
] as const;

function positivePolicyMinutes(value: unknown) {
  const minutes = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isInteger(minutes) && minutes > 0 ? minutes : null;
}

async function openingInventoryActivationPolicyStatus(
  tx: TransactionClient,
  session: SessionContext,
) {
  const rows = await tx.companyPolicySetting.findMany({
    where: { companyId: session.context.companyId, tenantId: session.context.tenantId, key: { in: [...openingCutoverPolicyKeys] } },
    select: { key: true, value: true, status: true, isDefault: true, updatedByUserId: true, updatedAt: true },
  });
  const byKey = new Map(rows.map((row) => [row.key, row]));
  const policies = openingCutoverPolicyKeys.map((key) => {
    const row = byKey.get(key);
    const minutes = row ? positivePolicyMinutes(row.value) : null;
    const ready = Boolean(row && row.status === "ACTIVE" && !row.isDefault && row.updatedByUserId && minutes);
    return { key, ready, minutes, status: row?.status ?? "MISSING", isDefault: row?.isDefault ?? null, updatedByUserId: row?.updatedByUserId ?? null, updatedAt: row?.updatedAt ?? null };
  });
  return {
    policies,
    ready: policies.every((policy) => policy.ready),
    maxCountAgeMinutes: policies.find((policy) => policy.key === "inventory.opening_cutover.max_count_age_minutes")?.minutes ?? null,
    maxFreezeMinutes: policies.find((policy) => policy.key === "inventory.opening_cutover.max_freeze_minutes")?.minutes ?? null,
  };
}

async function assertOpeningInventoryCommandRequesterIndependent(
  tx: TransactionClient,
  session: SessionContext,
  cohortId: string,
  commandType: "FREEZE_COHORT" | "STAGE_LOCATION" | "ACTIVATE_COHORT" | "REVERSE_LOCATION",
) {
  const cohort = await tx.openingInventoryCohort.findFirst({
    where: { id: cohortId, tenantId: session.context.tenantId, companyId: session.context.companyId },
    include: {
      cutovers: {
        include: {
          stockCountAttempt: { select: { createdByUserId: true, assignedToUserId: true, reviewedByUserId: true, lines: { select: { countedByUserId: true } } } },
          approvalAttestations: { select: { decisionActorUserId: true } },
          executionCommands: { where: { commandType: "STAGE_LOCATION", status: "SUCCEEDED" }, select: { requestedByUserId: true } },
        },
      },
    },
  });
  if (!cohort) throw new Error(openingInventoryStableErrors.concurrency);
  const prohibited = new Set<string>([cohort.createdByUserId]);
  for (const cutover of cohort.cutovers) {
    prohibited.add(cutover.requestedByUserId);
    if (cutover.reviewedByUserId) prohibited.add(cutover.reviewedByUserId);
    prohibited.add(cutover.stockCountAttempt.createdByUserId);
    if (cutover.stockCountAttempt.assignedToUserId) prohibited.add(cutover.stockCountAttempt.assignedToUserId);
    if (cutover.stockCountAttempt.reviewedByUserId) prohibited.add(cutover.stockCountAttempt.reviewedByUserId);
    for (const line of cutover.stockCountAttempt.lines) if (line.countedByUserId) prohibited.add(line.countedByUserId);
    for (const attestation of cutover.approvalAttestations) prohibited.add(attestation.decisionActorUserId);
    if (commandType === "ACTIVATE_COHORT") {
      for (const command of cutover.executionCommands) prohibited.add(command.requestedByUserId);
    }
  }
  if (prohibited.has(session.user.id)) throw new Error(openingInventoryStableErrors.commandActorConflict);
}

async function deriveOpeningInventoryEvidenceManifest(
  tx: TransactionClient,
  session: SessionContext,
  cohortId: string,
  attachmentIds: string[],
) {
  const requested = [...new Set(attachmentIds)].sort();
  if (requested.length !== attachmentIds.length) {
    throw new Error(openingInventoryStableErrors.evidenceRequired);
  }
  const links = await tx.controlledEvidenceAttachment.findMany({
    where: {
      id: { in: requested },
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      sourceType: "OPENING_INVENTORY_COHORT",
      sourceRecordId: cohortId,
      status: "ACTIVE",
      archivedAt: null,
    },
    include: {
      attachment: {
        select: {
          id: true,
          status: true,
          uploadState: true,
          scanState: true,
          availabilityState: true,
          physicalState: true,
          objectVersionId: true,
          scanVerifiedObjectVersionId: true,
          checksum: true,
          detectedChecksum: true,
          storedChecksum: true,
        },
      },
    },
    orderBy: { id: "asc" },
  });
  if (links.length !== requested.length) {
    throw new Error(openingInventoryStableErrors.evidenceRequired);
  }
  for (const link of links) {
    const attachment = link.attachment;
    if (
      attachment.status !== "ACTIVE" ||
      attachment.uploadState !== "VERIFIED" ||
      attachment.scanState !== "CLEAN" ||
      attachment.availabilityState !== "AVAILABLE" ||
      attachment.physicalState !== "DURABLE" ||
      !attachment.objectVersionId ||
      attachment.scanVerifiedObjectVersionId !== attachment.objectVersionId ||
      !attachment.checksum ||
      attachment.detectedChecksum !== attachment.checksum ||
      attachment.storedChecksum !== attachment.checksum
    ) {
      throw new Error(openingInventoryStableErrors.evidenceRequired);
    }
  }
  const manifest = links.map((link) => ({
    controlledEvidenceAttachmentId: link.id,
    attachmentId: link.attachment.id,
    objectVersionId: link.attachment.objectVersionId,
    checksum: link.attachment.checksum,
  }));
  const canonicalJson = canonicalOpeningInventoryJson(manifest);
  return { canonicalJson, digest: openingInventoryDigest(manifest) };
}

async function assertLiveScopedPermission(
  tx: TransactionClient,
  session: SessionContext,
  requiredPermissionCode: string,
  locationId: string,
  accessLevels: Array<"VIEW" | "OPERATE" | "APPROVE" | "MANAGE">,
) {
  const now = new Date();
  const [actor, roleAssignment, location] = await Promise.all([
    tx.user.findFirst({
      where: { id: session.user.id, tenantId: session.context.tenantId, status: "ACTIVE" },
      select: { privilegeEpoch: true },
    }),
    tx.userRoleAssignment.findFirst({
      where: {
        userId: session.user.id,
        status: "ACTIVE",
        startsAt: { lte: now },
        OR: [{ endsAt: null }, { endsAt: { gt: now } }],
        role: {
          status: "ACTIVE",
          OR: [{ tenantId: null }, { tenantId: session.context.tenantId }],
          permissions: { some: { permission: { code: requiredPermissionCode } } },
        },
      },
      select: { id: true },
    }),
    tx.location.findFirst({
      where: {
        id: locationId,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        status: "ACTIVE",
      },
      select: { id: true, companyId: true, brandId: true },
    }),
  ]);
  if (!actor) throw new Error(openingInventoryStableErrors.authorityStale);
  if (!roleAssignment) throw new Error("PERMISSION_DENIED");
  if (!location) throw new Error(openingInventoryStableErrors.endpointScope);
  const scope = await tx.userScopeAssignment.findFirst({
    where: {
      userId: session.user.id,
      status: "ACTIVE",
      startsAt: { lte: now },
      AND: [
        { OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
        {
          OR: [
            { scopeType: "LOCATION", scopeId: location.id },
            { scopeType: "COMPANY", scopeId: location.companyId },
            ...(location.brandId ? [{ scopeType: "BRAND" as const, scopeId: location.brandId }] : []),
          ],
        },
      ],
      accessLevel: { in: accessLevels },
    },
    select: { id: true },
  });
  if (!scope) throw new Error(openingInventoryStableErrors.endpointScope);

  if (session.authentication?.sessionId) {
    const authSession = await tx.authSession.findFirst({
      where: {
        id: session.authentication.sessionId,
        tenantId: session.context.tenantId,
        userId: session.user.id,
        status: "ACTIVE",
        privilegeEpochAtIssue: actor.privilegeEpoch,
        idleExpiresAt: { gt: now },
        absoluteExpiresAt: { gt: now },
      },
      select: { id: true },
    });
    if (!authSession) throw new Error(openingInventoryStableErrors.authorityStale);
  }
}

export async function createOpeningInventoryCohort(
  rawInput: unknown,
  providedSession?: SessionContext,
) {
  const session = providedSession ?? await requireSessionContext();
  await requirePermission(session, permissions.openingInventoryPrepare);
  const input = createCohortSchema.parse(rawInput);
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(${`inventory-pilot-configuration:${session.context.tenantId}:${session.context.companyId}`}, 0))::text AS "lockResult"`;
    const eligibility = await evaluateLatestOpeningInventoryRevision(tx, session);
    if (!eligibility.revision) throw new Error(eligibility.code ?? openingInventoryStableErrors.unsupportedConfiguration);
    if (eligibility.revision.id !== input.configurationRevisionId) throw new Error(openingInventoryStableErrors.configurationNotLatest);
    const latestEligibleRevision = eligibility.revision;
    const revision = {
      ...latestEligibleRevision,
      endpointMemberships: latestEligibleRevision.endpointMemberships.filter((row) => row.capability === "OPENING_STOCK_LOCATION"),
    };
    if (revision.endpointMemberships.length === 0) throw new Error(openingInventoryStableErrors.endpointScope);
    if (revision.itemMemberships.length === 0) throw new Error(openingInventoryStableErrors.itemScope);
    for (const endpoint of revision.endpointMemberships) {
      await assertLiveScopedPermission(tx, session, permissions.openingInventoryPrepare, endpoint.locationId, ["OPERATE", "APPROVE", "MANAGE"]);
    }
    const predecessor = input.predecessorCohortId ? await tx.openingInventoryCohort.findFirst({
      where: {
        id: input.predecessorCohortId,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
      },
      include: { cutovers: { select: { status: true } } },
    }) : null;
    if (input.predecessorCohortId && (!predecessor || predecessor.status !== "REVERSED" || predecessor.cutovers.length === 0 || predecessor.cutovers.some((cutover) => cutover.status !== "REVERSED"))) {
      throw new Error(openingInventoryStableErrors.recoveryPredecessor);
    }
    const generation = predecessor ? predecessor.generation + 1 : 1;
    const canonicalJson = canonicalOpeningInventoryJson({
      configurationRevisionId: revision.id,
      configurationRevisionNumber: revision.revisionNumber,
      configurationDigest: requireDigest(revision.configurationDigest),
      predecessorCohortId: predecessor?.id ?? null,
      generation,
      effectiveAt: input.effectiveAt,
      endpointInventoryLocationIds: revision.endpointMemberships.map((entry) => entry.inventoryLocationId),
      itemIds: revision.itemMemberships.map((entry) => entry.itemId),
    });
    const cohortDigest = openingInventoryDigest(JSON.parse(canonicalJson));
    const replay = await tx.openingInventoryCohort.findFirst({
      where: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        configurationRevisionId: revision.id,
        effectiveAt: input.effectiveAt,
        generation,
      },
    });
    if (replay) {
      if (replay.cohortDigest === cohortDigest) return replay;
      throw new Error(openingInventoryStableErrors.concurrency);
    }
    const publicReference = await nextOpeningInventoryCohortReference(
      tx,
      session.context.tenantId,
      session.context.companyId,
      input.effectiveAt,
    );
    const cohort = await tx.openingInventoryCohort.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        configurationRevisionId: revision.id,
        configurationRevisionNumber: revision.revisionNumber,
        configurationDigest: requireDigest(revision.configurationDigest),
        publicReference,
        predecessorCohortId: predecessor?.id ?? null,
        generation,
        effectiveAt: input.effectiveAt,
        status: "DRAFT",
        canonicalJson,
        cohortDigest,
        createdByUserId: session.user.id,
      },
    });
    await tx.auditEvent.create({ data: {
      tenantId: session.context.tenantId, companyId: session.context.companyId, actorUserId: session.user.id,
      eventType: "opening_inventory.cohort_created", entityType: "OpeningInventoryCohort", entityId: cohort.id,
      afterData: { status: cohort.status, publicReference, configurationRevisionId: revision.id, configurationDigest: revision.configurationDigest, predecessorCohortId: predecessor?.id ?? null, generation },
    }});
    return cohort;
  });
}

export async function prepareOpeningInventoryCutover(
  rawInput: unknown,
  providedSession?: SessionContext,
) {
  const session = providedSession ?? await requireSessionContext();
  await requirePermission(session, permissions.openingInventoryPrepare);
  const input = prepareCutoverSchema.parse(rawInput);
  return prisma.$transaction(async (tx) => {
    const cohort = await tx.openingInventoryCohort.findFirst({
      where: { id: input.cohortId, tenantId: session.context.tenantId, companyId: session.context.companyId, status: "DRAFT" },
      include: { configurationRevision: { include: { endpointMemberships: { where: { capability: "OPENING_STOCK_LOCATION" } }, itemMemberships: true } } },
    });
    if (!cohort || cohort.configurationRevision.status !== "SEALED") throw new Error(openingInventoryStableErrors.unsupportedConfiguration);
    const attempt = await tx.stockCountAttempt.findFirst({
      where: { id: input.stockCountAttemptId, tenantId: session.context.tenantId, companyId: session.context.companyId, status: "REVIEWED" },
      include: { lines: { orderBy: { lineNumber: "asc" } }, inventoryLocation: true, stockCountSession: true },
    });
    if (!attempt || !attempt.freezeMovements || !attempt.cutoffAt || !attempt.evidenceReference || attempt.stockCountSession.countType !== "OPENING" || attempt.stockCountSession.status !== "REVIEWED" || attempt.stockCountSession.currentAttemptId !== attempt.id || !attempt.stockCountSession.freezeMovements || !attempt.stockCountSession.cutoffAt) throw new Error(openingInventoryStableErrors.sourceNotReviewed);
    if (attempt.cutoffAt.getTime() > cohort.effectiveAt.getTime() || attempt.stockCountSession.cutoffAt.getTime() > cohort.effectiveAt.getTime()) {
      throw new Error(openingInventoryStableErrors.cutoffAfterEffectiveAt);
    }
    const endpoint = cohort.configurationRevision.endpointMemberships.find((entry) => entry.inventoryLocationId === attempt.inventoryLocationId);
    if (!endpoint) throw new Error(openingInventoryStableErrors.endpointScope);
    await assertLiveScopedPermission(tx, session, permissions.openingInventoryPrepare, endpoint.locationId, ["OPERATE", "APPROVE", "MANAGE"]);
    const selectedItems = new Set(cohort.configurationRevision.itemMemberships.map((entry) => entry.itemId));
    const countedItems = new Set(attempt.lines.map((line) => line.itemId));
    if (attempt.lines.length === 0 || [...selectedItems].some((itemId) => !countedItems.has(itemId)) || attempt.lines.some((line) => !selectedItems.has(line.itemId) || line.countedQuantityBaseUom === null || Number(line.countedQuantityBaseUom) < 0 || Number(line.systemQuantityBaseUom) !== 0)) {
      throw new Error(openingInventoryStableErrors.sourceCoverage);
    }
    const evidenceManifest = await deriveOpeningInventoryEvidenceManifest(tx, session, cohort.id, input.controlledEvidenceAttachmentIds);
    const evidenceDigest = evidenceManifest.digest;
    const valuationByStockKey = new Map(input.valuationLines.map((line) => [`${line.itemId}:${line.lotKey}`, line]));
    if (valuationByStockKey.size !== input.valuationLines.length || attempt.lines.some((line) => !valuationByStockKey.has(`${line.itemId}:${line.lotKey}`))) {
      throw new Error(openingInventoryStableErrors.valuationRequired);
    }
    const cutoverLines = attempt.lines.map((line) => {
      const valuation = valuationByStockKey.get(`${line.itemId}:${line.lotKey}`)!;
      const sourceSystemQuantity = Number(line.systemQuantityBaseUom);
      const sourceCountedQuantity = Number(line.countedQuantityBaseUom);
      const sourceVarianceQuantity = line.varianceQuantityBaseUom === null
        ? sourceCountedQuantity - sourceSystemQuantity
        : Number(line.varianceQuantityBaseUom);
      const quantity = sourceCountedQuantity;
      if (quantity > 0 && valuation.unitCost <= 0) {
        throw new Error(openingInventoryStableErrors.valuationRequired);
      }
      const openingValue = quantity * valuation.unitCost;
      const lineCanonicalJson = canonicalOpeningInventoryJson({
        expiryDate: line.expiryDate,
        itemId: line.itemId,
        lineNumber: line.lineNumber,
        lotKey: line.lotKey,
        lotNumber: line.lotNumber,
        openingQuantityBaseUom: quantity,
        openingValue,
        sourceCountedQuantityBaseUom: sourceCountedQuantity,
        sourceSystemQuantityBaseUom: sourceSystemQuantity,
        sourceVarianceQuantityBaseUom: sourceVarianceQuantity,
        stockCountAttemptLineId: line.id,
        unitCost: valuation.unitCost,
        uomId: line.uomId,
      });
      const lineDigest = openingInventoryDigest(JSON.parse(lineCanonicalJson));
      return { line, valuation, quantity, sourceSystemQuantity, sourceCountedQuantity, sourceVarianceQuantity, openingValue, lineCanonicalJson, lineDigest };
    });
    const valuationCanonicalJson = canonicalOpeningInventoryJson(
      cutoverLines
        .map(({ line, valuation }) => ({ itemId: line.itemId, lotKey: line.lotKey, unitCost: valuation.unitCost }))
        .sort((left, right) => `${left.itemId}:${left.lotKey}`.localeCompare(`${right.itemId}:${right.lotKey}`)),
    );
    const valuationDigest = openingInventoryDigest(JSON.parse(valuationCanonicalJson));
    const cutoverCanonicalJson = canonicalOpeningInventoryJson({
      attemptCutoffAt: attempt.cutoffAt,
      cutoverVersion: 2,
      evidenceDigest,
      lines: cutoverLines.map(({ line, lineCanonicalJson, lineDigest }) => ({ lineCanonicalJson: JSON.parse(lineCanonicalJson), lineDigest, lineNumber: line.lineNumber })),
      sessionCutoffAt: attempt.stockCountSession.cutoffAt,
      stockCountAttemptId: attempt.id,
      valuationDigest,
    });
    const cutoverDigest = openingInventoryDigest(JSON.parse(cutoverCanonicalJson));
    const existing = await tx.openingInventoryCutover.findFirst({ where: { cohortId: cohort.id, idempotencyKey: input.idempotencyKey } });
    if (existing) {
      if (existing.stockCountAttemptId === attempt.id && existing.cutoverDigest === cutoverDigest) return existing;
      throw new Error(openingInventoryStableErrors.commandConflict);
    }
    const prior = await tx.openingInventoryCutover.findFirst({ where: { stockCountAttemptId: attempt.id, tenantId: session.context.tenantId, companyId: session.context.companyId } });
    if (prior) throw new Error(openingInventoryStableErrors.sourceAlreadyUsed);
    const cutover = await tx.openingInventoryCutover.create({ data: {
      cohortId: cohort.id, tenantId: session.context.tenantId, companyId: session.context.companyId,
      inventoryLocationId: attempt.inventoryLocationId, locationId: endpoint.locationId,
      stockCountSessionId: attempt.stockCountSessionId, stockCountAttemptId: attempt.id,
      status: "DRAFT", idempotencyKey: input.idempotencyKey, evidenceDigest, evidenceManifestJson: evidenceManifest.canonicalJson,
      valuationCanonicalJson, valuationDigest, cutoverCanonicalJson, cutoverDigest,
      requestedByUserId: session.user.id,
      lines: { create: cutoverLines.map(({ line, valuation, quantity, sourceSystemQuantity, sourceCountedQuantity, sourceVarianceQuantity, openingValue, lineCanonicalJson, lineDigest }) => ({
        tenantId: session.context.tenantId, companyId: session.context.companyId, inventoryLocationId: attempt.inventoryLocationId,
        itemId: line.itemId, uomId: line.uomId, stockCountAttemptId: attempt.id, stockCountAttemptLineId: line.id, lineNumber: line.lineNumber,
        lotKey: line.lotKey, lotNumber: line.lotNumber, expiryDate: line.expiryDate,
        sourceSystemQuantityBaseUom: sourceSystemQuantity,
        sourceCountedQuantityBaseUom: sourceCountedQuantity,
        sourceVarianceQuantityBaseUom: sourceVarianceQuantity,
        openingQuantityBaseUom: quantity, unitCost: valuation.unitCost, openingValue, lineCanonicalJson, lineDigest,
      })) },
    }});
    await tx.auditEvent.create({ data: {
      tenantId: session.context.tenantId, companyId: session.context.companyId, actorUserId: session.user.id,
      eventType: "opening_inventory.cutover_prepared", entityType: "OpeningInventoryCutover", entityId: cutover.id,
      afterData: { status: cutover.status, stockCountAttemptId: attempt.id, attemptCutoffAt: attempt.cutoffAt.toISOString(), sessionCutoffAt: attempt.stockCountSession.cutoffAt.toISOString(), lineCount: cutoverLines.length, evidenceDigest, valuationDigest, cutoverDigest },
    }});
    return cutover;
  });
}

export async function sealOpeningInventoryCohort(
  rawInput: unknown,
  providedSession?: SessionContext,
) {
  const session = providedSession ?? await requireSessionContext();
  await requirePermission(session, permissions.openingInventoryPrepare);
  const input = expectedVersionSchema.parse(rawInput);
  return prisma.$transaction(async (tx) => {
    const cohort = await tx.openingInventoryCohort.findFirst({
      where: {
        id: input.id,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        status: "DRAFT",
        version: input.expectedVersion,
      },
      include: {
        configurationRevision: {
          include: {
            endpointMemberships: { where: { capability: "OPENING_STOCK_LOCATION" }, orderBy: { inventoryLocationId: "asc" } },
            itemMemberships: { orderBy: { itemId: "asc" } },
          },
        },
        cutovers: { include: { lines: { orderBy: { lineNumber: "asc" } }, stockCountAttempt: { include: { stockCountSession: true } } }, orderBy: { inventoryLocationId: "asc" } },
      },
    });
    if (!cohort || cohort.configurationRevision.status !== "SEALED") throw new Error(openingInventoryStableErrors.concurrency);
    const endpoints = cohort.configurationRevision.endpointMemberships;
    const configuredLocationIds = new Set(endpoints.map((endpoint) => endpoint.inventoryLocationId));
    if (endpoints.length === 0 || cohort.cutovers.length !== endpoints.length || cohort.cutovers.some((cutover) => cutover.status !== "DRAFT" || !configuredLocationIds.has(cutover.inventoryLocationId))) {
      throw new Error(openingInventoryStableErrors.sourceCoverage);
    }
    const selectedItems = new Set(cohort.configurationRevision.itemMemberships.map((item) => item.itemId));
    for (const endpoint of endpoints) {
      await assertLiveScopedPermission(tx, session, permissions.openingInventoryPrepare, endpoint.locationId, ["OPERATE", "APPROVE", "MANAGE"]);
    }
    for (const cutover of cohort.cutovers) {
      const linesByKey = new Set(cutover.lines.map((line) => `${line.itemId}:${line.lotKey}`));
      if (cutover.lines.length === 0 || [...selectedItems].some((itemId) => !cutover.lines.some((line) => line.itemId === itemId)) || cutover.lines.some((line) => !selectedItems.has(line.itemId) || Number(line.openingQuantityBaseUom) < 0 || (Number(line.openingQuantityBaseUom) > 0 && Number(line.unitCost) <= 0)) || linesByKey.size !== cutover.lines.length || cutover.stockCountAttempt.status !== "REVIEWED" || !cutover.stockCountAttempt.freezeMovements || !cutover.stockCountAttempt.cutoffAt || !cutover.stockCountAttempt.evidenceReference || !cutover.stockCountAttempt.stockCountSession.cutoffAt) {
        throw new Error(openingInventoryStableErrors.sourceCoverage);
      }
      if (cutover.stockCountAttempt.cutoffAt.getTime() > cohort.effectiveAt.getTime() || cutover.stockCountAttempt.stockCountSession.cutoffAt.getTime() > cohort.effectiveAt.getTime()) {
        throw new Error(openingInventoryStableErrors.cutoffAfterEffectiveAt);
      }
      let selectedEvidenceIds: string[];
      try {
        selectedEvidenceIds = (JSON.parse(cutover.evidenceManifestJson) as Array<{ controlledEvidenceAttachmentId?: string }>).map((entry) => entry.controlledEvidenceAttachmentId ?? "");
      } catch {
        throw new Error(openingInventoryStableErrors.evidenceRequired);
      }
      const evidenceManifest = await deriveOpeningInventoryEvidenceManifest(tx, session, cohort.id, selectedEvidenceIds);
      const valuationCanonicalJson = canonicalOpeningInventoryJson(cutover.lines.map((line) => ({ itemId: line.itemId, lotKey: line.lotKey, unitCost: Number(line.unitCost) })).sort((left, right) => `${left.itemId}:${left.lotKey}`.localeCompare(`${right.itemId}:${right.lotKey}`)));
      const valuationDigest = openingInventoryDigest(JSON.parse(valuationCanonicalJson));
      if (cutover.evidenceManifestJson !== evidenceManifest.canonicalJson || cutover.evidenceDigest !== evidenceManifest.digest || cutover.valuationCanonicalJson !== valuationCanonicalJson || cutover.valuationDigest !== valuationDigest) throw new Error(openingInventoryStableErrors.evidenceRequired);
      for (const line of cutover.lines) {
        const lineCanonicalJson = canonicalOpeningInventoryJson({
          expiryDate: line.expiryDate,
          itemId: line.itemId,
          lineNumber: line.lineNumber,
          lotKey: line.lotKey,
          lotNumber: line.lotNumber,
          openingQuantityBaseUom: Number(line.openingQuantityBaseUom),
          openingValue: Number(line.openingValue),
          sourceCountedQuantityBaseUom: Number(line.sourceCountedQuantityBaseUom),
          sourceSystemQuantityBaseUom: Number(line.sourceSystemQuantityBaseUom),
          sourceVarianceQuantityBaseUom: Number(line.sourceVarianceQuantityBaseUom),
          stockCountAttemptLineId: line.stockCountAttemptLineId,
          unitCost: Number(line.unitCost),
          uomId: line.uomId,
        });
        if (line.lineCanonicalJson !== lineCanonicalJson || line.lineDigest !== openingInventoryDigest(JSON.parse(lineCanonicalJson))) {
          throw new Error(openingInventoryStableErrors.concurrency);
        }
      }
      const cutoverCanonicalJson = canonicalOpeningInventoryJson({
        attemptCutoffAt: cutover.stockCountAttempt.cutoffAt,
        cutoverVersion: 2,
        evidenceDigest: evidenceManifest.digest,
        lines: cutover.lines.map((line) => ({ lineCanonicalJson: JSON.parse(line.lineCanonicalJson), lineDigest: line.lineDigest, lineNumber: line.lineNumber })),
        sessionCutoffAt: cutover.stockCountAttempt.stockCountSession.cutoffAt,
        stockCountAttemptId: cutover.stockCountAttemptId,
        valuationDigest,
      });
      if (cutover.cutoverCanonicalJson !== cutoverCanonicalJson || cutover.cutoverDigest !== openingInventoryDigest(JSON.parse(cutoverCanonicalJson))) throw new Error(openingInventoryStableErrors.concurrency);
    }
    const canonicalJson = canonicalOpeningInventoryJson({
      configurationRevisionId: cohort.configurationRevisionId,
      configurationRevisionNumber: cohort.configurationRevisionNumber,
      configurationDigest: cohort.configurationDigest,
      effectiveAt: cohort.effectiveAt,
      endpointInventoryLocationIds: endpoints.map((endpoint) => endpoint.inventoryLocationId),
      itemIds: [...selectedItems].sort(),
      cutovers: cohort.cutovers.map((cutover) => ({ id: cutover.id, inventoryLocationId: cutover.inventoryLocationId, stockCountAttemptId: cutover.stockCountAttemptId, attemptCutoffAt: cutover.stockCountAttempt.cutoffAt, sessionCutoffAt: cutover.stockCountAttempt.stockCountSession.cutoffAt, evidenceDigest: cutover.evidenceDigest, valuationDigest: cutover.valuationDigest, cutoverDigest: cutover.cutoverDigest })),
    });
    const sealed = await tx.openingInventoryCohort.updateMany({
      where: { id: cohort.id, tenantId: session.context.tenantId, companyId: session.context.companyId, status: "DRAFT", version: input.expectedVersion },
      data: { status: "SEALED", canonicalJson, cohortDigest: openingInventoryDigest(JSON.parse(canonicalJson)), sealedAt: new Date(), sealedByUserId: session.user.id, version: { increment: 1 } },
    });
    if (sealed.count !== 1) throw new Error(openingInventoryStableErrors.concurrency);
    await tx.auditEvent.create({ data: { tenantId: session.context.tenantId, companyId: session.context.companyId, actorUserId: session.user.id, eventType: "opening_inventory.cohort_sealed", entityType: "OpeningInventoryCohort", entityId: cohort.id, beforeData: { status: "DRAFT", version: input.expectedVersion }, afterData: { status: "SEALED", version: input.expectedVersion + 1 }, metadata: { cutoverCount: cohort.cutovers.length, configurationDigest: cohort.configurationDigest } } });
    return tx.openingInventoryCohort.findFirstOrThrow({ where: { id: cohort.id, tenantId: session.context.tenantId, companyId: session.context.companyId } });
  });
}

export async function submitOpeningInventoryCutoverForApproval(rawInput: unknown, providedSession?: SessionContext) {
  const session = providedSession ?? await requireSessionContext();
  await requirePermission(session, permissions.openingInventorySubmit);
  const input = expectedVersionSchema.parse(rawInput);
  return prisma.$transaction(async (tx) => {
    const cutover = await tx.openingInventoryCutover.findFirst({ where: { id: input.id, tenantId: session.context.tenantId, companyId: session.context.companyId, status: { in: ["DRAFT", "RETURNED"] }, version: input.expectedVersion }, include: { cohort: true, lines: true, stockCountAttempt: { include: { lines: { select: { countedByUserId: true } } } } } });
    if (!cutover || cutover.lines.length === 0 || cutover.cohort.status !== "SEALED") throw new Error(openingInventoryStableErrors.concurrency);
    let sealedPayload: { cutovers?: Array<{ id?: string; cutoverDigest?: string }> };
    try {
      sealedPayload = JSON.parse(cutover.cohort.canonicalJson) as { cutovers?: Array<{ id?: string; cutoverDigest?: string }> };
    } catch {
      throw new Error(openingInventoryStableErrors.concurrency);
    }
    if (!sealedPayload.cutovers?.some((entry) => entry.id === cutover.id && entry.cutoverDigest === cutover.cutoverDigest)) {
      throw new Error(openingInventoryStableErrors.concurrency);
    }
    await assertLiveScopedPermission(tx, session, permissions.openingInventorySubmit, cutover.locationId, ["OPERATE", "APPROVE", "MANAGE"]);
    await acquireApprovalProducerBarrierShared(tx, {
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      documentType: "OpeningInventoryCutover",
    });
    const rule = await tx.approvalRule.findFirst({ where: { tenantId: session.context.tenantId, companyId: session.context.companyId, transactionType: "OpeningInventoryCutover", isActive: true, definitionSealed: true }, include: { steps: { orderBy: { stepOrder: "asc" } } }, orderBy: { priority: "asc" } });
    if (!rule || rule.steps.length !== 2) throw new Error(openingInventoryStableErrors.approvalRule);
    const operations = rule.steps[0]!;
    const accounting = rule.steps[1]!;
    if (operations.stepOrder >= accounting.stepOrder) throw new Error(openingInventoryStableErrors.approvalRule);
    const existing = await tx.approvalInstance.findFirst({ where: { tenantId: session.context.tenantId, companyId: session.context.companyId, documentType: "OpeningInventoryCutover", documentId: cutover.id, status: "PENDING" } });
    if (existing) throw new Error(openingInventoryStableErrors.approvalConflict);
    const operationStepId = randomUUID();
    const accountingStepId = randomUUID();
    const approval = await tx.approvalInstance.create({ data: {
      tenantId: session.context.tenantId, companyId: session.context.companyId, documentType: "OpeningInventoryCutover", documentId: cutover.id, approvalRuleId: rule.id, status: "PENDING", currentStepOrder: operations.stepOrder,
      steps: { create: [
        { id: operationStepId, stepOrder: operations.stepOrder, assignedUserId: operations.userId, assignedRoleId: operations.roleId, status: "PENDING" },
        { id: accountingStepId, stepOrder: accounting.stepOrder, assignedUserId: accounting.userId, assignedRoleId: accounting.roleId, status: "WAITING" },
      ] },
    }});
    const prohibitedActorIds = Array.from(new Set([
      cutover.requestedByUserId,
      cutover.reviewedByUserId,
      cutover.stockCountAttempt.createdByUserId,
      cutover.stockCountAttempt.assignedToUserId,
      cutover.stockCountAttempt.reviewedByUserId,
      ...cutover.stockCountAttempt.lines.map((line) => line.countedByUserId),
    ].filter((id): id is string => Boolean(id))));
    const prohibitedActors = prohibitedActorIds.map((userId) => ({ userId, reasonCode: userId === cutover.requestedByUserId ? "REQUESTER" : "SOURCE_CUSTODY" }));
    for (const [stepId, requiredPermissionCode] of [[operationStepId, permissions.openingInventoryOperationsReview], [accountingStepId, permissions.openingInventoryAccountingReview]] as const) {
      await configureApprovalStepRouting(tx, { approvalInstanceStepId: stepId, tenantId: session.context.tenantId, companyId: session.context.companyId, routingPolicy: { ...getApprovalRoutingPolicy("OpeningInventoryCutover"), requiredPermissionCode }, requiredPermissionCode, dueAt: null, activationAudit: { actorUserId: session.user.id, source: "opening-inventory-cutover-submission" }, scopeGroups: [{ groupOrder: 1, targetMatchMode: "ANY", targets: [{ scopeType: "LOCATION", companyId: session.context.companyId, locationId: cutover.locationId }] }], prohibitedActors });
    }
    await assertAnyEligibleApprovalActorForStep(tx, { tenantId: session.context.tenantId, companyId: session.context.companyId, approvalInstanceStepId: operationStepId });
    const submitted = await tx.openingInventoryCutover.updateMany({ where: { id: cutover.id, tenantId: session.context.tenantId, companyId: session.context.companyId, status: cutover.status, version: input.expectedVersion, approvalInstanceId: null }, data: { status: "PENDING_APPROVAL", approvalInstanceId: approval.id, version: { increment: 1 } } });
    if (submitted.count !== 1) throw new Error(openingInventoryStableErrors.concurrency);
    await tx.auditEvent.create({ data: { tenantId: session.context.tenantId, companyId: session.context.companyId, actorUserId: session.user.id, eventType: "opening_inventory.cutover_submitted", entityType: "OpeningInventoryCutover", entityId: cutover.id, beforeData: { status: cutover.status, version: input.expectedVersion }, afterData: { status: "PENDING_APPROVAL", version: input.expectedVersion + 1 }, metadata: { approvalInstanceId: approval.id, operationsPermission: permissions.openingInventoryOperationsReview, accountingPermission: permissions.openingInventoryAccountingReview, cutoverDigest: cutover.cutoverDigest } } });
    return approval;
  });
}

export async function requestOpeningInventoryExecutionCommand(rawInput: unknown, commandType: "FREEZE_COHORT" | "STAGE_LOCATION" | "ACTIVATE_COHORT" | "REVERSE_LOCATION", providedSession?: SessionContext) {
  const session = providedSession ?? await requireSessionContext();
  const input = requestCommandSchema.parse(rawInput);
  const permissionByCommand = { FREEZE_COHORT: permissions.openingInventoryRequestExecute, STAGE_LOCATION: permissions.openingInventoryRequestExecute, ACTIVATE_COHORT: permissions.openingInventoryRequestActivate, REVERSE_LOCATION: permissions.openingInventoryRequestReverse } as const;
  const requiredPermission = permissionByCommand[commandType];
  await requirePermission(session, requiredPermission);
  return prisma.$transaction(async (tx) => {
    const cohort = await tx.openingInventoryCohort.findFirst({ where: { id: input.cohortId, tenantId: session.context.tenantId, companyId: session.context.companyId, version: input.expectedCohortVersion } });
    if (!cohort) throw new Error(openingInventoryStableErrors.concurrency);
    const cutoverCommand = !["ACTIVATE_COHORT", "FREEZE_COHORT"].includes(commandType);
    if (cutoverCommand && (!input.cutoverId || !input.expectedCutoverVersion)) throw new Error(openingInventoryStableErrors.commandState);
    const cutover = input.cutoverId && input.expectedCutoverVersion ? await tx.openingInventoryCutover.findFirst({ where: { id: input.cutoverId, cohortId: cohort.id, tenantId: session.context.tenantId, companyId: session.context.companyId, version: input.expectedCutoverVersion } }) : null;
    if ((!["ACTIVATE_COHORT", "FREEZE_COHORT"].includes(commandType) && !cutover) || (["ACTIVATE_COHORT", "FREEZE_COHORT"].includes(commandType) && input.cutoverId)) throw new Error(openingInventoryStableErrors.commandState);
    const cohortCommand = ["ACTIVATE_COHORT", "FREEZE_COHORT"].includes(commandType);
    const preflightLocations = cohortCommand
      ? await tx.openingInventoryCutover.findMany({
          where: { cohortId: cohort.id, tenantId: session.context.tenantId, companyId: session.context.companyId },
          select: { locationId: true },
        })
      : cutover ? [{ locationId: cutover.locationId }] : [];
    if (preflightLocations.length === 0) throw new Error(openingInventoryStableErrors.commandState);
    // Scope denials must not contend for the command's target or advisory locks.
    for (const endpoint of preflightLocations) {
      await assertLiveScopedPermission(tx, session, requiredPermission, endpoint.locationId, ["APPROVE", "MANAGE"]);
    }
    const semanticTarget = cutover?.id ?? "COHORT";
    await tx.$queryRaw`SELECT "id" FROM "OpeningInventoryCohort" WHERE "id" = ${cohort.id}::uuid FOR UPDATE`;
    if (cutover) await tx.$queryRaw`SELECT "id" FROM "OpeningInventoryCutover" WHERE "id" = ${cutover.id}::uuid FOR UPDATE`;
    await tx.$queryRaw`SELECT pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(${`opening-inventory-command:${cohort.id}:${semanticTarget}:${commandType}`}, 0))::text AS "lockResult"`;
    const replay = await tx.openingInventoryExecutionCommand.findFirst({ where: { cohortId: cohort.id, idempotencyKey: input.idempotencyKey }, select: { id: true, commandType: true, cutoverId: true, expectedCohortVersion: true, expectedCutoverVersion: true, requestReason: true, requestedByUserId: true, status: true } });
    if (replay) {
      if (!(replay.commandType === commandType && replay.cutoverId === (cutover?.id ?? null) && replay.expectedCohortVersion === input.expectedCohortVersion && replay.expectedCutoverVersion === (input.expectedCutoverVersion ?? null) && replay.requestReason === input.reason && replay.requestedByUserId === session.user.id)) throw new Error(openingInventoryStableErrors.commandConflict);
    }
    const unresolved = replay ? null : await tx.openingInventoryExecutionCommand.findFirst({ where: { cohortId: cohort.id, commandType, cutoverId: cutover?.id ?? null, status: { in: ["PENDING", "CLAIMED", "FAILED_RETRYABLE"] } }, select: { id: true } });
    await assertOpeningInventoryCommandRequesterIndependent(tx, session, cohort.id, commandType);
    // Recheck after target locks so a just-revoked assignment cannot create a command.
    const lockedLocations = cohortCommand
      ? await tx.openingInventoryCutover.findMany({
          where: { cohortId: cohort.id, tenantId: session.context.tenantId, companyId: session.context.companyId },
          select: { locationId: true },
        })
      : cutover ? [{ locationId: cutover.locationId }] : [];
    if (lockedLocations.length === 0) throw new Error(openingInventoryStableErrors.commandState);
    for (const endpoint of lockedLocations) {
      await assertLiveScopedPermission(tx, session, requiredPermission, endpoint.locationId, ["APPROVE", "MANAGE"]);
    }
    if (unresolved) throw new Error(openingInventoryStableErrors.commandInFlight);
    if (replay) return replay;
    if (commandType === "ACTIVATE_COHORT") {
      const now = new Date();
      if (cohort.effectiveAt.getTime() > now.getTime()) {
        throw new Error(openingInventoryStableErrors.activationFuture);
      }
      const policy = await openingInventoryActivationPolicyStatus(tx, session);
      if (!policy.ready || !policy.maxCountAgeMinutes || !policy.maxFreezeMinutes) {
        throw new Error(openingInventoryStableErrors.activationPolicy);
      }
      const activationSources = await tx.openingInventoryCutover.findMany({
        where: { cohortId: cohort.id, tenantId: session.context.tenantId, companyId: session.context.companyId },
        select: { stockCountAttempt: { select: { cutoffAt: true, stockCountSession: { select: { cutoffAt: true } } } } },
      });
      if (!cohort.frozenAt || activationSources.length === 0) {
        throw new Error(openingInventoryStableErrors.commandState);
      }
      const maxCountAgeMs = policy.maxCountAgeMinutes * 60_000;
      const maxFreezeMs = policy.maxFreezeMinutes * 60_000;
      if (now.getTime() - cohort.frozenAt.getTime() > maxFreezeMs || activationSources.some(({ stockCountAttempt }) => !stockCountAttempt.cutoffAt || !stockCountAttempt.stockCountSession.cutoffAt || now.getTime() - stockCountAttempt.cutoffAt.getTime() > maxCountAgeMs || now.getTime() - stockCountAttempt.stockCountSession.cutoffAt.getTime() > maxCountAgeMs)) {
        throw new Error(openingInventoryStableErrors.activationWindow);
      }
    }
    await assertPrivilegedMfaForAction(session, { action: `opening_inventory.${commandType.toLowerCase()}`, enforcementScope: "all_sensitive", permissionCode: requiredPermission, entityType: cutover ? "OpeningInventoryCutover" : "OpeningInventoryCohort", entityId: cutover?.id ?? cohort.id, reason: input.reason, metadata: { cohortId: cohort.id, cutoverId: cutover?.id ?? null, commandType } }, { transaction: tx, forceEnforcement: true });
    const authSessionId = session.authentication?.sessionId;
    if (!authSessionId) throw new Error(openingInventoryStableErrors.authorityStale);
    const [requester, requesterAuthSession] = await Promise.all([
      tx.user.findFirst({ where: { id: session.user.id, tenantId: session.context.tenantId, status: "ACTIVE" }, select: { privilegeEpoch: true } }),
      tx.authSession.findFirst({ where: { id: authSessionId, tenantId: session.context.tenantId, userId: session.user.id, status: "ACTIVE" }, select: { id: true, privilegeEpochAtIssue: true, mfaAuthenticatedAt: true, idleExpiresAt: true, absoluteExpiresAt: true } }),
    ]);
    if (!requester || !requesterAuthSession?.mfaAuthenticatedAt || requesterAuthSession.privilegeEpochAtIssue !== requester.privilegeEpoch) throw new Error(openingInventoryStableErrors.authorityStale);
    const requestedMfaMode = "runtime_mfa" as const;
    const requestedMfaValidUntil = new Date(Math.min(
      requesterAuthSession.mfaAuthenticatedAt.getTime() + getMfaStepUpMinutes() * 60_000,
      requesterAuthSession.idleExpiresAt.getTime(),
      requesterAuthSession.absoluteExpiresAt.getTime(),
    ));
    if (requestedMfaValidUntil <= new Date()) throw new Error(openingInventoryStableErrors.authorityStale);
    const allChildrenReconciled = commandType === "ACTIVATE_COHORT" ? await tx.openingInventoryCutover.count({ where: { cohortId: cohort.id, status: "RECONCILED" } }) === await tx.openingInventoryCutover.count({ where: { cohortId: cohort.id } }) : true;
    if ((commandType === "FREEZE_COHORT" && cohort.status !== "SEALED") || (commandType === "STAGE_LOCATION" && cutover?.status !== "APPROVED") || (commandType === "ACTIVATE_COHORT" && (cohort.status !== "STAGED" || !allChildrenReconciled)) || (commandType === "REVERSE_LOCATION" && cutover?.status !== "RECONCILED")) throw new Error(openingInventoryStableErrors.commandState);
    const canonicalJson = canonicalOpeningInventoryJson({ commandType, cohortId: cohort.id, companyId: session.context.companyId, cutoverId: cutover?.id ?? null, expectedCohortVersion: input.expectedCohortVersion, expectedCutoverVersion: input.expectedCutoverVersion ?? null, idempotencyKey: input.idempotencyKey, reason: input.reason, requestedByUserId: session.user.id, requestedAuthSessionId: requesterAuthSession.id, requestedPrivilegeEpoch: requesterAuthSession.privilegeEpochAtIssue, requestedMfaVerifiedAt: requesterAuthSession.mfaAuthenticatedAt, requestedMfaMode, requestedMfaValidUntil, requiredPermissionCode: requiredPermission, tenantId: session.context.tenantId });
    const commandDigest = openingInventoryDigest(JSON.parse(canonicalJson));
    const command = await tx.openingInventoryExecutionCommand.create({ data: { cohortId: cohort.id, cutoverId: cutover?.id ?? null, tenantId: session.context.tenantId, companyId: session.context.companyId, commandType, status: "PENDING", idempotencyKey: input.idempotencyKey, expectedCohortVersion: input.expectedCohortVersion, expectedCutoverVersion: input.expectedCutoverVersion ?? null, canonicalJson, commandDigest, requestedByUserId: session.user.id, requestedAuthSessionId: requesterAuthSession.id, requestedPrivilegeEpoch: requesterAuthSession.privilegeEpochAtIssue, requestedMfaVerifiedAt: requesterAuthSession.mfaAuthenticatedAt, requestedMfaMode, requestedMfaValidUntil, requiredPermissionCode: requiredPermission, requestReason: input.reason } });
    await tx.auditEvent.create({ data: { tenantId: session.context.tenantId, companyId: session.context.companyId, actorUserId: session.user.id, eventType: "opening_inventory.execution_command_requested", entityType: cutover ? "OpeningInventoryCutover" : "OpeningInventoryCohort", entityId: cutover?.id ?? cohort.id, afterData: { commandType, commandId: command.id, status: command.status }, metadata: { commandDigest, reason: input.reason, executorSeparated: true } } });
    return command;
  });
}

const cutoverStatusSchema = z.enum(["DRAFT", "PENDING_APPROVAL", "RETURNED", "REJECTED", "APPROVED", "RECONCILED", "ACTIVE", "CANCELLED", "REVERSING", "REVERSED"]);
const listCutoverSchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().max(100).optional(),
  query: z.string().trim().min(1).max(120).optional(),
  status: cutoverStatusSchema.optional(),
  locationId: uuid.optional(),
  cohortId: uuid.optional(),
});

export async function listOpeningInventoryCutoverPage(session: SessionContext, rawInput: unknown = {}) {
  await requirePermission(session, permissions.openingInventoryView);
  const input = listCutoverSchema.parse(rawInput);
  const page = Math.max(1, Math.trunc(input.page ?? 1));
  const pageSize = Math.min(100, Math.max(1, Math.trunc(input.pageSize ?? 25)));
  const locationId = input.locationId ?? session.context.locationId;
  await prisma.$transaction((tx) => assertLiveScopedPermission(tx, session, permissions.openingInventoryView, locationId, ["VIEW", "OPERATE", "APPROVE", "MANAGE"]));
  const where = {
    tenantId: session.context.tenantId,
    companyId: session.context.companyId,
    locationId,
    ...(input.status ? { status: input.status } : {}),
    ...(input.cohortId ? { cohortId: input.cohortId } : {}),
    ...(input.query ? { OR: [
      { id: { contains: input.query, mode: "insensitive" as const } },
      { cohortId: { contains: input.query, mode: "insensitive" as const } },
      { stockCountAttemptId: { contains: input.query, mode: "insensitive" as const } },
    ] } : {}),
  };
  const [totalItems, items, statusSummary] = await Promise.all([
    prisma.openingInventoryCutover.count({ where }),
    prisma.openingInventoryCutover.findMany({ where, orderBy: [{ updatedAt: "desc" }, { id: "desc" }], skip: (page - 1) * pageSize, take: pageSize, include: { cohort: { select: { publicReference: true, effectiveAt: true, status: true, version: true, generation: true, configurationDigest: true, createdByUserId: true } }, inventoryLocation: { select: { code: true, name: true, location: { select: { code: true, name: true } } } }, lines: { select: { id: true } }, reconciliations: { select: { id: true, reconciliationType: true, reconciledAt: true } }, executionCommands: { select: { id: true, commandType: true, status: true, requestedAt: true }, orderBy: { requestedAt: "desc" }, take: 10 } } }),
    prisma.openingInventoryCutover.groupBy({ by: ["status"], where: { tenantId: session.context.tenantId, companyId: session.context.companyId, locationId, ...(input.cohortId ? { cohortId: input.cohortId } : {}) }, _count: { _all: true } }),
  ]);
  const cutoverIds = items.map((item) => item.id);
  const approvalIds = items.flatMap((item) => item.approvalInstanceId ? [item.approvalInstanceId] : []);
  const [approvals, activity] = await Promise.all([
    approvalIds.length > 0 ? prisma.approvalInstance.findMany({
      where: { id: { in: approvalIds }, tenantId: session.context.tenantId, companyId: session.context.companyId, documentType: "OpeningInventoryCutover", documentId: { in: cutoverIds } },
      select: { id: true, documentId: true, status: true, currentStepOrder: true, steps: { select: { stepOrder: true, status: true, assignedUserId: true, assignedRoleId: true }, orderBy: { stepOrder: "asc" } } },
    }) : [],
    cutoverIds.length > 0 ? prisma.auditEvent.findMany({
      where: { tenantId: session.context.tenantId, companyId: session.context.companyId, entityType: "OpeningInventoryCutover", entityId: { in: cutoverIds } },
      select: { entityId: true, eventType: true, occurredAt: true, actorUserId: true },
      orderBy: { occurredAt: "desc" },
      take: cutoverIds.length * 10,
    }) : [],
  ]);
  const approvalsByCutover = new Map(approvals.map((approval) => [approval.documentId, approval]));
  const userIds = new Set(items.flatMap((item) => [item.requestedByUserId, item.cohort.createdByUserId]));
  const roleIds = new Set<string>();
  for (const approval of approvals) {
    for (const step of approval.steps) {
      if (step.assignedUserId) userIds.add(step.assignedUserId);
      if (step.assignedRoleId) roleIds.add(step.assignedRoleId);
    }
  }
  const [users, roles] = await Promise.all([
    userIds.size > 0 ? prisma.user.findMany({ where: { id: { in: [...userIds] }, tenantId: session.context.tenantId }, select: { id: true, displayName: true } }) : [],
    roleIds.size > 0 ? prisma.role.findMany({ where: { id: { in: [...roleIds] }, OR: [{ tenantId: session.context.tenantId }, { tenantId: null }] }, select: { id: true, name: true } }) : [],
  ]);
  const userNames = new Map(users.map((user) => [user.id, user.displayName]));
  const roleNames = new Map(roles.map((role) => [role.id, role.name]));
  const activityByCutover = new Map<string, typeof activity>();
  for (const event of activity) {
    activityByCutover.set(event.entityId, [...(activityByCutover.get(event.entityId) ?? []), event]);
  }
  return {
    items: items.map((item) => {
      const approval = approvalsByCutover.get(item.id) ?? null;
      const currentStep = approval?.steps.find((step) => step.stepOrder === approval.currentStepOrder && step.status === "PENDING") ?? null;
      return {
        ...item,
        requesterName: userNames.get(item.requestedByUserId) ?? null,
        ownerName: userNames.get(item.cohort.createdByUserId) ?? null,
        currentApprover: currentStep ? (currentStep.assignedUserId ? userNames.get(currentStep.assignedUserId) ?? "Assigned approver" : currentStep.assignedRoleId ? roleNames.get(currentStep.assignedRoleId) ?? "Assigned approval role" : "Approval routing in progress") : null,
        approval,
        auditSummary: (activityByCutover.get(item.id) ?? []).slice(0, 10),
      };
    }),
    totalItems,
    totalPages: Math.max(1, Math.ceil(totalItems / pageSize)),
    page,
    pageSize,
    statusSummary: statusSummary.map((entry) => ({ status: entry.status, count: entry._count._all })),
  };
}

const openingInventoryDetailViewSchema = z.object({
  tab: z.enum(["summary", "lines", "evidence", "approvals", "activity"]).default("summary"),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(10),
});

type OpeningInventoryActivityRow = {
  id: string;
  sourceKind: "AUDIT" | "COHORT" | "COMMAND";
  eventType: string;
  occurredAt: Date;
  actorName: string | null;
  targetLabel: string | null;
  commandStatus: string | null;
  completedAt: Date | null;
  failureCode: string | null;
};

export async function getOpeningInventoryCutoverDetail(session: SessionContext, rawCutoverId: unknown, rawViewInput: unknown = {}) {
  await requirePermission(session, permissions.openingInventoryView);
  const view = openingInventoryDetailViewSchema.parse(rawViewInput);
  const cutoverId = uuid.safeParse(rawCutoverId);
  if (!cutoverId.success) throw new Error("OPENING_INVENTORY_CUTOVER_NOT_FOUND");
  const cutover = await prisma.openingInventoryCutover.findFirst({
    where: {
      id: cutoverId.data,
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
    },
    include: {
      cohort: true,
      inventoryLocation: { select: { code: true, name: true, location: { select: { code: true, name: true } } } },
      stockCountAttempt: { select: { id: true, cutoffAt: true, stockCountSession: { select: { publicReference: true, cutoffAt: true } } } },
      reconciliations: { orderBy: { reconciledAt: "desc" } },
    },
  });
  if (!cutover) throw new Error("OPENING_INVENTORY_CUTOVER_NOT_FOUND");
  try {
    await prisma.$transaction((tx) => assertLiveScopedPermission(tx, session, permissions.openingInventoryView, cutover.locationId, ["VIEW", "OPERATE", "APPROVE", "MANAGE"]));
  } catch {
    throw new Error("OPENING_INVENTORY_CUTOVER_NOT_FOUND");
  }
  let cohortSharedVisible = false;
  let cohortSharedUnavailable = false;
  try {
    const revision = await prisma.inventoryPilotConfigurationRevision.findFirst({
      where: {
        id: cutover.cohort.configurationRevisionId,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        revisionNumber: cutover.cohort.configurationRevisionNumber,
        configurationDigest: cutover.cohort.configurationDigest,
        status: "SEALED",
      },
      select: {
        endpointMemberships: {
          where: { capability: "OPENING_STOCK_LOCATION" },
          select: {
            tenantId: true,
            companyId: true,
            configurationRevisionNumber: true,
            inventoryLocationId: true,
            locationId: true,
          },
          orderBy: { id: "asc" },
        },
      },
    });
    const endpoints = revision?.endpointMemberships ?? [];
    const endpointGraphValid = Boolean(revision) &&
      endpoints.length > 0 &&
      new Set(endpoints.map((endpoint) => endpoint.locationId)).size === endpoints.length &&
      new Set(endpoints.map((endpoint) => endpoint.inventoryLocationId)).size === endpoints.length &&
      endpoints.every((endpoint) =>
        endpoint.tenantId === session.context.tenantId &&
        endpoint.companyId === session.context.companyId &&
        endpoint.configurationRevisionNumber === cutover.cohort.configurationRevisionNumber
      ) &&
      endpoints.some((endpoint) =>
        endpoint.locationId === cutover.locationId &&
        endpoint.inventoryLocationId === cutover.inventoryLocationId
      );
    if (!endpointGraphValid) {
      cohortSharedUnavailable = true;
    } else {
      try {
        await prisma.$transaction(async (tx) => {
          for (const endpoint of endpoints) {
            await assertLiveScopedPermission(tx, session, permissions.openingInventoryView, endpoint.locationId, ["VIEW", "OPERATE", "APPROVE", "MANAGE"]);
          }
        });
        cohortSharedVisible = true;
      } catch (error) {
        const safeCode = error instanceof Error ? error.message : "";
        if (![openingInventoryStableErrors.endpointScope, openingInventoryStableErrors.authorityStale, "PERMISSION_DENIED"].includes(safeCode)) {
          cohortSharedUnavailable = true;
        }
      }
    }
  } catch {
    cohortSharedUnavailable = true;
  }
  const skip = (view.page - 1) * view.pageSize;
  const [approval, lineCount, lines, localCommands, cohortCommands] = await Promise.all([
    cutover.approvalInstanceId ? prisma.approvalInstance.findFirst({
      where: { id: cutover.approvalInstanceId, tenantId: session.context.tenantId, companyId: session.context.companyId, documentType: "OpeningInventoryCutover", documentId: cutover.id },
      select: { id: true, status: true, currentStepOrder: true, steps: { select: { id: true, stepOrder: true, status: true, assignedUserId: true, assignedRoleId: true, actedByUserId: true, actedAt: true, remarks: true }, orderBy: { stepOrder: "asc" } } },
    }) : null,
    prisma.openingInventoryCutoverLine.count({ where: { cutoverId: cutover.id, tenantId: session.context.tenantId, companyId: session.context.companyId } }),
    view.tab === "lines" ? prisma.openingInventoryCutoverLine.findMany({ where: { cutoverId: cutover.id, tenantId: session.context.tenantId, companyId: session.context.companyId }, orderBy: [{ lineNumber: "asc" }, { id: "asc" }], skip, take: view.pageSize, include: { item: { select: { itemCode: true, itemName: true } }, uom: { select: { uomCode: true, uomName: true } } } }) : [],
    prisma.openingInventoryExecutionCommand.findMany({
      where: { cutoverId: cutover.id, tenantId: session.context.tenantId, companyId: session.context.companyId, status: { in: ["PENDING", "CLAIMED", "FAILED_RETRYABLE"] } },
      select: { id: true, commandType: true, status: true, requestedByUserId: true, requestedAt: true, completedAt: true, failureCode: true },
      orderBy: [{ requestedAt: "desc" }, { id: "desc" }],
      take: 8,
    }),
    cohortSharedVisible ? prisma.openingInventoryExecutionCommand.findMany({
      where: { cohortId: cutover.cohortId, cutoverId: null, tenantId: session.context.tenantId, companyId: session.context.companyId, status: { in: ["PENDING", "CLAIMED", "FAILED_RETRYABLE"] } },
      select: { id: true, commandType: true, status: true, requestedByUserId: true, requestedAt: true, completedAt: true, failureCode: true },
      orderBy: [{ requestedAt: "desc" }, { id: "desc" }],
      take: 8,
    }) : [],
  ]);
  const cohortActivityUnion = cohortSharedVisible ? Prisma.sql`
      UNION ALL
      SELECT concat('cohort:', event.id::text) AS "id", 'COHORT'::text AS "sourceKind",
             event."eventType"::text AS "eventType", event."occurredAt", actor."displayName" AS "actorName",
             NULL::text AS "targetLabel", NULL::text AS "commandStatus", NULL::timestamptz AS "completedAt", NULL::text AS "failureCode"
        FROM "OpeningInventoryCohortEvent" event
        LEFT JOIN "User" actor ON actor.id = event."actorUserId" AND actor."tenantId" = event."tenantId"
       WHERE event."cohortId" = ${cutover.cohortId}::uuid
         AND event."tenantId" = ${session.context.tenantId}::uuid
         AND event."companyId" = ${session.context.companyId}::uuid
      UNION ALL
      SELECT concat('command:', command.id::text) AS "id", 'COMMAND'::text AS "sourceKind",
             concat(command."commandType"::text, '_COMMAND') AS "eventType", command."requestedAt" AS "occurredAt",
             requester."displayName" AS "actorName", 'Cohort-wide'::text AS "targetLabel",
             command.status::text AS "commandStatus", command."completedAt", command."failureCode"
        FROM "OpeningInventoryExecutionCommand" command
        LEFT JOIN "User" requester ON requester.id = command."requestedByUserId" AND requester."tenantId" = command."tenantId"
       WHERE command."cohortId" = ${cutover.cohortId}::uuid
         AND command."cutoverId" IS NULL
         AND command."tenantId" = ${session.context.tenantId}::uuid
         AND command."companyId" = ${session.context.companyId}::uuid
    ` : Prisma.empty;
  const [activityRows, activityCounts] = view.tab === "activity"
    ? await Promise.all([
        prisma.$queryRaw<OpeningInventoryActivityRow[]>`
          WITH activity AS (
            SELECT concat('audit:', audit.id::text) AS "id", 'AUDIT'::text AS "sourceKind",
                   audit."eventType", audit."occurredAt", actor."displayName" AS "actorName",
                   NULL::text AS "targetLabel", NULL::text AS "commandStatus", NULL::timestamptz AS "completedAt", NULL::text AS "failureCode"
              FROM "AuditEvent" audit
              LEFT JOIN "User" actor ON actor.id = audit."actorUserId" AND actor."tenantId" = audit."tenantId"
             WHERE audit."tenantId" = ${session.context.tenantId}::uuid
               AND audit."companyId" = ${session.context.companyId}::uuid
               AND audit."entityType" = 'OpeningInventoryCutover'
               AND audit."entityId" = ${cutover.id}::uuid
            UNION ALL
            SELECT concat('command:', command.id::text) AS "id", 'COMMAND'::text AS "sourceKind",
                   concat(command."commandType"::text, '_COMMAND') AS "eventType", command."requestedAt" AS "occurredAt",
                   requester."displayName" AS "actorName", 'Current location batch'::text AS "targetLabel",
                   command.status::text AS "commandStatus", command."completedAt", command."failureCode"
              FROM "OpeningInventoryExecutionCommand" command
              LEFT JOIN "User" requester ON requester.id = command."requestedByUserId" AND requester."tenantId" = command."tenantId"
             WHERE command."cutoverId" = ${cutover.id}::uuid
               AND command."tenantId" = ${session.context.tenantId}::uuid
               AND command."companyId" = ${session.context.companyId}::uuid
            ${cohortActivityUnion}
          )
          SELECT "id", "sourceKind", "eventType", "occurredAt", "actorName", "targetLabel", "commandStatus", "completedAt", "failureCode"
            FROM activity
           ORDER BY "occurredAt" DESC, "id" DESC
           OFFSET ${skip}
           LIMIT ${view.pageSize}
        `,
        Promise.all([
          prisma.auditEvent.count({ where: { tenantId: session.context.tenantId, companyId: session.context.companyId, entityType: "OpeningInventoryCutover", entityId: cutover.id } }),
          prisma.openingInventoryExecutionCommand.count({ where: { cutoverId: cutover.id, tenantId: session.context.tenantId, companyId: session.context.companyId } }),
          cohortSharedVisible ? prisma.openingInventoryCohortEvent.count({ where: { cohortId: cutover.cohortId, tenantId: session.context.tenantId, companyId: session.context.companyId } }) : 0,
          cohortSharedVisible ? prisma.openingInventoryExecutionCommand.count({ where: { cohortId: cutover.cohortId, cutoverId: null, tenantId: session.context.tenantId, companyId: session.context.companyId } }) : 0,
        ]),
      ])
    : [[], [0, 0, 0, 0] as const];
  const activityTotalItems = activityCounts.reduce((total, count) => total + count, 0);
  const userIds = new Set<string>([
    cutover.requestedByUserId,
    cutover.cohort.createdByUserId,
    ...localCommands.map((command) => command.requestedByUserId),
    ...cohortCommands.map((command) => command.requestedByUserId),
    ...(approval?.steps.flatMap((step) => [step.assignedUserId, step.actedByUserId]).filter((id): id is string => Boolean(id)) ?? []),
  ]);
  const roleIds = approval?.steps.map((step) => step.assignedRoleId).filter((id): id is string => Boolean(id)) ?? [];
  const [users, roles] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: [...userIds] }, tenantId: session.context.tenantId }, select: { id: true, displayName: true } }),
    roleIds.length > 0 ? prisma.role.findMany({ where: { id: { in: roleIds }, OR: [{ tenantId: session.context.tenantId }, { tenantId: null }] }, select: { id: true, name: true } }) : [],
  ]);
  const userNames = new Map(users.map((user) => [user.id, user.displayName]));
  const roleNames = new Map(roles.map((role) => [role.id, role.name]));
  const approvalWithPeople = approval ? {
    ...approval,
    steps: approval.steps.map((step) => ({
      ...step,
      assignedUserName: step.assignedUserId ? userNames.get(step.assignedUserId) ?? null : null,
      assignedRoleName: step.assignedRoleId ? roleNames.get(step.assignedRoleId) ?? null : null,
      actedByUserName: step.actedByUserId ? userNames.get(step.actedByUserId) ?? null : null,
    })),
  } : null;
  let evidenceSummary: Array<{ controlledEvidenceAttachmentId: string; attachmentId: string; objectVersionId: string | null; checksum: string | null; originalFilename: string }> = [];
  let evidenceTotalItems = 0;
  let evidenceUnavailable = cohortSharedUnavailable;
  if (cohortSharedVisible) {
    try {
      const manifest = JSON.parse(cutover.evidenceManifestJson) as unknown;
      if (!Array.isArray(manifest) || manifest.length === 0) throw new Error("EVIDENCE_READ_UNAVAILABLE");
      const ids = manifest.map((entry) => {
        if (!entry || typeof entry !== "object" || !("controlledEvidenceAttachmentId" in entry)) {
          throw new Error("EVIDENCE_READ_UNAVAILABLE");
        }
        const id = (entry as { controlledEvidenceAttachmentId?: unknown }).controlledEvidenceAttachmentId;
        if (typeof id !== "string" || !uuid.safeParse(id).success) throw new Error("EVIDENCE_READ_UNAVAILABLE");
        return id;
      });
      if (new Set(ids).size !== ids.length) throw new Error("EVIDENCE_READ_UNAVAILABLE");
      evidenceTotalItems = ids.length;
      if (view.tab === "evidence") {
        const pageIds = ids.slice(skip, skip + view.pageSize);
        const links = pageIds.length > 0 ? await prisma.controlledEvidenceAttachment.findMany({
          // A sealed manifest is historical evidence. Resolve every retained link
          // named by that manifest rather than silently omitting archived links.
          where: { id: { in: pageIds }, tenantId: session.context.tenantId, companyId: session.context.companyId, sourceType: "OPENING_INVENTORY_COHORT", sourceRecordId: cutover.cohortId },
          select: { id: true, attachmentId: true, attachment: { select: { objectVersionId: true, checksum: true, originalFilename: true } } },
          orderBy: { id: "asc" },
        }) : [];
        if (links.length !== pageIds.length) throw new Error("EVIDENCE_READ_UNAVAILABLE");
        evidenceSummary = links.map((link) => ({ controlledEvidenceAttachmentId: link.id, attachmentId: link.attachmentId, objectVersionId: link.attachment.objectVersionId, checksum: link.attachment.checksum, originalFilename: link.attachment.originalFilename }));
      }
    } catch {
      evidenceSummary = [];
      evidenceTotalItems = 0;
      evidenceUnavailable = true;
    }
  }
  const commandDtos = [...cohortCommands.map((command) => ({ ...command, targetLabel: "Cohort-wide" })), ...localCommands.map((command) => ({ ...command, targetLabel: "Current location batch" }))].map((command) => ({ ...command, failureCode: safeOpeningCommandFailureCode(command.failureCode), requesterName: userNames.get(command.requestedByUserId) ?? null }));
  const activityItems = activityRows.map((row) => {
    const failureCode = safeOpeningCommandFailureCode(row.failureCode);
    const detail = row.sourceKind === "COMMAND"
      ? `${row.targetLabel ?? "Opening inventory"} · ${row.commandStatus ?? "UNKNOWN"}${row.completedAt ? ` · completed ${row.completedAt.toISOString()}` : ""}${failureCode ? ` · ${failureCode}` : ""}`
      : row.sourceKind === "COHORT"
        ? "Cohort authority event"
        : "Current location batch audit event";
    return { id: row.id, eventType: row.eventType, occurredAt: row.occurredAt, actorName: row.actorName, detail };
  });
  return {
    ...cutover,
    requesterName: userNames.get(cutover.requestedByUserId) ?? null,
    ownerName: userNames.get(cutover.cohort.createdByUserId) ?? null,
    currentApprover: approvalWithPeople?.steps.find((step) => step.stepOrder === approvalWithPeople.currentStepOrder && step.status === "PENDING") ?? null,
    approval: approvalWithPeople,
    cohortSharedVisible,
    evidenceUnavailable,
    linesPage: { items: lines, totalItems: lineCount, page: view.page, pageSize: view.pageSize },
    activityPage: { items: activityItems, totalItems: activityTotalItems, page: view.page, pageSize: view.pageSize },
    actionCommands: commandDtos,
    evidencePage: { items: evidenceSummary, totalItems: evidenceTotalItems, page: view.page, pageSize: view.pageSize },
  };
}

export async function getOpeningInventoryFormOptions(
  session: SessionContext,
  input: { cohortId?: string; evidencePage?: number; evidencePageSize?: number } = {},
) {
  await requirePermission(session, permissions.openingInventoryPrepare);
  await prisma.$transaction((tx) => assertLiveScopedPermission(tx, session, permissions.openingInventoryPrepare, session.context.locationId, ["OPERATE", "APPROVE", "MANAGE"]));
  const [candidateEvaluation, attempts, cohorts] = await Promise.all([
    prisma.$transaction(async (tx) => {
      const eligibility = await evaluateLatestOpeningInventoryRevision(tx, session);
      const revision = eligibility.revision;
      if (!revision) return { ...eligibility, revisions: [] };
      if (!revision.endpointMemberships.some((row) => row.capability === "OPENING_STOCK_LOCATION" && row.locationId === session.context.locationId)) return { ...eligibility, code: openingInventoryStableErrors.endpointScope, revisions: [] };
      return { ...eligibility, revisions: [{
        id: revision.id,
        revisionNumber: revision.revisionNumber,
        configurationDigest: revision.configurationDigest,
        sealedAt: revision.sealedAt,
        endpointMemberships: revision.endpointMemberships.filter((row) => row.capability === "OPENING_STOCK_LOCATION").map((row) => ({ inventoryLocationId: row.inventoryLocationId, locationId: row.locationId })),
        itemMemberships: revision.itemMemberships.map((row) => ({ itemId: row.itemId })),
      }] };
    }),
    prisma.stockCountAttempt.findMany({
      where: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        status: "REVIEWED",
        freezeMovements: true,
        cutoffAt: { not: null },
        evidenceReference: { not: null },
        inventoryLocation: { locationId: session.context.locationId, status: "ACTIVE" },
        stockCountSession: { countType: "OPENING", status: "REVIEWED", freezeMovements: true, cutoffAt: { not: null }, currentAttemptId: { not: null } },
        openingInventoryCutovers: { none: {} },
      },
      select: { id: true, stockCountSessionId: true, inventoryLocationId: true, cutoffAt: true, stockCountSession: { select: { publicReference: true, currentAttemptId: true } } },
      orderBy: { cutoffAt: "desc" },
    }),
    prisma.openingInventoryCohort.findMany({
      where: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        status: "DRAFT",
        configurationRevision: {
          endpointMemberships: {
            some: { capability: "OPENING_STOCK_LOCATION", locationId: session.context.locationId },
          },
        },
      },
      select: {
        id: true,
        publicReference: true,
        effectiveAt: true,
        version: true,
        generation: true,
        configurationRevisionId: true,
        cohortDigest: true,
        configurationRevision: {
          select: {
            endpointMemberships: {
              where: { capability: "OPENING_STOCK_LOCATION" },
              select: { locationId: true },
            },
          },
        },
      },
      orderBy: { effectiveAt: "desc" },
    }),
  ]);
  const revisions = (
    await Promise.all(candidateEvaluation.revisions.map(async (revision) => {
      try {
        await prisma.$transaction(async (tx) => {
          for (const endpoint of revision.endpointMemberships) {
            await assertLiveScopedPermission(
              tx,
              session,
              permissions.openingInventoryPrepare,
              endpoint.locationId,
              ["OPERATE", "APPROVE", "MANAGE"],
            );
          }
        });
        return revision;
      } catch {
        // A cohort is a company-wide immutable control object. Do not expose a
        // configuration as creatable when the preparer cannot act at every
        // endpoint it would bind. The command service repeats this check.
        return null;
      }
    }))
  ).filter((revision): revision is (typeof candidateEvaluation.revisions)[number] => revision !== null);
  const requestedCohortId = input.cohortId && uuid.safeParse(input.cohortId).success ? input.cohortId : null;
  const selectedCohort = requestedCohortId
    ? cohorts.find((cohort) => cohort.id === requestedCohortId)
    : null;
  let selectedCohortId: string | null = null;
  if (selectedCohort) {
    try {
      await prisma.$transaction(async (tx) => {
        for (const endpoint of selectedCohort.configurationRevision.endpointMemberships) {
          await assertLiveScopedPermission(
            tx,
            session,
            permissions.openingInventoryPrepare,
            endpoint.locationId,
            ["OPERATE", "APPROVE", "MANAGE"],
          );
        }
      });
      selectedCohortId = selectedCohort.id;
    } catch {
      // Do not distinguish an unavailable cohort from a cohort with an endpoint
      // outside the actor's current live preparation scope.
      selectedCohortId = null;
    }
  }
  const evidencePage = Math.max(1, Math.trunc(input.evidencePage ?? 1));
  const evidencePageSize = Math.min(25, Math.max(1, Math.trunc(input.evidencePageSize ?? 10)));
  const evidenceWhere = selectedCohortId ? {
    tenantId: session.context.tenantId, companyId: session.context.companyId, sourceType: "OPENING_INVENTORY_COHORT" as const, sourceRecordId: selectedCohortId, status: "ACTIVE" as const, archivedAt: null,
    attachment: { status: "ACTIVE" as const, uploadState: "VERIFIED" as const, scanState: "CLEAN" as const, availabilityState: "AVAILABLE" as const, physicalState: "DURABLE" as const, objectVersionId: { not: null }, checksum: { not: null } },
  } : null;
  const [evidenceLinks, evidenceTotalItems, activationPolicy] = await Promise.all([selectedCohortId && evidenceWhere ? prisma.controlledEvidenceAttachment.findMany({
    where: {
      ...evidenceWhere,
    },
    select: { id: true, attachmentId: true, purpose: true, caption: true, status: true, createdAt: true, attachment: { select: { originalFilename: true, mimeType: true, sizeBytes: true, uploadState: true, scanState: true, availabilityState: true, objectVersionId: true, checksum: true } } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }], skip: (evidencePage - 1) * evidencePageSize, take: evidencePageSize,
  }) : [], selectedCohortId && evidenceWhere ? prisma.controlledEvidenceAttachment.count({ where: evidenceWhere }) : 0, prisma.$transaction((tx) => openingInventoryActivationPolicyStatus(tx, session))]);
  return {
    revisions,
    configurationEligibility: {
      eligible: revisions.length > 0,
      code: revisions.length > 0 ? null : candidateEvaluation.code,
      blockerCodes: candidateEvaluation.blockerCodes,
    },
    reviewedOpeningAttempts: attempts.filter((attempt) => attempt.stockCountSession.currentAttemptId === attempt.id),
    draftCohorts: cohorts.map((cohort) => ({
      id: cohort.id,
      publicReference: cohort.publicReference,
      effectiveAt: cohort.effectiveAt,
      version: cohort.version,
      generation: cohort.generation,
      configurationRevisionId: cohort.configurationRevisionId,
      cohortDigest: cohort.cohortDigest,
    })),
    eligibleEvidenceAttachments: evidenceLinks,
    eligibleEvidencePage: { page: evidencePage, pageSize: evidencePageSize, totalItems: evidenceTotalItems },
    activationPolicy,
  };
}

const preparationFormOptionsSchema = z.object({
  cohortId: uuid,
  stockCountAttemptId: uuid,
});

/**
 * Returns only the immutable, reviewed count facts required to price one
 * location cutover. The client never derives eligibility or line coverage.
 */
export async function getOpeningInventoryPreparationFormOptions(
  session: SessionContext,
  rawInput: unknown,
) {
  await requirePermission(session, permissions.openingInventoryPrepare);
  const input = preparationFormOptionsSchema.parse(rawInput);
  return prisma.$transaction(async (tx) => {
    const cohort = await tx.openingInventoryCohort.findFirst({
      where: {
        id: input.cohortId,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        status: "DRAFT",
      },
      include: {
        configurationRevision: {
          include: {
            endpointMemberships: { where: { capability: "OPENING_STOCK_LOCATION" } },
            itemMemberships: { select: { itemId: true } },
          },
        },
      },
    });
    if (!cohort || cohort.configurationRevision.status !== "SEALED") {
      throw new Error(openingInventoryStableErrors.unsupportedConfiguration);
    }
    const endpoint = cohort.configurationRevision.endpointMemberships.find(
      (entry) => entry.locationId === session.context.locationId,
    );
    if (!endpoint) throw new Error(openingInventoryStableErrors.endpointScope);
    await assertLiveScopedPermission(tx, session, permissions.openingInventoryPrepare, endpoint.locationId, ["OPERATE", "APPROVE", "MANAGE"]);
    const attempt = await tx.stockCountAttempt.findFirst({
      where: {
        id: input.stockCountAttemptId,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        inventoryLocationId: endpoint.inventoryLocationId,
        status: "REVIEWED",
        freezeMovements: true,
        cutoffAt: { not: null },
        evidenceReference: { not: null },
        openingInventoryCutovers: { none: {} },
        stockCountSession: {
          countType: "OPENING",
          status: "REVIEWED",
          freezeMovements: true,
          cutoffAt: { not: null },
          currentAttemptId: input.stockCountAttemptId,
        },
      },
      include: {
        stockCountSession: { select: { publicReference: true, cutoffAt: true } },
        lines: {
          orderBy: { lineNumber: "asc" },
          include: {
            item: { select: { itemCode: true, itemName: true, trackInventory: true, trackLot: true, trackExpiry: true, baseUomId: true, baseUom: { select: { uomCode: true } } } },
            uom: { select: { uomCode: true } },
          },
        },
      },
    });
    if (!attempt || !attempt.cutoffAt || !attempt.stockCountSession.cutoffAt) {
      throw new Error(openingInventoryStableErrors.sourceNotReviewed);
    }
    if (attempt.cutoffAt.getTime() > cohort.effectiveAt.getTime() || attempt.stockCountSession.cutoffAt.getTime() > cohort.effectiveAt.getTime()) {
      throw new Error(openingInventoryStableErrors.cutoffAfterEffectiveAt);
    }
    const selectedItemIds = new Set(cohort.configurationRevision.itemMemberships.map((entry) => entry.itemId));
    const coveredItemIds = new Set(attempt.lines.map((line) => line.itemId));
    if (attempt.lines.length === 0 || [...selectedItemIds].some((itemId) => !coveredItemIds.has(itemId)) || attempt.lines.some((line) => !selectedItemIds.has(line.itemId) || line.countedQuantityBaseUom === null || Number(line.countedQuantityBaseUom) < 0 || Number(line.systemQuantityBaseUom) !== 0)) {
      throw new Error(openingInventoryStableErrors.sourceCoverage);
    }
    return {
      cohort: { id: cohort.id, version: cohort.version, effectiveAt: cohort.effectiveAt, configurationDigest: cohort.configurationDigest },
      attempt: {
        id: attempt.id,
        stockCountSessionId: attempt.stockCountSessionId,
        stockCountSessionReference: attempt.stockCountSession.publicReference,
        inventoryLocationId: attempt.inventoryLocationId,
        cutoffAt: attempt.cutoffAt,
        sessionCutoffAt: attempt.stockCountSession.cutoffAt,
        lines: attempt.lines.map((line) => ({
          id: line.id,
          lineNumber: line.lineNumber,
          itemId: line.itemId,
          itemCode: line.item.itemCode,
          itemName: line.item.itemName,
          lotKey: line.lotKey,
          lotNumber: line.lotNumber,
          expiryDate: line.expiryDate,
          countedQuantityBaseUom: line.countedQuantityBaseUom,
          baseUomId: line.item.baseUomId,
          baseUomCode: line.item.baseUom.uomCode,
          countedUomId: line.uomId,
          countedUomCode: line.uom.uomCode,
          trackInventory: line.item.trackInventory,
          trackLot: line.item.trackLot,
          trackExpiry: line.item.trackExpiry,
        })),
      },
    };
  });
}
