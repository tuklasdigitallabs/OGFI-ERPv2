export function assertDisposableAuthorizationDatabaseConfigured(
  env: NodeJS.ProcessEnv,
) {
  if (env.AUTHORIZATION_DATABASE_INTEGRATION !== "yes") {
    throw new Error("AUTHORIZATION_DATABASE_SENTINEL_REQUIRED");
  }
  const databaseUrl = env.DATABASE_URL;
  const expectedDatabase = env.AUTHORIZATION_TEST_DATABASE;
  const runId = env.AUTHORIZATION_TEST_RUN_ID;
  const expectedHost = env.AUTHORIZATION_TEST_DATABASE_HOST;
  const expectedPort = env.AUTHORIZATION_TEST_DATABASE_PORT;
  const runtimeRole = env.AUTHORIZATION_TEST_RUNTIME_ROLE;
  const nonceSha256 = env.AUTHORIZATION_TEST_DATABASE_NONCE_SHA256;
  if (
    !databaseUrl ||
    !expectedDatabase ||
    !runId ||
    !expectedHost ||
    !expectedPort ||
    !runtimeRole ||
    !nonceSha256
  ) {
    throw new Error("AUTHORIZATION_TEST_DATABASE_IDENTITY_REQUIRED");
  }
  const parsed = new URL(databaseUrl);
  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
  const databaseIdentity =
    /^ogfi_test_([a-z0-9_]{1,24})_([a-f0-9]{16})$/.exec(databaseName);
  const runtimeIdentity =
    /^ogfi_test_([a-z0-9_]{1,10})_([a-f0-9]{32})_runtime$/.exec(runtimeRole);
  const runToken = runId
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 24);
  if (
    !["127.0.0.1", "localhost", "::1", "[::1]"].includes(parsed.hostname) ||
    parsed.hostname !== expectedHost ||
    (parsed.port || "5432") !== expectedPort ||
    databaseName !== expectedDatabase ||
    !databaseIdentity ||
    databaseIdentity[1] !== runToken ||
    /(?:^|_)(?:prod(?:uction)?|live|stag(?:e|ing)|shared|pilot|uat)(?:_|$)/i.test(
      databaseName,
    ) ||
    !runtimeIdentity ||
    runtimeIdentity[1] !== runToken.slice(0, 10) ||
    !runtimeIdentity[2]?.startsWith(databaseIdentity[2] ?? "") ||
    decodeURIComponent(parsed.username) !== runtimeRole ||
    !/^[A-Za-z0-9._-]{6,128}$/.test(runId) ||
    !/^[a-f0-9]{64}$/.test(nonceSha256) ||
    forbiddenCredentialPresent(env)
  ) {
    throw new Error("AUTHORIZATION_DATABASE_NOT_DISPOSABLE");
  }
  return expectedDatabase;
}

type DisposableDatabaseProbe = {
  $queryRawUnsafe(query: string): Promise<unknown>;
};

export async function assertDisposableAuthorizationDatabaseMarker(
  prisma: DisposableDatabaseProbe,
  env: NodeJS.ProcessEnv,
) {
  const expectedDatabase = assertDisposableAuthorizationDatabaseConfigured(env);
  const rows = (await prisma.$queryRawUnsafe(`
    SELECT
      current_database()::text AS "currentDatabase",
      current_user::text AS "currentUser",
      session_user::text AS "sessionUser",
      marker.database_name AS "databaseName",
      marker.run_id AS "runId",
      marker.nonce_sha256 AS "nonceSha256"
    FROM ogfi_disposable_control.verify_database_identity() AS marker
  `)) as Array<{
      currentDatabase: string;
      currentUser: string;
      databaseName: string | null;
      nonceSha256: string | null;
      runId: string | null;
      sessionUser: string;
    }>;
  const row = rows[0];
  if (
    rows.length !== 1 ||
    !row ||
    row.currentDatabase !== expectedDatabase ||
    row.currentUser !== env.AUTHORIZATION_TEST_RUNTIME_ROLE ||
    row.sessionUser !== env.AUTHORIZATION_TEST_RUNTIME_ROLE ||
    row.databaseName !== expectedDatabase ||
    row.runId !== env.AUTHORIZATION_TEST_RUN_ID ||
    row.nonceSha256 !== env.AUTHORIZATION_TEST_DATABASE_NONCE_SHA256
  ) {
    throw new Error("AUTHORIZATION_DATABASE_MARKER_MISMATCH");
  }
  return expectedDatabase;
}

function forbiddenCredentialPresent(env: NodeJS.ProcessEnv) {
  return Object.entries(env).some(
    ([key, value]) =>
      Boolean(value) &&
      key !== "DATABASE_URL" &&
      ([
        "DATABASE_URL_FILE",
        "DIRECT_DATABASE_URL",
        "DIRECT_DATABASE_URL_FILE",
        "DISPOSABLE_DATABASE_ADMIN_URL",
        "OGFI_DISPOSABLE_DATABASE_CONFIRMATION",
        "OGFI_DISPOSABLE_DATABASE_NONCE",
      ].includes(key) ||
        (/(?:DATABASE|POSTGRES)/i.test(key) &&
          /(?:URL|URI|DSN|CONNECTION|PASSWORD|SECRET|TOKEN|CREDENTIAL|FILE)/i.test(key)) ||
        (/DISPOSABLE/i.test(key) && /(?:NONCE|CONFIRMATION)/i.test(key)) ||
        /^POSTGRES/i.test(key) ||
        /^PG/i.test(key) ||
        (/(?:ADMIN|MIGRAT|OWNER|SETUP)/i.test(key) &&
          /(?:PASSWORD|SECRET|TOKEN|CREDENTIAL|URL|URI|DSN|CONNECTION|FILE)/i.test(key)) ||
        (/(?:ADMIN|MIGRAT|OWNER|SETUP)/i.test(key) &&
          /DATABASE|POSTGRES/i.test(key))),
  );
}
