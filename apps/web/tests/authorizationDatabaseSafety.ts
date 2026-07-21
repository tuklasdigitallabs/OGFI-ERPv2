export function assertDisposableAuthorizationDatabaseConfigured(
  env: NodeJS.ProcessEnv,
) {
  if (env.AUTHORIZATION_DATABASE_INTEGRATION !== "yes") {
    throw new Error("AUTHORIZATION_DATABASE_SENTINEL_REQUIRED");
  }
  const databaseUrl = env.DATABASE_URL;
  const expectedDatabase = env.AUTHORIZATION_TEST_DATABASE;
  const runId = env.AUTHORIZATION_TEST_RUN_ID;
  if (!databaseUrl || !expectedDatabase || !runId) {
    throw new Error("AUTHORIZATION_TEST_DATABASE_IDENTITY_REQUIRED");
  }
  const parsed = new URL(databaseUrl);
  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
  if (
    !["127.0.0.1", "localhost", "::1"].includes(parsed.hostname) ||
    databaseName !== expectedDatabase ||
    !/(test|ci|authz)/i.test(databaseName) ||
    !/^[A-Za-z0-9._-]{6,128}$/.test(runId)
  ) {
    throw new Error("AUTHORIZATION_DATABASE_NOT_DISPOSABLE");
  }
  return expectedDatabase;
}
