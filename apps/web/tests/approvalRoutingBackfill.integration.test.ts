import { randomUUID } from "node:crypto";
import { prisma } from "@ogfi/database";
import { beforeAll, describe, expect, test } from "vitest";
import { runApprovalRoutingBackfill } from "../src/server/services/approvalRoutingBackfill";
import { supportedApprovalDocumentTypes } from "../src/server/services/approvalRoutingRegistry";
import { getApprovalDetail } from "../src/server/services/approvals";
import type { SessionContext } from "../src/server/services/context";

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

type BreadthExpected = {
  approvalInstanceId: string;
  documentType: (typeof supportedApprovalDocumentTypes)[number];
  permissionCode: string;
  dueAt: Date | null;
  targetMatchMode: "ANY" | "ALL";
  targets: Array<{ scopeType: "COMPANY" | "LOCATION"; companyId: string; locationId: string | null }>;
  prohibited: Array<{ userId: string; reasonCode: string }>;
};

describe.skipIf(!runPg).sequential("approval routing backfill 18-type PostgreSQL breadth", () => {
  const id = () => randomUUID();
  const suffix = randomUUID().slice(0, 8);
  const ids = {
    tenant: id(), company: id(), location: id(), secondLocation: id(), inventoryLocation: id(),
    approver: id(), requester: id(), preparer: id(), priorApprover: id(), role: id(), rule: id(),
    supplier: id(), fiscalYear: id(), period: id(), budget: id(), fund: id(), employee: id(),
    accountClass: id(), ledgerAccount: id(), bankAccount: id(),
  };
  const due = new Date("2026-08-15T00:00:00.000Z");
  const transition = new Date("2026-07-22T04:00:00.000Z");
  const fixtures: BreadthExpected[] = [];
  const instanceIds: string[] = [];

  const expectedPolicies: Record<(typeof supportedApprovalDocumentTypes)[number], string> = {
    PurchaseRequest: "purchasing.purchase_request.approve",
    QuotationRecommendation: "purchasing.quote.approve",
    PurchaseOrder: "purchasing.purchase_order.approve",
    PurchaseOrderBalanceClosure: "purchasing.purchase_order.approve",
    PurchaseOrderAmendment: "purchasing.purchase_order.approve",
    WastageReport: "inventory.wastage.approve",
    StockAdjustment: "inventory.stock_adjustment.approve",
    FinanceCloseRun: "finance.period_close.manage",
    BudgetRevision: "finance.budget.approve",
    ExpenseRequest: "finance.expense_request.approve",
    CashAdvanceRequest: "finance.cash_advance.approve",
    PettyCashRequest: "finance.petty_cash.approve",
    PaymentRequest: "finance.payment_request.approve",
    PaymentRelease: "finance.payment.release",
    EmployeeLeaveRequest: "workforce.leave.approve",
    EmployeeOvertimeRecord: "workforce.overtime.approve",
    WorkforceSchedule: "workforce.schedule.manage",
    AttendanceImportBatch: "workforce.attendance_import.manage",
  };

  async function addApproval(documentType: BreadthExpected["documentType"], documentId: string, expected: Omit<BreadthExpected, "approvalInstanceId" | "documentType" | "permissionCode">) {
    const approvalInstanceId = id();
    instanceIds.push(approvalInstanceId);
    fixtures.push({ approvalInstanceId, documentType, permissionCode: expectedPolicies[documentType], ...expected });
    await prisma.approvalInstance.create({ data: {
      id: approvalInstanceId, tenantId: ids.tenant, companyId: ids.company,
      documentType, documentId, approvalRuleId: ids.rule, status: "PENDING", currentStepOrder: 1,
      steps: { create: { stepOrder: 1, assignedUserId: ids.approver, status: "PENDING", routingSchemaVersion: 0 } },
    } });
  }

  beforeAll(async () => {
    await prisma.tenant.create({ data: { id: ids.tenant, name: `Approval Breadth ${suffix}`, loginCode: `approval-breadth-${suffix}` } });
    await prisma.company.create({ data: { id: ids.company, tenantId: ids.tenant, code: `AB-${suffix}`, legalName: "Approval Breadth Company", currencyCode: "PHP" } });
    await prisma.location.createMany({ data: [
      { id: ids.location, tenantId: ids.tenant, companyId: ids.company, locationType: "BRANCH", code: `AB-L1-${suffix}`, name: "Breadth Location" },
      { id: ids.secondLocation, tenantId: ids.tenant, companyId: ids.company, locationType: "BRANCH", code: `AB-L2-${suffix}`, name: "Breadth Second Location" },
    ] });
    await prisma.inventoryLocation.create({ data: { id: ids.inventoryLocation, tenantId: ids.tenant, companyId: ids.company, locationId: ids.location, code: `AB-INV-${suffix}`, name: "Breadth Inventory" } });
    await prisma.user.createMany({ data: [
      { id: ids.approver, tenantId: ids.tenant, email: `approver-${suffix}@test.invalid`, displayName: "Breadth Approver" },
      { id: ids.requester, tenantId: ids.tenant, email: `requester-${suffix}@test.invalid`, displayName: "Breadth Requester" },
      { id: ids.preparer, tenantId: ids.tenant, email: `preparer-${suffix}@test.invalid`, displayName: "Breadth Preparer" },
      { id: ids.priorApprover, tenantId: ids.tenant, email: `prior-${suffix}@test.invalid`, displayName: "Breadth Prior Approver" },
    ] });
    await prisma.role.create({ data: { id: ids.role, tenantId: ids.tenant, code: `AB_ROLE_${suffix}`, name: "Breadth Approver" } });
    const permissionRows = await prisma.permission.findMany({ where: { code: { in: [...new Set(Object.values(expectedPolicies))] } }, select: { id: true, code: true } });
    expect(permissionRows.map((row) => row.code).sort()).toEqual([...new Set(Object.values(expectedPolicies))].sort());
    await prisma.rolePermission.createMany({ data: permissionRows.map((row) => ({ roleId: ids.role, permissionId: row.id })) });
    await prisma.userRoleAssignment.create({ data: { userId: ids.approver, roleId: ids.role } });
    await prisma.userScopeAssignment.createMany({ data: [
      { userId: ids.approver, scopeType: "COMPANY", scopeId: ids.company, accessLevel: "APPROVE" },
      { userId: ids.approver, scopeType: "LOCATION", scopeId: ids.location, accessLevel: "APPROVE" },
      { userId: ids.approver, scopeType: "LOCATION", scopeId: ids.secondLocation, accessLevel: "APPROVE" },
    ] });
    await prisma.approvalRule.create({ data: { id: ids.rule, tenantId: ids.tenant, companyId: ids.company, transactionType: "APPROVAL_BREADTH", priority: 1 } });
    await prisma.supplier.create({ data: { id: ids.supplier, tenantId: ids.tenant, companyId: ids.company, supplierCode: `AB-S-${suffix}`, legalName: "Breadth Supplier" } });
    await prisma.fiscalYear.create({ data: { id: ids.fiscalYear, tenantId: ids.tenant, companyId: ids.company, code: `AB-FY-${suffix}`, name: "Breadth FY", startDate: new Date("2026-01-01Z"), endDate: new Date("2026-12-31Z") } });
    await prisma.accountingPeriod.create({ data: { id: ids.period, tenantId: ids.tenant, companyId: ids.company, fiscalYearId: ids.fiscalYear, periodNumber: 7, code: `AB-P-${suffix}`, name: "Breadth Period", startDate: new Date("2026-07-01Z"), endDate: new Date("2026-07-31Z") } });
    await prisma.financeAccountClass.create({ data: { id: ids.accountClass, tenantId: ids.tenant, companyId: ids.company, code: `AB-AC-${suffix}`, name: "Assets", normalBalance: "DEBIT", statementSection: "BALANCE_SHEET" } });
    await prisma.chartOfAccount.create({ data: { id: ids.ledgerAccount, tenantId: ids.tenant, companyId: ids.company, accountClassId: ids.accountClass, code: `AB-GL-${suffix}`, name: "Bank", normalBalance: "DEBIT", postingAllowed: true } });
    await prisma.bankAccount.create({ data: { id: ids.bankAccount, tenantId: ids.tenant, companyId: ids.company, locationId: ids.location, ledgerAccountId: ids.ledgerAccount, publicReference: `AB-BA-${suffix}`, bankName: "Breadth Bank", maskedAccountNumber: "****0180", accountType: "CHECKING", createdByUserId: ids.requester } });

    const prId = id(), qrId = id(), quoteId = id(), recId = id(), poId = id();
    await prisma.purchaseRequest.create({ data: { id: prId, publicReference: `AB-PR-${suffix}`, tenantId: ids.tenant, companyId: ids.company, requestLocationId: ids.location, requesterUserId: ids.requester, requiredDate: due, urgency: "NORMAL", justification: "Breadth", status: "PENDING_APPROVAL" } });
    await prisma.quotationRequest.create({ data: { id: qrId, tenantId: ids.tenant, companyId: ids.company, publicReference: `AB-QR-${suffix}`, purchaseRequestId: prId, status: "OPEN", requiredDate: due, createdByUserId: ids.requester } });
    await prisma.supplierQuotation.create({ data: { id: quoteId, quotationRequestId: qrId, tenantId: ids.tenant, companyId: ids.company, supplierId: ids.supplier, quoteReference: `AB-Q-${suffix}`, quoteDate: transition, currencyCode: "PHP", totalAmount: 1 } });
    await prisma.quotationRecommendation.create({ data: { id: recId, tenantId: ids.tenant, companyId: ids.company, quotationRequestId: qrId, selectedSupplierQuotationId: quoteId, preparedByUserId: ids.preparer, status: "PENDING_APPROVAL", currencyCode: "PHP", selectedEvaluatedTotal: 1, lowestEvaluatedTotal: 1, quoteCount: 1, isLowestEvaluatedCost: true, selectionReason: "Breadth", singleSourceJustification: "Only one qualified quotation was available for this test fixture.", evaluationSnapshot: {}, submittedAt: transition } });
    await prisma.purchaseOrder.create({ data: { id: poId, tenantId: ids.tenant, companyId: ids.company, publicReference: `AB-PO-${suffix}`, purchaseRequestId: prId, quotationRequestId: qrId, quotationRecommendationId: recId, selectedSupplierQuotationId: quoteId, supplierId: ids.supplier, deliveryLocationId: ids.location, currencyCode: "PHP", totalAmount: 1, expectedDeliveryDate: due, status: "PENDING_APPROVAL", sourceSnapshot: {}, createdByUserId: ids.preparer } });
    const closureId = id(), amendmentId = id();
    await prisma.purchaseOrderBalanceClosure.create({ data: { id: closureId, tenantId: ids.tenant, companyId: ids.company, purchaseOrderId: poId, requestedByUserId: ids.requester, status: "PENDING_APPROVAL", reason: "Breadth", supplierNoticeUnavailableReason: "Disposable routing fixture", lineSnapshot: [], totalClosedQuantity: 1, requestedAt: transition } });
    await prisma.purchaseOrderAmendment.create({ data: { id: amendmentId, tenantId: ids.tenant, companyId: ids.company, purchaseOrderId: poId, requestedByUserId: ids.requester, status: "PENDING_APPROVAL", reason: "Breadth", beforeSnapshot: {}, proposedSnapshot: {}, requestedAt: transition } });
    const locTarget = [{ scopeType: "LOCATION" as const, companyId: ids.company, locationId: ids.location }];
    await addApproval("PurchaseRequest", prId, { dueAt: due, targetMatchMode: "ANY", targets: locTarget, prohibited: [{ userId: ids.requester, reasonCode: "REQUESTER" }] });
    await addApproval("QuotationRecommendation", recId, { dueAt: due, targetMatchMode: "ANY", targets: locTarget, prohibited: [{ userId: ids.preparer, reasonCode: "PREPARER" }, { userId: ids.requester, reasonCode: "REQUESTER" }].sort((a,b)=>a.userId.localeCompare(b.userId)) });
    await addApproval("PurchaseOrder", poId, { dueAt: due, targetMatchMode: "ANY", targets: locTarget, prohibited: [{ userId: ids.preparer, reasonCode: "PREPARER" }, { userId: ids.requester, reasonCode: "REQUESTER" }].sort((a,b)=>a.userId.localeCompare(b.userId)) });
    for (const [type, sourceId] of [["PurchaseOrderBalanceClosure", closureId], ["PurchaseOrderAmendment", amendmentId]] as const) await addApproval(type, sourceId, { dueAt: due, targetMatchMode: "ANY", targets: locTarget, prohibited: [{ userId: ids.requester, reasonCode: "REQUESTER" }, { userId: ids.preparer, reasonCode: "PREPARER" }].sort((a,b)=>a.userId.localeCompare(b.userId)) });

    const wastageId=id(), adjustmentId=id();
    await prisma.wastageReport.create({ data: { id:wastageId, tenantId:ids.tenant, companyId:ids.company, inventoryLocationId:ids.inventoryLocation, publicReference:`AB-W-${suffix}`, reportedByUserId:ids.requester, status:"PENDING_APPROVAL", wastageType:"OTHER", reasonCode:"TEST", submittedAt:transition } });
    await prisma.stockAdjustment.create({ data: { id:adjustmentId, tenantId:ids.tenant, companyId:ids.company, inventoryLocationId:ids.inventoryLocation, publicReference:`AB-SA-${suffix}`, requestedByUserId:ids.requester, status:"PENDING_APPROVAL", adjustmentType:"INCREASE", reasonCode:"TEST", reasonDescription:"Breadth", submittedAt:transition } });
    await addApproval("WastageReport", wastageId, { dueAt:null,targetMatchMode:"ANY",targets:locTarget,prohibited:[{userId:ids.requester,reasonCode:"REPORTER"}] });
    await addApproval("StockAdjustment", adjustmentId, { dueAt:null,targetMatchMode:"ANY",targets:locTarget,prohibited:[{userId:ids.requester,reasonCode:"REQUESTER"}] });

    const closeId=id();
    await prisma.financeCloseRun.create({ data:{ id:closeId,tenantId:ids.tenant,companyId:ids.company,accountingPeriodId:ids.period,publicReference:`AB-CLOSE-${suffix}`,status:"CLOSED",initiatedByUserId:ids.preparer,configSnapshot:{pendingSensitiveApproval:{approvalAction:"LOCK_PERIOD",requestedByUserId:ids.requester,reason:"Breadth period lock"}} } });
    await addApproval("FinanceCloseRun",closeId,{dueAt:null,targetMatchMode:"ANY",targets:[{scopeType:"COMPANY",companyId:ids.company,locationId:null}],prohibited:[{userId:ids.preparer,reasonCode:"INITIATOR"},{userId:ids.requester,reasonCode:"REQUESTER"}].sort((a,b)=>a.userId.localeCompare(b.userId))});
    await prisma.budget.create({data:{id:ids.budget,tenantId:ids.tenant,companyId:ids.company,publicReference:`AB-B-${suffix}`,fiscalYearId:ids.fiscalYear,name:"Breadth Budget",locationId:ids.location,createdByUserId:ids.preparer,lines:{create:{tenantId:ids.tenant,companyId:ids.company,lineNumber:1,code:"L1",name:"Line",locationId:ids.secondLocation,periodStart:new Date("2026-01-01Z"),periodEnd:new Date("2026-12-31Z")}}}});
    const revisionId=id(); await prisma.budgetRevision.create({data:{id:revisionId,budgetId:ids.budget,tenantId:ids.tenant,companyId:ids.company,revisionNumber:1,status:"SUBMITTED",reason:"Breadth",requestedByUserId:ids.requester,requestedAt:transition,effectiveFrom:due,originalSnapshot:{},proposedSnapshot:{}}});
    await addApproval("BudgetRevision",revisionId,{dueAt:due,targetMatchMode:"ALL",targets:[ids.location,ids.secondLocation].sort().map(locationId=>({scopeType:"LOCATION",companyId:ids.company,locationId})),prohibited:[{userId:ids.requester,reasonCode:"REQUESTER"}]});

    const expenseId=id(), cashId=id();
    await prisma.expenseRequest.create({data:{id:expenseId,tenantId:ids.tenant,companyId:ids.company,publicReference:`AB-E-${suffix}`,status:"AWAITING_APPROVAL",requestDate:transition,requiredByDate:due,title:"Breadth",requestReason:"Breadth",categoryCode:"TEST",locationId:ids.location,requestedByUserId:ids.requester,submittedAt:transition}});
    await prisma.cashAdvanceRequest.create({data:{id:cashId,tenantId:ids.tenant,companyId:ids.company,publicReference:`AB-CA-${suffix}`,requestedAmountPhp:1,status:"AWAITING_APPROVAL",requestDate:transition,dueDate:due,title:"Breadth",purpose:"Breadth",categoryCode:"TEST",locationId:ids.location,beneficiaryUserId:ids.preparer,requestedByUserId:ids.requester,submittedAt:transition}});
    await addApproval("ExpenseRequest",expenseId,{dueAt:due,targetMatchMode:"ANY",targets:locTarget,prohibited:[{userId:ids.requester,reasonCode:"REQUESTER"}]});
    await addApproval("CashAdvanceRequest",cashId,{dueAt:due,targetMatchMode:"ANY",targets:locTarget,prohibited:[{userId:ids.preparer,reasonCode:"BENEFICIARY"},{userId:ids.requester,reasonCode:"REQUESTER"}].sort((a,b)=>a.userId.localeCompare(b.userId))});
    await prisma.pettyCashFund.create({data:{id:ids.fund,tenantId:ids.tenant,companyId:ids.company,publicReference:`AB-F-${suffix}`,code:`ABF-${suffix}`,name:"Breadth Fund",locationId:ids.location,custodianUserId:ids.preparer,createdByUserId:ids.preparer}});
    const pettyId=id(); await prisma.pettyCashRequest.create({data:{id:pettyId,tenantId:ids.tenant,companyId:ids.company,pettyCashFundId:ids.fund,publicReference:`AB-PC-${suffix}`,requestType:"DISBURSEMENT",status:"AWAITING_APPROVAL",requestedAmountPhp:1,purpose:"Breadth",justification:"Breadth",dueBy:due,requestedByUserId:ids.requester,submittedAt:transition}});
    await addApproval("PettyCashRequest",pettyId,{dueAt:due,targetMatchMode:"ANY",targets:locTarget,prohibited:[{userId:ids.requester,reasonCode:"REQUESTER"}]});
    const paymentId=id(), releaseId=id();
    await prisma.paymentRequest.create({data:{id:paymentId,tenantId:ids.tenant,companyId:ids.company,locationId:ids.location,supplierId:ids.supplier,publicReference:`AB-PAY-${suffix}`,totalRequestedAmount:1,status:"AWAITING_APPROVAL",requestedByUserId:ids.requester,approvedByUserId:ids.priorApprover,submittedAt:transition,requestReason:"Breadth"}});
    await prisma.paymentRelease.create({data:{id:releaseId,tenantId:ids.tenant,companyId:ids.company,locationId:ids.location,supplierId:ids.supplier,paymentRequestId:paymentId,bankAccountId:ids.bankAccount,publicReference:`AB-REL-${suffix}`,status:"DRAFT",totalRequestedAmount:1,releaseAmount:1,sourceEventKey:`ab-rel-${suffix}`,reason:"Breadth",scheduledAt:due,createdByUserId:ids.preparer}});
    await addApproval("PaymentRequest",paymentId,{dueAt:null,targetMatchMode:"ANY",targets:locTarget,prohibited:[{userId:ids.requester,reasonCode:"REQUESTER"}]});
    await addApproval("PaymentRelease",releaseId,{dueAt:due,targetMatchMode:"ANY",targets:locTarget,prohibited:[{userId:ids.priorApprover,reasonCode:"PRIOR_APPROVER"},{userId:ids.requester,reasonCode:"REQUESTER"},{userId:ids.preparer,reasonCode:"PREPARER"}].sort((a,b)=>a.userId.localeCompare(b.userId))});

    await prisma.employee.create({data:{id:ids.employee,tenantId:ids.tenant,companyId:ids.company,employeeCode:`AB-EMP-${suffix}`,legalName:"Breadth Employee",hireDate:transition,homeLocationId:ids.location,createdByUserId:ids.preparer}});
    const leaveId=id(), overtimeId=id(), scheduleId=id(), attendanceId=id();
    await prisma.employeeLeaveRequest.create({data:{id:leaveId,tenantId:ids.tenant,companyId:ids.company,employeeId:ids.employee,locationId:ids.location,leaveType:"VACATION",status:"UNDER_REVIEW",requestedByUserId:ids.requester,reason:"Breadth",startDate:due,endDate:due,requestedMinutes:480,sourceEventKey:`ab-leave-${suffix}`,submittedAt:transition,createdByUserId:ids.requester}});
    await prisma.employeeOvertimeRecord.create({data:{id:overtimeId,tenantId:ids.tenant,companyId:ids.company,employeeId:ids.employee,locationId:ids.location,overtimeType:"REGULAR",status:"SUBMITTED",workedStartAt:due,workedEndAt:new Date(due.getTime()+3600000),requestedMinutes:60,reason:"Breadth",requestedByUserId:ids.requester,sourceEventKey:`ab-ot-${suffix}`,createdByUserId:ids.requester}});
    await prisma.workforceSchedule.create({data:{id:scheduleId,tenantId:ids.tenant,companyId:ids.company,locationId:ids.location,publicReference:`AB-WS-${suffix}`,scheduleDate:due,shiftType:"OPENING",status:"UNDER_REVIEW",sourceEventKey:`ab-ws-${suffix}`,createdByUserId:ids.preparer,submittedByUserId:ids.requester,submittedAt:transition}});
    await prisma.attendanceImportBatch.create({data:{id:attendanceId,tenantId:ids.tenant,companyId:ids.company,locationId:ids.location,publicReference:`AB-AT-${suffix}`,businessDate:transition,sourceType:"TEST",sourceReference:`AB-${suffix}`,status:"VALIDATING",idempotencyKey:`ab-at-${suffix}`,createdByUserId:ids.preparer,reviewedByUserId:ids.requester,reviewedAt:transition}});
    await addApproval("EmployeeLeaveRequest",leaveId,{dueAt:due,targetMatchMode:"ANY",targets:locTarget,prohibited:[{userId:ids.requester,reasonCode:"REQUESTER"}]});
    await addApproval("EmployeeOvertimeRecord",overtimeId,{dueAt:due,targetMatchMode:"ANY",targets:locTarget,prohibited:[{userId:ids.requester,reasonCode:"REQUESTER"}]});
    await addApproval("WorkforceSchedule",scheduleId,{dueAt:due,targetMatchMode:"ANY",targets:locTarget,prohibited:[{userId:ids.preparer,reasonCode:"CREATOR"},{userId:ids.requester,reasonCode:"SUBMITTER"}].sort((a,b)=>a.userId.localeCompare(b.userId))});
    await addApproval("AttendanceImportBatch",attendanceId,{dueAt:null,targetMatchMode:"ANY",targets:locTarget,prohibited:[{userId:ids.preparer,reasonCode:"CREATOR"},{userId:ids.requester,reasonCode:"REVIEWER"}].sort((a,b)=>a.userId.localeCompare(b.userId))});
  });

  test("covers the closed registry and proves dry-run, exact descriptors, apply, and idempotency", async () => {
    expect(fixtures.map((item)=>item.documentType).sort()).toEqual([...supportedApprovalDocumentTypes].sort());
    expect(new Set(fixtures.map((item)=>item.documentType)).size).toBe(18);
    const dryRun=await runApprovalRoutingBackfill({tenantId:ids.tenant,companyId:ids.company,apply:false,batchSize:100});
    expect(dryRun).toMatchObject({mode:"DRY_RUN",scanned:18,eligible:18,applied:0,alreadyCurrent:0,blockers:[],hasMore:false});
    expect(await prisma.approvalInstanceStepScopeGroup.count({where:{approvalInstanceStep:{approvalInstanceId:{in:instanceIds}}}})).toBe(0);
    const applied=await runApprovalRoutingBackfill({tenantId:ids.tenant,companyId:ids.company,apply:true,batchSize:100});
    expect(applied).toMatchObject({mode:"APPLY",scanned:18,eligible:18,applied:18,alreadyCurrent:0,blockers:[],hasMore:false});
    for (const expected of fixtures) {
      const instance=await prisma.approvalInstance.findFirstOrThrow({where:{tenantId:ids.tenant,documentType:expected.documentType},include:{steps:{include:{requiredPermission:true,scopeGroups:{include:{targets:true}},prohibitedActors:true}}}});
      const step=instance.steps[0]!;
      expect(step.requiredPermission?.code).toBe(expected.permissionCode);
      expect(step.dueAt?.toISOString()??null).toBe(expected.dueAt?.toISOString()??null);
      expect(step.routingSchemaVersion).toBe(1);
      expect(step.scopeGroups).toHaveLength(1);
      expect(step.scopeGroups[0]?.targetMatchMode).toBe(expected.targetMatchMode);
      expect(step.scopeGroups[0]?.targets.map(t=>({scopeType:t.scopeType,companyId:t.companyId,locationId:t.locationId})).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)))).toEqual([...expected.targets].sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))));
      expect(step.prohibitedActors.map(a=>({userId:a.userId,reasonCode:a.reasonCode})).sort((a,b)=>a.userId.localeCompare(b.userId))).toEqual(expected.prohibited);
    }
    const rerun=await runApprovalRoutingBackfill({tenantId:ids.tenant,companyId:ids.company,apply:true,batchSize:100});
    expect(rerun).toMatchObject({mode:"APPLY",scanned:18,eligible:0,applied:0,alreadyCurrent:18,blockers:[],hasMore:false});
    expect(await prisma.auditEvent.count({where:{tenantId:ids.tenant,eventType:"approval.step_routing_backfilled",entityId:{in:instanceIds}}})).toBe(18);
  });

  test("hydrates an authorized detail for every supported document type", async () => {
    const session: SessionContext = {
      user: {
        id: ids.approver,
        email: `approver-${suffix}@test.invalid`,
        displayName: "Breadth Approver",
        role: "Breadth Approver",
      },
      context: {
        tenantId: ids.tenant,
        companyId: ids.company,
        companyName: "Approval Breadth Company",
        brandId: "",
        brandName: "",
        locationId: ids.location,
        locationName: "Breadth Location",
        locationType: "BRANCH",
      },
      authorizedLocations: [],
      permissionCodes: [...new Set(Object.values(expectedPolicies))],
    };
    const detailExpected: Record<
      (typeof supportedApprovalDocumentTypes)[number],
      { publicReference: string; locationName: string; requesterName: string; status: string }
    > = {
      PurchaseRequest: { publicReference: `AB-PR-${suffix}`, locationName: "Breadth Location", requesterName: "Breadth Requester", status: "PENDING_APPROVAL" },
      QuotationRecommendation: { publicReference: `AB-PR-${suffix}`, locationName: "Breadth Location", requesterName: "Breadth Preparer", status: "PENDING_APPROVAL" },
      PurchaseOrder: { publicReference: `AB-PO-${suffix}`, locationName: "Breadth Location", requesterName: "Breadth Preparer", status: "PENDING_APPROVAL" },
      PurchaseOrderBalanceClosure: { publicReference: `AB-PO-${suffix}`, locationName: "Breadth Location", requesterName: "Breadth Requester", status: "PENDING_APPROVAL" },
      PurchaseOrderAmendment: { publicReference: `AB-PO-${suffix}`, locationName: "Breadth Location", requesterName: "Breadth Requester", status: "PENDING_APPROVAL" },
      WastageReport: { publicReference: `AB-W-${suffix}`, locationName: "Breadth Location", requesterName: "Breadth Requester", status: "PENDING_APPROVAL" },
      StockAdjustment: { publicReference: `AB-SA-${suffix}`, locationName: "Breadth Location", requesterName: "Breadth Requester", status: "PENDING_APPROVAL" },
      FinanceCloseRun: { publicReference: `AB-CLOSE-${suffix}`, locationName: "Company period close", requesterName: "Breadth Preparer", status: "LOCK_PERIOD_PENDING" },
      BudgetRevision: { publicReference: `AB-B-${suffix} R1`, locationName: "Breadth Location", requesterName: "Breadth Requester", status: "SUBMITTED" },
      ExpenseRequest: { publicReference: `AB-E-${suffix}`, locationName: "Breadth Location", requesterName: "Breadth Requester", status: "AWAITING_APPROVAL" },
      CashAdvanceRequest: { publicReference: `AB-CA-${suffix}`, locationName: "Breadth Location", requesterName: "Breadth Requester", status: "AWAITING_APPROVAL" },
      PettyCashRequest: { publicReference: `AB-PC-${suffix}`, locationName: "Breadth Location", requesterName: "Breadth Requester", status: "AWAITING_APPROVAL" },
      PaymentRequest: { publicReference: `AB-PAY-${suffix}`, locationName: "Breadth Location", requesterName: "Breadth Requester", status: "AWAITING_APPROVAL" },
      PaymentRelease: { publicReference: `AB-REL-${suffix}`, locationName: "Breadth Location", requesterName: "Payment release preparer", status: "DRAFT" },
      EmployeeLeaveRequest: { publicReference: `LEAVE-${suffix.toUpperCase()}`, locationName: "Breadth Location", requesterName: "Breadth Requester", status: "UNDER_REVIEW" },
      EmployeeOvertimeRecord: { publicReference: `OT-${suffix.toUpperCase()}`, locationName: "Breadth Location", requesterName: "Breadth Requester", status: "SUBMITTED" },
      WorkforceSchedule: { publicReference: `AB-WS-${suffix}`, locationName: "Breadth Location", requesterName: "Breadth Requester", status: "UNDER_REVIEW" },
      AttendanceImportBatch: { publicReference: `AB-AT-${suffix}`, locationName: "Breadth Location", requesterName: "Breadth Requester", status: "VALIDATING" },
    };

    expect(Object.keys(detailExpected).sort()).toEqual([...supportedApprovalDocumentTypes].sort());
    for (const fixture of fixtures) {
      const detail = await getApprovalDetail(session, fixture.approvalInstanceId);
      expect(detail, `${fixture.documentType} detail`).not.toBeNull();
      expect(detail).toMatchObject({
        approvalKind: fixture.documentType,
        documentType: fixture.documentType,
        ...detailExpected[fixture.documentType],
      });
    }
  });
});
