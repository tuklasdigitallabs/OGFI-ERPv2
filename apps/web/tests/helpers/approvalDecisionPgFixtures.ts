import { randomUUID } from "node:crypto";
import { prisma } from "@ogfi/database";
import { permissions } from "../../src/server/services/authorization";
import type { SessionContext } from "../../src/server/services/context";
import { configureApprovalStepRouting } from "../../src/server/services/approvalRouting";
import {
  approvalRoutingPolicies,
  type SupportedApprovalDocumentType,
} from "../../src/server/services/approvalRoutingRegistry";

export type ApprovalDecisionPgFixture = {
  tenantId: string;
  companyId: string;
  brandId: string;
  locationId: string;
  requesterUserId: string;
  approverUserIds: [string, string];
  approvalInstanceId: string;
  sourceId: string;
  relatedEntityIds: string[];
  stepIds: [string, string | null];
  sessionFor(step: 1 | 2): SessionContext;
};

export type ApprovalDecisionPgSourceContext = {
  tenantId: string;
  companyId: string;
  brandId: string;
  locationId: string;
  requesterUserId: string;
  approverUserIds: [string, string];
  suffix: string;
};

export type ApprovalDecisionPgSource = {
  id: string;
  relatedEntityIds?: string[];
};

const permissionByFamily = {
  PurchaseRequest: permissions.purchaseRequestApprove,
  QuotationRecommendation: permissions.quoteApprove,
  PurchaseOrder: permissions.purchaseOrderApprove,
  PurchaseOrderBalanceClosure: permissions.purchaseOrderApprove,
  PurchaseOrderAmendment: permissions.purchaseOrderApprove,
  WastageReport: permissions.wastageApprove,
  StockAdjustment: permissions.stockAdjustmentApprove,
  FinanceCloseRun: permissions.financePeriodCloseManage,
  BudgetRevision: permissions.financeBudgetApprove,
  ExpenseRequest: permissions.financeExpenseRequestApprove,
  CashAdvanceRequest: permissions.financeCashAdvanceApprove,
  PettyCashRequest: permissions.financePettyCashApprove,
  PaymentRequest: permissions.financePaymentRequestApprove,
  PaymentRelease: permissions.financePaymentRelease,
  EmployeeLeaveRequest: permissions.workforceLeaveApprove,
  EmployeeOvertimeRecord: permissions.workforceOvertimeApprove,
  WorkforceSchedule: permissions.workforceScheduleManage,
  AttendanceImportBatch: permissions.workforceAttendanceImportManage,
} as const satisfies Record<SupportedApprovalDocumentType, string>;

/**
 * Builds the authority/routing half of an action-ready canonical decision.
 * Family-specific source rows stay in the parity test so their business
 * preconditions are visible beside the expected outcome.
 */
