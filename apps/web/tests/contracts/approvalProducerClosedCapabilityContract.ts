import { createHash } from "node:crypto";
import {
  APPROVAL_PRODUCER_CAPABILITY_VERSION,
  approvalProducerCapabilityContracts,
} from "../../src/server/services/approvalProducerCapabilityManifest";
import {
  approvalGraphMutationInventory,
  approvalGraphToolingDdlInventory,
  approvalGraphToolingMutationInventory,
  approvalGraphToolingProbeInventory,
  approvalRawSqlCallInventory,
} from "../../src/server/services/approvalGraphMutationInventory";
import { supportedApprovalDocumentTypes } from "../../src/server/services/approvalRoutingRegistry";

export const APPROVAL_PRODUCER_CLOSED_CAPABILITY_CONTRACT_VERSION =
  "dec-0247-c2.dormant-closed-writer-contract.1";

type ClosedCapabilityContract = Readonly<{
  contractKind: "DORMANT_WRITER_DISCOVERY";
  executable: false;
  runtimeCallable: false;
  databaseRoutineExists: false;
  positiveGrant: false;
  grantsAuthority: false;
  baseDmlRevoked: false;
  runtimeBaseGraphDml: "OPEN";
  readinessResult: "NONE";
  certificationResult: "NONE";
  activationResult: "NONE";
  status: "DISCOVERY_ONLY";
  documentType: (typeof supportedApprovalDocumentTypes)[number];
  producerId: string;
  producer: Readonly<{ serviceFile: string; functionName: string }>;
  proposedCapability: Readonly<{
    name: string;
    signature: null;
    parametersAreBindingsNotAuthority: true;
  }>;
  mutationInventoryId: string;
  mutationInventory: ReadonlyArray<unknown>;
  sourceAndRoutingFacts: Readonly<{
    sourceRelation: string;
    serializationRelation: string;
    sourceStatuses: unknown;
    derivation: unknown;
    concurrency: unknown;
    stableErrors: readonly string[];
    idempotency: string;
    identityLifecycle: unknown;
  }>;
}>;

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, stable(item)]),
    );
  }
  return value;
}

function deepFreeze<T>(value: T): Readonly<T> {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const item of Object.values(value as Record<string, unknown>)) deepFreeze(item);
  }
  return value;
}

const producerInventory = new Map(
  approvalGraphMutationInventory
    .filter((entry) => entry.category === "PRODUCER_CREATION")
    .map((entry) => [entry.documentTypes[0], entry] as const),
);
if (
  approvalGraphMutationInventory.filter((entry) => entry.category === "PRODUCER_CREATION").length !== 18
  || producerInventory.size !== 18
  || [...producerInventory.values()].some((entry) => entry.documentTypes.length !== 1)
) {
  throw new Error("APPROVAL_PRODUCER_CLOSED_CONTRACT_PRODUCER_INVENTORY_NOT_BIJECTIVE");
}

const contractEntries = supportedApprovalDocumentTypes.map((documentType) => {
  const source = approvalProducerCapabilityContracts.find(
    (entry) => entry.documentType === documentType,
  );
  const inventory = producerInventory.get(documentType);
  if (!source || !inventory) {
    throw new Error(`APPROVAL_PRODUCER_CLOSED_CONTRACT_INVENTORY_MISMATCH:${documentType}`);
  }
  return {
    contractKind: "DORMANT_WRITER_DISCOVERY" as const,
    executable: false as const,
    runtimeCallable: false as const,
    databaseRoutineExists: false as const,
    positiveGrant: false as const,
    grantsAuthority: false as const,
    baseDmlRevoked: false as const,
    runtimeBaseGraphDml: "OPEN" as const,
    readinessResult: "NONE" as const,
    certificationResult: "NONE" as const,
    activationResult: "NONE" as const,
    status: "DISCOVERY_ONLY" as const,
    documentType,
    producerId: source.producerId,
    producer: source.currentCompatibility.producer,
    proposedCapability: {
      name: source.requiredCapability.proposedName,
      signature: null,
      parametersAreBindingsNotAuthority: true as const,
    },
    mutationInventoryId: inventory.id,
    mutationInventory: inventory.mutations,
    sourceAndRoutingFacts: {
      sourceRelation: source.currentCompatibility.sourceRelation,
      serializationRelation: source.currentCompatibility.serializationRelation,
      sourceStatuses: source.currentCompatibility.sourceStatuses,
      derivation: source.requiredCapability.derivation,
      concurrency: source.requiredCapability.concurrency,
      stableErrors: source.requiredCapability.stableErrors,
      idempotency: source.requiredCapability.idempotency,
      identityLifecycle: source.identityLifecycle,
    },
  } satisfies ClosedCapabilityContract;
});

export const approvalProducerClosedCapabilityContract = deepFreeze(
  Object.fromEntries(contractEntries.map((entry) => [entry.documentType, entry])) as Record<
    (typeof supportedApprovalDocumentTypes)[number],
    ClosedCapabilityContract
  >,
);

export const approvalProducerClosedCapabilityInventoryDigest = createHash("sha256")
  .update(JSON.stringify(stable({
    version: APPROVAL_PRODUCER_CLOSED_CAPABILITY_CONTRACT_VERSION,
    c1Version: APPROVAL_PRODUCER_CAPABILITY_VERSION,
    producers: approvalProducerClosedCapabilityContract,
    graphMutations: approvalGraphMutationInventory,
    toolingMutations: approvalGraphToolingMutationInventory,
    toolingDdl: approvalGraphToolingDdlInventory,
    toolingProbes: approvalGraphToolingProbeInventory,
    rawSql: approvalRawSqlCallInventory,
  })))
  .digest("hex");

export const approvalProducerClosedCapabilityContracts = Object.freeze(
  Object.values(approvalProducerClosedCapabilityContract),
);

export type { ClosedCapabilityContract };
