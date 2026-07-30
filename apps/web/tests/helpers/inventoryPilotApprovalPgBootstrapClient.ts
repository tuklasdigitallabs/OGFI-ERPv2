import { createConnection } from "node:net";

export type InventoryPilotBootstrapRequest = {
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

export async function requestInventoryPilotBootstrap(
  request: InventoryPilotBootstrapRequest,
) {
  const socketPath = process.env.OGFI_INVENTORY_PILOT_BOOTSTRAP_SOCKET;
  const token = process.env.OGFI_INVENTORY_PILOT_BOOTSTRAP_TOKEN;
  if (!socketPath || !token) {
    throw new Error("INVENTORY_PILOT_DISPOSABLE_BOOTSTRAP_UNAVAILABLE");
  }

  await new Promise<void>((resolve, reject) => {
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
        const result = JSON.parse(response) as { ok?: boolean; error?: string };
        if (!result.ok) throw new Error(result.error ?? "INVENTORY_PILOT_BOOTSTRAP_FAILED");
        resolve();
      } catch (error) {
        reject(error);
      }
    });
  });
}
