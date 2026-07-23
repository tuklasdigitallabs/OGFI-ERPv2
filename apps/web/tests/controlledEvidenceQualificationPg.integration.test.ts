import { randomUUID } from "node:crypto";
import { Prisma, prisma, type TransactionClient } from "@ogfi/database";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import {
  qualifyControlledEvidenceForAction,
  withControlledEvidenceQualificationTestAdapter,
  type ControlledEvidenceActionAdapter,
  type ControlledEvidenceClosedActionContext,
} from "../src/server/services/controlledEvidenceQualification";
import {
  assertDisposableAuthorizationDatabaseConfigured,
  assertDisposableAuthorizationDatabaseMarker,
} from "./authorizationDatabaseSafety";

const runPg =
  process.env.RUN_CONTROLLED_EVIDENCE_QUALIFICATION_PG_TESTS === "true";
const pgDescribe = runPg ? describe : describe.skip;
const expectedDatabase = runPg
  ? assertDisposableAuthorizationDatabaseConfigured(process.env)
  : null;

const fixturePolicyId = "d0770000-0000-4000-8000-000000000001";
const fixtureActivationId = "d0770000-0000-4000-8000-000000000002";
const fixtureActivationEventId = "d0770000-0000-4000-8000-000000000003";
const fixtureActionCode = "TEST.CONTROLLED_EVIDENCE.QUALIFY";
const fixtureSourceType = "ControlledEvidenceSyntheticSource";
const fixturePurpose = "APPROVAL_SUPPORT";
const fixturePlaintextChecksumHex = "a".repeat(64);
const fixturePlaintextChecksumBase64 = Buffer.from(
  fixturePlaintextChecksumHex,
  "hex",
).toString("base64");
const fixtureStoredChecksum = "b".repeat(64);

function base64Sha256(hexCharacter: string) {
  return Buffer.from(hexCharacter.repeat(64), "hex").toString("base64");
}

type FixtureScope = {
  tenantId: string;
  companyId: string;
  actorUserId: string;
  actorPrivilegeEpoch: number;
};

type SyntheticContext = ControlledEvidenceClosedActionContext;

const syntheticAdapter: ControlledEvidenceActionAdapter = {
  actionCode: fixtureActionCode,
  actionSchemaVersion: 1,
  supportedPolicySchemaVersions: [1],
  closeActionContext(serverOwnedContext) {
    return serverOwnedContext as SyntheticContext;
  },
};

type EvidenceFixture = {
  attachmentId: string;
  linkId: string;
  scanAttemptId: string;
  sourceRecordId: string;
  sourceLineId: string | null;
};

type EvidenceOverrides = Partial<{
  sourceRecordId: string;
  sourceLineId: string | null;
  purpose: string;
  attachmentStatus: "ACTIVE" | "INACTIVE";
  uploadState: "VERIFIED" | "PENDING";
  scanState: "CLEAN" | "PENDING";
  availabilityState: "AVAILABLE" | "QUARANTINED";
  physicalState: "DURABLE" | "STAGING";
  scanVerifiedObjectVersionId: string;
  detectedChecksum: string;
  storedChecksum: string;
  scanObjectVersionId: string;
  scanResult: "CLEAN" | "FAILED";
  scanPlaintextChecksum: string;
}>;

class RollbackProof extends Error {}

function pgErrorCode(error: unknown) {
  if (typeof error !== "object" || error === null) return null;
  const candidate = error as { code?: unknown; meta?: { code?: unknown } };
  return typeof candidate.code === "string"
    ? candidate.code
    : typeof candidate.meta?.code === "string"
      ? candidate.meta.code
      : null;
}

