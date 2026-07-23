import { randomUUID } from "node:crypto";
import { prisma } from "@ogfi/database";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { permissions } from "../src/server/services/authorization";
import type { SessionContext } from "../src/server/services/context";
import {
  assertDisposableAuthorizationDatabaseConfigured,
  assertDisposableAuthorizationDatabaseMarker,
} from "./authorizationDatabaseSafety";

const contextMock = vi.hoisted(() => ({ requireSessionContext: vi.fn() }));
const notificationHarness = vi.hoisted(() => ({ failStepReady: false }));

vi.mock("../src/server/services/context", async () => {
  const actual = await vi.importActual<typeof import("../src/server/services/context")>(
    "../src/server/services/context",
  );
  return { ...actual, requireSessionContext: contextMock.requireSessionContext };
});

vi.mock("../src/server/services/notifications", async () => {
  const actual = await vi.importActual<typeof import("../src/server/services/notifications")>(
    "../src/server/services/notifications",
  );
  return {
    ...actual,
    recordApprovalStepReadyNotification: async (
      ...args: Parameters<typeof actual.recordApprovalStepReadyNotification>
    ) => {
      if (notificationHarness.failStepReady) {
        throw new Error("TEST_INITIAL_NOTIFICATION_WRITE_FAILURE");
      }
      return actual.recordApprovalStepReadyNotification(...args);
    },
  };
});

const runPg = process.env.RUN_APPROVAL_ROUTING_PG_TESTS === "true";
const expectedDatabase = runPg
  ? assertDisposableAuthorizationDatabaseConfigured(process.env)
  : null;

const families = [
  "PurchaseRequest",
  "QuotationRecommendation",
  "PurchaseOrder",
  "PurchaseOrderBalanceClosure",
  "PurchaseOrderAmendment",
] as const;
type InitialFamily = (typeof families)[number];
type AssignmentMode = "DIRECT_USER" | "ROLE_SCOPED";

const approvalPermissionByFamily = {
  PurchaseRequest: permissions.purchaseRequestApprove,
  QuotationRecommendation: permissions.quoteApprove,
  PurchaseOrder: permissions.purchaseOrderApprove,
  PurchaseOrderBalanceClosure: permissions.purchaseOrderApprove,
  PurchaseOrderAmendment: permissions.purchaseOrderApprove,
} as const satisfies Record<InitialFamily, string>;

const transactionTypeByFamily = {
  PurchaseRequest: "PURCHASE_REQUEST",
  QuotationRecommendation: "QuotationRecommendation",
  PurchaseOrder: "PurchaseOrder",
  PurchaseOrderBalanceClosure: "PurchaseOrderBalanceClosure",
  PurchaseOrderAmendment: "PurchaseOrderAmendment",
} as const satisfies Record<InitialFamily, string>;

const submitterPermissionCodes = [
  permissions.purchaseRequestSubmit,
  permissions.quoteManage,
  permissions.purchaseOrderSubmit,
  permissions.purchaseOrderCloseRemaining,
  permissions.purchaseOrderAmend,
];

type InitialFixture = {
  family: InitialFamily;
  assignmentMode: AssignmentMode;
  tenantId: string;
  companyId: string;
  brandId: string;
  locationId: string;
  adjacentLocationId: string;
  submitterUserId: string;
  approverUserId: string;
  approverRoleAssignmentId: string;
  approverScopeAssignmentId: string;
  approvalPermissionCode: string;
  submitterSession: SessionContext;
  approverSession: SessionContext;
  purchaseRequestId: string;
  recommendationId: string | null;
  purchaseOrderId: string | null;
  purchaseOrderLineId: string | null;
};

