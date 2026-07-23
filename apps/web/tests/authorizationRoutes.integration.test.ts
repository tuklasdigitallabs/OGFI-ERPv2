import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { buildAuthorizationSurfaceManifest } from "../../../scripts/release-authorization-manifest.mjs";
import {
  authenticationSessionTokenHash,
  clearAuthenticatedRequest,
  configureAuthenticatedRequest,
} from "./authenticatedRequestHarness";
import {
  assertDisposableAuthorizationDatabaseConfigured,
  assertDisposableAuthorizationDatabaseMarker,
} from "./authorizationDatabaseSafety";

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
    balancePermission: randomUUID(),
    ledgerPermission: randomUUID(),
  };
  const sessionToken = `authz-route-${suffix}`;
  let prisma: PrismaClient;

  beforeAll(async () => {
    ({ prisma } = await import("@ogfi/database"));
    await prisma.$connect();
    await assertDisposableAuthorizationDatabaseMarker(prisma, process.env);
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
    const [balancePermission, ledgerPermission] = await Promise.all([
      prisma.permission.upsert({
        where: { code: "inventory.balance.view" },
        update: {},
        create: { id: ids.balancePermission, code: "inventory.balance.view", module: "inventory", action: "balance.view" },
        select: { id: true },
      }),
      prisma.permission.upsert({
        where: { code: "inventory.ledger.view" },
        update: {},
        create: { id: ids.ledgerPermission, code: "inventory.ledger.view", module: "inventory", action: "ledger.view" },
        select: { id: true },
      }),
    ]);
    ids.balancePermission = balancePermission.id;
    ids.ledgerPermission = ledgerPermission.id;
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
    if (prisma) await prisma.$disconnect();
  });

  it("AUTHZ-ROUTES-LIVE-PERMISSION-DENIAL-ALL-PROTECTED-GETS", async () => {
    const manifestRoutePaths = buildAuthorizationSurfaceManifest()
      .filter((surface) => ["ROUTE_HANDLER", "EVIDENCE_DOWNLOAD"].includes(surface.surfaceType))
      .map((surface) => surface.id.split("#")[0])
      .filter((routePath) => !routePath.startsWith("app/(auth)/"))
      // API routes have dedicated evidence or host-internal matrices below;
      // this glob deliberately covers the authenticated /(app) route tree.
      .filter((routePath) => !routePath.startsWith("app/api/"))
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

  it("AUTHZ-INVENTORY-RECONCILIATION-EXPORT-REQUIRES-BOTH-PERMISSIONS", async () => {
    const { GET } = await import(
      "../src/app/(app)/inventory/reconciliation/export/route"
    );
    const cases = [
      { name: "neither", permissionIds: [], expectedStatus: 403 },
      { name: "balance only", permissionIds: [ids.balancePermission], expectedStatus: 403 },
      { name: "ledger only", permissionIds: [ids.ledgerPermission], expectedStatus: 403 },
      { name: "both", permissionIds: [ids.balancePermission, ids.ledgerPermission], expectedStatus: 200 },
    ];

    try {
      for (const testCase of cases) {
        await prisma.rolePermission.deleteMany({ where: { roleId: ids.role } });
        if (testCase.permissionIds.length > 0) {
          await prisma.rolePermission.createMany({
            data: testCase.permissionIds.map((permissionId) => ({
              roleId: ids.role,
              permissionId,
            })),
          });
        }
        const response = await GET(
          new Request(
            "http://localhost/inventory/reconciliation/export?dashboard=ledger-variance-v1",
          ),
        );
        expect(response.status, testCase.name).toBe(testCase.expectedStatus);
        if (testCase.expectedStatus === 403) {
          expect(await response.json(), testCase.name).toEqual({
            error: "PERMISSION_DENIED",
          });
        } else {
          expect(response.headers.get("content-type"), testCase.name).toContain(
            "text/csv",
          );
        }
      }
    } finally {
      await prisma.rolePermission.deleteMany({ where: { roleId: ids.role } });
    }
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

  it("AUTHZ-AUTH-RUNTIME-METRICS-TOKEN-DENIAL-NO-DISCLOSURE-OR-MUTATION", async () => {
    const previousToken = process.env.AUTH_HEALTH_METRICS_TOKEN;
    process.env.AUTH_HEALTH_METRICS_TOKEN =
      "authorization-route-health-token-at-least-32-bytes";
    const beforeAuditCount = await prisma.auditEvent.count({
      where: { tenantId: ids.tenant },
    });
    try {
      const { GET } = await import(
        "../src/app/api/internal/authentication-metrics/route"
      );
      const response = await GET(
        new Request(
          "http://localhost/api/internal/authentication-metrics",
        ) as never,
      );
      expect(response.status).toBe(404);
      const body = await response.text();
      expect(body).toContain("AUTH_RUNTIME_METRICS_DENIED");
      expect(body).not.toContain(process.env.AUTH_HEALTH_METRICS_TOKEN);
      expect(await prisma.auditEvent.count({ where: { tenantId: ids.tenant } })).toBe(
        beforeAuditCount,
      );
    } finally {
      if (previousToken === undefined) {
        delete process.env.AUTH_HEALTH_METRICS_TOKEN;
      } else {
        process.env.AUTH_HEALTH_METRICS_TOKEN = previousToken;
      }
    }
  });
});
