import { randomUUID } from "node:crypto";
import { Prisma, prisma } from "@ogfi/database";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import type { SessionContext } from "../src/server/services/context";
import { permissions } from "../src/server/services/authorization";
import {
  approvalDecisionPgSnapshot,
  createApprovalDecisionPgFixture,
  createSpecializedParitySource,
  type ApprovalDecisionPgFixture,
} from "./helpers/approvalDecisionPgFixtures";

const contextMock = vi.hoisted(() => ({ requireSessionContext: vi.fn() }));
vi.mock("../src/server/services/context", async () => {
  const actual = await vi.importActual<typeof import("../src/server/services/context")>(
    "../src/server/services/context",
  );
  return { ...actual, requireSessionContext: contextMock.requireSessionContext };
});

const runPg = process.env.RUN_APPROVAL_ROUTING_PG_TESTS === "true";
const pgTestTimeoutMs = 30_000;

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

function multisetDifference(values: string[], baseline: string[]) {
  const remaining = new Map<string, number>();
  for (const value of baseline) {
    remaining.set(value, (remaining.get(value) ?? 0) + 1);
  }
  return values.filter((value) => {
    const count = remaining.get(value) ?? 0;
    if (count === 0) return true;
    remaining.set(value, count - 1);
    return false;
  });
}

async function waitForCanonicalBlockedLock(input: {
  blockerPid: number;
  relation: "User" | "AuthSession" | "ApprovalInstance";
}) {
  const deadline = Date.now() + 3_000;
  while (Date.now() < deadline) {
    const rows = await prisma.$queryRaw<Array<{ pid: number; query: string }>>`
      SELECT activity.pid, activity.query
        FROM pg_stat_activity activity
       WHERE activity.datname = current_database()
         AND activity.pid <> pg_backend_pid()
         AND ${input.blockerPid}::int = ANY(pg_blocking_pids(activity.pid))
       ORDER BY activity.pid ASC
    `;
    const blocked = rows.find(({ query }) =>
      input.relation === "ApprovalInstance"
        ? /FROM "ApprovalInstance"[\s\S]*FOR UPDATE/i.test(query)
        : new RegExp(`FROM "${input.relation}"[\\s\\S]*FOR SHARE`, "i").test(query),
    );
    if (blocked) return blocked;
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  throw new Error(
    `POSTGRES_CANONICAL_LOCK_NOT_OBSERVED:${input.relation}:${input.blockerPid}`,
  );
}

async function waitForMutationBlockedByCanonicalLock(input: {
  mutationPid: number;
  decisionPid: number;
  relation: "User" | "AuthSession";
}) {
  const deadline = Date.now() + 3_000;
  while (Date.now() < deadline) {
    const rows = await prisma.$queryRaw<Array<{ mutationQuery: string; blockers: number[] }>>`
      SELECT mutation.query AS "mutationQuery",
             pg_blocking_pids(mutation.pid) AS blockers
        FROM pg_stat_activity mutation
       WHERE mutation.datname = current_database()
         AND mutation.pid = ${input.mutationPid}::int
    `;
    const blocked = rows.find(
      ({ mutationQuery, blockers }) =>
        new RegExp(`UPDATE[\\s\\S]*"${input.relation}"`, "i").test(mutationQuery) &&
        blockers.includes(input.decisionPid),
    );
    if (blocked) return blocked;
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  throw new Error(
    `POSTGRES_${input.relation.toUpperCase()}_MUTATION_LOCK_NOT_OBSERVED:${input.mutationPid}`,
  );
}

async function createPurchaseRequestFixture(steps: 1 | 2 = 1) {
  return createApprovalDecisionPgFixture({
    family: "PurchaseRequest",
    steps,
    directAssignedSteps: true,
    createSource: async (context) => {
      const source = await prisma.purchaseRequest.create({
        data: {
          publicReference: `PR-REVOCATION-${context.suffix}`,
          tenantId: context.tenantId,
          companyId: context.companyId,
          brandId: context.brandId,
          requestLocationId: context.locationId,
          requesterUserId: context.requesterUserId,
          requiredDate: new Date(Date.now() + 7 * 24 * 60 * 60_000),
          urgency: "NORMAL",
          justification: "Deterministic approval revocation fixture",
          status: "PENDING_APPROVAL",
          currentApprovalStep: 1,
        },
        select: { id: true },
      });
      return source.id;
    },
  });
}

async function createLiveSession(
  fixture: ApprovalDecisionPgFixture,
  step: 1 | 2,
) {
  const base = fixture.sessionFor(step);
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: base.user.id },
    select: { privilegeEpoch: true },
  });
  const authSession = await prisma.authSession.create({
    data: {
      tenantId: fixture.tenantId,
      userId: base.user.id,
      tokenHash: `approval-revocation-${randomUUID()}`,
      status: "ACTIVE",
      assuranceLevel: "MFA",
      mfaAuthenticatedAt: new Date(),
      privilegeEpochAtIssue: user.privilegeEpoch,
      idleExpiresAt: new Date(Date.now() + 30 * 60_000),
      absoluteExpiresAt: new Date(Date.now() + 60 * 60_000),
    },
    select: { id: true, absoluteExpiresAt: true },
  });
  return {
    ...base,
    authentication: {
      sessionId: authSession.id,
      assuranceLevel: "MFA",
      mfaAuthenticatedAt: new Date(),
      absoluteExpiresAt: authSession.absoluteExpiresAt,
    },
  } satisfies SessionContext;
}

