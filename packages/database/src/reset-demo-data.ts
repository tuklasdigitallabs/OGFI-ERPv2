import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import {
  assertDisposableDemoDatabase,
  assertDisposableDemoRoleContract,
  buildDatabaseUrlChildEnvironment,
  buildPostgresChildEnvironment,
  verifyDisposableDatabaseMarker,
} from "./disposable-demo-database";

const identity = assertDisposableDemoDatabase(process.env);
const roleContract = assertDisposableDemoRoleContract(process.env, identity);
const packageDirectory = fileURLToPath(new URL("..", import.meta.url));
const workspaceRoot = fileURLToPath(new URL("../../..", import.meta.url));
const roleSqlDirectory = path.join(
  workspaceRoot,
  "infra",
  "hostinger",
  "postgres",
);
const prismaCli = fileURLToPath(
  new URL("../node_modules/prisma/build/index.js", import.meta.url),
);
const tsxCli = fileURLToPath(
  new URL("../node_modules/tsx/dist/cli.mjs", import.meta.url),
);
const adminDatabaseUrl = process.env.DEMO_RESET_ADMIN_DATABASE_URL;

if (!adminDatabaseUrl) {
  throw new Error("DEMO_RESET_ADMIN_URL_REQUIRED");
}

await verifyDisposableDatabaseMarker(process.env, identity);
await verifyMigratorOwnerSession();

const rebuild = spawnSync(
  process.execPath,
  [prismaCli, "migrate", "reset", "--force", "--skip-seed"],
  {
    cwd: packageDirectory,
    env: buildDatabaseUrlChildEnvironment(
      process.env,
      roleContract.migratorDatabaseUrl,
      true,
    ),
    stdio: "inherit",
  },
);
if (rebuild.status !== 0) {
  throw new Error("DEMO_RESET_DATABASE_REBUILD_FAILED");
}

await verifyDisposableDatabaseMarker(process.env, identity);
reconcileRoleContract();
verifyRoleContract(roleContract.migratorDatabaseUrl, "owner");
verifyRoleContract(roleContract.runtimeDatabaseUrl, "runtime");

const seedEnvironment = buildDatabaseUrlChildEnvironment(
  process.env,
  roleContract.runtimeDatabaseUrl,
);

const seed = spawnSync(process.execPath, [tsxCli, "src/seed.ts"], {
  cwd: packageDirectory,
  env: seedEnvironment,
  stdio: "inherit",
});
if (seed.status !== 0) {
  throw new Error("DEMO_RESET_SEED_FAILED");
}
verifyRoleContract(roleContract.runtimeDatabaseUrl, "runtime");

console.log(
  `Rebuilt and seeded disposable demo database ${identity.databaseName}.`,
);

export {};

async function verifyMigratorOwnerSession() {
  const migrator = new PrismaClient({
    datasourceUrl: roleContract.migratorDatabaseUrl,
  });
  try {
    const rows = await migrator.$queryRaw<
      Array<{ currentUser: string; sessionUser: string }>
    >`SELECT current_user::text AS "currentUser", session_user::text AS "sessionUser"`;
    if (
      rows.length !== 1 ||
      rows[0]?.sessionUser !== roleContract.migratorRole ||
      rows[0]?.currentUser !== roleContract.ownerRole
    ) {
      throw new Error("DEMO_RESET_MIGRATOR_OWNER_SESSION_MISMATCH");
    }
  } finally {
    await migrator.$disconnect();
  }
}

function reconcileRoleContract() {
  runPsqlFile(
    roleContract.migratorDatabaseUrl,
    path.join(roleSqlDirectory, "reconcile-ownership-and-grants.sql"),
    roleVariables(),
  );
}

function verifyRoleContract(databaseUrl: string, verificationMode: "owner" | "runtime") {
  runPsqlFile(
    databaseUrl,
    path.join(roleSqlDirectory, "verify-role-contract.sql"),
    { verification_mode: verificationMode, ...roleVariables() },
  );
}

function roleVariables() {
  return {
    database_name: roleContract.databaseName,
    owner_role: roleContract.ownerRole,
    migrator_role: roleContract.migratorRole,
    runtime_role: roleContract.runtimeRole,
  };
}

function runPsqlFile(
  databaseUrl: string,
  file: string,
  variables: Record<string, string>,
) {
  const psql = process.env.PSQL_BIN ?? "psql";
  const args = ["-X", "-v", "ON_ERROR_STOP=1"];
  for (const [key, value] of Object.entries(variables)) {
    args.push("-v", `${key}=${value}`);
  }
  args.push("-f", file);
  const result = spawnSync(psql, args, {
    cwd: workspaceRoot,
    encoding: "utf8",
    env: buildPostgresChildEnvironment(process.env, databaseUrl),
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error("DEMO_RESET_ROLE_CONTRACT_RECONCILIATION_FAILED");
  }
}
