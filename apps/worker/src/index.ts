import { Queue } from "bullmq";
import { getWorkerHealth } from "./health";

const redisUrl = process.env.REDIS_URL;

export function createNotificationQueue() {
  if (!redisUrl) {
    return null;
  }

  const url = new URL(redisUrl);
  return new Queue("notifications", {
    connection: {
      host: url.hostname,
      port: Number(url.port || 6379)
    }
  });
}

if (process.env.NODE_ENV !== "test") {
  console.log(JSON.stringify(getWorkerHealth()));
}
