import { prisma } from "@ogfi/database";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import {
  canonicalApprovalDecisionCapabilities,
  parseCanonicalApprovalDecisionCommand,
} from "../src/server/services/approvalDecisionCommands";
import { supportedApprovalDocumentTypes } from "../src/server/services/approvalRoutingRegistry";
import {
  approvalDecisionPgSnapshot,
  createApprovalDecisionPgFixture,
  createSpecializedParitySource,
  createSharedProcurementInventorySource,
  type ApprovalDecisionPgFixture,
  type SharedProcurementInventoryFamily,
  type SpecializedParityFamily,
} from "./helpers/approvalDecisionPgFixtures";

const contextMock = vi.hoisted(() => ({ requireSessionContext: vi.fn() }));
vi.mock("../src/server/services/context", async () => {
  const actual = await vi.importActual<typeof import("../src/server/services/context")>(
    "../src/server/services/context",
  );
  return { ...actual, requireSessionContext: contextMock.requireSessionContext };
});

const runPg = process.env.RUN_APPROVAL_ROUTING_PG_TESTS === "true";
const allDecisions = ["APPROVE", "RETURN", "REJECT"] as const;
const remarks = "Canonical parity decision evidence";

describe("canonical approval decision capability matrix", () => {
  test("declares exactly 18 approve, 14 return, and 18 reject capabilities", () => {
    const supported = supportedApprovalDocumentTypes.flatMap((family) =>
      canonicalApprovalDecisionCapabilities[family].map((decision) => ({
        family,
        decision,
      })),
    );
    expect(supported.filter(({ decision }) => decision === "APPROVE")).toHaveLength(18);
    expect(supported.filter(({ decision }) => decision === "RETURN")).toHaveLength(14);
    expect(supported.filter(({ decision }) => decision === "REJECT")).toHaveLength(18);
  });

  test.each(
    supportedApprovalDocumentTypes.flatMap((family) =>
      allDecisions.map((decision) => [family, decision] as const),
    ),
  )("%s / %s is accepted only when the canonical registry supports it", (family, decision) => {
    const input = {
      family,
      decision,
      approvalInstanceId: "00000000-0000-4000-8000-000000000001",
      ...(decision === "APPROVE" ? {} : { remarks }),
    };
    if (canonicalApprovalDecisionCapabilities[family].includes(decision as never)) {
      expect(parseCanonicalApprovalDecisionCommand(input)).toMatchObject({ family, decision });
    } else {
      expect(() => parseCanonicalApprovalDecisionCommand(input)).toThrow();
    }
  });

  test.each([
    "BudgetRevision",
    "FinanceCloseRun",
    "PaymentRelease",
    "EmployeeOvertimeRecord",
  ] as const)("unsupported %s return fails parsing before session or database access", async (family) => {
    contextMock.requireSessionContext.mockClear();
    const { executeCanonicalApprovalDecision } = await import(
      "../src/server/services/approvals"
    );

    await expect(executeCanonicalApprovalDecision({
      family,
      decision: "RETURN",
      approvalInstanceId: "00000000-0000-4000-8000-000000000001",
      remarks,
    })).rejects.toThrow();
    expect(contextMock.requireSessionContext).not.toHaveBeenCalled();
  });
});

