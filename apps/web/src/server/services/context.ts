import { cookies } from "next/headers";
import { prisma } from "@ogfi/database";
import { getAuthMode, getValidatedSessionPrincipal } from "./authentication";

export type DemoUser = {
  id: string;
  email: string;
  displayName: string;
  role: string;
};

export type AuthorizedContext = {
  tenantId: string;
  companyId: string;
  companyName: string;
  brandId: string;
  brandName: string;
  locationId: string;
  locationName: string;
  locationType: "BRANCH" | "WAREHOUSE";
};

export type AuthorizedLocationContext = AuthorizedContext & {
  scopeAssignmentId: string;
  accessLevel: "VIEW" | "OPERATE" | "APPROVE" | "MANAGE";
};

export type SessionContext = {
  user: DemoUser;
  context: AuthorizedContext;
  authorizedLocations: AuthorizedLocationContext[];
  permissionCodes: string[];
  authentication?: {
    sessionId: string;
    assuranceLevel: string;
    mfaAuthenticatedAt: Date | null;
    absoluteExpiresAt: Date;
  };
};

const defaultRequesterEmail =
  process.env.DEMO_USER_EMAIL ?? "storekeeper.bgc@ogfi.example";
const defaultApproverEmail =
  process.env.DEMO_APPROVER_EMAIL ?? "ops.approver@ogfi.example";
const defaultAdminEmail =
  process.env.DEMO_ADMIN_EMAIL ?? "erp.admin@ogfi.example";
const defaultSuperUserEmail =
  process.env.DEMO_SUPER_USER_EMAIL ?? "super.admin@ogfi.example";
const seededDemoUserIds = {
  requester: "00000000-0000-4000-8000-000000000005",
  approver: "00000000-0000-4000-8000-000000000012",
  admin: "00000000-0000-4000-8000-000000000014",
  superUser: "00000000-0000-4000-8000-000000000991",
} as const;
const legacyDemoEmailAliases = new Map([
  ["user@example.test", defaultRequesterEmail],
  ["approver@example.test", defaultApproverEmail],
  ["admin@example.test", defaultAdminEmail],
  ["super@example.test", defaultSuperUserEmail],
]);

function resolveDemoEmail(email: string) {
  return legacyDemoEmailAliases.get(email) ?? email;
}

function resolveSeededDemoUserId(email: string) {
  const resolvedEmail = resolveDemoEmail(email);
  if (
    resolvedEmail === defaultRequesterEmail ||
    email === "user@example.test"
  ) {
    return seededDemoUserIds.requester;
  }
  if (
    resolvedEmail === defaultApproverEmail ||
    email === "approver@example.test"
  ) {
    return seededDemoUserIds.approver;
  }
  if (resolvedEmail === defaultAdminEmail || email === "admin@example.test") {
    return seededDemoUserIds.admin;
  }
  if (
    resolvedEmail === defaultSuperUserEmail ||
    email === "super@example.test"
  ) {
    return seededDemoUserIds.superUser;
  }
  return null;
}

export function resolveAuthorizedLocationContext(
  authorizedLocations: AuthorizedLocationContext[],
  selectedLocationId?: string,
) {
  const selectedContext =
    authorizedLocations.find(
      (location) => location.locationId === selectedLocationId,
    ) ?? authorizedLocations[0];

  if (!selectedContext) {
    throw new Error("SEEDED_LOCATION_CONTEXT_NOT_FOUND");
  }

  return selectedContext;
}

export function getConfiguredContextFallback(): SessionContext {
  return {
    user: {
      id: "00000000-0000-4000-8000-000000000005",
      email: defaultRequesterEmail,
      displayName: "Bianca Reyes",
      role: "Branch Storekeeper",
    },
    context: {
      tenantId: "00000000-0000-4000-8000-000000000001",
      companyId: "00000000-0000-4000-8000-000000000002",
      companyName: process.env.DEMO_COMPANY_NAME ?? "OGFI Foods Corporation",
      brandId: "00000000-0000-4000-8000-000000000003",
      brandName: process.env.DEMO_BRAND_NAME ?? "Golden Spoon Bistro",
      locationId: "00000000-0000-4000-8000-000000000004",
      locationName: process.env.DEMO_LOCATION_NAME ?? "Golden Spoon - BGC",
      locationType: "BRANCH",
    },
    authorizedLocations: [
      {
        tenantId: "00000000-0000-4000-8000-000000000001",
        companyId: "00000000-0000-4000-8000-000000000002",
        companyName: process.env.DEMO_COMPANY_NAME ?? "OGFI Foods Corporation",
        brandId: "00000000-0000-4000-8000-000000000003",
        brandName: process.env.DEMO_BRAND_NAME ?? "Golden Spoon Bistro",
        locationId: "00000000-0000-4000-8000-000000000004",
        locationName: process.env.DEMO_LOCATION_NAME ?? "Golden Spoon - BGC",
        locationType: "BRANCH",
        scopeAssignmentId: "fallback",
        accessLevel: "OPERATE",
      },
    ],
    permissionCodes: [
      "purchasing.purchase_request.create",
      "purchasing.purchase_request.submit",
    ],
  };
}

export function assertSessionFresh(input: {
  userUpdatedAt: Date;
  sessionIssuedAt?: string;
}) {
  if (!input.sessionIssuedAt) {
    throw new Error("SESSION_REVALIDATION_REQUIRED");
  }
  const issuedAt = new Date(input.sessionIssuedAt);
  if (Number.isNaN(issuedAt.getTime())) {
    throw new Error("SESSION_REVALIDATION_REQUIRED");
  }
  if (input.userUpdatedAt.getTime() > issuedAt.getTime() + 1000) {
    throw new Error("SESSION_REVALIDATION_REQUIRED");
  }
}

