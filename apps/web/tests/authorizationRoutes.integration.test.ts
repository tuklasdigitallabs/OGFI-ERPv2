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

  it("AUTHZ-API-LOOKUP-ROUTES-LIVE-PERMISSION-DENIAL-NO-DISCLOSURE", async () => {
    const [{ GET: getItemOptions }, { GET: getApprovedRecommendations }, { GET: getDraftLookup }] = await Promise.all([
      import("../src/app/api/items/option-catalog/route"),
      import("../src/app/api/purchase-orders/approved-recommendations/route"),
      import("../src/app/api/purchase-requests/draft-lookup/route"),
    ]);
    const before = await prisma.auditEvent.count({ where: { tenantId: ids.tenant } });
    const itemDenied = await getItemOptions!(new Request("http://localhost/api/items/option-catalog?kind=item&query=ab"));
    expect(itemDenied.status).toBe(403);
    expect(await itemDenied.json()).toEqual({ code: "OPTION_LOOKUP_DENIED" });
    const recommendationDenied = await getApprovedRecommendations!(new Request("http://localhost/api/purchase-orders/approved-recommendations"));
    expect(recommendationDenied.status).toBe(403);
    expect(await recommendationDenied.json()).toEqual({ code: "LOOKUP_DENIED" });
    const draftDenied = await getDraftLookup!(new Request("http://localhost/api/purchase-requests/draft-lookup?kind=item&query=ab"));
    expect(draftDenied.status).toBe(403);
    expect(await draftDenied.json()).toEqual({ code: "LOOKUP_DENIED" });
    const malformed = await getItemOptions!(new Request("http://localhost/api/items/option-catalog?kind=unknown"));
    expect(malformed.status).toBe(400);
    expect(await malformed.json()).toEqual({ code: "OPTION_INPUT_INVALID" });
    expect(await prisma.auditEvent.count({ where: { tenantId: ids.tenant } })).toBe(before);
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

  it("AUTHZ-ITEM-OPTION-RUNTIME-METRICS-TOKEN-DENIAL-NO-DISCLOSURE-OR-MUTATION", async () => {
    const previousToken = process.env.AUTH_HEALTH_METRICS_TOKEN;
    process.env.AUTH_HEALTH_METRICS_TOKEN =
      "authorization-route-health-token-at-least-32-bytes";
    const beforeAuditCount = await prisma.auditEvent.count({
      where: { tenantId: ids.tenant },
    });
    try {
      const { GET } = await import(
        "../src/app/api/internal/item-option-catalog-metrics/route"
      );
      const response = await GET(
        new Request(
          "http://localhost/api/internal/item-option-catalog-metrics",
        ) as never,
      );
      expect(response.status).toBe(404);
      const body = await response.text();
      expect(body).toContain("ITEM_OPTION_RUNTIME_METRICS_DENIED");
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

  it("AUTHZ-PRODUCTION-AUTH-E2E-PROXY-PROBE-TOKEN-DENIAL-NO-DISCLOSURE-OR-MUTATION", async () => {
    const admittedEnvironment = {
      NODE_ENV: "production",
      APP_ENV: "uat",
      CI: "true",
      AUTH_MODE: "local",
      AUTH_HARDENED_UAT_RUNTIME_ENABLED: "true",
      BOUNDED_INVENTORY_UAT_APPROVAL_WORKLIST_ENABLED: "true",
      APPROVAL_ROUTING_V1_ENABLED: "false",
      OGFI_PRODUCTION_AUTH_E2E_PROBE_TOKEN:
        "authorization-route-proxy-probe-token-at-least-32-bytes",
    } as const;
    const previousEnvironment = new Map(
      Object.keys(admittedEnvironment).map((name) => [name, process.env[name]]),
    );
    for (const [name, value] of Object.entries(admittedEnvironment)) {
      process.env[name] = value;
    }
    const beforeAuditCount = await prisma.auditEvent.count({
      where: { tenantId: ids.tenant },
    });
    try {
      const { GET } = await import(
        "../src/app/api/internal/production-auth-e2e-proxy-probe/route"
      );
      for (const providedToken of [
        undefined,
        "short",
        "incorrect-proxy-probe-token-at-least-32-bytes",
      ]) {
        const headers = new Headers();
        if (providedToken) headers.set("x-ogfi-e2e-probe-token", providedToken);
        const response = await GET(
          new Request(
            "http://localhost/api/internal/production-auth-e2e-proxy-probe",
            { headers },
          ),
        );
        expect(response.status).toBe(404);
        expect(await response.text()).toBe("");
      }
      process.env.APP_ENV = "production";
      const invalidRuntimeResponse = await GET(
        new Request(
          "http://localhost/api/internal/production-auth-e2e-proxy-probe",
          {
            headers: {
              "x-ogfi-e2e-probe-token":
                admittedEnvironment.OGFI_PRODUCTION_AUTH_E2E_PROBE_TOKEN,
            },
          },
        ),
      );
      expect(invalidRuntimeResponse.status).toBe(404);
      expect(await invalidRuntimeResponse.text()).toBe("");
      expect(await prisma.auditEvent.count({ where: { tenantId: ids.tenant } })).toBe(
        beforeAuditCount,
      );
    } finally {
      for (const [name, value] of previousEnvironment) {
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
      }
    }
  });
});