async function createCoreAdminSession(fixture: ApprovalDecisionPgFixture) {
  const id = randomUUID();
  const roleId = randomUUID();
  const permissionRows = await prisma.permission.findMany({
    where: {
      code: { in: [permissions.coreAdminister, permissions.tenantRoleAdminister] },
    },
    select: { id: true, code: true },
  });
  expect(permissionRows.map(({ code }) => code).sort()).toEqual(
    [permissions.coreAdminister, permissions.tenantRoleAdminister].sort(),
  );
  await prisma.user.create({
    data: {
      id,
      tenantId: fixture.tenantId,
      email: `revocation-admin-${id.slice(0, 8)}@test.invalid`,
      displayName: "Revocation serialization admin",
    },
  });
  await prisma.role.create({
    data: {
      id: roleId,
      tenantId: fixture.tenantId,
      code: `REVOCATION_ADMIN_${id.slice(0, 8)}`,
      name: "Revocation serialization administrator",
      permissions: {
        create: permissionRows.map(({ id: permissionId }) => ({ permissionId })),
      },
    },
  });
  await prisma.userRoleAssignment.create({
    data: {
      userId: id,
      roleId,
      startsAt: new Date(Date.now() - 60_000),
    },
  });
  const scope = await prisma.userScopeAssignment.create({
    data: {
      userId: id,
      scopeType: "COMPANY",
      scopeId: fixture.companyId,
      accessLevel: "MANAGE",
      startsAt: new Date(Date.now() - 60_000),
    },
    select: { id: true },
  });
  const base = fixture.sessionFor(1);
  return {
    ...base,
    user: {
      id,
      email: `revocation-admin-${id.slice(0, 8)}@test.invalid`,
      displayName: "Revocation serialization admin",
      role: "Core Administrator",
    },
    authorizedLocations: [],
    permissionCodes: [permissions.coreAdminister, permissions.tenantRoleAdminister],
    context: { ...base.context },
    _scopeId: scope.id,
  } satisfies SessionContext & { _scopeId: string };
}

async function startAuditEventBarrier() {
  const ready = deferred();
  const release = deferred();
  let pid = 0;
  const blocker = prisma.$transaction(async (tx) => {
    [{ pid }] = await tx.$queryRaw<Array<{ pid: number }>>`
      SELECT pg_backend_pid() AS pid
    `;
    await tx.$executeRaw`LOCK TABLE "AuditEvent" IN ACCESS EXCLUSIVE MODE`;
    ready.resolve();
    await release.promise;
  }, { timeout: 15_000 });
  await Promise.race([ready.promise, blocker]);
  return { pid, release, blocker };
}

