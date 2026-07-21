import { prisma } from "@ogfi/database";
import { z } from "zod";
import { permissions, requirePermission } from "./authorization";
import { assertCanManageCompanyScope } from "./coreAdmin";
import { requireSessionContext, type SessionContext } from "./context";
import type { CsvRow } from "./csv";
import { getReleaseReadinessPolicyFlags } from "./policySettings";
import { isSensitivePermissionCode } from "./rolePermissionCatalog";
import { getAuthMode } from "./authentication";

export const releaseReadinessStatuses = [
  "PENDING",
  "IN_PROGRESS",
  "READY",
  "CONDITIONAL_GO",
  "HOLD",
  "WAIVED",
] as const;

export const releaseReadinessCategories = [
  {
    id: "uat",
    label: "UAT evidence",
    description: "Scenario execution, defects, waivers, and owner signoff.",
  },
  {
    id: "deployment",
    label: "Deployment controls",
    description:
      "Migration, backup, restore, rollback, smoke, and monitoring evidence.",
  },
  {
    id: "enablement",
    label: "Enablement",
    description:
      "Training, KB, release notes, known limits, and support route readiness.",
  },
  {
    id: "security",
    label: "Security controls",
    description:
      "Privileged access, break-glass, and session revalidation evidence.",
  },
  {
    id: "go_no_go",
    label: "GO / NO-GO",
    description:
      "Release Board decision, conditional GO, hold, rollback, or waiver record.",
  },
] as const;

type ReleaseReadinessCategory =
  (typeof releaseReadinessCategories)[number]["id"];
type ReleaseReadinessStatus = (typeof releaseReadinessStatuses)[number];
export const deploymentEvidenceTypes = [
  "MIGRATION",
  "BACKUP",
  "RESTORE_REHEARSAL",
  "ROLLBACK_PLAN",
  "SMOKE_TEST",
  "MONITORING_HYPERCARE",
] as const;
type DeploymentEvidenceType = (typeof deploymentEvidenceTypes)[number];
export const enablementEvidenceTypes = [
  "TRAINING_SIGNOFF",
  "KNOWN_LIMIT_ACKNOWLEDGEMENT",
  "SUPPORT_ROUTE_CONFIRMATION",
  "KB_REVIEW",
  "RELEASE_NOTES_REVIEW",
  "TRAINING_IMPACT_ASSESSMENT",
] as const;
type EnablementEvidenceType = (typeof enablementEvidenceTypes)[number];
export const uatEvidenceTypes = [
  "SCENARIO_EXECUTION",
  "DEFECT_DISPOSITION",
  "POLICY_VERSION_TRACE",
  "ACCEPTANCE_MATRIX",
  "DEFAULT_REVISION_REGISTER",
] as const;
type UatEvidenceType = (typeof uatEvidenceTypes)[number];
export const uatEvidenceResults = [
  "PASS",
  "FAIL",
  "BLOCKED",
  "WAIVED",
  "RETEST_PASS",
] as const;

export const uatWorkflowAreaOptions = [
  "Phase 1 operations foundation",
  "Phase 1.5 project tracker",
  "Restaurant operations and costing",
  "Phase 3 finance controlled foundation",
  "Phase 3 workforce controlled foundation",
  "Phase 3 deferred blocker review",
  "Security and access controls",
  "Deployment readiness",
  "Enablement and training readiness",
] as const;

const phase3UatWorkflowAreas = {
  finance: "Phase 3 finance controlled foundation",
  workforce: "Phase 3 workforce controlled foundation",
  deferredBlockers: "Phase 3 deferred blocker review",
} as const;

export const releaseBoardDecisions = [
  "GO",
  "CONDITIONAL_GO",
  "HOLD",
  "ROLLBACK",
  "FORWARD_FIX",
] as const;

type ReleaseReadinessGateDefinition = {
  gateKey: string;
  category: ReleaseReadinessCategory;
  title: string;
  description: string;
  ownerRole: string;
  policyFlag?: "uatRequired" | "trainingImpactRequired";
};

export const defaultReleaseReadinessGates: readonly ReleaseReadinessGateDefinition[] =
  [
    {
      gateKey: "uat.scenario_execution",
      category: "uat",
      title: "UAT scenarios executed",
      description:
        "Required Phase I and Phase 1.5 scenarios have tester, environment, device, result, evidence, and owner signoff.",
      ownerRole: "QA Lead",
      policyFlag: "uatRequired",
    },
    {
      gateKey: "uat.defect_disposition",
      category: "uat",
      title: "Defects dispositioned",
      description:
        "Blocker and critical defects are fixed/retested or formally waived with mitigation, owner, expiry, and retest plan.",
      ownerRole: "QA Lead / Product Owner",
      policyFlag: "uatRequired",
    },
    {
      gateKey: "uat.policy_version_trace",
      category: "uat",
      title: "Policy version trace captured",
      description:
        "UAT evidence references the active DEC-0036 policy/default version so findings can be traced to configuration.",
      ownerRole: "QA Lead",
    },
    {
      gateKey: "uat.acceptance_matrix_signed",
      category: "uat",
      title: "Acceptance matrix signed",
      description:
        "Each critical workflow has happy path, denied path, invalid state, audit, evidence, and rollback/reversal proof with owner signoff.",
      ownerRole: "QA Lead / Operations Owner",
      policyFlag: "uatRequired",
    },
    {
      gateKey: "uat.default_revision_register",
      category: "uat",
      title: "Default revision register updated",
      description:
        "Pilot findings that change DEC-0036 defaults, thresholds, evidence rules, or readiness criteria are recorded with owner, decision, and effective date.",
      ownerRole: "Product Owner / QA Lead",
      policyFlag: "uatRequired",
    },
    {
      gateKey: "uat.phase3_finance_controlled_foundation",
      category: "uat",
      title: "Phase 3 finance foundation UAT accepted",
      description:
        "Finance controlled-foundation workflows have verified scenario execution and acceptance-matrix evidence for budget, expense, AP/payment preparation, bank/cash, and period-close readiness without claiming production settlement or official-books go-live.",
      ownerRole: "Finance Owner / QA Lead",
      policyFlag: "uatRequired",
    },
    {
      gateKey: "uat.phase3_workforce_controlled_foundation",
      category: "uat",
      title: "Phase 3 workforce foundation UAT accepted",
      description:
        "Workforce controlled-foundation workflows have verified scenario execution and acceptance-matrix evidence for employee, assignment, leave, overtime, schedule, attendance, training, and compliance-document readiness without payroll or external-device authority.",
      ownerRole: "HR / Workforce Owner / QA Lead",
      policyFlag: "uatRequired",
    },
    {
      gateKey: "uat.phase3_deferred_blockers_reviewed",
      category: "uat",
      title: "Phase 3 deferred blockers reviewed",
      description:
        "Deferred Phase 3 go-live blockers are explicitly reviewed, dispositioned, and tied to the skipped-blockers register so UAT can proceed without treating those blockers as production-complete.",
      ownerRole: "Product Owner / Finance Owner / QA Lead",
      policyFlag: "uatRequired",
    },
    {
      gateKey: "deployment.migration_backup_restore",
      category: "deployment",
      title: "Migration, backup, and restore evidence",
      description:
        "Staging migration, backup, restore rehearsal, rollback path, and smoke evidence are attached before GO review.",
      ownerRole: "Release Manager",
    },
    {
      gateKey: "deployment.monitoring_hypercare",
      category: "deployment",
      title: "Monitoring and hypercare ready",
      description:
        "Support contacts, defect intake, monitoring checks, and hypercare review cadence are confirmed.",
      ownerRole: "Release Manager / Support Owner",
    },
    {
      gateKey: "enablement.training_signoff",
      category: "enablement",
      title: "Role-based training signoff",
      description:
        "Attendance, known-limit acknowledgement, trainer, date, support route, and evidence reference are recorded.",
      ownerRole: "Enablement Owner",
      policyFlag: "trainingImpactRequired",
    },
    {
      gateKey: "enablement.kb_release_notes",
      category: "enablement",
      title: "KB and release notes reviewed",
      description:
        "Knowledge-base, release-note, and training impact assessment have been checked for behavior-changing work.",
      ownerRole: "Enablement Owner",
      policyFlag: "trainingImpactRequired",
    },
    {
      gateKey: "security.privileged_mfa_enrollment",
      category: "security",
      title: "Privileged MFA enrollment confirmed",
      description:
        "Core Admin, approval, finance, inventory posting, and release-management users have verified ERP-side MFA enrollment evidence, the MFA preflight has no missing/revoked privileged users, and the privileged MFA enforcement mode is intentionally set for rollout. This evidence-backed guard does not replace runtime MFA authentication at sign-in.",
      ownerRole: "IT / Security",
    },
    {
      gateKey: "security.break_glass_control",
      category: "security",
      title: "Break-glass access process confirmed",
      description:
        "Emergency access has named owners, expiry, reason capture, post-use review, audit evidence, and revocation procedure.",
      ownerRole: "IT / Security / Product Owner",
    },
    {
      gateKey: "security.session_revalidation",
      category: "security",
      title: "Sensitive-action session revalidation confirmed",
      description:
        "Privileged grants, high-risk scope changes, break-glass activation/revocation, and other sensitive actions bump the demo-session privilege epoch and create provider-neutral invalidation records pending external auth-provider completion.",
      ownerRole: "IT / Security",
    },
    {
      gateKey: "security.controlled_access_requests",
      category: "security",
      title: "Controlled access requests cleared",
      description:
        "Pending sensitive role and high-risk scope requests are reviewed before production release so unresolved authority changes do not bypass release review.",
      ownerRole: "IT / Security / Product Owner",
    },
    {
      gateKey: "go_no_go.release_board_decision",
      category: "go_no_go",
      title: "Release Board decision recorded",
      description:
        "Product Owner chair, QA, Release, Security, Operations, Warehouse/Inventory, and Enablement owners record GO, Conditional GO, HOLD, ROLLBACK, or FORWARD FIX.",
      ownerRole: "Product Owner / Release Board",
    },
  ] as const;

