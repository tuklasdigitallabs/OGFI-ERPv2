import { describe, expect, it } from "vitest";
import {
  analyzeExportedServiceEntrypoints,
  analyzeServerActionDelegations,
  authorizationBoundaryCoverageReport,
  authorizationManifestEvidence,
  assertAuthorizationBoundaryCoverage,
  assertAuthorizationSurfaceBaseline,
  assertNoExportedSynchronousServiceWrites,
  buildAuthorizationSurfaceManifest,
  discoverExportedAsyncServiceEntrypoints,
  discoverServerActionNames,
} from "../../../scripts/release-authorization-manifest.mjs";

describe("authorization surface manifest", () => {
  it("maps direct and aliased service calls to canonical service IDs", () => {
    const known = new Set([
      "server/services/items.ts#createItem",
      "server/services/items.ts#updateItem",
    ]);
    const result = analyzeServerActionDelegations(
      `
        import { createItem, updateItem as saveItem } from "@/server/services/items";
        async function saveAction() {
          "use server";
          await saveItem();
          await createItem();
        }
      `,
      "items/page.tsx",
      known,
    ).get("saveAction");

    expect(result.delegatedServiceIds).toEqual([
      "server/services/items.ts#createItem",
      "server/services/items.ts#updateItem",
    ]);
    expect(result.callChains).toEqual([
      "saveAction -> server/services/items.ts#createItem",
      "saveAction -> server/services/items.ts#updateItem",
    ]);
  });

  it("resolves namespace imports through cycle-safe local helpers", () => {
    const serviceId = "server/services/items.ts#updateItem";
    const result = analyzeServerActionDelegations(
      `
        import * as itemService from "@/server/services/items";
        async function firstHelper() {
          await secondHelper();
        }
        async function secondHelper() {
          await firstHelper();
          await itemService.updateItem();
        }
        async function updateAction() {
          "use server";
          await firstHelper();
        }
      `,
      "items/page.tsx",
      new Set([serviceId]),
    ).get("updateAction");

    expect(result.delegatedServiceIds).toEqual([serviceId]);
    expect(result.callChains).toEqual([
      `updateAction -> firstHelper -> secondHelper -> ${serviceId}`,
    ]);
  });

  it("fails closed for missing or unresolved service delegation", () => {
    expect(() =>
      analyzeServerActionDelegations(
        `
          import { actionErrorRedirectPath } from "@/server/services/actionFeedback";
          async function presentationOnlyAction() {
            "use server";
            actionErrorRedirectPath("/items", new Error());
          }
        `,
        "items/page.tsx",
      ),
    ).toThrow("AUTHORIZATION_SERVER_ACTION_NO_SERVICE_DELEGATION");

    expect(() =>
      analyzeServerActionDelegations(
        `
          import { missingService } from "@/server/services/items";
          async function unresolvedAction() {
            "use server";
            await missingService();
          }
        `,
        "items/page.tsx",
      ),
    ).toThrow("AUTHORIZATION_SERVER_ACTION_UNRESOLVED_SERVICE_DELEGATION");
  });

  it("rejects direct database imports by provenance even when aliased", () => {
    expect(() =>
      analyzeServerActionDelegations(
        `
          import { prisma as harmlessName } from "@ogfi/database";
          async function directWriteAction() {
            "use server";
            await harmlessName.item.create({ data: {} });
          }
        `,
        "items/page.tsx",
      ),
    ).toThrow("AUTHORIZATION_ACTION_DIRECT_DATABASE_ACCESS");
  });

  it("discovers typed and arrow server actions through the TypeScript AST", () => {
    expect(
      discoverServerActionNames(`
        async function typedAction(formData: FormData): Promise<void> {
          "use server";
        }
        export const arrowAction = async (value: string) => {
          "use server";
        };
        const notAnAction = "use server";
      `),
    ).toEqual(["typedAction", "arrowAction"]);
  });

  it("discovers every directly exported async service function with its own body", () => {
    expect(
      discoverExportedAsyncServiceEntrypoints(`
        export async function declaredService(): Promise<void> {
          requirePermission(permissions.firstPermission);
        }
        export const arrowService = async (): Promise<void> => {
          requirePermission(permissions.arrowPermission);
        };
        export const expressionService = async function (): Promise<void> {
          requirePermission(permissions.expressionPermission);
        };
        const privateService = async () => {};
        export const synchronousService = () => {};
      `),
    ).toEqual([
      {
        name: "declaredService",
        localName: "declaredService",
        source: expect.stringContaining("permissions.firstPermission"),
      },
      {
        name: "arrowService",
        localName: "arrowService",
        source: expect.stringContaining("permissions.arrowPermission"),
      },
      {
        name: "expressionService",
        localName: "expressionService",
        source: expect.stringContaining("permissions.expressionPermission"),
      },
    ]);

    const entrypoints = discoverExportedAsyncServiceEntrypoints(`
      export const first = async () => { permissions.firstPermission; };
      export const second = async () => { permissions.secondPermission; };
    `);
    expect(entrypoints[0].source).not.toContain("secondPermission");
    expect(entrypoints[1].source).not.toContain("firstPermission");
  });

  it("resolves local export lists and aliases to async service declarations", () => {
    expect(
      discoverExportedAsyncServiceEntrypoints(`
        async function declaredService() {
          requirePermission(permissions.firstPermission);
        }
        const arrowService = async () => {
          requirePermission(permissions.arrowPermission);
        };
        const presentationConstant = "not a service";
        export {
          declaredService,
          arrowService as aliasedArrowService,
          presentationConstant,
        };
      `),
    ).toEqual([
      {
        name: "declaredService",
        localName: "declaredService",
        source: expect.stringContaining("permissions.firstPermission"),
      },
      {
        name: "aliasedArrowService",
        localName: "arrowService",
        source: expect.stringContaining("permissions.arrowPermission"),
      },
    ]);
  });

  it("preserves local authorization analysis for aliased service surfaces", () => {
    expect(
      analyzeExportedServiceEntrypoints(`
        async function guardedWriter() {
          await liveGuard();
          await prisma.project.create({ data: {} });
        }
        async function liveGuard() {
          await requirePermission(session, permissions.projectManage);
        }
        export { guardedWriter as exposedWriter };
      `),
    ).toEqual([
      expect.objectContaining({
        name: "exposedWriter",
        localName: "guardedWriter",
        highRisk: true,
        liveGuard: true,
        permissionNames: ["projectManage"],
      }),
    ]);
  });

  it("fails closed for unresolved local value exports", () => {
    expect(() =>
      discoverExportedAsyncServiceEntrypoints(
        "export { missingService as exposedService };",
        "server/services/synthetic.ts",
      ),
    ).toThrow(
      "AUTHORIZATION_SERVICE_EXPORT_UNRESOLVED:server/services/synthetic.ts#exposedService",
    );
    expect(() =>
      discoverExportedAsyncServiceEntrypoints(
        `
          import { remoteService } from "./remote-service";
          export { remoteService as exposedRemoteService };
        `,
        "server/services/synthetic.ts",
      ),
    ).toThrow(
      "AUTHORIZATION_SERVICE_EXPORT_UNRESOLVED:server/services/synthetic.ts#exposedRemoteService",
    );
  });

  it("fails closed for direct, aliased, multi-hop, cyclic, and wildcard module re-exports", () => {
    const unresolvedFacades = [
      {
        filename: "server/services/directFacade.ts",
        source: 'export { writer } from "./writer";',
        exportedName: "writer",
      },
      {
        filename: "server/services/aliasFacade.ts",
        source: 'export { writer as exposedWriter } from "./writer";',
        exportedName: "exposedWriter",
      },
      {
        filename: "server/services/multiHopFacade.ts",
        source: 'export { exposedWriter } from "./aliasFacade";',
        exportedName: "exposedWriter",
      },
      {
        filename: "server/services/cycleA.ts",
        source: 'export { cycleWriter } from "./cycleB";',
        exportedName: "cycleWriter",
      },
      {
        filename: "server/services/cycleB.ts",
        source: 'export { cycleWriter } from "./cycleA";',
        exportedName: "cycleWriter",
      },
    ];
    for (const fixture of unresolvedFacades) {
      expect(() =>
        discoverExportedAsyncServiceEntrypoints(
          fixture.source,
          fixture.filename,
        ),
      ).toThrow(
        `AUTHORIZATION_SERVICE_REEXPORT_UNRESOLVED:${fixture.filename}#${fixture.exportedName}`,
      );
    }
    expect(() =>
      assertNoExportedSynchronousServiceWrites(
        'export * from "./writer";',
        "server/services/wildcardFacade.ts",
      ),
    ).toThrow(
      "AUTHORIZATION_SERVICE_REEXPORT_UNRESOLVED:server/services/wildcardFacade.ts#*",
    );
  });

  it("allows only the exact reviewed non-callable cross-module export", () => {
    expect(
      discoverExportedAsyncServiceEntrypoints(
        `
          export {
            expansionProjectTypes,
            type ExpansionProjectType,
          } from "./expansionProjectTypes";
        `,
        "server/services/expansionProjects.ts",
      ),
    ).toEqual([]);
    expect(() =>
      discoverExportedAsyncServiceEntrypoints(
        'export { expansionProjectTypes as renamedTypes } from "./expansionProjectTypes";',
        "server/services/expansionProjects.ts",
      ),
    ).toThrow(
      "AUTHORIZATION_SERVICE_REEXPORT_UNRESOLVED:server/services/expansionProjects.ts#renamedTypes",
    );
  });

  it("fails closed for unsupported default service exports", () => {
    for (const source of [
      "export default async function writer() {};",
      "const writer = async () => {}; export default writer;",
    ]) {
      expect(() =>
        discoverExportedAsyncServiceEntrypoints(
          source,
          "server/services/defaultFacade.ts",
        ),
      ).toThrow(
        "AUTHORIZATION_SERVICE_DEFAULT_EXPORT_UNRESOLVED:server/services/defaultFacade.ts#default",
      );
    }
  });

  it("fails closed when an exported synchronous wrapper reaches a local async writer", () => {
    expect(() =>
      assertNoExportedSynchronousServiceWrites(
        `
          async function persistRecord() {
            await prisma.project.update({ where: { id: "project-id" }, data: {} });
          }
          function intermediateHelper() {
            return persistRecord();
          }
          export function synchronousWrapper() {
            return intermediateHelper();
          }
        `,
        "server/services/synthetic.ts",
      ),
    ).toThrow(
      "AUTHORIZATION_SYNC_SERVICE_WRITE_UNDISCOVERED:server/services/synthetic.ts#synchronousWrapper",
    );
  });

  it("fails closed for an aliased export-list wrapper through a cyclic helper graph", () => {
    expect(() =>
      assertNoExportedSynchronousServiceWrites(
        `
          async function persistRecord() {
            await prisma.project.update({ where: { id: "project-id" }, data: {} });
          }
          function firstHelper() {
            secondHelper();
            return persistRecord();
          }
          function secondHelper() {
            return firstHelper();
          }
          function synchronousWrapper() {
            return secondHelper();
          }
          export { synchronousWrapper as exposedWriter };
        `,
        "server/services/synthetic.ts",
      ),
    ).toThrow(
      "AUTHORIZATION_SYNC_SERVICE_WRITE_UNDISCOVERED:server/services/synthetic.ts#exposedWriter",
    );
  });

  it("treats a newly discovered exported arrow service as baseline drift", () => {
    const manifest = buildAuthorizationSurfaceManifest();
    const [newEntrypoint] = discoverExportedAsyncServiceEntrypoints(
      "export const newlyAddedService = async () => {};",
    );

    expect(newEntrypoint.name).toBe("newlyAddedService");
    expect(() =>
      assertAuthorizationSurfaceBaseline([
        ...manifest,
        {
          ...manifest.find(
            (surface) => surface.surfaceType === "SERVICE_ENTRYPOINT",
          ),
          id: `server/services/synthetic.ts#${newEntrypoint.name}`,
        },
      ]),
    ).toThrow("AUTHORIZATION_SURFACE_BASELINE_DRIFT");
  });

  it("classifies every protected page, server action, route, export, and download", () => {
    const manifest = buildAuthorizationSurfaceManifest();

    expect(manifest.length).toBeGreaterThan(300);
    expect(manifest.filter((entry) => entry.surfaceType === "PAGE").length).toBeGreaterThan(70);
    expect(manifest.filter((entry) => entry.surfaceType === "SERVER_ACTION").length).toBeGreaterThan(200);
    expect(manifest.filter((entry) => entry.surfaceType === "EVIDENCE_DOWNLOAD")).toEqual([
      expect.objectContaining({
        id: "evidence/[id]/download/route.ts#GET",
        riskTier: "HIGH",
        denialContract: "NON_ENUMERATING_404_NO_BYTES",
        guardChain: ["session", "live-permission", "source-record-scope", "private-storage"],
        executableTestIds: ["AUTHZ-EVIDENCE-001"],
      }),
    ]);

    for (const [routeId, serviceId] of [
      [
        "app/api/evidence/uploads/route.ts#POST",
        "server/services/evidenceUploads.ts#issueEvidenceUploadIntent",
      ],
      [
        "app/api/evidence/uploads/content/route.ts#POST",
        "server/services/evidenceUploads.ts#storeEvidenceUploadContent",
      ],
    ]) {
      const surface = manifest.find((entry) => entry.id === routeId);
      expect(surface).toMatchObject({
        permission: "SERVICE_ENFORCED",
        denialContract: "SAFE_UPLOAD_ERROR_NO_SOURCE_MUTATION",
        riskTier: "HIGH",
        executableTestIds: ["AUTHZ-EVIDENCE-001"],
      });
      expect(surface.delegatedServiceIds).toContain(serviceId);
      expect(surface.callChains).toContain(`POST -> ${serviceId}`);
    }

    for (const surface of manifest) {
      expect(surface.id).toBeTruthy();
      expect(surface.permission).toBeTruthy();
      expect(surface.scopeDimensions).toContain("TENANT");
      if (!surface.permission.startsWith("authentication.")) {
        expect(surface.scopeDimensions).toContain("COMPANY");
      }
      expect(surface.guardChain.length).toBeGreaterThan(1);
      expect(surface.denialContract).toBeTruthy();
      if (
        surface.surfaceType === "SERVICE_ENTRYPOINT" &&
        surface.riskTier === "STANDARD"
      ) {
        expect(surface.executableTestIds).toEqual([]);
      } else {
        expect(surface.executableTestIds.length).toBeGreaterThan(0);
      }
    }
  });

  it("requires one executable covered registry binding for every high-risk service", () => {
    const manifest = buildAuthorizationSurfaceManifest();
    const report = authorizationBoundaryCoverageReport(manifest);

    for (const surface of manifest.filter(
      (entry) =>
        entry.surfaceType === "SERVICE_ENTRYPOINT" && entry.riskTier === "HIGH",
    )) {
      expect(surface.executableTestIds).toEqual(
        surface.boundaryCaseIds.map((caseId) => `BOUNDARY_CASE:${caseId}`),
      );
    }

    expect(report.registeredBoundaryCount).toBe(
      report.expectedHighRiskServiceCount,
    );
    expect(report.coveredBoundaryCount).toBe(
      report.expectedHighRiskServiceCount,
    );
    expect(report.uncoveredBoundaryIds).toEqual([]);
    expect(report.missingBoundaryIds).toEqual([]);
    expect(report.staleBoundaryIds).toEqual([]);
    expect(report.duplicateBoundaryIds).toEqual([]);
    expect(report.duplicateCaseIds).toEqual([]);
    expect(report.invalidCases).toEqual([]);
    expect(report.invalidBoundaryBindings).toEqual([]);
    expect(report.unboundHighSurfaceIds).toEqual([]);
    expect(report.uncoveredHighDelegationIds).toEqual([]);
    expect(report.invalidRouteMatrixSurfaceIds).toEqual([]);
    expect(() => assertAuthorizationBoundaryCoverage(manifest)).not.toThrow();
  });

  it("uses verified boundary cases instead of adjacent test-file existence", () => {
    const manifest = buildAuthorizationSurfaceManifest();
    const memberOptions = manifest.find(
      (entry) =>
        entry.id === "server/services/projects.ts#listProjectMemberOptions",
    );

    expect(memberOptions.executableTestIds).toEqual([
      "BOUNDARY_CASE:PROJECT_OPS_MEMBER_MANAGE_LIVE_PERMISSION",
    ]);
    expect(
      manifest
        .filter((entry) => entry.surfaceType === "SERVICE_ENTRYPOINT")
        .flatMap((entry) => entry.executableTestIds),
    ).not.toEqual(expect.arrayContaining([expect.stringMatching(/^VITEST_FILE:/)]));
  });

  it("binds generated evidence to a source commit and manifest schema", () => {
    const evidence = authorizationManifestEvidence({
      requireExecutionAttestations: false,
    });

    expect(evidence.schemaVersion).toBe(1);
    expect(evidence.commitSha).toMatch(/^(unknown|[a-f0-9]{40})$/);
    expect(evidence.manifestChecksum).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(evidence.baselineChecksum).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(evidence.testRegistryChecksum).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(evidence.delegatedServiceBaselineChecksum).toMatch(
      /^sha256:[a-f0-9]{64}$/,
    );
    expect(evidence.boundaryCoverage.coveredBoundaryCount).toBe(
      evidence.boundaryCoverage.expectedHighRiskServiceCount,
    );
    expect(Object.values(evidence.boundaryRegistryChecksums)).not.toHaveLength(0);
    for (const checksum of Object.values(evidence.boundaryRegistryChecksums)) {
      expect(checksum).toMatch(/^sha256:[a-f0-9]{64}$/);
    }
    expect(evidence.execution.command).toContain("pnpm test:authorization");
    expect(evidence.totals.surfaces).toBe(evidence.manifest.length);
    expect(evidence.totals.highRisk).toBeGreaterThan(100);
  });

  it("fails closed for undeclared and stale protected surfaces", () => {
    const manifest = buildAuthorizationSurfaceManifest();
    expect(() =>
      assertAuthorizationSurfaceBaseline([
        ...manifest,
        { ...manifest[0], id: "new-workspace/page.tsx#unreviewedAction" },
      ]),
    ).toThrow("AUTHORIZATION_SURFACE_BASELINE_DRIFT");
    expect(() => assertAuthorizationSurfaceBaseline(manifest.slice(1))).toThrow(
      "AUTHORIZATION_SURFACE_BASELINE_DRIFT",
    );
    expect(() =>
      assertAuthorizationSurfaceBaseline(
        manifest.map((surface, index) =>
          index === 0
            ? { ...surface, denialContract: "UNREVIEWED_CONTRACT_CHANGE" }
            : surface,
        ),
      ),
    ).toThrow("AUTHORIZATION_SURFACE_BASELINE_DRIFT");
    expect(() =>
      assertAuthorizationSurfaceBaseline([
        { ...manifest[0], executableTestIds: ["AUTHZ-NOT-REGISTERED"] },
        ...manifest.slice(1),
      ]),
    ).toThrow("AUTHORIZATION_SURFACE_BASELINE_DRIFT");
    const explicitHighRiskIndex = manifest.findIndex(
      (surface) =>
        surface.surfaceType === "SERVICE_ENTRYPOINT" &&
        surface.riskTier === "HIGH" &&
        surface.permission !== "DELEGATED_INTERNAL_GUARD",
    );
    expect(() =>
      assertAuthorizationSurfaceBaseline(
        manifest.map((surface, index) =>
          index === explicitHighRiskIndex
            ? { ...surface, permission: "DELEGATED_INTERNAL_GUARD" }
            : surface,
        ),
      ),
    ).toThrow("AUTHORIZATION_SURFACE_BASELINE_DRIFT");
  });
});