describe.skipIf(!runPg).sequential("canonical approval decision PostgreSQL parity", () => {
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

  async function purchaseRequestFixture(steps: 1 | 2 = 1) {
    return createApprovalDecisionPgFixture({
      family: "PurchaseRequest",
      steps,
      createSource: async (context) => {
        const request = await prisma.purchaseRequest.create({
          data: {
            publicReference: `PR-PARITY-${context.suffix}`,
            tenantId: context.tenantId,
            companyId: context.companyId,
            brandId: context.brandId,
            requestLocationId: context.locationId,
            requesterUserId: context.requesterUserId,
            requiredDate: new Date(Date.now() + 7 * 24 * 60 * 60_000),
            urgency: "NORMAL",
            justification: "Canonical approval parity fixture",
            status: "PENDING_APPROVAL",
            currentApprovalStep: 1,
          },
          select: { id: true },
        });
        return request.id;
      },
    });
  }

  async function paymentRequestFixture() {
    return createApprovalDecisionPgFixture({
      family: "PaymentRequest",
      steps: 1,
      createSource: async (context) => {
        const supplier = await prisma.supplier.create({
          data: {
            tenantId: context.tenantId,
            companyId: context.companyId,
            supplierCode: `PAY-${context.suffix}`,
            legalName: "Legacy payment parity supplier",
          },
          select: { id: true },
        });
        return prisma.paymentRequest.create({
          data: {
            tenantId: context.tenantId,
            companyId: context.companyId,
            locationId: context.locationId,
            supplierId: supplier.id,
            publicReference: `PAYREQ-PARITY-${context.suffix}`,
            totalRequestedAmount: 100,
            status: "AWAITING_APPROVAL",
            requestedByUserId: context.requesterUserId,
            submittedAt: new Date(),
            requestReason: "Flag-off legacy compatibility verification",
            evidenceReference: "fixture://payment/source-evidence",
          },
          select: { id: true },
        });
      },
    });
  }

  const sharedFamilies = [
    "QuotationRecommendation",
    "PurchaseOrder",
    "PurchaseOrderBalanceClosure",
    "PurchaseOrderAmendment",
    "WastageReport",
    "StockAdjustment",
  ] as const satisfies readonly SharedProcurementInventoryFamily[];

  const sharedExpected = {
    QuotationRecommendation: {
      initial: "PENDING_APPROVAL",
      approve: "APPROVED",
      return: "RETURNED",
      reject: "REJECTED",
      approveAudit: "quotation_recommendation.approved",
      returnAudit: "quotation_recommendation.returned",
      rejectAudit: "quotation_recommendation.rejected",
    },
    PurchaseOrder: {
      initial: "PENDING_APPROVAL",
      approve: "APPROVED",
      return: "DRAFT",
      reject: "CANCELLED",
      approveAudit: "purchase_order.approved",
      returnAudit: "purchase_order.returned",
      rejectAudit: "purchase_order.rejected",
    },
    PurchaseOrderBalanceClosure: {
      initial: "PENDING_APPROVAL",
      approve: "APPROVED",
      return: "RETURNED",
      reject: "REJECTED",
      approveAudit: "purchase_order_balance_closure.approved",
      returnAudit: "purchase_order_balance_closure.returned",
      rejectAudit: "purchase_order_balance_closure.rejected",
    },
    PurchaseOrderAmendment: {
      initial: "PENDING_APPROVAL",
      approve: "APPROVED",
      return: "RETURNED",
      reject: "REJECTED",
      approveAudit: "purchase_order.amendment_approved",
      returnAudit: "purchase_order.amendment_returned",
      rejectAudit: "purchase_order.amendment_rejected",
    },
    WastageReport: {
      initial: "PENDING_APPROVAL",
      approve: "APPROVED",
      return: "RETURNED",
      reject: "REJECTED",
      approveAudit: "wastage_report.approved",
      returnAudit: "wastage_report.returned",
      rejectAudit: "wastage_report.rejected",
    },
    StockAdjustment: {
      initial: "PENDING_APPROVAL",
      approve: "APPROVED",
      return: "RETURNED",
      reject: "REJECTED",
      approveAudit: "stock_adjustment.approved",
      returnAudit: "stock_adjustment.returned",
      rejectAudit: "stock_adjustment.rejected",
    },
  } as const;

  async function sharedFixture(
    family: SharedProcurementInventoryFamily,
    steps: 1 | 2 = 2,
  ) {
    return createApprovalDecisionPgFixture({
      family,
      steps,
      createSource: (context) =>
        createSharedProcurementInventorySource(family, context),
    });
  }

  async function readSharedSource(
    family: SharedProcurementInventoryFamily,
    fixture: ApprovalDecisionPgFixture,
  ) {
    if (family === "QuotationRecommendation") {
      const source = await prisma.quotationRecommendation.findUniqueOrThrow({
        where: { id: fixture.sourceId },
        select: { status: true },
      });
      return { status: source.status, relatedStatus: null };
    }
    if (family === "PurchaseOrder") {
      const source = await prisma.purchaseOrder.findUniqueOrThrow({
        where: { id: fixture.sourceId },
        select: { status: true },
      });
      return { status: source.status, relatedStatus: null };
    }
    if (family === "PurchaseOrderBalanceClosure") {
      const source = await prisma.purchaseOrderBalanceClosure.findUniqueOrThrow({
        where: { id: fixture.sourceId },
        select: { status: true, purchaseOrder: { select: { status: true } } },
      });
      return { status: source.status, relatedStatus: source.purchaseOrder.status };
    }
    if (family === "PurchaseOrderAmendment") {
      const source = await prisma.purchaseOrderAmendment.findUniqueOrThrow({
        where: { id: fixture.sourceId },
        select: { status: true, purchaseOrder: { select: { status: true } } },
      });
      return { status: source.status, relatedStatus: source.purchaseOrder.status };
    }
    if (family === "WastageReport") {
      const source = await prisma.wastageReport.findUniqueOrThrow({
        where: { id: fixture.sourceId },
        select: { status: true },
      });
      return { status: source.status, relatedStatus: null };
    }
    const source = await prisma.stockAdjustment.findUniqueOrThrow({
      where: { id: fixture.sourceId },
      select: { status: true },
    });
    return { status: source.status, relatedStatus: null };
  }

  async function executeSharedDecision(
    fixture: ApprovalDecisionPgFixture,
    family: SharedProcurementInventoryFamily,
    decision: "APPROVE" | "RETURN" | "REJECT",
    step: 1 | 2,
  ) {
    contextMock.requireSessionContext.mockResolvedValue(fixture.sessionFor(step));
    const { executeCanonicalApprovalDecision } = await import(
      "../src/server/services/approvals"
    );
    return executeCanonicalApprovalDecision({
      family,
      decision,
      approvalInstanceId: fixture.approvalInstanceId,
      ...(decision === "APPROVE" ? {} : { remarks }),
    });
  }

  test.each(sharedFamilies)(
    "%s two-step approve preserves source until the final coherent outcome",
    async (family) => {
      const fixture = await sharedFixture(family);
      const expected = sharedExpected[family];
      await executeSharedDecision(fixture, family, "APPROVE", 1);

      const [intermediateSource, intermediate] = await Promise.all([
        readSharedSource(family, fixture),
        approvalDecisionPgSnapshot(fixture),
      ]);
      expect(intermediateSource.status).toBe(expected.initial);
      expect(intermediate.instance).toEqual({ status: "PENDING", currentStepOrder: 2 });
      expect(intermediate.steps).toEqual([
        expect.objectContaining({
          stepOrder: 1,
          status: "APPROVED",
          actedByUserId: fixture.approverUserIds[0],
        }),
        expect.objectContaining({
          stepOrder: 2,
          status: "PENDING",
          actedAt: null,
          actedByUserId: null,
        }),
      ]);
      expect(intermediate.notifications.map(({ notificationType }) => notificationType))
        .not.toContain("APPROVAL_OUTCOME_APPROVED");

      await executeSharedDecision(fixture, family, "APPROVE", 2);
      const [finalSource, final] = await Promise.all([
        readSharedSource(family, fixture),
        approvalDecisionPgSnapshot(fixture),
      ]);
      expect(finalSource.status).toBe(expected.approve);
      if (
        family === "PurchaseOrderBalanceClosure" ||
        family === "PurchaseOrderAmendment"
      ) {
        expect(finalSource.relatedStatus).toBe(
          family === "PurchaseOrderBalanceClosure" ? "CLOSED" : "ISSUED",
        );
      }
      expect(final.instance).toEqual({ status: "APPROVED", currentStepOrder: null });
      expect(final.steps).toEqual([
        expect.objectContaining({
          stepOrder: 1,
          status: "APPROVED",
          actedByUserId: fixture.approverUserIds[0],
        }),
        expect.objectContaining({
          stepOrder: 2,
          status: "APPROVED",
          actedByUserId: fixture.approverUserIds[1],
        }),
      ]);
      expect(final.audits.map(({ eventType }) => eventType)).toContain(expected.approveAudit);
      expect(final.notifications.map(({ notificationType }) => notificationType))
        .toContain("APPROVAL_OUTCOME_APPROVED");

      const committed = await approvalDecisionPgSnapshot(fixture);
      await expect(executeSharedDecision(fixture, family, "APPROVE", 2))
        .rejects.toThrow("APPROVAL_NOT_ACTIONABLE");
      expect(await approvalDecisionPgSnapshot(fixture)).toEqual(committed);
    },
  );

  const specializedExpected = {
    FinanceCloseRun: {
      initial: "CLOSED", approve: "VALIDATING", reject: "CLOSED",
      approveAudit: "finance_close.sensitive_action_approved",
      rejectAudit: "finance_close.sensitive_action_rejected",
    },
    BudgetRevision: {
      initial: "UNDER_REVIEW", approve: "APPROVED", reject: "REJECTED",
      approveAudit: "budget.revision_approved",
      rejectAudit: "budget.revision_rejected",
    },
    ExpenseRequest: {
      initial: "AWAITING_APPROVAL", approve: "APPROVED",
      return: "RETURNED_FOR_REVISION", reject: "REJECTED",
      approveAudit: "expense_request.approved",
      returnAudit: "expense_request.returned", rejectAudit: "expense_request.rejected",
    },
    CashAdvanceRequest: {
      initial: "AWAITING_APPROVAL", approve: "APPROVED",
      return: "RETURNED_FOR_REVISION", reject: "REJECTED",
      approveAudit: "cash_advance.approved",
      returnAudit: "cash_advance.returned", rejectAudit: "cash_advance.rejected",
    },
    PaymentRelease: {
      initial: "DRAFT", approve: "READY_FOR_RELEASE", reject: "CANCELLED",
      approveAudit: "payment_release.approved",
      rejectAudit: "payment_release.rejected",
    },
    EmployeeLeaveRequest: {
      initial: "SUBMITTED", intermediate: "UNDER_REVIEW", approve: "APPROVED",
      return: "RETURNED_FOR_REVISION", reject: "REJECTED",
      approveAudit: "workforce.leave_approved",
      returnAudit: "workforce.leave_returned", rejectAudit: "workforce.leave_rejected",
    },
    EmployeeOvertimeRecord: {
      initial: "SUBMITTED", intermediate: "UNDER_REVIEW", approve: "APPROVED", reject: "REJECTED",
      approveAudit: "workforce.overtime_approved",
      rejectAudit: "workforce.overtime_rejected",
    },
    WorkforceSchedule: {
      initial: "SUBMITTED", intermediate: "UNDER_REVIEW", approve: "APPROVED",
      return: "RETURNED_FOR_REVISION", reject: "REJECTED",
      approveAudit: "workforce.schedule_approved",
      returnAudit: "workforce.schedule_returned", rejectAudit: "workforce.schedule_rejected",
    },
    AttendanceImportBatch: {
      initial: "VALIDATING", approve: "EXCEPTION_LIST",
      return: "REVIEW_READY", reject: "REVIEW_READY",
      approveAudit: "workforce.attendance_import_approved",
      returnAudit: "workforce.attendance_import_returned",
      rejectAudit: "workforce.attendance_import_approval_rejected",
    },
  } as const;
  const specializedFamilies = Object.keys(specializedExpected) as SpecializedParityFamily[];

  async function specializedFixture(
    family: SpecializedParityFamily,
    steps: 1 | 2 = 2,
    directAssignedSteps = false,
  ) {
    const fixture = await createApprovalDecisionPgFixture({
      family,
      steps,
      createSource: (context) => createSpecializedParitySource(family, context),
      directAssignedSteps,
      ...(family === "BudgetRevision"
        ? {
            firstStepStatus: "WAITING" as const,
            extraPermissionCodes: ["finance.budget.commitment.review"],
          }
        : {}),
    });
    if (family === "BudgetRevision") {
      const { startBudgetRevisionReview } = await import("../src/server/services/budgetControl");
      await startBudgetRevisionReview(fixture.sessionFor(1), {
        budgetRevisionId: fixture.sourceId,
        reason: "Canonical commitment-fit review",
        evidenceReference: "fixture://budget/review",
      });
      const activation = await approvalDecisionPgSnapshot(fixture);
      expect(await readSpecializedStatus(family, fixture.sourceId)).toBe("UNDER_REVIEW");
      expect(activation.steps.map(({ status }) => status)).toEqual(["PENDING", "WAITING"]);
      expect(activation.audits.map(({ eventType }) => eventType))
        .toContain("budget.revision_review_started");
    }
    return fixture;
  }

  async function readSpecializedStatus(
    family: SpecializedParityFamily,
    sourceId: string,
  ) {
    if (family === "FinanceCloseRun") {
      return (await prisma.financeCloseRun.findUniqueOrThrow({ where: { id: sourceId }, select: { status: true } })).status;
    }
    if (family === "BudgetRevision") {
      return (await prisma.budgetRevision.findUniqueOrThrow({ where: { id: sourceId }, select: { status: true } })).status;
    }
    if (family === "ExpenseRequest") {
      return (await prisma.expenseRequest.findUniqueOrThrow({ where: { id: sourceId }, select: { status: true } })).status;
    }
    if (family === "CashAdvanceRequest") {
      return (await prisma.cashAdvanceRequest.findUniqueOrThrow({ where: { id: sourceId }, select: { status: true } })).status;
    }
    if (family === "PaymentRelease") {
      return (await prisma.paymentRelease.findUniqueOrThrow({ where: { id: sourceId }, select: { status: true } })).status;
    }
    if (family === "EmployeeLeaveRequest") {
      return (await prisma.employeeLeaveRequest.findUniqueOrThrow({ where: { id: sourceId }, select: { status: true } })).status;
    }
    if (family === "EmployeeOvertimeRecord") {
      return (await prisma.employeeOvertimeRecord.findUniqueOrThrow({ where: { id: sourceId }, select: { status: true } })).status;
    }
    if (family === "WorkforceSchedule") {
      return (await prisma.workforceSchedule.findUniqueOrThrow({ where: { id: sourceId }, select: { status: true } })).status;
    }
    return (await prisma.attendanceImportBatch.findUniqueOrThrow({ where: { id: sourceId }, select: { status: true } })).status;
  }

  async function executeSpecializedDecision(
    fixture: ApprovalDecisionPgFixture,
    family: SpecializedParityFamily,
    decision: "APPROVE" | "RETURN" | "REJECT",
    step: 1 | 2,
  ) {
    contextMock.requireSessionContext.mockResolvedValue(fixture.sessionFor(step));
    const { executeCanonicalApprovalDecision } = await import("../src/server/services/approvals");
    const acceptsEvidence = [
      "BudgetRevision",
      "ExpenseRequest",
      "CashAdvanceRequest",
      "EmployeeLeaveRequest",
      "EmployeeOvertimeRecord",
      "WorkforceSchedule",
    ].includes(family);
    return executeCanonicalApprovalDecision({
      family,
      decision,
      approvalInstanceId: fixture.approvalInstanceId,
      ...(decision === "APPROVE" ? {} : { remarks }),
      ...(acceptsEvidence
        ? { evidenceReference: "fixture://decision/evidence" }
        : {}),
    });
  }

  test.each(["ExpenseRequest", "CashAdvanceRequest"] as const)(
    "FIN-AUTHZ-CANONICAL-EVIDENCE-001 %s rejects supplemental decision text when authoritative source evidence is absent",
    async (family) => {
      const fixture = await specializedFixture(family, 1);
      if (family === "ExpenseRequest") {
        await prisma.expenseRequest.update({
          where: { id: fixture.sourceId },
          data: { budgetStatus: "OVER_BUDGET", evidenceReference: null },
        });
      } else {
        await prisma.cashAdvanceRequest.update({
          where: { id: fixture.sourceId },
          data: { budgetStatus: "OVER_BUDGET", evidenceReference: null },
        });
      }
      const before = await approvalDecisionPgSnapshot(fixture);
      const sourceBefore = family === "ExpenseRequest"
        ? await prisma.expenseRequest.findUniqueOrThrow({
            where: { id: fixture.sourceId },
            select: { status: true, version: true, evidenceReference: true },
          })
        : await prisma.cashAdvanceRequest.findUniqueOrThrow({
            where: { id: fixture.sourceId },
            select: { status: true, version: true, evidenceReference: true },
          });

      contextMock.requireSessionContext.mockResolvedValue(fixture.sessionFor(1));
      const { executeCanonicalApprovalDecision } = await import(
        "../src/server/services/approvals"
      );
      await expect(executeCanonicalApprovalDecision({
        family,
        decision: "APPROVE",
        approvalInstanceId: fixture.approvalInstanceId,
        remarks: "Override reviewed",
        evidenceReference: "free text is supplemental only",
      })).rejects.toThrow(
        family === "ExpenseRequest"
          ? "EXPENSE_REQUEST_BUDGET_OVERRIDE_EVIDENCE_REQUIRED"
          : "CASH_ADVANCE_BUDGET_OVERRIDE_EVIDENCE_REQUIRED",
      );

      expect(await approvalDecisionPgSnapshot(fixture)).toEqual(before);
      const sourceAfter = family === "ExpenseRequest"
        ? await prisma.expenseRequest.findUniqueOrThrow({
            where: { id: fixture.sourceId },
            select: { status: true, version: true, evidenceReference: true },
          })
        : await prisma.cashAdvanceRequest.findUniqueOrThrow({
            where: { id: fixture.sourceId },
            select: { status: true, version: true, evidenceReference: true },
          });
      expect(sourceAfter).toEqual(sourceBefore);
    },
  );

  test("FIN-AUTHZ-PAYMENT-FLAG-001 blocks normalized Payment approval but preserves the flag-off legacy decision", async () => {
    const fixture = await paymentRequestFixture();
    contextMock.requireSessionContext.mockResolvedValue(fixture.sessionFor(1));
    const { executeCanonicalApprovalDecision } = await import(
      "../src/server/services/approvals"
    );
    const command = {
      family: "PaymentRequest" as const,
      decision: "APPROVE" as const,
      approvalInstanceId: fixture.approvalInstanceId,
    };
    const before = await approvalDecisionPgSnapshot(fixture);
    const sourceBefore = await prisma.paymentRequest.findUniqueOrThrow({
      where: { id: fixture.sourceId },
      select: { status: true, evidenceReference: true },
    });

    process.env.APPROVAL_ROUTING_V1_ENABLED = "true";
    await expect(executeCanonicalApprovalDecision(command)).rejects.toThrow(
      "PAYMENT_REQUEST_APPROVAL_POLICY_UNCONFIRMED",
    );
    expect(await approvalDecisionPgSnapshot(fixture)).toEqual(before);
    await expect(prisma.paymentRequest.findUniqueOrThrow({
      where: { id: fixture.sourceId },
      select: { status: true, evidenceReference: true },
    })).resolves.toEqual(sourceBefore);

    process.env.APPROVAL_ROUTING_V1_ENABLED = "false";
    try {
      await expect(executeCanonicalApprovalDecision(command)).resolves.toBeUndefined();
    } finally {
      process.env.APPROVAL_ROUTING_V1_ENABLED = "true";
    }
    await expect(prisma.paymentRequest.findUniqueOrThrow({
      where: { id: fixture.sourceId },
      select: { status: true, evidenceReference: true },
    })).resolves.toEqual({
      status: "APPROVED",
      evidenceReference: "fixture://payment/source-evidence",
    });
    const committed = await approvalDecisionPgSnapshot(fixture);
    expect(committed.instance).toEqual({
      status: "APPROVED",
      currentStepOrder: null,
    });
    expect(committed.steps).toEqual([
      expect.objectContaining({
        stepOrder: 1,
        status: "APPROVED",
        actedByUserId: fixture.approverUserIds[0],
      }),
    ]);
    expect(committed.audits.map(({ eventType }) => eventType)).toContain(
      "payment_request.approved",
    );
    expect(committed.notifications).toEqual([
      expect.objectContaining({
        notificationType: "APPROVAL_OUTCOME_APPROVED",
        recipientUserId: fixture.requesterUserId,
      }),
    ]);
  });

  test.each(specializedFamilies)(
    "FIN-AUTHZ-CANONICAL-SPECIALIZED-APPROVE-001 %s specialized two-step approve defers source mutation until final",
    async (family) => {
      const fixture = await specializedFixture(family);
      const expected = specializedExpected[family];
      expect(await readSpecializedStatus(family, fixture.sourceId)).toBe(
        expected.initial,
      );
      await executeSpecializedDecision(fixture, family, "APPROVE", 1);
      expect(await readSpecializedStatus(family, fixture.sourceId)).toBe(
        "intermediate" in expected ? expected.intermediate : expected.initial,
      );
      const intermediate = await approvalDecisionPgSnapshot(fixture);
      expect(intermediate.instance).toEqual({ status: "PENDING", currentStepOrder: 2 });
      expect(intermediate.steps.map(({ status }) => status)).toEqual(["APPROVED", "PENDING"]);
      expect(
        intermediate.notifications.filter(({ notificationType }) =>
          notificationType.startsWith("APPROVAL_OUTCOME_"),
        ),
      ).toEqual([]);
      expect(
        intermediate.notifications.filter(
          ({ notificationType }) => notificationType === "APPROVAL_STEP_READY",
        ),
      ).toEqual([]);
      if (family === "CashAdvanceRequest") {
        const intermediateAudit = await prisma.auditEvent.findFirstOrThrow({
          where: {
            tenantId: fixture.tenantId,
            entityId: fixture.sourceId,
            eventType: "cash_advance.approval_step_approved",
          },
          select: { metadata: true },
        });
        expect(intermediateAudit.metadata).toEqual(expect.objectContaining({
          supplementalEvidenceReference: "fixture://decision/evidence",
        }));
        expect(intermediateAudit.metadata).not.toEqual(expect.objectContaining({
          evidenceReference: expect.anything(),
        }));
      }

      await executeSpecializedDecision(fixture, family, "APPROVE", 2);
      expect(await readSpecializedStatus(family, fixture.sourceId)).toBe(expected.approve);
      const terminal = await approvalDecisionPgSnapshot(fixture);
      expect(terminal.instance).toEqual({ status: "APPROVED", currentStepOrder: null });
      expect(terminal.steps.map(({ status }) => status)).toEqual(["APPROVED", "APPROVED"]);
      expect(terminal.audits.map(({ eventType }) => eventType)).toContain(expected.approveAudit);
      expect(
        terminal.notifications.filter(
          ({ notificationType }) => notificationType === "APPROVAL_OUTCOME_APPROVED",
        ),
      ).toEqual([
        expect.objectContaining({
          recipientUserId: fixture.requesterUserId,
          sourceEventKey: `approval:${fixture.approvalInstanceId}:outcome:APPROVED`,
          priority: "NORMAL",
          deepLink: `/approvals/${fixture.approvalInstanceId}`,
          entityId: fixture.sourceId,
        }),
      ]);
      if (family === "ExpenseRequest") {
        await expect(prisma.expenseRequest.findUniqueOrThrow({
          where: { id: fixture.sourceId },
          select: { evidenceReference: true },
        })).resolves.toEqual({
          evidenceReference: "fixture://expense/evidence",
        });
      }
      if (family === "CashAdvanceRequest") {
        await expect(prisma.cashAdvanceRequest.findUniqueOrThrow({
          where: { id: fixture.sourceId },
          select: { evidenceReference: true },
        })).resolves.toEqual({
          evidenceReference: "fixture://cash-advance/evidence",
        });
      }
      if (family === "FinanceCloseRun") {
        const effect = await prisma.financeCloseRun.findUniqueOrThrow({
          where: { id: fixture.sourceId },
          select: { configSnapshot: true, accountingPeriod: { select: { status: true } } },
        });
        expect(effect.accountingPeriod.status).toBe("REOPENED");
        expect(effect.configSnapshot).not.toHaveProperty("pendingSensitiveApproval");
      }
      if (family === "PaymentRelease") {
        const effect = await prisma.paymentRelease.findUniqueOrThrow({
          where: { id: fixture.sourceId },
          select: { paymentRequest: { select: { status: true } }, bankAccount: { select: { status: true } } },
        });
        expect(effect).toEqual({ paymentRequest: { status: "APPROVED" }, bankAccount: { status: "ACTIVE" } });
      }
      const committed = terminal;
      await expect(executeSpecializedDecision(fixture, family, "APPROVE", 2)).rejects.toThrow("APPROVAL_NOT_ACTIONABLE");
      expect(await approvalDecisionPgSnapshot(fixture)).toEqual(committed);
    },
  );

  test.each(specializedFamilies)(
    "FIN-AUTHZ-CANONICAL-NEXT-STEP-001 %s specialized direct assignment notifies exactly the next actionable user",
    async (family) => {
      const fixture = await specializedFixture(family, 2, true);
      await executeSpecializedDecision(fixture, family, "APPROVE", 1);
      const intermediate = await approvalDecisionPgSnapshot(fixture);
      expect(
        intermediate.notifications.filter(
          ({ notificationType }) => notificationType === "APPROVAL_STEP_READY",
        ),
      ).toEqual([
        expect.objectContaining({
          recipientUserId: fixture.approverUserIds[1],
          sourceEventKey: `approval:${fixture.approvalInstanceId}:step:2:ready`,
          priority: "NORMAL",
          deepLink: `/approvals/${fixture.approvalInstanceId}`,
          entityId: fixture.sourceId,
        }),
      ]);
      expect(
        intermediate.notifications.filter(({ notificationType }) =>
          notificationType.startsWith("APPROVAL_OUTCOME_"),
        ),
      ).toEqual([]);
    },
  );

  const specializedTerminalCases = specializedFamilies.flatMap((family) => {
    const capabilities = canonicalApprovalDecisionCapabilities[family];
    return (["RETURN", "REJECT"] as const)
      .filter((decision) => capabilities.includes(decision as never))
      .map((decision) => [family, decision] as const);
  });
  test.each(specializedTerminalCases)(
    "FIN-AUTHZ-CANONICAL-TERMINAL-001 %s specialized %s skips future work and is retry-safe",
    async (family, decision) => {
      const fixture = await specializedFixture(family);
      const expected = specializedExpected[family];
      await executeSpecializedDecision(fixture, family, decision, 1);
      const outcome = decision === "RETURN" ? "RETURNED" : "REJECTED";
      expect(await readSpecializedStatus(family, fixture.sourceId)).toBe(
        decision === "RETURN" && "return" in expected ? expected.return : expected.reject,
      );
      const terminal = await approvalDecisionPgSnapshot(fixture);
      expect(terminal.instance).toEqual({ status: outcome, currentStepOrder: null });
      expect(terminal.steps.map(({ status }) => status)).toEqual([outcome, "SKIPPED"]);
      const eventType = decision === "RETURN" && "returnAudit" in expected
        ? expected.returnAudit
        : expected.rejectAudit;
      expect(terminal.audits.map(({ eventType: type }) => type)).toContain(eventType);
      expect(
        terminal.notifications.filter(
          ({ notificationType }) =>
            notificationType === `APPROVAL_OUTCOME_${outcome}`,
        ),
      ).toEqual([
        expect.objectContaining({
          recipientUserId: fixture.requesterUserId,
          sourceEventKey: `approval:${fixture.approvalInstanceId}:outcome:${outcome}`,
          priority: outcome === "REJECTED" ? "HIGH" : "NORMAL",
          deepLink: `/approvals/${fixture.approvalInstanceId}`,
          entityId: fixture.sourceId,
        }),
      ]);
      if (family === "FinanceCloseRun") {
        const effect = await prisma.financeCloseRun.findUniqueOrThrow({
          where: { id: fixture.sourceId },
          select: { configSnapshot: true, accountingPeriod: { select: { status: true } } },
        });
        expect(effect.accountingPeriod.status).toBe("SOFT_CLOSED");
        expect(effect.configSnapshot).not.toHaveProperty("pendingSensitiveApproval");
      }
      if (family === "AttendanceImportBatch") {
        const effect = await prisma.attendanceImportBatch.findUniqueOrThrow({
          where: { id: fixture.sourceId },
          select: { status: true, validationSummary: true },
        });
        expect(effect.status).toBe("REVIEW_READY");
        expect(effect.validationSummary).toMatchObject({
          approvalStatus: outcome,
          returnedForReReview: true,
        });
      }
      const committed = terminal;
      await expect(executeSpecializedDecision(fixture, family, decision, 1)).rejects.toThrow("APPROVAL_NOT_ACTIONABLE");
      expect(await approvalDecisionPgSnapshot(fixture)).toEqual(committed);
    },
  );

  test.each(
    sharedFamilies.flatMap((family) => [
      [family, "RETURN", "RETURNED", "return", "APPROVAL_OUTCOME_RETURNED"],
      [family, "REJECT", "REJECTED", "reject", "APPROVAL_OUTCOME_REJECTED"],
    ] as const),
  )(
    "%s %s closes the current step, skips the future step, and is retry-safe",
    async (family, decision, instanceStatus, expectedKey, notificationType) => {
      const fixture = await sharedFixture(family);
      const expected = sharedExpected[family];
      await executeSharedDecision(fixture, family, decision, 1);

      const [source, terminal] = await Promise.all([
        readSharedSource(family, fixture),
        approvalDecisionPgSnapshot(fixture),
      ]);
      expect(source.status).toBe(expected[expectedKey]);
      if (family === "PurchaseOrderAmendment") {
        expect(source.relatedStatus).toBe("ISSUED");
      }
      if (family === "PurchaseOrderBalanceClosure") {
        expect(source.relatedStatus).toBe("PARTIALLY_RECEIVED");
      }
      expect(terminal.instance).toEqual({ status: instanceStatus, currentStepOrder: null });
      expect(terminal.steps).toEqual([
        expect.objectContaining({
          stepOrder: 1,
          status: instanceStatus,
          actedByUserId: fixture.approverUserIds[0],
          actedAt: expect.any(Date),
        }),
        expect.objectContaining({
          stepOrder: 2,
          status: "SKIPPED",
          actedAt: null,
          actedByUserId: null,
        }),
      ]);
      const auditType = expectedKey === "return"
        ? expected.returnAudit
        : expected.rejectAudit;
      expect(terminal.audits.map(({ eventType }) => eventType)).toContain(auditType);
      expect(terminal.notifications.map(({ notificationType: type }) => type))
        .toContain(notificationType);

      const committed = await approvalDecisionPgSnapshot(fixture);
      await expect(executeSharedDecision(fixture, family, decision, 1))
        .rejects.toThrow("APPROVAL_NOT_ACTIONABLE");
      expect(await approvalDecisionPgSnapshot(fixture)).toEqual(committed);
    },
  );

  test.each([
    ["APPROVE", "APPROVED", "purchase_request.approved", "APPROVAL_OUTCOME_APPROVED"],
    ["RETURN", "RETURNED", "purchase_request.returned", "APPROVAL_OUTCOME_RETURNED"],
    ["REJECT", "REJECTED", "purchase_request.rejected", "APPROVAL_OUTCOME_REJECTED"],
  ] as const)(
    "terminal PurchaseRequest %s keeps source, step, instance, audit, and notification coherent",
    async (decision, terminalStatus, auditType, notificationType) => {
      const fixture = await purchaseRequestFixture();
      contextMock.requireSessionContext.mockResolvedValue(fixture.sessionFor(1));
      const { executeCanonicalApprovalDecision } = await import(
        "../src/server/services/approvals"
      );
      await executeCanonicalApprovalDecision({
        family: "PurchaseRequest",
        decision,
        approvalInstanceId: fixture.approvalInstanceId,
        ...(decision === "APPROVE" ? {} : { remarks }),
      });

      const [source, snapshot] = await Promise.all([
        prisma.purchaseRequest.findUniqueOrThrow({
          where: { id: fixture.sourceId },
          select: { status: true, currentApprovalStep: true },
        }),
        approvalDecisionPgSnapshot(fixture),
      ]);
      expect(source.status).toBe(terminalStatus);
      expect(snapshot.instance).toEqual({ status: terminalStatus, currentStepOrder: null });
      expect(snapshot.steps).toEqual([
        expect.objectContaining({
          stepOrder: 1,
          status: terminalStatus,
          actedByUserId: fixture.approverUserIds[0],
          actedAt: expect.any(Date),
        }),
      ]);
      expect(snapshot.audits.map(({ eventType }) => eventType)).toContain(auditType);
      expect(snapshot.notifications.map(({ notificationType: type }) => type)).toContain(notificationType);
    },
  );

  test("two-step approval separates intermediate activation from final approval", async () => {
    const fixture = await purchaseRequestFixture(2);
    const { executeCanonicalApprovalDecision } = await import(
      "../src/server/services/approvals"
    );
    contextMock.requireSessionContext.mockResolvedValue(fixture.sessionFor(1));
    await executeCanonicalApprovalDecision({
      family: "PurchaseRequest",
      decision: "APPROVE",
      approvalInstanceId: fixture.approvalInstanceId,
    });

    const intermediateSource = await prisma.purchaseRequest.findUniqueOrThrow({
      where: { id: fixture.sourceId },
      select: { status: true, currentApprovalStep: true },
    });
    const intermediate = await approvalDecisionPgSnapshot(fixture);
    expect(intermediateSource).toEqual({ status: "PENDING_APPROVAL", currentApprovalStep: 2 });
    expect(intermediate.instance).toEqual({ status: "PENDING", currentStepOrder: 2 });
    expect(intermediate.steps).toEqual([
      expect.objectContaining({ stepOrder: 1, status: "APPROVED", actedByUserId: fixture.approverUserIds[0] }),
      expect.objectContaining({ stepOrder: 2, status: "PENDING", actedAt: null, actedByUserId: null }),
    ]);
    expect(intermediate.notifications.map(({ notificationType }) => notificationType)).not.toContain("APPROVAL_OUTCOME_APPROVED");

    contextMock.requireSessionContext.mockResolvedValue(fixture.sessionFor(2));
    await executeCanonicalApprovalDecision({
      family: "PurchaseRequest",
      decision: "APPROVE",
      approvalInstanceId: fixture.approvalInstanceId,
    });
    const finalSource = await prisma.purchaseRequest.findUniqueOrThrow({
      where: { id: fixture.sourceId },
      select: { status: true, currentApprovalStep: true },
    });
    const final = await approvalDecisionPgSnapshot(fixture);
    expect(finalSource).toEqual({ status: "APPROVED", currentApprovalStep: null });
    expect(final.instance).toEqual({ status: "APPROVED", currentStepOrder: null });
    expect(final.steps).toEqual([
      expect.objectContaining({ stepOrder: 1, status: "APPROVED", actedByUserId: fixture.approverUserIds[0] }),
      expect.objectContaining({ stepOrder: 2, status: "APPROVED", actedByUserId: fixture.approverUserIds[1] }),
    ]);
    expect(final.audits.map(({ eventType }) => eventType)).toContain("purchase_request.approved");
    expect(final.notifications.map(({ notificationType }) => notificationType)).toContain("APPROVAL_OUTCOME_APPROVED");
  });

  test.todo("PettyCashRequest approval awaits an approved amount-policy fixture");
  test.todo("PaymentRequest approval awaits an explicit payment-control policy fixture");
});
