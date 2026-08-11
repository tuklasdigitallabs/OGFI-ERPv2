import { describe, expect, it, vi } from "vitest";
import {
  executeOpeningInventoryCommandCycle,
  openingInventoryExecutorConfiguration,
  type OpeningInventoryExecutorAdapter,
} from "./openingInventoryExecutor";

const runtimeUrl =
  "postgresql://ogfi_uat_runtime:runtime-secret@postgres:5432/ogfi_uat?schema=public";
const executorUrl =
  "postgresql://ogfi_uat_opening_stock_executor:executor-secret@postgres:5432/ogfi_uat?schema=public";

describe("opening inventory executor", () => {
  it("is disabled by default and requires an exact separate role contract when enabled", () => {
    expect(openingInventoryExecutorConfiguration({}).enabled).toBe(false);
    expect(() =>
      openingInventoryExecutorConfiguration({
        OPENING_INVENTORY_EXECUTOR_ENABLED: "true",
      }),
    ).toThrow("OPENING_INVENTORY_EXECUTOR_DEDICATED_CREDENTIAL_REQUIRED");
    expect(
      openingInventoryExecutorConfiguration({
        OPENING_INVENTORY_EXECUTOR_ENABLED: "true",
        DATABASE_URL: runtimeUrl,
        OPENING_STOCK_EXECUTOR_DATABASE_URL: executorUrl,
      }),
    ).toMatchObject({ enabled: true, pollIntervalMs: 2_000, batchSize: 5 });
    expect(() =>
      openingInventoryExecutorConfiguration({
        OPENING_INVENTORY_EXECUTOR_ENABLED: "true",
        DATABASE_URL: runtimeUrl,
        OPENING_STOCK_EXECUTOR_DATABASE_URL: executorUrl.replace(
          "opening_stock_executor",
          "migrator",
        ),
      }),
    ).toThrow("OPENING_INVENTORY_EXECUTOR_ROLE_CONTRACT_INVALID");
  });

  it("executes only discovered immutable command IDs and records bounded outcomes", async () => {
    const executeCommand = vi
      .fn<OpeningInventoryExecutorAdapter["executeCommand"]>()
      .mockResolvedValueOnce("SUCCEEDED")
      .mockResolvedValueOnce("FAILED_RETRYABLE")
      .mockResolvedValueOnce("FAILED_TERMINAL")
      .mockRejectedValueOnce(new Error("connection lost"));
    const adapter: OpeningInventoryExecutorAdapter = {
      listPendingCommandIds: vi
        .fn()
        .mockResolvedValue(["one", "two", "three", "four"]),
      executeCommand,
      disconnect: vi.fn(),
    };
    const logger = { log: vi.fn(), error: vi.fn() };

    await expect(
      executeOpeningInventoryCommandCycle(adapter, 4, logger),
    ).resolves.toEqual({
      discovered: 4,
      succeeded: 1,
      retryable: 1,
      terminal: 1,
      transportFailed: 1,
    });
    expect(adapter.listPendingCommandIds).toHaveBeenCalledWith(4);
    expect(executeCommand.mock.calls.flat()).toEqual([
      "one",
      "two",
      "three",
      "four",
    ]);
    expect(logger.error).toHaveBeenCalledWith(
      JSON.stringify({
        event: "OPENING_INVENTORY_EXECUTION_TRANSPORT_FAILED",
        commandId: "four",
      }),
    );
  });
});