export async function createApprovalDecisionPgFixture(input: {
  family: SupportedApprovalDocumentType;
  steps?: 1 | 2;
  createSource(
    context: ApprovalDecisionPgSourceContext,
  ): Promise<string | ApprovalDecisionPgSource>;
  scopeTargets?: Array<{
    scopeType: "COMPANY" | "BRAND" | "LOCATION";
    companyId?: string;
    brandId?: string;
    locationId?: string;
  }>;
  extraPermissionCodes?: string[];
  firstStepStatus?: "PENDING" | "WAITING";
  directAssignedSteps?: boolean;
  directAssignedStepOrders?: Array<1 | 2>;
}): Promise<ApprovalDecisionPgFixture> {
  const ids = {
    tenantId: randomUUID(),
    companyId: randomUUID(),
    brandId: randomUUID(),
    locationId: randomUUID(),
    requesterUserId: randomUUID(),
    approverOneId: randomUUID(),
    approverTwoId: randomUUID(),
    approverOneLocationScopeId: randomUUID(),
    approverTwoLocationScopeId: randomUUID(),
    approverOneCompanyScopeId: randomUUID(),
    approverTwoCompanyScopeId: randomUUID(),
    roleId: randomUUID(),
    ruleId: randomUUID(),
    approvalId: randomUUID(),
    stepOneId: randomUUID(),
    stepTwoId: input.steps === 2 ? randomUUID() : null,
  };
  const suffix = ids.tenantId.slice(0, 8);
  const permissionCode = permissionByFamily[input.family];
  const permissionRecords = await prisma.permission.findMany({
    where: { code: { in: [permissionCode, ...(input.extraPermissionCodes ?? [])] } },
    select: { id: true, code: true },
  });
  if (permissionRecords.length !== 1 + (input.extraPermissionCodes?.length ?? 0)) {
    throw new Error("APPROVAL_PARITY_PERMISSION_FIXTURE_INCOMPLETE");
  }

  await prisma.tenant.create({
    data: {
      id: ids.tenantId,
      name: `Canonical decision ${suffix}`,
      loginCode: `decision-${suffix}`,
    },
  });
  await prisma.company.create({
    data: {
      id: ids.companyId,
      tenantId: ids.tenantId,
      code: `DEC-${suffix}`,
      legalName: `Canonical decision ${suffix}`,
      currencyCode: "PHP",
    },
  });
  await prisma.brand.create({
    data: {
      id: ids.brandId,
      tenantId: ids.tenantId,
      companyId: ids.companyId,
      code: `DEC-${suffix}`,
      name: `Canonical decision ${suffix}`,
    },
  });
  await prisma.location.create({
    data: {
      id: ids.locationId,
      tenantId: ids.tenantId,
      companyId: ids.companyId,
      brandId: ids.brandId,
      locationType: "BRANCH",
      code: `DEC-${suffix}`,
      name: `Canonical decision ${suffix}`,
    },
  });
  await prisma.user.createMany({
    data: [
      [ids.requesterUserId, "requester"],
      [ids.approverOneId, "approver-one"],
      [ids.approverTwoId, "approver-two"],
    ].map(([id, label]) => ({
      id: id!,
      tenantId: ids.tenantId,
      email: `${label}-${suffix}@test.invalid`,
      displayName: label!,
    })),
  });
  await prisma.role.create({
    data: {
      id: ids.roleId,
      tenantId: ids.tenantId,
      code: `DECISION_${suffix}`,
      name: `Canonical decision approver ${suffix}`,
      permissions: { create: permissionRecords.map(({ id }) => ({ permissionId: id })) },
    },
  });
  await prisma.userRoleAssignment.createMany({
    data: [ids.approverOneId, ids.approverTwoId].map((userId) => ({
      userId,
      roleId: ids.roleId,
      startsAt: new Date(Date.now() - 60_000),
    })),
  });
  await prisma.userScopeAssignment.createMany({
    data: [
      { id: ids.approverOneLocationScopeId, userId: ids.approverOneId, scopeType: "LOCATION", scopeId: ids.locationId, accessLevel: "APPROVE", startsAt: new Date(Date.now() - 60_000) },
      { id: ids.approverTwoLocationScopeId, userId: ids.approverTwoId, scopeType: "LOCATION", scopeId: ids.locationId, accessLevel: "APPROVE", startsAt: new Date(Date.now() - 60_000) },
      { id: ids.approverOneCompanyScopeId, userId: ids.approverOneId, scopeType: "COMPANY", scopeId: ids.companyId, accessLevel: "APPROVE", startsAt: new Date(Date.now() - 60_000) },
      { id: ids.approverTwoCompanyScopeId, userId: ids.approverTwoId, scopeType: "COMPANY", scopeId: ids.companyId, accessLevel: "APPROVE", startsAt: new Date(Date.now() - 60_000) },
    ],
  });

  const sourceContext = {
    tenantId: ids.tenantId,
    companyId: ids.companyId,
    brandId: ids.brandId,
    locationId: ids.locationId,
    requesterUserId: ids.requesterUserId,
    approverUserIds: [ids.approverOneId, ids.approverTwoId],
    suffix,
  };
  const createdSource = await input.createSource(sourceContext);
  const sourceId = typeof createdSource === "string" ? createdSource : createdSource.id;
  const relatedEntityIds = typeof createdSource === "string"
    ? []
    : (createdSource.relatedEntityIds ?? []);
  const scopeTargets = input.scopeTargets ?? (
    input.family === "FinanceCloseRun"
      ? [{ scopeType: "COMPANY" as const, companyId: ids.companyId }]
      : [{
          scopeType: "LOCATION" as const,
          companyId: ids.companyId,
          locationId: ids.locationId,
        }]
  );
  await prisma.approvalRule.create({
    data: {
      id: ids.ruleId,
      tenantId: ids.tenantId,
      companyId: ids.companyId,
      transactionType: `CANONICAL_${input.family}_${suffix}`,
      priority: 1,
    },
  });
  await prisma.approvalInstance.create({
    data: {
      id: ids.approvalId,
      tenantId: ids.tenantId,
      companyId: ids.companyId,
      documentType: input.family,
      documentId: sourceId,
      approvalRuleId: ids.ruleId,
      status: "PENDING",
      currentStepOrder: 1,
      steps: {
        create: [
          {
            id: ids.stepOneId,
            stepOrder: 1,
            ...(input.directAssignedSteps || input.directAssignedStepOrders?.includes(1)
              ? { assignedUserId: ids.approverOneId }
              : { assignedRoleId: ids.roleId }),
            status: input.firstStepStatus ?? "PENDING",
          },
          ...(ids.stepTwoId
            ? [{
                id: ids.stepTwoId,
                stepOrder: 2,
                ...(input.directAssignedSteps || input.directAssignedStepOrders?.includes(2)
                  ? { assignedUserId: ids.approverTwoId }
                  : { assignedRoleId: ids.roleId }),
                status: "WAITING" as const,
              }]
            : []),
        ],
      },
    },
  });

  const dueAt = new Date(Date.now() + 24 * 60 * 60_000);
  for (const [index, stepId] of [ids.stepOneId, ids.stepTwoId].entries()) {
    if (!stepId) continue;
    await prisma.$transaction((tx) =>
      configureApprovalStepRouting(tx, {
        approvalInstanceStepId: stepId,
        tenantId: ids.tenantId,
        companyId: ids.companyId,
        routingPolicy: approvalRoutingPolicies[input.family],
        requiredPermissionCode: permissionCode,
        activatedAt: index === 0 && input.firstStepStatus !== "WAITING" ? new Date() : null,
        dueAt: input.firstStepStatus === "WAITING" ? null : dueAt,
        scopeGroups: [{
          groupOrder: 1,
          targetMatchMode: "ANY",
          targets: scopeTargets,
        }],
        prohibitedActors: [
          { userId: ids.requesterUserId, reasonCode: "REQUESTER" },
          ...(index === 1
            ? [{ userId: ids.approverOneId, reasonCode: "PRIOR_APPROVER" }]
            : []),
        ],
        ...(index === 0 && input.firstStepStatus !== "WAITING"
          ? {
              activationAudit: {
                actorUserId: null,
                source: "approval-decision-parity-fixture",
              },
            }
          : {}),
      }),
    );
  }

  const sessionFor = (step: 1 | 2): SessionContext => {
    const userId = step === 1 ? ids.approverOneId : ids.approverTwoId;
    return {
      user: {
        id: userId,
        email: `${step === 1 ? "approver-one" : "approver-two"}-${suffix}@test.invalid`,
        displayName: `Approver ${step}`,
        role: "Approver",
      },
      context: {
        tenantId: ids.tenantId,
        companyId: ids.companyId,
        companyName: `Canonical decision ${suffix}`,
        brandId: ids.brandId,
        brandName: `Canonical decision ${suffix}`,
        locationId: ids.locationId,
        locationName: `Canonical decision ${suffix}`,
        locationType: "BRANCH",
      },
      authorizedLocations: [{
        tenantId: ids.tenantId,
        companyId: ids.companyId,
        companyName: `Canonical decision ${suffix}`,
        brandId: ids.brandId,
        brandName: `Canonical decision ${suffix}`,
        locationId: ids.locationId,
        locationName: `Canonical decision ${suffix}`,
        locationType: "BRANCH",
        scopeAssignmentId: step === 1
          ? ids.approverOneLocationScopeId
          : ids.approverTwoLocationScopeId,
        accessLevel: "APPROVE",
      }],
      permissionCodes: [permissionCode, ...(input.extraPermissionCodes ?? [])],
    };
  };

  return {
    tenantId: ids.tenantId,
    companyId: ids.companyId,
    brandId: ids.brandId,
    locationId: ids.locationId,
    requesterUserId: ids.requesterUserId,
    approverUserIds: [ids.approverOneId, ids.approverTwoId],
    approvalInstanceId: ids.approvalId,
    sourceId,
    relatedEntityIds,
    stepIds: [ids.stepOneId, ids.stepTwoId],
    sessionFor,
  };
}