function session(input: {
  userId: string;
  email: string;
  displayName: string;
  role: string;
  tenantId: string;
  companyId: string;
  brandId: string;
  locationId: string;
  locationName: string;
  scopeAssignmentId: string;
  permissionCodes: string[];
}): SessionContext {
  return {
    user: {
      id: input.userId,
      email: input.email,
      displayName: input.displayName,
      role: input.role,
    },
    context: {
      tenantId: input.tenantId,
      companyId: input.companyId,
      companyName: "Initial notification parity company",
      brandId: input.brandId,
      brandName: "Initial notification parity brand",
      locationId: input.locationId,
      locationName: input.locationName,
      locationType: "BRANCH",
    },
    authorizedLocations: [{
      tenantId: input.tenantId,
      companyId: input.companyId,
      companyName: "Initial notification parity company",
      brandId: input.brandId,
      brandName: "Initial notification parity brand",
      locationId: input.locationId,
      locationName: input.locationName,
      locationType: "BRANCH",
      scopeAssignmentId: input.scopeAssignmentId,
      accessLevel: "APPROVE",
    }],
    permissionCodes: input.permissionCodes,
  };
}

async function createInitialFixture(
  family: InitialFamily,
  assignmentMode: AssignmentMode,
): Promise<InitialFixture> {
  const suffix = randomUUID().slice(0, 8);
  const ids = {
    tenantId: randomUUID(),
    companyId: randomUUID(),
    brandId: randomUUID(),
    locationId: randomUUID(),
    adjacentLocationId: randomUUID(),
    submitterUserId: randomUUID(),
    approverUserId: randomUUID(),
    submitterRoleId: randomUUID(),
    approverRoleId: randomUUID(),
    submitterRoleAssignmentId: randomUUID(),
    approverRoleAssignmentId: randomUUID(),
    submitterScopeAssignmentId: randomUUID(),
    approverScopeAssignmentId: randomUUID(),
    ruleId: randomUUID(),
    uomId: randomUUID(),
    categoryId: randomUUID(),
    itemId: randomUUID(),
    supplierId: randomUUID(),
    purchaseRequestId: randomUUID(),
    purchaseRequestLineId: randomUUID(),
    quotationRequestId: randomUUID(),
    supplierQuotationId: randomUUID(),
    supplierQuotationLineId: randomUUID(),
    recommendationId: randomUUID(),
    purchaseOrderId: randomUUID(),
    purchaseOrderLineId: randomUUID(),
  };
  const approvalPermissionCode = approvalPermissionByFamily[family];
  const permissionCodes = [...new Set([
    ...submitterPermissionCodes,
    approvalPermissionCode,
  ])];
  const permissionRows = await prisma.permission.findMany({
    where: { code: { in: permissionCodes } },
    select: { id: true, code: true },
  });
  if (permissionRows.length !== permissionCodes.length) {
    throw new Error("INITIAL_NOTIFICATION_PERMISSION_FIXTURE_INCOMPLETE");
  }
  const permissionIdByCode = new Map(
    permissionRows.map(({ id, code }) => [code, id]),
  );

  await prisma.tenant.create({
    data: {
      id: ids.tenantId,
      name: `Initial notification ${suffix}`,
      loginCode: `initial-notification-${suffix}`,
    },
  });
  await prisma.company.create({
    data: {
      id: ids.companyId,
      tenantId: ids.tenantId,
      code: `IN-${suffix}`,
      legalName: `Initial notification ${suffix}`,
      currencyCode: "PHP",
    },
  });
  await prisma.brand.create({
    data: {
      id: ids.brandId,
      tenantId: ids.tenantId,
      companyId: ids.companyId,
      code: `IN-${suffix}`,
      name: `Initial notification ${suffix}`,
    },
  });
  await prisma.location.createMany({
    data: [
      {
        id: ids.locationId,
        tenantId: ids.tenantId,
        companyId: ids.companyId,
        brandId: ids.brandId,
        locationType: "BRANCH",
        code: `IN-${suffix}`,
        name: `Initial notification ${suffix}`,
      },
      {
        id: ids.adjacentLocationId,
        tenantId: ids.tenantId,
        companyId: ids.companyId,
        brandId: ids.brandId,
        locationType: "BRANCH",
        code: `IN-ADJ-${suffix}`,
        name: `Initial notification adjacent ${suffix}`,
      },
    ],
  });
  await prisma.user.createMany({
    data: [
      {
        id: ids.submitterUserId,
        tenantId: ids.tenantId,
        email: `submitter-${suffix}@test.invalid`,
        displayName: `Submitter ${suffix}`,
      },
      {
        id: ids.approverUserId,
        tenantId: ids.tenantId,
        email: `approver-${suffix}@test.invalid`,
        displayName: `Approver ${suffix}`,
      },
    ],
  });
  await prisma.role.create({
    data: {
      id: ids.submitterRoleId,
      tenantId: ids.tenantId,
      code: `SUBMITTER_${suffix}`,
      name: `Submitter ${suffix}`,
      permissions: {
        create: submitterPermissionCodes.map((code) => ({
          permissionId: permissionIdByCode.get(code)!,
        })),
      },
    },
  });
  await prisma.role.create({
    data: {
      id: ids.approverRoleId,
      tenantId: ids.tenantId,
      code: `APPROVER_${suffix}`,
      name: `Approver ${suffix}`,
      permissions: {
        create: [{ permissionId: permissionIdByCode.get(approvalPermissionCode)! }],
      },
    },
  });
  const startsAt = new Date(Date.now() - 60_000);
  await prisma.userRoleAssignment.createMany({
    data: [
      {
        id: ids.submitterRoleAssignmentId,
        userId: ids.submitterUserId,
        roleId: ids.submitterRoleId,
        startsAt,
      },
      {
        id: ids.approverRoleAssignmentId,
        userId: ids.approverUserId,
        roleId: ids.approverRoleId,
        startsAt,
      },
    ],
  });
  await prisma.userScopeAssignment.createMany({
    data: [
      {
        id: ids.submitterScopeAssignmentId,
        userId: ids.submitterUserId,
        scopeType: "LOCATION",
        scopeId: ids.locationId,
        accessLevel: "MANAGE",
        startsAt,
      },
      {
        id: ids.approverScopeAssignmentId,
        userId: ids.approverUserId,
        scopeType: "LOCATION",
        scopeId: ids.locationId,
        accessLevel: "APPROVE",
        startsAt,
      },
    ],
  });
  await prisma.approvalRule.create({
    data: {
      id: ids.ruleId,
      tenantId: ids.tenantId,
      companyId: ids.companyId,
      transactionType: transactionTypeByFamily[family],
      priority: 1,
      steps: {
        create: [{
          stepOrder: 1,
          approverType: assignmentMode === "DIRECT_USER" ? "USER" : "ROLE",
          ...(assignmentMode === "DIRECT_USER"
            ? { userId: ids.approverUserId }
            : { roleId: ids.approverRoleId }),
        }],
      },
    },
  });
  await prisma.uom.create({
    data: {
      id: ids.uomId,
      tenantId: ids.tenantId,
      companyId: ids.companyId,
      uomCode: `EA-${suffix}`,
      uomName: "Each",
      uomType: "COUNT",
    },
  });
  await prisma.itemCategory.create({
    data: {
      id: ids.categoryId,
      tenantId: ids.tenantId,
      companyId: ids.companyId,
      categoryCode: `CAT-${suffix}`,
      categoryName: "Parity items",
      inventoryClass: "FOOD",
    },
  });
  await prisma.item.create({
    data: {
      id: ids.itemId,
      tenantId: ids.tenantId,
      companyId: ids.companyId,
      itemCode: `ITEM-${suffix}`,
      itemName: "Parity item",
      itemCategoryId: ids.categoryId,
      itemType: "INVENTORY",
      baseUomId: ids.uomId,
      purchaseUomId: ids.uomId,
      issueUomId: ids.uomId,
    },
  });
  await prisma.purchaseRequest.create({
    data: {
      id: ids.purchaseRequestId,
      tenantId: ids.tenantId,
      companyId: ids.companyId,
      brandId: ids.brandId,
      publicReference: `PR-${suffix}`,
      requestLocationId: ids.locationId,
      requesterUserId: ids.submitterUserId,
      requiredDate: new Date(Date.now() + 10 * 86_400_000),
      urgency: "NORMAL",
      justification: "Initial notification parity",
      status: family === "PurchaseRequest" ? "DRAFT" : "APPROVED",
      lines: {
        create: [{
          id: ids.purchaseRequestLineId,
          itemId: ids.itemId,
          uomId: ids.uomId,
          lineNumber: 1,
          description: "Parity item",
          requestedQty: 10,
          estimatedUnitCost: 10,
          estimatedLineTotal: 100,
          uomCode: "EA",
          purpose: "Parity testing",
        }],
      },
    },
  });

  let recommendationId: string | null = null;
  let purchaseOrderId: string | null = null;
  let purchaseOrderLineId: string | null = null;
  if (family !== "PurchaseRequest") {
    await prisma.supplier.create({
      data: {
        id: ids.supplierId,
        tenantId: ids.tenantId,
        companyId: ids.companyId,
        supplierCode: `SUP-${suffix}`,
        legalName: `Supplier ${suffix}`,
        accreditationStatus: "APPROVED",
      },
    });
    await prisma.quotationRequest.create({
      data: {
        id: ids.quotationRequestId,
        tenantId: ids.tenantId,
        companyId: ids.companyId,
        publicReference: `QR-${suffix}`,
        purchaseRequestId: ids.purchaseRequestId,
        requiredDate: new Date(Date.now() + 8 * 86_400_000),
        createdByUserId: ids.submitterUserId,
      },
    });
    await prisma.supplierQuotation.create({
      data: {
        id: ids.supplierQuotationId,
        quotationRequestId: ids.quotationRequestId,
        tenantId: ids.tenantId,
        companyId: ids.companyId,
        supplierId: ids.supplierId,
        quoteReference: `SQ-${suffix}`,
        quoteDate: new Date(),
        currencyCode: "PHP",
        totalAmount: 100,
        lines: {
          create: [{
            id: ids.supplierQuotationLineId,
            sourcePrLineId: ids.purchaseRequestLineId,
            itemId: ids.itemId,
            quantity: 10,
            uomId: ids.uomId,
            unitPrice: 10,
            lineTotal: 100,
            availabilityStatus: "AVAILABLE",
          }],
        },
      },
    });
    await prisma.quotationRecommendation.create({
      data: {
        id: ids.recommendationId,
        tenantId: ids.tenantId,
        companyId: ids.companyId,
        quotationRequestId: ids.quotationRequestId,
        selectedSupplierQuotationId: ids.supplierQuotationId,
        preparedByUserId: ids.submitterUserId,
        status: family === "QuotationRecommendation" ? "DRAFT" : "APPROVED",
        currencyCode: "PHP",
        selectedEvaluatedTotal: 100,
        lowestEvaluatedTotal: 100,
        quoteCount: 1,
        isLowestEvaluatedCost: true,
        selectionReason: "Best evaluated offer",
        singleSourceJustification: "Approved sole-source fixture",
        evaluationSnapshot: {},
      },
    });
    recommendationId = ids.recommendationId;
  }

  if (
    family === "PurchaseOrder" ||
    family === "PurchaseOrderBalanceClosure" ||
    family === "PurchaseOrderAmendment"
  ) {
    const status = family === "PurchaseOrder"
      ? "DRAFT"
      : family === "PurchaseOrderBalanceClosure"
        ? "PARTIALLY_RECEIVED"
        : "ISSUED";
    await prisma.purchaseOrder.create({
      data: {
        id: ids.purchaseOrderId,
        tenantId: ids.tenantId,
        companyId: ids.companyId,
        brandId: ids.brandId,
        publicReference: `PO-${suffix}`,
        purchaseRequestId: ids.purchaseRequestId,
        quotationRequestId: ids.quotationRequestId,
        quotationRecommendationId: ids.recommendationId,
        selectedSupplierQuotationId: ids.supplierQuotationId,
        supplierId: ids.supplierId,
        deliveryLocationId: ids.locationId,
        currencyCode: "PHP",
        subtotalAmount: 100,
        totalAmount: 100,
        expectedDeliveryDate: new Date(Date.now() + 7 * 86_400_000),
        status,
        sourceSnapshot: {},
        createdByUserId: ids.submitterUserId,
        lines: {
          create: [{
            id: ids.purchaseOrderLineId,
            tenantId: ids.tenantId,
            companyId: ids.companyId,
            sourcePrLineId: ids.purchaseRequestLineId,
            sourceSupplierQuoteLineId: ids.supplierQuotationLineId,
            itemId: ids.itemId,
            uomId: ids.uomId,
            lineNumber: 1,
            description: "Parity item",
            orderedQty: 10,
            receivedQty: family === "PurchaseOrderBalanceClosure" ? 5 : 0,
            unitPrice: 10,
            lineTotal: 100,
          }],
        },
      },
    });
    purchaseOrderId = ids.purchaseOrderId;
    purchaseOrderLineId = ids.purchaseOrderLineId;
  }

  const submitterSession = session({
    userId: ids.submitterUserId,
    email: `submitter-${suffix}@test.invalid`,
    displayName: `Submitter ${suffix}`,
    role: "Submitter",
    tenantId: ids.tenantId,
    companyId: ids.companyId,
    brandId: ids.brandId,
    locationId: ids.locationId,
    locationName: `Initial notification ${suffix}`,
    scopeAssignmentId: ids.submitterScopeAssignmentId,
    permissionCodes: submitterPermissionCodes,
  });
  const approverSession = session({
    userId: ids.approverUserId,
    email: `approver-${suffix}@test.invalid`,
    displayName: `Approver ${suffix}`,
    role: "Approver",
    tenantId: ids.tenantId,
    companyId: ids.companyId,
    brandId: ids.brandId,
    locationId: ids.locationId,
    locationName: `Initial notification ${suffix}`,
    scopeAssignmentId: ids.approverScopeAssignmentId,
    permissionCodes: [approvalPermissionCode],
  });

  return {
    family,
    assignmentMode,
    tenantId: ids.tenantId,
    companyId: ids.companyId,
    brandId: ids.brandId,
    locationId: ids.locationId,
    adjacentLocationId: ids.adjacentLocationId,
    submitterUserId: ids.submitterUserId,
    approverUserId: ids.approverUserId,
    approverRoleAssignmentId: ids.approverRoleAssignmentId,
    approverScopeAssignmentId: ids.approverScopeAssignmentId,
    approvalPermissionCode,
    submitterSession,
    approverSession,
    purchaseRequestId: ids.purchaseRequestId,
    recommendationId,
    purchaseOrderId,
    purchaseOrderLineId,
  };
}

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

