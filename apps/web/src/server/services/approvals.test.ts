import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { approvalReminderKind } from "./approvals";

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
    const detailPageSource = readFileSync(
      path.resolve(__dirname, "../../app/(app)/approvals/[id]/page.tsx"),
      "utf8"
    );

    expect(serviceSource).toContain("ExpenseRequest");
    expect(serviceSource).toContain("findActionableExpenseRequestApproval");
    expect(serviceSource).toContain("approveExpenseRequest");
    expect(serviceSource).toContain("closeExpenseRequestWithDecision");
    expect(serviceSource).toContain("expense_request.approved");
    expect(serviceSource).toContain("expense_request.returned");
    expect(serviceSource).toContain("expense_request.rejected");
    expect(serviceSource).toContain("EXPENSE_REQUEST_BUDGET_OVERRIDE_REASON_REQUIRED");
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
    const detailPageSource = readFileSync(
      path.resolve(__dirname, "../../app/(app)/approvals/[id]/page.tsx"),
      "utf8"
    );

    expect(serviceSource).toContain("PettyCashRequest");
    expect(serviceSource).toContain("findActionablePettyCashRequestApproval");
    expect(serviceSource).toContain("approvePettyCashRequest");
    expect(serviceSource).toContain("closePettyCashRequestWithDecision");
    expect(serviceSource).toContain("petty_cash.request_approved");
    expect(serviceSource).toContain("petty_cash.request_returned");
    expect(serviceSource).toContain("petty_cash.request_rejected");
    expect(serviceSource).toContain("PETTY_CASH_REQUEST_EVIDENCE_REQUIRED");
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