export async function approvalDecisionPgSnapshot(
  fixture: ApprovalDecisionPgFixture,
) {
  const [instance, steps, audits, notifications] = await Promise.all([
    prisma.approvalInstance.findUniqueOrThrow({
      where: { id: fixture.approvalInstanceId },
      select: { status: true, currentStepOrder: true },
    }),
    prisma.approvalInstanceStep.findMany({
      where: { approvalInstanceId: fixture.approvalInstanceId },
      orderBy: { stepOrder: "asc" },
      select: {
        stepOrder: true,
        status: true,
        actedAt: true,
        actedByUserId: true,
      },
    }),
    prisma.auditEvent.findMany({
      where: {
        tenantId: fixture.tenantId,
        OR: [
          { entityId: { in: [fixture.sourceId, ...fixture.relatedEntityIds] } },
          { entityId: fixture.approvalInstanceId },
        ],
      },
      orderBy: { occurredAt: "asc" },
      select: { eventType: true, entityType: true, entityId: true },
    }),
    prisma.notification.findMany({
      where: {
        tenantId: fixture.tenantId,
        OR: [
          { entityId: { in: [fixture.sourceId, ...fixture.relatedEntityIds] } },
          { entityId: fixture.approvalInstanceId },
        ],
      },
      orderBy: { generatedAt: "asc" },
      select: {
        notificationType: true,
        entityType: true,
        entityId: true,
        recipientUserId: true,
        sourceEventKey: true,
        priority: true,
        deepLink: true,
      },
    }),
  ]);
  return { instance, steps, audits, notifications };
}