export async function getConfiguredContext(
  email = defaultRequesterEmail,
  selectedLocationId?: string,
  sessionIssuedAt?: string,
  authenticatedUserId?: string,
): Promise<SessionContext> {
  const now = new Date();
  const resolvedEmail = resolveDemoEmail(email);
  const seededUserId = resolveSeededDemoUserId(email);
  const user = await prisma.user.findFirst({
    where: authenticatedUserId
      ? { id: authenticatedUserId, status: "ACTIVE" }
      : {
          status: "ACTIVE",
          OR: [
            { email: resolvedEmail },
            ...(seededUserId ? [{ id: seededUserId }] : []),
          ],
        },
    include: {
      roleAssignments: {
        where: {
          status: "ACTIVE",
          startsAt: { lte: now },
          OR: [{ endsAt: null }, { endsAt: { gt: now } }],
        },
        include: {
          role: {
            include: {
              permissions: {
                include: {
                  permission: true,
                },
              },
            },
          },
        },
      },
      scopeAssignments: {
        where: {
          status: "ACTIVE",
          scopeType: "LOCATION",
          AND: [
            { startsAt: { lte: now } },
            { OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
          ],
        },
        orderBy: { startsAt: "asc" },
      },
    },
  });

  if (!user || user.scopeAssignments.length === 0) {
    throw new Error("SEEDED_USER_CONTEXT_NOT_FOUND");
  }
  if (sessionIssuedAt) {
    assertSessionFresh({
      userUpdatedAt: user.updatedAt,
      sessionIssuedAt,
    });
  }

  const locationIds = user.scopeAssignments.map((scope) => scope.scopeId);
  const locations = await prisma.location.findMany({
    where: {
      id: { in: locationIds },
      tenantId: user.tenantId,
      status: "ACTIVE",
    },
    include: {
      brand: true,
      company: true,
    },
  });

  const authorizedLocations: AuthorizedLocationContext[] = [];
  for (const scope of user.scopeAssignments) {
    const location = locations.find((record) => record.id === scope.scopeId);
    if (!location) {
      continue;
    }

    authorizedLocations.push({
      tenantId: user.tenantId,
      companyId: location.companyId,
      companyName: location.company.tradingName ?? location.company.legalName,
      brandId: location.brandId ?? "",
      brandName: location.brand?.name ?? "Company-wide",
      locationId: location.id,
      locationName: location.name,
      locationType:
        location.locationType === "WAREHOUSE" ? "WAREHOUSE" : "BRANCH",
      scopeAssignmentId: scope.id,
      accessLevel: scope.accessLevel,
    });
  }

  const selectedContext = resolveAuthorizedLocationContext(
    authorizedLocations,
    selectedLocationId,
  );
  const scopedRoleAssignments = user.roleAssignments.filter(
    (assignment) =>
      assignment.role.status === "ACTIVE" &&
      (assignment.role.tenantId === user.tenantId ||
        assignment.role.tenantId === null),
  );

  return {
    user: {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: scopedRoleAssignments[0]?.role.name ?? "Branch Storekeeper",
    },
    context: selectedContext,
    authorizedLocations,
    permissionCodes: Array.from(
      new Set(
        user.roleAssignments.flatMap((assignment) =>
          scopedRoleAssignments.includes(assignment)
            ? assignment.role.permissions
                .filter(
                  (rolePermission) =>
                    rolePermission.permission.tenantId === user.tenantId ||
                    rolePermission.permission.tenantId === null,
                )
                .map((rolePermission) => rolePermission.permission.code)
            : [],
        ),
      ),
    ),
  };
}

export async function getSessionContext() {
  const cookieStore = await cookies();
  if (getAuthMode() === "local") {
    const principal = await getValidatedSessionPrincipal();
    if (!principal) {
      return null;
    }
    const selectedLocationId = cookieStore.get("ogfi_demo_location")?.value;
    const session = await getConfiguredContext(
      "",
      selectedLocationId,
      undefined,
      principal.userId,
    );
    if (session.context.tenantId !== principal.tenantId) {
      return null;
    }
    return {
      ...session,
      authentication: {
        sessionId: principal.sessionId,
        assuranceLevel: principal.assuranceLevel,
        mfaAuthenticatedAt: principal.mfaAuthenticatedAt,
        absoluteExpiresAt: principal.absoluteExpiresAt,
      },
    };
  }
  const signedInEmail = cookieStore.get("ogfi_demo_session")?.value;
  const sessionIssuedAt = cookieStore.get("ogfi_demo_session_issued_at")?.value;
  const selectedLocationId = cookieStore.get("ogfi_demo_location")?.value;
  if (!signedInEmail) {
    return null;
  }
  try {
    return await getConfiguredContext(
      signedInEmail,
      selectedLocationId,
      sessionIssuedAt,
    );
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "SESSION_REVALIDATION_REQUIRED"
    ) {
      return null;
    }
    throw error;
  }
}

export async function requireSessionContext() {
  const session = await getSessionContext();
  if (!session) {
    throw new Error("AUTH_REQUIRED");
  }
  return session;
}

export function assertAuthorizedLocation(
  session: SessionContext,
  locationId: string,
) {
  if (session.context.locationId !== locationId) {
    throw new Error("SCOPE_DENIED");
  }
}
