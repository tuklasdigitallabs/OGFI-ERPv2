import { prisma } from "@ogfi/database";
import type { TransactionClient } from "@ogfi/database";
import {
  permissions,
  requireAnyPermission,
  requirePermission,
  requireWorkforceAccess
} from "./authorization";
import type { SessionContext } from "./context";
import type { CsvRow } from "./csv";
import {
  recordWorkflowNotifications,
  resolveScopedNotificationRecipients
} from "./notifications";

type BadgeTone = "neutral" | "info" | "success" | "warning" | "danger";

export type WorkforceMetric = {
  id: string;
  label: string;
  displayValue: string;
  detail: string;
  tone: BadgeTone;
};

export type WorkforceEmployeeRow = {
  id: string;
  employeeCode: string;
  displayName: string;
  legalName: string | null;
  preferredName: string | null;
  jobTitle: string;
  emailPersonal: string | null;
  phoneNumber: string | null;
  homeLocationId: string | null;
  homeLocationName: string;
  status: string;
  employmentType: string;
  activeAssignmentCount: number;
};

export type WorkforceAssignmentRow = {
  id: string;
  employeeId: string;
  employeeName: string;
  roleLabel: string;
  locationName: string;
  departmentName: string;
  assignmentType: string;
  isPrimary: boolean;
  status: string;
  effectiveFrom: string;
  effectiveTo: string | null;
};

export type WorkforceLeaveRow = {
  id: string;
  employeeName: string;
  locationName: string;
  leaveType: string;
  status: string;
  requestedMinutes: number;
  startDate: string;
  endDate: string;
  reason: string;
};

export type WorkforceOvertimeRow = {
  id: string;
  employeeName: string;
  locationName: string;
  overtimeType: string;
  status: string;
  requestedMinutes: number;
  workedStartAt: string;
  workedEndAt: string;
  reason: string;
};

export type WorkforceScheduleRow = {
  id: string;
  publicReference: string;
  locationName: string;
  scheduleDate: string;
  shiftType: string;
  status: string;
  plannedHeadcount: number;
  assignedHeadcount: number;
  coverageGapCount: number;
  plannedHours: string;
  lineCount: number;
  gapStations: string[];
};

export type AttendanceImportBatchRow = {
  id: string;
  publicReference: string;
  locationName: string;
  businessDate: string;
  sourceType: string;
  sourceReference: string;
  status: string;
  rowCount: number;
  acceptedCount: number;
  exceptionCount: number;
  duplicateCount: number;
  lineCount: number;
};

export const workforceEvidenceSourceTypes = [
  "WORKFORCE_EMPLOYEE",
  "WORKFORCE_ASSIGNMENT",
  "WORKFORCE_LEAVE",
  "WORKFORCE_OVERTIME",
  "WORKFORCE_SCHEDULE",
  "WORKFORCE_ATTENDANCE_IMPORT"
] as const;

export type WorkforceEvidenceSourceType =
  (typeof workforceEvidenceSourceTypes)[number];

export type WorkforceEvidenceSourceBatchRequest = Partial<
  Record<WorkforceEvidenceSourceType, readonly string[]>
>;

export type WorkforceReadinessRow = {
  id: string;
  employeeName: string;
  type: "Training" | "Document";
  label: string;
  status: string;
  validUntil: string | null;
  requiredForScope: boolean;
};

export type WorkforceReportRow = {
  id: string;
  sourceType: "Schedule" | "Attendance Import";
  publicReference: string;
  locationName: string;
  status: string;
  issueState: "CLEAN" | "NEEDS_REVIEW";
  issueCount: number;
  issueLabels: string[];
  businessDate: string;
  exportSafeSummary: string;
};

export type WorkforceProductionReadinessRow = {
  id: string;
  sourceId: string;
  sourceType: "Schedule" | "Attendance Import" | "Training" | "Document";
  reference: string;
  locationOrEmployee: string;
  severity: "HIGH" | "MEDIUM" | "LOW";
  issueLabel: string;
  issueCount: number;
  nextAction: string;
  blockerId: string | null;
};

export type WorkforceDraftEmployeeOption = {
  id: string;
  label: string;
  detail: string;
};

export type WorkforceLocationOption = {
  id: string;
  label: string;
  detail: string;
};

export type WorkforceDashboard = {
  metrics: WorkforceMetric[];
  employees: WorkforceEmployeeRow[];
  assignments: WorkforceAssignmentRow[];
  leaveRequests: WorkforceLeaveRow[];
  overtimeRecords: WorkforceOvertimeRow[];
  schedules: WorkforceScheduleRow[];
  attendanceImports: AttendanceImportBatchRow[];
  reportRows: WorkforceReportRow[];
  readiness: WorkforceReadinessRow[];
  productionReadinessRows: WorkforceProductionReadinessRow[];
  draftOptions: {
    employees: WorkforceDraftEmployeeOption[];
    locations: WorkforceLocationOption[];
  };
  policyNotes: string[];
};

type WorkforceEntityType =
  | "Employee"
  | "EmployeeAssignment"
  | "EmployeeLeaveRequest"
  | "EmployeeOvertimeRecord"
  | "WorkforceSchedule"
  | "AttendanceImportBatch";

export type WorkforceActionInput = {
  reason?: string;
  evidenceReference?: string;
  idempotencyKey?: string;
};

export type LeaveActionInput = WorkforceActionInput & {
  leaveRequestId: string;
};

export type OvertimeActionInput = WorkforceActionInput & {
  overtimeRecordId: string;
};

export type ScheduleActionInput = WorkforceActionInput & {
  scheduleId: string;
};

export type AttendanceImportReviewInput = WorkforceActionInput & {
  batchId: string;
  verdict: "ACCEPT" | "REJECT" | "EXCEPTION_LIST";
};

type EmployeeLeaveTypeInput =
  | "VACATION"
  | "SICK"
  | "PERSONAL"
  | "EMERGENCY"
  | "MATERNITY"
  | "PATERNITY"
  | "OTHER";

type EmployeeOvertimeTypeInput =
  | "REGULAR"
  | "WEEKEND"
  | "HOLIDAY"
  | "NIGHT_SHIFT"
  | "EMERGENCY";

type EmployeeAssignmentTypeInput =
  | "PRIMARY"
  | "SECONDMENT"
  | "PROJECT_COVERAGE"
  | "TEMPORARY";

type WorkforceShiftTypeInput =
  | "OPENING"
  | "MID"
  | "CLOSING"
  | "SPLIT"
  | "OVERNIGHT"
  | "SPECIAL_EVENT";

export type CreateDraftLeaveRequestInput = WorkforceActionInput & {
  employeeId: string;
  leaveType: EmployeeLeaveTypeInput;
  startDate: string;
  endDate: string;
};

export type CreateDraftOvertimeRecordInput = WorkforceActionInput & {
  employeeId: string;
  overtimeType: EmployeeOvertimeTypeInput;
  workedStartAt: string;
  workedEndAt: string;
};

export type CreateDraftWorkforceScheduleInput = WorkforceActionInput & {
  scheduleDate: string;
  shiftType: WorkforceShiftTypeInput;
  stationCode: string;
  roleLabel: string;
  plannedStartAt: string;
  plannedEndAt: string;
  plannedHeadcount: number;
  assignedEmployeeId?: string;
};

export type CreateEmployeeAssignmentInput = WorkforceActionInput & {
  employeeId: string;
  locationId: string;
  assignmentType: EmployeeAssignmentTypeInput;
  roleLabel: string;
  effectiveFrom: string;
  isPrimary?: boolean;
  replacesAssignmentId?: string;
};

export type EndEmployeeAssignmentInput = WorkforceActionInput & {
  assignmentId: string;
  effectiveTo: string;
};

type EmployeeEmploymentTypeInput =
  | "FULL_TIME"
  | "PART_TIME"
  | "CONTRACT"
  | "TEMPORARY"
  | "INTERN";

type EmployeeStatusInput =
  | "ACTIVE"
  | "INACTIVE"
  | "SUSPENDED"
  | "TERMINATED"
  | "LEAVE_OF_ABSENCE";

export type CreateEmployeeInput = WorkforceActionInput & {
  employeeCode: string;
  legalName: string;
  preferredName?: string;
  jobTitle?: string;
  emailPersonal?: string;
  phoneNumber?: string;
  employmentType: EmployeeEmploymentTypeInput;
  hireDate: string;
  homeLocationId: string;
  initialRoleLabel?: string;
  assignmentEffectiveFrom?: string;
};

export type UpdateEmployeeInput = WorkforceActionInput & {
  employeeId: string;
  legalName: string;
  preferredName?: string;
  jobTitle?: string;
  emailPersonal?: string;
  phoneNumber?: string;
  employmentType: EmployeeEmploymentTypeInput;
  status: EmployeeStatusInput;
  homeLocationId: string;
};

const pendingLeaveStatuses = ["SUBMITTED", "UNDER_REVIEW"] as const;
const pendingOvertimeStatuses = ["SUBMITTED", "UNDER_REVIEW"] as const;
const activeScheduleStatuses = [
  "DRAFT",
  "SUBMITTED",
  "UNDER_REVIEW",
  "APPROVED",
  "PUBLISHED",
  "IN_PROGRESS"
] as const;
const leaveTypes: EmployeeLeaveTypeInput[] = [
  "VACATION",
  "SICK",
  "PERSONAL",
  "EMERGENCY",
  "MATERNITY",
  "PATERNITY",
  "OTHER"
];
const overtimeTypes: EmployeeOvertimeTypeInput[] = [
  "REGULAR",
  "WEEKEND",
  "HOLIDAY",
  "NIGHT_SHIFT",
  "EMERGENCY"
];
const assignmentTypes: EmployeeAssignmentTypeInput[] = [
  "PRIMARY",
  "SECONDMENT",
  "PROJECT_COVERAGE",
  "TEMPORARY"
];
const workforceShiftTypes: WorkforceShiftTypeInput[] = [
  "OPENING",
  "MID",
  "CLOSING",
  "SPLIT",
  "OVERNIGHT",
  "SPECIAL_EVENT"
];

const employmentTypes: EmployeeEmploymentTypeInput[] = [
  "FULL_TIME",
  "PART_TIME",
  "CONTRACT",
  "TEMPORARY",
  "INTERN"
];
const employeeStatuses: EmployeeStatusInput[] = [
  "ACTIVE",
  "INACTIVE",
  "SUSPENDED",
  "TERMINATED",
  "LEAVE_OF_ABSENCE"
];

function canManageWorkforce(grantedPermissionCodes: string[]) {
  return (
    grantedPermissionCodes.includes(permissions.coreAdminister) ||
    grantedPermissionCodes.includes(permissions.workforceManage)
  );
}

function canViewConfidentialWorkforce(grantedPermissionCodes: string[]) {
  return canManageWorkforce(grantedPermissionCodes);
}

async function requireWorkforcePermission(
  session: SessionContext,
  permissionCode: string
) {
  await requireAnyPermission(session, [
    permissions.coreAdminister,
    permissionCode
  ]);
}

function requireWorkforceReason(value: string | undefined, errorCode: string) {
  if (!value?.trim()) {
    throw new Error(errorCode);
  }
  return value.trim();
}

async function loadWorkforceScopeSnapshot(session: SessionContext) {
  const now = new Date();
  const assignments = await prisma.userScopeAssignment.findMany({
    where: {
      userId: session.user.id,
      scopeType: { in: ["LOCATION", "COMPANY"] },
      status: "ACTIVE",
      startsAt: { lte: now },
      OR: [{ endsAt: null }, { endsAt: { gt: now } }]
    },
    select: { scopeType: true, scopeId: true, accessLevel: true }
  });
  const locationScopeIds = assignments
    .filter((assignment) => assignment.scopeType === "LOCATION")
    .map((assignment) => assignment.scopeId);
  const locations = await prisma.location.findMany({
    where: {
      id: { in: locationScopeIds },
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      status: "ACTIVE"
    },
    select: { id: true, brandId: true, name: true }
  });
  const departments = await prisma.department.findMany({
    where: {
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      status: "ACTIVE"
    },
    select: { id: true }
  });
  return {
    locationIds: locations.map((location) => location.id),
    locationsById: new Map(
      locations.map((location) => [location.id, location])
    ),
    departmentIds: new Set(departments.map((department) => department.id)),
    hasCompanyManage: assignments.some(
      (assignment) =>
        assignment.scopeType === "COMPANY" &&
        assignment.scopeId === session.context.companyId &&
        assignment.accessLevel === "MANAGE"
    )
  };
}

function workforceDimensionsMatch(
  scope: Awaited<ReturnType<typeof loadWorkforceScopeSnapshot>>,
  input: {
    locationId: string;
    brandId?: string | null;
    departmentId?: string | null;
  }
) {
  const location = scope.locationsById.get(input.locationId);
  if (!location) return false;
  const brandId = input.brandId || null;
  if (brandId !== null && brandId !== location.brandId) return false;
  if (input.departmentId && !scope.departmentIds.has(input.departmentId)) {
    return false;
  }
  return true;
}

export function workforceEvidenceViewPermissions(
  sourceType: WorkforceEvidenceSourceType
) {
  switch (sourceType) {
    case "WORKFORCE_EMPLOYEE":
    case "WORKFORCE_ASSIGNMENT":
      return [
        permissions.workforceView,
        permissions.workforceManage,
        permissions.coreAdminister
      ];
    case "WORKFORCE_LEAVE":
      return [
        permissions.workforceView,
        permissions.workforceManage,
        permissions.workforceLeaveApprove,
        permissions.coreAdminister
      ];
    case "WORKFORCE_OVERTIME":
      return [
        permissions.workforceView,
        permissions.workforceManage,
        permissions.workforceOvertimeApprove,
        permissions.coreAdminister
      ];
    case "WORKFORCE_SCHEDULE":
      return [
        permissions.workforceScheduleView,
        permissions.workforceScheduleManage,
        permissions.workforceView,
        permissions.coreAdminister
      ];
    case "WORKFORCE_ATTENDANCE_IMPORT":
      return [
        permissions.workforceAttendanceImportView,
        permissions.workforceAttendanceImportManage,
        permissions.coreAdminister
      ];
  }
}

