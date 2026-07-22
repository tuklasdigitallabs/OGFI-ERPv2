import { randomUUID } from "node:crypto";
import { prisma } from "@ogfi/database";
import { beforeAll, describe, expect, test } from "vitest";
import { runApprovalRoutingBackfill } from "../src/server/services/approvalRoutingBackfill";

const runPg = process.env.RUN_APPROVAL_ROUTING_PG_TESTS === "true";

type Fixture = {
  tenantId: string;
  companyId: string;
  eligibleInstanceId: string;
  eligibleStepId: string;
  blockedInstanceId: string;
  blockedStepId: string;
};

let fixture: Fixture;

async function createLegacyPurchaseRequestApproval(input: {
  tenantId: string;
  companyId: string;
  locationId: string;
  approvalRuleId: string;
  requesterUserId: string;
  assignedUserId: string;
  label: string;
}) {
  const purchaseRequestId = randomUUID();
  const approvalInstanceId = randomUUID();
  const approvalStepId = randomUUID();
  const requiredDate = new Date(Date.now() + 7 * 24 * 60 * 60_000);

  await prisma.purchaseRequest.create({
    data: {
      id: purchaseRequestId,
      publicReference: `PR-BACKFILL-${input.label}`,
      tenantId: input.tenantId,
      companyId: input.companyId,
      requestLocationId: input.locationId,
      requesterUserId: input.requesterUserId,
      requiredDate,
      urgency: "NORMAL",
      justification: "Disposable PostgreSQL approval-routing backfill evidence",
      status: "PENDING_APPROVAL",
      currentApprovalStep: 1,
    },
  });
  await prisma.approvalInstance.create({
    data: {
      id: approvalInstanceId,
      tenantId: input.tenantId,
      companyId: input.companyId,
      documentType: "PurchaseRequest",
      documentId: purchaseRequestId,
      approvalRuleId: input.approvalRuleId,
      status: "PENDING",
      currentStepOrder: 1,
      steps: {
        create: {
          id: approvalStepId,
          stepOrder: 1,
          assignedUserId: input.assignedUserId,
          status: "PENDING",
          routingSchemaVersion: 0,
        },
      },
    },
  });

  return { approvalInstanceId, approvalStepId };
}

