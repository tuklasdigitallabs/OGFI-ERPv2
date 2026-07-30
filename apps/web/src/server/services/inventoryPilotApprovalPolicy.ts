import { createHash } from "node:crypto";
import { Prisma, type TransactionClient } from "@ogfi/database";

export const INVENTORY_PILOT_APPROVAL_ERRORS = {
  DISABLED: "INVENTORY_PILOT_APPROVAL_DISABLED",
  CONFIGURATION_NOT_AVAILABLE: "INVENTORY_PILOT_CONFIGURATION_NOT_AVAILABLE",
  CONFIGURATION_INVALID: "INVENTORY_PILOT_CONFIGURATION_INVALID",
  CONFIGURATION_STALE: "INVENTORY_PILOT_CONFIGURATION_STALE",
  CONFIGURATION_DIGEST_MISMATCH:
    "INVENTORY_PILOT_CONFIGURATION_DIGEST_MISMATCH",
  SOURCE_STALE: "INVENTORY_PILOT_SOURCE_STALE",
  SCOPE_MISMATCH: "INVENTORY_PILOT_SCOPE_MISMATCH",
  ENDPOINT_CAPABILITY_MISMATCH: "INVENTORY_PILOT_ENDPOINT_CAPABILITY_MISMATCH",
  MIXED_ITEM_COHORT: "INVENTORY_PILOT_MIXED_ITEM_COHORT",
} as const;

export type InventoryPilotApprovalFamily =
  | "InventoryTransfer"
  | "StockCountAttemptReview";

export type InventoryPilotApprovalStage = "SUBMIT" | "REVALIDATE";

type PilotEndpointCapability =
  | "TRANSFER_SOURCE"
  | "TRANSFER_DESTINATION"
  | "COUNT_LOCATION";

type EnvironmentReader = Readonly<Record<string, string | undefined>>;

type ActivationRow = Readonly<{
  id: string;
  tenantId: string;
  companyId: string;
  family: string;
  status: string;
  configurationRevisionId: string;
  configurationRevisionNumber: number;
  configurationDigest: string;
  currentActivationEventId: string;
  generation: number;
}>;

type ActivationEventRow = Readonly<{
  id: string;
  tenantId: string;
  companyId: string;
  family: string;
  status: string;
  configurationRevisionId: string;
  configurationRevisionNumber: number;
  configurationDigest: string;
  generation: number;
  priorActivationEventId: string | null;
  priorGeneration: number | null;
  activatedByUserId: string;
  activationReason: string;
  canonicalJson: string;
  activationHash: string;
}>;

type ConfigurationRevisionRow = Readonly<{
  id: string;
  tenantId: string;
  companyId: string;
  revisionNumber: number;
  schemaVersion: number;
  status: string;
  canonicalJson: string;
  configurationDigest: string;
  sourceDecisionId: string;
}>;

type EndpointMembershipRow = Readonly<{
  tenantId: string;
  companyId: string;
  inventoryLocationId: string;
  locationId: string;
  capability: string;
}>;

type ItemMembershipRow = Readonly<{
  tenantId: string;
  companyId: string;
  itemId: string;
}>;

export type InventoryPilotApprovalPolicySnapshot = Readonly<{
  activation: ActivationRow;
  activationEvent: ActivationEventRow;
  revision: ConfigurationRevisionRow;
  endpoints: readonly EndpointMembershipRow[];
  items: readonly ItemMembershipRow[];
  otherFamilyActivation: ActivationRow | null;
}>;

export type InventoryPilotApprovalPolicyReader = (
  tx: TransactionClient,
  input: Readonly<{
    tenantId: string;
    companyId: string;
    family: InventoryPilotApprovalFamily;
  }>,
) => Promise<InventoryPilotApprovalPolicySnapshot | null>;

type TransferLineSnapshot = Readonly<{
  id: string;
  tenantId: string;
  companyId: string;
  itemId: string;
  sourceInventoryLocationId: string;
  destinationInventoryLocationId: string;
}>;

