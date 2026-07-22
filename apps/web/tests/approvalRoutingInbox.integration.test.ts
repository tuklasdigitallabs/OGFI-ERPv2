import { randomUUID } from "node:crypto";
import { prisma } from "@ogfi/database";
import { beforeAll, describe, expect, test } from "vitest";
import {
  configureApprovalStepRouting,
  listEligibleApprovalStepPage,
} from "../src/server/services/approvalRouting";
import { approvalRoutingPolicies } from "../src/server/services/approvalRoutingRegistry";
import type { SessionContext } from "../src/server/services/context";

const runPg = process.env.RUN_APPROVAL_ROUTING_PG_TESTS === "true";
const NOW = new Date("2026-07-22T04:00:00.000Z");
const DUE_CUTOFF = new Date("2026-07-23T04:00:00.000Z");

type Actor = {
  userId: string;
  roleId: string;
  assignmentId: string;
};

type Fixture = {
  tenantId: string;
  companyId: string;
  brandId: string;
  firstLocationId: string;
  secondLocationId: string;
  permissionId: string;
  approvalRuleId: string;
  direct: Actor;
  roleOnly: Actor;
  anyScope: Actor;
  allScope: Actor;
  prohibited: Actor;
  revokedPermission: Actor;
  revokedRole: Actor;
  revokedAssignment: Actor;
  expiredAssignment: Actor;
  revokedScope: Actor;
  pagination: Actor;
  directStepId: string;
  roleOnlyStepId: string;
  anyScopeStepId: string;
  allScopeStepId: string;
  prohibitedStepId: string;
  revokedPermissionStepId: string;
  revokedRoleStepId: string;
  revokedAssignmentStepId: string;
  expiredAssignmentStepId: string;
  revokedScopeStepId: string;
  paginationStepIds: string[];
};

let fixture: Fixture;

function sessionFor(actor: Actor): SessionContext {
  return {
    user: {
      id: actor.userId,
      email: `${actor.userId}@test.invalid`,
      displayName: "Approval routing PostgreSQL actor",
      role: "Approver",
    },
    context: {
      tenantId: fixture.tenantId,
      companyId: fixture.companyId,
      companyName: "Approval Inbox PostgreSQL Company",
      brandId: fixture.brandId,
      brandName: "Approval Inbox PostgreSQL Brand",
      locationId: fixture.firstLocationId,
      locationName: "Approval Inbox PostgreSQL Location A",
      locationType: "BRANCH",
    },
    authorizedLocations: [],
    permissionCodes: ["purchasing.purchase_request.approve"],
  };
}

async function createActor(input: {
  tenantId: string;
  permissionId: string;
  label: string;
  scopeIds: string[];
}) {
  const userId = randomUUID();
  const roleId = randomUUID();
  await prisma.user.create({
    data: {
      id: userId,
      tenantId: input.tenantId,
      email: `${input.label}-${userId}@test.invalid`,
      displayName: `Approval Inbox ${input.label}`,
    },
  });
  await prisma.role.create({
    data: {
      id: roleId,
      tenantId: input.tenantId,
      code: `PG_${input.label}_${roleId.slice(0, 8)}`,
      name: `Approval Inbox ${input.label}`,
      permissions: { create: { permissionId: input.permissionId } },
    },
  });
  const assignment = await prisma.userRoleAssignment.create({
    data: {
      userId,
      roleId,
      startsAt: new Date("2026-07-01T00:00:00.000Z"),
    },
    select: { id: true },
  });
  await prisma.userScopeAssignment.createMany({
    data: input.scopeIds.map((scopeId) => ({
      userId,
      scopeType: "LOCATION" as const,
      scopeId,
      accessLevel: "APPROVE" as const,
      startsAt: new Date("2026-07-01T00:00:00.000Z"),
    })),
  });
  return { userId, roleId, assignmentId: assignment.id };
}