export async function assertWorkforceEvidenceSourceBatchAccess(
  session: SessionContext,
  input: WorkforceEvidenceSourceBatchRequest
) {
  const grantedPermissionCodes = await requireWorkforceAccess(session);
  for (const sourceType of workforceEvidenceSourceTypes) {
    if (!(input[sourceType]?.length ?? 0)) continue;
    if (
      !workforceEvidenceViewPermissions(sourceType).some((permissionCode) =>
        grantedPermissionCodes.includes(permissionCode)
      )
    ) {
      throw new Error("PERMISSION_DENIED");
    }
  }

  const scope = await loadWorkforceScopeSnapshot(session);
  const baseWhere = {
    tenantId: session.context.tenantId,
    companyId: session.context.companyId
  };
  const ids = (sourceType: WorkforceEvidenceSourceType) => [
    ...new Set(input[sourceType] ?? [])
  ];
  const employeeIds = ids("WORKFORCE_EMPLOYEE");
  const assignmentIds = ids("WORKFORCE_ASSIGNMENT");
  const leaveIds = ids("WORKFORCE_LEAVE");
  const overtimeIds = ids("WORKFORCE_OVERTIME");
  const scheduleIds = ids("WORKFORCE_SCHEDULE");
  const attendanceImportIds = ids("WORKFORCE_ATTENDANCE_IMPORT");

  const [
    employees,
    assignments,
    leaveRequests,
    overtimeRecords,
    schedules,
    attendanceImports
  ] = await Promise.all([
    employeeIds.length
      ? prisma.employee.findMany({
          where: {
            ...baseWhere,
            id: { in: employeeIds },
            OR: [
              { homeLocationId: { in: scope.locationIds } },
              {
                assignments: {
                  some: {
                    ...baseWhere,
                    locationId: { in: scope.locationIds }
                  }
                }
              },
              ...(scope.hasCompanyManage ? [{ homeLocationId: null }] : [])
            ]
          },
          select: { id: true }
        })
      : Promise.resolve([]),
    assignmentIds.length
      ? prisma.employeeAssignment.findMany({
          where: { ...baseWhere, id: { in: assignmentIds } },
          select: {
            id: true,
            locationId: true,
            brandId: true,
            departmentId: true
          }
        })
      : Promise.resolve([]),
    leaveIds.length
      ? prisma.employeeLeaveRequest.findMany({
          where: { ...baseWhere, id: { in: leaveIds } },
          select: { id: true, locationId: true }
        })
      : Promise.resolve([]),
    overtimeIds.length
      ? prisma.employeeOvertimeRecord.findMany({
          where: { ...baseWhere, id: { in: overtimeIds } },
          select: { id: true, locationId: true }
        })
      : Promise.resolve([]),
    scheduleIds.length
      ? prisma.workforceSchedule.findMany({
          where: { ...baseWhere, id: { in: scheduleIds } },
          select: {
            id: true,
            locationId: true,
            brandId: true,
            departmentId: true
          }
        })
      : Promise.resolve([]),
    attendanceImportIds.length
      ? prisma.attendanceImportBatch.findMany({
          where: { ...baseWhere, id: { in: attendanceImportIds } },
          select: { id: true, locationId: true, brandId: true }
        })
      : Promise.resolve([])
  ]);

  const accessibleIds = new Map<WorkforceEvidenceSourceType, Set<string>>([
    ["WORKFORCE_EMPLOYEE", new Set(employees.map((row) => row.id))],
    [
      "WORKFORCE_ASSIGNMENT",
      new Set(
        assignments
          .filter((row) => workforceDimensionsMatch(scope, row))
          .map((row) => row.id)
      )
    ],
    [
      "WORKFORCE_LEAVE",
      new Set(
        leaveRequests
          .filter(
            (row) =>
              (row.locationId === null && scope.hasCompanyManage) ||
              (row.locationId !== null &&
                workforceDimensionsMatch(scope, {
                  locationId: row.locationId
                }))
          )
          .map((row) => row.id)
      )
    ],
    [
      "WORKFORCE_OVERTIME",
      new Set(
        overtimeRecords
          .filter(
            (row) =>
              (row.locationId === null && scope.hasCompanyManage) ||
              (row.locationId !== null &&
                workforceDimensionsMatch(scope, {
                  locationId: row.locationId
                }))
          )
          .map((row) => row.id)
      )
    ],
    [
      "WORKFORCE_SCHEDULE",
      new Set(
        schedules
          .filter((row) => workforceDimensionsMatch(scope, row))
          .map((row) => row.id)
      )
    ],
    [
      "WORKFORCE_ATTENDANCE_IMPORT",
      new Set(
        attendanceImports
          .filter((row) => workforceDimensionsMatch(scope, row))
          .map((row) => row.id)
      )
    ]
  ]);

  for (const sourceType of workforceEvidenceSourceTypes) {
    const allowed = accessibleIds.get(sourceType) ?? new Set<string>();
    if (
      ids(sourceType).some((sourceRecordId) => !allowed.has(sourceRecordId))
    ) {
      throw new Error("CONTROLLED_EVIDENCE_SOURCE_NOT_AVAILABLE");
    }
  }
}

export async function assertWorkforceSourceScopeAccess(
  session: SessionContext,
  input: {
    locationId?: string | null;
    brandId?: string | null;
    departmentId?: string | null;
  }
) {
  await requireWorkforceAccess(session);
  const scope = await loadWorkforceScopeSnapshot(session);
  if (!input.locationId) {
    if (!scope.hasCompanyManage) {
      throw new Error("WORKFORCE_SOURCE_NOT_AVAILABLE");
    }
    return;
  }
  if (
    !workforceDimensionsMatch(scope, {
      locationId: input.locationId,
      brandId: input.brandId ?? null,
      departmentId: input.departmentId ?? null
    })
  ) {
    throw new Error("WORKFORCE_SOURCE_NOT_AVAILABLE");
  }
}

function assertStatusAllowed(
  status: string,
  allowed: string[],
  errorCode: string
) {
  if (!allowed.includes(status)) {
    throw new Error(errorCode);
  }
}

function assertOneOf<T extends string>(
  value: string,
  allowed: readonly T[],
  errorCode: string
): T {
  if (!allowed.includes(value as T)) {
    throw new Error(errorCode);
  }
  return value as T;
}

async function assertScopedLocation(
  session: SessionContext,
  locationId: string
) {
  if (!locationId.trim()) {
    throw new Error("WORKFORCE_EMPLOYEE_HOME_LOCATION_REQUIRED");
  }
  const scope = await loadWorkforceScopeSnapshot(session);
  if (!scope.locationsById.has(locationId)) {
    throw new Error("WORKFORCE_LOCATION_SCOPE_DENIED");
  }
}

async function writeWorkforceAudit(
  tx: TransactionClient,
  input: {
    session: SessionContext;
    entityType: WorkforceEntityType;
    entityId: string;
    eventType: string;
    beforeStatus: string;
    afterStatus: string;
    reason?: string | null;
    evidenceReference?: string | null;
    metadata?: Record<string, unknown>;
  }
) {
  await tx.auditEvent.create({
    data: {
      tenantId: input.session.context.tenantId,
      companyId: input.session.context.companyId,
      actorUserId: input.session.user.id,
      eventType: input.eventType,
      entityType: input.entityType,
      entityId: input.entityId,
      beforeData: { status: input.beforeStatus },
      afterData: {
        status: input.afterStatus,
        reason: input.reason ?? null,
        evidenceReference: input.evidenceReference ?? null
      },
      metadata: {
        noPayrollComputation: true,
        noWageComputation: true,
        noPayrollExport: true,
        noPaymentRequest: true,
        noFinanceJournal: true,
        noAttendanceDeviceAuthority: true,
        ...(input.metadata ?? {})
      }
    }
  });
}

async function getScopedLeaveOrThrow(
  tx: TransactionClient,
  session: SessionContext,
  leaveRequestId: string
) {
  const scope = await loadWorkforceScopeSnapshot(session);
  const request = await tx.employeeLeaveRequest.findFirst({
    where: {
      id: leaveRequestId,
      tenantId: session.context.tenantId,
      companyId: session.context.companyId
    }
  });
  if (
    !request ||
    (request.locationId
      ? !scope.locationIds.includes(request.locationId)
      : !scope.hasCompanyManage)
  ) {
    throw new Error("WORKFORCE_LEAVE_REQUEST_NOT_FOUND");
  }
  return request;
}

async function findEmployeeLeaveApprovalRule(
  tx: TransactionClient,
  session: SessionContext
) {
  return tx.approvalRule.findFirst({
    where: {
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      transactionType: "EmployeeLeaveRequest",
      isActive: true
    },
    include: {
      steps: {
        orderBy: { stepOrder: "asc" }
      }
    },
    orderBy: { priority: "asc" }
  });
}

async function findEmployeeOvertimeApprovalRule(
  tx: TransactionClient,
  session: SessionContext
) {
  return tx.approvalRule.findFirst({
    where: {
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      transactionType: "EmployeeOvertimeRecord",
      isActive: true
    },
    include: {
      steps: {
        orderBy: { stepOrder: "asc" }
      }
    },
    orderBy: { priority: "asc" }
  });
}

async function findWorkforceScheduleApprovalRule(
  tx: TransactionClient,
  session: SessionContext
) {
  return tx.approvalRule.findFirst({
    where: {
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      transactionType: "WorkforceSchedule",
      isActive: true
    },
    include: {
      steps: {
        orderBy: { stepOrder: "asc" }
      }
    },
    orderBy: { priority: "asc" }
  });
}

async function findAttendanceImportApprovalRule(
  tx: TransactionClient,
  session: SessionContext
) {
  return tx.approvalRule.findFirst({
    where: {
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      transactionType: "AttendanceImportBatch",
      isActive: true
    },
    include: {
      steps: {
        orderBy: { stepOrder: "asc" }
      }
    },
    orderBy: { priority: "asc" }
  });
}

async function getScopedOvertimeOrThrow(
  tx: TransactionClient,
  session: SessionContext,
  overtimeRecordId: string
) {
  const scope = await loadWorkforceScopeSnapshot(session);
  const record = await tx.employeeOvertimeRecord.findFirst({
    where: {
      id: overtimeRecordId,
      tenantId: session.context.tenantId,
      companyId: session.context.companyId
    }
  });
  if (
    !record ||
    (record.locationId
      ? !scope.locationIds.includes(record.locationId)
      : !scope.hasCompanyManage)
  ) {
    throw new Error("WORKFORCE_OVERTIME_RECORD_NOT_FOUND");
  }
  return record;
}

async function getScopedScheduleOrThrow(
  tx: TransactionClient,
  session: SessionContext,
  scheduleId: string
) {
  const scope = await loadWorkforceScopeSnapshot(session);
  const schedule = await tx.workforceSchedule.findFirst({
    where: {
      id: scheduleId,
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      locationId: { in: scope.locationIds }
    },
    include: { lines: true }
  });
  if (!schedule) {
    throw new Error("WORKFORCE_SCHEDULE_NOT_FOUND");
  }
  if (
    !workforceDimensionsMatch(scope, {
      locationId: schedule.locationId,
      brandId: schedule.brandId,
      departmentId: schedule.departmentId
    })
  ) {
    throw new Error("WORKFORCE_SCHEDULE_NOT_FOUND");
  }
  return schedule;
}

async function getScopedAttendanceBatchOrThrow(
  tx: TransactionClient,
  session: SessionContext,
  batchId: string
) {
  const scope = await loadWorkforceScopeSnapshot(session);
  const batch = await tx.attendanceImportBatch.findFirst({
    where: {
      id: batchId,
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      locationId: { in: scope.locationIds }
    },
    include: { lines: true }
  });
  if (!batch) {
    throw new Error("WORKFORCE_ATTENDANCE_BATCH_NOT_FOUND");
  }
  if (
    !workforceDimensionsMatch(scope, {
      locationId: batch.locationId,
      brandId: batch.brandId
    })
  ) {
    throw new Error("WORKFORCE_ATTENDANCE_BATCH_NOT_FOUND");
  }
  return batch;
}

function displayEmployeeName(input: {
  employeeCode: string;
  legalName: string;
  preferredName: string | null;
}) {
  return input.preferredName ?? input.legalName ?? input.employeeCode;
}

function toDateString(value: Date | null) {
  return value?.toISOString().slice(0, 10) ?? null;
}

function minutesToDisplayHours(minutes: number) {
  return `${(minutes / 60).toFixed(minutes % 60 === 0 ? 0 : 1)}h`;
}

export function buildWorkforceReportRows(input: {
  schedules: WorkforceScheduleRow[];
  attendanceImports: AttendanceImportBatchRow[];
}): WorkforceReportRow[] {
  const scheduleRows = input.schedules.map((schedule) => {
    const issueLabels =
      schedule.coverageGapCount > 0
        ? [
            `${schedule.coverageGapCount} coverage gap${schedule.coverageGapCount === 1 ? "" : "s"}`,
            schedule.gapStations.length > 0
              ? `Gap stations: ${schedule.gapStations.join(", ")}`
              : "Gap stations not specified"
          ]
        : [];

    return {
      id: `schedule:${schedule.id}`,
      sourceType: "Schedule" as const,
      publicReference: schedule.publicReference,
      locationName: schedule.locationName,
      status: schedule.status,
      issueState:
        schedule.coverageGapCount > 0
          ? ("NEEDS_REVIEW" as const)
          : ("CLEAN" as const),
      issueCount: schedule.coverageGapCount,
      issueLabels,
      businessDate: schedule.scheduleDate,
      exportSafeSummary: [
        schedule.publicReference,
        schedule.locationName,
        schedule.shiftType,
        schedule.status,
        `${schedule.assignedHeadcount}/${schedule.plannedHeadcount} assigned`,
        issueLabels.join("; ") || "No workforce readiness issue flagged"
      ].join(" / ")
    };
  });
  const attendanceRows = input.attendanceImports.map((batch) => {
    const issueCount = batch.exceptionCount + batch.duplicateCount;
    const issueLabels = [
      batch.exceptionCount > 0
        ? `${batch.exceptionCount} attendance exception${batch.exceptionCount === 1 ? "" : "s"}`
        : null,
      batch.duplicateCount > 0
        ? `${batch.duplicateCount} duplicate row${batch.duplicateCount === 1 ? "" : "s"}`
        : null
    ].filter((issue): issue is string => Boolean(issue));
    return {
      id: `attendance:${batch.id}`,
      sourceType: "Attendance Import" as const,
      publicReference: batch.publicReference,
      locationName: batch.locationName,
      status: batch.status,
      issueState:
        issueCount > 0 ? ("NEEDS_REVIEW" as const) : ("CLEAN" as const),
      issueCount,
      issueLabels,
      businessDate: batch.businessDate,
      exportSafeSummary: [
        batch.publicReference,
        batch.locationName,
        batch.sourceType,
        batch.status,
        `${batch.acceptedCount}/${batch.rowCount} accepted`,
        issueLabels.join("; ") || "No workforce readiness issue flagged"
      ].join(" / ")
    };
  });
  return [...scheduleRows, ...attendanceRows].sort((left, right) =>
    right.businessDate.localeCompare(left.businessDate)
  );
}

const workforceProductionReadinessPriority = {
  HIGH: 0,
  MEDIUM: 1,
  LOW: 2
} as const;