describe.skipIf(!runPg).sequential(
  "approval routing backfill PostgreSQL contract",
  () => {
    beforeAll(async () => {
      const tenantId = randomUUID();
      const companyId = randomUUID();
      const locationId = randomUUID();
      const approverUserId = randomUUID();
      const requesterUserId = randomUUID();
      const roleId = randomUUID();
      const approvalRuleId = randomUUID();
      const permission = await prisma.permission.findUniqueOrThrow({
        where: { code: "purchasing.purchase_request.approve" },
        select: { id: true },
      });

      await prisma.tenant.create({
        data: {
          id: tenantId,
          name: "Approval Backfill PostgreSQL Tenant",
          loginCode: `approval-backfill-${tenantId.slice(0, 8)}`,
        },
      });
      await prisma.company.create({
        data: {
          id: companyId,
          tenantId,
          code: "BACKFILL-PG",
          legalName: "Approval Backfill PostgreSQL Company",
          currencyCode: "PHP",
        },
      });
      await prisma.location.create({
        data: {
          id: locationId,
          tenantId,
          companyId,
          locationType: "BRANCH",
          code: "BACKFILL-PG-LOC",
          name: "Approval Backfill PostgreSQL Location",
        },
      });
      await prisma.user.createMany({
        data: [
          {
            id: approverUserId,
            tenantId,
            email: `approver-${approverUserId}@test.invalid`,
            displayName: "Approval Backfill Approver",
          },
          {
            id: requesterUserId,
            tenantId,
            email: `requester-${requesterUserId}@test.invalid`,
            displayName: "Approval Backfill Requester",
          },
        ],
      });
      await prisma.role.create({
        data: {
          id: roleId,
          tenantId,
          code: "BACKFILL_PG_APPROVER",
          name: "Approval Backfill PostgreSQL Approver",
          permissions: {
            create: { permissionId: permission.id },
          },
        },
      });
      await prisma.userRoleAssignment.create({
        data: { userId: approverUserId, roleId },
      });
      await prisma.userScopeAssignment.create({
        data: {
          userId: approverUserId,
          scopeType: "LOCATION",
          scopeId: locationId,
          accessLevel: "APPROVE",
        },
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

      const eligible = await createLegacyPurchaseRequestApproval({
        tenantId,
        companyId,
        locationId,
        approvalRuleId,
        requesterUserId,
        assignedUserId: approverUserId,
        label: "ELIGIBLE",
      });
      const blocked = await createLegacyPurchaseRequestApproval({
        tenantId,
        companyId,
        locationId,
        approvalRuleId,
        requesterUserId,
        // The requester is prohibited and has no permission grant. The backfill
        // must roll back all routing child writes when eligibility fails.
        assignedUserId: requesterUserId,
        label: "BLOCKED",
      });
      fixture = {
        tenantId,
        companyId,
        eligibleInstanceId: eligible.approvalInstanceId,
        eligibleStepId: eligible.approvalStepId,
        blockedInstanceId: blocked.approvalInstanceId,
        blockedStepId: blocked.approvalStepId,
      };
    });

    test("dry-runs without writes, applies atomically, rolls blockers back, and reruns idempotently", async () => {
      const dryRun = await runApprovalRoutingBackfill({
        tenantId: fixture.tenantId,
        companyId: fixture.companyId,
        apply: false,
      });
      expect(dryRun).toMatchObject({
        mode: "DRY_RUN",
        scanned: 2,
        eligible: 1,
        applied: 0,
        alreadyCurrent: 0,
        blockerCounts: { CURRENT_ELIGIBLE_ACTOR_MISSING: 1 },
        hasMore: false,
      });
      expect(
        await prisma.approvalInstanceStepScopeGroup.count({
          where: {
            approvalInstanceStepId: {
              in: [fixture.eligibleStepId, fixture.blockedStepId],
            },
          },
        }),
      ).toBe(0);
      expect(
        await prisma.auditEvent.count({
          where: {
            entityType: "ApprovalInstance",
            entityId: {
              in: [fixture.eligibleInstanceId, fixture.blockedInstanceId],
            },
            eventType: "approval.step_routing_backfilled",
          },
        }),
      ).toBe(0);

      const applied = await runApprovalRoutingBackfill({
        tenantId: fixture.tenantId,
        companyId: fixture.companyId,
        apply: true,
      });
      expect(applied).toMatchObject({
        mode: "APPLY",
        scanned: 2,
        eligible: 1,
        applied: 1,
        alreadyCurrent: 0,
        blockerCounts: { CURRENT_ELIGIBLE_ACTOR_MISSING: 1 },
        hasMore: false,
      });
      expect(
        await prisma.approvalInstanceStep.findUniqueOrThrow({
          where: { id: fixture.eligibleStepId },
          select: { routingSchemaVersion: true },
        }),
      ).toEqual({ routingSchemaVersion: 1 });
      expect(
        await prisma.approvalInstanceStepScopeGroup.count({
          where: { approvalInstanceStepId: fixture.eligibleStepId },
        }),
      ).toBe(1);
      expect(
        await prisma.auditEvent.count({
          where: {
            entityType: "ApprovalInstance",
            entityId: fixture.eligibleInstanceId,
            eventType: "approval.step_routing_backfilled",
          },
        }),
      ).toBe(1);

      // Eligibility is checked after routing child creation and the v1 CAS.
      // These assertions prove the blocked instance transaction rolled back.
      expect(
        await prisma.approvalInstanceStep.findUniqueOrThrow({
          where: { id: fixture.blockedStepId },
          select: { routingSchemaVersion: true },
        }),
      ).toEqual({ routingSchemaVersion: 0 });
      expect(
        await prisma.approvalInstanceStepScopeGroup.count({
          where: { approvalInstanceStepId: fixture.blockedStepId },
        }),
      ).toBe(0);
      expect(
        await prisma.approvalInstanceStepProhibitedActor.count({
          where: { approvalInstanceStepId: fixture.blockedStepId },
        }),
      ).toBe(0);
      expect(
        await prisma.auditEvent.count({
          where: {
            entityType: "ApprovalInstance",
            entityId: fixture.blockedInstanceId,
            eventType: "approval.step_routing_backfilled",
          },
        }),
      ).toBe(0);

      const rerun = await runApprovalRoutingBackfill({
        tenantId: fixture.tenantId,
        companyId: fixture.companyId,
        apply: true,
      });
      expect(rerun).toMatchObject({
        mode: "APPLY",
        scanned: 2,
        eligible: 0,
        applied: 0,
        alreadyCurrent: 1,
        blockerCounts: { CURRENT_ELIGIBLE_ACTOR_MISSING: 1 },
        hasMore: false,
      });
      expect(
        await prisma.auditEvent.count({
          where: {
            entityType: "ApprovalInstance",
            entityId: fixture.eligibleInstanceId,
            eventType: "approval.step_routing_backfilled",
          },
        }),
      ).toBe(1);
    });

    test("rejects a concurrent worker while the transaction advisory lock is held", async () => {
      let signalLockAcquired!: () => void;
      let releaseLock!: () => void;
      const lockAcquired = new Promise<void>((resolve) => {
        signalLockAcquired = resolve;
      });
      const lockRelease = new Promise<void>((resolve) => {
        releaseLock = resolve;
      });
      const holder = prisma.$transaction(
        async (tx) => {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('ogfi:approval-routing-backfill'))`;
          signalLockAcquired();
          await lockRelease;
        },
        { timeout: 10_000 },
      );
      await lockAcquired;
      try {
        await expect(
          runApprovalRoutingBackfill({
            tenantId: fixture.tenantId,
            companyId: fixture.companyId,
            apply: false,
          }),
        ).rejects.toThrow("APPROVAL_ROUTING_BACKFILL_ALREADY_RUNNING");
      } finally {
        releaseLock();
        await holder;
      }
    });

    test("migration 18000 installs the exact partial uniqueness guard", async () => {
      const indexes = await prisma.$queryRaw<
        Array<{ indexName: string; indexDefinition: string }>
      >`
        SELECT indexname AS "indexName", indexdef AS "indexDefinition"
          FROM pg_indexes
         WHERE schemaname = 'public'
           AND indexname = 'AuditEvent_approval_routing_backfill_key'`;
      expect(indexes).toHaveLength(1);
      expect(indexes[0]?.indexDefinition).toContain("CREATE UNIQUE INDEX");
      expect(indexes[0]?.indexDefinition).toContain(
        "approval.step_routing_backfilled",
      );

      const entityId = randomUUID();
      await prisma.auditEvent.create({
        data: {
          tenantId: fixture.tenantId,
          companyId: fixture.companyId,
          actorUserId: null,
          entityType: "ApprovalInstance",
          entityId,
          eventType: "approval.step_routing_backfilled",
        },
      });
      await expect(
        prisma.auditEvent.create({
          data: {
            tenantId: fixture.tenantId,
            companyId: fixture.companyId,
            actorUserId: null,
            entityType: "ApprovalInstance",
            entityId,
            eventType: "approval.step_routing_backfilled",
          },
        }),
      ).rejects.toThrow();
      expect(
        await prisma.auditEvent.count({
          where: {
            tenantId: fixture.tenantId,
            entityType: "ApprovalInstance",
            entityId,
            eventType: "approval.step_routing_backfilled",
          },
        }),
      ).toBe(1);
    });
  },
);
