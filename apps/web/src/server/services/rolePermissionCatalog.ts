import { permissions } from "./authorization";

export type PermissionPresentation = {
  code: string;
  label: string;
  description: string;
  group: string;
  sensitive: boolean;
};

const permissionPresentations: Record<string, Omit<PermissionPresentation, "code">> = {
  [permissions.coreAdminister]: {
    label: "Administer core setup",
    description: "Manage users, roles, scopes, master setup, approval rules, and audit configuration.",
    group: "Administration",
    sensitive: true
  },
  [permissions.purchaseRequestCreate]: {
    label: "Create purchase requests",
    description: "Create draft requests for needed goods or services.",
    group: "Procurement",
    sensitive: false
  },
  [permissions.purchaseRequestSubmit]: {
    label: "Submit purchase requests",
    description: "Submit draft purchase requests into approval workflow.",
    group: "Procurement",
    sensitive: false
  },
  [permissions.purchaseRequestApprove]: {
    label: "Approve purchase requests",
    description: "Review and approve purchase requests according to approval rules.",
    group: "Approvals",
    sensitive: true
  },
  [permissions.quoteManage]: {
    label: "Manage supplier quotations",
    description: "Capture supplier quotes and create sourcing recommendations.",
    group: "Procurement",
    sensitive: false
  },
  [permissions.quoteApprove]: {
    label: "Approve supplier recommendations",
    description: "Approve selected supplier recommendations before PO creation.",
    group: "Approvals",
    sensitive: true
  },
  [permissions.purchaseOrderView]: {
    label: "View purchase orders",
    description: "View scoped supplier commitments and receiving status.",
    group: "Purchase Orders",
    sensitive: false
  },
  [permissions.purchaseOrderCreate]: {
    label: "Create purchase orders",
    description: "Create draft POs from approved supplier recommendations.",
    group: "Purchase Orders",
    sensitive: false
  },
  [permissions.purchaseOrderSubmit]: {
    label: "Submit purchase orders",
    description: "Submit draft POs for approval or issue workflow.",
    group: "Purchase Orders",
    sensitive: false
  },
  [permissions.purchaseOrderApprove]: {
    label: "Approve purchase orders",
    description: "Approve supplier commitments before they are issued.",
    group: "Approvals",
    sensitive: true
  },
  [permissions.purchaseOrderIssue]: {
    label: "Issue purchase orders",
    description: "Issue approved POs to suppliers.",
    group: "Purchase Orders",
    sensitive: true
  },
  [permissions.purchaseOrderCancel]: {
    label: "Cancel purchase orders",
    description: "Cancel controlled PO commitments with required reason and audit history.",
    group: "Purchase Orders",
    sensitive: true
  },
  [permissions.purchaseOrderCloseRemaining]: {
    label: "Close remaining PO balances",
    description: "Request or process controlled closure of outstanding PO quantities.",
    group: "Purchase Orders",
    sensitive: true
  },
  [permissions.purchaseOrderAmend]: {
    label: "Request PO amendments",
    description: "Create controlled amendment requests instead of directly editing issued POs.",
    group: "Purchase Orders",
    sensitive: true
  },
  [permissions.inventoryBalanceView]: {
    label: "View inventory balances",
    description: "View scoped stock balances by branch or warehouse.",
    group: "Inventory",
    sensitive: false
  },
  [permissions.inventoryLedgerView]: {
    label: "View inventory ledger",
    description: "View immutable inventory movements and source links.",
    group: "Inventory",
    sensitive: false
  },
  [permissions.receivingView]: {
    label: "View receiving",
    description: "View delivery receiving records and discrepancies.",
    group: "Receiving",
    sensitive: false
  },
  [permissions.receivingCreate]: {
    label: "Create receiving records",
    description: "Create draft receiving records against issued POs.",
    group: "Receiving",
    sensitive: false
  },
  [permissions.receivingPost]: {
    label: "Post receiving",
    description: "Post accepted received quantities into the inventory ledger.",
    group: "Receiving",
    sensitive: true
  },
  [permissions.receivingReverse]: {
    label: "Reverse receiving",
    description: "Create controlled reversal movements for posted receiving records.",
    group: "Receiving",
    sensitive: true
  },
  [permissions.transferView]: {
    label: "View transfers",
    description: "View warehouse, branch, and inter-location transfer records.",
    group: "Transfers",
    sensitive: false
  },
  [permissions.transferCreate]: {
    label: "Request transfers",
    description: "Create stock transfer requests between authorized inventory locations.",
    group: "Transfers",
    sensitive: false
  },
  [permissions.transferSubmit]: {
    label: "Submit transfers",
    description: "Submit draft transfer requests for dispatch or approval workflow.",
    group: "Transfers",
    sensitive: false
  },
  [permissions.transferCancel]: {
    label: "Cancel transfers",
    description: "Cancel transfer requests with reason and audit history.",
    group: "Transfers",
    sensitive: true
  },
  [permissions.transferDispatch]: {
    label: "Dispatch transfers",
    description: "Post source-location dispatch movements for approved transfers.",
    group: "Transfers",
    sensitive: true
  },
  [permissions.transferReceive]: {
    label: "Receive transfers",
    description: "Confirm destination receipt and post destination stock movements.",
    group: "Transfers",
    sensitive: true
  },
  [permissions.transferReceiptReverse]: {
    label: "Reverse transfer receipts",
    description: "Create controlled reversal movements for transfer receipt corrections.",
    group: "Transfers",
    sensitive: true
  },
  [permissions.transferDiscrepancySettle]: {
    label: "Settle transfer discrepancies",
    description: "Resolve short, damaged, or disputed transfer quantities.",
    group: "Transfers",
    sensitive: true
  },
  [permissions.stockCountView]: {
    label: "View stock counts",
    description: "View scheduled and completed stock counts.",
    group: "Stock Counts",
    sensitive: false
  },
  [permissions.stockCountCreate]: {
    label: "Schedule stock counts",
    description: "Create count sessions for authorized locations and categories.",
    group: "Stock Counts",
    sensitive: false
  },
  [permissions.stockCountEnter]: {
    label: "Enter count lines",
    description: "Record physical counted quantities for count sessions.",
    group: "Stock Counts",
    sensitive: false
  },
  [permissions.stockCountSubmit]: {
    label: "Submit stock counts",
    description: "Submit completed count sessions for review.",
    group: "Stock Counts",
    sensitive: false
  },
  [permissions.stockCountReview]: {
    label: "Review stock counts",
    description: "Review count variances and authorize posting where allowed.",
    group: "Stock Counts",
    sensitive: true
  },
  [permissions.stockCountCancel]: {
    label: "Cancel stock counts",
    description: "Cancel count sessions with reason and audit history.",
    group: "Stock Counts",
    sensitive: true
  },
  [permissions.wastageView]: {
    label: "View wastage",
    description: "View wastage reports and approvals.",
    group: "Wastage",
    sensitive: false
  },
  [permissions.wastageCreate]: {
    label: "Log wastage",
    description: "Create wastage reports with required reasons and evidence.",
    group: "Wastage",
    sensitive: false
  },
  [permissions.wastageSubmit]: {
    label: "Submit wastage",
    description: "Submit wastage reports for review or approval.",
    group: "Wastage",
    sensitive: false
  },
  [permissions.wastageApprove]: {
    label: "Approve wastage",
    description: "Approve wastage reports before posting stock impact.",
    group: "Approvals",
    sensitive: true
  },
  [permissions.wastageReview]: {
    label: "Review wastage",
    description: "Review wastage reports and operational evidence.",
    group: "Wastage",
    sensitive: true
  },
  [permissions.wastagePost]: {
    label: "Post wastage",
    description: "Post approved wastage into the inventory ledger.",
    group: "Wastage",
    sensitive: true
  },
  [permissions.wastageReverse]: {
    label: "Reverse wastage",
    description: "Create controlled reversal movements for posted wastage.",
    group: "Wastage",
    sensitive: true
  },
  [permissions.wastageCancel]: {
    label: "Cancel wastage",
    description: "Cancel wastage reports with reason and audit history.",
    group: "Wastage",
    sensitive: true
  },
  [permissions.stockAdjustmentView]: {
    label: "View stock adjustments",
    description: "View manual stock adjustment requests and posting status.",
    group: "Stock Adjustments",
    sensitive: false
  },
  [permissions.stockAdjustmentCreate]: {
    label: "Create stock adjustments",
    description: "Create manual stock adjustment requests with reason and evidence.",
    group: "Stock Adjustments",
    sensitive: false
  },
  [permissions.stockAdjustmentSubmit]: {
    label: "Submit stock adjustments",
    description: "Submit stock adjustment requests for review.",
    group: "Stock Adjustments",
    sensitive: false
  },
  [permissions.stockAdjustmentApprove]: {
    label: "Approve stock adjustments",
    description: "Approve manual adjustments before posting inventory impact.",
    group: "Approvals",
    sensitive: true
  },
  [permissions.stockAdjustmentPost]: {
    label: "Post stock adjustments",
    description: "Post approved adjustments into the inventory ledger.",
    group: "Stock Adjustments",
    sensitive: true
  },
  [permissions.stockAdjustmentReverse]: {
    label: "Reverse stock adjustments",
    description: "Create controlled reversal movements for posted adjustments.",
    group: "Stock Adjustments",
    sensitive: true
  },
  [permissions.stockAdjustmentCancel]: {
    label: "Cancel stock adjustments",
    description: "Cancel adjustment requests with reason and audit history.",
    group: "Stock Adjustments",
    sensitive: true
  },
  [permissions.projectView]: {
    label: "View projects",
    description: "View authorized project tracker records.",
    group: "Projects",
    sensitive: false
  },
  [permissions.projectCreate]: {
    label: "Create projects",
    description: "Create scoped project tracker records.",
    group: "Projects",
    sensitive: false
  },
  [permissions.projectManage]: {
    label: "Manage projects",
    description: "Manage project status, scope, and controlled project actions.",
    group: "Projects",
    sensitive: true
  },
  [permissions.projectManageMembers]: {
    label: "Manage project members",
    description: "Add or remove project members and membership roles.",
    group: "Projects",
    sensitive: true
  },
  [permissions.projectRiskCreate]: {
    label: "Create project risks",
    description: "Create project risks and blockers.",
    group: "Projects",
    sensitive: false
  },
  [permissions.projectRiskUpdate]: {
    label: "Update project risks",
    description: "Update project risk severity, owner, and mitigation state.",
    group: "Projects",
    sensitive: false
  },
  [permissions.projectRiskResolve]: {
    label: "Resolve project risks",
    description: "Resolve project blockers and risks with audit history.",
    group: "Projects",
    sensitive: false
  },
  [permissions.projectRiskArchive]: {
    label: "Archive project risks",
    description: "Archive project risks while retaining history.",
    group: "Projects",
    sensitive: true
  },
  [permissions.projectTemplateView]: {
    label: "View project templates",
    description: "View configured project templates.",
    group: "Project Templates",
    sensitive: false
  },
  [permissions.projectTemplateConfigure]: {
    label: "Configure project templates",
    description: "Create and configure project templates used for future projects.",
    group: "Project Templates",
    sensitive: true
  }
};