export function buildWorkforceProductionReadinessRows(input: {
  reportRows: WorkforceReportRow[];
  readiness: WorkforceReadinessRow[];
}): WorkforceProductionReadinessRow[] {
  const scheduleAndAttendanceRows = input.reportRows
    .filter((row) => row.issueState === "NEEDS_REVIEW")
    .map((row) => ({
      id: `${row.id}:production-readiness`,
      sourceId: row.id,
      sourceType: row.sourceType,
      reference: row.publicReference,
      locationOrEmployee: row.locationName,
      severity:
        row.sourceType === "Attendance Import"
          ? ("HIGH" as const)
          : ("MEDIUM" as const),
      issueLabel:
        row.sourceType === "Attendance Import"
          ? "Attendance import has exceptions or duplicates"
          : "Schedule has open coverage gaps",
      issueCount: row.issueCount,
      nextAction:
        row.sourceType === "Attendance Import"
          ? "Review or route attendance exceptions before payroll-adjacent UAT signoff."
          : "Assign coverage, document a waiver, or approve the schedule with gap evidence.",
      blockerId: null
    }));

  const documentRows = input.readiness
    .filter((row) => row.status === "EXPIRED" || row.status === "MISSING")
    .map((row) => ({
      id: `${row.id}:production-readiness`,
      sourceId: row.id,
      sourceType: row.type,
      reference: row.label,
      locationOrEmployee: row.employeeName,
      severity: row.requiredForScope ? ("HIGH" as const) : ("LOW" as const),
      issueLabel: `${row.type} readiness is ${row.status.toLowerCase()}`,
      issueCount: 1,
      nextAction:
        "Update evidence metadata or renew the requirement before workforce production readiness signoff.",
      blockerId: "P3-BLOCK-002"
    }));

  return [...scheduleAndAttendanceRows, ...documentRows].sort((left, right) => {
    const priorityDelta =
      workforceProductionReadinessPriority[left.severity] -
      workforceProductionReadinessPriority[right.severity];
    if (priorityDelta !== 0) {
      return priorityDelta;
    }
    return left.reference.localeCompare(right.reference);
  });
}

function parseDateOnly(value: string, errorCode: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(errorCode);
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(errorCode);
  }
  return parsed;
}

function dayBefore(date: Date) {
  const previous = new Date(date);
  previous.setUTCDate(previous.getUTCDate() - 1);
  return previous;
}

function parseDateTime(value: string, errorCode: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(errorCode);
  }
  return parsed;
}

function inclusiveWorkdayMinutes(startDate: Date, endDate: Date) {
  const dayMs = 24 * 60 * 60 * 1000;
  const dayCount =
    Math.floor((endDate.getTime() - startDate.getTime()) / dayMs) + 1;
  return Math.max(dayCount, 1) * 8 * 60;
}

function minutesBetween(startAt: Date, endAt: Date, errorCode: string) {
  const minutes = Math.round((endAt.getTime() - startAt.getTime()) / 60000);
  if (minutes <= 0) {
    throw new Error(errorCode);
  }
  return minutes;
}

function nextWorkforceScheduleReference(input: {
  scheduleDate: Date;
  locationName: string;
}) {
  const dateToken = input.scheduleDate
    .toISOString()
    .slice(0, 10)
    .replaceAll("-", "");
  const locationToken = input.locationName
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 14)
    .toUpperCase();
  return `WFS-${dateToken}-${locationToken}-${Date.now().toString(36).toUpperCase()}`;
}

async function assertNoWorkforceScheduleConflicts(
  tx: TransactionClient,
  session: SessionContext,
  input: {
    assignedEmployeeId?: string | null;
    stationCode: string;
    roleLabel: string;
    plannedStartAt: Date;
    plannedEndAt: Date;
  }
) {
  if (input.assignedEmployeeId) {
    const employeeConflict = await tx.workforceScheduleLine.findFirst({
      where: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        locationId: session.context.locationId,
        employeeId: input.assignedEmployeeId,
        plannedStartAt: { lt: input.plannedEndAt },
        plannedEndAt: { gt: input.plannedStartAt },
        schedule: {
          status: { in: [...activeScheduleStatuses] }
        }
      },
      select: { id: true }
    });
    if (employeeConflict) {
      throw new Error("WORKFORCE_SCHEDULE_EMPLOYEE_TIME_CONFLICT");
    }
  }

  const stationConflict = await tx.workforceScheduleLine.findFirst({
    where: {
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      locationId: session.context.locationId,
      stationCode: input.stationCode,
      roleLabel: input.roleLabel,
      plannedStartAt: { lt: input.plannedEndAt },
      plannedEndAt: { gt: input.plannedStartAt },
      schedule: {
        status: { in: [...activeScheduleStatuses] }
      }
    },
    select: { id: true }
  });
  if (stationConflict) {
    throw new Error("WORKFORCE_SCHEDULE_STATION_TIME_CONFLICT");
  }
}

async function getScopedEmployeeForDraftOrThrow(
  tx: TransactionClient,
  session: SessionContext,
  employeeId: string
) {
  const scope = await loadWorkforceScopeSnapshot(session);
  const employee = await tx.employee.findFirst({
    where: {
      id: employeeId,
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      status: "ACTIVE",
      OR: [
        { homeLocationId: { in: scope.locationIds } },
        {
          assignments: {
            some: {
              tenantId: session.context.tenantId,
              companyId: session.context.companyId,
              locationId: { in: scope.locationIds },
              status: "ACTIVE"
            }
          }
        }
      ]
    },
    include: {
      homeLocation: true,
      assignments: {
        where: {
          tenantId: session.context.tenantId,
          companyId: session.context.companyId,
          locationId: { in: scope.locationIds },
          status: "ACTIVE"
        },
        orderBy: [{ isPrimary: "desc" }, { effectiveFrom: "desc" }],
        take: 1
      }
    }
  });
  if (!employee) {
    throw new Error("WORKFORCE_EMPLOYEE_NOT_FOUND");
  }

  const authorizedAssignment = employee.assignments.find((assignment) =>
    workforceDimensionsMatch(scope, {
      locationId: assignment.locationId,
      brandId: assignment.brandId,
      departmentId: assignment.departmentId
    })
  );
  const assignmentLocationId = authorizedAssignment?.locationId;
  const homeLocationId = employee.homeLocationId;
  const locationId =
    assignmentLocationId ??
    (homeLocationId && scope.locationIds.includes(homeLocationId)
      ? homeLocationId
      : null);
  if (!locationId) {
    throw new Error("WORKFORCE_EMPLOYEE_LOCATION_SCOPE_REQUIRED");
  }
  return { employee, locationId };
}

async function getScopedEmployeeForManagementOrThrow(
  tx: TransactionClient,
  session: SessionContext,
  employeeId: string
) {
  const scope = await loadWorkforceScopeSnapshot(session);
  const employee = await tx.employee.findFirst({
    where: {
      id: employeeId,
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      OR: [
        { homeLocationId: { in: scope.locationIds } },
        {
          assignments: {
            some: {
              tenantId: session.context.tenantId,
              companyId: session.context.companyId,
              locationId: { in: scope.locationIds }
            }
          }
        }
      ]
    },
    include: {
      homeLocation: true,
      assignments: {
        where: {
          tenantId: session.context.tenantId,
          companyId: session.context.companyId,
          locationId: { in: scope.locationIds },
          status: "ACTIVE"
        },
        orderBy: [{ isPrimary: "desc" }, { effectiveFrom: "desc" }],
        take: 1
      }
    }
  });
  if (!employee) {
    throw new Error("WORKFORCE_EMPLOYEE_NOT_FOUND");
  }
  const homeLocationAuthorized =
    Boolean(employee.homeLocationId) &&
    scope.locationIds.includes(employee.homeLocationId!);
  const assignmentAuthorized = employee.assignments.some((assignment) =>
    workforceDimensionsMatch(scope, {
      locationId: assignment.locationId,
      brandId: assignment.brandId,
      departmentId: assignment.departmentId
    })
  );
  if (!homeLocationAuthorized && !assignmentAuthorized) {
    throw new Error("WORKFORCE_EMPLOYEE_NOT_FOUND");
  }
  return employee;
}

async function getScopedAssignmentForManagementOrThrow(
  tx: TransactionClient,
  session: SessionContext,
  assignmentId: string
) {
  const scope = await loadWorkforceScopeSnapshot(session);
  const assignment = await tx.employeeAssignment.findFirst({
    where: {
      id: assignmentId,
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      locationId: { in: scope.locationIds }
    },
    include: {
      employee: true,
      location: true
    }
  });
  if (!assignment) {
    throw new Error("WORKFORCE_ASSIGNMENT_NOT_FOUND");
  }
  if (
    !workforceDimensionsMatch(scope, {
      locationId: assignment.locationId,
      brandId: assignment.brandId,
      departmentId: assignment.departmentId
    })
  ) {
    throw new Error("WORKFORCE_ASSIGNMENT_NOT_FOUND");
  }
  return assignment;
}

export async function createEmployee(
  session: SessionContext,
  input: CreateEmployeeInput
) {
  await requireWorkforcePermission(session, permissions.workforceManage);
  const reason = requireWorkforceReason(
    input.reason,
    "WORKFORCE_EMPLOYEE_CREATE_REASON_REQUIRED"
  );
  const employeeCode = input.employeeCode.trim().toUpperCase();
  const legalName = input.legalName.trim();
  if (!employeeCode) {
    throw new Error("WORKFORCE_EMPLOYEE_CODE_REQUIRED");
  }
  if (!legalName) {
    throw new Error("WORKFORCE_EMPLOYEE_LEGAL_NAME_REQUIRED");
  }
  const employmentType = assertOneOf(
    input.employmentType,
    employmentTypes,
    "WORKFORCE_EMPLOYMENT_TYPE_INVALID"
  );
  await assertScopedLocation(session, input.homeLocationId);
  const hireDate = parseDateOnly(
    input.hireDate,
    "WORKFORCE_EMPLOYEE_HIRE_DATE_INVALID"
  );
  const assignmentEffectiveFrom = parseDateOnly(
    input.assignmentEffectiveFrom?.trim() || input.hireDate,
    "WORKFORCE_EMPLOYEE_ASSIGNMENT_DATE_INVALID"
  );

  return prisma.$transaction(async (tx) => {
    const existing = input.idempotencyKey
      ? await tx.employee.findFirst({
          where: {
            tenantId: session.context.tenantId,
            companyId: session.context.companyId,
            employeeCode
          }
        })
      : null;
    if (existing) {
      return existing;
    }
    const duplicate = await tx.employee.findUnique({
      where: {
        tenantId_companyId_employeeCode: {
          tenantId: session.context.tenantId,
          companyId: session.context.companyId,
          employeeCode
        }
      }
    });
    if (duplicate) {
      throw new Error("WORKFORCE_EMPLOYEE_CODE_ALREADY_EXISTS");
    }

    const created = await tx.employee.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        employeeCode,
        legalName,
        preferredName: input.preferredName?.trim() || null,
        jobTitle: input.jobTitle?.trim() || null,
        emailPersonal: input.emailPersonal?.trim() || null,
        phoneNumber: input.phoneNumber?.trim() || null,
        employmentType,
        status: "ACTIVE",
        hireDate,
        homeLocationId: input.homeLocationId,
        createdByUserId: session.user.id
      }
    });
    const roleLabel = input.initialRoleLabel?.trim();
    if (roleLabel) {
      await tx.employeeAssignment.create({
        data: {
          tenantId: session.context.tenantId,
          companyId: session.context.companyId,
          employeeId: created.id,
          locationId: input.homeLocationId,
          assignmentType: "PRIMARY",
          status: "ACTIVE",
          isPrimary: true,
          roleLabel,
          effectiveFrom: assignmentEffectiveFrom,
          reason,
          createdByUserId: session.user.id
        }
      });
    }
    await writeWorkforceAudit(tx, {
      session,
      entityType: "Employee",
      entityId: created.id,
      eventType: "workforce.employee_created",
      beforeStatus: "NEW",
      afterStatus: created.status,
      reason,
      evidenceReference: input.evidenceReference ?? null,
      metadata: {
        employeeCode,
        homeLocationId: input.homeLocationId,
        employmentType,
        initialAssignmentCreated: Boolean(roleLabel),
        noPayrollComputation: true,
        noUserAccountProvisioning: true
      }
    });
    return created;
  });
}

export async function updateEmployee(
  session: SessionContext,
  input: UpdateEmployeeInput
) {
  await requireWorkforcePermission(session, permissions.workforceManage);
  const reason = requireWorkforceReason(
    input.reason,
    "WORKFORCE_EMPLOYEE_UPDATE_REASON_REQUIRED"
  );
  const legalName = input.legalName.trim();
  if (!legalName) {
    throw new Error("WORKFORCE_EMPLOYEE_LEGAL_NAME_REQUIRED");
  }
  const employmentType = assertOneOf(
    input.employmentType,
    employmentTypes,
    "WORKFORCE_EMPLOYMENT_TYPE_INVALID"
  );
  const status = assertOneOf(
    input.status,
    employeeStatuses,
    "WORKFORCE_EMPLOYEE_STATUS_INVALID"
  );
  await assertScopedLocation(session, input.homeLocationId);

  return prisma.$transaction(async (tx) => {
    const employee = await getScopedEmployeeForManagementOrThrow(
      tx,
      session,
      input.employeeId
    );
    const scope = await loadWorkforceScopeSnapshot(session);
    if (
      !employee.homeLocationId ||
      !scope.locationIds.includes(employee.homeLocationId)
    ) {
      throw new Error("WORKFORCE_EMPLOYEE_NOT_FOUND");
    }
    const updated = await tx.employee.update({
      where: { id: employee.id },
      data: {
        legalName,
        preferredName: input.preferredName?.trim() || null,
        jobTitle: input.jobTitle?.trim() || null,
        emailPersonal: input.emailPersonal?.trim() || null,
        phoneNumber: input.phoneNumber?.trim() || null,
        employmentType,
        status,
        homeLocationId: input.homeLocationId,
        updatedByUserId: session.user.id
      }
    });
    await writeWorkforceAudit(tx, {
      session,
      entityType: "Employee",
      entityId: employee.id,
      eventType: "workforce.employee_updated",
      beforeStatus: employee.status,
      afterStatus: updated.status,
      reason,
      evidenceReference: input.evidenceReference ?? null,
      metadata: {
        employeeCode: employee.employeeCode,
        previousHomeLocationId: employee.homeLocationId,
        nextHomeLocationId: input.homeLocationId,
        previousEmploymentType: employee.employmentType,
        nextEmploymentType: employmentType,
        noPayrollComputation: true,
        noUserAccountProvisioning: true
      }
    });
    return updated;
  });
}