const readinessGateKeySchema = z.enum(
  defaultReleaseReadinessGates.map((gate) => gate.gateKey) as [
    (typeof defaultReleaseReadinessGates)[number]["gateKey"],
    ...(typeof defaultReleaseReadinessGates)[number]["gateKey"][],
  ],
);
const readinessStatusSchema = z.enum(releaseReadinessStatuses);

const updateReleaseReadinessGateSchema = z.object({
  gateKey: readinessGateKeySchema,
  status: readinessStatusSchema,
  evidenceReference: z.string().trim().max(500).optional(),
  decisionNote: z.string().trim().max(1000).optional(),
  blockerSummary: z.string().trim().max(1000).optional(),
  targetDate: z
    .string()
    .trim()
    .optional()
    .transform((value) => value || undefined),
  reason: z.string().trim().min(5).max(500),
});

const deploymentEvidenceTypeSchema = z.enum(deploymentEvidenceTypes);

const createDeploymentEvidenceSchema = z.object({
  evidenceType: deploymentEvidenceTypeSchema,
  title: z.string().trim().min(3).max(160),
  evidenceReference: z.string().trim().min(3).max(500),
  environment: z.string().trim().min(2).max(80),
  performedAt: z.string().trim().min(1),
  performedBy: z.string().trim().min(2).max(160),
  notes: z.string().trim().max(1000).optional(),
  reason: z.string().trim().min(5).max(500),
});

const updateDeploymentEvidenceStatusSchema = z.object({
  evidenceId: z.string().uuid(),
  status: z.enum(["VERIFIED", "REJECTED"]),
  reason: z.string().trim().min(5).max(500),
});

const enablementEvidenceTypeSchema = z.enum(enablementEvidenceTypes);

const createEnablementEvidenceSchema = z.object({
  evidenceType: enablementEvidenceTypeSchema,
  title: z.string().trim().min(3).max(160),
  audienceRole: z.string().trim().min(2).max(120),
  evidenceReference: z.string().trim().min(3).max(500),
  ownerName: z.string().trim().min(2).max(160),
  completedAt: z.string().trim().min(1),
  knownLimitAcknowledged: z.string().optional(),
  supportRouteConfirmed: z.string().optional(),
  notes: z.string().trim().max(1000).optional(),
  reason: z.string().trim().min(5).max(500),
});

const updateEnablementEvidenceStatusSchema = z.object({
  evidenceId: z.string().uuid(),
  status: z.enum(["VERIFIED", "REJECTED"]),
  reason: z.string().trim().min(5).max(500),
});

const uatEvidenceTypeSchema = z.enum(uatEvidenceTypes);

const createUatEvidenceSchema = z.object({
  evidenceType: uatEvidenceTypeSchema,
  title: z.string().trim().min(3).max(160),
  workflowArea: z.string().trim().min(2).max(120),
  testerName: z.string().trim().min(2).max(160),
  environment: z.string().trim().min(2).max(80),
  evidenceReference: z.string().trim().min(3).max(500),
  result: z.enum(uatEvidenceResults),
  executedAt: z.string().trim().min(1),
  policyVersion: z.string().trim().max(80).optional(),
  defectReference: z.string().trim().max(160).optional(),
  notes: z.string().trim().max(1000).optional(),
  reason: z.string().trim().min(5).max(500),
});

const updateUatEvidenceStatusSchema = z.object({
  evidenceId: z.string().uuid(),
  status: z.enum(["VERIFIED", "REJECTED"]),
  reason: z.string().trim().min(5).max(500),
});

const releaseBoardDecisionSchema = z.object({
  decision: z.enum(releaseBoardDecisions),
  evidenceReference: z.string().trim().min(3).max(500),
  decisionNote: z.string().trim().min(10).max(1500),
  participants: z.string().trim().min(10).max(2000),
  decidedAt: z.string().trim().min(1),
  reason: z.string().trim().min(5).max(500),
});

function findGateDefinition(gateKey: string) {
  const definition = defaultReleaseReadinessGates.find(
    (gate) => gate.gateKey === gateKey,
  );
  if (!definition) {
    throw new Error("RELEASE_READINESS_GATE_NOT_FOUND");
  }
  return definition;
}

function normalizeOptionalText(value: string | undefined) {
  return value && value.length > 0 ? value : null;
}

function normalizeTargetDate(value: string | undefined) {
  if (!value) {
    return null;
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    throw new Error("RELEASE_READINESS_TARGET_DATE_INVALID");
  }
  return date;
}

function normalizePerformedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error("DEPLOYMENT_EVIDENCE_PERFORMED_AT_INVALID");
  }
  return date;
}

function normalizeCompletedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error("ENABLEMENT_EVIDENCE_COMPLETED_AT_INVALID");
  }
  return date;
}

function normalizeExecutedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error("UAT_EVIDENCE_EXECUTED_AT_INVALID");
  }
  return date;
}

function normalizeDecidedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error("RELEASE_BOARD_DECIDED_AT_INVALID");
  }
  return date;
}

function requiresEvidenceForStatus(status: ReleaseReadinessStatus) {
  return ["READY", "CONDITIONAL_GO", "WAIVED"].includes(status);
}

function requiresDecisionNoteForStatus(
  definition: ReleaseReadinessGateDefinition,
  status: ReleaseReadinessStatus,
) {
  return (
    definition.category === "uat" &&
    ["READY", "CONDITIONAL_GO", "WAIVED"].includes(status)
  );
}

async function assertCanManageReleaseReadiness(session: SessionContext) {
  await requirePermission(session, permissions.coreAdminister);
  await assertCanManageCompanyScope(session, session.context.companyId);
}

export async function listReleaseReadinessGates(session: SessionContext) {
  await requirePermission(session, permissions.coreAdminister);

  const [policyFlags, savedGates] = await Promise.all([
    getReleaseReadinessPolicyFlags(session),
    prisma.releaseReadinessGate.findMany({
      where: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
      },
    }),
  ]);
  const savedByKey = new Map(savedGates.map((gate) => [gate.gateKey, gate]));

  return defaultReleaseReadinessGates.map((definition) => {
    const saved = savedByKey.get(definition.gateKey);
    const requiredByPolicy = definition.policyFlag
      ? policyFlags[definition.policyFlag]
      : true;

    return {
      id: saved?.id ?? null,
      gateKey: definition.gateKey,
      category: definition.category,
      title: definition.title,
      description: definition.description,
      ownerRole: definition.ownerRole,
      status: (saved?.status ?? "PENDING") as ReleaseReadinessStatus,
      requiredByPolicy,
      evidenceReference: saved?.evidenceReference ?? null,
      decisionNote: saved?.decisionNote ?? null,
      blockerSummary: saved?.blockerSummary ?? null,
      targetDate: saved?.targetDate?.toISOString() ?? null,
      signedOffAt: saved?.signedOffAt?.toISOString() ?? null,
      sourceDecisionId: saved?.sourceDecisionId ?? "DEC-0036",
    };
  });
}