export type SharedProcurementInventoryFamily =
  | "QuotationRecommendation"
  | "PurchaseOrder"
  | "PurchaseOrderBalanceClosure"
  | "PurchaseOrderAmendment"
  | "WastageReport"
  | "StockAdjustment";

export type SpecializedParityFamily =
  | "FinanceCloseRun"
  | "BudgetRevision"
  | "ExpenseRequest"
  | "CashAdvanceRequest"
  | "PaymentRelease"
  | "EmployeeLeaveRequest"
  | "EmployeeOvertimeRecord"
  | "WorkforceSchedule"
  | "AttendanceImportBatch";

export async function createSpecializedParitySource(
  family: SpecializedParityFamily,
  context: ApprovalDecisionPgSourceContext,
): Promise<ApprovalDecisionPgSource> {
  if (family === "FinanceCloseRun" || family === "BudgetRevision") {
    const fiscalYear = await prisma.fiscalYear.create({
      data: {
        tenantId: context.tenantId,
        companyId: context.companyId,
        code: `FY-${context.suffix}`,
        name: "Canonical parity fiscal year",
        startDate: new Date("2026-01-01T00:00:00.000Z"),
        endDate: new Date("2026-12-31T00:00:00.000Z"),
        status: "OPEN",
        createdByUserId: context.requesterUserId,
      },
      select: { id: true },
    });
    if (family === "FinanceCloseRun") {
      const period = await prisma.accountingPeriod.create({
        data: {
          tenantId: context.tenantId,
          companyId: context.companyId,
          fiscalYearId: fiscalYear.id,
          periodNumber: 1,
          code: `P-${context.suffix}`,
          name: "Canonical parity period",
          startDate: new Date("2026-01-01T00:00:00.000Z"),
          endDate: new Date("2026-01-31T00:00:00.000Z"),
          status: "SOFT_CLOSED",
          createdByUserId: context.requesterUserId,
        },
        select: { id: true },
      });
      return prisma.financeCloseRun.create({
        data: {
          tenantId: context.tenantId,
          companyId: context.companyId,
          accountingPeriodId: period.id,
          publicReference: `FCR-PARITY-${context.suffix}`,
          runType: "MONTH_END",
          status: "CLOSED",
          initiatedByUserId: context.requesterUserId,
          closedAt: new Date(),
          reason: "Canonical parity reopen",
          evidenceReference: "fixture://finance-close/evidence",
          configSnapshot: {
            pendingSensitiveApproval: {
              approvalAction: "REOPEN_PERIOD",
              reason: "Canonical parity reopen",
              evidenceReference: "fixture://finance-close/evidence",
              requestedByUserId: context.requesterUserId,
              requestedAt: new Date().toISOString(),
            },
          },
        },
        select: { id: true },
      });
    }
    const budget = await prisma.budget.create({
      data: {
        tenantId: context.tenantId,
        companyId: context.companyId,
        publicReference: `BUD-PARITY-${context.suffix}`,
        fiscalYearId: fiscalYear.id,
        name: "Canonical parity budget",
        status: "ACTIVE",
        locationId: context.locationId,
        ownerUserId: context.requesterUserId,
        createdByUserId: context.requesterUserId,
        approvedByUserId: context.approverUserIds[0],
        approvedAt: new Date(),
        activatedAt: new Date(),
      },
      select: { id: true },
    });
    const revision = await prisma.budgetRevision.create({
      data: {
        budgetId: budget.id,
        tenantId: context.tenantId,
        companyId: context.companyId,
        revisionNumber: 1,
        status: "SUBMITTED",
        reason: "Canonical parity revision",
        requestedByUserId: context.requesterUserId,
        effectiveFrom: new Date(Date.now() + 86_400_000),
        originalSnapshot: {},
        proposedSnapshot: {},
      },
      select: { id: true },
    });
    return { id: revision.id, relatedEntityIds: [budget.id] };
  }

  if (family === "PaymentRelease") {
    const supplier = await prisma.supplier.create({
      data: { tenantId: context.tenantId, companyId: context.companyId, supplierCode: `PAY-${context.suffix}`, legalName: "Parity payee" },
      select: { id: true },
    });
    const accountClass = await prisma.financeAccountClass.create({
      data: { tenantId: context.tenantId, companyId: context.companyId, code: `AC-${context.suffix}`, name: "Parity assets", normalBalance: "DEBIT", statementSection: "BALANCE_SHEET" },
      select: { id: true },
    });
    const ledgerAccount = await prisma.chartOfAccount.create({
      data: { tenantId: context.tenantId, companyId: context.companyId, accountClassId: accountClass.id, code: `1000-${context.suffix}`, name: "Parity bank", normalBalance: "DEBIT", postingAllowed: true },
      select: { id: true },
    });
    const bankAccount = await prisma.bankAccount.create({
      data: { tenantId: context.tenantId, companyId: context.companyId, locationId: context.locationId, ledgerAccountId: ledgerAccount.id, publicReference: `BANK-${context.suffix}`, bankName: "Parity Bank", maskedAccountNumber: "****0001", accountType: "CHECKING", status: "ACTIVE", createdByUserId: context.requesterUserId },
      select: { id: true },
    });
    const paymentRequest = await prisma.paymentRequest.create({
      data: { tenantId: context.tenantId, companyId: context.companyId, locationId: context.locationId, supplierId: supplier.id, publicReference: `PAYREQ-${context.suffix}`, totalRequestedAmount: 100, status: "APPROVED", requestedByUserId: context.requesterUserId, approvedByUserId: context.requesterUserId, approvedAt: new Date(), requestReason: "Canonical parity" },
      select: { id: true },
    });
    return prisma.paymentRelease.create({
      data: { tenantId: context.tenantId, companyId: context.companyId, locationId: context.locationId, supplierId: supplier.id, paymentRequestId: paymentRequest.id, bankAccountId: bankAccount.id, publicReference: `REL-${context.suffix}`, status: "DRAFT", totalRequestedAmount: 100, releaseAmount: 100, sourceEventKey: `release-parity-${context.suffix}`, reason: "Canonical parity", evidenceReference: "fixture://release/evidence", createdByUserId: context.requesterUserId },
      select: { id: true },
    });
  }
  if (family === "ExpenseRequest") {
    return prisma.expenseRequest.create({
      data: {
        tenantId: context.tenantId,
        companyId: context.companyId,
        publicReference: `ER-PARITY-${context.suffix}`,
        totalRequestedAmount: 0,
        status: "AWAITING_APPROVAL",
        requestDate: new Date(),
        requiredByDate: new Date(Date.now() + 86_400_000),
        title: "Canonical expense parity",
        requestReason: "Canonical parity fixture",
        categoryCode: "TEST",
        brandId: context.brandId,
        locationId: context.locationId,
        requestedByUserId: context.requesterUserId,
        submittedByUserId: context.requesterUserId,
        submittedAt: new Date(),
        evidenceReference: "fixture://expense/evidence",
      },
      select: { id: true },
    });
  }
  if (family === "CashAdvanceRequest") {
    return prisma.cashAdvanceRequest.create({
      data: {
        tenantId: context.tenantId,
        companyId: context.companyId,
        publicReference: `CA-PARITY-${context.suffix}`,
        requestedAmountPhp: 100,
        status: "AWAITING_APPROVAL",
        requestDate: new Date(),
        dueDate: new Date(Date.now() + 86_400_000),
        title: "Canonical cash advance parity",
        purpose: "Canonical parity fixture",
        categoryCode: "TEST",
        brandId: context.brandId,
        locationId: context.locationId,
        requestedByUserId: context.requesterUserId,
        submittedByUserId: context.requesterUserId,
        submittedAt: new Date(),
        evidenceReference: "fixture://cash-advance/evidence",
      },
      select: { id: true },
    });
  }

  const employee = await prisma.employee.create({
    data: {
      tenantId: context.tenantId,
      companyId: context.companyId,
      employeeCode: `EMP-${context.suffix}`,
      legalName: "Canonical parity employee",
      hireDate: new Date("2026-01-01T00:00:00.000Z"),
      homeLocationId: context.locationId,
      createdByUserId: context.requesterUserId,
    },
    select: { id: true },
  });
  if (family === "EmployeeLeaveRequest") {
    return prisma.employeeLeaveRequest.create({
      data: {
        tenantId: context.tenantId,
        companyId: context.companyId,
        employeeId: employee.id,
        locationId: context.locationId,
        leaveType: "VACATION",
        status: "SUBMITTED",
        requestedByUserId: context.requesterUserId,
        reason: "Canonical parity fixture",
        startDate: new Date(Date.now() + 86_400_000),
        endDate: new Date(Date.now() + 86_400_000),
        requestedMinutes: 480,
        submittedAt: new Date(),
        sourceEventKey: `leave-parity-${context.suffix}`,
        createdByUserId: context.requesterUserId,
      },
      select: { id: true },
    });
  }
  if (family === "EmployeeOvertimeRecord") {
    return prisma.employeeOvertimeRecord.create({
      data: {
        tenantId: context.tenantId,
        companyId: context.companyId,
        employeeId: employee.id,
        locationId: context.locationId,
        overtimeType: "REGULAR",
        status: "SUBMITTED",
        workedStartAt: new Date(Date.now() - 7_200_000),
        workedEndAt: new Date(Date.now() - 3_600_000),
        requestedMinutes: 60,
        reason: "Canonical parity fixture",
        requestedByUserId: context.requesterUserId,
        sourceEventKey: `overtime-parity-${context.suffix}`,
        createdByUserId: context.requesterUserId,
      },
      select: { id: true },
    });
  }
  if (family === "WorkforceSchedule") {
    return prisma.workforceSchedule.create({
      data: {
        tenantId: context.tenantId,
        companyId: context.companyId,
        brandId: context.brandId,
        locationId: context.locationId,
        publicReference: `WS-PARITY-${context.suffix}`,
        scheduleDate: new Date(Date.now() + 86_400_000),
        shiftType: "OPENING",
        status: "SUBMITTED",
        plannedHeadcount: 1,
        assignedHeadcount: 1,
        plannedMinutes: 480,
        sourceEventKey: `schedule-parity-${context.suffix}`,
        createdByUserId: context.requesterUserId,
        submittedByUserId: context.requesterUserId,
        submittedAt: new Date(),
      },
      select: { id: true },
    });
  }
  return prisma.attendanceImportBatch.create({
    data: {
      tenantId: context.tenantId,
      companyId: context.companyId,
      brandId: context.brandId,
      locationId: context.locationId,
      publicReference: `AI-PARITY-${context.suffix}`,
      businessDate: new Date(),
      sourceType: "CSV",
      sourceReference: "Canonical parity fixture",
      status: "VALIDATING",
      validationSummary: { requestedFinalStatus: "EXCEPTION_LIST" },
      idempotencyKey: `attendance-parity-${context.suffix}`,
      createdByUserId: context.requesterUserId,
    },
    select: { id: true },
  });
}

