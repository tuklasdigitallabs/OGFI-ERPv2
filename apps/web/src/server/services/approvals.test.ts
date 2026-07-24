import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import {
  approvalReminderKind,
  findEligibleApprovalActor
} from "./approvals";
import type { SessionContext } from "./context";

const eligibilitySession = {
  user: {
    id: "00000000-0000-4000-8000-000000000001",
    email: "approver@example.test",
    displayName: "Approver",
    role: "Approver"
  },
  context: {
    tenantId: "00000000-0000-4000-8000-000000000002",
    companyId: "00000000-0000-4000-8000-000000000003",
    companyName: "OGFI",
    brandId: "00000000-0000-4000-8000-000000000004",
    brandName: "Brand",
    locationId: "00000000-0000-4000-8000-000000000005",
    locationName: "Branch",
    locationType: "BRANCH"
  },
  authorizedLocations: [],
  permissionCodes: []
} satisfies SessionContext;

describe("approval inbox controls", () => {
  test("approval reminder classification distinguishes overdue from due soon", () => {
    expect(
      approvalReminderKind({
        requiredDate: "2026-07-06",
        asOf: new Date("2026-07-07T10:00:00.000Z")
      })
    ).toBe("OVERDUE");
    expect(
      approvalReminderKind({
        requiredDate: "2026-07-08",
        asOf: new Date("2026-07-07T10:00:00.000Z")
      })
    ).toBe("DUE_SOON");
  });

  test("approval queue and inbox expose emergency purchase request SLA", () => {
    const serviceSource = readFileSync(path.resolve(__dirname, "approvals.ts"), "utf8");
    const pageSource = readFileSync(
      path.resolve(__dirname, "../../app/(app)/approvals/page.tsx"),
      "utf8"
    );

    expect(serviceSource).toContain("isEmergencyPurchaseUrgency");
    expect(serviceSource).toContain("getPurchaseRequestSlaStatus");
    expect(serviceSource).toContain("slaLabel");
    expect(pageSource).toContain("approval.isEmergency");
    expect(pageSource).toContain("approval.slaLabel");
    expect(pageSource).toContain("Overdue");
  });

  test("approval inbox supports non-posting budget revision decisions", () => {
    const serviceSource = readFileSync(path.resolve(__dirname, "approvals.ts"), "utf8");
    const detailPageSource = readFileSync(
      path.resolve(__dirname, "../../app/(app)/approvals/[id]/page.tsx"),
      "utf8"
    );

    expect(serviceSource).toContain("BudgetRevision");
    expect(serviceSource).toContain("findActionableBudgetRevisionApproval");
    expect(serviceSource).toContain("approveBudgetRevision");
    expect(serviceSource).toContain("closeBudgetRevisionWithDecision");
    expect(serviceSource).toContain("budget.revision_approved");
    expect(serviceSource).toContain("budget.revision_rejected");
    expect(serviceSource).toContain("budgetMutationDeferred");
    expect(serviceSource).toContain("lineMutationDeferred");
    expect(serviceSource).toContain("BUDGET_REVISION_RETURN_NOT_SUPPORTED");
    expect(detailPageSource).toContain("Approve Budget Revision");
    expect(detailPageSource).toContain("canReturnApprovalKind");
  });

  test("purchase request and order approvals project warning-mode budget commitments", () => {
    const serviceSource = readFileSync(path.resolve(__dirname, "approvals.ts"), "utf8");

    expect(serviceSource).toContain(
      "projectBudgetCommitmentFromApprovedSourceEvent"
    );
    expect(serviceSource).toContain("projectPurchaseRequestBudgetCommitments");
    expect(serviceSource).toContain("projectPurchaseOrderBudgetCommitments");
    expect(serviceSource).toContain('sourceType: "PURCHASE_REQUEST"');
    expect(serviceSource).toContain('sourceType: "PURCHASE_ORDER"');
    expect(serviceSource).toContain("purchase_request.approved:${line.id}");
    expect(serviceSource).toContain("purchase_order.approved:${line.id}");
    expect(serviceSource).toContain('status: "PENDING"');
  });

  test("approval inbox supports non-posting expense request decisions", () => {
    const serviceSource = readFileSync(path.resolve(__dirname, "approvals.ts"), "utf8");
    const expenseSource = readFileSync(
      path.resolve(__dirname, "expenseRequests.ts"),
      "utf8"
    );
    const detailPageSource = readFileSync(
      path.resolve(__dirname, "../../app/(app)/approvals/[id]/page.tsx"),
      "utf8"
    );

    expect(serviceSource).toContain("ExpenseRequest");
    expect(serviceSource).toContain("findActionableExpenseRequestApproval");
    expect(serviceSource).toContain("approveExpenseRequest");
    expect(serviceSource).toContain("closeExpenseRequestWithDecision");
    expect(expenseSource).toContain("expense_request.approved");
    expect(serviceSource).toContain("expense_request.returned");
    expect(serviceSource).toContain("expense_request.rejected");
    expect(expenseSource).toContain("EXPENSE_REQUEST_BUDGET_OVERRIDE_REASON_REQUIRED");
    expect(serviceSource).toContain("noPaymentCreation");
    expect(serviceSource).toContain("noJournalPosting");
    expect(serviceSource).toContain("noApSettlement");
    expect(detailPageSource).toContain("Approve Expense Request");
    expect(detailPageSource).toContain("Reject Expense Request");
  });

  test("approval inbox supports non-posting cash advance request decisions", () => {
    const serviceSource = readFileSync(path.resolve(__dirname, "approvals.ts"), "utf8");
    const detailPageSource = readFileSync(
      path.resolve(__dirname, "../../app/(app)/approvals/[id]/page.tsx"),
      "utf8"
    );

    expect(serviceSource).toContain("CashAdvanceRequest");
    expect(serviceSource).toContain("findActionableCashAdvanceRequestApproval");
    expect(serviceSource).toContain("approveCashAdvanceRequest");
    expect(serviceSource).toContain("closeCashAdvanceRequestWithDecision");
    expect(serviceSource).toContain("cash_advance.approved");
    expect(serviceSource).toContain("cash_advance.returned");
    expect(serviceSource).toContain("cash_advance.rejected");
    expect(serviceSource).toContain("CASH_ADVANCE_BUDGET_OVERRIDE_REASON_REQUIRED");
    expect(serviceSource).toContain("noPaymentCreation");
    expect(serviceSource).toContain("noPaymentRelease");
    expect(serviceSource).toContain("noJournalPosting");
    expect(serviceSource).toContain("noBankMutation");
    expect(detailPageSource).toContain("Approve Cash Advance");
    expect(detailPageSource).toContain("Reject Cash Advance");
  });

  test("approval inbox supports non-posting petty cash request decisions", () => {
    const serviceSource = readFileSync(path.resolve(__dirname, "approvals.ts"), "utf8");
    const pettyCashSource = readFileSync(
      path.resolve(__dirname, "pettyCash.ts"),
      "utf8"
    );
    const detailPageSource = readFileSync(
      path.resolve(__dirname, "../../app/(app)/approvals/[id]/page.tsx"),
      "utf8"
    );

    expect(serviceSource).toContain("PettyCashRequest");
    expect(serviceSource).toContain("findActionablePettyCashRequestApproval");
    expect(serviceSource).toContain("approvePettyCashRequest");
    expect(serviceSource).toContain("closePettyCashRequestWithDecision");
    expect(pettyCashSource).toContain("petty_cash.request_approved");
    expect(serviceSource).toContain("petty_cash.request_returned");
    expect(serviceSource).toContain("petty_cash.request_rejected");
    expect(pettyCashSource).toContain("PETTY_CASH_REQUEST_EVIDENCE_REQUIRED");
    expect(serviceSource).toContain("noPaymentCreation");
    expect(serviceSource).toContain("noPaymentRelease");
    expect(serviceSource).toContain("noJournalPosting");
    expect(serviceSource).toContain("noBankMutation");
    expect(detailPageSource).toContain("Approve Petty Cash");
    expect(detailPageSource).toContain("Reject Petty Cash");
  });

  test("approval inbox supports non-posting payment request decisions", () => {
    const serviceSource = readFileSync(path.resolve(__dirname, "approvals.ts"), "utf8");
    const detailPageSource = readFileSync(
      path.resolve(__dirname, "../../app/(app)/approvals/[id]/page.tsx"),
      "utf8"
    );

    expect(serviceSource).toContain("PaymentRequest");
    expect(serviceSource).toContain("findActionablePaymentRequestApproval");
    expect(serviceSource).toContain("approvePaymentRequestApproval");
    expect(serviceSource).toContain("closePaymentRequestWithDecision");
    expect(serviceSource).toContain("payment_request.approved");
    expect(serviceSource).toContain("payment_request.returned");
    expect(serviceSource).toContain("payment_request.rejected");
    expect(serviceSource).toContain("PAYMENT_REQUEST_EVIDENCE_REQUIRED");
    expect(serviceSource).toContain("noSourceMutation");
    expect(serviceSource).toContain("noPaymentRelease");
    expect(serviceSource).toContain("noBankMutation");
    expect(serviceSource).toContain("noJournalPosting");
    expect(detailPageSource).toContain("Approve Payment Request");
    expect(detailPageSource).toContain("Reject Payment Request");
  });

  test("approval inbox supports non-posting payment release decisions", () => {
    const serviceSource = readFileSync(path.resolve(__dirname, "approvals.ts"), "utf8");
    const detailPageSource = readFileSync(
      path.resolve(__dirname, "../../app/(app)/approvals/[id]/page.tsx"),
      "utf8"
    );

    expect(serviceSource).toContain("PaymentRelease");
    expect(serviceSource).toContain("findActionablePaymentReleaseApproval");
    expect(serviceSource).toContain("approvePaymentReleaseApproval");
    expect(serviceSource).toContain("rejectPaymentReleaseApproval");
    expect(serviceSource).toContain("PAYMENT_RELEASE_RETURN_NOT_SUPPORTED");
    expect(serviceSource).toContain("PAYMENT_RELEASE_EVIDENCE_REQUIRED");
    expect(serviceSource).toContain("payment_release.approved");
    expect(serviceSource).toContain("payment_release.rejected");
    expect(serviceSource).toContain("READY_FOR_RELEASE");
    expect(serviceSource).toContain("noSourceMutation");
    expect(serviceSource).toContain("noPaymentExecution");
    expect(serviceSource).toContain("noApMutation");
    expect(serviceSource).toContain("noBankApiCall");
    expect(serviceSource).toContain("noJournalPosting");
    expect(detailPageSource).toContain("Approve Payment Release");
    expect(detailPageSource).toContain("Reject Payment Release");
    expect(detailPageSource).toContain("FinanceCloseRun");
  });

  test("approval inbox supports sensitive period close decisions", () => {
    const serviceSource = readFileSync(path.resolve(__dirname, "approvals.ts"), "utf8");
    const detailPageSource = readFileSync(
      path.resolve(__dirname, "../../app/(app)/approvals/[id]/page.tsx"),
      "utf8"
    );

    expect(serviceSource).toContain("FinanceCloseRun");
    expect(serviceSource).toContain("readFinanceClosePendingApproval");
    expect(serviceSource).toContain("approveFinanceCloseRunApproval");
    expect(serviceSource).toContain("rejectFinanceCloseRunApproval");
    expect(serviceSource).toContain("PERIOD_CLOSE_APPROVAL_RETURN_NOT_SUPPORTED");
    expect(serviceSource).toContain("Period close lock");
    expect(serviceSource).toContain("Period reopen");
    expect(serviceSource).toContain("Company period close");
    expect(detailPageSource).toContain("Approve Period Action");
    expect(detailPageSource).toContain("Reject Period Action");
  });

  test("approval inbox supports non-payroll workforce leave decisions", () => {
    const serviceSource = readFileSync(path.resolve(__dirname, "approvals.ts"), "utf8");

    expect(serviceSource).toContain("EmployeeLeaveRequest");
    expect(serviceSource).toContain("findActionableEmployeeLeaveApproval");
    expect(serviceSource).toContain("approveEmployeeLeaveRequestApproval");
    expect(serviceSource).toContain("closeEmployeeLeaveRequestWithDecision");
    expect(serviceSource).toContain("workforce.leave_approved");
    expect(serviceSource).toContain("workforce.leave_returned");
    expect(serviceSource).toContain("workforce.leave_rejected");
    expect(serviceSource).toContain("WORKFORCE_LEAVE_NOT_AWAITING_APPROVAL");
    expect(serviceSource).toContain("APPROVAL_DOCUMENT_SCOPE_NOT_FOUND");
    expect(serviceSource).toContain("noPayrollComputation");
    expect(serviceSource).toContain("noPaymentRequest");
    expect(serviceSource).toContain("noFinanceJournal");
    expect(serviceSource).toContain("noAttendanceDeviceAuthority");
  });

  test("approval inbox supports non-payroll workforce overtime decisions", () => {
    const serviceSource = readFileSync(path.resolve(__dirname, "approvals.ts"), "utf8");

    expect(serviceSource).toContain("EmployeeOvertimeRecord");
    expect(serviceSource).toContain("findActionableEmployeeOvertimeApproval");
    expect(serviceSource).toContain("approveEmployeeOvertimeRecordApproval");
    expect(serviceSource).toContain("rejectEmployeeOvertimeRecordApproval");
    expect(serviceSource).toContain("WORKFORCE_OVERTIME_RETURN_NOT_SUPPORTED");
    expect(serviceSource).toContain("workforce.overtime_approved");
    expect(serviceSource).toContain("workforce.overtime_rejected");
    expect(serviceSource).toContain("WORKFORCE_OVERTIME_NOT_AWAITING_APPROVAL");
    expect(serviceSource).toContain("noPayrollComputation");
    expect(serviceSource).toContain("noPaymentRequest");
    expect(serviceSource).toContain("noFinanceJournal");
    expect(serviceSource).toContain("noAttendanceDeviceAuthority");
  });

  test("approval inbox supports non-publishing workforce schedule decisions", () => {
    const serviceSource = readFileSync(path.resolve(__dirname, "approvals.ts"), "utf8");

    expect(serviceSource).toContain("WorkforceSchedule");
    expect(serviceSource).toContain("findActionableWorkforceScheduleApproval");
    expect(serviceSource).toContain("approveWorkforceScheduleApproval");
    expect(serviceSource).toContain("closeWorkforceScheduleWithDecision");
    expect(serviceSource).toContain("workforce.schedule_approved");
    expect(serviceSource).toContain("workforce.schedule_returned");
    expect(serviceSource).toContain("workforce.schedule_rejected");
    expect(serviceSource).toContain("WORKFORCE_SCHEDULE_NOT_AWAITING_APPROVAL");
    expect(serviceSource).toContain("noSchedulePublication");
    expect(serviceSource).toContain("noPayrollComputation");
    expect(serviceSource).toContain("noPaymentRequest");
    expect(serviceSource).toContain("noFinanceJournal");
  });

  test("approval inbox supports attendance import exception review decisions", () => {
    const serviceSource = readFileSync(path.resolve(__dirname, "approvals.ts"), "utf8");
    const detailPageSource = readFileSync(
      path.resolve(__dirname, "../../app/(app)/approvals/[id]/page.tsx"),
      "utf8"
    );

    expect(serviceSource).toContain("AttendanceImportBatch");
    expect(serviceSource).toContain("findActionableAttendanceImportApproval");
    expect(serviceSource).toContain("approveAttendanceImportBatchApproval");
    expect(serviceSource).toContain("closeAttendanceImportBatchWithDecision");
    expect(serviceSource).toContain("attendanceImportRequestedFinalStatus");
    expect(serviceSource).toContain("workforce.attendance_import_approved");
    expect(serviceSource).toContain("workforce.attendance_import_returned");
    expect(serviceSource).toContain("workforce.attendance_import_approval_rejected");
    expect(serviceSource).toContain("WORKFORCE_ATTENDANCE_IMPORT_NOT_AWAITING_APPROVAL");
    expect(serviceSource).toContain("noPayrollExport");
    expect(serviceSource).toContain("noAttendanceDeviceAuthority");
    expect(serviceSource).toContain("noPaymentRequest");
    expect(serviceSource).toContain("noFinanceJournal");
    expect(detailPageSource).toContain("Approve Attendance Review");
    expect(detailPageSource).toContain("Reject Attendance Review");
    expect(detailPageSource).toContain('revalidatePath("/workforce")');
  });
});

