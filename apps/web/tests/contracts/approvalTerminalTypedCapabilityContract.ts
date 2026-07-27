import { createHash } from "node:crypto";
import { approvalGraphMutationInventory } from "../../src/server/services/approvalGraphMutationInventory";
import { supportedApprovalDocumentTypes } from "../../src/server/services/approvalRoutingRegistry";

export const APPROVAL_TERMINAL_TYPED_CAPABILITY_CONTRACT_VERSION =
  "dec-0247-c4-terminal-shape.1";

export type DormantTerminalCapabilityContract = Readonly<{
  contractKind: "DORMANT_TYPED_TERMINAL_SHAPE";
  documentType: (typeof supportedApprovalDocumentTypes)[number];
  capabilityName: string;
  mutationInventoryId: "terminal.shared-future-step-skip";
  executable: false;
  runtimeCallable: false;
  databaseRoutineExists: false;
  positiveGrant: false;
  grantsAuthority: false;
  baseDmlRevoked: false;
  acceptsCallerDescriptor: false;
  acceptsCallerFutureStepIds: false;
  transactionBound: true;
  sourceFirstLockRequired: true;
  actingStepCasRequired: true;
  futureStepCasRequired: true;
  residueCheckRequired: true;
  invocationStatus: "DORMANT_UNAVAILABLE";
}>;

const deepFreeze = <T>(value: T): Readonly<T> => {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const item of Object.values(value as Record<string, unknown>)) deepFreeze(item);
  }
  return value;
};

export const approvalTerminalTypedCapabilityContracts = deepFreeze(
  Object.fromEntries(
    supportedApprovalDocumentTypes.map((documentType) => [documentType, {
      contractKind: "DORMANT_TYPED_TERMINAL_SHAPE" as const,
      documentType,
      capabilityName: `approval.${documentType}.terminalFutureSteps`,
      mutationInventoryId: "terminal.shared-future-step-skip" as const,
      executable: false as const,
      runtimeCallable: false as const,
      databaseRoutineExists: false as const,
      positiveGrant: false as const,
      grantsAuthority: false as const,
      baseDmlRevoked: false as const,
      acceptsCallerDescriptor: false as const,
      acceptsCallerFutureStepIds: false as const,
      transactionBound: true as const,
      sourceFirstLockRequired: true as const,
      actingStepCasRequired: true as const,
      futureStepCasRequired: true as const,
      residueCheckRequired: true as const,
      invocationStatus: "DORMANT_UNAVAILABLE" as const,
    } satisfies DormantTerminalCapabilityContract]),
  ),
);

export const APPROVAL_TERMINAL_TYPED_CAPABILITY_CONTRACT_DIGEST = createHash("sha256")
  .update(JSON.stringify({
    version: APPROVAL_TERMINAL_TYPED_CAPABILITY_CONTRACT_VERSION,
    capabilities: approvalTerminalTypedCapabilityContracts,
    mutationInventory: approvalGraphMutationInventory.find(
      (entry) => entry.id === "terminal.shared-future-step-skip",
    ),
  }))
  .digest("hex");
