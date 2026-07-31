import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parseConnection, postgresProcessEnvironment } from "./database-role-contract-lib.mjs";
import { requirePostgresTool } from "./postgres-client-tools.mjs";

const commandUuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function openingStockExecutorPlan(args = process.argv.slice(2), env = process.env) {
  if (args.length !== 1 || !commandUuidPattern.test(args[0] ?? "")) {
    throw new Error("Opening-stock executor requires exactly one immutable execution-command UUID.");
  }
  const appEnvironment = env.APP_ENV;
  const expectedPrefix = appEnvironment === "production"
    ? "ogfi_prod"
    : appEnvironment === "staging"
      ? "ogfi_stg"
      : null;
  if (!expectedPrefix) throw new Error("APP_ENV must be production or staging for the opening-stock executor.");
  const url = env.OPENING_STOCK_EXECUTOR_DATABASE_URL;
  if (!url) throw new Error("OPENING_STOCK_EXECUTOR_DATABASE_URL is required for the opening-stock executor.");
  if (env.DATABASE_URL === url || env.MIGRATION_DATABASE_URL === url) {
    throw new Error("Opening-stock executor must use a distinct dedicated database credential.");
  }
  const connection = parseConnection(url, "opening-stock executor");
  const expectedRole = `${expectedPrefix}_opening_stock_executor`;
  if (connection.username !== expectedRole) {
    throw new Error(`Opening-stock executor credential username must be ${expectedRole}.`);
  }
  if (env.OGFI_DATABASE_NAME && connection.databaseName !== env.OGFI_DATABASE_NAME) {
    throw new Error("Opening-stock executor credential targets an unexpected database.");
  }
  if (connection.schema !== "public") throw new Error("Opening-stock executor credential must use the reviewed public schema.");
  return {
    commandId: args[0].toLowerCase(),
    connection,
    statement: `SELECT public.execute_opening_inventory_command('${args[0].toLowerCase()}'::uuid);`,
  };
}

export function executeOpeningStockCommand(plan, { psql, spawn = spawnSync } = {}) {
  const executable = psql ?? requirePostgresTool("psql", "inventory:opening-stock:execute");
  const result = spawn(executable, ["--no-psqlrc", "--set=ON_ERROR_STOP=1", "--quiet", "--tuples-only", "--no-align", "--command", plan.statement], {
    encoding: "utf8",
    env: postgresProcessEnvironment(plan.connection, {
      PATH: process.env.PATH,
      LANG: process.env.LANG,
      LC_ALL: process.env.LC_ALL,
      TZ: process.env.TZ,
    }),
    maxBuffer: 1024 * 1024,
  });
  if (result.error || result.status !== 0 || String(result.stdout ?? "").trim() !== "SUCCEEDED") {
    throw new Error("OPENING_STOCK_EXECUTOR_COMMAND_FAILED");
  }
  return { commandId: plan.commandId, result: "EXECUTED" };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    const outcome = executeOpeningStockCommand(openingStockExecutorPlan());
    console.log(`OPENING_STOCK_EXECUTOR_COMMAND_PASS | ${outcome.commandId}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : "OPENING_STOCK_EXECUTOR_COMMAND_FAILED");
    process.exitCode = 1;
  }
}