export type LockedInventoryTransferPilotSnapshot = Readonly<{
  id: string;
  tenantId: string;
  companyId: string;
  version: number;
  status: string;
  sourceLocationId: string;
  destinationLocationId: string;
  lines: readonly TransferLineSnapshot[];
}>;

type CountLineSnapshot = Readonly<{
  id: string;
  tenantId: string;
  companyId: string;
  inventoryLocationId: string;
  itemId: string;
}>;

export type LockedStockCountAttemptPilotSnapshot = Readonly<{
  session: Readonly<{
    id: string;
    tenantId: string;
    companyId: string;
    version: number;
    status: string;
    inventoryLocationId: string;
    locationId: string;
    currentAttemptId: string | null;
  }>;
  attempt: Readonly<{
    id: string;
    stockCountSessionId: string;
    tenantId: string;
    companyId: string;
    version: number;
    status: string;
    inventoryLocationId: string;
    lines: readonly CountLineSnapshot[];
  }>;
}>;

export type InventoryPilotApprovalAttestation = Readonly<{
  configurationRevisionId: string;
  configurationRevisionNumber: number;
  configurationDigest: string;
  activationEventId: string;
  activationGeneration: number;
  family: InventoryPilotApprovalFamily;
  itemDigest: string;
}>;

type ClassificationDependencies = Readonly<{
  tx: TransactionClient;
  environment?: EnvironmentReader;
  readPolicy?: InventoryPilotApprovalPolicyReader;
  expectedAttestation?: InventoryPilotApprovalAttestation;
}>;

type CanonicalValue =
  | string
  | number
  | boolean
  | null
  | readonly CanonicalValue[]
  | { readonly [key: string]: CanonicalValue };

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const digestPattern = /^[a-f0-9]{64}$/;
const capabilities = new Set<PilotEndpointCapability>([
  "TRANSFER_SOURCE",
  "TRANSFER_DESTINATION",
  "COUNT_LOCATION",
]);

function asciiCompare(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function fail(
  code: (typeof INVENTORY_PILOT_APPROVAL_ERRORS)[keyof typeof INVENTORY_PILOT_APPROVAL_ERRORS],
): never {
  throw new Error(code);
}

function canonicalize(value: unknown): CanonicalValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value))
      fail(INVENTORY_PILOT_APPROVAL_ERRORS.CONFIGURATION_INVALID);
    return Object.is(value, -0) ? 0 : value;
  }
  if (Array.isArray(value)) return value.map(canonicalize);
  if (typeof value === "object") {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      fail(INVENTORY_PILOT_APPROVAL_ERRORS.CONFIGURATION_INVALID);
    }
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => asciiCompare(left, right))
        .map(([key, item]) => {
          if (item === undefined) {
            fail(INVENTORY_PILOT_APPROVAL_ERRORS.CONFIGURATION_INVALID);
          }
          return [key, canonicalize(item)];
        }),
    );
  }
  return fail(INVENTORY_PILOT_APPROVAL_ERRORS.CONFIGURATION_INVALID);
}

export function inventoryPilotCanonicalJson(value: unknown) {
  return JSON.stringify(canonicalize(value));
}

export function inventoryPilotDigest(value: unknown) {
  return createHash("sha256")
    .update(inventoryPilotCanonicalJson(value), "utf8")
    .digest("hex");
}

function killSwitchName(family: InventoryPilotApprovalFamily) {
  return family === "InventoryTransfer"
    ? "INVENTORY_TRANSFER_APPROVAL_V1_ENABLED"
    : "STOCK_COUNT_ATTEMPT_REVIEW_APPROVAL_V1_ENABLED";
}

function assertKillSwitch(
  family: InventoryPilotApprovalFamily,
  environment: EnvironmentReader,
) {
  if (environment[killSwitchName(family)] !== "true") {
    fail(INVENTORY_PILOT_APPROVAL_ERRORS.DISABLED);
  }
}

