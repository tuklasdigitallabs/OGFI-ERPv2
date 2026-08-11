import { Queue } from "bullmq";
import { getWorkerHealth } from "./health";
import {
  createOpeningInventoryExecutorAdapter,
  openingInventoryExecutorConfiguration,
  startOpeningInventoryExecutor,
} from "./openingInventoryExecutor";

const redisUrl = process.env.REDIS_URL;

export function createNotificationQueue() {
  if (!redisUrl) {
    return null;
  }

  const url = new URL(redisUrl);
  return new Queue("notifications", {
    connection: {
      host: url.hostname,
      port: Number(url.port || 6379),
    },
  });
}

export function startWorker() {
  const configuration = openingInventoryExecutorConfiguration();
  const stopExecutor = configuration.enabled
    ? startOpeningInventoryExecutor(
        configuration,
        createOpeningInventoryExecutorAdapter(
          configuration.executorDatabaseUrl!,
        ),
      )
    : async () => undefined;
  console.log(JSON.stringify(getWorkerHealth()));
  return async () => {
    await stopExecutor();
  };
}

if (process.env.NODE_ENV !== "test") {
  const stop = startWorker();
  let stopping = false;
  const shutdown = () => {
    if (stopping) return;
    stopping = true;
    void stop().finally(() => process.exit(0));
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}
