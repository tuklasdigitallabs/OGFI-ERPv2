import { randomUUID } from "node:crypto";
import { prisma, type Prisma } from "@ogfi/database";
import { afterAll, describe, expect, test } from "vitest";

const runPg = process.env.RUN_APPROVAL_ROUTING_PG_TESTS === "true";

type Transaction = Prisma.TransactionClient;
type DatabaseError = Error & {
  code?: unknown;
  meta?: { code?: unknown; message?: unknown };
};

type ApprovalScope = {
  tenantId: string;
  companyId: string;
  locationId: string;
  actorUserId: string;
  pettyCashFundId: string;
  approvalRuleId: string;
  suffix: string;
};

type IntentFixture = ApprovalScope & {
  pettyCashRequestId: string;
  approvalInstanceId: string;
  approvalStepId: string;
};

class RollbackProof extends Error {
  constructor(readonly entityId: string) {
    super(`rollback approval-integrity proof ${entityId}`);
  }
}

async function createScope(
  tx: Transaction,
  label = "primary",
): Promise<ApprovalScope> {
  const ids = {
    tenantId: randomUUID(),
    companyId: randomUUID(),
    locationId: randomUUID(),
    actorUserId: randomUUID(),
    pettyCashFundId: randomUUID(),
    approvalRuleId: randomUUID(),
  };
  const suffix = ids.tenantId.slice(0, 8);

  await tx.$executeRawUnsafe(
    `INSERT INTO public."Tenant" (id, name, "loginCode", "updatedAt")
     VALUES ($1::uuid, $2, $3, CURRENT_TIMESTAMP)`,
    ids.tenantId,
    `Approval integrity ${label} ${suffix}`,
    `approval-integrity-${label}-${suffix}`,
  );
  await tx.$executeRawUnsafe(
    `INSERT INTO public."Company" (
       id, "tenantId", code, "legalName", "currencyCode", "updatedAt"
     ) VALUES ($1::uuid, $2::uuid, $3, $4, 'PHP', CURRENT_TIMESTAMP)`,
    ids.companyId,
    ids.tenantId,
    `AI-${label.slice(0, 8)}-${suffix}`,
    `Approval integrity ${label} ${suffix}`,
  );
  await tx.$executeRawUnsafe(
    `INSERT INTO public."Location" (
       id, "tenantId", "companyId", "locationType", code, name, "updatedAt"
     ) VALUES (
       $1::uuid, $2::uuid, $3::uuid, 'BRANCH', $4, $5, CURRENT_TIMESTAMP
     )`,
    ids.locationId,
    ids.tenantId,
    ids.companyId,
    `AI-${label.slice(0, 8)}-${suffix}`,
    `Approval integrity ${label} location ${suffix}`,
  );
  await tx.$executeRawUnsafe(
    `INSERT INTO public."User" (
       id, "tenantId", email, "displayName", "updatedAt"
     ) VALUES ($1::uuid, $2::uuid, $3, $4, CURRENT_TIMESTAMP)`,
    ids.actorUserId,
    ids.tenantId,
    `approval-integrity-${label}-${suffix}@test.invalid`,
    `Approval integrity ${label} actor`,
  );
  await tx.$executeRawUnsafe(
    `INSERT INTO public."PettyCashFund" (
       id, "tenantId", "companyId", "publicReference", code, name,
       "locationId", "custodianUserId", "createdByUserId", "updatedAt"
     ) VALUES (
       $1::uuid, $2::uuid, $3::uuid, $4, $5, $6,
       $7::uuid, $8::uuid, $8::uuid, CURRENT_TIMESTAMP
     )`,
    ids.pettyCashFundId,
    ids.tenantId,
    ids.companyId,
    `AI-PCF-${label}-${suffix}`,
    `AI-PCF-${label.slice(0, 8)}-${suffix}`,
    `Approval integrity ${label} fund`,
    ids.locationId,
    ids.actorUserId,
  );
  await tx.$executeRawUnsafe(
    `INSERT INTO public."ApprovalRule" (
       id, "tenantId", "companyId", "transactionType", priority
     ) VALUES ($1::uuid, $2::uuid, $3::uuid, 'PettyCashRequest', 1)`,
    ids.approvalRuleId,
    ids.tenantId,
    ids.companyId,
  );

  return { ...ids, suffix };
}

