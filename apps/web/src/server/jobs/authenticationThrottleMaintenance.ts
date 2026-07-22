import { prisma } from "@ogfi/database";

type BatchClient = Pick<typeof prisma, "$transaction">;

type DeletedRow = { id: string };

export type AuthenticationThrottleCleanupConfig = {
  batchSize: number;
  maxBatches: number;
  maxRuntimeMs: number;
  retentionDays: number;
};

export type AuthenticationThrottleCleanupResult = {
  throttleWindowsDeleted: number;
  legacyAttemptsDeleted: number;
  throttleBatches: number;
  legacyBatches: number;
  stoppedReason: "DRAINED" | "MAX_BATCHES" | "MAX_RUNTIME";
};

export async function deleteExpiredThrottleWindowBatch(
  input: { now: Date; batchSize: number; timeoutMs: number },
  client: BatchClient = prisma
) {
  const rows = await client.$transaction(
    (tx) => tx.$queryRaw<DeletedRow[]>`
      WITH candidates AS MATERIALIZED (
        SELECT "id"
          FROM "AuthenticationThrottleWindow"
         WHERE "retainUntil" <= ${input.now}
         ORDER BY "retainUntil", "id"
         LIMIT ${input.batchSize}
         FOR UPDATE SKIP LOCKED
      )
      DELETE FROM "AuthenticationThrottleWindow" AS target
       USING candidates
       WHERE target."id" = candidates."id"
      RETURNING target."id"`,
    { timeout: input.timeoutMs }
  );
  return rows.length;
}

export async function deleteLegacyLoginAttemptBatch(
  input: { cutoff: Date; batchSize: number; timeoutMs: number },
  client: BatchClient = prisma
) {
  const rows = await client.$transaction(
    (tx) => tx.$queryRaw<DeletedRow[]>`
      WITH candidates AS MATERIALIZED (
        SELECT "id"
          FROM "AuthLoginAttempt"
         WHERE "attemptedAt" < ${input.cutoff}
         ORDER BY "attemptedAt", "id"
         LIMIT ${input.batchSize}
         FOR UPDATE SKIP LOCKED
      )
      DELETE FROM "AuthLoginAttempt" AS target
       USING candidates
       WHERE target."id" = candidates."id"
      RETURNING target."id"`,
    { timeout: input.timeoutMs }
  );
  return rows.length;
}

export async function runAuthenticationThrottleCleanup(
  config: AuthenticationThrottleCleanupConfig,
  options: {
    client?: BatchClient;
    now?: Date;
    clock?: () => number;
  } = {}
): Promise<AuthenticationThrottleCleanupResult> {
  const client = options.client ?? prisma;
  const now = options.now ?? new Date();
  const clock = options.clock ?? Date.now;
  const deadline = clock() + config.maxRuntimeMs;
  const cutoff = new Date(now.getTime() - config.retentionDays * 86_400_000);
  let throttleWindowsDeleted = 0;
  let legacyAttemptsDeleted = 0;
  let throttleBatches = 0;
  let legacyBatches = 0;
  let throttleDrained = false;
  let legacyDrained = false;

  while (
    throttleBatches < config.maxBatches &&
    legacyBatches < config.maxBatches &&
    clock() < deadline &&
    (!throttleDrained || !legacyDrained)
  ) {
    if (!throttleDrained) {
      const deleted = await deleteExpiredThrottleWindowBatch(
        {
          now,
          batchSize: config.batchSize,
          timeoutMs: remainingTimeout(deadline, clock)
        },
        client
      );
      throttleBatches += 1;
      throttleWindowsDeleted += deleted;
      throttleDrained = deleted < config.batchSize;
    }
    if (!legacyDrained && clock() < deadline) {
      const deleted = await deleteLegacyLoginAttemptBatch(
        {
          cutoff,
          batchSize: config.batchSize,
          timeoutMs: remainingTimeout(deadline, clock)
        },
        client
      );
      legacyBatches += 1;
      legacyAttemptsDeleted += deleted;
      legacyDrained = deleted < config.batchSize;
    }
  }

  return {
    throttleWindowsDeleted,
    legacyAttemptsDeleted,
    throttleBatches,
    legacyBatches,
    stoppedReason:
      throttleDrained && legacyDrained
        ? "DRAINED"
        : clock() >= deadline
          ? "MAX_RUNTIME"
          : "MAX_BATCHES"
  };
}

function remainingTimeout(deadline: number, clock: () => number) {
  return Math.max(1_000, deadline - clock());
}