export async function createEmployeeAssignment(
  session: SessionContext,
  input: CreateEmployeeAssignmentInput
) {
  await requireWorkforcePermission(session, permissions.workforceManage);
  const reason = requireWorkforceReason(
    input.reason,
    "WORKFORCE_ASSIGNMENT_CREATE_REASON_REQUIRED"
  );
  const assignmentType = assertOneOf(
    input.assignmentType,
    assignmentTypes,
    "WORKFORCE_ASSIGNMENT_TYPE_INVALID"
  );
  const roleLabel = input.roleLabel.trim();
  if (!roleLabel) {
    throw new Error("WORKFORCE_ASSIGNMENT_ROLE_REQUIRED");
  }
  await assertScopedLocation(session, input.locationId);
  const effectiveFrom = parseDateOnly(
    input.effectiveFrom,
    "WORKFORCE_ASSIGNMENT_EFFECTIVE_FROM_INVALID"
  );
  const isPrimary = Boolean(input.isPrimary);

  return prisma.$transaction(async (tx) => {
    const scope = await loadWorkforceScopeSnapshot(session);
    const employee = await getScopedEmployeeForManagementOrThrow(
      tx,
      session,
      input.employeeId
    );
    if (employee.status !== "ACTIVE") {
      throw new Error("WORKFORCE_ASSIGNMENT_EMPLOYEE_NOT_ACTIVE");
    }
    const duplicate = await tx.employeeAssignment.findFirst({
      where: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        employeeId: employee.id,
        locationId: input.locationId,
        roleLabel,
        status: { in: ["PLANNED", "ACTIVE"] }
      },
      select: { id: true }
    });
    if (duplicate) {
      throw new Error("WORKFORCE_ASSIGNMENT_DUPLICATE_ACTIVE_ROLE");
    }
    let replacedPrimary: Awaited<
      ReturnType<typeof tx.employeeAssignment.findFirst>
    > | null = null;

    if (isPrimary) {
      const activePrimary = await tx.employeeAssignment.findFirst({
        where: {
          tenantId: session.context.tenantId,
          companyId: session.context.companyId,
          employeeId: employee.id,
          isPrimary: true,
          locationId: { in: scope.locationIds },
          status: { in: ["PLANNED", "ACTIVE"] }
        },
        include: {
          employee: true,
          location: true
        }
      });
      if (activePrimary) {
        if (!input.replacesAssignmentId) {
          throw new Error("WORKFORCE_ASSIGNMENT_ACTIVE_PRIMARY_EXISTS");
        }
        if (activePrimary.id !== input.replacesAssignmentId) {
          throw new Error("WORKFORCE_ASSIGNMENT_REPLACEMENT_PRIMARY_INVALID");
        }
        if (effectiveFrom <= activePrimary.effectiveFrom) {
          throw new Error("WORKFORCE_ASSIGNMENT_REPLACEMENT_DATE_INVALID");
        }
        replacedPrimary = activePrimary;
      } else if (input.replacesAssignmentId) {
        throw new Error("WORKFORCE_ASSIGNMENT_REPLACEMENT_PRIMARY_NOT_FOUND");
      }
    }

    if (replacedPrimary) {
      const replacementEffectiveTo = dayBefore(effectiveFrom);
      await tx.employeeAssignment.update({
        where: { id: replacedPrimary.id },
        data: {
          status: "ENDED",
          effectiveTo: replacementEffectiveTo,
          reason
        }
      });
    }

    const created = await tx.employeeAssignment.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        employeeId: employee.id,
        locationId: input.locationId,
        assignmentType,
        status: "ACTIVE",
        isPrimary,
        roleLabel,
        effectiveFrom,
        reason,
        createdByUserId: session.user.id
      }
    });
    await writeWorkforceAudit(tx, {
      session,
      entityType: "EmployeeAssignment",
      entityId: created.id,
      eventType: "workforce.assignment_created",
      beforeStatus: "NEW",
      afterStatus: created.status,
      reason,
      evidenceReference: input.evidenceReference ?? null,
      metadata: {
        employeeId: employee.id,
        employeeCode: employee.employeeCode,
        locationId: input.locationId,
        assignmentType,
        isPrimary,
        roleLabel,
        replacedAssignmentId: replacedPrimary?.id ?? null,
        fullTransferWorkflowDeferred: true,
        noPayrollComputation: true,
        noAttendanceDeviceAuthority: true,
        noPaymentRequest: true,
        noFinanceJournal: true
      }
    });
    if (replacedPrimary) {
      await writeWorkforceAudit(tx, {
        session,
        entityType: "EmployeeAssignment",
        entityId: replacedPrimary.id,
        eventType: "workforce.assignment_replaced_by_primary",
        beforeStatus: replacedPrimary.status,
        afterStatus: "ENDED",
        reason,
        evidenceReference: input.evidenceReference ?? null,
        metadata: {
          employeeId: employee.id,
          employeeCode: employee.employeeCode,
          previousLocationId: replacedPrimary.locationId,
          nextLocationId: input.locationId,
          replacementAssignmentId: created.id,
          previousEffectiveFrom: replacedPrimary.effectiveFrom.toISOString(),
          previousEffectiveTo: dayBefore(effectiveFrom).toISOString(),
          nextEffectiveFrom: effectiveFrom.toISOString(),
          controlledPrimaryHandoff: true,
          fullTransferApprovalRoutingDeferred: true,
          noPayrollComputation: true,
          noAttendanceDeviceAuthority: true,
          noPaymentRequest: true,
          noFinanceJournal: true
        }
      });
    }
    return created;
  });
}

export async function endEmployeeAssignment(
  session: SessionContext,
  input: EndEmployeeAssignmentInput
) {
  await requireWorkforcePermission(session, permissions.workforceManage);
  const reason = requireWorkforceReason(
    input.reason,
    "WORKFORCE_ASSIGNMENT_END_REASON_REQUIRED"
  );
  const effectiveTo = parseDateOnly(
    input.effectiveTo,
    "WORKFORCE_ASSIGNMENT_EFFECTIVE_TO_INVALID"
  );

  return prisma.$transaction(async (tx) => {
    const assignment = await getScopedAssignmentForManagementOrThrow(
      tx,
      session,
      input.assignmentId
    );
    if (!["PLANNED", "ACTIVE"].includes(assignment.status)) {
      throw new Error("WORKFORCE_ASSIGNMENT_END_STATUS_INVALID");
    }
    if (effectiveTo < assignment.effectiveFrom) {
      throw new Error("WORKFORCE_ASSIGNMENT_END_DATE_INVALID");
    }
    const updated = await tx.employeeAssignment.update({
      where: { id: assignment.id },
      data: {
        status: "ENDED",
        effectiveTo,
        reason
      }
    });
    await writeWorkforceAudit(tx, {
      session,
      entityType: "EmployeeAssignment",
      entityId: assignment.id,
      eventType: "workforce.assignment_ended",
      beforeStatus: assignment.status,
      afterStatus: updated.status,
      reason,
      evidenceReference: input.evidenceReference ?? null,
      metadata: {
        employeeId: assignment.employeeId,
        employeeCode: assignment.employee.employeeCode,
        locationId: assignment.locationId,
        assignmentType: assignment.assignmentType,
        isPrimary: assignment.isPrimary,
        effectiveFrom: assignment.effectiveFrom.toISOString(),
        effectiveTo: updated.effectiveTo?.toISOString() ?? null,
        fullTransferWorkflowDeferred: true,
        noPayrollComputation: true,
        noAttendanceDeviceAuthority: true,
        noPaymentRequest: true,
        noFinanceJournal: true
      }
    });
    return updated;
  });
}

export async function createDraftLeaveRequest(
  session: SessionContext,
  input: CreateDraftLeaveRequestInput
) {
  await requirePermission(session, permissions.workforceManage);
  if (!leaveTypes.includes(input.leaveType)) {
    throw new Error("WORKFORCE_LEAVE_TYPE_INVALID");
  }
  const reason = requireWorkforceReason(
    input.reason,
    "WORKFORCE_LEAVE_REASON_REQUIRED"
  );
  const startDate = parseDateOnly(
    input.startDate,
    "WORKFORCE_LEAVE_START_DATE_INVALID"
  );
  const endDate = parseDateOnly(
    input.endDate,
    "WORKFORCE_LEAVE_END_DATE_INVALID"
  );
  if (endDate < startDate) {
    throw new Error("WORKFORCE_LEAVE_DATE_RANGE_INVALID");
  }

  return prisma.$transaction(async (tx) => {
    const existing = input.idempotencyKey
      ? await tx.employeeLeaveRequest.findFirst({
          where: {
            tenantId: session.context.tenantId,
            companyId: session.context.companyId,
            sourceEventKey: input.idempotencyKey
          }
        })
      : null;
    if (existing) {
      return existing;
    }
    const { employee, locationId } = await getScopedEmployeeForDraftOrThrow(
      tx,
      session,
      input.employeeId
    );
    const created = await tx.employeeLeaveRequest.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        employeeId: employee.id,
        locationId,
        leaveType: input.leaveType,
        status: "DRAFT",
        requestedByUserId: session.user.id,
        reason,
        startDate,
        endDate,
        requestedMinutes: inclusiveWorkdayMinutes(startDate, endDate),
        idempotencyKey: input.idempotencyKey ?? null,
        sourceEventKey:
          input.idempotencyKey ??
          `workforce:leave:draft:${session.user.id}:${employee.id}:${input.leaveType}:${input.startDate}:${input.endDate}`,
        createdByUserId: session.user.id
      }
    });
    await writeWorkforceAudit(tx, {
      session,
      entityType: "EmployeeLeaveRequest",
      entityId: created.id,
      eventType: "workforce.leave_draft_created",
      beforeStatus: "NONE",
      afterStatus: created.status,
      reason,
      evidenceReference: input.evidenceReference ?? null,
      metadata: {
        idempotencyKey: input.idempotencyKey ?? null,
        employeeId: employee.id,
        locationId,
        requestedMinutes: created.requestedMinutes
      }
    });
    return created;
  });
}

export async function createDraftOvertimeRecord(
  session: SessionContext,
  input: CreateDraftOvertimeRecordInput
) {
  await requirePermission(session, permissions.workforceManage);
  if (!overtimeTypes.includes(input.overtimeType)) {
    throw new Error("WORKFORCE_OVERTIME_TYPE_INVALID");
  }
  const reason = requireWorkforceReason(
    input.reason,
    "WORKFORCE_OVERTIME_REASON_REQUIRED"
  );
  const workedStartAt = parseDateTime(
    input.workedStartAt,
    "WORKFORCE_OVERTIME_START_INVALID"
  );
  const workedEndAt = parseDateTime(
    input.workedEndAt,
    "WORKFORCE_OVERTIME_END_INVALID"
  );
  const requestedMinutes = Math.round(
    (workedEndAt.getTime() - workedStartAt.getTime()) / 60000
  );
  if (requestedMinutes <= 0) {
    throw new Error("WORKFORCE_OVERTIME_RANGE_INVALID");
  }

  return prisma.$transaction(async (tx) => {
    const existing = input.idempotencyKey
      ? await tx.employeeOvertimeRecord.findFirst({
          where: {
            tenantId: session.context.tenantId,
            companyId: session.context.companyId,
            sourceEventKey: input.idempotencyKey
          }
        })
      : null;
    if (existing) {
      return existing;
    }
    const { employee, locationId } = await getScopedEmployeeForDraftOrThrow(
      tx,
      session,
      input.employeeId
    );
    const created = await tx.employeeOvertimeRecord.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        employeeId: employee.id,
        locationId,
        overtimeType: input.overtimeType,
        status: "DRAFT",
        workedStartAt,
        workedEndAt,
        requestedMinutes,
        reason,
        requestedByUserId: session.user.id,
        idempotencyKey: input.idempotencyKey ?? null,
        sourceEventKey:
          input.idempotencyKey ??
          `workforce:overtime:draft:${session.user.id}:${employee.id}:${input.overtimeType}:${input.workedStartAt}:${input.workedEndAt}`,
        createdByUserId: session.user.id
      }
    });
    await writeWorkforceAudit(tx, {
      session,
      entityType: "EmployeeOvertimeRecord",
      entityId: created.id,
      eventType: "workforce.overtime_draft_created",
      beforeStatus: "NONE",
      afterStatus: created.status,
      reason,
      evidenceReference: input.evidenceReference ?? null,
      metadata: {
        idempotencyKey: input.idempotencyKey ?? null,
        employeeId: employee.id,
        locationId,
        requestedMinutes
      }
    });
    return created;
  });
}

