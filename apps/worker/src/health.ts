export function getWorkerHealth(environment: NodeJS.ProcessEnv = process.env) {
  return {
    status: "ok",
    service: "worker",
    checks: {
      redisUrlConfigured: Boolean(environment.REDIS_URL),
      databaseUrlConfigured: Boolean(environment.DATABASE_URL),
      openingInventoryExecutorEnabled:
        environment.OPENING_INVENTORY_EXECUTOR_ENABLED === "true",
      openingStockExecutorCredentialConfigured: Boolean(
        environment.OPENING_STOCK_EXECUTOR_DATABASE_URL ??
        environment.OGFI_LOCAL_UAT_OPENING_STOCK_EXECUTOR_DATABASE_URL,
      ),
    },
  };
}