function assertUuid(value: string) {
  if (!uuidPattern.test(value)) {
    fail(INVENTORY_PILOT_APPROVAL_ERRORS.CONFIGURATION_INVALID);
  }
}

function assertPositiveVersion(value: number) {
  if (!Number.isSafeInteger(value) || value < 1) {
    fail(INVENTORY_PILOT_APPROVAL_ERRORS.SOURCE_STALE);
  }
}

function otherFamily(
  family: InventoryPilotApprovalFamily,
): InventoryPilotApprovalFamily {
  return family === "InventoryTransfer"
    ? "StockCountAttemptReview"
    : "InventoryTransfer";
}

/**
 * Reads and locks the family activation pointer. The immutable event, sealed
 * revision, and memberships can then be read safely in the same transaction.
 */
export const readInventoryPilotApprovalPolicyFromDatabase: InventoryPilotApprovalPolicyReader =
  async (tx, input) => {
    const activations = await tx.$queryRaw<ActivationRow[]>(Prisma.sql`
      WITH activation_guard AS MATERIALIZED (
        SELECT pg_advisory_xact_lock_shared(
          hashtextextended(
            ${input.tenantId}::text || ':' || ${input.companyId}::text || ':inventory-pilot-activation',
            0
          )
        ) AS locked
      )
      SELECT a."id", a."tenantId", a."companyId", a."family", a."status", a."configurationRevisionId",
             a."configurationRevisionNumber", a."configurationDigest",
             a."currentActivationEventId", a."generation"
        FROM activation_guard
        CROSS JOIN "InventoryPilotFamilyActivation" a
       WHERE a."tenantId" = ${input.tenantId}::uuid
         AND a."companyId" = ${input.companyId}::uuid
         AND a."family" = ${input.family}::"InventoryPilotApprovalFamily"
    `);
    const activation = activations[0];
    if (!activation || activations.length !== 1) return null;

    const [events, revisions, endpoints, items, otherActivations] =
      await Promise.all([
        tx.$queryRaw<ActivationEventRow[]>(Prisma.sql`
        SELECT e."id", e."tenantId", e."companyId", e."family", e."status", e."configurationRevisionId",
               e."configurationRevisionNumber", e."configurationDigest",
               e."generation", e."priorActivationEventId", e."priorGeneration",
               e."activatedByUserId", e."activationReason", e."canonicalJson",
               e."activationHash"
          FROM "InventoryPilotFamilyActivationEvent" e
         WHERE e."id" = ${activation.currentActivationEventId}::uuid
           AND e."tenantId" = ${input.tenantId}::uuid
           AND e."companyId" = ${input.companyId}::uuid
           AND e."family" = ${input.family}::"InventoryPilotApprovalFamily"
      `),
        tx.$queryRaw<ConfigurationRevisionRow[]>(Prisma.sql`
        SELECT r."id", r."tenantId", r."companyId", r."revisionNumber", r."schemaVersion", r."status",
               r."canonicalJson", r."configurationDigest", r."sourceDecisionId"
          FROM "InventoryPilotConfigurationRevision" r
         WHERE r."id" = ${activation.configurationRevisionId}::uuid
           AND r."tenantId" = ${input.tenantId}::uuid
           AND r."companyId" = ${input.companyId}::uuid
      `),
        tx.$queryRaw<EndpointMembershipRow[]>(Prisma.sql`
        SELECT m."tenantId", m."companyId", m."inventoryLocationId", m."locationId", m."capability"
          FROM "InventoryPilotEndpointMembership" m
         WHERE m."configurationRevisionId" = ${activation.configurationRevisionId}::uuid
           AND m."tenantId" = ${input.tenantId}::uuid
           AND m."companyId" = ${input.companyId}::uuid
      `),
        tx.$queryRaw<ItemMembershipRow[]>(Prisma.sql`
        SELECT m."tenantId", m."companyId", m."itemId"
          FROM "InventoryPilotItemMembership" m
         WHERE m."configurationRevisionId" = ${activation.configurationRevisionId}::uuid
           AND m."tenantId" = ${input.tenantId}::uuid
           AND m."companyId" = ${input.companyId}::uuid
      `),
        tx.$queryRaw<ActivationRow[]>(Prisma.sql`
        SELECT a."id", a."tenantId", a."companyId", a."family", a."status", a."configurationRevisionId",
               a."configurationRevisionNumber", a."configurationDigest",
               a."currentActivationEventId", a."generation"
          FROM "InventoryPilotFamilyActivation" a
         WHERE a."tenantId" = ${input.tenantId}::uuid
           AND a."companyId" = ${input.companyId}::uuid
           AND a."family" = ${otherFamily(input.family)}::"InventoryPilotApprovalFamily"
           AND a."status" = 'ACTIVE'
      `),
      ]);

    if (
      events.length !== 1 ||
      revisions.length !== 1 ||
      otherActivations.length > 1
    ) {
      fail(INVENTORY_PILOT_APPROVAL_ERRORS.CONFIGURATION_INVALID);
    }
    return {
      activation,
      activationEvent: events[0]!,
      revision: revisions[0]!,
      endpoints,
      items,
      otherFamilyActivation: otherActivations[0] ?? null,
    };
  };

