import { AsyncLocalStorage } from "node:async_hooks";
import { createHash } from "node:crypto";
import { Prisma, type TransactionClient } from "@ogfi/database";
import { z } from "zod";

const POLICY_UNCONFIRMED = "CONTROLLED_EVIDENCE_POLICY_UNCONFIRMED";
const EVIDENCE_NOT_QUALIFIED = "CONTROLLED_EVIDENCE_NOT_QUALIFIED";
const QUALIFICATION_CONFLICT = "CONTROLLED_EVIDENCE_QUALIFICATION_CONFLICT";

/**
 * DEC-0077 deliberately ships no live adapter and no runtime switch. A later,
 * separately confirmed decision must add both a real adapter and an activation
 * path. This constant is intentionally not environment-configurable.
 */
export const CONTROLLED_EVIDENCE_QUALIFICATION_RUNTIME_ENABLED = false;

type CanonicalPrimitive = string | number | boolean | null;
export type ControlledEvidenceCanonicalValue =
  | CanonicalPrimitive
  | readonly ControlledEvidenceCanonicalValue[]
  | { readonly [key: string]: ControlledEvidenceCanonicalValue };

export type ControlledEvidenceClosedActionContext = Readonly<{
  tenantId: string;
  companyId: string;
  sourceType: string;
  sourceRecordId: string;
  sourceVersion: string;
  sourceLineId: string | null;
  executionKey: string;
  actorUserId: string;
  actorAuthSessionId: string | null;
  actorPrivilegeEpoch: number;
  approvalInstanceId: string | null;
  approvalStepId: string | null;
  provenance: Readonly<Record<string, ControlledEvidenceCanonicalValue>>;
}>;

export type ControlledEvidenceActionAdapter = Readonly<{
  actionCode: string;
  actionSchemaVersion: number;
  supportedPolicySchemaVersions: readonly number[];
  closeActionContext: (
    serverOwnedContext: unknown,
  ) => ControlledEvidenceClosedActionContext;
}>;

export type QualifyControlledEvidenceInput = Readonly<{
  tx: TransactionClient;
  actionCode: string;
  serverOwnedActionContext: unknown;
  controlledEvidenceAttachmentIds: readonly string[];
}>;

export type ControlledEvidenceQualificationResult = Readonly<{
  qualificationId: string;
  actionCode: string;
  executionHash: string;
  selectionHash: string;
  policyVersion: number;
  policyPointerVersion: number;
  selectedCount: number;
  identicalRetry: boolean;
}>;

const productionActionAdapters: ReadonlyMap<
  string,
  ControlledEvidenceActionAdapter
> = new Map();

const testAdapterScope = new AsyncLocalStorage<
  ReadonlyMap<string, ControlledEvidenceActionAdapter>
>();

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const tokenPattern = /^[A-Za-z][A-Za-z0-9_.:-]{0,119}$/;

const policyDocumentSchema = z
  .object({
    schemaVersion: z.literal(1),
    sourceType: z.string().regex(tokenPattern),
    purposeRequirements: z
      .array(
        z
          .object({
            purpose: z.string().regex(tokenPattern),
            minimumCount: z.number().int().safe().nonnegative(),
            maximumCount: z.number().int().safe().positive(),
          })
          .strict(),
      )
      .min(1),
  })
  .strict();

type ControlledEvidencePolicyDocument = z.infer<typeof policyDocumentSchema>;

type PolicyActivationPointerRow = {
  id: string;
  activeActivationEventId: string;
  pointerVersion: number;
};

type PolicyActivationEventRow = {
  id: string;
  policyVersionId: string;
  policyVersion: number;
  priorActivationEventId: string | null;
  priorPolicyVersionId: string | null;
  priorPolicyVersion: number | null;
  pointerVersion: number;
  activatedByUserId: string;
  activatedAt: Date;
  activationReason: string;
  provenance: unknown;
  canonicalJson: string;
  activationHash: string;
};

type PolicyVersionRow = {
  id: string;
  version: number;
  schemaVersion: number;
  policy: unknown;
  canonicalJson: string;
  configHash: string;
};

type LockedAttachmentRow = {
  controlledEvidenceAttachmentId: string;
  attachmentId: string;
  objectVersionId: string | null;
  checksum: string | null;
  detectedChecksum: string | null;
  storedChecksum: string | null;
  uploadState: string;
  scanState: string;
  availabilityState: string;
  physicalState: string;
  status: string;
  rowVersion: number;
  scanVerifiedObjectVersionId: string | null;
  replacedByAttachmentId: string | null;
};

type LockedScanRow = {
  id: string;
  attachmentId: string;
  objectVersionId: string;
  scanProvider: string;
  scannerEngineVersion: string;
  signatureVersion: string;
  completedAt: Date;
  result: string;
  plaintextChecksum: string;
};

