import { canUseApprovals, permissions } from "./authorization";
import type { SessionContext } from "./context";
import {
  canExportCoreAdminAudit,
  canExportBranchOperations,
  canExportExpansion,
  canExportFoodCostAnalysis,
  canExportFoodSafety,
  canExportInventoryBalances,
  canExportInventoryLedger,
  canExportInventoryTransfers,
  canExportIncidents,
  canExportMaintenance,
  canExportProjects,
  canExportPurchaseOrders,
  canExportPurchaseRequests,
  canExportReceivingReports,
  canExportRecipeCosting,
  canExportStockAdjustments,
  canExportStockCounts,
  canExportSupplierQuotes,
  canExportWastageReports
} from "./exportAuthorization";
import { getReportExportPolicy } from "./policySettings";

export type OperationalReportCard = {
  id: string;
  title: string;
  group:
    | "Purchasing"
    | "Receiving"
    | "Inventory"
    | "Controls"
    | "Projects"
    | "Restaurant Ops"
    | "Audit";
  description: string;
  sourceHref: string;
  exportHref: string | null;
  status: "CSV_AVAILABLE" | "VIEW_ONLY";
  trustNotice?: {
    tone: "warning" | "info";
    label: string;
    detail: string;
    sourceDecisionId: string;
  };
};

type ReportDefinition = OperationalReportCard & {
  isVisible: (session: SessionContext) => boolean;
};

const sourceRecordTrustNotice = {
  tone: "info" as const,
  label: "Source-record scoped",
  detail:
    "This report opens and exports permitted source records only for the selected company/location context. It does not approve, post, reverse, or replace the underlying workflow record.",
  sourceDecisionId: "DEC-0036"
};