async function executeInitialSubmission(fixture: InitialFixture) {
  contextMock.requireSessionContext.mockResolvedValue(fixture.submitterSession);
  if (fixture.family === "PurchaseRequest") {
    const service = await import("../src/server/services/purchaseRequests");
    return service.submitPurchaseRequest(fixture.purchaseRequestId);
  }
  if (fixture.family === "QuotationRecommendation") {
    const service = await import("../src/server/services/quotes");
    return service.submitQuotationRecommendation(form({
      quotationRecommendationId: fixture.recommendationId!,
    }));
  }
  const service = await import("../src/server/services/purchaseOrders");
  if (fixture.family === "PurchaseOrder") {
    return service.submitPurchaseOrderForApproval(form({ id: fixture.purchaseOrderId! }));
  }
  if (fixture.family === "PurchaseOrderBalanceClosure") {
    return service.requestPurchaseOrderBalanceClosure(form({
      id: fixture.purchaseOrderId!,
      reason: "Close the confirmed remaining balance",
      supplierNoticeUnavailableReason: "Supplier acknowledged by phone",
    }));
  }
  return service.requestPurchaseOrderAmendment(form({
    id: fixture.purchaseOrderId!,
    reason: "Correct the remaining order quantity",
    supplierNoticeUnavailableReason: "Supplier acknowledged by phone",
    expectedDeliveryDate: new Date(Date.now() + 9 * 86_400_000)
      .toISOString()
      .slice(0, 10),
    proposedLines: JSON.stringify([{
      purchaseOrderLineId: fixture.purchaseOrderLineId!,
      orderedQty: 12,
      unitPrice: 10,
      notes: "Approved fixture proposal",
    }]),
  }));
}