export function summarizeReleaseReadiness(
  gates: Awaited<ReturnType<typeof listReleaseReadinessGates>>,
) {
  const requiredGates = gates.filter((gate) => gate.requiredByPolicy);
  const readyStatuses = new Set<ReleaseReadinessStatus>([
    "READY",
    "CONDITIONAL_GO",
    "WAIVED",
  ]);
  const blockingGates = requiredGates.filter(
    (gate) => gate.status === "PENDING" || gate.status === "IN_PROGRESS",
  );
  const holdGates = requiredGates.filter((gate) => gate.status === "HOLD");

  return {
    total: gates.length,
    required: requiredGates.length,
    ready: requiredGates.filter((gate) => readyStatuses.has(gate.status))
      .length,
    blocking: blockingGates.length,
    hold: holdGates.length,
    canProceed:
      requiredGates.length > 0 &&
      blockingGates.length === 0 &&
      holdGates.length === 0,
  };
}

function displayUser(user: { displayName: string; email: string }) {
  return user.displayName || user.email;
}

function formatReleaseBoardParticipants(participants: unknown) {
  if (Array.isArray(participants)) {
    return participants
      .filter(
        (participant): participant is string => typeof participant === "string",
      )
      .join("; ");
  }
  if (typeof participants === "string") {
    return participants;
  }
  return "";
}

function activeAssignmentWindowFilter(now = new Date()) {
  return {
    status: "ACTIVE" as const,
    startsAt: { lte: now },
    OR: [{ endsAt: null }, { endsAt: { gt: now } }],
  };
}

