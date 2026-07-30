import { timingSafeEqual } from "node:crypto";
import { createServer } from "node:net";
import { prisma } from "@ogfi/database";
import {
  initializeInventoryPilotConfiguration,
  rollOverInventoryPilotConfiguration,
} from "./inventoryPilotApprovalPgFixtures";
import type { InventoryPilotBootstrapRequest } from "./inventoryPilotApprovalPgBootstrapClient";

const socketPath = process.env.OGFI_INVENTORY_PILOT_BOOTSTRAP_SOCKET;
const expectedToken = process.env.OGFI_INVENTORY_PILOT_BOOTSTRAP_TOKEN;
const expectedDatabase = process.env.OGFI_DISPOSABLE_DATABASE_EXPECTED_NAME;
const expectedRunId = process.env.OGFI_DISPOSABLE_DATABASE_RUN_ID;
const expectedNonceHash = process.env.OGFI_DISPOSABLE_DATABASE_NONCE_SHA256;
if (!socketPath || !expectedToken || !expectedDatabase || !expectedRunId || !expectedNonceHash) {
  throw new Error("INVENTORY_PILOT_BOOTSTRAP_ENVIRONMENT_INCOMPLETE");
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const requestKeys = [
  "tenantId", "companyId", "actorUserId", "sourceLocationId",
  "destinationLocationId", "sourceInventoryLocationId",
  "destinationInventoryLocationId", "itemId",
] as const;

function tokenMatches(actual: unknown) {
  if (typeof actual !== "string") return false;
  const left = Buffer.from(actual);
  const right = Buffer.from(expectedToken);
  return left.length === right.length && timingSafeEqual(left, right);
}

function validateRequest(value: unknown): InventoryPilotBootstrapRequest {
  if (!value || typeof value !== "object") throw new Error("INVENTORY_PILOT_BOOTSTRAP_REQUEST_INVALID");
  const request = value as InventoryPilotBootstrapRequest;
  if (!(["INITIALIZE", "ROLLOVER"] as const).includes(request.action)) {
    throw new Error("INVENTORY_PILOT_BOOTSTRAP_ACTION_INVALID");
  }
  for (const key of requestKeys) {
    if (!uuid.test(request[key])) throw new Error(`INVENTORY_PILOT_BOOTSTRAP_${key.toUpperCase()}_INVALID`);
  }
  if (request.action === "ROLLOVER" && !(["InventoryTransfer", "StockCountAttemptReview"] as const).includes(request.family!)) {
    throw new Error("INVENTORY_PILOT_BOOTSTRAP_FAMILY_INVALID");
  }
  return request;
}

await prisma.$connect();
const marker = await prisma.$queryRaw<Array<{
  databaseName: string;
  runId: string;
  nonceSha256: string;
}>>`
  SELECT database_name AS "databaseName", run_id AS "runId",
         nonce_sha256::text AS "nonceSha256"
    FROM ogfi_disposable_control.database_identity
   WHERE singleton = true
`;
if (
  marker.length !== 1 || marker[0]!.databaseName !== expectedDatabase ||
  marker[0]!.runId !== expectedRunId || marker[0]!.nonceSha256 !== expectedNonceHash
) {
  throw new Error("INVENTORY_PILOT_BOOTSTRAP_DATABASE_MARKER_MISMATCH");
}

let requestInProgress = false;
const server = createServer({ allowHalfOpen: true }, (socket) => {
  let body = "";
  socket.setEncoding("utf8");
  socket.on("data", (chunk) => {
    body += chunk;
    if (body.length > 16_384) socket.destroy(new Error("INVENTORY_PILOT_BOOTSTRAP_REQUEST_TOO_LARGE"));
  });
  socket.on("end", async () => {
    try {
      if (requestInProgress) throw new Error("INVENTORY_PILOT_BOOTSTRAP_BUSY");
      requestInProgress = true;
      const envelope = JSON.parse(body) as { token?: unknown; request?: unknown };
      if (!tokenMatches(envelope.token)) throw new Error("INVENTORY_PILOT_BOOTSTRAP_TOKEN_INVALID");
      const request = validateRequest(envelope.request);
      if (request.action === "INITIALIZE") {
        await initializeInventoryPilotConfiguration({ db: prisma, ...request });
      } else {
        await rollOverInventoryPilotConfiguration({ db: prisma, ...request, family: request.family! });
      }
      socket.end('{"ok":true}');
    } catch (error) {
      const message = error instanceof Error ? error.message : "INVENTORY_PILOT_BOOTSTRAP_FAILED";
      socket.end(JSON.stringify({ ok: false, error: message }));
    } finally {
      requestInProgress = false;
    }
  });
});

server.listen(socketPath, () => console.log("INVENTORY_PILOT_BOOTSTRAP_READY"));
const shutdown = () => server.close(() => prisma.$disconnect().finally(() => process.exit(0)));
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
