import { prisma } from "@ogfi/database";

const now = new Date();
let graceMinutes: number;

try {
  graceMinutes = integerEnvironment(
    "AUTHORIZATION_DENIAL_HEALTH_GRACE_MINUTES",
    5,
    1,
    60
  );
} catch {
  console.error(JSON.stringify({
    event: "authorization_denial_finalizer_health",
    status: "CRITICAL",
    code: "AUTHORIZATION_DENIAL_HEALTH_CONFIG_INVALID",
    checkedAt: now.toISOString()
  }));
  process.exit(1);
}

const overdueBefore = new Date(now.getTime() - graceMinutes * 60_000);

try {
  const rows = await prisma.$queryRaw<Array<{ windowEndsAt: Date }>>`
    SELECT "windowEndsAt"
      FROM "AuthorizationDenialBucket"
     WHERE "finalizedAt" IS NULL
       AND "windowEndsAt" <= ${overdueBefore}
     ORDER BY "windowEndsAt", "id"
     LIMIT 1`;
  const overdue = rows[0];
  if (overdue) {
    console.error(JSON.stringify({
      event: "authorization_denial_finalizer_health",
      status: "CRITICAL",
      code: "AUTHORIZATION_DENIAL_BUCKET_OVERDUE",
      checkedAt: now.toISOString(),
      graceMinutes,
      oldestOverdueWindowEndedAt: overdue.windowEndsAt.toISOString()
    }));
    process.exitCode = 1;
  } else {
    console.log(JSON.stringify({
      event: "authorization_denial_finalizer_health",
      status: "OK",
      checkedAt: now.toISOString(),
      graceMinutes
    }));
  }
} catch {
  console.error(JSON.stringify({
    event: "authorization_denial_finalizer_health",
    status: "CRITICAL",
    code: "AUTHORIZATION_DENIAL_HEALTH_QUERY_FAILED",
    checkedAt: now.toISOString(),
    graceMinutes
  }));
  process.exitCode = 1;
}

function integerEnvironment(
  name: string,
  fallback: number,
  minimum: number,
  maximum: number
) {
  const raw = process.env[name];
  const value = raw === undefined ? fallback : Number(raw);
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name}_INVALID`);
  }
  return value;
}
