import { randomUUID } from "node:crypto";
import {
  PrismaClient,
  prisma,
  type TransactionClient,
} from "@ogfi/database";
import { beforeAll, describe, expect, test } from "vitest";
import { withApprovalProducerTransaction } from "../src/server/services/approvalProducerBarrier";

const runPg = process.env.RUN_APPROVAL_ROUTING_PG_TESTS === "true";

type ScopeFixture = {
  tenantId: string;
  companyId: string;
  otherCompanyId: string;
  approvalRuleId: string;
};

let fixture: ScopeFixture;

async function enterProducerBarrier(
  tx: TransactionClient,
  input: { tenantId: string; companyId: string; documentType: string },
) {
  await tx.$queryRaw`
    SELECT public.acquire_approval_routing_producer_barrier_shared(
      ${input.tenantId}::uuid,
      ${input.companyId}::uuid,
      ${input.documentType}::text
    )
  `;
}

async function currentAdvisoryLocks(tx: TransactionClient) {
  return tx.$queryRaw<Array<{ mode: string; lockKey: string }>>`
    SELECT mode,
           CASE
             WHEN classid::numeric * 4294967296::numeric + objid::numeric
                    >= 9223372036854775808::numeric
               THEN (
                 classid::numeric * 4294967296::numeric + objid::numeric
                 - 18446744073709551616::numeric
               )::bigint::text
             ELSE (
               classid::numeric * 4294967296::numeric + objid::numeric
             )::bigint::text
           END AS "lockKey"
      FROM pg_catalog.pg_locks
     WHERE pid = pg_backend_pid()
       AND locktype = 'advisory'
       AND objsubid = 1
       AND granted
     ORDER BY mode, classid, objid
  `;
}

