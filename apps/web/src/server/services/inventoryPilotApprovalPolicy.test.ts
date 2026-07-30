import { describe, expect, it, vi } from "vitest";
import type { TransactionClient } from "@ogfi/database";
import {
  INVENTORY_PILOT_APPROVAL_ERRORS,
  classifyInventoryTransferForPilotApproval,
  classifyStockCountAttemptForPilotApproval,
  inventoryPilotCanonicalJson,
  inventoryPilotDigest,
  type InventoryPilotApprovalFamily,
  type InventoryPilotApprovalPolicyReader,
  type InventoryPilotApprovalPolicySnapshot,
  type LockedInventoryTransferPilotSnapshot,
  type LockedStockCountAttemptPilotSnapshot,
} from "./inventoryPilotApprovalPolicy";

const ids = {
  tenant: "10000000-0000-4000-8000-000000000001",
  company: "10000000-0000-4000-8000-000000000002",
  wrongCompany: "10000000-0000-4000-8000-000000000003",
  revision: "10000000-0000-4000-8000-000000000004",
  activation: "10000000-0000-4000-8000-000000000005",
  event: "10000000-0000-4000-8000-000000000006",
  actor: "10000000-0000-4000-8000-000000000007",
  transfer: "10000000-0000-4000-8000-000000000008",
  transferLine1: "10000000-0000-4000-8000-000000000009",
  transferLine2: "10000000-0000-4000-8000-00000000000a",
  sourceLocation: "20000000-0000-4000-8000-000000000001",
  destinationLocation: "20000000-0000-4000-8000-000000000002",
  sourceInventoryLocation: "20000000-0000-4000-8000-000000000003",
  destinationInventoryLocation: "20000000-0000-4000-8000-000000000004",
  countLocation: "20000000-0000-4000-8000-000000000005",
  countInventoryLocation: "20000000-0000-4000-8000-000000000006",
  item1: "30000000-0000-4000-8000-000000000001",
  item2: "30000000-0000-4000-8000-000000000002",
  unknownItem: "30000000-0000-4000-8000-000000000003",
  countSession: "40000000-0000-4000-8000-000000000001",
  countAttempt: "40000000-0000-4000-8000-000000000002",
  otherAttempt: "40000000-0000-4000-8000-000000000003",
  countLine: "40000000-0000-4000-8000-000000000004",
} as const;

const tx = {} as TransactionClient;

function enabledEnvironment(family: InventoryPilotApprovalFamily) {
  return family === "InventoryTransfer"
    ? { INVENTORY_TRANSFER_APPROVAL_V1_ENABLED: "true" }
    : { STOCK_COUNT_ATTEMPT_REVIEW_APPROVAL_V1_ENABLED: "true" };
}