export async function getReleaseSecurityEvidenceSummary(
  session: SessionContext,
) {
  await requirePermission(session, permissions.coreAdminister);
  const now = new Date();
  const activeAssignmentFilter = activeAssignmentWindowFilter(now);

  const companyLocations = await prisma.location.findMany({
    where: {
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      status: "ACTIVE",
    },
    select: { id: true },
  });
  const companyLocationIds = new Set(
    companyLocations.map((location) => location.id),
  );

  const [
    users,
    enrollments,
    runtimeAuthenticators,
    pendingInvalidations,
    breakGlassGrants,
    pendingAuthRecoveryRequests,
    pendingHighRiskScopeRequests,
    pendingSensitiveRoleRequests,
  ] = await Promise.all([
    prisma.user.findMany({
      where: {
        tenantId: session.context.tenantId,
        status: "ACTIVE",
      },
      include: {
        scopeAssignments: {
          where: activeAssignmentFilter,
        },
        roleAssignments: {
          where: activeAssignmentFilter,
          include: {
            role: {
              include: {
                permissions: {
                  include: { permission: true },
                },
              },
            },
          },
        },
        authIdentities: {
          where: { provider: "LOCAL", status: "ACTIVE" },
          select: { id: true },
        },
      },
      orderBy: { displayName: "asc" },
    }),
    prisma.privilegedMfaEnrollment.findMany({
      where: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.mfaAuthenticator.findMany({
      where: {
        tenantId: session.context.tenantId,
        status: { in: ["PENDING", "ACTIVE", "REVOKED"] },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.authSessionInvalidation.count({
      where: {
        tenantId: session.context.tenantId,
        OR: [{ companyId: session.context.companyId }, { companyId: null }],
        status: "PENDING_PROVIDER",
      },
    }),
    prisma.breakGlassAccessGrant.findMany({
      where: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        status: {
          in: ["PENDING_REVIEW", "ACTIVE", "REVOKED", "EXPIRED", "REJECTED"],
        },
      },
      select: {
        id: true,
        status: true,
      },
    }),
    prisma.authRecoveryRequest.count({
      where: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        status: "PENDING",
      },
    }),
    prisma.highRiskScopeRequest.count({
      where: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        status: "PENDING",
      },
    }),
    prisma.sensitiveRoleRequest.count({
      where: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        status: "PENDING",
      },
    }),
  ]);

  const latestEnrollmentByUser = new Map<
    string,
    (typeof enrollments)[number]
  >();
  for (const enrollment of enrollments) {
    if (!latestEnrollmentByUser.has(enrollment.targetUserId)) {
      latestEnrollmentByUser.set(enrollment.targetUserId, enrollment);
    }
  }
  const latestRuntimeAuthenticatorByUser = new Map<
    string,
    (typeof runtimeAuthenticators)[number]
  >();
  for (const authenticator of runtimeAuthenticators) {
    if (!latestRuntimeAuthenticatorByUser.has(authenticator.userId)) {
      latestRuntimeAuthenticatorByUser.set(authenticator.userId, authenticator);
    }
  }
  const localRuntimeMfa = getAuthMode() === "local";

  const privilegedUsers = users
    .map((user) => {
      const inCompanyScope = user.scopeAssignments.some(
        (scope) =>
          (scope.scopeType === "COMPANY" &&
            scope.scopeId === session.context.companyId) ||
          (scope.scopeType === "LOCATION" &&
            companyLocationIds.has(scope.scopeId)),
      );
      const sensitivePermissionCount = new Set(
        user.roleAssignments.flatMap((assignment) =>
          assignment.role.permissions
            .map((rolePermission) => rolePermission.permission.code)
            .filter((code) => isSensitivePermissionCode(code)),
        ),
      ).size;

      return {
        user,
        inCompanyScope,
        sensitivePermissionCount,
        enrollment: latestEnrollmentByUser.get(user.id),
        runtimeAuthenticator: latestRuntimeAuthenticatorByUser.get(user.id),
      };
    })
    .filter(
      (entry) => entry.inCompanyScope && entry.sensitivePermissionCount > 0,
    );
  const companyScopedUsers = users.filter((user) =>
    user.scopeAssignments.some(
      (scope) =>
        (scope.scopeType === "COMPANY" &&
          scope.scopeId === session.context.companyId) ||
        (scope.scopeType === "LOCATION" &&
          companyLocationIds.has(scope.scopeId)),
    ),
  );
  const missingLocalIdentityUsers = localRuntimeMfa
    ? companyScopedUsers.filter((user) => user.authIdentities.length === 0)
    : [];

  const verifiedMfaUsers = privilegedUsers.filter((entry) =>
    localRuntimeMfa
      ? entry.runtimeAuthenticator?.status === "ACTIVE"
      : entry.enrollment?.status === "VERIFIED",
  );
  const pendingMfaUsers = privilegedUsers.filter((entry) =>
    localRuntimeMfa
      ? entry.runtimeAuthenticator?.status === "PENDING"
      : entry.enrollment?.status === "PENDING_VERIFICATION",
  );
  const revokedMfaUsers = privilegedUsers.filter((entry) =>
    localRuntimeMfa
      ? entry.runtimeAuthenticator?.status === "REVOKED"
      : entry.enrollment?.status === "REVOKED",
  );
  const missingMfaUsers = privilegedUsers.filter((entry) =>
    localRuntimeMfa ? !entry.runtimeAuthenticator : !entry.enrollment,
  );
  const openBreakGlassCount = breakGlassGrants.filter((grant) =>
    ["PENDING_REVIEW", "ACTIVE"].includes(grant.status),
  ).length;
  const breakGlassPostReviewDueCount = breakGlassGrants.filter((grant) =>
    ["REVOKED", "EXPIRED", "REJECTED"].includes(grant.status),
  ).length;

  return {
    privilegedUserCount: privilegedUsers.length,
    verifiedMfaUserCount: verifiedMfaUsers.length,
    pendingMfaUserCount: pendingMfaUsers.length,
    missingOrRevokedMfaUserCount:
      missingMfaUsers.length + revokedMfaUsers.length,
    pendingProviderInvalidationCount: pendingInvalidations,
    missingLocalIdentityUserCount: missingLocalIdentityUsers.length,
    pendingAuthRecoveryRequestCount: pendingAuthRecoveryRequests,
    pendingHighRiskScopeRequestCount: pendingHighRiskScopeRequests,
    pendingSensitiveRoleRequestCount: pendingSensitiveRoleRequests,
    pendingControlledAccessRequestCount:
      pendingHighRiskScopeRequests + pendingSensitiveRoleRequests,
    openBreakGlassCount,
    breakGlassPostReviewDueCount,
    readyForStrictMfa:
      pendingMfaUsers.length === 0 &&
      missingMfaUsers.length === 0 &&
      revokedMfaUsers.length === 0,
    sampleAttentionUsers: [
      ...missingMfaUsers,
      ...pendingMfaUsers,
      ...revokedMfaUsers,
    ]
      .slice(0, 3)
      .map((entry) => displayUser(entry.user)),
  };
}

export async function listDeploymentEvidenceRecords(session: SessionContext) {
  await requirePermission(session, permissions.coreAdminister);

  return prisma.deploymentEvidenceRecord.findMany({
    where: {
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
    },
    include: {
      createdByUser: { select: { displayName: true, email: true } },
      verifiedByUser: { select: { displayName: true, email: true } },
      rejectedByUser: { select: { displayName: true, email: true } },
    },
    orderBy: [{ performedAt: "desc" }, { createdAt: "desc" }],
  });
}

export function summarizeDeploymentEvidence(
  records: Awaited<ReturnType<typeof listDeploymentEvidenceRecords>>,
) {
  const requiredForMigrationGate: DeploymentEvidenceType[] = [
    "MIGRATION",
    "BACKUP",
    "RESTORE_REHEARSAL",
    "ROLLBACK_PLAN",
    "SMOKE_TEST",
  ];
  const requiredForMonitoringGate: DeploymentEvidenceType[] = [
    "MONITORING_HYPERCARE",
  ];

  const verifiedTypes = new Set(
    records
      .filter((record) => record.verificationStatus === "VERIFIED")
      .map((record) => record.evidenceType),
  );
  const missingMigrationGateTypes = requiredForMigrationGate.filter(
    (type) => !verifiedTypes.has(type),
  );
  const missingMonitoringGateTypes = requiredForMonitoringGate.filter(
    (type) => !verifiedTypes.has(type),
  );

  return {
    total: records.length,
    verified: records.filter(
      (record) => record.verificationStatus === "VERIFIED",
    ).length,
    recorded: records.filter(
      (record) => record.verificationStatus === "RECORDED",
    ).length,
    rejected: records.filter(
      (record) => record.verificationStatus === "REJECTED",
    ).length,
    missingMigrationGateTypes,
    missingMonitoringGateTypes,
    migrationGateReady: missingMigrationGateTypes.length === 0,
    monitoringGateReady: missingMonitoringGateTypes.length === 0,
  };
}

async function assertDeploymentGateReadyEvidence(
  session: SessionContext,
  definition: ReleaseReadinessGateDefinition,
  status: ReleaseReadinessStatus,
) {
  if (definition.category !== "deployment" || status !== "READY") {
    return;
  }

  const records = await listDeploymentEvidenceRecords(session);
  const summary = summarizeDeploymentEvidence(records);
  const unresolvedByGate: Record<string, boolean> = {
    "deployment.migration_backup_restore": !summary.migrationGateReady,
    "deployment.monitoring_hypercare": !summary.monitoringGateReady,
  };

  if (unresolvedByGate[definition.gateKey]) {
    throw new Error("RELEASE_READINESS_DEPLOYMENT_EVIDENCE_UNRESOLVED");
  }
}

async function assertSecurityGateReadyEvidence(
  session: SessionContext,
  definition: ReleaseReadinessGateDefinition,
  status: ReleaseReadinessStatus,
) {
  if (definition.category !== "security" || status !== "READY") {
    return;
  }

  const summary = await getReleaseSecurityEvidenceSummary(session);
  const unresolvedByGate: Record<string, boolean> = {
    "security.privileged_mfa_enrollment": !summary.readyForStrictMfa,
    "security.break_glass_control":
      summary.openBreakGlassCount + summary.breakGlassPostReviewDueCount > 0,
    "security.session_revalidation":
      summary.pendingProviderInvalidationCount > 0 ||
      summary.missingLocalIdentityUserCount > 0 ||
      summary.pendingAuthRecoveryRequestCount > 0,
    "security.controlled_access_requests":
      summary.pendingControlledAccessRequestCount > 0,
  };

  if (unresolvedByGate[definition.gateKey]) {
    throw new Error("RELEASE_READINESS_SECURITY_EVIDENCE_UNRESOLVED");
  }
}

export async function listEnablementEvidenceRecords(session: SessionContext) {
  await requirePermission(session, permissions.coreAdminister);

  return prisma.enablementEvidenceRecord.findMany({
    where: {
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
    },
    include: {
      createdByUser: { select: { displayName: true, email: true } },
      verifiedByUser: { select: { displayName: true, email: true } },
      rejectedByUser: { select: { displayName: true, email: true } },
    },
    orderBy: [{ completedAt: "desc" }, { createdAt: "desc" }],
  });
}

export function summarizeEnablementEvidence(
  records: Awaited<ReturnType<typeof listEnablementEvidenceRecords>>,
) {
  const requiredForTrainingGate: EnablementEvidenceType[] = [
    "TRAINING_SIGNOFF",
    "KNOWN_LIMIT_ACKNOWLEDGEMENT",
    "SUPPORT_ROUTE_CONFIRMATION",
  ];
  const requiredForKbGate: EnablementEvidenceType[] = [
    "KB_REVIEW",
    "RELEASE_NOTES_REVIEW",
    "TRAINING_IMPACT_ASSESSMENT",
  ];
  const verifiedRecords = records.filter(
    (record) => record.verificationStatus === "VERIFIED",
  );
  const verifiedTypes = new Set(
    verifiedRecords.map((record) => record.evidenceType),
  );
  const hasTrainingAcknowledgement = verifiedRecords.some(
    (record) =>
      record.evidenceType === "TRAINING_SIGNOFF" &&
      record.knownLimitAcknowledged &&
      record.supportRouteConfirmed,
  );
  const missingTrainingGateTypes = requiredForTrainingGate.filter((type) => {
    if (type === "KNOWN_LIMIT_ACKNOWLEDGEMENT") {
      return !hasTrainingAcknowledgement && !verifiedTypes.has(type);
    }
    if (type === "SUPPORT_ROUTE_CONFIRMATION") {
      return !hasTrainingAcknowledgement && !verifiedTypes.has(type);
    }
    return !verifiedTypes.has(type);
  });
  const missingKbGateTypes = requiredForKbGate.filter(
    (type) => !verifiedTypes.has(type),
  );

  return {
    total: records.length,
    verified: verifiedRecords.length,
    recorded: records.filter(
      (record) => record.verificationStatus === "RECORDED",
    ).length,
    rejected: records.filter(
      (record) => record.verificationStatus === "REJECTED",
    ).length,
    missingTrainingGateTypes,
    missingKbGateTypes,
    trainingGateReady: missingTrainingGateTypes.length === 0,
    kbGateReady: missingKbGateTypes.length === 0,
  };
}

async function assertEnablementGateReadyEvidence(
  session: SessionContext,
  definition: ReleaseReadinessGateDefinition,
  status: ReleaseReadinessStatus,
) {
  if (definition.category !== "enablement" || status !== "READY") {
    return;
  }

  const records = await listEnablementEvidenceRecords(session);
  const summary = summarizeEnablementEvidence(records);
  const unresolvedByGate: Record<string, boolean> = {
    "enablement.training_signoff": !summary.trainingGateReady,
    "enablement.kb_release_notes": !summary.kbGateReady,
  };

  if (unresolvedByGate[definition.gateKey]) {
    throw new Error("RELEASE_READINESS_ENABLEMENT_EVIDENCE_UNRESOLVED");
  }
}

export async function listUatEvidenceRecords(session: SessionContext) {
  await requirePermission(session, permissions.coreAdminister);

  return prisma.uatEvidenceRecord.findMany({
    where: {
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
    },
    include: {
      createdByUser: { select: { displayName: true, email: true } },
      verifiedByUser: { select: { displayName: true, email: true } },
      rejectedByUser: { select: { displayName: true, email: true } },
    },
    orderBy: [{ executedAt: "desc" }, { createdAt: "desc" }],
  });
}

export function summarizeUatEvidence(
  records: Awaited<ReturnType<typeof listUatEvidenceRecords>>,
) {
  type UatEvidenceSummaryRecord = {
    evidenceType: string;
    verificationStatus: string;
    result: string;
    workflowArea?: string | null;
    title?: string | null;
    notes?: string | null;
    evidenceReference?: string | null;
  };
  const requiredTypes: UatEvidenceType[] = [
    "SCENARIO_EXECUTION",
    "DEFECT_DISPOSITION",
    "POLICY_VERSION_TRACE",
    "ACCEPTANCE_MATRIX",
    "DEFAULT_REVISION_REGISTER",
  ];
  const verifiedRecords = records.filter(
    (record) => record.verificationStatus === "VERIFIED",
  );
  const passingVerifiedRecords = verifiedRecords.filter((record) =>
    ["PASS", "RETEST_PASS", "WAIVED"].includes(record.result),
  );
  const verifiedTypes = new Set(
    verifiedRecords.map((record) => record.evidenceType),
  );
  const unresolvedResults = verifiedRecords.filter((record) =>
    ["FAIL", "BLOCKED"].includes(record.result),
  );
  const missingTypes = requiredTypes.filter((type) => !verifiedTypes.has(type));
  const normalizeWorkflowArea = (value: string | null | undefined) =>
    value?.trim().toLowerCase() ?? "";
  const recordMatchesWorkflowArea = (
    record: UatEvidenceSummaryRecord,
    workflowArea: (typeof uatWorkflowAreaOptions)[number],
  ) =>
    normalizeWorkflowArea(record.workflowArea) === workflowArea.toLowerCase();
  const hasRequiredWorkflowAreaCoverage = (
    requiredEvidenceTypes: readonly UatEvidenceType[],
    workflowArea: (typeof uatWorkflowAreaOptions)[number],
  ) =>
    requiredEvidenceTypes.every((type) =>
      passingVerifiedRecords.some(
        (record) =>
          record.evidenceType === type &&
          recordMatchesWorkflowArea(record, workflowArea),
      ),
    );

  return {
    total: records.length,
    verified: verifiedRecords.length,
    recorded: records.filter(
      (record) => record.verificationStatus === "RECORDED",
    ).length,
    rejected: records.filter(
      (record) => record.verificationStatus === "REJECTED",
    ).length,
    unresolvedResultCount: unresolvedResults.length,
    missingTypes,
    phase3FinanceReady: hasRequiredWorkflowAreaCoverage(
      ["SCENARIO_EXECUTION", "ACCEPTANCE_MATRIX"],
      phase3UatWorkflowAreas.finance,
    ),
    phase3WorkforceReady: hasRequiredWorkflowAreaCoverage(
      ["SCENARIO_EXECUTION", "ACCEPTANCE_MATRIX"],
      phase3UatWorkflowAreas.workforce,
    ),
    phase3DeferredBlockerReviewReady: hasRequiredWorkflowAreaCoverage(
      ["DEFECT_DISPOSITION", "DEFAULT_REVISION_REGISTER"],
      phase3UatWorkflowAreas.deferredBlockers,
    ),
    ready: missingTypes.length === 0 && unresolvedResults.length === 0,
  };
}

async function assertUatGateReadyEvidence(
  session: SessionContext,
  definition: ReleaseReadinessGateDefinition,
  status: ReleaseReadinessStatus,
) {
  if (definition.category !== "uat" || status !== "READY") {
    return;
  }

  const records = await listUatEvidenceRecords(session);
  const summary = summarizeUatEvidence(records);
  const requiredByGate: Record<string, UatEvidenceType[]> = {
    "uat.scenario_execution": ["SCENARIO_EXECUTION"],
    "uat.defect_disposition": ["DEFECT_DISPOSITION"],
    "uat.policy_version_trace": ["POLICY_VERSION_TRACE"],
    "uat.acceptance_matrix_signed": ["ACCEPTANCE_MATRIX"],
    "uat.default_revision_register": ["DEFAULT_REVISION_REGISTER"],
    "uat.phase3_finance_controlled_foundation": [
      "SCENARIO_EXECUTION",
      "ACCEPTANCE_MATRIX",
    ],
    "uat.phase3_workforce_controlled_foundation": [
      "SCENARIO_EXECUTION",
      "ACCEPTANCE_MATRIX",
    ],
    "uat.phase3_deferred_blockers_reviewed": [
      "DEFECT_DISPOSITION",
      "DEFAULT_REVISION_REGISTER",
    ],
  };
  const phase3UnresolvedByGate: Record<string, boolean> = {
    "uat.phase3_finance_controlled_foundation": !summary.phase3FinanceReady,
    "uat.phase3_workforce_controlled_foundation": !summary.phase3WorkforceReady,
    "uat.phase3_deferred_blockers_reviewed":
      !summary.phase3DeferredBlockerReviewReady,
  };
  const requiredTypes = requiredByGate[definition.gateKey] ?? [];
  const missingForGate = summary.missingTypes.some((type) =>
    requiredTypes.includes(type),
  );

  if (
    missingForGate ||
    summary.unresolvedResultCount > 0 ||
    phase3UnresolvedByGate[definition.gateKey]
  ) {
    throw new Error("RELEASE_READINESS_UAT_EVIDENCE_UNRESOLVED");
  }
}

export async function createDeploymentEvidenceRecord(formData: FormData) {
  const session = await requireSessionContext();
  await assertCanManageReleaseReadiness(session);
  const values = createDeploymentEvidenceSchema.parse(
    Object.fromEntries(formData),
  );
  const notes = normalizeOptionalText(values.notes);
  const performedAt = normalizePerformedAt(values.performedAt);

  await prisma.$transaction(async (tx) => {
    const record = await tx.deploymentEvidenceRecord.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        evidenceType: values.evidenceType,
        title: values.title,
        evidenceReference: values.evidenceReference,
        environment: values.environment,
        performedAt,
        performedBy: values.performedBy,
        notes,
        createdByUserId: session.user.id,
        sourceDecisionId: "DEC-0036",
      },
    });

    await tx.auditEvent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        actorUserId: session.user.id,
        eventType: "deployment_evidence.recorded",
        entityType: "DeploymentEvidenceRecord",
        entityId: record.id,
        afterData: {
          evidenceType: record.evidenceType,
          title: record.title,
          evidenceReference: record.evidenceReference,
          environment: record.environment,
          performedAt: record.performedAt.toISOString(),
          performedBy: record.performedBy,
          verificationStatus: record.verificationStatus,
          sourceDecisionId: record.sourceDecisionId,
        },
        metadata: {
          reason: values.reason,
          sourceDecisionId: "DEC-0036",
        },
      },
    });
  });
}