describe.skipIf(!runPg).sequential(
  "DEC-0247 dormant approval producer barrier PostgreSQL contract",
  () => {
    beforeAll(async () => {
      const tenantId = randomUUID();
      const companyId = randomUUID();
      const otherCompanyId = randomUUID();
      const approvalRuleId = randomUUID();

      await prisma.tenant.create({
        data: {
          id: tenantId,
          name: "Approval Producer Barrier Tenant",
          loginCode: `approval-producer-barrier-${tenantId.slice(0, 8)}`,
        },
      });
      await prisma.company.createMany({
        data: [
          {
            id: companyId,
            tenantId,
            code: `APB-${companyId.slice(0, 8)}`,
            legalName: "Approval Producer Barrier Company",
            currencyCode: "PHP",
          },
          {
            id: otherCompanyId,
            tenantId,
            code: `APB-${otherCompanyId.slice(0, 8)}`,
            legalName: "Approval Producer Barrier Other Company",
            currencyCode: "PHP",
          },
        ],
      });
      await prisma.approvalRule.create({
        data: {
          id: approvalRuleId,
          tenantId,
          companyId,
          transactionType: "PURCHASE_REQUEST",
          priority: 1,
        },
      });
      fixture = { tenantId, companyId, otherCompanyId, approvalRuleId };
    });

    test("admits only an exact company scope and a closed producer family", async () => {
      await expect(
        prisma.$transaction(async (tx) => {
          await enterProducerBarrier(tx, {
            tenantId: fixture.tenantId,
            companyId: fixture.companyId,
            documentType: "PurchaseRequest",
          });
          const locks = await currentAdvisoryLocks(tx);
          expect(locks).toEqual([
            expect.objectContaining({ mode: "ShareLock" }),
          ]);
        }),
      ).resolves.toBeUndefined();

      await expect(
        prisma.$transaction((tx) =>
          enterProducerBarrier(tx, {
            tenantId: fixture.tenantId,
            companyId: randomUUID(),
            documentType: "PurchaseRequest",
          }),
        ),
      ).rejects.toThrow(/APPROVAL_ROUTING_PRODUCER_BARRIER_SCOPE_INVALID/);

      await expect(
        prisma.$transaction((tx) =>
          enterProducerBarrier(tx, {
            tenantId: fixture.tenantId,
            companyId: fixture.companyId,
            documentType: "NotARegisteredProducer",
          }),
        ),
      ).rejects.toThrow(/APPROVAL_ROUTING_PRODUCER_FAMILY_UNSUPPORTED/);
    });

    test("rejects invalid scope or family before invoking the producer body", async () => {
      let bodyCalls = 0;
      const action = async () => {
        bodyCalls += 1;
        return "unexpected";
      };

      await expect(
        withApprovalProducerTransaction(
          {
            tenantId: fixture.tenantId,
            companyId: randomUUID(),
            documentType: "PurchaseRequest",
          },
          action,
        ),
      ).rejects.toThrow(/APPROVAL_ROUTING_PRODUCER_BARRIER_SCOPE_INVALID/);
      expect(bodyCalls).toBe(0);

      await expect(
        withApprovalProducerTransaction(
          {
            tenantId: fixture.tenantId,
            companyId: fixture.companyId,
            documentType: "NotARegisteredProducer",
          } as never,
          action,
        ),
      ).rejects.toThrow(/APPROVAL_ROUTING_PRODUCER_FAMILY_UNSUPPORTED/);
      expect(bodyCalls).toBe(0);
    });

    test("ENABLE ALWAYS graph triggers acquire the same shared transaction lock", async () => {
      const approvalInstanceId = randomUUID();
      await prisma.$transaction(async (tx) => {
        await tx.approvalInstance.create({
          data: {
            id: approvalInstanceId,
            tenantId: fixture.tenantId,
            companyId: fixture.companyId,
            documentType: "PurchaseRequest",
            documentId: randomUUID(),
            approvalRuleId: fixture.approvalRuleId,
            status: "PENDING",
            currentStepOrder: 1,
          },
        });
        expect(await currentAdvisoryLocks(tx)).toEqual([
          expect.objectContaining({ mode: "ShareLock" }),
        ]);
      });

      await prisma.$transaction(async (tx) => {
        await tx.approvalInstanceStep.create({
          data: {
            approvalInstanceId,
            stepOrder: 1,
            status: "WAITING",
            routingSchemaVersion: 0,
          },
        });
        expect(await currentAdvisoryLocks(tx)).toEqual([
          expect.objectContaining({ mode: "ShareLock" }),
        ]);
      });
    });

    test("same-company exclusive contention fails the producer transaction while another company proceeds", async () => {
      const lockKey = await prisma.$transaction(async (tx) => {
        await enterProducerBarrier(tx, {
          tenantId: fixture.tenantId,
          companyId: fixture.companyId,
          documentType: "PurchaseRequest",
        });
        const [lock] = await currentAdvisoryLocks(tx);
        if (!lock) throw new Error("APPROVAL_ROUTING_PRODUCER_LOCK_NOT_OBSERVED");
        return lock.lockKey;
      });

      const holder = new PrismaClient();
      let releaseExclusive!: () => void;
      const released = new Promise<void>((resolve) => {
        releaseExclusive = resolve;
      });
      let exclusiveReady!: () => void;
      const ready = new Promise<void>((resolve) => {
        exclusiveReady = resolve;
      });

      const holding = holder.$transaction(async (tx) => {
        await tx.$queryRawUnsafe(
          "SELECT pg_catalog.pg_advisory_xact_lock($1::bigint)",
          lockKey,
        );
        exclusiveReady();
        await released;
      });

      await ready;
      try {
        await expect(
          prisma.$transaction((tx) =>
            enterProducerBarrier(tx, {
              tenantId: fixture.tenantId,
              companyId: fixture.companyId,
              documentType: "PurchaseRequest",
            }),
          ),
        ).rejects.toThrow(/APPROVAL_ROUTING_PRODUCER_BARRIER_RETRY/);

        await expect(
          prisma.$transaction((tx) =>
            enterProducerBarrier(tx, {
              tenantId: fixture.tenantId,
              companyId: fixture.otherCompanyId,
              documentType: "PurchaseRequest",
            }),
          ),
        ).resolves.toBeUndefined();
      } finally {
        releaseExclusive();
        await holding;
        await holder.$disconnect();
      }
    });
  },
);