function policySnapshot(
  family: InventoryPilotApprovalFamily,
): InventoryPilotApprovalPolicySnapshot {
  const endpoints = [
    {
      tenantId: ids.tenant,
      companyId: ids.company,
      capability: "COUNT_LOCATION",
      inventoryLocationId: ids.countInventoryLocation,
      locationId: ids.countLocation,
    },
    {
      tenantId: ids.tenant,
      companyId: ids.company,
      capability: "TRANSFER_DESTINATION",
      inventoryLocationId: ids.destinationInventoryLocation,
      locationId: ids.destinationLocation,
    },
    {
      tenantId: ids.tenant,
      companyId: ids.company,
      capability: "TRANSFER_SOURCE",
      inventoryLocationId: ids.sourceInventoryLocation,
      locationId: ids.sourceLocation,
    },
  ];
  const items = [
    { tenantId: ids.tenant, companyId: ids.company, itemId: ids.item1 },
    { tenantId: ids.tenant, companyId: ids.company, itemId: ids.item2 },
  ];
  const revisionPayload = {
    schemaVersion: 1,
    tenantId: ids.tenant,
    companyId: ids.company,
    revisionNumber: 1,
    status: "SEALED",
    sourceDecisionId: "DEC-0261",
    endpoints: endpoints.map(
      ({ capability, inventoryLocationId, locationId }) => ({
        capability,
        inventoryLocationId,
        locationId,
      }),
    ),
    items: items.map(({ itemId }) => ({ itemId })),
  };
  const configurationDigest = inventoryPilotDigest(revisionPayload);
  const eventPayload = {
    schemaVersion: 1,
    tenantId: ids.tenant,
    companyId: ids.company,
    family,
    status: "ACTIVE",
    configurationRevisionId: ids.revision,
    configurationRevisionNumber: 1,
    configurationDigest,
    generation: 1,
    priorActivationEventId: null,
    priorGeneration: null,
    activatedByUserId: ids.actor,
    activationReason: "Owner-confirmed controlled pilot activation",
  };
  return {
    activation: {
      id: ids.activation,
      tenantId: ids.tenant,
      companyId: ids.company,
      family,
      status: "ACTIVE",
      configurationRevisionId: ids.revision,
      configurationRevisionNumber: 1,
      configurationDigest,
      currentActivationEventId: ids.event,
      generation: 1,
    },
    activationEvent: {
      id: ids.event,
      tenantId: ids.tenant,
      companyId: ids.company,
      family,
      status: "ACTIVE",
      configurationRevisionId: ids.revision,
      configurationRevisionNumber: 1,
      configurationDigest,
      generation: 1,
      priorActivationEventId: null,
      priorGeneration: null,
      activatedByUserId: ids.actor,
      activationReason: eventPayload.activationReason,
      canonicalJson: inventoryPilotCanonicalJson(eventPayload),
      activationHash: inventoryPilotDigest(eventPayload),
    },
    revision: {
      id: ids.revision,
      tenantId: ids.tenant,
      companyId: ids.company,
      revisionNumber: 1,
      schemaVersion: 1,
      status: "SEALED",
      canonicalJson: inventoryPilotCanonicalJson(revisionPayload),
      configurationDigest,
      sourceDecisionId: "DEC-0261",
    },
    endpoints,
    items,
    otherFamilyActivation: null,
  };
}

function reader(snapshot: InventoryPilotApprovalPolicySnapshot | null) {
  return vi.fn(
    async () => snapshot,
  ) as unknown as InventoryPilotApprovalPolicyReader;
}

function resealSnapshot(
  snapshot: InventoryPilotApprovalPolicySnapshot,
  endpoints: InventoryPilotApprovalPolicySnapshot["endpoints"],
): InventoryPilotApprovalPolicySnapshot {
  const sortedEndpoints = [...endpoints].sort(
    (left, right) =>
      left.capability.localeCompare(right.capability) ||
      left.inventoryLocationId.localeCompare(right.inventoryLocationId) ||
      left.locationId.localeCompare(right.locationId),
  );
  const revisionPayload = {
    schemaVersion: snapshot.revision.schemaVersion,
    tenantId: ids.tenant,
    companyId: ids.company,
    revisionNumber: snapshot.revision.revisionNumber,
    status: snapshot.revision.status,
    sourceDecisionId: snapshot.revision.sourceDecisionId,
    endpoints: sortedEndpoints.map(
      ({ capability, inventoryLocationId, locationId }) => ({
        capability,
        inventoryLocationId,
        locationId,
      }),
    ),
    items: snapshot.items.map(({ itemId }) => ({ itemId })),
  };
  const configurationDigest = inventoryPilotDigest(revisionPayload);
  const activation = { ...snapshot.activation, configurationDigest };
  const activationEvent = {
    ...snapshot.activationEvent,
    configurationDigest,
  };
  const eventPayload = {
    schemaVersion: 1,
    tenantId: ids.tenant,
    companyId: ids.company,
    family: activationEvent.family,
    status: activationEvent.status,
    configurationRevisionId: activationEvent.configurationRevisionId,
    configurationRevisionNumber: activationEvent.configurationRevisionNumber,
    configurationDigest,
    generation: activationEvent.generation,
    priorActivationEventId: activationEvent.priorActivationEventId,
    priorGeneration: activationEvent.priorGeneration,
    activatedByUserId: activationEvent.activatedByUserId,
    activationReason: activationEvent.activationReason,
  };
  return {
    ...snapshot,
    activation,
    activationEvent: {
      ...activationEvent,
      canonicalJson: inventoryPilotCanonicalJson(eventPayload),
      activationHash: inventoryPilotDigest(eventPayload),
    },
    revision: {
      ...snapshot.revision,
      canonicalJson: inventoryPilotCanonicalJson(revisionPayload),
      configurationDigest,
    },
    endpoints: sortedEndpoints,
  };
}

