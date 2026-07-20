export function getWorkerHealth() {
  return {
    status: "ok",
    service: "worker",
    checks: {
      redisUrlConfigured: Boolean(process.env.REDIS_URL),
      databaseUrlConfigured: Boolean(process.env.DATABASE_URL)
    }
  };
}
