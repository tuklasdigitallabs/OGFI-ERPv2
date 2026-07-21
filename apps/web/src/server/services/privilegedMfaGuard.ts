import { prisma } from "@ogfi/database";
import type { SessionContext } from "./context";
import { isSensitivePermissionCode } from "./rolePermissionCatalog";
import {
  getAuthMode,
  getMfaStepUpMinutes,
  isMfaAssuranceFresh,
} from "./authentication";

export const privilegedMfaEnforcementModes = [
  "warn_and_audit",
  "enforce_admin_security",
  "enforce_all_sensitive",
] as const;

type PrivilegedMfaEnforcementMode =
  (typeof privilegedMfaEnforcementModes)[number];

type PrivilegedMfaGuardInput = {
  action: string;
  enforcementScope?: "admin_security" | "all_sensitive";
  permissionCode?: string;
  entityType?: string;
  entityId?: string | null;
  reason?: string;
  metadata?: Record<string, unknown>;
};

function isPrivilegedMfaEnforcementMode(
  value: unknown,
): value is PrivilegedMfaEnforcementMode {
  return (
    typeof value === "string" &&
    privilegedMfaEnforcementModes.includes(
      value as PrivilegedMfaEnforcementMode,
    )
  );
}

async function getPrivilegedMfaEnforcementMode(session: SessionContext) {
  const saved = await prisma.companyPolicySetting.findUnique({
    where: {
      companyId_key: {
        companyId: session.context.companyId,
        key: "security.privileged_mfa.enforcement_mode",
      },
    },
    select: { value: true, status: true },
  });

  if (
    saved?.status === "ACTIVE" &&
    isPrivilegedMfaEnforcementMode(saved.value)
  ) {
    return saved.value;
  }

  return "warn_and_audit" satisfies PrivilegedMfaEnforcementMode;
}

export async function hasVerifiedPrivilegedMfaEvidence(
  session: SessionContext,
) {
  const enrollment = await prisma.privilegedMfaEnrollment.findFirst({
    where: {
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      targetUserId: session.user.id,
      status: "VERIFIED",
    },
    orderBy: [{ verifiedAt: "desc" }, { updatedAt: "desc" }],
    select: {
      id: true,
      providerName: true,
      verifiedAt: true,
    },
  });

  return enrollment;
}

export async function assertPrivilegedMfaForAction(
  session: SessionContext,
  input: PrivilegedMfaGuardInput,
) {
  if (
    input.permissionCode &&
    !isSensitivePermissionCode(input.permissionCode)
  ) {
    return {
      required: false,
      mode: "warn_and_audit" as PrivilegedMfaEnforcementMode,
      enrollmentId: null,
    };
  }

  if (getAuthMode() === "local") {
    const configuredFreshness = getMfaStepUpMinutes();
    const authenticatedAt = session.authentication?.mfaAuthenticatedAt;
    const isFresh = isMfaAssuranceFresh({
      assuranceLevel: session.authentication?.assuranceLevel ?? null,
      mfaAuthenticatedAt: authenticatedAt ?? null,
      freshnessMinutes: configuredFreshness,
    });
    if (isFresh) {
      return {
        required: true,
        mode: "runtime_mfa" as const,
        enrollmentId: null,
      };
    }
    await prisma.auditEvent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        actorUserId: session.user.id,
        eventType: "privileged_mfa.step_up_denied",
        entityType: input.entityType ?? "PrivilegedAction",
        entityId: input.entityId ?? session.user.id,
        afterData: {
          action: input.action,
          assuranceLevel: session.authentication?.assuranceLevel ?? "NONE",
          mfaAuthenticatedAt: authenticatedAt?.toISOString() ?? null,
          requiredFreshnessMinutes: configuredFreshness,
        },
        metadata: { sourceDecisionId: "DEC-0040" },
      },
    });
    throw new Error("PRIVILEGED_MFA_STEP_UP_REQUIRED");
  }

  const enrollment = await hasVerifiedPrivilegedMfaEvidence(session);
  if (enrollment) {
    return {
      required: true,
      mode: await getPrivilegedMfaEnforcementMode(session),
      enrollmentId: enrollment.id,
    };
  }

  const mode = await getPrivilegedMfaEnforcementMode(session);
  const hardBlock =
    mode === "enforce_all_sensitive" ||
    (mode === "enforce_admin_security" &&
      (input.enforcementScope ?? "admin_security") === "admin_security");

  await prisma.auditEvent.create({
    data: {
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      actorUserId: session.user.id,
      eventType: hardBlock
        ? "privileged_mfa.required_denied"
        : "privileged_mfa.required_warning",
      entityType: input.entityType ?? "PrivilegedAction",
      entityId: input.entityId ?? session.user.id,
      afterData: {
        action: input.action,
        permissionCode: input.permissionCode ?? null,
        enforcementScope: input.enforcementScope ?? "admin_security",
        mode,
        outcome: hardBlock ? "DENIED" : "WARNED",
      },
      metadata: {
        sourceDecisionId: "DEC-0036",
        reason:
          input.reason ??
          "Verified privileged MFA evidence is required for this sensitive action.",
        ...input.metadata,
      },
    },
  });

  if (hardBlock) {
    throw new Error("PRIVILEGED_MFA_REQUIRED");
  }

  return {
    required: true,
    mode,
    enrollmentId: null,
  };
}
