import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import type { SessionContext } from "../src/server/services/context";
import type * as WorkforceService from "../src/server/services/workforce";
import type { getConfiguredContext as GetConfiguredContext } from "../src/server/services/context";
import type { permissions as PermissionCatalog } from "../src/server/services/authorization";
import {
  assertDisposableAuthorizationDatabaseConfigured,
  assertDisposableAuthorizationDatabaseMarker,
} from "./authorizationDatabaseSafety";

const expectedDatabase = assertDisposableAuthorizationDatabaseConfigured(process.env);
if (!process.env.DATABASE_URL) {
  throw new Error("AUTHORIZATION_WORKFORCE_DATABASE_REQUIRED");
}

type WorkforceSnapshot = {
  employees: number;
  assignments: number;
  leaveRequests: number;
  overtimeRecords: number;
  approvalInstances: number;
  approvalInstanceSteps: number;
  schedules: number;
  scheduleLines: number;
  attendanceBatches: number;
  attendanceLines: number;
  audits: number;
  notifications: number;
};

describe("database-backed workforce authorization boundaries", () => {
  const suffix = randomUUID().slice(0, 8);
  const ids = {
    tenantId: randomUUID(),
    companyId: randomUUID(),
    adjacentCompanyId: randomUUID(),
    brandId: randomUUID(),
    adjacentBrandId: randomUUID(),
    foreignDepartmentId: randomUUID(),
    locationId: randomUUID(),
    adjacentLocationId: randomUUID(),
    actorUserId: randomUUID(),
    ownerUserId: randomUUID(),
    roleId: randomUUID(),
    adjacentEmployeeId: randomUUID(),
    scopedEmployeeId: randomUUID(),
    mismatchedEmployeeId: randomUUID(),
    adjacentAssignmentId: randomUUID(),
    adjacentLeaveId: randomUUID(),
    adjacentOvertimeId: randomUUID(),
    mismatchedLeaveId: randomUUID(),
    mismatchedOvertimeId: randomUUID(),
    adjacentScheduleId: randomUUID(),
    adjacentAttendanceBatchId: randomUUID(),
    selfOvertimeId: randomUUID(),
    selfScheduleId: randomUUID(),
    gapScheduleId: randomUUID(),
    scopedAttendanceBatchId: randomUUID(),
    wrongBrandAssignmentId: randomUUID(),
    wrongBrandScheduleId: randomUUID(),
    wrongDepartmentScheduleId: randomUUID(),
    wrongBrandAttendanceBatchId: randomUUID(),
    terminalLeaveId: randomUUID(),
    terminalOvertimeId: randomUUID(),
    terminalScheduleId: randomUUID(),
    terminalAttendanceBatchId: randomUUID(),
  };
  const actorEmail = `authz-workforce-${suffix}@example.test`;

  let prisma: PrismaClient;
  let workforce: typeof WorkforceService;
  let permissions: typeof PermissionCatalog;
  let getConfiguredContext: typeof GetConfiguredContext;
  const permissionIds = new Map<string, string>();

  async function snapshot(): Promise<WorkforceSnapshot> {
    const tenant = { tenantId: ids.tenantId };
    const [
      employees,
      assignments,
      leaveRequests,
      overtimeRecords,
      approvalInstances,
      approvalInstanceSteps,
      schedules,
      scheduleLines,
      attendanceBatches,
      attendanceLines,
      audits,
      notifications,
    ] = await Promise.all([
      prisma.employee.count({ where: tenant }),
      prisma.employeeAssignment.count({ where: tenant }),
      prisma.employeeLeaveRequest.count({ where: tenant }),
      prisma.employeeOvertimeRecord.count({ where: tenant }),
      prisma.approvalInstance.count({ where: tenant }),
      prisma.approvalInstanceStep.count({
        where: { approvalInstance: { tenantId: ids.tenantId } },
      }),
      prisma.workforceSchedule.count({ where: tenant }),
      prisma.workforceScheduleLine.count({ where: tenant }),
      prisma.attendanceImportBatch.count({ where: tenant }),
      prisma.attendanceImportLine.count({ where: tenant }),
      prisma.auditEvent.count({ where: tenant }),
      prisma.notification.count({ where: tenant }),
    ]);
    return {
      employees,
      assignments,
      leaveRequests,
      overtimeRecords,
      approvalInstances,
      approvalInstanceSteps,
      schedules,
      scheduleLines,
      attendanceBatches,
      attendanceLines,
      audits,
      notifications,
    };
  }

  beforeAll(async () => {
    ({ prisma } = await import("@ogfi/database"));
    workforce = await import("../src/server/services/workforce");
    ({ permissions } = await import("../src/server/services/authorization"));
    ({ getConfiguredContext } = await import("../src/server/services/context"));

    await prisma.$connect();
    await assertDisposableAuthorizationDatabaseMarker(prisma, process.env);
    const identity = await prisma.$queryRaw<Array<{ currentDatabase: string }>>`
      SELECT current_database() AS "currentDatabase"
    `;
    if (identity[0]?.currentDatabase !== expectedDatabase) {
      throw new Error("AUTHORIZATION_DATABASE_IDENTITY_MISMATCH");
    }

    const requiredPermissionCodes = [
      permissions.workforceView,
      permissions.workforceManage,
      permissions.workforceLeaveApprove,
      permissions.workforceOvertimeApprove,
      permissions.workforceScheduleView,
      permissions.workforceScheduleManage,
      permissions.workforceAttendanceImportView,
      permissions.workforceAttendanceImportManage,
    ];
    const seededPermissions = await prisma.permission.findMany({
      where: { code: { in: requiredPermissionCodes } },
      select: { id: true, code: true },
    });
    if (seededPermissions.length !== requiredPermissionCodes.length) {
      throw new Error("SEEDED_AUTHORIZATION_WORKFORCE_PERMISSIONS_REQUIRED");
    }
    for (const permission of seededPermissions) {
      permissionIds.set(permission.code, permission.id);
    }

    await prisma.tenant.create({
      data: {
        id: ids.tenantId,
        name: `Authorization Workforce Tenant ${suffix}`,
        loginCode: `authz-workforce-${suffix}`,
      },
    });
    await prisma.company.create({
      data: {
        id: ids.companyId,
        tenantId: ids.tenantId,
        code: `AZW-${suffix}`,
        legalName: `Authorization Workforce Company ${suffix}`,
        currencyCode: "PHP",
      },
    });
    await prisma.company.create({
      data: {
        id: ids.adjacentCompanyId,
        tenantId: ids.tenantId,
        code: `AZW-FOREIGN-${suffix}`,
        legalName: `Authorization Workforce Foreign Company ${suffix}`,
        currencyCode: "PHP",
      },
    });
    await prisma.brand.createMany({
      data: [
        { id: ids.brandId, tenantId: ids.tenantId, companyId: ids.companyId, code: `AZW-${suffix}`, name: `Workforce Brand ${suffix}` },
        { id: ids.adjacentBrandId, tenantId: ids.tenantId, companyId: ids.companyId, code: `AZW-ADJ-${suffix}`, name: `Workforce Adjacent Brand ${suffix}` },
      ],
    });
    await prisma.department.create({
      data: {
        id: ids.foreignDepartmentId,
        tenantId: ids.tenantId,
        companyId: ids.adjacentCompanyId,
        code: `AZW-FOREIGN-${suffix}`,
        name: `Foreign Department ${suffix}`,
      },
    });
    await prisma.location.createMany({
      data: [
        {
          id: ids.locationId,
          tenantId: ids.tenantId,
          companyId: ids.companyId,
          brandId: ids.brandId,
          locationType: "BRANCH",
          code: `AZW-${suffix}`,
          name: `Authorization Workforce Location ${suffix}`,
        },
        {
          id: ids.adjacentLocationId,
          tenantId: ids.tenantId,
          companyId: ids.companyId,
          brandId: ids.brandId,
          locationType: "BRANCH",
          code: `AZW-ADJ-${suffix}`,
          name: `Authorization Workforce Adjacent ${suffix}`,
        },
      ],
    });
    await prisma.user.createMany({
      data: [
        {
          id: ids.actorUserId,
          tenantId: ids.tenantId,
          email: actorEmail,
          displayName: `Authorization Workforce Actor ${suffix}`,
        },
        {
          id: ids.ownerUserId,
          tenantId: ids.tenantId,
          email: `authz-workforce-owner-${suffix}@example.test`,
          displayName: `Authorization Workforce Owner ${suffix}`,
        },
      ],
    });
    await prisma.role.create({
      data: {
        id: ids.roleId,
        tenantId: ids.tenantId,
        code: `AUTHZ_WORKFORCE_${suffix}`,
        name: `Authorization Workforce Role ${suffix}`,
      },
    });
    await prisma.rolePermission.createMany({
      data: requiredPermissionCodes.map((code) => ({
        roleId: ids.roleId,
        permissionId: permissionIds.get(code)!,
      })),
    });
    await prisma.userRoleAssignment.create({
      data: { userId: ids.actorUserId, roleId: ids.roleId },
    });
    await prisma.userScopeAssignment.create({
      data: {
        userId: ids.actorUserId,
        scopeType: "LOCATION",
        scopeId: ids.locationId,
        accessLevel: "OPERATE",
      },
    });

    await prisma.employee.createMany({
      data: [{
        id: ids.adjacentEmployeeId,
        tenantId: ids.tenantId,
        companyId: ids.companyId,
        employeeCode: `AZW-ADJ-${suffix}`,
        legalName: `Adjacent Employee ${suffix}`,
        hireDate: new Date("2026-01-01T00:00:00.000Z"),
        homeLocationId: ids.adjacentLocationId,
        createdByUserId: ids.ownerUserId,
      }, {
        id: ids.scopedEmployeeId,
        tenantId: ids.tenantId,
        companyId: ids.companyId,
        employeeCode: `AZW-SCOPED-${suffix}`,
        legalName: `Scoped Confidential Employee ${suffix}`,
        emailPersonal: `confidential-${suffix}@example.test`,
        phoneNumber: "+639171234567",
        hireDate: new Date("2026-01-01T00:00:00.000Z"),
        homeLocationId: ids.locationId,
        createdByUserId: ids.ownerUserId,
      }, {
        id: ids.mismatchedEmployeeId,
        tenantId: ids.tenantId,
        companyId: ids.companyId,
        employeeCode: `AZW-MISMATCHED-${suffix}`,
        legalName: `Mismatched Record Location Employee ${suffix}`,
        hireDate: new Date("2026-01-01T00:00:00.000Z"),
        homeLocationId: ids.locationId,
        createdByUserId: ids.ownerUserId,
      }],
    });
    await prisma.employeeAssignment.create({
      data: {
        id: ids.adjacentAssignmentId,
        tenantId: ids.tenantId,
        companyId: ids.companyId,
        employeeId: ids.adjacentEmployeeId,
        locationId: ids.adjacentLocationId,
        status: "ACTIVE",
        assignmentType: "PRIMARY",
        isPrimary: true,
        roleLabel: "Adjacent role",
        effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
        createdByUserId: ids.ownerUserId,
      },
    });
    await prisma.employeeAssignment.create({
      data: {
        id: ids.wrongBrandAssignmentId,
        tenantId: ids.tenantId,
        companyId: ids.companyId,
        employeeId: ids.adjacentEmployeeId,
        locationId: ids.locationId,
        brandId: ids.adjacentBrandId,
        status: "ACTIVE",
        assignmentType: "TEMPORARY",
        roleLabel: "Wrong brand fixture",
        effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
        createdByUserId: ids.ownerUserId,
      },
    });
    await prisma.employeeLeaveRequest.create({
      data: {
        id: ids.adjacentLeaveId,
        tenantId: ids.tenantId,
        companyId: ids.companyId,
        employeeId: ids.adjacentEmployeeId,
        locationId: ids.adjacentLocationId,
        leaveType: "VACATION",
        status: "SUBMITTED",
        requestedByUserId: ids.ownerUserId,
        reason: "Adjacent leave authorization fixture",
        startDate: new Date("2026-08-01T00:00:00.000Z"),
        endDate: new Date("2026-08-01T00:00:00.000Z"),
        requestedMinutes: 480,
        sourceEventKey: `authz-workforce-leave-${suffix}`,
        createdByUserId: ids.ownerUserId,
      },
    });
    await prisma.employeeLeaveRequest.create({
      data: {
        id: ids.mismatchedLeaveId,
        tenantId: ids.tenantId,
        companyId: ids.companyId,
        employeeId: ids.mismatchedEmployeeId,
        locationId: ids.adjacentLocationId,
        leaveType: "VACATION",
        status: "SUBMITTED",
        requestedByUserId: ids.ownerUserId,
        reason: "Home A record B leave authorization fixture",
        startDate: new Date("2026-08-04T00:00:00.000Z"),
        endDate: new Date("2026-08-04T00:00:00.000Z"),
        requestedMinutes: 480,
        sourceEventKey: `authz-workforce-mismatched-leave-${suffix}`,
        createdByUserId: ids.ownerUserId,
      },
    });
    await prisma.employeeLeaveRequest.create({
      data: {
        id: ids.terminalLeaveId,
        tenantId: ids.tenantId,
        companyId: ids.companyId,
        employeeId: ids.scopedEmployeeId,
        locationId: ids.locationId,
        leaveType: "VACATION",
        status: "CANCELLED",
        requestedByUserId: ids.ownerUserId,
        reason: "Terminal leave transition fixture",
        startDate: new Date("2026-08-06T00:00:00.000Z"),
        endDate: new Date("2026-08-06T00:00:00.000Z"),
        requestedMinutes: 480,
        sourceEventKey: `authz-workforce-terminal-leave-${suffix}`,
        createdByUserId: ids.ownerUserId,
      },
    });
    await prisma.employeeOvertimeRecord.create({
      data: {
        id: ids.adjacentOvertimeId,
        tenantId: ids.tenantId,
        companyId: ids.companyId,
        employeeId: ids.adjacentEmployeeId,
        locationId: ids.adjacentLocationId,
        overtimeType: "REGULAR",
        status: "SUBMITTED",
        workedStartAt: new Date("2026-08-01T09:00:00.000Z"),
        workedEndAt: new Date("2026-08-01T10:00:00.000Z"),
        requestedMinutes: 60,
        reason: "Adjacent overtime authorization fixture",
        requestedByUserId: ids.ownerUserId,
        sourceEventKey: `authz-workforce-overtime-${suffix}`,
        createdByUserId: ids.ownerUserId,
      },
    });
    await prisma.employeeOvertimeRecord.create({
      data: {
        id: ids.mismatchedOvertimeId,
        tenantId: ids.tenantId,
        companyId: ids.companyId,
        employeeId: ids.mismatchedEmployeeId,
        locationId: ids.adjacentLocationId,
        overtimeType: "REGULAR",
        status: "SUBMITTED",
        workedStartAt: new Date("2026-08-04T09:00:00.000Z"),
        workedEndAt: new Date("2026-08-04T10:00:00.000Z"),
        requestedMinutes: 60,
        reason: "Home A record B overtime authorization fixture",
        requestedByUserId: ids.ownerUserId,
        sourceEventKey: `authz-workforce-mismatched-overtime-${suffix}`,
        createdByUserId: ids.ownerUserId,
      },
    });
    await prisma.employeeOvertimeRecord.create({
      data: {
        id: ids.terminalOvertimeId,
        tenantId: ids.tenantId,
        companyId: ids.companyId,
        employeeId: ids.scopedEmployeeId,
        locationId: ids.locationId,
        overtimeType: "REGULAR",
        status: "CANCELLED",
        workedStartAt: new Date("2026-08-06T09:00:00.000Z"),
        workedEndAt: new Date("2026-08-06T10:00:00.000Z"),
        requestedMinutes: 60,
        reason: "Terminal overtime transition fixture",
        requestedByUserId: ids.ownerUserId,
        sourceEventKey: `authz-workforce-terminal-overtime-${suffix}`,
        createdByUserId: ids.ownerUserId,
      },
    });
    await prisma.employeeOvertimeRecord.create({
      data: {
        id: ids.selfOvertimeId,
        tenantId: ids.tenantId,
        companyId: ids.companyId,
        employeeId: ids.adjacentEmployeeId,
        locationId: ids.locationId,
        overtimeType: "REGULAR",
        status: "SUBMITTED",
        workedStartAt: new Date("2026-08-02T09:00:00.000Z"),
        workedEndAt: new Date("2026-08-02T10:00:00.000Z"),
        requestedMinutes: 60,
        reason: "Self-approval authorization fixture",
        requestedByUserId: ids.actorUserId,
        sourceEventKey: `authz-workforce-self-overtime-${suffix}`,
        createdByUserId: ids.actorUserId,
      },
    });
    await prisma.workforceSchedule.create({
      data: {
        id: ids.adjacentScheduleId,
        tenantId: ids.tenantId,
        companyId: ids.companyId,
        locationId: ids.adjacentLocationId,
        publicReference: `AZW-SCHEDULE-${suffix}`,
        scheduleDate: new Date("2026-08-01T00:00:00.000Z"),
        shiftType: "OPENING",
        status: "SUBMITTED",
        plannedHeadcount: 1,
        assignedHeadcount: 1,
        plannedMinutes: 480,
        sourceEventKey: `authz-workforce-schedule-${suffix}`,
        createdByUserId: ids.ownerUserId,
      },
    });
    await prisma.workforceSchedule.createMany({
      data: [
        {
          id: ids.selfScheduleId,
          tenantId: ids.tenantId,
          companyId: ids.companyId,
          locationId: ids.locationId,
          publicReference: `AZW-SELF-SCHEDULE-${suffix}`,
          scheduleDate: new Date("2026-08-02T00:00:00.000Z"),
          shiftType: "OPENING",
          status: "SUBMITTED",
          plannedHeadcount: 1,
          assignedHeadcount: 1,
          plannedMinutes: 480,
          sourceEventKey: `authz-workforce-self-schedule-${suffix}`,
          createdByUserId: ids.actorUserId,
          submittedByUserId: ids.actorUserId,
        },
        {
          id: ids.gapScheduleId,
          tenantId: ids.tenantId,
          companyId: ids.companyId,
          locationId: ids.locationId,
          publicReference: `AZW-GAP-SCHEDULE-${suffix}`,
          scheduleDate: new Date("2026-08-03T00:00:00.000Z"),
          shiftType: "OPENING",
          status: "APPROVED",
          plannedHeadcount: 1,
          assignedHeadcount: 0,
          coverageGapCount: 1,
          plannedMinutes: 480,
          sourceEventKey: `authz-workforce-gap-schedule-${suffix}`,
          createdByUserId: ids.ownerUserId,
        },
        {
          id: ids.terminalScheduleId,
          tenantId: ids.tenantId,
          companyId: ids.companyId,
          brandId: ids.brandId,
          locationId: ids.locationId,
          publicReference: `AZW-TERMINAL-SCHEDULE-${suffix}`,
          scheduleDate: new Date("2026-08-06T00:00:00.000Z"),
          shiftType: "OPENING",
          status: "CANCELLED",
          plannedHeadcount: 1,
          assignedHeadcount: 1,
          plannedMinutes: 480,
          sourceEventKey: `authz-workforce-terminal-schedule-${suffix}`,
          createdByUserId: ids.ownerUserId,
        },
        {
          id: ids.wrongBrandScheduleId,
          tenantId: ids.tenantId,
          companyId: ids.companyId,
          brandId: ids.adjacentBrandId,
          locationId: ids.locationId,
          publicReference: `AZW-WRONG-BRAND-${suffix}`,
          scheduleDate: new Date("2026-08-04T00:00:00.000Z"),
          shiftType: "OPENING",
          status: "SUBMITTED",
          plannedHeadcount: 1,
          assignedHeadcount: 1,
          plannedMinutes: 480,
          sourceEventKey: `authz-workforce-wrong-brand-${suffix}`,
          createdByUserId: ids.ownerUserId,
        },
        {
          id: ids.wrongDepartmentScheduleId,
          tenantId: ids.tenantId,
          companyId: ids.companyId,
          brandId: ids.brandId,
          locationId: ids.locationId,
          departmentId: ids.foreignDepartmentId,
          publicReference: `AZW-WRONG-DEPARTMENT-${suffix}`,
          scheduleDate: new Date("2026-08-05T00:00:00.000Z"),
          shiftType: "OPENING",
          status: "SUBMITTED",
          plannedHeadcount: 1,
          assignedHeadcount: 1,
          plannedMinutes: 480,
          sourceEventKey: `authz-workforce-wrong-department-${suffix}`,
          createdByUserId: ids.ownerUserId,
        },
      ],
    });
    await prisma.attendanceImportBatch.create({
      data: {
        id: ids.adjacentAttendanceBatchId,
        tenantId: ids.tenantId,
        companyId: ids.companyId,
        locationId: ids.adjacentLocationId,
        publicReference: `AZW-ATTENDANCE-${suffix}`,
        businessDate: new Date("2026-08-01T00:00:00.000Z"),
        sourceType: "CSV",
        sourceReference: "authorization fixture",
        status: "REVIEW_READY",
        idempotencyKey: `authz-workforce-attendance-${suffix}`,
        createdByUserId: ids.ownerUserId,
      },
    });
    await prisma.attendanceImportBatch.create({
      data: {
        id: ids.terminalAttendanceBatchId,
        tenantId: ids.tenantId,
        companyId: ids.companyId,
        brandId: ids.brandId,
        locationId: ids.locationId,
        publicReference: `AZW-TERMINAL-ATTENDANCE-${suffix}`,
        businessDate: new Date("2026-08-06T00:00:00.000Z"),
        sourceType: "CSV",
        sourceReference: "terminal authorization fixture",
        status: "VOIDED",
        idempotencyKey: `authz-workforce-terminal-attendance-${suffix}`,
        createdByUserId: ids.ownerUserId,
      },
    });
    await prisma.attendanceImportBatch.create({
      data: {
        id: ids.wrongBrandAttendanceBatchId,
        tenantId: ids.tenantId,
        companyId: ids.companyId,
        brandId: ids.adjacentBrandId,
        locationId: ids.locationId,
        publicReference: `AZW-WRONG-BRAND-ATTENDANCE-${suffix}`,
        businessDate: new Date("2026-08-03T00:00:00.000Z"),
        sourceType: "CSV",
        sourceReference: "wrong brand authorization fixture",
        status: "REVIEW_READY",
        idempotencyKey: `authz-workforce-wrong-brand-attendance-${suffix}`,
        createdByUserId: ids.ownerUserId,
      },
    });
    await prisma.attendanceImportBatch.create({
      data: {
        id: ids.scopedAttendanceBatchId,
        tenantId: ids.tenantId,
        companyId: ids.companyId,
        locationId: ids.locationId,
        publicReference: `AZW-SCOPED-ATTENDANCE-${suffix}`,
        businessDate: new Date("2026-08-02T00:00:00.000Z"),
        sourceType: "CSV",
        sourceReference: "authorization evidence fixture",
        status: "REVIEW_READY",
        exceptionCount: 1,
        evidenceReference: "fixture://attendance/source",
        idempotencyKey: `authz-workforce-scoped-attendance-${suffix}`,
        createdByUserId: ids.ownerUserId,
      },
    });
  });

  afterAll(async () => {
    if (prisma) await prisma.$disconnect();
  });

  it("AUTHZ-WORKFORCE-LIVE-PERMISSION-REVOKED-ALL-BOUNDARIES-NO-MUTATION", async () => {
    const staleSession = await getConfiguredContext(actorEmail);
    const operations: Array<[string, (session: SessionContext) => Promise<unknown>]> = [
      ["updateEmployee", (session) => workforce.updateEmployee(session, { employeeId: ids.adjacentEmployeeId, legalName: "Denied", employmentType: "FULL_TIME", status: "ACTIVE", homeLocationId: ids.locationId, reason: "Denied" })],
      ["createEmployeeAssignment", (session) => workforce.createEmployeeAssignment(session, { employeeId: ids.adjacentEmployeeId, locationId: ids.locationId, assignmentType: "TEMPORARY", roleLabel: "Denied", effectiveFrom: "2026-08-01", reason: "Denied" })],
      ["endEmployeeAssignment", (session) => workforce.endEmployeeAssignment(session, { assignmentId: ids.adjacentAssignmentId, effectiveTo: "2026-08-01", reason: "Denied" })],
      ["createDraftLeaveRequest", (session) => workforce.createDraftLeaveRequest(session, { employeeId: ids.adjacentEmployeeId, leaveType: "VACATION", startDate: "2026-08-01", endDate: "2026-08-01", reason: "Denied" })],
      ["createDraftOvertimeRecord", (session) => workforce.createDraftOvertimeRecord(session, { employeeId: ids.adjacentEmployeeId, overtimeType: "REGULAR", workedStartAt: "2026-08-01T09:00:00.000Z", workedEndAt: "2026-08-01T10:00:00.000Z", reason: "Denied" })],
      ["createDraftWorkforceSchedule", (session) => workforce.createDraftWorkforceSchedule(session, { scheduleDate: "2026-08-01", shiftType: "OPENING", stationCode: "DENIED", roleLabel: "Denied", plannedStartAt: "2026-08-01T09:00:00.000Z", plannedEndAt: "2026-08-01T17:00:00.000Z", plannedHeadcount: 1, reason: "Denied" })],
      ["submitLeaveRequest", (session) => workforce.submitLeaveRequest(session, { leaveRequestId: ids.adjacentLeaveId })],
      ["approveLeaveRequest", (session) => workforce.approveLeaveRequest(session, { leaveRequestId: ids.adjacentLeaveId, reason: "Denied" })],
      ["returnLeaveRequestForRevision", (session) => workforce.returnLeaveRequestForRevision(session, { leaveRequestId: ids.adjacentLeaveId, reason: "Denied" })],
      ["rejectLeaveRequest", (session) => workforce.rejectLeaveRequest(session, { leaveRequestId: ids.adjacentLeaveId, reason: "Denied" })],
      ["cancelLeaveRequest", (session) => workforce.cancelLeaveRequest(session, { leaveRequestId: ids.adjacentLeaveId, reason: "Denied" })],
      ["submitOvertimeRecord", (session) => workforce.submitOvertimeRecord(session, { overtimeRecordId: ids.adjacentOvertimeId })],
      ["approveOvertimeRecord", (session) => workforce.approveOvertimeRecord(session, { overtimeRecordId: ids.adjacentOvertimeId, reason: "Denied" })],
      ["rejectOvertimeRecord", (session) => workforce.rejectOvertimeRecord(session, { overtimeRecordId: ids.adjacentOvertimeId, reason: "Denied" })],
      ["cancelOvertimeRecord", (session) => workforce.cancelOvertimeRecord(session, { overtimeRecordId: ids.adjacentOvertimeId, reason: "Denied" })],
      ["submitWorkforceSchedule", (session) => workforce.submitWorkforceSchedule(session, { scheduleId: ids.adjacentScheduleId })],
      ["approveWorkforceSchedule", (session) => workforce.approveWorkforceSchedule(session, { scheduleId: ids.adjacentScheduleId, reason: "Denied" })],
      ["rejectWorkforceSchedule", (session) => workforce.rejectWorkforceSchedule(session, { scheduleId: ids.adjacentScheduleId, reason: "Denied" })],
      ["publishWorkforceSchedule", (session) => workforce.publishWorkforceSchedule(session, { scheduleId: ids.adjacentScheduleId, reason: "Denied", evidenceReference: "denied" })],
      ["cancelWorkforceSchedule", (session) => workforce.cancelWorkforceSchedule(session, { scheduleId: ids.adjacentScheduleId, reason: "Denied" })],
      ["reviewAttendanceImportBatch", (session) => workforce.reviewAttendanceImportBatch(session, { batchId: ids.adjacentAttendanceBatchId, verdict: "ACCEPT", reason: "Denied" })],
      ["voidAttendanceImportBatch", (session) => workforce.voidAttendanceImportBatch(session, { batchId: ids.adjacentAttendanceBatchId, reason: "Denied" })],
      ["getWorkforceDashboard", (session) => workforce.getWorkforceDashboard(session)],
      ["buildWorkforceOperationsExportRows", (session) => workforce.buildWorkforceOperationsExportRows(session)],
    ];

    const before = await snapshot();
    await prisma.rolePermission.deleteMany({ where: { roleId: ids.roleId } });
    try {
      for (const [name, invoke] of operations) {
        await expect(invoke(staleSession), name).rejects.toThrow("PERMISSION_DENIED");
        expect(await snapshot(), `${name} must not mutate workforce, audit, or notifications`).toEqual(before);
      }
    } finally {
      await prisma.rolePermission.createMany({
        data: [...permissionIds.values()].map((permissionId) => ({ roleId: ids.roleId, permissionId })),
      });
    }
  });

  it("AUTHZ-WORKFORCE-ADJACENT-LOCATION-ALL-RECORD-BOUNDARIES-NO-MUTATION", async () => {
    const session = await getConfiguredContext(actorEmail);
    const operations: Array<[string, () => Promise<unknown>]> = [
      ["updateEmployee", () => workforce.updateEmployee(session, { employeeId: ids.adjacentEmployeeId, legalName: "Denied", employmentType: "FULL_TIME", status: "ACTIVE", homeLocationId: ids.locationId, reason: "Denied" })],
      ["createEmployeeAssignment", () => workforce.createEmployeeAssignment(session, { employeeId: ids.adjacentEmployeeId, locationId: ids.locationId, assignmentType: "TEMPORARY", roleLabel: "Denied", effectiveFrom: "2026-08-01", reason: "Denied" })],
      ["endEmployeeAssignment", () => workforce.endEmployeeAssignment(session, { assignmentId: ids.adjacentAssignmentId, effectiveTo: "2026-08-01", reason: "Denied" })],
      ["createDraftLeaveRequest", () => workforce.createDraftLeaveRequest(session, { employeeId: ids.adjacentEmployeeId, leaveType: "VACATION", startDate: "2026-08-01", endDate: "2026-08-01", reason: "Denied" })],
      ["createDraftOvertimeRecord", () => workforce.createDraftOvertimeRecord(session, { employeeId: ids.adjacentEmployeeId, overtimeType: "REGULAR", workedStartAt: "2026-08-01T09:00:00.000Z", workedEndAt: "2026-08-01T10:00:00.000Z", reason: "Denied" })],
      ["submitLeaveRequest", () => workforce.submitLeaveRequest(session, { leaveRequestId: ids.adjacentLeaveId })],
      ["approveLeaveRequest", () => workforce.approveLeaveRequest(session, { leaveRequestId: ids.adjacentLeaveId, reason: "Denied" })],
      ["returnLeaveRequestForRevision", () => workforce.returnLeaveRequestForRevision(session, { leaveRequestId: ids.adjacentLeaveId, reason: "Denied" })],
      ["rejectLeaveRequest", () => workforce.rejectLeaveRequest(session, { leaveRequestId: ids.adjacentLeaveId, reason: "Denied" })],
      ["cancelLeaveRequest", () => workforce.cancelLeaveRequest(session, { leaveRequestId: ids.adjacentLeaveId, reason: "Denied" })],
      ["submitOvertimeRecord", () => workforce.submitOvertimeRecord(session, { overtimeRecordId: ids.adjacentOvertimeId })],
      ["approveOvertimeRecord", () => workforce.approveOvertimeRecord(session, { overtimeRecordId: ids.adjacentOvertimeId, reason: "Denied" })],
      ["rejectOvertimeRecord", () => workforce.rejectOvertimeRecord(session, { overtimeRecordId: ids.adjacentOvertimeId, reason: "Denied" })],
      ["cancelOvertimeRecord", () => workforce.cancelOvertimeRecord(session, { overtimeRecordId: ids.adjacentOvertimeId, reason: "Denied" })],
      ["submitWorkforceSchedule", () => workforce.submitWorkforceSchedule(session, { scheduleId: ids.adjacentScheduleId })],
      ["approveWorkforceSchedule", () => workforce.approveWorkforceSchedule(session, { scheduleId: ids.adjacentScheduleId, reason: "Denied" })],
      ["rejectWorkforceSchedule", () => workforce.rejectWorkforceSchedule(session, { scheduleId: ids.adjacentScheduleId, reason: "Denied" })],
      ["publishWorkforceSchedule", () => workforce.publishWorkforceSchedule(session, { scheduleId: ids.adjacentScheduleId, reason: "Denied", evidenceReference: "denied" })],
      ["cancelWorkforceSchedule", () => workforce.cancelWorkforceSchedule(session, { scheduleId: ids.adjacentScheduleId, reason: "Denied" })],
      ["reviewAttendanceImportBatch", () => workforce.reviewAttendanceImportBatch(session, { batchId: ids.adjacentAttendanceBatchId, verdict: "ACCEPT", reason: "Denied" })],
      ["voidAttendanceImportBatch", () => workforce.voidAttendanceImportBatch(session, { batchId: ids.adjacentAttendanceBatchId, reason: "Denied" })],
    ];
    const before = await snapshot();
    for (const [name, invoke] of operations) {
      await expect(invoke(), name).rejects.toThrow(/NOT_FOUND|SCOPE_REQUIRED/);
      expect(await snapshot(), `${name} must not mutate adjacent-scope records`).toEqual(before);
    }
  });

  it("AUTHZ-WORKFORCE-RECORD-LOCATION-OVERRIDES-EMPLOYEE-HOME-ALL-LEAVE-OVERTIME-MUTATIONS", async () => {
    const session = await getConfiguredContext(actorEmail);
    const operations: Array<[string, () => Promise<unknown>]> = [
      ["submitLeaveRequest", () => workforce.submitLeaveRequest(session, { leaveRequestId: ids.mismatchedLeaveId })],
      ["approveLeaveRequest", () => workforce.approveLeaveRequest(session, { leaveRequestId: ids.mismatchedLeaveId, reason: "Denied" })],
      ["returnLeaveRequestForRevision", () => workforce.returnLeaveRequestForRevision(session, { leaveRequestId: ids.mismatchedLeaveId, reason: "Denied" })],
      ["rejectLeaveRequest", () => workforce.rejectLeaveRequest(session, { leaveRequestId: ids.mismatchedLeaveId, reason: "Denied" })],
      ["cancelLeaveRequest", () => workforce.cancelLeaveRequest(session, { leaveRequestId: ids.mismatchedLeaveId, reason: "Denied" })],
      ["submitOvertimeRecord", () => workforce.submitOvertimeRecord(session, { overtimeRecordId: ids.mismatchedOvertimeId })],
      ["approveOvertimeRecord", () => workforce.approveOvertimeRecord(session, { overtimeRecordId: ids.mismatchedOvertimeId, reason: "Denied" })],
      ["rejectOvertimeRecord", () => workforce.rejectOvertimeRecord(session, { overtimeRecordId: ids.mismatchedOvertimeId, reason: "Denied" })],
      ["cancelOvertimeRecord", () => workforce.cancelOvertimeRecord(session, { overtimeRecordId: ids.mismatchedOvertimeId, reason: "Denied" })],
    ];
    const before = await snapshot();
    for (const [name, invoke] of operations) {
      await expect(invoke(), name).rejects.toThrow(/WORKFORCE_(LEAVE_REQUEST|OVERTIME_RECORD)_NOT_FOUND/);
      expect(
        await snapshot(),
        `${name} must not mutate records, approvals, approval steps, audits, or notifications`,
      ).toEqual(before);
    }
  });

  it("AUTHZ-WORKFORCE-OVERTIME-AND-SCHEDULE-SELF-APPROVAL-NO-MUTATION", async () => {
    const session = await getConfiguredContext(actorEmail);
    const before = await snapshot();
    await expect(
      workforce.approveOvertimeRecord(session, {
        overtimeRecordId: ids.selfOvertimeId,
        reason: "Self approval must be denied",
      }),
    ).rejects.toThrow("WORKFORCE_OVERTIME_SELF_APPROVAL_BLOCKED");
    await expect(
      workforce.approveWorkforceSchedule(session, {
        scheduleId: ids.selfScheduleId,
        reason: "Self approval must be denied",
      }),
    ).rejects.toThrow("WORKFORCE_SCHEDULE_SELF_APPROVAL_BLOCKED");
    expect(await snapshot()).toEqual(before);
  });

  it("AUTHZ-WORKFORCE-SCHEDULE-GAP-EVIDENCE-REQUIRED-NO-MUTATION", async () => {
    const session = await getConfiguredContext(actorEmail);
    const before = await snapshot();
    await expect(
      workforce.publishWorkforceSchedule(session, {
        scheduleId: ids.gapScheduleId,
        reason: "Approved operational waiver",
      }),
    ).rejects.toThrow("WORKFORCE_SCHEDULE_COVERAGE_GAP_WAIVER_EVIDENCE_REQUIRED");
    expect(await snapshot()).toEqual(before);
  });

  it("AUTHZ-WORKFORCE-ATTENDANCE-REJECTION-REASON-REQUIRED-NO-MUTATION", async () => {
    const session = await getConfiguredContext(actorEmail);
    const before = await snapshot();
    await expect(
      workforce.reviewAttendanceImportBatch(session, {
        batchId: ids.scopedAttendanceBatchId,
        verdict: "REJECT",
      }),
    ).rejects.toThrow("WORKFORCE_ATTENDANCE_IMPORT_REJECTION_REASON_REQUIRED");
    expect(await snapshot()).toEqual(before);
  });

  it("AUTHZ-WORKFORCE-BRAND-AND-DEPARTMENT-CONSISTENCY-NO-MUTATION", async () => {
    const session = await getConfiguredContext(actorEmail);
    const before = await snapshot();
    await expect(
      workforce.endEmployeeAssignment(session, {
        assignmentId: ids.wrongBrandAssignmentId,
        effectiveTo: "2026-08-01",
        reason: "Wrong brand must be denied",
      }),
    ).rejects.toThrow("WORKFORCE_ASSIGNMENT_NOT_FOUND");
    await expect(
      workforce.approveWorkforceSchedule(session, {
        scheduleId: ids.wrongBrandScheduleId,
        reason: "Wrong brand must be denied",
      }),
    ).rejects.toThrow("WORKFORCE_SCHEDULE_NOT_FOUND");
    await expect(
      workforce.approveWorkforceSchedule(session, {
        scheduleId: ids.wrongDepartmentScheduleId,
        reason: "Foreign department must be denied",
      }),
    ).rejects.toThrow("WORKFORCE_SCHEDULE_NOT_FOUND");
    await expect(
      workforce.voidAttendanceImportBatch(session, {
        batchId: ids.wrongBrandAttendanceBatchId,
        reason: "Wrong brand must be denied",
      }),
    ).rejects.toThrow("WORKFORCE_ATTENDANCE_BATCH_NOT_FOUND");
    expect(await snapshot()).toEqual(before);
  });

  it("AUTHZ-WORKFORCE-DASHBOARD-AND-EXPORT-REDACT-WRONG-DIMENSIONS", async () => {
    const session = await getConfiguredContext(actorEmail);
    const before = await snapshot();
    const dashboard = await workforce.getWorkforceDashboard(session);
    expect(dashboard.schedules.map((row) => row.id)).not.toContain(ids.wrongBrandScheduleId);
    expect(dashboard.schedules.map((row) => row.id)).not.toContain(ids.wrongDepartmentScheduleId);
    expect(dashboard.attendanceImports.map((row) => row.id)).not.toContain(ids.wrongBrandAttendanceBatchId);
    const exportRows = await workforce.buildWorkforceOperationsExportRows(session);
    const exportText = exportRows.flat().join("\n");
    expect(exportText).not.toContain(`AZW-WRONG-BRAND-${suffix}`);
    expect(exportText).not.toContain(`AZW-WRONG-DEPARTMENT-${suffix}`);
    expect(exportText).not.toContain(`AZW-WRONG-BRAND-ATTENDANCE-${suffix}`);
    expect(await snapshot()).toEqual(before);
  });

  it("AUTHZ-WORKFORCE-TERMINAL-STATUS-ALL-TRANSITIONS-NO-MUTATION", async () => {
    const session = await getConfiguredContext(actorEmail);
    const operations: Array<[string, () => Promise<unknown>]> = [
      ["submitLeaveRequest", () => workforce.submitLeaveRequest(session, { leaveRequestId: ids.terminalLeaveId })],
      ["approveLeaveRequest", () => workforce.approveLeaveRequest(session, { leaveRequestId: ids.terminalLeaveId, reason: "Invalid transition" })],
      ["returnLeaveRequestForRevision", () => workforce.returnLeaveRequestForRevision(session, { leaveRequestId: ids.terminalLeaveId, reason: "Invalid transition" })],
      ["rejectLeaveRequest", () => workforce.rejectLeaveRequest(session, { leaveRequestId: ids.terminalLeaveId, reason: "Invalid transition" })],
      ["cancelLeaveRequest", () => workforce.cancelLeaveRequest(session, { leaveRequestId: ids.terminalLeaveId, reason: "Invalid transition" })],
      ["submitOvertimeRecord", () => workforce.submitOvertimeRecord(session, { overtimeRecordId: ids.terminalOvertimeId })],
      ["approveOvertimeRecord", () => workforce.approveOvertimeRecord(session, { overtimeRecordId: ids.terminalOvertimeId, reason: "Invalid transition" })],
      ["rejectOvertimeRecord", () => workforce.rejectOvertimeRecord(session, { overtimeRecordId: ids.terminalOvertimeId, reason: "Invalid transition" })],
      ["cancelOvertimeRecord", () => workforce.cancelOvertimeRecord(session, { overtimeRecordId: ids.terminalOvertimeId, reason: "Invalid transition" })],
      ["submitWorkforceSchedule", () => workforce.submitWorkforceSchedule(session, { scheduleId: ids.terminalScheduleId })],
      ["approveWorkforceSchedule", () => workforce.approveWorkforceSchedule(session, { scheduleId: ids.terminalScheduleId, reason: "Invalid transition" })],
      ["rejectWorkforceSchedule", () => workforce.rejectWorkforceSchedule(session, { scheduleId: ids.terminalScheduleId, reason: "Invalid transition" })],
      ["publishWorkforceSchedule", () => workforce.publishWorkforceSchedule(session, { scheduleId: ids.terminalScheduleId, reason: "Invalid transition", evidenceReference: "fixture://invalid" })],
      ["cancelWorkforceSchedule", () => workforce.cancelWorkforceSchedule(session, { scheduleId: ids.terminalScheduleId, reason: "Invalid transition" })],
      ["reviewAttendanceImportBatch", () => workforce.reviewAttendanceImportBatch(session, { batchId: ids.terminalAttendanceBatchId, verdict: "ACCEPT", reason: "Invalid transition" })],
      ["voidAttendanceImportBatch", () => workforce.voidAttendanceImportBatch(session, { batchId: ids.terminalAttendanceBatchId, reason: "Invalid transition" })],
    ];
    const before = await snapshot();
    for (const [name, invoke] of operations) {
      await expect(invoke(), name).rejects.toThrow(/INVALID_.*STATUS/);
      expect(await snapshot(), `${name} must not mutate a terminal record`).toEqual(before);
    }
  });

  it("AUTHZ-WORKFORCE-LIVE-MANAGE-REVOCATION-REDACTS-CONFIDENTIAL-FIELDS", async () => {
    const staleSession = await getConfiguredContext(actorEmail);
    const permissionId = permissionIds.get(permissions.workforceManage)!;
    await prisma.rolePermission.delete({
      where: { roleId_permissionId: { roleId: ids.roleId, permissionId } },
    });
    const before = await snapshot();
    try {
      const dashboard = await workforce.getWorkforceDashboard(staleSession);
      const employee = dashboard.employees.find((row) => row.id === ids.scopedEmployeeId);
      expect(employee).toMatchObject({ emailPersonal: null, phoneNumber: null });
      expect(await snapshot()).toEqual(before);
    } finally {
      await prisma.rolePermission.create({ data: { roleId: ids.roleId, permissionId } });
    }
  });
});