export async function createDraftWorkforceSchedule(
  session: SessionContext,
  input: CreateDraftWorkforceScheduleInput
) {
  await requirePermission(session, permissions.workforceScheduleManage);
  if (!workforceShiftTypes.includes(input.shiftType)) {
    throw new Error("WORKFORCE_SCHEDULE_SHIFT_TYPE_INVALID");
  }
  await assertScopedLocation(session, session.context.locationId);
  const reason = requireWorkforceReason(
    input.reason,
    "WORKFORCE_SCHEDULE_REASON_REQUIRED"
  );
  const scheduleDate = parseDateOnly(
    input.scheduleDate,
    "WORKFORCE_SCHEDULE_DATE_INVALID"
  );
  const plannedStartAt = parseDateTime(
    input.plannedStartAt,
    "WORKFORCE_SCHEDULE_START_INVALID"
  );
  let plannedEndAt = parseDateTime(
    input.plannedEndAt,
    "WORKFORCE_SCHEDULE_END_INVALID"
  );
  if (input.shiftType === "OVERNIGHT" && plannedEndAt <= plannedStartAt) {
    plannedEndAt = new Date(plannedEndAt.getTime() + 24 * 60 * 60 * 1000);
  }
  const plannedMinutesPerHead = minutesBetween(
    plannedStartAt,
    plannedEndAt,
    "WORKFORCE_SCHEDULE_RANGE_INVALID"
  );
  const plannedHeadcount = Math.trunc(Number(input.plannedHeadcount));
  if (plannedHeadcount < 1 || plannedHeadcount > 100) {
    throw new Error("WORKFORCE_SCHEDULE_HEADCOUNT_INVALID");
  }
  const stationCode = input.stationCode.trim();
  const roleLabel = input.roleLabel.trim();
  if (!stationCode) {
    throw new Error("WORKFORCE_SCHEDULE_STATION_REQUIRED");
  }
  if (!roleLabel) {
    throw new Error("WORKFORCE_SCHEDULE_ROLE_REQUIRED");
  }

  return prisma.$transaction(async (tx) => {
    const scope = await loadWorkforceScopeSnapshot(session);
    const existing = input.idempotencyKey
      ? await tx.workforceSchedule.findFirst({
          where: {
            tenantId: session.context.tenantId,
            companyId: session.context.companyId,
            sourceEventKey: input.idempotencyKey
          }
        })
      : null;
    if (existing) {
      return existing;
    }

    const assigned = input.assignedEmployeeId?.trim()
      ? await getScopedEmployeeForDraftOrThrow(
          tx,
          session,
          input.assignedEmployeeId.trim()
        )
      : null;
    if (assigned && assigned.locationId !== session.context.locationId) {
      throw new Error("WORKFORCE_SCHEDULE_EMPLOYEE_LOCATION_MISMATCH");
    }
    await assertNoWorkforceScheduleConflicts(tx, session, {
      assignedEmployeeId: assigned?.employee.id ?? null,
      stationCode,
      roleLabel,
      plannedStartAt,
      plannedEndAt
    });
    const assignedHeadcount = assigned ? 1 : 0;
    const coverageGapCount = Math.max(plannedHeadcount - assignedHeadcount, 0);
    const currentLocation = scope.locationsById.get(session.context.locationId);
    const evidenceReference = input.evidenceReference?.trim() || null;
    const created = await tx.workforceSchedule.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        brandId: session.context.brandId,
        locationId: session.context.locationId,
        publicReference: nextWorkforceScheduleReference({
          scheduleDate,
          locationName: currentLocation?.name ?? session.context.locationName
        }),
        scheduleDate,
        shiftType: input.shiftType,
        status: "DRAFT",
        plannedHeadcount,
        assignedHeadcount,
        coverageGapCount,
        plannedMinutes: plannedMinutesPerHead * plannedHeadcount,
        reason,
        evidenceReference,
        idempotencyKey: input.idempotencyKey ?? null,
        sourceEventKey:
          input.idempotencyKey ??
          `workforce:schedule:draft:${session.user.id}:${session.context.locationId}:${input.shiftType}:${input.scheduleDate}:${stationCode}:${roleLabel}:${input.plannedStartAt}:${input.plannedEndAt}`,
        createdByUserId: session.user.id,
        lines: {
          create: {
            tenantId: session.context.tenantId,
            companyId: session.context.companyId,
            brandId: session.context.brandId,
            locationId: session.context.locationId,
            employeeId: assigned?.employee.id ?? null,
            lineNumber: 1,
            stationCode,
            roleLabel,
            plannedStartAt,
            plannedEndAt,
            plannedMinutes: plannedMinutesPerHead * plannedHeadcount,
            status:
              coverageGapCount > 0 ? "GAP" : assigned ? "ASSIGNED" : "PLANNED",
            coverageGapReason: coverageGapCount > 0 ? reason : null,
            evidenceReference,
            createdByUserId: session.user.id
          }
        }
      }
    });
    await writeWorkforceAudit(tx, {
      session,
      entityType: "WorkforceSchedule",
      entityId: created.id,
      eventType: "workforce.schedule_draft_created",
      beforeStatus: "NONE",
      afterStatus: created.status,
      reason,
      evidenceReference,
      metadata: {
        idempotencyKey: input.idempotencyKey ?? null,
        locationId: session.context.locationId,
        shiftType: input.shiftType,
        plannedHeadcount,
        assignedHeadcount,
        coverageGapCount,
        conflictChecked: true,
        noSchedulePublication: true
      }
    });
    return created;
  });
}

export async function submitLeaveRequest(
  session: SessionContext,
  input: LeaveActionInput
) {
  await requirePermission(session, permissions.workforceManage);
  return prisma.$transaction(async (tx) => {
    const request = await getScopedLeaveOrThrow(
      tx,
      session,
      input.leaveRequestId
    );
    if (request.status === "SUBMITTED") {
      return request;
    }
    assertStatusAllowed(
      request.status,
      ["DRAFT", "RETURNED_FOR_REVISION"],
      "WORKFORCE_LEAVE_INVALID_SUBMIT_STATUS"
    );
    const approvalRule = await findEmployeeLeaveApprovalRule(tx, session);
    if (!approvalRule || approvalRule.steps.length === 0) {
      throw new Error("WORKFORCE_LEAVE_APPROVAL_RULE_NOT_CONFIGURED");
    }
    const firstStep = approvalRule.steps[0];
    if (!firstStep) {
      throw new Error("WORKFORCE_LEAVE_APPROVAL_RULE_STEP_NOT_CONFIGURED");
    }
    const existingApproval = await tx.approvalInstance.findFirst({
      where: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        documentType: "EmployeeLeaveRequest",
        documentId: request.id,
        status: "PENDING"
      }
    });
    if (existingApproval) {
      throw new Error("WORKFORCE_LEAVE_ALREADY_SUBMITTED");
    }

    const approvalInstance = await tx.approvalInstance.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        documentType: "EmployeeLeaveRequest",
        documentId: request.id,
        approvalRuleId: approvalRule.id,
        status: "PENDING",
        currentStepOrder: firstStep.stepOrder,
        steps: {
          create: approvalRule.steps.map((step, index) => ({
            stepOrder: step.stepOrder,
            assignedUserId: step.userId,
            assignedRoleId: step.roleId,
            status: index === 0 ? "PENDING" : "WAITING"
          }))
        }
      }
    });
    const submittedAt = new Date();
    const updated = await tx.employeeLeaveRequest.update({
      where: { id: request.id },
      data: {
        status: "SUBMITTED",
        approvalInstanceId: approvalInstance.id,
        submittedAt,
        updatedByUserId: session.user.id
      }
    });
    const auditEvent = await tx.auditEvent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        actorUserId: session.user.id,
        eventType: "workforce.leave_submitted",
        entityType: "EmployeeLeaveRequest",
        entityId: request.id,
        beforeData: { status: request.status },
        afterData: { status: updated.status, submittedAt },
        metadata: {
          idempotencyKey: input.idempotencyKey ?? null,
          approvalInstanceId: approvalInstance.id,
          approvalRuleId: approvalRule.id,
          approvalStepOrder: firstStep.stepOrder,
          noPayrollComputation: true,
          noWageComputation: true,
          noPayrollExport: true,
          noPaymentRequest: true,
          noFinanceJournal: true,
          noAttendanceDeviceAuthority: true
        }
      }
    });
    const recipientUserIds = await resolveScopedNotificationRecipients(tx, {
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      locationId: request.locationId ?? session.context.locationId,
      assignedUserId: firstStep.userId,
      assignedRoleId: firstStep.roleId
    });
    await recordWorkflowNotifications(tx, {
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      locationId: request.locationId ?? session.context.locationId,
      recipientUserIds,
      notificationType: "APPROVE_WORKFORCE_LEAVE",
      priority: "NORMAL",
      title: "Approve Leave Request",
      body: `${session.user.displayName} submitted a leave request for approval.`,
      deepLink: `/approvals/${approvalInstance.id}`,
      entityType: "EmployeeLeaveRequest",
      entityId: request.id,
      sourceEventKey: auditEvent.id,
      recipientBasis: firstStep.userId ? "assigned_user" : "assigned_role",
      metadata: {
        approvalInstanceId: approvalInstance.id,
        approvalStepOrder: firstStep.stepOrder,
        leaveType: request.leaveType,
        startDate: request.startDate.toISOString(),
        endDate: request.endDate.toISOString(),
        requestedMinutes: request.requestedMinutes,
        noPayrollComputation: true,
        noPaymentRequest: true,
        noFinanceJournal: true
      }
    });
    await writeWorkforceAudit(tx, {
      session,
      entityType: "EmployeeLeaveRequest",
      entityId: request.id,
      eventType: "workforce.leave_approval_routed",
      beforeStatus: request.status,
      afterStatus: updated.status,
      metadata: {
        approvalInstanceId: approvalInstance.id,
        approvalRuleId: approvalRule.id,
        approvalStepOrder: firstStep.stepOrder,
        notificationRecipientCount: recipientUserIds.length
      }
    });
    return updated;
  });
}

export async function approveLeaveRequest(
  session: SessionContext,
  input: LeaveActionInput
) {
  await requireWorkforcePermission(session, permissions.workforceLeaveApprove);
  return prisma.$transaction(async (tx) => {
    const request = await getScopedLeaveOrThrow(
      tx,
      session,
      input.leaveRequestId
    );
    assertStatusAllowed(
      request.status,
      ["SUBMITTED", "UNDER_REVIEW"],
      "WORKFORCE_LEAVE_INVALID_APPROVAL_STATUS"
    );
    if (request.requestedByUserId === session.user.id) {
      throw new Error("WORKFORCE_LEAVE_SELF_APPROVAL_BLOCKED");
    }
    const updated = await tx.employeeLeaveRequest.update({
      where: { id: request.id },
      data: {
        status: "APPROVED",
        approvedByUserId: session.user.id,
        approvedAt: new Date(),
        decisionAt: new Date(),
        decisionNote: input.reason?.trim() ?? "Approved",
        updatedByUserId: session.user.id
      }
    });
    await writeWorkforceAudit(tx, {
      session,
      entityType: "EmployeeLeaveRequest",
      entityId: request.id,
      eventType: "workforce.leave_approved",
      beforeStatus: request.status,
      afterStatus: updated.status,
      reason: input.reason?.trim() ?? null
    });
    return updated;
  });
}

export async function returnLeaveRequestForRevision(
  session: SessionContext,
  input: LeaveActionInput
) {
  await requireWorkforcePermission(session, permissions.workforceLeaveApprove);
  const reason = requireWorkforceReason(
    input.reason,
    "WORKFORCE_LEAVE_RETURN_REASON_REQUIRED"
  );
  return prisma.$transaction(async (tx) => {
    const request = await getScopedLeaveOrThrow(
      tx,
      session,
      input.leaveRequestId
    );
    assertStatusAllowed(
      request.status,
      ["SUBMITTED", "UNDER_REVIEW"],
      "WORKFORCE_LEAVE_INVALID_RETURN_STATUS"
    );
    const updated = await tx.employeeLeaveRequest.update({
      where: { id: request.id },
      data: {
        status: "RETURNED_FOR_REVISION",
        decisionAt: new Date(),
        decisionNote: reason,
        updatedByUserId: session.user.id
      }
    });
    await writeWorkforceAudit(tx, {
      session,
      entityType: "EmployeeLeaveRequest",
      entityId: request.id,
      eventType: "workforce.leave_returned",
      beforeStatus: request.status,
      afterStatus: updated.status,
      reason,
      evidenceReference: input.evidenceReference ?? null
    });
    return updated;
  });
}

export async function rejectLeaveRequest(
  session: SessionContext,
  input: LeaveActionInput
) {
  await requireWorkforcePermission(session, permissions.workforceLeaveApprove);
  const reason = requireWorkforceReason(
    input.reason,
    "WORKFORCE_LEAVE_REJECTION_REASON_REQUIRED"
  );
  return prisma.$transaction(async (tx) => {
    const request = await getScopedLeaveOrThrow(
      tx,
      session,
      input.leaveRequestId
    );
    assertStatusAllowed(
      request.status,
      ["SUBMITTED", "UNDER_REVIEW"],
      "WORKFORCE_LEAVE_INVALID_REJECTION_STATUS"
    );
    const updated = await tx.employeeLeaveRequest.update({
      where: { id: request.id },
      data: {
        status: "REJECTED",
        decisionAt: new Date(),
        decisionNote: reason,
        updatedByUserId: session.user.id
      }
    });
    await writeWorkforceAudit(tx, {
      session,
      entityType: "EmployeeLeaveRequest",
      entityId: request.id,
      eventType: "workforce.leave_rejected",
      beforeStatus: request.status,
      afterStatus: updated.status,
      reason,
      evidenceReference: input.evidenceReference ?? null
    });
    return updated;
  });
}

export async function cancelLeaveRequest(
  session: SessionContext,
  input: LeaveActionInput
) {
  await requirePermission(session, permissions.workforceManage);
  const reason = requireWorkforceReason(
    input.reason,
    "WORKFORCE_LEAVE_CANCELLATION_REASON_REQUIRED"
  );
  return prisma.$transaction(async (tx) => {
    const request = await getScopedLeaveOrThrow(
      tx,
      session,
      input.leaveRequestId
    );
    assertStatusAllowed(
      request.status,
      [
        "DRAFT",
        "SUBMITTED",
        "UNDER_REVIEW",
        "RETURNED_FOR_REVISION",
        "APPROVED"
      ],
      "WORKFORCE_LEAVE_INVALID_CANCEL_STATUS"
    );
    const updated = await tx.employeeLeaveRequest.update({
      where: { id: request.id },
      data: {
        status: "CANCELLED",
        decisionAt: new Date(),
        decisionNote: reason,
        updatedByUserId: session.user.id
      }
    });
    await writeWorkforceAudit(tx, {
      session,
      entityType: "EmployeeLeaveRequest",
      entityId: request.id,
      eventType: "workforce.leave_cancelled",
      beforeStatus: request.status,
      afterStatus: updated.status,
      reason,
      evidenceReference: input.evidenceReference ?? null
    });
    return updated;
  });
}