function transfer(): LockedInventoryTransferPilotSnapshot {
  return {
    id: ids.transfer,
    tenantId: ids.tenant,
    companyId: ids.company,
    version: 1,
    status: "DRAFT",
    sourceLocationId: ids.sourceLocation,
    destinationLocationId: ids.destinationLocation,
    lines: [
      {
        id: ids.transferLine1,
        tenantId: ids.tenant,
        companyId: ids.company,
        itemId: ids.item1,
        sourceInventoryLocationId: ids.sourceInventoryLocation,
        destinationInventoryLocationId: ids.destinationInventoryLocation,
      },
    ],
  };
}

function count(): LockedStockCountAttemptPilotSnapshot {
  return {
    session: {
      id: ids.countSession,
      tenantId: ids.tenant,
      companyId: ids.company,
      version: 1,
      status: "IN_PROGRESS",
      inventoryLocationId: ids.countInventoryLocation,
      locationId: ids.countLocation,
      currentAttemptId: ids.countAttempt,
    },
    attempt: {
      id: ids.countAttempt,
      stockCountSessionId: ids.countSession,
      tenantId: ids.tenant,
      companyId: ids.company,
      version: 1,
      status: "IN_PROGRESS",
      inventoryLocationId: ids.countInventoryLocation,
      lines: [
        {
          id: ids.countLine,
          tenantId: ids.tenant,
          companyId: ids.company,
          inventoryLocationId: ids.countInventoryLocation,
          itemId: ids.item1,
        },
      ],
    },
  };
}

