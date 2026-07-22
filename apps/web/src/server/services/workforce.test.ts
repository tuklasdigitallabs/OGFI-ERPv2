import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildWorkforceProductionReadinessRows,
  buildWorkforceReportRows
} from "./workforce";

const workforceServiceSource = readFileSync(
  path.resolve(__dirname, "workforce.ts"),
  "utf8"
);
const workforcePageSource = readFileSync(
  path.resolve(__dirname, "../../app/(app)/workforce/page.tsx"),
  "utf8"
);

describe("workforce foundation controls", () => {
  it("builds export-ready workforce report rows for schedule and attendance review", () => {
    const reportRows = buildWorkforceReportRows({
      schedules: [
        {
          id: "schedule-1",
          publicReference: "SCH-001",
          locationName: "Yakiniku Like SM North Edsa",
          scheduleDate: "2026-07-08",
          shiftType: "OPENING",
          status: "DRAFT",
          plannedHeadcount: 5,
          assignedHeadcount: 4,
          coverageGapCount: 1,
          plannedHours: "8h",
          lineCount: 5,
          gapStations: ["GRILL / Cook"]
        }
      ],
      attendanceImports: [
        {
          id: "attendance-1",
          publicReference: "ATT-001",
          locationName: "Yakiniku Like SM North Edsa",
          businessDate: "2026-07-08",
          sourceType: "CSV_UPLOAD",
          sourceReference: "clock-export.csv",
          status: "REVIEW_REQUIRED",
          rowCount: 10,
          acceptedCount: 8,
          exceptionCount: 1,
          duplicateCount: 1,
          lineCount: 10
        }
      ]
    });

    expect(reportRows).toHaveLength(2);
    expect(reportRows[0]?.issueState).toBe("NEEDS_REVIEW");
    expect(reportRows.some((row) => row.issueLabels.length > 0)).toBe(true);
    expect(
      reportRows.some((row) => row.issueLabels.includes("1 coverage gap"))
    ).toBe(true);
    expect(
      reportRows.some((row) =>
        row.issueLabels.includes("Gap stations: GRILL / Cook")
      )
    ).toBe(true);
    expect(
      reportRows.some((row) =>
        row.issueLabels.includes("1 attendance exception")
      )
    ).toBe(true);
    expect(
      reportRows.some((row) => row.issueLabels.includes("1 duplicate row"))
    ).toBe(true);
    expect(
      reportRows.some((row) =>
        row.exportSafeSummary.includes("attendance exception")
      )
    ).toBe(true);
    expect(workforcePageSource).toContain("row.issueLabels");
    expect(workforcePageSource).toContain("No readiness issue flagged");
  });

  it("marks clean workforce report rows without payroll or attendance-device effects", () => {
    const reportRows = buildWorkforceReportRows({
      schedules: [
        {
          id: "schedule-2",
          publicReference: "SCH-002",
          locationName: "Yakiniku Like SM North Edsa",
          scheduleDate: "2026-07-09",
          shiftType: "CLOSING",
          status: "PUBLISHED",
          plannedHeadcount: 4,
          assignedHeadcount: 4,
          coverageGapCount: 0,
          plannedHours: "8h",
          lineCount: 4,
          gapStations: []
        }
      ],
      attendanceImports: []
    });

    expect(reportRows[0]).toMatchObject({
      issueState: "CLEAN",
      issueCount: 0,
      issueLabels: []
    });
    expect(reportRows[0]?.exportSafeSummary).toContain(
      "No workforce readiness issue flagged"
    );
  });

  it("builds workforce production readiness rows without payroll or attendance-device effects", () => {
    const reportRows = buildWorkforceReportRows({
      schedules: [
        {
          id: "schedule-1",
          publicReference: "SCH-001",
          locationName: "Yakiniku Like SM North Edsa",
          scheduleDate: "2026-07-08",
          shiftType: "OPENING",
          status: "DRAFT",
          plannedHeadcount: 5,
          assignedHeadcount: 4,
          coverageGapCount: 1,
          plannedHours: "8h",
          lineCount: 5,
          gapStations: ["GRILL / Cook"]
        }
      ],
      attendanceImports: [
        {
          id: "attendance-1",
          publicReference: "ATT-001",
          locationName: "Yakiniku Like SM North Edsa",
          businessDate: "2026-07-08",
          sourceType: "CSV_UPLOAD",
          sourceReference: "clock-export.csv",
          status: "REVIEW_REQUIRED",
          rowCount: 10,
          acceptedCount: 8,
          exceptionCount: 1,
          duplicateCount: 1,
          lineCount: 10
        }
      ]
    });
    const readinessRows = buildWorkforceProductionReadinessRows({
      reportRows,
      readiness: [
        {
          id: "document-1",
          employeeName: "Bianca Reyes",
          type: "Document",
          label: "food handler certificate",
          status: "EXPIRED",
          validUntil: "2026-06-30",
          requiredForScope: true
        }
      ]
    });

    expect(readinessRows.map((row) => row.sourceType)).toEqual([
      "Attendance Import",
      "Document",
      "Schedule"
    ]);
    expect(readinessRows[0]).toMatchObject({
      severity: "HIGH",
      issueLabel: "Attendance import has exceptions or duplicates"
    });
    expect(readinessRows[1]).toMatchObject({
      blockerId: "P3-BLOCK-002",
      issueLabel: "Document readiness is expired"
    });
    expect(workforcePageSource).toContain("Workforce Production Readiness");
    expect(workforcePageSource).toContain("dashboard.productionReadinessRows");
  });

  it("enforces permission and scoped location reads in the service layer", () => {
    expect(workforceServiceSource).toContain("requireWorkforceAccess");
    expect(workforceServiceSource).toContain("requireAnyPermission");
    expect(workforceServiceSource).toContain("requirePermission");
    expect(workforceServiceSource).toContain("loadWorkforceScopeSnapshot");
    expect(workforceServiceSource).toContain("userScopeAssignment.findMany");
    expect(workforceServiceSource).not.toContain("session.authorizedLocations");
    expect(workforceServiceSource).toContain(
      "locationId: { in: allowedLocationIds }"
    );
  });

  it("keeps payroll and sensitive document details out of the foundation workspace", () => {
    expect(workforcePageSource).toContain("No wages");
    expect(workforcePageSource).toContain("payroll exports");
    expect(workforcePageSource).toContain("journal posting");
    expect(workforceServiceSource).toContain("showConfidentialNames");
    expect(workforceServiceSource).toContain(
      "assignment.employee.employeeCode"
    );
    expect(workforceServiceSource).toContain("request.employee.employeeCode");
    expect(workforceServiceSource).toContain("record.employee.employeeCode");
    expect(workforceServiceSource).not.toContain("salary");
    expect(workforceServiceSource).not.toContain("payrollId");
    expect(workforceServiceSource).not.toContain("documentNumber:");
  });

  it("surfaces schedule and attendance-import evidence without payroll or finance posting", () => {
    expect(workforceServiceSource).toContain("workforceSchedule.findMany");
    expect(workforceServiceSource).toContain("attendanceImportBatch.findMany");
    expect(workforceServiceSource).toContain("WorkforceReportRow");
    expect(workforceServiceSource).toContain("WorkforceProductionReadinessRow");
    expect(workforceServiceSource).toContain("buildWorkforceReportRows");
    expect(workforceServiceSource).toContain(
      "buildWorkforceProductionReadinessRows"
    );
    expect(workforceServiceSource).toContain("exportSafeSummary");
    expect(workforceServiceSource).toContain(
      "locationId: { in: allowedLocationIds }"
    );
    expect(workforcePageSource).toContain("Schedules And Coverage");
    expect(workforcePageSource).toContain("Attendance Import Evidence");
    expect(workforcePageSource).toContain("Workforce Production Readiness");
    expect(workforcePageSource).toContain("Workforce Report Preview");
    expect(workforcePageSource).toContain("dashboard.reportRows");
    expect(workforcePageSource).toContain("dashboard.productionReadinessRows");
    expect(workforcePageSource).toContain("Evidence only");
    expect(workforceServiceSource).not.toContain("financeJournal.create");
    expect(workforceServiceSource).not.toContain("payroll.create");
  });

  it("defines bounded workforce action commands with scope, SoD, and audit", () => {
    expect(workforceServiceSource).toContain("createDraftLeaveRequest");
    expect(workforceServiceSource).toContain("createDraftOvertimeRecord");
    expect(workforceServiceSource).toContain("createDraftWorkforceSchedule");
    expect(workforceServiceSource).toContain("submitLeaveRequest");
    expect(workforceServiceSource).toContain("approveLeaveRequest");
    expect(workforceServiceSource).toContain("rejectLeaveRequest");
    expect(workforceServiceSource).toContain("cancelLeaveRequest");
    expect(workforceServiceSource).toContain("submitOvertimeRecord");
    expect(workforceServiceSource).toContain("approveOvertimeRecord");
    expect(workforceServiceSource).toContain("submitWorkforceSchedule");
    expect(workforceServiceSource).toContain("publishWorkforceSchedule");
    expect(workforceServiceSource).toContain("reviewAttendanceImportBatch");
    expect(workforceServiceSource).toContain("voidAttendanceImportBatch");
    expect(workforceServiceSource).toContain(
      "WORKFORCE_LEAVE_SELF_APPROVAL_BLOCKED"
    );
    expect(workforceServiceSource).toContain(
      "WORKFORCE_OVERTIME_SELF_APPROVAL_BLOCKED"
    );
    expect(workforceServiceSource).toContain(
      "WORKFORCE_SCHEDULE_SELF_APPROVAL_BLOCKED"
    );
    expect(workforceServiceSource).toContain(
      "WORKFORCE_SCHEDULE_COVERAGE_GAP_WAIVER_REASON_REQUIRED"
    );
    expect(workforceServiceSource).toContain(
      "WORKFORCE_SCHEDULE_COVERAGE_GAP_WAIVER_EVIDENCE_REQUIRED"
    );
    expect(workforceServiceSource).toContain("coverageGapWaiverRequired");
    expect(workforceServiceSource).toContain("writeWorkforceAudit");
  });

  it("uses granular workforce approval permissions for request decisions", () => {
    expect(workforceServiceSource).toContain("requireWorkforcePermission");
    expect(workforceServiceSource).toContain(
      "permissions.workforceLeaveApprove"
    );
    expect(workforceServiceSource).toContain(
      "permissions.workforceOvertimeApprove"
    );
    expect(workforcePageSource).toContain("canApproveLeave");
    expect(workforcePageSource).toContain("canApproveOvertime");
  });

  it("keeps workforce actions out of payroll, payment, and journal source records", () => {
    expect(workforceServiceSource).toContain("noPayrollComputation");
    expect(workforceServiceSource).toContain("noPayrollExport");
    expect(workforceServiceSource).toContain("noFinanceJournal");
    expect(workforceServiceSource).toContain("noAttendanceDeviceAuthority");
    expect(workforceServiceSource).not.toContain("paymentRequest.create");
    expect(workforceServiceSource).not.toContain("financeJournal.create");
    expect(workforceServiceSource).not.toContain("payrollExport");
    expect(workforceServiceSource).not.toContain("statutoryDeduction");
  });

  it("routes submitted leave through approval instances without payroll or finance effects", () => {
    expect(workforceServiceSource).toContain("findEmployeeLeaveApprovalRule");
    expect(workforceServiceSource).toContain(
      'documentType: "EmployeeLeaveRequest"'
    );
    expect(workforceServiceSource).toContain("approvalInstance.create");
    expect(workforceServiceSource).toContain(
      "approvalInstanceId: approvalInstance.id"
    );
    expect(workforceServiceSource).toContain(
      "recipientUserIds: firstStep.userId ? [firstStep.userId] : []"
    );
    expect(workforceServiceSource).toContain("APPROVE_WORKFORCE_LEAVE");
    expect(workforceServiceSource).toContain(
      "WORKFORCE_LEAVE_APPROVAL_RULE_NOT_CONFIGURED"
    );
    expect(workforceServiceSource).toContain(
      "WORKFORCE_LEAVE_ALREADY_SUBMITTED"
    );
    expect(workforceServiceSource).toContain("workforce.leave_approval_routed");
    expect(workforceServiceSource).toContain("noPayrollComputation");
    expect(workforceServiceSource).toContain("noPaymentRequest");
    expect(workforceServiceSource).toContain("noFinanceJournal");
  });

  it("routes submitted overtime through approval instances without payroll or finance effects", () => {
    expect(workforceServiceSource).toContain(
      "findEmployeeOvertimeApprovalRule"
    );
    expect(workforceServiceSource).toContain(
      'documentType: "EmployeeOvertimeRecord"'
    );
    expect(workforceServiceSource).toContain("APPROVE_WORKFORCE_OVERTIME");
    expect(workforceServiceSource).toContain(
      "WORKFORCE_OVERTIME_APPROVAL_RULE_NOT_CONFIGURED"
    );
    expect(workforceServiceSource).toContain(
      "WORKFORCE_OVERTIME_ALREADY_SUBMITTED"
    );
    expect(workforceServiceSource).toContain(
      "workforce.overtime_approval_routed"
    );
    expect(workforceServiceSource).toContain("noPayrollComputation");
    expect(workforceServiceSource).toContain("noPaymentRequest");
    expect(workforceServiceSource).toContain("noFinanceJournal");
  });

  it("routes submitted schedules through approval instances before publication", () => {
    expect(workforceServiceSource).toContain(
      "findWorkforceScheduleApprovalRule"
    );
    expect(workforceServiceSource).toContain(
      'documentType: "WorkforceSchedule"'
    );
    expect(workforceServiceSource).toContain("APPROVE_WORKFORCE_SCHEDULE");
    expect(workforceServiceSource).toContain(
      "WORKFORCE_SCHEDULE_APPROVAL_RULE_NOT_CONFIGURED"
    );
    expect(workforceServiceSource).toContain(
      "WORKFORCE_SCHEDULE_ALREADY_SUBMITTED"
    );
    expect(workforceServiceSource).toContain(
      "workforce.schedule_approval_routed"
    );
    expect(workforceServiceSource).toContain("noSchedulePublication");
    expect(workforceServiceSource).toContain("coverageGapCount");
    expect(workforceServiceSource).toContain(
      "WORKFORCE_SCHEDULE_COVERAGE_GAP_WAIVER_REASON_REQUIRED"
    );
    expect(workforceServiceSource).toContain("noPayrollComputation");
    expect(workforceServiceSource).toContain("noPaymentRequest");
    expect(workforceServiceSource).toContain("noFinanceJournal");
  });

  it("routes attendance import exceptions through approval without payroll effects", () => {
    expect(workforceServiceSource).toContain(
      "findAttendanceImportApprovalRule"
    );
    expect(workforceServiceSource).toContain(
      'documentType: "AttendanceImportBatch"'
    );
    expect(workforceServiceSource).toContain(
      "APPROVE_ATTENDANCE_IMPORT_REVIEW"
    );
    expect(workforceServiceSource).toContain(
      "WORKFORCE_ATTENDANCE_IMPORT_APPROVAL_RULE_NOT_CONFIGURED"
    );
    expect(workforceServiceSource).toContain(
      "WORKFORCE_ATTENDANCE_IMPORT_ALREADY_SUBMITTED"
    );
    expect(workforceServiceSource).toContain(
      "workforce.attendance_import_approval_routed"
    );
    expect(workforceServiceSource).toContain("approvalRequested: true");
    expect(workforceServiceSource).toContain("noPayrollExport");
    expect(workforceServiceSource).toContain("noAttendanceDeviceAuthority");
    expect(workforceServiceSource).toContain("noPaymentRequest");
    expect(workforceServiceSource).toContain("noFinanceJournal");
  });

  it("normalizes every workforce approval step and fails before source transition", () => {
    expect(workforceServiceSource.match(/configureApprovalStepRouting\(tx/g)).toHaveLength(4);
    expect(workforceServiceSource.match(/assertAnyEligibleApprovalActorForStep\(tx/g)).toHaveLength(4);
    expect(workforceServiceSource.match(/recipientUserIds: firstStep\.userId \? \[firstStep\.userId\] : \[\]/g)).toHaveLength(4);
    expect(workforceServiceSource).not.toContain("resolveScopedNotificationRecipients");
    expect(workforceServiceSource).toContain("dueAt: request.startDate");
    expect(workforceServiceSource).toContain("dueAt: record.workedStartAt");
    expect(workforceServiceSource).toContain("dueAt: schedule.scheduleDate");
    expect(workforceServiceSource).toContain("dueAt: null");
    expect(workforceServiceSource).toContain('source: "workforce-leave-submission"');
    expect(workforceServiceSource).toContain('source: "workforce-overtime-submission"');
    expect(workforceServiceSource).toContain('source: "workforce-schedule-submission"');
    expect(workforceServiceSource).toContain('source: "workforce-attendance-import-review"');

    const transitions = new Map([
      ["submitLeaveRequest", "const updated = await tx.employeeLeaveRequest.update"],
      ["submitOvertimeRecord", "const updated = await tx.employeeOvertimeRecord.update"],
      ["submitWorkforceSchedule", "const updated = await tx.workforceSchedule.update"],
      ["reviewAttendanceImportBatch", "const updated = await tx.attendanceImportBatch.update"]
    ]);
    for (const [functionName, sourceTransition] of transitions) {
      const start = workforceServiceSource.indexOf(`export async function ${functionName}`);
      const end = workforceServiceSource.indexOf("\nexport async function ", start + 1);
      const action = workforceServiceSource.slice(start, end === -1 ? undefined : end);
      expect(action).toContain("for (const step of routedSteps)");
      expect(action.indexOf("assertAnyEligibleApprovalActorForStep(tx")).toBeLessThan(
        action.indexOf(sourceTransition)
      );
    }
    expect(workforceServiceSource).toContain("userId: request.requestedByUserId");
    expect(workforceServiceSource).toContain("userId: record.requestedByUserId");
    expect(workforceServiceSource).toContain("schedule.createdByUserId");
    expect(workforceServiceSource).toContain("batch.createdByUserId");
  });

  it("creates draft-only workforce entries from scoped employees", () => {
    expect(workforceServiceSource).toContain(
      "getScopedEmployeeForDraftOrThrow"
    );
    expect(workforceServiceSource).toContain('status: "DRAFT"');
    expect(workforceServiceSource).toContain("workforce.leave_draft_created");
    expect(workforceServiceSource).toContain(
      "workforce.overtime_draft_created"
    );
    expect(workforceServiceSource).toContain(
      "workforce.schedule_draft_created"
    );
    expect(workforceServiceSource).toContain(
      "requestedMinutes: inclusiveWorkdayMinutes"
    );
    expect(workforceServiceSource).toContain(
      "WORKFORCE_EMPLOYEE_LOCATION_SCOPE_REQUIRED"
    );
    expect(workforceServiceSource).toContain(
      "WORKFORCE_SCHEDULE_EMPLOYEE_LOCATION_MISMATCH"
    );
    expect(workforceServiceSource).toContain(
      "assertNoWorkforceScheduleConflicts"
    );
    expect(workforceServiceSource).toContain(
      "WORKFORCE_SCHEDULE_EMPLOYEE_TIME_CONFLICT"
    );
    expect(workforceServiceSource).toContain(
      "WORKFORCE_SCHEDULE_STATION_TIME_CONFLICT"
    );
    expect(workforceServiceSource).toContain(
      "plannedStartAt: { lt: input.plannedEndAt }"
    );
    expect(workforceServiceSource).toContain(
      "plannedEndAt: { gt: input.plannedStartAt }"
    );
    expect(workforceServiceSource).toContain("conflictChecked: true");
    expect(workforceServiceSource).toContain("plannedHeadcount > 100");
    expect(workforceServiceSource).toContain("noSchedulePublication");
    expect(workforceServiceSource).toContain("draftOptions");
  });

  it("supports scoped employee master create and update modals without payroll effects", () => {
    expect(workforceServiceSource).toContain("createEmployee");
    expect(workforceServiceSource).toContain("updateEmployee");
    expect(workforceServiceSource).toContain(
      "getScopedEmployeeForManagementOrThrow"
    );
    expect(workforceServiceSource).toContain(
      "WORKFORCE_EMPLOYEE_CREATE_REASON_REQUIRED"
    );
    expect(workforceServiceSource).toContain(
      "WORKFORCE_EMPLOYEE_UPDATE_REASON_REQUIRED"
    );
    expect(workforceServiceSource).toContain(
      "WORKFORCE_EMPLOYEE_CODE_ALREADY_EXISTS"
    );
    expect(workforceServiceSource).toContain("WORKFORCE_LOCATION_SCOPE_DENIED");
    expect(workforceServiceSource).toContain("workforce.employee_created");
    expect(workforceServiceSource).toContain("workforce.employee_updated");
    expect(workforceServiceSource).toContain("noUserAccountProvisioning");
    expect(workforcePageSource).toContain("runCreateEmployee");
    expect(workforcePageSource).toContain("runUpdateEmployee");
    expect(workforcePageSource).toContain("Add Employee");
    expect(workforcePageSource).toContain("Edit Employee");
    expect(workforcePageSource).toContain(
      "Employee code is controlled at creation"
    );
  });

  it("supports scoped assignment create and end controls without payroll effects", () => {
    expect(workforceServiceSource).toContain("createEmployeeAssignment");
    expect(workforceServiceSource).toContain("endEmployeeAssignment");
    expect(workforceServiceSource).toContain(
      "getScopedAssignmentForManagementOrThrow"
    );
    expect(workforceServiceSource).toContain(
      "WORKFORCE_ASSIGNMENT_CREATE_REASON_REQUIRED"
    );
    expect(workforceServiceSource).toContain(
      "WORKFORCE_ASSIGNMENT_END_REASON_REQUIRED"
    );
    expect(workforceServiceSource).toContain(
      "WORKFORCE_ASSIGNMENT_DUPLICATE_ACTIVE_ROLE"
    );
    expect(workforceServiceSource).toContain(
      "WORKFORCE_ASSIGNMENT_ACTIVE_PRIMARY_EXISTS"
    );
    expect(workforceServiceSource).toContain("replacesAssignmentId");
    expect(workforceServiceSource).toContain(
      "WORKFORCE_ASSIGNMENT_REPLACEMENT_PRIMARY_INVALID"
    );
    expect(workforceServiceSource).toContain(
      "WORKFORCE_ASSIGNMENT_REPLACEMENT_DATE_INVALID"
    );
    expect(workforceServiceSource).toContain("workforce.assignment_created");
    expect(workforceServiceSource).toContain("workforce.assignment_ended");
    expect(workforceServiceSource).toContain(
      "workforce.assignment_replaced_by_primary"
    );
    expect(workforceServiceSource).toContain("controlledPrimaryHandoff");
    expect(workforceServiceSource).toContain("fullTransferWorkflowDeferred");
    expect(workforcePageSource).toContain("runCreateEmployeeAssignment");
    expect(workforcePageSource).toContain("runEndEmployeeAssignment");
    expect(workforcePageSource).toContain("Add Assignment");
    expect(workforcePageSource).toContain("End Assignment");
    expect(workforcePageSource).toContain("Make this the primary assignment");
    expect(workforcePageSource).toContain("Replace current primary assignment");
  });

  it("wires workforce workflow actions through server-action UI controls", () => {
    expect(workforcePageSource).toContain("runWorkforceRequestAction");
    expect(workforcePageSource).toContain("runWorkforceScheduleAction");
    expect(workforcePageSource).toContain("runAttendanceImportAction");
    expect(workforcePageSource).toContain("runCreateDraftLeaveRequest");
    expect(workforcePageSource).toContain("runCreateDraftOvertimeRecord");
    expect(workforcePageSource).toContain("runCreateDraftWorkforceSchedule");
    expect(workforcePageSource).toContain("Create Draft Leave Request");
    expect(workforcePageSource).toContain("Create Draft Overtime Record");
    expect(workforcePageSource).toContain("Create Draft Schedule");
    expect(workforcePageSource).toContain("Leave as open coverage gap");
    expect(workforcePageSource).toContain("Leave And Overtime Actions");
    expect(workforcePageSource).toContain("Publish");
    expect(workforcePageSource).toContain("Record Review");
    expect(workforcePageSource).toContain("Void Batch");
  });

  it("exposes workforce controlled evidence panels without payroll or finance mutation", () => {
    expect(workforcePageSource).toContain(
      "listWorkforceControlledEvidenceAttachmentsBatch"
    );
    expect(workforcePageSource).not.toContain(
      "listControlledEvidenceAttachments"
    );
    expect(workforcePageSource).toContain("ControlledEvidencePanel");
    expect(workforcePageSource).not.toContain(
      "createControlledEvidenceAttachmentMetadataLink"
    );
    expect(workforcePageSource).not.toContain(
      "createControlledEvidenceAttachmentUploadLink"
    );
    expect(workforcePageSource).not.toContain('name="objectKey"');
    expect(workforcePageSource).not.toContain('name="storageProvider"');
    expect(workforcePageSource).toContain(
      "archiveControlledEvidenceAttachment"
    );
    expect(workforcePageSource).toContain("WORKFORCE_EMPLOYEE");
    expect(workforcePageSource).toContain("WORKFORCE_ASSIGNMENT");
    expect(workforcePageSource).toContain("WORKFORCE_LEAVE");
    expect(workforcePageSource).toContain("WORKFORCE_OVERTIME");
    expect(workforcePageSource).toContain("WORKFORCE_SCHEDULE");
    expect(workforcePageSource).toContain("WORKFORCE_ATTENDANCE_IMPORT");
    expect(workforcePageSource).toContain("archiveWorkforceEvidenceMetadata");
    expect(workforcePageSource).not.toContain("Save Evidence Metadata");
    expect(workforcePageSource).not.toContain("Binary upload");
    expect(workforcePageSource).not.toContain("P3-BLOCK-002");
    expect(workforcePageSource).toContain("permissions.workforceLeaveApprove");
    expect(workforcePageSource).toContain(
      "permissions.workforceOvertimeApprove"
    );
    expect(workforcePageSource).toContain(
      "permissions.workforceScheduleManage"
    );
    expect(workforcePageSource).toContain(
      "permissions.workforceAttendanceImportManage"
    );
    expect(workforcePageSource).not.toContain("canViewWorkforceRegistry");
    expect(workforcePageSource).toContain("canViewSchedules");
    expect(workforcePageSource).toContain("canViewAttendance");
    expect(workforcePageSource).toContain(
      "WORKFORCE_EMPLOYEE: canManageWorkforce"
    );
    expect(workforcePageSource).toContain(
      "WORKFORCE_ASSIGNMENT: canManageWorkforce"
    );
    expect(workforcePageSource).toContain(
      "WORKFORCE_SCHEDULE: canViewSchedules"
    );
    expect(workforcePageSource).toContain(
      "WORKFORCE_ATTENDANCE_IMPORT: canViewAttendance"
    );
    expect(workforcePageSource).not.toContain("paymentRequest.create");
    expect(workforcePageSource).not.toContain("financeJournal.create");
    expect(workforcePageSource).not.toContain("payrollExport");
  });
});