const recommendedRolePermissionCodes: Record<string, string[]> = {
  CONFIGURED_REQUESTER: [
    permissions.purchaseRequestCreate,
    permissions.purchaseRequestSubmit,
    permissions.purchaseOrderView,
    permissions.wastageView,
    permissions.wastageCreate,
    permissions.wastageSubmit,
    permissions.stockAdjustmentView,
    permissions.stockAdjustmentCreate,
    permissions.stockAdjustmentSubmit
  ],
  CONFIGURED_APPROVER: [
    permissions.purchaseRequestApprove,
    permissions.quoteApprove,
    permissions.purchaseOrderApprove,
    permissions.purchaseOrderView,
    permissions.wastageView,
    permissions.wastageApprove,
    permissions.wastageReview,
    permissions.stockAdjustmentView,
    permissions.stockAdjustmentApprove,
    permissions.transferDiscrepancySettle
  ],
  CONFIGURED_ADMIN: Object.values(permissions)
};

function sentenceFromPermissionCode(code: string) {
  return code
    .split(".")
    .slice(1)
    .join(" ")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

export function getPermissionPresentation(code: string): PermissionPresentation {
  const presentation = permissionPresentations[code];
  if (presentation) {
    return { code, ...presentation };
  }

  const [module = "Other"] = code.split(".");
  return {
    code,
    label: sentenceFromPermissionCode(code),
    description: "Controlled ERP capability.",
    group: sentenceFromPermissionCode(module),
    sensitive: code.includes("approve") || code.includes("post") || code.includes("reverse")
  };
}

export function getRecommendedPermissionCodesForRole(roleCode: string) {
  return recommendedRolePermissionCodes[roleCode] ?? [];
}

export function getRecommendedRoleLabel(roleCode: string) {
  return recommendedRolePermissionCodes[roleCode]
    ? "System recommended set"
    : "No recommended set configured";
}

export function isSensitivePermissionCode(code: string) {
  return getPermissionPresentation(code).sensitive;
}
