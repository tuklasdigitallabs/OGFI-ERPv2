import assert from "node:assert/strict";
import test from "node:test";
import { executeOpeningStockCommand, openingStockExecutorPlan } from "./execute-opening-stock-command.mjs";

const commandId = "018f1be3-a5cc-7cc6-8ef0-6579d117eff4";
const baseEnv = {
  APP_ENV: "staging",
  OGFI_DATABASE_NAME: "ogfi_erp_staging",
  OPENING_STOCK_EXECUTOR_DATABASE_URL: "postgresql://ogfi_stg_opening_stock_executor:secret@127.0.0.1:5432/ogfi_erp_staging?schema=public",
};

test("opening-stock executor accepts only one UUID and its dedicated executor credential", () => {
  const plan = openingStockExecutorPlan([commandId], baseEnv);
  assert.equal(plan.commandId, commandId);
  assert.match(plan.statement, /execute_opening_inventory_command/);
  assert.throws(() => openingStockExecutorPlan([], baseEnv), /exactly one immutable/);
  assert.throws(() => openingStockExecutorPlan([commandId, commandId], baseEnv), /exactly one immutable/);
  assert.throws(() => openingStockExecutorPlan(["not-a-uuid"], baseEnv), /exactly one immutable/);
  assert.throws(() => openingStockExecutorPlan([commandId], { ...baseEnv, OPENING_STOCK_EXECUTOR_DATABASE_URL: baseEnv.OPENING_STOCK_EXECUTOR_DATABASE_URL.replace("opening_stock_executor", "runtime") }), /username must be/);
});

test("opening-stock executor exposes no quantity, scope, actor, or status input", () => {
  const plan = openingStockExecutorPlan([commandId], baseEnv);
  let received;
  const outcome = executeOpeningStockCommand(plan, {
    psql: "psql",
    spawn(_command, args, options) {
      received = { args, options };
      return { status: 0, stdout: "SUCCEEDED\n", stderr: "" };
    },
  });
  assert.deepEqual(outcome, { commandId, result: "EXECUTED" });
  assert.equal(received.args.filter((value) => value === "--command").length, 1);
  assert.equal(received.args.at(-1), plan.statement);
  assert.equal(received.options.env.PGUSER, "ogfi_stg_opening_stock_executor");
  assert.equal(received.options.env.DATABASE_URL, undefined);
  assert.throws(() => executeOpeningStockCommand(plan, {
    psql: "psql",
    spawn() { return { status: 0, stdout: "FAILED_TERMINAL\n", stderr: "" }; },
  }), /OPENING_STOCK_EXECUTOR_COMMAND_FAILED/);
});