async function createCompanyRule(
  tx: Transaction,
  tenantId: string,
  label: string,
): Promise<{ companyId: string; approvalRuleId: string }> {
  const companyId = randomUUID();
  const approvalRuleId = randomUUID();
  const suffix = companyId.slice(0, 8);
  await tx.$executeRawUnsafe(
    `INSERT INTO public."Company" (
       id, "tenantId", code, "legalName", "currencyCode", "updatedAt"
     ) VALUES ($1::uuid, $2::uuid, $3, $4, 'PHP', CURRENT_TIMESTAMP)`,
    companyId,
    tenantId,
    `AI-${label}-${suffix}`,
    `Approval integrity ${label} ${suffix}`,
  );
  await tx.$executeRawUnsafe(
    `INSERT INTO public."ApprovalRule" (
       id, "tenantId", "companyId", "transactionType", priority
     ) VALUES ($1::uuid, $2::uuid, $3::uuid, 'PettyCashRequest', 1)`,
    approvalRuleId,
    tenantId,
    companyId,
  );
  return { companyId, approvalRuleId };
}

async function insertApprovalInstance(
  tx: Transaction,
  input: {
    tenantId: string;
    companyId: string;
    approvalRuleId: string;
    documentType: string;
    documentId: string;
    status?: "PENDING" | "APPROVED" | "REJECTED" | "RETURNED" | "CANCELLED";
  },
): Promise<string> {
  const id = randomUUID();
  await tx.$executeRawUnsafe(
    `INSERT INTO public."ApprovalInstance" (
       id, "tenantId", "companyId", "documentType", "documentId",
       "approvalRuleId", status, "currentStepOrder"
     ) VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5::uuid, $6::uuid, $7::"ApprovalStatus", 1)`,
    id,
    input.tenantId,
    input.companyId,
    input.documentType,
    input.documentId,
    input.approvalRuleId,
    input.status ?? "PENDING",
  );
  return id;
}

async function createIntentFixture(
  tx: Transaction,
  options: { initializeProposal?: boolean; label?: string } = {},
): Promise<IntentFixture> {
  const scope = await createScope(tx, options.label ?? "intent");
  const pettyCashRequestId = randomUUID();
  const approvalStepId = randomUUID();

  await tx.$executeRawUnsafe(
    `INSERT INTO public."PettyCashRequest" (
       id, "tenantId", "companyId", "pettyCashFundId", "publicReference",
       "requestType", status, "requestedAmountPhp", purpose, justification,
       "requestedByUserId", "submittedByUserId", "submittedAt", "locationId",
       "updatedAt"
     ) VALUES (
       $1::uuid, $2::uuid, $3::uuid, $4::uuid, $5,
       'DISBURSEMENT', 'AWAITING_APPROVAL', 100, $6, $7,
       $8::uuid, $8::uuid, CURRENT_TIMESTAMP, $9::uuid, CURRENT_TIMESTAMP
     )`,
    pettyCashRequestId,
    scope.tenantId,
    scope.companyId,
    scope.pettyCashFundId,
    `AI-PCR-${scope.suffix}`,
    "Approval integrity intent fixture",
    "Approval integrity migration verification",
    scope.actorUserId,
    scope.locationId,
  );
  const approvalInstanceId = await insertApprovalInstance(tx, {
    tenantId: scope.tenantId,
    companyId: scope.companyId,
    approvalRuleId: scope.approvalRuleId,
    documentType: "PettyCashRequest",
    documentId: pettyCashRequestId,
  });
  await tx.$executeRawUnsafe(
    `INSERT INTO public."ApprovalInstanceStep" (
       id, "approvalInstanceId", "stepOrder", status
     ) VALUES ($1::uuid, $2::uuid, 1, 'PENDING')`,
    approvalStepId,
    approvalInstanceId,
  );
  await tx.$executeRawUnsafe(
    `UPDATE public."PettyCashRequest"
        SET "approvalInstanceId" = $2::uuid,
            "currentProposedAmountPhp" = ${
              options.initializeProposal === false ? "NULL" : "100"
            },
            "approvalProposalVersion" = ${
              options.initializeProposal === false ? "0" : "1"
            }
      WHERE id = $1::uuid`,
    pettyCashRequestId,
    approvalInstanceId,
  );

  return {
    ...scope,
    pettyCashRequestId,
    approvalInstanceId,
    approvalStepId,
  };
}