type LockedLinkRow = {
  id: string;
  attachmentId: string;
  sourceType: string;
  sourceRecordId: string;
  sourceLineId: string | null;
  purpose: string;
  status: string;
  archivedAt: Date | null;
  updatedAt: Date;
};

type SelectionSnapshot = Readonly<{
  ordinal: number;
  controlledEvidenceAttachmentId: string;
  attachmentId: string;
  objectVersionId: string;
  scanAttemptId: string;
  sourceLineId: string | null;
  purpose: string;
  controlledEvidenceLinkStatus: "ACTIVE";
  controlledEvidenceLinkArchivedAt: null;
  controlledEvidenceLinkUpdatedAt: string;
  attachmentStatus: "ACTIVE";
  attachmentRowVersion: number;
  scanVerifiedObjectVersionId: string;
  replacementAttachmentId: null;
  attachmentChecksum: string;
  attachmentDetectedChecksum: string;
  attachmentStoredChecksum: string;
  uploadState: "VERIFIED";
  scanState: "CLEAN";
  availabilityState: "AVAILABLE";
  physicalState: "DURABLE";
  scanResult: "CLEAN";
  scanCompletedAt: string;
  scanProvider: string;
  scannerEngineVersion: string;
  scanSignatureVersion: string;
  scanPlaintextChecksum: string;
}>;

type ExistingQualificationRow = {
  id: string;
  executionKey: string;
  idempotencyKey: string;
  executionHash: string;
  selectionHash: string;
  selectionCount: number;
  policyActivationId: string;
  policyActivationPointerId: string;
  policyPointerVersion: number;
  policyVersionId: string;
  policyVersion: number;
  policySchemaVersion: number;
  policyConfigHash: string;
};

type ExistingSelectionRow = {
  ordinal: number;
  selectionCanonicalJson: string;
  selectionHash: string;
};

function failPolicy(): never {
  throw new Error(POLICY_UNCONFIRMED);
}

function failEvidence(): never {
  throw new Error(EVIDENCE_NOT_QUALIFIED);
}

function canonicalize(value: unknown): ControlledEvidenceCanonicalValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) failPolicy();
    return Object.is(value, -0) ? 0 : value;
  }
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonicalize);
  if (typeof value === "object") {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) failPolicy();
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => {
          if (item === undefined) failPolicy();
          return [key, canonicalize(item)];
        }),
    );
  }
  return failPolicy();
}

export function controlledEvidenceQualificationCanonicalJson(value: unknown) {
  return JSON.stringify(canonicalize(value));
}

export function controlledEvidenceQualificationDigest(value: unknown) {
  return createHash("sha256")
    .update(controlledEvidenceQualificationCanonicalJson(value), "utf8")
    .digest("hex");
}

