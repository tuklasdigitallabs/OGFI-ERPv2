import type { TransactionClient } from "@ogfi/database";
import type { SessionContext } from "./context";

type LockedAuthSession = {
  status: string;
  assuranceLevel: string;
  mfaAuthenticatedAt: Date | null;
  privilegeEpochAtIssue: number;
  idleExpiresAt: Date;
  absoluteExpiresAt: Date;
};

/**
 * Locks every live authority fact that can be revoked while a stock-affecting
 * command is waiting on the source document. Revokers therefore either win
 * before this check (and the command denies) or wait for the command's
 * transaction to finish. The source/line/inventory lock order remains owned
 * by the caller.
 */
export async function lockLiveInventoryActionAuthority(
  tx: TransactionClient,
  session: SessionContext,
  input: {
    inventoryLocationId: string;
    permissionCode: string;
    staleErrorCode: string;
  },
) {
  const now = new Date();
  const users = await tx.$queryRaw<Array<{ status: string; privilegeEpoch: number }>>`
    SELECT u.status, u."privilegeEpoch"
      FROM "User" u
     WHERE u.id = ${session.user.id}::uuid
       AND u."tenantId" = ${session.context.tenantId}::uuid
     FOR SHARE OF u
  `;
  const user = users[0];
  if (!user || user.status !== "ACTIVE") {
    throw new Error(input.staleErrorCode);
  }

  let authSession: LockedAuthSession | null = null;
  if (session.authentication?.sessionId) {
    const sessions = await tx.$queryRaw<LockedAuthSession[]>`
      SELECT s.status, s."assuranceLevel", s."mfaAuthenticatedAt",
             s."privilegeEpochAtIssue", s."idleExpiresAt", s."absoluteExpiresAt"
        FROM "AuthSession" s
       WHERE s.id = ${session.authentication.sessionId}::uuid
         AND s."tenantId" = ${session.context.tenantId}::uuid
         AND s."userId" = ${session.user.id}::uuid
       FOR SHARE OF s
    `;
    authSession = sessions[0] ?? null;
    if (
      !authSession ||
      authSession.status !== "ACTIVE" ||
      authSession.privilegeEpochAtIssue !== user.privilegeEpoch ||
      authSession.idleExpiresAt <= now ||
      authSession.absoluteExpiresAt <= now
    ) {
      throw new Error(input.staleErrorCode);
    }
  }

  const locations = await tx.$queryRaw<Array<{ locationId: string }>>`
    SELECT il."locationId"
      FROM "InventoryLocation" il
      JOIN "Location" l ON l.id = il."locationId"
     WHERE il.id = ${input.inventoryLocationId}::uuid
       AND il."tenantId" = ${session.context.tenantId}::uuid
       AND il."companyId" = ${session.context.companyId}::uuid
       AND il.status = 'ACTIVE'
       AND l.status = 'ACTIVE'
     FOR SHARE OF il, l
  `;
  const location = locations[0];
  if (!location) {
    throw new Error("SCOPE_DENIED");
  }

  const roles = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT ura.id
      FROM "UserRoleAssignment" ura
      JOIN "Role" r ON r.id = ura."roleId"
      JOIN "RolePermission" rp ON rp."roleId" = r.id
      JOIN "Permission" p ON p.id = rp."permissionId"
     WHERE ura."userId" = ${session.user.id}::uuid
       AND ura.status = 'ACTIVE'
       AND ura."startsAt" <= ${now}
       AND (ura."endsAt" IS NULL OR ura."endsAt" > ${now})
       AND r.status = 'ACTIVE'
       AND (r."tenantId" IS NULL OR r."tenantId" = ${session.context.tenantId}::uuid)
       AND p.code = ${input.permissionCode}
       AND (p."tenantId" IS NULL OR p."tenantId" = ${session.context.tenantId}::uuid)
     FOR SHARE OF ura, r, rp, p
  `;
  if (roles.length === 0) {
    throw new Error("PERMISSION_DENIED");
  }

  const scopes = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT usa.id
      FROM "UserScopeAssignment" usa
     WHERE usa."userId" = ${session.user.id}::uuid
       AND usa.status = 'ACTIVE'
       AND usa."startsAt" <= ${now}
       AND (usa."endsAt" IS NULL OR usa."endsAt" > ${now})
       AND usa."accessLevel" IN ('OPERATE'::"AccessLevel", 'APPROVE'::"AccessLevel", 'MANAGE'::"AccessLevel")
       AND (
         (usa."scopeType" = 'LOCATION'::"ScopeType" AND usa."scopeId" = ${location.locationId}::uuid)
         OR
         (usa."scopeType" = 'COMPANY'::"ScopeType" AND usa."scopeId" = ${session.context.companyId}::uuid)
       )
     FOR SHARE OF usa
  `;
  if (scopes.length === 0) {
    throw new Error("SCOPE_DENIED");
  }

  // Lock the policy and any verified enrollment so a non-local MFA revocation
  // cannot occur between the evidence check and the inventory write.
  await tx.$queryRaw`SELECT c.id FROM "Company" c WHERE c.id = ${session.context.companyId}::uuid FOR SHARE OF c`;
  await tx.$queryRaw`
    SELECT cps.id
      FROM "CompanyPolicySetting" cps
     WHERE cps."companyId" = ${session.context.companyId}::uuid
       AND cps.key = 'security.privileged_mfa.enforcement_mode'
     FOR SHARE OF cps
  `;
  await tx.$queryRaw`
    SELECT pme.id
      FROM "PrivilegedMfaEnrollment" pme
     WHERE pme."tenantId" = ${session.context.tenantId}::uuid
       AND pme."companyId" = ${session.context.companyId}::uuid
       AND pme."targetUserId" = ${session.user.id}::uuid
       AND pme.status = 'VERIFIED'
     ORDER BY pme."verifiedAt" DESC, pme."updatedAt" DESC
     FOR SHARE OF pme
  `;

  return authSession
    ? {
        ...session,
        authentication: {
          ...session.authentication!,
          assuranceLevel: authSession.assuranceLevel,
          mfaAuthenticatedAt: authSession.mfaAuthenticatedAt,
          absoluteExpiresAt: authSession.absoluteExpiresAt,
        },
      }
    : session;
}