describe("inventory pilot approval policy classifier", () => {
  it("keeps each family default-off and performs no database read", async () => {
    const readPolicy = reader(policySnapshot("InventoryTransfer"));
    await expect(
      classifyInventoryTransferForPilotApproval({
        tx,
        transfer: transfer(),
        stage: "SUBMIT",
        environment: {},
        readPolicy,
      }),
    ).rejects.toThrow(INVENTORY_PILOT_APPROVAL_ERRORS.DISABLED);
    expect(readPolicy).not.toHaveBeenCalled();
  });

  it("does not treat an enabled environment switch as database authority", async () => {
    await expect(
      classifyInventoryTransferForPilotApproval({
        tx,
        transfer: transfer(),
        stage: "SUBMIT",
        environment: enabledEnvironment("InventoryTransfer"),
        readPolicy: reader(null),
      }),
    ).rejects.toThrow(
      INVENTORY_PILOT_APPROVAL_ERRORS.CONFIGURATION_NOT_AVAILABLE,
    );
  });

  it("rejects a cross-company activation snapshot", async () => {
    const snapshot = policySnapshot("InventoryTransfer");
    await expect(
      classifyInventoryTransferForPilotApproval({
        tx,
        transfer: transfer(),
        stage: "SUBMIT",
        environment: enabledEnvironment("InventoryTransfer"),
        readPolicy: reader({
          ...snapshot,
          activation: { ...snapshot.activation, companyId: ids.wrongCompany },
        }),
      }),
    ).rejects.toThrow(INVENTORY_PILOT_APPROVAL_ERRORS.CONFIGURATION_INVALID);
  });

  it("rejects a wrong transfer endpoint capability", async () => {
    const snapshot = policySnapshot("InventoryTransfer");
    const wrongCapability = resealSnapshot(
      snapshot,
      snapshot.endpoints.filter(
        ({ capability }) => capability !== "TRANSFER_DESTINATION",
      ),
    );
    await expect(
      classifyInventoryTransferForPilotApproval({
        tx,
        transfer: transfer(),
        stage: "SUBMIT",
        environment: enabledEnvironment("InventoryTransfer"),
        readPolicy: reader(wrongCapability),
      }),
    ).rejects.toThrow(
      INVENTORY_PILOT_APPROVAL_ERRORS.ENDPOINT_CAPABILITY_MISMATCH,
    );
  });

  it("rejects a mixed admitted and unknown transfer SKU cohort", async () => {
    const source = transfer();
    await expect(
      classifyInventoryTransferForPilotApproval({
        tx,
        transfer: {
          ...source,
          lines: [
            ...source.lines,
            {
              ...source.lines[0]!,
              id: ids.transferLine2,
              itemId: ids.unknownItem,
            },
          ],
        },
        stage: "SUBMIT",
        environment: enabledEnvironment("InventoryTransfer"),
        readPolicy: reader(policySnapshot("InventoryTransfer")),
      }),
    ).rejects.toThrow(INVENTORY_PILOT_APPROVAL_ERRORS.MIXED_ITEM_COHORT);
  });

  it("rejects a transfer line with adjacent company scope", async () => {
    const source = transfer();
    await expect(
      classifyInventoryTransferForPilotApproval({
        tx,
        transfer: {
          ...source,
          lines: [{ ...source.lines[0]!, companyId: ids.wrongCompany }],
        },
        stage: "SUBMIT",
        environment: enabledEnvironment("InventoryTransfer"),
        readPolicy: reader(policySnapshot("InventoryTransfer")),
      }),
    ).rejects.toThrow(INVENTORY_PILOT_APPROVAL_ERRORS.SCOPE_MISMATCH);
  });

  it("rejects configuration canonical digest drift", async () => {
    const snapshot = policySnapshot("InventoryTransfer");
    await expect(
      classifyInventoryTransferForPilotApproval({
        tx,
        transfer: transfer(),
        stage: "SUBMIT",
        environment: enabledEnvironment("InventoryTransfer"),
        readPolicy: reader({
          ...snapshot,
          revision: { ...snapshot.revision, canonicalJson: "{}" },
        }),
      }),
    ).rejects.toThrow(
      INVENTORY_PILOT_APPROVAL_ERRORS.CONFIGURATION_DIGEST_MISMATCH,
    );
  });

  it("returns an exact internal transfer attestation", async () => {
    const snapshot = policySnapshot("InventoryTransfer");
    const result = await classifyInventoryTransferForPilotApproval({
      tx,
      transfer: transfer(),
      stage: "SUBMIT",
      environment: enabledEnvironment("InventoryTransfer"),
      readPolicy: reader(snapshot),
    });
    expect(result).toEqual({
      configurationRevisionId: ids.revision,
      configurationRevisionNumber: 1,
      configurationDigest: snapshot.revision.configurationDigest,
      activationEventId: ids.event,
      activationGeneration: 1,
      family: "InventoryTransfer",
      itemDigest: inventoryPilotDigest({
        schemaVersion: 1,
        family: "InventoryTransfer",
        items: [{ itemId: ids.item1 }],
      }),
    });
  });

  it("rejects a count whose current attempt changed", async () => {
    const source = count();
    await expect(
      classifyStockCountAttemptForPilotApproval({
        tx,
        count: {
          ...source,
          session: { ...source.session, currentAttemptId: ids.otherAttempt },
        },
        stage: "SUBMIT",
        environment: enabledEnvironment("StockCountAttemptReview"),
        readPolicy: reader(policySnapshot("StockCountAttemptReview")),
      }),
    ).rejects.toThrow(INVENTORY_PILOT_APPROVAL_ERRORS.SOURCE_STALE);
  });

  it("admits the exact current count attempt and location capability", async () => {
    const snapshot = policySnapshot("StockCountAttemptReview");
    const result = await classifyStockCountAttemptForPilotApproval({
      tx,
      count: count(),
      stage: "SUBMIT",
      environment: enabledEnvironment("StockCountAttemptReview"),
      readPolicy: reader(snapshot),
    });
    expect(result.family).toBe("StockCountAttemptReview");
    expect(result.configurationDigest).toBe(
      snapshot.revision.configurationDigest,
    );
    expect(result.activationEventId).toBe(ids.event);
  });

  it("rejects an attestation after activation generation drift", async () => {
    const snapshot = policySnapshot("InventoryTransfer");
    const exact = await classifyInventoryTransferForPilotApproval({
      tx,
      transfer: transfer(),
      stage: "SUBMIT",
      environment: enabledEnvironment("InventoryTransfer"),
      readPolicy: reader(snapshot),
    });
    await expect(
      classifyInventoryTransferForPilotApproval({
        tx,
        transfer: transfer(),
        stage: "SUBMIT",
        environment: enabledEnvironment("InventoryTransfer"),
        expectedAttestation: { ...exact, activationGeneration: 2 },
        readPolicy: reader(snapshot),
      }),
    ).rejects.toThrow(INVENTORY_PILOT_APPROVAL_ERRORS.CONFIGURATION_STALE);
  });
});