export async function createUatEvidenceRecord(formData: FormData) {
  const session = await requireSessionContext();
  await assertCanManageReleaseReadiness(session);
  const values = createUatEvidenceSchema.parse(Object.fromEntries(formData));
  const notes = normalizeOptionalText(values.notes);
  const policyVersion = normalizeOptionalText(values.policyVersion);
  const defectReference = normalizeOptionalText(values.defectReference);
  const executedAt = normalizeExecutedAt(values.executedAt);

  await prisma.$transaction(async (tx) => {
    const record = await tx.uatEvidenceRecord.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        evidenceType: values.evidenceType,
        title: values.title,
        workflowArea: values.workflowArea,
        testerName: values.testerName,
        environment: values.environment,
        evidenceReference: values.evidenceReference,
        result: values.result,
        executedAt,
        policyVersion,
        defectReference,
        notes,
        createdByUserId: session.user.id,
        sourceDecisionId: "DEC-0036",
      },
    });

    await tx.auditEvent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        actorUserId: session.user.id,
        eventType: "uat_evidence.recorded",
        entityType: "UatEvidenceRecord",
        entityId: record.id,
        afterData: {
          evidenceType: record.evidenceType,
          title: record.title,
          workflowArea: record.workflowArea,
          testerName: record.testerName,
          environment: record.environment,
          evidenceReference: record.evidenceReference,
          result: record.result,
          executedAt: record.executedAt.toISOString(),
          policyVersion: record.policyVersion,
          defectReference: record.defectReference,
          verificationStatus: record.verificationStatus,
          sourceDecisionId: record.sourceDecisionId,
        },
        metadata: {
          reason: values.reason,
          sourceDecisionId: "DEC-0036",
        },
      },
    });
  });
}