async function expectDatabaseDenial(
  operation: () => Promise<unknown>,
  expectedCodes: readonly string[],
) {
  let caught: unknown;
  try {
    await operation();
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeDefined();
  expect(expectedCodes).toContain(pgErrorCode(caught));
  return caught;
}

pgDescribe("DEC-0077 controlled-evidence qualification PostgreSQL contract", () => {
  let scope: FixtureScope;

  beforeAll(async () => {
    await prisma.$connect();
    await assertDisposableAuthorizationDatabaseMarker(prisma, process.env);
    const database = await prisma.$queryRaw<Array<{ currentDatabase: string }>>`
      SELECT current_database() AS "currentDatabase"
    `;
    expect(database).toEqual([{ currentDatabase: expectedDatabase }]);

    const rows = await prisma.$queryRaw<FixtureScope[]>`
      SELECT pointer."tenantId", pointer."companyId",
             event."activatedByUserId" AS "actorUserId",
             actor."privilegeEpoch" AS "actorPrivilegeEpoch"
        FROM "ControlledEvidencePolicyActivation" pointer
        JOIN "ControlledEvidencePolicyActivationEvent" event
          ON event."id" = pointer."activeActivationEventId"
         AND event."tenantId" = pointer."tenantId"
         AND event."companyId" = pointer."companyId"
         AND event."actionCode" = pointer."actionCode"
         AND event."pointerVersion" = pointer."pointerVersion"
        JOIN "User" actor
          ON actor."id" = event."activatedByUserId"
         AND actor."tenantId" = event."tenantId"
       WHERE pointer."id" = ${fixtureActivationId}::uuid
         AND event."id" = ${fixtureActivationEventId}::uuid
         AND event."policyVersionId" = ${fixturePolicyId}::uuid
         AND pointer."actionCode" = ${fixtureActionCode}
    `;
    expect(rows).toHaveLength(1);
    scope = rows[0]!;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function createEvidence(overrides: EvidenceOverrides = {}) {
    const objectVersionId = `dec-0077-object-${randomUUID()}`;
    const checksum = fixturePlaintextChecksumBase64;
    const sourceRecordId = overrides.sourceRecordId ?? randomUUID();
    const sourceLineId = overrides.sourceLineId ?? null;
    const attachment = await prisma.attachment.create({
      data: {
        tenantId: scope.tenantId,
        companyId: scope.companyId,
        storageEnvironment: "CONTROLLED_UAT",
        storageProvider: "hostinger-local",
        objectKey: `dec-0077/${randomUUID()}`,
        objectVersionId,
        originalFilename: "synthetic-contract-evidence.pdf",
        mimeType: "application/pdf",
        detectedMimeType: "application/pdf",
        sizeBytes: 128,
        checksum,
        detectedChecksum: overrides.detectedChecksum ?? checksum,
        storedChecksum: overrides.storedChecksum ?? fixtureStoredChecksum,
        uploadState: overrides.uploadState ?? "VERIFIED",
        scanState: overrides.scanState ?? "CLEAN",
        availabilityState: overrides.availabilityState ?? "AVAILABLE",
        physicalState: overrides.physicalState ?? "DURABLE",
        scanVerifiedObjectVersionId:
          overrides.scanVerifiedObjectVersionId ?? objectVersionId,
        uploadVerifiedAt: new Date("2026-07-24T00:10:00.000Z"),
        scanCompletedAt: new Date("2026-07-24T00:11:00.000Z"),
        availableAt: new Date("2026-07-24T00:12:00.000Z"),
        retentionClass: "PRESERVATION_PENDING_APPROVED_POLICY",
        status: overrides.attachmentStatus ?? "ACTIVE",
        rowVersion: 5,
      },
      select: { id: true },
    });
    const scan = await prisma.attachmentScanAttempt.create({
      data: {
        tenantId: scope.tenantId,
        companyId: scope.companyId,
        attachmentId: attachment.id,
        objectVersionId: overrides.scanObjectVersionId ?? objectVersionId,
        scanProvider: "dec-0077-test-scanner",
        scannerEngineVersion: "synthetic-1",
        signatureVersion: "synthetic-signatures-1",
        startedAt: new Date("2026-07-24T00:10:30.000Z"),
        completedAt: new Date("2026-07-24T00:11:00.000Z"),
        result: overrides.scanResult ?? "CLEAN",
        plaintextChecksum:
          overrides.scanPlaintextChecksum ?? fixturePlaintextChecksumHex,
      },
      select: { id: true },
    });
    const link = await prisma.controlledEvidenceAttachment.create({
      data: {
        tenantId: scope.tenantId,
        companyId: scope.companyId,
        sourceType: fixtureSourceType,
        sourceRecordId,
        sourceLineId,
        sourceKey: `DEC-0077:${sourceRecordId}:${sourceLineId ?? "record"}`,
        attachmentId: attachment.id,
        purpose: overrides.purpose ?? fixturePurpose,
        createdByUserId: scope.actorUserId,
      },
      select: { id: true },
    });
    return {
      attachmentId: attachment.id,
      linkId: link.id,
      scanAttemptId: scan.id,
      sourceRecordId,
      sourceLineId,
    } satisfies EvidenceFixture;
  }

  function actionContext(
    evidence: EvidenceFixture,
    overrides: Partial<SyntheticContext> = {},
  ): SyntheticContext {
    return {
      tenantId: scope.tenantId,
      companyId: scope.companyId,
      sourceType: fixtureSourceType,
      sourceRecordId: evidence.sourceRecordId,
      sourceVersion: "7",
      sourceLineId: evidence.sourceLineId,
      executionKey: `dec-0077-execution-${randomUUID()}`,
      actorUserId: scope.actorUserId,
      actorAuthSessionId: null,
      actorPrivilegeEpoch: scope.actorPrivilegeEpoch,
      approvalInstanceId: null,
      approvalStepId: null,
      provenance: {
        fixture: true,
        policyAuthority: "DISPOSABLE_TEST_ONLY",
        sourceLockOwnedByCaller: true,
      },
      ...overrides,
    };
  }

  async function qualify(
    evidence: EvidenceFixture,
    context: SyntheticContext,
    suppliedTx?: TransactionClient,
  ) {
    const execute = async (tx: TransactionClient) => {
      await tx.$queryRaw(Prisma.sql`
        SELECT pg_advisory_xact_lock(
          hashtextextended(${context.sourceRecordId}, 77)
        )
      `);
      return withControlledEvidenceQualificationTestAdapter(
        syntheticAdapter,
        () =>
          qualifyControlledEvidenceForAction({
            tx,
            actionCode: fixtureActionCode,
            serverOwnedActionContext: context,
            controlledEvidenceAttachmentIds: [evidence.linkId],
          }),
      );
    };
    return suppliedTx ? execute(suppliedTx) : prisma.$transaction(execute);
  }

  async function qualificationCount(executionKey: string) {
    const rows = await prisma.$queryRaw<Array<{ rowCount: bigint }>>`
      SELECT count(*) AS "rowCount"
        FROM "ControlledEvidenceActionQualification"
       WHERE "tenantId" = ${scope.tenantId}::uuid
         AND "companyId" = ${scope.companyId}::uuid
         AND "actionCode" = ${fixtureActionCode}
         AND "executionKey" = ${executionKey}
    `;
    return Number(rows[0]?.rowCount ?? 0n);
  }

  test("writes one exact immutable qualification and returns a coherent identical retry", async () => {
    const evidence = await createEvidence();
    const context = actionContext(evidence);
    const first = await qualify(evidence, context);
    const retry = await qualify(evidence, context);

    expect(first.identicalRetry).toBe(false);
    expect(retry).toEqual({ ...first, identicalRetry: true });
    expect(await qualificationCount(context.executionKey)).toBe(1);
    const rows = await prisma.$queryRaw<
      Array<{
        qualificationId: string;
        selectionCount: number;
        attachmentChecksum: string;
        attachmentDetectedChecksum: string;
        attachmentStoredChecksum: string;
        scanPlaintextChecksum: string;
        objectVersionId: string;
        scanAttemptId: string;
      }>
    >`
      SELECT qualification."id" AS "qualificationId",
             qualification."selectionCount",
             selection."attachmentChecksum",
             selection."attachmentDetectedChecksum",
             selection."attachmentStoredChecksum",
             selection."scanPlaintextChecksum",
             selection."objectVersionId", selection."scanAttemptId"
        FROM "ControlledEvidenceActionQualification" qualification
        JOIN "ControlledEvidenceActionSelection" selection
          ON selection."qualificationId" = qualification."id"
       WHERE qualification."id" = ${first.qualificationId}::uuid
    `;
    expect(rows).toEqual([
      expect.objectContaining({
        qualificationId: first.qualificationId,
        selectionCount: 1,
        attachmentChecksum: fixturePlaintextChecksumHex,
        attachmentDetectedChecksum: fixturePlaintextChecksumHex,
        attachmentStoredChecksum: fixtureStoredChecksum,
        scanPlaintextChecksum: fixturePlaintextChecksumHex,
        scanAttemptId: evidence.scanAttemptId,
      }),
    ]);

    const databaseOwnedFacts = await prisma.$queryRaw<
      Array<{
        timestampsMatch: boolean;
        timestampIsMilliseconds: boolean;
        eventHashMatches: boolean;
        pointerTargetsEvent: boolean;
      }>
    >`
      SELECT qualification."qualifiedAt" = qualification."createdAt" AS "timestampsMatch",
             qualification."qualifiedAt" = date_trunc('milliseconds', qualification."qualifiedAt") AS "timestampIsMilliseconds",
             event."activationHash" = encode(digest(event."canonicalJson", 'sha256'), 'hex') AS "eventHashMatches",
             pointer."activeActivationEventId" = event."id"
               AND pointer."pointerVersion" = event."pointerVersion" AS "pointerTargetsEvent"
        FROM "ControlledEvidenceActionQualification" qualification
        JOIN "ControlledEvidencePolicyActivationEvent" event
          ON event."id" = qualification."policyActivationId"
        JOIN "ControlledEvidencePolicyActivation" pointer
          ON pointer."id" = qualification."policyActivationPointerId"
       WHERE qualification."id" = ${first.qualificationId}::uuid
    `;
    expect(databaseOwnedFacts).toEqual([
      {
        timestampsMatch: true,
        timestampIsMilliseconds: true,
        eventHashMatches: true,
        pointerTargetsEvent: true,
      },
    ]);
  });

  test("fails closed when the action source type does not match the active policy", async () => {
    const evidence = await createEvidence();
    const context = actionContext(evidence, {
      sourceType: "ControlledEvidenceDifferentSyntheticSource",
    });
    await expect(qualify(evidence, context)).rejects.toThrow(
      "CONTROLLED_EVIDENCE_NOT_QUALIFIED",
    );
    expect(await qualificationCount(context.executionKey)).toBe(0);
  });

  test("serializes concurrent identical retries to one fact", async () => {
    const evidence = await createEvidence();
    const context = actionContext(evidence);
    const results = await Promise.all([
      qualify(evidence, context),
      qualify(evidence, context),
    ]);
    expect(results.map(({ identicalRetry }) => identicalRetry).sort()).toEqual([
      false,
      true,
    ]);
    expect(new Set(results.map(({ qualificationId }) => qualificationId)).size).toBe(1);
    expect(await qualificationCount(context.executionKey)).toBe(1);
  });

  test("fails a conflicting retry closed without overwriting history", async () => {
    const firstEvidence = await createEvidence();
    const secondEvidence = await createEvidence({
      sourceRecordId: firstEvidence.sourceRecordId,
    });
    const context = actionContext(firstEvidence);
    await qualify(firstEvidence, context);
    await expect(qualify(secondEvidence, context)).rejects.toThrow(
      "CONTROLLED_EVIDENCE_QUALIFICATION_CONFLICT",
    );
    expect(await qualificationCount(context.executionKey)).toBe(1);
  });

  test("rolls qualification and selections back with the caller action transaction", async () => {
    const evidence = await createEvidence();
    const context = actionContext(evidence);
    let caught: unknown;
    try {
      await prisma.$transaction(async (tx) => {
        await qualify(evidence, context, tx);
        throw new RollbackProof("synthetic action failed after qualification");
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(RollbackProof);
    expect(await qualificationCount(context.executionKey)).toBe(0);
  });

  test("rejects selected IDs above approved maxima before evidence reads", async () => {
    const sourceRecordId = randomUUID();
    const context: SyntheticContext = {
      tenantId: scope.tenantId,
      companyId: scope.companyId,
      sourceType: fixtureSourceType,
      sourceRecordId,
      sourceVersion: "7",
      sourceLineId: null,
      executionKey: `dec-0077-execution-${randomUUID()}`,
      actorUserId: scope.actorUserId,
      actorAuthSessionId: null,
      actorPrivilegeEpoch: scope.actorPrivilegeEpoch,
      approvalInstanceId: null,
      approvalStepId: null,
      provenance: { fixture: true, boundedBeforeEvidenceLocks: true },
    };
    await expect(
      prisma.$transaction(async (tx) =>
        withControlledEvidenceQualificationTestAdapter(syntheticAdapter, () =>
          qualifyControlledEvidenceForAction({
            tx,
            actionCode: fixtureActionCode,
            serverOwnedActionContext: context,
            controlledEvidenceAttachmentIds: [
              randomUUID(),
              randomUUID(),
              randomUUID(),
            ],
          }),
        ),
      ),
    ).rejects.toThrow("CONTROLLED_EVIDENCE_NOT_QUALIFIED");
    expect(await qualificationCount(context.executionKey)).toBe(0);
  });

  test("database rejects a raw runtime qualification with forged execution identity", async () => {
    const evidence = await createEvidence();
    const context = actionContext(evidence);
    const valid = await qualify(evidence, context);
    const forgedExecutionKey = `forged-${randomUUID()}`;
    const error = await expectDatabaseDenial(
      () =>
        prisma.$executeRaw`
          INSERT INTO "ControlledEvidenceActionQualification"
          SELECT (jsonb_populate_record(
            NULL::"ControlledEvidenceActionQualification",
            to_jsonb(qualification) || jsonb_build_object(
              'id', gen_random_uuid(),
              'executionKey', ${forgedExecutionKey},
              'idempotencyKey', ${`forged-${randomUUID()}`}
            )
          )).*
            FROM "ControlledEvidenceActionQualification" qualification
           WHERE qualification."id" = ${valid.qualificationId}::uuid
        `,
      ["23514"],
    );
    expect(String(error)).toMatch(
      /CONTROLLED_EVIDENCE_(EXECUTION|IDEMPOTENCY)_MISMATCH/,
    );
    expect(await qualificationCount(forgedExecutionKey)).toBe(0);
  });

  test.each([
    ["nonexistent or foreign link", {}, { linkId: randomUUID() }],
    ["inactive attachment", { attachmentStatus: "INACTIVE" }, {}],
    ["unverified upload", { uploadState: "PENDING" }, {}],
    ["unclean scan state", { scanState: "PENDING" }, {}],
    ["unavailable object", { availabilityState: "QUARANTINED" }, {}],
    ["non-durable object", { physicalState: "STAGING" }, {}],
    ["stale scan version", { scanVerifiedObjectVersionId: "stale-version" }, {}],
    ["detected checksum mismatch", { detectedChecksum: base64Sha256("c") }, {}],
    ["scan checksum mismatch", { scanPlaintextChecksum: "c".repeat(64) }, {}],
    ["unapproved purpose", { purpose: "OTHER" }, {}],
  ] as const)("fails %s closed with no qualification", async (_label, createOverrides, evidenceOverrides) => {
    const evidence = {
      ...(await createEvidence(createOverrides as EvidenceOverrides)),
      ...evidenceOverrides,
    } as EvidenceFixture;
    const context = actionContext(evidence);
    await expect(qualify(evidence, context)).rejects.toThrow(
      "CONTROLLED_EVIDENCE_NOT_QUALIFIED",
    );
    expect(await qualificationCount(context.executionKey)).toBe(0);
  });

  test("revalidates exact source and line after link locking", async () => {
    const evidence = await createEvidence({ sourceLineId: randomUUID() });
    const wrongSource = actionContext(evidence, { sourceRecordId: randomUUID() });
    const wrongLine = actionContext(evidence, {
      executionKey: `dec-0077-execution-${randomUUID()}`,
      sourceLineId: randomUUID(),
    });
    await expect(qualify(evidence, wrongSource)).rejects.toThrow(
      "CONTROLLED_EVIDENCE_NOT_QUALIFIED",
    );
    await expect(qualify(evidence, wrongLine)).rejects.toThrow(
      "CONTROLLED_EVIDENCE_NOT_QUALIFIED",
    );
  });

  test("database lineage rejects a stale actor privilege epoch atomically", async () => {
    const evidence = await createEvidence();
    const context = actionContext(evidence, {
      actorPrivilegeEpoch: scope.actorPrivilegeEpoch + 1,
    });
    const error = await expectDatabaseDenial(
      () => qualify(evidence, context),
      ["23514"],
    );
    expect(String(error)).toContain("CONTROLLED_EVIDENCE_ACTOR_EPOCH_MISMATCH");
    expect(await qualificationCount(context.executionKey)).toBe(0);
  });

  test.each([
    "archive link",
    "replace attachment",
    "mutate link authority fields",
  ] as const)("deferred verification rejects same-transaction readiness drift: %s", async (drift) => {
    const evidence = await createEvidence();
    const context = actionContext(evidence);
    const error = await expectDatabaseDenial(
      () =>
        prisma.$transaction(async (tx) => {
          await qualify(evidence, context, tx);
          if (drift === "archive link") {
            await tx.$executeRaw`
              UPDATE "ControlledEvidenceAttachment"
                 SET "status" = 'ARCHIVED', "archivedAt" = transaction_timestamp()
               WHERE "id" = ${evidence.linkId}::uuid
            `;
          } else if (drift === "replace attachment") {
            const replacement = await createEvidence();
            await tx.$executeRaw`
              UPDATE "Attachment"
                 SET "replacesAttachmentId" = ${evidence.attachmentId}::uuid
               WHERE "id" = ${replacement.attachmentId}::uuid
            `;
          } else {
            await tx.$executeRaw`
              UPDATE "ControlledEvidenceAttachment"
                 SET "sourceType" = 'ControlledEvidenceTamperedSource',
                     "purpose" = 'OTHER'
               WHERE "id" = ${evidence.linkId}::uuid
            `;
          }
          await tx.$executeRawUnsafe("SET CONSTRAINTS ALL IMMEDIATE");
        }),
      ["23514"],
    );
    expect(String(error)).toContain(
      "CONTROLLED_EVIDENCE_SELECTION_AGGREGATE_MISMATCH",
    );
    expect(await qualificationCount(context.executionKey)).toBe(0);
  });

  test("enforces the runtime least-privilege and append-only interface", async () => {
    const rows = await prisma.$queryRaw<
      Array<{
        policySelect: boolean;
        policyInsert: boolean;
        activationSelect: boolean;
        activationTableUpdate: boolean;
        activationLockColumnUpdate: boolean;
        activationEventSelect: boolean;
        activationEventInsert: boolean;
        qualificationSelect: boolean;
        qualificationInsert: boolean;
        qualificationUpdate: boolean;
        selectionSelect: boolean;
        selectionInsert: boolean;
        selectionUpdate: boolean;
        scanUpdate: boolean;
        scanDelete: boolean;
      }>
    >`
      SELECT
        has_table_privilege(current_user, '"ControlledEvidencePolicyVersion"', 'SELECT') AS "policySelect",
        has_table_privilege(current_user, '"ControlledEvidencePolicyVersion"', 'INSERT') AS "policyInsert",
        has_table_privilege(current_user, '"ControlledEvidencePolicyActivation"', 'SELECT') AS "activationSelect",
        has_table_privilege(current_user, '"ControlledEvidencePolicyActivation"', 'UPDATE') AS "activationTableUpdate",
        has_column_privilege(current_user, '"ControlledEvidencePolicyActivation"', 'updatedAt', 'UPDATE') AS "activationLockColumnUpdate",
        has_table_privilege(current_user, '"ControlledEvidencePolicyActivationEvent"', 'SELECT') AS "activationEventSelect",
        has_table_privilege(current_user, '"ControlledEvidencePolicyActivationEvent"', 'INSERT') AS "activationEventInsert",
        has_table_privilege(current_user, '"ControlledEvidenceActionQualification"', 'SELECT') AS "qualificationSelect",
        has_table_privilege(current_user, '"ControlledEvidenceActionQualification"', 'INSERT') AS "qualificationInsert",
        has_table_privilege(current_user, '"ControlledEvidenceActionQualification"', 'UPDATE') AS "qualificationUpdate",
        has_table_privilege(current_user, '"ControlledEvidenceActionSelection"', 'SELECT') AS "selectionSelect",
        has_table_privilege(current_user, '"ControlledEvidenceActionSelection"', 'INSERT') AS "selectionInsert",
        has_table_privilege(current_user, '"ControlledEvidenceActionSelection"', 'UPDATE') AS "selectionUpdate",
        has_table_privilege(current_user, '"AttachmentScanAttempt"', 'UPDATE') AS "scanUpdate",
        has_table_privilege(current_user, '"AttachmentScanAttempt"', 'DELETE') AS "scanDelete"
    `;
    expect(rows).toEqual([
      {
        policySelect: true,
        policyInsert: false,
        activationSelect: true,
        activationTableUpdate: false,
        activationLockColumnUpdate: true,
        activationEventSelect: true,
        activationEventInsert: false,
        qualificationSelect: true,
        qualificationInsert: true,
        qualificationUpdate: false,
        selectionSelect: true,
        selectionInsert: true,
        selectionUpdate: false,
        scanUpdate: false,
        scanDelete: false,
      },
    ]);

    await expectDatabaseDenial(
      () =>
        prisma.$executeRaw`
          UPDATE "ControlledEvidencePolicyActivation"
             SET "updatedAt" = "updatedAt"
           WHERE "id" = ${fixtureActivationId}::uuid
        `,
      ["40001", "55000"],
    );
    await expectDatabaseDenial(
      () =>
        prisma.$executeRaw`
          DELETE FROM "ControlledEvidencePolicyActivation"
           WHERE "id" = ${fixtureActivationId}::uuid
        `,
      ["42501", "55000"],
    );
    await expectDatabaseDenial(
      () =>
        prisma.$executeRaw`
          UPDATE "AttachmentScanAttempt"
             SET "result" = 'FAILED'
           WHERE "id" = (
             SELECT "id" FROM "AttachmentScanAttempt" ORDER BY "createdAt" LIMIT 1
           )
        `,
      ["42501", "55000"],
    );
  });
});
