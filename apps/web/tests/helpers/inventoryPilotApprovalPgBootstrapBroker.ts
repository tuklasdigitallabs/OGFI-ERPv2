import { timingSafeEqual } from "node:crypto";
import { createServer } from "node:net";
import { prisma } from "@ogfi/database";
import {
  initializeInventoryPilotConfiguration,
  initializeOpeningInventoryPilotConfiguration,
  rollOverInventoryPilotConfiguration,
} from "./inventoryPilotApprovalPgFixtures";
import { createConfigurationV2SealedFixture } from "./inventoryPilotConfigurationV2SealedFixture";
import type { InventoryPilotBootstrapRequest } from "./inventoryPilotApprovalPgBootstrapClient";

const socketPath = process.env.OGFI_INVENTORY_PILOT_BOOTSTRAP_SOCKET;
const expectedToken = process.env.OGFI_INVENTORY_PILOT_BOOTSTRAP_TOKEN;
const expectedDatabase = process.env.OGFI_DISPOSABLE_DATABASE_EXPECTED_NAME;
const expectedRunId = process.env.OGFI_DISPOSABLE_DATABASE_RUN_ID;
const expectedNonceHash = process.env.OGFI_DISPOSABLE_DATABASE_NONCE_SHA256;
if (
  !socketPath ||
  !expectedToken ||
  !expectedDatabase ||
  !expectedRunId ||
  !expectedNonceHash
) {
  throw new Error("INVENTORY_PILOT_BOOTSTRAP_ENVIRONMENT_INCOMPLETE");
}

const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const commonRequestKeys = ["tenantId", "companyId", "actorUserId"] as const;
const approvalRequestKeys = [
  "sourceLocationId",
  "destinationLocationId",
  "sourceInventoryLocationId",
  "destinationInventoryLocationId",
  "itemId",
] as const;
const openingRequestKeys = [
  "tenantId",
  "companyId",
  "actorUserId",
  "locations",
  "itemIds",
] as const;
const openingFailureRequestKeys = ["targetInventoryLocationId"] as const;
const validActions = [
  "INITIALIZE",
  "ROLLOVER",
  "OPENING_INITIALIZE",
  "OPENING_INSTALL_INVENTORY_MOVEMENT_FAILURE",
  "CONFIGURATION_V2_SEALED",
] as const;

function tokenMatches(actual: unknown) {
  if (typeof actual !== "string") return false;
  const left = Buffer.from(actual);
  const right = Buffer.from(expectedToken);
  return left.length === right.length && timingSafeEqual(left, right);
}

function hasExactKeys(
  value: Record<string, unknown>,
  expectedKeys: readonly string[],
) {
  const actualKeys = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  return (
    actualKeys.length === expected.length &&
    actualKeys.every((key, index) => key === expected[index])
  );
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    Boolean(value) &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function validateRequest(value: unknown): InventoryPilotBootstrapRequest {
  if (!isPlainObject(value))
    throw new Error("INVENTORY_PILOT_BOOTSTRAP_REQUEST_INVALID");
  const request = value as InventoryPilotBootstrapRequest;
  if (!(validActions as readonly string[]).includes(request.action)) {
    throw new Error("INVENTORY_PILOT_BOOTSTRAP_ACTION_INVALID");
  }
  const expectedKeys =
    request.action === "INITIALIZE"
      ? ["action", ...commonRequestKeys, ...approvalRequestKeys]
      : request.action === "ROLLOVER"
        ? ["action", ...commonRequestKeys, ...approvalRequestKeys, "family"]
        : request.action === "OPENING_INITIALIZE"
          ? ["action", ...openingRequestKeys]
          : request.action === "OPENING_INSTALL_INVENTORY_MOVEMENT_FAILURE"
            ? ["action", ...openingFailureRequestKeys]
            : ["action"];
  if (!hasExactKeys(value, expectedKeys)) {
    throw new Error("INVENTORY_PILOT_BOOTSTRAP_REQUEST_KEYS_INVALID");
  }
  if (request.action === "CONFIGURATION_V2_SEALED") {
    return request;
  }
  if (request.action === "OPENING_INSTALL_INVENTORY_MOVEMENT_FAILURE") {
    if (!uuid.test(request.targetInventoryLocationId)) {
      throw new Error(
        "INVENTORY_PILOT_BOOTSTRAP_OPENING_FAILURE_TARGET_INVALID",
      );
    }
    return request;
  }
  for (const key of commonRequestKeys) {
    if (!uuid.test(request[key]))
      throw new Error(`INVENTORY_PILOT_BOOTSTRAP_${key.toUpperCase()}_INVALID`);
  }
  if (request.action === "OPENING_INITIALIZE") {
    if (
      !Array.isArray(request.locations) ||
      request.locations.length < 1 ||
      request.locations.length > 3
    ) {
      throw new Error("INVENTORY_PILOT_BOOTSTRAP_OPENING_LOCATION_INVALID");
    }
    const locationIds = new Set<string>();
    const inventoryLocationIds = new Set<string>();
    for (const location of request.locations) {
      if (
        !isPlainObject(location) ||
        !hasExactKeys(location, ["locationId", "inventoryLocationId"]) ||
        !uuid.test(location.locationId) ||
        !uuid.test(location.inventoryLocationId) ||
        locationIds.has(location.locationId) ||
        inventoryLocationIds.has(location.inventoryLocationId)
      ) {
        throw new Error("INVENTORY_PILOT_BOOTSTRAP_OPENING_LOCATION_INVALID");
      }
      locationIds.add(location.locationId);
      inventoryLocationIds.add(location.inventoryLocationId);
    }
    if (
      !Array.isArray(request.itemIds) ||
      request.itemIds.length < 1 ||
      request.itemIds.length > 100 ||
      new Set(request.itemIds).size !== request.itemIds.length ||
      request.itemIds.some((itemId) => !uuid.test(itemId))
    ) {
      throw new Error("INVENTORY_PILOT_BOOTSTRAP_OPENING_ITEMS_INVALID");
    }
  } else {
    for (const key of approvalRequestKeys) {
      if (!uuid.test(request[key]))
        throw new Error(
          `INVENTORY_PILOT_BOOTSTRAP_${key.toUpperCase()}_INVALID`,
        );
    }
  }
  if (
    request.action === "ROLLOVER" &&
    !(["InventoryTransfer", "StockCountAttemptReview"] as const).includes(
      request.family!,
    )
  ) {
    throw new Error("INVENTORY_PILOT_BOOTSTRAP_FAMILY_INVALID");
  }
  return request;
}

async function installOpeningInventoryMovementFailure(
  targetInventoryLocationId: string,
) {
  // The UUID is validated before interpolation. This broker runs only after the
  // disposable database marker has been verified, and is never started by a
  // production process.
  const target = targetInventoryLocationId.toLowerCase();
  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(
      'DROP TRIGGER IF EXISTS "ogfi_test_opening_inventory_movement_failure" ON public."InventoryMovement"',
    );
    await tx.$executeRawUnsafe(`
      CREATE OR REPLACE FUNCTION public.ogfi_test_opening_inventory_movement_failure()
      RETURNS trigger
      LANGUAGE plpgsql
      AS $function$
      BEGIN
        IF NEW."inventoryLocationId" = '${target}'::uuid THEN
          RAISE EXCEPTION 'OGFI_TEST_OPENING_INVENTORY_MOVEMENT_FAILURE'
            USING ERRCODE = 'P0001';
        END IF;
        RETURN NEW;
      END;
      $function$
    `);
    await tx.$executeRawUnsafe(`
      CREATE TRIGGER "ogfi_test_opening_inventory_movement_failure"
      BEFORE INSERT ON public."InventoryMovement"
      FOR EACH ROW
      EXECUTE FUNCTION public.ogfi_test_opening_inventory_movement_failure()
    `);
  });
}