export async function submitOvertimeRecord(
  session: SessionContext,
  input: OvertimeActionInput
) {
  await requirePermission(session, permissions.workforceManage);
  return prisma.$transaction(async (tx) => {
    const record = await getScopedOvertimeOrThrow(
      tx,
      session,
      input.overtimeRecordId
    );
    if (record.status === "SUBMITTED") {
      return record;
    }
    assertStatusAllowed(
      record.status,
      ["DRAFT"],
      "WORKFORCE_OVERTIME_INVALID_SUBMIT_STATUS"
    );
    const approvalRule = await findEmployeeOvertimeApprovalRule(tx, session);
    if (!approvalRule || approvalRule.steps.length === 0) {
      throw new Error("WORKFORCE_OVERTIME_APPROVAL_RULE_NOT_CONFIGURED");
    }
    const firstStep = approvalRule.steps[0];
    if (!firstStep) {
      throw new Error("WORKFORCE_OVERTIME_APPROVAL_RULE_STEP_NOT_CONFIGURED");
    }
    const existingApproval = await tx.approvalInstance.findFirst({
      where: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        documentType: "EmployeeOvertimeRecord",
        documentId: record.id,
        status: "PENDING"
      }
    });
    if (existingApproval) {
      throw new Error("WORKFORCE_OVERTIME_ALREADY_SUBMITTED");
    }

    const approvalInstance = await tx.approvalInstance.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        documentType: "EmployeeOvertimeRecord",
        documentId: record.id,
        approvalRuleId: approvalRule.id,
        status: "PENDING",
        currentStepOrder: firstStep.stepOrder,
        steps: {
          create: approvalRule.steps.map((step, index) => ({
            stepOrder: step.stepOrder,
            assignedUserId: step.userId,
            assignedRoleId: step.roleId,
            status: index === 0 ? "PENDING" : "WAITING"
          }))
        }
      }
    });
    const updated = await tx.employeeOvertimeRecord.update({
      where: { id: record.id },
      data: {
        status: "SUBMITTED",
        approvalInstanceId: approvalInstance.id,
        updatedByUserId: session.user.id
      }
    });
    const auditEvent = await tx.auditEvent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        actorUserId: session.user.id,
        eventType: "workforce.overtime_submitted",
        entityType: "EmployeeOvertimeRecord",
        entityId: record.id,
        beforeData: { status: record.status },
        afterData: { status: updated.status },
        metadata: {
          idempotencyKey: input.idempotencyKey ?? null,
          approvalInstanceId: approvalInstance.id,
          approvalRuleId: approvalRule.id,
          approvalStepOrder: firstStep.stepOrder,
          noPayrollComputation: true,
          noWageComputation: true,
          noPayrollExport: true,
          noPaymentRequest: true,
          noFinanceJournal: true,
          noAttendanceDeviceAuthority: true
        }
      }
    });
    const recipientUserIds = await resolveScopedNotificationRecipients(tx, {
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      locationId: record.locationId ?? session.context.locationId,
      assignedUserId: firstStep.userId,
      assignedRoleId: firstStep.roleId
    });
    await recordWorkflowNotifications(tx, {
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      locationId: record.locationId ?? session.context.locationId,
      recipientUserIds,
      notificationType: "APPROVE_WORKFORCE_OVERTIME",
      priority: "NORMAL",
      title: "Approve Overtime Record",
      body: `${session.user.displayName} submitted an overtime record for approval.`,
      deepLink: `/approvals/${approvalInstance.id}`,
      entityType: "EmployeeOvertimeRecord",
      entityId: record.id,
      sourceEventKey: auditEvent.id,
      recipientBasis: firstStep.userId ? "assigned_user" : "assigned_role",
      metadata: {
        approvalInstanceId: approvalInstance.id,
        approvalStepOrder: firstStep.stepOrder,
        overtimeType: record.overtimeType,
        workedStartAt: record.workedStartAt.toISOString(),
        workedEndAt: record.workedEndAt.toISOString(),
        requestedMinutes: record.requestedMinutes,
        noPayrollComputation: true,
        noPaymentRequest: true,
        noFinanceJournal: true
      }
    });
    await writeWorkforceAudit(tx, {
      session,
      entityType: "EmployeeOvertimeRecord",
      entityId: record.id,
      eventType: "workforce.overtime_approval_routed",
      beforeStatus: record.status,
      afterStatus: updated.status,
      metadata: {
        approvalInstanceId: approvalInstance.id,
        approvalRuleId: approvalRule.id,
        approvalStepOrder: firstStep.stepOrder,
        notificationRecipientCount: recipientUserIds.length
      }
    });
    return updated;
  });
}

export async function approveOvertimeRecord(
  session: SessionContext,
  input: OvertimeActionInput
) {
  await requireWorkforcePermission(
    session,
    permissions.workforceOvertimeApprove
  );
  return prisma.$transaction(async (tx) => {
    const record = await getScopedOvertimeOrThrow(
      tx,
      session,
      input.overtimeRecordId
    );
    assertStatusAllowed(
      record.status,
      ["SUBMITTED", "UNDER_REVIEW"],
      "WORKFORCE_OVERTIME_INVALID_APPROVAL_STATUS"
    );
    if (record.requestedByUserId === session.user.id) {
      throw new Error("WORKFORCE_OVERTIME_SELF_APPROVAL_BLOCKED");
    }
    const updated = await tx.employeeOvertimeRecord.update({
      where: { id: record.id },
      data: {
        status: "APPROVED",
        approvedByUserId: session.user.id,
        approvedAt: new Date(),
        updatedByUserId: session.user.id
      }
    });
    await writeWorkforceAudit(tx, {
      session,
      entityType: "EmployeeOvertimeRecord",
      entityId: record.id,
      eventType: "workforce.overtime_approved",
      beforeStatus: record.status,
      afterStatus: updated.status,
      reason: input.reason?.trim() ?? null
    });
    return updated;
  });
}

export async function rejectOvertimeRecord(
  session: SessionContext,
  input: OvertimeActionInput
) {
  await requireWorkforcePermission(
    session,
    permissions.workforceOvertimeApprove
  );
  const reason = requireWorkforceReason(
    input.reason,
    "WORKFORCE_OVERTIME_REJECTION_REASON_REQUIRED"
  );
  return prisma.$transaction(async (tx) => {
    const record = await getScopedOvertimeOrThrow(
      tx,
      session,
      input.overtimeRecordId
    );
    assertStatusAllowed(
      record.status,
      ["SUBMITTED", "UNDER_REVIEW"],
      "WORKFORCE_OVERTIME_INVALID_REJECTION_STATUS"
    );
    const updated = await tx.employeeOvertimeRecord.update({
      where: { id: record.id },
      data: {
        status: "REJECTED",
        updatedByUserId: session.user.id
      }
    });
    await writeWorkforceAudit(tx, {
      session,
      entityType: "EmployeeOvertimeRecord",
      entityId: record.id,
      eventType: "workforce.overtime_rejected",
      beforeStatus: record.status,
      afterStatus: updated.status,
      reason,
      evidenceReference: input.evidenceReference ?? null
    });
    return updated;
  });
}

export async function cancelOvertimeRecord(
  session: SessionContext,
  input: OvertimeActionInput
) {
  await requirePermission(session, permissions.workforceManage);
  const reason = requireWorkforceReason(
    input.reason,
    "WORKFORCE_OVERTIME_CANCELLATION_REASON_REQUIRED"
  );
  return prisma.$transaction(async (tx) => {
    const record = await getScopedOvertimeOrThrow(
      tx,
      session,
      input.overtimeRecordId
    );
    assertStatusAllowed(
      record.status,
      ["DRAFT", "SUBMITTED", "UNDER_REVIEW", "APPROVED"],
      "WORKFORCE_OVERTIME_INVALID_CANCEL_STATUS"
    );
    const updated = await tx.employeeOvertimeRecord.update({
      where: { id: record.id },
      data: {
        status: "CANCELLED",
        updatedByUserId: session.user.id
      }
    });
    await writeWorkforceAudit(tx, {
      session,
      entityType: "EmployeeOvertimeRecord",
      entityId: record.id,
      eventType: "workforce.overtime_cancelled",
      beforeStatus: record.status,
      afterStatus: updated.status,
      reason,
      evidenceReference: input.evidenceReference ?? null
    });
    return updated;
  });
}

export async function submitWorkforceSchedule(
  session: SessionContext,
  input: ScheduleActionInput
) {
  await requirePermission(session, permissions.workforceScheduleManage);
  return prisma.$transaction(async (tx) => {
    const schedule = await getScopedScheduleOrThrow(
      tx,
      session,
      input.scheduleId
    );
    assertStatusAllowed(
      schedule.status,
      ["DRAFT", "RETURNED_FOR_REVISION"],
      "WORKFORCE_SCHEDULE_INVALID_SUBMIT_STATUS"
    );
    if (schedule.lines.length === 0) {
      throw new Error("WORKFORCE_SCHEDULE_LINES_REQUIRED");
    }
    const approvalRule = await findWorkforceScheduleApprovalRule(tx, session);
    if (!approvalRule || approvalRule.steps.length === 0) {
      throw new Error("WORKFORCE_SCHEDULE_APPROVAL_RULE_NOT_CONFIGURED");
    }
    const firstStep = approvalRule.steps[0];
    if (!firstStep) {
      throw new Error("WORKFORCE_SCHEDULE_APPROVAL_RULE_STEP_NOT_CONFIGURED");
    }
    const existingApproval = await tx.approvalInstance.findFirst({
      where: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        documentType: "WorkforceSchedule",
        documentId: schedule.id,
        status: "PENDING"
      }
    });
    if (existingApproval) {
      throw new Error("WORKFORCE_SCHEDULE_ALREADY_SUBMITTED");
    }

    const approvalInstance = await tx.approvalInstance.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        documentType: "WorkforceSchedule",
        documentId: schedule.id,
        approvalRuleId: approvalRule.id,
        status: "PENDING",
        currentStepOrder: firstStep.stepOrder,
        steps: {
          create: approvalRule.steps.map((step, index) => ({
            stepOrder: step.stepOrder,
            assignedUserId: step.userId,
            assignedRoleId: step.roleId,
            status: index === 0 ? "PENDING" : "WAITING"
          }))
        }
      }
    });
    const submittedAt = new Date();
    const updated = await tx.workforceSchedule.update({
      where: { id: schedule.id },
      data: {
        status: "SUBMITTED",
        approvalInstanceId: approvalInstance.id,
        submittedByUserId: session.user.id,
        submittedAt,
        reason: input.reason?.trim() ?? schedule.reason,
        evidenceReference:
          input.evidenceReference?.trim() ?? schedule.evidenceReference
      }
    });
    const auditEvent = await tx.auditEvent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        actorUserId: session.user.id,
        eventType: "workforce.schedule_submitted",
        entityType: "WorkforceSchedule",
        entityId: schedule.id,
        beforeData: { status: schedule.status },
        afterData: { status: updated.status, submittedAt },
        metadata: {
          approvalInstanceId: approvalInstance.id,
          approvalRuleId: approvalRule.id,
          approvalStepOrder: firstStep.stepOrder,
          lineCount: schedule.lines.length,
          coverageGapCount: schedule.coverageGapCount,
          noSchedulePublication: true,
          noPayrollComputation: true,
          noWageComputation: true,
          noPayrollExport: true,
          noPaymentRequest: true,
          noFinanceJournal: true,
          noAttendanceDeviceAuthority: true
        }
      }
    });
    const recipientUserIds = await resolveScopedNotificationRecipients(tx, {
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      locationId: schedule.locationId,
      assignedUserId: firstStep.userId,
      assignedRoleId: firstStep.roleId
    });
    await recordWorkflowNotifications(tx, {
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      locationId: schedule.locationId,
      recipientUserIds,
      notificationType: "APPROVE_WORKFORCE_SCHEDULE",
      priority: "NORMAL",
      title: `Approve Workforce Schedule ${schedule.publicReference}`,
      body: `${session.user.displayName} submitted ${schedule.publicReference} for approval.`,
      deepLink: `/approvals/${approvalInstance.id}`,
      entityType: "WorkforceSchedule",
      entityId: schedule.id,
      sourceEventKey: auditEvent.id,
      recipientBasis: firstStep.userId ? "assigned_user" : "assigned_role",
      metadata: {
        approvalInstanceId: approvalInstance.id,
        approvalStepOrder: firstStep.stepOrder,
        publicReference: schedule.publicReference,
        scheduleDate: schedule.scheduleDate.toISOString(),
        shiftType: schedule.shiftType,
        coverageGapCount: schedule.coverageGapCount,
        noSchedulePublication: true,
        noPayrollComputation: true,
        noPaymentRequest: true,
        noFinanceJournal: true
      }
    });
    await writeWorkforceAudit(tx, {
      session,
      entityType: "WorkforceSchedule",
      entityId: schedule.id,
      eventType: "workforce.schedule_approval_routed",
      beforeStatus: schedule.status,
      afterStatus: updated.status,
      metadata: {
        approvalInstanceId: approvalInstance.id,
        approvalRuleId: approvalRule.id,
        approvalStepOrder: firstStep.stepOrder,
        notificationRecipientCount: recipientUserIds.length
      }
    });
    return updated;
  });
}

export async function approveWorkforceSchedule(
  session: SessionContext,
  input: ScheduleActionInput
) {
  await requirePermission(session, permissions.workforceScheduleManage);
  return prisma.$transaction(async (tx) => {
    const schedule = await getScopedScheduleOrThrow(
      tx,
      session,
      input.scheduleId
    );
    assertStatusAllowed(
      schedule.status,
      ["SUBMITTED", "UNDER_REVIEW"],
      "WORKFORCE_SCHEDULE_INVALID_APPROVAL_STATUS"
    );
    if (
      schedule.createdByUserId === session.user.id ||
      schedule.submittedByUserId === session.user.id
    ) {
      throw new Error("WORKFORCE_SCHEDULE_SELF_APPROVAL_BLOCKED");
    }
    const updated = await tx.workforceSchedule.update({
      where: { id: schedule.id },
      data: {
        status: "APPROVED",
        approvedByUserId: session.user.id,
        approvedAt: new Date(),
        reason: input.reason?.trim() ?? schedule.reason,
        evidenceReference:
          input.evidenceReference?.trim() ?? schedule.evidenceReference
      }
    });
    await writeWorkforceAudit(tx, {
      session,
      entityType: "WorkforceSchedule",
      entityId: schedule.id,
      eventType: "workforce.schedule_approved",
      beforeStatus: schedule.status,
      afterStatus: updated.status,
      reason: input.reason?.trim() ?? null
    });
    return updated;
  });
}

export async function rejectWorkforceSchedule(
  session: SessionContext,
  input: ScheduleActionInput
) {
  await requirePermission(session, permissions.workforceScheduleManage);
  const reason = requireWorkforceReason(
    input.reason,
    "WORKFORCE_SCHEDULE_REJECTION_REASON_REQUIRED"
  );
  return prisma.$transaction(async (tx) => {
    const schedule = await getScopedScheduleOrThrow(
      tx,
      session,
      input.scheduleId
    );
    assertStatusAllowed(
      schedule.status,
      ["SUBMITTED", "UNDER_REVIEW"],
      "WORKFORCE_SCHEDULE_INVALID_REJECTION_STATUS"
    );
    const updated = await tx.workforceSchedule.update({
      where: { id: schedule.id },
      data: {
        status: "REJECTED",
        reason,
        evidenceReference:
          input.evidenceReference?.trim() ?? schedule.evidenceReference
      }
    });
    await writeWorkforceAudit(tx, {
      session,
      entityType: "WorkforceSchedule",
      entityId: schedule.id,
      eventType: "workforce.schedule_rejected",
      beforeStatus: schedule.status,
      afterStatus: updated.status,
      reason,
      evidenceReference: input.evidenceReference ?? null
    });
    return updated;
  });
}

export async function publishWorkforceSchedule(
  session: SessionContext,
  input: ScheduleActionInput
) {
  await requirePermission(session, permissions.workforceScheduleManage);
  return prisma.$transaction(async (tx) => {
    const schedule = await getScopedScheduleOrThrow(
      tx,
      session,
      input.scheduleId
    );
    assertStatusAllowed(
      schedule.status,
      ["APPROVED"],
      "WORKFORCE_SCHEDULE_INVALID_PUBLISH_STATUS"
    );
    const coverageGapWaiverReason =
      schedule.coverageGapCount > 0
        ? requireWorkforceReason(
            input.reason,
            "WORKFORCE_SCHEDULE_COVERAGE_GAP_WAIVER_REASON_REQUIRED"
          )
        : (input.reason?.trim() ?? null);
    const coverageGapWaiverEvidence =
      schedule.coverageGapCount > 0
        ? requireWorkforceReason(
            input.evidenceReference,
            "WORKFORCE_SCHEDULE_COVERAGE_GAP_WAIVER_EVIDENCE_REQUIRED"
          )
        : (input.evidenceReference?.trim() ?? schedule.evidenceReference);
    const updated = await tx.workforceSchedule.update({
      where: { id: schedule.id },
      data: {
        status: "PUBLISHED",
        publishedByUserId: session.user.id,
        publishedAt: new Date(),
        reason: coverageGapWaiverReason ?? schedule.reason,
        evidenceReference:
          coverageGapWaiverEvidence ?? schedule.evidenceReference
      }
    });
    await writeWorkforceAudit(tx, {
      session,
      entityType: "WorkforceSchedule",
      entityId: schedule.id,
      eventType: "workforce.schedule_published",
      beforeStatus: schedule.status,
      afterStatus: updated.status,
      reason: coverageGapWaiverReason,
      evidenceReference: updated.evidenceReference,
      metadata: {
        coverageGapCount: schedule.coverageGapCount,
        coverageGapWaiverRequired: schedule.coverageGapCount > 0
      }
    });
    return updated;
  });
}

