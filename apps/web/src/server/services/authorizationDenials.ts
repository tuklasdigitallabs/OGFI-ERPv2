import { createHash, randomUUID } from "node:crypto";
import { prisma, type TransactionClient } from "@ogfi/database";
import { z } from "zod";
import type { SessionContext } from "./context";
import {
  getAuthorizationDenialWindowMinutes,
  validateAuthorizationDenialWindowMinutes
} from "./policySettings";

export const authorizationDenialActions = [
  "READ", "CREATE", "UPDATE", "DELETE", "SUBMIT", "APPROVE", "POST",
  "EXPORT", "ADMINISTER", "AUTHENTICATE"
] as const;
export const authorizationDenialReasons = [
  "AUTHENTICATION_REQUIRED", "PERMISSION_MISSING", "SCOPE_DENIED",
  "SEGREGATION_OF_DUTIES", "STATUS_DENIED", "MFA_REQUIRED",
  "POLICY_DENIED", "RESOURCE_HIDDEN"
] as const;
export const authorizationDenialResources = [
  "AUTHENTICATION", "ADMINISTRATION", "APPROVAL", "PROCUREMENT", "RECEIVING",
  "INVENTORY", "PROJECTS", "FINANCE", "WORKFORCE", "REPORTING", "EVIDENCE",
  "SETTINGS"
] as const;
export const authorizationDenialSubjectTypes = [
  "ACTOR", "ANONYMOUS", "UNRESOLVED_IDENTITY", "SYSTEM"
] as const;

const denialInputSchema = z.object({
  tenantId: z.string().uuid(),
  companyId: z.string().uuid().nullable().optional(),
  locationId: z.string().uuid().nullable().optional(),
  actorUserId: z.string().uuid().nullable().optional(),
  subjectType: z.enum(authorizationDenialSubjectTypes),
  action: z.enum(authorizationDenialActions),
  reason: z.enum(authorizationDenialReasons),
  resource: z.enum(authorizationDenialResources),
  windowMinutes: z.number()
}).superRefine((value, context) => {
  if ((value.subjectType === "ACTOR") !== Boolean(value.actorUserId)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "AUTHORIZATION_DENIAL_SUBJECT_INVALID" });
  }
  if (value.locationId && !value.companyId) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "AUTHORIZATION_DENIAL_LOCATION_COMPANY_REQUIRED" });
  }
});

export type AuthorizationDenialInput = z.input<typeof denialInputSchema>;
export type SessionAuthorizationDenialInput = Omit<
  AuthorizationDenialInput,
  "tenantId" | "companyId" | "locationId" | "actorUserId" | "subjectType" | "windowMinutes"
>;
type TransactionHost = Pick<typeof prisma, "$transaction">;

type BucketRow = {
  id: string;
  tenantId: string;
  companyId: string | null;
  locationId: string | null;
  actorUserId: string | null;
  subjectType: (typeof authorizationDenialSubjectTypes)[number];
  action: (typeof authorizationDenialActions)[number];
  reason: (typeof authorizationDenialReasons)[number];
  resource: (typeof authorizationDenialResources)[number];
  denialCount: bigint;
  firstDeniedAt: Date;
  lastDeniedAt: Date;
  windowStartedAt: Date;
  windowEndsAt: Date;
};

export type AuthorizationDenialRecordResult = {
  bucketId: string;
  count: bigint;
  created: boolean;
  windowStartedAt: Date;
  windowEndsAt: Date;
};

function safeBucketKey(input: z.output<typeof denialInputSchema>) {
  return createHash("sha256").update(JSON.stringify([
    input.tenantId,
    input.companyId ?? "NO_COMPANY",
    input.locationId ?? "NO_LOCATION",
    input.actorUserId ?? input.subjectType,
    input.subjectType,
    input.action,
    input.reason,
    input.resource,
    input.windowMinutes
  ])).digest("hex");
}

function windowBounds(at: Date, minutes: number) {
  const windowMs = validateAuthorizationDenialWindowMinutes(minutes) * 60_000;
  const started = new Date(Math.floor(at.getTime() / windowMs) * windowMs);
  return { started, ends: new Date(started.getTime() + windowMs) };
}

