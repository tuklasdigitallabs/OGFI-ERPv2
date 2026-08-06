import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import {
  approvalReminderKind,
  findEligibleApprovalActor
} from "./approvals";
import { getApprovalDecisionSurfaceContract } from "./approvalDecisionCapabilities";
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
    const decisionSurface = getApprovalDecisionSurfaceContract("BudgetRevision");

    expect(serviceSource).toContain("BudgetRevision");
    expect(serviceSource).toContain("findActionableBudgetRevisionApproval");
    expect(serviceSource).toContain("approveBudgetRevision");
    expect(serviceSource).toContain("closeBudgetRevisionWithDecision");
    expect(serviceSource).toContain("budget.revision_approved");
    expect(serviceSource).toContain("budget.revision_rejected");
    expect(serviceSource).toContain("budgetMutationDeferred");
    expect(serviceSource).toContain("lineMutationDeferred");
    expect(serviceSource).toContain("BUDGET_REVISION_RETURN_NOT_SUPPORTED");
    expect(decisionSurface.decisions.map((entry) => entry.label)).toEqual([
      "Approve Budget Revision",
      "Reject Budget Revision"
    ]);
  });

  test("DEC-0260 terminal adapters use normalized authority and preserve inventory review boundaries", () => {
    const serviceSource = readFileSync(path.resolve(__dirname, "approvals.ts"), "utf8");

    expect(serviceSource).toContain("approveInventoryTransferApproval");
    expect(serviceSource).toContain("closeInventoryTransferApproval");
    expect(serviceSource).toContain("approveStockCountAttemptReviewApproval");
    expect(serviceSource).toContain("requireNormalizedTerminalApprovalAuthority");
    expect(serviceSource).toContain("lockNormalizedApprovalLifecycleGraph");
    expect(serviceSource).toContain("assertExactTerminalApprovalScopeGroups");
    expect(serviceSource).toContain("assertInventoryTransferTerminalIntentLineage");
    expect(serviceSource).toContain("assertStockCountAttemptReviewTerminalIntentLineage");
    expect(serviceSource).toContain("INVENTORY_TRANSFER_APPROVAL_INTENT_NOT_FOUND");
    expect(serviceSource).toContain("STOCK_COUNT_ATTEMPT_REVIEW_APPROVAL_INTENT_NOT_FOUND");
    expect(serviceSource).toContain(
      "INVENTORY_PILOT_APPROVAL_ERRORS.CONFIGURATION_STALE"
    );
    expect(serviceSource).toContain("permissions.transferApprove");
    expect(serviceSource).toContain("permissions.stockCountReview");
    expect(serviceSource).toContain("STOCK_COUNT_ATTEMPT_REVIEW_RETURN_NOT_SUPPORTED");
    expect(serviceSource).toContain("STOCK_COUNT_ATTEMPT_REVIEW_REJECT_NOT_SUPPORTED");
    expect(serviceSource).toContain('status: "REQUESTED"');
    expect(serviceSource).toContain('status: "REVIEWED"');
    expect(serviceSource).toContain("noInventoryMovement: true");
    expect(serviceSource).toContain("noStockAdjustment: true");
    expect(serviceSource).toContain("recordApprovalOutcomeNotification");
  });

  test("DEC-0261 terminal adapters lock the exact typed intent before graph mutation", () => {
    const serviceSource = readFileSync(path.resolve(__dirname, "approvals.ts"), "utf8");
    const transferApprove = extractFunctionSource(
      serviceSource,
      "approveInventoryTransferApproval"
    );
    const transferClose = extractFunctionSource(
      serviceSource,
      "closeInventoryTransferApproval"
    );
    const countApprove = extractFunctionSource(
      serviceSource,
      "approveStockCountAttemptReviewApproval"
    );

    for (const handler of [transferApprove, transferClose]) {
      expect(handler).toContain("assertInventoryTransferTerminalIntentLineage");
      expect(handler.indexOf("assertInventoryTransferTerminalIntentLineage")).toBeLessThan(
        handler.indexOf("lockNormalizedApprovalLifecycleGraph")
      );
    }
    expect(countApprove).toContain("assertStockCountAttemptReviewTerminalIntentLineage");
    expect(countApprove.indexOf("assertStockCountAttemptReviewTerminalIntentLineage")).toBeLessThan(
      countApprove.indexOf("lockNormalizedApprovalLifecycleGraph")
    );
    expect(serviceSource).toContain('FROM "InventoryTransferApprovalSubmissionIntent" intent');
    expect(serviceSource).toContain('FROM "StockCountReviewSubmissionIntent" intent');
    expect(serviceSource).not.toContain("FOR UPDATE OF intent");
    expect(serviceSource).toContain('stage: "REVALIDATE"');
  });

  test("inventory-pilot terminal residue checks keep the immutable ledger read-only", () => {
    const serviceSource = readFileSync(path.resolve(__dirname, "approvals.ts"), "utf8");
    const transferSource = extractFunctionSource(
      serviceSource,
      "lockInventoryTransferTerminalApprovalSource"
    );
    const countSource = extractFunctionSource(
      serviceSource,
      "lockStockCountAttemptReviewSource"
    );

    for (const source of [transferSource, countSource]) {
      expect(source).toContain('FROM "InventoryMovement" movement');
      expect(source).toContain('SELECT 1 AS "exists" FROM "InventoryMovement" movement');
      expect(source).toContain("LIMIT 1");
      expect(source).not.toContain("FOR SHARE OF movement");
      expect(source).toContain("append-only");
      expect(source).toContain("scoped,");
      expect(source).toContain("read-only");
    }
    expect(transferSource.indexOf("FOR UPDATE OF t")).toBeLessThan(
      transferSource.indexOf('FROM "InventoryMovement" movement')
    );
    expect(countSource.indexOf("FOR UPDATE OF session")).toBeLessThan(
      countSource.indexOf('FROM "InventoryMovement" movement')
    );
    expect(countSource.indexOf("FOR UPDATE OF attempt")).toBeLessThan(
      countSource.indexOf('FROM "InventoryMovement" movement')
    );
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
    const decisionSurface = getApprovalDecisionSurfaceContract("ExpenseRequest");

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
    expect(decisionSurface.decisions.map((entry) => entry.label)).toEqual([
      "Approve Expense Request",
      "Return for Revision",
      "Reject Expense Request"
    ]);
  });

  test("approval inbox supports non-posting cash advance request decisions", () => {
    const serviceSource = readFileSync(path.resolve(__dirname, "approvals.ts"), "utf8");
    const decisionSurface = getApprovalDecisionSurfaceContract("CashAdvanceRequest");

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
    expect(decisionSurface.decisions.map((entry) => entry.label)).toEqual([
      "Approve Cash Advance",
      "Return for Revision",
      "Reject Cash Advance"
    ]);
  });

  test("approval inbox supports non-posting petty cash request decisions", () => {
    const serviceSource = readFileSync(path.resolve(__dirname, "approvals.ts"), "utf8");
    const pettyCashSource = readFileSync(
      path.resolve(__dirname, "pettyCash.ts"),
      "utf8"
    );
    const decisionSurface = getApprovalDecisionSurfaceContract("PettyCashRequest");

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
    expect(decisionSurface.decisions.map((entry) => entry.label)).toEqual([
      "Approve Petty Cash",
      "Return for Revision",
      "Reject Petty Cash"
    ]);
  });

  test("approval inbox supports non-posting payment request decisions", () => {
    const serviceSource = readFileSync(path.resolve(__dirname, "approvals.ts"), "utf8");
    const decisionSurface = getApprovalDecisionSurfaceContract("PaymentRequest");

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
    expect(decisionSurface.decisions).toEqual([
      expect.objectContaining({
        label: "Approve Payment Request",
        available: false,
        disabledReasonCode: "PAYMENT_REQUEST_APPROVAL_POLICY_UNCONFIRMED"
      }),
      expect.objectContaining({ label: "Return for Revision", available: true }),
      expect.objectContaining({ label: "Reject Payment Request", available: true })
    ]);
  });

  test("approval inbox supports non-posting payment release decisions", () => {
    const serviceSource = readFileSync(path.resolve(__dirname, "approvals.ts"), "utf8");
    const decisionSurface = getApprovalDecisionSurfaceContract("PaymentRelease");

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
    expect(decisionSurface.decisions.map((entry) => entry.label)).toEqual([
      "Approve Payment Release",
      "Reject Payment Release"
    ]);
  });

  test("approval inbox supports sensitive period close decisions", () => {
    const serviceSource = readFileSync(path.resolve(__dirname, "approvals.ts"), "utf8");
    const decisionSurface = getApprovalDecisionSurfaceContract("FinanceCloseRun");

    expect(serviceSource).toContain("FinanceCloseRun");
    expect(serviceSource).toContain("readFinanceClosePendingApproval");
    expect(serviceSource).toContain("approveFinanceCloseRunApproval");
    expect(serviceSource).toContain("rejectFinanceCloseRunApproval");
    expect(serviceSource).toContain("PERIOD_CLOSE_APPROVAL_RETURN_NOT_SUPPORTED");
    expect(serviceSource).toContain("Period close lock");
    expect(serviceSource).toContain("Period reopen");
    expect(serviceSource).toContain("Company period close");
    expect(decisionSurface.decisions.map((entry) => entry.label)).toEqual([
      "Approve Period Action",
      "Reject Period Action"
    ]);
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
    expect(serviceSource).toContain("lockEmployeeLeaveApprovalSource");
    expect(serviceSource).toContain('FOR UPDATE OF request');
    expect(serviceSource).toContain('acquireApprovalProducerBarrierShared');
    expect(serviceSource).toContain('updatedAt: lockedSource.source.updatedAt');
    expect(serviceSource).toContain('approvalInstanceId: approval.id');
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
    expect(serviceSource).toContain("lockEmployeeOvertimeApprovalSource");
    expect(serviceSource).toContain("acquireApprovalProducerBarrierShared");
    expect(serviceSource).toContain('approvalInstanceId: approval.id');
    expect(serviceSource).toContain('updatedAt: lockedSource.source.updatedAt');
    expect(serviceSource).toContain('FOR UPDATE OF record');
    expect(serviceSource).toContain('FOR UPDATE OF ai');
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
    const decisionSurface = getApprovalDecisionSurfaceContract("AttendanceImportBatch");

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
    expect(decisionSurface.decisions.map((entry) => entry.label)).toEqual([
      "Approve Attendance Review",
      "Return for Revision",
      "Reject Attendance Review"
    ]);
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
    expect(activationSource).toContain("approvalInstanceStep.findFirst");
    expect(activationSource).toContain(
      "routing.routingSchemaVersion === APPROVAL_ROUTING_SCHEMA_VERSION"
    );
    expect(activationSource).toContain('status: "WAITING"');
    expect(activationSource).toContain("routingSchemaVersion: 0");
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

  test("quotation recommendation terminal decisions lock lineage and source CAS", () => {
    expect(serviceSource).toContain("lockQuotationRecommendationApprovalSource");
    expect(serviceSource).toContain('documentType: "QuotationRecommendation"');
    expect(serviceSource).toContain('FOR UPDATE OF recommendation');
    expect(serviceSource).toContain('FOR UPDATE OF qr');
    expect(serviceSource).toContain('FOR UPDATE OF pr');
    expect(serviceSource).toContain('updatedAt: lockedSource.source.updatedAt');
    expect(serviceSource).toContain('version: lockedSource.source.version');
  });

  test("wastage terminal decisions lock source scope and CAS before graph closure", () => {
    expect(serviceSource).toContain("lockWastageApprovalSource");
    expect(serviceSource).toContain('documentType: "WastageReport"');
    expect(serviceSource).toContain('FOR UPDATE OF report');
    expect(serviceSource).toContain('FOR SHARE OF inventoryLocation');
    expect(serviceSource).toContain('updatedAt: lockedSource.source.updatedAt');
    expect(serviceSource).toContain('inventoryLocationId: lockedSource.source.inventoryLocationId');
  });

  test("wastage approval locks source scope and final source CAS", () => {
    const source = extractFunctionSource(serviceSource, "approveWastageReport");
    expect(source).toContain("lockWastageApprovalSource");
    expect(source).toContain('documentType: "WastageReport"');
    expect(source).toContain('updatedAt: lockedSource.source.updatedAt');
    expect(source).toContain('inventoryLocationId: lockedSource.source.inventoryLocationId');
    expect(source).toContain("nonPostingApproval");
  });

  test("quotation recommendation approval locks lineage and final source CAS", () => {
    const source = extractFunctionSource(serviceSource, "approveQuotationRecommendation");
    expect(source).toContain("lockQuotationRecommendationApprovalSource");
    expect(source).toContain('documentType: "QuotationRecommendation"');
    expect(source).toContain('FOR UPDATE OF ai');
    expect(source).toContain('version: lockedSource.source.version');
    expect(source).toContain('updatedAt: lockedSource.source.updatedAt');
    expect(source).toContain('quotationRequestId: lockedSource.source.quotationRequestId');
  });

  test("stock adjustment terminal decisions lock source scope and CAS", () => {
    const source = extractFunctionSource(serviceSource, "closeStockAdjustmentWithDecision");
    expect(source).toContain("lockStockAdjustmentApprovalSource");
    expect(source).toContain('documentType: "StockAdjustment"');
    expect(source).toContain('FOR UPDATE OF ai');
    expect(source).toContain('updatedAt: lockedSource.source.updatedAt');
    expect(source).toContain('inventoryLocationId: lockedSource.source.inventoryLocationId');
  });

  test("stock adjustment approval locks lines and preserves non-posting source CAS", () => {
    const source = extractFunctionSource(serviceSource, "approveStockAdjustment");
    expect(source).toContain("lockStockAdjustmentApprovalSource");
    expect(source).toContain('documentType: "StockAdjustment"');
    expect(source).toContain('FOR UPDATE OF line');
    expect(source).toContain("STOCK_ADJUSTMENT_LINES_NOT_APPROVABLE");
    expect(source).toContain('updatedAt: lockedSource.source.updatedAt');
    expect(source).toContain('inventoryLocationId: lockedSource.source.inventoryLocationId');
    expect(source).toContain("nonPostingApproval");
  });

  test("purchase order terminal decisions lock procurement lineage and source CAS", () => {
    const source = extractFunctionSource(serviceSource, "closePurchaseOrderWithDecision");
    expect(source).toContain("lockPurchaseOrderApprovalSource");
    expect(source).toContain('documentType: "PurchaseOrder"');
    expect(source).toContain('FOR UPDATE OF ai');
    expect(source).toContain('updatedAt: lockedSource.updatedAt');
    expect(source).toContain('purchaseRequestId: lockedSource.purchaseRequestId');
    expect(source).toContain('quotationRecommendationId: lockedSource.quotationRecommendationId');
  });

  test("purchase order approval locks lineage and preserves final budget projection", () => {
    const source = extractFunctionSource(serviceSource, "approvePurchaseOrder");
    expect(source).toContain("lockPurchaseOrderApprovalSource");
    expect(source).toContain('documentType: "PurchaseOrder"');
    expect(source).toContain('updatedAt: lockedSource.updatedAt');
    expect(source).toContain('quotationRecommendationId: lockedSource.quotationRecommendationId');
    expect(source).toContain("projectPurchaseOrderBudgetCommitments");
    expect(source).not.toContain("issuePurchaseOrderToSupplier");
  });

  test("PO balance-closure terminal decisions lock graph, child, and parent without parent mutation", () => {
    const source = extractFunctionSource(
      serviceSource,
      "closePurchaseOrderBalanceClosureWithDecision"
    );
    expect(source).toContain('documentType: "PurchaseOrderBalanceClosure"');
    expect(source).toContain('FOR UPDATE OF ai');
    expect(source).toContain('FOR UPDATE OF closure');
    expect(source).toContain('FOR SHARE OF po');
    expect(source).toContain("updatedAt: lockedClosure.updatedAt");
    expect(source).toContain("noPurchaseOrderMutation: true");
    expect(source).not.toContain("purchaseOrderLine.update");
    expect(source).not.toContain('status: "CLOSED"');
  });

  test("PO amendment terminal decisions lock graph, child, lines, receipts, and parent CAS", () => {
    const source = extractFunctionSource(
      serviceSource,
      "closePurchaseOrderAmendmentWithDecision"
    );
    expect(source).toContain('documentType: "PurchaseOrderAmendment"');
    expect(source).toContain('FOR UPDATE OF ai');
    expect(source).toContain('FOR UPDATE OF amendment');
    expect(source).toContain('FOR UPDATE OF line');
    expect(source).toContain('FOR UPDATE OF receipt');
    expect(source).toContain('FOR UPDATE OF po');
    expect(source).toContain("updatedAt: lockedAmendment.updatedAt");
    expect(source).toContain("updatedAt: lockedOrder.updatedAt");
    expect(source).not.toContain("purchaseOrderLine.update");
  });

  test("expense terminal decisions lock source and lines in legacy and normalized modes", () => {
    const helper = extractFunctionSource(
      serviceSource,
      "lockAndRevalidateExpenseApprovalSource"
    );
    const terminal = extractFunctionSource(
      serviceSource,
      "closeExpenseRequestWithDecision"
    );
    expect(helper).toContain("ExpenseRequestLine");
    expect(helper).toContain("FOR UPDATE OF request");
    expect(helper).toContain("FOR UPDATE OF line");
    expect(helper).toContain("APPROVAL_SOURCE_CHANGED");
    expect(terminal).toContain("version: lockedRequest.version");
    expect(terminal).toContain("noPaymentCreation: true");
    expect(terminal).toContain("noJournalPosting: true");
  });

  test("cash advance terminal decisions lock source children and beneficiary SOD in legacy mode", () => {
    const helper = extractFunctionSource(
      serviceSource,
      "lockAndRevalidateCashAdvanceApprovalSource"
    );
    const terminal = extractFunctionSource(
      serviceSource,
      "closeCashAdvanceRequestWithDecision"
    );
    expect(helper).toContain("CashAdvanceMovement");
    expect(helper).toContain("CashAdvanceLiquidation");
    expect(helper).toContain("FOR UPDATE OF movement");
    expect(helper).toContain("FOR UPDATE OF liquidation");
    expect(helper).toContain("beneficiaryUserId");
    expect(terminal).toContain("version: lockedRequest.version");
    expect(terminal).toContain("noBankMutation: true");
    expect(terminal).toContain("noApSettlement: true");
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

      expect(handlerSource).toMatch(
        /await (?:runReviewedApprovalTransaction|prisma\.\$transaction)/,
      );
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
        expect(handlerSource).toContain(actor === "request.requesterUserId"
          ? "source.requesterUserId"
          : actor);
      }
    }
  });

  test("purchase request decisions lock the source before graph work and CAS the version", () => {
    const lockSource = extractFunctionSource(
      serviceSource,
      "lockPurchaseRequestApprovalSource"
    );
    expect(lockSource).toContain('FROM "PurchaseRequest" request');
    expect(lockSource).toContain("FOR UPDATE OF request");
    expect(lockSource).toContain('source.status !== "PENDING_APPROVAL"');
    expect(lockSource).toContain("source.currentApprovalStep !== input.stepOrder");

    for (const handlerName of ["approvePurchaseRequest", "closeWithDecision"]) {
      const handlerSource = extractFunctionSource(serviceSource, handlerName);
      expect(handlerSource).toContain("acquireApprovalProducerBarrierShared");
      expect(handlerSource).toContain("lockPurchaseRequestApprovalSource");
      expect(handlerSource).toContain("version: source.version");
      const sourceLockAt = handlerSource.indexOf("lockPurchaseRequestApprovalSource");
      const graphAt = handlerSource.indexOf(
        handlerName === "approvePurchaseRequest"
          ? "approveCurrentStepAndAdvance"
          : "closeCurrentApprovalDecision"
      );
      expect(sourceLockAt).toBeGreaterThanOrEqual(0);
      expect(graphAt).toBeGreaterThan(sourceLockAt);
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

  test("approval worklist uses server pagination, an explicit bounded mode, and no passive tabs", () => {
    const pageSource = readFileSync(
      path.resolve(__dirname, "../../app/(app)/approvals/page.tsx"),
      "utf8"
    );

    expect(pageSource).toContain("approvalWorklistMode()");
    expect(pageSource).toContain("listNormalizedApprovalInboxPage");
    expect(pageSource).toContain("listBoundedInventoryUatApprovalQueuePage");
    expect(pageSource).toContain('view: "DUE_SOON"');
    expect(pageSource).toContain("APPROVAL_WORKLIST_SOURCE_NOT_READY");
    expect(pageSource).toContain('redirect("/approvals?error=APPROVAL_AUTHORITY_STALE&stale=1")');
    expect(pageSource).toContain("ActionFeedbackBanner");
    expect(pageSource).toContain("Approval Inbox unavailable");
    expect(pageSource).toContain("Inventory Control UAT Approval Worklist");
    expect(pageSource).toContain('code !== "APPROVAL_ROUTING_BACKFILL_REQUIRED"');
    expect(pageSource).toContain('code !== "APPROVAL_ROUTING_V1_DISABLED"');
    expect(pageSource).not.toContain("listPendingApprovals(session)");
    expect(pageSource).not.toContain('label: "Returned"');
    expect(pageSource).not.toContain('label: "Audit"');
  });

  test("bounded approval queue batches source projections without hydrating full detail per row", () => {
    const queueSource = extractFunctionSource(
      serviceSource,
      "listBoundedInventoryUatApprovalQueuePage",
    );
    const pageSource = readFileSync(
      path.resolve(__dirname, "../../app/(app)/approvals/page.tsx"),
      "utf8",
    );

    expect(queueSource).toContain("listBoundedInventoryUatApprovalWorklistPage");
    expect(queueSource).toContain("normalizeApprovalRoutingPage(input)");
    expect(queueSource).toContain("page: 1, pageSize: 100");
    expect(queueSource).toContain(
      "eligiblePage.totalItems !== eligiblePage.items.length",
    );
    expect(queueSource).toContain("items.slice(");
    expect(queueSource).toContain("Promise.all");
    expect(queueSource).toContain("purchaseRequest.findMany");
    expect(queueSource).toContain("stockCountAttempt.findMany");
    expect(queueSource).toContain("stockCountAttemptLine.findMany");
    expect(queueSource).toContain('distinct: ["stockCountAttemptId"]');
    expect(queueSource).not.toContain(
      "lines: { select: { countedByUserId: true } }",
    );
    expect(queueSource).toContain(
      'throw new Error("APPROVAL_WORKLIST_SOURCE_NOT_READY")',
    );
    expect(
      queueSource.match(
        /requiredDate: eligible\.dueAt \?\? "Not scheduled"/g,
      ),
    ).toHaveLength(7);
    expect(queueSource.match(/sourceRequiredDate:/g)).toHaveLength(7);
    expect(queueSource).not.toContain("slaStatus");
    expect(queueSource).not.toContain("hasStaleSource");
    expect(queueSource).not.toContain("getApprovalDetail");
    expect(pageSource).not.toContain(
      "getBoundedInventoryUatApprovalWorklistDetail",
    );
  });

  test("approval detail uses the bounded typed review while preserving the global detail", () => {
    const detailSource = readFileSync(
      path.resolve(__dirname, "../../app/(app)/approvals/[id]/page.tsx"),
      "utf8"
    );

    expect(detailSource).toContain("Comments are read-only here for this approval type");
    expect(detailSource).toContain("authoritative source workspace");
    expect(detailSource).toContain("No audit events recorded yet.");
    expect(detailSource).toContain("approvalWorklistMode()");
    expect(detailSource).toContain("assertTrustedServerActionOrigin()");
    expect(detailSource).toContain("getBoundedInventoryUatApprovalReview");
    expect(detailSource).toContain("BoundedApprovalReviewPanel");
    expect(detailSource).toContain("APPROVAL_DECISION_APPROVED");
    expect(detailSource).toContain("APPROVAL_DECISION_RETURNED");
    expect(detailSource).toContain("APPROVAL_DECISION_REJECTED");
    expect(detailSource).toContain('revalidatePath("/transfers")');
    expect(detailSource).toContain('revalidatePath("/counts")');
    expect(detailSource).toContain('revalidatePath("/wastage")');
    expect(detailSource).not.toContain("addPurchaseRequestComment");
    expect(detailSource).not.toContain("Add Comment");
    expect(detailSource).toContain(
      'redirect("/approvals?error=APPROVAL_WORKLIST_ITEM_UNAVAILABLE&stale=1")',
    );
    expect(detailSource).toContain(
      'redirect("/approvals?error=APPROVAL_ROUTING_V1_DISABLED")'
    );
  });

  test("bounded Inventory Control UAT worklist is closed to its seven confirmed families", () => {
    const boundedSource = readFileSync(
      path.resolve(__dirname, "boundedApprovalWorklist.ts"),
      "utf8",
    );
    const worklistSource = extractFunctionSource(
      serviceSource,
      "listBoundedInventoryUatApprovalWorklistPage",
    );
    const browserDecisionSource = extractFunctionSource(
      serviceSource,
      "executeEligibleApprovalDecision",
    );

    expect(boundedSource).toContain("isBoundedUatEvidenceRuntimeRequested");
    expect(boundedSource).toContain("!normalizedApprovalRoutingEnabled()");
    for (const family of [
      "PurchaseRequest",
      "QuotationRecommendation",
      "PurchaseOrder",
      "InventoryTransfer",
      "StockCountAttemptReview",
      "WastageReport",
      "StockAdjustment",
    ]) {
      expect(boundedSource).toContain(`"${family}"`);
    }
    expect(worklistSource).toContain("documentTypes: boundedInventoryUatApprovalFamilies");
    expect(browserDecisionSource).toContain("assertBoundedInventoryUatApprovalCommand");
    expect(browserDecisionSource.indexOf("assertBoundedInventoryUatApprovalCommand")).toBeLessThan(
      browserDecisionSource.indexOf("listEligibleApprovalStepPage"),
    );
    expect(browserDecisionSource).toContain("approvalInstanceId,");
    expect(browserDecisionSource).toContain("verifyApprovalReviewToken");
    expect(browserDecisionSource).toContain("documentTypes: [reviewClaims.family]");
    expect(browserDecisionSource).toContain("family: eligible.documentType");
    expect(browserDecisionSource).toContain("APPROVAL_WORKLIST_ITEM_UNAVAILABLE");
    expect(serviceSource).toContain(
      "Prisma.TransactionIsolationLevel.Serializable",
    );
    expect(
      serviceSource.match(/runReviewedApprovalTransaction\(async/g),
    ).toHaveLength(13);
    expect(
      serviceSource.match(/acquireApprovalReviewDecisionAggregateFences\(tx/g),
    ).toHaveLength(13);
    for (const reviewedTransaction of serviceSource
      .split("runReviewedApprovalTransaction(async (tx) => {")
      .slice(1)) {
      expect(
        reviewedTransaction.indexOf(
          "acquireApprovalReviewDecisionAggregateFences(tx",
        ),
      ).toBeLessThan(
        reviewedTransaction.indexOf("acquireApprovalProducerBarrierShared(tx"),
      );
    }
    expect(serviceSource).toContain("isApprovalReviewSerializationFailure");
    expect(serviceSource).toContain('candidate.meta?.code === "40001"');
    expect(serviceSource).toContain('throw new Error("APPROVAL_REVIEW_STALE")');
    const reviewedTransactionAt = serviceSource.indexOf(
      "async function runReviewedApprovalTransaction",
    );
    const serializationMapAt = serviceSource.indexOf(
      "isApprovalReviewSerializationFailure(error)",
      reviewedTransactionAt,
    );
    const staleErrorAt = serviceSource.indexOf(
      'throw new Error("APPROVAL_REVIEW_STALE")',
      serializationMapAt,
    );
    expect(reviewedTransactionAt).toBeGreaterThanOrEqual(0);
    expect(serializationMapAt).toBeGreaterThan(reviewedTransactionAt);
    expect(staleErrorAt).toBeGreaterThan(serializationMapAt);
    const authoritySource = extractFunctionSource(
      serviceSource,
      "normalizedDecisionAuthorityRequired",
    );
    expect(authoritySource).toContain("boundedInventoryUatApprovalWorklistEnabled");
    expect(authoritySource).toContain("isBoundedInventoryUatApprovalFamily");
    expect(authoritySource).toContain('status: "PENDING"');

    const detailPageSource = readFileSync(
      path.resolve(__dirname, "../../app/(app)/approvals/[id]/page.tsx"),
      "utf8",
    );
    const composerSource = readFileSync(
      path.resolve(__dirname, "../../components/ApprovalDecisionComposer.tsx"),
      "utf8",
    );
    expect(detailPageSource).toContain("executeEligibleApprovalDecision");
    expect(detailPageSource).not.toContain('formData.get("approvalKind")');
    expect(composerSource).not.toContain('name="approvalKind"');
    expect(composerSource).toContain('name="reviewToken"');
    expect(serviceSource).toContain('eventType: "approval.review_snapshot_verified"');
    expect(serviceSource).toContain("reviewTokenPersisted: false");
  });

  test("bounded detail uses the exact normalized eligible-step projection", () => {
    const boundedDetailSource = extractFunctionSource(
      serviceSource,
      "getBoundedInventoryUatApprovalWorklistDetail",
    );
    const detailSource = extractFunctionSource(serviceSource, "getApprovalDetail");

    expect(boundedDetailSource).toContain(
      "documentTypes: boundedInventoryUatApprovalFamilies",
    );
    expect(boundedDetailSource).toContain("approvalInstanceId,");
    expect(boundedDetailSource).toContain(
      "eligibilityProof: boundedDetailEligibilityProof",
    );
    expect(boundedDetailSource).toContain('"APPROVAL_SCOPE_DENIED"');
    expect(boundedDetailSource).toContain('"APPROVAL_AUTHORITY_STALE"');
    expect(detailSource).toContain("approvalInstanceStep.findFirst");
    expect(detailSource).toContain("approvalInstanceStepId: currentStep.id");
    expect(detailSource).toContain("listEligibleApprovalStepPage");
    expect(detailSource).toContain("eligiblePage.totalItems !== 1");
    const routingSource = readFileSync(
      path.resolve(__dirname, "approvalRouting.ts"),
      "utf8",
    );
    expect(routingSource).toContain("INVENTORY_TRANSFER_APPROVAL_V1_ENABLED");
    expect(routingSource).toContain("STOCK_COUNT_ATTEMPT_REVIEW_APPROVAL_V1_ENABLED");
    expect(routingSource).toContain("InventoryTransferApprovalSubmissionIntent");
    expect(routingSource).toContain("StockCountReviewSubmissionIntent");
    expect(routingSource).toContain('activation.status = intent."activationStatus"');
  });

  test("transfer and stock-count worklist details enforce scope and privileged MFA", () => {
    const transferDetail = extractFunctionSource(serviceSource, "getApprovalDetail");
    const transferDecision = extractFunctionSource(serviceSource, "approveInventoryTransferApproval");
    const countDecision = extractFunctionSource(serviceSource, "approveStockCountAttemptReviewApproval");

    expect(transferDetail).toContain('approval.documentType === "InventoryTransfer"');
    expect(transferDetail).toContain('approval.documentType === "StockCountAttemptReview"');
    expect(transferDetail).toContain("await assertApprovalScope(session, transfer.destinationLocationId)");
    expect(transferDecision).toContain("assertPrivilegedMfaForAction(session");
    expect(countDecision).toContain("assertPrivilegedMfaForAction(session");
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

  test("payment request terminal decisions lock lines and invoices and reject downstream release state", () => {
    const helper = extractFunctionSource(
      serviceSource,
      "lockAndRevalidatePaymentRequestTerminalSource"
    );
    const terminal = extractFunctionSource(
      serviceSource,
      "closePaymentRequestWithDecision"
    );
    expect(helper).toContain("PaymentRequestLine");
    expect(helper).toContain("ApInvoice");
    expect(helper).toContain("PaymentRelease");
    expect(helper).toContain("PAYMENT_REQUEST_RELEASE_STATE_CONFLICT");
    expect(helper).toContain("FOR UPDATE OF request");
    expect(helper).toContain("FOR UPDATE OF line");
    expect(terminal).toContain('documentType: "PaymentRequest"');
    expect(terminal).toContain("updatedAt: lockedRequest.updatedAt");
    expect(terminal).toContain("noApInvoiceMutation");
    expect(terminal).toContain("noPaymentRelease");
  });

  test("payment request approval revalidates the source perimeter before graph decisions", () => {
    const approve = extractFunctionSource(
      serviceSource,
      "approvePaymentRequestApproval"
    );
    expect(approve).toContain('documentType: "PaymentRequest"');
    expect(approve).toContain("lockAndRevalidatePaymentRequestTerminalSource");
    expect(approve).toContain("updatedAt: lockedRequest.updatedAt");
    expect(approve).toContain("approvalInstanceId: approval.id");
    expect(approve).toContain("noPaymentRelease");
    expect(approve).toContain("noJournalPosting");
    expect(approve.indexOf("lockAndRevalidatePaymentRequestTerminalSource")).toBeLessThan(
      approve.indexOf("prepareSpecializedApprovalDecisionAuthority")
    );
  });

  test("petty cash terminal decisions harden legacy source and cash-activity boundaries", () => {
    const helper = extractFunctionSource(
      serviceSource,
      "lockAndRevalidateLegacyPettyCashTerminalSource"
    );
    const activity = extractFunctionSource(
      serviceSource,
      "assertPettyCashTerminalNoActivity"
    );
    const terminal = extractFunctionSource(
      serviceSource,
      "closePettyCashRequestWithDecision"
    );
    expect(helper).toContain('documentType !== "PettyCashRequest"');
    expect(helper).toContain('FROM "PettyCashRequest" request');
    expect(helper).toContain('FOR UPDATE OF ai');
    expect(helper).toContain('FOR UPDATE OF request');
    expect(helper).toContain('FOR SHARE OF fund, location');
    expect(helper).toContain('FROM "PettyCashLedgerEntry" entry');
    expect(helper).toContain('FROM "NonSupplierDisbursementRequest" disbursement');
    expect(helper).toContain("PETTY_CASH_REQUEST_CASH_ACTIVITY_CONFLICT");
    expect(activity).toContain("FOR UPDATE OF entry");
    expect(activity).toContain("FOR UPDATE OF disbursement");
    expect(terminal).toContain('documentType: "PettyCashRequest"');
    expect(terminal).toContain("legacyLockedSource.updatedAt");
    expect(terminal).toContain("noPaymentCreation");
    expect(terminal).toContain("noPaymentRelease");
  });

  test("budget revision approval and rejection share locked source and scope perimeter", () => {
    const helper = extractFunctionSource(
      serviceSource,
      "lockBudgetRevisionTerminalSource"
    );
    const approve = extractFunctionSource(serviceSource, "approveBudgetRevision");
    const reject = extractFunctionSource(
      serviceSource,
      "closeBudgetRevisionWithDecision"
    );
    expect(helper).toContain('documentType !== "BudgetRevision"');
    expect(helper).toContain('FROM "BudgetRevision" revision');
    expect(helper).toContain('FOR UPDATE OF revision');
    expect(helper).toContain('FROM "Budget" budget');
    expect(helper).toContain('FROM "BudgetLine" line');
    expect(helper).toContain('FOR SHARE OF location');
    expect(helper).toContain("hasBudgetApprovalScope");
    expect(helper).toContain("SELF_APPROVAL_BLOCKED");
    for (const source of [approve, reject]) {
      expect(source).toContain('documentType: "BudgetRevision"');
      expect(source).toContain("lockBudgetRevisionTerminalSource");
      expect(source).toContain("updatedAt: lockedRevision.updatedAt");
    }
    expect(reject).toContain("noBudgetLineMutation");
    expect(reject).toContain("noCommitmentMutation");
    expect(reject).not.toContain("budgetLine.update");
  });
});
