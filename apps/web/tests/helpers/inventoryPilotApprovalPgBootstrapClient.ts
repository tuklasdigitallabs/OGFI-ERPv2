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

export type InventoryPilotBootstrapRequest =
  | ApprovalPilotBootstrapRequest
  | OpeningPilotBootstrapRequest
  | OpeningInventoryMovementFailureRequest;

export async function requestInventoryPilotBootstrap(
  request: InventoryPilotBootstrapRequest,
): Promise<{ id: string; revisionNumber: number; configurationDigest: string } | undefined> {
  const socketPath = process.env.OGFI_INVENTORY_PILOT_BOOTSTRAP_SOCKET;
  const token = process.env.OGFI_INVENTORY_PILOT_BOOTSTRAP_TOKEN;
  if (!socketPath || !token) {
    throw new Error("INVENTORY_PILOT_DISPOSABLE_BOOTSTRAP_UNAVAILABLE");
  }

  return await new Promise<
    { id: string; revisionNumber: number; configurationDigest: string } | undefined
  >((resolve, reject) => {
    const socket = createConnection(socketPath);
    let response = "";
    socket.setEncoding("utf8");
    socket.on("connect", () => {
      socket.end(`${JSON.stringify({ token, request })}\n`);
    });
    socket.on("data", (chunk) => {
      response += chunk;
      if (response.length > 8_192) socket.destroy(new Error("INVENTORY_PILOT_BOOTSTRAP_RESPONSE_TOO_LARGE"));
    });
    socket.on("error", reject);
    socket.on("end", () => {
      try {
        const result = JSON.parse(response) as {
          ok?: boolean;
          error?: string;
          result?: { id: string; revisionNumber: number; configurationDigest: string };
        };
        if (!result.ok) throw new Error(result.error ?? "INVENTORY_PILOT_BOOTSTRAP_FAILED");
        resolve(result.result);
      } catch (error) {
        reject(error);
      }
    });
  });
}
