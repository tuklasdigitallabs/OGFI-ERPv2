import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { buildAuthorizationSurfaceManifest } from "../../../scripts/release-authorization-manifest.mjs";
import {
  authenticationSessionTokenHash,
  clearAuthenticatedRequest,
  configureAuthenticatedRequest,
} from "./authenticatedRequestHarness";
import { assertDisposableAuthorizationDatabaseConfigured } from "./authorizationDatabaseSafety";

const expectedDatabase = assertDisposableAuthorizationDatabaseConfigured(process.env);
const routeModules = import.meta.glob("/src/app/\\(app\\)/**/route.ts", {
  eager: false,
}) as Record<string, () => Promise<{
  GET?: (request: Request, context?: unknown) => Promise<Response>;
}>>;

describe("protected route authorization matrix", () => {
  const suffix = randomUUID().slice(0, 8);
  const ids = {
    tenant: randomUUID(),
    company: randomUUID(),
    location: randomUUID(),
    user: randomUUID(),
    role: randomUUID(),
    session: randomUUID(),
  };
  const sessionToken = `authz-route-${suffix}`;
  let prisma: PrismaClient;

  beforeAll(async () => {
    ({ prisma } = await import("@ogfi/database"));
    await prisma.$connect();
    const identity = await prisma.$queryRaw<Array<{ currentDatabase: string }>>`
      SELECT current_database() AS "currentDatabase"
    `;
    if (identity[0]?.currentDatabase !== expectedDatabase) {
      throw new Error("AUTHORIZATION_DATABASE_IDENTITY_MISMATCH");
    }
    await prisma.tenant.create({ data: { id: ids.tenant, name: `Route Matrix ${suffix}`, loginCode: `route-${suffix}` } });
    await prisma.company.create({ data: { id: ids.company, tenantId: ids.tenant, code: `RT-${suffix}`, legalName: `Route Matrix ${suffix}`, currencyCode: "PHP" } });
    await prisma.location.create({ data: { id: ids.location, tenantId: ids.tenant, companyId: ids.company, code: `RT-L-${suffix}`, name: `Route Location ${suffix}`, locationType: "BRANCH" } });
    await prisma.user.create({ data: { id: ids.user, tenantId: ids.tenant, email: `route-${suffix}@example.test`, displayName: "Route Matrix User" } });
    await prisma.role.create({ data: { id: ids.role, tenantId: ids.tenant, code: `ROUTE_${suffix}`, name: "Route Matrix No Permissions" } });
    await prisma.userRoleAssignment.create({ data: { userId: ids.user, roleId: ids.role } });
    await prisma.userScopeAssignment.create({ data: { userId: ids.user, scopeType: "LOCATION", scopeId: ids.location, accessLevel: "VIEW" } });
    await prisma.authSession.create({
      data: {
        id: ids.session,
        tenantId: ids.tenant,
        userId: ids.user,
        tokenHash: authenticationSessionTokenHash(sessionToken),
        status: "ACTIVE",
        assuranceLevel: "PASSWORD",
        privilegeEpochAtIssue: 0,
        idleExpiresAt: new Date(Date.now() + 60 * 60_000),
        absoluteExpiresAt: new Date(Date.now() + 4 * 60 * 60_000),
      },
    });
    configureAuthenticatedRequest({ sessionToken, selectedLocationId: ids.location });
  });

  afterAll(async () => {
    clearAuthenticatedRequest();
    if (!prisma) return;
    await prisma.auditEvent.deleteMany({ where: { tenantId: ids.tenant } });
    await prisma.authSession.deleteMany({ where: { tenantId: ids.tenant } });
    await prisma.userScopeAssignment.deleteMany({ where: { userId: ids.user } });
    await prisma.userRoleAssignment.deleteMany({ where: { userId: ids.user } });
    await prisma.role.deleteMany({ where: { id: ids.role } });
    await prisma.user.deleteMany({ where: { id: ids.user } });
    await prisma.location.deleteMany({ where: { id: ids.location } });
    await prisma.company.deleteMany({ where: { id: ids.company } });
    await prisma.tenant.deleteMany({ where: { id: ids.tenant } });
    await prisma.$disconnect();
  }, 120_000);

  it("AUTHZ-ROUTES-LIVE-PERMISSION-DENIAL-ALL-PROTECTED-GETS", async () => {
    const manifestRoutePaths = buildAuthorizationSurfaceManifest()
      .filter((surface) => ["ROUTE_HANDLER", "EVIDENCE_DOWNLOAD"].includes(surface.surfaceType))
      .map((surface) => surface.id.split("#")[0])
      .filter((routePath) => !routePath.startsWith("app/(auth)/"))
      .sort();
    const loadedRoutePaths = Object.keys(routeModules)
      .map((modulePath) =>
        modulePath.replace(/^\/src\/app\/\\?\(app\\?\)\//, ""),
      )
      .sort();
    expect(loadedRoutePaths).toEqual(manifestRoutePaths);

    for (const [modulePath, loadRouteModule] of Object.entries(routeModules)) {
      const routeModule = await loadRouteModule();
      expect(routeModule.GET, modulePath).toBeTypeOf("function");
      const response = await routeModule.GET!(
        new Request(`http://localhost/${encodeURI(modulePath)}`),
        { params: Promise.resolve({ id: randomUUID() }) },
      );
      const isEvidenceRoute = modulePath.includes("/evidence/");
      expect(response.status, modulePath).toBe(isEvidenceRoute ? 404 : 403);
      expect(response.headers.get("content-disposition"), modulePath).toBeNull();
      expect(response.headers.get("content-type"), modulePath).toContain(
        "application/json",
      );
      const body = await response.text();
      expect(JSON.parse(body), modulePath).toEqual({
        error: isEvidenceRoute
          ? "CONTROLLED_EVIDENCE_ATTACHMENT_NOT_AVAILABLE"
          : "PERMISSION_DENIED",
      });
      expect(body, modulePath).not.toContain(",");
    }
    expect(
      await prisma.auditEvent.count({
        where: {
          tenantId: ids.tenant,
          eventType: {
            in: [
              "report.export_started",
              "report.export_completed",
              "project_report.export_started",
              "project_report.export_completed",
            ],
          },
        },
      }),
    ).toBe(0);
  }, 30_000);

  it("AUTHZ-SIGNOUT-ROUTE-UNTRUSTED-ORIGIN-NO-SESSION-MUTATION", async () => {
    const before = await prisma.authSession.findUniqueOrThrow({
      where: { id: ids.session },
      select: { status: true, revokedAt: true },
    });
    const { POST } = await import("../src/app/(auth)/sign-out/route");
    const response = await POST(
      new Request("http://localhost/sign-out", {
        method: "POST",
        headers: { origin: "https://untrusted.example.test" },
      }) as never,
    );
    expect(response.status).toBe(403);
    expect(
      await prisma.authSession.findUniqueOrThrow({
        where: { id: ids.session },
        select: { status: true, revokedAt: true },
      }),
    ).toEqual(before);
  });
});