async function finalizeRows(
  tx: TransactionClient,
  now: Date,
  batchSize: number,
  bucketKey?: string
) {
  const rows = bucketKey
    ? await tx.$queryRaw<BucketRow[]>`
        SELECT "id", "tenantId", "companyId", "locationId", "actorUserId",
               "subjectType", "action", "reason", "resource", "denialCount",
               "firstDeniedAt", "lastDeniedAt", "windowStartedAt", "windowEndsAt"
        FROM "AuthorizationDenialBucket"
        WHERE "finalizedAt" IS NULL AND "windowEndsAt" <= ${now} AND "bucketKey" = ${bucketKey}
        ORDER BY "windowEndsAt", "id"
        FOR UPDATE SKIP LOCKED
        LIMIT ${batchSize}`
    : await tx.$queryRaw<BucketRow[]>`
        SELECT "id", "tenantId", "companyId", "locationId", "actorUserId",
               "subjectType", "action", "reason", "resource", "denialCount",
               "firstDeniedAt", "lastDeniedAt", "windowStartedAt", "windowEndsAt"
        FROM "AuthorizationDenialBucket"
        WHERE "finalizedAt" IS NULL AND "windowEndsAt" <= ${now}
        ORDER BY "windowEndsAt", "id"
        FOR UPDATE SKIP LOCKED
        LIMIT ${batchSize}`;

  for (const row of rows) {
    const finalAuditEventId = row.denialCount > 1n ? randomUUID() : null;
    if (finalAuditEventId) {
      await tx.auditEvent.create({
        data: {
          id: finalAuditEventId,
          tenantId: row.tenantId,
          companyId: row.companyId,
          actorUserId: row.actorUserId,
          eventType: "authorization.denial.summary",
          entityType: "AuthorizationDenialBucket",
          entityId: row.id,
          occurredAt: now,
          metadata: {
            sourceDecisionId: "DEC-0050",
            count: row.denialCount.toString(),
            subjectType: row.subjectType,
            action: row.action,
            reason: row.reason,
            resource: row.resource,
            locationId: row.locationId,
            lastDeniedAt: row.lastDeniedAt.toISOString(),
            windowStartedAt: row.windowStartedAt.toISOString(),
            windowEndsAt: row.windowEndsAt.toISOString()
          }
        }
      });
    }
    const updated = await tx.$executeRaw`
      UPDATE "AuthorizationDenialBucket"
      SET "finalizedAt" = ${now}, "finalAuditEventId" = ${finalAuditEventId}::uuid,
          "updatedAt" = ${now}
      WHERE "id" = ${row.id}::uuid AND "finalizedAt" IS NULL`;
    if (updated !== 1) throw new Error("AUTHORIZATION_DENIAL_FINALIZE_CAS_FAILED");
  }
  return rows.length;
}