async function waitForAuditWriterBlocked(blockerPid: number) {
  const deadline = Date.now() + 3_000;
  while (Date.now() < deadline) {
    const rows = await prisma.$queryRaw<Array<{ pid: number; query: string }>>`
      SELECT activity.pid, activity.query
        FROM pg_stat_activity activity
       WHERE activity.datname = current_database()
         AND ${blockerPid}::int = ANY(pg_blocking_pids(activity.pid))
       ORDER BY activity.pid ASC
    `;
    const writer = rows.find(({ query }) => /INSERT[\s\S]*"AuditEvent"/i.test(query));
    if (writer) return writer.pid;
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  throw new Error(`POSTGRES_AUDIT_WRITER_NOT_OBSERVED:${blockerPid}`);
}

async function fullDecisionSnapshot(fixture: ApprovalDecisionPgFixture) {
  const stepIds = fixture.stepIds.filter((id): id is string => Boolean(id));
  const relevantEntityIds = [
    fixture.sourceId,
    ...fixture.relatedEntityIds,
    fixture.approvalInstanceId,
  ];
  const [
    source,
    lines,
    comments,
    budgetCommitments,
    instance,
    steps,
    prohibitedActors,
    scopeGroups,
    audits,
    notifications,
    approval,
  ] = await Promise.all([
    prisma.purchaseRequest.findUniqueOrThrow({
      where: { id: fixture.sourceId },
    }),
    prisma.purchaseRequestLine.findMany({
      where: { purchaseRequestId: fixture.sourceId },
      orderBy: { id: "asc" },
    }),
    prisma.purchaseRequestComment.findMany({
      where: { purchaseRequestId: fixture.sourceId },
      orderBy: { id: "asc" },
    }),
    prisma.budgetCommitment.findMany({
      where: {
        tenantId: fixture.tenantId,
        companyId: fixture.companyId,
        sourceType: "PURCHASE_REQUEST",
        sourceId: fixture.sourceId,
      },
      orderBy: { id: "asc" },
    }),
    prisma.approvalInstance.findUniqueOrThrow({
      where: { id: fixture.approvalInstanceId },
    }),
    prisma.approvalInstanceStep.findMany({
      where: { approvalInstanceId: fixture.approvalInstanceId },
      orderBy: { stepOrder: "asc" },
    }),
    prisma.approvalInstanceStepProhibitedActor.findMany({
      where: { approvalInstanceStepId: { in: stepIds } },
      orderBy: [
        { approvalInstanceStepId: "asc" },
        { userId: "asc" },
      ],
    }),
    prisma.approvalInstanceStepScopeGroup.findMany({
      where: { approvalInstanceStepId: { in: stepIds } },
      orderBy: [
        { approvalInstanceStepId: "asc" },
        { groupOrder: "asc" },
      ],
      include: { targets: { orderBy: { id: "asc" } } },
    }),
    prisma.auditEvent.findMany({
      where: {
        tenantId: fixture.tenantId,
        entityId: { in: relevantEntityIds },
      },
      orderBy: [{ occurredAt: "asc" }, { id: "asc" }],
    }),
    prisma.notification.findMany({
      where: {
        tenantId: fixture.tenantId,
        entityId: { in: relevantEntityIds },
      },
      orderBy: [{ generatedAt: "asc" }, { id: "asc" }],
    }),
    approvalDecisionPgSnapshot(fixture),
  ]);
  return {
    source,
    lines,
    comments,
    budgetCommitments,
    authorityGraph: {
      instance,
      steps,
      prohibitedActors,
      scopeGroups,
      audits,
      notifications,
    },
    approval,
  };
}

async function executeApprove(
  fixture: ApprovalDecisionPgFixture,
  session: SessionContext,
) {
  contextMock.requireSessionContext.mockResolvedValue(session);
  const { executeCanonicalApprovalDecision } = await import(
    "../src/server/services/approvals"
  );
  return executeCanonicalApprovalDecision({
    family: "PurchaseRequest",
    decision: "APPROVE",
    approvalInstanceId: fixture.approvalInstanceId,
  });
}

type RevocationMutation = (
  tx: Prisma.TransactionClient,
  fixture: ApprovalDecisionPgFixture,
  session: SessionContext,
) => Promise<void>;

async function runRevocationFirst(input: {
  fixture: ApprovalDecisionPgFixture;
  session: SessionContext;
  relation: "User" | "AuthSession";
  expectedError: "APPROVAL_AUTHORITY_STALE" | "APPROVAL_NEXT_STEP_RECIPIENT_NOT_AVAILABLE";
  mutate: RevocationMutation;
}) {
  const before = await fullDecisionSnapshot(input.fixture);
  const ready = deferred();
  const release = deferred();
  let blockerPid = 0;
  const mutation = prisma.$transaction(async (tx) => {
    [{ pid: blockerPid }] = await tx.$queryRaw<Array<{ pid: number }>>`
      SELECT pg_backend_pid() AS pid
    `;
    await input.mutate(tx, input.fixture, input.session);
    ready.resolve();
    await release.promise;
  }, { timeout: 15_000 });
  let decision: Promise<unknown> | undefined;
  let observationError: unknown;
  try {
    await Promise.race([ready.promise, mutation]);
    decision = executeApprove(input.fixture, input.session);
    const blocked = await waitForCanonicalBlockedLock({
      blockerPid,
      relation: input.relation,
    });
    expect(blocked.query).toMatch(/FOR SHARE/i);
  } catch (error) {
    observationError = error;
  } finally {
    release.resolve();
  }
  const outcomes = await Promise.allSettled([
    mutation,
    ...(decision ? [decision] : []),
  ]);
  if (observationError) throw observationError;
  expect(outcomes[0]?.status).toBe("fulfilled");
  expect(outcomes[1]).toMatchObject({
    status: "rejected",
    reason: expect.objectContaining({ message: input.expectedError }),
  });
  expect(await fullDecisionSnapshot(input.fixture)).toEqual(before);
}

async function lockUserForPrivilegeMutation(
  tx: Prisma.TransactionClient,
  fixture: ApprovalDecisionPgFixture,
  userId: string,
) {
  const users = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM "User"
     WHERE id = ${userId}::uuid
       AND "tenantId" = ${fixture.tenantId}::uuid
     FOR UPDATE
  `;
  expect(users).toEqual([{ id: userId }]);
}

describe.skipIf(!runPg).sequential(
  "canonical approval decision PostgreSQL revocation serialization",
  () => {
    let previousRoutingFlag: string | undefined;

    beforeAll(() => {
      previousRoutingFlag = process.env.APPROVAL_ROUTING_V1_ENABLED;
      process.env.APPROVAL_ROUTING_V1_ENABLED = "true";
    });

    afterAll(async () => {
      if (previousRoutingFlag === undefined) {
        delete process.env.APPROVAL_ROUTING_V1_ENABLED;
      } else {
        process.env.APPROVAL_ROUTING_V1_ENABLED = previousRoutingFlag;
      }
      await prisma.$disconnect();
    });

    test("User deactivation wins before decision and preserves the complete workflow snapshot", async () => {
      const fixture = await createPurchaseRequestFixture();
      const session = fixture.sessionFor(1);
      await runRevocationFirst({
        fixture,
        session,
        relation: "User",
        expectedError: "APPROVAL_AUTHORITY_STALE",
        mutate: async (tx) => {
          await tx.user.update({
            where: { id: session.user.id },
            data: { status: "INACTIVE", privilegeEpoch: { increment: 1 } },
          });
        },
      });
    }, pgTestTimeoutMs);

    test("User privilege-epoch change invalidates a real acting session before decision", async () => {
      const fixture = await createPurchaseRequestFixture();
      const session = await createLiveSession(fixture, 1);
      await runRevocationFirst({
        fixture,
        session,
        relation: "User",
        expectedError: "APPROVAL_AUTHORITY_STALE",
        mutate: async (tx) => {
          await tx.user.update({
            where: { id: session.user.id },
            data: { privilegeEpoch: { increment: 1 } },
          });
        },
      });
    }, pgTestTimeoutMs);

    test.each([
      ["revoked", { status: "REVOKED", revokedAt: new Date(), revocationReason: "deterministic test revocation" }],
      ["epoch-mismatched", { privilegeEpochAtIssue: { increment: 1 } }],
    ] as const)("real AuthSession %s wins before decision", async (_label, data) => {
      const fixture = await createPurchaseRequestFixture();
      const session = await createLiveSession(fixture, 1);
      await runRevocationFirst({
        fixture,
        session,
        relation: "AuthSession",
        expectedError: "APPROVAL_AUTHORITY_STALE",
        mutate: async (tx) => {
          await tx.authSession.update({
            where: { id: session.authentication!.sessionId },
            data,
          });
        },
      });
    }, pgTestTimeoutMs);

    test("permission-removal serialization composes with the registered production updateRolePermissions concurrency gate", async () => {
      const fixture = await createPurchaseRequestFixture();
      const session = fixture.sessionFor(1);
      const assignment = await prisma.userRoleAssignment.findFirstOrThrow({
        where: { userId: session.user.id },
        select: { roleId: true },
      });
      const permission = await prisma.permission.findUniqueOrThrow({
        where: { code: session.permissionCodes[0] },
        select: { id: true },
      });
      await runRevocationFirst({
        fixture,
        session,
        relation: "User",
        expectedError: "APPROVAL_AUTHORITY_STALE",
        mutate: async (tx) => {
          // This is intentionally only the canonical-approval half of the
          // compositional proof. The registered
          // authorizationCoreAdminRolePermissionConcurrency.integration.test.ts
          // executes updateRolePermissions with real privileged-MFA evidence
          // and proves its Role -> sorted User -> AuthSession lock contract.
          // Here that exact Role -> User -> permission -> epoch order is held
          // open so the approval decision's User FOR SHARE lock is observable.
          await tx.$queryRaw`
            SELECT id FROM "Role"
             WHERE id = ${assignment.roleId}::uuid
             FOR UPDATE
          `;
          await lockUserForPrivilegeMutation(tx, fixture, session.user.id);
          await tx.rolePermission.delete({
            where: { roleId_permissionId: { roleId: assignment.roleId, permissionId: permission.id } },
          });
          await tx.user.update({
            where: { id: session.user.id },
            data: { privilegeEpoch: { increment: 1 } },
          });
        },
      });
    }, pgTestTimeoutMs);

    test("role-assignment loss uses the User privilege fence and wins before decision", async () => {
      const fixture = await createPurchaseRequestFixture();
      const session = fixture.sessionFor(1);
      const admin = await createCoreAdminSession(fixture);
      const assignment = await prisma.userRoleAssignment.findFirstOrThrow({
        where: { userId: session.user.id },
        select: { id: true, roleId: true },
      });
      const [before, targetBefore, invalidationsBefore] = await Promise.all([
        fullDecisionSnapshot(fixture),
        prisma.user.findUniqueOrThrow({
          where: { id: session.user.id },
          select: { privilegeEpoch: true },
        }),
        prisma.authSessionInvalidation.count({
          where: { targetUserId: session.user.id },
        }),
      ]);
      const auditBarrier = await startAuditEventBarrier();
      let command: Promise<unknown> | undefined;
      let decision: Promise<unknown> | undefined;
      let observationError: unknown;
      try {
        contextMock.requireSessionContext.mockResolvedValue(admin);
        const { deactivateUserRoleAssignment } = await import(
          "../src/server/services/coreAdmin"
        );
        const form = new FormData();
        form.set("targetUserId", session.user.id);
        form.set("assignmentId", assignment.id);
        form.set("reason", "Deterministic production role authority revocation");
        command = deactivateUserRoleAssignment(form);
        const commandPid = await waitForAuditWriterBlocked(auditBarrier.pid);
        decision = executeApprove(fixture, session);
        await waitForCanonicalBlockedLock({ blockerPid: commandPid, relation: "User" });
      } catch (error) {
        observationError = error;
      } finally {
        auditBarrier.release.resolve();
      }
      const outcomes = await Promise.allSettled([
        auditBarrier.blocker,
        ...(command ? [command] : []),
        ...(decision ? [decision] : []),
      ]);
      if (observationError) throw observationError;
      expect(outcomes[0]?.status).toBe("fulfilled");
      expect(outcomes[1]?.status).toBe("fulfilled");
      expect(outcomes[2]).toMatchObject({
        status: "rejected",
        reason: expect.objectContaining({ message: "APPROVAL_AUTHORITY_STALE" }),
      });
      expect(await fullDecisionSnapshot(fixture)).toEqual(before);
      const [assignmentAfter, targetAfter, invalidationsAfter, serviceAudits] =
        await Promise.all([
          prisma.userRoleAssignment.findUniqueOrThrow({
            where: { id: assignment.id },
            select: { status: true, endsAt: true },
          }),
          prisma.user.findUniqueOrThrow({
            where: { id: session.user.id },
            select: { privilegeEpoch: true },
          }),
          prisma.authSessionInvalidation.count({
            where: { targetUserId: session.user.id },
          }),
          prisma.auditEvent.findMany({
            where: {
              tenantId: fixture.tenantId,
              entityType: "UserRoleAssignment",
              entityId: assignment.id,
              eventType: "user_role_assignment.deactivated",
            },
            select: { actorUserId: true, eventType: true },
          }),
        ]);
      expect(assignmentAfter).toEqual({ status: "INACTIVE", endsAt: expect.any(Date) });
      expect(targetAfter.privilegeEpoch).toBe(targetBefore.privilegeEpoch + 1);
      expect(invalidationsAfter).toBe(invalidationsBefore + 1);
      expect(serviceAudits).toEqual([{
        actorUserId: admin.user.id,
        eventType: "user_role_assignment.deactivated",
      }]);
    }, pgTestTimeoutMs);

    test("scope loss uses the User privilege fence and wins before decision", async () => {
      const fixture = await createPurchaseRequestFixture();
      const session = fixture.sessionFor(1);
      const admin = await createCoreAdminSession(fixture);
      // The shared fixture grants both company and location scope. Retire the
      // alternate company grant before the race so the production-shaped
      // single-assignment deactivation below removes the last live scope.
      await prisma.userScopeAssignment.updateMany({
        where: {
          userId: session.user.id,
          scopeType: "COMPANY",
          status: "ACTIVE",
        },
        data: { status: "INACTIVE", endsAt: new Date() },
      });
      const locationScope = await prisma.userScopeAssignment.findFirstOrThrow({
        where: {
          userId: session.user.id,
          scopeType: "LOCATION",
          scopeId: fixture.locationId,
          status: "ACTIVE",
        },
        select: { id: true },
      });
      const [before, targetBefore, invalidationsBefore] = await Promise.all([
        fullDecisionSnapshot(fixture),
        prisma.user.findUniqueOrThrow({
          where: { id: session.user.id },
          select: { privilegeEpoch: true },
        }),
        prisma.authSessionInvalidation.count({
          where: { targetUserId: session.user.id },
        }),
      ]);
      const auditBarrier = await startAuditEventBarrier();
      let command: Promise<unknown> | undefined;
      let decision: Promise<unknown> | undefined;
      let observationError: unknown;
      try {
        contextMock.requireSessionContext.mockResolvedValue(admin);
        const { deactivateUserScopeAssignment } = await import(
          "../src/server/services/coreAdmin"
        );
        const form = new FormData();
        form.set("targetUserId", session.user.id);
        form.set("assignmentId", locationScope.id);
        form.set("reason", "Deterministic production scope authority revocation");
        command = deactivateUserScopeAssignment(form);
        const commandPid = await waitForAuditWriterBlocked(auditBarrier.pid);
        decision = executeApprove(fixture, session);
        await waitForCanonicalBlockedLock({ blockerPid: commandPid, relation: "User" });
      } catch (error) {
        observationError = error;
      } finally {
        auditBarrier.release.resolve();
      }
      const outcomes = await Promise.allSettled([
        auditBarrier.blocker,
        ...(command ? [command] : []),
        ...(decision ? [decision] : []),
      ]);
      if (observationError) throw observationError;
      expect(outcomes[0]?.status).toBe("fulfilled");
      expect(outcomes[1]?.status).toBe("fulfilled");
      expect(outcomes[2]).toMatchObject({
        status: "rejected",
        reason: expect.objectContaining({ message: "APPROVAL_AUTHORITY_STALE" }),
      });
      expect(await fullDecisionSnapshot(fixture)).toEqual(before);
      const [assignmentAfter, targetAfter, invalidationsAfter, serviceAudits] =
        await Promise.all([
          prisma.userScopeAssignment.findUniqueOrThrow({
            where: { id: locationScope.id },
            select: { status: true, endsAt: true },
          }),
          prisma.user.findUniqueOrThrow({
            where: { id: session.user.id },
            select: { privilegeEpoch: true },
          }),
          prisma.authSessionInvalidation.count({
            where: { targetUserId: session.user.id },
          }),
          prisma.auditEvent.findMany({
            where: {
              tenantId: fixture.tenantId,
              entityType: "UserScopeAssignment",
              entityId: locationScope.id,
              eventType: "user_scope_assignment.deactivated",
            },
            select: { actorUserId: true, eventType: true },
          }),
        ]);
      expect(assignmentAfter).toEqual({ status: "INACTIVE", endsAt: expect.any(Date) });
      expect(targetAfter.privilegeEpoch).toBe(targetBefore.privilegeEpoch + 1);
      expect(invalidationsAfter).toBe(invalidationsBefore + 1);
      expect(serviceAudits).toEqual([{
        actorUserId: admin.user.id,
        eventType: "user_scope_assignment.deactivated",
      }]);
    }, pgTestTimeoutMs);

    test("direct next-recipient authority loss wins before a two-step decision", async () => {
      const fixture = await createPurchaseRequestFixture(2);
      const session = fixture.sessionFor(1);
      await runRevocationFirst({
        fixture,
        session,
        relation: "User",
        expectedError: "APPROVAL_NEXT_STEP_RECIPIENT_NOT_AVAILABLE",
        mutate: async (tx) => {
          await tx.user.update({
            where: { id: fixture.approverUserIds[1] },
            data: { status: "INACTIVE", privilegeEpoch: { increment: 1 } },
          });
        },
      });
    }, pgTestTimeoutMs);

    test("specialized ExpenseRequest adapter uses the same canonical User revocation fence", async () => {
      const fixture = await createApprovalDecisionPgFixture({
        family: "ExpenseRequest",
        steps: 1,
        directAssignedSteps: true,
        createSource: (context) =>
          createSpecializedParitySource("ExpenseRequest", context),
      });
      await prisma.expenseRequest.update({
        where: { id: fixture.sourceId },
        data: { approvalInstanceId: fixture.approvalInstanceId },
      });
      const session = fixture.sessionFor(1);
      const before = await Promise.all([
        prisma.expenseRequest.findUniqueOrThrow({
          where: { id: fixture.sourceId },
          select: {
            status: true,
            version: true,
            updatedAt: true,
            approvalInstanceId: true,
          },
        }),
        approvalDecisionPgSnapshot(fixture),
        prisma.budgetCommitment.findMany({
          where: { tenantId: fixture.tenantId, companyId: fixture.companyId },
          orderBy: { id: "asc" },
          select: {
            id: true,
            status: true,
            committedAmountPhp: true,
            consumedAmountPhp: true,
            releasedAmountPhp: true,
          },
        }),
      ]);
      expect(before[0].approvalInstanceId).toBe(fixture.approvalInstanceId);
      const ready = deferred();
      const release = deferred();
      let blockerPid = 0;
      const revocation = prisma.$transaction(async (tx) => {
        [{ pid: blockerPid }] = await tx.$queryRaw<Array<{ pid: number }>>`
          SELECT pg_backend_pid() AS pid
        `;
        await tx.user.update({
          where: { id: session.user.id },
          data: { status: "INACTIVE", privilegeEpoch: { increment: 1 } },
        });
        ready.resolve();
        await release.promise;
      }, { timeout: 15_000 });
      let decision: Promise<unknown> | undefined;
      let observationError: unknown;
      try {
        await Promise.race([ready.promise, revocation]);
        contextMock.requireSessionContext.mockResolvedValue(session);
        const { executeCanonicalApprovalDecision } = await import(
          "../src/server/services/approvals"
        );
        decision = executeCanonicalApprovalDecision({
          family: "ExpenseRequest",
          decision: "APPROVE",
          approvalInstanceId: fixture.approvalInstanceId,
        });
        await waitForCanonicalBlockedLock({ blockerPid, relation: "User" });
      } catch (error) {
        observationError = error;
      } finally {
        release.resolve();
      }
      const outcomes = await Promise.allSettled([
        revocation,
        ...(decision ? [decision] : []),
      ]);
      if (observationError) throw observationError;
      expect(outcomes[0]?.status).toBe("fulfilled");
      expect(outcomes[1]).toMatchObject({
        status: "rejected",
        reason: expect.objectContaining({ message: "APPROVAL_AUTHORITY_STALE" }),
      });
      expect(await Promise.all([
        prisma.expenseRequest.findUniqueOrThrow({
          where: { id: fixture.sourceId },
          select: {
            status: true,
            version: true,
            updatedAt: true,
            approvalInstanceId: true,
          },
        }),
        approvalDecisionPgSnapshot(fixture),
        prisma.budgetCommitment.findMany({
          where: { tenantId: fixture.tenantId, companyId: fixture.companyId },
          orderBy: { id: "asc" },
          select: {
            id: true,
            status: true,
            committedAmountPhp: true,
            consumedAmountPhp: true,
            releasedAmountPhp: true,
          },
        }),
      ])).toEqual(before);
    }, pgTestTimeoutMs);

    async function runDecisionFirst(input: {
      target: "actor" | "next-recipient" | "auth-session";
    }) {
      const fixture = await createPurchaseRequestFixture(
        input.target === "next-recipient" ? 2 : 1,
      );
      const session = input.target === "auth-session"
        ? await createLiveSession(fixture, 1)
        : fixture.sessionFor(1);
      const targetUserId = input.target === "next-recipient"
        ? fixture.approverUserIds[1]
        : session.user.id;
      const authorityBefore = input.target === "auth-session"
        ? {
            kind: "session" as const,
            value: await prisma.authSession.findUniqueOrThrow({
              where: { id: session.authentication!.sessionId },
              select: {
                status: true,
                revokedAt: true,
                revocationReason: true,
              },
            }),
          }
        : {
            kind: "user" as const,
            value: await prisma.user.findUniqueOrThrow({
              where: { id: targetUserId },
              select: { status: true, privilegeEpoch: true },
            }),
          };
      const before = await fullDecisionSnapshot(fixture);
      const graphReady = deferred();
      const releaseGraph = deferred();
      let graphBlockerPid = 0;
      const graphBlocker = prisma.$transaction(async (tx) => {
        [{ pid: graphBlockerPid }] = await tx.$queryRaw<Array<{ pid: number }>>`
          SELECT pg_backend_pid() AS pid
        `;
        await tx.$queryRaw`
          SELECT id FROM "ApprovalInstance"
           WHERE id = ${fixture.approvalInstanceId}::uuid
           FOR UPDATE
        `;
        graphReady.resolve();
        await releaseGraph.promise;
      }, { timeout: 15_000 });
      let observationError: unknown;
      let decision: Promise<unknown> | undefined;
      let mutation: Promise<unknown> | undefined;
      try {
        await Promise.race([graphReady.promise, graphBlocker]);
        decision = executeApprove(fixture, session);
        const blockedDecision = await waitForCanonicalBlockedLock({
          blockerPid: graphBlockerPid,
          relation: "ApprovalInstance",
        });

        const mutationReady = deferred();
        let mutationPid = 0;
        mutation = prisma.$transaction(async (tx) => {
          [{ pid: mutationPid }] = await tx.$queryRaw<Array<{ pid: number }>>`
            SELECT pg_backend_pid() AS pid
          `;
          mutationReady.resolve();
          if (input.target === "auth-session") {
            await tx.authSession.update({
              where: { id: session.authentication!.sessionId },
              data: {
                status: "REVOKED",
                revokedAt: new Date(),
                revocationReason: "decision-first deterministic revocation",
              },
            });
          } else {
            await tx.user.update({
              where: { id: targetUserId },
              data: { status: "INACTIVE", privilegeEpoch: { increment: 1 } },
            });
          }
        }, { timeout: 15_000 });
        await Promise.race([mutationReady.promise, mutation]);
        await waitForMutationBlockedByCanonicalLock({
          mutationPid,
          decisionPid: blockedDecision.pid,
          relation: input.target === "auth-session" ? "AuthSession" : "User",
        });
      } catch (error) {
        observationError = error;
      } finally {
        releaseGraph.resolve();
      }
      const outcomes = await Promise.allSettled([
        graphBlocker,
        ...(decision ? [decision] : []),
        ...(mutation ? [mutation] : []),
      ]);
      if (observationError) throw observationError;
      for (const outcome of outcomes) {
        if (outcome.status === "rejected") throw outcome.reason;
      }

      const terminal = await fullDecisionSnapshot(fixture);
      expect(terminal.source).toEqual(expect.objectContaining({
        status: input.target === "next-recipient" ? "PENDING_APPROVAL" : "APPROVED",
        currentApprovalStep: input.target === "next-recipient" ? 2 : null,
        version: before.source.version + 1,
        updatedAt: expect.any(Date),
      }));
      if (authorityBefore.kind === "session") {
        expect(authorityBefore.value).toEqual({
          status: "ACTIVE",
          revokedAt: null,
          revocationReason: null,
        });
        await expect(prisma.authSession.findUniqueOrThrow({
          where: { id: session.authentication!.sessionId },
          select: {
            status: true,
            revokedAt: true,
            revocationReason: true,
          },
        })).resolves.toEqual({
          status: "REVOKED",
          revokedAt: expect.any(Date),
          revocationReason: "decision-first deterministic revocation",
        });
      } else {
        expect(authorityBefore.value.status).toBe("ACTIVE");
        await expect(prisma.user.findUniqueOrThrow({
          where: { id: targetUserId },
          select: { status: true, privilegeEpoch: true },
        })).resolves.toEqual({
          status: "INACTIVE",
          privilegeEpoch: authorityBefore.value.privilegeEpoch + 1,
        });
      }
      expect(terminal.approval.instance).toEqual(
        input.target === "next-recipient"
          ? { status: "PENDING", currentStepOrder: 2 }
          : { status: "APPROVED", currentStepOrder: null },
      );
      expect(terminal.approval.steps).toEqual(
        input.target === "next-recipient"
          ? [
              expect.objectContaining({ stepOrder: 1, status: "APPROVED", actedByUserId: session.user.id, actedAt: expect.any(Date) }),
              expect.objectContaining({ stepOrder: 2, status: "PENDING", actedByUserId: null, actedAt: null }),
            ]
          : [expect.objectContaining({ stepOrder: 1, status: "APPROVED", actedByUserId: session.user.id, actedAt: expect.any(Date) })],
      );
      const addedAuditTypes = multisetDifference(
        terminal.approval.audits.map(({ eventType }) => eventType),
        before.approval.audits.map(({ eventType }) => eventType),
      );
      expect(addedAuditTypes.sort()).toEqual(
        input.target === "next-recipient"
          ? ["approval.step_activated", "purchase_request.approval_step_approved"].sort()
          : ["purchase_request.approval_step_approved", "purchase_request.approved"].sort(),
      );
      const addedNotifications = terminal.approval.notifications.slice(
        before.approval.notifications.length,
      );
      expect(addedNotifications).toHaveLength(1);
      // The snapshot deliberately exposes routing metadata only; notification
      // title/body and source justification never enter concurrency evidence.
      expect(Object.keys(addedNotifications[0]!).sort()).toEqual([
        "deepLink",
        "entityId",
        "entityType",
        "notificationType",
        "priority",
        "recipientUserId",
        "sourceEventKey",
      ].sort());
      expect(addedNotifications[0]).toMatchObject(
        input.target === "next-recipient"
          ? {
              notificationType: "APPROVAL_STEP_READY",
              recipientUserId: fixture.approverUserIds[1],
              entityId: fixture.sourceId,
              sourceEventKey: `approval:${fixture.approvalInstanceId}:step:2:ready`,
              deepLink: `/approvals/${fixture.approvalInstanceId}`,
            }
          : {
              notificationType: "APPROVAL_OUTCOME_APPROVED",
              recipientUserId: fixture.requesterUserId,
              entityId: fixture.sourceId,
              sourceEventKey: `approval:${fixture.approvalInstanceId}:outcome:APPROVED`,
              deepLink: `/approvals/${fixture.approvalInstanceId}`,
            },
      );
    }

    test("decision-first actor serialization commits the decision before revocation without deadlock", async () => {
      await runDecisionFirst({ target: "actor" });
    }, pgTestTimeoutMs);

    test("decision-first next-recipient serialization commits activation before authority loss without deadlock", async () => {
      await runDecisionFirst({ target: "next-recipient" });
    }, pgTestTimeoutMs);

    test("decision-first AuthSession serialization commits the decision before session revocation", async () => {
      await runDecisionFirst({ target: "auth-session" });
    }, pgTestTimeoutMs);
  },
);
