import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import type { getConfiguredContext as getConfiguredContextType } from "../src/server/services/context";
import type { requireSessionContext as requireSessionContextType } from "../src/server/services/context";
import type { permissions as permissionsType } from "../src/server/services/authorization";
import type {
  issueAuthenticationActivation as issueAuthenticationActivationType,
  listAuthenticationAccounts as listAuthenticationAccountsType,
} from "../src/server/services/authenticationAdmin";
import type { archiveNotification as archiveNotificationType } from "../src/server/services/notifications";
import type { buildReleaseReadinessExportRows as buildReleaseReadinessExportRowsType } from "../src/server/services/releaseReadiness";
import {
  assertDisposableAuthorizationDatabaseConfigured,
  assertDisposableAuthorizationDatabaseMarker,
} from "./authorizationDatabaseSafety";
import {
  authenticationSessionTokenHash,
  clearAuthenticatedRequest,
  configureAuthenticatedRequest,
} from "./authenticatedRequestHarness";

const expectedDatabase = assertDisposableAuthorizationDatabaseConfigured(
  process.env,
);
if (!process.env.DATABASE_URL) {
  throw new Error("AUTHORIZATION_ADMIN_PLATFORM_DATABASE_REQUIRED");
}

function formData(values: Record<string, string>) {
  const form = new FormData();
  for (const [key, value] of Object.entries(values)) form.set(key, value);
  return form;
}