await prisma.$connect();
const marker = await prisma.$queryRaw<
  Array<{
    databaseName: string;
    runId: string;
    nonceSha256: string;
  }>
>`
  SELECT database_name AS "databaseName", run_id AS "runId",
         nonce_sha256::text AS "nonceSha256"
    FROM ogfi_disposable_control.database_identity
   WHERE singleton = true
`;
if (
  marker.length !== 1 ||
  marker[0]!.databaseName !== expectedDatabase ||
  marker[0]!.runId !== expectedRunId ||
  marker[0]!.nonceSha256 !== expectedNonceHash
) {
  throw new Error("INVENTORY_PILOT_BOOTSTRAP_DATABASE_MARKER_MISMATCH");
}

let requestInProgress = false;
const server = createServer({ allowHalfOpen: true }, (socket) => {
  let body = "";
  socket.setEncoding("utf8");
  socket.on("data", (chunk) => {
    body += chunk;
    if (body.length > 16_384)
      socket.destroy(new Error("INVENTORY_PILOT_BOOTSTRAP_REQUEST_TOO_LARGE"));
  });
  socket.on("end", async () => {
    try {
      if (requestInProgress) throw new Error("INVENTORY_PILOT_BOOTSTRAP_BUSY");
      requestInProgress = true;
      const envelope = JSON.parse(body) as {
        token?: unknown;
        request?: unknown;
      };
      if (!tokenMatches(envelope.token))
        throw new Error("INVENTORY_PILOT_BOOTSTRAP_TOKEN_INVALID");
      const request = validateRequest(envelope.request);
      let result;
      if (request.action === "INITIALIZE") {
        await initializeInventoryPilotConfiguration({ db: prisma, ...request });
      } else if (request.action === "OPENING_INITIALIZE") {
        result = await initializeOpeningInventoryPilotConfiguration({
          db: prisma,
          ...request,
        });
      } else if (
        request.action === "OPENING_INSTALL_INVENTORY_MOVEMENT_FAILURE"
      ) {
        await installOpeningInventoryMovementFailure(
          request.targetInventoryLocationId,
        );
      } else if (request.action === "CONFIGURATION_V2_SEALED") {
        result = await createConfigurationV2SealedFixture();
      } else {
        await rollOverInventoryPilotConfiguration({
          db: prisma,
          ...request,
          family: request.family!,
        });
      }
      socket.end(JSON.stringify({ ok: true, result }));
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "INVENTORY_PILOT_BOOTSTRAP_FAILED";
      socket.end(JSON.stringify({ ok: false, error: message }));
    } finally {
      requestInProgress = false;
    }
  });
});

server.listen(socketPath, () => console.log("INVENTORY_PILOT_BOOTSTRAP_READY"));
const shutdown = () =>
  server.close(() => prisma.$disconnect().finally(() => process.exit(0)));
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
