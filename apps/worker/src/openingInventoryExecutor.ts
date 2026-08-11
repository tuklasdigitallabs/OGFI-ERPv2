import { Prisma, PrismaClient, prisma } from "@ogfi/database";

const commandStatuses = ["PENDING", "FAILED_RETRYABLE"] as const;
const commandResultValues = [
  "SUCCEEDED",
  "FAILED_RETRYABLE",
  "FAILED_TERMINAL",
] as const;

type CommandResult = (typeof commandResultValues)[number];

export type OpeningInventoryExecutorConfiguration = {
  enabled: boolean;
  pollIntervalMs: number;
  batchSize: number;
  executorDatabaseUrl: string | undefined;
};

export type OpeningInventoryExecutorAdapter = {
  listPendingCommandIds(batchSize: number): Promise<string[]>;
  executeCommand(commandId: string): Promise<CommandResult>;
  disconnect(): Promise<void>;
};

type WorkerLogger = Pick<Console, "log" | "error">;

function boundedInteger(
  rawValue: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
) {
  if (rawValue === undefined || rawValue === "") return fallback;
  const parsed = Number(rawValue);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error("OPENING_INVENTORY_EXECUTOR_CONFIGURATION_INVALID");
  }
  return parsed;
}

function parsedDatabaseIdentity(rawUrl: string, label: string) {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error(`OPENING_INVENTORY_EXECUTOR_${label}_DATABASE_URL_INVALID`);
  }
  if (!["postgres:", "postgresql:"].includes(parsed.protocol)) {
    throw new Error(`OPENING_INVENTORY_EXECUTOR_${label}_DATABASE_URL_INVALID`);
  }
  const databaseName = parsed.pathname.replace(/^\//, "");
  const schema = parsed.searchParams.get("schema") ?? "public";
  if (
    !parsed.hostname ||
    !parsed.username ||
    !databaseName ||
    schema !== "public"
  ) {
    throw new Error(`OPENING_INVENTORY_EXECUTOR_${label}_DATABASE_URL_INVALID`);
  }
  return {
    hostname: parsed.hostname,
    port: parsed.port || "5432",
    databaseName,
    username: decodeURIComponent(parsed.username),
  };
}

export function openingInventoryExecutorConfiguration(
  environment: NodeJS.ProcessEnv = process.env,
): OpeningInventoryExecutorConfiguration {
  const enabled = environment.OPENING_INVENTORY_EXECUTOR_ENABLED === "true";
  const configuration = {
    enabled,
    pollIntervalMs: boundedInteger(
      environment.OPENING_INVENTORY_EXECUTOR_POLL_INTERVAL_MS,
      2_000,
      500,
      60_000,
    ),
    batchSize: boundedInteger(
      environment.OPENING_INVENTORY_EXECUTOR_BATCH_SIZE,
      5,
      1,
      25,
    ),
    executorDatabaseUrl:
      environment.OPENING_STOCK_EXECUTOR_DATABASE_URL ??
      environment.OGFI_LOCAL_UAT_OPENING_STOCK_EXECUTOR_DATABASE_URL,
  };
  if (!enabled) return configuration;

  const runtimeUrl = environment.DATABASE_URL;
  if (
    !runtimeUrl ||
    !configuration.executorDatabaseUrl ||
    runtimeUrl === configuration.executorDatabaseUrl
  ) {
    throw new Error("OPENING_INVENTORY_EXECUTOR_DEDICATED_CREDENTIAL_REQUIRED");
  }
  const runtime = parsedDatabaseIdentity(runtimeUrl, "RUNTIME");
  const executor = parsedDatabaseIdentity(
    configuration.executorDatabaseUrl,
    "DEDICATED",
  );
  const runtimePrefix = runtime.username.match(/^(.+)_runtime$/)?.[1];
  if (
    !runtimePrefix ||
    executor.username !== `${runtimePrefix}_opening_stock_executor` ||
    runtime.hostname !== executor.hostname ||
    runtime.port !== executor.port ||
    runtime.databaseName !== executor.databaseName
  ) {
    throw new Error("OPENING_INVENTORY_EXECUTOR_ROLE_CONTRACT_INVALID");
  }
  return configuration;
}

export function createOpeningInventoryExecutorAdapter(
  executorDatabaseUrl: string,
  runtimeClient = prisma,
): OpeningInventoryExecutorAdapter {
  const executorClient = new PrismaClient({
    datasourceUrl: executorDatabaseUrl,
  });
  return {
    async listPendingCommandIds(batchSize) {
      const commands =
        await runtimeClient.openingInventoryExecutionCommand.findMany({
          where: { status: { in: [...commandStatuses] } },
          select: { id: true },
          orderBy: [{ requestedAt: "asc" }, { id: "asc" }],
          take: batchSize,
        });
      return commands.map((command) => command.id);
    },
    async executeCommand(commandId) {
      const rows = await executorClient.$queryRaw<{ result: string }[]>(
        Prisma.sql`SELECT public.execute_opening_inventory_command(${commandId}::uuid) AS result`,
      );
      const result = rows[0]?.result;
      if (!commandResultValues.includes(result as CommandResult)) {
        throw new Error("OPENING_INVENTORY_EXECUTOR_RESULT_INVALID");
      }
      return result as CommandResult;
    },
    async disconnect() {
      await Promise.all([
        runtimeClient.$disconnect(),
        executorClient.$disconnect(),
      ]);
    },
  };
}

export async function executeOpeningInventoryCommandCycle(
  adapter: OpeningInventoryExecutorAdapter,
  batchSize: number,
  logger: WorkerLogger = console,
) {
  const commandIds = await adapter.listPendingCommandIds(batchSize);
  const summary = {
    discovered: commandIds.length,
    succeeded: 0,
    retryable: 0,
    terminal: 0,
    transportFailed: 0,
  };
  for (const commandId of commandIds) {
    try {
      const result = await adapter.executeCommand(commandId);
      if (result === "SUCCEEDED") summary.succeeded += 1;
      if (result === "FAILED_RETRYABLE") summary.retryable += 1;
      if (result === "FAILED_TERMINAL") summary.terminal += 1;
      logger.log(
        JSON.stringify({
          event: "OPENING_INVENTORY_EXECUTION_COMMAND_COMPLETED",
          commandId,
          result,
        }),
      );
    } catch {
      summary.transportFailed += 1;
      logger.error(
        JSON.stringify({
          event: "OPENING_INVENTORY_EXECUTION_TRANSPORT_FAILED",
          commandId,
        }),
      );
    }
  }
  return summary;
}

export function startOpeningInventoryExecutor(
  configuration: OpeningInventoryExecutorConfiguration,
  adapter: OpeningInventoryExecutorAdapter,
  logger: WorkerLogger = console,
) {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const schedule = () => {
    if (!stopped) timer = setTimeout(runCycle, configuration.pollIntervalMs);
  };
  const runCycle = async () => {
    try {
      await executeOpeningInventoryCommandCycle(
        adapter,
        configuration.batchSize,
        logger,
      );
    } catch {
      logger.error(
        JSON.stringify({ event: "OPENING_INVENTORY_EXECUTOR_POLL_FAILED" }),
      );
    } finally {
      schedule();
    }
  };

  void runCycle();
  return async () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    await adapter.disconnect();
  };
}