async function insertIntent(
  tx: Transaction,
  fixture: IntentFixture,
  overrides: Partial<{
    tenantId: string;
    companyId: string;
    pettyCashRequestId: string;
    approvalInstanceId: string;
    approvalStepId: string;
    stepOrder: number;
    requestedAmountSnapshotPhp: number;
    beforeAmountPhp: number;
    effectiveAmountPhp: number;
    actorUserId: string;
    requestVersionBefore: number;
    requestVersionAfter: number;
  }> = {},
): Promise<string> {
  const id = randomUUID();
  const input = {
    tenantId: fixture.tenantId,
    companyId: fixture.companyId,
    pettyCashRequestId: fixture.pettyCashRequestId,
    approvalInstanceId: fixture.approvalInstanceId,
    approvalStepId: fixture.approvalStepId,
    stepOrder: 1,
    requestedAmountSnapshotPhp: 100,
    beforeAmountPhp: 100,
    effectiveAmountPhp: 90,
    actorUserId: fixture.actorUserId,
    requestVersionBefore: 1,
    requestVersionAfter: 2,
    ...overrides,
  };
  await tx.$executeRawUnsafe(
    `INSERT INTO public."PettyCashApprovalStepIntent" (
       id, "tenantId", "companyId", "pettyCashRequestId",
       "approvalInstanceId", "approvalStepId", "stepOrder",
       "requestedAmountSnapshotPhp", "beforeAmountPhp", "effectiveAmountPhp",
       "actorUserId", reason, "requestVersionBefore", "requestVersionAfter",
       "decisionPayloadHash", "idempotencyKey"
     ) VALUES (
       $1::uuid, $2::uuid, $3::uuid, $4::uuid,
       $5::uuid, $6::uuid, $7,
       $8, $9, $10,
       $11::uuid, 'Approved with controlled reduction', $12, $13,
       $14, $15
     )`,
    id,
    input.tenantId,
    input.companyId,
    input.pettyCashRequestId,
    input.approvalInstanceId,
    input.approvalStepId,
    input.stepOrder,
    input.requestedAmountSnapshotPhp,
    input.beforeAmountPhp,
    input.effectiveAmountPhp,
    input.actorUserId,
    input.requestVersionBefore,
    input.requestVersionAfter,
    "a".repeat(64),
    `approval-integrity:${id}`,
  );
  return id;
}

async function expectDatabaseRejection(
  operation: () => Promise<unknown>,
  sqlState: "23505" | "23514" | "42501" | "55000",
  message: string,
): Promise<void> {
  let rejected: unknown;
  try {
    await operation();
  } catch (error) {
    rejected = error;
  }
  expect(rejected).toBeDefined();
  const databaseError = rejected as DatabaseError;
  expect(databaseError).toMatchObject({
    code: "P2010",
    meta: { code: sqlState },
  });
  expect(String(databaseError.meta?.message)).toContain(message);
}

async function expectRolledBack(entityId: string): Promise<void> {
  const rows = await prisma.$queryRawUnsafe<Array<{ rowCount: bigint }>>(
    `SELECT count(*) AS "rowCount"
       FROM public."PettyCashApprovalStepIntent"
      WHERE id = $1::uuid`,
    entityId,
  );
  expect(rows).toEqual([{ rowCount: 0n }]);
}

async function pendingApprovalIndexDefinition(): Promise<
  Array<{ indexName: string; indexDefinition: string }>
> {
  return prisma.$queryRawUnsafe(`
    SELECT indexname AS "indexName", indexdef AS "indexDefinition"
      FROM pg_catalog.pg_indexes
     WHERE schemaname = 'public'
       AND indexname = 'ApprovalInstance_one_pending_document_key'
  `);
}

