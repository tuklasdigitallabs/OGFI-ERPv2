import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import {
  assertExpansionGateTransition,
  expansionLifecycleGateControlMetadata
} from "./expansionProjects";

const validGateTransition = {
  canMutate: true,
  actorUserId: "sponsor-user",
  reviewerUserId: "sponsor-user",
  ownerUserId: "manager-user",
  createdByUserId: "admin-user",
  currentStatus: "PLANNED" as const,
  currentVersion: 3,
  expectedVersion: 3,
  nextStatus: "ACHIEVED" as const,
  priorGateStatuses: ["ACHIEVED", "ACHIEVED"] as Array<
    "PLANNED" | "ACHIEVED" | "CANCELLED"
  >,
  achievementReason: "Sponsor reviewed and accepted the gate criteria.",
  evidenceReference: "EXP-GATE-PACK-003"
};

describe("expansion lifecycle gate controls", () => {
  test("allows only an authorized independent configured reviewer to achieve a sequenced gate", () => {
    expect(() => assertExpansionGateTransition(validGateTransition)).not.toThrow();
    expect(expansionLifecycleGateControlMetadata).toMatchObject({
      decisionReference: "DEC-0036",
      policySource: "CONFIGURABLE_PILOT_BASELINE",
      reviewer: "PROJECT_SPONSOR"
    });

    expect(() =>
      assertExpansionGateTransition({
        ...validGateTransition,
        canMutate: false
      })
    ).toThrow("PROJECT_MILESTONE_PERMISSION_DENIED");
    expect(() =>
      assertExpansionGateTransition({
        ...validGateTransition,
        actorUserId: "manager-user"
      })
    ).toThrow("EXPANSION_GATE_REVIEWER_REQUIRED");
    expect(() =>
      assertExpansionGateTransition({
        ...validGateTransition,
        ownerUserId: "sponsor-user"
      })
    ).toThrow("EXPANSION_GATE_SELF_APPROVAL_NOT_ALLOWED");
    expect(() =>
      assertExpansionGateTransition({
        ...validGateTransition,
        createdByUserId: "sponsor-user"
      })
    ).toThrow("EXPANSION_GATE_SELF_APPROVAL_NOT_ALLOWED");
  });

  test("blocks missing prior gates, missing evidence, and missing achievement reason", () => {
    expect(() =>
      assertExpansionGateTransition({
        ...validGateTransition,
        priorGateStatuses: ["ACHIEVED", "PLANNED"]
      })
    ).toThrow("EXPANSION_GATE_PRIOR_GATE_REQUIRED");
    expect(() =>
      assertExpansionGateTransition({
        ...validGateTransition,
        evidenceReference: ""
      })
    ).toThrow("EXPANSION_GATE_EVIDENCE_REQUIRED");
    expect(() =>
      assertExpansionGateTransition({
        ...validGateTransition,
        achievementReason: ""
      })
    ).toThrow("EXPANSION_GATE_ACHIEVEMENT_REASON_REQUIRED");
  });

  test("requires expected-version concurrency and a planned source state", () => {
    expect(() =>
      assertExpansionGateTransition({
        ...validGateTransition,
        expectedVersion: 2
      })
    ).toThrow("PROJECT_MILESTONE_STALE_VERSION");
    expect(() =>
      assertExpansionGateTransition({
        ...validGateTransition,
        currentStatus: "ACHIEVED"
      })
    ).toThrow("EXPANSION_GATE_TRANSITION_NOT_ALLOWED");
  });

  test("allows authorized cancellation only with a reason", () => {
    expect(() =>
      assertExpansionGateTransition({
        ...validGateTransition,
        actorUserId: "manager-user",
        nextStatus: "CANCELLED",
        cancellationReason: "Gate was superseded by an approved project reset."
      })
    ).not.toThrow();
    expect(() =>
      assertExpansionGateTransition({
        ...validGateTransition,
        nextStatus: "CANCELLED",
        cancellationReason: ""
      })
    ).toThrow("PROJECT_MILESTONE_CANCEL_REASON_REQUIRED");
  });

  test("keeps compare-and-set update and audit creation in one rollback boundary", () => {
    const service = readFileSync(
      path.resolve(__dirname, "expansionProjects.ts"),
      "utf8"
    );
    const transitionSource = service.slice(
      service.indexOf("export async function transitionExpansionLifecycleGate"),
      service.indexOf("export async function getExpansionFeasibility")
    );

    expect(transitionSource).toContain("await prisma.$transaction(async (tx)");
    expect(transitionSource).toContain("await tx.projectMilestone.updateMany");
    expect(transitionSource).toContain("version: values.expectedVersion");
    expect(transitionSource).toContain("status: \"PLANNED\"");
    expect(transitionSource).toContain("await tx.projectActivityEvent.create");
    expect(transitionSource).toContain("expansion_lifecycle_gate.achieved");
    expect(transitionSource).toContain("evidenceReference");
    expect(transitionSource).toContain("sourceBoundary");
  });
});