describe("role-scoped approval eligibility", () => {
  const now = new Date("2026-07-22T00:00:00.000Z");
  const baseInput = {
    assignedUserId: null,
    assignedRoleId: "00000000-0000-4000-8000-000000000006",
    locationId: eligibilitySession.context.locationId,
    requiredPermissionCode: "purchase_request.approve",
    prohibitedApproverUserIds: ["00000000-0000-4000-8000-000000000099"],
    now
  };

  test("uses one bounded live role/scope lookup regardless of role population", async () => {
    let capturedWhere: unknown;
    let userQueries = 0;
    const tx = {
      location: {
        findFirst: async () => ({
          id: baseInput.locationId,
          companyId: eligibilitySession.context.companyId,
          brandId: eligibilitySession.context.brandId
        })
      },
      user: {
        findFirst: async ({ where }: { where: unknown }) => {
          userQueries += 1;
          capturedWhere = where;
          return { id: eligibilitySession.user.id };
        }
      }
    };

    await expect(
      findEligibleApprovalActor(tx as never, eligibilitySession, baseInput)
    ).resolves.toEqual({ id: eligibilitySession.user.id });
    expect(userQueries).toBe(1);
    expect(JSON.stringify(capturedWhere)).toContain(baseInput.assignedRoleId);
    expect(JSON.stringify(capturedWhere)).toContain("purchase_request.approve");
    expect(JSON.stringify(capturedWhere)).toContain("APPROVE");
    expect(JSON.stringify(capturedWhere)).toContain("MANAGE");
    expect(JSON.stringify(capturedWhere)).toContain(now.toISOString());
  });

  test("returns no witness for revoked, expired, or wrong-scope populations", async () => {
    const tx = {
      location: {
        findFirst: async () => ({
          id: baseInput.locationId,
          companyId: eligibilitySession.context.companyId,
          brandId: eligibilitySession.context.brandId
        })
      },
      user: { findFirst: async () => null }
    };
    await expect(
      findEligibleApprovalActor(tx as never, eligibilitySession, baseInput)
    ).resolves.toBeNull();
  });

  test("rejects a prohibited direct assignee before querying scope or users", async () => {
    let touchedDatabase = false;
    const tx = {
      location: { findFirst: async () => ((touchedDatabase = true), null) },
      user: { findFirst: async () => ((touchedDatabase = true), null) }
    };
    await expect(
      findEligibleApprovalActor(tx as never, eligibilitySession, {
        ...baseInput,
        assignedRoleId: null,
        assignedUserId: eligibilitySession.user.id,
        prohibitedApproverUserIds: [eligibilitySession.user.id]
      })
    ).resolves.toBeNull();
    expect(touchedDatabase).toBe(false);
  });
});