export async function cancelWorkforceSchedule(
  session: SessionContext,
  input: ScheduleActionInput
) {
  await requirePermission(session, permissions.workforceScheduleManage);
  const reason = requireWorkforceReason(
    input.reason,
    "WORKFORCE_SCHEDULE_CANCELLATION_REASON_REQUIRED"
  );
  return prisma.$transaction(async (tx) => {
    const schedule = await getScopedScheduleOrThrow(
      tx,
      session,
      input.scheduleId
    );
    assertStatusAllowed(
      schedule.status,
      ["DRAFT", "SUBMITTED", "UNDER_REVIEW", "APPROVED", "PUBLISHED"],
      "WORKFORCE_SCHEDULE_INVALID_CANCEL_STATUS"
    );
    const updated = await tx.workforceSchedule.update({
      where: { id: schedule.id },
      data: {
        status: "CANCELLED",
        cancelledByUserId: session.user.id,
        cancelledAt: new Date(),
        reason,
        evidenceReference:
          input.evidenceReference?.trim() ?? schedule.evidenceReference
      }
    });
    await writeWorkforceAudit(tx, {
      session,
      entityType: "WorkforceSchedule",
      entityId: schedule.id,
      eventType: "workforce.schedule_cancelled",
      beforeStatus: schedule.status,
      afterStatus: updated.status,
      reason,
      evidenceReference: input.evidenceReference ?? null
    });
    return updated;
  });
}

export async function reviewAttendanceImportBatch(
  session: SessionContext,
  input: AttendanceImportReviewInput
) {
  await requirePermission(session, permissions.workforceAttendanceImportManage);
  return prisma.$transaction(async (tx) => {
    const batch = await getScopedAttendanceBatchOrThrow(
      tx,
      session,
      input.batchId
    );
    assertStatusAllowed(
      batch.status,
      ["IMPORTED", "VALIDATING", "REVIEW_READY", "EXCEPTION_LIST"],
      "WORKFORCE_ATTENDANCE_IMPORT_INVALID_REVIEW_STATUS"
    );
    const reason =
      input.verdict === "REJECT"
        ? requireWorkforceReason(
            input.reason,
            "WORKFORCE_ATTENDANCE_IMPORT_REJECTION_REASON_REQUIRED"
          )
        : (input.reason?.trim() ?? null);
    const approvalRequired =
      input.verdict === "REJECT" ||
      input.verdict === "EXCEPTION_LIST" ||
      batch.exceptionCount > 0 ||
      batch.duplicateCount > 0;
    if (approvalRequired) {
      const approvalRule = await findAttendanceImportApprovalRule(tx, session);
      if (!approvalRule || approvalRule.steps.length === 0) {
        throw new Error(
          "WORKFORCE_ATTENDANCE_IMPORT_APPROVAL_RULE_NOT_CONFIGURED"
        );
      }
      const firstStep = approvalRule.steps[0];
      if (!firstStep) {
        throw new Error(
          "WORKFORCE_ATTENDANCE_IMPORT_APPROVAL_RULE_STEP_NOT_CONFIGURED"
        );
      }
      const existingApproval = await tx.approvalInstance.findFirst({
        where: {
          tenantId: session.context.tenantId,
          companyId: session.context.companyId,
          documentType: "AttendanceImportBatch",
          documentId: batch.id,
          status: "PENDING"
        }
      });
      if (existingApproval) {
        throw new Error("WORKFORCE_ATTENDANCE_IMPORT_ALREADY_SUBMITTED");
      }

      const approvalInstance = await tx.approvalInstance.create({
        data: {
          tenantId: session.context.tenantId,
          companyId: session.context.companyId,
          documentType: "AttendanceImportBatch",
          documentId: batch.id,
          approvalRuleId: approvalRule.id,
          status: "PENDING",
          currentStepOrder: firstStep.stepOrder,
          steps: {
            create: approvalRule.steps.map((step, index) => ({
              stepOrder: step.stepOrder,
              assignedUserId: step.userId,
              assignedRoleId: step.roleId,
              status: index === 0 ? "PENDING" : "WAITING"
            }))
          }
        }
      });
      const updated = await tx.attendanceImportBatch.update({
        where: { id: batch.id },
        data: {
          status: "VALIDATING",
          approvalInstanceId: approvalInstance.id,
          reviewedByUserId: session.user.id,
          reviewedAt: new Date(),
          rejectionReason:
            input.verdict === "REJECT" ? reason : batch.rejectionReason,
          evidenceReference:
            input.evidenceReference?.trim() ?? batch.evidenceReference,
          validationSummary: {
            verdict: input.verdict,
            approvalRequested: true,
            approvalInstanceId: approvalInstance.id,
            requestedFinalStatus:
              input.verdict === "REJECT" ? "REJECTED" : "EXCEPTION_LIST",
            reviewReason: reason,
            reviewedLineCount: batch.lines.length,
            acceptedCount: batch.acceptedCount,
            exceptionCount: batch.exceptionCount,
            duplicateCount: batch.duplicateCount,
            noPayrollExport: true,
            noAttendanceDeviceAuthority: true,
            noPaymentRequest: true,
            noFinanceJournal: true
          }
        }
      });
      const auditEvent = await tx.auditEvent.create({
        data: {
          tenantId: session.context.tenantId,
          companyId: session.context.companyId,
          actorUserId: session.user.id,
          eventType: "workforce.attendance_import_review_submitted",
          entityType: "AttendanceImportBatch",
          entityId: batch.id,
          beforeData: { status: batch.status },
          afterData: { status: updated.status },
          metadata: {
            approvalInstanceId: approvalInstance.id,
            approvalRuleId: approvalRule.id,
            approvalStepOrder: firstStep.stepOrder,
            verdict: input.verdict,
            idempotencyKey: input.idempotencyKey ?? null,
            exceptionCount: batch.exceptionCount,
            duplicateCount: batch.duplicateCount,
            noPayrollExport: true,
            noAttendanceDeviceAuthority: true,
            noPaymentRequest: true,
            noFinanceJournal: true
          }
        }
      });
      const recipientUserIds = await resolveScopedNotificationRecipients(tx, {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        locationId: batch.locationId,
        assignedUserId: firstStep.userId,
        assignedRoleId: firstStep.roleId
      });
      await recordWorkflowNotifications(tx, {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        locationId: batch.locationId,
        recipientUserIds,
        notificationType: "APPROVE_ATTENDANCE_IMPORT_REVIEW",
        priority: input.verdict === "REJECT" ? "HIGH" : "NORMAL",
        title: `Approve Attendance Review ${batch.publicReference}`,
        body: `${session.user.displayName} submitted attendance import exceptions for approval.`,
        deepLink: `/approvals/${approvalInstance.id}`,
        entityType: "AttendanceImportBatch",
        entityId: batch.id,
        sourceEventKey: auditEvent.id,
        recipientBasis: firstStep.userId ? "assigned_user" : "assigned_role",
        metadata: {
          approvalInstanceId: approvalInstance.id,
          approvalStepOrder: firstStep.stepOrder,
          publicReference: batch.publicReference,
          verdict: input.verdict,
          exceptionCount: batch.exceptionCount,
          duplicateCount: batch.duplicateCount,
          noPayrollExport: true,
          noAttendanceDeviceAuthority: true,
          noPaymentRequest: true,
          noFinanceJournal: true
        }
      });
      await writeWorkforceAudit(tx, {
        session,
        entityType: "AttendanceImportBatch",
        entityId: batch.id,
        eventType: "workforce.attendance_import_approval_routed",
        beforeStatus: batch.status,
        afterStatus: updated.status,
        reason,
        evidenceReference: updated.evidenceReference,
        metadata: {
          approvalInstanceId: approvalInstance.id,
          approvalRuleId: approvalRule.id,
          approvalStepOrder: firstStep.stepOrder,
          notificationRecipientCount: recipientUserIds.length
        }
      });
      return updated;
    }
    const nextStatus =
      input.verdict === "REJECT"
        ? "REJECTED"
        : input.verdict === "EXCEPTION_LIST" ||
            batch.exceptionCount > 0 ||
            batch.duplicateCount > 0
          ? "EXCEPTION_LIST"
          : "REVIEW_READY";
    const updated = await tx.attendanceImportBatch.update({
      where: { id: batch.id },
      data: {
        status: nextStatus,
        reviewedByUserId: session.user.id,
        reviewedAt: new Date(),
        rejectionReason:
          nextStatus === "REJECTED" ? reason : batch.rejectionReason,
        evidenceReference:
          input.evidenceReference?.trim() ?? batch.evidenceReference,
        validationSummary: {
          verdict: input.verdict,
          reviewedLineCount: batch.lines.length,
          acceptedCount: batch.acceptedCount,
          exceptionCount: batch.exceptionCount,
          duplicateCount: batch.duplicateCount,
          noPayrollExport: true,
          noAttendanceDeviceAuthority: true
        }
      }
    });
    await writeWorkforceAudit(tx, {
      session,
      entityType: "AttendanceImportBatch",
      entityId: batch.id,
      eventType: "workforce.attendance_import_reviewed",
      beforeStatus: batch.status,
      afterStatus: updated.status,
      reason,
      evidenceReference: updated.evidenceReference,
      metadata: {
        verdict: input.verdict,
        idempotencyKey: input.idempotencyKey ?? null
      }
    });
    return updated;
  });
}

export async function voidAttendanceImportBatch(
  session: SessionContext,
  input: WorkforceActionInput & { batchId: string }
) {
  await requirePermission(session, permissions.workforceAttendanceImportManage);
  const reason = requireWorkforceReason(
    input.reason,
    "WORKFORCE_ATTENDANCE_IMPORT_VOID_REASON_REQUIRED"
  );
  return prisma.$transaction(async (tx) => {
    const batch = await getScopedAttendanceBatchOrThrow(
      tx,
      session,
      input.batchId
    );
    assertStatusAllowed(
      batch.status,
      [
        "DRAFT",
        "IMPORTED",
        "VALIDATING",
        "REVIEW_READY",
        "EXCEPTION_LIST",
        "REJECTED"
      ],
      "WORKFORCE_ATTENDANCE_IMPORT_INVALID_VOID_STATUS"
    );
    const updated = await tx.attendanceImportBatch.update({
      where: { id: batch.id },
      data: {
        status: "VOIDED",
        voidedByUserId: session.user.id,
        voidedAt: new Date(),
        voidReason: reason,
        evidenceReference:
          input.evidenceReference?.trim() ?? batch.evidenceReference
      }
    });
    await tx.attendanceImportLine.updateMany({
      where: { attendanceImportBatchId: batch.id },
      data: { status: "VOIDED" }
    });
    await writeWorkforceAudit(tx, {
      session,
      entityType: "AttendanceImportBatch",
      entityId: batch.id,
      eventType: "workforce.attendance_import_voided",
      beforeStatus: batch.status,
      afterStatus: updated.status,
      reason,
      evidenceReference: input.evidenceReference ?? null
    });
    return updated;
  });
}