describe("phase 4 expansion foundation", () => {
  test("dashboard and site pipeline use the shared project engine, not previews or source mutations", () => {
    const service = readFileSync(
      path.resolve(__dirname, "expansionProjects.ts"),
      "utf8"
    );
    const dashboardPage = readFileSync(
      path.resolve(__dirname, "../../app/(app)/expansion/page.tsx"),
      "utf8"
    );
    const sitePipelinePage = readFileSync(
      path.resolve(__dirname, "../../app/(app)/expansion/sites/page.tsx"),
      "utf8"
    );
    const siteDetailPage = readFileSync(
      path.resolve(__dirname, "../../app/(app)/expansion/sites/[id]/page.tsx"),
      "utf8"
    );
    const playbooksPage = readFileSync(
      path.resolve(__dirname, "../../app/(app)/expansion/playbooks/page.tsx"),
      "utf8"
    );
    const lifecycleGatesPage = readFileSync(
      path.resolve(__dirname, "../../app/(app)/expansion/gates/page.tsx"),
      "utf8"
    );
    const feasibilityPage = readFileSync(
      path.resolve(__dirname, "../../app/(app)/expansion/feasibility/page.tsx"),
      "utf8"
    );
    const capexProcurementPage = readFileSync(
      path.resolve(
        __dirname,
        "../../app/(app)/expansion/capex-procurement/page.tsx"
      ),
      "utf8"
    );
    const permitsPage = readFileSync(
      path.resolve(__dirname, "../../app/(app)/expansion/permits/page.tsx"),
      "utf8"
    );
    const constructionPage = readFileSync(
      path.resolve(__dirname, "../../app/(app)/expansion/construction/page.tsx"),
      "utf8"
    );
    const readinessPage = readFileSync(
      path.resolve(__dirname, "../../app/(app)/expansion/readiness/page.tsx"),
      "utf8"
    );
    const punchListPage = readFileSync(
      path.resolve(__dirname, "../../app/(app)/expansion/punch-list/page.tsx"),
      "utf8"
    );
    const postOpeningPage = readFileSync(
      path.resolve(__dirname, "../../app/(app)/expansion/post-opening/page.tsx"),
      "utf8"
    );
    const navigation = readFileSync(
      path.resolve(__dirname, "../../components/ShellNavigation.tsx"),
      "utf8"
    );

    expect(service).toContain("listAuthorizedProjectAccess");
    expect(service).toContain("getActiveProjectScopes");
    expect(service).toContain("hasCompanyManageScope");
    expect(service).toContain("authorizedLocationIds");
    expect(service).toContain('scope.scopeType === "LOCATION"');
    expect(service).toContain("projectActivityEvent.findMany");
    expect(service).toContain("recordLinks");
    expect(service).not.toContain("./finance");
    expect(service).not.toContain("./purchaseOrders");
    expect(service).not.toContain("./purchaseRequests");
    expect(service).not.toContain("./inventory");
    expect(service).not.toContain("paymentRelease");
    expect(service).not.toContain("financeJournal");

    expect(dashboardPage).toContain("getExpansionDashboard");
    expect(dashboardPage).toContain("getExpansionReportRollups");
    expect(dashboardPage).toContain('href="/expansion/export"');
    expect(dashboardPage).toContain("Expansion Report Rollups");
    expect(dashboardPage).not.toContain("renderModulePreview");
    expect(sitePipelinePage).toContain("listExpansionSitePipeline");
    expect(sitePipelinePage).toContain("createProject(formData)");
    expect(sitePipelinePage).toContain('href={`/expansion/sites/${row.id}`}');
    expect(siteDetailPage).toContain("getExpansionLifecycleGates");
    expect(siteDetailPage).toContain("listExpansionProjectActivity");
    expect(siteDetailPage).toContain("Lifecycle Gates");
    expect(siteDetailPage).toContain("Financial, procurement, inventory, and approval records");
    expect(sitePipelinePage).not.toContain("renderModulePreview");
    expect(playbooksPage).toContain("listExpansionOpeningPlaybooks");
    expect(playbooksPage).toContain("createExpansionOpeningPlaybook");
    expect(playbooksPage).toContain("getPaginationState");
    expect(playbooksPage).not.toContain("renderModulePreview");
    expect(playbooksPage).toContain("does not rewrite active projects");
    expect(playbooksPage).toContain("approve capex, issue POs");
    expect(lifecycleGatesPage).toContain("getExpansionLifecycleGates");
    expect(lifecycleGatesPage).toContain("seedExpansionLifecycleGates");
    expect(lifecycleGatesPage).toContain("transitionExpansionLifecycleGate");
    expect(lifecycleGatesPage).toContain("getPaginationState");
    expect(lifecycleGatesPage).not.toContain("renderModulePreview");
    expect(lifecycleGatesPage).toContain(
      "They do not approve capex, release payments, issue POs"
    );
    expect(feasibilityPage).toContain("getExpansionFeasibility");
    expect(feasibilityPage).toContain("createExpansionFeasibilityModel");
    expect(feasibilityPage).toContain("transitionExpansionFeasibilityModel");
    expect(feasibilityPage).toContain("getPaginationState");
    expect(feasibilityPage).not.toContain("renderModulePreview");
    expect(feasibilityPage).toContain("does not approve");
    expect(feasibilityPage).toContain("capex, create budgets, release payments");
    expect(capexProcurementPage).toContain("getExpansionCapexProcurement");
    expect(capexProcurementPage).toContain(
      "createExpansionCapexProcurementItem"
    );
    expect(capexProcurementPage).toContain(
      "transitionExpansionCapexProcurementItem"
    );
    expect(capexProcurementPage).toContain("getPaginationState");
    expect(capexProcurementPage).not.toContain("renderModulePreview");
    expect(capexProcurementPage).toContain("does not approve capex");
    expect(capexProcurementPage).toContain("mutate budgets, release payments");
    expect(permitsPage).toContain("getExpansionPermitDocuments");
    expect(permitsPage).toContain("createExpansionPermitDocument");
    expect(permitsPage).toContain("transitionExpansionPermitDocument");
    expect(permitsPage).toContain("getPaginationState");
    expect(permitsPage).not.toContain("renderModulePreview");
    expect(permitsPage).toContain(
      "Legal, payment, purchasing, and branch-master source records stay"
    );
    expect(constructionPage).toContain("getExpansionConstructionBoard");
    expect(constructionPage).toContain("createExpansionConstructionTask");
    expect(constructionPage).toContain("recordExpansionConstructionProgress");
    expect(constructionPage).toContain("transitionExpansionConstructionTask");
    expect(constructionPage).toContain("getPaginationState");
    expect(constructionPage).not.toContain("renderModulePreview");
    expect(constructionPage).toContain(
      "Progress updates do not approve POs, release payments"
    );
    expect(readinessPage).toContain("getExpansionOpeningReadiness");
    expect(readinessPage).toContain("createExpansionOpeningReadiness");
    expect(readinessPage).toContain("toggleExpansionOpeningReadinessChecklist");
    expect(readinessPage).toContain("transitionExpansionOpeningReadiness");
    expect(readinessPage).toContain("getPaginationState");
    expect(readinessPage).not.toContain("renderModulePreview");
    expect(readinessPage).toContain(
      "does not create branch records, hire employees, post inventory"
    );
    expect(punchListPage).toContain("getExpansionPunchList");
    expect(punchListPage).toContain("createExpansionPunchListItem");
    expect(punchListPage).toContain("transitionExpansionPunchListItem");
    expect(punchListPage).toContain("getPaginationState");
    expect(punchListPage).toContain("expansionSpecializedTaskNextStatuses");
    expect(punchListPage).not.toContain("renderModulePreview");
    expect(punchListPage).toContain(
      "does not approve POs, release payments, receive inventory"
    );
    expect(postOpeningPage).toContain("getExpansionPostOpeningReviews");
    expect(postOpeningPage).toContain("createExpansionPostOpeningReview");
    expect(postOpeningPage).toContain("transitionExpansionPostOpeningReview");
    expect(postOpeningPage).toContain("getPaginationState");
    expect(postOpeningPage).not.toContain("renderModulePreview");
    expect(postOpeningPage).toContain("does not post sales");
    expect(postOpeningPage).toContain("adjust stock, release payments");
    expect(service).toContain("EXPANSION_LIFECYCLE_GATE");
    expect(service).toContain("EXPANSION_FEASIBILITY_MODEL");
    expect(service).toContain("EXPANSION_CAPEX_PROCUREMENT_ITEM");
    expect(service).toContain("EXPANSION_POST_OPENING_REVIEW");
    expect(service).toContain("EXPANSION_PERMIT_DOCUMENT");
    expect(service).toContain("EXPANSION_CONSTRUCTION_TASK");
    expect(service).toContain("EXPANSION_OPENING_READINESS");
    expect(service).toContain("EXPANSION_PUNCH_LIST_ITEM");
    expect(service).toContain("getExpansionReportRollups");
    expect(service).toContain("buildExpansionPortfolioExportRows");
    expect(service).toContain("Source Boundary");
    expect(service).toContain("notifyProjectTaskAssigned");
    expect(service).toContain("expansionNotificationProject(project)");
    expect(service).toContain("assertExpansionGateTransition");
    expect(service).toContain("transitionProjectTask(formData)");
    expect(service).toContain("EXPANSION_GATE_EVIDENCE_REQUIRED");
    expect(service).toContain("EXPANSION_FEASIBILITY_EVIDENCE_REQUIRED");
    expect(service).toContain("EXPANSION_CAPEX_PROCUREMENT_EVIDENCE_REQUIRED");
    expect(service).toContain("EXPANSION_POST_OPENING_EVIDENCE_REQUIRED");
    expect(service).toContain("EXPANSION_PUNCH_LIST_EVIDENCE_REQUIRED");
    expect(service).toContain("EXPANSION_PUNCH_LIST_REVIEW_REQUIRED");
    expect(service).toContain("EXPANSION_PUNCH_LIST_INDEPENDENT_REVIEW_REQUIRED");
    expect(service).toContain("EXPANSION_PUNCH_LIST_INDEPENDENT_REVIEWER_REQUIRED");
    expect(service).toContain("EXPANSION_PUNCH_LIST_INDEPENDENT_REVIEWER_INVALID");
    expect(service).toContain("independentReviewerUserId");
    expect(punchListPage).toContain("Independent reviewer");
    expect(service).toContain("EXPANSION_PUNCH_LIST_RETURN_REASON_REQUIRED");
    expect(service).toContain("EXPANSION_PUNCH_LIST_INVALID_TRANSITION");
    expect(service).toContain(
      "coordination_only_no_capex_approval_no_payment_no_po_no_inventory_no_branch_mutation"
    );
    expect(service).toContain(
      "coordination_only_no_capex_approval_no_budget_mutation_no_payment_no_po_no_inventory_mutation"
    );
    expect(service).toContain(
      "coordination_only_no_sales_posting_no_finance_no_inventory_no_workforce_no_branch_mutation"
    );
    expect(service).toContain(
      "coordination_only_no_legal_contract_authoring_no_payment_no_po_no_branch_mutation"
    );
    expect(service).toContain(
      "coordination_only_no_boq_authoring_no_contractor_portal_no_payment_no_po_no_inventory_mutation"
    );
    expect(service).toContain(
      "coordination_only_no_branch_creation_no_hiring_no_inventory_no_payment_no_po_mutation"
    );
    expect(service).toContain(
      "coordination_only_no_payment_no_po_no_inventory_no_contractor_portal_no_branch_mutation"
    );

    const expansionNav = navigation.slice(
      navigation.indexOf('id: "expansion"'),
      navigation.indexOf("...(canUseFinance")
    );
    expect(expansionNav).toContain('label: "Expansion Dashboard"');
    expect(expansionNav).toContain('label: "Opening Playbooks"');
    expect(expansionNav).toContain('label: "Site Pipeline"');
    expect(expansionNav).toContain('label: "Feasibility"');
    expect(expansionNav).toContain('label: "Capex & Procurement"');
    expect(expansionNav).toContain('label: "Lifecycle Gates"');
    expect(expansionNav).toContain('label: "Post-Opening Review"');
    expect(expansionNav).not.toContain('label: "Expansion Dashboard",\n                href: "/expansion",\n                activeKey: "expansion-dashboard" as const,\n                badge: "Preview"');
    expect(expansionNav).not.toContain('label: "Opening Playbooks",\n                href: "/expansion/playbooks",\n                activeKey: "opening-playbooks" as const,\n                badge: "Preview"');
    expect(expansionNav).not.toContain('label: "Site Pipeline",\n                href: "/expansion/sites",\n                activeKey: "site-pipeline" as const,\n                badge: "Preview"');
    expect(expansionNav).not.toContain('label: "Feasibility",\n                href: "/expansion/feasibility",\n                activeKey: "feasibility" as const,\n                badge: "Preview"');
    expect(expansionNav).not.toContain('label: "Capex & Procurement",\n                href: "/expansion/capex-procurement",\n                activeKey: "capex-procurement" as const,\n                badge: "Preview"');
    expect(expansionNav).not.toContain('label: "Lifecycle Gates",\n                href: "/expansion/gates",\n                activeKey: "lifecycle-gates" as const,\n                badge: "Preview"');
    expect(expansionNav).not.toContain('label: "Permits & Documents",\n                href: "/expansion/permits",\n                activeKey: "permits" as const,\n                badge: "Preview"');
    expect(expansionNav).not.toContain('label: "Construction Board",\n                href: "/expansion/construction",\n                activeKey: "construction-board" as const,\n                badge: "Preview"');
    expect(expansionNav).not.toContain('label: "Opening Readiness",\n                href: "/expansion/readiness",\n                activeKey: "opening-readiness" as const,\n                badge: "Preview"');
    expect(expansionNav).not.toContain('label: "Punch List",\n                href: "/expansion/punch-list",\n                activeKey: "punch-list" as const,\n                badge: "Preview"');
    expect(expansionNav).not.toContain('label: "Post-Opening Review",\n                href: "/expansion/post-opening",\n                activeKey: "post-opening" as const,\n                badge: "Preview"');
  });
});
