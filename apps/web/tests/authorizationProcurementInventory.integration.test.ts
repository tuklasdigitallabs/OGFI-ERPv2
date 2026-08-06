import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import type { SessionContext } from "../src/server/services/context";
import type { getOperationalDashboard as getOperationalDashboardType } from "../src/server/services/dashboard";
import type {
  getInventoryBalanceDashboardRead as getInventoryBalanceDashboardReadType,
  listInventoryBalancePage as listInventoryBalancePageType,
  listInventoryBalanceDashboardProfileExportRows as listInventoryBalanceDashboardProfileExportRowsType,
  lockInventoryLocationForPosting as lockInventoryLocationForPostingType,
  lockInventoryLocationsForPosting as lockInventoryLocationsForPostingType,
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
import { createSealedApprovalRuleFixture } from "./helpers/approvalRulePgFixtures";
import { requestInventoryPilotBootstrap } from "./helpers/inventoryPilotApprovalPgBootstrapClient";

const expectedDatabase = assertDisposableAuthorizationDatabaseConfigured(process.env);
if (!process.env.DATABASE_URL) {
  throw new Error("AUTHORIZATION_PROCUREMENT_INVENTORY_DATABASE_REQUIRED");
}

async function waitForBlockedRecipientAuthorityLock(
  prisma: PrismaClient,
  blockerPid: number,
) {
  const deadline = Date.now() + 4_000;
  while (Date.now() < deadline) {
    const blocked = await prisma.$queryRaw<Array<{ pid: number }>>`
      SELECT activity.pid
        FROM pg_stat_activity activity
       WHERE activity.datname = current_database()
         AND activity.wait_event_type = 'Lock'
         AND ${blockerPid}::int = ANY(pg_blocking_pids(activity.pid))
         AND activity.query LIKE '%"User"%'
         AND activity.query LIKE '%FOR SHARE%'
       LIMIT 1
    `;
    if (blocked.length === 1) return;
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  throw new Error("APPROVAL_RECIPIENT_AUTHORITY_LOCK_WAIT_NOT_OBSERVED");
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
    unrelatedLocationId: randomUUID(),
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
    unrelatedLocationScopeAssignmentId: randomUUID(),
    approvalRequesterScopeAssignmentId: randomUUID(),
    approvalRequesterAdjacentScopeAssignmentId: randomUUID(),
    nextApproverScopeAssignmentId: randomUUID(),
    authSessionId: randomUUID(),
    approvalRuleId: randomUUID(),
    scopedPurchaseRequestId: randomUUID(),
    adjacentPurchaseRequestId: randomUUID(),
    approvedPurchaseRequestId: randomUUID(),
    approveDispatchApprovalId: randomUUID(),
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
    fiscalYearId: randomUUID(),
    foreignFiscalYearId: randomUUID(),
    scopedBudgetId: randomUUID(),
    foreignBudgetId: randomUUID(),
    openingInventoryRevisionId: randomUUID(),
    openingInventoryMfaCohortId: randomUUID(),
    openingInventoryMfaSessionId: randomUUID(),
    openingInventoryMfaAttemptId: randomUUID(),
    openingInventoryMfaAttemptLineId: randomUUID(),
    openingInventoryMfaCutoverId: randomUUID(),
    openingInventoryMfaEvidenceAttachmentId: randomUUID(),
    openingInventoryMfaControlledEvidenceId: randomUUID(),
    openingInventorySodCohortId: randomUUID(),
    openingInventoryEmptyCohortId: randomUUID(),
    openingInventorySubmitCohortId: randomUUID(),
    openingInventoryScopedSessionId: randomUUID(),
    openingInventoryScopedAttemptId: randomUUID(),
    openingInventoryScopedAttemptLineId: randomUUID(),
    openingInventoryScopedCutoverId: randomUUID(),
    openingInventoryAdjacentSessionId: randomUUID(),
    openingInventoryAdjacentAttemptId: randomUUID(),
    openingInventoryAdjacentAttemptLineId: randomUUID(),
    openingInventoryAdjacentCutoverId: randomUUID(),
    openingInventorySubmitRuleId: randomUUID(),
    openingInventoryApprovalCohortId: randomUUID(),
    openingInventoryApprovalCutoverId: randomUUID(),
    openingInventoryApprovalInstanceId: randomUUID(),
    openingInventoryEvidenceAttachmentId: randomUUID(),
  };

  let prisma: PrismaClient;
  let getOperationalDashboard: typeof getOperationalDashboardType;
  let getInventoryBalanceDashboardRead: typeof getInventoryBalanceDashboardReadType;
  let listInventoryBalancePage: typeof listInventoryBalancePageType;
  let listInventoryBalanceDashboardProfileExportRows: typeof listInventoryBalanceDashboardProfileExportRowsType;
  let lockInventoryLocationForPosting: typeof lockInventoryLocationForPostingType;
  let lockInventoryLocationsForPosting: typeof lockInventoryLocationsForPostingType;
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
    ({
      getInventoryBalanceDashboardRead,
      listInventoryBalancePage,
      listInventoryBalanceDashboardProfileExportRows,
      lockInventoryLocationForPosting,
      lockInventoryLocationsForPosting,
      postInventoryMovement,
      postInventoryMovementInTransaction,
    } = await import("../src/server/services/inventory"));
    ({ getOperationalDashboard } = await import("../src/server/services/dashboard"));
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
          id: ids.unrelatedLocationId,
          tenantId: ids.tenantId,
          companyId: ids.companyId,
          locationType: "BRANCH",
          code: `AZI-LOC-UNRELATED-${suffix}`,
          name: `Unrelated Authorization Inventory Location ${suffix}`,
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
        id: ids.unrelatedLocationScopeAssignmentId,
        userId: ids.userId,
        scopeType: "LOCATION",
        scopeId: ids.unrelatedLocationId,
        accessLevel: "APPROVE",
      }, {
        id: ids.approvalRequesterScopeAssignmentId,
        userId: ids.approvalRequesterId,
        scopeType: "LOCATION",
        scopeId: ids.locationId,
        accessLevel: "APPROVE",
      }, {
        id: ids.approvalRequesterAdjacentScopeAssignmentId,
        userId: ids.approvalRequesterId,
        scopeType: "LOCATION",
        scopeId: ids.adjacentLocationId,
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
    await prisma.fiscalYear.createMany({
      data: [
        {
          id: ids.fiscalYearId,
          tenantId: ids.tenantId,
          companyId: ids.companyId,
          code: `AZI-FY-${suffix}`,
          name: "Authorization Inventory Fiscal Year",
          startDate: new Date("2026-01-01T00:00:00.000Z"),
          endDate: new Date("2026-12-31T00:00:00.000Z"),
        },
        {
          id: ids.foreignFiscalYearId,
          tenantId: ids.foreignTenantId,
          companyId: ids.foreignCompanyId,
          code: `AZI-FY-FOR-${suffix}`,
          name: "Foreign Authorization Inventory Fiscal Year",
          startDate: new Date("2026-01-01T00:00:00.000Z"),
          endDate: new Date("2026-12-31T00:00:00.000Z"),
        },
      ],
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
    await createSealedApprovalRuleFixture(prisma, {
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
    await prisma.inventoryTransferLine.create({
      data: {
        inventoryTransferId: ids.transferWrongSourceId,
        tenantId: ids.tenantId,
        companyId: ids.companyId,
        sourceInventoryLocationId: ids.adjacentInventoryLocationId,
        destinationInventoryLocationId: ids.inventoryLocationId,
        itemId: ids.itemId,
        uomId: ids.uomId,
        lineNumber: 1,
        description: "Authorization transfer line",
        requestedQty: 1,
        dispatchedQty: 1
      }
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
    const openingInventoryRevision = await requestInventoryPilotBootstrap({
      action: "OPENING_INITIALIZE",
      tenantId: ids.tenantId,
      companyId: ids.companyId,
      actorUserId: ids.approvalRequesterId,
      locations: [
        { locationId: ids.locationId, inventoryLocationId: ids.inventoryLocationId },
        { locationId: ids.adjacentLocationId, inventoryLocationId: ids.adjacentInventoryLocationId },
      ],
      itemIds: [ids.itemId],
    });
    if (!openingInventoryRevision) {
      throw new Error("AUTHORIZATION_OPENING_INVENTORY_BOOTSTRAP_RESULT_MISSING");
    }
    ids.openingInventoryRevisionId = openingInventoryRevision.id;
    const openingInventoryDigest = openingInventoryRevision.configurationDigest;
    const openingInventoryRevisionNumber = openingInventoryRevision.revisionNumber;
    const openingInventoryLineEvidence = (stockCountAttemptLineId: string) => {
      const lineCanonicalJson = JSON.stringify({
        expiryDate: null,
        itemId: ids.itemId,
        lineNumber: 1,
        lotKey: "NOLOT|NOEXP",
        lotNumber: null,
        openingQuantityBaseUom: 0,
        openingValue: 0,
        sourceCountedQuantityBaseUom: 0,
        sourceSystemQuantityBaseUom: 0,
        sourceVarianceQuantityBaseUom: 0,
        stockCountAttemptLineId,
        unitCost: 0,
        uomId: ids.uomId,
      });
      return {
        lineCanonicalJson,
        lineDigest: createHash("sha256").update(lineCanonicalJson).digest("hex"),
      };
    };
    const mfaEvidenceObjectVersionId = `authz-opening-detail-${suffix}`;
    const mfaEvidenceChecksum = createHash("sha256").update(mfaEvidenceObjectVersionId).digest("hex");
    const mfaEvidenceManifestJson = JSON.stringify([{
      controlledEvidenceAttachmentId: ids.openingInventoryMfaControlledEvidenceId,
      attachmentId: ids.openingInventoryMfaEvidenceAttachmentId,
      objectVersionId: mfaEvidenceObjectVersionId,
      checksum: mfaEvidenceChecksum,
    }]);
    const mfaCutoverCanonicalJson = "{}";
    const mfaCutoverDigest = createHash("sha256").update(mfaCutoverCanonicalJson).digest("hex");
    const mfaCohortCanonicalJson = JSON.stringify({
      cutovers: [{ id: ids.openingInventoryMfaCutoverId, cutoverDigest: mfaCutoverDigest }],
    });
    await prisma.openingInventoryCohort.createMany({
      data: [
        {
          id: ids.openingInventoryMfaCohortId,
          tenantId: ids.tenantId,
          companyId: ids.companyId,
          configurationRevisionId: ids.openingInventoryRevisionId,
          configurationRevisionNumber: openingInventoryRevisionNumber,
          configurationDigest: openingInventoryDigest,
          publicReference: `AUTHZ-PI-OIC-MFA-${suffix}`,
          effectiveAt: new Date("2026-07-01T00:00:01.000Z"),
          status: "SEALED",
          canonicalJson: mfaCohortCanonicalJson,
          cohortDigest: createHash("sha256").update(mfaCohortCanonicalJson).digest("hex"),
          createdByUserId: ids.approvalRequesterId,
        },
        {
          id: ids.openingInventorySodCohortId,
          tenantId: ids.tenantId,
          companyId: ids.companyId,
          configurationRevisionId: ids.openingInventoryRevisionId,
          configurationRevisionNumber: openingInventoryRevisionNumber,
          configurationDigest: openingInventoryDigest,
          publicReference: `AUTHZ-PI-OIC-SOD-${suffix}`,
          effectiveAt: new Date("2026-07-01T00:00:00.000Z"),
          status: "SEALED",
          canonicalJson: "{}",
          cohortDigest: openingInventoryDigest,
          createdByUserId: ids.userId,
        },
        {
          id: ids.openingInventoryEmptyCohortId,
          tenantId: ids.tenantId,
          companyId: ids.companyId,
          configurationRevisionId: ids.openingInventoryRevisionId,
          configurationRevisionNumber: openingInventoryRevisionNumber,
          configurationDigest: openingInventoryDigest,
          publicReference: `AUTHZ-PI-OIC-ADJ-DRAFT-${suffix}`,
          effectiveAt: new Date("2026-07-01T00:00:04.000Z"),
          status: "DRAFT",
          canonicalJson: "{}",
          cohortDigest: openingInventoryDigest,
          createdByUserId: ids.approvalRequesterId,
        },
      ],
    });
    await prisma.attachment.create({
      data: {
        id: ids.openingInventoryMfaEvidenceAttachmentId,
        tenantId: ids.tenantId,
        companyId: ids.companyId,
        storageEnvironment: "LOCAL_DEVELOPMENT",
        storageProvider: "disposable",
        objectKey: `authorization/opening-inventory-detail/${suffix}`,
        objectVersionId: mfaEvidenceObjectVersionId,
        originalFilename: `opening-inventory-detail-${suffix}.txt`,
        mimeType: "text/plain",
        detectedMimeType: "text/plain",
        sizeBytes: 1,
        checksum: mfaEvidenceChecksum,
        detectedChecksum: mfaEvidenceChecksum,
        uploadState: "VERIFIED",
        scanState: "CLEAN",
        availabilityState: "AVAILABLE",
        physicalState: "DURABLE",
        scanVerifiedObjectVersionId: mfaEvidenceObjectVersionId,
        uploadVerifiedAt: new Date("2026-07-01T00:00:00.000Z"),
        scanCompletedAt: new Date("2026-07-01T00:00:00.000Z"),
        availableAt: new Date("2026-07-01T00:00:00.000Z"),
        uploadedByUserId: ids.approvalRequesterId,
        status: "ACTIVE",
      },
    });
    await prisma.controlledEvidenceAttachment.create({
      data: {
        id: ids.openingInventoryMfaControlledEvidenceId,
        tenantId: ids.tenantId,
        companyId: ids.companyId,
        sourceType: "OPENING_INVENTORY_COHORT",
        sourceRecordId: ids.openingInventoryMfaCohortId,
        sourceKey: `opening-cohort-${ids.openingInventoryMfaCohortId}`,
        attachmentId: ids.openingInventoryMfaEvidenceAttachmentId,
        purpose: "EVIDENCE",
        status: "ACTIVE",
        createdByUserId: ids.approvalRequesterId,
      },
    });
    await prisma.stockCountSession.createMany({
      data: [
        {
          id: ids.openingInventoryMfaSessionId,
          tenantId: ids.tenantId,
          companyId: ids.companyId,
          inventoryLocationId: ids.inventoryLocationId,
          publicReference: `AUTHZ-PI-OIC-SC-MFA-${suffix}`,
          countType: "OPENING",
          status: "REVIEWED",
          freezeMovements: true,
          cutoffAt: new Date("2026-06-30T00:00:00.000Z"),
          startedAt: new Date("2026-06-30T00:00:00.000Z"),
          submittedAt: new Date("2026-06-30T00:00:00.000Z"),
          reviewedAt: new Date("2026-06-30T00:00:00.000Z"),
          createdByUserId: ids.approvalRequesterId,
          assignedToUserId: ids.approvalRequesterId,
          reviewedByUserId: ids.approvalRequesterId,
        },
        {
          id: ids.openingInventoryScopedSessionId,
          tenantId: ids.tenantId,
          companyId: ids.companyId,
          inventoryLocationId: ids.inventoryLocationId,
          publicReference: `AUTHZ-PI-OIC-SC-SCOPED-${suffix}`,
          countType: "OPENING",
          status: "REVIEWED",
          createdByUserId: ids.userId,
        },
        {
          id: ids.openingInventoryAdjacentSessionId,
          tenantId: ids.tenantId,
          companyId: ids.companyId,
          inventoryLocationId: ids.adjacentInventoryLocationId,
          publicReference: `AUTHZ-PI-OIC-SC-ADJ-${suffix}`,
          countType: "OPENING",
          status: "REVIEWED",
          createdByUserId: ids.userId,
        },
      ],
    });
    await prisma.stockCountAttempt.createMany({
      data: [
        {
          id: ids.openingInventoryMfaAttemptId,
          stockCountSessionId: ids.openingInventoryMfaSessionId,
          tenantId: ids.tenantId,
          companyId: ids.companyId,
          inventoryLocationId: ids.inventoryLocationId,
          attemptNumber: 1,
          status: "REVIEWED",
          freezeMovements: true,
          cutoffAt: new Date("2026-06-30T00:00:00.000Z"),
          startedAt: new Date("2026-06-30T00:00:00.000Z"),
          submittedAt: new Date("2026-06-30T00:00:00.000Z"),
          reviewedAt: new Date("2026-06-30T00:00:00.000Z"),
          evidenceReference: "Authorization MFA opening count evidence",
          createdByUserId: ids.approvalRequesterId,
          assignedToUserId: ids.approvalRequesterId,
          reviewedByUserId: ids.approvalRequesterId,
        },
        {
          id: ids.openingInventoryScopedAttemptId,
          stockCountSessionId: ids.openingInventoryScopedSessionId,
          tenantId: ids.tenantId,
          companyId: ids.companyId,
          inventoryLocationId: ids.inventoryLocationId,
          attemptNumber: 99,
          status: "REVIEWED",
          createdByUserId: ids.userId,
        },
        {
          id: ids.openingInventoryAdjacentAttemptId,
          stockCountSessionId: ids.openingInventoryAdjacentSessionId,
          tenantId: ids.tenantId,
          companyId: ids.companyId,
          inventoryLocationId: ids.adjacentInventoryLocationId,
          attemptNumber: 99,
          status: "REVIEWED",
          createdByUserId: ids.userId,
        },
      ],
    });
    await prisma.stockCountSession.update({
      where: { id: ids.openingInventoryMfaSessionId },
      data: { currentAttemptId: ids.openingInventoryMfaAttemptId },
    });
    await prisma.stockCountSession.update({
      where: { id: ids.openingInventoryScopedSessionId },
      data: { currentAttemptId: ids.openingInventoryScopedAttemptId },
    });
    await prisma.stockCountSession.update({
      where: { id: ids.openingInventoryAdjacentSessionId },
      data: { currentAttemptId: ids.openingInventoryAdjacentAttemptId },
    });
    await prisma.stockCountAttemptLine.createMany({
      data: [
        {
          id: ids.openingInventoryMfaAttemptLineId,
          stockCountAttemptId: ids.openingInventoryMfaAttemptId,
          tenantId: ids.tenantId,
          companyId: ids.companyId,
          inventoryLocationId: ids.inventoryLocationId,
          itemId: ids.itemId,
          uomId: ids.uomId,
          lineNumber: 1,
          systemQuantityBaseUom: 0,
          countedQuantityBaseUom: 0,
          varianceQuantityBaseUom: 0,
          countedByUserId: ids.approvalRequesterId,
          countedAt: new Date("2026-06-30T00:00:00.000Z"),
        },
        {
          id: ids.openingInventoryScopedAttemptLineId,
          stockCountAttemptId: ids.openingInventoryScopedAttemptId,
          tenantId: ids.tenantId,
          companyId: ids.companyId,
          inventoryLocationId: ids.inventoryLocationId,
          itemId: ids.itemId,
          uomId: ids.uomId,
          lineNumber: 1,
          systemQuantityBaseUom: 0,
          countedQuantityBaseUom: 0,
          varianceQuantityBaseUom: 0,
        },
        {
          id: ids.openingInventoryAdjacentAttemptLineId,
          stockCountAttemptId: ids.openingInventoryAdjacentAttemptId,
          tenantId: ids.tenantId,
          companyId: ids.companyId,
          inventoryLocationId: ids.adjacentInventoryLocationId,
          itemId: ids.itemId,
          uomId: ids.uomId,
          lineNumber: 1,
          systemQuantityBaseUom: 0,
          countedQuantityBaseUom: 0,
          varianceQuantityBaseUom: 0,
        },
      ],
    });
    await prisma.openingInventoryCutover.create({
      data: {
        id: ids.openingInventoryMfaCutoverId,
        cohortId: ids.openingInventoryMfaCohortId,
        tenantId: ids.tenantId,
        companyId: ids.companyId,
        inventoryLocationId: ids.inventoryLocationId,
        locationId: ids.locationId,
        stockCountSessionId: ids.openingInventoryMfaSessionId,
        stockCountAttemptId: ids.openingInventoryMfaAttemptId,
        idempotencyKey: `authz-opening-mfa-${suffix}`,
        evidenceManifestJson: mfaEvidenceManifestJson,
        evidenceDigest: createHash("sha256").update(mfaEvidenceManifestJson).digest("hex"),
        valuationCanonicalJson: "[]",
        valuationDigest: createHash("sha256").update("[]").digest("hex"),
        cutoverCanonicalJson: mfaCutoverCanonicalJson,
        cutoverDigest: mfaCutoverDigest,
        requestedByUserId: ids.approvalRequesterId,
      },
    });
    const mfaLineEvidence = openingInventoryLineEvidence(ids.openingInventoryMfaAttemptLineId);
    await prisma.openingInventoryCutoverLine.create({
      data: {
        cutoverId: ids.openingInventoryMfaCutoverId,
        tenantId: ids.tenantId,
        companyId: ids.companyId,
        inventoryLocationId: ids.inventoryLocationId,
        itemId: ids.itemId,
        uomId: ids.uomId,
        stockCountAttemptId: ids.openingInventoryMfaAttemptId,
        stockCountAttemptLineId: ids.openingInventoryMfaAttemptLineId,
        lineNumber: 1,
        lotKey: "NOLOT|NOEXP",
        sourceSystemQuantityBaseUom: 0,
        sourceCountedQuantityBaseUom: 0,
        sourceVarianceQuantityBaseUom: 0,
        openingQuantityBaseUom: 0,
        unitCost: 0,
        openingValue: 0,
        ...mfaLineEvidence,
      },
    });
    const scopedCutoverDigest = "b".repeat(64);
    const adjacentCutoverDigest = "c".repeat(64);
    const submitCohortCanonicalJson = JSON.stringify({
      cutovers: [
        { id: ids.openingInventoryScopedCutoverId, cutoverDigest: scopedCutoverDigest },
        { id: ids.openingInventoryAdjacentCutoverId, cutoverDigest: adjacentCutoverDigest },
      ],
    });
    await prisma.openingInventoryCohort.create({
      data: {
        id: ids.openingInventorySubmitCohortId,
        tenantId: ids.tenantId,
        companyId: ids.companyId,
        configurationRevisionId: ids.openingInventoryRevisionId,
        configurationRevisionNumber: openingInventoryRevisionNumber,
        configurationDigest: openingInventoryDigest,
        publicReference: `AUTHZ-PI-OIC-SUBMIT-${suffix}`,
        effectiveAt: new Date("2026-07-01T00:00:02.000Z"),
        status: "SEALED",
        canonicalJson: submitCohortCanonicalJson,
        cohortDigest: createHash("sha256").update(submitCohortCanonicalJson).digest("hex"),
        createdByUserId: ids.approvalRequesterId,
      },
    });
    await prisma.openingInventoryCutover.createMany({
      data: [
        {
          id: ids.openingInventoryScopedCutoverId,
          cohortId: ids.openingInventorySubmitCohortId,
          tenantId: ids.tenantId,
          companyId: ids.companyId,
          inventoryLocationId: ids.inventoryLocationId,
          locationId: ids.locationId,
          stockCountSessionId: ids.openingInventoryScopedSessionId,
          stockCountAttemptId: ids.openingInventoryScopedAttemptId,
          idempotencyKey: `authz-opening-submit-scoped-${suffix}`,
          evidenceManifestJson: "[]",
          evidenceDigest: openingInventoryDigest,
          valuationCanonicalJson: "[]",
          valuationDigest: openingInventoryDigest,
          cutoverCanonicalJson: "{}",
          cutoverDigest: scopedCutoverDigest,
          requestedByUserId: ids.userId,
        },
        {
          id: ids.openingInventoryAdjacentCutoverId,
          cohortId: ids.openingInventorySubmitCohortId,
          tenantId: ids.tenantId,
          companyId: ids.companyId,
          inventoryLocationId: ids.adjacentInventoryLocationId,
          locationId: ids.adjacentLocationId,
          stockCountSessionId: ids.openingInventoryAdjacentSessionId,
          stockCountAttemptId: ids.openingInventoryAdjacentAttemptId,
          idempotencyKey: `authz-opening-submit-adjacent-${suffix}`,
          evidenceManifestJson: "[]",
          evidenceDigest: openingInventoryDigest,
          valuationCanonicalJson: "[]",
          valuationDigest: openingInventoryDigest,
          cutoverCanonicalJson: "{}",
          cutoverDigest: adjacentCutoverDigest,
          requestedByUserId: ids.approvalRequesterId,
        },
      ],
    });
    const scopedLineEvidence = openingInventoryLineEvidence(ids.openingInventoryScopedAttemptLineId);
    const adjacentLineEvidence = openingInventoryLineEvidence(ids.openingInventoryAdjacentAttemptLineId);
    await prisma.openingInventoryCutoverLine.createMany({
      data: [
        {
          cutoverId: ids.openingInventoryScopedCutoverId,
          tenantId: ids.tenantId,
          companyId: ids.companyId,
          inventoryLocationId: ids.inventoryLocationId,
          itemId: ids.itemId,
          uomId: ids.uomId,
          stockCountAttemptId: ids.openingInventoryScopedAttemptId,
          stockCountAttemptLineId: ids.openingInventoryScopedAttemptLineId,
          lineNumber: 1,
          lotKey: "NOLOT|NOEXP",
          sourceSystemQuantityBaseUom: 0,
          sourceCountedQuantityBaseUom: 0,
          sourceVarianceQuantityBaseUom: 0,
          openingQuantityBaseUom: 0,
          unitCost: 0,
          openingValue: 0,
          ...scopedLineEvidence,
        },
        {
          cutoverId: ids.openingInventoryAdjacentCutoverId,
          tenantId: ids.tenantId,
          companyId: ids.companyId,
          inventoryLocationId: ids.adjacentInventoryLocationId,
          itemId: ids.itemId,
          uomId: ids.uomId,
          stockCountAttemptId: ids.openingInventoryAdjacentAttemptId,
          stockCountAttemptLineId: ids.openingInventoryAdjacentAttemptLineId,
          lineNumber: 1,
          lotKey: "NOLOT|NOEXP",
          sourceSystemQuantityBaseUom: 0,
          sourceCountedQuantityBaseUom: 0,
          sourceVarianceQuantityBaseUom: 0,
          openingQuantityBaseUom: 0,
          unitCost: 0,
          openingValue: 0,
          ...adjacentLineEvidence,
        },
      ],
    });
    const submitRule = await createSealedApprovalRuleFixture(prisma, {
      data: {
        id: ids.openingInventorySubmitRuleId,
        tenantId: ids.tenantId,
        companyId: ids.companyId,
        transactionType: "OpeningInventoryCutover",
        isActive: true,
        steps: {
          create: [
            { stepOrder: 1, approverType: "USER", userId: ids.userId },
            { stepOrder: 2, approverType: "USER", userId: ids.userId },
          ],
        },
      },
    });
    await prisma.openingInventoryCohort.create({
      data: {
        id: ids.openingInventoryApprovalCohortId,
        tenantId: ids.tenantId,
        companyId: ids.companyId,
        configurationRevisionId: ids.openingInventoryRevisionId,
        configurationRevisionNumber: openingInventoryRevisionNumber,
        configurationDigest: openingInventoryDigest,
        publicReference: `AUTHZ-PI-OIC-APPROVAL-${suffix}`,
        effectiveAt: new Date("2026-07-01T00:00:03.000Z"),
        status: "SEALED",
        canonicalJson: "{}",
        cohortDigest: openingInventoryDigest,
        createdByUserId: ids.approvalRequesterId,
      },
    });
    await prisma.openingInventoryCutover.create({
      data: {
        id: ids.openingInventoryApprovalCutoverId,
        cohortId: ids.openingInventoryApprovalCohortId,
        tenantId: ids.tenantId,
        companyId: ids.companyId,
        inventoryLocationId: ids.inventoryLocationId,
        locationId: ids.locationId,
        stockCountSessionId: ids.openingInventoryScopedSessionId,
        stockCountAttemptId: ids.openingInventoryScopedAttemptId,
        idempotencyKey: `authz-opening-approval-${suffix}`,
        evidenceManifestJson: "[]",
        evidenceDigest: openingInventoryDigest,
        valuationCanonicalJson: "[]",
        valuationDigest: openingInventoryDigest,
        cutoverCanonicalJson: "{}",
        cutoverDigest: "d".repeat(64),
        requestedByUserId: ids.approvalRequesterId,
      },
    });
    await prisma.approvalInstance.create({
      data: {
        id: ids.openingInventoryApprovalInstanceId,
        tenantId: ids.tenantId,
        companyId: ids.companyId,
        documentType: "OpeningInventoryCutover",
        documentId: ids.openingInventoryApprovalCutoverId,
        approvalRuleId: submitRule.id,
        status: "PENDING",
        currentStepOrder: 1,
        steps: {
          create: {
            stepOrder: 1,
            assignedUserId: ids.userId,
            status: "PENDING",
          },
        },
      },
    });
    await prisma.openingInventoryCutover.update({
      where: { id: ids.openingInventoryApprovalCutoverId },
      data: {
        status: "PENDING_APPROVAL",
        approvalInstanceId: ids.openingInventoryApprovalInstanceId,
        version: 2,
      },
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
      openingInventoryCohorts,
      openingInventoryCutovers,
      openingInventoryCutoverLines,
      openingInventoryCommands,
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
      prisma.openingInventoryCohort.count({ where: { tenantId: ids.tenantId } }),
      prisma.openingInventoryCutover.count({ where: { tenantId: ids.tenantId } }),
      prisma.openingInventoryCutoverLine.count({ where: { tenantId: ids.tenantId } }),
      prisma.openingInventoryExecutionCommand.count({ where: { tenantId: ids.tenantId } }),
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
      openingInventoryCohorts,
      openingInventoryCutovers,
      openingInventoryCutoverLines,
      openingInventoryCommands,
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
    if (!data.has("idempotencyKey")) {
      data.set("idempotencyKey", `test:transfer-receipt:${randomUUID()}`);
    }
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

  it("AUTHZ-PI-DASHBOARD-INVENTORY-AGGREGATE-SCOPE-AND-VALUES", async () => {
    await expect(getInventoryBalanceDashboardRead(session)).rejects.toThrow(
      "PERMISSION_DENIED"
    );
    await expect(listInventoryBalancePage(session, {}, {
      dashboardProfile: "positive-stock-v1"
    })).rejects.toThrow("PERMISSION_DENIED");
    await expect(listInventoryBalanceDashboardProfileExportRows(session, {
      profile: "positive-stock-v1",
      maxRows: 100
    })).rejects.toThrow("PERMISSION_DENIED");
    await expect(listInventoryBalanceDashboardProfileExportRows(session, {
      profile: "zero-stock-v1",
      maxRows: 100
    })).rejects.toThrow("PERMISSION_DENIED");
    const staleCachedSession = {
      ...session,
      permissionCodes: ["inventory.balance.view"]
    };
    await expect(listInventoryBalancePage(staleCachedSession, {}, {
      dashboardProfile: "zero-stock-v1"
    })).rejects.toThrow("PERMISSION_DENIED");
    await expect(listInventoryBalanceDashboardProfileExportRows(staleCachedSession, {
      profile: "zero-stock-v1",
      maxRows: 100
    })).rejects.toThrow("PERMISSION_DENIED");
    await expect(listInventoryBalancePage(staleCachedSession, {}, {
      dashboardProfile: "lot-expiry-data-v1"
    })).rejects.toThrow("PERMISSION_DENIED");
    await expect(listInventoryBalanceDashboardProfileExportRows(staleCachedSession, {
      profile: "lot-expiry-data-v1",
      maxRows: 100
    })).rejects.toThrow("PERMISSION_DENIED");

    const foreignUomId = randomUUID();
    const foreignCategoryId = randomUUID();
    const foreignItemId = randomUUID();
    let balanceIds: string[] = [];
    let lotExpiryBalanceIds: string[] = [];
    const inactiveInventoryLocationId = randomUUID();
    await prisma.uom.create({
      data: {
        id: foreignUomId,
        tenantId: ids.foreignTenantId,
        companyId: ids.foreignCompanyId,
        uomCode: `EA-FOR-${suffix}`,
        uomName: "Foreign Each",
        uomType: "COUNT"
      }
    });
    await prisma.itemCategory.create({
      data: {
        id: foreignCategoryId,
        tenantId: ids.foreignTenantId,
        companyId: ids.foreignCompanyId,
        categoryCode: `AZI-FOR-${suffix}`,
        categoryName: "Foreign Authorization Inventory",
        inventoryClass: "GENERAL"
      }
    });
    await prisma.item.create({
      data: {
        id: foreignItemId,
        tenantId: ids.foreignTenantId,
        companyId: ids.foreignCompanyId,
        itemCode: `AZI-FOR-${suffix}`,
        itemName: `Foreign Authorization Inventory Item ${suffix}`,
        itemCategoryId: foreignCategoryId,
        itemType: "INVENTORY",
        baseUomId: foreignUomId
      }
    });
    await prisma.inventoryLocation.create({
      data: {
        id: inactiveInventoryLocationId,
        tenantId: ids.tenantId,
        companyId: ids.companyId,
        locationId: ids.locationId,
        code: `AZI-INACTIVE-${suffix}`,
        name: `Inactive Authorization Inventory Store ${suffix}`,
        status: "INACTIVE"
      }
    });

    const balanceFixtures = [
      {
        tenantId: ids.tenantId, companyId: ids.companyId, inventoryLocationId: ids.inventoryLocationId,
        itemId: ids.itemId, baseUomId: ids.uomId, lotNumber: `BOTH-${suffix}`,
        expiryDate: new Date("2027-02-01T00:00:00.000Z"), quantity: 5,
      },
      {
        tenantId: ids.tenantId, companyId: ids.companyId, inventoryLocationId: ids.inventoryLocationId,
        itemId: ids.itemId, baseUomId: ids.uomId, quantity: 0,
      },
      {
        tenantId: ids.tenantId, companyId: ids.companyId, inventoryLocationId: ids.inventoryLocationId,
        itemId: ids.itemId, baseUomId: ids.uomId,
        expiryDate: new Date("2027-01-01T00:00:00.000Z"), quantity: 2,
      },
      {
        tenantId: ids.tenantId, companyId: ids.companyId, inventoryLocationId: ids.adjacentInventoryLocationId,
        itemId: ids.itemId, baseUomId: ids.uomId, lotNumber: `ADJ-LOC-${suffix}`, quantity: 99,
      },
      {
        tenantId: ids.tenantId, companyId: ids.adjacentCompanyId, inventoryLocationId: ids.adjacentCompanyInventoryLocationId,
        itemId: ids.adjacentCompanyItemId, baseUomId: ids.adjacentCompanyUomId, lotNumber: `ADJ-COMP-${suffix}`, quantity: 99,
      },
      {
        tenantId: ids.foreignTenantId, companyId: ids.foreignCompanyId, inventoryLocationId: ids.foreignInventoryLocationId,
        itemId: foreignItemId, baseUomId: foreignUomId, lotNumber: `FOREIGN-${suffix}`, quantity: 99,
      },
      {
        tenantId: ids.tenantId, companyId: ids.companyId, inventoryLocationId: inactiveInventoryLocationId,
        itemId: ids.itemId, baseUomId: ids.uomId, lotNumber: `INACTIVE-${suffix}`, quantity: 88,
      },
      {
        tenantId: ids.tenantId, companyId: ids.companyId, inventoryLocationId: ids.inventoryLocationId,
        itemId: ids.itemId, baseUomId: ids.uomId, lotNumber: `ZERO-${suffix}`, quantity: 0,
      },
    ];
    await prisma.inventoryMovement.createMany({
      data: balanceFixtures.flatMap((fixture, index) => {
        const movement = (movementType: "ADJUSTMENT_IN" | "ADJUSTMENT_OUT", quantityDeltaBaseUom: number, event: string) => ({
          tenantId: fixture.tenantId,
          companyId: fixture.companyId,
          inventoryLocationId: fixture.inventoryLocationId,
          itemId: fixture.itemId,
          movementType,
          occurredAt: new Date(),
          enteredQuantity: Math.abs(quantityDeltaBaseUom),
          enteredUomId: fixture.baseUomId,
          quantityDeltaBaseUom,
          baseUomId: fixture.baseUomId,
          lotNumber: fixture.lotNumber,
          expiryDate: fixture.expiryDate,
          sourceDocumentType: "AUTHORIZATION_DASHBOARD_BALANCE_SEED",
          sourceDocumentId: randomUUID(),
          sourceEventKey: `authz-dashboard-balance-${suffix}-${index}-${event}`,
          postedByUserId: ids.userId,
        });
        return fixture.quantity === 0
          ? [movement("ADJUSTMENT_IN", 1, "in"), movement("ADJUSTMENT_OUT", -1, "out")]
          : [movement("ADJUSTMENT_IN", fixture.quantity, "in")];
      }),
    });
    const fixtureBalances = await prisma.inventoryBalance.findMany({
      where: {
        OR: balanceFixtures.map((fixture) => ({
          inventoryLocationId: fixture.inventoryLocationId,
          itemId: fixture.itemId,
          lotNumber: fixture.lotNumber ?? null,
          expiryDate: fixture.expiryDate ?? null,
        })),
      },
      select: { id: true, inventoryLocationId: true, lotNumber: true, expiryDate: true },
    });
    expect(fixtureBalances).toHaveLength(balanceFixtures.length);
    balanceIds = fixtureBalances.map(({ id }) => id);
    lotExpiryBalanceIds = fixtureBalances
      .filter((balance) => balance.inventoryLocationId === ids.inventoryLocationId && (balance.lotNumber || balance.expiryDate))
      .map(({ id }) => id);
    expect(lotExpiryBalanceIds).toHaveLength(3);

    const revokeBalancePermission = await grantPermission("inventory.balance.view");

    try {
        const beforeReadSnapshot = await Promise.all([
          prisma.inventoryBalance.findMany({
            where: { id: { in: balanceIds } },
            select: { id: true, qtyOnHand: true, version: true },
            orderBy: { id: "asc" }
          }),
          prisma.inventoryMovement.count({ where: { tenantId: ids.tenantId } }),
          prisma.auditEvent.count({ where: { tenantId: ids.tenantId } })
        ]);
        const authorizedSession = {
          ...session,
          permissionCodes: ["inventory.balance.view"]
        };
        await expect(getInventoryBalanceDashboardRead(authorizedSession)).resolves.toEqual({
          totalRows: 4,
          positiveRows: 2,
          zeroRows: 2,
          lotExpiryTrackedRows: 3
        });

        const profilePage = await listInventoryBalancePage(
          authorizedSession,
          {},
          { dashboardProfile: "positive-stock-v1", page: 1, pageSize: 10 }
        );
        expect(profilePage).toMatchObject({ totalItems: 2, page: 1, totalPages: 1 });
        expect(profilePage.items).toHaveLength(2);
        expect(profilePage.items.every((row) => row.qtyOnHand > 0)).toBe(true);

        const profileExport = await listInventoryBalanceDashboardProfileExportRows(
          authorizedSession,
          { profile: "positive-stock-v1", maxRows: 100 }
        );
        expect(profileExport).toHaveLength(2);
        expect(profileExport.map((row) => row.id).sort()).toEqual(
          profilePage.items.map((row) => row.id).sort()
        );

        const zeroProfilePage = await listInventoryBalancePage(
          authorizedSession,
          {},
          { dashboardProfile: "zero-stock-v1", page: 1, pageSize: 10 }
        );
        expect(zeroProfilePage).toMatchObject({ totalItems: 2, page: 1, totalPages: 1 });
        expect(zeroProfilePage.items).toHaveLength(2);
        expect(zeroProfilePage.items.every((row) => row.qtyOnHand === 0)).toBe(true);

        const zeroProfileExport = await listInventoryBalanceDashboardProfileExportRows(
          authorizedSession,
          { profile: "zero-stock-v1", maxRows: 100 }
        );
        expect(zeroProfileExport.map((row) => row.id).sort()).toEqual(
          zeroProfilePage.items.map((row) => row.id).sort()
        );

        const lotExpiryProfilePage = await listInventoryBalancePage(
          authorizedSession,
          {},
          { dashboardProfile: "lot-expiry-data-v1", page: 1, pageSize: 10 }
        );
        expect(lotExpiryProfilePage).toMatchObject({ totalItems: 3, page: 1, totalPages: 1 });
        expect(lotExpiryProfilePage.items.map((row) => row.id).sort()).toEqual(
          lotExpiryBalanceIds.sort()
        );

        const lotExpiryProfileExport = await listInventoryBalanceDashboardProfileExportRows(
          authorizedSession,
          { profile: "lot-expiry-data-v1", maxRows: 100 }
        );
        expect(lotExpiryProfileExport.map((row) => row.id).sort()).toEqual(
          lotExpiryProfilePage.items.map((row) => row.id).sort()
        );

        const dashboard = await getOperationalDashboard(authorizedSession);
        expect(dashboard.sourceObservations).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              id: "inventory-balances",
              availability: "AVAILABLE"
            })
          ])
        );
        expect(dashboard.metrics).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              id: "stocked-items",
              displayValue: "2",
              href: "/inventory?dashboard=positive-stock-v1"
            })
          ])
        );
        expect(dashboard.stockHealth).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              id: "lot-expiry-data",
              displayValue: "3",
              href: "/inventory?dashboard=lot-expiry-data-v1"
            }),
            expect.objectContaining({
              id: "zero-stock-rows",
              displayValue: "2",
              href: "/inventory?dashboard=zero-stock-v1"
            })
          ])
        );
        await expect(Promise.all([
          prisma.inventoryBalance.findMany({
            where: { id: { in: balanceIds } },
            select: { id: true, qtyOnHand: true, version: true },
            orderBy: { id: "asc" }
          }),
          prisma.inventoryMovement.count({ where: { tenantId: ids.tenantId } }),
          prisma.auditEvent.count({ where: { tenantId: ids.tenantId } })
        ])).resolves.toEqual(beforeReadSnapshot);
    } finally {
      await revokeBalancePermission();
    }
    // Inventory movements and their derived balances are immutable. The
    // authorization database is disposable, so fixture history is retained.
  });

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
      myTasks,
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
      import("../src/server/services/myTasks"),
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
      { id: "purchaseRequests.listPurchaseRequestsDashboardProfile", invoke: () => purchaseRequests.listPurchaseRequestsDashboardProfile(session, "purchase-request-open-v1") },
      { id: "purchaseRequests.listPurchaseRequestsDashboardProfilePage", invoke: () => purchaseRequests.listPurchaseRequestsDashboardProfilePage(session, "purchase-request-open-v1", 1) },
      { id: "purchaseRequests.submitPurchaseRequest", invoke: () => purchaseRequests.submitPurchaseRequest(randomUUID()) },
      { id: "purchaseRequests.reopenReturnedPurchaseRequest", invoke: () => purchaseRequests.reopenReturnedPurchaseRequest(randomUUID()) },
      { id: "purchaseRequests.cancelPurchaseRequest", invoke: () => purchaseRequests.cancelPurchaseRequest(emptyForm()) },
      { id: "purchaseRequests.completeEmergencyPurchasePostReview", invoke: () => purchaseRequests.completeEmergencyPurchasePostReview(emptyForm()) },
      { id: "quotes.createSupplierQuote", invoke: () => quotes.createSupplierQuote(emptyForm()) },
      { id: "quotes.createQuotationRecommendation", invoke: () => quotes.createQuotationRecommendation(emptyForm()) },
      { id: "quotes.submitQuotationRecommendation", invoke: () => quotes.submitQuotationRecommendation(emptyForm()) },
      { id: "purchaseOrders.createPurchaseOrderFromRecommendation", invoke: () => purchaseOrders.createPurchaseOrderFromRecommendation(emptyForm()) },
      { id: "purchaseOrders.listPurchaseOrdersDashboardProfile", invoke: () => purchaseOrders.listPurchaseOrdersDashboardProfile(session, "po-open-v1") },
      { id: "purchaseOrders.listPurchaseOrdersDashboardProfilePage", invoke: () => purchaseOrders.listPurchaseOrdersDashboardProfilePage(session, "po-open-v1", 1) },
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
    await expect(myTasks.getMyTasksPage(session)).resolves.toEqual({
      enrolledSources: [],
      isComplete: true,
      items: [],
      nextCursor: null,
      totalCount: 0,
      unavailableSources: [],
    });
    expect(await workflowMutationSnapshot()).toEqual(before);
  });

  it("AUTHZ-PI-OPENING-INVENTORY-READ-SCOPE-NO-DISCLOSURE", async () => {
    const openingInventory = await import("../src/server/services/openingInventoryCutovers");
    const revoke = await grantPermission("inventory.opening_inventory.view");
    try {
      const before = await workflowMutationSnapshot();
      await expect(
        openingInventory.listOpeningInventoryCutoverPage(session, {
          locationId: ids.adjacentLocationId,
        }),
      ).rejects.toThrow("OPENING_INVENTORY_ENDPOINT_SCOPE_DENIED");
      await expect(
        openingInventory.getOpeningInventoryCutoverDetail(session, randomUUID()),
      ).rejects.toThrow("OPENING_INVENTORY_CUTOVER_NOT_FOUND");
      expect(await workflowMutationSnapshot()).toEqual(before);
    } finally {
      await revoke();
    }
  });

  it("AUTHZ-PI-OPENING-INVENTORY-DETAIL-COMPLETE-REVISION-ENDPOINT-SCOPE", async () => {
    const openingInventory = await import("../src/server/services/openingInventoryCutovers");
    const revoke = await grantPermission("inventory.opening_inventory.view");
    const fullyScopedSession: SessionContext = {
      ...session,
      user: {
        id: ids.approvalRequesterId,
        email: `authz-approval-requester-${suffix}@example.test`,
        displayName: `Authorization Approval Requester ${suffix}`,
        role: "Inventory Operator",
      },
      authorizedLocations: [
        {
          ...session.authorizedLocations[0]!,
          scopeAssignmentId: ids.approvalRequesterScopeAssignmentId,
        },
        {
          ...session.authorizedLocations[0]!,
          locationId: ids.adjacentLocationId,
          locationName: `Adjacent Authorization Inventory Location ${suffix}`,
          scopeAssignmentId: ids.approvalRequesterAdjacentScopeAssignmentId,
        },
      ],
    };
    try {
      const before = await workflowMutationSnapshot();
      const [partialEvidence, partialActivity, fullEvidence, fullActivity] = await Promise.all([
        openingInventory.getOpeningInventoryCutoverDetail(session, ids.openingInventoryMfaCutoverId, { tab: "evidence", page: 1, pageSize: 10 }),
        openingInventory.getOpeningInventoryCutoverDetail(session, ids.openingInventoryMfaCutoverId, { tab: "activity", page: 1, pageSize: 10 }),
        openingInventory.getOpeningInventoryCutoverDetail(fullyScopedSession, ids.openingInventoryMfaCutoverId, { tab: "evidence", page: 1, pageSize: 10 }),
        openingInventory.getOpeningInventoryCutoverDetail(fullyScopedSession, ids.openingInventoryMfaCutoverId, { tab: "activity", page: 1, pageSize: 10 }),
      ]);

      expect(partialEvidence.cohortSharedVisible).toBe(false);
      expect(partialEvidence.evidencePage).toMatchObject({ items: [], totalItems: 0 });
      expect(partialActivity.cohortSharedVisible).toBe(false);
      expect(partialActivity.activityPage.items.map((event) => event.detail)).not.toContain("Cohort authority event");

      expect(fullEvidence.cohortSharedVisible).toBe(true);
      expect(fullEvidence.evidencePage).toMatchObject({
        totalItems: 1,
        items: [expect.objectContaining({
          controlledEvidenceAttachmentId: ids.openingInventoryMfaControlledEvidenceId,
          attachmentId: ids.openingInventoryMfaEvidenceAttachmentId,
          originalFilename: `opening-inventory-detail-${suffix}.txt`,
        })],
      });
      expect(fullActivity.cohortSharedVisible).toBe(true);
      expect(await workflowMutationSnapshot()).toEqual(before);
    } finally {
      await revoke();
    }
  });

  it("AUTHZ-PI-OPENING-INVENTORY-FORM-OPTIONS-OUT-OF-REVISION-DRAFT-NO-DISCLOSURE", async () => {
    const openingInventory = await import("../src/server/services/openingInventoryCutovers");
    const revoke = await grantPermission("inventory.opening_inventory.prepare");
    const unrelatedLocationSession: SessionContext = {
      ...session,
      context: {
        ...session.context,
        locationId: ids.unrelatedLocationId,
        locationName: `Unrelated Authorization Inventory Location ${suffix}`,
      },
      authorizedLocations: [{
        ...session.authorizedLocations[0]!,
        locationId: ids.unrelatedLocationId,
        locationName: `Unrelated Authorization Inventory Location ${suffix}`,
        scopeAssignmentId: ids.unrelatedLocationScopeAssignmentId,
      }],
    };
    try {
      const before = await workflowMutationSnapshot();
      const options = await openingInventory.getOpeningInventoryFormOptions(unrelatedLocationSession);

      expect(options.revisions.map((revision) => revision.id)).not.toContain(
        ids.openingInventoryRevisionId,
      );
      expect(options.draftCohorts.map((cohort) => cohort.id)).not.toContain(
        ids.openingInventoryEmptyCohortId,
      );
      expect(JSON.stringify(options)).not.toContain(`AUTHZ-PI-OIC-ADJ-DRAFT-${suffix}`);
      expect(await workflowMutationSnapshot()).toEqual(before);
    } finally {
      await revoke();
    }
  });

  it("AUTHZ-PI-OPENING-INVENTORY-EVIDENCE-COHORT-IDOR-NO-DISCLOSURE", async () => {
    const openingInventory = await import("../src/server/services/openingInventoryCutovers");
    const attachments = await import("../src/server/services/attachments");
    const revoke = await grantPermission("inventory.opening_inventory.prepare");
    const objectVersionId = `authz-opening-evidence-${suffix}`;
    const checksum = createHash("sha256").update(objectVersionId).digest("hex");
    const fullyScopedSession: SessionContext = {
      ...session,
      user: {
        id: ids.approvalRequesterId,
        email: `authz-approval-requester-${suffix}@example.test`,
        displayName: `Authorization Approval Requester ${suffix}`,
        role: "Inventory Operator",
      },
      authorizedLocations: [
        {
          ...session.authorizedLocations[0]!,
          scopeAssignmentId: ids.approvalRequesterScopeAssignmentId,
        },
        {
          ...session.authorizedLocations[0]!,
          locationId: ids.adjacentLocationId,
          locationName: `Adjacent Authorization Inventory Location ${suffix}`,
          scopeAssignmentId: ids.approvalRequesterAdjacentScopeAssignmentId,
        },
      ],
    };
    try {
      await prisma.attachment.create({
        data: {
          id: ids.openingInventoryEvidenceAttachmentId,
          tenantId: ids.tenantId,
          companyId: ids.companyId,
          storageEnvironment: "LOCAL_DEVELOPMENT",
          storageProvider: "disposable",
          objectKey: `authorization/opening-inventory/${suffix}`,
          objectVersionId,
          originalFilename: `opening-inventory-${suffix}.txt`,
          mimeType: "text/plain",
          detectedMimeType: "text/plain",
          sizeBytes: 1,
          checksum,
          detectedChecksum: checksum,
          uploadState: "VERIFIED",
          scanState: "CLEAN",
          availabilityState: "AVAILABLE",
          physicalState: "DURABLE",
          scanVerifiedObjectVersionId: objectVersionId,
          uploadVerifiedAt: new Date("2026-07-01T00:00:00.000Z"),
          scanCompletedAt: new Date("2026-07-01T00:00:00.000Z"),
          availableAt: new Date("2026-07-01T00:00:00.000Z"),
          uploadedByUserId: ids.userId,
          status: "ACTIVE",
        },
      });
      const linked = await attachments.linkControlledEvidenceAttachment({
        sourceType: "OPENING_INVENTORY_COHORT",
        sourceRecordId: ids.openingInventoryEmptyCohortId,
        attachmentId: ids.openingInventoryEvidenceAttachmentId,
        purpose: "EVIDENCE",
        requiredPermissionCode: "inventory.opening_inventory.prepare",
      });
      const before = await workflowMutationSnapshot();

      const hostile = await openingInventory.getOpeningInventoryFormOptions(session, {
        cohortId: ids.openingInventoryEmptyCohortId,
      });
      expect(hostile.eligibleEvidenceAttachments).toEqual([]);
      expect(hostile.eligibleEvidencePage.totalItems).toBe(0);

      for (const foreignScopeUuid of [ids.foreignTenantId, ids.foreignCompanyId]) {
        const foreign = await openingInventory.getOpeningInventoryFormOptions(session, {
          cohortId: foreignScopeUuid,
        });
        expect(foreign.eligibleEvidenceAttachments).toEqual([]);
        expect(foreign.eligibleEvidencePage.totalItems).toBe(0);
      }

      const authorized = await openingInventory.getOpeningInventoryFormOptions(
        fullyScopedSession,
        { cohortId: ids.openingInventoryEmptyCohortId },
      );
      expect(authorized.eligibleEvidenceAttachments).toEqual([
        expect.objectContaining({
          id: linked.id,
          attachmentId: ids.openingInventoryEvidenceAttachmentId,
          status: "ACTIVE",
          attachment: expect.objectContaining({
            originalFilename: `opening-inventory-${suffix}.txt`,
            scanState: "CLEAN",
            availabilityState: "AVAILABLE",
          }),
        }),
      ]);
      expect(authorized.eligibleEvidencePage.totalItems).toBe(1);
      expect(await workflowMutationSnapshot()).toEqual(before);
    } finally {
      await revoke();
    }
  });

  it("AUTHZ-PI-OPENING-INVENTORY-ACTIVITY-SERVER-PAGING-ORDER", async () => {
    const openingInventory = await import("../src/server/services/openingInventoryCutovers");
    const revoke = await grantPermission("inventory.opening_inventory.view");
    const eventTypes = Array.from(
      { length: 11 },
      (_, index) => `opening_inventory.pagination_probe_${String(index + 1).padStart(2, "0")}`,
    );
    try {
      await prisma.auditEvent.createMany({
        data: eventTypes.map((eventType, index) => ({
          id: randomUUID(),
          tenantId: ids.tenantId,
          companyId: ids.companyId,
          actorUserId: ids.userId,
          eventType,
          entityType: "OpeningInventoryCutover",
          entityId: ids.openingInventoryMfaCutoverId,
          occurredAt: new Date(Date.UTC(2026, 6, 1, 0, 0, index + 1)),
        })),
      });
      const [first, second, third] = await Promise.all([
        openingInventory.getOpeningInventoryCutoverDetail(session, ids.openingInventoryMfaCutoverId, { tab: "activity", page: 1, pageSize: 5 }),
        openingInventory.getOpeningInventoryCutoverDetail(session, ids.openingInventoryMfaCutoverId, { tab: "activity", page: 2, pageSize: 5 }),
        openingInventory.getOpeningInventoryCutoverDetail(session, ids.openingInventoryMfaCutoverId, { tab: "activity", page: 3, pageSize: 5 }),
      ]);
      const pagedEventTypes = [
        ...first.activityPage.items,
        ...second.activityPage.items,
        ...third.activityPage.items,
      ].map((event) => event.eventType);

      expect(first.activityPage).toMatchObject({ totalItems: 11, page: 1, pageSize: 5 });
      expect(second.activityPage.items).toHaveLength(5);
      expect(third.activityPage.items).toHaveLength(1);
      expect(pagedEventTypes).toEqual([...eventTypes].reverse());
      expect(new Set(pagedEventTypes)).toHaveLength(11);
    } finally {
      await revoke();
    }
  });

  it("AUTHZ-PI-OPENING-INVENTORY-PREPARE-MISSING-PERMISSION-NO-MUTATION", async () => {
    const openingInventory = await import("../src/server/services/openingInventoryCutovers");
    const before = await workflowMutationSnapshot();
    const validPreparation = {
      cohortId: randomUUID(),
      stockCountAttemptId: randomUUID(),
      idempotencyKey: `authz-opening-prepare-${randomUUID()}`,
      controlledEvidenceAttachmentIds: [randomUUID()],
      valuationLines: [{ itemId: ids.itemId, lotKey: "NOLOT|NOEXP", unitCost: 1 }],
    };
    await expect(
      openingInventory.createOpeningInventoryCohort({
        configurationRevisionId: randomUUID(),
        effectiveAt: new Date("2026-08-01T00:00:00.000Z"),
      }, session),
    ).rejects.toThrow("PERMISSION_DENIED");
    await expect(openingInventory.prepareOpeningInventoryCutover(validPreparation, session)).rejects.toThrow("PERMISSION_DENIED");
    await expect(openingInventory.sealOpeningInventoryCohort({ id: randomUUID(), expectedVersion: 1 }, session)).rejects.toThrow("PERMISSION_DENIED");
    await expect(openingInventory.getOpeningInventoryFormOptions(session)).rejects.toThrow("PERMISSION_DENIED");
    await expect(
      openingInventory.getOpeningInventoryPreparationFormOptions(session, {
        cohortId: validPreparation.cohortId,
        stockCountAttemptId: validPreparation.stockCountAttemptId,
      }),
    ).rejects.toThrow("PERMISSION_DENIED");
    expect(await workflowMutationSnapshot()).toEqual(before);
  });

  it("AUTHZ-PI-OPENING-INVENTORY-SUBMIT-SCOPE-SOD-NO-MUTATION", async () => {
    const openingInventory = await import("../src/server/services/openingInventoryCutovers");
    const before = await workflowMutationSnapshot();
    await expect(
      openingInventory.submitOpeningInventoryCutoverForApproval({ id: ids.openingInventoryScopedCutoverId, expectedVersion: 1 }, session),
    ).rejects.toThrow("PERMISSION_DENIED");
    const revoke = await grantPermission("inventory.opening_inventory.submit");
    try {
      await expect(
        openingInventory.submitOpeningInventoryCutoverForApproval({ id: ids.openingInventoryAdjacentCutoverId, expectedVersion: 1 }, session),
      ).rejects.toThrow("OPENING_INVENTORY_ENDPOINT_SCOPE_DENIED");
      await expect(
        openingInventory.submitOpeningInventoryCutoverForApproval({ id: ids.openingInventoryScopedCutoverId, expectedVersion: 1 }, session),
      ).rejects.toThrow("APPROVAL_STEP_ELIGIBLE_ACTOR_NOT_AVAILABLE");
      expect(await workflowMutationSnapshot()).toEqual(before);
    } finally {
      await revoke();
    }
  });

  it("AUTHZ-PI-OPENING-INVENTORY-EXECUTION-AUTH-MFA-SOD-NO-MUTATION", async () => {
    const openingInventory = await import("../src/server/services/openingInventoryCutovers");
    const command = (cohortId: string) => openingInventory.requestOpeningInventoryExecutionCommand({
      cohortId,
      expectedCohortVersion: 1,
      idempotencyKey: `authz-opening-command-${randomUUID()}`,
      reason: "Authorization boundary verification",
    }, "FREEZE_COHORT", session);
    const scopedLocationCommand = () => openingInventory.requestOpeningInventoryExecutionCommand({
      cohortId: ids.openingInventorySubmitCohortId,
      cutoverId: ids.openingInventoryScopedCutoverId,
      expectedCohortVersion: 1,
      expectedCutoverVersion: 1,
      idempotencyKey: `authz-opening-location-command-${randomUUID()}`,
      reason: "Authorization segregation-of-duties verification",
    }, "STAGE_LOCATION", session);
    const before = await workflowMutationSnapshot();
    await expect(command(ids.openingInventoryMfaCohortId)).rejects.toThrow("PERMISSION_DENIED");
    const revoke = await grantPermission("inventory.opening_inventory.request_execute");
    try {
      await expect(command(ids.openingInventoryMfaCohortId)).rejects.toThrow("PRIVILEGED_MFA_STEP_UP_REQUIRED");
      await expect(scopedLocationCommand()).rejects.toThrow("OPENING_INVENTORY_COMMAND_REQUESTER_CONFLICT");
      await expect(command(ids.openingInventorySodCohortId)).rejects.toThrow("OPENING_INVENTORY_COMMAND_NOT_REQUESTABLE");
      await expect(command(ids.openingInventoryEmptyCohortId)).rejects.toThrow("OPENING_INVENTORY_COMMAND_NOT_REQUESTABLE");
      await expect(command(ids.openingInventorySubmitCohortId)).rejects.toThrow("OPENING_INVENTORY_ENDPOINT_SCOPE_DENIED");
      expect(await workflowMutationSnapshot()).toEqual(before);
    } finally {
      await revoke();
    }
  });

  it("AUTHZ-PI-OPENING-INVENTORY-APPROVAL-PERMISSION-MFA-SOD-NO-MUTATION", async () => {
    const approvals = await import("../src/server/services/approvals");
    const before = await workflowMutationSnapshot();
    await expect(
      approvals.approveOpeningInventoryCutover(
        form({ approvalInstanceId: ids.openingInventoryApprovalInstanceId }),
      ),
    ).rejects.toThrow("PERMISSION_DENIED");
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
          approvalInstanceId: ids.approveDispatchApprovalId,
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
              expectedUpdatedAt: "2026-01-01T00:00:00.000Z",
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
            form({
              supplierId: randomUUID(),
              supplierItemLinkId: randomUUID(),
              reason: "Authorization test",
            }),
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

  it("AUTHZ-PI-PR-DRAFT-OPTIONS-AUTHORIZATION-AND-SCOPE-NO-DISCLOSURE", async () => {
    const purchaseRequests = await import("../src/server/services/purchaseRequests");
    await prisma.budget.create({
      data: {
        id: ids.scopedBudgetId,
        tenantId: ids.tenantId,
        companyId: ids.companyId,
        publicReference: `AZI-BUDGET-${suffix}`,
        fiscalYearId: ids.fiscalYearId,
        name: "Scoped draft budget",
        status: "ACTIVE",
        approvedAt: new Date("2026-01-01T00:00:00.000Z"),
        createdByUserId: ids.userId,
        lines: {
          create: [
            {
              tenantId: ids.tenantId,
              companyId: ids.companyId,
              lineNumber: 1,
              code: `AZI-SCOPED-${suffix}`,
              name: "Scoped draft line",
              locationId: ids.locationId,
              periodStart: new Date("2026-01-01T00:00:00.000Z"),
              periodEnd: new Date("2026-12-31T00:00:00.000Z"),
              status: "ACTIVE",
            },
            {
              tenantId: ids.tenantId,
              companyId: ids.companyId,
              lineNumber: 2,
              code: `AZI-ADJACENT-${suffix}`,
              name: "Adjacent-location draft line",
              locationId: ids.adjacentLocationId,
              periodStart: new Date("2026-01-01T00:00:00.000Z"),
              periodEnd: new Date("2026-12-31T00:00:00.000Z"),
              status: "ACTIVE",
            },
          ],
        },
      },
    });
    await prisma.budget.create({
      data: {
        id: ids.foreignBudgetId,
        tenantId: ids.foreignTenantId,
        companyId: ids.foreignCompanyId,
        publicReference: `AZI-FOREIGN-BUDGET-${suffix}`,
        fiscalYearId: ids.foreignFiscalYearId,
        name: "Foreign draft budget",
        status: "ACTIVE",
        approvedAt: new Date("2026-01-01T00:00:00.000Z"),
        createdByUserId: ids.userId,
      },
    });
    await prisma.budgetLine.create({
      data: {
        budgetId: ids.foreignBudgetId,
        tenantId: ids.tenantId,
        companyId: ids.companyId,
        lineNumber: 1,
        code: `AZI-FOREIGN-PARENT-${suffix}`,
        name: "Locally scoped line with foreign parent",
        locationId: ids.locationId,
        periodStart: new Date("2026-01-01T00:00:00.000Z"),
        periodEnd: new Date("2026-12-31T00:00:00.000Z"),
        status: "ACTIVE",
      },
    });

    const before = await prisma.auditEvent.count({ where: { tenantId: ids.tenantId } });
    await expect(purchaseRequests.getPurchaseRequestDraftOptions(session)).rejects.toThrow(
      "PERMISSION_DENIED",
    );
    expect(await prisma.auditEvent.count({ where: { tenantId: ids.tenantId } })).toBe(before);

    const revoke = await grantPermission("purchasing.purchase_request.create");
    try {
      const options = await purchaseRequests.getPurchaseRequestDraftOptions(session);
      expect(options.budgetLines).toEqual([
        {
          id: expect.any(String),
          label: `AZI-SCOPED-${suffix} / Scoped draft line`,
          helper: `AZI-BUDGET-${suffix} / Scoped draft budget`,
        },
      ]);
      expect(JSON.stringify(options.budgetLines)).not.toContain(`AZI-ADJACENT-${suffix}`);
      expect(JSON.stringify(options.budgetLines)).not.toContain(`AZI-FOREIGN-BUDGET-${suffix}`);
    } finally {
      await revoke();
    }
    expect(await prisma.auditEvent.count({ where: { tenantId: ids.tenantId } })).toBe(before);
  });

  it("AUTHZ-PI-ATTACHMENT-LINK-MISSING-PERMISSION-DENIAL-AUDIT-NO-LINK", async () => {
    const attachments = await import("../src/server/services/attachments");
    const beforeLinks = await prisma.controlledEvidenceAttachment.count({
      where: { tenantId: ids.tenantId },
    });
    const denialWhere = {
      tenantId: ids.tenantId,
      companyId: ids.companyId,
      locationId: ids.locationId,
      actorUserId: ids.userId,
      subjectType: "ACTOR" as const,
      action: "CREATE" as const,
      reason: "PERMISSION_MISSING" as const,
      resource: "EVIDENCE" as const,
    };
    expect(
      await prisma.authorizationDenialBucket.count({ where: denialWhere }),
    ).toBe(0);
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
    const denialBuckets = await prisma.authorizationDenialBucket.findMany({
      where: denialWhere,
      select: {
        id: true,
        denialCount: true,
        firstAuditEventId: true,
        firstAuditEvent: {
          select: { id: true, eventType: true, entityType: true, entityId: true },
        },
      },
    });
    expect(denialBuckets).toHaveLength(1);
    expect(denialBuckets[0]).toMatchObject({
      denialCount: 1n,
      firstAuditEvent: {
        eventType: "authorization.denial.first",
        entityType: "AuthorizationDenialBucket",
      },
    });
    expect(denialBuckets[0]?.firstAuditEventId).toBe(
      denialBuckets[0]?.firstAuditEvent.id,
    );
    expect(denialBuckets[0]?.firstAuditEvent.entityId).toBe(
      denialBuckets[0]?.id,
    );
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
            approvalInstanceId: ids.approveDispatchApprovalId,
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

  it("AUTHZ-PI-MIXED-NEXT-ROLE-EXCLUDES-REQUESTER-WITHOUT-NOTIFICATION-FANOUT", async () => {
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
      expect(notifications).toHaveLength(0);
    } finally {
      await revoke();
    }
  });

  it("AUTHZ-PI-NEXT-RECIPIENT-REVOCATION-IS-REVALIDATED-BEFORE-ADVANCE", async () => {
    const approvals = await import("../src/server/services/approvals");
    const revokePermission = await grantPermission("purchasing.purchase_request.approve");
    let releaseRecipientRevocation!: () => void;
    let recipientRevocationLocked!: () => void;
    let recipientRevocationPid!: number;
    const recipientRevocationReady = new Promise<void>((resolve) => {
      recipientRevocationLocked = resolve;
    });
    const recipientRevocationGate = new Promise<void>((resolve) => {
      releaseRecipientRevocation = resolve;
    });
    try {
      const revokeRecipient = prisma.$transaction(async (tx) => {
        const [backend] = await tx.$queryRaw<Array<{ pid: number }>>`
          SELECT pg_backend_pid() AS pid
        `;
        if (!backend) throw new Error("RECIPIENT_REVOCATION_BACKEND_NOT_FOUND");
        recipientRevocationPid = backend.pid;
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
      await waitForBlockedRecipientAuthorityLock(
        prisma,
        recipientRevocationPid,
      );
      releaseRecipientRevocation();
      await revokeRecipient;
      await approvalAttempt;

      const [approval, steps, request, notifications, decisionAudits] = await Promise.all([
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
        prisma.auditEvent.count({
          where: {
            tenantId: ids.tenantId,
            entityType: "PurchaseRequest",
            entityId: ids.recipientRevocationPurchaseRequestId,
            eventType: "purchase_request.approval_step_approved",
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
      expect(decisionAudits).toBe(0);
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
      ).rejects.toThrow("STOCK_COUNT_VARIANCE_DISABLED");
      await expect(
        stockCounts.generateStockCountVarianceAdjustment(
          form({ id: ids.scopedDraftStockCountId }),
        ),
      ).rejects.toThrow("STOCK_COUNT_VARIANCE_DISABLED");
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
      prisma.$transaction(async (tx) => {
        const lock = await lockInventoryLocationsForPosting(tx, session, [
          ids.adjacentInventoryLocationId,
        ]);
        return postInventoryMovementInTransaction(
          tx,
          session,
          lock,
          movementInput(ids.adjacentInventoryLocationId),
        );
      }),
    ).rejects.toThrow("INVENTORY_LOCATION_SCOPE_DENIED");
    await expect(
      prisma.$transaction((tx) =>
        lockInventoryLocationForPosting(
          tx,
          session,
          ids.adjacentCompanyInventoryLocationId,
        ),
      ),
    ).rejects.toThrow("INVENTORY_LOCATION_POSTING_LOCK_SCOPE_DENIED");
    for (const inventoryLocationIds of [
      [ids.adjacentCompanyInventoryLocationId],
      [ids.foreignInventoryLocationId],
      [ids.inventoryLocationId, ids.adjacentCompanyInventoryLocationId],
    ]) {
      await expect(
        prisma.$transaction((tx) =>
          lockInventoryLocationsForPosting(tx, session, inventoryLocationIds),
        ),
      ).rejects.toThrow("INVENTORY_LOCATION_POSTING_LOCK_SCOPE_DENIED");
    }
    expect(await mutationSnapshot()).toEqual(before);
  });

  it("AUTHZ-PI-INVENTORY-IDEMPOTENT-RETRY-POSTS-EXACTLY-ONCE", async () => {
    const input = movementInput(ids.inventoryLocationId);
    const before = await mutationSnapshot();
    const balanceKey = {
      inventoryLocationId: ids.inventoryLocationId,
      itemId: ids.itemId,
      lotKey: "NOLOT|NOEXP",
    };
    const balanceBefore = await prisma.inventoryBalance.findUniqueOrThrow({
      where: { inventoryLocationId_itemId_lotKey: balanceKey },
      select: { id: true, qtyOnHand: true, version: true },
    });
    const first = await postInventoryMovement(session, input);
    const balanceAfterFirst = await prisma.inventoryBalance.findUniqueOrThrow({
      where: { inventoryLocationId_itemId_lotKey: balanceKey },
      select: { id: true, qtyOnHand: true, version: true },
    });
    const second = await postInventoryMovement(session, input);
    const balanceAfterReplay = await prisma.inventoryBalance.findUniqueOrThrow({
      where: { inventoryLocationId_itemId_lotKey: balanceKey },
      select: { id: true, qtyOnHand: true, version: true },
    });
    expect(first.duplicate).toBe(false);
    expect(second.duplicate).toBe(true);
    expect(second.movement.id).toBe(first.movement.id);
    expect(balanceAfterFirst.id).toBe(balanceBefore.id);
    expect(Number(balanceAfterFirst.qtyOnHand)).toBe(Number(balanceBefore.qtyOnHand) + 1);
    expect(balanceAfterFirst.version).toBe(balanceBefore.version + 1);
    expect(balanceAfterReplay.id).toBe(balanceAfterFirst.id);
    expect(Number(balanceAfterReplay.qtyOnHand)).toBe(Number(balanceAfterFirst.qtyOnHand));
    expect(balanceAfterReplay.version).toBe(balanceAfterFirst.version);
    const after = await mutationSnapshot();
    expect(after.movements).toBe(before.movements + 1);
    expect(after.balances).toBe(before.balances);
  });
});