export async function getWorkforceDashboard(
  session: SessionContext
): Promise<WorkforceDashboard> {
  const grantedPermissionCodes = await requireWorkforceAccess(session);

  const scope = await loadWorkforceScopeSnapshot(session);
  const allowedLocationIds = scope.locationIds;
  const baseWhere = {
    tenantId: session.context.tenantId,
    companyId: session.context.companyId
  };
  const scopedEmployeeWhere = {
    ...baseWhere,
    OR: [
      { homeLocationId: { in: allowedLocationIds } },
      {
        assignments: {
          some: {
            tenantId: session.context.tenantId,
            companyId: session.context.companyId,
            locationId: { in: allowedLocationIds }
          }
        }
      }
    ]
  };

  const [
    employees,
    assignments,
    leaveRequests,
    overtimeRecords,
    trainingRecords,
    complianceDocuments,
    schedules,
    attendanceImports
  ] = await Promise.all([
    prisma.employee.findMany({
      where: scopedEmployeeWhere,
      include: {
        homeLocation: true,
        assignments: {
          where: {
            tenantId: session.context.tenantId,
            companyId: session.context.companyId,
            locationId: { in: allowedLocationIds },
            status: "ACTIVE"
          },
          include: {
            location: true,
            department: true
          },
          orderBy: [{ isPrimary: "desc" }, { effectiveFrom: "desc" }]
        }
      },
      orderBy: [{ status: "asc" }, { employeeCode: "asc" }],
      take: 50
    }),
    prisma.employeeAssignment.findMany({
      where: {
        ...baseWhere,
        locationId: { in: allowedLocationIds }
      },
      include: {
        employee: true,
        location: true,
        department: true
      },
      orderBy: [{ status: "asc" }, { effectiveFrom: "desc" }],
      take: 50
    }),
    prisma.employeeLeaveRequest.findMany({
      where: {
        ...baseWhere,
        OR: [
          { locationId: { in: allowedLocationIds } },
          ...(scope.hasCompanyManage ? [{ locationId: null }] : [])
        ]
      },
      include: {
        employee: true,
        location: true
      },
      orderBy: [{ startDate: "desc" }],
      take: 25
    }),
    prisma.employeeOvertimeRecord.findMany({
      where: {
        ...baseWhere,
        OR: [
          { locationId: { in: allowedLocationIds } },
          ...(scope.hasCompanyManage ? [{ locationId: null }] : [])
        ]
      },
      include: {
        employee: true,
        location: true
      },
      orderBy: [{ workedStartAt: "desc" }],
      take: 25
    }),
    prisma.employeeTrainingRecord.findMany({
      where: {
        ...baseWhere,
        employee: {
          OR: [
            { homeLocationId: { in: allowedLocationIds } },
            {
              assignments: { some: { locationId: { in: allowedLocationIds } } }
            }
          ]
        }
      },
      include: {
        employee: true
      },
      orderBy: [{ validUntil: "asc" }],
      take: 25
    }),
    prisma.employeeComplianceDocument.findMany({
      where: {
        ...baseWhere,
        employee: {
          OR: [
            { homeLocationId: { in: allowedLocationIds } },
            {
              assignments: { some: { locationId: { in: allowedLocationIds } } }
            }
          ]
        }
      },
      include: {
        employee: true
      },
      orderBy: [{ expiryAt: "asc" }],
      take: 25
    }),
    prisma.workforceSchedule.findMany({
      where: {
        ...baseWhere,
        locationId: { in: allowedLocationIds }
      },
      include: {
        location: true,
        lines: {
          select: {
            status: true,
            stationCode: true,
            roleLabel: true
          },
          orderBy: [{ lineNumber: "asc" }]
        }
      },
      orderBy: [{ scheduleDate: "desc" }, { createdAt: "desc" }],
      take: 25
    }),
    prisma.attendanceImportBatch.findMany({
      where: {
        ...baseWhere,
        locationId: { in: allowedLocationIds }
      },
      include: {
        location: true,
        _count: {
          select: {
            lines: true
          }
        }
      },
      orderBy: [{ businessDate: "desc" }, { createdAt: "desc" }],
      take: 25
    })
  ]);

  const scopedEmployees = employees
    .map((employee) => ({
      ...employee,
      assignments: employee.assignments.filter((assignment) =>
        workforceDimensionsMatch(scope, assignment)
      )
    }))
    .filter(
      (employee) =>
        (employee.homeLocationId !== null &&
          scope.locationIds.includes(employee.homeLocationId)) ||
        employee.assignments.length > 0
    );
  const scopedEmployeeIds = new Set(
    scopedEmployees.map((employee) => employee.id)
  );
  const scopedLeaveRequests = leaveRequests.filter((record) =>
    record.locationId
      ? scope.locationIds.includes(record.locationId)
      : scope.hasCompanyManage
  );
  const scopedOvertimeRecords = overtimeRecords.filter((record) =>
    record.locationId
      ? scope.locationIds.includes(record.locationId)
      : scope.hasCompanyManage
  );
  const scopedTrainingRecords = trainingRecords.filter((record) =>
    scopedEmployeeIds.has(record.employeeId)
  );
  const scopedComplianceDocuments = complianceDocuments.filter((record) =>
    scopedEmployeeIds.has(record.employeeId)
  );
  const scopedAssignments = assignments.filter((assignment) =>
    workforceDimensionsMatch(scope, assignment)
  );
  const scopedSchedules = schedules.filter((schedule) =>
    workforceDimensionsMatch(scope, schedule)
  );
  const scopedAttendanceImports = attendanceImports.filter((batch) =>
    workforceDimensionsMatch(scope, batch)
  );
  const pendingLeaveCount = scopedLeaveRequests.filter((record) =>
    pendingLeaveStatuses.includes(
      record.status as (typeof pendingLeaveStatuses)[number]
    )
  ).length;
  const pendingOvertimeCount = scopedOvertimeRecords.filter((record) =>
    pendingOvertimeStatuses.includes(
      record.status as (typeof pendingOvertimeStatuses)[number]
    )
  ).length;
  const readinessIssueCount =
    scopedTrainingRecords.filter((record) => record.status === "EXPIRED")
      .length +
    scopedComplianceDocuments.filter((record) => record.status === "EXPIRED")
      .length;
  const coverageGapCount = scopedSchedules.reduce(
    (total, schedule) => total + schedule.coverageGapCount,
    0
  );
  const attendanceExceptionCount = scopedAttendanceImports.reduce(
    (total, batch) => total + batch.exceptionCount + batch.duplicateCount,
    0
  );
  const showConfidentialNames = canViewConfidentialWorkforce(
    grantedPermissionCodes
  );
  const scheduleRows: WorkforceScheduleRow[] = scopedSchedules.map(
    (schedule) => ({
      id: schedule.id,
      publicReference: schedule.publicReference,
      locationName: schedule.location.name,
      scheduleDate: schedule.scheduleDate.toISOString().slice(0, 10),
      shiftType: schedule.shiftType,
      status: schedule.status,
      plannedHeadcount: schedule.plannedHeadcount,
      assignedHeadcount: schedule.assignedHeadcount,
      coverageGapCount: schedule.coverageGapCount,
      plannedHours: minutesToDisplayHours(schedule.plannedMinutes),
      lineCount: schedule.lines.length,
      gapStations: schedule.lines
        .filter((line) => line.status === "GAP")
        .map((line) => `${line.stationCode} / ${line.roleLabel}`)
    })
  );
  const attendanceImportRows: AttendanceImportBatchRow[] =
    scopedAttendanceImports.map((batch) => ({
      id: batch.id,
      publicReference: batch.publicReference,
      locationName: batch.location.name,
      businessDate: batch.businessDate.toISOString().slice(0, 10),
      sourceType: batch.sourceType,
      sourceReference: batch.sourceReference,
      status: batch.status,
      rowCount: batch.rowCount,
      acceptedCount: batch.acceptedCount,
      exceptionCount: batch.exceptionCount,
      duplicateCount: batch.duplicateCount,
      lineCount: batch._count.lines
    }));
  const reportRows = buildWorkforceReportRows({
    schedules: scheduleRows,
    attendanceImports: attendanceImportRows
  });
  const readinessRows = [
    ...scopedTrainingRecords.map((record) => ({
      id: record.id,
      employeeName: showConfidentialNames
        ? displayEmployeeName(record.employee)
        : record.employee.employeeCode,
      type: "Training" as const,
      label: record.trainingName,
      status: record.status,
      validUntil: toDateString(record.validUntil),
      requiredForScope: record.requiredForScope
    })),
    ...scopedComplianceDocuments.map((record) => ({
      id: record.id,
      employeeName: showConfidentialNames
        ? displayEmployeeName(record.employee)
        : record.employee.employeeCode,
      type: "Document" as const,
      label: record.documentType.replaceAll("_", " ").toLowerCase(),
      status: record.status,
      validUntil: toDateString(record.expiryAt),
      requiredForScope: record.isMandatoryForRole
    }))
  ].slice(0, 25);
  const productionReadinessRows = buildWorkforceProductionReadinessRows({
    reportRows,
    readiness: readinessRows
  });

  return {
    metrics: [
      {
        id: "active-employees",
        label: "Active employees",
        displayValue: String(
          scopedEmployees.filter((employee) => employee.status === "ACTIVE")
            .length
        ),
        detail: "Scoped employees with active operational records.",
        tone: "success"
      },
      {
        id: "active-assignments",
        label: "Active assignments",
        displayValue: String(
          scopedAssignments.filter(
            (assignment) => assignment.status === "ACTIVE"
          ).length
        ),
        detail:
          "Effective branch or department coverage within your locations.",
        tone: "info"
      },
      {
        id: "pending-requests",
        label: "Pending leave/OT",
        displayValue: String(pendingLeaveCount + pendingOvertimeCount),
        detail: "Submitted workforce requests awaiting governed review.",
        tone:
          pendingLeaveCount + pendingOvertimeCount > 0 ? "warning" : "success"
      },
      {
        id: "readiness-issues",
        label: "Readiness issues",
        displayValue: String(readinessIssueCount),
        detail: "Expired training or compliance document records in scope.",
        tone: readinessIssueCount > 0 ? "danger" : "success"
      },
      {
        id: "schedule-gaps",
        label: "Schedule gaps",
        displayValue: String(coverageGapCount),
        detail: "Open staffing gaps from scoped published or active schedules.",
        tone: coverageGapCount > 0 ? "warning" : "success"
      },
      {
        id: "attendance-exceptions",
        label: "Attendance exceptions",
        displayValue: String(attendanceExceptionCount),
        detail: "Imported attendance evidence rows needing review.",
        tone: attendanceExceptionCount > 0 ? "warning" : "success"
      }
    ],
    employees: scopedEmployees.map((employee) => ({
      id: employee.id,
      employeeCode: employee.employeeCode,
      displayName: showConfidentialNames
        ? displayEmployeeName(employee)
        : employee.employeeCode,
      legalName: showConfidentialNames ? employee.legalName : null,
      preferredName: showConfidentialNames ? employee.preferredName : null,
      jobTitle: employee.jobTitle ?? "Unassigned role",
      emailPersonal: showConfidentialNames ? employee.emailPersonal : null,
      phoneNumber: showConfidentialNames ? employee.phoneNumber : null,
      homeLocationId: employee.homeLocationId,
      homeLocationName: employee.homeLocation?.name ?? "No home location",
      status: employee.status,
      employmentType: employee.employmentType,
      activeAssignmentCount: employee.assignments.length
    })),
    assignments: scopedAssignments.map((assignment) => ({
      id: assignment.id,
      employeeId: assignment.employeeId,
      employeeName: showConfidentialNames
        ? displayEmployeeName(assignment.employee)
        : assignment.employee.employeeCode,
      roleLabel: assignment.roleLabel ?? "Operational assignment",
      locationName: assignment.location.name,
      departmentName: assignment.department?.name ?? "No department",
      assignmentType: assignment.assignmentType,
      isPrimary: assignment.isPrimary,
      status: assignment.status,
      effectiveFrom: assignment.effectiveFrom.toISOString().slice(0, 10),
      effectiveTo: toDateString(assignment.effectiveTo)
    })),
    leaveRequests: scopedLeaveRequests.map((request) => ({
      id: request.id,
      employeeName: showConfidentialNames
        ? displayEmployeeName(request.employee)
        : request.employee.employeeCode,
      locationName: request.location?.name ?? "Employee home location",
      leaveType: request.leaveType,
      status: request.status,
      requestedMinutes: request.requestedMinutes,
      startDate: request.startDate.toISOString().slice(0, 10),
      endDate: request.endDate.toISOString().slice(0, 10),
      reason: request.reason
    })),
    overtimeRecords: scopedOvertimeRecords.map((record) => ({
      id: record.id,
      employeeName: showConfidentialNames
        ? displayEmployeeName(record.employee)
        : record.employee.employeeCode,
      locationName: record.location?.name ?? "Employee home location",
      overtimeType: record.overtimeType,
      status: record.status,
      requestedMinutes: record.requestedMinutes,
      workedStartAt: record.workedStartAt.toISOString(),
      workedEndAt: record.workedEndAt.toISOString(),
      reason: record.reason
    })),
    schedules: scheduleRows,
    attendanceImports: attendanceImportRows,
    reportRows,
    readiness: readinessRows,
    productionReadinessRows,
    draftOptions: {
      locations: [...scope.locationsById.values()].map((location) => ({
        id: location.id,
        label: location.name,
        detail: location.brandId
          ? "Assigned brand location"
          : "Company location"
      })),
      employees: scopedEmployees
        .filter((employee) => employee.status === "ACTIVE")
        .map((employee) => {
          const assignment = employee.assignments[0];
          return {
            id: employee.id,
            label: showConfidentialNames
              ? displayEmployeeName(employee)
              : employee.employeeCode,
            detail: assignment
              ? `${employee.employeeCode} / ${assignment.location.name} / ${assignment.roleLabel ?? "Operational assignment"}`
              : `${employee.employeeCode} / ${employee.homeLocation?.name ?? "No active assignment"}`
          };
        })
    },
    policyNotes: [
      "Payroll, wage computation, statutory deductions, and payroll journals are not part of this foundation.",
      "Leave and overtime records are controlled workforce requests; they do not post finance entries.",
      "Schedules plan staffing coverage only; they do not create payroll, attendance, or accounting records.",
      "Attendance imports are source evidence with exception review; they are not the payroll source of truth.",
      "Document numbers and sensitive personal details are intentionally excluded from the workspace preview."
    ]
  };
}

export async function buildWorkforceOperationsExportRows(
  session: SessionContext
): Promise<CsvRow[]> {
  const dashboard = await getWorkforceDashboard(session);
  const rows: CsvRow[] = [
    [
      "Section",
      "Reference",
      "Employee Or Subject",
      "Status",
      "Quantity",
      "Date",
      "Detail",
      "Scope"
    ]
  ];

  for (const metric of dashboard.metrics) {
    rows.push([
      "Metric",
      metric.id,
      metric.label,
      metric.tone,
      metric.displayValue,
      "",
      metric.detail,
      session.context.locationName
    ]);
  }

  for (const employee of dashboard.employees) {
    rows.push([
      "Employee",
      employee.employeeCode,
      employee.displayName,
      employee.status,
      employee.activeAssignmentCount,
      "",
      `${employee.jobTitle}; ${employee.employmentType}; home ${employee.homeLocationName}`,
      session.context.locationName
    ]);
  }

  for (const assignment of dashboard.assignments) {
    rows.push([
      "Assignment",
      assignment.id,
      assignment.employeeName,
      assignment.status,
      "",
      assignment.effectiveFrom,
      `${assignment.roleLabel}; ${assignment.departmentName}; until ${assignment.effectiveTo ?? "open"}`,
      assignment.locationName
    ]);
  }

  for (const request of dashboard.leaveRequests) {
    rows.push([
      "Leave Request",
      request.id,
      request.employeeName,
      request.status,
      request.requestedMinutes,
      request.startDate,
      `${request.leaveType}; until ${request.endDate}; ${request.reason}`,
      request.locationName
    ]);
  }

  for (const record of dashboard.overtimeRecords) {
    rows.push([
      "Overtime Record",
      record.id,
      record.employeeName,
      record.status,
      record.requestedMinutes,
      record.workedStartAt,
      `${record.overtimeType}; until ${record.workedEndAt}; ${record.reason}`,
      record.locationName
    ]);
  }

  for (const schedule of dashboard.schedules) {
    rows.push([
      "Schedule",
      schedule.publicReference,
      schedule.shiftType,
      schedule.status,
      schedule.coverageGapCount,
      schedule.scheduleDate,
      `${schedule.assignedHeadcount}/${schedule.plannedHeadcount} assigned; ${schedule.plannedHours}; gaps ${schedule.gapStations.join(", ") || "none"}`,
      schedule.locationName
    ]);
  }

  for (const batch of dashboard.attendanceImports) {
    rows.push([
      "Attendance Import",
      batch.publicReference,
      batch.sourceReference,
      batch.status,
      batch.exceptionCount + batch.duplicateCount,
      batch.businessDate,
      `${batch.acceptedCount}/${batch.rowCount} accepted; ${batch.lineCount} lines; ${batch.sourceType}`,
      batch.locationName
    ]);
  }

  for (const readiness of dashboard.readiness) {
    rows.push([
      "Readiness",
      readiness.id,
      readiness.employeeName,
      readiness.status,
      readiness.requiredForScope ? 1 : 0,
      readiness.validUntil ?? "",
      `${readiness.type}; ${readiness.label}`,
      session.context.locationName
    ]);
  }

  for (const note of dashboard.policyNotes) {
    rows.push([
      "Policy Note",
      "phase-3-workforce-boundary",
      "Workforce boundary",
      "INFO",
      "",
      "",
      note,
      session.context.locationName
    ]);
  }

  return rows;
}