function assertPolicyIntegrity(
  tenantId: string,
  companyId: string,
  family: InventoryPilotApprovalFamily,
  snapshot: InventoryPilotApprovalPolicySnapshot,
) {
  const { activation, activationEvent, revision } = snapshot;
  for (const id of [
    tenantId,
    companyId,
    activation.id,
    activation.configurationRevisionId,
    activation.currentActivationEventId,
    activationEvent.id,
    activationEvent.configurationRevisionId,
    activationEvent.activatedByUserId,
    revision.id,
  ]) {
    assertUuid(id);
  }
  if (
    activation.family !== family ||
    activation.tenantId !== tenantId ||
    activation.companyId !== companyId ||
    activation.status !== "ACTIVE" ||
    activationEvent.family !== family ||
    activationEvent.tenantId !== tenantId ||
    activationEvent.companyId !== companyId ||
    activationEvent.status !== "ACTIVE" ||
    revision.status !== "SEALED" ||
    revision.tenantId !== tenantId ||
    revision.companyId !== companyId ||
    revision.schemaVersion !== 1 ||
    activation.configurationRevisionId !== revision.id ||
    activation.configurationRevisionNumber !== revision.revisionNumber ||
    activation.configurationDigest !== revision.configurationDigest ||
    activation.currentActivationEventId !== activationEvent.id ||
    activation.generation !== activationEvent.generation ||
    activation.configurationRevisionId !==
      activationEvent.configurationRevisionId ||
    activation.configurationRevisionNumber !==
      activationEvent.configurationRevisionNumber ||
    activation.configurationDigest !== activationEvent.configurationDigest ||
    !Number.isSafeInteger(activation.generation) ||
    activation.generation < 1 ||
    !Number.isSafeInteger(revision.revisionNumber) ||
    revision.revisionNumber < 1 ||
    !digestPattern.test(revision.configurationDigest) ||
    !digestPattern.test(activationEvent.activationHash) ||
    !revision.sourceDecisionId.trim() ||
    !activationEvent.activationReason.trim() ||
    (activation.generation === 1) !==
      (activationEvent.priorActivationEventId === null &&
        activationEvent.priorGeneration === null) ||
    (activation.generation > 1 &&
      (!activationEvent.priorActivationEventId ||
        activationEvent.priorGeneration !== activation.generation - 1))
  ) {
    fail(INVENTORY_PILOT_APPROVAL_ERRORS.CONFIGURATION_INVALID);
  }
  if (activationEvent.priorActivationEventId) {
    assertUuid(activationEvent.priorActivationEventId);
  }

  const endpointKeys = new Set<string>();
  const endpoints = snapshot.endpoints.map((endpoint) => {
    assertUuid(endpoint.inventoryLocationId);
    assertUuid(endpoint.locationId);
    if (!capabilities.has(endpoint.capability as PilotEndpointCapability)) {
      fail(INVENTORY_PILOT_APPROVAL_ERRORS.CONFIGURATION_INVALID);
    }
    if (endpoint.tenantId !== tenantId || endpoint.companyId !== companyId) {
      fail(INVENTORY_PILOT_APPROVAL_ERRORS.SCOPE_MISMATCH);
    }
    const key = `${endpoint.capability}:${endpoint.inventoryLocationId}:${endpoint.locationId}`;
    if (endpointKeys.has(key)) {
      fail(INVENTORY_PILOT_APPROVAL_ERRORS.CONFIGURATION_INVALID);
    }
    endpointKeys.add(key);
    return {
      capability: endpoint.capability,
      inventoryLocationId: endpoint.inventoryLocationId,
      locationId: endpoint.locationId,
    };
  });
  endpoints.sort(
    (left, right) =>
      asciiCompare(left.capability, right.capability) ||
      asciiCompare(left.inventoryLocationId, right.inventoryLocationId) ||
      asciiCompare(left.locationId, right.locationId),
  );

  const itemIds = new Set<string>();
  const items = snapshot.items.map(
    ({ tenantId: itemTenantId, companyId: itemCompanyId, itemId }) => {
      assertUuid(itemId);
      if (itemTenantId !== tenantId || itemCompanyId !== companyId) {
        fail(INVENTORY_PILOT_APPROVAL_ERRORS.SCOPE_MISMATCH);
      }
      if (itemIds.has(itemId)) {
        fail(INVENTORY_PILOT_APPROVAL_ERRORS.CONFIGURATION_INVALID);
      }
      itemIds.add(itemId);
      return { itemId };
    },
  );
  items.sort((left, right) => asciiCompare(left.itemId, right.itemId));
  if (endpoints.length === 0 || items.length === 0) {
    fail(INVENTORY_PILOT_APPROVAL_ERRORS.CONFIGURATION_INVALID);
  }

  const revisionCanonical = inventoryPilotCanonicalJson({
    schemaVersion: revision.schemaVersion,
    tenantId,
    companyId,
    revisionNumber: revision.revisionNumber,
    status: revision.status,
    sourceDecisionId: revision.sourceDecisionId,
    endpoints,
    items,
  });
  const revisionDigest = createHash("sha256")
    .update(revisionCanonical, "utf8")
    .digest("hex");
  if (
    revision.canonicalJson !== revisionCanonical ||
    revision.configurationDigest !== revisionDigest
  ) {
    fail(INVENTORY_PILOT_APPROVAL_ERRORS.CONFIGURATION_DIGEST_MISMATCH);
  }

  const eventCanonical = inventoryPilotCanonicalJson({
    schemaVersion: 1,
    tenantId,
    companyId,
    family,
    status: activationEvent.status,
    configurationRevisionId: activationEvent.configurationRevisionId,
    configurationRevisionNumber: activationEvent.configurationRevisionNumber,
    configurationDigest: activationEvent.configurationDigest,
    generation: activationEvent.generation,
    priorActivationEventId: activationEvent.priorActivationEventId,
    priorGeneration: activationEvent.priorGeneration,
    activatedByUserId: activationEvent.activatedByUserId,
    activationReason: activationEvent.activationReason,
  });
  const eventDigest = createHash("sha256")
    .update(eventCanonical, "utf8")
    .digest("hex");
  if (
    activationEvent.canonicalJson !== eventCanonical ||
    activationEvent.activationHash !== eventDigest
  ) {
    fail(INVENTORY_PILOT_APPROVAL_ERRORS.CONFIGURATION_DIGEST_MISMATCH);
  }

  const other = snapshot.otherFamilyActivation;
  if (
    other &&
    (other.family !== otherFamily(family) ||
      other.tenantId !== tenantId ||
      other.companyId !== companyId ||
      other.status !== "ACTIVE" ||
      other.configurationRevisionId !== revision.id ||
      other.configurationRevisionNumber !== revision.revisionNumber ||
      other.configurationDigest !== revision.configurationDigest)
  ) {
    fail(INVENTORY_PILOT_APPROVAL_ERRORS.CONFIGURATION_STALE);
  }
  return { endpointKeys, itemIds };
}