export async function updateUatEvidenceStatus(formData: FormData) {
  const session = await requireSessionContext();
  await assertCanManageReleaseReadiness(session);
  const values = updateUatEvidenceStatusSchema.parse(
    Object.fromEntries(formData),
  );

  await prisma.$transaction(async (tx) => {
    const existing = await tx.uatEvidenceRecord.findFirst({
      where: {
        id: values.evidenceId,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
      },
    });

    if (!existing) {
      throw new Error("UAT_EVIDENCE_NOT_FOUND");
    }
    if (existing.createdByUserId === session.user.id) {
      throw new Error("UAT_EVIDENCE_SELF_VERIFICATION_BLOCKED");
    }
    if (existing.verificationStatus !== "RECORDED") {
      throw new Error("UAT_EVIDENCE_NOT_RECORDED");
    }

    const now = new Date();
    const saved = await tx.uatEvidenceRecord.update({
      where: { id: existing.id },
      data:
        values.status === "VERIFIED"
          ? {
              verificationStatus: "VERIFIED",
              verifiedAt: now,
              verifiedByUserId: session.user.id,
              rejectedAt: null,
              rejectedByUserId: null,
            }
          : {
              verificationStatus: "REJECTED",
              rejectedAt: now,
              rejectedByUserId: session.user.id,
              verifiedAt: null,
              verifiedByUserId: null,
            },
    });

    await tx.auditEvent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        actorUserId: session.user.id,
        eventType:
          values.status === "VERIFIED"
            ? "uat_evidence.verified"
            : "uat_evidence.rejected",
        entityType: "UatEvidenceRecord",
        entityId: saved.id,
        beforeData: {
          verificationStatus: existing.verificationStatus,
        },
        afterData: {
          evidenceType: saved.evidenceType,
          result: saved.result,
          verificationStatus: saved.verificationStatus,
          verifiedAt: saved.verifiedAt?.toISOString() ?? null,
          rejectedAt: saved.rejectedAt?.toISOString() ?? null,
        },
        metadata: {
          reason: values.reason,
          sourceDecisionId: "DEC-0036",
        },
      },
    });
  });
}

export async function createEnablementEvidenceRecord(formData: FormData) {
  const session = await requireSessionContext();
  await assertCanManageReleaseReadiness(session);
  const values = createEnablementEvidenceSchema.parse(
    Object.fromEntries(formData),
  );
  const notes = normalizeOptionalText(values.notes);
  const completedAt = normalizeCompletedAt(values.completedAt);
  const knownLimitAcknowledged = values.knownLimitAcknowledged === "on";
  const supportRouteConfirmed = values.supportRouteConfirmed === "on";

  await prisma.$transaction(async (tx) => {
    const record = await tx.enablementEvidenceRecord.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        evidenceType: values.evidenceType,
        title: values.title,
        audienceRole: values.audienceRole,
        evidenceReference: values.evidenceReference,
        ownerName: values.ownerName,
        completedAt,
        knownLimitAcknowledged,
        supportRouteConfirmed,
        notes,
        createdByUserId: session.user.id,
        sourceDecisionId: "DEC-0036",
      },
    });

    await tx.auditEvent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        actorUserId: session.user.id,
        eventType: "enablement_evidence.recorded",
        entityType: "EnablementEvidenceRecord",
        entityId: record.id,
        afterData: {
          evidenceType: record.evidenceType,
          title: record.title,
          audienceRole: record.audienceRole,
          evidenceReference: record.evidenceReference,
          ownerName: record.ownerName,
          completedAt: record.completedAt.toISOString(),
          knownLimitAcknowledged: record.knownLimitAcknowledged,
          supportRouteConfirmed: record.supportRouteConfirmed,
          verificationStatus: record.verificationStatus,
          sourceDecisionId: record.sourceDecisionId,
        },
        metadata: {
          reason: values.reason,
          sourceDecisionId: "DEC-0036",
        },
      },
    });
  });
}

export async function updateEnablementEvidenceStatus(formData: FormData) {
  const session = await requireSessionContext();
  await assertCanManageReleaseReadiness(session);
  const values = updateEnablementEvidenceStatusSchema.parse(
    Object.fromEntries(formData),
  );

  await prisma.$transaction(async (tx) => {
    const existing = await tx.enablementEvidenceRecord.findFirst({
      where: {
        id: values.evidenceId,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
      },
    });

    if (!existing) {
      throw new Error("ENABLEMENT_EVIDENCE_NOT_FOUND");
    }
    if (existing.createdByUserId === session.user.id) {
      throw new Error("ENABLEMENT_EVIDENCE_SELF_VERIFICATION_BLOCKED");
    }
    if (existing.verificationStatus !== "RECORDED") {
      throw new Error("ENABLEMENT_EVIDENCE_NOT_RECORDED");
    }

    const now = new Date();
    const saved = await tx.enablementEvidenceRecord.update({
      where: { id: existing.id },
      data:
        values.status === "VERIFIED"
          ? {
              verificationStatus: "VERIFIED",
              verifiedAt: now,
              verifiedByUserId: session.user.id,
              rejectedAt: null,
              rejectedByUserId: null,
            }
          : {
              verificationStatus: "REJECTED",
              rejectedAt: now,
              rejectedByUserId: session.user.id,
              verifiedAt: null,
              verifiedByUserId: null,
            },
    });

    await tx.auditEvent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        actorUserId: session.user.id,
        eventType:
          values.status === "VERIFIED"
            ? "enablement_evidence.verified"
            : "enablement_evidence.rejected",
        entityType: "EnablementEvidenceRecord",
        entityId: saved.id,
        beforeData: {
          verificationStatus: existing.verificationStatus,
        },
        afterData: {
          evidenceType: saved.evidenceType,
          verificationStatus: saved.verificationStatus,
          verifiedAt: saved.verifiedAt?.toISOString() ?? null,
          rejectedAt: saved.rejectedAt?.toISOString() ?? null,
        },
        metadata: {
          reason: values.reason,
          sourceDecisionId: "DEC-0036",
        },
      },
    });
  });
}

export async function updateDeploymentEvidenceStatus(formData: FormData) {
  const session = await requireSessionContext();
  await assertCanManageReleaseReadiness(session);
  const values = updateDeploymentEvidenceStatusSchema.parse(
    Object.fromEntries(formData),
  );

  await prisma.$transaction(async (tx) => {
    const existing = await tx.deploymentEvidenceRecord.findFirst({
      where: {
        id: values.evidenceId,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
      },
    });

    if (!existing) {
      throw new Error("DEPLOYMENT_EVIDENCE_NOT_FOUND");
    }
    if (existing.createdByUserId === session.user.id) {
      throw new Error("DEPLOYMENT_EVIDENCE_SELF_VERIFICATION_BLOCKED");
    }
    if (existing.verificationStatus !== "RECORDED") {
      throw new Error("DEPLOYMENT_EVIDENCE_NOT_RECORDED");
    }

    const now = new Date();
    const saved = await tx.deploymentEvidenceRecord.update({
      where: { id: existing.id },
      data:
        values.status === "VERIFIED"
          ? {
              verificationStatus: "VERIFIED",
              verifiedAt: now,
              verifiedByUserId: session.user.id,
              rejectedAt: null,
              rejectedByUserId: null,
            }
          : {
              verificationStatus: "REJECTED",
              rejectedAt: now,
              rejectedByUserId: session.user.id,
              verifiedAt: null,
              verifiedByUserId: null,
            },
    });

    await tx.auditEvent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        actorUserId: session.user.id,
        eventType:
          values.status === "VERIFIED"
            ? "deployment_evidence.verified"
            : "deployment_evidence.rejected",
        entityType: "DeploymentEvidenceRecord",
        entityId: saved.id,
        beforeData: {
          verificationStatus: existing.verificationStatus,
        },
        afterData: {
          evidenceType: saved.evidenceType,
          verificationStatus: saved.verificationStatus,
          verifiedAt: saved.verifiedAt?.toISOString() ?? null,
          rejectedAt: saved.rejectedAt?.toISOString() ?? null,
        },
        metadata: {
          reason: values.reason,
          sourceDecisionId: "DEC-0036",
        },
      },
    });
  });
}

export async function listReleaseBoardDecisions(session: SessionContext) {
  await requirePermission(session, permissions.coreAdminister);

  return prisma.releaseBoardDecision.findMany({
    where: {
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
    },
    include: {
      chairUser: { select: { displayName: true, email: true } },
    },
    orderBy: [{ decidedAt: "desc" }, { createdAt: "desc" }],
  });
}