export async function createSharedProcurementInventorySource(
  family: SharedProcurementInventoryFamily,
  context: ApprovalDecisionPgSourceContext,
): Promise<ApprovalDecisionPgSource> {
  const inventoryLocation = await prisma.inventoryLocation.create({
    data: {
      tenantId: context.tenantId,
      companyId: context.companyId,
      locationId: context.locationId,
      code: `INV-${context.suffix}`,
      name: `Parity inventory ${context.suffix}`,
    },
    select: { id: true },
  });
  const uom = await prisma.uom.create({
    data: {
      tenantId: context.tenantId,
      companyId: context.companyId,
      uomCode: `EA-${context.suffix}`,
      uomName: "Each",
      uomType: "COUNT",
    },
    select: { id: true },
  });
  const category = await prisma.itemCategory.create({
    data: {
      tenantId: context.tenantId,
      companyId: context.companyId,
      categoryCode: `CAT-${context.suffix}`,
      categoryName: "Parity category",
      inventoryClass: "FOOD",
    },
    select: { id: true },
  });
  const item = await prisma.item.create({
    data: {
      tenantId: context.tenantId,
      companyId: context.companyId,
      itemCode: `ITEM-${context.suffix}`,
      itemName: "Parity item",
      itemCategoryId: category.id,
      itemType: "INVENTORY",
      baseUomId: uom.id,
    },
    select: { id: true },
  });

  if (family === "WastageReport") {
    const report = await prisma.wastageReport.create({
      data: {
        tenantId: context.tenantId,
        companyId: context.companyId,
        inventoryLocationId: inventoryLocation.id,
        publicReference: `WR-PARITY-${context.suffix}`,
        reportedByUserId: context.requesterUserId,
        status: "PENDING_APPROVAL",
        wastageType: "SPOILAGE",
        reasonCode: "TEST",
        submittedAt: new Date(),
        lines: {
          create: {
            tenantId: context.tenantId,
            companyId: context.companyId,
            inventoryLocationId: inventoryLocation.id,
            itemId: item.id,
            uomId: uom.id,
            lineNumber: 1,
            description: "Parity wastage",
            quantity: 1,
            quantityBaseUom: 1,
            reasonCode: "TEST",
          },
        },
      },
      select: { id: true },
    });
    return report;
  }

  if (family === "StockAdjustment") {
    const adjustment = await prisma.stockAdjustment.create({
      data: {
        tenantId: context.tenantId,
        companyId: context.companyId,
        inventoryLocationId: inventoryLocation.id,
        publicReference: `SA-PARITY-${context.suffix}`,
        requestedByUserId: context.requesterUserId,
        status: "PENDING_APPROVAL",
        adjustmentType: "INCREASE",
        reasonCode: "TEST",
        reasonDescription: "Canonical parity fixture",
        submittedAt: new Date(),
        lines: {
          create: {
            tenantId: context.tenantId,
            companyId: context.companyId,
            inventoryLocationId: inventoryLocation.id,
            itemId: item.id,
            uomId: uom.id,
            lineNumber: 1,
            quantityDeltaBaseUom: 1,
            reasonCode: "TEST",
          },
        },
      },
      select: { id: true },
    });
    return adjustment;
  }

  const supplier = await prisma.supplier.create({
    data: {
      tenantId: context.tenantId,
      companyId: context.companyId,
      supplierCode: `SUP-${context.suffix}`,
      legalName: "Parity supplier",
    },
    select: { id: true },
  });
  const request = await prisma.purchaseRequest.create({
    data: {
      tenantId: context.tenantId,
      companyId: context.companyId,
      brandId: context.brandId,
      requestLocationId: context.locationId,
      requesterUserId: context.requesterUserId,
      publicReference: `PR-SHARED-${context.suffix}`,
      requiredDate: new Date(Date.now() + 7 * 24 * 60 * 60_000),
      urgency: "NORMAL",
      justification: "Canonical shared procurement fixture",
      status: "APPROVED",
      lines: {
        create: {
          itemId: item.id,
          uomId: uom.id,
          lineNumber: 1,
          description: "Parity item",
          requestedQty: 10,
          estimatedUnitCost: 1,
          estimatedLineTotal: 10,
          uomCode: "EA",
          purpose: "Canonical parity",
        },
      },
    },
    include: { lines: { select: { id: true } } },
  });
  const quotationRequest = await prisma.quotationRequest.create({
    data: {
      tenantId: context.tenantId,
      companyId: context.companyId,
      publicReference: `QR-PARITY-${context.suffix}`,
      purchaseRequestId: request.id,
      status: "CLOSED",
      requiredDate: new Date(Date.now() + 7 * 24 * 60 * 60_000),
      createdByUserId: context.requesterUserId,
    },
    select: { id: true },
  });
  const quotation = await prisma.supplierQuotation.create({
    data: {
      quotationRequestId: quotationRequest.id,
      tenantId: context.tenantId,
      companyId: context.companyId,
      supplierId: supplier.id,
      quoteReference: `SQ-PARITY-${context.suffix}`,
      quoteDate: new Date(),
      currencyCode: "PHP",
      totalAmount: 10,
    },
    select: { id: true },
  });
  const recommendation = await prisma.quotationRecommendation.create({
    data: {
      tenantId: context.tenantId,
      companyId: context.companyId,
      quotationRequestId: quotationRequest.id,
      selectedSupplierQuotationId: quotation.id,
      preparedByUserId: context.requesterUserId,
      status: family === "QuotationRecommendation" ? "PENDING_APPROVAL" : "APPROVED",
      currencyCode: "PHP",
      selectedEvaluatedTotal: 10,
      lowestEvaluatedTotal: 10,
      quoteCount: 1,
      isLowestEvaluatedCost: true,
      selectionReason: "Canonical parity",
      singleSourceJustification: "Fixture uses one quotation",
      evaluationSnapshot: {},
    },
    select: { id: true },
  });
  if (family === "QuotationRecommendation") {
    return { id: recommendation.id, relatedEntityIds: [request.id] };
  }

  const orderStatus = family === "PurchaseOrder"
    ? "PENDING_APPROVAL"
    : family === "PurchaseOrderBalanceClosure"
      ? "PARTIALLY_RECEIVED"
      : "AMENDMENT_PENDING";
  const order = await prisma.purchaseOrder.create({
    data: {
      tenantId: context.tenantId,
      companyId: context.companyId,
      brandId: context.brandId,
      publicReference: `PO-PARITY-${context.suffix}`,
      purchaseRequestId: request.id,
      quotationRequestId: quotationRequest.id,
      quotationRecommendationId: recommendation.id,
      selectedSupplierQuotationId: quotation.id,
      supplierId: supplier.id,
      deliveryLocationId: context.locationId,
      currencyCode: "PHP",
      subtotalAmount: 10,
      totalAmount: 10,
      expectedDeliveryDate: new Date(Date.now() + 7 * 24 * 60 * 60_000),
      status: orderStatus,
      sourceSnapshot: {},
      createdByUserId: context.requesterUserId,
      lines: {
        create: {
          tenantId: context.tenantId,
          companyId: context.companyId,
          sourcePrLineId: request.lines[0]!.id,
          itemId: item.id,
          uomId: uom.id,
          lineNumber: 1,
          description: "Parity item",
          orderedQty: 10,
          receivedQty: family === "PurchaseOrderBalanceClosure" ? 5 : 0,
          unitPrice: 1,
          lineTotal: 10,
        },
      },
    },
    include: { lines: { select: { id: true } } },
  });
  if (family === "PurchaseOrder") return order;

  if (family === "PurchaseOrderBalanceClosure") {
    const closure = await prisma.purchaseOrderBalanceClosure.create({
      data: {
        tenantId: context.tenantId,
        companyId: context.companyId,
        purchaseOrderId: order.id,
        requestedByUserId: context.requesterUserId,
        status: "PENDING_APPROVAL",
        reason: "Close remaining quantity",
        supplierNoticeUnavailableReason: "Canonical parity fixture",
        lineSnapshot: [{
          purchaseOrderLineId: order.lines[0]!.id,
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
      select: { id: true },
    });
    return { id: closure.id, relatedEntityIds: [order.id] };
  }

  const expectedDeliveryDate = new Date(Date.now() + 14 * 24 * 60 * 60_000)
    .toISOString().slice(0, 10);
  const proposalLines = [{
    purchaseOrderLineId: order.lines[0]!.id,
    orderedQty: 12,
    unitPrice: 1,
    notes: "Approved amendment",
  }];
  const amendment = await prisma.purchaseOrderAmendment.create({
    data: {
      tenantId: context.tenantId,
      companyId: context.companyId,
      purchaseOrderId: order.id,
      requestedByUserId: context.requesterUserId,
      status: "PENDING_APPROVAL",
      reason: "Canonical parity amendment",
      supplierNoticeUnavailableReason: "Canonical parity fixture",
      beforeSnapshot: {},
      proposedSnapshot: { expectedDeliveryDate, lines: proposalLines },
    },
    select: { id: true },
  });
  return { id: amendment.id, relatedEntityIds: [order.id] };
}