const reportDefinitions: ReportDefinition[] = [
  {
    id: "purchase-request-register",
    title: "Purchase Request Register",
    group: "Purchasing",
    description: "Scoped PR status, requester, urgency, comments, and approval history.",
    sourceHref: "/purchase-requests",
    exportHref: "/purchase-requests/export",
    status: "CSV_AVAILABLE",
    isVisible: canExportPurchaseRequests
  },
  {
    id: "purchase-order-status",
    title: "Purchase Order Status",
    group: "Purchasing",
    description: "PO lifecycle, supplier issue evidence, open quantities, and value.",
    sourceHref: "/purchase-orders",
    exportHref: "/purchase-orders/export",
    status: "CSV_AVAILABLE",
    isVisible: canExportPurchaseOrders
  },
  {
    id: "supplier-quotes",
    title: "Supplier Quotes",
    group: "Purchasing",
    description: "RFQ responses, supplier pricing, and quotation recommendation inputs.",
    sourceHref: "/quotes",
    exportHref: "/quotes/export",
    status: "CSV_AVAILABLE",
    isVisible: canExportSupplierQuotes
  },
  {
    id: "receiving-reports",
    title: "Receiving Reports",
    group: "Receiving",
    description: "GRN status, source PO delivery schedule, discrepancies, and reversal trace.",
    sourceHref: "/receiving",
    exportHref: "/receiving/export",
    status: "CSV_AVAILABLE",
    isVisible: canExportReceivingReports
  },
  {
    id: "stock-balances",
    title: "Inventory On-Hand",
    group: "Inventory",
    description: "Current selected-location stock balances derived from posted movements.",
    sourceHref: "/inventory",
    exportHref: "/inventory/export",
    status: "CSV_AVAILABLE",
    isVisible: canExportInventoryBalances
  },
  {
    id: "movement-ledger",
    title: "Stock Movement Ledger",
    group: "Inventory",
    description: "Immutable movement history with source document and event references.",
    sourceHref: "/inventory/ledger",
    exportHref: "/inventory/ledger/export",
    status: "CSV_AVAILABLE",
    isVisible: canExportInventoryLedger
  },
  {
    id: "transfer-status",
    title: "Transfer Status",
    group: "Inventory",
    description: "Warehouse and branch transfer status, dispatch, receipt, and disputes.",
    sourceHref: "/transfers",
    exportHref: "/transfers/export",
    status: "CSV_AVAILABLE",
    isVisible: canExportInventoryTransfers
  },
  {
    id: "stock-count-variance",
    title: "Stock Count Variance",
    group: "Inventory",
    description: "Count sessions, variance lines, review state, and generated adjustments.",
    sourceHref: "/counts",
    exportHref: "/counts/export",
    status: "CSV_AVAILABLE",
    isVisible: canExportStockCounts
  },
  {
    id: "wastage-report",
    title: "Wastage Report",
    group: "Controls",
    description: "Wastage reason, evidence policy flags, value, approval, and posting status.",
    sourceHref: "/wastage",
    exportHref: "/wastage/export",
    status: "CSV_AVAILABLE",
    isVisible: canExportWastageReports
  },
  {
    id: "stock-adjustment-report",
    title: "Stock Adjustment Report",
    group: "Controls",
    description: "Adjustment reason, evidence, approvals, posting, reversal, and value impact.",
    sourceHref: "/adjustments",
    exportHref: "/adjustments/export",
    status: "CSV_AVAILABLE",
    isVisible: canExportStockAdjustments
  },
  {
    id: "approval-aging",
    title: "Approval Aging",
    group: "Controls",
    description: "Assigned approval queue filtered by role, scope, and self-approval rules.",
    sourceHref: "/approvals",
    exportHref: null,
    status: "VIEW_ONLY",
    isVisible: (session) => canUseApprovals(session.permissionCodes)
  },
  {
    id: "project-health",
    title: "Project Health",
    group: "Projects",
    description: "Scoped project status, task progress, blockers, overdue work, milestones, and linked-record counts.",
    sourceHref: "/projects",
    exportHref: "/projects/export",
    status: "CSV_AVAILABLE",
    isVisible: canExportProjects
  },
  {
    id: "project-task-register",
    title: "Project Task Register",
    group: "Projects",
    description: "Scoped task-grain register with status, owner, due dates, and metadata counts only.",
    sourceHref: "/my-work",
    exportHref: "/projects/tasks/export",
    status: "CSV_AVAILABLE",
    isVisible: canExportProjects
  },
  {
    id: "project-activity-log",
    title: "Project Activity Log",
    group: "Projects",
    description: "Redacted project activity export with scoped event summaries and no raw payloads.",
    sourceHref: "/projects",
    exportHref: "/projects/activity/export",
    status: "CSV_AVAILABLE",
    isVisible: canExportProjects
  },
  {
    id: "project-linked-record-follow-up",
    title: "Linked Record Follow-up",
    group: "Projects",
    description: "Scoped project links with safe source summaries and restricted-source redaction.",
    sourceHref: "/projects",
    exportHref: "/projects/links/export",
    status: "CSV_AVAILABLE",
    isVisible: canExportProjects
  },
  {
    id: "phase-4-expansion-portfolio",
    title: "Expansion Portfolio",
    group: "Projects",
    description:
      "Branch-opening portfolio, lifecycle gates, permits, construction progress, readiness, punch-list exceptions, and source-record boundary summary.",
    sourceHref: "/expansion",
    exportHref: "/expansion/export",
    status: "CSV_AVAILABLE",
    isVisible: canExportExpansion
  },
  {
    id: "audit-trail",
    title: "Audit Trail Export",
    group: "Audit",
    description: "Core admin audit events searchable by action, entity, actor, and date.",
    sourceHref: "/admin",
    exportHref: "/admin/audit/export",
    status: "CSV_AVAILABLE",
    isVisible: canExportCoreAdminAudit
  },
  {
    id: "recipe-costing",
    title: "Recipe Costing Register",
    group: "Restaurant Ops",
    description: "Published recipe versions, ingredient lines, supplier price basis, plate cost, and margin preview.",
    sourceHref: "/recipes",
    exportHref: "/recipes/export",
    status: "CSV_AVAILABLE",
    isVisible: canExportRecipeCosting
  },
  {
    id: "recipe-revision-workbook",
    title: "Recipe Revision Workbook",
    group: "Restaurant Ops",
    description:
      "Recipe-specific planning workbook with source lines, change columns, and template rows; export from the selected recipe detail.",
    sourceHref: "/recipes",
    exportHref: null,
    status: "VIEW_ONLY",
    isVisible: canExportRecipeCosting
  },
  {
    id: "food-cost-analysis",
    title: "Food Cost Analysis",
    group: "Restaurant Ops",
    description: "Imported sales by menu item with theoretical food cost and target comparison.",
    sourceHref: "/recipes?view=analysis",
    exportHref: "/recipes/analysis/export",
    status: "CSV_AVAILABLE",
    isVisible: canExportFoodCostAnalysis,
    trustNotice: {
      tone: "warning",
      label: "POS/import trust-gated",
      detail:
        "Sales import data is analysis-only until the source system, import completeness, duplicate controls, and reconciliation are validated for the selected scope.",
      sourceDecisionId: "DEC-0036"
    }
  },
  {
    id: "branch-checklist-compliance",
    title: "Branch Checklist Compliance",
    group: "Restaurant Ops",
    description: "Opening and closing checklist source records, line results, exceptions, and evidence references.",
    sourceHref: "/branch-operations",
    exportHref: "/branch-operations/export",
    status: "CSV_AVAILABLE",
    isVisible: canExportBranchOperations
  },
  {
    id: "food-safety-exceptions",
    title: "Food Safety Exceptions",
    group: "Restaurant Ops",
    description: "Temperature, sanitation, corrective-action, exception, and evidence readings for the selected branch.",
    sourceHref: "/food-safety",
    exportHref: "/food-safety/export",
    status: "CSV_AVAILABLE",
    isVisible: canExportFoodSafety
  },
  {
    id: "incident-corrective-actions",
    title: "Open Incidents and Corrective Actions",
    group: "Restaurant Ops",
    description: "Operational incidents, severity, due dates, source links, corrective actions, and evidence references.",
    sourceHref: "/incidents",
    exportHref: "/incidents/export",
    status: "CSV_AVAILABLE",
    isVisible: canExportIncidents
  },
  {
    id: "maintenance-sla-downtime",
    title: "Maintenance SLA and Downtime",
    group: "Restaurant Ops",
    description: "Maintenance tickets, assets, priority, SLA due dates, downtime, corrective actions, and evidence references.",
    sourceHref: "/maintenance",
    exportHref: "/maintenance/export",
    status: "CSV_AVAILABLE",
    isVisible: canExportMaintenance
  }
];

export function listOperationalReports(session: SessionContext) {
  return reportDefinitions
    .filter((report) => report.isVisible(session))
    .map(({ isVisible: _isVisible, ...report }) => ({
      ...report,
      trustNotice: report.trustNotice ?? sourceRecordTrustNotice
    }));
}

export function canUseOperationalReports(session: SessionContext) {
  return (
    listOperationalReports(session).length > 0 ||
    session.permissionCodes.includes(permissions.coreAdminister)
  );
}

export async function getOperationalReportTrustContext(session: SessionContext) {
  const exportPolicy = await getReportExportPolicy(session);

  return {
    requireScopeFilters: exportPolicy.requireScopeFilters,
    trustGateMode: exportPolicy.trustGate.mode,
    trustGateLabel: exportPolicy.trustGate.label,
    trustGateSourceDecisionId: exportPolicy.trustGate.sourceDecisionId,
    trustGateIsOverridden: exportPolicy.trustGate.isOverridden
  };
}