async function getLatestReleaseBoardDecision(session: SessionContext) {
  await requirePermission(session, permissions.coreAdminister);

  return prisma.releaseBoardDecision.findFirst({
    where: {
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
    },
    orderBy: [{ decidedAt: "desc" }, { createdAt: "desc" }],
  });
}

async function assertGoNoGoGateDecision(
  session: SessionContext,
  definition: ReleaseReadinessGateDefinition,
  status: ReleaseReadinessStatus,
) {
  if (definition.gateKey !== "go_no_go.release_board_decision") {
    return;
  }
  if (
    status !== "READY" &&
    status !== "CONDITIONAL_GO" &&
    status !== "WAIVED"
  ) {
    return;
  }

  const latestDecision = await getLatestReleaseBoardDecision(session);
  if (!latestDecision) {
    throw new Error("RELEASE_BOARD_DECISION_REQUIRED");
  }
  if (status === "WAIVED" && latestDecision.decision !== "HOLD") {
    throw new Error("RELEASE_BOARD_WAIVER_DECISION_REQUIRED");
  }
  if (status === "READY" && latestDecision.decision !== "GO") {
    throw new Error("RELEASE_BOARD_GO_DECISION_REQUIRED");
  }
  if (
    status === "CONDITIONAL_GO" &&
    latestDecision.decision !== "CONDITIONAL_GO"
  ) {
    throw new Error("RELEASE_BOARD_CONDITIONAL_DECISION_REQUIRED");
  }
}

export async function createReleaseBoardDecision(formData: FormData) {
  const session = await requireSessionContext();
  await assertCanManageReleaseReadiness(session);
  const values = releaseBoardDecisionSchema.parse(Object.fromEntries(formData));
  const decidedAt = normalizeDecidedAt(values.decidedAt);
  const gates = await listReleaseReadinessGates(session);
  const summary = summarizeReleaseReadiness(gates);

  if (values.decision === "GO" && !summary.canProceed) {
    throw new Error("RELEASE_BOARD_READY_GATES_REQUIRED");
  }

  const participants = values.participants
    .split(/\r?\n|,/)
    .map((participant) => participant.trim())
    .filter(Boolean);

  await prisma.$transaction(async (tx) => {
    const decision = await tx.releaseBoardDecision.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        decision: values.decision,
        evidenceReference: values.evidenceReference,
        decisionNote: values.decisionNote,
        participants,
        decidedAt,
        chairUserId: session.user.id,
        sourceDecisionId: "DEC-0036",
      },
    });

    await tx.auditEvent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        actorUserId: session.user.id,
        eventType: "release_board_decision.recorded",
        entityType: "ReleaseBoardDecision",
        entityId: decision.id,
        afterData: {
          decision: decision.decision,
          evidenceReference: decision.evidenceReference,
          decidedAt: decision.decidedAt.toISOString(),
          participants,
          sourceDecisionId: decision.sourceDecisionId,
        },
        metadata: {
          reason: values.reason,
          sourceDecisionId: "DEC-0036",
        },
      },
    });
  });
}

export async function buildReleaseReadinessExportRows(
  session: SessionContext,
): Promise<CsvRow[]> {
  await requirePermission(session, permissions.coreAdminister);

  const [
    gates,
    uatEvidenceRecords,
    deploymentEvidenceRecords,
    enablementEvidenceRecords,
    securityEvidenceSummary,
    releaseBoardDecisions,
  ] = await Promise.all([
    listReleaseReadinessGates(session),
    listUatEvidenceRecords(session),
    listDeploymentEvidenceRecords(session),
    listEnablementEvidenceRecords(session),
    getReleaseSecurityEvidenceSummary(session),
    listReleaseBoardDecisions(session),
  ]);
  const readinessSummary = summarizeReleaseReadiness(gates);
  const uatSummary = summarizeUatEvidence(uatEvidenceRecords);
  const deploymentSummary = summarizeDeploymentEvidence(
    deploymentEvidenceRecords,
  );
  const enablementSummary = summarizeEnablementEvidence(
    enablementEvidenceRecords,
  );

  return [
    [
      "Section",
      "Metric",
      "Value",
      "Status",
      "Evidence Reference",
      "Owner / Actor",
      "Notes",
    ],
    [
      "Readiness summary",
      "Required gates",
      readinessSummary.required,
      readinessSummary.canProceed ? "CAN_PROCEED_TO_FINAL_REVIEW" : "BLOCKED",
      "",
      "",
      `ready=${readinessSummary.ready}; blocking=${readinessSummary.blocking}; hold=${readinessSummary.hold}`,
    ],
    [
      "UAT evidence summary",
      "Verified UAT records",
      uatSummary.verified,
      uatSummary.ready ? "READY" : "UNRESOLVED",
      "",
      "",
      `missing=${uatSummary.missingTypes.join("|") || "none"}; unresolvedResults=${uatSummary.unresolvedResultCount}`,
    ],
    [
      "UAT evidence summary",
      "Phase 3 finance controlled foundation",
      uatSummary.phase3FinanceReady ? "covered" : "missing",
      uatSummary.phase3FinanceReady ? "READY" : "UNRESOLVED",
      "",
      "",
      "Requires verified PASS/RETEST_PASS/WAIVED scenario execution and acceptance-matrix evidence for Phase 3 finance controlled-foundation workflow areas.",
    ],
    [
      "UAT evidence summary",
      "Phase 3 workforce controlled foundation",
      uatSummary.phase3WorkforceReady ? "covered" : "missing",
      uatSummary.phase3WorkforceReady ? "READY" : "UNRESOLVED",
      "",
      "",
      "Requires verified PASS/RETEST_PASS/WAIVED scenario execution and acceptance-matrix evidence for Phase 3 workforce controlled-foundation workflow areas.",
    ],
    [
      "UAT evidence summary",
      "Phase 3 deferred blockers reviewed",
      uatSummary.phase3DeferredBlockerReviewReady ? "covered" : "missing",
      uatSummary.phase3DeferredBlockerReviewReady ? "READY" : "UNRESOLVED",
      "",
      "",
      "Requires verified defect-disposition and default-revision evidence referencing the Phase 3 deferred/skipped blocker register.",
    ],
    [
      "Deployment evidence summary",
      "Verified deployment records",
      deploymentSummary.verified,
      deploymentSummary.migrationGateReady &&
      deploymentSummary.monitoringGateReady
        ? "READY"
        : "UNRESOLVED",
      "",
      "",
      `missingMigration=${deploymentSummary.missingMigrationGateTypes.join("|") || "none"}; missingMonitoring=${deploymentSummary.missingMonitoringGateTypes.join("|") || "none"}`,
    ],
    [
      "Enablement evidence summary",
      "Verified enablement records",
      enablementSummary.verified,
      enablementSummary.trainingGateReady && enablementSummary.kbGateReady
        ? "READY"
        : "UNRESOLVED",
      "",
      "",
      `missingTraining=${enablementSummary.missingTrainingGateTypes.join("|") || "none"}; missingKb=${enablementSummary.missingKbGateTypes.join("|") || "none"}`,
    ],
    [
      "Security evidence summary",
      "Privileged MFA coverage",
      `${securityEvidenceSummary.verifiedMfaUserCount}/${securityEvidenceSummary.privilegedUserCount}`,
      securityEvidenceSummary.readyForStrictMfa ? "READY" : "UNRESOLVED",
      "",
      "",
      `pendingMfa=${securityEvidenceSummary.pendingMfaUserCount}; missingOrRevokedMfa=${securityEvidenceSummary.missingOrRevokedMfaUserCount}; missingLocalIdentities=${securityEvidenceSummary.missingLocalIdentityUserCount}; pendingAuthRecovery=${securityEvidenceSummary.pendingAuthRecoveryRequestCount}; pendingProviderInvalidations=${securityEvidenceSummary.pendingProviderInvalidationCount}; openBreakGlass=${securityEvidenceSummary.openBreakGlassCount}; breakGlassReviewDue=${securityEvidenceSummary.breakGlassPostReviewDueCount}; pendingControlledAccess=${securityEvidenceSummary.pendingControlledAccessRequestCount}; pendingHighRiskScopes=${securityEvidenceSummary.pendingHighRiskScopeRequestCount}; pendingSensitiveRoles=${securityEvidenceSummary.pendingSensitiveRoleRequestCount}`,
    ],
    [
      "Security proof target",
      "External MFA provider proof",
      "external-security/mfa-provider-enrollment-and-runtime-proof.<approved-extension>",
      "REQUIRED",
      "External provider/vault reference",
      "Security Owner / IT Owner",
      "Must include matching Evidence run ID and RESULT | PASS | External security proof captured.",
    ],
    [
      "Security proof target",
      "External IdP session invalidation proof",
      "external-security/idp-session-invalidation-proof.<approved-extension>",
      "REQUIRED",
      "External provider/vault reference",
      "Security Owner / IT Owner",
      "Must include matching Evidence run ID and RESULT | PASS | External security proof captured.",
    ],
    [
      "Security proof target",
      "External evidence storage index",
      "external-security/vault-or-artifact-storage-index.<approved-extension>",
      "REQUIRED",
      "External provider/vault reference",
      "Security Owner / Release Manager",
      "Must include matching Evidence run ID and RESULT | PASS | External security proof captured.",
    ],
    [
      "Security proof target",
      "External break-glass review proof",
      "external-security/break-glass-review-and-revocation-proof.<approved-extension>",
      "REQUIRED",
      "External provider/vault reference",
      "Security Owner / IT Owner",
      "Must include matching Evidence run ID and RESULT | PASS | External security proof captured.",
    ],
    [],
    [
      "Section",
      "Gate Key",
      "Title",
      "Category",
      "Required",
      "Status",
      "Evidence Reference",
      "Decision Note",
      "Blocker",
      "Owner Role",
      "Signed Off At",
    ],
    ...gates.map((gate) => [
      "Gate register",
      gate.gateKey,
      gate.title,
      gate.category,
      gate.requiredByPolicy,
      gate.status,
      gate.evidenceReference,
      gate.decisionNote,
      gate.blockerSummary,
      gate.ownerRole,
      gate.signedOffAt,
    ]),
    [],
    [
      "Section",
      "Evidence Type",
      "Title",
      "Workflow / Environment",
      "Result",
      "Status",
      "Evidence Reference",
      "Owner / Actor",
      "Recorded By",
      "Verified By",
      "Rejected By",
    ],
    ...uatEvidenceRecords.map((record) => [
      "UAT evidence",
      record.evidenceType,
      record.title,
      `${record.workflowArea} / ${record.environment}`,
      record.result,
      record.verificationStatus,
      record.evidenceReference,
      record.testerName,
      displayUser(record.createdByUser),
      record.verifiedByUser ? displayUser(record.verifiedByUser) : "",
      record.rejectedByUser ? displayUser(record.rejectedByUser) : "",
    ]),
    ...deploymentEvidenceRecords.map((record) => [
      "Deployment evidence",
      record.evidenceType,
      record.title,
      record.environment,
      "",
      record.verificationStatus,
      record.evidenceReference,
      record.performedBy,
      displayUser(record.createdByUser),
      record.verifiedByUser ? displayUser(record.verifiedByUser) : "",
      record.rejectedByUser ? displayUser(record.rejectedByUser) : "",
    ]),
    ...enablementEvidenceRecords.map((record) => [
      "Enablement evidence",
      record.evidenceType,
      record.title,
      record.audienceRole,
      "",
      record.verificationStatus,
      record.evidenceReference,
      record.ownerName,
      displayUser(record.createdByUser),
      record.verifiedByUser ? displayUser(record.verifiedByUser) : "",
      record.rejectedByUser ? displayUser(record.rejectedByUser) : "",
    ]),
    [],
    [
      "Section",
      "Decision",
      "Evidence Reference",
      "Chair",
      "Decided At",
      "Participants",
      "Decision Note",
    ],
    ...releaseBoardDecisions.map((decision) => [
      "Release Board decision",
      decision.decision,
      decision.evidenceReference,
      displayUser(decision.chairUser),
      decision.decidedAt.toISOString(),
      formatReleaseBoardParticipants(decision.participants),
      decision.decisionNote,
    ]),
  ];
}