async function findCreatedApproval(fixture: InitialFixture) {
  const documentType = fixture.family;
  const expectedDocumentId = fixture.family === "PurchaseRequest"
    ? fixture.purchaseRequestId
    : fixture.family === "QuotationRecommendation"
      ? fixture.recommendationId
      : fixture.family === "PurchaseOrder"
        ? fixture.purchaseOrderId
        : null;
  return prisma.approvalInstance.findFirstOrThrow({
    where: {
      tenantId: fixture.tenantId,
      companyId: fixture.companyId,
      documentType,
      ...(expectedDocumentId ? { documentId: expectedDocumentId } : {}),
      status: "PENDING",
    },
    include: { steps: { orderBy: { stepOrder: "asc" } } },
  });
}

async function sourceState(fixture: InitialFixture) {
  if (fixture.family === "PurchaseRequest") {
    return (await prisma.purchaseRequest.findUniqueOrThrow({
      where: { id: fixture.purchaseRequestId },
      select: { status: true },
    })).status;
  }
  if (fixture.family === "QuotationRecommendation") {
    return (await prisma.quotationRecommendation.findUniqueOrThrow({
      where: { id: fixture.recommendationId! },
      select: { status: true },
    })).status;
  }
  const order = await prisma.purchaseOrder.findUniqueOrThrow({
    where: { id: fixture.purchaseOrderId! },
    select: { status: true },
  });
  if (fixture.family === "PurchaseOrder") return order.status;
  const childCount = fixture.family === "PurchaseOrderBalanceClosure"
    ? await prisma.purchaseOrderBalanceClosure.count({
        where: { purchaseOrderId: fixture.purchaseOrderId! },
      })
    : await prisma.purchaseOrderAmendment.count({
        where: { purchaseOrderId: fixture.purchaseOrderId! },
      });
  return `${order.status}:${childCount}`;
}