function deterministicUuid(hash: string) {
  const bytes = Buffer.from(hash.slice(0, 32), "hex");
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x50;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const value = bytes.toString("hex");
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

function normalizeSha256(value: string | null) {
  if (!value) return null;
  const stripped = value.startsWith("sha256:") ? value.slice(7) : value;
  const lower = stripped.toLowerCase();
  if (/^[a-f0-9]{64}$/.test(lower)) return lower;
  if (!/^[A-Za-z0-9+/]{43}=$/.test(stripped)) return null;
  const bytes = Buffer.from(stripped, "base64");
  return bytes.byteLength === 32 ? bytes.toString("hex") : null;
}

function assertUuid(value: string) {
  if (!uuidPattern.test(value)) failPolicy();
  return value.toLowerCase();
}

function assertControlledLinkUuid(value: string) {
  if (!uuidPattern.test(value)) failEvidence();
  return value.toLowerCase();
}

function assertClosedContext(
  actionCode: string,
  adapter: ControlledEvidenceActionAdapter,
  candidate: ControlledEvidenceClosedActionContext,
) {
  if (
    !tokenPattern.test(actionCode) ||
    adapter.actionCode !== actionCode ||
    !Number.isSafeInteger(adapter.actionSchemaVersion) ||
    adapter.actionSchemaVersion < 1 ||
    !tokenPattern.test(candidate.sourceType) ||
    candidate.sourceVersion.length < 1 ||
    candidate.sourceVersion.length > 120 ||
    candidate.executionKey.length < 1 ||
    candidate.executionKey.length > 200 ||
    !Number.isSafeInteger(candidate.actorPrivilegeEpoch) ||
    candidate.actorPrivilegeEpoch < 0
  ) {
    failPolicy();
  }
  assertUuid(candidate.tenantId);
  assertUuid(candidate.companyId);
  assertUuid(candidate.sourceRecordId);
  assertUuid(candidate.actorUserId);
  if (candidate.sourceLineId !== null) assertUuid(candidate.sourceLineId);
  if (candidate.actorAuthSessionId !== null) assertUuid(candidate.actorAuthSessionId);
  if (candidate.approvalInstanceId !== null) assertUuid(candidate.approvalInstanceId);
  if (candidate.approvalStepId !== null) assertUuid(candidate.approvalStepId);
  if (
    (candidate.approvalStepId === null) !==
    (candidate.approvalInstanceId === null)
  ) {
    failPolicy();
  }
  canonicalize(candidate.provenance);
}

function resolveActionAdapter(actionCode: string) {
  const production = productionActionAdapters.get(actionCode);
  if (production && CONTROLLED_EVIDENCE_QUALIFICATION_RUNTIME_ENABLED) {
    return production;
  }
  if (process.env.NODE_ENV === "test" && process.env.VITEST === "true") {
    const testAdapter = testAdapterScope.getStore()?.get(actionCode);
    if (testAdapter) return testAdapter;
  }
  return failPolicy();
}

/**
 * Synthetic contract tests are the only permitted injection point. The hook is
 * unavailable in an application process and never mutates the production map.
 */
export function withControlledEvidenceQualificationTestAdapter<T>(
  adapter: ControlledEvidenceActionAdapter,
  callback: () => T,
): T {
  if (process.env.NODE_ENV !== "test" || process.env.VITEST !== "true") {
    throw new Error("CONTROLLED_EVIDENCE_TEST_ADAPTER_UNAVAILABLE");
  }
  if (!tokenPattern.test(adapter.actionCode)) failPolicy();
  return testAdapterScope.run(new Map([[adapter.actionCode, adapter]]), callback);
}

function parsePolicy(
  row: PolicyVersionRow,
  adapter: ControlledEvidenceActionAdapter,
) {
  const parsed = policyDocumentSchema.safeParse(row.policy);
  if (
    !parsed.success ||
    row.schemaVersion !== parsed.data.schemaVersion ||
    !adapter.supportedPolicySchemaVersions.includes(row.schemaVersion)
  ) {
    failPolicy();
  }
  const purposes = new Set<string>();
  for (const requirement of parsed.data.purposeRequirements) {
    if (
      purposes.has(requirement.purpose) ||
      requirement.minimumCount > requirement.maximumCount
    ) {
      failPolicy();
    }
    purposes.add(requirement.purpose);
  }
  const canonicalJson = controlledEvidenceQualificationCanonicalJson(parsed.data);
  const configHash = createHash("sha256")
    .update(canonicalJson, "utf8")
    .digest("hex");
  if (row.canonicalJson !== canonicalJson || row.configHash !== configHash) {
    failPolicy();
  }
  return parsed.data;
}

function maximumPolicySelectionCount(
  policy: ControlledEvidencePolicyDocument,
) {
  let maximum = 0;
  for (const requirement of policy.purposeRequirements) {
    if (
      !Number.isSafeInteger(requirement.maximumCount) ||
      maximum > Number.MAX_SAFE_INTEGER - requirement.maximumCount
    ) {
      failPolicy();
    }
    maximum += requirement.maximumCount;
  }
  if (!Number.isSafeInteger(maximum) || maximum < 1) failPolicy();
  return maximum;
}

function assertActivationEvent(
  context: ControlledEvidenceClosedActionContext,
  actionCode: string,
  pointer: PolicyActivationPointerRow,
  event: PolicyActivationEventRow,
) {
  if (
    !Number.isSafeInteger(pointer.pointerVersion) ||
    pointer.pointerVersion < 1 ||
    event.pointerVersion !== pointer.pointerVersion ||
    !Number.isSafeInteger(event.policyVersion) ||
    event.policyVersion < 1 ||
    Number.isNaN(event.activatedAt.getTime()) ||
    ((pointer.pointerVersion === 1) !==
      (event.priorActivationEventId === null)) ||
    ((event.priorPolicyVersionId === null) !==
      (event.priorPolicyVersion === null))
  ) {
    failPolicy();
  }
  const canonicalJson = controlledEvidenceQualificationCanonicalJson({
    schemaVersion: 1,
    tenantId: context.tenantId,
    companyId: context.companyId,
    actionCode,
    pointerVersion: event.pointerVersion,
    policyVersionId: event.policyVersionId,
    policyVersion: event.policyVersion,
    priorActivationEventId: event.priorActivationEventId,
    activatedByUserId: event.activatedByUserId,
    activatedAt: event.activatedAt.toISOString(),
    activationReason: event.activationReason,
    provenance: event.provenance,
  });
  const activationHash = createHash("sha256")
    .update(canonicalJson, "utf8")
    .digest("hex");
  if (event.canonicalJson !== canonicalJson || event.activationHash !== activationHash) {
    failPolicy();
  }
}

async function lockActivePolicy(
  tx: TransactionClient,
  context: ControlledEvidenceClosedActionContext,
  actionCode: string,
  adapter: ControlledEvidenceActionAdapter,
) {
  const pointers = await tx.$queryRaw<PolicyActivationPointerRow[]>(Prisma.sql`
    SELECT pointer."id", pointer."activeActivationEventId", pointer."pointerVersion"
      FROM "ControlledEvidencePolicyActivation" pointer
     WHERE pointer."tenantId" = ${context.tenantId}::uuid
       AND pointer."companyId" = ${context.companyId}::uuid
       AND pointer."actionCode" = ${actionCode}
     FOR SHARE OF pointer
  `);
  if (pointers.length !== 1) failPolicy();
  const pointer = pointers[0]!;
  const events = await tx.$queryRaw<PolicyActivationEventRow[]>(Prisma.sql`
    SELECT event."id", event."policyVersionId", event."policyVersion",
           event."priorActivationEventId", event."pointerVersion",
           event."activatedByUserId", event."activatedAt",
           event."activationReason", event."provenance", event."canonicalJson",
           event."activationHash",
           prior."policyVersionId" AS "priorPolicyVersionId",
           prior."policyVersion" AS "priorPolicyVersion"
      FROM "ControlledEvidencePolicyActivationEvent" event
 LEFT JOIN "ControlledEvidencePolicyActivationEvent" prior
        ON prior."id" = event."priorActivationEventId"
       AND prior."tenantId" = event."tenantId"
       AND prior."companyId" = event."companyId"
       AND prior."actionCode" = event."actionCode"
     WHERE event."id" = ${pointer.activeActivationEventId}::uuid
       AND event."tenantId" = ${context.tenantId}::uuid
       AND event."companyId" = ${context.companyId}::uuid
       AND event."actionCode" = ${actionCode}
       AND event."pointerVersion" = ${pointer.pointerVersion}
  `);
  if (events.length !== 1) failPolicy();
  const activationEvent = events[0]!;
  assertActivationEvent(context, actionCode, pointer, activationEvent);
  const versions = await tx.$queryRaw<PolicyVersionRow[]>(Prisma.sql`
    SELECT policy."id", policy."version", policy."schemaVersion",
           policy."policy", policy."canonicalJson", policy."configHash"
      FROM "ControlledEvidencePolicyVersion" policy
     WHERE policy."id" = ${activationEvent.policyVersionId}::uuid
       AND policy."tenantId" = ${context.tenantId}::uuid
       AND policy."companyId" = ${context.companyId}::uuid
       AND policy."actionCode" = ${actionCode}
       AND policy."version" = ${activationEvent.policyVersion}
  `);
  if (versions.length !== 1) failPolicy();
  const policy = versions[0]!;
  return {
    pointer,
    activationEvent,
    policy,
    document: parsePolicy(policy, adapter),
  };
}

function uuidList(values: readonly string[]) {
  return Prisma.join(values.map((value) => Prisma.sql`${value}::uuid`));
}

async function lockAttachments(
  tx: TransactionClient,
  context: ControlledEvidenceClosedActionContext,
  linkIds: readonly string[],
) {
  const rows = await tx.$queryRaw<LockedAttachmentRow[]>(Prisma.sql`
    SELECT link."id" AS "controlledEvidenceAttachmentId",
           attachment."id" AS "attachmentId",
           attachment."objectVersionId",
           attachment."checksum",
           attachment."detectedChecksum",
           attachment."storedChecksum",
           attachment."uploadState"::text AS "uploadState",
           attachment."scanState"::text AS "scanState",
           attachment."availabilityState"::text AS "availabilityState",
           attachment."physicalState"::text AS "physicalState",
           attachment."status"::text AS "status",
           attachment."rowVersion",
           attachment."scanVerifiedObjectVersionId",
           replacement."id" AS "replacedByAttachmentId"
      FROM "ControlledEvidenceAttachment" link
      JOIN "Attachment" attachment
        ON attachment."id" = link."attachmentId"
       AND attachment."tenantId" = link."tenantId"
       AND attachment."companyId" = link."companyId"
 LEFT JOIN "Attachment" replacement
        ON replacement."replacesAttachmentId" = attachment."id"
       AND replacement."tenantId" = attachment."tenantId"
       AND replacement."companyId" = attachment."companyId"
     WHERE link."id" IN (${uuidList(linkIds)})
       AND link."tenantId" = ${context.tenantId}::uuid
       AND link."companyId" = ${context.companyId}::uuid
     ORDER BY attachment."id" ASC, link."id" ASC
     FOR UPDATE OF attachment
  `);
  if (rows.length !== linkIds.length) failEvidence();
  const byLink = new Map(rows.map((row) => [row.controlledEvidenceAttachmentId, row]));
  const ordered = linkIds.map((id) => byLink.get(id) ?? failEvidence());
  if (new Set(ordered.map(({ attachmentId }) => attachmentId)).size !== ordered.length) {
    failEvidence();
  }
  for (const attachment of ordered) {
    if (
      attachment.status !== "ACTIVE" ||
      attachment.uploadState !== "VERIFIED" ||
      attachment.scanState !== "CLEAN" ||
      attachment.availabilityState !== "AVAILABLE" ||
      attachment.physicalState !== "DURABLE" ||
      !attachment.objectVersionId ||
      attachment.scanVerifiedObjectVersionId !== attachment.objectVersionId ||
      !attachment.storedChecksum ||
      !/^[a-f0-9]{64}$/.test(attachment.storedChecksum) ||
      attachment.replacedByAttachmentId
    ) {
      failEvidence();
    }
  }
  return ordered;
}

async function lockScanFacts(
  tx: TransactionClient,
  context: ControlledEvidenceClosedActionContext,
  attachments: readonly LockedAttachmentRow[],
) {
  const exactPredicates = attachments.map((attachment) => Prisma.sql`
    (scan."attachmentId" = ${attachment.attachmentId}::uuid
     AND scan."objectVersionId" = ${attachment.objectVersionId})
  `);
  const rows = await tx.$queryRaw<LockedScanRow[]>(Prisma.sql`
    SELECT scan."id", scan."attachmentId", scan."objectVersionId",
           scan."scanProvider", scan."scannerEngineVersion",
           scan."signatureVersion", scan."completedAt",
           scan."result"::text AS "result", scan."plaintextChecksum"
      FROM "AttachmentScanAttempt" scan
     WHERE scan."tenantId" = ${context.tenantId}::uuid
       AND scan."companyId" = ${context.companyId}::uuid
       AND (${Prisma.join(exactPredicates, " OR ")})
     ORDER BY scan."attachmentId" ASC, scan."completedAt" DESC, scan."id" DESC
  `);
  const latestByAttachment = new Map<string, LockedScanRow>();
  for (const row of rows) {
    if (!latestByAttachment.has(row.attachmentId)) {
      latestByAttachment.set(row.attachmentId, row);
    }
  }
  const selected = attachments.map(
    ({ attachmentId }) => latestByAttachment.get(attachmentId) ?? failEvidence(),
  );
  for (const [index, scan] of selected.entries()) {
    const attachment = attachments[index]!;
    const expected = normalizeSha256(attachment.checksum);
    const detected = normalizeSha256(attachment.detectedChecksum);
    const scanned = normalizeSha256(scan.plaintextChecksum);
    if (
      scan.result !== "CLEAN" ||
      scan.objectVersionId !== attachment.objectVersionId ||
      !expected ||
      detected !== expected ||
      scanned !== expected
    ) {
      failEvidence();
    }
  }
  return selected;
}

async function lockLinks(
  tx: TransactionClient,
  context: ControlledEvidenceClosedActionContext,
  linkIds: readonly string[],
) {
  const rows = await tx.$queryRaw<LockedLinkRow[]>(Prisma.sql`
    SELECT link."id", link."attachmentId", link."sourceType",
           link."sourceRecordId", link."sourceLineId", link."purpose",
           link."status"::text AS "status", link."archivedAt", link."updatedAt"
      FROM "ControlledEvidenceAttachment" link
     WHERE link."id" IN (${uuidList(linkIds)})
       AND link."tenantId" = ${context.tenantId}::uuid
       AND link."companyId" = ${context.companyId}::uuid
     ORDER BY link."id" ASC
     FOR UPDATE OF link
  `);
  if (rows.length !== linkIds.length) failEvidence();
  const byId = new Map(rows.map((row) => [row.id, row]));
  return linkIds.map((id) => byId.get(id) ?? failEvidence());
}

function enforcePolicy(
  policy: ControlledEvidencePolicyDocument,
  context: ControlledEvidenceClosedActionContext,
  links: readonly LockedLinkRow[],
  attachments: readonly LockedAttachmentRow[],
) {
  if (policy.sourceType !== context.sourceType) failPolicy();
  const counts = new Map<string, number>();
  for (const [index, link] of links.entries()) {
    if (
      link.attachmentId !== attachments[index]!.attachmentId ||
      link.status !== "ACTIVE" ||
      link.archivedAt !== null ||
      link.sourceType !== context.sourceType ||
      link.sourceRecordId !== context.sourceRecordId ||
      link.sourceLineId !== context.sourceLineId
    ) {
      failEvidence();
    }
    counts.set(link.purpose, (counts.get(link.purpose) ?? 0) + 1);
  }
  const allowed = new Set(policy.purposeRequirements.map(({ purpose }) => purpose));
  if ([...counts.keys()].some((purpose) => !allowed.has(purpose))) failEvidence();
  for (const requirement of policy.purposeRequirements) {
    const count = counts.get(requirement.purpose) ?? 0;
    if (count < requirement.minimumCount || count > requirement.maximumCount) {
      failEvidence();
    }
  }
}

function buildSelections(
  links: readonly LockedLinkRow[],
  attachments: readonly LockedAttachmentRow[],
  scans: readonly LockedScanRow[],
) {
  return links.map((link, index): SelectionSnapshot => {
    const attachment = attachments[index]!;
    const scan = scans[index]!;
    return {
      ordinal: index + 1,
      controlledEvidenceAttachmentId: link.id,
      attachmentId: attachment.attachmentId,
      objectVersionId: attachment.objectVersionId!,
      scanAttemptId: scan.id,
      sourceLineId: link.sourceLineId,
      purpose: link.purpose,
      controlledEvidenceLinkStatus: "ACTIVE",
      controlledEvidenceLinkArchivedAt: null,
      controlledEvidenceLinkUpdatedAt: link.updatedAt.toISOString(),
      attachmentStatus: "ACTIVE",
      attachmentRowVersion: attachment.rowVersion,
      scanVerifiedObjectVersionId: attachment.objectVersionId!,
      replacementAttachmentId: null,
      attachmentChecksum: normalizeSha256(attachment.checksum)!,
      attachmentDetectedChecksum: normalizeSha256(attachment.detectedChecksum)!,
      attachmentStoredChecksum: attachment.storedChecksum ?? failEvidence(),
      uploadState: "VERIFIED",
      scanState: "CLEAN",
      availabilityState: "AVAILABLE",
      physicalState: "DURABLE",
      scanResult: "CLEAN",
      scanCompletedAt: scan.completedAt.toISOString(),
      scanProvider: scan.scanProvider,
      scannerEngineVersion: scan.scannerEngineVersion,
      scanSignatureVersion: scan.signatureVersion,
      scanPlaintextChecksum: normalizeSha256(scan.plaintextChecksum)!,
    };
  });
}

async function readExistingQualification(
  tx: TransactionClient,
  context: ControlledEvidenceClosedActionContext,
  actionCode: string,
  executionKey: string,
) {
  const rows = await tx.$queryRaw<ExistingQualificationRow[]>(Prisma.sql`
    SELECT qualification."id", qualification."executionKey",
           qualification."idempotencyKey", qualification."executionHash",
           qualification."selectionHash", qualification."selectionCount",
           qualification."policyActivationId",
           qualification."policyActivationPointerId",
           qualification."policyPointerVersion",
           qualification."policyVersionId", qualification."policyVersion",
           qualification."policySchemaVersion", qualification."policyConfigHash"
      FROM "ControlledEvidenceActionQualification" qualification
     WHERE qualification."tenantId" = ${context.tenantId}::uuid
       AND qualification."companyId" = ${context.companyId}::uuid
       AND qualification."actionCode" = ${actionCode}
       AND qualification."executionKey" = ${executionKey}
  `);
  if (rows.length > 1) throw new Error(QUALIFICATION_CONFLICT);
  return rows[0] ?? null;
}

async function assertExistingSelections(
  tx: TransactionClient,
  qualificationId: string,
  selections: readonly SelectionSnapshot[],
) {
  const rows = await tx.$queryRaw<ExistingSelectionRow[]>(Prisma.sql`
    SELECT selection."ordinal", selection."selectionCanonicalJson", selection."selectionHash"
      FROM "ControlledEvidenceActionSelection" selection
     WHERE selection."qualificationId" = ${qualificationId}::uuid
     ORDER BY selection."ordinal" ASC
  `);
  const expected = selections.map((selection) => {
    const canonicalJson = controlledEvidenceQualificationCanonicalJson(selection);
    return {
      ordinal: selection.ordinal,
      selectionCanonicalJson: canonicalJson,
      selectionHash: createHash("sha256").update(canonicalJson, "utf8").digest("hex"),
    };
  });
  if (controlledEvidenceQualificationCanonicalJson(rows) !== controlledEvidenceQualificationCanonicalJson(expected)) {
    throw new Error(QUALIFICATION_CONFLICT);
  }
}

export async function qualifyControlledEvidenceForAction(
  input: QualifyControlledEvidenceInput,
): Promise<ControlledEvidenceQualificationResult> {
  const adapter = resolveActionAdapter(input.actionCode);
  const context = adapter.closeActionContext(input.serverOwnedActionContext);
  assertClosedContext(input.actionCode, adapter, context);

  const suppliedLinkIds = input.controlledEvidenceAttachmentIds;
  if (suppliedLinkIds.length === 0) failEvidence();

  const { pointer, activationEvent, policy, document } = await lockActivePolicy(
    input.tx,
    context,
    input.actionCode,
    adapter,
  );
  if (suppliedLinkIds.length > maximumPolicySelectionCount(document)) {
    failEvidence();
  }
  const linkIds = suppliedLinkIds
    .map(assertControlledLinkUuid)
    .sort((left, right) => left.localeCompare(right));
  if (new Set(linkIds).size !== linkIds.length) failEvidence();
  const attachments = await lockAttachments(input.tx, context, linkIds);
  const scans = await lockScanFacts(input.tx, context, attachments);
  const links = await lockLinks(input.tx, context, linkIds);
  enforcePolicy(document, context, links, attachments);
  const selections = buildSelections(links, attachments, scans);
  const selectionHash = controlledEvidenceQualificationDigest({
    schemaVersion: 1,
    selections,
  });
  const executionCanonical = {
    schemaVersion: 1,
    actionCode: input.actionCode,
    actionSchemaVersion: adapter.actionSchemaVersion,
    tenantId: context.tenantId,
    companyId: context.companyId,
    sourceType: context.sourceType,
    sourceRecordId: context.sourceRecordId,
    sourceVersion: context.sourceVersion,
    sourceLineId: context.sourceLineId,
    executionKey: context.executionKey,
    actorUserId: context.actorUserId,
    actorAuthSessionId: context.actorAuthSessionId,
    actorPrivilegeEpoch: context.actorPrivilegeEpoch,
    approvalInstanceId: context.approvalInstanceId,
    approvalStepId: context.approvalStepId,
    provenance: context.provenance,
  } as const;
  const executionCanonicalJson = controlledEvidenceQualificationCanonicalJson(
    executionCanonical,
  );
  const executionHash = createHash("sha256")
    .update(executionCanonicalJson, "utf8")
    .digest("hex");
  const idempotencyKey = `controlled-evidence-qualification:v1:${executionHash}`;
  const qualificationId = deterministicUuid(
    controlledEvidenceQualificationDigest({
      tenantId: context.tenantId,
      companyId: context.companyId,
      actionCode: input.actionCode,
      executionHash,
    }),
  );
  const expectedExisting = {
    executionKey: context.executionKey,
    idempotencyKey,
    executionHash,
    selectionHash,
    selectionCount: selections.length,
    policyActivationId: activationEvent.id,
    policyActivationPointerId: pointer.id,
    policyPointerVersion: pointer.pointerVersion,
    policyVersionId: policy.id,
    policyVersion: policy.version,
    policySchemaVersion: policy.schemaVersion,
    policyConfigHash: policy.configHash,
  };

  const existing = await readExistingQualification(
    input.tx,
    context,
    input.actionCode,
    context.executionKey,
  );
  if (existing) {
    const { id: _existingId, ...existingComparable } = existing;
    if (
      controlledEvidenceQualificationCanonicalJson(existingComparable) !==
      controlledEvidenceQualificationCanonicalJson(expectedExisting)
    ) {
      throw new Error(QUALIFICATION_CONFLICT);
    }
    await assertExistingSelections(input.tx, existing.id, selections);
    return {
      qualificationId: existing.id,
      actionCode: input.actionCode,
      executionHash,
      selectionHash,
      policyVersion: policy.version,
      policyPointerVersion: pointer.pointerVersion,
      selectedCount: selections.length,
      identicalRetry: true,
    };
  }

  const provenanceJson = controlledEvidenceQualificationCanonicalJson(
    context.provenance,
  );
  const inserted = await input.tx.$executeRaw(Prisma.sql`
    INSERT INTO "ControlledEvidenceActionQualification" (
      "id", "tenantId", "companyId", "actionCode", "actionSchemaVersion",
      "sourceType", "sourceRecordId", "sourceLineId", "sourceVersion", "executionKey",
      "idempotencyKey", "executionCanonicalJson", "executionHash",
      "policyActivationId", "policyActivationPointerId", "policyPointerVersion",
      "policyActivatedByUserId",
      "policyActivatedAt", "policyActivationReason", "priorPolicyVersionId",
      "priorPolicyVersion", "policyVersionId", "policyVersion",
      "policySchemaVersion", "policySnapshot", "policyCanonicalJson",
      "policyConfigHash", "selectionHash", "selectionCount", "actorUserId",
      "actorAuthSessionId", "actorPrivilegeEpoch", "approvalInstanceId",
      "approvalInstanceStepId", "provenance"
    ) VALUES (
      ${qualificationId}::uuid, ${context.tenantId}::uuid,
      ${context.companyId}::uuid, ${input.actionCode}, ${adapter.actionSchemaVersion},
      ${context.sourceType}, ${context.sourceRecordId}::uuid,
      ${context.sourceLineId}::uuid, ${context.sourceVersion},
      ${context.executionKey}, ${idempotencyKey},
      ${executionCanonicalJson}, ${executionHash}, ${activationEvent.id}::uuid,
      ${pointer.id}::uuid, ${pointer.pointerVersion},
      ${activationEvent.activatedByUserId}::uuid, ${activationEvent.activatedAt},
      ${activationEvent.activationReason},
      ${activationEvent.priorPolicyVersionId}::uuid,
      ${activationEvent.priorPolicyVersion}, ${policy.id}::uuid, ${policy.version},
      ${policy.schemaVersion}, ${policy.canonicalJson}::jsonb, ${policy.canonicalJson},
      ${policy.configHash}, ${selectionHash}, ${selections.length},
      ${context.actorUserId}::uuid, ${context.actorAuthSessionId}::uuid,
      ${context.actorPrivilegeEpoch}, ${context.approvalInstanceId}::uuid,
      ${context.approvalStepId}::uuid, ${provenanceJson}::jsonb
    )
    ON CONFLICT DO NOTHING
  `);

  if (inserted === 0) {
    const raced = await readExistingQualification(
      input.tx,
      context,
      input.actionCode,
      context.executionKey,
    );
    if (!raced) throw new Error(QUALIFICATION_CONFLICT);
    const { id: _racedId, ...racedComparable } = raced;
    if (
      controlledEvidenceQualificationCanonicalJson(racedComparable) !==
      controlledEvidenceQualificationCanonicalJson(expectedExisting)
    ) {
      throw new Error(QUALIFICATION_CONFLICT);
    }
    await assertExistingSelections(input.tx, raced.id, selections);
    return {
      qualificationId: raced.id,
      actionCode: input.actionCode,
      executionHash,
      selectionHash,
      policyVersion: policy.version,
      policyPointerVersion: pointer.pointerVersion,
      selectedCount: selections.length,
      identicalRetry: true,
    };
  }

  for (const selection of selections) {
    const canonicalJson = controlledEvidenceQualificationCanonicalJson(selection);
    const itemHash = createHash("sha256").update(canonicalJson, "utf8").digest("hex");
    const selectionId = deterministicUuid(
      controlledEvidenceQualificationDigest({
        qualificationId,
        ordinal: selection.ordinal,
      }),
    );
    await input.tx.$executeRaw(Prisma.sql`
      INSERT INTO "ControlledEvidenceActionSelection" (
        "id", "qualificationId", "ordinal", "tenantId", "companyId",
        "controlledEvidenceAttachmentId", "attachmentId", "objectVersionId",
        "scanAttemptId", "sourceLineId", "purpose", "controlledEvidenceLinkStatus",
        "controlledEvidenceLinkUpdatedAt", "controlledEvidenceLinkArchivedAt",
        "attachmentRowVersion", "attachmentStatus", "scanVerifiedObjectVersionId",
        "replacementAttachmentId", "attachmentChecksum",
        "attachmentDetectedChecksum", "attachmentStoredChecksum", "uploadState",
        "scanState", "availabilityState", "physicalState", "scanResult",
        "scanCompletedAt", "scanProvider", "scannerEngineVersion",
        "scanSignatureVersion", "scanPlaintextChecksum", "selectionCanonicalJson",
        "selectionHash"
      ) VALUES (
        ${selectionId}::uuid, ${qualificationId}::uuid, ${selection.ordinal},
        ${context.tenantId}::uuid, ${context.companyId}::uuid,
        ${selection.controlledEvidenceAttachmentId}::uuid,
        ${selection.attachmentId}::uuid, ${selection.objectVersionId},
        ${selection.scanAttemptId}::uuid, ${selection.sourceLineId}::uuid,
        ${selection.purpose}, ${selection.controlledEvidenceLinkStatus}::"RecordStatus",
        ${new Date(selection.controlledEvidenceLinkUpdatedAt)},
        ${selection.controlledEvidenceLinkArchivedAt}::timestamp,
        ${selection.attachmentRowVersion},
        ${selection.attachmentStatus}::"RecordStatus",
        ${selection.scanVerifiedObjectVersionId},
        ${selection.replacementAttachmentId}::uuid,
        ${selection.attachmentChecksum}, ${selection.attachmentDetectedChecksum},
        ${selection.attachmentStoredChecksum},
        ${selection.uploadState}::"AttachmentUploadState",
        ${selection.scanState}::"AttachmentScanState",
        ${selection.availabilityState}::"AttachmentAvailabilityState",
        ${selection.physicalState}::"AttachmentPhysicalState",
        ${selection.scanResult}::"AttachmentScanState",
        ${new Date(selection.scanCompletedAt)}, ${selection.scanProvider},
        ${selection.scannerEngineVersion}, ${selection.scanSignatureVersion},
        ${selection.scanPlaintextChecksum}, ${canonicalJson}, ${itemHash}
      )
    `);
  }

  return {
    qualificationId,
    actionCode: input.actionCode,
    executionHash,
    selectionHash,
    policyVersion: policy.version,
    policyPointerVersion: pointer.pointerVersion,
    selectedCount: selections.length,
    identicalRetry: false,
  };
}