function assertExpectedAttestation(
  actual: InventoryPilotApprovalAttestation,
  expected?: InventoryPilotApprovalAttestation,
) {
  if (!expected) return;
  if (
    actual.family !== expected.family ||
    actual.configurationRevisionId !== expected.configurationRevisionId ||
    actual.configurationRevisionNumber !==
      expected.configurationRevisionNumber ||
    actual.configurationDigest !== expected.configurationDigest ||
    actual.activationEventId !== expected.activationEventId ||
    actual.activationGeneration !== expected.activationGeneration ||
    actual.itemDigest !== expected.itemDigest
  ) {
    fail(INVENTORY_PILOT_APPROVAL_ERRORS.CONFIGURATION_STALE);
  }
}

async function classify(
  dependencies: ClassificationDependencies,
  scope: Readonly<{ tenantId: string; companyId: string }>,
  family: InventoryPilotApprovalFamily,
  itemIds: readonly string[],
  assertEndpoints: (endpointKeys: ReadonlySet<string>) => void,
) {
  assertKillSwitch(family, dependencies.environment ?? process.env);
  assertUuid(scope.tenantId);
  assertUuid(scope.companyId);
  const snapshot = await (
    dependencies.readPolicy ?? readInventoryPilotApprovalPolicyFromDatabase
  )(dependencies.tx, { ...scope, family });
  if (!snapshot) {
    fail(INVENTORY_PILOT_APPROVAL_ERRORS.CONFIGURATION_NOT_AVAILABLE);
  }
  const policy = assertPolicyIntegrity(
    scope.tenantId,
    scope.companyId,
    family,
    snapshot,
  );
  assertEndpoints(policy.endpointKeys);

  const classifiedItems = new Set<string>();
  let admittedCount = 0;
  for (const itemId of itemIds) {
    assertUuid(itemId);
    classifiedItems.add(itemId);
    if (policy.itemIds.has(itemId)) admittedCount += 1;
  }
  if (admittedCount !== itemIds.length) {
    fail(
      admittedCount > 0
        ? INVENTORY_PILOT_APPROVAL_ERRORS.MIXED_ITEM_COHORT
        : INVENTORY_PILOT_APPROVAL_ERRORS.SCOPE_MISMATCH,
    );
  }
  const sortedItemIds = [...classifiedItems].sort();
  const attestation: InventoryPilotApprovalAttestation = {
    configurationRevisionId: snapshot.revision.id,
    configurationRevisionNumber: snapshot.revision.revisionNumber,
    configurationDigest: snapshot.revision.configurationDigest,
    activationEventId: snapshot.activationEvent.id,
    activationGeneration: snapshot.activation.generation,
    family,
    itemDigest: inventoryPilotDigest({
      schemaVersion: 1,
      family,
      items: sortedItemIds.map((itemId) => ({ itemId })),
    }),
  };
  assertExpectedAttestation(attestation, dependencies.expectedAttestation);
  return attestation;
}