describe.skipIf(!runPg).sequential(
  "initial procurement approval notification PostgreSQL parity",
  () => {
    let previousRoutingFlag: string | undefined;

    beforeAll(async () => {
      previousRoutingFlag = process.env.APPROVAL_ROUTING_V1_ENABLED;
      process.env.APPROVAL_ROUTING_V1_ENABLED = "false";
      await prisma.$connect();
      await assertDisposableAuthorizationDatabaseMarker(prisma, process.env);
      const identity = await prisma.$queryRaw<Array<{ currentDatabase: string }>>`
        SELECT current_database() AS "currentDatabase"
      `;
      if (identity[0]?.currentDatabase !== expectedDatabase) {
        throw new Error("INITIAL_NOTIFICATION_DATABASE_IDENTITY_MISMATCH");
      }
    });

    afterAll(() => {
      notificationHarness.failStepReady = false;
      contextMock.requireSessionContext.mockReset();
      if (previousRoutingFlag === undefined) {
        delete process.env.APPROVAL_ROUTING_V1_ENABLED;
      } else {
        process.env.APPROVAL_ROUTING_V1_ENABLED = previousRoutingFlag;
      }
    });

    test.each(
      families.flatMap((family) => [
        [family, "DIRECT_USER"],
        [family, "ROLE_SCOPED"],
      ] as const),
    )(
      "%s / %s preserves flag-off inbox visibility and bounded notification cardinality",
      async (family, assignmentMode) => {
        const fixture = await createInitialFixture(family, assignmentMode);
        await executeInitialSubmission(fixture);
        const approval = await findCreatedApproval(fixture);
        expect(approval.steps).toHaveLength(1);
        expect(approval.steps[0]).toMatchObject({
          status: "PENDING",
          assignedUserId:
            assignmentMode === "DIRECT_USER" ? fixture.approverUserId : null,
        });

        const notifications = await prisma.notification.findMany({
          where: { tenantId: fixture.tenantId },
        });
        if (assignmentMode === "DIRECT_USER") {
          expect(notifications).toHaveLength(1);
          const expectedEntityType = family === "QuotationRecommendation"
            ? "PurchaseRequest"
            : family;
          const expectedEntityId = family === "QuotationRecommendation"
            ? fixture.purchaseRequestId
            : approval.documentId;
          expect(notifications[0]).toMatchObject({
            tenantId: fixture.tenantId,
            companyId: fixture.companyId,
            locationId: fixture.locationId,
            recipientUserId: fixture.approverUserId,
            notificationType: "APPROVAL_STEP_READY",
            recipientBasis: "assigned_user",
            deepLink: `/approvals/${approval.id}`,
            entityType: expectedEntityType,
            entityId: expectedEntityId,
            sourceEventKey: `approval:${approval.id}:step:1:ready`,
          });
          expect(notifications[0]?.metadata).toMatchObject({
            approvalInstanceId: approval.id,
            approvalInstanceStepId: approval.steps[0]!.id,
            approvalStepOrder: 1,
            assignmentMode: "DIRECT_USER",
            assignedUserId: fixture.approverUserId,
            assignedRoleId: null,
            requiredPermissionCode: fixture.approvalPermissionCode,
            scopeType: "LOCATION_CONTEXT",
            scopeId: fixture.locationId,
          });
        } else {
          expect(notifications).toHaveLength(0);
          expect(approval.steps[0]?.assignedRoleId).not.toBeNull();
        }

        contextMock.requireSessionContext.mockResolvedValue(fixture.approverSession);
        const { listPendingApprovals } = await import("../src/server/services/approvals");
        expect(
          (await listPendingApprovals(fixture.approverSession)).map(
            ({ approvalInstanceId }) => approvalInstanceId,
          ),
        ).toContain(approval.id);

        const approvalCountBeforeRetry = await prisma.approvalInstance.count({
          where: { tenantId: fixture.tenantId },
        });
        const notificationCountBeforeRetry = await prisma.notification.count({
          where: { tenantId: fixture.tenantId },
        });
        await expect(executeInitialSubmission(fixture)).rejects.toThrow();
        expect(await prisma.approvalInstance.count({
          where: { tenantId: fixture.tenantId },
        })).toBe(approvalCountBeforeRetry);
        expect(await prisma.notification.count({
          where: { tenantId: fixture.tenantId },
        })).toBe(notificationCountBeforeRetry);

        await prisma.userScopeAssignment.update({
          where: { id: fixture.approverScopeAssignmentId },
          data: { scopeId: fixture.adjacentLocationId },
        });
        expect(await listPendingApprovals(fixture.approverSession)).toHaveLength(0);
        await prisma.userScopeAssignment.update({
          where: { id: fixture.approverScopeAssignmentId },
          data: { scopeId: fixture.locationId },
        });
        await prisma.userRoleAssignment.update({
          where: { id: fixture.approverRoleAssignmentId },
          data: { status: "INACTIVE" },
        });
        expect(await listPendingApprovals(fixture.approverSession)).toHaveLength(0);
      },
    );

    test.each(families)(
      "%s notification failure rolls back source, route, audit, and notification effects",
      async (family) => {
        const fixture = await createInitialFixture(family, "DIRECT_USER");
        const beforeState = await sourceState(fixture);
        notificationHarness.failStepReady = true;
        try {
          await expect(executeInitialSubmission(fixture)).rejects.toThrow(
            "TEST_INITIAL_NOTIFICATION_WRITE_FAILURE",
          );
        } finally {
          notificationHarness.failStepReady = false;
        }
        expect(await sourceState(fixture)).toBe(beforeState);
        expect(await prisma.approvalInstance.count({
          where: { tenantId: fixture.tenantId },
        })).toBe(0);
        expect(await prisma.auditEvent.count({
          where: { tenantId: fixture.tenantId },
        })).toBe(0);
        expect(await prisma.notification.count({
          where: { tenantId: fixture.tenantId },
        })).toBe(0);
      },
    );

    test.each(["PurchaseOrder", "PurchaseOrderAmendment"] as const)(
      "%s concurrent submission has one winner and one readiness row",
      async (family) => {
        const fixture = await createInitialFixture(family, "DIRECT_USER");
        const results = await Promise.allSettled([
          executeInitialSubmission(fixture),
          executeInitialSubmission(fixture),
        ]);
        expect(results.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
        expect(results.filter(({ status }) => status === "rejected")).toHaveLength(1);
        expect(await prisma.approvalInstance.count({
          where: { tenantId: fixture.tenantId },
        })).toBe(1);
        expect(await prisma.notification.count({
          where: {
            tenantId: fixture.tenantId,
            notificationType: "APPROVAL_STEP_READY",
          },
        })).toBe(1);
      },
    );
  },
);