describe.skipIf(!runPg).sequential(
  "approval integrity migration PostgreSQL contract",
  () => {
    afterAll(async () => {
      await prisma.$disconnect();
    });

    test("permits only one pending approval instance for the same scoped document tuple", async () => {
      await expectDatabaseRejection(
        () =>
          prisma.$transaction(async (tx) => {
            const scope = await createScope(tx, "same-tuple");
            const documentId = randomUUID();
            await insertApprovalInstance(tx, {
              tenantId: scope.tenantId,
              companyId: scope.companyId,
              approvalRuleId: scope.approvalRuleId,
              documentType: "PettyCashRequest",
              documentId,
            });
            await insertApprovalInstance(tx, {
              tenantId: scope.tenantId,
              companyId: scope.companyId,
              approvalRuleId: scope.approvalRuleId,
              documentType: "PettyCashRequest",
              documentId,
            });
          }),
        "23505",
        '"tenantId", "companyId", "documentType", "documentId"',
      );
      const indexes = await pendingApprovalIndexDefinition();
      expect(indexes).toHaveLength(1);
      expect(indexes[0]?.indexName).toBe(
        "ApprovalInstance_one_pending_document_key",
      );
      expect(indexes[0]?.indexDefinition).toContain("CREATE UNIQUE INDEX");
      expect(indexes[0]?.indexDefinition).toContain(
        'ON public."ApprovalInstance"',
      );
      expect(indexes[0]?.indexDefinition).toContain(
        '("tenantId", "companyId", "documentType", "documentId")',
      );
      expect(indexes[0]?.indexDefinition).toContain("WHERE (status = 'PENDING'");
    });

    test("keeps terminal approval history while allowing a new pending instance", async () => {
      let sentinel: unknown;
      try {
        await prisma.$transaction(async (tx) => {
          const scope = await createScope(tx, "terminal-history");
          const documentId = randomUUID();
          for (const status of [
            "APPROVED",
            "REJECTED",
            "RETURNED",
            "CANCELLED",
          ] as const) {
            await insertApprovalInstance(tx, {
              tenantId: scope.tenantId,
              companyId: scope.companyId,
              approvalRuleId: scope.approvalRuleId,
              documentType: "PettyCashRequest",
              documentId,
              status,
            });
          }
          await insertApprovalInstance(tx, {
            tenantId: scope.tenantId,
            companyId: scope.companyId,
            approvalRuleId: scope.approvalRuleId,
            documentType: "PettyCashRequest",
            documentId,
          });
          const rows = await tx.$queryRawUnsafe<Array<{ rowCount: bigint }>>(
            `SELECT count(*) AS "rowCount"
               FROM public."ApprovalInstance"
              WHERE "tenantId" = $1::uuid
                AND "companyId" = $2::uuid
                AND "documentType" = 'PettyCashRequest'
                AND "documentId" = $3::uuid`,
            scope.tenantId,
            scope.companyId,
            documentId,
          );
          expect(rows).toEqual([{ rowCount: 5n }]);
          throw new RollbackProof(documentId);
        });
      } catch (error) {
        sentinel = error;
      }
      expect(sentinel).toBeInstanceOf(RollbackProof);
    });

    test("treats tenant, company, and document type as independent pending boundaries", async () => {
      let sentinel: unknown;
      try {
        await prisma.$transaction(async (tx) => {
          const primary = await createScope(tx, "boundary-primary");
          const alternateCompany = await createCompanyRule(
            tx,
            primary.tenantId,
            "boundary-company",
          );
          const alternateTenant = await createScope(tx, "boundary-tenant");
          const documentId = randomUUID();
          const variants = [
            {
              tenantId: primary.tenantId,
              companyId: primary.companyId,
              approvalRuleId: primary.approvalRuleId,
              documentType: "PettyCashRequest",
            },
            {
              tenantId: primary.tenantId,
              companyId: alternateCompany.companyId,
              approvalRuleId: alternateCompany.approvalRuleId,
              documentType: "PettyCashRequest",
            },
            {
              tenantId: alternateTenant.tenantId,
              companyId: alternateTenant.companyId,
              approvalRuleId: alternateTenant.approvalRuleId,
              documentType: "PettyCashRequest",
            },
            {
              tenantId: primary.tenantId,
              companyId: primary.companyId,
              approvalRuleId: primary.approvalRuleId,
              documentType: "ExpenseRequest",
            },
          ];
          for (const variant of variants) {
            await insertApprovalInstance(tx, { ...variant, documentId });
          }
          const rows = await tx.$queryRawUnsafe<Array<{ rowCount: bigint }>>(
            `SELECT count(*) AS "rowCount"
               FROM public."ApprovalInstance"
              WHERE "documentId" = $1::uuid AND status = 'PENDING'`,
            documentId,
          );
          expect(rows).toEqual([{ rowCount: 4n }]);
          throw new RollbackProof(documentId);
        });
      } catch (error) {
        sentinel = error;
      }
      expect(sentinel).toBeInstanceOf(RollbackProof);
    });

    test("runtime role cannot drop the owner-created pending uniqueness guard", async () => {
      const beforeIndexes = await pendingApprovalIndexDefinition();
      expect(beforeIndexes).toHaveLength(1);
      let tenantId: string | undefined;
      let documentId: string | undefined;
      await expectDatabaseRejection(
        () =>
          prisma.$transaction(async (tx) => {
            const scope = await createScope(tx, "runtime-index-guard");
            tenantId = scope.tenantId;
            documentId = randomUUID();
            await insertApprovalInstance(tx, {
              tenantId: scope.tenantId,
              companyId: scope.companyId,
              approvalRuleId: scope.approvalRuleId,
              documentType: "PettyCashRequest",
              documentId,
            });
            await tx.$executeRawUnsafe(
              'DROP INDEX public."ApprovalInstance_one_pending_document_key"',
            );
          }),
        "42501",
        "must be owner of index",
      );
      expect(tenantId).toBeDefined();
      expect(documentId).toBeDefined();
      expect(await pendingApprovalIndexDefinition()).toEqual(beforeIndexes);
      expect(
        await prisma.$queryRawUnsafe<Array<{ rowCount: bigint }>>(
          `SELECT count(*) AS "rowCount"
             FROM public."ApprovalInstance"
            WHERE "documentId" = $1::uuid`,
          documentId,
        ),
      ).toEqual([{ rowCount: 0n }]);
      expect(
        await prisma.$queryRawUnsafe<Array<{ rowCount: bigint }>>(
          `SELECT count(*) AS "rowCount"
             FROM public."Tenant"
            WHERE id = $1::uuid`,
          tenantId,
        ),
      ).toEqual([{ rowCount: 0n }]);
    });

    test.each([
      [
        "proposal exceeds the request",
        'SET "currentProposedAmountPhp" = 101',
      ],
      ["proposal is zero", 'SET "currentProposedAmountPhp" = 0'],
      ["proposal version is zero", 'SET "approvalProposalVersion" = 0'],
      ["approval instance is absent", 'SET "approvalInstanceId" = NULL'],
      ["proposal version is negative", 'SET "approvalProposalVersion" = -1'],
    ])("rejects a PettyCashRequest when %s", async (_label, mutation) => {
      await expectDatabaseRejection(
        () =>
          prisma.$transaction(async (tx) => {
            const fixture = await createIntentFixture(tx, {
              label: `proposal-${randomUUID().slice(0, 4)}`,
            });
            await tx.$executeRawUnsafe(
              `UPDATE public."PettyCashRequest" ${mutation} WHERE id = $1::uuid`,
              fixture.pettyCashRequestId,
            );
          }),
        "23514",
        "PettyCashRequest_approval_proposal_state_check",
      );
    });

    test("keeps predecessor terminalization rollback-compatible after proposal backfill", async () => {
      let sentinel: unknown;
      let requestId: string | undefined;
      try {
        await prisma.$transaction(async (tx) => {
          const fixture = await createIntentFixture(tx, {
            label: `rollback-${randomUUID().slice(0, 4)}`,
          });
          requestId = fixture.pettyCashRequestId;
          await tx.$executeRawUnsafe(
            `UPDATE public."PettyCashRequest"
                SET status = 'DRAFT'
              WHERE id = $1::uuid`,
            requestId,
          );
          expect(
            await tx.$queryRawUnsafe<
              Array<{
                status: string;
                currentProposedAmountPhp: string;
                approvalProposalVersion: number;
              }>
            >(
              `SELECT status,
                      "currentProposedAmountPhp"::text AS "currentProposedAmountPhp",
                      "approvalProposalVersion"
                 FROM public."PettyCashRequest"
                WHERE id = $1::uuid`,
              requestId,
            ),
          ).toEqual([
            {
              status: "DRAFT",
              currentProposedAmountPhp: "100.000000",
              approvalProposalVersion: 1,
            },
          ]);
          throw new RollbackProof(requestId);
        });
      } catch (error) {
        sentinel = error;
      }

      expect(sentinel).toBeInstanceOf(RollbackProof);
      expect(requestId).toBeDefined();
      expect(
        await prisma.$queryRawUnsafe<Array<{ rowCount: bigint }>>(
          `SELECT count(*) AS "rowCount"
             FROM public."PettyCashRequest"
            WHERE id = $1::uuid`,
          requestId,
        ),
      ).toEqual([{ rowCount: 0n }]);
    });

    test("accepts a lineage-valid intent and rolls the entire proof transaction back", async () => {
      let sentinel: unknown;
      let intentId: string | undefined;
      try {
        await prisma.$transaction(async (tx) => {
          const fixture = await createIntentFixture(tx);
          intentId = await insertIntent(tx, fixture);
          const rows = await tx.$queryRawUnsafe<Array<{ rowCount: bigint }>>(
            `SELECT count(*) AS "rowCount"
               FROM public."PettyCashApprovalStepIntent"
              WHERE id = $1::uuid`,
            intentId,
          );
          expect(rows).toEqual([{ rowCount: 1n }]);
          throw new RollbackProof(intentId);
        });
      } catch (error) {
        sentinel = error;
      }
      expect(sentinel).toBeInstanceOf(RollbackProof);
      expect(intentId).toBeDefined();
      await expectRolledBack(intentId!);
    });

    test.each([
      ["before amount", { beforeAmountPhp: 99 }],
      ["request version", { requestVersionBefore: 2, requestVersionAfter: 3 }],
      ["approval step order", { stepOrder: 2 }],
      ["approval instance", { approvalInstanceId: randomUUID() }],
    ] as const)("rejects invalid %s lineage with SQLSTATE 23514", async (_label, override) => {
      await expectDatabaseRejection(
        () =>
          prisma.$transaction(async (tx) => {
            const fixture = await createIntentFixture(tx, {
              label: `lineage-${randomUUID().slice(0, 4)}`,
            });
            await insertIntent(tx, fixture, override);
          }),
        "23514",
        "PETTY_CASH_APPROVAL_INTENT_LINEAGE_INVALID",
      );
    });

    test.each(["UPDATE", "DELETE"] as const)(
      "denies runtime %s on approval intent history with SQLSTATE 42501",
      async (operation) => {
        let intentId: string | undefined;
        await expectDatabaseRejection(
          () =>
            prisma.$transaction(async (tx) => {
              const fixture = await createIntentFixture(tx, {
                label: `append-${operation.toLowerCase()}`,
              });
              intentId = await insertIntent(tx, fixture);
              if (operation === "UPDATE") {
                await tx.$executeRawUnsafe(
                  `UPDATE public."PettyCashApprovalStepIntent"
                      SET reason = 'Mutation must be rejected'
                    WHERE id = $1::uuid`,
                  intentId,
                );
              } else {
                await tx.$executeRawUnsafe(
                  `DELETE FROM public."PettyCashApprovalStepIntent"
                    WHERE id = $1::uuid`,
                  intentId,
                );
              }
            }),
          "42501",
          "permission denied for table PettyCashApprovalStepIntent",
        );
        expect(intentId).toBeDefined();
        await expectRolledBack(intentId!);
      },
    );

    test("runtime role lacks TRUNCATE privilege on approval intent history", async () => {
      let intentId: string | undefined;
      await expectDatabaseRejection(
        () =>
          prisma.$transaction(async (tx) => {
            const fixture = await createIntentFixture(tx, {
              label: "runtime-truncate-denial",
            });
            intentId = await insertIntent(tx, fixture);
            await tx.$executeRawUnsafe(
              'TRUNCATE TABLE public."PettyCashApprovalStepIntent"',
            );
          }),
        "42501",
        "permission denied for table",
      );
      expect(intentId).toBeDefined();
      await expectRolledBack(intentId!);
    });

    test("installs both approval intent triggers as ENABLE ALWAYS", async () => {
      const triggers = await prisma.$queryRawUnsafe<
        Array<{ triggerName: string; triggerEnabled: string }>
      >(`
        SELECT trigger.tgname AS "triggerName",
               trigger.tgenabled AS "triggerEnabled"
          FROM pg_catalog.pg_trigger trigger
          JOIN pg_catalog.pg_class relation ON relation.oid = trigger.tgrelid
          JOIN pg_catalog.pg_namespace namespace ON namespace.oid = relation.relnamespace
         WHERE namespace.nspname = 'public'
           AND relation.relname = 'PettyCashApprovalStepIntent'
           AND trigger.tgname IN (
             'PettyCashApprovalStepIntent_lineage_trg',
             'PettyCashApprovalStepIntent_append_only_guard_trg'
           )
         ORDER BY trigger.tgname
      `);
      expect(triggers).toEqual([
        {
          triggerName: "PettyCashApprovalStepIntent_append_only_guard_trg",
          triggerEnabled: "A",
        },
        {
          triggerName: "PettyCashApprovalStepIntent_lineage_trg",
          triggerEnabled: "A",
        },
      ]);
    });

    test("backfills only complete active proposal lineage and synthesizes zero intents", async () => {
      let sentinel: unknown;
      try {
        await prisma.$transaction(async (tx) => {
          const valid = await createIntentFixture(tx, {
            initializeProposal: false,
            label: "backfill-valid",
          });
          const incompleteRequestId = randomUUID();
          await tx.$executeRawUnsafe(
            `INSERT INTO public."PettyCashRequest" (
               id, "tenantId", "companyId", "pettyCashFundId", "publicReference",
               "requestType", status, "requestedAmountPhp", purpose, justification,
               "requestedByUserId", "submittedByUserId", "submittedAt", "locationId",
               "updatedAt"
             ) VALUES (
               $1::uuid, $2::uuid, $3::uuid, $4::uuid, $5,
               'DISBURSEMENT', 'AWAITING_APPROVAL', 75, $6, $7,
               $8::uuid, $8::uuid, CURRENT_TIMESTAMP, $9::uuid, CURRENT_TIMESTAMP
             )`,
            incompleteRequestId,
            valid.tenantId,
            valid.companyId,
            valid.pettyCashFundId,
            `AI-PCR-INCOMPLETE-${valid.suffix}`,
            "Incomplete legacy proposal",
            "No normalized approval lineage",
            valid.actorUserId,
            valid.locationId,
          );

          expect(
            await tx.$queryRawUnsafe<Array<{ rowCount: bigint }>>(
              `SELECT count(*) AS "rowCount"
                 FROM public."PettyCashApprovalStepIntent"
                WHERE "tenantId" = $1::uuid AND "companyId" = $2::uuid`,
              valid.tenantId,
              valid.companyId,
            ),
          ).toEqual([{ rowCount: 0n }]);

          await tx.$executeRawUnsafe(`
            UPDATE public."PettyCashRequest" request
               SET "currentProposedAmountPhp" = request."requestedAmountPhp",
                   "approvalProposalVersion" = 1
              FROM public."ApprovalInstance" instance
             WHERE request.status = 'AWAITING_APPROVAL'
               AND request."requestedAmountPhp" > 0
               AND request."approvalInstanceId" = instance.id
               AND instance.status = 'PENDING'
               AND instance."documentType" = 'PettyCashRequest'
               AND instance."documentId" = request.id
               AND instance."tenantId" = request."tenantId"
               AND instance."companyId" = request."companyId"
          `);

          const proposals = await tx.$queryRawUnsafe<
            Array<{
              id: string;
              proposedAmount: string | null;
              proposalVersion: number;
            }>
          >(
            `SELECT id,
                    "currentProposedAmountPhp"::text AS "proposedAmount",
                    "approvalProposalVersion" AS "proposalVersion"
               FROM public."PettyCashRequest"
              WHERE id IN ($1::uuid, $2::uuid)
              ORDER BY id`,
            valid.pettyCashRequestId,
            incompleteRequestId,
          );
          expect(proposals).toEqual(
            [
              {
                id: valid.pettyCashRequestId,
                proposedAmount: "100.000000",
                proposalVersion: 1,
              },
              {
                id: incompleteRequestId,
                proposedAmount: null,
                proposalVersion: 0,
              },
            ].sort((left, right) => left.id.localeCompare(right.id)),
          );
          expect(
            await tx.$queryRawUnsafe<Array<{ rowCount: bigint }>>(
              `SELECT count(*) AS "rowCount"
                 FROM public."PettyCashApprovalStepIntent"
                WHERE "tenantId" = $1::uuid AND "companyId" = $2::uuid`,
              valid.tenantId,
              valid.companyId,
            ),
          ).toEqual([{ rowCount: 0n }]);
          throw new RollbackProof(valid.pettyCashRequestId);
        });
      } catch (error) {
        sentinel = error;
      }
      expect(sentinel).toBeInstanceOf(RollbackProof);
    });
  },
);