export async function classifyInventoryTransferForPilotApproval(
  input: ClassificationDependencies &
    Readonly<{
      transfer: LockedInventoryTransferPilotSnapshot;
      stage: InventoryPilotApprovalStage;
    }>,
) {
  const { transfer } = input;
  assertPositiveVersion(transfer.version);
  const allowedStatus =
    input.stage === "SUBMIT"
      ? transfer.status === "DRAFT" || transfer.status === "RETURNED"
      : transfer.status === "PENDING_APPROVAL";
  if (!allowedStatus || transfer.lines.length === 0) {
    fail(INVENTORY_PILOT_APPROVAL_ERRORS.SOURCE_STALE);
  }
  for (const id of [
    transfer.id,
    transfer.tenantId,
    transfer.companyId,
    transfer.sourceLocationId,
    transfer.destinationLocationId,
  ]) {
    assertUuid(id);
  }
  if (transfer.sourceLocationId === transfer.destinationLocationId) {
    fail(INVENTORY_PILOT_APPROVAL_ERRORS.SCOPE_MISMATCH);
  }
  for (const line of transfer.lines) {
    for (const id of [
      line.id,
      line.itemId,
      line.sourceInventoryLocationId,
      line.destinationInventoryLocationId,
    ]) {
      assertUuid(id);
    }
    if (
      line.tenantId !== transfer.tenantId ||
      line.companyId !== transfer.companyId
    ) {
      fail(INVENTORY_PILOT_APPROVAL_ERRORS.SCOPE_MISMATCH);
    }
  }
  return classify(
    input,
    { tenantId: transfer.tenantId, companyId: transfer.companyId },
    "InventoryTransfer",
    transfer.lines.map(({ itemId }) => itemId),
    (endpointKeys) => {
      for (const line of transfer.lines) {
        const sourceKey = `TRANSFER_SOURCE:${line.sourceInventoryLocationId}:${transfer.sourceLocationId}`;
        const destinationKey = `TRANSFER_DESTINATION:${line.destinationInventoryLocationId}:${transfer.destinationLocationId}`;
        if (!endpointKeys.has(sourceKey) || !endpointKeys.has(destinationKey)) {
          fail(INVENTORY_PILOT_APPROVAL_ERRORS.ENDPOINT_CAPABILITY_MISMATCH);
        }
      }
    },
  );
}