async function createRoutedStep(input: {
  actor: Actor;
  assignment: "USER" | "ROLE";
  activatedAt: Date;
  dueAt?: Date | null;
  scopeGroups: Array<{
    groupOrder: number;
    targetMatchMode: "ANY" | "ALL";
    locationIds: string[];
  }>;
  prohibitedUserId?: string;
}) {
  const instanceId = randomUUID();
  const stepId = randomUUID();
  await prisma.approvalInstance.create({
    data: {
      id: instanceId,
      tenantId: fixture.tenantId,
      companyId: fixture.companyId,
      documentType: "PurchaseRequest",
      documentId: randomUUID(),
      approvalRuleId: fixture.approvalRuleId,
      status: "PENDING",
      currentStepOrder: 1,
      steps: {
        create: {
          id: stepId,
          stepOrder: 1,
          status: "PENDING",
          assignedUserId:
            input.assignment === "USER" ? input.actor.userId : null,
          assignedRoleId:
            input.assignment === "ROLE" ? input.actor.roleId : null,
        },
      },
    },
  });
  await prisma.$transaction((tx) =>
    configureApprovalStepRouting(tx, {
      approvalInstanceStepId: stepId,
      tenantId: fixture.tenantId,
      companyId: fixture.companyId,
      routingPolicy: approvalRoutingPolicies.PurchaseRequest,
      requiredPermissionCode: "purchasing.purchase_request.approve",
      activatedAt: input.activatedAt,
      dueAt: input.dueAt,
      activationAudit: {
        actorUserId: null,
        source: "approval-inbox-postgresql-matrix",
      },
      scopeGroups: input.scopeGroups.map((group) => ({
        groupOrder: group.groupOrder,
        targetMatchMode: group.targetMatchMode,
        targets: group.locationIds.map((locationId) => ({
          scopeType: "LOCATION" as const,
          companyId: fixture.companyId,
          brandId: fixture.brandId,
          locationId,
        })),
      })),
      prohibitedActors: input.prohibitedUserId
        ? [{ userId: input.prohibitedUserId, reasonCode: "REQUESTER" }]
        : [],
    }),
  );
  return stepId;
}

