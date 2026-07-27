import { createHash } from "node:crypto";
import {
  approvalProducerClosedCapabilityContract,
  approvalProducerClosedCapabilityContracts,
} from "./approvalProducerClosedCapabilityContract";

export const APPROVAL_PRODUCER_TYPED_ADAPTER_CONTRACT_VERSION =
  "dec-0247-c3.dormant-typed-adapter-shape.1";

export type DormantTypedAdapterContract = Readonly<{
  contractKind: "DORMANT_TYPED_ADAPTER_SHAPE";
  documentType: string;
  adapterName: string;
  executable: false;
  runtimeCallable: false;
  databaseRoutineExists: false;
  positiveGrant: false;
  grantsAuthority: false;
  sourceLocksRequired: true;
  sourceCasRequired: true;
  replayContractRequired: true;
  descriptorIsCallerAuthority: false;
  invocationStatus: "DORMANT_UNAVAILABLE";
}>;

const deepFreeze = <T>(value: T): Readonly<T> => {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const item of Object.values(value as Record<string, unknown>)) deepFreeze(item);
  }
  return value;
};

export const approvalProducerTypedAdapterContracts = deepFreeze(
  Object.fromEntries(
    approvalProducerClosedCapabilityContracts.map((entry) => [entry.documentType, {
      contractKind: "DORMANT_TYPED_ADAPTER_SHAPE" as const,
      documentType: entry.documentType,
      adapterName: `${entry.proposedCapability.name}.typedAdapter`,
      executable: false as const,
      runtimeCallable: false as const,
      databaseRoutineExists: false as const,
      positiveGrant: false as const,
      grantsAuthority: false as const,
      sourceLocksRequired: true as const,
      sourceCasRequired: true as const,
      replayContractRequired: true as const,
      descriptorIsCallerAuthority: false as const,
      invocationStatus: "DORMANT_UNAVAILABLE" as const,
    } satisfies DormantTypedAdapterContract]),
  ),
);

export const APPROVAL_PRODUCER_TYPED_ADAPTER_CONTRACT_DIGEST = createHash("sha256")
  .update(JSON.stringify({
    version: APPROVAL_PRODUCER_TYPED_ADAPTER_CONTRACT_VERSION,
    c2: approvalProducerClosedCapabilityContract,
    adapters: approvalProducerTypedAdapterContracts,
  }))
  .digest("hex");