export async function recordAuthorizationDenialInTransaction(
  rawInput: AuthorizationDenialInput,
  options: { client: TransactionClient; now?: Date }
): Promise<AuthorizationDenialRecordResult> {
  const input = denialInputSchema.parse(rawInput);
  validateAuthorizationDenialWindowMinutes(input.windowMinutes);
  const now = options.now ?? new Date();
  const { started, ends } = windowBounds(now, input.windowMinutes);
  const bucketKey = safeBucketKey(input);
  const tx = options.client;

  await tx.$queryRaw<Array<{ lockResult: string }>>`
    SELECT pg_advisory_xact_lock(
      hashtextextended(${`${input.tenantId}:${bucketKey}:${started.toISOString()}`}, 0)
    )::text AS "lockResult"`;
  await finalizeRows(tx, now, 20, bucketKey);
  const existing = await tx.$queryRaw<Array<{ id: string; denialCount: bigint }>>`
    SELECT "id", "denialCount"
    FROM "AuthorizationDenialBucket"
    WHERE "tenantId" = ${input.tenantId}::uuid AND "bucketKey" = ${bucketKey}
      AND "windowStartedAt" = ${started}
    FOR UPDATE`;
  if (existing[0]) {
    const updated = await tx.$queryRaw<Array<{ id: string; denialCount: bigint }>>`
      UPDATE "AuthorizationDenialBucket"
      SET "denialCount" = "denialCount" + 1, "lastDeniedAt" = ${now}, "updatedAt" = ${now}
      WHERE "id" = ${existing[0].id}::uuid AND "finalizedAt" IS NULL
      RETURNING "id", "denialCount"`;
    if (!updated[0]) throw new Error("AUTHORIZATION_DENIAL_BUCKET_ALREADY_FINALIZED");
    return { bucketId: updated[0].id, count: updated[0].denialCount, created: false, windowStartedAt: started, windowEndsAt: ends };
  }

  const bucketId = randomUUID();
  const firstAuditEventId = randomUUID();
  await tx.auditEvent.create({
    data: {
      id: firstAuditEventId,
      tenantId: input.tenantId,
      companyId: input.companyId ?? null,
      actorUserId: input.actorUserId ?? null,
      eventType: "authorization.denial.first",
      entityType: "AuthorizationDenialBucket",
      entityId: bucketId,
      occurredAt: now,
      metadata: {
        sourceDecisionId: "DEC-0050",
        subjectType: input.subjectType,
        action: input.action,
        reason: input.reason,
        resource: input.resource,
        count: "1",
        locationId: input.locationId ?? null,
        windowStartedAt: started.toISOString(),
        windowEndsAt: ends.toISOString()
      }
    }
  });
  await tx.$executeRaw`
    INSERT INTO "AuthorizationDenialBucket" (
      "id", "tenantId", "companyId", "locationId", "actorUserId", "subjectType",
      "action", "reason", "resource", "bucketKey", "windowStartedAt", "windowEndsAt",
      "denialCount", "firstDeniedAt", "lastDeniedAt", "firstAuditEventId", "createdAt", "updatedAt"
    ) VALUES (
      ${bucketId}::uuid, ${input.tenantId}::uuid, ${input.companyId ?? null}::uuid,
      ${input.locationId ?? null}::uuid, ${input.actorUserId ?? null}::uuid,
      ${input.subjectType}::"AuthorizationDenialSubjectType", ${input.action}::"AuthorizationDenialAction",
      ${input.reason}::"AuthorizationDenialReason", ${input.resource}::"AuthorizationDenialResource",
      ${bucketKey}, ${started}, ${ends}, 1, ${now}, ${now}, ${firstAuditEventId}::uuid, ${now}, ${now}
    )`;
  return { bucketId, count: 1n, created: true, windowStartedAt: started, windowEndsAt: ends };
}

export async function recordAuthorizationDenial(
  rawInput: AuthorizationDenialInput,
  options: { now?: Date; client?: TransactionHost } = {}
): Promise<AuthorizationDenialRecordResult> {
  denialInputSchema.parse(rawInput);
  return (options.client ?? prisma).$transaction((tx) =>
    recordAuthorizationDenialInTransaction(rawInput, {
      client: tx,
      ...(options.now ? { now: options.now } : {})
    })
  );
}

const denialSavepoint = {
  create: "SAVEPOINT authorization_denial_persistence",
  rollback: "ROLLBACK TO SAVEPOINT authorization_denial_persistence",
  release: "RELEASE SAVEPOINT authorization_denial_persistence"
} as const;

async function withinAuthorizationDenialSavepoint<T>(
  tx: TransactionClient,
  action: () => Promise<T>
) {
  await tx.$executeRawUnsafe(denialSavepoint.create);
  try {
    const result = await action();
    await tx.$executeRawUnsafe(denialSavepoint.release);
    return result;
  } catch (error) {
    await tx.$executeRawUnsafe(denialSavepoint.rollback);
    await tx.$executeRawUnsafe(denialSavepoint.release);
    throw error;
  }
}

const denialPersistenceLogWindowMs = 5 * 60_000;
const denialPersistenceNextLogAt = new Map<string, number>();

function logDenialPersistenceFailure(
  input: Pick<AuthorizationDenialInput, "resource" | "action">,
  log: Pick<Console, "error"> = console,
  now = Date.now(),
) {
  const dimension = `${input.resource}:${input.action}`;
  if ((denialPersistenceNextLogAt.get(dimension) ?? 0) > now) return;
  denialPersistenceNextLogAt.set(dimension, now + denialPersistenceLogWindowMs);
  log.error("AUTHORIZATION_DENIAL_PERSISTENCE_FAILED", {
    event: "authorization_denial_persistence",
    status: "CRITICAL",
    code: "AUTHORIZATION_DENIAL_PERSISTENCE_FAILED",
    resource: input.resource,
    action: input.action,
  });
}