describe.skipIf(!runPg).sequential(
  "normalized Approval Inbox PostgreSQL eligibility matrix",
  () => {
    beforeAll(async () => {
      const tenantId = randomUUID();
      const companyId = randomUUID();
      const brandId = randomUUID();
      const firstLocationId = randomUUID();
      const secondLocationId = randomUUID();
      const approvalRuleId = randomUUID();
      const permission = await prisma.permission.findUniqueOrThrow({
        where: { code: "purchasing.purchase_request.approve" },
        select: { id: true },
      });

      await prisma.tenant.create({
        data: {
          id: tenantId,
          name: "Approval Inbox PostgreSQL Tenant",
          loginCode: `approval-inbox-${tenantId.slice(0, 8)}`,
        },
      });
      await prisma.company.create({
        data: {
          id: companyId,
          tenantId,
          code: "APPROVAL-INBOX-PG",
          legalName: "Approval Inbox PostgreSQL Company",
          currencyCode: "PHP",
        },
      });
      await prisma.brand.create({
        data: {
          id: brandId,
          tenantId,
          companyId,
          code: "APPROVAL-INBOX-PG",
          name: "Approval Inbox PostgreSQL Brand",
        },
      });
      await prisma.location.createMany({
        data: [
          {
            id: firstLocationId,
            tenantId,
            companyId,
            brandId,
            locationType: "BRANCH",
            code: "APPROVAL-INBOX-A",
            name: "Approval Inbox PostgreSQL Location A",
          },
          {
            id: secondLocationId,
            tenantId,
            companyId,
            brandId,
            locationType: "BRANCH",
            code: "APPROVAL-INBOX-B",
            name: "Approval Inbox PostgreSQL Location B",
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

      const actorInput = { tenantId, permissionId: permission.id };
      const direct = await createActor({
        ...actorInput,
        label: "DIRECT",
        scopeIds: [firstLocationId],
      });
      const roleOnly = await createActor({
        ...actorInput,
        label: "ROLE",
        scopeIds: [firstLocationId],
      });
      const anyScope = await createActor({
        ...actorInput,
        label: "ANY",
        scopeIds: [firstLocationId],
      });
      const allScope = await createActor({
        ...actorInput,
        label: "ALL",
        scopeIds: [firstLocationId, secondLocationId],
      });
      const prohibited = await createActor({
        ...actorInput,
        label: "PROHIBITED",
        scopeIds: [firstLocationId],
      });
      const revokedPermission = await createActor({
        ...actorInput,
        label: "REVOKED_PERMISSION",
        scopeIds: [firstLocationId],
      });
      const revokedRole = await createActor({
        ...actorInput,
        label: "REVOKED_ROLE",
        scopeIds: [firstLocationId],
      });
      const revokedAssignment = await createActor({
        ...actorInput,
        label: "REVOKED_ASSIGNMENT",
        scopeIds: [firstLocationId],
      });
      const expiredAssignment = await createActor({
        ...actorInput,
        label: "EXPIRED_ASSIGNMENT",
        scopeIds: [firstLocationId],
      });
      const revokedScope = await createActor({
        ...actorInput,
        label: "REVOKED_SCOPE",
        scopeIds: [firstLocationId],
      });
      const pagination = await createActor({
        ...actorInput,
        label: "PAGINATION",
        scopeIds: [firstLocationId],
      });

      fixture = {
        tenantId,
        companyId,
        brandId,
        firstLocationId,
        secondLocationId,
        permissionId: permission.id,
        approvalRuleId,
        direct,
        roleOnly,
        anyScope,
        allScope,
        prohibited,
        revokedPermission,
        revokedRole,
        revokedAssignment,
        expiredAssignment,
        revokedScope,
        pagination,
        directStepId: "",
        roleOnlyStepId: "",
        anyScopeStepId: "",
        allScopeStepId: "",
        prohibitedStepId: "",
        revokedPermissionStepId: "",
        revokedRoleStepId: "",
        revokedAssignmentStepId: "",
        expiredAssignmentStepId: "",
        revokedScopeStepId: "",
        paginationStepIds: [],
      };

      const singleLocationGroup = [
        { groupOrder: 1, targetMatchMode: "ANY" as const, locationIds: [firstLocationId] },
      ];
      fixture.directStepId = await createRoutedStep({
        actor: direct,
        assignment: "USER",
        activatedAt: new Date("2026-07-22T01:00:00.000Z"),
        scopeGroups: singleLocationGroup,
      });
      fixture.roleOnlyStepId = await createRoutedStep({
        actor: roleOnly,
        assignment: "ROLE",
        activatedAt: new Date("2026-07-22T01:01:00.000Z"),
        scopeGroups: singleLocationGroup,
      });
      fixture.anyScopeStepId = await createRoutedStep({
        actor: anyScope,
        assignment: "ROLE",
        activatedAt: new Date("2026-07-22T01:02:00.000Z"),
        scopeGroups: [{
          groupOrder: 1,
          targetMatchMode: "ANY",
          locationIds: [firstLocationId, secondLocationId],
        }],
      });
      fixture.allScopeStepId = await createRoutedStep({
        actor: allScope,
        assignment: "ROLE",
        activatedAt: new Date("2026-07-22T01:03:00.000Z"),
        scopeGroups: [{
          groupOrder: 1,
          targetMatchMode: "ALL",
          locationIds: [firstLocationId, secondLocationId],
        }],
      });
      fixture.prohibitedStepId = await createRoutedStep({
        actor: prohibited,
        assignment: "USER",
        activatedAt: new Date("2026-07-22T01:04:00.000Z"),
        scopeGroups: singleLocationGroup,
        prohibitedUserId: prohibited.userId,
      });

      for (const [key, actor] of [
        ["revokedPermissionStepId", revokedPermission],
        ["revokedRoleStepId", revokedRole],
        ["revokedAssignmentStepId", revokedAssignment],
        ["expiredAssignmentStepId", expiredAssignment],
        ["revokedScopeStepId", revokedScope],
      ] as const) {
        fixture[key] = await createRoutedStep({
          actor,
          assignment: "ROLE",
          activatedAt: new Date("2026-07-22T02:00:00.000Z"),
          scopeGroups: singleLocationGroup,
        });
      }

      fixture.paginationStepIds = await Promise.all([
        createRoutedStep({
          actor: pagination,
          assignment: "USER",
          activatedAt: new Date("2026-07-22T03:03:00.000Z"),
          dueAt: new Date("2026-07-23T04:00:00.000Z"),
          scopeGroups: singleLocationGroup,
        }),
        createRoutedStep({
          actor: pagination,
          assignment: "USER",
          activatedAt: new Date("2026-07-22T03:02:00.000Z"),
          dueAt: new Date("2026-07-23T04:00:00.001Z"),
          scopeGroups: singleLocationGroup,
        }),
        createRoutedStep({
          actor: pagination,
          assignment: "USER",
          activatedAt: new Date("2026-07-22T03:01:00.000Z"),
          dueAt: null,
          scopeGroups: singleLocationGroup,
        }),
      ]);
    });

    test("shows direct and role assignments without depending on notifications", async () => {
      const directPage = await listEligibleApprovalStepPage(sessionFor(fixture.direct), { now: NOW });
      expect(directPage.items.map((item) => item.approvalInstanceStepId)).toEqual([
        fixture.directStepId,
      ]);

      expect(
        await prisma.notification.count({
          where: {
            tenantId: fixture.tenantId,
            recipientUserId: fixture.roleOnly.userId,
          },
        }),
      ).toBe(0);
      const rolePage = await listEligibleApprovalStepPage(sessionFor(fixture.roleOnly), { now: NOW });
      expect(rolePage.items.map((item) => item.approvalInstanceStepId)).toEqual([
        fixture.roleOnlyStepId,
      ]);
    });

    test("enforces ANY and budget-style ALL scope target semantics", async () => {
      const anyPage = await listEligibleApprovalStepPage(sessionFor(fixture.anyScope), { now: NOW });
      expect(anyPage.items.map((item) => item.approvalInstanceStepId)).toContain(
        fixture.anyScopeStepId,
      );
      const allPage = await listEligibleApprovalStepPage(sessionFor(fixture.allScope), { now: NOW });
      expect(allPage.items.map((item) => item.approvalInstanceStepId)).toContain(
        fixture.allScopeStepId,
      );

      await prisma.userScopeAssignment.updateMany({
        where: { userId: fixture.allScope.userId, scopeId: fixture.secondLocationId },
        data: { status: "INACTIVE" },
      });
      const missingOneTarget = await listEligibleApprovalStepPage(sessionFor(fixture.allScope), { now: NOW });
      expect(missingOneTarget.items).toHaveLength(0);
    });

    test("excludes prohibited and no-self actors", async () => {
      const page = await listEligibleApprovalStepPage(sessionFor(fixture.prohibited), { now: NOW });
      expect(page.totalItems).toBe(0);
      expect(page.items).toEqual([]);
    });

    test("revalidates permission, role, assignment, effective dates, and scope live", async () => {
      await prisma.rolePermission.delete({
        where: {
          roleId_permissionId: {
            roleId: fixture.revokedPermission.roleId,
            permissionId: fixture.permissionId,
          },
        },
      });
      await prisma.role.update({
        where: { id: fixture.revokedRole.roleId },
        data: { status: "INACTIVE" },
      });
      await prisma.userRoleAssignment.update({
        where: { id: fixture.revokedAssignment.assignmentId },
        data: { status: "INACTIVE" },
      });
      await prisma.userRoleAssignment.update({
        where: { id: fixture.expiredAssignment.assignmentId },
        data: { endsAt: NOW },
      });
      await prisma.userScopeAssignment.updateMany({
        where: { userId: fixture.revokedScope.userId },
        data: { status: "INACTIVE" },
      });

      for (const actor of [
        fixture.revokedPermission,
        fixture.revokedRole,
        fixture.revokedAssignment,
        fixture.expiredAssignment,
        fixture.revokedScope,
      ]) {
        const page = await listEligibleApprovalStepPage(sessionFor(actor), { now: NOW });
        expect(page.totalItems).toBe(0);
        expect(page.items).toEqual([]);
      }
    });

    test("returns exact count/page slices and includes the due cutoff boundary", async () => {
      const first = await listEligibleApprovalStepPage(sessionFor(fixture.pagination), {
        page: 1,
        pageSize: 2,
        now: NOW,
      });
      expect(first.totalItems).toBe(3);
      expect(first.items.map((item) => item.approvalInstanceStepId)).toEqual(
        fixture.paginationStepIds.slice(0, 2),
      );
      const second = await listEligibleApprovalStepPage(sessionFor(fixture.pagination), {
        page: 2,
        pageSize: 2,
        now: NOW,
      });
      expect(second.totalItems).toBe(3);
      expect(second.items.map((item) => item.approvalInstanceStepId)).toEqual(
        fixture.paginationStepIds.slice(2),
      );

      const dueSoon = await listEligibleApprovalStepPage(sessionFor(fixture.pagination), {
        page: 1,
        pageSize: 10,
        view: "DUE_SOON",
        dueBefore: DUE_CUTOFF,
        now: NOW,
      });
      expect(dueSoon.totalItems).toBe(1);
      expect(dueSoon.items.map((item) => item.approvalInstanceStepId)).toEqual([
        fixture.paginationStepIds[0],
      ]);
    });
  },
);