export async function updateReleaseReadinessGate(formData: FormData) {
  const session = await requireSessionContext();
  await assertCanManageReleaseReadiness(session);
  const values = updateReleaseReadinessGateSchema.parse(
    Object.fromEntries(formData),
  );
  const definition = findGateDefinition(values.gateKey);
  const evidenceReference = normalizeOptionalText(values.evidenceReference);
  const decisionNote = normalizeOptionalText(values.decisionNote);
  const blockerSummary = normalizeOptionalText(values.blockerSummary);
  const targetDate = normalizeTargetDate(values.targetDate);
  const policyFlags = await getReleaseReadinessPolicyFlags(session);
  const requiredByPolicy = definition.policyFlag
    ? policyFlags[definition.policyFlag]
    : true;

  if (requiresEvidenceForStatus(values.status) && !evidenceReference) {
    throw new Error("RELEASE_READINESS_EVIDENCE_REQUIRED");
  }
  if (
    (values.status === "CONDITIONAL_GO" || values.status === "WAIVED") &&
    !decisionNote
  ) {
    throw new Error("RELEASE_READINESS_DECISION_NOTE_REQUIRED");
  }
  if (
    requiresDecisionNoteForStatus(definition, values.status) &&
    !decisionNote
  ) {
    throw new Error("RELEASE_READINESS_UAT_SIGNOFF_REQUIRED");
  }
  if (values.status === "HOLD" && !blockerSummary) {
    throw new Error("RELEASE_READINESS_BLOCKER_SUMMARY_REQUIRED");
  }
  await assertUatGateReadyEvidence(session, definition, values.status);
  await assertDeploymentGateReadyEvidence(session, definition, values.status);
  await assertEnablementGateReadyEvidence(session, definition, values.status);
  await assertSecurityGateReadyEvidence(session, definition, values.status);
  await assertGoNoGoGateDecision(session, definition, values.status);

  await prisma.$transaction(async (tx) => {
    const existing = await tx.releaseReadinessGate.findUnique({
      where: {
        companyId_gateKey: {
          companyId: session.context.companyId,
          gateKey: definition.gateKey,
        },
      },
    });

    const signedOffAt = requiresEvidenceForStatus(values.status)
      ? new Date()
      : null;
    const signedOffByUserId = requiresEvidenceForStatus(values.status)
      ? session.user.id
      : null;

    const saved = existing
      ? await tx.releaseReadinessGate.update({
          where: { id: existing.id },
          data: {
            category: definition.category,
            title: definition.title,
            description: definition.description,
            ownerRole: definition.ownerRole,
            status: values.status,
            requiredByPolicy,
            evidenceReference,
            decisionNote,
            blockerSummary,
            targetDate,
            signedOffAt,
            signedOffByUserId,
            sourceDecisionId: "DEC-0036",
          },
        })
      : await tx.releaseReadinessGate.create({
          data: {
            tenantId: session.context.tenantId,
            companyId: session.context.companyId,
            gateKey: definition.gateKey,
            category: definition.category,
            title: definition.title,
            description: definition.description,
            ownerRole: definition.ownerRole,
            status: values.status,
            requiredByPolicy,
            evidenceReference,
            decisionNote,
            blockerSummary,
            targetDate,
            signedOffAt,
            signedOffByUserId,
            sourceDecisionId: "DEC-0036",
          },
        });

    await tx.auditEvent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        actorUserId: session.user.id,
        eventType: existing
          ? "release_readiness_gate.updated"
          : "release_readiness_gate.created",
        entityType: "ReleaseReadinessGate",
        entityId: saved.id,
        ...(existing
          ? {
              beforeData: {
                gateKey: existing.gateKey,
                status: existing.status,
                evidenceReference: existing.evidenceReference,
                decisionNote: existing.decisionNote,
                blockerSummary: existing.blockerSummary,
                requiredByPolicy: existing.requiredByPolicy,
              },
            }
          : {}),
        afterData: {
          gateKey: saved.gateKey,
          status: saved.status,
          evidenceReference: saved.evidenceReference,
          decisionNote: saved.decisionNote,
          blockerSummary: saved.blockerSummary,
          requiredByPolicy: saved.requiredByPolicy,
          sourceDecisionId: saved.sourceDecisionId,
        },
        metadata: {
          reason: values.reason,
          ownerRole: definition.ownerRole,
        },
      },
    });
  });
}
