import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { prisma } from "./client";
import {
  assertDisposableTestDatabaseMarker,
  identifyDisposableTestDatabase,
  type DisposableDatabaseMarkerRow,
} from "./disposable-demo-database";

const runDatabaseTest =
  process.env.OGFI_RUN_SEED_REPEATABILITY_TEST === "true";
const packageDirectory = fileURLToPath(new URL("..", import.meta.url));
const tsxCli = fileURLToPath(
  new URL("../node_modules/tsx/dist/cli.mjs", import.meta.url),
);

async function protectedSnapshot() {
  const [auditEvents, projectActivityEvents, inventoryMovements, balances] =
    await Promise.all([
      prisma.auditEvent.findMany({ orderBy: { id: "asc" } }),
      prisma.projectActivityEvent.findMany({ orderBy: { id: "asc" } }),
      prisma.inventoryMovement.findMany({ orderBy: { id: "asc" } }),
      prisma.inventoryBalance.findMany({ orderBy: { id: "asc" } }),
    ]);

  return JSON.stringify(
    { auditEvents, projectActivityEvents, inventoryMovements, balances },
    (_key, value) =>
      typeof value === "object" &&
      value !== null &&
      "toJSON" in value &&
      typeof value.toJSON === "function"
        ? value.toJSON()
        : value,
  );
}

function runSeed() {
  const result = spawnSync(process.execPath, [tsxCli, "src/seed.ts"], {
    cwd: packageDirectory,
    env: process.env,
    encoding: "utf8",
  });

  expect(result.status, result.stderr || result.stdout).toBe(0);
}

describe.runIf(runDatabaseTest)("database seed repeatability", () => {
  test("each repeated seed preserves the initial seeded state", async () => {
    const identity = identifyDisposableTestDatabase(process.env.DATABASE_URL);
    const markerRows = await prisma.$queryRaw<DisposableDatabaseMarkerRow[]>`
      SELECT database_name, run_id, nonce_sha256
      FROM ogfi_disposable_control.verify_database_identity()
    `;
    assertDisposableTestDatabaseMarker(process.env, identity, markerRows);

    const seededBaseline = await protectedSnapshot();

    runSeed();
    const afterFirstRepeat = await protectedSnapshot();
    expect(afterFirstRepeat).toBe(seededBaseline);

    runSeed();
    const afterSecondRepeat = await protectedSnapshot();
    expect(afterSecondRepeat).toBe(seededBaseline);

    const duplicateMovements = await prisma.inventoryMovement.groupBy({
      by: [
        "tenantId",
        "companyId",
        "sourceDocumentType",
        "sourceDocumentId",
        "sourceEventKey",
      ],
      _count: { _all: true },
      having: { id: { _count: { gt: 1 } } },
    });
    expect(duplicateMovements).toEqual([]);
  }, 120_000);
});
