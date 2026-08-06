import { createConnection } from "node:net";

type ApprovalPilotBootstrapRequest = {
  action: "INITIALIZE" | "ROLLOVER";
  tenantId: string;
  companyId: string;
  actorUserId: string;
  sourceLocationId: string;
  destinationLocationId: string;
  sourceInventoryLocationId: string;
  destinationInventoryLocationId: string;
  itemId: string;
  family?: "InventoryTransfer" | "StockCountAttemptReview";
};

type OpeningPilotBootstrapRequest = {
  action: "OPENING_INITIALIZE";
  tenantId: string;
  companyId: string;
  actorUserId: string;
  locations: Array<{
    locationId: string;
    inventoryLocationId: string;
  }>;
  itemIds: string[];
};

type OpeningInventoryMovementFailureRequest = {
  action: "OPENING_INSTALL_INVENTORY_MOVEMENT_FAILURE";
  targetInventoryLocationId: string;
};

export type ConfigurationV2SealedFixtureRequest = {
  action: "CONFIGURATION_V2_SEALED";
};

export type ConfigurationV2SealedFixtureResult = {
  revisionId: string;
  revisionNumber: number;
  digest: string;
};

type LegacyInventoryPilotBootstrapResult = {
  id: string;
  revisionNumber: number;
  configurationDigest: string;
};

export type InventoryPilotBootstrapRequest =
  | ApprovalPilotBootstrapRequest
  | OpeningPilotBootstrapRequest
  | OpeningInventoryMovementFailureRequest
  | ConfigurationV2SealedFixtureRequest;

export function requestInventoryPilotBootstrap(
  request: ConfigurationV2SealedFixtureRequest,
): Promise<ConfigurationV2SealedFixtureResult>;
export function requestInventoryPilotBootstrap(
  request: Exclude<
    InventoryPilotBootstrapRequest,
    ConfigurationV2SealedFixtureRequest
  >,
): Promise<LegacyInventoryPilotBootstrapResult | undefined>;

export async function requestInventoryPilotBootstrap(
  request: InventoryPilotBootstrapRequest,
): Promise<
  | LegacyInventoryPilotBootstrapResult
  | ConfigurationV2SealedFixtureResult
  | undefined
> {
  const socketPath = process.env.OGFI_INVENTORY_PILOT_BOOTSTRAP_SOCKET;
  const token = process.env.OGFI_INVENTORY_PILOT_BOOTSTRAP_TOKEN;
  if (!socketPath || !token) {
    throw new Error("INVENTORY_PILOT_DISPOSABLE_BOOTSTRAP_UNAVAILABLE");
  }

  return await new Promise<
    | LegacyInventoryPilotBootstrapResult
    | ConfigurationV2SealedFixtureResult
    | undefined
  >((resolve, reject) => {
    const socket = createConnection(socketPath);
    let response = "";
    socket.setTimeout(10_000, () => {
      socket.destroy(new Error("INVENTORY_PILOT_BOOTSTRAP_RESPONSE_TIMEOUT"));
    });
    socket.setEncoding("utf8");
    socket.on("connect", () => {
      socket.end(`${JSON.stringify({ token, request })}\n`);
    });
    socket.on("data", (chunk) => {
      response += chunk;
      if (response.length > 8_192)
        socket.destroy(
          new Error("INVENTORY_PILOT_BOOTSTRAP_RESPONSE_TOO_LARGE"),
        );
    });
    socket.on("error", reject);
    socket.on("end", () => {
      try {
        const result = JSON.parse(response) as {
          ok?: boolean;
          error?: string;
          result?: unknown;
        };
        if (!result.ok)
          throw new Error(result.error ?? "INVENTORY_PILOT_BOOTSTRAP_FAILED");
        if (request.action === "CONFIGURATION_V2_SEALED") {
          const fixture = result.result;
          if (
            !fixture ||
            typeof fixture !== "object" ||
            Array.isArray(fixture) ||
            Object.keys(fixture).sort().join(",") !==
              "digest,revisionId,revisionNumber" ||
            !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
              String(
                (fixture as ConfigurationV2SealedFixtureResult).revisionId,
              ),
            ) ||
            !Number.isInteger(
              (fixture as ConfigurationV2SealedFixtureResult).revisionNumber,
            ) ||
            (fixture as ConfigurationV2SealedFixtureResult).revisionNumber <
              1 ||
            !/^[a-f0-9]{64}$/.test(
              String((fixture as ConfigurationV2SealedFixtureResult).digest),
            )
          ) {
            throw new Error(
              "INVENTORY_PILOT_BOOTSTRAP_CONFIGURATION_V2_RESPONSE_INVALID",
            );
          }
          resolve(fixture as ConfigurationV2SealedFixtureResult);
          return;
        }
        resolve(
          result.result as LegacyInventoryPilotBootstrapResult | undefined,
        );
      } catch (error) {
        reject(error);
      }
    });
  });
}