export async function recordDeniedDecisionInTransactionSafely(
  input: AuthorizationDenialInput,
  options: { client: TransactionClient; now?: Date; log?: Pick<Console, "error"> }
) {
  try {
    const result = await withinAuthorizationDenialSavepoint(options.client, () =>
      recordAuthorizationDenialInTransaction(input, options)
    );
    return { recorded: true as const, result };
  } catch {
    logDenialPersistenceFailure(input, options.log);
    return { recorded: false as const, errorCode: "AUTHORIZATION_DENIAL_PERSISTENCE_FAILED" as const };
  }
}

export async function recordDeniedDecisionSafely(
  input: AuthorizationDenialInput,
  options: { now?: Date; client?: TransactionHost; log?: Pick<Console, "error"> } = {}
) {
  try {
    return { recorded: true as const, result: await recordAuthorizationDenial(input, options) };
  } catch {
    logDenialPersistenceFailure(input, options.log);
    return { recorded: false as const, errorCode: "AUTHORIZATION_DENIAL_PERSISTENCE_FAILED" as const };
  }
}

export async function recordSessionDeniedDecisionInTransactionSafely(
  session: SessionContext,
  input: SessionAuthorizationDenialInput,
  options: {
    client: TransactionClient;
    now?: Date;
    log?: Pick<Console, "error">;
    resolveWindowMinutes?: typeof getAuthorizationDenialWindowMinutes;
  }
) {
  const baseInput = {
    tenantId: session.context.tenantId,
    companyId: session.context.companyId,
    locationId: session.context.locationId,
    actorUserId: session.user.id,
    subjectType: "ACTOR" as const,
    ...input
  };
  try {
    const result = await withinAuthorizationDenialSavepoint(options.client, async () => {
      const windowMinutes = await (
        options.resolveWindowMinutes ?? getAuthorizationDenialWindowMinutes
      )(session, options.client);
      return recordAuthorizationDenialInTransaction(
        { ...baseInput, windowMinutes },
        {
          client: options.client,
          ...(options.now ? { now: options.now } : {})
        }
      );
    });
    return { recorded: true as const, result };
  } catch {
    logDenialPersistenceFailure(baseInput, options.log);
    return {
      recorded: false as const,
      errorCode: "AUTHORIZATION_DENIAL_PERSISTENCE_FAILED" as const
    };
  }
}

export async function recordSessionDeniedDecisionSafely(
  session: SessionContext,
  input: SessionAuthorizationDenialInput,
  options: {
    now?: Date;
    client?: TransactionHost;
    log?: Pick<Console, "error">;
    resolveWindowMinutes?: typeof getAuthorizationDenialWindowMinutes;
  } = {}
) {
  const baseInput = {
    tenantId: session.context.tenantId,
    companyId: session.context.companyId,
    locationId: session.context.locationId,
    actorUserId: session.user.id,
    subjectType: "ACTOR" as const,
    ...input
  };
  try {
    const windowMinutes = await (
      options.resolveWindowMinutes ?? getAuthorizationDenialWindowMinutes
    )(session);
    return {
      recorded: true as const,
      result: await recordAuthorizationDenial(
        { ...baseInput, windowMinutes },
        options
      )
    };
  } catch {
    logDenialPersistenceFailure(baseInput, options.log);
    return {
      recorded: false as const,
      errorCode: "AUTHORIZATION_DENIAL_PERSISTENCE_FAILED" as const
    };
  }
}

export async function finalizeExpiredAuthorizationDenialBuckets(
  options: { now?: Date; batchSize?: number; client?: TransactionHost } = {}
) {
  const batchSize = options.batchSize ?? 100;
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 500) {
    throw new Error("AUTHORIZATION_DENIAL_FINALIZER_BATCH_INVALID");
  }
  return (options.client ?? prisma).$transaction((tx) =>
    finalizeRows(tx, options.now ?? new Date(), batchSize)
  );
}