export async function classifyStockCountAttemptForPilotApproval(
  input: ClassificationDependencies &
    Readonly<{
      count: LockedStockCountAttemptPilotSnapshot;
      stage: InventoryPilotApprovalStage;
    }>,
) {
  const { session, attempt } = input.count;
  assertPositiveVersion(session.version);
  assertPositiveVersion(attempt.version);
  const allowedStatus =
    input.stage === "SUBMIT"
      ? session.status === "IN_PROGRESS" && attempt.status === "IN_PROGRESS"
      : session.status === "SUBMITTED" && attempt.status === "SUBMITTED";
  if (
    !allowedStatus ||
    attempt.lines.length === 0 ||
    session.currentAttemptId !== attempt.id
  ) {
    fail(INVENTORY_PILOT_APPROVAL_ERRORS.SOURCE_STALE);
  }
  for (const id of [
    session.id,
    session.tenantId,
    session.companyId,
    session.inventoryLocationId,
    session.locationId,
    attempt.id,
    attempt.stockCountSessionId,
    attempt.tenantId,
    attempt.companyId,
    attempt.inventoryLocationId,
  ]) {
    assertUuid(id);
  }
  if (
    attempt.stockCountSessionId !== session.id ||
    attempt.tenantId !== session.tenantId ||
    attempt.companyId !== session.companyId ||
    attempt.inventoryLocationId !== session.inventoryLocationId
  ) {
    fail(INVENTORY_PILOT_APPROVAL_ERRORS.SCOPE_MISMATCH);
  }
  for (const line of attempt.lines) {
    for (const id of [line.id, line.itemId, line.inventoryLocationId]) {
      assertUuid(id);
    }
    if (
      line.tenantId !== session.tenantId ||
      line.companyId !== session.companyId ||
      line.inventoryLocationId !== session.inventoryLocationId
    ) {
      fail(INVENTORY_PILOT_APPROVAL_ERRORS.SCOPE_MISMATCH);
    }
  }
  return classify(
    input,
    { tenantId: session.tenantId, companyId: session.companyId },
    "StockCountAttemptReview",
    attempt.lines.map(({ itemId }) => itemId),
    (endpointKeys) => {
      const countKey = `COUNT_LOCATION:${session.inventoryLocationId}:${session.locationId}`;
      if (!endpointKeys.has(countKey)) {
        fail(INVENTORY_PILOT_APPROVAL_ERRORS.ENDPOINT_CAPABILITY_MISMATCH);
      }
    },
  );
}