function extractFunctionSource(serviceSource: string, functionName: string) {
  const exportedStart = serviceSource.indexOf(
    `export async function ${functionName}(`
  );
  const internalStart = serviceSource.indexOf(`async function ${functionName}(`);
  const start = exportedStart >= 0 ? exportedStart : internalStart;
  expect(start).toBeGreaterThanOrEqual(0);
  const nextExport = serviceSource.indexOf("\nexport async function ", start + 1);
  const nextInternal = serviceSource.indexOf("\nasync function ", start + 1);
  const possibleEnds = [nextExport, nextInternal].filter((index) => index >= 0);
  const end = possibleEnds.length > 0 ? Math.min(...possibleEnds) : serviceSource.length;
  return serviceSource.slice(start, end);
}

describe("multi-step approval advancement", () => {
  const serviceSource = readFileSync(
    path.resolve(__dirname, "approvals.ts"),
    "utf8"
  );
  const notificationsSource = readFileSync(
    path.resolve(__dirname, "notifications.ts"),
    "utf8"
  );

  test("compare-and-advance is transactional, scoped, and retry-safe", () => {
    const helperSource = extractFunctionSource(
      serviceSource,
      "approveCurrentStepAndAdvance"
    );
    const activationSource = extractFunctionSource(
      serviceSource,
      "activateNextApprovalStep"
    );

    expect(helperSource).toContain("approvalInstanceStep.updateMany");
    expect(helperSource).toContain('status: "PENDING"');
    expect(helperSource).toContain("activateNextApprovalStep");
    expect(activationSource).toContain('status: "WAITING"');
    expect(activationSource).toContain('data: { status: "PENDING" }');
    expect(activationSource).toContain("activateApprovalStepWithEligibility");
    expect(activationSource).not.toContain("assertApprovalRoutingRuntimeReady");
    expect(helperSource).toContain("tenantId: session.context.tenantId");
    expect(helperSource).toContain("companyId: session.context.companyId");
    expect(helperSource).toContain("currentStepOrder: input.stepOrder");
    expect(helperSource).toContain("currentStepOrder: nextStep.stepOrder");
    expect(helperSource).toContain('throw new Error("APPROVAL_NOT_ACTIONABLE")');
    expect(helperSource).toContain("input.audit.eventType");
    expect(helperSource).toContain("approvedStepOrder: input.stepOrder");
    expect(helperSource).toContain("nextStepOrder: nextStep.stepOrder");
    expect(helperSource).toContain("assertLiveApprovalAuthority");
    expect(helperSource).toContain("findEligibleApprovalActor");
    expect(helperSource).toContain("if (prepared.directRecipientUserId)");
    expect(helperSource).toContain("recordApprovalStepReadyNotification");
    expect(helperSource).toContain("approvalInstanceStepId: nextStep.id");
    expect(helperSource).toContain("recipientUserId: prepared.directRecipientUserId");
    expect(helperSource).toContain("routingContext");
    expect(helperSource).toContain("assignedRoleId: nextStep.assignedRoleId");
    expect(helperSource).toContain("requiredPermissionCode: input.requiredPermissionCode");
    expect(helperSource).toContain('scopeType: "LOCATION_CONTEXT"');
    expect(helperSource).not.toContain('notificationType: "APPROVAL_STEP_READY"');
    expect(serviceSource).toContain(
      'throw new Error("APPROVAL_NEXT_STEP_RECIPIENT_NOT_AVAILABLE")'
    );
  });

  test("authority is revalidated under row locks inside the transaction", () => {
    const prepareSource = extractFunctionSource(
      serviceSource,
      "prepareApprovalDecisionAuthority"
    );
    const actorLockSource = extractFunctionSource(
      serviceSource,
      "lockApprovalActorSession"
    );
    const approvalLockSource = extractFunctionSource(
      serviceSource,
      "lockApprovalAuthority"
    );
    const authoritySource = extractFunctionSource(
      serviceSource,
      "assertLiveApprovalAuthority"
    );
    const eligibilitySource = extractFunctionSource(
      serviceSource,
      "findEligibleApprovalActor"
    );
    expect(actorLockSource).toContain('FROM "AuthSession"');
    expect(actorLockSource).toContain("FOR SHARE");
    expect(approvalLockSource).toContain("FOR UPDATE OF ai, s");
    expect(prepareSource.indexOf("lockApprovalActorSession")).toBeLessThan(
      prepareSource.indexOf("lockApprovalAuthority")
    );
    expect(prepareSource.indexOf("lockApprovalAuthority")).toBeLessThan(
      prepareSource.indexOf("findNextApprovalStep(tx, input, true)")
    );
    expect(prepareSource.indexOf("findNextApprovalStep(tx, input, true)")).toBeLessThan(
      prepareSource.indexOf("assertLiveApprovalAuthority")
    );
    expect(authoritySource).toContain("const now = new Date()");
    expect(authoritySource).toContain("privilegeEpochAtIssue");
    expect(authoritySource).toContain("findEligibleApprovalActor");
    expect(authoritySource).toContain("requiredPermissionCode");
    expect(eligibilitySource).toContain("scopeAssignments");
    expect(eligibilitySource).toContain('accessLevel: { in: ["APPROVE", "MANAGE"] }');
    expect(authoritySource).not.toContain("$queryRawUnsafe");
  });

  test.each([
    "closeWithDecision",
    "closeQuotationRecommendationWithDecision",
    "closePurchaseOrderWithDecision",
    "closePurchaseOrderBalanceClosureWithDecision",
    "closePurchaseOrderAmendmentWithDecision",
    "closeWastageReportWithDecision",
    "closeStockAdjustmentWithDecision"
  ])("%s uses the common live-authority terminal decision primitive", (name) => {
    expect(extractFunctionSource(serviceSource, name)).toContain(
      "closeCurrentApprovalDecision(tx, session"
    );
  });

  test("terminal decision compare-and-set prevents stale overwrite", () => {
    const closeSource = extractFunctionSource(
      serviceSource,
      "closeCurrentApprovalDecision"
    );
    expect(closeSource).toContain("assertLiveApprovalAuthority");
    expect(closeSource).toContain("approvalInstanceStep.updateMany");
    expect(closeSource).toContain('status: "PENDING"');
    expect(closeSource).toContain("approvalInstance.updateMany");
    expect(closeSource).toContain("currentStepOrder: input.stepOrder");
    expect(closeSource).toContain('throw new Error("APPROVAL_NOT_ACTIONABLE")');
  });

  test.each([
    [
      "approvePurchaseRequest",
      "purchase_request.approval_step_approved",
      "purchase_request.approved"
    ],
    [
      "approveWastageReport",
      "wastage_report.approval_step_approved",
      "wastage_report.approved"
    ],
    [
      "approvePurchaseOrder",
      "purchase_order.approval_step_approved",
      "purchase_order.approved"
    ],
    [
      "approveQuotationRecommendation",
      "quotation_recommendation.approval_step_approved",
      "quotation_recommendation.approved"
    ],
    [
      "approvePurchaseOrderBalanceClosure",
      "purchase_order_balance_closure.approval_step_approved",
      "purchase_order_balance_closure.approved"
    ],
    [
      "approvePurchaseOrderAmendment",
      "purchase_order.amendment_approval_step_approved",
      "purchase_order.amendment_approved"
    ],
    [
      "approveStockAdjustment",
      "stock_adjustment.approval_step_approved",
      "stock_adjustment.approved"
    ]
  ])(
    "%s advances before final source approval",
    (functionName, stepAuditEvent, finalAuditEvent) => {
      const handlerSource = extractFunctionSource(serviceSource, functionName);
      const advanceIndex = handlerSource.indexOf(
        "approveCurrentStepAndAdvance(tx, session"
      );
      const intermediateGuardIndex = handlerSource.indexOf(
        "if (!stepResult.isFinalStep)"
      );
      const finalAuditIndex = handlerSource.indexOf(finalAuditEvent);

      expect(handlerSource).toContain("await prisma.$transaction");
      expect(handlerSource).toContain(stepAuditEvent);
      expect(handlerSource).toContain("sourceMutationDeferred: true");
      expect(advanceIndex).toBeGreaterThanOrEqual(0);
      expect(intermediateGuardIndex).toBeGreaterThan(advanceIndex);
      expect(finalAuditIndex).toBeGreaterThan(intermediateGuardIndex);
    }
  );

  test("affected handlers retain server authorization and segregation guards", () => {
    expect(serviceSource).toContain(
      "await requirePermission(session, permissions.purchaseRequestApprove)"
    );
    expect(serviceSource).toContain(
      "await requirePermission(session, permissions.wastageApprove)"
    );
    expect(serviceSource).toContain(
      "await requirePermission(session, permissions.purchaseOrderApprove)"
    );
    expect(serviceSource).toContain(
      "await requirePermission(session, permissions.quoteApprove)"
    );
    expect(serviceSource).toContain(
      "await assertApprovalScope(session, request.requestLocationId)"
    );
    expect(serviceSource).toContain(
      "await assertApprovalScope(session, order.deliveryLocationId)"
    );
    expect(serviceSource).toContain(
      "assertNotSelfApproval(request.requesterUserId, session.user.id)"
    );
    expect(serviceSource).toContain('throw new Error("SELF_APPROVAL_BLOCKED")');
  });

  test("terminal outcomes notify requester or owner with stable idempotency", () => {
    const outcomeSource = extractFunctionSource(
      serviceSource,
      "recordApprovalOutcomeNotification"
    );
    const approveSource = extractFunctionSource(
      serviceSource,
      "approveCurrentStepAndAdvance"
    );
    const closeSource = extractFunctionSource(
      serviceSource,
      "closeCurrentApprovalDecision"
    );
    const sharedOutcomeSource = extractFunctionSource(
      notificationsSource,
      "recordApprovalOutcomeNotification"
    );
    expect(outcomeSource).toContain("recordSharedApprovalOutcomeNotification");
    expect(outcomeSource).toContain("input.notification.recipientUserIds");
    expect(outcomeSource).toContain("input.notification.publicReference");
    expect(outcomeSource).toContain("input.notification.locationName");
    expect(sharedOutcomeSource).toContain(
      "`approval:${input.approvalInstanceId}:outcome:${input.outcome}`"
    );
    expect(approveSource).toContain(
      'recordApprovalOutcomeNotification(tx, session, input, "APPROVED")'
    );
    expect(closeSource).toContain(
      "recordApprovalOutcomeNotification(tx, session, input, input.decisionStatus)"
    );
  });

  test("next-step routing excludes every workflow source actor", () => {
    const resolverSource = extractFunctionSource(
      serviceSource,
      "findEligibleApprovalActor"
    );
    expect(resolverSource).toContain(
      "input.prohibitedApproverUserIds.includes(input.assignedUserId)"
    );
    expect(resolverSource).toContain("return null");
    expect(resolverSource).toContain("equals: input.assignedUserId");
    expect(resolverSource).toContain("notIn: input.prohibitedApproverUserIds");

    const expectations: Array<[string, string[]]> = [
      ["approvePurchaseRequest", ["request.requesterUserId"]],
      ["approveWastageReport", ["report.reportedByUserId"]],
      ["approveStockAdjustment", ["adjustment.requestedByUserId"]],
      [
        "approvePurchaseOrderBalanceClosure",
        [
          "closure.requestedByUserId",
          "order.createdByUserId",
          "order.purchaseRequest.requesterUserId",
          "order.quotationRecommendation.preparedByUserId"
        ]
      ],
      [
        "approvePurchaseOrderAmendment",
        [
          "amendment.requestedByUserId",
          "order.createdByUserId",
          "order.purchaseRequest.requesterUserId",
          "order.quotationRecommendation.preparedByUserId"
        ]
      ],
      [
        "approvePurchaseOrder",
        [
          "order.createdByUserId",
          "order.purchaseRequest.requesterUserId",
          "order.quotationRecommendation.preparedByUserId"
        ]
      ],
      [
        "approveQuotationRecommendation",
        [
          "recommendation.preparedByUserId",
          "purchaseRequest.requesterUserId"
        ]
      ]
    ];
    for (const [handlerName, prohibitedActors] of expectations) {
      const handlerSource = extractFunctionSource(serviceSource, handlerName);
      expect(handlerSource).toContain("prohibitedApproverUserIds:");
      for (const actor of prohibitedActors) {
        expect(handlerSource).toContain(actor);
      }
    }
  });

  test("role activation is constant-write and direct assignment emits at most one notification", () => {
    const prepareSource = extractFunctionSource(
      serviceSource,
      "prepareApprovalDecisionAuthority"
    );
    const advanceSource = extractFunctionSource(
      serviceSource,
      "approveCurrentStepAndAdvance"
    );
    const eligibilitySource = extractFunctionSource(
      serviceSource,
      "findEligibleApprovalActor"
    );

    expect(eligibilitySource).toContain("user.findFirst");
    expect(eligibilitySource).not.toContain("user.findMany");
    expect(eligibilitySource).toContain('startsAt: { lte: now }');
    expect(eligibilitySource).toContain('{ endsAt: { gt: now } }');
    expect(eligibilitySource).toContain('accessLevel: { in: ["APPROVE", "MANAGE"] }');
    expect(prepareSource).not.toContain("preliminaryRecipientIds");
    expect(prepareSource).not.toContain("recipientUserIds");
    expect(advanceSource).toContain("if (prepared.directRecipientUserId)");
    expect(advanceSource).toContain("recordApprovalStepReadyNotification");
    expect(advanceSource).toContain("recipientUserId: prepared.directRecipientUserId");
    expect(advanceSource).toContain('activationMode: nextStep.assignedUserId ? "DIRECT_USER" : "ROLE_SCOPED"');
    expect(advanceSource).toContain("assignedRoleId: nextStep.assignedRoleId");
  });

  test("dynamic inbox role discovery is effective-dated and permission-specific", () => {
    const roleSource = extractFunctionSource(serviceSource, "getActiveRoleIds");
    const listSource = extractFunctionSource(serviceSource, "listPendingApprovals");
    const scopeSource = extractFunctionSource(serviceSource, "hasApprovalScope");

    expect(roleSource).toContain('startsAt: { lte: now }');
    expect(roleSource).toContain('{ endsAt: { gt: now } }');
    expect(roleSource).toContain('status: "ACTIVE"');
    expect(roleSource).toContain("requiredPermissionCode");
    expect(listSource).toContain("approvalPermissionByDocumentType");
    expect(listSource).toContain("roleIdsByPermission");
    expect(scopeSource).toContain('startsAt: { lte: now }');
    expect(scopeSource).toContain('{ endsAt: { gt: now } }');
  });

  test("approval inbox uses normalized server pagination at cutover and exposes no passive tabs", () => {
    const pageSource = readFileSync(
      path.resolve(__dirname, "../../app/(app)/approvals/page.tsx"),
      "utf8"
    );

    expect(pageSource).toContain("normalizedApprovalRoutingEnabled()");
    expect(pageSource).toContain("listNormalizedApprovalInboxPage(session");
    expect(pageSource).toContain('view: "DUE_SOON"');
    expect(pageSource).toContain("getApprovalDetail(session, item.approvalInstanceId)");
    expect(pageSource).toContain('redirect("/approvals?error=APPROVAL_AUTHORITY_STALE&stale=1")');
    expect(pageSource).toContain("ActionFeedbackBanner");
    expect(pageSource).not.toContain('label: "Returned"');
    expect(pageSource).not.toContain('label: "Audit"');
  });

  test("approval detail explains read-only comments and empty audit history", () => {
    const detailSource = readFileSync(
      path.resolve(__dirname, "../../app/(app)/approvals/[id]/page.tsx"),
      "utf8"
    );

    expect(detailSource).toContain("Comments are read-only here for this approval type");
    expect(detailSource).toContain("authoritative source workspace");
    expect(detailSource).toContain("No audit events recorded yet.");
  });

  test("balance closure serializes with receiving and uses quantity CAS", () => {
    const source = extractFunctionSource(
      serviceSource,
      "approvePurchaseOrderBalanceClosure"
    );
    expect(source.indexOf("approveCurrentStepAndAdvance")).toBeLessThan(
      source.indexOf('FROM "PurchaseOrder"')
    );
    expect(source).toContain("FOR UPDATE");
    expect(source).toContain('FROM "PurchaseOrderLine"');
    expect(source).toContain('ORDER BY "lineNumber", id');
    expect(source).toContain("FOR UPDATE");
    expect(source).toContain("purchaseOrderLine.updateMany");
    expect(source).toContain("orderedQty: line.orderedQty");
    expect(source).toContain("receivedQty: line.receivedQty");
    expect(source).toContain("cancelledQty: line.cancelledQty");
    expect(source).toContain("PURCHASE_ORDER_BALANCE_CLOSURE_CONFLICT");
  });
});
