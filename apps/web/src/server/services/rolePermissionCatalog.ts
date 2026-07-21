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
  [permissions.tenantRoleAdminister]: {
    label: "Administer tenant-wide roles",
    description: "Grant, review, change, or revoke roles whose permissions apply across every company scope assigned to a user.",
    group: "Administration",
    sensitive: true
  },
  [permissions.evidenceLegalHoldSet]: {
    label: "Place evidence legal holds",
    description: "Place preservation-only legal holds on company-scoped evidence. Hold release and physical purge are not granted.",
    group: "Evidence Governance",
    sensitive: true
  },
  [permissions.evidenceRetentionView]: {
    label: "View evidence retention register",
    description: "View confidential company-wide evidence retention and legal-hold metadata without accessing file bytes.",
    group: "Evidence Governance",
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
  },
  [permissions.recipeView]: {
    label: "View recipes and menu costing",
    description: "View recipe versions, ingredient lines, menu prices, and estimated food-cost results.",
    group: "Restaurant Operations",
    sensitive: false
  },
  [permissions.recipeManage]: {
    label: "Draft recipe versions",
    description: "Create and edit controlled draft recipe versions before submission.",
    group: "Restaurant Operations",
    sensitive: true
  },
  [permissions.recipeSubmit]: {
    label: "Submit recipe versions",
    description: "Submit draft recipe versions into controlled review workflow.",
    group: "Restaurant Operations",
    sensitive: true
  },
  [permissions.recipeReview]: {
    label: "Review recipe versions",
    description: "Review submitted recipe versions and return or reject them with required reason.",
    group: "Restaurant Operations",
    sensitive: true
  },
  [permissions.recipeApprove]: {
    label: "Approve recipe versions",
    description: "Approve cost-impacting recipe versions before publication.",
    group: "Restaurant Operations",
    sensitive: true
  },
  [permissions.recipePublish]: {
    label: "Publish recipe versions",
    description: "Publish approved recipe versions as the effective costing basis.",
    group: "Restaurant Operations",
    sensitive: true
  },
  [permissions.recipeArchive]: {
    label: "Archive recipe versions",
    description: "Archive or cancel controlled recipe versions without hard deletion.",
    group: "Restaurant Operations",
    sensitive: true
  },
  [permissions.menuCostView]: {
    label: "View menu cost analysis",
    description: "View menu item cost, margin, and food-cost percentage analysis.",
    group: "Restaurant Operations",
    sensitive: false
  },
  [permissions.menuPriceDecide]: {
    label: "Decide menu price changes",
    description: "Review, approve, apply, or cancel controlled menu-price decision records.",
    group: "Restaurant Operations",
    sensitive: true
  },
  [permissions.branchOperationsView]: {
    label: "View branch opening and closing controls",
    description: "View daily branch readiness checklists, sign-off status, and operational exceptions.",
    group: "Restaurant Operations",
    sensitive: false
  },
  [permissions.branchOperationsCreate]: {
    label: "Create branch checklists",
    description: "Record scoped daily opening, closing, or midshift branch checklist source records.",
    group: "Restaurant Operations",
    sensitive: true
  },
  [permissions.branchOperationsReview]: {
    label: "Review branch checklists",
    description: "Review and sign off scoped branch readiness checklists without posting inventory or closing source exceptions.",
    group: "Restaurant Operations",
    sensitive: true
  },
  [permissions.branchOperationsCorrect]: {
    label: "Correct branch checklists",
    description: "Request or approve controlled corrections to submitted branch checklist records.",
    group: "Restaurant Operations",
    sensitive: true
  },
  [permissions.foodSafetyView]: {
    label: "View food safety and compliance logs",
    description: "View temperature, sanitation, compliance, exception, and corrective-action records.",
    group: "Restaurant Operations",
    sensitive: false
  },
  [permissions.foodSafetyCreate]: {
    label: "Record food-safety logs",
    description: "Record scoped temperature, sanitation, compliance, and corrective-action log source records.",
    group: "Restaurant Operations",
    sensitive: true
  },
  [permissions.foodSafetyReview]: {
    label: "Review food-safety logs",
    description: "Review scoped food-safety logs without creating incidents, posting wastage, or changing stock.",
    group: "Restaurant Operations",
    sensitive: true
  },
  [permissions.foodSafetyCorrect]: {
    label: "Correct food-safety logs",
    description: "Request or approve controlled corrections to submitted food-safety records.",
    group: "Restaurant Operations",
    sensitive: true
  },
  [permissions.incidentView]: {
    label: "View operational incidents",
    description: "View branch incidents, owners, severity, due dates, corrective actions, and evidence references.",
    group: "Restaurant Operations",
    sensitive: false
  },
  [permissions.incidentCreate]: {
    label: "Log operational incidents",
    description: "Create branch incident records with structured severity, category, due date, corrective action, and evidence references.",
    group: "Restaurant Operations",
    sensitive: true
  },
  [permissions.incidentResolve]: {
    label: "Resolve operational incidents",
    description: "Resolve scoped incident records with resolution date, corrective action, and evidence references.",
    group: "Restaurant Operations",
    sensitive: true
  },
  [permissions.incidentCorrect]: {
    label: "Correct operational incidents",
    description: "Request or approve controlled corrections to operational incident records.",
    group: "Restaurant Operations",
    sensitive: true
  },
  [permissions.maintenanceView]: {
    label: "View maintenance tickets",
    description: "View equipment and facility maintenance tickets, priorities, downtime, SLA due dates, and evidence references.",
    group: "Restaurant Operations",
    sensitive: false
  },
  [permissions.maintenanceCreate]: {
    label: "Create maintenance tickets",
    description: "Create equipment or facility maintenance tickets with asset, priority, due date, downtime, corrective action, and evidence references.",
    group: "Restaurant Operations",
    sensitive: true
  },
  [permissions.maintenanceComplete]: {
    label: "Complete maintenance tickets",
    description: "Complete scoped maintenance tickets with completion date, corrective action, downtime, and evidence references.",
    group: "Restaurant Operations",
    sensitive: true
  },
  [permissions.maintenanceCorrect]: {
    label: "Correct maintenance tickets",
    description: "Request or approve controlled corrections to maintenance ticket records.",
    group: "Restaurant Operations",
    sensitive: true
  },
  [permissions.financeView]: {
    label: "View finance workspace",
    description: "View Phase 3 finance dashboards, guardrails, accounting readiness, and source-linked finance summaries.",
    group: "Finance",
    sensitive: false
  },
  [permissions.financeConfigure]: {
    label: "Configure finance controls",
    description: "Manage finance configuration such as accounting periods, control policies, and guarded setup values.",
    group: "Finance",
    sensitive: true
  },
  [permissions.financeLedgerView]: {
    label: "View general ledger",
    description: "View ledger and journal records once finance posting controls are enabled.",
    group: "Finance",
    sensitive: true
  },
  [permissions.financePayablesView]: {
    label: "View accounts payable",
    description: "View supplier invoice, matching, payable, and payment readiness information.",
    group: "Finance",
    sensitive: true
  },
  [permissions.financeApInvoiceCreate]: {
    label: "Capture supplier invoices",
    description: "Create draft supplier invoices linked to purchase orders and receiving evidence without changing source records.",
    group: "Finance",
    sensitive: true
  },
  [permissions.financeApInvoiceSubmit]: {
    label: "Submit supplier invoices",
    description: "Submit captured supplier invoices for AP match evaluation and controlled review.",
    group: "Finance",
    sensitive: true
  },
  [permissions.financeApInvoiceMatch]: {
    label: "Run AP invoice matching",
    description: "Evaluate supplier invoices against purchase order and receiving records and place exceptions on hold when needed.",
    group: "Finance",
    sensitive: true
  },
  [permissions.financeApInvoiceReviewException]: {
    label: "Review AP match exceptions",
    description: "Review and resolve AP invoice match exceptions while keeping procurement and inventory records authoritative.",
    group: "Finance",
    sensitive: true
  },
  [permissions.financeApInvoiceCancel]: {
    label: "Cancel supplier invoices",
    description: "Cancel draft or submitted supplier invoice records with reason and audit history.",
    group: "Finance",
    sensitive: true
  },
  [permissions.financeSupplierCreditCreate]: {
    label: "Record supplier credits",
    description: "Create draft supplier credit notes linked to original AP invoices without applying settlement or changing source records.",
    group: "Finance",
    sensitive: true
  },
  [permissions.financeSupplierCreditSubmit]: {
    label: "Submit supplier credits for application review",
    description: "Move draft supplier credit notes into pending application review without reducing AP balances or posting journals.",
    group: "Finance",
    sensitive: true
  },
  [permissions.financeSupplierCreditCancel]: {
    label: "Cancel supplier credits",
    description: "Cancel draft supplier credit notes with reason and audit history before application.",
    group: "Finance",
    sensitive: true
  },
  [permissions.financePaymentRequestCreate]: {
    label: "Create payment requests",
    description: "Prepare controlled payment requests from approved source records and supporting evidence.",
    group: "Finance",
    sensitive: true
  },
  [permissions.financePaymentRequestApprove]: {
    label: "Approve payment requests",
    description: "Approve scoped payment requests while preserving segregation of duties.",
    group: "Finance",
    sensitive: true
  },
  [permissions.financePaymentRelease]: {
    label: "Release payments",
    description: "Release approved payments through configured cash or bank controls.",
    group: "Finance",
    sensitive: true
  },
  [permissions.financeDisbursementCreate]: {
    label: "Create non-supplier disbursements",
    description: "Prepare controlled employee, custodian, or external-party disbursement requests without using supplier AP payment requests.",
    group: "Finance",
    sensitive: true
  },
  [permissions.financeDisbursementApprove]: {
    label: "Approve non-supplier disbursements",
    description: "Approve scoped non-supplier disbursement requests while preserving segregation of duties and payment-release separation.",
    group: "Finance",
    sensitive: true
  },
  [permissions.financeReconciliationView]: {
    label: "View bank and cash reconciliation",
    description: "View reconciliation status, unmatched statement rows, branch deposits, and cash exceptions.",
    group: "Finance",
    sensitive: true
  },
  [permissions.financePeriodCloseManage]: {
    label: "Manage accounting period close",
    description: "Manage accounting period close, reopen, and lock workflows with controlled approval and audit.",
    group: "Finance",
    sensitive: true
  },
  [permissions.financeJournalCreate]: {
    label: "Create journal drafts",
    description: "Prepare controlled manual journal drafts with scoped accounting period, accounts, dimensions, reason, and evidence.",
    group: "Finance",
    sensitive: true
  },
  [permissions.financeJournalSubmit]: {
    label: "Submit journal drafts",
    description: "Submit balanced manual journal drafts for approval without posting them.",
    group: "Finance",
    sensitive: true
  },
  [permissions.financeJournalApprove]: {
    label: "Approve manual journals",
    description: "Approve balanced scoped manual journals while preserving no self-approval controls.",
    group: "Finance",
    sensitive: true
  },
  [permissions.financeJournalPost]: {
    label: "Post approved journals",
    description: "Post approved manual journals to the controlled ledger when the accounting period is open.",
    group: "Finance",
    sensitive: true
  },
  [permissions.financeJournalReverse]: {
    label: "Reverse posted journals",
    description: "Create controlled reversal journals instead of editing or deleting posted journals.",
    group: "Finance",
    sensitive: true
  },
  [permissions.financeBudgetView]: {
    label: "View budgets",
    description: "View scoped budget, commitment, actual, remaining-balance, and exception information.",
    group: "Finance",
    sensitive: true
  },
  [permissions.financeBudgetManage]: {
    label: "Manage budgets",
    description: "Create and maintain budget lines, revisions, and scope assignments before approval.",
    group: "Finance",
    sensitive: true
  },
  [permissions.financeBudgetApprove]: {
    label: "Approve budgets",
    description: "Approve scoped budgets and budget revisions while preserving segregation of duties.",
    group: "Finance",
    sensitive: true
  },
  [permissions.financeBudgetCommitmentReview]: {
    label: "Review budget commitments",
    description: "Review source-linked budget commitments and exceptions without changing purchase, payable, or inventory records.",
    group: "Finance",
    sensitive: true
  },
  [permissions.financeExpenseRequestView]: {
    label: "View expense requests",
    description: "View scoped operational expense requests, evidence, budget status, and source links.",
    group: "Finance",
    sensitive: true
  },
  [permissions.financeExpenseRequestCreate]: {
    label: "Create expense requests",
    description: "Create draft scoped expense requests with line details, reason, budget context, and evidence references.",
    group: "Finance",
    sensitive: true
  },
  [permissions.financeExpenseRequestSubmit]: {
    label: "Submit expense requests",
    description: "Submit own draft expense requests for controlled review without creating payments or journals.",
    group: "Finance",
    sensitive: true
  },
  [permissions.financeExpenseRequestApprove]: {
    label: "Approve expense requests",
    description: "Approve or reject scoped expense requests while preserving segregation of duties.",
    group: "Finance",
    sensitive: true
  },
  [permissions.financeExpenseRequestComplete]: {
    label: "Complete expense requests",
    description: "Mark approved expense requests complete after evidence review without settling payments or posting journals.",
    group: "Finance",
    sensitive: true
  },
  [permissions.financeCashAdvanceView]: {
    label: "View cash advances",
    description: "View scoped cash advance requests, liquidation status, movement history, and outstanding balances.",
    group: "Finance",
    sensitive: true
  },
  [permissions.financeCashAdvanceCreate]: {
    label: "Create cash advances",
    description: "Create draft cash advance requests with purpose, scope, due date, amount, and evidence references.",
    group: "Finance",
    sensitive: true
  },
  [permissions.financeCashAdvanceSubmit]: {
    label: "Submit cash advances",
    description: "Submit own draft cash advances for controlled review without releasing cash or posting journals.",
    group: "Finance",
    sensitive: true
  },
  [permissions.financeCashAdvanceApprove]: {
    label: "Approve cash advances",
    description: "Approve or reject scoped cash advance requests while preserving no self-approval controls.",
    group: "Finance",
    sensitive: true
  },
  [permissions.financeCashAdvanceLiquidate]: {
    label: "Submit cash advance liquidations",
    description: "Record liquidation claims and receipt evidence against an approved cash advance without posting settlement.",
    group: "Finance",
    sensitive: true
  },
  [permissions.financeCashAdvanceReviewLiquidation]: {
    label: "Review cash advance liquidations",
    description: "Review liquidation evidence, exceptions, overages, and shortfalls before later payment or posting workflows.",
    group: "Finance",
    sensitive: true
  },
  [permissions.financePettyCashView]: {
    label: "View petty cash",
    description: "View scoped petty cash funds, requests, liquidation cycles, ledger markers, and balance exceptions.",
    group: "Finance",
    sensitive: true
  },
  [permissions.financePettyCashCreate]: {
    label: "Create petty cash records",
    description: "Create petty cash funds and draft replenishment or disbursement requests with scope, custodian, reason, and evidence.",
    group: "Finance",
    sensitive: true
  },
  [permissions.financePettyCashSubmit]: {
    label: "Submit petty cash requests",
    description: "Submit scoped petty cash replenishment or disbursement requests for controlled review.",
    group: "Finance",
    sensitive: true
  },
  [permissions.financePettyCashApprove]: {
    label: "Approve petty cash requests",
    description: "Approve or reject scoped petty cash requests while preserving no self-approval controls.",
    group: "Finance",
    sensitive: true
  },
  [permissions.financePettyCashReplenish]: {
    label: "Record petty cash replenishment",
    description: "Record approved offline petty cash replenishment markers without posting a bank, payment, or journal entry.",
    group: "Finance",
    sensitive: true
  },
  [permissions.financePettyCashLiquidate]: {
    label: "Submit petty cash liquidations",
    description: "Submit petty cash liquidation cycles and receipt lines for finance review.",
    group: "Finance",
    sensitive: true
  },
  [permissions.financePettyCashReviewLiquidation]: {
    label: "Review petty cash liquidations",
    description: "Review petty cash liquidation evidence, shortages, overages, and closure readiness before later posting policy is enabled.",
    group: "Finance",
    sensitive: true
  },
  [permissions.workforceView]: {
    label: "View workforce records",
    description: "View scoped employee registry, assignments, leave, overtime, training, and document readiness records.",
    group: "Workforce",
    sensitive: true
  },
  [permissions.workforceManage]: {
    label: "Manage workforce records",
    description: "Create and maintain employee registry, assignments, training, and compliance readiness records.",
    group: "Workforce",
    sensitive: true
  },
  [permissions.workforceLeaveApprove]: {
    label: "Approve leave requests",
    description: "Review and approve scoped leave requests while preserving no self-approval controls.",
    group: "Workforce",
    sensitive: true
  },
  [permissions.workforceOvertimeApprove]: {
    label: "Approve overtime requests",
    description: "Review and approve scoped overtime requests while preserving no self-approval controls.",
    group: "Workforce",
    sensitive: true
  },
  [permissions.workforceScheduleView]: {
    label: "View workforce schedules",
    description: "View scoped shift schedules, staffing coverage, and manpower gaps without changing payroll or attendance records.",
    group: "Workforce",
    sensitive: true
  },
  [permissions.workforceScheduleManage]: {
    label: "Manage workforce schedules",
    description: "Create, review, approve, publish, and close scoped shift schedules with audit history.",
    group: "Workforce",
    sensitive: true
  },
  [permissions.workforceAttendanceImportView]: {
    label: "View attendance import evidence",
    description: "View scoped attendance import batches, accepted rows, and exceptions as evidence only.",
    group: "Workforce",
    sensitive: true
  },
  [permissions.workforceAttendanceImportManage]: {
    label: "Manage attendance import evidence",
    description: "Import, validate, reject, void, and review attendance evidence batches without posting payroll or finance entries.",
    group: "Workforce",
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
    permissions.stockAdjustmentSubmit,
    permissions.branchOperationsView,
    permissions.branchOperationsCreate,
    permissions.foodSafetyView,
    permissions.foodSafetyCreate,
    permissions.incidentView,
    permissions.incidentCreate,
    permissions.incidentResolve,
    permissions.maintenanceView,
    permissions.maintenanceCreate,
    permissions.maintenanceComplete,
    permissions.financeView,
    permissions.financePayablesView,
    permissions.financeApInvoiceCreate,
    permissions.financeApInvoiceSubmit,
    permissions.financeSupplierCreditCreate,
    permissions.financeSupplierCreditSubmit,
    permissions.financeJournalCreate,
    permissions.financeJournalSubmit,
    permissions.workforceView,
    permissions.workforceScheduleView,
    permissions.workforceAttendanceImportView
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
    permissions.transferDiscrepancySettle,
    permissions.recipeReview,
    permissions.recipeApprove,
    permissions.menuPriceDecide,
    permissions.branchOperationsReview,
    permissions.branchOperationsCorrect,
    permissions.foodSafetyReview,
    permissions.foodSafetyCorrect,
    permissions.incidentCorrect,
    permissions.maintenanceCorrect,
    permissions.financeView,
    permissions.financePayablesView,
    permissions.financeApInvoiceMatch,
    permissions.financeApInvoiceReviewException,
    permissions.financeSupplierCreditCancel,
    permissions.financePaymentRequestApprove,
    permissions.financeJournalApprove,
    permissions.workforceView,
    permissions.workforceLeaveApprove,
    permissions.workforceOvertimeApprove,
    permissions.workforceScheduleView,
    permissions.workforceAttendanceImportView
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