describe("admin and platform authorization boundaries against PostgreSQL", () => {
  const suffix = randomUUID().slice(0, 8);
  const ids = {
    tenantId: randomUUID(),
    companyId: randomUUID(),
    adjacentCompanyId: randomUUID(),
    locationId: randomUUID(),
    adjacentLocationId: randomUUID(),
    actorUserId: randomUUID(),
    targetUserId: randomUUID(),
    adjacentUserId: randomUUID(),
    roleId: randomUUID(),
    nonSensitiveRoleId: randomUUID(),
    actorLocationScopeId: randomUUID(),
    actorCompanyScopeId: randomUUID(),
    targetScopeId: randomUUID(),
    adjacentTargetScopeId: randomUUID(),
    notificationId: randomUUID(),
    authIdentityId: randomUUID(),
    authSessionId: randomUUID(),
    adjacentAuthSessionId: randomUUID(),
    authRecoveryId: randomUUID(),
    breakGlassGrantId: randomUUID(),
    privilegedMfaEnrollmentId: randomUUID(),
    sensitiveRoleRequestId: randomUUID(),
    highRiskScopeRequestId: randomUUID(),
    targetRevocationSessionId: randomUUID(),
    crossCompanyRoleAssignmentId: randomUUID(),
    crossCompanySensitiveRequestId: randomUUID(),
  };
  const actorEmail = `authz-admin-platform-${suffix}@example.test`;
  const actorSessionToken = `authz-admin-platform-token-${suffix}`;

  let prisma: PrismaClient;
  let permissions: typeof permissionsType;
  let getConfiguredContext: typeof getConfiguredContextType;
  let requireSessionContext: typeof requireSessionContextType;
  let issueAuthenticationActivation: typeof issueAuthenticationActivationType;
  let listAuthenticationAccounts: typeof listAuthenticationAccountsType;
  let archiveNotification: typeof archiveNotificationType;
  let markNotificationRead: typeof import("../src/server/services/notifications").markNotificationRead;
  let buildReleaseReadinessExportRows: typeof buildReleaseReadinessExportRowsType;
  let createCoreAdminUser: typeof import("../src/server/services/coreAdmin").createCoreAdminUser;
  let updateCompanyPolicySetting: typeof import("../src/server/services/policySettings").updateCompanyPolicySetting;
  let resetCompanyPolicySetting: typeof import("../src/server/services/policySettings").resetCompanyPolicySetting;
  let updateReleaseReadinessGate: typeof import("../src/server/services/releaseReadiness").updateReleaseReadinessGate;
  let completeAuthSessionInvalidation: typeof import("../src/server/services/authInvalidation").completeAuthSessionInvalidation;
  let listAuthSessionInvalidations: typeof import("../src/server/services/authInvalidation").listAuthSessionInvalidations;
  let approveBreakGlassAccess: typeof import("../src/server/services/breakGlassAccess").approveBreakGlassAccess;
  let listBreakGlassAccessGrants: typeof import("../src/server/services/breakGlassAccess").listBreakGlassAccessGrants;
  let verifyPrivilegedMfaEnrollment: typeof import("../src/server/services/privilegedMfa").verifyPrivilegedMfaEnrollment;
  let revokePrivilegedMfaEnrollment: typeof import("../src/server/services/privilegedMfa").revokePrivilegedMfaEnrollment;
  let rejectBreakGlassAccess: typeof import("../src/server/services/breakGlassAccess").rejectBreakGlassAccess;
  let revokeBreakGlassAccess: typeof import("../src/server/services/breakGlassAccess").revokeBreakGlassAccess;
  let completeBreakGlassPostReview: typeof import("../src/server/services/breakGlassAccess").completeBreakGlassPostReview;
  let approveAuthRecovery: typeof import("../src/server/services/authenticationAdmin").approveAuthRecovery;
  let rejectAuthRecovery: typeof import("../src/server/services/authenticationAdmin").rejectAuthRecovery;
  let revokeAuthenticationSessions: typeof import("../src/server/services/authenticationAdmin").revokeAuthenticationSessions;
  let completeMfaChallenge: typeof import("../src/server/services/authentication").completeMfaChallenge;
  let completeMfaEnrollment: typeof import("../src/server/services/authentication").completeMfaEnrollment;
  let revokeOwnSession: typeof import("../src/server/services/authentication").revokeOwnSession;
  let activateAccount: typeof import("../src/server/services/authentication").activateAccount;
  let authenticatePassword: typeof import("../src/server/services/authentication").authenticatePassword;
  let beginMfaStepUp: typeof import("../src/server/services/authentication").beginMfaStepUp;
  let clearAuthenticationCookies: typeof import("../src/server/services/authentication").clearAuthenticationCookies;
  let deliverAccountActivation: typeof import("../src/server/services/authentication").deliverAccountActivation;
  let getValidatedSessionPrincipal: typeof import("../src/server/services/authentication").getValidatedSessionPrincipal;
  let signOutCurrentSession: typeof import("../src/server/services/authentication").signOutCurrentSession;
  let startMfaEnrollment: typeof import("../src/server/services/authentication").startMfaEnrollment;
  let createOperationalReasonCode: typeof import("../src/server/services/operationalReasonCodes").createOperationalReasonCode;
  let deactivateOperationalReasonCode: typeof import("../src/server/services/operationalReasonCodes").deactivateOperationalReasonCode;
  let recordPrivilegedMfaEnrollment: typeof import("../src/server/services/privilegedMfa").recordPrivilegedMfaEnrollment;
  let requestBreakGlassAccess: typeof import("../src/server/services/breakGlassAccess").requestBreakGlassAccess;
  let requestAuthRecovery: typeof import("../src/server/services/authenticationAdmin").requestAuthRecovery;
  let retryAuthenticationActivationDelivery: typeof import("../src/server/services/authenticationAdmin").retryAuthenticationActivationDelivery;
  let deactivateUserRoleAssignment: typeof import("../src/server/services/coreAdmin").deactivateUserRoleAssignment;
  let deactivateUserScopeAssignment: typeof import("../src/server/services/coreAdmin").deactivateUserScopeAssignment;
  let requestSensitiveUserRole: typeof import("../src/server/services/coreAdmin").requestSensitiveUserRole;
  let requestHighRiskUserLocationScope: typeof import("../src/server/services/coreAdmin").requestHighRiskUserLocationScope;
  let createCoreAdminRole: typeof import("../src/server/services/coreAdmin").createCoreAdminRole;
  let createCoreAdminCompany: typeof import("../src/server/services/coreAdmin").createCoreAdminCompany;
  let createCoreAdminBrand: typeof import("../src/server/services/coreAdmin").createCoreAdminBrand;
  let createCoreAdminDepartment: typeof import("../src/server/services/coreAdmin").createCoreAdminDepartment;
  let createCoreAdminLocation: typeof import("../src/server/services/coreAdmin").createCoreAdminLocation;
  let createUserRoleAssignment: typeof import("../src/server/services/coreAdmin").createUserRoleAssignment;
  let createUserLocationScopeAssignment: typeof import("../src/server/services/coreAdmin").createUserLocationScopeAssignment;
  let approveSensitiveUserRoleRequest: typeof import("../src/server/services/coreAdmin").approveSensitiveUserRoleRequest;
  let rejectSensitiveUserRoleRequest: typeof import("../src/server/services/coreAdmin").rejectSensitiveUserRoleRequest;
  let approveHighRiskUserLocationScopeRequest: typeof import("../src/server/services/coreAdmin").approveHighRiskUserLocationScopeRequest;
  let rejectHighRiskUserLocationScopeRequest: typeof import("../src/server/services/coreAdmin").rejectHighRiskUserLocationScopeRequest;
  let updateRolePermissions: typeof import("../src/server/services/coreAdmin").updateRolePermissions;
  let applyRecommendedRolePermissions: typeof import("../src/server/services/coreAdmin").applyRecommendedRolePermissions;
  let getCoreAdminOverview: typeof import("../src/server/services/coreAdmin").getCoreAdminOverview;
  let getCoreAdminApprovalRuleDetail: typeof import("../src/server/services/coreAdmin").getCoreAdminApprovalRuleDetail;
  let getCoreAdminAuditEventDetail: typeof import("../src/server/services/coreAdmin").getCoreAdminAuditEventDetail;
  let getCoreAdminCompanyDetail: typeof import("../src/server/services/coreAdmin").getCoreAdminCompanyDetail;
  let getCoreAdminLocationDetail: typeof import("../src/server/services/coreAdmin").getCoreAdminLocationDetail;
  let getCoreAdminPermissionDetail: typeof import("../src/server/services/coreAdmin").getCoreAdminPermissionDetail;
  let getCoreAdminRoleDetail: typeof import("../src/server/services/coreAdmin").getCoreAdminRoleDetail;
  let getCoreAdminUserDetail: typeof import("../src/server/services/coreAdmin").getCoreAdminUserDetail;
  let listCoreAdminAuditEvents: typeof import("../src/server/services/coreAdmin").listCoreAdminAuditEvents;
  let createDeploymentEvidenceRecord: typeof import("../src/server/services/releaseReadiness").createDeploymentEvidenceRecord;
  let createEnablementEvidenceRecord: typeof import("../src/server/services/releaseReadiness").createEnablementEvidenceRecord;
  let createUatEvidenceRecord: typeof import("../src/server/services/releaseReadiness").createUatEvidenceRecord;
  let createReleaseBoardDecision: typeof import("../src/server/services/releaseReadiness").createReleaseBoardDecision;
  let updateDeploymentEvidenceStatus: typeof import("../src/server/services/releaseReadiness").updateDeploymentEvidenceStatus;
  let updateEnablementEvidenceStatus: typeof import("../src/server/services/releaseReadiness").updateEnablementEvidenceStatus;
  let updateUatEvidenceStatus: typeof import("../src/server/services/releaseReadiness").updateUatEvidenceStatus;
  let coreAdminPermissionId: string;
  let tenantRoleAdminPermissionId: string;

  beforeAll(async () => {
    ({ prisma } = await import("@ogfi/database"));
    ({ permissions } = await import("../src/server/services/authorization"));
    ({ getConfiguredContext, requireSessionContext } =
      await import("../src/server/services/context"));
    ({
      approveAuthRecovery,
      issueAuthenticationActivation,
      listAuthenticationAccounts,
      rejectAuthRecovery,
      requestAuthRecovery,
      retryAuthenticationActivationDelivery,
      revokeAuthenticationSessions,
    } = await import("../src/server/services/authenticationAdmin"));
    ({
      activateAccount,
      authenticatePassword,
      beginMfaStepUp,
      clearAuthenticationCookies,
      completeMfaChallenge,
      completeMfaEnrollment,
      deliverAccountActivation,
      getValidatedSessionPrincipal,
      revokeOwnSession,
      signOutCurrentSession,
      startMfaEnrollment,
    } = await import("../src/server/services/authentication"));
    ({ archiveNotification, markNotificationRead } =
      await import("../src/server/services/notifications"));
    ({ buildReleaseReadinessExportRows } =
      await import("../src/server/services/releaseReadiness"));
    ({
      approveHighRiskUserLocationScopeRequest,
      approveSensitiveUserRoleRequest,
      createCoreAdminBrand,
      createCoreAdminCompany,
      createCoreAdminDepartment,
      createCoreAdminLocation,
      createCoreAdminRole,
      createCoreAdminUser,
      createUserLocationScopeAssignment,
      createUserRoleAssignment,
      deactivateUserRoleAssignment,
      deactivateUserScopeAssignment,
      rejectHighRiskUserLocationScopeRequest,
      rejectSensitiveUserRoleRequest,
      requestHighRiskUserLocationScope,
      requestSensitiveUserRole,
      applyRecommendedRolePermissions,
      getCoreAdminApprovalRuleDetail,
      getCoreAdminAuditEventDetail,
      getCoreAdminCompanyDetail,
      getCoreAdminLocationDetail,
      getCoreAdminOverview,
      getCoreAdminPermissionDetail,
      getCoreAdminRoleDetail,
      getCoreAdminUserDetail,
      listCoreAdminAuditEvents,
      updateRolePermissions,
    } = await import("../src/server/services/coreAdmin"));
    ({ resetCompanyPolicySetting, updateCompanyPolicySetting } =
      await import("../src/server/services/policySettings"));
    ({
      createDeploymentEvidenceRecord,
      createEnablementEvidenceRecord,
      createReleaseBoardDecision,
      createUatEvidenceRecord,
      updateDeploymentEvidenceStatus,
      updateEnablementEvidenceStatus,
      updateReleaseReadinessGate,
      updateUatEvidenceStatus,
    } = await import("../src/server/services/releaseReadiness"));
    ({ completeAuthSessionInvalidation, listAuthSessionInvalidations } =
      await import("../src/server/services/authInvalidation"));
    ({
      approveBreakGlassAccess,
      completeBreakGlassPostReview,
      listBreakGlassAccessGrants,
      rejectBreakGlassAccess,
      requestBreakGlassAccess,
      revokeBreakGlassAccess,
    } = await import("../src/server/services/breakGlassAccess"));
    ({
      recordPrivilegedMfaEnrollment,
      revokePrivilegedMfaEnrollment,
      verifyPrivilegedMfaEnrollment,
    } = await import("../src/server/services/privilegedMfa"));
    ({ createOperationalReasonCode, deactivateOperationalReasonCode } =
      await import("../src/server/services/operationalReasonCodes"));

    await prisma.$connect();
    await assertDisposableAuthorizationDatabaseMarker(prisma, process.env);
    const identity = await prisma.$queryRaw<Array<{ currentDatabase: string }>>`
      SELECT current_database() AS "currentDatabase"
    `;
    if (identity[0]?.currentDatabase !== expectedDatabase) {
      throw new Error("AUTHORIZATION_DATABASE_IDENTITY_MISMATCH");
    }

    const permission = await prisma.permission.findUnique({
      where: { code: permissions.coreAdminister },
      select: { id: true },
    });
    if (!permission) {
      throw new Error("SEEDED_CORE_ADMIN_PERMISSION_REQUIRED");
    }
    coreAdminPermissionId = permission.id;
    const tenantRoleAdminPermission = await prisma.permission.findUnique({
      where: { code: permissions.tenantRoleAdminister },
      select: { id: true },
    });
    if (!tenantRoleAdminPermission) {
      throw new Error("SEEDED_TENANT_ROLE_ADMIN_PERMISSION_REQUIRED");
    }
    tenantRoleAdminPermissionId = tenantRoleAdminPermission.id;

    await prisma.tenant.create({
      data: {
        id: ids.tenantId,
        name: `Authorization Admin Platform Tenant ${suffix}`,
        loginCode: `authz-admin-${suffix}`,
      },
    });
    await prisma.company.createMany({
      data: [
        {
          id: ids.companyId,
          tenantId: ids.tenantId,
          code: `AAP-${suffix}`,
          legalName: `Authorization Admin Company ${suffix}`,
          currencyCode: "PHP",
        },
        {
          id: ids.adjacentCompanyId,
          tenantId: ids.tenantId,
          code: `AAX-${suffix}`,
          legalName: `Authorization Adjacent Company ${suffix}`,
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
          code: `AAP-${suffix}`,
          name: `Authorization Admin Location ${suffix}`,
        },
        {
          id: ids.adjacentLocationId,
          tenantId: ids.tenantId,
          companyId: ids.adjacentCompanyId,
          locationType: "BRANCH",
          code: `AAX-${suffix}`,
          name: `Authorization Adjacent Location ${suffix}`,
        },
      ],
    });
    await prisma.user.createMany({
      data: [
        {
          id: ids.actorUserId,
          tenantId: ids.tenantId,
          email: actorEmail,
          displayName: `Authorization Admin Actor ${suffix}`,
        },
        {
          id: ids.targetUserId,
          tenantId: ids.tenantId,
          email: `authz-admin-target-${suffix}@example.test`,
          displayName: `Authorization Admin Target ${suffix}`,
        },
        {
          id: ids.adjacentUserId,
          tenantId: ids.tenantId,
          email: `authz-admin-adjacent-${suffix}@example.test`,
          displayName: `Authorization Adjacent Target ${suffix}`,
        },
      ],
    });
    await prisma.role.create({
      data: {
        id: ids.roleId,
        tenantId: ids.tenantId,
        code: `AUTHZ_ADMIN_${suffix}`,
        name: `Authorization Admin Role ${suffix}`,
      },
    });
    await prisma.role.create({
      data: {
        id: ids.nonSensitiveRoleId,
        tenantId: ids.tenantId,
        code: "CONFIGURED_REQUESTER",
        name: `Authorization Requester Role ${suffix}`,
      },
    });
    await prisma.rolePermission.createMany({
      data: [
        { roleId: ids.roleId, permissionId: coreAdminPermissionId },
        { roleId: ids.roleId, permissionId: tenantRoleAdminPermissionId },
      ],
    });
    await prisma.userRoleAssignment.create({
      data: { userId: ids.actorUserId, roleId: ids.roleId },
    });
    await prisma.userScopeAssignment.createMany({
      data: [
        {
          id: ids.actorLocationScopeId,
          userId: ids.actorUserId,
          scopeType: "LOCATION",
          scopeId: ids.locationId,
          accessLevel: "MANAGE",
        },
        {
          id: ids.actorCompanyScopeId,
          userId: ids.actorUserId,
          scopeType: "COMPANY",
          scopeId: ids.companyId,
          accessLevel: "MANAGE",
        },
        {
          id: ids.targetScopeId,
          userId: ids.targetUserId,
          scopeType: "LOCATION",
          scopeId: ids.locationId,
          accessLevel: "OPERATE",
        },
        {
          id: ids.adjacentTargetScopeId,
          userId: ids.adjacentUserId,
          scopeType: "LOCATION",
          scopeId: ids.adjacentLocationId,
          accessLevel: "OPERATE",
        },
      ],
    });
    await prisma.companyPolicySetting.create({
      data: {
        tenantId: ids.tenantId,
        companyId: ids.companyId,
        key: "security.privileged_mfa.enforcement_mode",
        category: "security",
        label: "Privileged MFA enforcement",
        description: "Authorization boundary fixture",
        value: "enforce_admin_security",
        defaultValue: "warn_and_audit",
        valueType: "SELECT",
        isDefault: false,
        updatedByUserId: ids.actorUserId,
      },
    });
    await prisma.notification.create({
      data: {
        id: ids.notificationId,
        tenantId: ids.tenantId,
        companyId: ids.companyId,
        locationId: ids.locationId,
        recipientUserId: ids.targetUserId,
        notificationType: "AUTHORIZATION_TEST",
        title: "Private notification",
        body: "Only the intended recipient may archive this notification.",
        deepLink: "/notifications",
        entityType: "User",
        entityId: ids.targetUserId,
        sourceEventKey: `authz-admin-platform-${suffix}`,
      },
    });
    await prisma.authIdentity.create({
      data: {
        id: ids.authIdentityId,
        tenantId: ids.tenantId,
        userId: ids.actorUserId,
        provider: "LOCAL",
        normalizedIdentifier: actorEmail,
      },
    });
    await prisma.authSession.create({
      data: {
        id: ids.authSessionId,
        tenantId: ids.tenantId,
        userId: ids.actorUserId,
        authIdentityId: ids.authIdentityId,
        tokenHash: authenticationSessionTokenHash(actorSessionToken),
        status: "ACTIVE",
        assuranceLevel: "MFA",
        mfaAuthenticatedAt: new Date(),
        privilegeEpochAtIssue: 0,
        idleExpiresAt: new Date(Date.now() + 60 * 60_000),
        absoluteExpiresAt: new Date(Date.now() + 4 * 60 * 60_000),
      },
    });
    await prisma.authSession.create({
      data: {
        id: ids.adjacentAuthSessionId,
        tenantId: ids.tenantId,
        userId: ids.adjacentUserId,
        tokenHash: authenticationSessionTokenHash(
          `authz-admin-adjacent-token-${suffix}`,
        ),
        status: "ACTIVE",
        assuranceLevel: "PASSWORD",
        privilegeEpochAtIssue: 0,
        idleExpiresAt: new Date(Date.now() + 60 * 60_000),
        absoluteExpiresAt: new Date(Date.now() + 4 * 60 * 60_000),
      },
    });
  });

  afterAll(async () => {
    clearAuthenticatedRequest();
    if (prisma) await prisma.$disconnect();
  });

  it("AUTHZ-ADMIN-LIVE-PERMISSION-REVOKED-DENIES-READ", async () => {
    const staleSession = await getConfiguredContext(actorEmail);
    await prisma.rolePermission.delete({
      where: {
        roleId_permissionId: {
          roleId: ids.roleId,
          permissionId: coreAdminPermissionId,
        },
      },
    });
    try {
      await expect(listAuthenticationAccounts(staleSession)).rejects.toThrow(
        "PERMISSION_DENIED",
      );
    } finally {
      await prisma.rolePermission.create({
        data: { roleId: ids.roleId, permissionId: coreAdminPermissionId },
      });
    }
  });

  it("AUTHZ-ADMIN-COMPANY-MANAGE-REVOKED-DENIES-WRITE-NO-MUTATION", async () => {
    const staleSession = await getConfiguredContext(actorEmail);
    await prisma.userScopeAssignment.update({
      where: { id: ids.actorCompanyScopeId },
      data: { status: "INACTIVE", endsAt: new Date() },
    });
    const before = await prisma.authActivationToken.count({
      where: { tenantId: ids.tenantId, targetUserId: ids.targetUserId },
    });
    const formData = new FormData();
    formData.set("targetUserId", ids.targetUserId);
    try {
      await expect(
        issueAuthenticationActivation(staleSession, formData),
      ).rejects.toThrow("ADMIN_SCOPE_DENIED");
      expect(
        await prisma.authActivationToken.count({
          where: { tenantId: ids.tenantId, targetUserId: ids.targetUserId },
        }),
      ).toBe(before);
    } finally {
      await prisma.userScopeAssignment.update({
        where: { id: ids.actorCompanyScopeId },
        data: { status: "ACTIVE", endsAt: null },
      });
    }
  });

  it("AUTHZ-ADMIN-TARGET-OUTSIDE-COMPANY-DENIED-NO-MUTATION", async () => {
    const session = await getConfiguredContext(actorEmail);
    const before = await prisma.authActivationToken.count({
      where: { tenantId: ids.tenantId, targetUserId: ids.adjacentUserId },
    });
    const formData = new FormData();
    formData.set("targetUserId", ids.adjacentUserId);
    await expect(
      issueAuthenticationActivation(session, formData),
    ).rejects.toThrow("AUTH_ACCOUNT_SCOPE_DENIED");
    expect(
      await prisma.authActivationToken.count({
        where: { tenantId: ids.tenantId, targetUserId: ids.adjacentUserId },
      }),
    ).toBe(before);
  });

  it("AUTHZ-ADMIN-PRIVILEGED-MFA-DENIED-NO-TOKEN-MUTATION", async () => {
    const session = await getConfiguredContext(actorEmail);
    const before = await prisma.authActivationToken.count({
      where: { tenantId: ids.tenantId, targetUserId: ids.targetUserId },
    });
    const formData = new FormData();
    formData.set("targetUserId", ids.targetUserId);
    await expect(
      issueAuthenticationActivation(session, formData),
    ).rejects.toThrow(/PRIVILEGED_MFA_(?:STEP_UP_)?REQUIRED/);
    expect(
      await prisma.authActivationToken.count({
        where: { tenantId: ids.tenantId, targetUserId: ids.targetUserId },
      }),
    ).toBe(before);
  });

  it("AUTHZ-PLATFORM-NOTIFICATION-OWNER-DENIED-NO-MUTATION", async () => {
    const session = await getConfiguredContext(actorEmail);
    const before = await prisma.notification.findUniqueOrThrow({
      where: { id: ids.notificationId },
      select: { status: true, archivedAt: true },
    });
    await markNotificationRead(session, ids.notificationId);
    await archiveNotification(session, ids.notificationId);
    expect(
      await prisma.notification.findUniqueOrThrow({
        where: { id: ids.notificationId },
        select: { status: true, archivedAt: true },
      }),
    ).toEqual(before);
  });

  it("AUTHZ-RELEASE-LIVE-PERMISSION-REVOKED-DENIES-EXPORT-NO-MUTATION", async () => {
    const staleSession = await getConfiguredContext(actorEmail);
    await prisma.rolePermission.delete({
      where: {
        roleId_permissionId: {
          roleId: ids.roleId,
          permissionId: coreAdminPermissionId,
        },
      },
    });
    const before = await prisma.releaseReadinessGate.count({
      where: { tenantId: ids.tenantId, companyId: ids.companyId },
    });
    try {
      await expect(
        buildReleaseReadinessExportRows(staleSession),
      ).rejects.toThrow("PERMISSION_DENIED");
      expect(
        await prisma.releaseReadinessGate.count({
          where: { tenantId: ids.tenantId, companyId: ids.companyId },
        }),
      ).toBe(before);
    } finally {
      await prisma.rolePermission.create({
        data: { roleId: ids.roleId, permissionId: coreAdminPermissionId },
      });
    }
  });

  it("AUTHZ-ADMIN-COOKIE-BOUNDARY-LIVE-PERMISSION-DENIED-NO-MUTATION", async () => {
    configureAuthenticatedRequest({
      sessionToken: actorSessionToken,
      selectedLocationId: ids.locationId,
    });
    await prisma.rolePermission.delete({
      where: {
        roleId_permissionId: {
          roleId: ids.roleId,
          permissionId: coreAdminPermissionId,
        },
      },
    });
    const before = await prisma.user.count({
      where: { tenantId: ids.tenantId },
    });
    try {
      await expect(createCoreAdminUser(new FormData())).rejects.toThrow(
        "PERMISSION_DENIED",
      );
      expect(
        await prisma.user.count({ where: { tenantId: ids.tenantId } }),
      ).toBe(before);
    } finally {
      await prisma.rolePermission.create({
        data: { roleId: ids.roleId, permissionId: coreAdminPermissionId },
      });
      clearAuthenticatedRequest();
    }
  });

  it("AUTHZ-POLICY-COOKIE-BOUNDARY-LIVE-PERMISSION-DENIED-NO-MUTATION", async () => {
    configureAuthenticatedRequest({
      sessionToken: actorSessionToken,
      selectedLocationId: ids.locationId,
    });
    await prisma.rolePermission.delete({
      where: {
        roleId_permissionId: {
          roleId: ids.roleId,
          permissionId: coreAdminPermissionId,
        },
      },
    });
    const before = await prisma.companyPolicySetting.count({
      where: { tenantId: ids.tenantId, companyId: ids.companyId },
    });
    try {
      await expect(updateCompanyPolicySetting(new FormData())).rejects.toThrow(
        "PERMISSION_DENIED",
      );
      expect(
        await prisma.companyPolicySetting.count({
          where: { tenantId: ids.tenantId, companyId: ids.companyId },
        }),
      ).toBe(before);
    } finally {
      await prisma.rolePermission.create({
        data: { roleId: ids.roleId, permissionId: coreAdminPermissionId },
      });
      clearAuthenticatedRequest();
    }
  });

  it("AUTHZ-RELEASE-COOKIE-BOUNDARY-LIVE-PERMISSION-DENIED-NO-MUTATION", async () => {
    configureAuthenticatedRequest({
      sessionToken: actorSessionToken,
      selectedLocationId: ids.locationId,
    });
    await prisma.rolePermission.delete({
      where: {
        roleId_permissionId: {
          roleId: ids.roleId,
          permissionId: coreAdminPermissionId,
        },
      },
    });
    const before = await prisma.releaseReadinessGate.count({
      where: { tenantId: ids.tenantId, companyId: ids.companyId },
    });
    try {
      await expect(updateReleaseReadinessGate(new FormData())).rejects.toThrow(
        "PERMISSION_DENIED",
      );
      expect(
        await prisma.releaseReadinessGate.count({
          where: { tenantId: ids.tenantId, companyId: ids.companyId },
        }),
      ).toBe(before);
    } finally {
      await prisma.rolePermission.create({
        data: { roleId: ids.roleId, permissionId: coreAdminPermissionId },
      });
      clearAuthenticatedRequest();
    }
  });

  it("AUTHZ-SECURITY-GOVERNANCE-COOKIE-BOUNDARIES-DENY-WITHOUT-MUTATION", async () => {
    configureAuthenticatedRequest({
      sessionToken: actorSessionToken,
      selectedLocationId: ids.locationId,
    });
    await prisma.rolePermission.delete({
      where: {
        roleId_permissionId: {
          roleId: ids.roleId,
          permissionId: coreAdminPermissionId,
        },
      },
    });
    const beforeInvalidations = await prisma.authSessionInvalidation.count({
      where: { tenantId: ids.tenantId },
    });
    const beforeBreakGlass = await prisma.breakGlassAccessGrant.count({
      where: { tenantId: ids.tenantId },
    });
    const beforeEnrollments = await prisma.privilegedMfaEnrollment.count({
      where: { tenantId: ids.tenantId },
    });
    try {
      await expect(
        completeAuthSessionInvalidation(new FormData()),
      ).rejects.toThrow("PERMISSION_DENIED");
      await expect(approveBreakGlassAccess(new FormData())).rejects.toThrow(
        "PERMISSION_DENIED",
      );
      await expect(
        verifyPrivilegedMfaEnrollment(new FormData()),
      ).rejects.toThrow("PERMISSION_DENIED");
      expect(
        await prisma.authSessionInvalidation.count({
          where: { tenantId: ids.tenantId },
        }),
      ).toBe(beforeInvalidations);
      expect(
        await prisma.breakGlassAccessGrant.count({
          where: { tenantId: ids.tenantId },
        }),
      ).toBe(beforeBreakGlass);
      expect(
        await prisma.privilegedMfaEnrollment.count({
          where: { tenantId: ids.tenantId },
        }),
      ).toBe(beforeEnrollments);
    } finally {
      await prisma.rolePermission.create({
        data: { roleId: ids.roleId, permissionId: coreAdminPermissionId },
      });
      clearAuthenticatedRequest();
    }
  });

  it("AUTHZ-AUTH-INVALIDATION-COMPANY-AND-TENANT-GLOBAL-BOUNDARIES", async () => {
    configureAuthenticatedRequest({
      sessionToken: actorSessionToken,
      selectedLocationId: ids.locationId,
    });
    const staleSession = await getConfiguredContext(actorEmail);
    const companyInvalidationId = randomUUID();
    const globalInvalidationId = randomUUID();
    const originalCompanyScope = await prisma.userScopeAssignment.findUniqueOrThrow({
      where: { id: ids.actorCompanyScopeId },
      select: { startsAt: true, endsAt: true },
    });
    await prisma.authSessionInvalidation.createMany({
      data: [
        {
          id: companyInvalidationId,
          tenantId: ids.tenantId,
          companyId: ids.companyId,
          targetUserId: ids.targetUserId,
          requestedByUserId: ids.adjacentUserId,
          status: "PENDING_PROVIDER",
          reason: "Company-scoped invalidation authorization fixture",
          sourceEventType: "authz.company_invalidation.fixture",
        },
        {
          id: globalInvalidationId,
          tenantId: ids.tenantId,
          companyId: null,
          targetUserId: ids.targetUserId,
          requestedByUserId: ids.adjacentUserId,
          status: "PENDING_PROVIDER",
          reason: "Tenant-global invalidation authorization fixture",
          sourceEventType: "authz.global_invalidation.fixture",
        },
      ],
    });
    const completionForm = (invalidationId: string) =>
      formData({
        invalidationId,
        providerName: "AUTHZ_TEST_PROVIDER",
        providerReference: `AUTHZ-${invalidationId}`,
        reason: "Complete the provider-side invalidation fixture.",
      });

    try {
      await prisma.rolePermission.delete({
        where: {
          roleId_permissionId: {
            roleId: ids.roleId,
            permissionId: tenantRoleAdminPermissionId,
          },
        },
      });
      const companyOnlyRecords = await listAuthSessionInvalidations(staleSession);
      expect(companyOnlyRecords.map((record) => record.id)).toContain(
        companyInvalidationId,
      );
      expect(companyOnlyRecords.map((record) => record.id)).not.toContain(
        globalInvalidationId,
      );
      const inaccessibleError = await completeAuthSessionInvalidation(
        completionForm(globalInvalidationId),
      ).catch((error: unknown) => error);
      const nonexistentError = await completeAuthSessionInvalidation(
        completionForm(randomUUID()),
      ).catch((error: unknown) => error);
      expect(inaccessibleError).toMatchObject({
        message: "AUTH_SESSION_INVALIDATION_NOT_FOUND",
      });
      expect(nonexistentError).toMatchObject({
        message: "AUTH_SESSION_INVALIDATION_NOT_FOUND",
      });

      await prisma.userScopeAssignment.update({
        where: { id: ids.actorCompanyScopeId },
        data: {
          startsAt: new Date(Date.now() + 60_000),
          endsAt: null,
        },
      });
      await expect(listAuthSessionInvalidations(staleSession)).rejects.toThrow(
        "ADMIN_SCOPE_DENIED",
      );
      await expect(
        completeAuthSessionInvalidation(completionForm(companyInvalidationId)),
      ).rejects.toThrow("ADMIN_SCOPE_DENIED");

      await prisma.userScopeAssignment.update({
        where: { id: ids.actorCompanyScopeId },
        data: {
          startsAt: new Date(Date.now() - 120_000),
          endsAt: new Date(Date.now() - 60_000),
        },
      });
      await expect(listAuthSessionInvalidations(staleSession)).rejects.toThrow(
        "ADMIN_SCOPE_DENIED",
      );
      await expect(
        completeAuthSessionInvalidation(completionForm(companyInvalidationId)),
      ).rejects.toThrow("ADMIN_SCOPE_DENIED");
      expect(
        await prisma.authSessionInvalidation.count({
          where: {
            id: { in: [companyInvalidationId, globalInvalidationId] },
            status: "PENDING_PROVIDER",
          },
        }),
      ).toBe(2);

      await prisma.userScopeAssignment.update({
        where: { id: ids.actorCompanyScopeId },
        data: {
          startsAt: originalCompanyScope.startsAt,
          endsAt: originalCompanyScope.endsAt,
        },
      });
      await prisma.rolePermission.create({
        data: {
          roleId: ids.roleId,
          permissionId: tenantRoleAdminPermissionId,
        },
      });
      const tenantAdminRecords = await listAuthSessionInvalidations(staleSession);
      expect(tenantAdminRecords.map((record) => record.id)).toEqual(
        expect.arrayContaining([companyInvalidationId, globalInvalidationId]),
      );
      await completeAuthSessionInvalidation(completionForm(globalInvalidationId));
      expect(
        await prisma.authSessionInvalidation.findUniqueOrThrow({
          where: { id: globalInvalidationId },
          select: { status: true },
        }),
      ).toEqual({ status: "PROVIDER_COMPLETED" });
      expect(
        await prisma.auditEvent.count({
          where: {
            tenantId: ids.tenantId,
            entityId: globalInvalidationId,
            eventType: "auth_session_invalidation.provider_completed",
          },
        }),
      ).toBe(1);
    } finally {
      await prisma.userScopeAssignment.update({
        where: { id: ids.actorCompanyScopeId },
        data: {
          startsAt: originalCompanyScope.startsAt,
          endsAt: originalCompanyScope.endsAt,
        },
      });
      await prisma.rolePermission.createMany({
        data: [
          {
            roleId: ids.roleId,
            permissionId: tenantRoleAdminPermissionId,
          },
        ],
        skipDuplicates: true,
      });
      await prisma.authSessionInvalidation.deleteMany({
        where: { id: { in: [companyInvalidationId, globalInvalidationId] } },
      });
      clearAuthenticatedRequest();
    }
  });

  it("AUTHZ-AUTH-INVALIDATION-CONCURRENT-COMPLETION-CAS-EXACTLY-ONCE", async () => {
    const secondAdminUserId = randomUUID();
    const secondAdminRoleAssignmentId = randomUUID();
    const secondAdminLocationScopeId = randomUUID();
    const secondAdminCompanyScopeId = randomUUID();
    const invalidationId = randomUUID();
    const secondAdminEmail = `authz-invalidation-admin-${suffix}@example.test`;
    await prisma.user.create({
      data: {
        id: secondAdminUserId,
        tenantId: ids.tenantId,
        email: secondAdminEmail,
        displayName: `Authorization Invalidation Admin ${suffix}`,
      },
    });
    await prisma.userRoleAssignment.create({
      data: {
        id: secondAdminRoleAssignmentId,
        userId: secondAdminUserId,
        roleId: ids.roleId,
      },
    });
    await prisma.userScopeAssignment.createMany({
      data: [
        {
          id: secondAdminLocationScopeId,
          userId: secondAdminUserId,
          scopeType: "LOCATION",
          scopeId: ids.locationId,
          accessLevel: "MANAGE",
        },
        {
          id: secondAdminCompanyScopeId,
          userId: secondAdminUserId,
          scopeType: "COMPANY",
          scopeId: ids.companyId,
          accessLevel: "MANAGE",
        },
      ],
    });
    await prisma.authSessionInvalidation.create({
      data: {
        id: invalidationId,
        tenantId: ids.tenantId,
        companyId: null,
        targetUserId: ids.targetUserId,
        requestedByUserId: ids.targetUserId,
        status: "PENDING_PROVIDER",
        reason: "Concurrent provider completion authorization fixture",
        sourceEventType: "authz.concurrent_invalidation.fixture",
      },
    });

    try {
      const sessions = [
        await getConfiguredContext(actorEmail, ids.locationId),
        await getConfiguredContext(secondAdminEmail, ids.locationId),
      ];
      let nextSessionIndex = 0;
      vi.resetModules();
      vi.doMock("../src/server/services/context", async (importOriginal) => {
        const actual =
          await importOriginal<typeof import("../src/server/services/context")>();
        return {
          ...actual,
          requireSessionContext: async () => sessions[nextSessionIndex++]!,
        };
      });
      const concurrentService = await import(
        "../src/server/services/authInvalidation"
      );
      const makeCompletionForm = (providerReference: string) =>
        formData({
          invalidationId,
          providerName: "AUTHZ_CONCURRENT_PROVIDER",
          providerReference,
          reason: "Concurrent administrators must claim completion once.",
        });
      const results = await Promise.allSettled([
        concurrentService.completeAuthSessionInvalidation(
          makeCompletionForm("AUTHZ-CONCURRENT-ADMIN-A"),
        ),
        concurrentService.completeAuthSessionInvalidation(
          makeCompletionForm("AUTHZ-CONCURRENT-ADMIN-B"),
        ),
      ]);
      expect(
        results.filter((result) => result.status === "fulfilled"),
      ).toHaveLength(1);
      expect(
        results.filter((result) => result.status === "rejected"),
      ).toHaveLength(1);
      expect(
        results.find((result) => result.status === "rejected")?.reason,
      ).toMatchObject({ message: "AUTH_SESSION_INVALIDATION_NOT_FOUND" });
      expect(
        await prisma.authSessionInvalidation.findUniqueOrThrow({
          where: { id: invalidationId },
          select: { status: true, providerReference: true },
        }),
      ).toMatchObject({
        status: "PROVIDER_COMPLETED",
        providerReference: expect.stringMatching(
          /AUTHZ-CONCURRENT-ADMIN-[AB]/,
        ),
      });
      expect(
        await prisma.auditEvent.count({
          where: {
            tenantId: ids.tenantId,
            entityId: invalidationId,
            eventType: "auth_session_invalidation.provider_completed",
          },
        }),
      ).toBe(1);
    } finally {
      vi.doUnmock("../src/server/services/context");
      vi.resetModules();
      await prisma.authSessionInvalidation.deleteMany({
        where: { id: invalidationId },
      });
      await prisma.userScopeAssignment.deleteMany({
        where: {
          id: { in: [secondAdminLocationScopeId, secondAdminCompanyScopeId] },
        },
      });
      await prisma.userRoleAssignment.deleteMany({
        where: { id: secondAdminRoleAssignmentId },
      });
      clearAuthenticatedRequest();
    }
  });

  it("AUTHZ-ADMIN-HIGH-RISK-SURFACES-LIVE-PERMISSION-DENIED-NO-MUTATION", async () => {
    configureAuthenticatedRequest({
      sessionToken: actorSessionToken,
      selectedLocationId: ids.locationId,
    });
    const session = await getConfiguredContext(actorEmail);
    const before = {
      users: await prisma.user.count({ where: { tenantId: ids.tenantId } }),
      roles: await prisma.role.count({ where: { tenantId: ids.tenantId } }),
      companies: await prisma.company.count({
        where: { tenantId: ids.tenantId },
      }),
      brands: await prisma.brand.count({ where: { tenantId: ids.tenantId } }),
      departments: await prisma.department.count({
        where: { tenantId: ids.tenantId },
      }),
      locations: await prisma.location.count({
        where: { tenantId: ids.tenantId },
      }),
      roleAssignments: await prisma.userRoleAssignment.count({
        where: { userId: ids.targetUserId },
      }),
      scopeAssignments: await prisma.userScopeAssignment.count({
        where: { userId: ids.targetUserId },
      }),
      releaseGates: await prisma.releaseReadinessGate.count({
        where: { tenantId: ids.tenantId },
      }),
      deploymentEvidence: await prisma.deploymentEvidenceRecord.count({
        where: { tenantId: ids.tenantId },
      }),
      enablementEvidence: await prisma.enablementEvidenceRecord.count({
        where: { tenantId: ids.tenantId },
      }),
      uatEvidence: await prisma.uatEvidenceRecord.count({
        where: { tenantId: ids.tenantId },
      }),
      boardDecisions: await prisma.releaseBoardDecision.count({
        where: { tenantId: ids.tenantId },
      }),
      reasonCodes: await prisma.operationalReasonCode.count({
        where: { tenantId: ids.tenantId },
      }),
      policySettings: await prisma.companyPolicySetting.count({
        where: { tenantId: ids.tenantId },
      }),
      recoveryRequests: await prisma.authRecoveryRequest.count({
        where: { tenantId: ids.tenantId },
      }),
      authSessions: await prisma.authSession.count({
        where: { tenantId: ids.tenantId },
      }),
      breakGlass: await prisma.breakGlassAccessGrant.count({
        where: { tenantId: ids.tenantId },
      }),
      privilegedMfa: await prisma.privilegedMfaEnrollment.count({
        where: { tenantId: ids.tenantId },
      }),
    };

    const validRolePermissionForm = formData({
      roleId: ids.roleId,
      reason: "Authorization denial must happen before any role mutation.",
    });
    const validRoleAssignmentForm = formData({
      targetUserId: ids.targetUserId,
      roleId: ids.roleId,
      reason: "Authorization denial must happen before target lookup.",
    });
    const validScopeAssignmentForm = formData({
      targetUserId: ids.targetUserId,
      locationId: ids.locationId,
      accessLevel: "OPERATE",
      reason: "Authorization denial must happen before target lookup.",
    });
    const validReviewForm = formData({
      requestId: randomUUID(),
      targetUserId: ids.targetUserId,
      reviewReason: "Authorization denial must be non-enumerating.",
    });

    await prisma.rolePermission.delete({
      where: {
        roleId_permissionId: {
          roleId: ids.roleId,
          permissionId: coreAdminPermissionId,
        },
      },
    });
    try {
      const calls: Array<() => Promise<unknown>> = [
        () => createCoreAdminRole(new FormData()),
        () => createCoreAdminCompany(new FormData()),
        () => createCoreAdminBrand(new FormData()),
        () => createCoreAdminDepartment(new FormData()),
        () => createCoreAdminLocation(new FormData()),
        () => createUserRoleAssignment(validRoleAssignmentForm),
        () => createUserLocationScopeAssignment(validScopeAssignmentForm),
        () => deactivateUserRoleAssignment(new FormData()),
        () => deactivateUserScopeAssignment(new FormData()),
        () => requestSensitiveUserRole(new FormData()),
        () => requestHighRiskUserLocationScope(new FormData()),
        () => approveSensitiveUserRoleRequest(validReviewForm),
        () => rejectSensitiveUserRoleRequest(validReviewForm),
        () => approveHighRiskUserLocationScopeRequest(validReviewForm),
        () => rejectHighRiskUserLocationScopeRequest(validReviewForm),
        () => updateRolePermissions(validRolePermissionForm),
        () => applyRecommendedRolePermissions(validRolePermissionForm),
        () => approveAuthRecovery(session, new FormData()),
        () => rejectAuthRecovery(session, new FormData()),
        () => requestAuthRecovery(session, new FormData()),
        () => retryAuthenticationActivationDelivery(session, new FormData()),
        () => revokeAuthenticationSessions(session, new FormData()),
        () => createDeploymentEvidenceRecord(new FormData()),
        () => createEnablementEvidenceRecord(new FormData()),
        () => createUatEvidenceRecord(new FormData()),
        () => createReleaseBoardDecision(new FormData()),
        () => updateDeploymentEvidenceStatus(new FormData()),
        () => updateEnablementEvidenceStatus(new FormData()),
        () => updateUatEvidenceStatus(new FormData()),
        () => rejectBreakGlassAccess(new FormData()),
        () => listBreakGlassAccessGrants(session),
        () => requestBreakGlassAccess(new FormData()),
        () => revokeBreakGlassAccess(new FormData()),
        () => completeBreakGlassPostReview(new FormData()),
        () => recordPrivilegedMfaEnrollment(new FormData()),
        () => revokePrivilegedMfaEnrollment(new FormData()),
        () => createOperationalReasonCode(new FormData()),
        () => deactivateOperationalReasonCode(new FormData()),
        () => resetCompanyPolicySetting(new FormData()),
      ];
      for (const call of calls) {
        await expect(call()).rejects.toThrow("PERMISSION_DENIED");
      }

      expect({
        users: await prisma.user.count({ where: { tenantId: ids.tenantId } }),
        roles: await prisma.role.count({ where: { tenantId: ids.tenantId } }),
        companies: await prisma.company.count({
          where: { tenantId: ids.tenantId },
        }),
        brands: await prisma.brand.count({ where: { tenantId: ids.tenantId } }),
        departments: await prisma.department.count({
          where: { tenantId: ids.tenantId },
        }),
        locations: await prisma.location.count({
          where: { tenantId: ids.tenantId },
        }),
        roleAssignments: await prisma.userRoleAssignment.count({
          where: { userId: ids.targetUserId },
        }),
        scopeAssignments: await prisma.userScopeAssignment.count({
          where: { userId: ids.targetUserId },
        }),
        releaseGates: await prisma.releaseReadinessGate.count({
          where: { tenantId: ids.tenantId },
        }),
        deploymentEvidence: await prisma.deploymentEvidenceRecord.count({
          where: { tenantId: ids.tenantId },
        }),
        enablementEvidence: await prisma.enablementEvidenceRecord.count({
          where: { tenantId: ids.tenantId },
        }),
        uatEvidence: await prisma.uatEvidenceRecord.count({
          where: { tenantId: ids.tenantId },
        }),
        boardDecisions: await prisma.releaseBoardDecision.count({
          where: { tenantId: ids.tenantId },
        }),
        reasonCodes: await prisma.operationalReasonCode.count({
          where: { tenantId: ids.tenantId },
        }),
        policySettings: await prisma.companyPolicySetting.count({
          where: { tenantId: ids.tenantId },
        }),
        recoveryRequests: await prisma.authRecoveryRequest.count({
          where: { tenantId: ids.tenantId },
        }),
        authSessions: await prisma.authSession.count({
          where: { tenantId: ids.tenantId },
        }),
        breakGlass: await prisma.breakGlassAccessGrant.count({
          where: { tenantId: ids.tenantId },
        }),
        privilegedMfa: await prisma.privilegedMfaEnrollment.count({
          where: { tenantId: ids.tenantId },
        }),
      }).toEqual(before);
    } finally {
      await prisma.rolePermission.create({
        data: { roleId: ids.roleId, permissionId: coreAdminPermissionId },
      });
      clearAuthenticatedRequest();
    }
  });

  it("AUTHZ-ADMIN-CONTROLLED-REQUEST-NON-ENUMERATION-WITH-DENIAL-AUDIT-ONLY", async () => {
    configureAuthenticatedRequest({
      sessionToken: actorSessionToken,
      selectedLocationId: ids.locationId,
    });
    await prisma.sensitiveRoleRequest.create({
      data: {
        id: ids.sensitiveRoleRequestId,
        tenantId: ids.tenantId,
        companyId: ids.companyId,
        targetUserId: ids.targetUserId,
        roleId: ids.roleId,
        requestedByUserId: ids.targetUserId,
        reason: "Authorization fixture",
        evidenceReference: "AUTHZ-EVIDENCE",
      },
    });
    await prisma.highRiskScopeRequest.create({
      data: {
        id: ids.highRiskScopeRequestId,
        tenantId: ids.tenantId,
        companyId: ids.companyId,
        targetUserId: ids.targetUserId,
        locationId: ids.locationId,
        accessLevel: "MANAGE",
        requestedByUserId: ids.targetUserId,
        reason: "Authorization fixture",
        evidenceReference: "AUTHZ-EVIDENCE",
      },
    });
    const beforeSensitive = await prisma.sensitiveRoleRequest.findUniqueOrThrow(
      {
        where: { id: ids.sensitiveRoleRequestId },
      },
    );
    const beforeScope = await prisma.highRiskScopeRequest.findUniqueOrThrow({
      where: { id: ids.highRiskScopeRequestId },
    });
    const beforeDeniedAudits = await prisma.auditEvent.count({
      where: { tenantId: ids.tenantId },
    });
    await prisma.rolePermission.delete({
      where: {
        roleId_permissionId: {
          roleId: ids.roleId,
          permissionId: coreAdminPermissionId,
        },
      },
    });
    try {
      const reviews = [
        [approveSensitiveUserRoleRequest, ids.sensitiveRoleRequestId],
        [rejectSensitiveUserRoleRequest, ids.sensitiveRoleRequestId],
        [approveHighRiskUserLocationScopeRequest, ids.highRiskScopeRequestId],
        [rejectHighRiskUserLocationScopeRequest, ids.highRiskScopeRequestId],
      ] as const;
      for (const [review, existingId] of reviews) {
        for (const requestId of [existingId, randomUUID()]) {
          await expect(
            review(
              formData({
                requestId,
                targetUserId: ids.targetUserId,
                reviewReason:
                  "Authorization denial must not reveal record existence.",
              }),
            ),
          ).rejects.toThrow("PERMISSION_DENIED");
        }
      }
      expect(
        await prisma.sensitiveRoleRequest.findUniqueOrThrow({
          where: { id: ids.sensitiveRoleRequestId },
        }),
      ).toEqual(beforeSensitive);
      expect(
        await prisma.highRiskScopeRequest.findUniqueOrThrow({
          where: { id: ids.highRiskScopeRequestId },
        }),
      ).toEqual(beforeScope);
      expect(
        await prisma.auditEvent.count({ where: { tenantId: ids.tenantId } }),
      ).toBeGreaterThanOrEqual(beforeDeniedAudits);
    } finally {
      await prisma.rolePermission.create({
        data: { roleId: ids.roleId, permissionId: coreAdminPermissionId },
      });
      clearAuthenticatedRequest();
    }
  });

  it("AUTHZ-CORE-ADMIN-FOREIGN-COMPANY-MASTER-DATA-DENIED-NO-MUTATION", async () => {
    configureAuthenticatedRequest({
      sessionToken: actorSessionToken,
      selectedLocationId: ids.locationId,
    });
    const before = {
      brands: await prisma.brand.count({
        where: { companyId: ids.adjacentCompanyId },
      }),
      departments: await prisma.department.count({
        where: { companyId: ids.adjacentCompanyId },
      }),
      locations: await prisma.location.count({
        where: { companyId: ids.adjacentCompanyId },
      }),
    };
    const common = {
      companyId: ids.adjacentCompanyId,
      code: `DENY-${suffix}`,
      name: `Denied foreign company ${suffix}`,
      reason: "The actor has no MANAGE assignment for the target company.",
    };
    await expect(createCoreAdminBrand(formData(common))).rejects.toThrow(
      "ADMIN_SCOPE_DENIED",
    );
    await expect(createCoreAdminDepartment(formData(common))).rejects.toThrow(
      "ADMIN_SCOPE_DENIED",
    );
    await expect(
      createCoreAdminLocation(
        formData({
          ...common,
          locationType: "HEAD_OFFICE",
          timezone: "Asia/Manila",
        }),
      ),
    ).rejects.toThrow("ADMIN_SCOPE_DENIED");
    expect({
      brands: await prisma.brand.count({
        where: { companyId: ids.adjacentCompanyId },
      }),
      departments: await prisma.department.count({
        where: { companyId: ids.adjacentCompanyId },
      }),
      locations: await prisma.location.count({
        where: { companyId: ids.adjacentCompanyId },
      }),
    }).toEqual(before);
    clearAuthenticatedRequest();
  });

  it("AUTHZ-CORE-ADMIN-TENANT-ROLE-PERMISSION-REVOKED-DENIES-ALL-ROLE-MUTATIONS", async () => {
    configureAuthenticatedRequest({
      sessionToken: actorSessionToken,
      selectedLocationId: ids.locationId,
    });
    const before = {
      users: await prisma.user.count({ where: { tenantId: ids.tenantId } }),
      roles: await prisma.role.count({ where: { tenantId: ids.tenantId } }),
      assignments: await prisma.userRoleAssignment.count({
        where: { userId: { in: [ids.targetUserId, ids.adjacentUserId] } },
      }),
      requests: await prisma.sensitiveRoleRequest.count({
        where: { tenantId: ids.tenantId },
      }),
    };
    await prisma.rolePermission.delete({
      where: {
        roleId_permissionId: {
          roleId: ids.roleId,
          permissionId: tenantRoleAdminPermissionId,
        },
      },
    });
    try {
      const calls = [
        () =>
          createCoreAdminUser(
            formData({
              email: `denied-initial-role-${suffix}@example.test`,
              displayName: "Denied Initial Role User",
              initialRoleId: ids.nonSensitiveRoleId,
              initialLocationId: ids.locationId,
              accessLevel: "VIEW",
              reason:
                "Initial role onboarding requires tenant role administration.",
            }),
          ),
        () => createCoreAdminRole(new FormData()),
        () => createUserRoleAssignment(new FormData()),
        () => deactivateUserRoleAssignment(new FormData()),
        () => requestSensitiveUserRole(new FormData()),
        () => approveSensitiveUserRoleRequest(new FormData()),
        () => rejectSensitiveUserRoleRequest(new FormData()),
        () => updateRolePermissions(new FormData()),
        () => applyRecommendedRolePermissions(new FormData()),
      ];
      for (const call of calls) {
        await expect(call()).rejects.toThrow("PERMISSION_DENIED");
      }
      expect({
        users: await prisma.user.count({ where: { tenantId: ids.tenantId } }),
        roles: await prisma.role.count({ where: { tenantId: ids.tenantId } }),
        assignments: await prisma.userRoleAssignment.count({
          where: { userId: { in: [ids.targetUserId, ids.adjacentUserId] } },
        }),
        requests: await prisma.sensitiveRoleRequest.count({
          where: { tenantId: ids.tenantId },
        }),
      }).toEqual(before);
    } finally {
      await prisma.rolePermission.create({
        data: { roleId: ids.roleId, permissionId: tenantRoleAdminPermissionId },
      });
      clearAuthenticatedRequest();
    }
  });

  it("AUTHZ-CORE-ADMIN-TENANT-ROLE-PERMISSION-REVOKED-DENIES-SENSITIVE-READS", async () => {
    configureAuthenticatedRequest({
      sessionToken: actorSessionToken,
      selectedLocationId: ids.locationId,
    });
    const staleSession = await requireSessionContext();
    const auditBefore = await prisma.auditEvent.count({
      where: { tenantId: ids.tenantId },
    });
    await prisma.rolePermission.delete({
      where: {
        roleId_permissionId: {
          roleId: ids.roleId,
          permissionId: tenantRoleAdminPermissionId,
        },
      },
    });
    try {
      await expect(getCoreAdminOverview(staleSession)).rejects.toThrow(
        "PERMISSION_DENIED",
      );
      await expect(
        getCoreAdminRoleDetail(staleSession, ids.nonSensitiveRoleId),
      ).rejects.toThrow("PERMISSION_DENIED");
      await expect(
        getCoreAdminUserDetail(staleSession, ids.targetUserId),
      ).rejects.toThrow("PERMISSION_DENIED");
      expect(
        await prisma.auditEvent.count({ where: { tenantId: ids.tenantId } }),
      ).toBe(auditBefore);
    } finally {
      await prisma.rolePermission.create({
        data: { roleId: ids.roleId, permissionId: tenantRoleAdminPermissionId },
      });
      clearAuthenticatedRequest();
    }
  });

  it("AUTHZ-CORE-ADMIN-DETAIL-READS-ENFORCE-COMPANY-AND-TENANT-ROLE-SCOPE", async () => {
    const session = await getConfiguredContext(actorEmail);
    const adjacentRuleId = randomUUID();
    await prisma.approvalRule.create({
      data: {
        id: adjacentRuleId,
        tenantId: ids.tenantId,
        companyId: ids.adjacentCompanyId,
        transactionType: `AUTHZ_ADJACENT_${suffix}`,
      },
    });
    const auditBefore = await prisma.auditEvent.count({
      where: { tenantId: ids.tenantId },
    });
    expect(
      await getCoreAdminCompanyDetail(session, ids.adjacentCompanyId),
    ).toBeNull();
    expect(
      await getCoreAdminLocationDetail(session, ids.adjacentLocationId),
    ).toBeNull();
    expect(
      await getCoreAdminApprovalRuleDetail(session, adjacentRuleId),
    ).toBeNull();

    await prisma.rolePermission.delete({
      where: {
        roleId_permissionId: {
          roleId: ids.roleId,
          permissionId: tenantRoleAdminPermissionId,
        },
      },
    });
    try {
      await expect(
        getCoreAdminPermissionDetail(session, coreAdminPermissionId),
      ).rejects.toThrow("PERMISSION_DENIED");
      expect(
        await prisma.auditEvent.count({ where: { tenantId: ids.tenantId } }),
      ).toBe(auditBefore);
    } finally {
      await prisma.rolePermission.create({
        data: { roleId: ids.roleId, permissionId: tenantRoleAdminPermissionId },
      });
      await prisma.approvalRule.delete({ where: { id: adjacentRuleId } });
    }
  });

  it("AUTHZ-CORE-ADMIN-PERMISSION-DETAIL-EXCLUDES-FOREIGN-TENANT-ROLES", async () => {
    const foreignTenantId = randomUUID();
    const foreignUserId = randomUUID();
    const foreignRoleId = randomUUID();
    const foreignAssignmentId = randomUUID();
    const foreignScopeId = randomUUID();
    const foreignEmail = `authz-admin-foreign-${suffix}@example.test`;
    await prisma.tenant.create({
      data: {
        id: foreignTenantId,
        name: `Foreign Authorization Admin Tenant ${suffix}`,
        loginCode: `authz-admin-foreign-${suffix}`,
      },
    });
    await prisma.user.create({
      data: {
        id: foreignUserId,
        tenantId: foreignTenantId,
        email: foreignEmail,
        displayName: `Foreign Authorization User ${suffix}`,
      },
    });
    await prisma.role.create({
      data: {
        id: foreignRoleId,
        tenantId: foreignTenantId,
        code: `FOREIGN_AUTHZ_ADMIN_${suffix}`,
        name: `Foreign Authorization Role ${suffix}`,
      },
    });
    await prisma.rolePermission.create({
      data: { roleId: foreignRoleId, permissionId: coreAdminPermissionId },
    });
    await prisma.userRoleAssignment.create({
      data: {
        id: foreignAssignmentId,
        userId: foreignUserId,
        roleId: foreignRoleId,
      },
    });
    await prisma.userScopeAssignment.create({
      data: {
        id: foreignScopeId,
        userId: foreignUserId,
        scopeType: "COMPANY",
        scopeId: randomUUID(),
        accessLevel: "MANAGE",
      },
    });

    const auditBefore = await prisma.auditEvent.count({
      where: { tenantId: ids.tenantId },
    });
    try {
      const detail = await getCoreAdminPermissionDetail(
        await getConfiguredContext(actorEmail),
        coreAdminPermissionId,
      );
      expect(detail).not.toBeNull();
      expect(detail?.roles.map((role) => role.id)).not.toContain(foreignRoleId);
      expect(JSON.stringify(detail)).not.toContain(foreignEmail);
      expect(
        await prisma.auditEvent.count({ where: { tenantId: ids.tenantId } }),
      ).toBe(auditBefore);
    } finally {
      await prisma.userScopeAssignment.delete({ where: { id: foreignScopeId } });
      await prisma.userRoleAssignment.delete({
        where: { id: foreignAssignmentId },
      });
      await prisma.rolePermission.deleteMany({ where: { roleId: foreignRoleId } });
      await prisma.role.delete({ where: { id: foreignRoleId } });
    }
  });

  it("AUTHZ-CORE-ADMIN-TENANT-AUDIT-READS-REQUIRE-TENANT-ROLE-PERMISSION", async () => {
    const session = await getConfiguredContext(actorEmail);
    const tenantAuditId = randomUUID();
    await prisma.auditEvent.create({
      data: {
        id: tenantAuditId,
        tenantId: ids.tenantId,
        companyId: null,
        eventType: "authorization.tenant_audit_fixture",
        entityType: "AuthorizationFixture",
        entityId: randomUUID(),
      },
    });
    expect(
      await getCoreAdminAuditEventDetail(session, tenantAuditId),
    ).not.toBeNull();
    expect(
      (
        await listCoreAdminAuditEvents(session, {
          eventType: "authorization.tenant_audit_fixture",
        })
      ).map((event) => event.id),
    ).toContain(tenantAuditId);
    await prisma.rolePermission.delete({
      where: {
        roleId_permissionId: {
          roleId: ids.roleId,
          permissionId: tenantRoleAdminPermissionId,
        },
      },
    });
    try {
      expect(
        await getCoreAdminAuditEventDetail(session, tenantAuditId),
      ).toBeNull();
      expect(
        await listCoreAdminAuditEvents(session, {
          eventType: "authorization.tenant_audit_fixture",
        }),
      ).toEqual([]);
      expect(
        await prisma.auditEvent.findUnique({ where: { id: tenantAuditId } }),
      ).not.toBeNull();
    } finally {
      await prisma.rolePermission.create({
        data: { roleId: ids.roleId, permissionId: tenantRoleAdminPermissionId },
      });
    }
  });

  it("AUTHZ-CORE-ADMIN-ROLE-PERMISSION-SELF-MUTATION-DENIED", async () => {
    configureAuthenticatedRequest({
      sessionToken: actorSessionToken,
      selectedLocationId: ids.locationId,
    });
    const recommendedAssignmentId = randomUUID();
    const enrollmentId = randomUUID();
    await prisma.userRoleAssignment.create({
      data: {
        id: recommendedAssignmentId,
        userId: ids.actorUserId,
        roleId: ids.nonSensitiveRoleId,
      },
    });
    await prisma.privilegedMfaEnrollment.create({
      data: {
        id: enrollmentId,
        tenantId: ids.tenantId,
        companyId: ids.companyId,
        targetUserId: ids.actorUserId,
        providerName: `AUTHZ-SELF-ROLE-${suffix}`,
        status: "VERIFIED",
        evidenceReference: "AUTHZ-SELF-ROLE-EVIDENCE",
        attestationNote: "Verified self-role denial fixture",
        attestedByUserId: ids.targetUserId,
        verifiedByUserId: ids.adjacentUserId,
        verificationNote: "Independent self-role verification fixture",
        verifiedAt: new Date(),
      },
    });
    const [
      manualBefore,
      recommendedBefore,
      actorBefore,
      auditBefore,
      invalidationBefore,
    ] = await Promise.all([
      prisma.rolePermission.findMany({
        where: { roleId: ids.roleId },
        select: { permissionId: true },
        orderBy: { permissionId: "asc" },
      }),
      prisma.rolePermission.findMany({
        where: { roleId: ids.nonSensitiveRoleId },
        select: { permissionId: true },
        orderBy: { permissionId: "asc" },
      }),
      prisma.user.findUniqueOrThrow({
        where: { id: ids.actorUserId },
        select: { privilegeEpoch: true },
      }),
      prisma.auditEvent.count({ where: { tenantId: ids.tenantId } }),
      prisma.authSessionInvalidation.count({
        where: { targetUserId: ids.actorUserId },
      }),
    ]);
    const manualForm = formData({
      roleId: ids.roleId,
      reason: "An administrator must not change their own active role.",
    });
    manualForm.append("permissionCodes", permissions.coreAdminister);
    manualForm.append("permissionCodes", permissions.tenantRoleAdminister);
    manualForm.append("permissionCodes", permissions.purchaseOrderView);
    try {
      await expect(updateRolePermissions(manualForm)).rejects.toThrow(
        "SELF_ROLE_PERMISSION_CHANGE_FORBIDDEN",
      );
      await expect(
        applyRecommendedRolePermissions(
          formData({
            roleId: ids.nonSensitiveRoleId,
            reason:
              "Recommended permissions must not alter an actor's own role.",
          }),
        ),
      ).rejects.toThrow("SELF_ROLE_PERMISSION_CHANGE_FORBIDDEN");
      expect(
        await prisma.rolePermission.findMany({
          where: { roleId: ids.roleId },
          select: { permissionId: true },
          orderBy: { permissionId: "asc" },
        }),
      ).toEqual(manualBefore);
      expect(
        await prisma.rolePermission.findMany({
          where: { roleId: ids.nonSensitiveRoleId },
          select: { permissionId: true },
          orderBy: { permissionId: "asc" },
        }),
      ).toEqual(recommendedBefore);
      expect(
        await prisma.user.findUniqueOrThrow({
          where: { id: ids.actorUserId },
          select: { privilegeEpoch: true },
        }),
      ).toEqual(actorBefore);
      expect(
        await prisma.auditEvent.count({ where: { tenantId: ids.tenantId } }),
      ).toBe(auditBefore);
      expect(
        await prisma.authSessionInvalidation.count({
          where: { targetUserId: ids.actorUserId },
        }),
      ).toBe(invalidationBefore);
    } finally {
      await prisma.userRoleAssignment.deleteMany({
        where: { id: recommendedAssignmentId },
      });
      await prisma.privilegedMfaEnrollment.deleteMany({
        where: { id: enrollmentId },
      });
      clearAuthenticatedRequest();
    }
  });

  it("AUTHZ-CORE-ADMIN-ROLE-PERMISSION-CHANGES-INVALIDATE-ACTIVE-ASSIGNEES", async () => {
    configureAuthenticatedRequest({
      sessionToken: actorSessionToken,
      selectedLocationId: ids.locationId,
    });
    const activeAssignmentId = randomUUID();
    const expiredAssignmentId = randomUUID();
    const enrollmentId = randomUUID();
    await prisma.userRoleAssignment.createMany({
      data: [
        {
          id: activeAssignmentId,
          userId: ids.targetUserId,
          roleId: ids.nonSensitiveRoleId,
        },
        {
          id: expiredAssignmentId,
          userId: ids.adjacentUserId,
          roleId: ids.nonSensitiveRoleId,
          startsAt: new Date(Date.now() - 2 * 24 * 60 * 60_000),
          endsAt: new Date(Date.now() - 24 * 60 * 60_000),
        },
      ],
    });
    await prisma.privilegedMfaEnrollment.create({
      data: {
        id: enrollmentId,
        tenantId: ids.tenantId,
        companyId: ids.companyId,
        targetUserId: ids.actorUserId,
        providerName: `AUTHZ-ROLE-PERMISSION-${suffix}`,
        status: "VERIFIED",
        evidenceReference: "AUTHZ-ROLE-PERMISSION-EVIDENCE",
        attestationNote: "Verified role-permission invalidation fixture",
        attestedByUserId: ids.targetUserId,
        verifiedByUserId: ids.adjacentUserId,
        verificationNote: "Independent verification fixture",
        verifiedAt: new Date(),
      },
    });
    const before = await prisma.user.findMany({
      where: { id: { in: [ids.targetUserId, ids.adjacentUserId] } },
      select: { id: true, privilegeEpoch: true },
    });
    const beforeById = new Map(
      before.map((user) => [user.id, user.privilegeEpoch]),
    );
    const rolePermissionsBefore = await prisma.rolePermission.findMany({
      where: { roleId: ids.nonSensitiveRoleId },
      select: { permissionId: true },
      orderBy: { permissionId: "asc" },
    });
    const denialAuditBefore = await prisma.auditEvent.count({
      where: { tenantId: ids.tenantId },
    });
    const denialInvalidationBefore =
      await prisma.authSessionInvalidation.count({
        where: {
          targetUserId: ids.targetUserId,
          sourceEventType: "role_permissions.changed",
          sourceRecordId: ids.nonSensitiveRoleId,
        },
      });
    try {
      const sensitivePromotionForm = formData({
        roleId: ids.nonSensitiveRoleId,
        reason:
          "An assigned quick role must not gain sensitive approval authority.",
      });
      sensitivePromotionForm.append(
        "permissionCodes",
        permissions.purchaseOrderApprove,
      );
      await expect(
        updateRolePermissions(sensitivePromotionForm),
      ).rejects.toThrow("ASSIGNED_ROLE_SENSITIVE_PERMISSION_CHANGE_BLOCKED");
      expect(
        await prisma.rolePermission.findMany({
          where: { roleId: ids.nonSensitiveRoleId },
          select: { permissionId: true },
          orderBy: { permissionId: "asc" },
        }),
      ).toEqual(rolePermissionsBefore);
      expect(
        await prisma.user.findUniqueOrThrow({
          where: { id: ids.targetUserId },
          select: { privilegeEpoch: true },
        }),
      ).toEqual({ privilegeEpoch: beforeById.get(ids.targetUserId) });
      expect(
        await prisma.auditEvent.count({ where: { tenantId: ids.tenantId } }),
      ).toBe(denialAuditBefore);
      expect(
        await prisma.authSessionInvalidation.count({
          where: {
            targetUserId: ids.targetUserId,
            sourceEventType: "role_permissions.changed",
            sourceRecordId: ids.nonSensitiveRoleId,
          },
        }),
      ).toBe(denialInvalidationBefore);

      const manualForm = formData({
        roleId: ids.nonSensitiveRoleId,
        reason: "Verify manual role-permission session invalidation.",
      });
      manualForm.append("permissionCodes", permissions.purchaseOrderView);
      await updateRolePermissions(manualForm);

      expect(
        await prisma.user.findUniqueOrThrow({
          where: { id: ids.targetUserId },
          select: { privilegeEpoch: true },
        }),
      ).toEqual({
        privilegeEpoch: (beforeById.get(ids.targetUserId) ?? 0) + 1,
      });
      expect(
        await prisma.user.findUniqueOrThrow({
          where: { id: ids.adjacentUserId },
          select: { privilegeEpoch: true },
        }),
      ).toEqual({ privilegeEpoch: beforeById.get(ids.adjacentUserId) });

      await expect(
        applyRecommendedRolePermissions(
          formData({
            roleId: ids.nonSensitiveRoleId,
            reason:
              "Recommended sensitive authority must not reach an active assignee.",
          }),
        ),
      ).rejects.toThrow("ASSIGNED_ROLE_SENSITIVE_PERMISSION_CHANGE_BLOCKED");
      expect(
        await prisma.user.findUniqueOrThrow({
          where: { id: ids.targetUserId },
          select: { privilegeEpoch: true },
        }),
      ).toEqual({
        privilegeEpoch: (beforeById.get(ids.targetUserId) ?? 0) + 1,
      });
      expect(
        await prisma.authSessionInvalidation.count({
          where: {
            targetUserId: ids.targetUserId,
            sourceEventType: "role_permissions.changed",
            sourceRecordId: ids.nonSensitiveRoleId,
          },
        }),
      ).toBe(1);
      expect(
        await prisma.authSessionInvalidation.count({
          where: {
            targetUserId: ids.adjacentUserId,
            sourceEventType: "role_permissions.changed",
            sourceRecordId: ids.nonSensitiveRoleId,
          },
        }),
      ).toBe(0);
    } finally {
      await prisma.userRoleAssignment.deleteMany({
        where: { id: { in: [activeAssignmentId, expiredAssignmentId] } },
      });
      await prisma.rolePermission.deleteMany({
        where: { roleId: ids.nonSensitiveRoleId },
      });
      await prisma.authSessionInvalidation.deleteMany({
        where: {
          targetUserId: ids.targetUserId,
          sourceEventType: "role_permissions.changed",
          sourceRecordId: ids.nonSensitiveRoleId,
        },
      });
      await prisma.privilegedMfaEnrollment.deleteMany({
        where: { id: enrollmentId },
      });
      clearAuthenticatedRequest();
    }
  });

  it("AUTHZ-CORE-ADMIN-CONCURRENT-DIRECT-ROLE-GRANT-CREATES-EXACTLY-ONE", async () => {
    configureAuthenticatedRequest({
      sessionToken: actorSessionToken,
      selectedLocationId: ids.locationId,
    });
    const assignmentAuditBefore = await prisma.auditEvent.count({
      where: {
        tenantId: ids.tenantId,
        eventType: "user_role_assignment.created",
      },
    });
    const makeGrantForm = () =>
      formData({
        targetUserId: ids.targetUserId,
        roleId: ids.nonSensitiveRoleId,
        reason: "Concurrent direct grants must serialize to one assignment.",
      });
    const results = await Promise.allSettled([
      createUserRoleAssignment(makeGrantForm()),
      createUserRoleAssignment(makeGrantForm()),
    ]);
    const activeAssignments = await prisma.userRoleAssignment.findMany({
      where: {
        userId: ids.targetUserId,
        roleId: ids.nonSensitiveRoleId,
        status: "ACTIVE",
      },
      select: { id: true },
    });
    try {
      expect(
        results.filter((result) => result.status === "fulfilled"),
      ).toHaveLength(1);
      expect(
        results.filter((result) => result.status === "rejected"),
      ).toHaveLength(1);
      expect(
        results.find((result) => result.status === "rejected")?.reason,
      ).toMatchObject({ message: "DUPLICATE_ACTIVE_ROLE_ASSIGNMENT" });
      expect(activeAssignments).toHaveLength(1);
      expect(
        await prisma.auditEvent.count({
          where: {
            tenantId: ids.tenantId,
            eventType: "user_role_assignment.created",
          },
        }),
      ).toBe(assignmentAuditBefore + 1);
      expect(
        await prisma.authSessionInvalidation.count({
          where: {
            targetUserId: ids.targetUserId,
            sourceEventType: "user_role_assignment.created",
            sourceRecordId: activeAssignments[0]?.id,
          },
        }),
      ).toBe(1);
    } finally {
      await prisma.authSessionInvalidation.deleteMany({
        where: {
          sourceRecordId: { in: activeAssignments.map(({ id }) => id) },
        },
      });
      await prisma.userRoleAssignment.deleteMany({
        where: { id: { in: activeAssignments.map(({ id }) => id) } },
      });
      clearAuthenticatedRequest();
    }
  });

  it("AUTHZ-CORE-ADMIN-CONCURRENT-DIRECT-GRANT-AND-SENSITIVE-PROMOTION-PRESERVES-SEPARATION", async () => {
    configureAuthenticatedRequest({
      sessionToken: actorSessionToken,
      selectedLocationId: ids.locationId,
    });
    const roleId = randomUUID();
    const enrollmentId = randomUUID();
    await prisma.role.create({
      data: {
        id: roleId,
        tenantId: ids.tenantId,
        code: `AUTHZ_CONCURRENT_PROMOTION_${suffix}`,
        name: `Authorization Concurrent Promotion ${suffix}`,
      },
    });
    await prisma.privilegedMfaEnrollment.create({
      data: {
        id: enrollmentId,
        tenantId: ids.tenantId,
        companyId: ids.companyId,
        targetUserId: ids.actorUserId,
        providerName: `AUTHZ-CONCURRENT-PROMOTION-${suffix}`,
        status: "VERIFIED",
        evidenceReference: "AUTHZ-CONCURRENT-PROMOTION-EVIDENCE",
        attestationNote: "Verified concurrent promotion fixture",
        attestedByUserId: ids.targetUserId,
        verifiedByUserId: ids.adjacentUserId,
        verificationNote: "Independent concurrent promotion verification",
        verifiedAt: new Date(),
      },
    });
    const grantForm = formData({
      targetUserId: ids.targetUserId,
      roleId,
      reason: "Race a direct grant against sensitive role promotion.",
    });
    const promotionForm = formData({
      roleId,
      reason: "Race sensitive role promotion against a direct grant.",
    });
    promotionForm.append(
      "permissionCodes",
      permissions.purchaseOrderApprove,
    );

    try {
      const results = await Promise.allSettled([
        createUserRoleAssignment(grantForm),
        updateRolePermissions(promotionForm),
      ]);
      expect(
        results.filter((result) => result.status === "fulfilled"),
      ).toHaveLength(1);
      expect(
        results.filter((result) => result.status === "rejected"),
      ).toHaveLength(1);

      const [activeAssignment, sensitivePermission] = await Promise.all([
        prisma.userRoleAssignment.findFirst({
          where: {
            userId: ids.targetUserId,
            roleId,
            status: "ACTIVE",
          },
          select: { id: true },
        }),
        prisma.rolePermission.findFirst({
          where: {
            roleId,
            permission: { code: permissions.purchaseOrderApprove },
          },
          select: { permissionId: true },
        }),
      ]);
      expect(Boolean(activeAssignment) && Boolean(sensitivePermission)).toBe(
        false,
      );
      expect(
        results.find((result) => result.status === "rejected")?.reason,
      ).toMatchObject({
        message: expect.stringMatching(
          /SENSITIVE_ROLE_ASSIGNMENT_BLOCKED|ASSIGNED_ROLE_SENSITIVE_PERMISSION_CHANGE_BLOCKED/,
        ),
      });
    } finally {
      const assignments = await prisma.userRoleAssignment.findMany({
        where: { roleId },
        select: { id: true },
      });
      await prisma.authSessionInvalidation.deleteMany({
        where: {
          sourceRecordId: { in: assignments.map((assignment) => assignment.id) },
        },
      });
      await prisma.userRoleAssignment.deleteMany({ where: { roleId } });
      await prisma.rolePermission.deleteMany({ where: { roleId } });
      await prisma.role.delete({ where: { id: roleId } });
      await prisma.privilegedMfaEnrollment.delete({
        where: { id: enrollmentId },
      });
      clearAuthenticatedRequest();
    }
  });

  it("AUTHZ-CORE-ADMIN-CONCURRENT-SENSITIVE-APPROVAL-AND-PERMISSION-PROMOTION-PRESERVES-REVIEW", async () => {
    configureAuthenticatedRequest({
      sessionToken: actorSessionToken,
      selectedLocationId: ids.locationId,
    });
    const roleId = randomUUID();
    const requestId = randomUUID();
    const enrollmentId = randomUUID();
    const initialPermission = await prisma.permission.findUniqueOrThrow({
      where: { code: permissions.purchaseOrderApprove },
      select: { id: true },
    });
    const promotedPermission = await prisma.permission.findUniqueOrThrow({
      where: { code: permissions.purchaseOrderIssue },
      select: { id: true },
    });
    const targetBefore = await prisma.user.findUniqueOrThrow({
      where: { id: ids.targetUserId },
      select: { privilegeEpoch: true },
    });
    await prisma.role.create({
      data: {
        id: roleId,
        tenantId: ids.tenantId,
        code: `AUTHZ_CONCURRENT_SENSITIVE_APPROVAL_${suffix}`,
        name: `Authorization Concurrent Sensitive Approval ${suffix}`,
      },
    });
    await prisma.rolePermission.create({
      data: { roleId, permissionId: initialPermission.id },
    });
    await prisma.sensitiveRoleRequest.create({
      data: {
        id: requestId,
        tenantId: ids.tenantId,
        companyId: ids.companyId,
        targetUserId: ids.targetUserId,
        roleId,
        reason: "Concurrent sensitive-role approval authorization fixture",
        evidenceReference: "AUTHZ-CONCURRENT-SENSITIVE-REVIEW-EVIDENCE",
        requestedByUserId: ids.adjacentUserId,
      },
    });
    await prisma.privilegedMfaEnrollment.create({
      data: {
        id: enrollmentId,
        tenantId: ids.tenantId,
        companyId: ids.companyId,
        targetUserId: ids.actorUserId,
        providerName: `AUTHZ-CONCURRENT-SENSITIVE-REVIEW-${suffix}`,
        status: "VERIFIED",
        evidenceReference: "AUTHZ-CONCURRENT-SENSITIVE-REVIEW-EVIDENCE",
        attestationNote: "Verified concurrent sensitive review fixture",
        attestedByUserId: ids.targetUserId,
        verifiedByUserId: ids.adjacentUserId,
        verificationNote: "Independent concurrent review verification",
        verifiedAt: new Date(),
      },
    });
    const approvalForm = formData({
      requestId,
      targetUserId: ids.targetUserId,
      reviewReason: "Approve only the permissions presented for review.",
    });
    const promotionForm = formData({
      roleId,
      reason: "A pending controlled grant must freeze role permissions.",
    });
    promotionForm.append("permissionCodes", permissions.purchaseOrderApprove);
    promotionForm.append("permissionCodes", permissions.purchaseOrderIssue);

    let assignments: Array<{ id: string }> = [];
    try {
      const [approvalResult, promotionResult] = await Promise.allSettled([
        approveSensitiveUserRoleRequest(approvalForm),
        updateRolePermissions(promotionForm),
      ]);
      assignments = await prisma.userRoleAssignment.findMany({
        where: {
          userId: ids.targetUserId,
          roleId,
          status: "ACTIVE",
        },
        select: { id: true },
      });
      expect(approvalResult.status).toBe("fulfilled");
      expect(promotionResult.status).toBe("rejected");
      if (promotionResult.status === "rejected") {
        expect(promotionResult.reason).toMatchObject({
          message: expect.stringMatching(
            /PENDING_SENSITIVE_ROLE_REQUEST_PERMISSION_CHANGE_BLOCKED|ASSIGNED_ROLE_SENSITIVE_PERMISSION_CHANGE_BLOCKED/,
          ),
        });
      }
      expect(assignments).toHaveLength(1);
      expect(
        await prisma.rolePermission.findUnique({
          where: {
            roleId_permissionId: {
              roleId,
              permissionId: promotedPermission.id,
            },
          },
        }),
      ).toBeNull();
      const currentPermissionCodes = (
        await prisma.rolePermission.findMany({
          where: { roleId },
          select: { permission: { select: { code: true } } },
        })
      )
        .map((row) => row.permission.code)
        .sort();
      const approvalAudit = await prisma.auditEvent.findFirstOrThrow({
        where: {
          tenantId: ids.tenantId,
          entityId: requestId,
          eventType: "sensitive_role_request.approved",
        },
        select: { metadata: true },
      });
      expect(approvalAudit.metadata).toMatchObject({
        permissionCodes: currentPermissionCodes,
      });
      expect(currentPermissionCodes).toEqual([
        permissions.purchaseOrderApprove,
      ]);
    } finally {
      await prisma.authSessionInvalidation.deleteMany({
        where: { sourceRecordId: requestId },
      });
      await prisma.userRoleAssignment.deleteMany({ where: { roleId } });
      await prisma.sensitiveRoleRequest.deleteMany({ where: { id: requestId } });
      await prisma.rolePermission.deleteMany({ where: { roleId } });
      await prisma.role.deleteMany({ where: { id: roleId } });
      await prisma.privilegedMfaEnrollment.deleteMany({
        where: { id: enrollmentId },
      });
      await prisma.user.update({
        where: { id: ids.targetUserId },
        data: { privilegeEpoch: targetBefore.privilegeEpoch },
      });
      clearAuthenticatedRequest();
    }
  });

  it("AUTHZ-CORE-ADMIN-CONCURRENT-SENSITIVE-ROLE-REQUEST-CREATES-EXACTLY-ONE", async () => {
    configureAuthenticatedRequest({
      sessionToken: actorSessionToken,
      selectedLocationId: ids.locationId,
    });
    const enrollmentId = randomUUID();
    const requestTargetUserId = randomUUID();
    const requestTargetScopeId = randomUUID();
    await prisma.user.create({
      data: {
        id: requestTargetUserId,
        tenantId: ids.tenantId,
        email: `authz-concurrent-request-${suffix}@example.test`,
        displayName: `Concurrent Request Target ${suffix}`,
      },
    });
    await prisma.userScopeAssignment.create({
      data: {
        id: requestTargetScopeId,
        userId: requestTargetUserId,
        scopeType: "LOCATION",
        scopeId: ids.locationId,
        accessLevel: "OPERATE",
      },
    });
    await prisma.privilegedMfaEnrollment.create({
      data: {
        id: enrollmentId,
        tenantId: ids.tenantId,
        companyId: ids.companyId,
        targetUserId: ids.actorUserId,
        providerName: `AUTHZ-CONCURRENT-REQUEST-${suffix}`,
        status: "VERIFIED",
        evidenceReference: "AUTHZ-CONCURRENT-REQUEST-EVIDENCE",
        attestationNote: "Concurrent sensitive-role request MFA fixture",
        attestedByUserId: ids.targetUserId,
        verifiedByUserId: ids.adjacentUserId,
        verificationNote: "Independent concurrent request verification",
        verifiedAt: new Date(),
      },
    });
    const makeRequestForm = () =>
      formData({
        targetUserId: requestTargetUserId,
        roleId: ids.roleId,
        reason:
          "Concurrent sensitive-role requests must create one pending request.",
        evidenceReference: "AUTHZ-CONCURRENT-REQUEST-EVIDENCE",
      });
    let requests: Array<{ id: string }> = [];
    try {
      const results = await Promise.allSettled([
        requestSensitiveUserRole(makeRequestForm()),
        requestSensitiveUserRole(makeRequestForm()),
      ]);
      requests = await prisma.sensitiveRoleRequest.findMany({
        where: {
          tenantId: ids.tenantId,
          companyId: ids.companyId,
          targetUserId: requestTargetUserId,
          roleId: ids.roleId,
          status: "PENDING",
          evidenceReference: "AUTHZ-CONCURRENT-REQUEST-EVIDENCE",
        },
        select: { id: true },
      });
      expect(
        results.filter((result) => result.status === "fulfilled"),
      ).toHaveLength(1);
      expect(
        results.filter((result) => result.status === "rejected"),
      ).toHaveLength(1);
      expect(
        results.find((result) => result.status === "rejected")?.reason,
      ).toMatchObject({ message: "DUPLICATE_PENDING_SENSITIVE_ROLE_REQUEST" });
      expect(requests).toHaveLength(1);
      expect(
        await prisma.auditEvent.count({
          where: {
            tenantId: ids.tenantId,
            entityId: requests[0]?.id,
            eventType: "sensitive_role_request.created",
          },
        }),
      ).toBe(1);
    } finally {
      await prisma.sensitiveRoleRequest.deleteMany({
        where: { id: { in: requests.map(({ id }) => id) } },
      });
      await prisma.privilegedMfaEnrollment.deleteMany({
        where: { id: enrollmentId },
      });
      await prisma.userScopeAssignment.deleteMany({
        where: { id: requestTargetScopeId },
      });
      clearAuthenticatedRequest();
    }
  });

  it("AUTHZ-CORE-ADMIN-CONCURRENT-ROLE-DEACTIVATION-MUTATES-EXACTLY-ONCE", async () => {
    configureAuthenticatedRequest({
      sessionToken: actorSessionToken,
      selectedLocationId: ids.locationId,
    });
    const assignmentId = randomUUID();
    await prisma.userRoleAssignment.create({
      data: {
        id: assignmentId,
        userId: ids.targetUserId,
        roleId: ids.roleId,
      },
    });
    const targetBefore = await prisma.user.findUniqueOrThrow({
      where: { id: ids.targetUserId },
      select: { privilegeEpoch: true },
    });
    const makeDeactivationForm = () =>
      formData({
        targetUserId: ids.targetUserId,
        assignmentId,
        reason:
          "Concurrent deactivation must claim the active assignment once.",
      });
    try {
      const results = await Promise.allSettled([
        deactivateUserRoleAssignment(makeDeactivationForm()),
        deactivateUserRoleAssignment(makeDeactivationForm()),
      ]);
      expect(
        results.filter((result) => result.status === "fulfilled"),
      ).toHaveLength(1);
      expect(
        results.filter((result) => result.status === "rejected"),
      ).toHaveLength(1);
      expect(
        results.find((result) => result.status === "rejected")?.reason,
      ).toMatchObject({ message: "ROLE_ASSIGNMENT_NOT_FOUND" });
      expect(
        await prisma.userRoleAssignment.findUniqueOrThrow({
          where: { id: assignmentId },
          select: { status: true, endsAt: true },
        }),
      ).toMatchObject({ status: "INACTIVE", endsAt: expect.any(Date) });
      expect(
        await prisma.user.findUniqueOrThrow({
          where: { id: ids.targetUserId },
          select: { privilegeEpoch: true },
        }),
      ).toEqual({ privilegeEpoch: targetBefore.privilegeEpoch + 1 });
      expect(
        await prisma.authSessionInvalidation.count({
          where: {
            targetUserId: ids.targetUserId,
            sourceEventType: "user_role_assignment.deactivated",
            sourceRecordId: assignmentId,
          },
        }),
      ).toBe(1);
      expect(
        await prisma.auditEvent.count({
          where: {
            tenantId: ids.tenantId,
            entityId: assignmentId,
            eventType: "user_role_assignment.deactivated",
          },
        }),
      ).toBe(1);
    } finally {
      await prisma.authSessionInvalidation.deleteMany({
        where: {
          targetUserId: ids.targetUserId,
          sourceEventType: "user_role_assignment.deactivated",
          sourceRecordId: assignmentId,
        },
      });
      await prisma.userRoleAssignment.deleteMany({
        where: { id: assignmentId },
      });
      await prisma.user.update({
        where: { id: ids.targetUserId },
        data: { privilegeEpoch: targetBefore.privilegeEpoch },
      });
      clearAuthenticatedRequest();
    }
  });

  it("AUTHZ-CORE-ADMIN-CONCURRENT-SENSITIVE-ROLE-APPROVAL-CAS-CREATES-EXACTLY-ONE", async () => {
    configureAuthenticatedRequest({
      sessionToken: actorSessionToken,
      selectedLocationId: ids.locationId,
    });
    const requestId = randomUUID();
    const enrollmentId = randomUUID();
    await prisma.sensitiveRoleRequest.create({
      data: {
        id: requestId,
        tenantId: ids.tenantId,
        companyId: ids.companyId,
        targetUserId: ids.targetUserId,
        roleId: ids.roleId,
        reason: "Concurrent approval authorization fixture",
        evidenceReference: "AUTHZ-CONCURRENT-APPROVAL-EVIDENCE",
        requestedByUserId: ids.adjacentUserId,
      },
    });
    await prisma.privilegedMfaEnrollment.create({
      data: {
        id: enrollmentId,
        tenantId: ids.tenantId,
        companyId: ids.companyId,
        targetUserId: ids.actorUserId,
        providerName: `AUTHZ-CONCURRENT-APPROVAL-${suffix}`,
        status: "VERIFIED",
        evidenceReference: "AUTHZ-CONCURRENT-APPROVAL-EVIDENCE",
        attestationNote: "Concurrent approval MFA fixture",
        attestedByUserId: ids.targetUserId,
        verifiedByUserId: ids.adjacentUserId,
        verificationNote: "Independent concurrent approval verification",
        verifiedAt: new Date(),
      },
    });
    const makeReviewForm = () =>
      formData({
        requestId,
        targetUserId: ids.targetUserId,
        reviewReason: "Concurrent review must claim the pending request once.",
      });
    const results = await Promise.allSettled([
      approveSensitiveUserRoleRequest(makeReviewForm()),
      approveSensitiveUserRoleRequest(makeReviewForm()),
    ]);
    const assignments = await prisma.userRoleAssignment.findMany({
      where: {
        userId: ids.targetUserId,
        roleId: ids.roleId,
        status: "ACTIVE",
      },
      select: { id: true },
    });
    try {
      expect(
        results.filter((result) => result.status === "fulfilled"),
      ).toHaveLength(1);
      expect(
        results.filter((result) => result.status === "rejected"),
      ).toHaveLength(1);
      expect(
        results.find((result) => result.status === "rejected")?.reason,
      ).toMatchObject({ message: "SENSITIVE_ROLE_REQUEST_NOT_FOUND" });
      expect(assignments).toHaveLength(1);
      expect(
        await prisma.sensitiveRoleRequest.findUniqueOrThrow({
          where: { id: requestId },
          select: { status: true },
        }),
      ).toEqual({ status: "APPROVED" });
      expect(
        await prisma.auditEvent.count({
          where: {
            tenantId: ids.tenantId,
            entityId: requestId,
            eventType: "sensitive_role_request.approved",
          },
        }),
      ).toBe(1);
    } finally {
      await prisma.authSessionInvalidation.deleteMany({
        where: { sourceRecordId: requestId },
      });
      await prisma.userRoleAssignment.deleteMany({
        where: { id: { in: assignments.map(({ id }) => id) } },
      });
      await prisma.sensitiveRoleRequest.deleteMany({
        where: { id: requestId },
      });
      await prisma.privilegedMfaEnrollment.deleteMany({
        where: { id: enrollmentId },
      });
      clearAuthenticatedRequest();
    }
  });

  it("AUTHZ-CORE-ADMIN-ROLE-TARGET-COMPANY-AND-EXPIRY-DENIED-NO-MUTATION", async () => {
    configureAuthenticatedRequest({
      sessionToken: actorSessionToken,
      selectedLocationId: ids.locationId,
    });
    const before = {
      assignments: await prisma.userRoleAssignment.count({
        where: { userId: { in: [ids.targetUserId, ids.adjacentUserId] } },
      }),
      requests: await prisma.sensitiveRoleRequest.count({
        where: { tenantId: ids.tenantId },
      }),
    };
    await prisma.userRoleAssignment.create({
      data: {
        id: ids.crossCompanyRoleAssignmentId,
        userId: ids.adjacentUserId,
        roleId: ids.nonSensitiveRoleId,
      },
    });
    await prisma.sensitiveRoleRequest.create({
      data: {
        id: ids.crossCompanySensitiveRequestId,
        tenantId: ids.tenantId,
        companyId: ids.companyId,
        targetUserId: ids.adjacentUserId,
        roleId: ids.roleId,
        requestedByUserId: ids.targetUserId,
        reason: "Legacy cross-company request fixture",
        evidenceReference: "AUTHZ-TARGET-SCOPE-EVIDENCE",
      },
    });
    const quickGrant = (targetUserId: string) =>
      formData({
        targetUserId,
        roleId: ids.nonSensitiveRoleId,
        reason:
          "Target must have an active membership in the selected company.",
      });
    const sensitiveRequest = (targetUserId: string) =>
      formData({
        targetUserId,
        roleId: ids.roleId,
        reason:
          "Target must have an active membership in the selected company.",
        evidenceReference: "AUTHZ-TARGET-SCOPE-EVIDENCE",
      });

    await expect(
      createUserRoleAssignment(quickGrant(ids.adjacentUserId)),
    ).rejects.toThrow("TARGET_USER_NOT_FOUND");
    await expect(
      requestSensitiveUserRole(sensitiveRequest(ids.adjacentUserId)),
    ).rejects.toThrow("TARGET_USER_NOT_FOUND");
    await expect(
      deactivateUserRoleAssignment(
        formData({
          targetUserId: ids.adjacentUserId,
          assignmentId: ids.crossCompanyRoleAssignmentId,
          reason: "Cross-company role deactivation must be denied.",
        }),
      ),
    ).rejects.toThrow("TARGET_USER_NOT_FOUND");
    await expect(
      rejectSensitiveUserRoleRequest(
        formData({
          requestId: ids.crossCompanySensitiveRequestId,
          targetUserId: ids.adjacentUserId,
          reviewReason: "Cross-company role request review must be denied.",
        }),
      ),
    ).rejects.toThrow("TARGET_USER_NOT_FOUND");

    await prisma.userScopeAssignment.update({
      where: { id: ids.targetScopeId },
      data: { endsAt: new Date(Date.now() - 60_000) },
    });
    try {
      await expect(
        createUserRoleAssignment(quickGrant(ids.targetUserId)),
      ).rejects.toThrow("TARGET_USER_NOT_FOUND");
      await expect(
        requestSensitiveUserRole(sensitiveRequest(ids.targetUserId)),
      ).rejects.toThrow("TARGET_USER_NOT_FOUND");
    } finally {
      await prisma.userScopeAssignment.update({
        where: { id: ids.targetScopeId },
        data: { endsAt: null },
      });
      clearAuthenticatedRequest();
    }
    await prisma.sensitiveRoleRequest.delete({
      where: { id: ids.crossCompanySensitiveRequestId },
    });
    await prisma.userRoleAssignment.delete({
      where: { id: ids.crossCompanyRoleAssignmentId },
    });
    expect({
      assignments: await prisma.userRoleAssignment.count({
        where: { userId: { in: [ids.targetUserId, ids.adjacentUserId] } },
      }),
      requests: await prisma.sensitiveRoleRequest.count({
        where: { tenantId: ids.tenantId },
      }),
    }).toEqual(before);
  });

  it("AUTHZ-AUTH-SESSION-AND-MFA-OWNER-NON-ENUMERATION-NO-MUTATION", async () => {
    configureAuthenticatedRequest({
      sessionToken: actorSessionToken,
      selectedLocationId: ids.locationId,
    });
    const actorSessionBefore = await prisma.authSession.findUniqueOrThrow({
      where: { id: ids.authSessionId },
    });
    const adjacentSessionBefore = await prisma.authSession.findUniqueOrThrow({
      where: { id: ids.adjacentAuthSessionId },
    });
    await expect(revokeOwnSession(ids.adjacentAuthSessionId)).rejects.toThrow(
      "AUTH_SESSION_NOT_FOUND",
    );
    await expect(completeMfaChallenge("000000")).rejects.toThrow(
      "MFA_CHALLENGE_NOT_FOUND",
    );
    await expect(
      completeMfaEnrollment({ authenticatorId: randomUUID(), code: "000000" }),
    ).rejects.toThrow("MFA_ENROLLMENT_NOT_FOUND");
    expect(
      await prisma.authSession.findUniqueOrThrow({
        where: { id: ids.authSessionId },
      }),
    ).toEqual(actorSessionBefore);
    expect(
      await prisma.authSession.findUniqueOrThrow({
        where: { id: ids.adjacentAuthSessionId },
      }),
    ).toEqual(adjacentSessionBefore);
    clearAuthenticatedRequest();
  });

  it("AUTHZ-AUTH-PUBLIC-BOUNDARY-TARGET-STATE-AND-SELF-SESSION-CONTROLS", async () => {
    configureAuthenticatedRequest({
      sessionToken: actorSessionToken,
      selectedLocationId: ids.locationId,
    });
    const tokenCount = await prisma.authActivationToken.count({
      where: { tenantId: ids.tenantId },
    });
    const principal = await getValidatedSessionPrincipal();
    expect(principal?.userId).toBe(ids.actorUserId);
    await expect(
      authenticatePassword({
        tenantCode: `missing-${suffix}`,
        identifier: `missing-${suffix}@example.test`,
        password: "InvalidPassword-123",
        fingerprint: { sourceAddress: "127.0.0.1", userAgent: "authz-test" },
      }),
    ).rejects.toThrow("LOGIN_CREDENTIALS_INVALID");
    await expect(
      activateAccount({
        token: `missing-${suffix}`,
        password: "ValidPassword-123",
        passwordConfirmation: "ValidPassword-123",
        fingerprint: { sourceAddress: "127.0.0.1", userAgent: "authz-test" },
      }),
    ).rejects.toThrow("AUTH_ACTIVATION_INVALID");
    await expect(
      deliverAccountActivation({
        activationTokenId: randomUUID(),
        token: "missing",
      }),
    ).rejects.toThrow("AUTH_ACTIVATION_DELIVERY_NOT_AVAILABLE");
    await expect(beginMfaStepUp()).rejects.toThrow(
      "MFA_AUTHENTICATOR_NOT_FOUND",
    );

    const authenticatorId = randomUUID();
    await prisma.mfaAuthenticator.create({
      data: {
        id: authenticatorId,
        tenantId: ids.tenantId,
        userId: ids.actorUserId,
        label: "Authorization active authenticator fixture",
        status: "ACTIVE",
        encryptedSecret: "not-read-by-this-test",
        secretIv: "not-read-by-this-test",
        secretAuthTag: "not-read-by-this-test",
        verifiedAt: new Date(),
      },
    });
    try {
      await expect(startMfaEnrollment()).rejects.toThrow(
        "MFA_AUTHENTICATOR_ALREADY_ACTIVE",
      );
    } finally {
      await prisma.mfaAuthenticator.delete({ where: { id: authenticatorId } });
    }
    expect(
      await prisma.authActivationToken.count({
        where: { tenantId: ids.tenantId },
      }),
    ).toBe(tokenCount);

    await signOutCurrentSession();
    expect(
      await prisma.authSession.findUniqueOrThrow({
        where: { id: ids.authSessionId },
      }),
    ).toMatchObject({ status: "REVOKED" });
    await prisma.authSession.update({
      where: { id: ids.authSessionId },
      data: { status: "ACTIVE", revokedAt: null, revocationReason: null },
    });
    await clearAuthenticationCookies();
    clearAuthenticatedRequest();
  });

  it("AUTHZ-ADMIN-SESSION-REVOCATION-CALLER-CHAIN-SUCCESS", async () => {
    configureAuthenticatedRequest({
      sessionToken: actorSessionToken,
      selectedLocationId: ids.locationId,
    });
    const session = await requireSessionContext();
    const targetBefore = await prisma.user.findUniqueOrThrow({
      where: { id: ids.targetUserId },
      select: { privilegeEpoch: true },
    });
    const enrollment = await prisma.privilegedMfaEnrollment.create({
      data: {
        tenantId: ids.tenantId,
        companyId: ids.companyId,
        targetUserId: ids.actorUserId,
        providerName: `AUTHZ-VERIFIED-${suffix}`,
        status: "VERIFIED",
        evidenceReference: "AUTHZ-VERIFIED-EVIDENCE",
        attestationNote: "Verified privileged-MFA caller-chain fixture",
        attestedByUserId: ids.targetUserId,
        verifiedByUserId: ids.adjacentUserId,
        verificationNote: "Independent verification fixture",
        verifiedAt: new Date(),
      },
    });
    await prisma.authSession.create({
      data: {
        id: ids.targetRevocationSessionId,
        tenantId: ids.tenantId,
        userId: ids.targetUserId,
        tokenHash: authenticationSessionTokenHash(`target-revoke-${suffix}`),
        status: "ACTIVE",
        assuranceLevel: "PASSWORD",
        privilegeEpochAtIssue: targetBefore.privilegeEpoch,
        idleExpiresAt: new Date(Date.now() + 60 * 60_000),
        absoluteExpiresAt: new Date(Date.now() + 4 * 60 * 60_000),
      },
    });
    try {
      await revokeAuthenticationSessions(
        session,
        formData({ targetUserId: ids.targetUserId }),
      );
      expect(
        await prisma.authSession.findUniqueOrThrow({
          where: { id: ids.targetRevocationSessionId },
          select: { status: true },
        }),
      ).toEqual({ status: "REVOKED" });
      expect(
        await prisma.authSessionInvalidation.count({
          where: {
            tenantId: ids.tenantId,
            companyId: ids.companyId,
            targetUserId: ids.targetUserId,
            sourceEventType: "auth.sessions.admin_revoked",
          },
        }),
      ).toBe(1);
      expect(
        await prisma.user.findUniqueOrThrow({
          where: { id: ids.targetUserId },
          select: { privilegeEpoch: true },
        }),
      ).toEqual({ privilegeEpoch: targetBefore.privilegeEpoch + 1 });
    } finally {
      await prisma.authSessionInvalidation.deleteMany({
        where: { tenantId: ids.tenantId, targetUserId: ids.targetUserId },
      });
      await prisma.authSession.deleteMany({
        where: { id: ids.targetRevocationSessionId },
      });
      await prisma.privilegedMfaEnrollment.delete({
        where: { id: enrollment.id },
      });
      await prisma.user.update({
        where: { id: ids.targetUserId },
        data: { privilegeEpoch: targetBefore.privilegeEpoch },
      });
      clearAuthenticatedRequest();
    }
  });

  it("AUTHZ-ADMIN-SOD-SELF-REVIEW-AND-LIFECYCLE-DENIAL-NO-MUTATION", async () => {
    configureAuthenticatedRequest({
      sessionToken: actorSessionToken,
      selectedLocationId: ids.locationId,
    });
    const session = await getConfiguredContext(actorEmail);
    await prisma.authRecoveryRequest.create({
      data: {
        id: ids.authRecoveryId,
        tenantId: ids.tenantId,
        companyId: ids.companyId,
        targetUserId: ids.targetUserId,
        requestedByUserId: ids.actorUserId,
        reason: "Self-review authorization fixture",
        evidenceReference: "AUTHZ-EVIDENCE",
      },
    });
    await prisma.breakGlassAccessGrant.create({
      data: {
        id: ids.breakGlassGrantId,
        tenantId: ids.tenantId,
        companyId: ids.companyId,
        targetUserId: ids.targetUserId,
        locationId: ids.locationId,
        accessLevel: "MANAGE",
        reason: "Self-review authorization fixture",
        evidenceReference: "AUTHZ-EVIDENCE",
        requestedUntil: new Date(Date.now() + 60 * 60_000),
        requestedByUserId: ids.actorUserId,
      },
    });
    await prisma.privilegedMfaEnrollment.create({
      data: {
        id: ids.privilegedMfaEnrollmentId,
        tenantId: ids.tenantId,
        companyId: ids.companyId,
        targetUserId: ids.actorUserId,
        providerName: `AUTHZ-${suffix}`,
        evidenceReference: "AUTHZ-EVIDENCE",
        attestationNote: "Self-review authorization fixture",
        attestedByUserId: ids.targetUserId,
      },
    });
    const recoveryBefore = await prisma.authRecoveryRequest.findUniqueOrThrow({
      where: { id: ids.authRecoveryId },
    });
    const breakGlassBefore =
      await prisma.breakGlassAccessGrant.findUniqueOrThrow({
        where: { id: ids.breakGlassGrantId },
      });
    const enrollmentBefore =
      await prisma.privilegedMfaEnrollment.findUniqueOrThrow({
        where: { id: ids.privilegedMfaEnrollmentId },
      });

    const recoveryReview = formData({
      requestId: ids.authRecoveryId,
      reason: "The requester cannot review their own recovery request.",
    });
    await expect(approveAuthRecovery(session, recoveryReview)).rejects.toThrow(
      "AUTH_RECOVERY_SELF_REVIEW_BLOCKED",
    );
    await expect(rejectAuthRecovery(session, recoveryReview)).rejects.toThrow(
      "AUTH_RECOVERY_SELF_REVIEW_BLOCKED",
    );
    await expect(
      revokeAuthenticationSessions(
        session,
        formData({ targetUserId: ids.actorUserId }),
      ),
    ).rejects.toThrow("AUTH_SESSION_SELF_ADMIN_REVOCATION_BLOCKED");

    const breakGlassReview = formData({
      grantId: ids.breakGlassGrantId,
      reason: "The requester cannot review their own break-glass request.",
    });
    await expect(approveBreakGlassAccess(breakGlassReview)).rejects.toThrow(
      "BREAK_GLASS_SELF_APPROVAL_BLOCKED",
    );
    await expect(rejectBreakGlassAccess(breakGlassReview)).rejects.toThrow(
      "BREAK_GLASS_SELF_APPROVAL_BLOCKED",
    );
    await expect(revokeBreakGlassAccess(breakGlassReview)).rejects.toThrow(
      "BREAK_GLASS_ACCESS_NOT_FOUND",
    );
    await expect(
      completeBreakGlassPostReview(
        formData({
          grantId: ids.breakGlassGrantId,
          postReviewOutcome: "ACCEPTED",
          postReviewReason: "Pending grants are not ready for post review.",
          postReviewEvidenceReference: "AUTHZ-EVIDENCE",
        }),
      ),
    ).rejects.toThrow("BREAK_GLASS_POST_REVIEW_NOT_READY");

    const mfaReview = formData({
      enrollmentId: ids.privilegedMfaEnrollmentId,
      reason: "A user cannot verify or revoke their own privileged MFA record.",
    });
    await expect(verifyPrivilegedMfaEnrollment(mfaReview)).rejects.toThrow(
      "PRIVILEGED_MFA_SELF_VERIFICATION_BLOCKED",
    );
    await expect(revokePrivilegedMfaEnrollment(mfaReview)).rejects.toThrow(
      "PRIVILEGED_MFA_SELF_VERIFICATION_BLOCKED",
    );

    expect(
      await prisma.authRecoveryRequest.findUniqueOrThrow({
        where: { id: ids.authRecoveryId },
      }),
    ).toEqual(recoveryBefore);
    expect(
      await prisma.breakGlassAccessGrant.findUniqueOrThrow({
        where: { id: ids.breakGlassGrantId },
      }),
    ).toEqual(breakGlassBefore);
    expect(
      await prisma.privilegedMfaEnrollment.findUniqueOrThrow({
        where: { id: ids.privilegedMfaEnrollmentId },
      }),
    ).toEqual(enrollmentBefore);
    clearAuthenticatedRequest();
  });
});
