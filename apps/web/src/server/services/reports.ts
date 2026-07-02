import { canUseApprovals, permissions } from "./authorization";
import type { SessionContext } from "./context";
import {
  canExportCoreAdminAudit,
  canExportInventoryBalances,
  canExportInventoryLedger,
  canExportInventoryTransfers,
  canExportProjects,
  canExportPurchaseOrders,
  canExportPurchaseRequests,
  canExportReceivingReports,
  canExportStockAdjustments,
  canExportStockCounts,
  canExportSupplierQuotes,
  canExportWastageReports
} from "./exportAuthorization";

export type OperationalReportCard = {
  id: string;
  title: string;
  group: "Purchasing" | "Receiving" | "Inventory" | "Controls" | "Projects" | "Audit";
  description: string;
  sourceHref: string;
  exportHref: string | null;
  status: "CSV_AVAILABLE" | "VIEW_ONLY";
};

type ReportDefinition = OperationalReportCard & {
  isVisible: (session: SessionContext) => boolean;
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
    id: "audit-trail",
    title: "Audit Trail Export",
    group: "Audit",
    description: "Core admin audit events searchable by action, entity, actor, and date.",
    sourceHref: "/admin",
    exportHref: "/admin/audit/export",
    status: "CSV_AVAILABLE",
    isVisible: canExportCoreAdminAudit
  }
];

export function listOperationalReports(session: SessionContext) {
  return reportDefinitions
    .filter((report) => report.isVisible(session))
    .map(({ isVisible: _isVisible, ...report }) => report);
}

export function canUseOperationalReports(session: SessionContext) {
  return (
    listOperationalReports(session).length > 0 ||
    session.permissionCodes.includes(permissions.coreAdminister)
  );
}
