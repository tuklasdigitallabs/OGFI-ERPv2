import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import type { SessionContext } from "../src/server/services/context";
import type {
  postInventoryMovement as postInventoryMovementType,
  postInventoryMovementInTransaction as postInventoryMovementInTransactionType,
} from "../src/server/services/inventory";
import {
  assertDisposableAuthorizationDatabaseConfigured,
  assertDisposableAuthorizationDatabaseMarker,
} from "./authorizationDatabaseSafety";
import {
  authenticationSessionTokenHash,
  clearAuthenticatedRequest,
  configureAuthenticatedRequest,
} from "./authenticatedRequestHarness";

const expectedDatabase = assertDisposableAuthorizationDatabaseConfigured(process.env);
if (!process.env.DATABASE_URL) {
  throw new Error("AUTHORIZATION_PROCUREMENT_INVENTORY_DATABASE_REQUIRED");
}

describe("procurement and inventory authorization boundaries", () => {
  const suffix = randomUUID().slice(0, 8);
  const ids = {
    tenantId: randomUUID(),
    foreignTenantId: randomUUID(),
    companyId: randomUUID(),
    adjacentCompanyId: randomUUID(),
    foreignCompanyId: randomUUID(),
    locationId: randomUUID(),
    adjacentLocationId: randomUUID(),
    adjacentCompanyLocationId: randomUUID(),
    foreignLocationId: randomUUID(),
    inventoryLocationId: randomUUID(),
    adjacentInventoryLocationId: randomUUID(),
    adjacentCompanyInventoryLocationId: randomUUID(),
    foreignInventoryLocationId: randomUUID(),
    userId: randomUUID(),
    approvalRequesterId: randomUUID(),
    nextApproverId: randomUUID(),
    roleId: randomUUID(),
    nextRecipientRoleId: randomUUID(),
    userScopeAssignmentId: randomUUID(),
    approvalRequesterScopeAssignmentId: randomUUID(),
    nextApproverScopeAssignmentId: randomUUID(),
    authSessionId: randomUUID(),
    approvalRuleId: randomUUID(),
    scopedPurchaseRequestId: randomUUID(),
    adjacentPurchaseRequestId: randomUUID(),
    approvedPurchaseRequestId: randomUUID(),
    approveDispatchApprovalId: randomUUID(),
    rejectDispatchApprovalId: randomUUID(),
    multiStepApprovalId: randomUUID(),
    recipientRevocationApprovalId: randomUUID(),
    requesterOnlyNextStepApprovalId: randomUUID(),
    mixedNextStepApprovalId: randomUUID(),
    finalOutcomeApprovalId: randomUUID(),
    expiryApprovalId: randomUUID(),
    reassignedApprovalId: randomUUID(),
    staleAuthorityApprovalId: randomUUID(),
    multiStepPurchaseRequestId: randomUUID(),
    recipientRevocationPurchaseRequestId: randomUUID(),
    requesterOnlyNextStepPurchaseRequestId: randomUUID(),
    mixedNextStepPurchaseRequestId: randomUUID(),
    finalOutcomePurchaseRequestId: randomUUID(),
    expiryPurchaseRequestId: randomUUID(),
    reassignedPurchaseRequestId: randomUUID(),
    staleAuthorityPurchaseRequestId: randomUUID(),
    transferWrongSourceId: randomUUID(),
    transferWrongDestinationId: randomUUID(),
    adjacentStockCountId: randomUUID(),
    scopedReviewedStockCountId: randomUUID(),
    scopedDraftStockCountId: randomUUID(),
    uomId: randomUUID(),
    adjacentCompanyUomId: randomUUID(),
    categoryId: randomUUID(),
    adjacentCompanyCategoryId: randomUUID(),
    itemId: randomUUID(),
    adjacentCompanyItemId: randomUUID(),
  };

  let prisma: PrismaClient;
  let postInventoryMovement: typeof postInventoryMovementType;
  let postInventoryMovementInTransaction: typeof postInventoryMovementInTransactionType;
  const sessionToken = `authz-procurement-inventory-${randomUUID()}`;

  const session: SessionContext = {
    user: {
      id: ids.userId,
      email: `authz-procurement-inventory-${suffix}@example.test`,
      displayName: `Authorization Inventory Actor ${suffix}`,
      role: "Inventory Operator",
    },
    context: {
      tenantId: ids.tenantId,
      companyId: ids.companyId,
      companyName: `Authorization Company ${suffix}`,
      brandId: "",
      brandName: "Company-wide",
      locationId: ids.locationId,
      locationName: `Authorization Location ${suffix}`,
      locationType: "BRANCH",
    },
    authorizedLocations: [
      {
        tenantId: ids.tenantId,
        companyId: ids.companyId,
        companyName: `Authorization Company ${suffix}`,
        brandId: "",
        brandName: "Company-wide",
        locationId: ids.locationId,
        locationName: `Authorization Location ${suffix}`,
        locationType: "BRANCH",
        scopeAssignmentId: `authz-inventory-scope-${suffix}`,
        accessLevel: "APPROVE",
      },
    ],
    permissionCodes: [],
  };

  beforeAll(async () => {
    ({ prisma } = await import("@ogfi/database"));
    ({ postInventoryMovement, postInventoryMovementInTransaction } = await import(
      "../src/server/services/inventory"
    ));
    await prisma.$connect();
    await assertDisposableAuthorizationDatabaseMarker(prisma, process.env);
    const identity = await prisma.$queryRaw<Array<{ currentDatabase: string }>>`
      SELECT current_database() AS "currentDatabase"
    `;
    if (identity[0]?.currentDatabase !== expectedDatabase) {
      throw new Error("AUTHORIZATION_DATABASE_IDENTITY_MISMATCH");
    }

    await prisma.tenant.createMany({
      data: [
        {
          id: ids.tenantId,
          name: `Authorization Inventory Tenant ${suffix}`,
          loginCode: `authz-inv-${suffix}`,
        },
        {
          id: ids.foreignTenantId,
          name: `Foreign Authorization Inventory Tenant ${suffix}`,
          loginCode: `authz-inv-foreign-${suffix}`,
        },
      ],
    });
    await prisma.company.createMany({
      data: [
        {
          id: ids.companyId,
          tenantId: ids.tenantId,
          code: `AZI-${suffix}`,
          legalName: `Authorization Inventory Company ${suffix}`,
          currencyCode: "PHP",
        },
        {
          id: ids.adjacentCompanyId,
          tenantId: ids.tenantId,
          code: `AZI-ADJ-${suffix}`,
          legalName: `Adjacent Authorization Inventory Company ${suffix}`,
          currencyCode: "PHP",
        },
        {
          id: ids.foreignCompanyId,
          tenantId: ids.foreignTenantId,
          code: `AZI-FOR-${suffix}`,
          legalName: `Foreign Authorization Inventory Company ${suffix}`,
          currencyCode: "PHP",
        },
      ],
    });
    await prisma.location.createMany({
      data: [
        {
          id: ids.locationId,
          tenantId: ids.tenantId,
          companyId: ids.companyId,
          locationType: "BRANCH",
          code: `AZI-${suffix}`,
          name: `Authorization Inventory Location ${suffix}`,
        },
        {
          id: ids.adjacentLocationId,
          tenantId: ids.tenantId,
          companyId: ids.companyId,
          locationType: "BRANCH",
          code: `AZI-LOC-ADJ-${suffix}`,
          name: `Adjacent Authorization Inventory Location ${suffix}`,
        },
        {
          id: ids.adjacentCompanyLocationId,
          tenantId: ids.tenantId,
          companyId: ids.adjacentCompanyId,
          locationType: "BRANCH",
          code: `AZI-COMP-ADJ-${suffix}`,
          name: `Adjacent Company Inventory Location ${suffix}`,
        },
        {
          id: ids.foreignLocationId,
          tenantId: ids.foreignTenantId,
          companyId: ids.foreignCompanyId,
          locationType: "BRANCH",
          code: `AZI-FOR-${suffix}`,
          name: `Foreign Inventory Location ${suffix}`,
        },
      ],
    });
    await prisma.inventoryLocation.createMany({
      data: [
        {
          id: ids.inventoryLocationId,
          tenantId: ids.tenantId,
          companyId: ids.companyId,
          locationId: ids.locationId,
          code: `AZI-INV-${suffix}`,
          name: `Authorization Inventory Store ${suffix}`,
        },
        {
          id: ids.adjacentInventoryLocationId,
          tenantId: ids.tenantId,
          companyId: ids.companyId,
          locationId: ids.adjacentLocationId,
          code: `AZI-INV-ADJ-${suffix}`,
          name: `Adjacent Authorization Inventory Store ${suffix}`,
        },
        {
          id: ids.adjacentCompanyInventoryLocationId,
          tenantId: ids.tenantId,
          companyId: ids.adjacentCompanyId,
          locationId: ids.adjacentCompanyLocationId,
          code: `AZI-COMP-INV-${suffix}`,
          name: `Adjacent Company Inventory Store ${suffix}`,
        },
        {
          id: ids.foreignInventoryLocationId,
          tenantId: ids.foreignTenantId,
          companyId: ids.foreignCompanyId,
          locationId: ids.foreignLocationId,
          code: `AZI-FOR-INV-${suffix}`,
          name: `Foreign Inventory Store ${suffix}`,
        },
      ],
    });
    await prisma.user.createMany({
      data: [{
        id: ids.userId,
        tenantId: ids.tenantId,
        email: session.user.email,
        displayName: session.user.displayName,
      }, {
        id: ids.approvalRequesterId,
        tenantId: ids.tenantId,
        email: `authz-approval-requester-${suffix}@example.test`,
        displayName: `Authorization Approval Requester ${suffix}`,
      }, {
        id: ids.nextApproverId,
        tenantId: ids.tenantId,
        email: `authz-next-approver-${suffix}@example.test`,
        displayName: `Authorization Next Approver ${suffix}`,
      }],
    });
    await prisma.role.createMany({
      data: [{
        id: ids.roleId,
        tenantId: ids.tenantId,
        code: `AUTHZ_PI_${suffix}`,
        name: `Authorization Procurement Inventory ${suffix}`,
      }, {
        id: ids.nextRecipientRoleId,
        tenantId: ids.tenantId,
        code: `AUTHZ_PI_NEXT_${suffix}`,
        name: `Authorization Next Recipients ${suffix}`,
      }],
    });
    await prisma.userRoleAssignment.createMany({
      data: [
        { userId: ids.userId, roleId: ids.roleId },
        { userId: ids.approvalRequesterId, roleId: ids.roleId },
        { userId: ids.nextApproverId, roleId: ids.roleId },
        { userId: ids.approvalRequesterId, roleId: ids.nextRecipientRoleId },
        { userId: ids.nextApproverId, roleId: ids.nextRecipientRoleId },
      ],
    });
    await prisma.userScopeAssignment.createMany({
      data: [{
        id: ids.userScopeAssignmentId,
        userId: ids.userId,
        scopeType: "LOCATION",
        scopeId: ids.locationId,
        accessLevel: "APPROVE",
      }, {
        id: ids.approvalRequesterScopeAssignmentId,
        userId: ids.approvalRequesterId,
        scopeType: "LOCATION",
        scopeId: ids.locationId,
        accessLevel: "APPROVE",
      }, {
        id: ids.nextApproverScopeAssignmentId,
        userId: ids.nextApproverId,
        scopeType: "LOCATION",
        scopeId: ids.locationId,
        accessLevel: "APPROVE",
      }],
    });
    await prisma.authSession.create({
      data: {
        id: ids.authSessionId,
        tenantId: ids.tenantId,
        userId: ids.userId,
        tokenHash: authenticationSessionTokenHash(sessionToken),
        status: "ACTIVE",
        assuranceLevel: "PASSWORD",
        privilegeEpochAtIssue: 0,
        idleExpiresAt: new Date(Date.now() + 30 * 60_000),
        absoluteExpiresAt: new Date(Date.now() + 60 * 60_000),
      },
    });
    configureAuthenticatedRequest({
      sessionToken,
      selectedLocationId: ids.locationId,
    });
    await prisma.uom.createMany({
      data: [
        {
          id: ids.uomId,
          tenantId: ids.tenantId,
          companyId: ids.companyId,
          uomCode: `EA-${suffix}`,
          uomName: "Each",
          uomType: "COUNT",
        },
        {
          id: ids.adjacentCompanyUomId,
          tenantId: ids.tenantId,
          companyId: ids.adjacentCompanyId,
          uomCode: `EA-${suffix}`,
          uomName: "Each",
          uomType: "COUNT",
        },
      ],
    });
    await prisma.itemCategory.createMany({
      data: [
        {
          id: ids.categoryId,
          tenantId: ids.tenantId,
          companyId: ids.companyId,
          categoryCode: `AZI-${suffix}`,
          categoryName: "Authorization Inventory",
          inventoryClass: "GENERAL",
        },
        {
          id: ids.adjacentCompanyCategoryId,
          tenantId: ids.tenantId,
          companyId: ids.adjacentCompanyId,
          categoryCode: `AZI-${suffix}`,
          categoryName: "Adjacent Authorization Inventory",
          inventoryClass: "GENERAL",
        },
      ],
    });
    await prisma.item.createMany({
      data: [
        {
          id: ids.itemId,
          tenantId: ids.tenantId,
          companyId: ids.companyId,
          itemCode: `AZI-${suffix}`,
          itemName: `Authorization Inventory Item ${suffix}`,
          itemCategoryId: ids.categoryId,
          itemType: "INVENTORY",
          baseUomId: ids.uomId,
        },
        {
          id: ids.adjacentCompanyItemId,
          tenantId: ids.tenantId,
          companyId: ids.adjacentCompanyId,
          itemCode: `AZI-${suffix}`,
          itemName: `Adjacent Authorization Inventory Item ${suffix}`,
          itemCategoryId: ids.adjacentCompanyCategoryId,
          itemType: "INVENTORY",
          baseUomId: ids.adjacentCompanyUomId,
        },
      ],
    });
    await prisma.purchaseRequest.createMany({
      data: [
        {
          id: ids.scopedPurchaseRequestId,
          publicReference: `AUTHZ-PI-SCOPED-${suffix}`,
          tenantId: ids.tenantId,
          companyId: ids.companyId,
          requestLocationId: ids.locationId,
          requesterUserId: ids.userId,
          requiredDate: new Date("2026-07-31T00:00:00.000Z"),
          urgency: "Normal",
          justification: "Authorization scoped purchase request",
          status: "PENDING_APPROVAL",
          currentApprovalStep: 1,
        },
        {
          id: ids.adjacentPurchaseRequestId,
          publicReference: `AUTHZ-PI-ADJ-${suffix}`,
          tenantId: ids.tenantId,
          companyId: ids.companyId,
          requestLocationId: ids.adjacentLocationId,
          requesterUserId: ids.userId,
          requiredDate: new Date("2026-07-31T00:00:00.000Z"),
          urgency: "Normal",
          justification: "Authorization adjacent purchase request",
          status: "DRAFT",
        },
        {
          id: ids.approvedPurchaseRequestId,
          publicReference: `AUTHZ-PI-APPROVED-${suffix}`,
          tenantId: ids.tenantId,
          companyId: ids.companyId,
          requestLocationId: ids.locationId,
          requesterUserId: ids.userId,
          requiredDate: new Date("2026-07-31T00:00:00.000Z"),
          urgency: "Normal",
          justification: "Authorization approved purchase request",
          status: "APPROVED",
        },
        {
          id: ids.multiStepPurchaseRequestId,
          publicReference: `AUTHZ-PI-MULTI-${suffix}`,
          tenantId: ids.tenantId,
          companyId: ids.companyId,
          requestLocationId: ids.locationId,
          requesterUserId: ids.approvalRequesterId,
          requiredDate: new Date("2026-07-31T00:00:00.000Z"),
          urgency: "Normal",
          justification: "Authorization multi-step purchase request",
          status: "PENDING_APPROVAL",
          currentApprovalStep: 1,
        },
        {
          id: ids.recipientRevocationPurchaseRequestId,
          publicReference: `AUTHZ-PI-RECIPIENT-REVOKE-${suffix}`,
          tenantId: ids.tenantId,
          companyId: ids.companyId,
          requestLocationId: ids.locationId,
          requesterUserId: ids.approvalRequesterId,
          requiredDate: new Date("2026-07-31T00:00:00.000Z"),
          urgency: "Normal",
          justification: "Authorization recipient revocation purchase request",
          status: "PENDING_APPROVAL",
          currentApprovalStep: 1,
        },
        {
          id: ids.requesterOnlyNextStepPurchaseRequestId,
          publicReference: `AUTHZ-PI-REQUESTER-ONLY-${suffix}`,
          tenantId: ids.tenantId,
          companyId: ids.companyId,
          requestLocationId: ids.locationId,
          requesterUserId: ids.approvalRequesterId,
          requiredDate: new Date("2026-07-31T00:00:00.000Z"),
          urgency: "Normal",
          justification: "Requester-only next-step routing fixture",
          status: "PENDING_APPROVAL",
          currentApprovalStep: 1,
        },
        {
          id: ids.mixedNextStepPurchaseRequestId,
          publicReference: `AUTHZ-PI-MIXED-RECIPIENTS-${suffix}`,
          tenantId: ids.tenantId,
          companyId: ids.companyId,
          requestLocationId: ids.locationId,
          requesterUserId: ids.approvalRequesterId,
          requiredDate: new Date("2026-07-31T00:00:00.000Z"),
          urgency: "Normal",
          justification: "Mixed next-step routing fixture",
          status: "PENDING_APPROVAL",
          currentApprovalStep: 1,
        },
        {
          id: ids.finalOutcomePurchaseRequestId,
          publicReference: `AUTHZ-PI-OUTCOME-${suffix}`,
          tenantId: ids.tenantId,
          companyId: ids.companyId,
          requestLocationId: ids.locationId,
          requesterUserId: ids.approvalRequesterId,
          requiredDate: new Date("2026-07-31T00:00:00.000Z"),
          urgency: "Normal",
          justification: "Authorization final outcome purchase request",
          status: "PENDING_APPROVAL",
          currentApprovalStep: 1,
        },
        {
          id: ids.expiryPurchaseRequestId,
          publicReference: `AUTHZ-PI-EXPIRY-${suffix}`,
          tenantId: ids.tenantId,
          companyId: ids.companyId,
          requestLocationId: ids.locationId,
          requesterUserId: ids.approvalRequesterId,
          requiredDate: new Date("2026-07-31T00:00:00.000Z"),
          urgency: "Normal",
          justification: "Authorization lock wait expiry purchase request",
          status: "PENDING_APPROVAL",
          currentApprovalStep: 1,
        },
        {
          id: ids.reassignedPurchaseRequestId,
          publicReference: `AUTHZ-PI-REASSIGN-${suffix}`,
          tenantId: ids.tenantId,
          companyId: ids.companyId,
          requestLocationId: ids.locationId,
          requesterUserId: ids.approvalRequesterId,
          requiredDate: new Date("2026-07-31T00:00:00.000Z"),
          urgency: "Normal",
          justification: "Authorization reassignment purchase request",
          status: "PENDING_APPROVAL",
          currentApprovalStep: 1,
        },
        {
          id: ids.staleAuthorityPurchaseRequestId,
          publicReference: `AUTHZ-PI-STALE-${suffix}`,
          tenantId: ids.tenantId,
          companyId: ids.companyId,
          requestLocationId: ids.locationId,
          requesterUserId: ids.approvalRequesterId,
          requiredDate: new Date("2026-07-31T00:00:00.000Z"),
          urgency: "Normal",
          justification: "Authorization stale authority purchase request",
          status: "PENDING_APPROVAL",
          currentApprovalStep: 1,
        },
      ],
    });
    await prisma.purchaseRequestLine.createMany({
      data: [
        ids.scopedPurchaseRequestId,
        ids.adjacentPurchaseRequestId,
        ids.approvedPurchaseRequestId,
        ids.multiStepPurchaseRequestId,
        ids.recipientRevocationPurchaseRequestId,
        ids.requesterOnlyNextStepPurchaseRequestId,
        ids.mixedNextStepPurchaseRequestId,
        ids.finalOutcomePurchaseRequestId,
        ids.expiryPurchaseRequestId,
        ids.reassignedPurchaseRequestId,
        ids.staleAuthorityPurchaseRequestId,
      ].map((purchaseRequestId) => ({
        purchaseRequestId,
        itemId: ids.itemId,
        uomId: ids.uomId,
        lineNumber: 1,
        description: "Authorization inventory item",
        requestedQty: 1,
        estimatedUnitCost: 0,
        estimatedLineTotal: 0,
        uomCode: "EA",
        purpose: "Authorization coverage",
      })),
    });
    await prisma.approvalRule.create({
      data: {
        id: ids.approvalRuleId,
        tenantId: ids.tenantId,
        companyId: ids.companyId,
        transactionType: `AUTHZ_PI_${suffix}`,
      },
    });
    await prisma.approvalInstance.createMany({
      data: [
        {
          id: ids.approveDispatchApprovalId,
          tenantId: ids.tenantId,
          companyId: ids.companyId,
          documentType: "PurchaseRequest",
          documentId: ids.scopedPurchaseRequestId,
          approvalRuleId: ids.approvalRuleId,
          status: "PENDING",
          currentStepOrder: 1,
        },
        {
          id: ids.rejectDispatchApprovalId,
          tenantId: ids.tenantId,
          companyId: ids.companyId,
          documentType: "PurchaseRequest",
          documentId: ids.scopedPurchaseRequestId,
          approvalRuleId: ids.approvalRuleId,
          status: "PENDING",
          currentStepOrder: 1,
        },
        {
          id: ids.multiStepApprovalId,
          tenantId: ids.tenantId,
          companyId: ids.companyId,
          documentType: "PurchaseRequest",
          documentId: ids.multiStepPurchaseRequestId,
          approvalRuleId: ids.approvalRuleId,
          status: "PENDING",
          currentStepOrder: 1,
        },
        {
          id: ids.recipientRevocationApprovalId,
          tenantId: ids.tenantId,
          companyId: ids.companyId,
          documentType: "PurchaseRequest",
          documentId: ids.recipientRevocationPurchaseRequestId,
          approvalRuleId: ids.approvalRuleId,
          status: "PENDING",
          currentStepOrder: 1,
        },
        {
          id: ids.requesterOnlyNextStepApprovalId,
          tenantId: ids.tenantId,
          companyId: ids.companyId,
          documentType: "PurchaseRequest",
          documentId: ids.requesterOnlyNextStepPurchaseRequestId,
          approvalRuleId: ids.approvalRuleId,
          status: "PENDING",
          currentStepOrder: 1,
        },
        {
          id: ids.mixedNextStepApprovalId,
          tenantId: ids.tenantId,
          companyId: ids.companyId,
          documentType: "PurchaseRequest",
          documentId: ids.mixedNextStepPurchaseRequestId,
          approvalRuleId: ids.approvalRuleId,
          status: "PENDING",
          currentStepOrder: 1,
        },
        {
          id: ids.finalOutcomeApprovalId,
          tenantId: ids.tenantId,
          companyId: ids.companyId,
          documentType: "PurchaseRequest",
          documentId: ids.finalOutcomePurchaseRequestId,
          approvalRuleId: ids.approvalRuleId,
          status: "PENDING",
          currentStepOrder: 1,
        },
        {
          id: ids.expiryApprovalId,
          tenantId: ids.tenantId,
          companyId: ids.companyId,
          documentType: "PurchaseRequest",
          documentId: ids.expiryPurchaseRequestId,
          approvalRuleId: ids.approvalRuleId,
          status: "PENDING",
          currentStepOrder: 1,
        },
        {
          id: ids.reassignedApprovalId,
          tenantId: ids.tenantId,
          companyId: ids.companyId,
          documentType: "PurchaseRequest",
          documentId: ids.reassignedPurchaseRequestId,
          approvalRuleId: ids.approvalRuleId,
          status: "PENDING",
          currentStepOrder: 1,
        },
        {
          id: ids.staleAuthorityApprovalId,
          tenantId: ids.tenantId,
          companyId: ids.companyId,
          documentType: "PurchaseRequest",
          documentId: ids.staleAuthorityPurchaseRequestId,
          approvalRuleId: ids.approvalRuleId,
          status: "PENDING",
          currentStepOrder: 1,
        },
      ],
    });
    await prisma.approvalInstanceStep.createMany({
      data: [
        {
          approvalInstanceId: ids.approveDispatchApprovalId,
          stepOrder: 1,
          assignedUserId: ids.userId,
          status: "PENDING",
        },
        {
          approvalInstanceId: ids.rejectDispatchApprovalId,
          stepOrder: 1,
          assignedUserId: ids.userId,
          status: "PENDING",
        },
        {
          approvalInstanceId: ids.multiStepApprovalId,
          stepOrder: 1,
          assignedUserId: ids.userId,
          status: "PENDING",
        },
        {
          approvalInstanceId: ids.multiStepApprovalId,
          stepOrder: 2,
          assignedUserId: ids.nextApproverId,
          status: "WAITING",
        },
        {
          approvalInstanceId: ids.recipientRevocationApprovalId,
          stepOrder: 1,
          assignedUserId: ids.userId,
          status: "PENDING",
        },
        {
          approvalInstanceId: ids.recipientRevocationApprovalId,
          stepOrder: 2,
          assignedUserId: ids.nextApproverId,
          status: "WAITING",
        },
        {
          approvalInstanceId: ids.requesterOnlyNextStepApprovalId,
          stepOrder: 1,
          assignedUserId: ids.userId,
          status: "PENDING",
        },
        {
          approvalInstanceId: ids.requesterOnlyNextStepApprovalId,
          stepOrder: 2,
          assignedUserId: ids.approvalRequesterId,
          status: "WAITING",
        },
        {
          approvalInstanceId: ids.mixedNextStepApprovalId,
          stepOrder: 1,
          assignedUserId: ids.userId,
          status: "PENDING",
        },
        {
          approvalInstanceId: ids.mixedNextStepApprovalId,
          stepOrder: 2,
          assignedRoleId: ids.nextRecipientRoleId,
          status: "WAITING",
        },
        {
          approvalInstanceId: ids.finalOutcomeApprovalId,
          stepOrder: 1,
          assignedUserId: ids.userId,
          status: "PENDING",
        },
        {
          approvalInstanceId: ids.expiryApprovalId,
          stepOrder: 1,
          assignedUserId: ids.userId,
          status: "PENDING",
        },
        {
          approvalInstanceId: ids.reassignedApprovalId,
          stepOrder: 1,
          assignedUserId: ids.userId,
          status: "PENDING",
        },
        {
          approvalInstanceId: ids.reassignedApprovalId,
          stepOrder: 2,
          assignedUserId: ids.nextApproverId,
          status: "WAITING",
        },
        {
          approvalInstanceId: ids.staleAuthorityApprovalId,
          stepOrder: 1,
          assignedUserId: ids.userId,
          status: "PENDING",
        },
      ],
    });
    await prisma.inventoryTransfer.createMany({
      data: [
        {
          id: ids.transferWrongSourceId,
          tenantId: ids.tenantId,
          companyId: ids.companyId,
          publicReference: `AUTHZ-PI-TR-SOURCE-${suffix}`,
          sourceLocationId: ids.adjacentLocationId,
          destinationLocationId: ids.locationId,
          requestedByUserId: ids.userId,
          transferType: "AUTHORIZATION_TEST",
          purpose: "Authorization wrong source location",
          status: "DISPATCHED",
          dispatchedByUserId: ids.userId,
        },
        {
          id: ids.transferWrongDestinationId,
          tenantId: ids.tenantId,
          companyId: ids.companyId,
          publicReference: `AUTHZ-PI-TR-DEST-${suffix}`,
          sourceLocationId: ids.locationId,
          destinationLocationId: ids.adjacentLocationId,
          requestedByUserId: ids.userId,
          transferType: "AUTHORIZATION_TEST",
          purpose: "Authorization wrong destination location",
          status: "RECEIVED",
        },
      ],
    });
    await prisma.stockCountSession.createMany({
      data: [
        {
          id: ids.adjacentStockCountId,
          tenantId: ids.tenantId,
          companyId: ids.companyId,
          inventoryLocationId: ids.adjacentInventoryLocationId,
          publicReference: `AUTHZ-PI-SC-ADJ-${suffix}`,
          countType: "SPOT",
          status: "DRAFT",
          createdByUserId: ids.userId,
        },
        {
          id: ids.scopedReviewedStockCountId,
          tenantId: ids.tenantId,
          companyId: ids.companyId,
          inventoryLocationId: ids.inventoryLocationId,
          publicReference: `AUTHZ-PI-SC-REV-${suffix}`,
          countType: "SPOT",
          status: "REVIEWED",
          createdByUserId: ids.userId,
        },
        {
          id: ids.scopedDraftStockCountId,
          tenantId: ids.tenantId,
          companyId: ids.companyId,
          inventoryLocationId: ids.inventoryLocationId,
          publicReference: `AUTHZ-PI-SC-DRAFT-${suffix}`,
          countType: "SPOT",
          status: "DRAFT",
          createdByUserId: ids.userId,
        },
      ],
    });
  });

  afterAll(async () => {
    clearAuthenticatedRequest();
    if (prisma) await prisma.$disconnect();
  });

  function movementInput(inventoryLocationId: string, itemId = ids.itemId) {
    return {
      inventoryLocationId,
      itemId,
      movementType: "ADJUSTMENT_IN" as const,
      occurredAt: new Date("2026-07-21T00:00:00.000Z"),
      enteredQuantity: 1,
      enteredUomId: ids.uomId,
      quantityDeltaBaseUom: 1,
      sourceDocumentType: "AUTHORIZATION_BOUNDARY_TEST",
      sourceDocumentId: randomUUID(),
      sourceEventKey: `authz-${randomUUID()}`,
      reasonCode: "AUTHORIZATION_TEST",
    };
  }

  async function mutationSnapshot() {
    const [movements, balances, audits] = await Promise.all([
      prisma.inventoryMovement.count({
        where: { tenantId: { in: [ids.tenantId, ids.foreignTenantId] } },
      }),
      prisma.inventoryBalance.count({
        where: { tenantId: { in: [ids.tenantId, ids.foreignTenantId] } },
      }),
      prisma.auditEvent.count({
        where: {
          tenantId: { in: [ids.tenantId, ids.foreignTenantId] },
          entityType: { in: ["InventoryMovement", "InventoryBalance"] },
        },
      }),
    ]);
    return { movements, balances, audits };
  }

  async function workflowMutationSnapshot() {
    const [
      purchaseRequests,
      quotationRecommendations,
      purchaseOrders,
      goodsReceipts,
      inventoryTransfers,
      stockCounts,
      wastageReports,
      stockAdjustments,
      approvalInstances,
      movements,
      balances,
      audits,
    ] = await Promise.all([
      prisma.purchaseRequest.count({ where: { tenantId: ids.tenantId } }),
      prisma.quotationRecommendation.count({ where: { tenantId: ids.tenantId } }),
      prisma.purchaseOrder.count({ where: { tenantId: ids.tenantId } }),
      prisma.goodsReceipt.count({ where: { tenantId: ids.tenantId } }),
      prisma.inventoryTransfer.count({ where: { tenantId: ids.tenantId } }),
      prisma.stockCountSession.count({ where: { tenantId: ids.tenantId } }),
      prisma.wastageReport.count({ where: { tenantId: ids.tenantId } }),
      prisma.stockAdjustment.count({ where: { tenantId: ids.tenantId } }),
      prisma.approvalInstance.count({ where: { tenantId: ids.tenantId } }),
      prisma.inventoryMovement.count({ where: { tenantId: ids.tenantId } }),
      prisma.inventoryBalance.count({ where: { tenantId: ids.tenantId } }),
      prisma.auditEvent.count({ where: { tenantId: ids.tenantId } }),
    ]);
    return {
      purchaseRequests,
      quotationRecommendations,
      purchaseOrders,
      goodsReceipts,
      inventoryTransfers,
      stockCounts,
      wastageReports,
      stockAdjustments,
      approvalInstances,
      movements,
      balances,
      audits,
    };
  }

  async function masterDataMutationSnapshot() {
    const [suppliers, supplierLinks, categories, uoms, items, conversions, comments, audits] =
      await Promise.all([
        prisma.supplier.count({ where: { tenantId: ids.tenantId } }),
        prisma.supplierItemLink.count({ where: { tenantId: ids.tenantId } }),
        prisma.itemCategory.count({ where: { tenantId: ids.tenantId } }),
        prisma.uom.count({ where: { tenantId: ids.tenantId } }),
        prisma.item.count({ where: { tenantId: ids.tenantId } }),
        prisma.itemUomConversion.count({
          where: { item: { tenantId: ids.tenantId } },
        }),
        prisma.purchaseRequestComment.count({ where: { tenantId: ids.tenantId } }),
        prisma.auditEvent.count({ where: { tenantId: ids.tenantId } }),
      ]);
    return { suppliers, supplierLinks, categories, uoms, items, conversions, comments, audits };
  }

  function form(values: Record<string, string>) {
    const data = new FormData();
    for (const [key, value] of Object.entries(values)) data.set(key, value);
    return data;
  }

  async function grantPermission(code: string) {
    const permission = await prisma.permission.findUnique({ where: { code } });
    if (!permission) throw new Error(`AUTHORIZATION_PERMISSION_FIXTURE_MISSING:${code}`);
    await prisma.rolePermission.upsert({
      where: {
        roleId_permissionId: { roleId: ids.roleId, permissionId: permission.id },
      },
      create: { roleId: ids.roleId, permissionId: permission.id },
      update: {},
    });
    await prisma.rolePermission.upsert({
      where: {
        roleId_permissionId: {
          roleId: ids.nextRecipientRoleId,
          permissionId: permission.id,
        },
      },
      create: {
        roleId: ids.nextRecipientRoleId,
        permissionId: permission.id,
      },
      update: {},
    });
    return async () => {
      await prisma.rolePermission.deleteMany({
        where: {
          roleId: { in: [ids.roleId, ids.nextRecipientRoleId] },
          permissionId: permission.id,
        },
      });
    };
  }

  it("AUTHZ-PI-PUBLIC-BOUNDARIES-MISSING-PERMISSION-NO-MUTATION", async () => {
    const [
      approvals,
      purchaseRequests,
      quotes,
      purchaseOrders,
      receiving,
      transfers,
      stockCounts,
      wastage,
      stockAdjustments,
    ] = await Promise.all([
      import("../src/server/services/approvals"),
      import("../src/server/services/purchaseRequests"),
      import("../src/server/services/quotes"),
      import("../src/server/services/purchaseOrders"),
      import("../src/server/services/receiving"),
      import("../src/server/services/transfers"),
      import("../src/server/services/stockCounts"),
      import("../src/server/services/wastage"),
      import("../src/server/services/stockAdjustments"),
    ]);
    const emptyForm = () => new FormData();
    const boundaries: Array<{ id: string; invoke: () => Promise<unknown> }> = [
      { id: "approvals.approvePurchaseRequest", invoke: () => approvals.approvePurchaseRequest(emptyForm()) },
      { id: "approvals.approveWastageReport", invoke: () => approvals.approveWastageReport(emptyForm()) },
      { id: "approvals.approveStockAdjustment", invoke: () => approvals.approveStockAdjustment(emptyForm()) },
      { id: "approvals.approvePurchaseOrderBalanceClosure", invoke: () => approvals.approvePurchaseOrderBalanceClosure(emptyForm()) },
      { id: "approvals.approvePurchaseOrderAmendment", invoke: () => approvals.approvePurchaseOrderAmendment(emptyForm()) },
      { id: "approvals.approveEmployeeLeaveRequestApproval", invoke: () => approvals.approveEmployeeLeaveRequestApproval(emptyForm()) },
      { id: "approvals.approveEmployeeOvertimeRecordApproval", invoke: () => approvals.approveEmployeeOvertimeRecordApproval(emptyForm()) },
      { id: "approvals.rejectEmployeeOvertimeRecordApproval", invoke: () => approvals.rejectEmployeeOvertimeRecordApproval(emptyForm()) },
      { id: "approvals.approveWorkforceScheduleApproval", invoke: () => approvals.approveWorkforceScheduleApproval(emptyForm()) },
      { id: "approvals.approveAttendanceImportBatchApproval", invoke: () => approvals.approveAttendanceImportBatchApproval(emptyForm()) },
      { id: "approvals.approvePurchaseOrder", invoke: () => approvals.approvePurchaseOrder(emptyForm()) },
      { id: "approvals.approveQuotationRecommendation", invoke: () => approvals.approveQuotationRecommendation(emptyForm()) },
      { id: "approvals.approveBudgetRevision", invoke: () => approvals.approveBudgetRevision(emptyForm()) },
      { id: "approvals.approveExpenseRequest", invoke: () => approvals.approveExpenseRequest(emptyForm()) },
      { id: "approvals.approveCashAdvanceRequest", invoke: () => approvals.approveCashAdvanceRequest(emptyForm()) },
      { id: "approvals.approvePettyCashRequest", invoke: () => approvals.approvePettyCashRequest(emptyForm()) },
      { id: "approvals.approvePaymentRequestApproval", invoke: () => approvals.approvePaymentRequestApproval(emptyForm()) },
      { id: "approvals.approvePaymentReleaseApproval", invoke: () => approvals.approvePaymentReleaseApproval(emptyForm()) },
      { id: "approvals.rejectPaymentReleaseApproval", invoke: () => approvals.rejectPaymentReleaseApproval(emptyForm()) },
      { id: "approvals.rejectPurchaseRequest", invoke: () => approvals.rejectPurchaseRequest(emptyForm()) },
      { id: "approvals.returnPurchaseRequest", invoke: () => approvals.returnPurchaseRequest(emptyForm()) },
      { id: "approvals.runApprovalReminderScan", invoke: () => approvals.runApprovalReminderScan(session) },
      { id: "purchaseRequests.submitPurchaseRequest", invoke: () => purchaseRequests.submitPurchaseRequest(randomUUID()) },
      { id: "purchaseRequests.reopenReturnedPurchaseRequest", invoke: () => purchaseRequests.reopenReturnedPurchaseRequest(randomUUID()) },
      { id: "purchaseRequests.cancelPurchaseRequest", invoke: () => purchaseRequests.cancelPurchaseRequest(emptyForm()) },
      { id: "purchaseRequests.completeEmergencyPurchasePostReview", invoke: () => purchaseRequests.completeEmergencyPurchasePostReview(emptyForm()) },
      { id: "quotes.createSupplierQuote", invoke: () => quotes.createSupplierQuote(emptyForm()) },
      { id: "quotes.createQuotationRecommendation", invoke: () => quotes.createQuotationRecommendation(emptyForm()) },
      { id: "quotes.submitQuotationRecommendation", invoke: () => quotes.submitQuotationRecommendation(emptyForm()) },
      { id: "purchaseOrders.createPurchaseOrderFromRecommendation", invoke: () => purchaseOrders.createPurchaseOrderFromRecommendation(emptyForm()) },
      { id: "purchaseOrders.submitPurchaseOrderForApproval", invoke: () => purchaseOrders.submitPurchaseOrderForApproval(emptyForm()) },
      { id: "purchaseOrders.issuePurchaseOrderToSupplier", invoke: () => purchaseOrders.issuePurchaseOrderToSupplier(emptyForm()) },
      { id: "purchaseOrders.cancelPurchaseOrder", invoke: () => purchaseOrders.cancelPurchaseOrder(emptyForm()) },
      { id: "purchaseOrders.requestPurchaseOrderAmendment", invoke: () => purchaseOrders.requestPurchaseOrderAmendment(emptyForm()) },
      { id: "purchaseOrders.requestPurchaseOrderBalanceClosure", invoke: () => purchaseOrders.requestPurchaseOrderBalanceClosure(emptyForm()) },
      { id: "receiving.createGoodsReceiptFromPurchaseOrder", invoke: () => receiving.createGoodsReceiptFromPurchaseOrder(emptyForm()) },
      { id: "receiving.postGoodsReceipt", invoke: () => receiving.postGoodsReceipt(emptyForm()) },
      { id: "receiving.reverseGoodsReceipt", invoke: () => receiving.reverseGoodsReceipt(emptyForm()) },
      { id: "receiving.buildReceivingReportExportRows", invoke: () => receiving.buildReceivingReportExportRows(session) },
      { id: "transfers.createInventoryTransfer", invoke: () => transfers.createInventoryTransfer(emptyForm()) },
      { id: "transfers.submitInventoryTransfer", invoke: () => transfers.submitInventoryTransfer(emptyForm()) },
      { id: "transfers.dispatchInventoryTransfer", invoke: () => transfers.dispatchInventoryTransfer(emptyForm()) },
      { id: "transfers.receiveInventoryTransfer", invoke: () => transfers.receiveInventoryTransfer(emptyForm()) },
      { id: "transfers.reverseInventoryTransferReceipt", invoke: () => transfers.reverseInventoryTransferReceipt(emptyForm()) },
      { id: "transfers.cancelInventoryTransfer", invoke: () => transfers.cancelInventoryTransfer(emptyForm()) },
      { id: "transfers.buildInventoryTransferExportRows", invoke: () => transfers.buildInventoryTransferExportRows(session) },
      { id: "stockCounts.submitStockCount", invoke: () => stockCounts.submitStockCount(emptyForm()) },
      { id: "stockCounts.reviewStockCount", invoke: () => stockCounts.reviewStockCount(emptyForm()) },
      { id: "stockCounts.cancelStockCount", invoke: () => stockCounts.cancelStockCount(emptyForm()) },
      { id: "stockCounts.scheduleStockCount", invoke: () => stockCounts.scheduleStockCount(emptyForm()) },
      { id: "stockCounts.startStockCount", invoke: () => stockCounts.startStockCount(emptyForm()) },
      { id: "stockCounts.saveStockCountEntries", invoke: () => stockCounts.saveStockCountEntries({}) },
      { id: "stockCounts.generateStockCountVarianceAdjustment", invoke: () => stockCounts.generateStockCountVarianceAdjustment(emptyForm()) },
      { id: "stockCounts.buildStockCountExportRows", invoke: () => stockCounts.buildStockCountExportRows(session) },
      { id: "wastage.createWastageReport", invoke: () => wastage.createWastageReport(emptyForm()) },
      { id: "wastage.submitWastageReport", invoke: () => wastage.submitWastageReport(emptyForm()) },
      { id: "wastage.reviewWastageReport", invoke: () => wastage.reviewWastageReport(emptyForm()) },
      { id: "wastage.cancelWastageReport", invoke: () => wastage.cancelWastageReport(emptyForm()) },
      { id: "wastage.postWastageReport", invoke: () => wastage.postWastageReport(emptyForm()) },
      { id: "wastage.reverseWastageReport", invoke: () => wastage.reverseWastageReport(emptyForm()) },
      { id: "stockAdjustments.createStockAdjustment", invoke: () => stockAdjustments.createStockAdjustment(emptyForm()) },
      { id: "stockAdjustments.submitStockAdjustment", invoke: () => stockAdjustments.submitStockAdjustment(emptyForm()) },
      { id: "stockAdjustments.cancelStockAdjustment", invoke: () => stockAdjustments.cancelStockAdjustment(emptyForm()) },
      { id: "stockAdjustments.postStockAdjustment", invoke: () => stockAdjustments.postStockAdjustment(emptyForm()) },
      { id: "stockAdjustments.reverseStockAdjustment", invoke: () => stockAdjustments.reverseStockAdjustment(emptyForm()) },
      { id: "transfers.settleInventoryTransferDiscrepancy", invoke: () => transfers.settleInventoryTransferDiscrepancy(emptyForm()) },
    ];

    const before = await workflowMutationSnapshot();
    for (const boundary of boundaries) {
      await expect(boundary.invoke(), boundary.id).rejects.toThrow("PERMISSION_DENIED");
    }
    expect(await workflowMutationSnapshot()).toEqual(before);
  });

  it("AUTHZ-PI-GENERIC-APPROVAL-DISPATCH-MISSING-PERMISSION-NO-MUTATION", async () => {
    const approvals = await import("../src/server/services/approvals");
    const before = await workflowMutationSnapshot();
    await expect(
      approvals.approveApproval(
        form({ approvalInstanceId: ids.approveDispatchApprovalId }),
      ),
    ).rejects.toThrow("PERMISSION_DENIED");
    await expect(
      approvals.rejectApproval(
        form({
          approvalInstanceId: ids.rejectDispatchApprovalId,
          remarks: "Authorization rejection test",
        }),
      ),
    ).rejects.toThrow("PERMISSION_DENIED");
    await expect(
      approvals.returnApproval(
        form({
          approvalInstanceId: ids.approveDispatchApprovalId,
          remarks: "Authorization return test",
        }),
      ),
    ).rejects.toThrow("PERMISSION_DENIED");
    expect(await workflowMutationSnapshot()).toEqual(before);
  });

  it("AUTHZ-PI-APPROVAL-READ-AND-REMINDER-STALE-SESSION-REVOKED", async () => {
    const approvals = await import("../src/server/services/approvals");
    const staleSession: SessionContext = {
      ...session,
      permissionCodes: ["purchasing.purchase_request.approve"],
    };
    const before = await workflowMutationSnapshot();
    await expect(approvals.listPendingApprovals(staleSession)).resolves.toEqual([]);
    await expect(
      approvals.getApprovalDetail(staleSession, ids.approveDispatchApprovalId),
    ).resolves.toBeNull();
    await expect(approvals.runApprovalReminderScan(staleSession)).rejects.toThrow(
      "PERMISSION_DENIED",
    );
    expect(await workflowMutationSnapshot()).toEqual(before);
  });

  it("AUTHZ-PI-MASTER-DATA-BOUNDARIES-VALID-INPUT-MISSING-PERMISSION-NO-MUTATION", async () => {
    const [suppliers, items] = await Promise.all([
      import("../src/server/services/suppliers"),
      import("../src/server/services/items"),
    ]);
    const boundaries: Array<{ id: string; invoke: () => Promise<unknown> }> = [
      {
        id: "suppliers.createSupplier",
        invoke: () =>
          suppliers.createSupplier(
            form({ supplierCode: `NEW-${suffix}`, legalName: "Authorization Supplier", reason: "Authorization test" }),
          ),
      },
      {
        id: "suppliers.createSupplierItemLink",
        invoke: () =>
          suppliers.createSupplierItemLink(
            form({
              supplierId: randomUUID(), itemId: ids.itemId, purchaseUomId: ids.uomId,
              reason: "Authorization test",
            }),
          ),
      },
      {
        id: "suppliers.updateSupplierAccreditation",
        invoke: () =>
          suppliers.updateSupplierAccreditation(
            form({
              supplierId: randomUUID(), accreditationStatus: "APPROVED", reason: "Authorization test",
            }),
          ),
      },
      {
        id: "items.createItemCategory",
        invoke: () =>
          items.createItemCategory(
            form({
              categoryCode: `NEW-${suffix}`, categoryName: "Authorization Category",
              inventoryClass: "OPERATING_SUPPLY", reason: "Authorization test",
            }),
          ),
      },
      {
        id: "items.createUom",
        invoke: () =>
          items.createUom(
            form({ uomCode: `BX-${suffix}`, uomName: "Box", uomType: "count", decimalPrecision: "0", reason: "Authorization test" }),
          ),
      },
      {
        id: "items.createItem",
        invoke: () =>
          items.createItem(
            form({
              itemCode: `NEW-${suffix}`, itemName: "Authorization Item", itemCategoryId: ids.categoryId,
              itemType: "inventory", baseUomId: ids.uomId, reason: "Authorization test",
            }),
          ),
      },
      {
        id: "items.createItemUomConversion",
        invoke: () =>
          items.createItemUomConversion(
            form({
              itemId: ids.itemId, fromUomId: ids.uomId, toUomId: randomUUID(),
              conversionFactor: "2", roundingRule: "none", reason: "Authorization test",
            }),
          ),
      },
      {
        id: "items.updateItemCategory",
        invoke: () =>
          items.updateItemCategory(
            form({
              categoryId: ids.categoryId, categoryName: "Authorization Category Updated",
              inventoryClass: "OPERATING_SUPPLY", reason: "Authorization test",
            }),
          ),
      },
      {
        id: "items.updateUom",
        invoke: () =>
          items.updateUom(
            form({
              uomId: ids.uomId, uomName: "Each Updated", uomType: "count",
              decimalPrecision: "0", reason: "Authorization test",
            }),
          ),
      },
      {
        id: "items.updateItem",
        invoke: () =>
          items.updateItem(
            form({
              itemId: ids.itemId, itemName: "Authorization Item Updated",
              itemCategoryId: ids.categoryId, itemType: "inventory", baseUomId: ids.uomId,
              reason: "Authorization test",
            }),
          ),
      },
      {
        id: "items.updateItemUomConversion",
        invoke: () =>
          items.updateItemUomConversion(
            form({
              conversionId: randomUUID(), conversionFactor: "2", roundingRule: "none",
              reason: "Authorization test",
            }),
          ),
      },
      {
        id: "items.deactivateItem",
        invoke: () =>
          items.deactivateItem(
            form({ itemId: ids.itemId, reason: "Authorization test" }),
          ),
      },
      {
        id: "items.deactivateItemCategory",
        invoke: () =>
          items.deactivateItemCategory(
            form({ categoryId: ids.categoryId, reason: "Authorization test" }),
          ),
      },
      {
        id: "items.deactivateUom",
        invoke: () =>
          items.deactivateUom(
            form({ uomId: ids.uomId, reason: "Authorization test" }),
          ),
      },
      {
        id: "suppliers.deactivateSupplier",
        invoke: () =>
          suppliers.deactivateSupplier(
            form({ supplierId: randomUUID(), reason: "Authorization test" }),
          ),
      },
      {
        id: "suppliers.deactivateSupplierItemLink",
        invoke: () =>
          suppliers.deactivateSupplierItemLink(
            form({ supplierItemLinkId: randomUUID(), reason: "Authorization test" }),
          ),
      },
    ];
    const before = await masterDataMutationSnapshot();
    for (const boundary of boundaries) {
      await expect(boundary.invoke(), boundary.id).rejects.toThrow("PERMISSION_DENIED");
    }
    expect(await masterDataMutationSnapshot()).toEqual(before);
  });

  it("AUTHZ-PI-PURCHASE-REQUEST-CREATE-VALID-INPUT-MISSING-PERMISSION-NO-MUTATION", async () => {
    const purchaseRequests = await import("../src/server/services/purchaseRequests");
    const data = form({
      requiredDate: "2026-07-31",
      urgency: "Normal",
      justification: "Authorization request creation test",
      lineItemId: ids.itemId,
      lineRequestedQty: "1",
      lineEstimatedUnitCost: "0",
      lineUomId: ids.uomId,
      linePurpose: "Authorization coverage",
    });
    const before = await workflowMutationSnapshot();
    await expect(purchaseRequests.createDraftPurchaseRequest(data)).rejects.toThrow(
      "PERMISSION_DENIED",
    );
    expect(await workflowMutationSnapshot()).toEqual(before);
  });

  it("AUTHZ-PI-ATTACHMENT-LINK-MISSING-PERMISSION-DENIAL-AUDIT-NO-LINK", async () => {
    const attachments = await import("../src/server/services/attachments");
    const beforeLinks = await prisma.controlledEvidenceAttachment.count({
      where: { tenantId: ids.tenantId },
    });
    const beforeDenials = await prisma.auditEvent.count({
      where: {
        tenantId: ids.tenantId,
        eventType: "controlled_evidence_attachment.denied",
      },
    });
    await expect(
      attachments.linkControlledEvidenceAttachment({
        sourceType: "EXPENSE_REQUEST",
        sourceRecordId: ids.scopedPurchaseRequestId,
        attachmentId: randomUUID(),
        purpose: "EVIDENCE",
        requiredPermissionCode: "purchasing.purchase_request.submit",
      }),
    ).rejects.toThrow("PERMISSION_DENIED");
    expect(
      await prisma.controlledEvidenceAttachment.count({
        where: { tenantId: ids.tenantId },
      }),
    ).toBe(beforeLinks);
    expect(
      await prisma.auditEvent.count({
        where: {
          tenantId: ids.tenantId,
          eventType: "controlled_evidence_attachment.denied",
        },
      }),
    ).toBe(beforeDenials + 1);
  });

  it("AUTHZ-PI-PURCHASE-REQUEST-COMMENT-WRONG-LOCATION-NO-MUTATION", async () => {
    const purchaseRequests = await import("../src/server/services/purchaseRequests");
    const before = await masterDataMutationSnapshot();
    await expect(
      purchaseRequests.addPurchaseRequestComment(
        form({
          purchaseRequestId: ids.adjacentPurchaseRequestId,
          body: "Unauthorized adjacent location comment",
        }),
      ),
    ).rejects.toThrow("PURCHASE_REQUEST_NOT_FOUND");
    expect(await masterDataMutationSnapshot()).toEqual(before);
  });

  it("AUTHZ-PI-GENERIC-APPROVAL-SELF-ACTION-BLOCKED-NO-MUTATION", async () => {
    const approvals = await import("../src/server/services/approvals");
    const revoke = await grantPermission("purchasing.purchase_request.approve");
    try {
      const before = await workflowMutationSnapshot();
      await expect(
        approvals.approveApproval(
          form({ approvalInstanceId: ids.approveDispatchApprovalId }),
        ),
      ).rejects.toThrow("SELF_APPROVAL_BLOCKED");
      await expect(
        approvals.rejectApproval(
          form({
            approvalInstanceId: ids.rejectDispatchApprovalId,
            remarks: "Authorization self rejection",
          }),
        ),
      ).rejects.toThrow("SELF_APPROVAL_BLOCKED");
      expect(await workflowMutationSnapshot()).toEqual(before);
    } finally {
      await revoke();
    }
  });

  it("AUTHZ-PI-MULTI-STEP-ADVANCE-NOTIFIES-NEXT-ELIGIBLE-APPROVER", async () => {
    const approvals = await import("../src/server/services/approvals");
    const revoke = await grantPermission("purchasing.purchase_request.approve");
    try {
      await approvals.approvePurchaseRequest(
        form({ approvalInstanceId: ids.multiStepApprovalId }),
      );
      const [approval, steps, request, notifications] = await Promise.all([
        prisma.approvalInstance.findUniqueOrThrow({
          where: { id: ids.multiStepApprovalId },
        }),
        prisma.approvalInstanceStep.findMany({
          where: { approvalInstanceId: ids.multiStepApprovalId },
          orderBy: { stepOrder: "asc" },
        }),
        prisma.purchaseRequest.findUniqueOrThrow({
          where: { id: ids.multiStepPurchaseRequestId },
        }),
        prisma.notification.findMany({
          where: {
            tenantId: ids.tenantId,
            recipientUserId: ids.nextApproverId,
            notificationType: "APPROVAL_STEP_READY",
            entityId: ids.multiStepPurchaseRequestId,
          },
        }),
      ]);
      expect(approval.status).toBe("PENDING");
      expect(approval.currentStepOrder).toBe(2);
      expect(steps.map(({ status }) => status)).toEqual(["APPROVED", "PENDING"]);
      expect(request.status).toBe("PENDING_APPROVAL");
      expect(request.currentApprovalStep).toBe(2);
      expect(notifications).toHaveLength(1);
      expect(notifications[0]?.deepLink).toBe(
        `/approvals/${ids.multiStepApprovalId}`,
      );
    } finally {
      await revoke();
    }
  });

  it("AUTHZ-PI-DIRECT-REQUESTER-NEXT-STEP-IS-REJECTED-WITHOUT-MUTATION", async () => {
    const approvals = await import("../src/server/services/approvals");
    const revoke = await grantPermission("purchasing.purchase_request.approve");
    try {
      const beforeAuditCount = await prisma.auditEvent.count({
        where: {
          tenantId: ids.tenantId,
          entityId: ids.requesterOnlyNextStepPurchaseRequestId,
        },
      });
      await expect(
        approvals.approvePurchaseRequest(
          form({ approvalInstanceId: ids.requesterOnlyNextStepApprovalId }),
        ),
      ).rejects.toThrow("APPROVAL_NEXT_STEP_RECIPIENT_NOT_AVAILABLE");

      const [approval, steps, request, auditCount, notificationCount] =
        await Promise.all([
          prisma.approvalInstance.findUniqueOrThrow({
            where: { id: ids.requesterOnlyNextStepApprovalId },
          }),
          prisma.approvalInstanceStep.findMany({
            where: { approvalInstanceId: ids.requesterOnlyNextStepApprovalId },
            orderBy: { stepOrder: "asc" },
          }),
          prisma.purchaseRequest.findUniqueOrThrow({
            where: { id: ids.requesterOnlyNextStepPurchaseRequestId },
          }),
          prisma.auditEvent.count({
            where: {
              tenantId: ids.tenantId,
              entityId: ids.requesterOnlyNextStepPurchaseRequestId,
            },
          }),
          prisma.notification.count({
            where: {
              tenantId: ids.tenantId,
              entityId: ids.requesterOnlyNextStepPurchaseRequestId,
            },
          }),
        ]);
      expect(approval).toMatchObject({ status: "PENDING", currentStepOrder: 1 });
      expect(steps.map(({ status }) => status)).toEqual(["PENDING", "WAITING"]);
      expect(request).toMatchObject({
        status: "PENDING_APPROVAL",
        currentApprovalStep: 1,
      });
      expect(auditCount).toBe(beforeAuditCount);
      expect(notificationCount).toBe(0);
    } finally {
      await revoke();
    }
  });

  it("AUTHZ-PI-MIXED-NEXT-ROLE-EXCLUDES-REQUESTER-AND-NOTIFIES-NON-REQUESTER", async () => {
    const approvals = await import("../src/server/services/approvals");
    const revoke = await grantPermission("purchasing.purchase_request.approve");
    try {
      await approvals.approvePurchaseRequest(
        form({ approvalInstanceId: ids.mixedNextStepApprovalId }),
      );
      const [approval, steps, request, notifications] = await Promise.all([
        prisma.approvalInstance.findUniqueOrThrow({
          where: { id: ids.mixedNextStepApprovalId },
        }),
        prisma.approvalInstanceStep.findMany({
          where: { approvalInstanceId: ids.mixedNextStepApprovalId },
          orderBy: { stepOrder: "asc" },
        }),
        prisma.purchaseRequest.findUniqueOrThrow({
          where: { id: ids.mixedNextStepPurchaseRequestId },
        }),
        prisma.notification.findMany({
          where: {
            tenantId: ids.tenantId,
            entityId: ids.mixedNextStepPurchaseRequestId,
            notificationType: "APPROVAL_STEP_READY",
          },
        }),
      ]);
      expect(approval).toMatchObject({ status: "PENDING", currentStepOrder: 2 });
      expect(steps.map(({ status }) => status)).toEqual(["APPROVED", "PENDING"]);
      expect(request).toMatchObject({
        status: "PENDING_APPROVAL",
        currentApprovalStep: 2,
      });
      expect(notifications.map(({ recipientUserId }) => recipientUserId)).toEqual([
        ids.nextApproverId,
      ]);
    } finally {
      await revoke();
    }
  });

  it("AUTHZ-PI-NEXT-RECIPIENT-REVOCATION-IS-REVALIDATED-BEFORE-ADVANCE", async () => {
    const approvals = await import("../src/server/services/approvals");
    const revokePermission = await grantPermission("purchasing.purchase_request.approve");
    let releaseRecipientRevocation!: () => void;
    let recipientRevocationLocked!: () => void;
    const recipientRevocationReady = new Promise<void>((resolve) => {
      recipientRevocationLocked = resolve;
    });
    const recipientRevocationGate = new Promise<void>((resolve) => {
      releaseRecipientRevocation = resolve;
    });
    try {
      const revokeRecipient = prisma.$transaction(async (tx) => {
        await tx.user.update({
          where: { id: ids.nextApproverId },
          data: { status: "INACTIVE" },
        });
        recipientRevocationLocked();
        await recipientRevocationGate;
      });
      await recipientRevocationReady;

      const approvalAttempt = expect(
        approvals.approvePurchaseRequest(
          form({ approvalInstanceId: ids.recipientRevocationApprovalId }),
        ),
      ).rejects.toThrow("APPROVAL_NEXT_STEP_RECIPIENT_NOT_AVAILABLE");
      await new Promise((resolve) => setTimeout(resolve, 25));
      releaseRecipientRevocation();
      await revokeRecipient;
      await approvalAttempt;

      const [approval, steps, request, notifications] = await Promise.all([
        prisma.approvalInstance.findUniqueOrThrow({
          where: { id: ids.recipientRevocationApprovalId },
        }),
        prisma.approvalInstanceStep.findMany({
          where: { approvalInstanceId: ids.recipientRevocationApprovalId },
          orderBy: { stepOrder: "asc" },
        }),
        prisma.purchaseRequest.findUniqueOrThrow({
          where: { id: ids.recipientRevocationPurchaseRequestId },
        }),
        prisma.notification.findMany({
          where: {
            tenantId: ids.tenantId,
            notificationType: "APPROVAL_STEP_READY",
            entityId: ids.recipientRevocationPurchaseRequestId,
          },
        }),
      ]);
      expect(approval).toMatchObject({ status: "PENDING", currentStepOrder: 1 });
      expect(steps.map(({ status }) => status)).toEqual(["PENDING", "WAITING"]);
      expect(request).toMatchObject({
        status: "PENDING_APPROVAL",
        currentApprovalStep: 1,
      });
      expect(notifications).toHaveLength(0);
    } finally {
      releaseRecipientRevocation?.();
      await prisma.user.update({
        where: { id: ids.nextApproverId },
        data: { status: "ACTIVE" },
      });
      await revokePermission();
    }
  });

  it("AUTHZ-PI-FINAL-APPROVAL-NOTIFIES-THE-REQUESTER-ATOMically", async () => {
    const approvals = await import("../src/server/services/approvals");
    const revoke = await grantPermission("purchasing.purchase_request.approve");
    try {
      await approvals.approvePurchaseRequest(
        form({ approvalInstanceId: ids.finalOutcomeApprovalId }),
      );
      const notification = await prisma.notification.findUniqueOrThrow({
        where: {
          tenantId_recipientUserId_sourceEventKey: {
            tenantId: ids.tenantId,
            recipientUserId: ids.approvalRequesterId,
            sourceEventKey: `approval:${ids.finalOutcomeApprovalId}:outcome:APPROVED`,
          },
        },
      });
      expect(notification).toMatchObject({
        notificationType: "APPROVAL_OUTCOME_APPROVED",
        entityId: ids.finalOutcomePurchaseRequestId,
        deepLink: `/approvals/${ids.finalOutcomeApprovalId}`,
      });
      expect(notification.title).toContain(`AUTHZ-PI-OUTCOME-${suffix}`);
      expect(notification.body).toContain(`Authorization Inventory Location ${suffix}`);
    } finally {
      await revoke();
    }
  });

  it("AUTHZ-PI-SESSION-EXPIRING-WHILE-WAITING-CANNOT-ACT", async () => {
    const approvals = await import("../src/server/services/approvals");
    const revoke = await grantPermission("purchasing.purchase_request.approve");
    let releaseApprovalLock!: () => void;
    let approvalLocked!: () => void;
    const approvalLockReady = new Promise<void>((resolve) => {
      approvalLocked = resolve;
    });
    const approvalLockGate = new Promise<void>((resolve) => {
      releaseApprovalLock = resolve;
    });
    try {
      await prisma.authSession.update({
        where: { id: ids.authSessionId },
        data: {
          idleExpiresAt: new Date(Date.now() + 400),
          absoluteExpiresAt: new Date(Date.now() + 60_000),
        },
      });
      const holdApprovalLock = prisma.$transaction(async (tx) => {
        await tx.$queryRaw<Array<{ id: string }>>`
          SELECT id
            FROM "ApprovalInstance"
           WHERE id = ${ids.expiryApprovalId}::uuid
           FOR UPDATE
        `;
        approvalLocked();
        await approvalLockGate;
      });
      await approvalLockReady;
      const approvalAttempt = expect(
        approvals.approvePurchaseRequest(
          form({ approvalInstanceId: ids.expiryApprovalId }),
        ),
      ).rejects.toThrow("APPROVAL_AUTHORITY_STALE");
      await new Promise((resolve) => setTimeout(resolve, 650));
      releaseApprovalLock();
      await holdApprovalLock;
      await approvalAttempt;

      expect(
        await prisma.approvalInstance.findUniqueOrThrow({
          where: { id: ids.expiryApprovalId },
        }),
      ).toMatchObject({ status: "PENDING", currentStepOrder: 1 });
      expect(
        await prisma.purchaseRequest.findUniqueOrThrow({
          where: { id: ids.expiryPurchaseRequestId },
        }),
      ).toMatchObject({ status: "PENDING_APPROVAL", currentApprovalStep: 1 });
    } finally {
      releaseApprovalLock?.();
      await prisma.authSession.update({
        where: { id: ids.authSessionId },
        data: {
          status: "ACTIVE",
          privilegeEpochAtIssue: 0,
          revokedAt: null,
          revocationReason: null,
          idleExpiresAt: new Date(Date.now() + 30 * 60_000),
          absoluteExpiresAt: new Date(Date.now() + 60 * 60_000),
        },
      });
      await revoke();
    }
  });

  it("AUTHZ-PI-BALANCE-CLOSURE-SERIALIZES-A-CONCURRENT-RECEIPT", async () => {
    const approvals = await import("../src/server/services/approvals");
    const fixture = {
      supplierId: randomUUID(),
      purchaseRequestId: randomUUID(),
      quotationRequestId: randomUUID(),
      supplierQuotationId: randomUUID(),
      recommendationId: randomUUID(),
      purchaseOrderId: randomUUID(),
      purchaseOrderLineId: randomUUID(),
      closureId: randomUUID(),
      approvalId: randomUUID(),
    };
    const revoke = await grantPermission("purchasing.purchase_order.approve");
    try {
      await prisma.supplier.create({
        data: {
          id: fixture.supplierId,
          tenantId: ids.tenantId,
          companyId: ids.companyId,
          supplierCode: `AUTHZ-PO-S-${suffix}`,
          legalName: `Authorization PO Supplier ${suffix}`,
        },
      });
      await prisma.purchaseRequest.create({
        data: {
          id: fixture.purchaseRequestId,
          publicReference: `AUTHZ-PO-PR-${suffix}`,
          tenantId: ids.tenantId,
          companyId: ids.companyId,
          requestLocationId: ids.locationId,
          requesterUserId: ids.approvalRequesterId,
          requiredDate: new Date("2026-07-31T00:00:00.000Z"),
          urgency: "Normal",
          justification: "Concurrent receipt closure fixture",
          status: "APPROVED",
        },
      });
      const purchaseRequestLine = await prisma.purchaseRequestLine.create({
        data: {
          purchaseRequestId: fixture.purchaseRequestId,
          itemId: ids.itemId,
          uomId: ids.uomId,
          lineNumber: 1,
          description: "Concurrent receipt item",
          requestedQty: 10,
          estimatedUnitCost: 1,
          estimatedLineTotal: 10,
          uomCode: "EA",
          purpose: "Authorization coverage",
        },
      });
      await prisma.quotationRequest.create({
        data: {
          id: fixture.quotationRequestId,
          tenantId: ids.tenantId,
          companyId: ids.companyId,
          publicReference: `AUTHZ-PO-QR-${suffix}`,
          purchaseRequestId: fixture.purchaseRequestId,
          status: "CLOSED",
          requiredDate: new Date("2026-07-31T00:00:00.000Z"),
          createdByUserId: ids.approvalRequesterId,
        },
      });
      await prisma.supplierQuotation.create({
        data: {
          id: fixture.supplierQuotationId,
          quotationRequestId: fixture.quotationRequestId,
          tenantId: ids.tenantId,
          companyId: ids.companyId,
          supplierId: fixture.supplierId,
          quoteReference: `AUTHZ-PO-SQ-${suffix}`,
          quoteDate: new Date("2026-07-21T00:00:00.000Z"),
          currencyCode: "PHP",
          totalAmount: 10,
        },
      });
      await prisma.quotationRecommendation.create({
        data: {
          id: fixture.recommendationId,
          tenantId: ids.tenantId,
          companyId: ids.companyId,
          quotationRequestId: fixture.quotationRequestId,
          selectedSupplierQuotationId: fixture.supplierQuotationId,
          preparedByUserId: ids.approvalRequesterId,
          status: "APPROVED",
          currencyCode: "PHP",
          selectedEvaluatedTotal: 10,
          lowestEvaluatedTotal: 10,
          quoteCount: 1,
          isLowestEvaluatedCost: true,
          selectionReason: "Authorization fixture",
          singleSourceJustification: "Single quotation authorization fixture",
          evaluationSnapshot: {},
        },
      });
      await prisma.purchaseOrder.create({
        data: {
          id: fixture.purchaseOrderId,
          tenantId: ids.tenantId,
          companyId: ids.companyId,
          publicReference: `AUTHZ-PO-${suffix}`,
          purchaseRequestId: fixture.purchaseRequestId,
          quotationRequestId: fixture.quotationRequestId,
          quotationRecommendationId: fixture.recommendationId,
          selectedSupplierQuotationId: fixture.supplierQuotationId,
          supplierId: fixture.supplierId,
          deliveryLocationId: ids.locationId,
          currencyCode: "PHP",
          subtotalAmount: 10,
          totalAmount: 10,
          expectedDeliveryDate: new Date("2026-07-31T00:00:00.000Z"),
          status: "PARTIALLY_RECEIVED",
          sourceSnapshot: {},
          createdByUserId: ids.approvalRequesterId,
        },
      });
      await prisma.purchaseOrderLine.create({
        data: {
          id: fixture.purchaseOrderLineId,
          purchaseOrderId: fixture.purchaseOrderId,
          tenantId: ids.tenantId,
          companyId: ids.companyId,
          sourcePrLineId: purchaseRequestLine.id,
          itemId: ids.itemId,
          uomId: ids.uomId,
          lineNumber: 1,
          description: "Concurrent receipt item",
          orderedQty: 10,
          receivedQty: 5,
          unitPrice: 1,
          lineTotal: 10,
        },
      });
      await prisma.purchaseOrderBalanceClosure.create({
        data: {
          id: fixture.closureId,
          tenantId: ids.tenantId,
          companyId: ids.companyId,
          purchaseOrderId: fixture.purchaseOrderId,
          requestedByUserId: ids.approvalRequesterId,
          reason: "Close outstanding balance",
          supplierNoticeUnavailableReason: "Authorization concurrency fixture",
          lineSnapshot: [{
            purchaseOrderLineId: fixture.purchaseOrderLineId,
            lineNumber: 1,
            orderedQty: 10,
            receivedQty: 5,
            cancelledQty: 0,
            remainingQty: 5,
            unitPrice: 1,
            closedValue: 5,
          }],
          totalClosedQuantity: 5,
          totalClosedValue: 5,
        },
      });
      await prisma.approvalInstance.create({
        data: {
          id: fixture.approvalId,
          tenantId: ids.tenantId,
          companyId: ids.companyId,
          documentType: "PurchaseOrderBalanceClosure",
          documentId: fixture.closureId,
          approvalRuleId: ids.approvalRuleId,
          status: "PENDING",
          currentStepOrder: 1,
        },
      });
      await prisma.approvalInstanceStep.create({
        data: {
          approvalInstanceId: fixture.approvalId,
          stepOrder: 1,
          assignedUserId: ids.userId,
          status: "PENDING",
        },
      });

      let releaseReceipt!: () => void;
      let receiptLocked!: () => void;
      const receiptReady = new Promise<void>((resolve) => {
        receiptLocked = resolve;
      });
      const receiptGate = new Promise<void>((resolve) => {
        releaseReceipt = resolve;
      });
      const postReceipt = prisma.$transaction(async (tx) => {
        await tx.purchaseOrder.update({
          where: { id: fixture.purchaseOrderId },
          data: { status: "PARTIALLY_RECEIVED" },
        });
        await tx.purchaseOrderLine.update({
          where: { id: fixture.purchaseOrderLineId },
          data: { receivedQty: 10 },
        });
        receiptLocked();
        await receiptGate;
      });
      await receiptReady;
      const closureAttempt = expect(
        approvals.approvePurchaseOrderBalanceClosure(
          form({ approvalInstanceId: fixture.approvalId }),
        ),
      ).rejects.toThrow("PURCHASE_ORDER_BALANCE_CLOSURE_CONFLICT");
      await new Promise((resolve) => setTimeout(resolve, 25));
      releaseReceipt();
      await postReceipt;
      await closureAttempt;

      expect(
        await prisma.approvalInstance.findUniqueOrThrow({
          where: { id: fixture.approvalId },
        }),
      ).toMatchObject({ status: "PENDING", currentStepOrder: 1 });
      expect(
        await prisma.purchaseOrderBalanceClosure.findUniqueOrThrow({
          where: { id: fixture.closureId },
        }),
      ).toMatchObject({ status: "PENDING_APPROVAL" });
      expect(
        await prisma.notification.count({
          where: {
            tenantId: ids.tenantId,
            sourceEventKey: `approval:${fixture.approvalId}:outcome:APPROVED`,
          },
        }),
      ).toBe(0);
    } finally {
      await prisma.notification.deleteMany({
        where: { tenantId: ids.tenantId, entityId: fixture.closureId },
      });
      await prisma.approvalInstanceStep.deleteMany({
        where: { approvalInstanceId: fixture.approvalId },
      });
      await prisma.approvalInstance.deleteMany({ where: { id: fixture.approvalId } });
      await prisma.purchaseOrderBalanceClosure.deleteMany({ where: { id: fixture.closureId } });
      await prisma.purchaseOrderLine.deleteMany({ where: { id: fixture.purchaseOrderLineId } });
      await prisma.purchaseOrder.deleteMany({ where: { id: fixture.purchaseOrderId } });
      await prisma.quotationRecommendation.deleteMany({ where: { id: fixture.recommendationId } });
      await prisma.supplierQuotation.deleteMany({ where: { id: fixture.supplierQuotationId } });
      await prisma.quotationRequest.deleteMany({ where: { id: fixture.quotationRequestId } });
      await prisma.purchaseRequestLine.deleteMany({ where: { purchaseRequestId: fixture.purchaseRequestId } });
      await prisma.purchaseRequest.deleteMany({ where: { id: fixture.purchaseRequestId } });
      await prisma.supplier.deleteMany({ where: { id: fixture.supplierId } });
      await revoke();
    }
  });

  it("AUTHZ-PI-APPROVE-VS-REJECT-CANNOT-OVERWRITE-A-STALE-DECISION", async () => {
    const approvals = await import("../src/server/services/approvals");
    const revoke = await grantPermission("purchasing.purchase_request.approve");
    try {
      const results = await Promise.allSettled([
        approvals.approvePurchaseRequest(
          form({ approvalInstanceId: ids.reassignedApprovalId }),
        ),
        approvals.rejectPurchaseRequest(
          form({
            approvalInstanceId: ids.reassignedApprovalId,
            remarks: "Concurrent rejection decision",
          }),
        ),
      ]);
      expect(results.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
      const [approval, steps, request, notifications] = await Promise.all([
        prisma.approvalInstance.findUniqueOrThrow({
          where: { id: ids.reassignedApprovalId },
        }),
        prisma.approvalInstanceStep.findMany({
          where: { approvalInstanceId: ids.reassignedApprovalId },
          orderBy: { stepOrder: "asc" },
        }),
        prisma.purchaseRequest.findUniqueOrThrow({
          where: { id: ids.reassignedPurchaseRequestId },
        }),
        prisma.notification.findMany({
          where: {
            tenantId: ids.tenantId,
            recipientUserId: ids.approvalRequesterId,
            entityId: ids.reassignedPurchaseRequestId,
            notificationType: { startsWith: "APPROVAL_OUTCOME_" },
          },
        }),
      ]);
      if (approval.status === "PENDING") {
        expect(approval.currentStepOrder).toBe(2);
        expect(steps.map(({ status }) => status)).toEqual(["APPROVED", "PENDING"]);
        expect(request.status).toBe("PENDING_APPROVAL");
        expect(request.currentApprovalStep).toBe(2);
        expect(notifications).toHaveLength(0);
      } else {
        expect(approval.status).toBe("REJECTED");
        expect(approval.currentStepOrder).toBeNull();
        expect(steps.map(({ status }) => status)).toEqual(["REJECTED", "SKIPPED"]);
        expect(request.status).toBe("REJECTED");
        expect(request.currentApprovalStep).toBeNull();
        expect(notifications).toHaveLength(1);
        expect(notifications[0]?.sourceEventKey).toBe(
          `approval:${ids.reassignedApprovalId}:outcome:REJECTED`,
        );
      }
    } finally {
      await revoke();
    }
  });

  it("AUTHZ-PI-STALE-PRIVILEGE-AND-REASSIGNMENT-CANNOT-ACT", async () => {
    const approvals = await import("../src/server/services/approvals");
    const revoke = await grantPermission("purchasing.purchase_request.approve");
    try {
      await prisma.user.update({
        where: { id: ids.userId },
        data: { privilegeEpoch: { increment: 1 } },
      });
      await expect(
        approvals.approvePurchaseRequest(
          form({ approvalInstanceId: ids.staleAuthorityApprovalId }),
        ),
      ).rejects.toThrow();
      expect(
        await prisma.approvalInstance.findUniqueOrThrow({
          where: { id: ids.staleAuthorityApprovalId },
        }),
      ).toMatchObject({ status: "PENDING", currentStepOrder: 1 });
      await prisma.user.update({
        where: { id: ids.userId },
        data: { privilegeEpoch: 0 },
      });
      await prisma.authSession.update({
        where: { id: ids.authSessionId },
        data: {
          status: "ACTIVE",
          privilegeEpochAtIssue: 0,
          revokedAt: null,
          revocationReason: null,
          idleExpiresAt: new Date(Date.now() + 30 * 60_000),
          absoluteExpiresAt: new Date(Date.now() + 60 * 60_000),
        },
      });
      await prisma.approvalInstanceStep.updateMany({
        where: {
          approvalInstanceId: ids.staleAuthorityApprovalId,
          stepOrder: 1,
          status: "PENDING",
        },
        data: { assignedUserId: ids.nextApproverId },
      });
      await expect(
        approvals.rejectPurchaseRequest(
          form({
            approvalInstanceId: ids.staleAuthorityApprovalId,
            remarks: "Stale actor must not reject",
          }),
        ),
      ).rejects.toThrow("APPROVAL_ASSIGNMENT_DENIED");
      expect(
        await prisma.purchaseRequest.findUniqueOrThrow({
          where: { id: ids.staleAuthorityPurchaseRequestId },
        }),
      ).toMatchObject({ status: "PENDING_APPROVAL", currentApprovalStep: 1 });
    } finally {
      await prisma.user.update({
        where: { id: ids.userId },
        data: { privilegeEpoch: 0 },
      });
      await prisma.authSession.update({
        where: { id: ids.authSessionId },
        data: {
          status: "ACTIVE",
          privilegeEpochAtIssue: 0,
          revokedAt: null,
          revocationReason: null,
          idleExpiresAt: new Date(Date.now() + 30 * 60_000),
          absoluteExpiresAt: new Date(Date.now() + 60 * 60_000),
        },
      });
      await revoke();
    }
  });

  it("AUTHZ-PI-PURCHASE-REQUEST-INVALID-LIFECYCLE-NO-MUTATION", async () => {
    const purchaseRequests = await import("../src/server/services/purchaseRequests");
    const revoke = await grantPermission("purchasing.purchase_request.submit");
    try {
      const before = await workflowMutationSnapshot();
      await expect(
        purchaseRequests.cancelPurchaseRequest(
          form({ id: ids.approvedPurchaseRequestId, reason: "Authorization invalid lifecycle" }),
        ),
      ).rejects.toThrow("INVALID_STATUS_TRANSITION");
      expect(await workflowMutationSnapshot()).toEqual(before);
    } finally {
      await revoke();
    }
  });

  it("AUTHZ-PI-TRANSFER-LOCATION-LIFECYCLE-SOD-NO-MUTATION", async () => {
    const transfers = await import("../src/server/services/transfers");
    const revokeDispatch = await grantPermission("inventory.transfer.dispatch");
    const revokeReceive = await grantPermission("inventory.transfer.receive");
    const revokeSubmit = await grantPermission("inventory.transfer.submit");
    try {
      const before = await workflowMutationSnapshot();
      await expect(
        transfers.dispatchInventoryTransfer(form({ id: ids.transferWrongSourceId })),
      ).rejects.toThrow("TRANSFER_NOT_FOUND");
      await expect(
        transfers.receiveInventoryTransfer(form({ id: ids.transferWrongDestinationId })),
      ).rejects.toThrow("TRANSFER_NOT_FOUND");
      await expect(
        transfers.submitInventoryTransfer(form({ id: ids.transferWrongDestinationId })),
      ).rejects.toThrow("TRANSFER_NOT_DRAFT_FOR_SUBMIT");
      await expect(
        transfers.receiveInventoryTransfer(form({ id: ids.transferWrongSourceId })),
      ).rejects.toThrow("TRANSFER_RECEIVER_MUST_DIFFER_FROM_DISPATCHER");
      expect(await workflowMutationSnapshot()).toEqual(before);
    } finally {
      await revokeSubmit();
      await revokeReceive();
      await revokeDispatch();
    }
  });

  it("AUTHZ-PI-STOCK-COUNT-SCOPE-AND-LIFECYCLE-NO-MUTATION", async () => {
    const stockCounts = await import("../src/server/services/stockCounts");
    const revokeCreate = await grantPermission("inventory.stock_count.create");
    const revokeEnter = await grantPermission("inventory.stock_count.enter");
    const revokeAdjustment = await grantPermission("inventory.stock_adjustment.create");
    try {
      const before = await workflowMutationSnapshot();
      await expect(
        stockCounts.scheduleStockCount(
          form({
            inventoryLocationId: ids.adjacentInventoryLocationId,
            countType: "SPOT",
            blindCount: "true",
            freezeMovements: "false",
          }),
        ),
      ).rejects.toThrow("STOCK_COUNT_INVENTORY_LOCATION_NOT_FOUND");
      await expect(
        stockCounts.startStockCount(form({ id: ids.adjacentStockCountId })),
      ).rejects.toThrow("STOCK_COUNT_NOT_FOUND");
      await expect(
        stockCounts.startStockCount(form({ id: ids.scopedReviewedStockCountId })),
      ).rejects.toThrow("STOCK_COUNT_NOT_DRAFT_FOR_START");
      await expect(
        stockCounts.saveStockCountEntries({
          id: ids.adjacentStockCountId,
          lines: [{ lineId: randomUUID(), countedQuantityBaseUom: 1 }],
        }),
      ).rejects.toThrow("STOCK_COUNT_NOT_FOUND");
      await expect(
        stockCounts.saveStockCountEntries({
          id: ids.scopedReviewedStockCountId,
          lines: [{ lineId: randomUUID(), countedQuantityBaseUom: 1 }],
        }),
      ).rejects.toThrow("STOCK_COUNT_NOT_OPEN_FOR_ENTRY");
      await expect(
        stockCounts.generateStockCountVarianceAdjustment(
          form({ id: ids.adjacentStockCountId }),
        ),
      ).rejects.toThrow("STOCK_COUNT_NOT_FOUND");
      await expect(
        stockCounts.generateStockCountVarianceAdjustment(
          form({ id: ids.scopedDraftStockCountId }),
        ),
      ).rejects.toThrow("STOCK_COUNT_NOT_REVIEWED_FOR_ADJUSTMENT");
      expect(await workflowMutationSnapshot()).toEqual(before);
    } finally {
      await revokeAdjustment();
      await revokeEnter();
      await revokeCreate();
    }
  });

  it("AUTHZ-PI-RECEIVING-NONEXISTENT-SOURCE-NO-MUTATION", async () => {
    const receiving = await import("../src/server/services/receiving");
    const revoke = await grantPermission("inventory.receiving.post");
    try {
      const before = await workflowMutationSnapshot();
      await expect(receiving.postGoodsReceipt(form({ id: randomUUID() }))).rejects.toThrow(
        "GOODS_RECEIPT_NOT_FOUND",
      );
      expect(await workflowMutationSnapshot()).toEqual(before);
    } finally {
      await revoke();
    }
  });

  it.each([
    {
      id: "AUTHZ-PI-INVENTORY-POST-WRONG-LOCATION-NO-MUTATION",
      inventoryLocationId: ids.adjacentInventoryLocationId,
      itemId: ids.itemId,
      expectedError: "INVENTORY_LOCATION_SCOPE_DENIED",
    },
    {
      id: "AUTHZ-PI-INVENTORY-POST-WRONG-COMPANY-NO-MUTATION",
      inventoryLocationId: ids.adjacentCompanyInventoryLocationId,
      itemId: ids.itemId,
      expectedError: "INVENTORY_LOCATION_NOT_FOUND",
    },
    {
      id: "AUTHZ-PI-INVENTORY-POST-WRONG-TENANT-NO-MUTATION",
      inventoryLocationId: ids.foreignInventoryLocationId,
      itemId: ids.itemId,
      expectedError: "INVENTORY_LOCATION_NOT_FOUND",
    },
    {
      id: "AUTHZ-PI-INVENTORY-POST-FOREIGN-ITEM-NO-MUTATION",
      inventoryLocationId: ids.inventoryLocationId,
      itemId: ids.adjacentCompanyItemId,
      expectedError: "INVENTORY_ITEM_NOT_FOUND",
    },
  ])("$id", async ({ inventoryLocationId, itemId, expectedError }) => {
    const before = await mutationSnapshot();
    await expect(
      postInventoryMovement(session, movementInput(inventoryLocationId, itemId)),
    ).rejects.toThrow(expectedError);
    expect(await mutationSnapshot()).toEqual(before);
  });

  it("AUTHZ-PI-INVENTORY-IN-TRANSACTION-WRONG-LOCATION-ROLLBACK", async () => {
    const before = await mutationSnapshot();
    await expect(
      prisma.$transaction((tx) =>
        postInventoryMovementInTransaction(
          tx,
          session,
          movementInput(ids.adjacentInventoryLocationId),
        ),
      ),
    ).rejects.toThrow("INVENTORY_LOCATION_SCOPE_DENIED");
    expect(await mutationSnapshot()).toEqual(before);
  });

  it("AUTHZ-PI-INVENTORY-IDEMPOTENT-RETRY-POSTS-EXACTLY-ONCE", async () => {
    const input = movementInput(ids.inventoryLocationId);
    const before = await mutationSnapshot();
    const first = await postInventoryMovement(session, input);
    const second = await postInventoryMovement(session, input);
    expect(first.duplicate).toBe(false);
    expect(second.duplicate).toBe(true);
    expect(second.movement.id).toBe(first.movement.id);
    const after = await mutationSnapshot();
    expect(after.movements).toBe(before.movements + 1);
    expect(after.balances).toBe(before.balances + 1);
  });
});
