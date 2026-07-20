import { prisma } from "./client";
import { phase2WorkflowPolicySeedRows } from "./phase2-workflow-policies";

const ids = {
  tenantId: "00000000-0000-4000-8000-000000000001",
  companyId: "00000000-0000-4000-8000-000000000002",
  brandId: "00000000-0000-4000-8000-000000000003",
  locationId: "00000000-0000-4000-8000-000000000004",
  userId: "00000000-0000-4000-8000-000000000005",
  requesterRoleId: "00000000-0000-4000-8000-000000000006",
  approverRoleId: "00000000-0000-4000-8000-000000000007",
  createPermissionId: "00000000-0000-4000-8000-000000000008",
  submitPermissionId: "00000000-0000-4000-8000-000000000009",
  approvalRuleId: "00000000-0000-4000-8000-000000000010",
  approvalRuleStepId: "00000000-0000-4000-8000-000000000011",
  emergencyPurchaseRequestApprovalRuleId:
    "00000000-0000-4000-8000-000000000902",
  emergencyPurchaseRequestApprovalRuleStepId:
    "00000000-0000-4000-8000-000000000903",
  approverUserId: "00000000-0000-4000-8000-000000000012",
  approvePermissionId: "00000000-0000-4000-8000-000000000013",
  adminUserId: "00000000-0000-4000-8000-000000000014",
  adminRoleId: "00000000-0000-4000-8000-000000000015",
  administerPermissionId: "00000000-0000-4000-8000-000000000016",
  secondaryAdminUserId: "00000000-0000-4000-8000-000000000901",
  superUserId: "00000000-0000-4000-8000-000000000991",
  superRoleId: "00000000-0000-4000-8000-000000000992",
  chromiumScopeCandidateUserId: "00000000-0000-4000-8000-000000000017",
  mobileScopeCandidateUserId: "00000000-0000-4000-8000-000000000018",
  supplierId: "00000000-0000-4000-8000-000000000019",
  supplierContactId: "00000000-0000-4000-8000-000000000020",
  itemCategoryId: "00000000-0000-4000-8000-000000000021",
  kilogramUomId: "00000000-0000-4000-8000-000000000022",
  gramUomId: "00000000-0000-4000-8000-000000000023",
  itemId: "00000000-0000-4000-8000-000000000024",
  itemConversionId: "00000000-0000-4000-8000-000000000025",
  supplierItemLinkId: "00000000-0000-4000-8000-000000000026",
  supplierPriceHistoryId: "00000000-0000-4000-8000-000000000027",
  quoteManagePermissionId: "00000000-0000-4000-8000-000000000028",
  quoteApprovePermissionId: "00000000-0000-4000-8000-000000000029",
  quotationRecommendationApprovalRuleId: "00000000-0000-4000-8000-000000000030",
  quotationRecommendationApprovalRuleStepId:
    "00000000-0000-4000-8000-000000000031",
  purchaseOrderViewPermissionId: "00000000-0000-4000-8000-000000000032",
  purchaseOrderCreatePermissionId: "00000000-0000-4000-8000-000000000033",
  purchaseOrderSubmitPermissionId: "00000000-0000-4000-8000-000000000034",
  purchaseOrderApprovePermissionId: "00000000-0000-4000-8000-000000000035",
  purchaseOrderApprovalRuleId: "00000000-0000-4000-8000-000000000036",
  purchaseOrderApprovalRuleStepId: "00000000-0000-4000-8000-000000000037",
  purchaseOrderIssuePermissionId: "00000000-0000-4000-8000-000000000038",
  inventoryLocationId: "00000000-0000-4000-8000-000000000039",
  receivingViewPermissionId: "00000000-0000-4000-8000-000000000040",
  receivingCreatePermissionId: "00000000-0000-4000-8000-000000000041",
  receivingPostPermissionId: "00000000-0000-4000-8000-000000000042",
  inventoryBalanceViewPermissionId: "00000000-0000-4000-8000-000000000043",
  inventoryLedgerViewPermissionId: "00000000-0000-4000-8000-000000000044",
  transferViewPermissionId: "00000000-0000-4000-8000-000000000045",
  transferCreatePermissionId: "00000000-0000-4000-8000-000000000046",
  transferSubmitPermissionId: "00000000-0000-4000-8000-000000000047",
  transferCancelPermissionId: "00000000-0000-4000-8000-000000000048",
  warehouseLocationId: "00000000-0000-4000-8000-000000000049",
  warehouseInventoryLocationId: "00000000-0000-4000-8000-000000000050",
  transferDispatchPermissionId: "00000000-0000-4000-8000-000000000051",
  transferReceivePermissionId: "00000000-0000-4000-8000-000000000052",
  stockCountViewPermissionId: "00000000-0000-4000-8000-000000000053",
  stockCountCreatePermissionId: "00000000-0000-4000-8000-000000000054",
  stockCountEnterPermissionId: "00000000-0000-4000-8000-000000000055",
  stockCountSubmitPermissionId: "00000000-0000-4000-8000-000000000056",
  stockCountReviewPermissionId: "00000000-0000-4000-8000-000000000057",
  stockCountCancelPermissionId: "00000000-0000-4000-8000-000000000058",
  purchaseOrderCancelPermissionId: "00000000-0000-4000-8000-000000000059",
  wastageViewPermissionId: "00000000-0000-4000-8000-000000000060",
  wastageCreatePermissionId: "00000000-0000-4000-8000-000000000061",
  wastageSubmitPermissionId: "00000000-0000-4000-8000-000000000062",
  wastageReviewPermissionId: "00000000-0000-4000-8000-000000000063",
  wastageCancelPermissionId: "00000000-0000-4000-8000-000000000064",
  wastageApprovePermissionId: "00000000-0000-4000-8000-000000000065",
  wastageApprovalRuleId: "00000000-0000-4000-8000-000000000066",
  wastageApprovalRuleStepId: "00000000-0000-4000-8000-000000000067",
  wastagePostPermissionId: "00000000-0000-4000-8000-000000000068",
  wastageReversePermissionId: "00000000-0000-4000-8000-000000000069",
  stockAdjustmentViewPermissionId: "00000000-0000-4000-8000-000000000070",
  stockAdjustmentCreatePermissionId: "00000000-0000-4000-8000-000000000071",
  stockAdjustmentSubmitPermissionId: "00000000-0000-4000-8000-000000000072",
  stockAdjustmentCancelPermissionId: "00000000-0000-4000-8000-000000000073",
  purchaseOrderCloseRemainingPermissionId:
    "00000000-0000-4000-8000-000000000074",
  purchaseOrderBalanceClosureApprovalRuleId:
    "00000000-0000-4000-8000-000000000075",
  purchaseOrderBalanceClosureApprovalRuleStepId:
    "00000000-0000-4000-8000-000000000076",
  wastagePolicyId: "00000000-0000-4000-8000-000000000077",
  stockAdjustmentApprovePermissionId: "00000000-0000-4000-8000-000000000078",
  stockAdjustmentPostPermissionId: "00000000-0000-4000-8000-000000000079",
  stockAdjustmentReversePermissionId: "00000000-0000-4000-8000-000000000080",
  stockAdjustmentApprovalRuleId: "00000000-0000-4000-8000-000000000081",
  stockAdjustmentApprovalRuleStepId: "00000000-0000-4000-8000-000000000082",
  receivingReversePermissionId: "00000000-0000-4000-8000-000000000083",
  stockCountVarianceApprovalRuleId: "00000000-0000-4000-8000-000000000084",
  stockCountVarianceApprovalRuleStepId: "00000000-0000-4000-8000-000000000085",
  transferReceiptReversePermissionId: "00000000-0000-4000-8000-000000000086",
  purchaseOrderAmendPermissionId: "00000000-0000-4000-8000-000000000098",
  purchaseOrderAmendmentApprovalRuleId: "00000000-0000-4000-8000-000000000099",
  purchaseOrderAmendmentApprovalRuleStepId:
    "00000000-0000-4000-8000-000000000100",
  projectViewPermissionId: "00000000-0000-4000-8000-000000000087",
  projectCreatePermissionId: "00000000-0000-4000-8000-000000000088",
  projectManagePermissionId: "00000000-0000-4000-8000-000000000089",
  projectManageMembersPermissionId: "00000000-0000-4000-8000-000000000090",
  projectTemplateViewPermissionId: "00000000-0000-4000-8000-000000000091",
  projectTemplateConfigurePermissionId: "00000000-0000-4000-8000-000000000092",
  projectRiskCreatePermissionId: "00000000-0000-4000-8000-000000000093",
  projectRiskUpdatePermissionId: "00000000-0000-4000-8000-000000000094",
  projectRiskResolvePermissionId: "00000000-0000-4000-8000-000000000095",
  projectRiskArchivePermissionId: "00000000-0000-4000-8000-000000000096",
  transferDiscrepancySettlePermissionId: "00000000-0000-4000-8000-000000000097",
  recipeViewPermissionId: "00000000-0000-4000-8000-000000000101",
  recipeManagePermissionId: "00000000-0000-4000-8000-000000000102",
  menuCostViewPermissionId: "00000000-0000-4000-8000-000000000103",
  branchOperationsViewPermissionId: "00000000-0000-4000-8000-000000000104",
  branchOperationsReviewPermissionId: "00000000-0000-4000-8000-000000000112",
  branchOperationsCreatePermissionId: "00000000-0000-4000-8000-000000000114",
  foodSafetyViewPermissionId: "00000000-0000-4000-8000-000000000105",
  foodSafetyReviewPermissionId: "00000000-0000-4000-8000-000000000113",
  foodSafetyCreatePermissionId: "00000000-0000-4000-8000-000000000115",
  incidentViewPermissionId: "00000000-0000-4000-8000-000000000106",
  maintenanceViewPermissionId: "00000000-0000-4000-8000-000000000107",
  incidentCreatePermissionId: "00000000-0000-4000-8000-000000000108",
  maintenanceCreatePermissionId: "00000000-0000-4000-8000-000000000109",
  maintenanceCompletePermissionId: "00000000-0000-4000-8000-000000000110",
  incidentResolvePermissionId: "00000000-0000-4000-8000-000000000111",
  recipeSubmitPermissionId: "00000000-0000-4000-8000-000000000116",
  recipeReviewPermissionId: "00000000-0000-4000-8000-000000000117",
  recipeApprovePermissionId: "00000000-0000-4000-8000-000000000118",
  recipePublishPermissionId: "00000000-0000-4000-8000-000000000119",
  recipeArchivePermissionId: "00000000-0000-4000-8000-000000000120",
  menuPriceDecidePermissionId: "00000000-0000-4000-8000-000000000121",
  branchOperationsCorrectPermissionId: "00000000-0000-4000-8000-000000000122",
  foodSafetyCorrectPermissionId: "00000000-0000-4000-8000-000000000123",
  incidentCorrectPermissionId: "00000000-0000-4000-8000-000000000124",
  maintenanceCorrectPermissionId: "00000000-0000-4000-8000-000000000125",
  financeViewPermissionId: "00000000-0000-4000-8000-000000000126",
  financeConfigurePermissionId: "00000000-0000-4000-8000-000000000127",
  financeLedgerViewPermissionId: "00000000-0000-4000-8000-000000000128",
  financePayablesViewPermissionId: "00000000-0000-4000-8000-000000000129",
  financePaymentRequestCreatePermissionId:
    "00000000-0000-4000-8000-000000000130",
  financePaymentRequestApprovePermissionId:
    "00000000-0000-4000-8000-000000000131",
  paymentRequestApprovalRuleId: "00000000-0000-4000-8000-000000000932",
  paymentRequestApprovalRuleStepId: "00000000-0000-4000-8000-000000000933",
  financePaymentReleasePermissionId: "00000000-0000-4000-8000-000000000132",
  paymentReleaseApprovalRuleId: "00000000-0000-4000-8000-000000000934",
  paymentReleaseApprovalRuleStepId: "00000000-0000-4000-8000-000000000935",
  financeCashDepositCreatePermissionId:
    "00000000-0000-4000-8000-000000000175",
  financeReconciliationViewPermissionId:
    "00000000-0000-4000-8000-000000000133",
  financeReconciliationMatchPermissionId:
    "00000000-0000-4000-8000-000000000176",
  financePeriodCloseManagePermissionId:
    "00000000-0000-4000-8000-000000000134",
  financeJournalCreatePermissionId:
    "00000000-0000-4000-8000-000000000135",
  financeJournalSubmitPermissionId:
    "00000000-0000-4000-8000-000000000136",
  financeJournalApprovePermissionId:
    "00000000-0000-4000-8000-000000000137",
  financeJournalPostPermissionId: "00000000-0000-4000-8000-000000000138",
  financeJournalReversePermissionId:
    "00000000-0000-4000-8000-000000000139",
  financeApInvoiceCreatePermissionId:
    "00000000-0000-4000-8000-000000000140",
  financeApInvoiceSubmitPermissionId:
    "00000000-0000-4000-8000-000000000141",
  financeApInvoiceMatchPermissionId:
    "00000000-0000-4000-8000-000000000142",
  financeApInvoiceReviewExceptionPermissionId:
    "00000000-0000-4000-8000-000000000143",
  financeApInvoiceCancelPermissionId:
    "00000000-0000-4000-8000-000000000144",
  workforceViewPermissionId: "00000000-0000-4000-8000-000000000145",
  workforceManagePermissionId: "00000000-0000-4000-8000-000000000146",
  workforceLeaveApprovePermissionId: "00000000-0000-4000-8000-000000000147",
  workforceOvertimeApprovePermissionId: "00000000-0000-4000-8000-000000000148",
  workforceLeaveApprovalRuleId: "00000000-0000-4000-8000-000000000936",
  workforceLeaveApprovalRuleStepId: "00000000-0000-4000-8000-000000000937",
  workforceOvertimeApprovalRuleId: "00000000-0000-4000-8000-000000000938",
  workforceOvertimeApprovalRuleStepId: "00000000-0000-4000-8000-000000000939",
  workforceScheduleApprovalRuleId: "00000000-0000-4000-8000-000000000940",
  workforceScheduleApprovalRuleStepId: "00000000-0000-4000-8000-000000000941",
  attendanceImportApprovalRuleId: "00000000-0000-4000-8000-000000000942",
  attendanceImportApprovalRuleStepId: "00000000-0000-4000-8000-000000000943",
  financeBudgetViewPermissionId: "00000000-0000-4000-8000-000000000149",
  financeBudgetManagePermissionId: "00000000-0000-4000-8000-000000000150",
  financeBudgetApprovePermissionId: "00000000-0000-4000-8000-000000000151",
  financeBudgetCommitmentReviewPermissionId:
    "00000000-0000-4000-8000-000000000152",
  budgetRevisionApprovalRuleId: "00000000-0000-4000-8000-000000000924",
  budgetRevisionApprovalRuleStepId: "00000000-0000-4000-8000-000000000925",
  expenseRequestApprovalRuleId: "00000000-0000-4000-8000-000000000926",
  expenseRequestApprovalRuleStepId: "00000000-0000-4000-8000-000000000927",
  financeExpenseRequestViewPermissionId:
    "00000000-0000-4000-8000-000000000153",
  financeExpenseRequestCreatePermissionId:
    "00000000-0000-4000-8000-000000000154",
  financeExpenseRequestSubmitPermissionId:
    "00000000-0000-4000-8000-000000000155",
  financeExpenseRequestApprovePermissionId:
    "00000000-0000-4000-8000-000000000156",
  financeExpenseRequestCompletePermissionId:
    "00000000-0000-4000-8000-000000000157",
  financeCashAdvanceViewPermissionId:
    "00000000-0000-4000-8000-000000000158",
  financeCashAdvanceCreatePermissionId:
    "00000000-0000-4000-8000-000000000159",
  financeCashAdvanceSubmitPermissionId:
    "00000000-0000-4000-8000-000000000160",
  financeCashAdvanceApprovePermissionId:
    "00000000-0000-4000-8000-000000000161",
  financeCashAdvanceLiquidatePermissionId:
    "00000000-0000-4000-8000-000000000162",
  financeCashAdvanceReviewLiquidationPermissionId:
    "00000000-0000-4000-8000-000000000163",
  cashAdvanceApprovalRuleId: "00000000-0000-4000-8000-000000000928",
  cashAdvanceApprovalRuleStepId: "00000000-0000-4000-8000-000000000929",
  financePettyCashViewPermissionId:
    "00000000-0000-4000-8000-000000000164",
  financePettyCashCreatePermissionId:
    "00000000-0000-4000-8000-000000000165",
  financePettyCashSubmitPermissionId:
    "00000000-0000-4000-8000-000000000166",
  financePettyCashApprovePermissionId:
    "00000000-0000-4000-8000-000000000167",
  financePettyCashReplenishPermissionId:
    "00000000-0000-4000-8000-000000000168",
  financePettyCashLiquidatePermissionId:
    "00000000-0000-4000-8000-000000000169",
  financePettyCashReviewLiquidationPermissionId:
    "00000000-0000-4000-8000-000000000170",
  pettyCashApprovalRuleId: "00000000-0000-4000-8000-000000000930",
  pettyCashApprovalRuleStepId: "00000000-0000-4000-8000-000000000931",
  workforceScheduleViewPermissionId: "00000000-0000-4000-8000-000000000171",
  workforceScheduleManagePermissionId: "00000000-0000-4000-8000-000000000172",
  workforceAttendanceImportViewPermissionId:
    "00000000-0000-4000-8000-000000000173",
  workforceAttendanceImportManagePermissionId:
    "00000000-0000-4000-8000-000000000174",
};

const dec0036CompanyPolicyDefaults = [
  {
    key: "purchasing.approval.standard_threshold_php",
    category: "purchasing",
    label: "Standard purchase approval threshold",
    description:
      "Purchase requests at or above this amount require the configured approver route.",
    value: 10000,
    valueType: "NUMBER",
    unit: "PHP",
  },
  {
    key: "purchasing.approval.high_value_threshold_php",
    category: "purchasing",
    label: "High-value purchase threshold",
    description:
      "Purchases at or above this amount require senior review before supplier commitment.",
    value: 50000,
    valueType: "NUMBER",
    unit: "PHP",
  },
  {
    key: "purchasing.approval.senior_threshold_php",
    category: "purchasing",
    label: "Senior purchase approval threshold",
    description:
      "Purchases at or above this amount require executive review before supplier commitment.",
    value: 200000,
    valueType: "NUMBER",
    unit: "PHP",
  },
  {
    key: "purchasing.emergency.max_amount_php",
    category: "purchasing",
    label: "Emergency purchase ceiling",
    description:
      "Maximum emergency buy amount allowed before a normal purchase request is required.",
    value: 5000,
    valueType: "NUMBER",
    unit: "PHP",
  },
  {
    key: "purchasing.quotation.required_threshold_php",
    category: "purchasing",
    label: "Quotation comparison threshold",
    description:
      "Purchase requests at or above this estimated amount require controlled quotation comparison unless a documented single-source exception is approved.",
    value: 50000,
    valueType: "NUMBER",
    unit: "PHP",
  },
  {
    key: "purchasing.quotation.minimum_quotes",
    category: "purchasing",
    label: "Minimum quotes for controlled buying",
    description:
      "Minimum supplier quotes expected when quotation comparison is required.",
    value: 3,
    valueType: "NUMBER",
    unit: "quotes",
  },
  {
    key: "purchasing.supplier.po_allowed_statuses",
    category: "purchasing",
    label: "Supplier accreditation statuses allowed for normal POs",
    description:
      "Supplier accreditation statuses allowed for normal Purchase Order creation, approval submission, and issue.",
    value: ["APPROVED"],
    valueType: "JSON",
  },
  {
    key: "inventory.stock_count.standard_frequency_days",
    category: "inventory",
    label: "Standard stock-count frequency",
    description:
      "Default cycle-count interval for ordinary inventory items and locations.",
    value: 30,
    valueType: "NUMBER",
    unit: "days",
  },
  {
    key: "inventory.stock_count.high_risk_frequency_days",
    category: "inventory",
    label: "High-risk stock-count frequency",
    description:
      "Cycle-count interval for high-value, high-shrinkage, or food-safety-sensitive items.",
    value: 7,
    valueType: "NUMBER",
    unit: "days",
  },
  {
    key: "inventory.lot_expiry.required_categories",
    category: "inventory",
    label: "Lot and expiry required categories",
    description:
      "Item category codes that should require lot and expiry capture on controlled stock entries.",
    value: [
      "BEEF_CUTS",
      "POULTRY",
      "SEAFOOD",
      "FRESH_PRODUCE",
      "SAUCES",
      "READY_TO_EAT",
    ],
    valueType: "JSON",
  },
  {
    key: "inventory.adjustment.opening_balance_evidence_required",
    category: "inventory",
    label: "Opening balance evidence required",
    description:
      "Requires a count sheet, import reference, or signed source document for opening balances.",
    value: true,
    valueType: "BOOLEAN",
  },
  {
    key: "finance.payment_release.evidence_requirements_by_method",
    category: "finance",
    label: "Payment release evidence by method",
    description:
      "Defines the recommended evidence reference required before recording a manual payment release by payment method.",
    value: {
      BANK_TRANSFER: {
        executionEvidenceRequired: true,
        evidenceLabel: "Bank transfer confirmation or screenshot",
      },
      CHECK: {
        executionEvidenceRequired: true,
        evidenceLabel: "Check voucher and check number",
      },
      CASH: {
        executionEvidenceRequired: true,
        evidenceLabel: "Cash disbursement voucher and recipient acknowledgement",
      },
      MANUAL_REFERENCE: {
        executionEvidenceRequired: true,
        evidenceLabel: "Approved external payment proof",
      },
    },
    valueType: "JSON",
  },
  {
    key: "finance.payment_release.settlement_policy",
    category: "finance",
    label: "Payment release settlement policy",
    description:
      "Defines the Phase 3 boundary for manual payment release, AP settlement, bank mutation, journal posting, reconciliation, reversal, and UAT.",
    value: {
      releaseExecutionMode: "manual_evidence_only",
      apSettlementMutationAllowed: false,
      bankApiMutationAllowed: false,
      journalPostingAllowed: false,
      reconciliationRequiredBeforeSettlement: true,
      reversalRequiresReconciliationRecovery: true,
      uatRequiredBeforeSettlement: true,
      decisionBasis:
        "F&B pilot default allows manual evidence-backed payment release control and reconciliation matching only; AP settlement, bank mutation, and journal posting remain UAT-gated.",
    },
    valueType: "JSON",
  },
  {
    key: "finance.budget.source_hook_policy",
    category: "finance",
    label: "Budget source-hook rollout policy",
    description:
      "Controls whether PR, PO, AP, and expense source hooks operate in warning-only projection mode or hard-block mode after backfill and UAT approval.",
    value: {
      rolloutMode: "warning_only",
      commitmentProjectionEnabled: true,
      hardBlockEnabled: false,
      exceptionOverrideRequired: true,
      formalBackfillRequiredBeforeHardBlock: true,
      uatRequiredBeforeHardBlock: true,
      decisionBasis:
        "F&B pilot default uses warning-mode budget projections until source-line backfill and UAT signoff are complete.",
    },
    valueType: "JSON",
  },
  {
    key: "finance.cash_advance.recovery_policy",
    category: "finance",
    label: "Cash advance recovery policy",
    description:
      "Defines due-soon, overdue escalation, evidence, and UAT gates for employee/custodian cash-advance follow-up.",
    value: {
      dueSoonDays: 3,
      overdueEscalationDays: 7,
      recoveryOwnerRole: "finance_controller",
      requireEvidenceForDueDateExtension: true,
      uatRequiredBeforeCollections: true,
      decisionBasis:
        "F&B pilot default flags liquidation due soon within 3 days and escalates unresolved overdue advances after 7 days; formal collection/recovery execution remains UAT-gated.",
    },
    valueType: "JSON",
  },
  {
    key: "finance.expense_request.handoff_policy",
    category: "finance",
    label: "Expense request handoff policy",
    description:
      "Defines the approved path from operational expense request to AP/payment readiness without direct payment or settlement mutation.",
    value: {
      requiredHandoffPath: "expense_to_ap_to_payment_request",
      allowDirectPaymentRequest: false,
      duplicateApDraftGuardRequired: true,
      settlementMutationAllowed: false,
      uatRequiredBeforeSettlement: true,
      decisionBasis:
        "F&B pilot default requires expense requests to hand off to an AP invoice draft before payment-request preparation; direct payment and settlement mutation remain UAT-gated.",
    },
    valueType: "JSON",
  },
  {
    key: "reporting.export.require_scope_filters",
    category: "reporting",
    label: "Exports require scope filters",
    description:
      "Report exports must preserve the company, brand, location, and date filters used on screen.",
    value: true,
    valueType: "BOOLEAN",
  },
  {
    key: "reporting.dashboard.unreconciled_mode",
    category: "reporting",
    label: "Unreconciled dashboard mode",
    description:
      "How dashboards should behave when source ledgers or operational records are unreconciled.",
    value: "warn_and_link",
    valueType: "SELECT",
    options: [
      { value: "block", label: "Block metric until reconciled" },
      { value: "warn_and_link", label: "Show warning and source link" },
      { value: "show_only", label: "Show metric without trust gate" },
    ],
  },
  {
    key: "projects.restricted_visibility_default",
    category: "projects",
    label: "Restricted project visibility default",
    description:
      "Sensitive work projects default to explicit member visibility instead of broad discovery.",
    value: true,
    valueType: "BOOLEAN",
  },
  {
    key: "projects.blocker_reason_required",
    category: "projects",
    label: "Blocker reason required",
    description:
      "Blocked tasks must record the blocker reason, owner, severity, and next action.",
    value: true,
    valueType: "BOOLEAN",
  },
  {
    key: "security.privileged_mfa.enforcement_mode",
    category: "security",
    label: "Privileged MFA enforcement mode",
    description:
      "Controls whether sensitive administrative and security mutations only warn/audit missing verified MFA evidence or hard-block them.",
    value: "warn_and_audit",
    valueType: "SELECT",
    options: [
      { value: "warn_and_audit", label: "Warn and audit missing evidence" },
      {
        value: "enforce_admin_security",
        label: "Block high-risk admin and security actions",
      },
      {
        value: "enforce_all_sensitive",
        label: "Block all guarded sensitive actions",
      },
    ],
  },
  {
    key: "security.evidence_storage.default_policy",
    category: "security",
    label: "Controlled evidence storage policy",
    description:
      "Private evidence upload defaults for storage provider, MIME allowlist, scan-waiver mode, retention, recovery, and download-audit expectations.",
    value: {
      storageProvider: "local-private",
      uploadLimitMb: 10,
      allowedMimePolicy: "allowlist",
      malwareScanMode: "scan_waived_for_local_private_uat",
      malwareScanWaiverReason:
        "Pilot local-private storage has no malware scanner configured; UAT must confirm scan waiver or production scanner before go-live.",
      retentionPolicy: "follow_transaction_retention",
      recoveryPolicy: "covered_by_backup_restore_policy",
      downloadAuditRequired: true,
    },
    valueType: "JSON",
  },
  {
    key: "security.retention.matrix",
    category: "security",
    label: "Data retention matrix",
    description:
      "Company retention defaults for audit/security/control records, operational working records, attachments, and PII minimization.",
    value: {
      audit_security_financial_control_years: 10,
      operational_working_record_years: 5,
      attachment_retention: "follow_transaction_retention",
      pii_minimization_required: true,
      export_redaction_required_where_not_needed: true,
    },
    valueType: "JSON",
  },
  {
    key: "security.backup_restore.default_policy",
    category: "security",
    label: "Backup and restore policy",
    description:
      "Recommended backup, offsite copy, checksum, restore rehearsal, and pre-release evidence defaults.",
    value: {
      database_backup_frequency: "daily",
      encryption_required: true,
      offsite_copy_required: true,
      checksum_verification_required: true,
      restore_rehearsal_frequency: "quarterly",
      pre_release_backup_restore_evidence_required: true,
    },
    valueType: "JSON",
  },
  {
    key: "release.uat_required_before_rollout",
    category: "release",
    label: "UAT required before rollout",
    description:
      "Release readiness requires workflow UAT evidence before a module is marked pilot-ready.",
    value: true,
    valueType: "BOOLEAN",
  },
  {
    key: "release.training_impact_required",
    category: "release",
    label: "Training impact assessment required",
    description:
      "Every behavior-changing release requires a KB, release-note, or training impact assessment.",
    value: true,
    valueType: "BOOLEAN",
  },
] as const;

async function seedDec0036CompanyPolicyDefaults() {
  for (const setting of dec0036CompanyPolicyDefaults) {
    await prisma.companyPolicySetting.upsert({
      where: {
        companyId_key: {
          companyId: ids.companyId,
          key: setting.key,
        },
      },
      create: {
        tenantId: ids.tenantId,
        companyId: ids.companyId,
        key: setting.key,
        category: setting.category,
        label: setting.label,
        description: setting.description,
        value: setting.value,
        defaultValue: setting.value,
        valueType: setting.valueType,
        unit: "unit" in setting ? setting.unit : null,
        ...("options" in setting ? { options: [...setting.options] } : {}),
        sourceDecisionId: "DEC-0036",
        isDefault: true,
        status: "ACTIVE",
        updatedByUserId: ids.adminUserId,
      },
      update: {
        category: setting.category,
        label: setting.label,
        description: setting.description,
        defaultValue: setting.value,
        valueType: setting.valueType,
        unit: "unit" in setting ? setting.unit : null,
        ...("options" in setting ? { options: [...setting.options] } : {}),
        sourceDecisionId: "DEC-0036",
        status: "ACTIVE",
      },
    });
  }
}

async function seedFinanceConfigurationFoundation() {
  const fiscalYear = await prisma.fiscalYear.upsert({
    where: {
      companyId_code: {
        companyId: ids.companyId,
        code: "FY2026",
      },
    },
    create: {
      tenantId: ids.tenantId,
      companyId: ids.companyId,
      code: "FY2026",
      name: "Fiscal Year 2026",
      startDate: new Date("2026-01-01T00:00:00.000Z"),
      endDate: new Date("2026-12-31T23:59:59.000Z"),
      status: "OPEN",
      isDefault: true,
      createdByUserId: ids.adminUserId,
    },
    update: {
      name: "Fiscal Year 2026",
      status: "OPEN",
      isDefault: true,
    },
  });

  const monthNames = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  for (const [index, monthName] of monthNames.entries()) {
    const month = index + 1;
    const code = `2026-${String(month).padStart(2, "0")}`;
    const startDate = new Date(Date.UTC(2026, index, 1));
    const endDate = new Date(Date.UTC(2026, index + 1, 0, 23, 59, 59));
    await prisma.accountingPeriod.upsert({
      where: {
        companyId_code: {
          companyId: ids.companyId,
          code,
        },
      },
      create: {
        tenantId: ids.tenantId,
        companyId: ids.companyId,
        fiscalYearId: fiscalYear.id,
        periodNumber: month,
        code,
        name: `${monthName} 2026`,
        startDate,
        endDate,
        status: month === 7 ? "OPEN" : month < 7 ? "SOFT_CLOSED" : "FUTURE",
        createdByUserId: ids.adminUserId,
      },
      update: {
        fiscalYearId: fiscalYear.id,
        name: `${monthName} 2026`,
        startDate,
        endDate,
        status: month === 7 ? "OPEN" : month < 7 ? "SOFT_CLOSED" : "FUTURE",
      },
    });
  }

  const accountClasses = [
    {
      code: "ASSET",
      name: "Assets",
      normalBalance: "DEBIT" as const,
      statementSection: "BALANCE_SHEET" as const,
      sortOrder: 10,
    },
    {
      code: "LIABILITY",
      name: "Liabilities",
      normalBalance: "CREDIT" as const,
      statementSection: "BALANCE_SHEET" as const,
      sortOrder: 20,
    },
    {
      code: "EQUITY",
      name: "Equity",
      normalBalance: "CREDIT" as const,
      statementSection: "EQUITY" as const,
      sortOrder: 30,
    },
    {
      code: "REVENUE",
      name: "Revenue",
      normalBalance: "CREDIT" as const,
      statementSection: "INCOME_STATEMENT" as const,
      sortOrder: 40,
    },
    {
      code: "COGS",
      name: "Cost of Goods Sold",
      normalBalance: "DEBIT" as const,
      statementSection: "INCOME_STATEMENT" as const,
      sortOrder: 50,
    },
    {
      code: "EXPENSE",
      name: "Operating Expenses",
      normalBalance: "DEBIT" as const,
      statementSection: "INCOME_STATEMENT" as const,
      sortOrder: 60,
    },
  ];

  const classByCode = new Map<string, { id: string }>();
  for (const accountClass of accountClasses) {
    const row = await prisma.financeAccountClass.upsert({
      where: {
        companyId_code: {
          companyId: ids.companyId,
          code: accountClass.code,
        },
      },
      create: {
        tenantId: ids.tenantId,
        companyId: ids.companyId,
        code: accountClass.code,
        name: accountClass.name,
        normalBalance: accountClass.normalBalance,
        statementSection: accountClass.statementSection,
        sortOrder: accountClass.sortOrder,
        createdByUserId: ids.adminUserId,
      },
      update: {
        name: accountClass.name,
        normalBalance: accountClass.normalBalance,
        statementSection: accountClass.statementSection,
        sortOrder: accountClass.sortOrder,
        status: "ACTIVE",
      },
      select: {
        id: true,
      },
    });
    classByCode.set(accountClass.code, row);
  }

  const chartAccounts = [
    {
      code: "1000",
      name: "Cash and Bank",
      classCode: "ASSET",
      normalBalance: "DEBIT" as const,
      isHeader: true,
      postingAllowed: false,
    },
    {
      code: "1010",
      name: "Operating Bank Account",
      classCode: "ASSET",
      normalBalance: "DEBIT" as const,
      isHeader: false,
      postingAllowed: true,
    },
    {
      code: "1100",
      name: "Inventory - Food and Beverage",
      classCode: "ASSET",
      normalBalance: "DEBIT" as const,
      isHeader: false,
      postingAllowed: true,
    },
    {
      code: "1200",
      name: "Accounts Receivable",
      classCode: "ASSET",
      normalBalance: "DEBIT" as const,
      isHeader: false,
      postingAllowed: true,
    },
    {
      code: "2000",
      name: "Accounts Payable - Trade",
      classCode: "LIABILITY",
      normalBalance: "CREDIT" as const,
      isHeader: false,
      postingAllowed: true,
    },
    {
      code: "3000",
      name: "Owner's Equity",
      classCode: "EQUITY",
      normalBalance: "CREDIT" as const,
      isHeader: false,
      postingAllowed: true,
    },
    {
      code: "4000",
      name: "Restaurant Sales Revenue",
      classCode: "REVENUE",
      normalBalance: "CREDIT" as const,
      isHeader: false,
      postingAllowed: true,
    },
    {
      code: "5000",
      name: "Food Cost",
      classCode: "COGS",
      normalBalance: "DEBIT" as const,
      isHeader: false,
      postingAllowed: true,
    },
    {
      code: "6000",
      name: "Store Operating Expense",
      classCode: "EXPENSE",
      normalBalance: "DEBIT" as const,
      isHeader: false,
      postingAllowed: true,
    },
  ];

  const accountByCode = new Map<string, { id: string }>();
  for (const account of chartAccounts) {
    const accountClass = classByCode.get(account.classCode);
    if (!accountClass) {
      throw new Error(`FINANCE_ACCOUNT_CLASS_NOT_SEEDED:${account.classCode}`);
    }
    const row = await prisma.chartOfAccount.upsert({
      where: {
        companyId_code: {
          companyId: ids.companyId,
          code: account.code,
        },
      },
      create: {
        tenantId: ids.tenantId,
        companyId: ids.companyId,
        accountClassId: accountClass.id,
        code: account.code,
        name: account.name,
        normalBalance: account.normalBalance,
        isHeader: account.isHeader,
        postingAllowed: account.postingAllowed,
        activeFrom: new Date("2026-01-01T00:00:00.000Z"),
        createdByUserId: ids.adminUserId,
      },
      update: {
        accountClassId: accountClass.id,
        name: account.name,
        normalBalance: account.normalBalance,
        isHeader: account.isHeader,
        postingAllowed: account.postingAllowed,
        status: "ACTIVE",
      },
      select: {
        id: true,
      },
    });
    accountByCode.set(account.code, row);
  }

  const postingRule = await prisma.financePostingRule.upsert({
    where: {
      companyId_code_version: {
        companyId: ids.companyId,
        code: "GOODS_RECEIPT_AP_ACCRUAL",
        version: 1,
      },
    },
    create: {
      tenantId: ids.tenantId,
      companyId: ids.companyId,
      code: "GOODS_RECEIPT_AP_ACCRUAL",
      name: "Goods receipt AP accrual template",
      version: 1,
      sourceType: "GOODS_RECEIPT",
      sourceEvent: "POSTED",
      postingConsequenceType: "ACCRUAL_TEMPLATE",
      description:
        "Config-only template for future AP accrual from posted receiving. Execution remains disabled until finance posting controls pass UAT.",
      configuration: {
        boundary: "config_only_no_journal_posting",
        sourceOfTruth: "GoodsReceipt",
        currency: "PHP",
      },
      ruleMetadata: {
        recommendedBy: "Phase 3 finance foundation",
        industryPractice: "Three-way match before payment release",
      },
      isConfigOnly: true,
      isExecutionEnabled: false,
      requiresApproval: true,
      requiresEvidence: true,
      status: "DRAFT",
      createdByUserId: ids.adminUserId,
    },
    update: {
      name: "Goods receipt AP accrual template",
      description:
        "Config-only template for future AP accrual from posted receiving. Execution remains disabled until finance posting controls pass UAT.",
      isConfigOnly: true,
      isExecutionEnabled: false,
      requiresApproval: true,
      requiresEvidence: true,
      status: "DRAFT",
    },
  });

  const ruleMaps = [
    {
      lineRole: "inventory_or_expense_basis",
      accountCode: "1100",
      side: "DEBIT" as const,
      amountSource: "accepted_receiving_value",
      sortOrder: 10,
    },
    {
      lineRole: "trade_payable_accrual",
      accountCode: "2000",
      side: "CREDIT" as const,
      amountSource: "accepted_receiving_value",
      sortOrder: 20,
    },
  ];
  for (const map of ruleMaps) {
    const account = accountByCode.get(map.accountCode);
    if (!account) {
      throw new Error(`FINANCE_ACCOUNT_NOT_SEEDED:${map.accountCode}`);
    }
    await prisma.financePostingRuleAccountMap.upsert({
      where: {
        postingRuleId_lineRole_side_accountId: {
          postingRuleId: postingRule.id,
          lineRole: map.lineRole,
          side: map.side,
          accountId: account.id,
        },
      },
      create: {
        tenantId: ids.tenantId,
        companyId: ids.companyId,
        postingRuleId: postingRule.id,
        accountId: account.id,
        lineRole: map.lineRole,
        side: map.side,
        amountSource: map.amountSource,
        sortOrder: map.sortOrder,
        createdByUserId: ids.adminUserId,
      },
      update: {
        amountSource: map.amountSource,
        sortOrder: map.sortOrder,
        status: "ACTIVE",
      },
    });
  }

  const dimensionRequirements = [
    {
      dimensionType: "LOCATION" as const,
      sourceField: "receivingLocationId",
    },
    {
      dimensionType: "BRAND" as const,
      sourceField: "purchaseOrder.brandId",
    },
    {
      dimensionType: "DEPARTMENT" as const,
      sourceField: "requestingDepartmentId",
    },
  ];
  for (const requirement of dimensionRequirements) {
    await prisma.financePostingRuleDimensionRequirement.upsert({
      where: {
        postingRuleId_dimensionType: {
          postingRuleId: postingRule.id,
          dimensionType: requirement.dimensionType,
        },
      },
      create: {
        tenantId: ids.tenantId,
        companyId: ids.companyId,
        postingRuleId: postingRule.id,
        dimensionType: requirement.dimensionType,
        required: true,
        allowDerivedValue: true,
        sourceField: requirement.sourceField,
        createdByUserId: ids.adminUserId,
      },
      update: {
        required: true,
        allowDerivedValue: true,
        sourceField: requirement.sourceField,
        status: "ACTIVE",
      },
    });
  }
}

async function seedFinanceJournalDemoData() {
  const period = await prisma.accountingPeriod.findFirst({
    where: {
      companyId: ids.companyId,
      code: "2026-07",
      status: "OPEN",
    },
    select: { id: true },
  });
  const cashAccount = await prisma.chartOfAccount.findFirst({
    where: { companyId: ids.companyId, code: "1010", postingAllowed: true },
    select: { id: true },
  });
  const equityAccount = await prisma.chartOfAccount.findFirst({
    where: { companyId: ids.companyId, code: "3000", postingAllowed: true },
    select: { id: true },
  });
  if (!period || !cashAccount || !equityAccount) {
    return;
  }

  await prisma.financeJournal.upsert({
    where: {
      companyId_sourceDocumentType_sourceEventKey: {
        companyId: ids.companyId,
        sourceDocumentType: "MANUAL_JOURNAL",
        sourceEventKey: "demo:manual:opening_cash_equity",
      },
    },
    create: {
      tenantId: ids.tenantId,
      companyId: ids.companyId,
      publicReference: "FJ-2026-00001",
      journalType: "MANUAL",
      status: "POSTED",
      currencyCode: "PHP",
      accountingPeriodId: period.id,
      journalDate: new Date("2026-07-01T02:00:00.000Z"),
      postingDate: new Date("2026-07-01T02:05:00.000Z"),
      description: "Demo opening cash balance",
      businessJustification:
        "Demo finance foundation entry to show a balanced posted journal in the General Ledger workspace.",
      evidenceReference: "DEMO-FINANCE-CUTOVER-001",
      sourceDocumentType: "MANUAL_JOURNAL",
      sourceEventKey: "demo:manual:opening_cash_equity",
      postingConsequenceType: "MANUAL_JOURNAL",
      brandId: ids.brandId,
      locationId: ids.locationId,
      createdByUserId: ids.adminUserId,
      submittedByUserId: ids.adminUserId,
      approvedByUserId: ids.approverUserId,
      postedByUserId: ids.adminUserId,
      submittedAt: new Date("2026-07-01T02:01:00.000Z"),
      approvedAt: new Date("2026-07-01T02:03:00.000Z"),
      postedAt: new Date("2026-07-01T02:05:00.000Z"),
      totalDebitAmountPhp: 100000,
      totalCreditAmountPhp: 100000,
      lines: {
        createMany: {
          data: [
            {
              tenantId: ids.tenantId,
              companyId: ids.companyId,
              lineNumber: 1,
              accountId: cashAccount.id,
              amountSide: "DEBIT",
              amountPhp: 100000,
              lineDescription: "Opening cash basis for demo ledger",
              brandId: ids.brandId,
              locationId: ids.locationId,
            },
            {
              tenantId: ids.tenantId,
              companyId: ids.companyId,
              lineNumber: 2,
              accountId: equityAccount.id,
              amountSide: "CREDIT",
              amountPhp: 100000,
              lineDescription: "Opening equity basis for demo ledger",
              brandId: ids.brandId,
              locationId: ids.locationId,
            },
          ],
        },
      },
      postingAttempts: {
        create: {
          tenantId: ids.tenantId,
          companyId: ids.companyId,
          idempotencyKey: "demo:post:FJ-2026-00001",
          action: "POST",
          status: "SUCCEEDED",
          requestedByUserId: ids.adminUserId,
          resultJournalId: null,
        },
      },
    },
    update: {
      status: "POSTED",
      totalDebitAmountPhp: 100000,
      totalCreditAmountPhp: 100000,
    },
  });
}

async function seedBudgetControlDemoData() {
  const fiscalYear = await prisma.fiscalYear.findFirst({
    where: { companyId: ids.companyId, code: "FY2026" },
    select: { id: true },
  });
  const period = await prisma.accountingPeriod.findFirst({
    where: { companyId: ids.companyId, code: "2026-07" },
    select: { id: true, startDate: true, endDate: true },
  });
  const accounts = await prisma.chartOfAccount.findMany({
    where: {
      companyId: ids.companyId,
      code: { in: ["2000", "5000", "6000"] },
      postingAllowed: true,
    },
    select: { id: true, code: true },
  });
  const accountByCode = new Map(accounts.map((account) => [account.code, account.id]));
  if (!fiscalYear || !period || !accountByCode.has("5000") || !accountByCode.has("6000")) {
    return;
  }

  const foodCostAccountId = accountByCode.get("5000")!;
  const expenseAccountId = accountByCode.get("6000")!;
  const payableAccountId = accountByCode.get("2000");

  if (payableAccountId) {
    await prisma.financeJournal.upsert({
      where: {
        companyId_sourceDocumentType_sourceEventKey: {
          companyId: ids.companyId,
          sourceDocumentType: "BUDGET_DEMO_ACTUAL",
          sourceEventKey: "demo:budget-actual:yl-sm-north:food-cost:2026-07",
        },
      },
      create: {
        tenantId: ids.tenantId,
        companyId: ids.companyId,
        publicReference: "FJ-2026-00002",
        journalType: "MANUAL",
        status: "POSTED",
        currencyCode: "PHP",
        accountingPeriodId: period.id,
        journalDate: new Date("2026-07-06T02:00:00.000Z"),
        postingDate: new Date("2026-07-06T02:05:00.000Z"),
        description: "Demo July food cost actual",
        businessJustification:
          "Demo posted actual used by budget control to show budget-versus-actual behavior.",
        evidenceReference: "DEMO-BUDGET-ACTUAL-FOOD-2026-07",
        sourceDocumentType: "BUDGET_DEMO_ACTUAL",
        sourceEventKey: "demo:budget-actual:yl-sm-north:food-cost:2026-07",
        postingConsequenceType: "DEMO_BUDGET_ACTUAL",
        brandId: ids.brandId,
        locationId: ids.locationId,
        createdByUserId: ids.adminUserId,
        submittedByUserId: ids.adminUserId,
        approvedByUserId: ids.approverUserId,
        postedByUserId: ids.adminUserId,
        submittedAt: new Date("2026-07-06T02:01:00.000Z"),
        approvedAt: new Date("2026-07-06T02:03:00.000Z"),
        postedAt: new Date("2026-07-06T02:05:00.000Z"),
        totalDebitAmountPhp: 165000,
        totalCreditAmountPhp: 165000,
        lines: {
          createMany: {
            data: [
              {
                tenantId: ids.tenantId,
                companyId: ids.companyId,
                lineNumber: 1,
                accountId: foodCostAccountId,
                amountSide: "DEBIT",
                amountPhp: 165000,
                lineDescription: "Demo posted food cost actual for July budget monitoring",
                brandId: ids.brandId,
                locationId: ids.locationId,
              },
              {
                tenantId: ids.tenantId,
                companyId: ids.companyId,
                lineNumber: 2,
                accountId: payableAccountId,
                amountSide: "CREDIT",
                amountPhp: 165000,
                lineDescription: "Demo payable offset for July food cost actual",
                brandId: ids.brandId,
                locationId: ids.locationId,
              },
            ],
          },
        },
      },
      update: {
        status: "POSTED",
        totalDebitAmountPhp: 165000,
        totalCreditAmountPhp: 165000,
      },
    });
  }

  const budget = await prisma.budget.upsert({
    where: {
      companyId_publicReference: {
        companyId: ids.companyId,
        publicReference: "BUD-2026-YL-SMN-OPS",
      },
    },
    create: {
      tenantId: ids.tenantId,
      companyId: ids.companyId,
      publicReference: "BUD-2026-YL-SMN-OPS",
      fiscalYearId: fiscalYear.id,
      name: "Yakiniku Like SM North Edsa July Operating Budget",
      description:
        "Demo F&B operating budget for food cost, packaging, repair, and cleaning controls.",
      budgetType: "OPERATING",
      status: "ACTIVE",
      currencyCode: "PHP",
      brandId: ids.brandId,
      locationId: ids.locationId,
      ownerUserId: ids.adminUserId,
      createdByUserId: ids.adminUserId,
      submittedByUserId: ids.adminUserId,
      approvedByUserId: ids.approverUserId,
      submittedAt: new Date("2026-06-25T03:00:00.000Z"),
      approvedAt: new Date("2026-06-26T03:00:00.000Z"),
      activatedAt: new Date("2026-07-01T00:00:00.000Z"),
      totalOriginalAmount: 3150000,
      totalRevisedAmount: 3150000,
      policyConfiguration: {
        thresholdPolicy: "warning_first",
        warningThresholdPct: 80,
        hardBlock: false,
      },
    },
    update: {
      fiscalYearId: fiscalYear.id,
      name: "Yakiniku Like SM North Edsa July Operating Budget",
      description:
        "Demo F&B operating budget for food cost, packaging, repair, and cleaning controls.",
      status: "ACTIVE",
      brandId: ids.brandId,
      locationId: ids.locationId,
      ownerUserId: ids.adminUserId,
      approvedByUserId: ids.approverUserId,
      activatedAt: new Date("2026-07-01T00:00:00.000Z"),
      totalOriginalAmount: 3150000,
      totalRevisedAmount: 3150000,
      policyConfiguration: {
        thresholdPolicy: "warning_first",
        warningThresholdPct: 80,
        hardBlock: false,
      },
    },
  });

  const lineInputs = [
    {
      lineNumber: 1,
      code: "FOOD-COST",
      name: "Food cost purchases",
      accountId: foodCostAccountId,
      amount: 2400000,
    },
    {
      lineNumber: 2,
      code: "PACKAGING",
      name: "Packaging and disposables",
      accountId: foodCostAccountId,
      amount: 420000,
    },
    {
      lineNumber: 3,
      code: "REPAIRS",
      name: "Store repairs and maintenance",
      accountId: expenseAccountId,
      amount: 180000,
    },
    {
      lineNumber: 4,
      code: "CLEANING",
      name: "Cleaning and sanitation supplies",
      accountId: expenseAccountId,
      amount: 150000,
    },
  ];

  const lineByCode = new Map<string, { id: string }>();
  for (const line of lineInputs) {
    const budgetLine = await prisma.budgetLine.upsert({
      where: {
        budgetId_code: {
          budgetId: budget.id,
          code: line.code,
        },
      },
      create: {
        budgetId: budget.id,
        tenantId: ids.tenantId,
        companyId: ids.companyId,
        accountingPeriodId: period.id,
        accountId: line.accountId,
        lineNumber: line.lineNumber,
        code: line.code,
        name: line.name,
        description: `Demo budget line for ${line.name.toLowerCase()}.`,
        brandId: ids.brandId,
        locationId: ids.locationId,
        periodStart: period.startDate,
        periodEnd: period.endDate,
        originalAmountPhp: line.amount,
        revisedAmountPhp: line.amount,
        reservedAmountPhp: 0,
        warningThresholdPct: 80,
        hardBlockPct: null,
        status: "ACTIVE",
      },
      update: {
        accountingPeriodId: period.id,
        accountId: line.accountId,
        lineNumber: line.lineNumber,
        name: line.name,
        description: `Demo budget line for ${line.name.toLowerCase()}.`,
        brandId: ids.brandId,
        locationId: ids.locationId,
        periodStart: period.startDate,
        periodEnd: period.endDate,
        originalAmountPhp: line.amount,
        revisedAmountPhp: line.amount,
        warningThresholdPct: 80,
        hardBlockPct: null,
        status: "ACTIVE",
      },
      select: { id: true },
    });
    lineByCode.set(line.code, budgetLine);
  }

  await prisma.budgetRevision.upsert({
    where: {
      budgetId_revisionNumber: {
        budgetId: budget.id,
        revisionNumber: 1,
      },
    },
    create: {
      budgetId: budget.id,
      tenantId: ids.tenantId,
      companyId: ids.companyId,
      revisionNumber: 1,
      revisionType: "ORIGINAL",
      status: "APPROVED",
      reason: "Initial approved July operating budget for demo branch.",
      requestedByUserId: ids.adminUserId,
      reviewedByUserId: ids.approverUserId,
      requestedAt: new Date("2026-06-25T03:00:00.000Z"),
      reviewedAt: new Date("2026-06-26T03:00:00.000Z"),
      effectiveFrom: period.startDate,
      effectiveTo: period.endDate,
      originalSnapshot: { lines: [] },
      proposedSnapshot: { lines: lineInputs },
      approvedSnapshot: { lines: lineInputs },
    },
    update: {
      status: "APPROVED",
      reason: "Initial approved July operating budget for demo branch.",
      reviewedByUserId: ids.approverUserId,
      reviewedAt: new Date("2026-06-26T03:00:00.000Z"),
      proposedSnapshot: { lines: lineInputs },
      approvedSnapshot: { lines: lineInputs },
    },
  });

  const commitments = [
    {
      lineCode: "FOOD-COST",
      sourceType: "PURCHASE_ORDER" as const,
      sourceId: "demo-po-yakiniku-beef-seafood-2026-07",
      sourceLineId: "demo-po-line-food-001",
      sourceEventKey: "demo:budget-commitment:po:food-cost:2026-07",
      sourceReference: "PO-2026-YL-FOOD-001",
      amount: 385000,
      summary: "Approved beef, rice, sauce, and kimchi replenishment for SM North Edsa.",
    },
    {
      lineCode: "PACKAGING",
      sourceType: "PURCHASE_ORDER" as const,
      sourceId: "demo-po-packaging-2026-07",
      sourceLineId: "demo-po-line-packaging-001",
      sourceEventKey: "demo:budget-commitment:po:packaging:2026-07",
      sourceReference: "PO-2026-YL-PACK-001",
      amount: 76000,
      summary: "Approved trays, sauce cups, and takeaway packaging replenishment.",
    },
    {
      lineCode: "REPAIRS",
      sourceType: "PAYMENT_REQUEST" as const,
      sourceId: "demo-payment-request-grill-service-2026-07",
      sourceLineId: "demo-payment-line-repair-001",
      sourceEventKey: "demo:budget-commitment:payment-request:repair:2026-07",
      sourceReference: "PAY-REQ-2026-REPAIR-001",
      amount: 32500,
      summary: "Pending grill ventilation service payment request.",
    },
  ];

  for (const commitment of commitments) {
    const line = lineByCode.get(commitment.lineCode);
    if (!line) {
      continue;
    }
    await prisma.budgetCommitment.upsert({
      where: {
        companyId_sourceType_sourceId_sourceEventKey: {
          companyId: ids.companyId,
          sourceType: commitment.sourceType,
          sourceId: commitment.sourceId,
          sourceEventKey: commitment.sourceEventKey,
        },
      },
      create: {
        budgetId: budget.id,
        budgetLineId: line.id,
        tenantId: ids.tenantId,
        companyId: ids.companyId,
        sourceType: commitment.sourceType,
        sourceId: commitment.sourceId,
        sourceLineId: commitment.sourceLineId,
        sourceEventKey: commitment.sourceEventKey,
        sourceEventAt: new Date("2026-07-03T04:00:00.000Z"),
        sourceReference: commitment.sourceReference,
        sourceSnapshot: {
          summary: commitment.summary,
          boundary: "demo_source_link_only_no_source_mutation",
        },
        status: "APPROVED",
        committedAmountPhp: commitment.amount,
        consumedAmountPhp: 0,
        releasedAmountPhp: 0,
        requestedByUserId: ids.adminUserId,
        approvedByUserId: ids.approverUserId,
        requestedAt: new Date("2026-07-03T03:30:00.000Z"),
        approvedAt: new Date("2026-07-03T04:00:00.000Z"),
      },
      update: {
        budgetId: budget.id,
        budgetLineId: line.id,
        sourceReference: commitment.sourceReference,
        sourceSnapshot: {
          summary: commitment.summary,
          boundary: "demo_source_link_only_no_source_mutation",
        },
        status: "APPROVED",
        committedAmountPhp: commitment.amount,
        consumedAmountPhp: 0,
        releasedAmountPhp: 0,
        requestedByUserId: ids.adminUserId,
        approvedByUserId: ids.approverUserId,
        requestedAt: new Date("2026-07-03T03:30:00.000Z"),
        approvedAt: new Date("2026-07-03T04:00:00.000Z"),
      },
    });
  }
}

async function seedExpenseRequestDemoData() {
  const supplier = await prisma.supplier.findFirst({
    where: { companyId: ids.companyId, supplierCode: "METRO-PACKAGING" },
    select: { id: true },
  });
  const budgetLines = await prisma.budgetLine.findMany({
    where: {
      companyId: ids.companyId,
      budget: { publicReference: "BUD-2026-YL-SMN-OPS" },
      code: { in: ["PACKAGING", "REPAIRS", "CLEANING"] },
    },
    select: { id: true, code: true },
  });
  const budgetLineByCode = new Map(
    budgetLines.map((line) => [line.code, line.id])
  );

  const demoRequests = [
    {
      publicReference: "EXP-2026-00001",
      title: "Emergency grill exhaust inspection",
      status: "AWAITING_APPROVAL" as const,
      urgency: "EMERGENCY" as const,
      budgetStatus: "BUDGETED" as const,
      categoryCode: "REPAIRS",
      expenseType: "OPERATING",
      supplierId: null,
      amount: 18500,
      reason:
        "Urgent inspection after grill exhaust vibration was reported during dinner service.",
      evidenceReference: "DEMO-EXP-GRILL-INSPECTION-001",
      budgetLineCode: "REPAIRS",
      requestedByUserId: ids.userId,
      submittedByUserId: ids.userId,
      approvedByUserId: null,
      submittedAt: new Date("2026-07-07T02:00:00.000Z"),
      approvedAt: null,
      lineDescription: "Technician call-out and diagnostic inspection",
      sourceType: "MANUAL" as const,
      sourceDocumentId: "demo-expense-grill-inspection",
    },
    {
      publicReference: "EXP-2026-00002",
      title: "Takeaway packaging replenishment",
      status: "APPROVED" as const,
      urgency: "NORMAL" as const,
      budgetStatus: "PARTIALLY_BUDGETED" as const,
      categoryCode: "PACKAGING",
      expenseType: "OPERATING",
      supplierId: supplier?.id ?? null,
      amount: 46200,
      reason:
        "Additional takeaway trays and sauce cups for weekend forecasted demand.",
      evidenceReference: "DEMO-EXP-PACKAGING-PO-QUOTE-001",
      budgetLineCode: "PACKAGING",
      requestedByUserId: ids.userId,
      submittedByUserId: ids.userId,
      approvedByUserId: ids.approverUserId,
      submittedAt: new Date("2026-07-05T03:00:00.000Z"),
      approvedAt: new Date("2026-07-05T05:00:00.000Z"),
      lineDescription: "Takeaway trays, sauce cups, and label rolls",
      sourceType: "PURCHASE_ORDER" as const,
      sourceDocumentId: "demo-po-packaging-2026-07",
    },
    {
      publicReference: "EXP-2026-00003",
      title: "Sanitation deep-clean supplies",
      status: "COMPLETED" as const,
      urgency: "URGENT" as const,
      budgetStatus: "BUDGETED" as const,
      categoryCode: "CLEANING",
      expenseType: "OPERATING",
      supplierId: null,
      amount: 9800,
      reason:
        "Deep-clean supplies for post-maintenance sanitation before store opening.",
      evidenceReference: "DEMO-EXP-SANITATION-RECEIPT-001",
      budgetLineCode: "CLEANING",
      requestedByUserId: ids.userId,
      submittedByUserId: ids.userId,
      approvedByUserId: ids.approverUserId,
      submittedAt: new Date("2026-07-03T02:00:00.000Z"),
      approvedAt: new Date("2026-07-03T03:00:00.000Z"),
      lineDescription: "Food-safe degreaser, towels, and sanitizer strips",
      sourceType: "MANUAL" as const,
      sourceDocumentId: "demo-expense-sanitation-supplies",
    },
  ];

  for (const demo of demoRequests) {
    const budgetLineId = budgetLineByCode.get(demo.budgetLineCode) ?? null;
    const completedAt =
      demo.status === "COMPLETED" ? new Date("2026-07-03T09:00:00.000Z") : null;

    const request = await prisma.expenseRequest.upsert({
      where: {
        companyId_publicReference: {
          companyId: ids.companyId,
          publicReference: demo.publicReference,
        },
      },
      create: {
        tenantId: ids.tenantId,
        companyId: ids.companyId,
        publicReference: demo.publicReference,
        currencyCode: "PHP",
        totalRequestedAmount: demo.amount,
        settledAmount: 0,
        status: demo.status,
        urgency: demo.urgency,
        budgetStatus: demo.budgetStatus,
        requestDate: new Date("2026-07-03T00:00:00.000Z"),
        requiredByDate: new Date("2026-07-10T00:00:00.000Z"),
        title: demo.title,
        requestReason: demo.reason,
        categoryCode: demo.categoryCode,
        expenseType: demo.expenseType,
        branchImpactFlag: demo.urgency !== "NORMAL",
        supplierId: demo.supplierId,
        brandId: ids.brandId,
        locationId: ids.locationId,
        requestedByUserId: demo.requestedByUserId,
        submittedByUserId: demo.submittedByUserId,
        approvedByUserId: demo.approvedByUserId,
        completedByUserId: completedAt ? ids.adminUserId : null,
        submittedAt: demo.submittedAt,
        approvedAt: demo.approvedAt,
        completedAt,
        completionNotes: completedAt
          ? "Demo completion after evidence review; no payment or journal posted."
          : null,
        evidenceReference: demo.evidenceReference,
        budgetSnapshot: {
          budgetLineCode: demo.budgetLineCode,
          policy: "warning_first_no_hard_block",
          noPaymentMutation: true,
          noJournalPosting: true,
        },
        idempotencyKey: `demo:${demo.publicReference}`,
      },
      update: {
        totalRequestedAmount: demo.amount,
        settledAmount: 0,
        status: demo.status,
        urgency: demo.urgency,
        budgetStatus: demo.budgetStatus,
        title: demo.title,
        requestReason: demo.reason,
        categoryCode: demo.categoryCode,
        expenseType: demo.expenseType,
        branchImpactFlag: demo.urgency !== "NORMAL",
        supplierId: demo.supplierId,
        brandId: ids.brandId,
        locationId: ids.locationId,
        requestedByUserId: demo.requestedByUserId,
        submittedByUserId: demo.submittedByUserId,
        approvedByUserId: demo.approvedByUserId,
        completedByUserId: completedAt ? ids.adminUserId : null,
        submittedAt: demo.submittedAt,
        approvedAt: demo.approvedAt,
        completedAt,
        completionNotes: completedAt
          ? "Demo completion after evidence review; no payment or journal posted."
          : null,
        evidenceReference: demo.evidenceReference,
        budgetSnapshot: {
          budgetLineCode: demo.budgetLineCode,
          policy: "warning_first_no_hard_block",
          noPaymentMutation: true,
          noJournalPosting: true,
        },
      },
    });

    await prisma.expenseRequestLine.deleteMany({
      where: { expenseRequestId: request.id },
    });
    const line = await prisma.expenseRequestLine.create({
      data: {
        expenseRequestId: request.id,
        tenantId: ids.tenantId,
        companyId: ids.companyId,
        lineNumber: 1,
        lineDate: new Date("2026-07-03T00:00:00.000Z"),
        description: demo.lineDescription,
        categoryCode: demo.categoryCode,
        requestedAmountPhp: demo.amount,
        taxAmountPhp: 0,
        discountAmountPhp: 0,
        lineTotalPhp: demo.amount,
        budgetLineId,
        brandId: ids.brandId,
        locationId: ids.locationId,
        evidenceReference: demo.evidenceReference,
        idempotencyKey: `demo:${demo.publicReference}:line:1`,
        createdByUserId: demo.requestedByUserId,
      },
    });

    await prisma.expenseRequestSourceLink.upsert({
      where: {
        tenantId_companyId_sourceDocumentType_sourceDocumentId_sourceEventKey: {
          tenantId: ids.tenantId,
          companyId: ids.companyId,
          sourceDocumentType: demo.sourceType,
          sourceDocumentId: demo.sourceDocumentId,
          sourceEventKey: `demo:${demo.publicReference}:source-link`,
        },
      },
      create: {
        tenantId: ids.tenantId,
        companyId: ids.companyId,
        expenseRequestId: request.id,
        expenseRequestLineId: line.id,
        sourceDocumentType: demo.sourceType,
        sourceDocumentId: demo.sourceDocumentId,
        sourceEventKey: `demo:${demo.publicReference}:source-link`,
        sourceAmountSnapshotPhp: demo.amount,
        remainingAmountSnapshotPhp: demo.amount,
        sourceDocumentSnapshot: {
          summary: demo.reason,
          boundary: "source_link_only_no_source_mutation",
        },
        createdByUserId: demo.requestedByUserId,
      },
      update: {
        expenseRequestId: request.id,
        expenseRequestLineId: line.id,
        sourceAmountSnapshotPhp: demo.amount,
        remainingAmountSnapshotPhp: demo.amount,
        sourceDocumentSnapshot: {
          summary: demo.reason,
          boundary: "source_link_only_no_source_mutation",
        },
      },
    });
  }
}

async function seedCashAdvanceDemoData() {
  const supplier = await prisma.supplier.findFirst({
    where: { companyId: ids.companyId, supplierCode: "PACIFIC-PANTRY" },
    select: { id: true },
  });
  const bankAccount = await prisma.bankAccount.findFirst({
    where: {
      companyId: ids.companyId,
      publicReference: "BANK-OGFI-BPI-OPS-001",
    },
    select: { id: true },
  });

  const demoAdvances = [
    {
      publicReference: "CA-2026-00001",
      title: "Emergency grill exhaust cash advance",
      status: "AWAITING_APPROVAL" as const,
      sourceType: "STANDALONE" as const,
      budgetStatus: "BUDGETED" as const,
      categoryCode: "REPAIRS",
      requestedAmount: 12000,
      issuedAmount: 0,
      liquidatedAmount: 0,
      dueDate: new Date("2026-07-12T00:00:00.000Z"),
      purpose:
        "Branch manager requested emergency technician cash advance for grill exhaust inspection.",
      evidenceReference: "DEMO-CA-GRILL-EXHAUST-001",
      requestedByUserId: ids.userId,
      beneficiaryUserId: ids.userId,
      submittedByUserId: ids.userId,
      approvedByUserId: null,
      submittedAt: new Date("2026-07-07T02:20:00.000Z"),
      approvedAt: null,
      supplierId: null,
      liquidation: null,
    },
    {
      publicReference: "CA-2026-00002",
      title: "Manager market-run advance",
      status: "PARTIALLY_LIQUIDATED" as const,
      sourceType: "MANUAL" as const,
      budgetStatus: "UNBUDGETED" as const,
      categoryCode: "EMERGENCY-PURCHASE",
      requestedAmount: 15000,
      issuedAmount: 15000,
      liquidatedAmount: 9800,
      dueDate: new Date("2026-07-06T00:00:00.000Z"),
      purpose:
        "Emergency local purchase for fresh produce during supplier delivery delay.",
      evidenceReference: "DEMO-CA-MARKET-RUN-001",
      requestedByUserId: ids.userId,
      beneficiaryUserId: ids.userId,
      submittedByUserId: ids.userId,
      approvedByUserId: ids.approverUserId,
      submittedAt: new Date("2026-07-04T01:00:00.000Z"),
      approvedAt: new Date("2026-07-04T01:30:00.000Z"),
      supplierId: null,
      liquidation: {
        publicReference: "CAL-2026-00001",
        status: "APPROVED" as const,
        claimedAmount: 9800,
        approvedAmount: 9800,
        amountReturned: 0,
        overageAmount: 0,
        shortfallAmount: 5200,
        evidenceReference: "DEMO-CAL-MARKET-RECEIPTS-001",
        notes: "Partial receipts submitted; remaining cash still outstanding.",
        line: {
          description: "Local market vegetables and emergency garnish items",
          categoryCode: "EMERGENCY-PURCHASE",
          amount: 9800,
          receiptReference: "MRKT-0704-001",
        },
      },
    },
    {
      publicReference: "CA-2026-00003",
      title: "Supplier sampling and store training advance",
      status: "FULLY_LIQUIDATED" as const,
      sourceType: "SUPPLIER_DIRECT" as const,
      budgetStatus: "BUDGETED" as const,
      categoryCode: "TRAINING",
      requestedAmount: 8500,
      issuedAmount: 8500,
      liquidatedAmount: 8500,
      dueDate: new Date("2026-07-03T00:00:00.000Z"),
      purpose:
        "Advance for supplier-led beef cut sampling and opening refresher training materials.",
      evidenceReference: "DEMO-CA-TRAINING-SAMPLING-001",
      requestedByUserId: ids.adminUserId,
      beneficiaryUserId: ids.approverUserId,
      submittedByUserId: ids.adminUserId,
      approvedByUserId: ids.approverUserId,
      submittedAt: new Date("2026-07-01T02:00:00.000Z"),
      approvedAt: new Date("2026-07-01T04:00:00.000Z"),
      supplierId: supplier?.id ?? null,
      liquidation: {
        publicReference: "CAL-2026-00002",
        status: "CLOSED" as const,
        claimedAmount: 8300,
        approvedAmount: 8300,
        amountReturned: 200,
        overageAmount: 0,
        shortfallAmount: 0,
        evidenceReference: "DEMO-CAL-TRAINING-RECEIPTS-001",
        notes: "Fully liquidated with PHP 200 returned offline.",
        line: {
          description: "Sampling ingredients and printed training guides",
          categoryCode: "TRAINING",
          amount: 8300,
          receiptReference: "TRN-0701-001",
        },
      },
    },
  ];

  for (const demo of demoAdvances) {
    const advance = await prisma.cashAdvanceRequest.upsert({
      where: {
        companyId_publicReference: {
          companyId: ids.companyId,
          publicReference: demo.publicReference,
        },
      },
      create: {
        tenantId: ids.tenantId,
        companyId: ids.companyId,
        publicReference: demo.publicReference,
        currencyCode: "PHP",
        requestedAmountPhp: demo.requestedAmount,
        issuedAmountPhp: demo.issuedAmount,
        liquidatedAmountPhp: demo.liquidatedAmount,
        status: demo.status,
        sourceType: demo.sourceType,
        budgetStatus: demo.budgetStatus,
        requestDate: new Date("2026-07-01T00:00:00.000Z"),
        dueDate: demo.dueDate,
        title: demo.title,
        purpose: demo.purpose,
        categoryCode: demo.categoryCode,
        supplierId: demo.supplierId,
        brandId: ids.brandId,
        locationId: ids.locationId,
        beneficiaryUserId: demo.beneficiaryUserId,
        intendedBankAccountId: bankAccount?.id ?? null,
        requestedByUserId: demo.requestedByUserId,
        submittedByUserId: demo.submittedByUserId,
        approvedByUserId: demo.approvedByUserId,
        submittedAt: demo.submittedAt,
        approvedAt: demo.approvedAt,
        evidenceReference: demo.evidenceReference,
        budgetSnapshot: {
          categoryCode: demo.categoryCode,
          policy: "non_posting_cash_advance_foundation",
          noPaymentRelease: true,
          noJournalPosting: true,
          noBankMutation: true,
        },
        idempotencyKey: `demo:${demo.publicReference}`,
      },
      update: {
        requestedAmountPhp: demo.requestedAmount,
        issuedAmountPhp: demo.issuedAmount,
        liquidatedAmountPhp: demo.liquidatedAmount,
        status: demo.status,
        sourceType: demo.sourceType,
        budgetStatus: demo.budgetStatus,
        dueDate: demo.dueDate,
        title: demo.title,
        purpose: demo.purpose,
        categoryCode: demo.categoryCode,
        supplierId: demo.supplierId,
        brandId: ids.brandId,
        locationId: ids.locationId,
        beneficiaryUserId: demo.beneficiaryUserId,
        intendedBankAccountId: bankAccount?.id ?? null,
        requestedByUserId: demo.requestedByUserId,
        submittedByUserId: demo.submittedByUserId,
        approvedByUserId: demo.approvedByUserId,
        submittedAt: demo.submittedAt,
        approvedAt: demo.approvedAt,
        evidenceReference: demo.evidenceReference,
        budgetSnapshot: {
          categoryCode: demo.categoryCode,
          policy: "non_posting_cash_advance_foundation",
          noPaymentRelease: true,
          noJournalPosting: true,
          noBankMutation: true,
        },
      },
    });

    const existingLiquidations = await prisma.cashAdvanceLiquidation.findMany({
      where: { cashAdvanceRequestId: advance.id },
      select: { id: true },
    });
    await prisma.cashAdvanceLiquidationLine.deleteMany({
      where: {
        liquidationId: { in: existingLiquidations.map((row) => row.id) },
      },
    });
    await prisma.cashAdvanceMovement.deleteMany({
      where: { cashAdvanceRequestId: advance.id },
    });
    await prisma.cashAdvanceLiquidation.deleteMany({
      where: { cashAdvanceRequestId: advance.id },
    });

    if (demo.issuedAmount > 0) {
      await prisma.cashAdvanceMovement.create({
        data: {
          tenantId: ids.tenantId,
          companyId: ids.companyId,
          locationId: ids.locationId,
          cashAdvanceRequestId: advance.id,
          actorUserId: demo.approvedByUserId ?? ids.adminUserId,
          movementType: "ISSUE",
          amountPhp: demo.issuedAmount,
          currencyCode: "PHP",
          sourceEventKey: `demo:${demo.publicReference}:issue`,
          referenceNo: `OFFLINE-${demo.publicReference}`,
          notes:
            "Demo offline release marker only; no payment release, bank mutation, or journal was posted.",
          idempotencyKey: `demo:${demo.publicReference}:movement:issue`,
        },
      });
    }

    if (demo.liquidation) {
      const liquidation = await prisma.cashAdvanceLiquidation.create({
        data: {
          tenantId: ids.tenantId,
          companyId: ids.companyId,
          locationId: ids.locationId,
          cashAdvanceRequestId: advance.id,
          publicReference: demo.liquidation.publicReference,
          currencyCode: "PHP",
          claimedAmountPhp: demo.liquidation.claimedAmount,
          approvedAmountPhp: demo.liquidation.approvedAmount,
          amountReturnedPhp: demo.liquidation.amountReturned,
          overageAmountPhp: demo.liquidation.overageAmount,
          shortfallAmountPhp: demo.liquidation.shortfallAmount,
          status: demo.liquidation.status,
          submittedByUserId: demo.submittedByUserId,
          reviewedByUserId: ids.approverUserId,
          approvedByUserId: ids.approverUserId,
          closedByUserId:
            demo.liquidation.status === "CLOSED" ? ids.adminUserId : null,
          submittedAt: new Date("2026-07-05T02:00:00.000Z"),
          reviewedAt: new Date("2026-07-05T03:00:00.000Z"),
          approvedAt: new Date("2026-07-05T03:30:00.000Z"),
          closedAt:
            demo.liquidation.status === "CLOSED"
              ? new Date("2026-07-05T05:00:00.000Z")
              : null,
          evidenceReference: demo.liquidation.evidenceReference,
          notes: demo.liquidation.notes,
          closureNotes:
            demo.liquidation.status === "CLOSED"
              ? "Demo closure marker only; no journal, cash receipt, or bank reconciliation posted."
              : null,
          idempotencyKey: `demo:${demo.liquidation.publicReference}`,
        },
      });

      await prisma.cashAdvanceLiquidationLine.create({
        data: {
          tenantId: ids.tenantId,
          companyId: ids.companyId,
          locationId: ids.locationId,
          liquidationId: liquidation.id,
          lineNumber: 1,
          spendDate: new Date("2026-07-05T00:00:00.000Z"),
          description: demo.liquidation.line.description,
          categoryCode: demo.liquidation.line.categoryCode,
          amountPhp: demo.liquidation.line.amount,
          taxAmountPhp: 0,
          receiptReference: demo.liquidation.line.receiptReference,
          evidenceReference: demo.liquidation.evidenceReference,
          supplierId: demo.supplierId,
          idempotencyKey: `demo:${demo.liquidation.publicReference}:line:1`,
          createdByUserId: demo.submittedByUserId,
        },
      });

      await prisma.cashAdvanceMovement.create({
        data: {
          tenantId: ids.tenantId,
          companyId: ids.companyId,
          locationId: ids.locationId,
          cashAdvanceRequestId: advance.id,
          liquidationId: liquidation.id,
          actorUserId: ids.approverUserId,
          movementType: "LIQUIDATION_SETTLEMENT",
          amountPhp: demo.liquidation.approvedAmount,
          currencyCode: "PHP",
          sourceEventKey: `demo:${demo.liquidation.publicReference}:liquidation`,
          referenceNo: demo.liquidation.publicReference,
          notes:
            "Demo liquidation movement only; no payment release, journal, or bank reconciliation was posted.",
          idempotencyKey: `demo:${demo.liquidation.publicReference}:movement:liquidation`,
        },
      });
    }
  }
}

async function seedPettyCashDemoData() {
  const supplier = await prisma.supplier.findFirst({
    where: { companyId: ids.companyId, supplierCode: "METRO-PACKAGING" },
    select: { id: true },
  });

  const fund = await prisma.pettyCashFund.upsert({
    where: {
      companyId_publicReference: {
        companyId: ids.companyId,
        publicReference: "PCF-2026-SMN-001",
      },
    },
    create: {
      tenantId: ids.tenantId,
      companyId: ids.companyId,
      publicReference: "PCF-2026-SMN-001",
      code: "PC-YL-SMN",
      name: "Yakiniku Like SM North Edsa Petty Cash",
      currencyCode: "PHP",
      openingBalancePhp: 15000,
      currentBalancePhp: 6200,
      targetBalancePhp: 15000,
      lowBalanceAlertPhp: 5000,
      status: "ACTIVE",
      brandId: ids.brandId,
      locationId: ids.locationId,
      custodianUserId: ids.userId,
      createdByUserId: ids.adminUserId,
      updatedByUserId: ids.adminUserId,
      activatedAt: new Date("2026-07-01T01:00:00.000Z"),
      evidenceReference: "DEMO-PCF-CUSTODIAN-ACK-001",
      notes:
        "Demo petty cash fund for branch incidental operating expenses; non-posting foundation only.",
      idempotencyKey: "demo:PCF-2026-SMN-001",
    },
    update: {
      code: "PC-YL-SMN",
      name: "Yakiniku Like SM North Edsa Petty Cash",
      currentBalancePhp: 6200,
      targetBalancePhp: 15000,
      lowBalanceAlertPhp: 5000,
      status: "ACTIVE",
      brandId: ids.brandId,
      locationId: ids.locationId,
      custodianUserId: ids.userId,
      updatedByUserId: ids.adminUserId,
      activatedAt: new Date("2026-07-01T01:00:00.000Z"),
      evidenceReference: "DEMO-PCF-CUSTODIAN-ACK-001",
      notes:
        "Demo petty cash fund for branch incidental operating expenses; non-posting foundation only.",
    },
  });

  const existingLiquidations = await prisma.pettyCashLiquidation.findMany({
    where: { pettyCashFundId: fund.id },
    select: { id: true },
  });
  await prisma.pettyCashLiquidationLine.deleteMany({
    where: {
      liquidationId: { in: existingLiquidations.map((row) => row.id) },
    },
  });
  await prisma.pettyCashLedgerEntry.deleteMany({
    where: { pettyCashFundId: fund.id },
  });
  await prisma.pettyCashLiquidation.deleteMany({
    where: { pettyCashFundId: fund.id },
  });
  await prisma.pettyCashRequest.deleteMany({
    where: { pettyCashFundId: fund.id },
  });

  await prisma.pettyCashLedgerEntry.create({
    data: {
      tenantId: ids.tenantId,
      companyId: ids.companyId,
      pettyCashFundId: fund.id,
      locationId: ids.locationId,
      entryType: "OPENING",
      direction: 1,
      amountPhp: 15000,
      balanceBeforePhp: 0,
      balanceAfterPhp: 15000,
      currencyCode: "PHP",
      postedAt: new Date("2026-07-01T01:00:00.000Z"),
      postedByUserId: ids.adminUserId,
      reason: "Opening petty cash custody baseline for demo fund.",
      sourceEventKey: "demo:PCF-2026-SMN-001:opening",
      idempotencyKey: "demo:PCF-2026-SMN-001:ledger:opening",
      notes: "Opening marker only; no journal or bank movement posted.",
    },
  });

  const replenishment = await prisma.pettyCashRequest.create({
    data: {
      tenantId: ids.tenantId,
      companyId: ids.companyId,
      pettyCashFundId: fund.id,
      locationId: ids.locationId,
      publicReference: "PCR-2026-00001",
      requestType: "REPLENISHMENT",
      status: "FULFILLED_OFFLINE",
      currencyCode: "PHP",
      requestedAmountPhp: 10000,
      approvedAmountPhp: 10000,
      purpose: "Restore branch petty cash float after approved incidental expenses.",
      justification:
        "Fund fell below target after sanitation and guest recovery incidental purchases.",
      dueBy: new Date("2026-07-06T00:00:00.000Z"),
      requestedByUserId: ids.userId,
      submittedByUserId: ids.userId,
      approvedByUserId: ids.approverUserId,
      closedByUserId: ids.adminUserId,
      submittedAt: new Date("2026-07-05T02:00:00.000Z"),
      approvedAt: new Date("2026-07-05T04:00:00.000Z"),
      closedAt: new Date("2026-07-05T07:00:00.000Z"),
      closureNotes:
        "Demo offline replenishment marker only; no payment release, bank mutation, or journal posted.",
      evidenceReference: "DEMO-PCR-REPLENISHMENT-001",
      sourceEventKey: "demo:PCR-2026-00001",
      idempotencyKey: "demo:PCR-2026-00001",
      metadata: {
        boundary: "offline_marker_only_no_payment_bank_or_journal_mutation",
      },
    },
  });

  await prisma.pettyCashLedgerEntry.create({
    data: {
      tenantId: ids.tenantId,
      companyId: ids.companyId,
      pettyCashFundId: fund.id,
      pettyCashRequestId: replenishment.id,
      locationId: ids.locationId,
      entryType: "REPLENISHMENT",
      direction: 1,
      amountPhp: 10000,
      balanceBeforePhp: 5200,
      balanceAfterPhp: 15200,
      currencyCode: "PHP",
      postedAt: new Date("2026-07-05T07:00:00.000Z"),
      postedByUserId: ids.adminUserId,
      reason: "Approved replenishment recorded as offline evidence marker.",
      sourceEventKey: "demo:PCR-2026-00001:ledger:replenishment",
      idempotencyKey: "demo:PCR-2026-00001:ledger:replenishment",
      notes: "No payment release, bank mutation, or journal posted.",
    },
  });

  await prisma.pettyCashRequest.create({
    data: {
      tenantId: ids.tenantId,
      companyId: ids.companyId,
      pettyCashFundId: fund.id,
      locationId: ids.locationId,
      publicReference: "PCR-2026-00002",
      requestType: "DISBURSEMENT",
      status: "AWAITING_APPROVAL",
      currencyCode: "PHP",
      requestedAmountPhp: 2800,
      approvedAmountPhp: 0,
      purpose: "Guest recovery taxi and incidental supplies.",
      justification:
        "Small urgent branch expense requiring approval before custodian release.",
      dueBy: new Date("2026-07-08T00:00:00.000Z"),
      requestedByUserId: ids.userId,
      submittedByUserId: ids.userId,
      submittedAt: new Date("2026-07-07T03:00:00.000Z"),
      evidenceReference: "DEMO-PCR-GUEST-RECOVERY-001",
      sourceEventKey: "demo:PCR-2026-00002",
      idempotencyKey: "demo:PCR-2026-00002",
      metadata: {
        boundary: "pending_approval_no_cash_release",
      },
    },
  });

  const liquidation = await prisma.pettyCashLiquidation.create({
    data: {
      tenantId: ids.tenantId,
      companyId: ids.companyId,
      pettyCashFundId: fund.id,
      locationId: ids.locationId,
      publicReference: "PCL-2026-00001",
      cycleStart: new Date("2026-07-01T00:00:00.000Z"),
      cycleEnd: new Date("2026-07-05T23:59:59.000Z"),
      currencyCode: "PHP",
      claimedAmountPhp: 8800,
      approvedAmountPhp: 8800,
      shortageAmountPhp: 0,
      overageAmountPhp: 0,
      status: "APPROVED",
      submittedByUserId: ids.userId,
      reviewedByUserId: ids.approverUserId,
      approvedByUserId: ids.approverUserId,
      submittedAt: new Date("2026-07-06T02:00:00.000Z"),
      reviewedAt: new Date("2026-07-06T03:00:00.000Z"),
      approvedAt: new Date("2026-07-06T04:00:00.000Z"),
      evidenceReference: "DEMO-PCL-RECEIPTS-001",
      idempotencyKey: "demo:PCL-2026-00001",
    },
  });

  await prisma.pettyCashLiquidationLine.createMany({
    data: [
      {
        tenantId: ids.tenantId,
        companyId: ids.companyId,
        pettyCashFundId: fund.id,
        liquidationId: liquidation.id,
        locationId: ids.locationId,
        lineNumber: 1,
        spendDate: new Date("2026-07-03T00:00:00.000Z"),
        categoryCode: "CLEANING",
        description: "Food-safe towels and sanitizer test strips",
        amountPhp: 3200,
        taxAmountPhp: 0,
        receiptReference: "PC-CLN-0703-001",
        evidenceReference: "DEMO-PCL-RECEIPTS-001",
        supplierId: null,
        idempotencyKey: "demo:PCL-2026-00001:line:1",
        createdByUserId: ids.userId,
      },
      {
        tenantId: ids.tenantId,
        companyId: ids.companyId,
        pettyCashFundId: fund.id,
        liquidationId: liquidation.id,
        locationId: ids.locationId,
        lineNumber: 2,
        spendDate: new Date("2026-07-04T00:00:00.000Z"),
        categoryCode: "PACKAGING",
        description: "Emergency label stickers and tape",
        amountPhp: 5600,
        taxAmountPhp: 0,
        receiptReference: "PC-PKG-0704-001",
        evidenceReference: "DEMO-PCL-RECEIPTS-001",
        supplierId: supplier?.id ?? null,
        idempotencyKey: "demo:PCL-2026-00001:line:2",
        createdByUserId: ids.userId,
      },
    ],
  });

  await prisma.pettyCashLedgerEntry.create({
    data: {
      tenantId: ids.tenantId,
      companyId: ids.companyId,
      pettyCashFundId: fund.id,
      liquidationId: liquidation.id,
      locationId: ids.locationId,
      entryType: "LIQUIDATION_SETTLEMENT",
      direction: -1,
      amountPhp: 8800,
      balanceBeforePhp: 15000,
      balanceAfterPhp: 6200,
      currencyCode: "PHP",
      postedAt: new Date("2026-07-06T04:00:00.000Z"),
      postedByUserId: ids.approverUserId,
      reason: "Approved liquidation receipt review marker.",
      sourceEventKey: "demo:PCL-2026-00001:ledger:liquidation",
      idempotencyKey: "demo:PCL-2026-00001:ledger:liquidation",
      notes: "Liquidation marker only; no official GL posting.",
    },
  });
}

async function seedFinanceCloseReadinessDemoData() {
  const period = await prisma.accountingPeriod.findFirst({
    where: { companyId: ids.companyId, code: "2026-07" },
    select: { id: true },
  });

  if (!period) {
    return;
  }

  const run = await prisma.financeCloseRun.upsert({
    where: {
      tenantId_companyId_accountingPeriodId_runType: {
        tenantId: ids.tenantId,
        companyId: ids.companyId,
        accountingPeriodId: period.id,
        runType: "READINESS",
      },
    },
    create: {
      tenantId: ids.tenantId,
      companyId: ids.companyId,
      accountingPeriodId: period.id,
      publicReference: "FCR-2026-07-READINESS",
      runType: "READINESS",
      status: "BLOCKED",
      sourceWindowStartAt: new Date("2026-07-01T00:00:00.000Z"),
      sourceWindowEndAt: new Date("2026-07-31T23:59:59.000Z"),
      initiatedByUserId: ids.adminUserId,
      reason:
        "Demo period-close readiness run for July 2026 finance evidence review.",
      evidenceReference: "DEMO-FCR-JULY-2026-PACK",
      configSnapshot: {
        boundary: "readiness_only_no_period_lock_no_source_mutation",
        requiredChecks: [
          "branch deposits",
          "bank reconciliation",
          "AP exceptions",
          "payment releases",
          "petty cash",
          "cash advances",
          "inventory cut-off",
          "manual journals",
          "trial balance",
          "workforce review",
          "management sign-off",
        ],
      },
      notes:
        "Close readiness only; this run does not lock the accounting period or post journals.",
      idempotencyKey: "demo:FCR-2026-07-READINESS",
    },
    update: {
      publicReference: "FCR-2026-07-READINESS",
      status: "BLOCKED",
      sourceWindowStartAt: new Date("2026-07-01T00:00:00.000Z"),
      sourceWindowEndAt: new Date("2026-07-31T23:59:59.000Z"),
      reason:
        "Demo period-close readiness run for July 2026 finance evidence review.",
      evidenceReference: "DEMO-FCR-JULY-2026-PACK",
      notes:
        "Close readiness only; this run does not lock the accounting period or post journals.",
    },
  });

  await prisma.financeCloseAttempt.deleteMany({
    where: { financeCloseRunId: run.id },
  });
  await prisma.financeCloseException.deleteMany({
    where: { financeCloseRunId: run.id },
  });
  await prisma.financeCloseChecklistItem.deleteMany({
    where: { financeCloseRunId: run.id },
  });

  await prisma.financeCloseChecklistItem.createMany({
    data: [
      {
        tenantId: ids.tenantId,
        companyId: ids.companyId,
        accountingPeriodId: period.id,
        financeCloseRunId: run.id,
        checklistType: "BRANCH_DEPOSITS",
        label: "Branch deposits reviewed",
        sequence: 1,
        status: "PASS",
        ownerUserId: ids.adminUserId,
        completedByUserId: ids.adminUserId,
        reviewedByUserId: ids.approverUserId,
        dueAt: new Date("2026-08-02T09:00:00.000Z"),
        completedAt: new Date("2026-08-01T05:00:00.000Z"),
        reviewedAt: new Date("2026-08-01T06:00:00.000Z"),
        resultSummary:
          "Demo branch deposit packets reconciled to available bank statement evidence.",
        evidenceReference: "DEMO-CLOSE-DEPOSIT-REVIEW-2026-07",
      },
      {
        tenantId: ids.tenantId,
        companyId: ids.companyId,
        accountingPeriodId: period.id,
        financeCloseRunId: run.id,
        checklistType: "BANK_RECONCILIATION",
        label: "Bank reconciliation reviewed",
        sequence: 2,
        status: "FAIL",
        ownerUserId: ids.adminUserId,
        dueAt: new Date("2026-08-03T09:00:00.000Z"),
        resultSummary: "One imported bank line remains unmatched.",
        exceptionReason:
          "Unmatched statement line needs finance owner review before close recommendation.",
        evidenceReference: "DEMO-CLOSE-BANK-RECON-2026-07",
      },
      {
        tenantId: ids.tenantId,
        companyId: ids.companyId,
        accountingPeriodId: period.id,
        financeCloseRunId: run.id,
        checklistType: "AP_EXCEPTIONS",
        label: "AP match exceptions reviewed",
        sequence: 3,
        status: "PENDING",
        ownerUserId: ids.approverUserId,
        dueAt: new Date("2026-08-03T12:00:00.000Z"),
        resultSummary:
          "Variance holds and duplicate-risk invoices require final disposition.",
      },
      {
        tenantId: ids.tenantId,
        companyId: ids.companyId,
        accountingPeriodId: period.id,
        financeCloseRunId: run.id,
        checklistType: "PAYMENT_RELEASES",
        label: "Outstanding payment releases reviewed",
        sequence: 4,
        status: "PASS",
        ownerUserId: ids.adminUserId,
        completedByUserId: ids.adminUserId,
        reviewedByUserId: ids.approverUserId,
        dueAt: new Date("2026-08-03T12:00:00.000Z"),
        completedAt: new Date("2026-08-01T07:00:00.000Z"),
        reviewedAt: new Date("2026-08-01T08:00:00.000Z"),
        resultSummary:
          "Offline payment release evidence captured; no AP settlement or bank mutation posted.",
        evidenceReference: "DEMO-CLOSE-PAYMENT-RELEASE-2026-07",
      },
      {
        tenantId: ids.tenantId,
        companyId: ids.companyId,
        accountingPeriodId: period.id,
        financeCloseRunId: run.id,
        checklistType: "PETTY_CASH",
        label: "Petty cash liquidations reviewed",
        sequence: 5,
        status: "PENDING",
        ownerUserId: ids.userId,
        dueAt: new Date("2026-08-04T09:00:00.000Z"),
        resultSummary:
          "Branch petty cash custody and receipt liquidation still require final reviewer sign-off.",
      },
      {
        tenantId: ids.tenantId,
        companyId: ids.companyId,
        accountingPeriodId: period.id,
        financeCloseRunId: run.id,
        checklistType: "CASH_ADVANCES",
        label: "Cash advances and liquidation aging reviewed",
        sequence: 6,
        status: "PASS",
        ownerUserId: ids.adminUserId,
        completedByUserId: ids.adminUserId,
        reviewedByUserId: ids.approverUserId,
        dueAt: new Date("2026-08-04T09:00:00.000Z"),
        completedAt: new Date("2026-08-01T09:00:00.000Z"),
        reviewedAt: new Date("2026-08-01T10:00:00.000Z"),
        resultSummary:
          "Outstanding cash advance balances are visible and linked to liquidation markers.",
        evidenceReference: "DEMO-CLOSE-CASH-ADV-2026-07",
      },
      {
        tenantId: ids.tenantId,
        companyId: ids.companyId,
        accountingPeriodId: period.id,
        financeCloseRunId: run.id,
        checklistType: "INVENTORY_CUTOFF",
        label: "Inventory cut-off reviewed",
        sequence: 7,
        status: "PENDING",
        ownerUserId: ids.approverUserId,
        dueAt: new Date("2026-08-04T12:00:00.000Z"),
        resultSummary:
          "Receiving, wastage, counts, and adjustments remain source records for cut-off review.",
      },
      {
        tenantId: ids.tenantId,
        companyId: ids.companyId,
        accountingPeriodId: period.id,
        financeCloseRunId: run.id,
        checklistType: "MANUAL_JOURNALS",
        label: "Manual journals reviewed",
        sequence: 8,
        status: "PASS",
        ownerUserId: ids.adminUserId,
        completedByUserId: ids.adminUserId,
        reviewedByUserId: ids.approverUserId,
        dueAt: new Date("2026-08-05T09:00:00.000Z"),
        completedAt: new Date("2026-08-01T11:00:00.000Z"),
        reviewedAt: new Date("2026-08-01T12:00:00.000Z"),
        resultSummary:
          "Balanced demo manual journals reviewed with no source-domain mutation.",
        evidenceReference: "DEMO-CLOSE-MANUAL-JOURNAL-2026-07",
      },
      {
        tenantId: ids.tenantId,
        companyId: ids.companyId,
        accountingPeriodId: period.id,
        financeCloseRunId: run.id,
        checklistType: "TRIAL_BALANCE",
        label: "Trial balance reviewed",
        sequence: 9,
        status: "PENDING",
        ownerUserId: ids.adminUserId,
        dueAt: new Date("2026-08-05T12:00:00.000Z"),
        resultSummary:
          "Trial balance review remains pending until AP and bank blockers are dispositioned.",
      },
      {
        tenantId: ids.tenantId,
        companyId: ids.companyId,
        accountingPeriodId: period.id,
        financeCloseRunId: run.id,
        checklistType: "WORKFORCE_REVIEW",
        label: "Workforce exceptions reviewed",
        sequence: 10,
        status: "NOT_APPLICABLE",
        isRequired: true,
        ownerUserId: ids.adminUserId,
        completedByUserId: ids.adminUserId,
        dueAt: new Date("2026-08-05T12:00:00.000Z"),
        completedAt: new Date("2026-08-01T13:00:00.000Z"),
        resultSummary:
          "No payroll posting is in scope for this foundation; workforce readiness reviewed only.",
        evidenceReference: "DEMO-CLOSE-WORKFORCE-2026-07",
      },
      {
        tenantId: ids.tenantId,
        companyId: ids.companyId,
        accountingPeriodId: period.id,
        financeCloseRunId: run.id,
        checklistType: "MANAGEMENT_SIGNOFF",
        label: "Finance management sign-off",
        sequence: 11,
        status: "PENDING",
        ownerUserId: ids.approverUserId,
        dueAt: new Date("2026-08-06T09:00:00.000Z"),
        resultSummary:
          "Sign-off waits for blocker exceptions and pending checks to be cleared or formally waived.",
      },
    ],
  });

  await prisma.financeCloseException.createMany({
    data: [
      {
        tenantId: ids.tenantId,
        companyId: ids.companyId,
        accountingPeriodId: period.id,
        financeCloseRunId: run.id,
        exceptionType: "UNMATCHED_BANK_LINE",
        severity: "BLOCKER",
        state: "OPEN",
        title: "Unmatched July bank statement line",
        description:
          "One imported bank statement line has no confirmed source link yet. It must be matched, resolved, or formally waived before close recommendation.",
        sourceEntityType: "BANK_STATEMENT_LINE",
        sourceEntityId: "demo-bank-statement-line-unmatched-2026-07",
        raisedByUserId: ids.adminUserId,
        assignedToUserId: ids.approverUserId,
        dueAt: new Date("2026-08-03T09:00:00.000Z"),
        evidenceReference: "DEMO-CLOSE-EXC-BANK-001",
      },
      {
        tenantId: ids.tenantId,
        companyId: ids.companyId,
        accountingPeriodId: period.id,
        financeCloseRunId: run.id,
        exceptionType: "AP_VARIANCE_HOLD",
        severity: "SIGNIFICANT",
        state: "ACKNOWLEDGED",
        title: "AP variance hold awaiting disposition",
        description:
          "A supplier invoice variance hold is acknowledged for finance review. No payment release or AP settlement has been posted.",
        sourceEntityType: "AP_INVOICE",
        sourceEntityId: "demo-ap-invoice-variance-2026-07",
        raisedByUserId: ids.adminUserId,
        assignedToUserId: ids.approverUserId,
        dueAt: new Date("2026-08-03T12:00:00.000Z"),
        acknowledgedAt: new Date("2026-08-01T04:00:00.000Z"),
        evidenceReference: "DEMO-CLOSE-EXC-AP-001",
      },
    ],
  });

  await prisma.financeCloseAttempt.create({
    data: {
      tenantId: ids.tenantId,
      companyId: ids.companyId,
      accountingPeriodId: period.id,
      financeCloseRunId: run.id,
      action: "START_VALIDATION",
      result: "SUCCEEDED",
      idempotencyKey: "demo:FCR-2026-07-READINESS:attempt:start",
      attemptedByUserId: ids.adminUserId,
      attemptedAt: new Date("2026-08-01T01:00:00.000Z"),
      notes:
        "Demo close readiness validation started; no accounting period status was changed.",
    },
  });
}

async function seedApInvoiceDemoData() {
  const supplier = await prisma.supplier.findFirst({
    where: { companyId: ids.companyId, supplierCode: "PACIFIC-PANTRY" },
    select: { id: true },
  });
  if (!supplier) {
    return;
  }

  const invoice = await prisma.apInvoice.upsert({
    where: {
      companyId_publicReference: {
        companyId: ids.companyId,
        publicReference: "AP-INV-2026-00001",
      },
    },
    create: {
      tenantId: ids.tenantId,
      companyId: ids.companyId,
      publicReference: "AP-INV-2026-00001",
      supplierId: supplier.id,
      locationId: ids.locationId,
      currencyCode: "PHP",
      supplierInvoiceNumber: "PP-2026-0701",
      invoiceDate: new Date("2026-07-01T00:00:00.000Z"),
      receivedAt: new Date("2026-07-02T02:00:00.000Z"),
      dueDate: new Date("2026-07-31T00:00:00.000Z"),
      paymentTermsDays: 30,
      subtotalAmount: 18750,
      taxAmount: 2250,
      discountAmount: 0,
      freightAmount: 0,
      totalAmount: 21000,
      status: "ON_HOLD",
      matchStatus: "VARIANCE_HOLD",
      duplicateRisk: "CLEAN",
      duplicateFingerprint: "demo-ap-invoice-pacific-pantry-2026-0701",
      holdReason:
        "Demo non-PO supplier invoice requires AP exception review before payment request creation.",
      nonPoReason:
        "Demo operating invoice captured before PO/receiving linkage is available.",
      evidenceReference: "DEMO-AP-INVOICE-PP-2026-0701",
      createdByUserId: ids.adminUserId,
      submittedByUserId: ids.adminUserId,
      reviewedByUserId: ids.approverUserId,
      submittedAt: new Date("2026-07-02T02:05:00.000Z"),
      reviewedAt: new Date("2026-07-02T02:10:00.000Z"),
    },
    update: {
      supplierId: supplier.id,
      locationId: ids.locationId,
      currencyCode: "PHP",
      supplierInvoiceNumber: "PP-2026-0701",
      invoiceDate: new Date("2026-07-01T00:00:00.000Z"),
      receivedAt: new Date("2026-07-02T02:00:00.000Z"),
      dueDate: new Date("2026-07-31T00:00:00.000Z"),
      paymentTermsDays: 30,
      subtotalAmount: 18750,
      taxAmount: 2250,
      discountAmount: 0,
      freightAmount: 0,
      totalAmount: 21000,
      status: "ON_HOLD",
      matchStatus: "VARIANCE_HOLD",
      duplicateRisk: "CLEAN",
      holdReason:
        "Demo non-PO supplier invoice requires AP exception review before payment request creation.",
      nonPoReason:
        "Demo operating invoice captured before PO/receiving linkage is available.",
      evidenceReference: "DEMO-AP-INVOICE-PP-2026-0701",
      submittedByUserId: ids.adminUserId,
      reviewedByUserId: ids.approverUserId,
      submittedAt: new Date("2026-07-02T02:05:00.000Z"),
      reviewedAt: new Date("2026-07-02T02:10:00.000Z"),
    },
  });

  await prisma.apInvoiceLine.deleteMany({
    where: { apInvoiceId: invoice.id },
  });
  await prisma.apInvoiceLine.create({
    data: {
      tenantId: ids.tenantId,
      companyId: ids.companyId,
      apInvoiceId: invoice.id,
      lineNumber: 1,
      description: "Imported Japanese sauce replenishment",
      invoicedQty: 25,
      unitPrice: 750,
      taxAmount: 2250,
      discountAmount: 0,
      lineTotalAmount: 21000,
    },
  });

  await prisma.apInvoiceException.deleteMany({
    where: { apInvoiceId: invoice.id },
  });
  await prisma.apInvoiceException.create({
    data: {
      tenantId: ids.tenantId,
      companyId: ids.companyId,
      apInvoiceId: invoice.id,
      exceptionCode: "SOURCE_LINK_REQUIRED",
      exceptionType: "THREE_WAY_MATCH",
      status: "OPEN",
      severity: "HIGH",
      ownerUserId: ids.approverUserId,
      reason:
        "Demo invoice is intentionally held because it has no PO and accepted receiving link yet.",
      evidenceReference: "DEMO-AP-INVOICE-PP-2026-0701",
      createdByUserId: ids.adminUserId,
    },
  });

  const matchedInvoice = await prisma.apInvoice.upsert({
    where: {
      companyId_publicReference: {
        companyId: ids.companyId,
        publicReference: "AP-INV-2026-00002",
      },
    },
    create: {
      tenantId: ids.tenantId,
      companyId: ids.companyId,
      publicReference: "AP-INV-2026-00002",
      supplierId: supplier.id,
      locationId: ids.locationId,
      currencyCode: "PHP",
      supplierInvoiceNumber: "PP-2026-0702",
      invoiceDate: new Date("2026-07-02T00:00:00.000Z"),
      receivedAt: new Date("2026-07-03T02:00:00.000Z"),
      dueDate: new Date("2026-08-01T00:00:00.000Z"),
      paymentTermsDays: 30,
      subtotalAmount: 12000,
      taxAmount: 1440,
      discountAmount: 0,
      freightAmount: 0,
      totalAmount: 13440,
      status: "MATCHED",
      matchStatus: "EXACT_MATCH",
      duplicateRisk: "CLEAN",
      duplicateFingerprint: "demo-ap-invoice-pacific-pantry-2026-0702",
      nonPoReason:
        "Demo non-PO invoice treated as exact-match equivalent for payment-request preview only.",
      evidenceReference: "DEMO-AP-INVOICE-PP-2026-0702",
      createdByUserId: ids.adminUserId,
      submittedByUserId: ids.adminUserId,
      reviewedByUserId: ids.approverUserId,
      submittedAt: new Date("2026-07-03T02:05:00.000Z"),
      reviewedAt: new Date("2026-07-03T02:10:00.000Z"),
    },
    update: {
      supplierId: supplier.id,
      locationId: ids.locationId,
      currencyCode: "PHP",
      supplierInvoiceNumber: "PP-2026-0702",
      status: "MATCHED",
      matchStatus: "EXACT_MATCH",
      duplicateRisk: "CLEAN",
      totalAmount: 13440,
      nonPoReason:
        "Demo non-PO invoice treated as exact-match equivalent for payment-request preview only.",
      evidenceReference: "DEMO-AP-INVOICE-PP-2026-0702",
    },
  });

  await prisma.apInvoiceLine.deleteMany({
    where: { apInvoiceId: matchedInvoice.id },
  });
  await prisma.apInvoiceLine.create({
    data: {
      tenantId: ids.tenantId,
      companyId: ids.companyId,
      apInvoiceId: matchedInvoice.id,
      lineNumber: 1,
      description: "Restaurant consumable replenishment",
      invoicedQty: 12,
      unitPrice: 1000,
      taxAmount: 1440,
      discountAmount: 0,
      lineTotalAmount: 13440,
    },
  });

  const paymentRequest = await prisma.paymentRequest.upsert({
    where: {
      tenantId_companyId_publicReference: {
        tenantId: ids.tenantId,
        companyId: ids.companyId,
        publicReference: "PAY-2026-00001",
      },
    },
    create: {
      tenantId: ids.tenantId,
      companyId: ids.companyId,
      locationId: ids.locationId,
      supplierId: supplier.id,
      publicReference: "PAY-2026-00001",
      currencyCode: "PHP",
      totalRequestedAmount: 13440,
      status: "APPROVED",
      requestedByUserId: ids.adminUserId,
      submittedByUserId: ids.adminUserId,
      approvedByUserId: ids.approverUserId,
      submittedAt: new Date("2026-07-03T03:00:00.000Z"),
      approvedAt: new Date("2026-07-03T03:10:00.000Z"),
      requestReason:
        "Demo approved payment request from a matched AP invoice. Release remains gated.",
      evidenceReference: "DEMO-PAYMENT-REQUEST-001",
    },
    update: {
      locationId: ids.locationId,
      supplierId: supplier.id,
      totalRequestedAmount: 13440,
      status: "APPROVED",
      requestedByUserId: ids.adminUserId,
      submittedByUserId: ids.adminUserId,
      approvedByUserId: ids.approverUserId,
      requestReason:
        "Demo approved payment request from a matched AP invoice. Release remains gated.",
      evidenceReference: "DEMO-PAYMENT-REQUEST-001",
    },
  });

  await prisma.paymentReleaseExecution.deleteMany({
    where: { paymentRelease: { paymentRequestId: paymentRequest.id } },
  });
  await prisma.paymentReleaseAllocation.deleteMany({
    where: { paymentRelease: { paymentRequestId: paymentRequest.id } },
  });
  await prisma.paymentRelease.deleteMany({
    where: { paymentRequestId: paymentRequest.id },
  });
  await prisma.paymentRequestLine.deleteMany({
    where: { paymentRequestId: paymentRequest.id },
  });
  await prisma.paymentRequestLine.create({
    data: {
      tenantId: ids.tenantId,
      companyId: ids.companyId,
      locationId: ids.locationId,
      paymentRequestId: paymentRequest.id,
      apInvoiceId: matchedInvoice.id,
      lineNumber: 1,
      requestedAmount: 13440,
      invoiceTotalSnapshot: 13440,
      invoiceOutstandingSnapshot: 13440,
      notes: "Demo request line; cash/bank release is intentionally not created.",
      createdByUserId: ids.adminUserId,
    },
  });
}

async function seedBankCashDemoData() {
  const cashAccount = await prisma.chartOfAccount.findFirst({
    where: { companyId: ids.companyId, code: "1010", postingAllowed: true },
    select: { id: true },
  });
  const period = await prisma.accountingPeriod.findFirst({
    where: { companyId: ids.companyId, code: "2026-07", status: "OPEN" },
    select: { id: true },
  });
  if (!cashAccount || !period) {
    return;
  }

  const bankAccount = await prisma.bankAccount.upsert({
    where: {
      companyId_publicReference: {
        companyId: ids.companyId,
        publicReference: "BANK-OGFI-BDO-001",
      },
    },
    create: {
      tenantId: ids.tenantId,
      companyId: ids.companyId,
      locationId: null,
      ledgerAccountId: cashAccount.id,
      publicReference: "BANK-OGFI-BDO-001",
      bankName: "BDO Operating Account",
      bankBranchCode: "BDO-NCR-001",
      maskedAccountNumber: "**** **** **** 2408",
      accountType: "CHECKING",
      status: "ACTIVE",
      currencyCode: "PHP",
      activeFrom: new Date("2026-01-01T00:00:00.000Z"),
      evidenceReference: "DEMO-BANK-MANDATE-001",
      createdByUserId: ids.adminUserId,
    },
    update: {
      ledgerAccountId: cashAccount.id,
      bankName: "BDO Operating Account",
      bankBranchCode: "BDO-NCR-001",
      maskedAccountNumber: "**** **** **** 2408",
      accountType: "CHECKING",
      status: "ACTIVE",
      currencyCode: "PHP",
      activeFrom: new Date("2026-01-01T00:00:00.000Z"),
      evidenceReference: "DEMO-BANK-MANDATE-001",
      createdByUserId: ids.adminUserId,
    },
  });

  const deposit = await prisma.branchCashDeposit.upsert({
    where: {
      tenantId_companyId_sourceEventKey: {
        tenantId: ids.tenantId,
        companyId: ids.companyId,
        sourceEventKey: "demo:branch-cash-deposit:yl-sm-north:2026-07-04",
      },
    },
    create: {
      tenantId: ids.tenantId,
      companyId: ids.companyId,
      locationId: ids.locationId,
      bankAccountId: bankAccount.id,
      publicReference: "BCD-2026-00001",
      depositDate: new Date("2026-07-04T06:00:00.000Z"),
      amountPhp: 185000,
      status: "QUEUED_FOR_RECONCILIATION",
      depositSlipNumber: "BDO-DEP-0704-001",
      sourceEventKey: "demo:branch-cash-deposit:yl-sm-north:2026-07-04",
      evidenceReference: "DEMO-DEPOSIT-SLIP-0704-001",
      notes:
        "Demo branch deposit evidence from Yakiniku Like SM North Edsa daily cash handover.",
      declaredByUserId: ids.userId,
      verifiedByUserId: ids.adminUserId,
      verifiedAt: new Date("2026-07-04T07:00:00.000Z"),
    },
    update: {
      locationId: ids.locationId,
      bankAccountId: bankAccount.id,
      depositDate: new Date("2026-07-04T06:00:00.000Z"),
      amountPhp: 185000,
      status: "QUEUED_FOR_RECONCILIATION",
      depositSlipNumber: "BDO-DEP-0704-001",
      evidenceReference: "DEMO-DEPOSIT-SLIP-0704-001",
      notes:
        "Demo branch deposit evidence from Yakiniku Like SM North Edsa daily cash handover.",
      declaredByUserId: ids.userId,
      verifiedByUserId: ids.adminUserId,
      verifiedAt: new Date("2026-07-04T07:00:00.000Z"),
    },
  });

  const statement = await prisma.bankStatement.upsert({
    where: {
      tenantId_companyId_sourceEventKey: {
        tenantId: ids.tenantId,
        companyId: ids.companyId,
        sourceEventKey: "demo:bank-statement:bdo:2026-07-04",
      },
    },
    create: {
      tenantId: ids.tenantId,
      companyId: ids.companyId,
      bankAccountId: bankAccount.id,
      publicReference: "BST-2026-00001",
      statementFrom: new Date("2026-07-04T00:00:00.000Z"),
      statementTo: new Date("2026-07-04T23:59:59.000Z"),
      statementDate: new Date("2026-07-04T23:59:59.000Z"),
      sourceType: "CSV_UPLOAD",
      sourceReference: "DEMO-BDO-STATEMENT-2026-07-04.csv",
      sourceEventKey: "demo:bank-statement:bdo:2026-07-04",
      status: "READY_FOR_RECONCILIATION",
      currencyCode: "PHP",
      openingBalance: 900000,
      closingBalance: 1085000,
      importedAt: new Date("2026-07-05T01:00:00.000Z"),
      createdByUserId: ids.adminUserId,
    },
    update: {
      bankAccountId: bankAccount.id,
      status: "READY_FOR_RECONCILIATION",
      openingBalance: 900000,
      closingBalance: 1085000,
      importedAt: new Date("2026-07-05T01:00:00.000Z"),
      createdByUserId: ids.adminUserId,
    },
  });

  const statementLine = await prisma.bankStatementLine.upsert({
    where: {
      tenantId_companyId_sourceEventKey: {
        tenantId: ids.tenantId,
        companyId: ids.companyId,
        sourceEventKey: "demo:bank-statement-line:bdo:2026-07-04:deposit-001",
      },
    },
    create: {
      tenantId: ids.tenantId,
      companyId: ids.companyId,
      bankStatementId: statement.id,
      bankAccountId: bankAccount.id,
      transactionDate: new Date("2026-07-04T08:20:00.000Z"),
      valueDate: new Date("2026-07-04T08:20:00.000Z"),
      bankReference: "BDO-CREDIT-0704-001",
      description: "Cash deposit - Yakiniku Like SM North Edsa",
      debitAmount: 0,
      creditAmount: 185000,
      netAmount: 185000,
      status: "MATCHED",
      sourceEventKey: "demo:bank-statement-line:bdo:2026-07-04:deposit-001",
      notes: "Demo imported bank line matched to branch deposit evidence.",
      matchedAmount: 185000,
    },
    update: {
      bankStatementId: statement.id,
      bankAccountId: bankAccount.id,
      transactionDate: new Date("2026-07-04T08:20:00.000Z"),
      bankReference: "BDO-CREDIT-0704-001",
      description: "Cash deposit - Yakiniku Like SM North Edsa",
      debitAmount: 0,
      creditAmount: 185000,
      netAmount: 185000,
      status: "MATCHED",
      matchedAmount: 185000,
    },
  });

  const reconciliation = await prisma.bankReconciliation.upsert({
    where: {
      companyId_publicReference: {
        companyId: ids.companyId,
        publicReference: "BREC-2026-00001",
      },
    },
    create: {
      tenantId: ids.tenantId,
      companyId: ids.companyId,
      bankAccountId: bankAccount.id,
      accountingPeriodId: period.id,
      bankStatementId: statement.id,
      publicReference: "BREC-2026-00001",
      status: "MATCHED",
      preparedByUserId: ids.adminUserId,
      reviewedByUserId: ids.approverUserId,
      preparedAt: new Date("2026-07-05T01:20:00.000Z"),
      reviewedAt: new Date("2026-07-05T01:35:00.000Z"),
      reason:
        "Demo reconciliation batch showing branch deposit evidence matched to imported bank statement line.",
      varianceAmount: 0,
    },
    update: {
      bankAccountId: bankAccount.id,
      accountingPeriodId: period.id,
      bankStatementId: statement.id,
      status: "MATCHED",
      preparedByUserId: ids.adminUserId,
      reviewedByUserId: ids.approverUserId,
      preparedAt: new Date("2026-07-05T01:20:00.000Z"),
      reviewedAt: new Date("2026-07-05T01:35:00.000Z"),
      varianceAmount: 0,
    },
  });

  await prisma.bankReconciliationMatch.upsert({
    where: {
      tenantId_companyId_idempotencyKey: {
        tenantId: ids.tenantId,
        companyId: ids.companyId,
        idempotencyKey: "demo:bank-reconciliation-match:deposit-001",
      },
    },
    create: {
      tenantId: ids.tenantId,
      companyId: ids.companyId,
      reconciliationId: reconciliation.id,
      statementLineId: statementLine.id,
      branchCashDepositId: deposit.id,
      sourceType: "BRANCH_CASH_DEPOSIT",
      sourceDocumentId: deposit.id,
      sourceDocumentSnapshot: {
        publicReference: deposit.publicReference,
        depositSlipNumber: deposit.depositSlipNumber,
        amountPhp: 185000,
      },
      matchedAmount: 185000,
      status: "MATCHED",
      idempotencyKey: "demo:bank-reconciliation-match:deposit-001",
      matchedByUserId: ids.adminUserId,
      matchedAt: new Date("2026-07-05T01:25:00.000Z"),
      evidenceReference: "DEMO-DEPOSIT-SLIP-0704-001",
    },
    update: {
      reconciliationId: reconciliation.id,
      statementLineId: statementLine.id,
      branchCashDepositId: deposit.id,
      sourceDocumentId: deposit.id,
      matchedAmount: 185000,
      status: "MATCHED",
      matchedByUserId: ids.adminUserId,
      matchedAt: new Date("2026-07-05T01:25:00.000Z"),
      evidenceReference: "DEMO-DEPOSIT-SLIP-0704-001",
    },
  });
}

async function seedPaymentReleaseDemoData() {
  const paymentRequest = await prisma.paymentRequest.findFirst({
    where: {
      tenantId: ids.tenantId,
      companyId: ids.companyId,
      publicReference: "PAY-2026-00001",
      status: "APPROVED",
    },
    include: {
      lines: true,
    },
  });
  const bankAccount = await prisma.bankAccount.findFirst({
    where: {
      tenantId: ids.tenantId,
      companyId: ids.companyId,
      publicReference: "BANK-OGFI-BDO-001",
      status: "ACTIVE",
    },
  });
  if (!paymentRequest || !bankAccount || paymentRequest.lines.length === 0) {
    return;
  }

  const release = await prisma.paymentRelease.upsert({
    where: {
      tenantId_companyId_paymentRequestId: {
        tenantId: ids.tenantId,
        companyId: ids.companyId,
        paymentRequestId: paymentRequest.id,
      },
    },
    create: {
      tenantId: ids.tenantId,
      companyId: ids.companyId,
      locationId: ids.locationId,
      supplierId: paymentRequest.supplierId,
      paymentRequestId: paymentRequest.id,
      bankAccountId: bankAccount.id,
      publicReference: "REL-2026-00001",
      currencyCode: "PHP",
      method: "BANK_TRANSFER",
      status: "RELEASED",
      totalRequestedAmount: 13440,
      releaseAmount: 13440,
      releasedAmount: 13440,
      sourceEventKey: "demo:payment-release:pay-2026-00001",
      idempotencyKey: "demo:payment-release:create:pay-2026-00001",
      reason:
        "Demo offline bank-transfer release record for an approved payment request. No bank API or journal posting is performed.",
      evidenceReference: "DEMO-BDO-RELEASE-PROOF-001",
      releaseReference: "BDO-OFFLINE-TRANSFER-2026-0705-001",
      scheduledAt: new Date("2026-07-05T02:00:00.000Z"),
      releasedAt: new Date("2026-07-05T02:20:00.000Z"),
      createdByUserId: ids.approverUserId,
      releasedByUserId: ids.secondaryAdminUserId,
    },
    update: {
      locationId: ids.locationId,
      supplierId: paymentRequest.supplierId,
      bankAccountId: bankAccount.id,
      status: "RELEASED",
      totalRequestedAmount: 13440,
      releaseAmount: 13440,
      releasedAmount: 13440,
      reason:
        "Demo offline bank-transfer release record for an approved payment request. No bank API or journal posting is performed.",
      evidenceReference: "DEMO-BDO-RELEASE-PROOF-001",
      releaseReference: "BDO-OFFLINE-TRANSFER-2026-0705-001",
      releasedAt: new Date("2026-07-05T02:20:00.000Z"),
      createdByUserId: ids.approverUserId,
      releasedByUserId: ids.secondaryAdminUserId,
    },
  });

  await prisma.paymentReleaseAllocation.deleteMany({
    where: { paymentReleaseId: release.id },
  });
  for (const line of paymentRequest.lines) {
    await prisma.paymentReleaseAllocation.create({
      data: {
        tenantId: ids.tenantId,
        companyId: ids.companyId,
        paymentReleaseId: release.id,
        paymentRequestLineId: line.id,
        apInvoiceId: line.apInvoiceId,
        allocatedAmount: line.requestedAmount,
        requestLineSnapshotAmount: line.requestedAmount,
        invoiceOutstandingSnapshot: line.invoiceOutstandingSnapshot,
        createdByUserId: ids.approverUserId,
      },
    });
  }

  await prisma.paymentReleaseExecution.upsert({
    where: {
      tenantId_companyId_idempotencyKey: {
        tenantId: ids.tenantId,
        companyId: ids.companyId,
        idempotencyKey: "demo:payment-release:execute:rel-2026-00001",
      },
    },
    create: {
      tenantId: ids.tenantId,
      companyId: ids.companyId,
      paymentReleaseId: release.id,
      status: "SUCCEEDED",
      idempotencyKey: "demo:payment-release:execute:rel-2026-00001",
      requestPayloadHash:
        "demo-release-hash-pay-2026-00001-bdo-offline-transfer",
      releaseReference: "BDO-OFFLINE-TRANSFER-2026-0705-001",
      executionSnapshot: {
        method: "BANK_TRANSFER",
        noBankApiCall: true,
        noJournalPosting: true,
        noSourceMutation: true,
      },
      actorUserId: ids.secondaryAdminUserId,
    },
    update: {
      paymentReleaseId: release.id,
      status: "SUCCEEDED",
      releaseReference: "BDO-OFFLINE-TRANSFER-2026-0705-001",
      actorUserId: ids.secondaryAdminUserId,
    },
  });
}

async function seedWorkforceDemoData() {
  const branchLocationId = (index: number) =>
    demoBranchLocations[index]?.id ?? ids.locationId;
  const employees = [
    {
      id: "10000000-0000-4000-8000-000000001001",
      userId: ids.userId,
      employeeCode: "YL-EMP-0001",
      legalName: "Bianca Reyes",
      preferredName: "Bianca Reyes",
      jobTitle: "Branch Storekeeper",
      locationId: branchLocationId(0),
      roleLabel: "Storekeeper",
    },
    {
      id: "10000000-0000-4000-8000-000000001002",
      userId: ids.approverUserId,
      employeeCode: "YL-EMP-0002",
      legalName: "Alyssa Tan",
      preferredName: "Alyssa Tan",
      jobTitle: "Operations Approver",
      locationId: branchLocationId(0),
      roleLabel: "Operations Approver",
    },
    {
      id: "10000000-0000-4000-8000-000000001003",
      userId: ids.adminUserId,
      employeeCode: "YL-EMP-0003",
      legalName: "Nico Valdez",
      preferredName: "Nico Valdez",
      jobTitle: "ERP Administrator",
      locationId: ids.warehouseLocationId,
      roleLabel: "ERP Administrator",
    },
    {
      id: "10000000-0000-4000-8000-000000001004",
      userId: null,
      employeeCode: "YL-EMP-0004",
      legalName: "Paolo Cruz",
      preferredName: "Paolo Cruz",
      jobTitle: "Branch Manager",
      locationId: branchLocationId(1),
      roleLabel: "Branch Manager",
    },
    {
      id: "10000000-0000-4000-8000-000000001005",
      userId: null,
      employeeCode: "YL-EMP-0005",
      legalName: "Rica Santos",
      preferredName: "Rica Santos",
      jobTitle: "Kitchen Lead",
      locationId: branchLocationId(1),
      roleLabel: "Kitchen Lead",
    },
    {
      id: "10000000-0000-4000-8000-000000001006",
      userId: null,
      employeeCode: "YL-EMP-0006",
      legalName: "Jun Garcia",
      preferredName: "Jun Garcia",
      jobTitle: "Grill Cook",
      locationId: branchLocationId(2),
      roleLabel: "Grill Cook",
    },
    {
      id: "10000000-0000-4000-8000-000000001007",
      userId: null,
      employeeCode: "YL-EMP-0007",
      legalName: "Mika Lim",
      preferredName: "Mika Lim",
      jobTitle: "Service Crew",
      locationId: branchLocationId(3),
      roleLabel: "Service Crew",
    },
    {
      id: "10000000-0000-4000-8000-000000001008",
      userId: null,
      employeeCode: "YL-EMP-0008",
      legalName: "Carlo Navarro",
      preferredName: "Carlo Navarro",
      jobTitle: "Cashier",
      locationId: branchLocationId(4),
      roleLabel: "Cashier",
    },
  ];

  for (const employee of employees) {
    await prisma.employee.upsert({
      where: {
        tenantId_companyId_employeeCode: {
          tenantId: ids.tenantId,
          companyId: ids.companyId,
          employeeCode: employee.employeeCode,
        },
      },
      create: {
        id: employee.id,
        tenantId: ids.tenantId,
        companyId: ids.companyId,
        userId: employee.userId,
        employeeCode: employee.employeeCode,
        legalName: employee.legalName,
        preferredName: employee.preferredName,
        jobTitle: employee.jobTitle,
        employmentType: "FULL_TIME",
        status: "ACTIVE",
        hireDate: new Date("2025-11-15T00:00:00.000Z"),
        homeLocationId: employee.locationId,
        createdByUserId: ids.adminUserId,
      },
      update: {
        userId: employee.userId,
        legalName: employee.legalName,
        preferredName: employee.preferredName,
        jobTitle: employee.jobTitle,
        status: "ACTIVE",
        homeLocationId: employee.locationId,
        updatedByUserId: ids.adminUserId,
      },
    });

    const suffix = employee.employeeCode.slice(-3);
    await prisma.employeeAssignment.upsert({
      where: { id: `10000000-0000-4000-8000-000000002${suffix}` },
      create: {
        id: `10000000-0000-4000-8000-000000002${suffix}`,
        tenantId: ids.tenantId,
        companyId: ids.companyId,
        employeeId: employee.id,
        locationId: employee.locationId,
        brandId: ids.brandId,
        assignmentType: "PRIMARY",
        status: "ACTIVE",
        isPrimary: true,
        roleLabel: employee.roleLabel,
        effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
        reason: "Demo workforce baseline assignment",
        createdByUserId: ids.adminUserId,
      },
      update: {
        locationId: employee.locationId,
        brandId: ids.brandId,
        status: "ACTIVE",
        isPrimary: true,
        roleLabel: employee.roleLabel,
        reason: "Demo workforce baseline assignment",
      },
    });
  }

  const leaveRows = [
    {
      id: "10000000-0000-4000-8000-000000003001",
      employeeId: "10000000-0000-4000-8000-000000001005",
      locationId: branchLocationId(1),
      leaveType: "VACATION" as const,
      status: "SUBMITTED" as const,
      startDate: "2026-07-12",
      endDate: "2026-07-12",
      minutes: 480,
      reason: "Family commitment after weekend closing shift.",
    },
    {
      id: "10000000-0000-4000-8000-000000003002",
      employeeId: "10000000-0000-4000-8000-000000001007",
      locationId: branchLocationId(3),
      leaveType: "SICK" as const,
      status: "APPROVED" as const,
      startDate: "2026-07-09",
      endDate: "2026-07-09",
      minutes: 480,
      reason: "Medical rest day with branch manager coverage arranged.",
    },
  ];
  for (const leave of leaveRows) {
    await prisma.employeeLeaveRequest.upsert({
      where: { id: leave.id },
      create: {
        id: leave.id,
        tenantId: ids.tenantId,
        companyId: ids.companyId,
        employeeId: leave.employeeId,
        locationId: leave.locationId,
        leaveType: leave.leaveType,
        status: leave.status,
        requestedByUserId: ids.userId,
        approvedByUserId:
          leave.status === "APPROVED" ? ids.approverUserId : null,
        reason: leave.reason,
        startDate: new Date(`${leave.startDate}T00:00:00.000Z`),
        endDate: new Date(`${leave.endDate}T23:59:59.000Z`),
        requestedMinutes: leave.minutes,
        sourceEventKey: `DEMO-LEAVE-${leave.id.slice(-4)}`,
        submittedAt: new Date("2026-07-06T08:00:00.000Z"),
        approvedAt:
          leave.status === "APPROVED"
            ? new Date("2026-07-06T10:00:00.000Z")
            : null,
        decisionAt:
          leave.status === "APPROVED"
            ? new Date("2026-07-06T10:00:00.000Z")
            : null,
        decisionNote:
          leave.status === "APPROVED"
            ? "Coverage confirmed by branch manager."
            : null,
        createdByUserId: ids.userId,
      },
      update: {
        status: leave.status,
        reason: leave.reason,
        requestedMinutes: leave.minutes,
      },
    });
  }

  const overtimeRows = [
    {
      id: "10000000-0000-4000-8000-000000004001",
      employeeId: "10000000-0000-4000-8000-000000001006",
      locationId: branchLocationId(2),
      overtimeType: "WEEKEND" as const,
      status: "SUBMITTED" as const,
      start: "2026-07-11T13:00:00.000Z",
      end: "2026-07-11T16:00:00.000Z",
      minutes: 180,
      reason: "Additional grill coverage for lunch queue.",
    },
    {
      id: "10000000-0000-4000-8000-000000004002",
      employeeId: "10000000-0000-4000-8000-000000001008",
      locationId: branchLocationId(4),
      overtimeType: "REGULAR" as const,
      status: "APPROVED" as const,
      start: "2026-07-08T11:00:00.000Z",
      end: "2026-07-08T13:00:00.000Z",
      minutes: 120,
      reason: "Cashier coverage during POS reconciliation training.",
    },
  ];
  for (const overtime of overtimeRows) {
    await prisma.employeeOvertimeRecord.upsert({
      where: { id: overtime.id },
      create: {
        id: overtime.id,
        tenantId: ids.tenantId,
        companyId: ids.companyId,
        employeeId: overtime.employeeId,
        locationId: overtime.locationId,
        overtimeType: overtime.overtimeType,
        status: overtime.status,
        workedStartAt: new Date(overtime.start),
        workedEndAt: new Date(overtime.end),
        requestedMinutes: overtime.minutes,
        reason: overtime.reason,
        requestedByUserId: ids.userId,
        approvedByUserId:
          overtime.status === "APPROVED" ? ids.approverUserId : null,
        sourceEventKey: `DEMO-OT-${overtime.id.slice(-4)}`,
        approvedAt:
          overtime.status === "APPROVED"
            ? new Date("2026-07-06T11:00:00.000Z")
            : null,
        createdByUserId: ids.userId,
      },
      update: {
        status: overtime.status,
        reason: overtime.reason,
        requestedMinutes: overtime.minutes,
      },
    });
  }

  const scheduleId = "10000000-0000-4000-8000-000000007001";
  await prisma.workforceSchedule.upsert({
    where: {
      tenantId_companyId_sourceEventKey: {
        tenantId: ids.tenantId,
        companyId: ids.companyId,
        sourceEventKey: "DEMO-WORKFORCE-SCHEDULE-2026-07-08-SMN-OPEN",
      },
    },
    create: {
      id: scheduleId,
      tenantId: ids.tenantId,
      companyId: ids.companyId,
      brandId: ids.brandId,
      locationId: branchLocationId(0),
      publicReference: "WFS-2026-07-08-SMN-OPEN",
      scheduleDate: new Date("2026-07-08T00:00:00.000Z"),
      shiftType: "OPENING",
      status: "PUBLISHED",
      plannedHeadcount: 5,
      assignedHeadcount: 4,
      coverageGapCount: 1,
      plannedMinutes: 2400,
      notes:
        "Opening coverage plan for yakiniku lunch setup, grill station, cashier, and storekeeping.",
      reason: "Demo branch manpower schedule foundation",
      evidenceReference: "Demo roster sheet 2026-07-08 SM North",
      idempotencyKey: "DEMO-WFS-2026-07-08-SMN-OPEN",
      sourceEventKey: "DEMO-WORKFORCE-SCHEDULE-2026-07-08-SMN-OPEN",
      createdByUserId: ids.adminUserId,
      submittedByUserId: ids.adminUserId,
      approvedByUserId: ids.approverUserId,
      publishedByUserId: ids.adminUserId,
      submittedAt: new Date("2026-07-07T07:00:00.000Z"),
      approvedAt: new Date("2026-07-07T08:00:00.000Z"),
      publishedAt: new Date("2026-07-07T08:30:00.000Z"),
    },
    update: {
      status: "PUBLISHED",
      plannedHeadcount: 5,
      assignedHeadcount: 4,
      coverageGapCount: 1,
      plannedMinutes: 2400,
      notes:
        "Opening coverage plan for yakiniku lunch setup, grill station, cashier, and storekeeping.",
      evidenceReference: "Demo roster sheet 2026-07-08 SM North",
      approvedByUserId: ids.approverUserId,
      publishedByUserId: ids.adminUserId,
      approvedAt: new Date("2026-07-07T08:00:00.000Z"),
      publishedAt: new Date("2026-07-07T08:30:00.000Z"),
    },
  });

  await prisma.workforceScheduleLine.deleteMany({
    where: { workforceScheduleId: scheduleId },
  });
  await prisma.workforceScheduleLine.createMany({
    data: [
      {
        id: "10000000-0000-4000-8000-000000007101",
        tenantId: ids.tenantId,
        companyId: ids.companyId,
        workforceScheduleId: scheduleId,
        locationId: branchLocationId(0),
        brandId: ids.brandId,
        employeeId: "10000000-0000-4000-8000-000000001001",
        lineNumber: 1,
        stationCode: "STOREKEEPING",
        roleLabel: "Storekeeper",
        plannedStartAt: new Date("2026-07-08T01:00:00.000Z"),
        plannedEndAt: new Date("2026-07-08T10:00:00.000Z"),
        plannedMinutes: 540,
        status: "ASSIGNED",
        createdByUserId: ids.adminUserId,
      },
      {
        id: "10000000-0000-4000-8000-000000007102",
        tenantId: ids.tenantId,
        companyId: ids.companyId,
        workforceScheduleId: scheduleId,
        locationId: branchLocationId(0),
        brandId: ids.brandId,
        employeeId: "10000000-0000-4000-8000-000000001002",
        lineNumber: 2,
        stationCode: "FLOOR",
        roleLabel: "Shift Lead",
        plannedStartAt: new Date("2026-07-08T02:00:00.000Z"),
        plannedEndAt: new Date("2026-07-08T11:00:00.000Z"),
        plannedMinutes: 540,
        status: "ASSIGNED",
        createdByUserId: ids.adminUserId,
      },
      {
        id: "10000000-0000-4000-8000-000000007103",
        tenantId: ids.tenantId,
        companyId: ids.companyId,
        workforceScheduleId: scheduleId,
        locationId: branchLocationId(0),
        brandId: ids.brandId,
        lineNumber: 3,
        stationCode: "GRILL",
        roleLabel: "Grill Cook",
        plannedStartAt: new Date("2026-07-08T02:00:00.000Z"),
        plannedEndAt: new Date("2026-07-08T10:00:00.000Z"),
        plannedMinutes: 480,
        status: "GAP",
        coverageGapReason: "Need one trained grill cook for lunch peak.",
        evidenceReference: "Branch roster gap note 2026-07-08",
        createdByUserId: ids.adminUserId,
      },
      {
        id: "10000000-0000-4000-8000-000000007104",
        tenantId: ids.tenantId,
        companyId: ids.companyId,
        workforceScheduleId: scheduleId,
        locationId: branchLocationId(0),
        brandId: ids.brandId,
        lineNumber: 4,
        stationCode: "CASHIER",
        roleLabel: "Cashier",
        plannedStartAt: new Date("2026-07-08T02:00:00.000Z"),
        plannedEndAt: new Date("2026-07-08T09:00:00.000Z"),
        plannedMinutes: 420,
        status: "COVERED",
        createdByUserId: ids.adminUserId,
      },
      {
        id: "10000000-0000-4000-8000-000000007105",
        tenantId: ids.tenantId,
        companyId: ids.companyId,
        workforceScheduleId: scheduleId,
        locationId: branchLocationId(0),
        brandId: ids.brandId,
        lineNumber: 5,
        stationCode: "PREP",
        roleLabel: "Kitchen Prep",
        plannedStartAt: new Date("2026-07-08T00:00:00.000Z"),
        plannedEndAt: new Date("2026-07-08T07:00:00.000Z"),
        plannedMinutes: 420,
        status: "COVERED",
        createdByUserId: ids.adminUserId,
      },
    ],
  });

  const attendanceBatchId = "10000000-0000-4000-8000-000000008001";
  await prisma.attendanceImportBatch.upsert({
    where: {
      tenantId_companyId_idempotencyKey: {
        tenantId: ids.tenantId,
        companyId: ids.companyId,
        idempotencyKey: "DEMO-ATT-IMPORT-2026-07-08-SMN-001",
      },
    },
    create: {
      id: attendanceBatchId,
      tenantId: ids.tenantId,
      companyId: ids.companyId,
      brandId: ids.brandId,
      locationId: branchLocationId(0),
      publicReference: "ATT-IMP-2026-07-08-SMN-001",
      businessDate: new Date("2026-07-08T00:00:00.000Z"),
      sourceType: "DEMO_BIOMETRIC_EXPORT",
      sourceReference: "SMN-bio-export-2026-07-08.csv",
      sourceFileReference: "demo://attendance/SMN-bio-export-2026-07-08.csv",
      status: "EXCEPTION_LIST",
      rowCount: 4,
      acceptedCount: 3,
      exceptionCount: 1,
      duplicateCount: 0,
      validationSummary: {
        acceptedRows: 3,
        exceptions: ["One source row has an unmatched employee code."],
      },
      evidenceReference: "Imported biometric export for demo only",
      idempotencyKey: "DEMO-ATT-IMPORT-2026-07-08-SMN-001",
      createdByUserId: ids.adminUserId,
      reviewedByUserId: ids.approverUserId,
      importedAt: new Date("2026-07-08T12:30:00.000Z"),
      reviewedAt: new Date("2026-07-08T13:00:00.000Z"),
    },
    update: {
      status: "EXCEPTION_LIST",
      rowCount: 4,
      acceptedCount: 3,
      exceptionCount: 1,
      duplicateCount: 0,
      validationSummary: {
        acceptedRows: 3,
        exceptions: ["One source row has an unmatched employee code."],
      },
      reviewedByUserId: ids.approverUserId,
      reviewedAt: new Date("2026-07-08T13:00:00.000Z"),
    },
  });

  await prisma.attendanceImportLine.deleteMany({
    where: { attendanceImportBatchId: attendanceBatchId },
  });
  await prisma.attendanceImportLine.createMany({
    data: [
      {
        id: "10000000-0000-4000-8000-000000008101",
        tenantId: ids.tenantId,
        companyId: ids.companyId,
        attendanceImportBatchId: attendanceBatchId,
        locationId: branchLocationId(0),
        brandId: ids.brandId,
        employeeId: "10000000-0000-4000-8000-000000001001",
        sourceRowNumber: 1,
        employeeCodeRaw: "YL-EMP-0001",
        employeeNameRaw: "Bianca Reyes",
        punchInAt: new Date("2026-07-08T00:53:00.000Z"),
        punchOutAt: new Date("2026-07-08T10:05:00.000Z"),
        workMinutes: 552,
        status: "ACCEPTED",
      },
      {
        id: "10000000-0000-4000-8000-000000008102",
        tenantId: ids.tenantId,
        companyId: ids.companyId,
        attendanceImportBatchId: attendanceBatchId,
        locationId: branchLocationId(0),
        brandId: ids.brandId,
        employeeId: "10000000-0000-4000-8000-000000001002",
        sourceRowNumber: 2,
        employeeCodeRaw: "YL-EMP-0002",
        employeeNameRaw: "Alyssa Tan",
        punchInAt: new Date("2026-07-08T01:55:00.000Z"),
        punchOutAt: new Date("2026-07-08T11:04:00.000Z"),
        workMinutes: 549,
        status: "ACCEPTED",
      },
      {
        id: "10000000-0000-4000-8000-000000008103",
        tenantId: ids.tenantId,
        companyId: ids.companyId,
        attendanceImportBatchId: attendanceBatchId,
        locationId: branchLocationId(0),
        brandId: ids.brandId,
        sourceRowNumber: 3,
        employeeCodeRaw: "TEMP-GRILL-01",
        employeeNameRaw: "Temporary Grill Cover",
        punchInAt: new Date("2026-07-08T02:08:00.000Z"),
        punchOutAt: new Date("2026-07-08T09:58:00.000Z"),
        workMinutes: 470,
        status: "UNMATCHED_EMPLOYEE",
        exceptionCode: "EMPLOYEE_NOT_FOUND",
        exceptionMessage:
          "Imported row could not be matched to an active scoped employee record.",
      },
      {
        id: "10000000-0000-4000-8000-000000008104",
        tenantId: ids.tenantId,
        companyId: ids.companyId,
        attendanceImportBatchId: attendanceBatchId,
        locationId: branchLocationId(0),
        brandId: ids.brandId,
        employeeId: "10000000-0000-4000-8000-000000001001",
        sourceRowNumber: 4,
        employeeCodeRaw: "YL-EMP-0001",
        employeeNameRaw: "Bianca Reyes",
        punchInAt: new Date("2026-07-08T13:00:00.000Z"),
        punchOutAt: new Date("2026-07-08T14:00:00.000Z"),
        workMinutes: 60,
        status: "ACCEPTED",
      },
    ],
  });

  for (const [index, employee] of employees.entries()) {
    const rowNumber = String(index + 1).padStart(3, "0");
    await prisma.employeeTrainingRecord.upsert({
      where: {
        tenantId_companyId_employeeId_trainingCode: {
          tenantId: ids.tenantId,
          companyId: ids.companyId,
          employeeId: employee.id,
          trainingCode: "FOOD-SAFETY-101",
        },
      },
      create: {
        id: `10000000-0000-4000-8000-000000005${rowNumber}`,
        tenantId: ids.tenantId,
        companyId: ids.companyId,
        employeeId: employee.id,
        trainingCode: "FOOD-SAFETY-101",
        trainingName: "Food Safety and Grill Handling",
        provider: "One Gourmet Training Team",
        completedAt: new Date("2026-06-15T00:00:00.000Z"),
        validUntil: new Date(
          index === 2
            ? "2026-07-01T00:00:00.000Z"
            : "2027-06-15T00:00:00.000Z",
        ),
        status: index === 2 ? "EXPIRED" : "COMPLETED",
        requiredForScope: true,
        createdByUserId: ids.adminUserId,
      },
      update: {
        trainingName: "Food Safety and Grill Handling",
        status: index === 2 ? "EXPIRED" : "COMPLETED",
        validUntil: new Date(
          index === 2
            ? "2026-07-01T00:00:00.000Z"
            : "2027-06-15T00:00:00.000Z",
        ),
        requiredForScope: true,
        updatedByUserId: ids.adminUserId,
      },
    });

    await prisma.employeeComplianceDocument.upsert({
      where: {
        id: `10000000-0000-4000-8000-000000006${rowNumber}`,
      },
      create: {
        id: `10000000-0000-4000-8000-000000006${rowNumber}`,
        tenantId: ids.tenantId,
        companyId: ids.companyId,
        employeeId: employee.id,
        documentType: "HEALTH_CERT",
        status: index === 5 ? "EXPIRED" : "ACTIVE",
        issuedAt: new Date("2026-01-10T00:00:00.000Z"),
        expiryAt: new Date(
          index === 5
            ? "2026-07-01T00:00:00.000Z"
            : "2027-01-10T00:00:00.000Z",
        ),
        issuedBy: "City Health Office",
        isMandatoryForRole: true,
        notes:
          "Demo health certificate readiness record; document number intentionally omitted.",
        createdByUserId: ids.adminUserId,
      },
      update: {
        status: index === 5 ? "EXPIRED" : "ACTIVE",
        expiryAt: new Date(
          index === 5
            ? "2026-07-01T00:00:00.000Z"
            : "2027-01-10T00:00:00.000Z",
        ),
        isMandatoryForRole: true,
        updatedByUserId: ids.adminUserId,
      },
    });
  }
}

async function seedProjectMigrationRehearsalData() {
  const projectId = "10000000-0000-4000-8000-000000009001";
  const taskId = "10000000-0000-4000-8000-000000009002";
  const requirementId = "10000000-0000-4000-8000-000000009003";
  const attachmentId = "10000000-0000-4000-8000-000000009004";
  const projectAttachmentId = "10000000-0000-4000-8000-000000009005";
  const recordLinkId = "10000000-0000-4000-8000-000000009006";
  const department = await prisma.department.findFirstOrThrow({
    where: { tenantId: ids.tenantId, companyId: ids.companyId },
    select: { id: true },
  });
  const costCenter = await prisma.costCenter.upsert({
    where: { id: "10000000-0000-4000-8000-000000009007" },
    create: {
      id: "10000000-0000-4000-8000-000000009007",
      tenantId: ids.tenantId,
      companyId: ids.companyId,
      departmentId: department.id,
      code: "MIGRATION-REHEARSAL",
      name: "Migration Rehearsal Cost Center",
    },
    update: {
      departmentId: department.id,
      status: "ACTIVE",
    },
    select: { id: true },
  });

  await prisma.project.upsert({
    where: { id: projectId },
    create: {
      id: projectId,
      tenantId: ids.tenantId,
      companyId: ids.companyId,
      code: "MIGRATION-REHEARSAL",
      name: "Migration safety rehearsal fixture",
      status: "ACTIVE",
      projectType: "ERP_IMPLEMENTATION",
      brandId: ids.brandId,
      locationId: ids.locationId,
      departmentId: department.id,
      costCenterId: costCenter.id,
      sponsorUserId: ids.approverUserId,
      managerUserId: ids.adminUserId,
      isRestricted: true,
      description:
        "Representative scoped project used by the disposable migration-safety rehearsal.",
      createdByUserId: ids.adminUserId,
      updatedByUserId: ids.adminUserId,
    },
    update: {
      brandId: ids.brandId,
      locationId: ids.locationId,
      departmentId: department.id,
      costCenterId: costCenter.id,
      sponsorUserId: ids.approverUserId,
      managerUserId: ids.adminUserId,
      status: "ACTIVE",
      updatedByUserId: ids.adminUserId,
    },
  });

  await prisma.projectTask.upsert({
    where: { id: taskId },
    create: {
      id: taskId,
      tenantId: ids.tenantId,
      companyId: ids.companyId,
      projectId,
      taskKey: "MIGRATION-SAFETY-001",
      title: "Verify scoped project requirement migration",
      status: "IN_PROGRESS",
      priority: "HIGH",
      ownerUserId: ids.adminUserId,
      createdByUserId: ids.adminUserId,
      updatedByUserId: ids.adminUserId,
    },
    update: {
      projectId,
      ownerUserId: ids.adminUserId,
      status: "IN_PROGRESS",
      updatedByUserId: ids.adminUserId,
    },
  });

  await prisma.projectRequirement.upsert({
    where: { id: requirementId },
    create: {
      id: requirementId,
      tenantId: ids.tenantId,
      companyId: ids.companyId,
      projectId,
      taskId,
      kind: "EVIDENCE",
      code: "MIGRATION-SAFETY-EVIDENCE",
      label: "Scoped migration evidence",
      evidenceType: "DATABASE_REHEARSAL",
      evidenceNote: "Fixture proves composite project and task scope survives upgrade.",
      ownerUserId: ids.adminUserId,
      reviewerUserId: ids.approverUserId,
      status: "SUBMITTED",
      submittedAt: new Date("2026-07-21T00:00:00.000Z"),
      submittedByUserId: ids.adminUserId,
      createdByUserId: ids.adminUserId,
      updatedByUserId: ids.adminUserId,
    },
    update: {
      projectId,
      taskId,
      ownerUserId: ids.adminUserId,
      reviewerUserId: ids.approverUserId,
      status: "SUBMITTED",
      updatedByUserId: ids.adminUserId,
    },
  });

  await prisma.attachment.upsert({
    where: { id: attachmentId },
    create: {
      id: attachmentId,
      tenantId: ids.tenantId,
      storageProvider: "REHEARSAL_FIXTURE",
      objectKey: "migration-safety/scoped-requirement-evidence.txt",
      originalFilename: "scoped-requirement-evidence.txt",
      mimeType: "text/plain",
      sizeBytes: 64,
      checksum: "migration-rehearsal-fixture",
      uploadedByUserId: ids.adminUserId,
    },
    update: {
      objectKey: "migration-safety/scoped-requirement-evidence.txt",
      checksum: "migration-rehearsal-fixture",
      status: "ACTIVE",
    },
  });

  await prisma.projectAttachment.upsert({
    where: { id: projectAttachmentId },
    create: {
      id: projectAttachmentId,
      tenantId: ids.tenantId,
      companyId: ids.companyId,
      projectId,
      taskId,
      requirementId,
      attachmentId,
      purpose: "EVIDENCE",
      caption: "Scoped requirement migration rehearsal evidence",
      createdByUserId: ids.adminUserId,
    },
    update: {
      projectId,
      taskId,
      requirementId,
      attachmentId,
      status: "ACTIVE",
    },
  });

  await prisma.projectRecordLink.upsert({
    where: { id: recordLinkId },
    create: {
      id: recordLinkId,
      tenantId: ids.tenantId,
      companyId: ids.companyId,
      projectId,
      taskId,
      requirementId,
      sourceRecordType: "INVENTORY_BALANCE",
      sourceRecordId: requirementId,
      relationType: "EVIDENCE_FOR",
      linkLabel: "Migration safety requirement",
      createdByUserId: ids.adminUserId,
      updatedByUserId: ids.adminUserId,
    },
    update: {
      projectId,
      taskId,
      requirementId,
      sourceRecordId: requirementId,
      archivedAt: null,
      updatedByUserId: ids.adminUserId,
    },
  });
}

const demoBranchLocations = [
  {
    id: ids.locationId,
    inventoryLocationId: ids.inventoryLocationId,
    code: "YL-SM-NORTH",
    inventoryCode: "YL-SM-NORTH-STOCK",
    name: "Yakiniku Like SM North Edsa",
    address: "SM City North EDSA, Quezon City",
  },
  {
    id: "10000000-0000-4000-8000-000000000601",
    inventoryLocationId: "10000000-0000-4000-8000-000000000701",
    code: "YL-MOA",
    inventoryCode: "YL-MOA-STOCK",
    name: "Yakiniku Like SM Mall of Asia",
    address: "SM Mall of Asia, Pasay City",
  },
  {
    id: "10000000-0000-4000-8000-000000000602",
    inventoryLocationId: "10000000-0000-4000-8000-000000000702",
    code: "YL-MEGAMALL",
    inventoryCode: "YL-MEGAMALL-STOCK",
    name: "Yakiniku Like SM Mega Mall",
    address: "SM Megamall, Mandaluyong City",
  },
  {
    id: "10000000-0000-4000-8000-000000000603",
    inventoryLocationId: "10000000-0000-4000-8000-000000000703",
    code: "YL-GLORIETTA",
    inventoryCode: "YL-GLORIETTA-STOCK",
    name: "Yakiniku Like Glorietta",
    address: "Glorietta, Makati City",
  },
  {
    id: "10000000-0000-4000-8000-000000000604",
    inventoryLocationId: "10000000-0000-4000-8000-000000000704",
    code: "YL-SM-JMALL",
    inventoryCode: "YL-SM-JMALL-STOCK",
    name: "Yakiniku Like SM JMall",
    address: "SM JMall, Mandaue City",
  },
  {
    id: "10000000-0000-4000-8000-000000000605",
    inventoryLocationId: "10000000-0000-4000-8000-000000000705",
    code: "YL-SM-CEBU",
    inventoryCode: "YL-SM-CEBU-STOCK",
    name: "Yakiniku Like SM City Cebu",
    address: "SM City Cebu, Cebu City",
  },
];

async function existingRolePermissionRows(
  rows: { roleId: string; permissionId: string }[],
) {
  const permissions = await prisma.permission.findMany({
    where: {
      id: {
        in: Array.from(new Set(rows.map((row) => row.permissionId))),
      },
    },
    select: { id: true },
  });
  const permissionIds = new Set(permissions.map((permission) => permission.id));
  return rows.filter((row) => permissionIds.has(row.permissionId));
}

async function resetDemoData() {
  await prisma.attendanceImportLine.deleteMany({ where: { companyId: ids.companyId } });
  await prisma.attendanceImportBatch.deleteMany({ where: { companyId: ids.companyId } });
  await prisma.workforceScheduleLine.deleteMany({ where: { companyId: ids.companyId } });
  await prisma.workforceSchedule.deleteMany({ where: { companyId: ids.companyId } });
  await prisma.employeeComplianceDocument.deleteMany({ where: { companyId: ids.companyId } });
  await prisma.employeeTrainingRecord.deleteMany({ where: { companyId: ids.companyId } });
  await prisma.employeeOvertimeRecord.deleteMany({ where: { companyId: ids.companyId } });
  await prisma.employeeLeaveRequest.deleteMany({ where: { companyId: ids.companyId } });
  await prisma.employeeAssignment.deleteMany({ where: { companyId: ids.companyId } });
  await prisma.employee.deleteMany({ where: { companyId: ids.companyId } });
  await prisma.paymentReleaseExecution.deleteMany({ where: { companyId: ids.companyId } });
  await prisma.paymentReleaseAllocation.deleteMany({ where: { companyId: ids.companyId } });
  await prisma.paymentRelease.deleteMany({ where: { companyId: ids.companyId } });
  await prisma.bankReconciliationMatch.deleteMany({
    where: { companyId: ids.companyId },
  });
  await prisma.bankReconciliation.deleteMany({ where: { companyId: ids.companyId } });
  await prisma.bankStatementLine.deleteMany({ where: { companyId: ids.companyId } });
  await prisma.bankStatement.deleteMany({ where: { companyId: ids.companyId } });
  await prisma.branchCashDeposit.deleteMany({ where: { companyId: ids.companyId } });
  await prisma.bankAccount.deleteMany({ where: { companyId: ids.companyId } });
  await prisma.paymentRequestLine.deleteMany({ where: { companyId: ids.companyId } });
  await prisma.paymentRequest.deleteMany({ where: { companyId: ids.companyId } });
  await prisma.apInvoiceDuplicateSignal.deleteMany({
    where: { companyId: ids.companyId },
  });
  await prisma.apInvoiceException.deleteMany({ where: { companyId: ids.companyId } });
  await prisma.apInvoiceMatchResult.deleteMany({ where: { companyId: ids.companyId } });
  await prisma.apInvoiceLine.deleteMany({ where: { companyId: ids.companyId } });
  await prisma.apInvoice.deleteMany({ where: { companyId: ids.companyId } });
  await prisma.expenseRequestSourceLink.deleteMany({
    where: { companyId: ids.companyId },
  });
  await prisma.expenseRequestLine.deleteMany({ where: { companyId: ids.companyId } });
  await prisma.expenseRequest.deleteMany({ where: { companyId: ids.companyId } });
  await prisma.budgetCommitment.deleteMany({ where: { companyId: ids.companyId } });
  await prisma.budgetRevision.deleteMany({ where: { companyId: ids.companyId } });
  await prisma.budgetLine.deleteMany({ where: { companyId: ids.companyId } });
  await prisma.budget.deleteMany({ where: { companyId: ids.companyId } });
  await prisma.financeJournalPostingAttempt.deleteMany({
    where: { companyId: ids.companyId },
  });
  await prisma.financeJournalLine.deleteMany({ where: { companyId: ids.companyId } });
  await prisma.financeJournal.deleteMany({ where: { companyId: ids.companyId } });
  await prisma.financePostingRuleDimensionRequirement.deleteMany({
    where: { companyId: ids.companyId },
  });
  await prisma.financePostingRuleAccountMap.deleteMany({
    where: { companyId: ids.companyId },
  });
  await prisma.financePostingRule.deleteMany({ where: { companyId: ids.companyId } });
  await prisma.chartOfAccount.deleteMany({ where: { companyId: ids.companyId } });
  await prisma.financeAccountClass.deleteMany({ where: { companyId: ids.companyId } });
  await prisma.accountingPeriod.deleteMany({ where: { companyId: ids.companyId } });
  await prisma.fiscalYear.deleteMany({ where: { companyId: ids.companyId } });

  await prisma.projectRecordLink.deleteMany({ where: { companyId: ids.companyId } });
  await prisma.projectRisk.deleteMany({ where: { companyId: ids.companyId } });
  await prisma.projectBlocker.deleteMany({ where: { companyId: ids.companyId } });
  await prisma.projectAttachment.deleteMany({ where: { companyId: ids.companyId } });
  await prisma.projectRequirement.deleteMany({ where: { companyId: ids.companyId } });
  await prisma.projectComment.deleteMany({ where: { companyId: ids.companyId } });
  await prisma.projectTaskChecklistItem.deleteMany({ where: { companyId: ids.companyId } });
  await prisma.projectTaskAssignee.deleteMany({ where: { companyId: ids.companyId } });
  await prisma.projectMilestone.deleteMany({ where: { companyId: ids.companyId } });
  await prisma.projectActivityEvent.deleteMany({ where: { companyId: ids.companyId } });
  await prisma.projectTask.deleteMany({ where: { companyId: ids.companyId } });
  await prisma.projectMember.deleteMany({ where: { companyId: ids.companyId } });
  await prisma.project.deleteMany({ where: { companyId: ids.companyId } });
  await prisma.projectTemplate.deleteMany({ where: { companyId: ids.companyId } });

  await prisma.branchOperationalChecklistLine.deleteMany({
    where: { companyId: ids.companyId },
  });
  await prisma.branchOperationalChecklist.deleteMany({
    where: { companyId: ids.companyId },
  });
  await prisma.foodSafetyReading.deleteMany({
    where: { companyId: ids.companyId },
  });
  await prisma.foodSafetyLog.deleteMany({
    where: { companyId: ids.companyId },
  });
  await prisma.operationalIncident.deleteMany({
    where: { companyId: ids.companyId },
  });
  await prisma.maintenanceTicket.deleteMany({
    where: { companyId: ids.companyId },
  });
  await prisma.menuPrice.deleteMany({ where: { companyId: ids.companyId } });
  await prisma.restaurantSalesImportLine.deleteMany({
    where: { companyId: ids.companyId },
  });
  await prisma.restaurantSalesImportBatch.deleteMany({
    where: { companyId: ids.companyId },
  });
  await prisma.menuItem.deleteMany({ where: { companyId: ids.companyId } });
  await prisma.recipeLine.deleteMany({ where: { companyId: ids.companyId } });
  await prisma.recipeVersion.deleteMany({ where: { companyId: ids.companyId } });
  await prisma.recipe.deleteMany({ where: { companyId: ids.companyId } });

  await prisma.approvalInstanceStep.deleteMany({
    where: { approvalInstance: { companyId: ids.companyId } },
  });
  await prisma.approvalInstance.deleteMany({ where: { companyId: ids.companyId } });
  await prisma.notification.deleteMany({ where: { companyId: ids.companyId } });

  await prisma.goodsReceiptLine.deleteMany({ where: { companyId: ids.companyId } });
  await prisma.goodsReceipt.deleteMany({ where: { companyId: ids.companyId } });
  await prisma.inventoryTransferReceiptLine.deleteMany({
    where: { companyId: ids.companyId },
  });
  await prisma.inventoryTransferReceipt.deleteMany({
    where: { companyId: ids.companyId },
  });
  await prisma.inventoryTransferLine.deleteMany({ where: { companyId: ids.companyId } });
  await prisma.inventoryTransfer.deleteMany({ where: { companyId: ids.companyId } });
  await prisma.wastageLine.deleteMany({ where: { companyId: ids.companyId } });
  await prisma.wastageReport.deleteMany({ where: { companyId: ids.companyId } });
  await prisma.stockAdjustmentLine.deleteMany({ where: { companyId: ids.companyId } });
  await prisma.stockAdjustment.deleteMany({ where: { companyId: ids.companyId } });
  await prisma.stockCountLine.deleteMany({ where: { companyId: ids.companyId } });
  await prisma.stockCountSession.deleteMany({ where: { companyId: ids.companyId } });
  await prisma.inventoryMovement.deleteMany({ where: { companyId: ids.companyId } });
  await prisma.inventoryBalance.deleteMany({ where: { companyId: ids.companyId } });

  await prisma.purchaseOrderBalanceClosure.deleteMany({
    where: { companyId: ids.companyId },
  });
  await prisma.purchaseOrderAmendment.deleteMany({ where: { companyId: ids.companyId } });
  await prisma.purchaseOrderLine.deleteMany({ where: { companyId: ids.companyId } });
  await prisma.purchaseOrder.deleteMany({ where: { companyId: ids.companyId } });
  await prisma.quotationRecommendation.deleteMany({ where: { companyId: ids.companyId } });
  await prisma.supplierQuotationLine.deleteMany({
    where: { supplierQuotation: { companyId: ids.companyId } },
  });
  await prisma.supplierQuotation.deleteMany({ where: { companyId: ids.companyId } });
  await prisma.quotationRequest.deleteMany({ where: { companyId: ids.companyId } });
  await prisma.purchaseRequestComment.deleteMany({ where: { companyId: ids.companyId } });
  await prisma.purchaseRequestLine.deleteMany({
    where: { purchaseRequest: { companyId: ids.companyId } },
  });
  await prisma.purchaseRequest.deleteMany({ where: { companyId: ids.companyId } });

  await prisma.auditEvent.deleteMany({ where: { companyId: ids.companyId } });
  await prisma.operationalReasonCode.deleteMany({ where: { companyId: ids.companyId } });
  await prisma.supplierPriceHistory.deleteMany({ where: { companyId: ids.companyId } });
  await prisma.supplierItemLink.deleteMany({ where: { companyId: ids.companyId } });
  await prisma.supplierContact.deleteMany({
    where: { supplier: { companyId: ids.companyId } },
  });
  await prisma.supplier.deleteMany({ where: { companyId: ids.companyId } });
  await prisma.itemUomConversion.deleteMany({
    where: { item: { companyId: ids.companyId } },
  });
  await prisma.item.deleteMany({ where: { companyId: ids.companyId } });
  await prisma.itemCategory.deleteMany({ where: { companyId: ids.companyId } });
  await prisma.uom.deleteMany({ where: { companyId: ids.companyId } });
}

async function seedOperationalReasonCodes() {
  const reasonCodes = [
    {
      workflow: "STOCK_ADJUSTMENT",
      code: "OPENING_BALANCE",
      label: "Opening balance cutover",
      appliesTo: "OPENING_BALANCE",
      requiresEvidence: true,
      sortOrder: 10,
      notes: "Initial stock entry supported by signed count sheet or import file.",
    },
    {
      workflow: "STOCK_ADJUSTMENT",
      code: "COUNT_VARIANCE",
      label: "Approved count variance",
      appliesTo: "INCREASE,DECREASE",
      requiresEvidence: true,
      sortOrder: 20,
      notes: "Difference confirmed during a stock count review.",
    },
    {
      workflow: "STOCK_ADJUSTMENT",
      code: "SYSTEM_CORRECTION",
      label: "System correction",
      appliesTo: "INCREASE,DECREASE",
      requiresEvidence: true,
      sortOrder: 30,
      notes: "Correction for documented encoding or migration issue.",
    },
    {
      workflow: "STOCK_ADJUSTMENT",
      code: "SUPPLIER_CREDIT_RETURN",
      label: "Supplier credit or return correction",
      appliesTo: "DECREASE",
      requiresEvidence: true,
      sortOrder: 40,
      notes: "Inventory decrease tied to approved supplier return evidence.",
    },
    {
      workflow: "WASTAGE",
      code: "SPOILAGE_EXPIRY",
      label: "Spoilage or expired item",
      appliesTo: "FOOD",
      requiresEvidence: true,
      sortOrder: 10,
      notes: "Expired, spoiled, or quality-failed food item.",
    },
    {
      workflow: "WASTAGE",
      code: "PREP_TRIM_LOSS",
      label: "Preparation trim loss",
      appliesTo: "FOOD",
      requiresEvidence: false,
      sortOrder: 20,
      notes: "Normal trim loss from prep with quantity control.",
    },
    {
      workflow: "WASTAGE",
      code: "KITCHEN_ERROR",
      label: "Kitchen preparation error",
      appliesTo: "FOOD",
      requiresEvidence: true,
      sortOrder: 30,
      notes: "Batch or station error requiring management review.",
    },
    {
      workflow: "WASTAGE",
      code: "DAMAGED_PACKAGING",
      label: "Damaged packaging or storage handling",
      appliesTo: "FOOD,PACKAGING",
      requiresEvidence: true,
      sortOrder: 40,
      notes: "Damaged in storage, handling, or internal movement.",
    },
  ];

  for (const reason of reasonCodes) {
    await prisma.operationalReasonCode.upsert({
      where: {
        companyId_workflow_code: {
          companyId: ids.companyId,
          workflow: reason.workflow,
          code: reason.code,
        },
      },
      create: {
        tenantId: ids.tenantId,
        companyId: ids.companyId,
        ...reason,
      },
      update: {
        label: reason.label,
        appliesTo: reason.appliesTo,
        requiresEvidence: reason.requiresEvidence,
        sortOrder: reason.sortOrder,
        notes: reason.notes,
        status: "ACTIVE",
      },
    });
  }
}

async function seedPhase2WorkflowTransitionPolicies() {
  for (const policy of phase2WorkflowPolicySeedRows) {
    await prisma.workflowTransitionPolicy.upsert({
      where: {
        domain_action_fromStatus: {
          domain: policy.domain,
          action: policy.action,
          fromStatus: policy.fromStatus,
        },
      },
      create: policy,
      update: {
        toStatus: policy.toStatus,
        permissionCode: policy.permissionCode,
        requiresReason: policy.requiresReason,
        requiresEvidence: policy.requiresEvidence,
        blocksSelfApproval: policy.blocksSelfApproval,
        terminal: policy.terminal,
        active: policy.active,
      },
    });
  }
}

async function seedRestaurantDemoCatalog() {
  const uoms = [
    { code: "EA", name: "Each", type: "count", precision: 0 },
    { code: "BTL", name: "Bottle", type: "count", precision: 0 },
    { code: "BAG", name: "Bag", type: "count", precision: 0 },
    { code: "BUNCH", name: "Bunch", type: "count", precision: 0 },
    { code: "PACK", name: "Pack", type: "count", precision: 0 },
    { code: "TRAY", name: "Tray", type: "count", precision: 0 },
    { code: "SACK", name: "Sack", type: "count", precision: 0 },
    { code: "L", name: "Liter", type: "volume", precision: 3 },
    { code: "ML", name: "Milliliter", type: "volume", precision: 0 },
    { code: "CASE", name: "Case", type: "count", precision: 0 },
    { code: "ROLL", name: "Roll", type: "count", precision: 0 },
    { code: "TUB", name: "Tub", type: "count", precision: 0 },
    { code: "SET", name: "Menu Set", type: "count", precision: 0 },
  ];
  const uomByCode = new Map<string, string>([
    ["KG", ids.kilogramUomId],
    ["G", ids.gramUomId],
  ]);

  for (const uom of uoms) {
    const record = await prisma.uom.upsert({
      where: {
        companyId_uomCode: {
          companyId: ids.companyId,
          uomCode: uom.code,
        },
      },
      create: {
        tenantId: ids.tenantId,
        companyId: ids.companyId,
        uomCode: uom.code,
        uomName: uom.name,
        uomType: uom.type,
        decimalPrecision: uom.precision,
      },
      update: {
        uomName: uom.name,
        uomType: uom.type,
        decimalPrecision: uom.precision,
        status: "ACTIVE",
      },
    });
    uomByCode.set(uom.code, record.id);
  }

  const categories = [
    {
      code: "BEEF-YAKINIKU",
      name: "Beef Cuts for Yakiniku",
      inventoryClass: "food",
      expiry: true,
      lot: true,
      photo: true,
    },
    {
      code: "PORK-YAKINIKU",
      name: "Pork Cuts for Grill",
      inventoryClass: "food",
      expiry: true,
      lot: true,
      photo: true,
    },
    {
      code: "PROTEIN-FRESH",
      name: "Chicken, Seafood, and Eggs",
      inventoryClass: "food",
      expiry: true,
      lot: true,
      photo: true,
    },
    {
      code: "DRY-GOODS",
      name: "Dry Goods and Staples",
      inventoryClass: "food",
      expiry: true,
      lot: true,
      photo: false,
    },
    {
      code: "DAIRY-CHILLED",
      name: "Dairy and Chilled Goods",
      inventoryClass: "food",
      expiry: true,
      lot: true,
      photo: true,
    },
    {
      code: "SAUCE-CONDIMENT",
      name: "Sauces, Marinades, and Condiments",
      inventoryClass: "food",
      expiry: true,
      lot: true,
      photo: false,
    },
    {
      code: "BEVERAGE",
      name: "Beverages",
      inventoryClass: "food",
      expiry: true,
      lot: true,
      photo: false,
    },
    {
      code: "PACKAGING",
      name: "Packaging and Disposables",
      inventoryClass: "packaging",
      expiry: false,
      lot: false,
      photo: false,
    },
    {
      code: "GRILL-SUPPLIES",
      name: "Grill Supplies and Cleaning",
      inventoryClass: "supplies",
      expiry: false,
      lot: false,
      photo: false,
    },
    {
      code: "MENU-ITEMS",
      name: "Menu and Recipe Placeholders",
      inventoryClass: "menu",
      expiry: false,
      lot: false,
      photo: false,
    },
  ];
  const categoryByCode = new Map<string, string>([[ "PRODUCE-FRESH", ids.itemCategoryId ]]);

  for (const category of categories) {
    const record = await prisma.itemCategory.upsert({
      where: {
        companyId_categoryCode: {
          companyId: ids.companyId,
          categoryCode: category.code,
        },
      },
      create: {
        tenantId: ids.tenantId,
        companyId: ids.companyId,
        categoryCode: category.code,
        categoryName: category.name,
        inventoryClass: category.inventoryClass,
        requiresExpiryTracking: category.expiry,
        requiresLotTracking: category.lot,
        defaultWastageRequiresPhoto: category.photo,
      },
      update: {
        categoryName: category.name,
        inventoryClass: category.inventoryClass,
        requiresExpiryTracking: category.expiry,
        requiresLotTracking: category.lot,
        defaultWastageRequiresPhoto: category.photo,
        status: "ACTIVE",
      },
    });
    categoryByCode.set(category.code, record.id);
  }

  const suppliers = [
    {
      code: "OGF-BEEF-PRIME",
      legalName: "Prime Cut Foods Corporation",
      tradingName: "Prime Cut Beef",
      paymentTerms: "Net 7 after cold-chain receiving",
      contact: {
        name: "Rafael Ong",
        role: "Meat Program Lead",
        email: "rafael.ong@primecut.example",
        phone: "+63-917-555-0201",
      },
    },
    {
      code: "KOBEYA-MEATS",
      legalName: "Kobeya Meat Trading Inc.",
      tradingName: "Kobeya Meats",
      paymentTerms: "Net 7 after verified receiving",
      contact: {
        name: "Hana Sato",
        role: "Yakiniku Cuts Specialist",
        email: "hana.sato@kobeyameats.example",
        phone: "+63-917-555-0202",
      },
    },
    {
      code: "CENTRAL-BUTCHERY",
      legalName: "Central Butchery Philippines Corporation",
      tradingName: "Central Butchery",
      paymentTerms: "Net 10 after inspected receiving",
      contact: {
        name: "Miguel Dizon",
        role: "Key Account Manager",
        email: "miguel.dizon@centralbutchery.example",
        phone: "+63-917-555-0203",
      },
    },
    {
      code: "LUZON-POULTRY",
      legalName: "Luzon Poultry and Meats Corporation",
      tradingName: "Luzon Poultry",
      paymentTerms: "Net 7 after verified receiving",
      contact: {
        name: "Carlo Navarro",
        role: "Sales Coordinator",
        email: "carlo.navarro@luzonpoultry.example",
        phone: "+63-917-555-0191",
      },
    },
    {
      code: "TOKYO-SEAFOOD",
      legalName: "Tokyo Bay Seafood Trading Corporation",
      tradingName: "Tokyo Bay Seafood",
      paymentTerms: "Net 7 after receiving",
      contact: {
        name: "Ken Watanabe",
        role: "Seafood Account Lead",
        email: "ken.watanabe@tokyobayseafood.example",
        phone: "+63-917-555-0204",
      },
    },
    {
      code: "SAKURA-RICE",
      legalName: "Sakura Rice and Grains Inc.",
      tradingName: "Sakura Rice",
      paymentTerms: "Net 15 after delivery",
      contact: {
        name: "Naomi Cruz",
        role: "Grains Sales Lead",
        email: "naomi.cruz@sakurarice.example",
        phone: "+63-917-555-0205",
      },
    },
    {
      code: "PACIFIC-PANTRY",
      legalName: "Pacific Pantry Dry Goods Inc.",
      tradingName: "Pacific Pantry",
      paymentTerms: "Net 15 after verified receiving",
      contact: {
        name: "Jessa Lim",
        role: "Account Specialist",
        email: "jessa.lim@pacificpantry.example",
        phone: "+63-917-555-0192",
      },
    },
    {
      code: "MARU-SAUCE",
      legalName: "Maru Japanese Sauces Corporation",
      tradingName: "Maru Sauces",
      paymentTerms: "Net 15 after receiving",
      contact: {
        name: "Erika Tan",
        role: "Condiments Specialist",
        email: "erika.tan@marusauce.example",
        phone: "+63-917-555-0206",
      },
    },
    {
      code: "FRESHFARM-MNL",
      legalName: "FreshFarm Produce Trading Corporation",
      tradingName: "FreshFarm Manila",
      paymentTerms: "Net 15 after verified receiving",
      contact: {
        name: "Mara Santos",
        role: "Key Account Manager",
        email: "mara.santos@freshfarm.example",
        phone: "+63-917-555-0184",
      },
    },
    {
      code: "MANILA-DAIRY",
      legalName: "Manila Dairy and Chilled Goods Inc.",
      tradingName: "Manila Dairy",
      paymentTerms: "Net 14 after verified receiving",
      contact: {
        name: "Clara Reyes",
        role: "Chilled Goods Account Manager",
        email: "clara.reyes@maniladairy.example",
        phone: "+63-917-555-0207",
      },
    },
    {
      code: "BEV-HUB",
      legalName: "Beverage Hub Distribution Inc.",
      tradingName: "Beverage Hub",
      paymentTerms: "Net 15 after delivery",
      contact: {
        name: "Marco Sy",
        role: "Beverage Channel Lead",
        email: "marco.sy@beveragehub.example",
        phone: "+63-917-555-0208",
      },
    },
    {
      code: "METRO-PACKAGING",
      legalName: "Metro Food Packaging Supplies",
      tradingName: "Metro Packaging",
      paymentTerms: "Net 30 after verified receiving",
      contact: {
        name: "Ramon Uy",
        role: "Customer Success Lead",
        email: "ramon.uy@metropackaging.example",
        phone: "+63-917-555-0193",
      },
    },
    {
      code: "GRILLPRO-SUPPLIES",
      legalName: "GrillPro Restaurant Supplies Corporation",
      tradingName: "GrillPro Supplies",
      paymentTerms: "Net 30 after delivery",
      contact: {
        name: "Lito Garcia",
        role: "Operations Supplies Lead",
        email: "lito.garcia@grillpro.example",
        phone: "+63-917-555-0209",
      },
    },
  ];
  const supplierByCode = new Map<string, string>([[ "FRESHFARM-MNL", ids.supplierId ]]);

  for (const [index, supplier] of suppliers.entries()) {
    const record = await prisma.supplier.upsert({
      where: {
        companyId_supplierCode: {
          companyId: ids.companyId,
          supplierCode: supplier.code,
        },
      },
      create: {
        tenantId: ids.tenantId,
        companyId: ids.companyId,
        supplierCode: supplier.code,
        legalName: supplier.legalName,
        tradingName: supplier.tradingName,
        accreditationStatus: "APPROVED",
        paymentTerms: supplier.paymentTerms,
      },
      update: {
        legalName: supplier.legalName,
        tradingName: supplier.tradingName,
        paymentTerms: supplier.paymentTerms,
        status: "ACTIVE",
        accreditationStatus: "APPROVED",
      },
    });
    supplierByCode.set(supplier.code, record.id);

    await prisma.supplierContact.upsert({
      where: {
        id:
          supplier.code === "FRESHFARM-MNL"
            ? ids.supplierContactId
            : `10000000-0000-4000-8000-${String(index + 191).padStart(12, "0")}`,
      },
      create: {
        id:
          supplier.code === "FRESHFARM-MNL"
            ? ids.supplierContactId
            : `10000000-0000-4000-8000-${String(index + 191).padStart(12, "0")}`,
        supplierId: record.id,
        ...supplier.contact,
        isPrimary: true,
      },
      update: {
        supplierId: record.id,
        ...supplier.contact,
        isPrimary: true,
      },
    });
  }

  const items: Array<{
    code: string;
    name: string;
    category: string;
    baseUom: string;
    purchaseUom: string;
    issueUom: string;
    supplier: string;
    supplierSku: string;
    supplierName: string;
    unitPrice: number;
    leadTimeDays: number;
    trackInventory?: boolean;
  }> = [
    {
      code: "BEEF-KARUBI-SHORTPLATE-KG",
      name: "Beef Karubi Short Plate",
      category: "BEEF-YAKINIKU",
      baseUom: "KG",
      purchaseUom: "KG",
      issueUom: "G",
      supplier: "OGF-BEEF-PRIME",
      supplierSku: "PCB-KARUBI-SP-001",
      supplierName: "Karubi Short Plate Sliced",
      unitPrice: 620,
      leadTimeDays: 2,
    },
    {
      code: "BEEF-HARAMI-SKIRT-KG",
      name: "Beef Harami Skirt",
      category: "BEEF-YAKINIKU",
      baseUom: "KG",
      purchaseUom: "KG",
      issueUom: "G",
      supplier: "KOBEYA-MEATS",
      supplierSku: "KBM-HARAMI-001",
      supplierName: "Harami Skirt Steak Sliced",
      unitPrice: 780,
      leadTimeDays: 2,
    },
    {
      code: "BEEF-TONGUE-US-KG",
      name: "Beef Tongue Usuyaki",
      category: "BEEF-YAKINIKU",
      baseUom: "KG",
      purchaseUom: "KG",
      issueUom: "G",
      supplier: "KOBEYA-MEATS",
      supplierSku: "KBM-GYUTAN-USU-001",
      supplierName: "Thin Sliced Beef Tongue",
      unitPrice: 980,
      leadTimeDays: 3,
    },
    {
      code: "BEEF-WAGYU-CUBES-KG",
      name: "Wagyu Saikoro Cubes",
      category: "BEEF-YAKINIKU",
      baseUom: "KG",
      purchaseUom: "KG",
      issueUom: "G",
      supplier: "OGF-BEEF-PRIME",
      supplierSku: "PCB-WAGYU-CUBE-001",
      supplierName: "Wagyu Saikoro Cubes",
      unitPrice: 1450,
      leadTimeDays: 4,
    },
    {
      code: "BEEF-SUKIYAKI-SLICE-KG",
      name: "Beef Sukiyaki Slice",
      category: "BEEF-YAKINIKU",
      baseUom: "KG",
      purchaseUom: "KG",
      issueUom: "G",
      supplier: "CENTRAL-BUTCHERY",
      supplierSku: "CBP-SUKI-SLICE-001",
      supplierName: "Beef Sukiyaki Thin Slice",
      unitPrice: 560,
      leadTimeDays: 2,
    },
    {
      code: "PORK-BELLY-YAKINIKU-KG",
      name: "Pork Belly Yakiniku Slice",
      category: "PORK-YAKINIKU",
      baseUom: "KG",
      purchaseUom: "KG",
      issueUom: "G",
      supplier: "CENTRAL-BUTCHERY",
      supplierSku: "CBP-PORK-BELLY-YK-001",
      supplierName: "Pork Belly Yakiniku Cut",
      unitPrice: 340,
      leadTimeDays: 2,
    },
    {
      code: "PORK-SHOULDER-SLICE-KG",
      name: "Pork Shoulder Slice",
      category: "PORK-YAKINIKU",
      baseUom: "KG",
      purchaseUom: "KG",
      issueUom: "G",
      supplier: "CENTRAL-BUTCHERY",
      supplierSku: "CBP-PORK-SHOULDER-001",
      supplierName: "Pork Shoulder Thin Slice",
      unitPrice: 315,
      leadTimeDays: 2,
    },
    {
      code: "CHICKEN-THIGH-KG",
      name: "Chicken Thigh Fillet",
      category: "PROTEIN-FRESH",
      baseUom: "KG",
      purchaseUom: "KG",
      issueUom: "G",
      supplier: "LUZON-POULTRY",
      supplierSku: "LPM-CHIX-THIGH-001",
      supplierName: "Chicken Thigh Fillet, Fresh",
      unitPrice: 215,
      leadTimeDays: 2,
    },
    {
      code: "CHICKEN-KARAAGE-CUT-KG",
      name: "Chicken Karaage Cut",
      category: "PROTEIN-FRESH",
      baseUom: "KG",
      purchaseUom: "KG",
      issueUom: "G",
      supplier: "LUZON-POULTRY",
      supplierSku: "LPM-KARAAGE-CUT-001",
      supplierName: "Karaage Cut Chicken Thigh",
      unitPrice: 235,
      leadTimeDays: 2,
    },
    {
      code: "SHRIMP-PDTO-31-40-KG",
      name: "Peeled Shrimp 31/40",
      category: "PROTEIN-FRESH",
      baseUom: "KG",
      purchaseUom: "KG",
      issueUom: "G",
      supplier: "TOKYO-SEAFOOD",
      supplierSku: "TBS-SHRIMP-3140-001",
      supplierName: "Peeled Deveined Tail-on Shrimp",
      unitPrice: 520,
      leadTimeDays: 3,
    },
    {
      code: "SALMON-PORTION-KG",
      name: "Salmon Grill Portion",
      category: "PROTEIN-FRESH",
      baseUom: "KG",
      purchaseUom: "KG",
      issueUom: "G",
      supplier: "TOKYO-SEAFOOD",
      supplierSku: "TBS-SALMON-PORTION-001",
      supplierName: "Salmon Grill Portion Cut",
      unitPrice: 720,
      leadTimeDays: 3,
    },
    {
      code: "JASMINE-RICE-25KG",
      name: "Jasmine Rice 25kg Sack",
      category: "DRY-GOODS",
      baseUom: "SACK",
      purchaseUom: "SACK",
      issueUom: "KG",
      supplier: "PACIFIC-PANTRY",
      supplierSku: "PPD-RICE-JAS-25",
      supplierName: "Jasmine Rice, 25kg Sack",
      unitPrice: 1580,
      leadTimeDays: 3,
    },
    {
      code: "JAPANESE-RICE-25KG",
      name: "Japanese Short Grain Rice 25kg",
      category: "DRY-GOODS",
      baseUom: "SACK",
      purchaseUom: "SACK",
      issueUom: "KG",
      supplier: "SAKURA-RICE",
      supplierSku: "SKR-JPN-RICE-25",
      supplierName: "Japanese Short Grain Rice 25kg",
      unitPrice: 2450,
      leadTimeDays: 3,
    },
    {
      code: "SUSHI-RICE-20KG",
      name: "Sushi Rice 20kg",
      category: "DRY-GOODS",
      baseUom: "SACK",
      purchaseUom: "SACK",
      issueUom: "KG",
      supplier: "SAKURA-RICE",
      supplierSku: "SKR-SUSHI-RICE-20",
      supplierName: "Sushi Rice 20kg Sack",
      unitPrice: 2250,
      leadTimeDays: 3,
    },
    {
      code: "MISO-PASTE-WHITE-KG",
      name: "White Miso Paste",
      category: "SAUCE-CONDIMENT",
      baseUom: "KG",
      purchaseUom: "TUB",
      issueUom: "G",
      supplier: "MARU-SAUCE",
      supplierSku: "MARU-MISO-WHITE-5KG",
      supplierName: "White Miso Paste 5kg Tub",
      unitPrice: 1180,
      leadTimeDays: 4,
    },
    {
      code: "YAKINIKU-TARE-L",
      name: "Yakiniku Tare Sauce",
      category: "SAUCE-CONDIMENT",
      baseUom: "L",
      purchaseUom: "BTL",
      issueUom: "ML",
      supplier: "MARU-SAUCE",
      supplierSku: "MARU-TARE-1L",
      supplierName: "Yakiniku Tare 1L Bottle",
      unitPrice: 260,
      leadTimeDays: 4,
    },
    {
      code: "GARLIC-SOY-SAUCE-L",
      name: "Garlic Soy Sauce",
      category: "SAUCE-CONDIMENT",
      baseUom: "L",
      purchaseUom: "BTL",
      issueUom: "ML",
      supplier: "MARU-SAUCE",
      supplierSku: "MARU-GARLIC-SOY-1L",
      supplierName: "Garlic Soy Sauce 1L",
      unitPrice: 230,
      leadTimeDays: 4,
    },
    {
      code: "SESAME-OIL-L",
      name: "Sesame Oil",
      category: "SAUCE-CONDIMENT",
      baseUom: "L",
      purchaseUom: "BTL",
      issueUom: "ML",
      supplier: "PACIFIC-PANTRY",
      supplierSku: "PPD-SESAME-OIL-1L",
      supplierName: "Sesame Oil 1L Bottle",
      unitPrice: 410,
      leadTimeDays: 3,
    },
    {
      code: "KIMCHI-KG",
      name: "Kimchi",
      category: "DAIRY-CHILLED",
      baseUom: "KG",
      purchaseUom: "TUB",
      issueUom: "G",
      supplier: "MANILA-DAIRY",
      supplierSku: "MDG-KIMCHI-5KG",
      supplierName: "Kimchi 5kg Tub",
      unitPrice: 880,
      leadTimeDays: 3,
    },
    {
      code: "CHEESE-SAUCE-KG",
      name: "Cheese Sauce",
      category: "DAIRY-CHILLED",
      baseUom: "KG",
      purchaseUom: "TUB",
      issueUom: "G",
      supplier: "MANILA-DAIRY",
      supplierSku: "MDG-CHEESE-SAUCE-3KG",
      supplierName: "Cheese Sauce 3kg Tub",
      unitPrice: 720,
      leadTimeDays: 4,
    },
    {
      code: "CANOLA-OIL-17L",
      name: "Canola Oil 17L Tin",
      category: "DRY-GOODS",
      baseUom: "L",
      purchaseUom: "CASE",
      issueUom: "L",
      supplier: "PACIFIC-PANTRY",
      supplierSku: "PPD-OIL-CAN-17L",
      supplierName: "Canola Oil, 17L Tin",
      unitPrice: 2250,
      leadTimeDays: 3,
    },
    {
      code: "EGGS-TRAY-30",
      name: "Large Eggs Tray 30s",
      category: "DAIRY-CHILLED",
      baseUom: "TRAY",
      purchaseUom: "TRAY",
      issueUom: "EA",
      supplier: "LUZON-POULTRY",
      supplierSku: "LPM-EGG-L-30",
      supplierName: "Large Eggs, Tray of 30",
      unitPrice: 285,
      leadTimeDays: 1,
    },
    {
      code: "MOZZARELLA-BLOCK-KG",
      name: "Mozzarella Block",
      category: "DAIRY-CHILLED",
      baseUom: "KG",
      purchaseUom: "KG",
      issueUom: "G",
      supplier: "PACIFIC-PANTRY",
      supplierSku: "PPD-DAIRY-MOZZ-KG",
      supplierName: "Mozzarella Block",
      unitPrice: 430,
      leadTimeDays: 4,
    },
    {
      code: "LETTUCE-GREEN-KG",
      name: "Green Leaf Lettuce",
      category: "PRODUCE-FRESH",
      baseUom: "KG",
      purchaseUom: "KG",
      issueUom: "G",
      supplier: "FRESHFARM-MNL",
      supplierSku: "FFM-LETTUCE-GREEN-KG",
      supplierName: "Green Leaf Lettuce",
      unitPrice: 145,
      leadTimeDays: 2,
    },
    {
      code: "ONION-WHITE-KG",
      name: "White Onion",
      category: "PRODUCE-FRESH",
      baseUom: "KG",
      purchaseUom: "KG",
      issueUom: "G",
      supplier: "FRESHFARM-MNL",
      supplierSku: "FFM-ONION-WHITE-KG",
      supplierName: "White Onion",
      unitPrice: 115,
      leadTimeDays: 2,
    },
    {
      code: "GARLIC-PEELED-KG",
      name: "Peeled Garlic",
      category: "PRODUCE-FRESH",
      baseUom: "KG",
      purchaseUom: "KG",
      issueUom: "G",
      supplier: "FRESHFARM-MNL",
      supplierSku: "FFM-GARLIC-PEELED-KG",
      supplierName: "Peeled Garlic",
      unitPrice: 190,
      leadTimeDays: 2,
    },
    {
      code: "SPRING-ONION-BUNCH",
      name: "Spring Onion",
      category: "PRODUCE-FRESH",
      baseUom: "BUNCH",
      purchaseUom: "BUNCH",
      issueUom: "EA",
      supplier: "FRESHFARM-MNL",
      supplierSku: "FFM-SPRING-ONION-BUNCH",
      supplierName: "Spring Onion Bunch",
      unitPrice: 38,
      leadTimeDays: 2,
    },
    {
      code: "CABBAGE-KG",
      name: "Cabbage",
      category: "PRODUCE-FRESH",
      baseUom: "KG",
      purchaseUom: "KG",
      issueUom: "G",
      supplier: "FRESHFARM-MNL",
      supplierSku: "FFM-CABBAGE-KG",
      supplierName: "Fresh Cabbage",
      unitPrice: 80,
      leadTimeDays: 2,
    },
    {
      code: "CUCUMBER-KG",
      name: "Japanese Cucumber",
      category: "PRODUCE-FRESH",
      baseUom: "KG",
      purchaseUom: "KG",
      issueUom: "G",
      supplier: "FRESHFARM-MNL",
      supplierSku: "FFM-CUCUMBER-JPN-KG",
      supplierName: "Japanese Cucumber",
      unitPrice: 95,
      leadTimeDays: 2,
    },
    {
      code: "TAKEOUT-BOWL-750ML",
      name: "Takeout Bowl 750ml",
      category: "PACKAGING",
      baseUom: "PACK",
      purchaseUom: "CASE",
      issueUom: "EA",
      supplier: "METRO-PACKAGING",
      supplierSku: "MFP-BOWL-750-CASE",
      supplierName: "750ml Takeout Bowl, Case",
      unitPrice: 980,
      leadTimeDays: 5,
    },
    {
      code: "YAKINIKU-TAKEOUT-BOX",
      name: "Yakiniku Takeout Box",
      category: "PACKAGING",
      baseUom: "PACK",
      purchaseUom: "CASE",
      issueUom: "EA",
      supplier: "METRO-PACKAGING",
      supplierSku: "MFP-YK-BOX-CASE",
      supplierName: "Yakiniku Takeout Box Case",
      unitPrice: 1250,
      leadTimeDays: 5,
    },
    {
      code: "CHOPSTICKS-WRAPPED",
      name: "Wrapped Chopsticks",
      category: "PACKAGING",
      baseUom: "PACK",
      purchaseUom: "CASE",
      issueUom: "EA",
      supplier: "METRO-PACKAGING",
      supplierSku: "MFP-CHOPSTICKS-CASE",
      supplierName: "Wrapped Chopsticks Case",
      unitPrice: 780,
      leadTimeDays: 5,
    },
    {
      code: "SAUCE-CUP-2OZ",
      name: "Sauce Cup 2oz",
      category: "PACKAGING",
      baseUom: "PACK",
      purchaseUom: "CASE",
      issueUom: "EA",
      supplier: "METRO-PACKAGING",
      supplierSku: "MFP-SAUCE-CUP-2OZ",
      supplierName: "2oz Sauce Cup Case",
      unitPrice: 620,
      leadTimeDays: 5,
    },
    {
      code: "CHARCOAL-BINCHOTAN-KG",
      name: "Binchotan-style Charcoal",
      category: "GRILL-SUPPLIES",
      baseUom: "KG",
      purchaseUom: "BAG",
      issueUom: "KG",
      supplier: "GRILLPRO-SUPPLIES",
      supplierSku: "GPS-CHARCOAL-BIN-10KG",
      supplierName: "Binchotan-style Charcoal 10kg Bag",
      unitPrice: 980,
      leadTimeDays: 7,
    },
    {
      code: "GRILL-NET-ROUND",
      name: "Round Grill Net",
      category: "GRILL-SUPPLIES",
      baseUom: "EA",
      purchaseUom: "PACK",
      issueUom: "EA",
      supplier: "GRILLPRO-SUPPLIES",
      supplierSku: "GPS-GRILL-NET-ROUND",
      supplierName: "Round Grill Net Pack",
      unitPrice: 560,
      leadTimeDays: 7,
    },
    {
      code: "LYCHEE-ICED-TEA-L",
      name: "Lychee Iced Tea",
      category: "BEVERAGE",
      baseUom: "L",
      purchaseUom: "BTL",
      issueUom: "ML",
      supplier: "BEV-HUB",
      supplierSku: "BHD-LYCHEE-TEA-1L",
      supplierName: "Lychee Iced Tea 1L",
      unitPrice: 135,
      leadTimeDays: 3,
    },
    {
      code: "CALAMANSI-JUICE-L",
      name: "Calamansi Juice",
      category: "BEVERAGE",
      baseUom: "L",
      purchaseUom: "BTL",
      issueUom: "ML",
      supplier: "BEV-HUB",
      supplierSku: "BHD-CALAMANSI-1L",
      supplierName: "Calamansi Juice 1L",
      unitPrice: 120,
      leadTimeDays: 3,
    },
    {
      code: "MENU-KARUBI-SET",
      name: "Karubi Set",
      category: "MENU-ITEMS",
      baseUom: "SET",
      purchaseUom: "SET",
      issueUom: "SET",
      supplier: "OGF-BEEF-PRIME",
      supplierSku: "MENU-KARUBI-SET",
      supplierName: "Menu placeholder: Karubi Set",
      unitPrice: 0,
      leadTimeDays: 0,
      trackInventory: false,
    },
    {
      code: "MENU-HARAMI-KARUBI-SET",
      name: "Harami and Karubi Set",
      category: "MENU-ITEMS",
      baseUom: "SET",
      purchaseUom: "SET",
      issueUom: "SET",
      supplier: "KOBEYA-MEATS",
      supplierSku: "MENU-HARAMI-KARUBI",
      supplierName: "Menu placeholder: Harami and Karubi Set",
      unitPrice: 0,
      leadTimeDays: 0,
      trackInventory: false,
    },
    {
      code: "MENU-WAGYU-SAIKORO-SET",
      name: "Wagyu Saikoro Set",
      category: "MENU-ITEMS",
      baseUom: "SET",
      purchaseUom: "SET",
      issueUom: "SET",
      supplier: "OGF-BEEF-PRIME",
      supplierSku: "MENU-WAGYU-SAIKORO",
      supplierName: "Menu placeholder: Wagyu Saikoro Set",
      unitPrice: 0,
      leadTimeDays: 0,
      trackInventory: false,
    },
    {
      code: "MENU-BEEF-TONGUE-SET",
      name: "Beef Tongue Set",
      category: "MENU-ITEMS",
      baseUom: "SET",
      purchaseUom: "SET",
      issueUom: "SET",
      supplier: "KOBEYA-MEATS",
      supplierSku: "MENU-BEEF-TONGUE",
      supplierName: "Menu placeholder: Beef Tongue Set",
      unitPrice: 0,
      leadTimeDays: 0,
      trackInventory: false,
    },
    {
      code: "MENU-PORK-BELLY-SET",
      name: "Pork Belly Set",
      category: "MENU-ITEMS",
      baseUom: "SET",
      purchaseUom: "SET",
      issueUom: "SET",
      supplier: "CENTRAL-BUTCHERY",
      supplierSku: "MENU-PORK-BELLY",
      supplierName: "Menu placeholder: Pork Belly Set",
      unitPrice: 0,
      leadTimeDays: 0,
      trackInventory: false,
    },
  ];

  for (const [index, item] of items.entries()) {
    const record = await prisma.item.upsert({
      where: {
        companyId_itemCode: {
          companyId: ids.companyId,
          itemCode: item.code,
        },
      },
      create: {
        tenantId: ids.tenantId,
        companyId: ids.companyId,
        itemCode: item.code,
        itemName: item.name,
        itemCategoryId: categoryByCode.get(item.category)!,
        itemType: item.category === "MENU-ITEMS" ? "menu_placeholder" : "inventory",
        baseUomId: uomByCode.get(item.baseUom)!,
        purchaseUomId: uomByCode.get(item.purchaseUom)!,
        issueUomId: uomByCode.get(item.issueUom)!,
        trackInventory: item.trackInventory ?? true,
        trackExpiry:
          (item.trackInventory ?? true) &&
          !["PACKAGING", "GRILL-SUPPLIES", "MENU-ITEMS"].includes(item.category),
        trackLot:
          (item.trackInventory ?? true) &&
          !["PACKAGING", "GRILL-SUPPLIES", "MENU-ITEMS"].includes(item.category),
        requiresReceivingInspection:
          (item.trackInventory ?? true) &&
          !["PACKAGING", "GRILL-SUPPLIES", "MENU-ITEMS"].includes(item.category),
      },
      update: {
        itemName: item.name,
        itemCategoryId: categoryByCode.get(item.category)!,
        itemType: item.category === "MENU-ITEMS" ? "menu_placeholder" : "inventory",
        baseUomId: uomByCode.get(item.baseUom)!,
        purchaseUomId: uomByCode.get(item.purchaseUom)!,
        issueUomId: uomByCode.get(item.issueUom)!,
        trackInventory: item.trackInventory ?? true,
        trackExpiry:
          (item.trackInventory ?? true) &&
          !["PACKAGING", "GRILL-SUPPLIES", "MENU-ITEMS"].includes(item.category),
        trackLot:
          (item.trackInventory ?? true) &&
          !["PACKAGING", "GRILL-SUPPLIES", "MENU-ITEMS"].includes(item.category),
        requiresReceivingInspection:
          (item.trackInventory ?? true) &&
          !["PACKAGING", "GRILL-SUPPLIES", "MENU-ITEMS"].includes(item.category),
        status: "ACTIVE",
      },
    });

    if (item.baseUom === "KG" && item.issueUom === "G") {
      await prisma.itemUomConversion.upsert({
        where: {
          itemId_fromUomId_toUomId: {
            itemId: record.id,
            fromUomId: uomByCode.get("KG")!,
            toUomId: uomByCode.get("G")!,
          },
        },
        create: {
          id: `10000000-0000-4000-8000-${String(index + 401).padStart(12, "0")}`,
          itemId: record.id,
          fromUomId: uomByCode.get("KG")!,
          toUomId: uomByCode.get("G")!,
          conversionFactor: 1000,
          roundingRule: "none",
        },
        update: {
          conversionFactor: 1000,
          roundingRule: "none",
        },
      });
    }

    const link = await prisma.supplierItemLink.upsert({
      where: {
        supplierId_itemId_purchaseUomId: {
          supplierId: supplierByCode.get(item.supplier)!,
          itemId: record.id,
          purchaseUomId: uomByCode.get(item.purchaseUom)!,
        },
      },
      create: {
        tenantId: ids.tenantId,
        companyId: ids.companyId,
        supplierId: supplierByCode.get(item.supplier)!,
        itemId: record.id,
        purchaseUomId: uomByCode.get(item.purchaseUom)!,
        supplierSku: item.supplierSku,
        supplierItemName: item.supplierName,
        leadTimeDays: item.leadTimeDays,
        minOrderQty: 1,
        preferredRank: 1,
      },
      update: {
        supplierSku: item.supplierSku,
        supplierItemName: item.supplierName,
        leadTimeDays: item.leadTimeDays,
        minOrderQty: 1,
        preferredRank: 1,
        status: "ACTIVE",
      },
    });

    await prisma.supplierPriceHistory.upsert({
      where: {
        id: `10000000-0000-4000-8000-${String(index + 301).padStart(12, "0")}`,
      },
      create: {
        id: `10000000-0000-4000-8000-${String(index + 301).padStart(12, "0")}`,
        tenantId: ids.tenantId,
        companyId: ids.companyId,
        supplierId: supplierByCode.get(item.supplier)!,
        itemId: record.id,
        supplierItemLinkId: link.id,
        uomId: uomByCode.get(item.purchaseUom)!,
        currencyCode: "PHP",
        unitPrice: item.unitPrice,
        effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
      },
      update: {
        supplierId: supplierByCode.get(item.supplier)!,
        itemId: record.id,
        supplierItemLinkId: link.id,
        uomId: uomByCode.get(item.purchaseUom)!,
        currencyCode: "PHP",
        unitPrice: item.unitPrice,
        effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
        effectiveTo: null,
      },
    });
  }
}

async function seedPhase2RecipeDemoData() {
  const [uoms, items] = await Promise.all([
    prisma.uom.findMany({
      where: { companyId: ids.companyId },
      select: { id: true, uomCode: true },
    }),
    prisma.item.findMany({
      where: { companyId: ids.companyId },
      select: { id: true, itemCode: true },
    }),
  ]);
  const uomByCode = new Map(uoms.map((uom) => [uom.uomCode, uom.id]));
  const itemByCode = new Map(items.map((item) => [item.itemCode, item.id]));

  const recipes = [
    {
      code: "YL-KARUBI-SET",
      name: "Karubi Set",
      menuCode: "MENU-KARUBI-SET",
      menuCategory: "Yakiniku Sets",
      price: 399,
      targetFoodCostPercent: 34,
      lines: [
        { itemCode: "BEEF-KARUBI-SHORTPLATE-KG", quantity: 0.12, uomCode: "KG", note: "120g sliced karubi" },
        { itemCode: "JAPANESE-RICE-25KG", quantity: 0.18, uomCode: "KG", note: "Cooked rice portion equivalent" },
        { itemCode: "YAKINIKU-TARE-L", quantity: 0.045, uomCode: "L", note: "House tare serving" },
        { itemCode: "KIMCHI-KG", quantity: 0.055, uomCode: "KG", note: "Side dish" },
        { itemCode: "LETTUCE-GREEN-KG", quantity: 0.035, uomCode: "KG", note: "Garnish" },
      ],
    },
    {
      code: "YL-HARAMI-KARUBI-SET",
      name: "Harami and Karubi Set",
      menuCode: "MENU-HARAMI-KARUBI",
      menuCategory: "Yakiniku Sets",
      price: 549,
      targetFoodCostPercent: 36,
      lines: [
        { itemCode: "BEEF-HARAMI-SKIRT-KG", quantity: 0.08, uomCode: "KG", note: "80g harami" },
        { itemCode: "BEEF-KARUBI-SHORTPLATE-KG", quantity: 0.08, uomCode: "KG", note: "80g karubi" },
        { itemCode: "JAPANESE-RICE-25KG", quantity: 0.18, uomCode: "KG", note: "Cooked rice portion equivalent" },
        { itemCode: "GARLIC-SOY-SAUCE-L", quantity: 0.035, uomCode: "L", note: "Garlic soy serving" },
        { itemCode: "KIMCHI-KG", quantity: 0.055, uomCode: "KG", note: "Side dish" },
      ],
    },
    {
      code: "YL-WAGYU-SAIKORO-SET",
      name: "Wagyu Saikoro Set",
      menuCode: "MENU-WAGYU-SAIKORO",
      menuCategory: "Premium Sets",
      price: 799,
      targetFoodCostPercent: 38,
      lines: [
        { itemCode: "BEEF-WAGYU-CUBES-KG", quantity: 0.14, uomCode: "KG", note: "140g saikoro cubes" },
        { itemCode: "JAPANESE-RICE-25KG", quantity: 0.18, uomCode: "KG", note: "Cooked rice portion equivalent" },
        { itemCode: "YAKINIKU-TARE-L", quantity: 0.04, uomCode: "L", note: "House tare serving" },
        { itemCode: "SESAME-OIL-L", quantity: 0.01, uomCode: "L", note: "Finishing oil" },
        { itemCode: "ONION-WHITE-KG", quantity: 0.04, uomCode: "KG", note: "Grill vegetable" },
      ],
    },
    {
      code: "YL-BEEF-TONGUE-SET",
      name: "Beef Tongue Set",
      menuCode: "MENU-BEEF-TONGUE",
      menuCategory: "Premium Sets",
      price: 699,
      targetFoodCostPercent: 37,
      lines: [
        { itemCode: "BEEF-TONGUE-US-KG", quantity: 0.11, uomCode: "KG", note: "110g beef tongue" },
        { itemCode: "JAPANESE-RICE-25KG", quantity: 0.18, uomCode: "KG", note: "Cooked rice portion equivalent" },
        { itemCode: "GARLIC-SOY-SAUCE-L", quantity: 0.035, uomCode: "L", note: "Garlic soy serving" },
        { itemCode: "SPRING-ONION-BUNCH", quantity: 0.15, uomCode: "BUNCH", note: "Negi garnish equivalent" },
        { itemCode: "KIMCHI-KG", quantity: 0.055, uomCode: "KG", note: "Side dish" },
      ],
    },
    {
      code: "YL-PORK-BELLY-SET",
      name: "Pork Belly Set",
      menuCode: "MENU-PORK-BELLY",
      menuCategory: "Yakiniku Sets",
      price: 349,
      targetFoodCostPercent: 32,
      lines: [
        { itemCode: "PORK-BELLY-YAKINIKU-KG", quantity: 0.14, uomCode: "KG", note: "140g pork belly" },
        { itemCode: "JAPANESE-RICE-25KG", quantity: 0.18, uomCode: "KG", note: "Cooked rice portion equivalent" },
        { itemCode: "YAKINIKU-TARE-L", quantity: 0.04, uomCode: "L", note: "House tare serving" },
        { itemCode: "LETTUCE-GREEN-KG", quantity: 0.04, uomCode: "KG", note: "Garnish" },
        { itemCode: "KIMCHI-KG", quantity: 0.055, uomCode: "KG", note: "Side dish" },
      ],
    },
  ];

  for (const [recipeIndex, recipe] of recipes.entries()) {
    const recipeRecord = await prisma.recipe.upsert({
      where: {
        companyId_recipeCode: {
          companyId: ids.companyId,
          recipeCode: recipe.code,
        },
      },
      create: {
        id: `20000000-0000-4000-8000-${String(recipeIndex + 1).padStart(12, "0")}`,
        tenantId: ids.tenantId,
        companyId: ids.companyId,
        brandId: ids.brandId,
        recipeCode: recipe.code,
        recipeName: recipe.name,
        recipeType: "MENU",
        ownerDepartment: "Kitchen Operations",
        createdByUserId: ids.adminUserId,
      },
      update: {
        brandId: ids.brandId,
        recipeName: recipe.name,
        recipeType: "MENU",
        ownerDepartment: "Kitchen Operations",
        status: "ACTIVE",
      },
    });

    const versionRecord = await prisma.recipeVersion.upsert({
      where: {
        recipeId_versionNo: {
          recipeId: recipeRecord.id,
          versionNo: 1,
        },
      },
      create: {
        id: `20000000-0000-4000-8001-${String(recipeIndex + 1).padStart(12, "0")}`,
        tenantId: ids.tenantId,
        companyId: ids.companyId,
        recipeId: recipeRecord.id,
        versionNo: 1,
        status: "PUBLISHED",
        yieldQuantity: 1,
        yieldUomId: uomByCode.get("SET")!,
        servingQuantity: 1,
        servingUomId: uomByCode.get("SET")!,
        targetFoodCostPercent: recipe.targetFoodCostPercent,
        notes: "Demo Phase II recipe costing baseline.",
        effectiveFrom: new Date("2026-07-01T00:00:00.000Z"),
        approvedAt: new Date("2026-07-01T00:00:00.000Z"),
        approvedByUserId: ids.adminUserId,
        createdByUserId: ids.adminUserId,
      },
      update: {
        status: "PUBLISHED",
        yieldQuantity: 1,
        yieldUomId: uomByCode.get("SET")!,
        servingQuantity: 1,
        servingUomId: uomByCode.get("SET")!,
        targetFoodCostPercent: recipe.targetFoodCostPercent,
        notes: "Demo Phase II recipe costing baseline.",
        effectiveFrom: new Date("2026-07-01T00:00:00.000Z"),
        effectiveTo: null,
        approvedAt: new Date("2026-07-01T00:00:00.000Z"),
        approvedByUserId: ids.adminUserId,
      },
    });

    await prisma.recipeLine.deleteMany({
      where: { recipeVersionId: versionRecord.id },
    });
    await prisma.recipeLine.createMany({
      data: recipe.lines.map((line, lineIndex) => ({
        id: `20000000-0000-4000-8002-${String(recipeIndex * 20 + lineIndex + 1).padStart(12, "0")}`,
        tenantId: ids.tenantId,
        companyId: ids.companyId,
        recipeVersionId: versionRecord.id,
        lineNo: lineIndex + 1,
        lineType: "INGREDIENT",
        itemId: itemByCode.get(line.itemCode)!,
        quantity: line.quantity,
        uomId: uomByCode.get(line.uomCode)!,
        preparationNote: line.note,
      })),
    });

    const menuItem = await prisma.menuItem.upsert({
      where: {
        companyId_menuItemCode: {
          companyId: ids.companyId,
          menuItemCode: recipe.menuCode,
        },
      },
      create: {
        id: `20000000-0000-4000-8003-${String(recipeIndex + 1).padStart(12, "0")}`,
        tenantId: ids.tenantId,
        companyId: ids.companyId,
        brandId: ids.brandId,
        menuItemCode: recipe.menuCode,
        menuItemName: recipe.name,
        menuCategory: recipe.menuCategory,
        currentRecipeVersionId: versionRecord.id,
      },
      update: {
        brandId: ids.brandId,
        menuItemName: recipe.name,
        menuCategory: recipe.menuCategory,
        currentRecipeVersionId: versionRecord.id,
        status: "ACTIVE",
      },
    });

    await prisma.menuPrice.upsert({
      where: {
        id: `20000000-0000-4000-8004-${String(recipeIndex + 1).padStart(12, "0")}`,
      },
      create: {
        id: `20000000-0000-4000-8004-${String(recipeIndex + 1).padStart(12, "0")}`,
        tenantId: ids.tenantId,
        companyId: ids.companyId,
        menuItemId: menuItem.id,
        currencyCode: "PHP",
        price: recipe.price,
        effectiveFrom: new Date("2026-07-01T00:00:00.000Z"),
      },
      update: {
        menuItemId: menuItem.id,
        currencyCode: "PHP",
        price: recipe.price,
        effectiveFrom: new Date("2026-07-01T00:00:00.000Z"),
        effectiveTo: null,
      },
    });
  }
}

async function seedPhase2SalesImportDemoData() {
  const menuItems = await prisma.menuItem.findMany({
    where: { companyId: ids.companyId },
    select: { id: true, menuItemCode: true },
  });
  const menuItemByCode = new Map(
    menuItems.map((menuItem) => [menuItem.menuItemCode, menuItem.id]),
  );

  const menuPrices = await prisma.menuPrice.findMany({
    where: { companyId: ids.companyId, effectiveTo: null },
    select: { menuItemId: true, price: true },
  });
  const priceByMenuItemId = new Map(
    menuPrices.map((price) => [price.menuItemId, Number(price.price)]),
  );

  const demoSalesByBranch = [
    {
      locationId: ids.locationId,
      importRef: "YL-SM-NORTH-2026-07-02",
      businessDate: "2026-07-02T00:00:00.000Z",
      lines: [
        { menuCode: "MENU-KARUBI-SET", quantity: 58, discount: 420 },
        { menuCode: "MENU-HARAMI-KARUBI", quantity: 34, discount: 380 },
        { menuCode: "MENU-WAGYU-SAIKORO", quantity: 16, discount: 640 },
        { menuCode: "MENU-BEEF-TONGUE", quantity: 20, discount: 540 },
        { menuCode: "MENU-PORK-BELLY", quantity: 45, discount: 300 },
      ],
    },
    {
      locationId: "10000000-0000-4000-8000-000000000601",
      importRef: "YL-MOA-2026-07-02",
      businessDate: "2026-07-02T00:00:00.000Z",
      lines: [
        { menuCode: "MENU-KARUBI-SET", quantity: 72, discount: 520 },
        { menuCode: "MENU-HARAMI-KARUBI", quantity: 45, discount: 620 },
        { menuCode: "MENU-WAGYU-SAIKORO", quantity: 24, discount: 980 },
        { menuCode: "MENU-BEEF-TONGUE", quantity: 28, discount: 760 },
        { menuCode: "MENU-PORK-BELLY", quantity: 39, discount: 260 },
      ],
    },
    {
      locationId: "10000000-0000-4000-8000-000000000602",
      importRef: "YL-MEGAMALL-2026-07-02",
      businessDate: "2026-07-02T00:00:00.000Z",
      lines: [
        { menuCode: "MENU-KARUBI-SET", quantity: 64, discount: 450 },
        { menuCode: "MENU-HARAMI-KARUBI", quantity: 41, discount: 520 },
        { menuCode: "MENU-WAGYU-SAIKORO", quantity: 19, discount: 780 },
        { menuCode: "MENU-BEEF-TONGUE", quantity: 25, discount: 650 },
        { menuCode: "MENU-PORK-BELLY", quantity: 51, discount: 340 },
      ],
    },
  ];

  for (const [batchIndex, batch] of demoSalesByBranch.entries()) {
    const calculatedLines = batch.lines.map((line) => {
      const menuItemId = menuItemByCode.get(line.menuCode);
      if (!menuItemId) {
        throw new Error(`MISSING_MENU_ITEM_FOR_SALES_IMPORT:${line.menuCode}`);
      }
      const price = priceByMenuItemId.get(menuItemId) ?? 0;
      const grossSalesAmount = Number((line.quantity * price).toFixed(2));
      const netSalesAmount = Number((grossSalesAmount - line.discount).toFixed(2));
      return {
        ...line,
        menuItemId,
        grossSalesAmount,
        netSalesAmount,
      };
    });

    const batchRecord = await prisma.restaurantSalesImportBatch.upsert({
      where: {
        companyId_locationId_businessDate_sourceSystem_importRef: {
          companyId: ids.companyId,
          locationId: batch.locationId,
          businessDate: new Date(batch.businessDate),
          sourceSystem: "DEMO_POS_IMPORT",
          importRef: batch.importRef,
        },
      },
      create: {
        id: `21000000-0000-4000-8000-${String(batchIndex + 1).padStart(12, "0")}`,
        tenantId: ids.tenantId,
        companyId: ids.companyId,
        brandId: ids.brandId,
        locationId: batch.locationId,
        businessDate: new Date(batch.businessDate),
        sourceSystem: "DEMO_POS_IMPORT",
        importRef: batch.importRef,
        status: "POSTED",
        currencyCode: "PHP",
        totalNetSales: calculatedLines.reduce(
          (total, line) => total + line.netSalesAmount,
          0,
        ),
        totalQuantity: calculatedLines.reduce(
          (total, line) => total + line.quantity,
          0,
        ),
        importedByUserId: ids.adminUserId,
      },
      update: {
        brandId: ids.brandId,
        status: "POSTED",
        currencyCode: "PHP",
        totalNetSales: calculatedLines.reduce(
          (total, line) => total + line.netSalesAmount,
          0,
        ),
        totalQuantity: calculatedLines.reduce(
          (total, line) => total + line.quantity,
          0,
        ),
        importedByUserId: ids.adminUserId,
      },
    });

    await prisma.restaurantSalesImportLine.deleteMany({
      where: { batchId: batchRecord.id },
    });
    await prisma.restaurantSalesImportLine.createMany({
      data: calculatedLines.map((line, lineIndex) => ({
        id: `21000000-0000-4000-8001-${String(batchIndex * 20 + lineIndex + 1).padStart(12, "0")}`,
        tenantId: ids.tenantId,
        companyId: ids.companyId,
        brandId: ids.brandId,
        locationId: batch.locationId,
        batchId: batchRecord.id,
        menuItemId: line.menuItemId,
        businessDate: new Date(batch.businessDate),
        salesChannel: "STORE",
        quantitySold: line.quantity,
        grossSalesAmount: line.grossSalesAmount,
        discountAmount: line.discount,
        netSalesAmount: line.netSalesAmount,
        currencyCode: "PHP",
      })),
    });
  }
}

async function seedPhase2BranchOperationsDemoData() {
  const checklistTemplates = [
    {
      area: "Opening Readiness",
      checkName: "Gas, grill, and exhaust safety check",
      expectedResult: "Grills preheated, gas valves inspected, and exhaust running.",
    },
    {
      area: "Opening Readiness",
      checkName: "Cold holding temperatures verified",
      expectedResult: "Chillers and freezers are within configured food-safety range.",
    },
    {
      area: "Cashier and POS",
      checkName: "POS terminal and cash float ready",
      expectedResult: "POS online, printer tested, and beginning cash float confirmed.",
    },
    {
      area: "Dining Room",
      checkName: "Tables, condiments, and grill tools set",
      expectedResult: "Guest-facing stations are clean, complete, and ready.",
    },
    {
      area: "Closing Controls",
      checkName: "End-of-day cleaning and waste segregation",
      expectedResult: "Stations cleaned, waste segregated, and closing checklist signed.",
    },
  ];
  const demoSessions = [
    {
      locationId: ids.locationId,
      shiftType: "OPENING",
      checklistName: "Daily Opening Checklist",
      status: "SUBMITTED",
      completionPercent: 100,
      exceptionCount: 0,
      lineResults: ["PASS", "PASS", "PASS", "PASS", "PASS"],
      severities: ["NORMAL", "NORMAL", "NORMAL", "NORMAL", "NORMAL"],
      notes: ["", "", "", "", ""],
    },
    {
      locationId: "10000000-0000-4000-8000-000000000601",
      shiftType: "OPENING",
      checklistName: "Daily Opening Checklist",
      status: "MANAGER_REVIEW",
      completionPercent: 100,
      exceptionCount: 1,
      lineResults: ["PASS", "EXCEPTION", "PASS", "PASS", "PASS"],
      severities: ["NORMAL", "MINOR", "NORMAL", "NORMAL", "NORMAL"],
      notes: [
        "",
        "Reach-in chiller logged at 7C during first check; rechecked after 15 minutes at 4C.",
        "",
        "",
        "",
      ],
    },
    {
      locationId: "10000000-0000-4000-8000-000000000602",
      shiftType: "CLOSING",
      checklistName: "Daily Closing Checklist",
      status: "EXCEPTION_OPEN",
      completionPercent: 80,
      exceptionCount: 1,
      lineResults: ["PASS", "PASS", "PASS", "PASS", "EXCEPTION"],
      severities: ["NORMAL", "NORMAL", "NORMAL", "NORMAL", "CRITICAL"],
      notes: [
        "",
        "",
        "",
        "",
        "Grease trap cleaning evidence missing; branch manager follow-up required before next opening.",
      ],
    },
  ];

  for (const [sessionIndex, session] of demoSessions.entries()) {
    const checklist = await prisma.branchOperationalChecklist.upsert({
      where: {
        companyId_locationId_businessDate_shiftType: {
          companyId: ids.companyId,
          locationId: session.locationId,
          businessDate: new Date("2026-07-02T00:00:00.000Z"),
          shiftType: session.shiftType,
        },
      },
      create: {
        id: `22000000-0000-4000-8000-${String(sessionIndex + 1).padStart(12, "0")}`,
        tenantId: ids.tenantId,
        companyId: ids.companyId,
        brandId: ids.brandId,
        locationId: session.locationId,
        businessDate: new Date("2026-07-02T00:00:00.000Z"),
        shiftType: session.shiftType,
        status: session.status,
        checklistName: session.checklistName,
        openedByUserId: ids.userId,
        submittedByUserId: ids.userId,
        submittedAt: new Date("2026-07-02T01:30:00.000Z"),
        reviewedByUserId:
          session.status === "SUBMITTED" ? ids.approverUserId : null,
        reviewedAt:
          session.status === "SUBMITTED"
            ? new Date("2026-07-02T02:00:00.000Z")
            : null,
        exceptionCount: session.exceptionCount,
        completionPercent: session.completionPercent,
      },
      update: {
        brandId: ids.brandId,
        status: session.status,
        checklistName: session.checklistName,
        openedByUserId: ids.userId,
        submittedByUserId: ids.userId,
        submittedAt: new Date("2026-07-02T01:30:00.000Z"),
        reviewedByUserId:
          session.status === "SUBMITTED" ? ids.approverUserId : null,
        reviewedAt:
          session.status === "SUBMITTED"
            ? new Date("2026-07-02T02:00:00.000Z")
            : null,
        exceptionCount: session.exceptionCount,
        completionPercent: session.completionPercent,
      },
    });

    await prisma.branchOperationalChecklistLine.deleteMany({
      where: { checklistId: checklist.id },
    });
    await prisma.branchOperationalChecklistLine.createMany({
      data: checklistTemplates.map((template, lineIndex) => ({
        id: `22000000-0000-4000-8001-${String(sessionIndex * 20 + lineIndex + 1).padStart(12, "0")}`,
        tenantId: ids.tenantId,
        companyId: ids.companyId,
        brandId: ids.brandId,
        locationId: session.locationId,
        checklistId: checklist.id,
        lineNo: lineIndex + 1,
        area: template.area,
        checkName: template.checkName,
        expectedResult: template.expectedResult,
        result: session.lineResults[lineIndex]!,
        severity: session.severities[lineIndex]!,
        evidenceReference:
          session.lineResults[lineIndex] === "EXCEPTION"
            ? `OPS-EVIDENCE-${sessionIndex + 1}-${lineIndex + 1}`
            : null,
        notes: session.notes[lineIndex]!,
        completedByUserId: ids.userId,
        completedAt: new Date("2026-07-02T01:20:00.000Z"),
      })),
    });
  }
}

async function seedPhase2FoodSafetyDemoData() {
  const demoLogs = [
    {
      locationId: ids.locationId,
      logType: "TEMPERATURE",
      title: "Opening Temperature Log",
      status: "REVIEWED",
      exceptionCount: 0,
      readings: [
        {
          station: "Walk-in Chiller",
          readingType: "Cold holding temperature",
          readingValue: 3.2,
          readingUom: "C",
          min: 0,
          max: 5,
          result: "PASS",
          severity: "NORMAL",
          correctiveAction: "",
        },
        {
          station: "Freezer",
          readingType: "Frozen storage temperature",
          readingValue: -18.5,
          readingUom: "C",
          min: -25,
          max: -15,
          result: "PASS",
          severity: "NORMAL",
          correctiveAction: "",
        },
        {
          station: "Sauce Chiller",
          readingType: "Cold holding temperature",
          readingValue: 4.1,
          readingUom: "C",
          min: 0,
          max: 5,
          result: "PASS",
          severity: "NORMAL",
          correctiveAction: "",
        },
      ],
    },
    {
      locationId: "10000000-0000-4000-8000-000000000601",
      logType: "TEMPERATURE",
      title: "Opening Temperature Log",
      status: "EXCEPTION_REVIEW",
      exceptionCount: 1,
      readings: [
        {
          station: "Reach-in Chiller",
          readingType: "Cold holding temperature",
          readingValue: 7.0,
          readingUom: "C",
          min: 0,
          max: 5,
          result: "EXCEPTION",
          severity: "MEDIUM",
          correctiveAction:
            "Transferred high-risk items to walk-in chiller and rechecked after 15 minutes.",
        },
        {
          station: "Freezer",
          readingType: "Frozen storage temperature",
          readingValue: -17.2,
          readingUom: "C",
          min: -25,
          max: -15,
          result: "PASS",
          severity: "NORMAL",
          correctiveAction: "",
        },
        {
          station: "Rice Warmer",
          readingType: "Hot holding temperature",
          readingValue: 64,
          readingUom: "C",
          min: 60,
          max: 90,
          result: "PASS",
          severity: "NORMAL",
          correctiveAction: "",
        },
      ],
    },
    {
      locationId: "10000000-0000-4000-8000-000000000602",
      logType: "SANITATION",
      title: "Closing Sanitation Log",
      status: "EXCEPTION_OPEN",
      exceptionCount: 1,
      readings: [
        {
          station: "Table Grill Station",
          readingType: "Sanitation sign-off",
          readingValue: null,
          readingUom: null,
          min: null,
          max: null,
          result: "PASS",
          severity: "NORMAL",
          correctiveAction: "",
        },
        {
          station: "Grease Trap",
          readingType: "Closing sanitation evidence",
          readingValue: null,
          readingUom: null,
          min: null,
          max: null,
          result: "EXCEPTION",
          severity: "CRITICAL",
          correctiveAction:
            "Evidence missing. Manager must verify cleaning before next opening.",
        },
        {
          station: "Dining Area",
          readingType: "Guest area sanitation",
          readingValue: null,
          readingUom: null,
          min: null,
          max: null,
          result: "PASS",
          severity: "NORMAL",
          correctiveAction: "",
        },
      ],
    },
  ];

  for (const [logIndex, log] of demoLogs.entries()) {
    const foodSafetyLog = await prisma.foodSafetyLog.upsert({
      where: {
        companyId_locationId_businessDate_logType: {
          companyId: ids.companyId,
          locationId: log.locationId,
          businessDate: new Date("2026-07-02T00:00:00.000Z"),
          logType: log.logType,
        },
      },
      create: {
        id: `23000000-0000-4000-8000-${String(logIndex + 1).padStart(12, "0")}`,
        tenantId: ids.tenantId,
        companyId: ids.companyId,
        brandId: ids.brandId,
        locationId: log.locationId,
        businessDate: new Date("2026-07-02T00:00:00.000Z"),
        logType: log.logType,
        status: log.status,
        title: log.title,
        recordedByUserId: ids.userId,
        reviewedByUserId: log.status === "REVIEWED" ? ids.approverUserId : null,
        reviewedAt:
          log.status === "REVIEWED"
            ? new Date("2026-07-02T02:10:00.000Z")
            : null,
        exceptionCount: log.exceptionCount,
      },
      update: {
        brandId: ids.brandId,
        status: log.status,
        title: log.title,
        recordedByUserId: ids.userId,
        reviewedByUserId: log.status === "REVIEWED" ? ids.approverUserId : null,
        reviewedAt:
          log.status === "REVIEWED"
            ? new Date("2026-07-02T02:10:00.000Z")
            : null,
        exceptionCount: log.exceptionCount,
      },
    });

    await prisma.foodSafetyReading.deleteMany({
      where: { logId: foodSafetyLog.id },
    });
    await prisma.foodSafetyReading.createMany({
      data: log.readings.map((reading, readingIndex) => ({
        id: `23000000-0000-4000-8001-${String(logIndex * 20 + readingIndex + 1).padStart(12, "0")}`,
        tenantId: ids.tenantId,
        companyId: ids.companyId,
        brandId: ids.brandId,
        locationId: log.locationId,
        logId: foodSafetyLog.id,
        lineNo: readingIndex + 1,
        station: reading.station,
        readingType: reading.readingType,
        readingValue: reading.readingValue,
        readingUom: reading.readingUom,
        expectedMinValue: reading.min,
        expectedMaxValue: reading.max,
        result: reading.result,
        severity: reading.severity,
        correctiveAction: reading.correctiveAction,
        evidenceReference:
          reading.result === "EXCEPTION"
            ? `FOOD-SAFETY-EVIDENCE-${logIndex + 1}-${readingIndex + 1}`
            : null,
        recordedAt: new Date("2026-07-02T01:15:00.000Z"),
      })),
    });
  }
}

async function seedPhase2IncidentDemoData() {
  const incidents = [
    {
      incidentNumber: "INC-2026-0001",
      locationId: "10000000-0000-4000-8000-000000000601",
      category: "FOOD_SAFETY",
      severity: "HIGH",
      status: "IN_PROGRESS",
      title: "Reach-in chiller temperature excursion",
      summary:
        "Opening check found reach-in chiller above acceptable range. High-risk items were transferred pending manager review.",
      sourceRecordType: "FoodSafetyLog",
      sourceRecordId: "23000000-0000-4000-8000-000000000002",
      correctiveAction:
        "Verify recheck temperature, inspect affected items, and confirm discard or release decision.",
      evidenceReference: "FOOD-SAFETY-EVIDENCE-2-1",
      dueAt: new Date("2026-07-02T08:00:00.000Z"),
    },
    {
      incidentNumber: "INC-2026-0002",
      locationId: "10000000-0000-4000-8000-000000000602",
      category: "OTHER",
      severity: "CRITICAL",
      status: "OPEN",
      title: "Grease trap cleaning evidence missing",
      summary:
        "Closing checklist and food-safety log both flagged missing grease trap cleaning evidence.",
      sourceRecordType: "BranchOperationalChecklist",
      sourceRecordId: "22000000-0000-4000-8000-000000000003",
      correctiveAction:
        "Manager must verify cleaning completion and attach evidence before next opening.",
      evidenceReference: "OPS-EVIDENCE-3-5",
      dueAt: new Date("2026-07-02T23:00:00.000Z"),
    },
    {
      incidentNumber: "INC-2026-0003",
      locationId: ids.locationId,
      category: "SERVICE",
      severity: "MEDIUM",
      status: "RESOLVED",
      title: "Guest complaint on delayed table grill turnover",
      summary:
        "Lunch-period guest complaint logged after delayed table grill replacement during peak demand.",
      sourceRecordType: null,
      sourceRecordId: null,
      correctiveAction:
        "Shift lead adjusted station assignment and confirmed table turnover checklist with service team.",
      evidenceReference: "SERVICE-NOTE-2026-0003",
      dueAt: new Date("2026-07-03T04:00:00.000Z"),
      resolvedAt: new Date("2026-07-02T07:30:00.000Z"),
    },
  ];

  for (const [incidentIndex, incident] of incidents.entries()) {
    await prisma.operationalIncident.upsert({
      where: {
        companyId_incidentNumber: {
          companyId: ids.companyId,
          incidentNumber: incident.incidentNumber,
        },
      },
      create: {
        id: `24000000-0000-4000-8000-${String(incidentIndex + 1).padStart(12, "0")}`,
        tenantId: ids.tenantId,
        companyId: ids.companyId,
        brandId: ids.brandId,
        locationId: incident.locationId,
        incidentNumber: incident.incidentNumber,
        incidentDate: new Date("2026-07-02T01:45:00.000Z"),
        category: incident.category,
        severity: incident.severity,
        status: incident.status,
        title: incident.title,
        summary: incident.summary,
        reportedByUserId: ids.userId,
        ownerUserId: ids.approverUserId,
        sourceRecordType: incident.sourceRecordType,
        sourceRecordId: incident.sourceRecordId,
        correctiveAction: incident.correctiveAction,
        evidenceReference: incident.evidenceReference,
        dueAt: incident.dueAt,
        resolvedAt: incident.resolvedAt ?? null,
      },
      update: {
        brandId: ids.brandId,
        locationId: incident.locationId,
        incidentDate: new Date("2026-07-02T01:45:00.000Z"),
        category: incident.category,
        severity: incident.severity,
        status: incident.status,
        title: incident.title,
        summary: incident.summary,
        reportedByUserId: ids.userId,
        ownerUserId: ids.approverUserId,
        sourceRecordType: incident.sourceRecordType,
        sourceRecordId: incident.sourceRecordId,
        correctiveAction: incident.correctiveAction,
        evidenceReference: incident.evidenceReference,
        dueAt: incident.dueAt,
        resolvedAt: incident.resolvedAt ?? null,
      },
    });
  }
}

async function seedPhase2MaintenanceDemoData() {
  const tickets = [
    {
      ticketNumber: "MT-2026-0001",
      locationId: "10000000-0000-4000-8000-000000000602",
      category: "EQUIPMENT",
      assetName: "Table Grill Exhaust Line 4",
      assetArea: "Dining Room",
      priority: "CRITICAL",
      status: "OPEN",
      title: "Exhaust suction weak on table grill line",
      description:
        "Closing inspection flagged weak suction on one grill exhaust line after peak service.",
      correctiveAction:
        "Facilities vendor to inspect duct path and fan belt before next peak period.",
      evidenceReference: "OPS-EVIDENCE-3-5",
      sourceIncidentId: "24000000-0000-4000-8000-000000000002",
      downtimeMinutes: 45,
      targetDueAt: new Date("2026-07-03T03:00:00.000Z"),
    },
    {
      ticketNumber: "MT-2026-0002",
      locationId: "10000000-0000-4000-8000-000000000601",
      category: "EQUIPMENT",
      assetName: "Reach-in Chiller",
      assetArea: "Kitchen Cold Line",
      priority: "HIGH",
      status: "IN_PROGRESS",
      title: "Reach-in chiller temperature excursion",
      description:
        "Food-safety log recorded chiller temperature above acceptable range during opening checks.",
      correctiveAction:
        "Technician to verify thermostat calibration and door gasket condition.",
      evidenceReference: "FOOD-SAFETY-EVIDENCE-2-1",
      sourceIncidentId: "24000000-0000-4000-8000-000000000001",
      downtimeMinutes: 30,
      targetDueAt: new Date("2026-07-02T08:30:00.000Z"),
    },
    {
      ticketNumber: "MT-2026-0003",
      locationId: ids.locationId,
      category: "FACILITY",
      assetName: "Dining Area Table Grill Tooling",
      assetArea: "Dining Room",
      priority: "MEDIUM",
      status: "COMPLETED",
      title: "Replacement grill tongs and tray holders",
      description:
        "Guest service delay linked to insufficient replacement grill tools during lunch peak.",
      correctiveAction:
        "Added spare tong and tray-holder set to the service station par list.",
      evidenceReference: "SERVICE-NOTE-2026-0003",
      sourceIncidentId: "24000000-0000-4000-8000-000000000003",
      downtimeMinutes: 0,
      targetDueAt: new Date("2026-07-03T04:00:00.000Z"),
      completedAt: new Date("2026-07-02T07:45:00.000Z"),
    },
  ];

  for (const [ticketIndex, ticket] of tickets.entries()) {
    await prisma.maintenanceTicket.upsert({
      where: {
        companyId_ticketNumber: {
          companyId: ids.companyId,
          ticketNumber: ticket.ticketNumber,
        },
      },
      create: {
        id: `25000000-0000-4000-8000-${String(ticketIndex + 1).padStart(12, "0")}`,
        tenantId: ids.tenantId,
        companyId: ids.companyId,
        brandId: ids.brandId,
        locationId: ticket.locationId,
        ticketNumber: ticket.ticketNumber,
        requestedAt: new Date("2026-07-02T02:15:00.000Z"),
        category: ticket.category,
        assetName: ticket.assetName,
        assetArea: ticket.assetArea,
        priority: ticket.priority,
        status: ticket.status,
        title: ticket.title,
        description: ticket.description,
        reportedByUserId: ids.userId,
        ownerUserId: ids.approverUserId,
        sourceIncidentId: ticket.sourceIncidentId,
        downtimeMinutes: ticket.downtimeMinutes,
        targetDueAt: ticket.targetDueAt,
        completedAt: ticket.completedAt ?? null,
        correctiveAction: ticket.correctiveAction,
        evidenceReference: ticket.evidenceReference,
      },
      update: {
        brandId: ids.brandId,
        locationId: ticket.locationId,
        requestedAt: new Date("2026-07-02T02:15:00.000Z"),
        category: ticket.category,
        assetName: ticket.assetName,
        assetArea: ticket.assetArea,
        priority: ticket.priority,
        status: ticket.status,
        title: ticket.title,
        description: ticket.description,
        reportedByUserId: ids.userId,
        ownerUserId: ids.approverUserId,
        sourceIncidentId: ticket.sourceIncidentId,
        downtimeMinutes: ticket.downtimeMinutes,
        targetDueAt: ticket.targetDueAt,
        completedAt: ticket.completedAt ?? null,
        correctiveAction: ticket.correctiveAction,
        evidenceReference: ticket.evidenceReference,
      },
    });
  }
}

async function seedOpeningInventoryBalances() {
  const inventoryLocations = await prisma.inventoryLocation.findMany({
    where: {
      id: {
        in: [
          ids.warehouseInventoryLocationId,
          ...demoBranchLocations.map((location) => location.inventoryLocationId),
        ],
      },
      companyId: ids.companyId,
    },
    select: {
      id: true,
      locationId: true,
      code: true,
    },
  });
  const locationByInventoryId = new Map(
    inventoryLocations.map((inventoryLocation) => [
      inventoryLocation.id,
      inventoryLocation,
    ]),
  );

  const openingQuantities = new Map<string, number>([
    ["BEEF-KARUBI-SHORTPLATE-KG", 36],
    ["BEEF-HARAMI-SKIRT-KG", 18],
    ["BEEF-TONGUE-US-KG", 10],
    ["BEEF-WAGYU-CUBES-KG", 8],
    ["BEEF-SUKIYAKI-SLICE-KG", 16],
    ["PORK-BELLY-YAKINIKU-KG", 22],
    ["PORK-SHOULDER-SLICE-KG", 18],
    ["CHICKEN-THIGH-KG", 24],
    ["CHICKEN-KARAAGE-CUT-KG", 18],
    ["SHRIMP-PDTO-31-40-KG", 12],
    ["JAPANESE-RICE-25KG", 12],
    ["SUSHI-RICE-20KG", 8],
    ["YAKINIKU-TARE-L", 28],
    ["GARLIC-SOY-SAUCE-L", 18],
    ["SESAME-OIL-L", 12],
    ["KIMCHI-KG", 24],
    ["LETTUCE-GREEN-KG", 16],
    ["ONION-WHITE-KG", 20],
    ["GARLIC-PEELED-KG", 10],
    ["SHIITAKE-MUSHROOM-KG", 8],
    ["YAKINIKU-TAKEOUT-BOX", 20],
    ["CHOPSTICKS-WRAPPED", 24],
    ["SAUCE-CUP-2OZ", 18],
    ["CHARCOAL-BINCHOTAN-KG", 40],
    ["GRILL-NET-ROUND", 30],
    ["LYCHEE-ICED-TEA-L", 24],
    ["CALAMANSI-JUICE-L", 24],
  ]);

  const items = await prisma.item.findMany({
    where: {
      companyId: ids.companyId,
      itemCode: { in: [...openingQuantities.keys()] },
      trackInventory: true,
      status: "ACTIVE",
    },
    select: {
      id: true,
      itemCode: true,
      baseUomId: true,
      trackExpiry: true,
      trackLot: true,
    },
    orderBy: { itemCode: "asc" },
  });

  const openingDate = new Date("2026-07-01T01:00:00.000Z");
  let sequence = 1;

  for (const inventoryLocation of inventoryLocations) {
    const isWarehouse = inventoryLocation.id === ids.warehouseInventoryLocationId;
    const branchMultiplier = isWarehouse ? 5 : 1;

    for (const item of items) {
      const baseQuantity = openingQuantities.get(item.itemCode) ?? 0;
      const quantity = baseQuantity * branchMultiplier;
      if (quantity <= 0) {
        continue;
      }

      const lotNumber = item.trackLot
        ? `OB-${item.itemCode.replace(/[^A-Z0-9]/g, "").slice(0, 12)}`
        : null;
      const expiryDate = item.trackExpiry
        ? new Date("2026-12-31T15:59:59.000Z")
        : null;
      const lotKey =
        lotNumber && expiryDate
          ? `${lotNumber}|${expiryDate.toISOString().slice(0, 10)}`
          : "NOLOT|NOEXP";
      const sourceDocumentId = `10000000-0000-4000-8001-${String(sequence).padStart(
        12,
        "0",
      )}`;
      const sourceEventKey = `opening:${inventoryLocation.id}:${item.id}`;

      await prisma.inventoryMovement.upsert({
        where: {
          tenantId_companyId_sourceDocumentType_sourceDocumentId_sourceEventKey: {
            tenantId: ids.tenantId,
            companyId: ids.companyId,
            sourceDocumentType: "DEMO_OPENING_BALANCE",
            sourceDocumentId,
            sourceEventKey,
          },
        },
        create: {
          tenantId: ids.tenantId,
          companyId: ids.companyId,
          inventoryLocationId: inventoryLocation.id,
          itemId: item.id,
          movementType: "OPENING_BALANCE_IN",
          occurredAt: openingDate,
          enteredQuantity: quantity,
          enteredUomId: item.baseUomId,
          quantityDeltaBaseUom: quantity,
          baseUomId: item.baseUomId,
          lotNumber,
          expiryDate,
          sourceDocumentType: "DEMO_OPENING_BALANCE",
          sourceDocumentId,
          sourceEventKey,
          reasonCode: "OPENING_BALANCE",
          notes: `Demo opening balance for ${
            locationByInventoryId.get(inventoryLocation.id)?.code ?? "inventory location"
          }.`,
          postedByUserId: ids.adminUserId,
        },
        update: {
          occurredAt: openingDate,
          enteredQuantity: quantity,
          quantityDeltaBaseUom: quantity,
          lotNumber,
          expiryDate,
          reasonCode: "OPENING_BALANCE",
          notes: `Demo opening balance for ${
            locationByInventoryId.get(inventoryLocation.id)?.code ?? "inventory location"
          }.`,
        },
      });

      await prisma.inventoryBalance.upsert({
        where: {
          inventoryLocationId_itemId_lotKey: {
            inventoryLocationId: inventoryLocation.id,
            itemId: item.id,
            lotKey,
          },
        },
        create: {
          tenantId: ids.tenantId,
          companyId: ids.companyId,
          inventoryLocationId: inventoryLocation.id,
          itemId: item.id,
          lotKey,
          lotNumber,
          expiryDate,
          baseUomId: item.baseUomId,
          qtyOnHand: quantity,
        },
        update: {
          lotNumber,
          expiryDate,
          baseUomId: item.baseUomId,
          qtyOnHand: quantity,
        },
      });

      sequence += 1;
    }
  }
}

async function seedPhase2ActualConsumptionDemoData() {
  const branchConsumptions = [
    {
      inventoryLocationId: ids.inventoryLocationId,
      locationLabel: "SM North EDSA",
      lines: [
        { itemCode: "BEEF-KARUBI-SHORTPLATE-KG", quantity: 12.8, movementType: "WASTAGE_OUT" },
        { itemCode: "BEEF-HARAMI-SKIRT-KG", quantity: 5.4, movementType: "WASTAGE_OUT" },
        { itemCode: "BEEF-TONGUE-US-KG", quantity: 2.6, movementType: "ADJUSTMENT_OUT" },
        { itemCode: "PORK-BELLY-YAKINIKU-KG", quantity: 7.5, movementType: "COUNT_VARIANCE_OUT" },
        { itemCode: "YAKINIKU-TARE-L", quantity: 6.2, movementType: "WASTAGE_OUT" },
      ],
    },
    {
      inventoryLocationId: "10000000-0000-4000-8000-000000000701",
      locationLabel: "SM Mall of Asia",
      lines: [
        { itemCode: "BEEF-KARUBI-SHORTPLATE-KG", quantity: 15.1, movementType: "WASTAGE_OUT" },
        { itemCode: "BEEF-HARAMI-SKIRT-KG", quantity: 6.7, movementType: "WASTAGE_OUT" },
        { itemCode: "BEEF-WAGYU-CUBES-KG", quantity: 2.2, movementType: "ADJUSTMENT_OUT" },
        { itemCode: "PORK-BELLY-YAKINIKU-KG", quantity: 6.4, movementType: "COUNT_VARIANCE_OUT" },
        { itemCode: "YAKINIKU-TARE-L", quantity: 7.1, movementType: "WASTAGE_OUT" },
      ],
    },
    {
      inventoryLocationId: "10000000-0000-4000-8000-000000000702",
      locationLabel: "SM Mega Mall",
      lines: [
        { itemCode: "BEEF-KARUBI-SHORTPLATE-KG", quantity: 13.8, movementType: "WASTAGE_OUT" },
        { itemCode: "BEEF-HARAMI-SKIRT-KG", quantity: 6.1, movementType: "WASTAGE_OUT" },
        { itemCode: "BEEF-TONGUE-US-KG", quantity: 3.1, movementType: "ADJUSTMENT_OUT" },
        { itemCode: "PORK-BELLY-YAKINIKU-KG", quantity: 8.3, movementType: "COUNT_VARIANCE_OUT" },
        { itemCode: "YAKINIKU-TARE-L", quantity: 6.8, movementType: "WASTAGE_OUT" },
      ],
    },
  ];
  const itemCodes = Array.from(
    new Set(branchConsumptions.flatMap((branch) => branch.lines.map((line) => line.itemCode))),
  );
  const items = await prisma.item.findMany({
    where: {
      companyId: ids.companyId,
      itemCode: { in: itemCodes },
      trackInventory: true,
      status: "ACTIVE",
    },
    select: { id: true, itemCode: true, baseUomId: true },
  });
  const itemByCode = new Map(items.map((item) => [item.itemCode, item]));
  const prices = await prisma.supplierPriceHistory.findMany({
    where: {
      companyId: ids.companyId,
      itemId: { in: items.map((item) => item.id) },
      effectiveTo: null,
    },
    select: { itemId: true, unitPrice: true },
  });
  const unitPriceByItemId = new Map(
    prices.map((price) => [price.itemId, Number(price.unitPrice)]),
  );
  let sequence = 1;

  for (const branch of branchConsumptions) {
    for (const line of branch.lines) {
      const item = itemByCode.get(line.itemCode);
      if (!item) {
        throw new Error(`MISSING_ACTUAL_CONSUMPTION_ITEM:${line.itemCode}`);
      }
      const balance = await prisma.inventoryBalance.findFirst({
        where: {
          companyId: ids.companyId,
          inventoryLocationId: branch.inventoryLocationId,
          itemId: item.id,
        },
        orderBy: { updatedAt: "desc" },
      });
      const unitCost = unitPriceByItemId.get(item.id) ?? 0;
      const totalCost = Number((line.quantity * unitCost).toFixed(2));
      const sourceDocumentId = `22000000-0000-4000-8000-${String(sequence).padStart(
        12,
        "0",
      )}`;
      const sourceEventKey = `phase2_actual:${branch.inventoryLocationId}:${item.id}:${line.movementType}`;

      await prisma.inventoryMovement.upsert({
        where: {
          tenantId_companyId_sourceDocumentType_sourceDocumentId_sourceEventKey: {
            tenantId: ids.tenantId,
            companyId: ids.companyId,
            sourceDocumentType: "DEMO_PHASE2_ACTUAL_CONSUMPTION",
            sourceDocumentId,
            sourceEventKey,
          },
        },
        create: {
          id: `22000000-0000-4000-8001-${String(sequence).padStart(12, "0")}`,
          tenantId: ids.tenantId,
          companyId: ids.companyId,
          inventoryLocationId: branch.inventoryLocationId,
          itemId: item.id,
          movementType: line.movementType as "WASTAGE_OUT" | "ADJUSTMENT_OUT" | "COUNT_VARIANCE_OUT",
          occurredAt: new Date("2026-07-02T14:30:00.000Z"),
          enteredQuantity: line.quantity,
          enteredUomId: item.baseUomId,
          quantityDeltaBaseUom: -Math.abs(line.quantity),
          baseUomId: item.baseUomId,
          lotNumber: balance?.lotNumber ?? null,
          expiryDate: balance?.expiryDate ?? null,
          unitCost,
          totalCost,
          sourceDocumentType: "DEMO_PHASE2_ACTUAL_CONSUMPTION",
          sourceDocumentId,
          sourceEventKey,
          reasonCode: "PHASE2_ACTUAL_CONSUMPTION_DEMO",
          notes: `Demo Phase II actual consumption snapshot for ${branch.locationLabel}.`,
          postedByUserId: ids.adminUserId,
        },
        update: {
          occurredAt: new Date("2026-07-02T14:30:00.000Z"),
          enteredQuantity: line.quantity,
          quantityDeltaBaseUom: -Math.abs(line.quantity),
          lotNumber: balance?.lotNumber ?? null,
          expiryDate: balance?.expiryDate ?? null,
          unitCost,
          totalCost,
          reasonCode: "PHASE2_ACTUAL_CONSUMPTION_DEMO",
          notes: `Demo Phase II actual consumption snapshot for ${branch.locationLabel}.`,
        },
      });

      if (balance) {
        await prisma.inventoryBalance.update({
          where: { id: balance.id },
          data: { qtyOnHand: Math.max(0, Number(balance.qtyOnHand) - line.quantity) },
        });
      }
      sequence += 1;
    }
  }
}

async function main() {
  const tenantName = process.env.DEMO_TENANT_NAME ?? "One Gourmet Restaurant Group";
  const companyName = process.env.DEMO_COMPANY_NAME ?? "One Gourmet Foods Inc.";
  const brandName = process.env.DEMO_BRAND_NAME ?? "Yakiniku Like";
  const locationName =
    process.env.DEMO_LOCATION_NAME ?? demoBranchLocations[0]?.name ?? "Yakiniku Like";
  const userEmail =
    process.env.DEMO_USER_EMAIL ?? "storekeeper.bgc@ogfi.example";
  const approverEmail =
    process.env.DEMO_APPROVER_EMAIL ?? "ops.approver@ogfi.example";
  const adminEmail = process.env.DEMO_ADMIN_EMAIL ?? "erp.admin@ogfi.example";
  const superEmail =
    process.env.DEMO_SUPER_USER_EMAIL ?? "super.admin@ogfi.example";
  const shouldResetDemoData = process.env.DEMO_RESET_DATA === "true";

  if (shouldResetDemoData) {
    await resetDemoData();
    console.log("Cleared local demo operational, project, supplier, and item data.");
  }

  await prisma.tenant.upsert({
    where: { id: ids.tenantId },
    create: {
      id: ids.tenantId,
      name: tenantName,
      defaultTimezone: "Asia/Manila",
    },
    update: {
      name: tenantName,
    },
  });

  await prisma.company.upsert({
    where: { id: ids.companyId },
    create: {
      id: ids.companyId,
      tenantId: ids.tenantId,
      code: "OGF",
      legalName: companyName,
      tradingName: companyName,
      currencyCode: "PHP",
      timezone: "Asia/Manila",
    },
    update: {
      code: "OGF",
      legalName: companyName,
      tradingName: companyName,
    },
  });

  await prisma.brand.upsert({
    where: { id: ids.brandId },
    create: {
      id: ids.brandId,
      tenantId: ids.tenantId,
      companyId: ids.companyId,
      code: "YL",
      name: brandName,
    },
    update: {
      code: "YL",
      name: brandName,
    },
  });

  for (const [index, branch] of demoBranchLocations.entries()) {
    await prisma.location.upsert({
      where: { id: branch.id },
      create: {
        id: branch.id,
        tenantId: ids.tenantId,
        companyId: ids.companyId,
        brandId: ids.brandId,
        code: branch.code,
        name: index === 0 ? locationName : branch.name,
        address: branch.address,
        locationType: "BRANCH",
        timezone: "Asia/Manila",
      },
      update: {
        brandId: ids.brandId,
        code: branch.code,
        name: index === 0 ? locationName : branch.name,
        address: branch.address,
        status: "ACTIVE",
      },
    });
  }

  await prisma.location.upsert({
    where: { id: ids.warehouseLocationId },
    create: {
      id: ids.warehouseLocationId,
      tenantId: ids.tenantId,
      companyId: ids.companyId,
      code: "OGF-MAIN-WH",
      name: "One Gourmet Main Warehouse",
      locationType: "WAREHOUSE",
      timezone: "Asia/Manila",
    },
    update: {
      code: "OGF-MAIN-WH",
      name: "One Gourmet Main Warehouse",
      status: "ACTIVE",
    },
  });

  for (const [index, branch] of demoBranchLocations.entries()) {
    const branchName = index === 0 ? locationName : branch.name;
    await prisma.inventoryLocation.upsert({
      where: { id: branch.inventoryLocationId },
      create: {
        id: branch.inventoryLocationId,
        tenantId: ids.tenantId,
        companyId: ids.companyId,
        locationId: branch.id,
        code: branch.inventoryCode,
        name: `${branchName} Cold and Dry Storage`,
        storageType: "DEFAULT",
      },
      update: {
        locationId: branch.id,
        code: branch.inventoryCode,
        name: `${branchName} Cold and Dry Storage`,
        status: "ACTIVE",
      },
    });
  }

  await prisma.inventoryLocation.upsert({
    where: { id: ids.warehouseInventoryLocationId },
    create: {
      id: ids.warehouseInventoryLocationId,
      tenantId: ids.tenantId,
      companyId: ids.companyId,
      locationId: ids.warehouseLocationId,
      code: "OGF-MAIN-WH-STOCK",
      name: "One Gourmet Main Warehouse Cold and Dry Storage",
      storageType: "DEFAULT",
    },
    update: {
      code: "OGF-MAIN-WH-STOCK",
      name: "One Gourmet Main Warehouse Cold and Dry Storage",
      status: "ACTIVE",
    },
  });

  await prisma.supplier.upsert({
    where: { id: ids.supplierId },
    create: {
      id: ids.supplierId,
      tenantId: ids.tenantId,
      companyId: ids.companyId,
      supplierCode: "FRESHFARM-MNL",
      legalName: "FreshFarm Produce Trading Corporation",
      tradingName: "FreshFarm Manila",
      paymentTerms: "Net 15 after verified receiving",
    },
    update: {
      supplierCode: "FRESHFARM-MNL",
      legalName: "FreshFarm Produce Trading Corporation",
      tradingName: "FreshFarm Manila",
      paymentTerms: "Net 15 after verified receiving",
    },
  });

  await prisma.supplierContact.upsert({
    where: { id: ids.supplierContactId },
    create: {
      id: ids.supplierContactId,
      supplierId: ids.supplierId,
      name: "Mara Santos",
      role: "Key Account Manager",
      email: "mara.santos@freshfarm.example",
      phone: "+63-917-555-0184",
      isPrimary: true,
    },
    update: {
      name: "Mara Santos",
      role: "Key Account Manager",
      email: "mara.santos@freshfarm.example",
      phone: "+63-917-555-0184",
      isPrimary: true,
    },
  });

  await prisma.itemCategory.upsert({
    where: { id: ids.itemCategoryId },
    create: {
      id: ids.itemCategoryId,
      tenantId: ids.tenantId,
      companyId: ids.companyId,
      categoryCode: "PRODUCE-FRESH",
      categoryName: "Fresh Produce",
      inventoryClass: "food",
      requiresExpiryTracking: true,
      requiresLotTracking: true,
      defaultWastageRequiresPhoto: true,
    },
    update: {
      categoryCode: "PRODUCE-FRESH",
      categoryName: "Fresh Produce",
      inventoryClass: "food",
      requiresExpiryTracking: true,
      requiresLotTracking: true,
      defaultWastageRequiresPhoto: true,
    },
  });

  await prisma.uom.upsert({
    where: {
      companyId_uomCode: {
        companyId: ids.companyId,
        uomCode: "KG",
      },
    },
    create: {
      id: ids.kilogramUomId,
      tenantId: ids.tenantId,
      companyId: ids.companyId,
      uomCode: "KG",
      uomName: "Kilogram",
      uomType: "weight",
      decimalPrecision: 3,
    },
    update: {
      uomName: "Kilogram",
      uomType: "weight",
      decimalPrecision: 3,
    },
  });

  await prisma.uom.upsert({
    where: {
      companyId_uomCode: {
        companyId: ids.companyId,
        uomCode: "G",
      },
    },
    create: {
      id: ids.gramUomId,
      tenantId: ids.tenantId,
      companyId: ids.companyId,
      uomCode: "G",
      uomName: "Gram",
      uomType: "weight",
      decimalPrecision: 0,
    },
    update: {
      uomName: "Gram",
      uomType: "weight",
      decimalPrecision: 0,
    },
  });

  await prisma.item.upsert({
    where: { id: ids.itemId },
    create: {
      id: ids.itemId,
      tenantId: ids.tenantId,
      companyId: ids.companyId,
      itemCode: "SHIITAKE-MUSHROOM-KG",
      itemName: "Shiitake Mushroom",
      itemCategoryId: ids.itemCategoryId,
      itemType: "inventory",
      baseUomId: ids.kilogramUomId,
      purchaseUomId: ids.kilogramUomId,
      issueUomId: ids.gramUomId,
      trackInventory: true,
      trackExpiry: true,
      trackLot: true,
      requiresReceivingInspection: true,
    },
    update: {
      itemCode: "SHIITAKE-MUSHROOM-KG",
      itemName: "Shiitake Mushroom",
      itemCategoryId: ids.itemCategoryId,
      itemType: "inventory",
      baseUomId: ids.kilogramUomId,
      purchaseUomId: ids.kilogramUomId,
      issueUomId: ids.gramUomId,
      trackInventory: true,
      trackExpiry: true,
      trackLot: true,
      requiresReceivingInspection: true,
    },
  });

  await prisma.itemUomConversion.upsert({
    where: {
      itemId_fromUomId_toUomId: {
        itemId: ids.itemId,
        fromUomId: ids.kilogramUomId,
        toUomId: ids.gramUomId,
      },
    },
    create: {
      id: ids.itemConversionId,
      itemId: ids.itemId,
      fromUomId: ids.kilogramUomId,
      toUomId: ids.gramUomId,
      conversionFactor: 1000,
      roundingRule: "none",
    },
    update: {
      conversionFactor: 1000,
      roundingRule: "none",
    },
  });

  await prisma.supplierItemLink.upsert({
    where: {
      supplierId_itemId_purchaseUomId: {
        supplierId: ids.supplierId,
        itemId: ids.itemId,
        purchaseUomId: ids.kilogramUomId,
      },
    },
    create: {
      id: ids.supplierItemLinkId,
      tenantId: ids.tenantId,
      companyId: ids.companyId,
      supplierId: ids.supplierId,
      itemId: ids.itemId,
      purchaseUomId: ids.kilogramUomId,
      supplierSku: "FFM-SHIITAKE-KG",
      supplierItemName: "Shiitake Mushroom",
      leadTimeDays: 3,
      minOrderQty: 1,
      preferredRank: 1,
    },
    update: {
      supplierSku: "FFM-SHIITAKE-KG",
      supplierItemName: "Shiitake Mushroom",
      leadTimeDays: 3,
      minOrderQty: 1,
      preferredRank: 1,
      status: "ACTIVE",
    },
  });

  await prisma.supplierPriceHistory.upsert({
    where: { id: ids.supplierPriceHistoryId },
    create: {
      id: ids.supplierPriceHistoryId,
      tenantId: ids.tenantId,
      companyId: ids.companyId,
      supplierId: ids.supplierId,
      itemId: ids.itemId,
      supplierItemLinkId: ids.supplierItemLinkId,
      uomId: ids.kilogramUomId,
      currencyCode: "PHP",
      unitPrice: 260,
      effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
    },
    update: {
      supplierItemLinkId: ids.supplierItemLinkId,
      uomId: ids.kilogramUomId,
      currencyCode: "PHP",
      unitPrice: 260,
      effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
    },
  });

  await seedRestaurantDemoCatalog();
  await seedPhase2RecipeDemoData();
  await seedPhase2SalesImportDemoData();
  await seedPhase2BranchOperationsDemoData();
  await seedPhase2FoodSafetyDemoData();
  await seedPhase2IncidentDemoData();
  await seedPhase2MaintenanceDemoData();

  await prisma.user.upsert({
    where: { id: ids.userId },
    create: {
      id: ids.userId,
      tenantId: ids.tenantId,
      email: userEmail,
      displayName: "Bianca Reyes",
    },
    update: {
      email: userEmail,
      displayName: "Bianca Reyes",
    },
  });

  await prisma.user.upsert({
    where: { id: ids.chromiumScopeCandidateUserId },
    create: {
      id: ids.chromiumScopeCandidateUserId,
      tenantId: ids.tenantId,
      email: "branch.runner.bgc@ogfi.example",
      displayName: "Paolo Cruz",
    },
    update: {
      email: "branch.runner.bgc@ogfi.example",
      displayName: "Paolo Cruz",
    },
  });

  await prisma.user.upsert({
    where: { id: ids.mobileScopeCandidateUserId },
    create: {
      id: ids.mobileScopeCandidateUserId,
      tenantId: ids.tenantId,
      email: "inventory.clerk.bgc@ogfi.example",
      displayName: "Lia Mendoza",
    },
    update: {
      email: "inventory.clerk.bgc@ogfi.example",
      displayName: "Lia Mendoza",
    },
  });

  await prisma.user.upsert({
    where: { id: ids.adminUserId },
    create: {
      id: ids.adminUserId,
      tenantId: ids.tenantId,
      email: adminEmail,
      displayName: "Nico Valdez",
    },
    update: {
      email: adminEmail,
      displayName: "Nico Valdez",
    },
  });

  await prisma.user.upsert({
    where: { id: ids.secondaryAdminUserId },
    create: {
      id: ids.secondaryAdminUserId,
      tenantId: ids.tenantId,
      email: "systems.admin@ogfi.example",
      displayName: "Mara dela Cruz",
    },
    update: {
      email: "systems.admin@ogfi.example",
      displayName: "Mara dela Cruz",
      status: "ACTIVE",
    },
  });

  await prisma.user.upsert({
    where: { id: ids.superUserId },
    create: {
      id: ids.superUserId,
      tenantId: ids.tenantId,
      email: superEmail,
      displayName: "System Super User",
    },
    update: {
      email: superEmail,
      displayName: "System Super User",
      status: "ACTIVE",
    },
  });

  await prisma.user.upsert({
    where: { id: ids.approverUserId },
    create: {
      id: ids.approverUserId,
      tenantId: ids.tenantId,
      email: approverEmail,
      displayName: "Alyssa Tan",
    },
    update: {
      email: approverEmail,
      displayName: "Alyssa Tan",
    },
  });

  await seedDec0036CompanyPolicyDefaults();
  await seedFinanceConfigurationFoundation();
  await seedFinanceJournalDemoData();
  await seedBudgetControlDemoData();
  await seedExpenseRequestDemoData();
  await seedCashAdvanceDemoData();
  await seedPettyCashDemoData();
  await seedFinanceCloseReadinessDemoData();
  await seedApInvoiceDemoData();
  await seedBankCashDemoData();
  await seedPaymentReleaseDemoData();
  await seedWorkforceDemoData();
  await seedProjectMigrationRehearsalData();

  await prisma.role.upsert({
    where: {
      tenantId_code: {
        tenantId: ids.tenantId,
        code: "CONFIGURED_REQUESTER",
      },
    },
    create: {
      id: ids.requesterRoleId,
      tenantId: ids.tenantId,
      code: "CONFIGURED_REQUESTER",
      name: "Branch Storekeeper",
    },
    update: {
      name: "Branch Storekeeper",
    },
  });

  await prisma.role.upsert({
    where: {
      tenantId_code: {
        tenantId: ids.tenantId,
        code: "CONFIGURED_APPROVER",
      },
    },
    create: {
      id: ids.approverRoleId,
      tenantId: ids.tenantId,
      code: "CONFIGURED_APPROVER",
      name: "Operations Approver",
    },
    update: {
      name: "Operations Approver",
    },
  });

  await prisma.role.upsert({
    where: {
      tenantId_code: {
        tenantId: ids.tenantId,
        code: "CONFIGURED_ADMIN",
      },
    },
    create: {
      id: ids.adminRoleId,
      tenantId: ids.tenantId,
      code: "CONFIGURED_ADMIN",
      name: "ERP Administrator",
    },
    update: {
      name: "ERP Administrator",
    },
  });

  await prisma.role.upsert({
    where: {
      tenantId_code: {
        tenantId: ids.tenantId,
        code: "CONFIGURED_SUPER_USER",
      },
    },
    create: {
      id: ids.superRoleId,
      tenantId: ids.tenantId,
      code: "CONFIGURED_SUPER_USER",
      name: "System Super User",
      systemRole: true,
    },
    update: {
      name: "System Super User",
      systemRole: true,
      status: "ACTIVE",
    },
  });

  await prisma.permission.upsert({
    where: { code: "core.administer" },
    create: {
      id: ids.administerPermissionId,
      code: "core.administer",
      module: "core",
      action: "administer",
    },
    update: {},
  });

  await prisma.permission.upsert({
    where: { code: "purchasing.purchase_request.create" },
    create: {
      id: ids.createPermissionId,
      code: "purchasing.purchase_request.create",
      module: "purchasing",
      action: "purchase_request.create",
    },
    update: {},
  });

  await prisma.permission.upsert({
    where: { code: "purchasing.purchase_request.approve" },
    create: {
      id: ids.approvePermissionId,
      code: "purchasing.purchase_request.approve",
      module: "purchasing",
      action: "purchase_request.approve",
    },
    update: {},
  });

  await prisma.permission.upsert({
    where: { code: "purchasing.purchase_request.submit" },
    create: {
      id: ids.submitPermissionId,
      code: "purchasing.purchase_request.submit",
      module: "purchasing",
      action: "purchase_request.submit",
    },
    update: {},
  });

  await prisma.permission.upsert({
    where: { code: "purchasing.quote.manage" },
    create: {
      id: ids.quoteManagePermissionId,
      code: "purchasing.quote.manage",
      module: "purchasing",
      action: "quote.manage",
    },
    update: {},
  });

  await prisma.permission.upsert({
    where: { code: "purchasing.quote.approve" },
    create: {
      id: ids.quoteApprovePermissionId,
      code: "purchasing.quote.approve",
      module: "purchasing",
      action: "quote.approve",
    },
    update: {},
  });

  await prisma.permission.upsert({
    where: { code: "purchasing.purchase_order.view" },
    create: {
      id: ids.purchaseOrderViewPermissionId,
      code: "purchasing.purchase_order.view",
      module: "purchasing",
      action: "purchase_order.view",
    },
    update: {},
  });

  await prisma.permission.upsert({
    where: { code: "purchasing.purchase_order.create" },
    create: {
      id: ids.purchaseOrderCreatePermissionId,
      code: "purchasing.purchase_order.create",
      module: "purchasing",
      action: "purchase_order.create",
    },
    update: {},
  });

  await prisma.permission.upsert({
    where: { code: "purchasing.purchase_order.submit" },
    create: {
      id: ids.purchaseOrderSubmitPermissionId,
      code: "purchasing.purchase_order.submit",
      module: "purchasing",
      action: "purchase_order.submit",
    },
    update: {},
  });

  await prisma.permission.upsert({
    where: { code: "purchasing.purchase_order.approve" },
    create: {
      id: ids.purchaseOrderApprovePermissionId,
      code: "purchasing.purchase_order.approve",
      module: "purchasing",
      action: "purchase_order.approve",
    },
    update: {},
  });

  await prisma.permission.upsert({
    where: { code: "purchasing.purchase_order.issue" },
    create: {
      id: ids.purchaseOrderIssuePermissionId,
      code: "purchasing.purchase_order.issue",
      module: "purchasing",
      action: "purchase_order.issue",
    },
    update: {},
  });

  await prisma.permission.upsert({
    where: { code: "purchasing.purchase_order.cancel" },
    create: {
      id: ids.purchaseOrderCancelPermissionId,
      code: "purchasing.purchase_order.cancel",
      module: "purchasing",
      action: "purchase_order.cancel",
    },
    update: {},
  });

  await prisma.permission.upsert({
    where: { code: "purchasing.purchase_order.close_remaining" },
    create: {
      id: ids.purchaseOrderCloseRemainingPermissionId,
      code: "purchasing.purchase_order.close_remaining",
      module: "purchasing",
      action: "purchase_order.close_remaining",
    },
    update: {},
  });

  await prisma.permission.upsert({
    where: { code: "purchasing.purchase_order.amend" },
    create: {
      id: ids.purchaseOrderAmendPermissionId,
      code: "purchasing.purchase_order.amend",
      module: "purchasing",
      action: "purchase_order.amend",
      description:
        "Request controlled amendments for issued, unreceived purchase orders",
    },
    update: {
      module: "purchasing",
      action: "purchase_order.amend",
      description:
        "Request controlled amendments for issued, unreceived purchase orders",
    },
  });

  await prisma.permission.upsert({
    where: { code: "inventory.receiving.view" },
    create: {
      id: ids.receivingViewPermissionId,
      code: "inventory.receiving.view",
      module: "inventory",
      action: "receiving.view",
    },
    update: {},
  });

  await prisma.permission.upsert({
    where: { code: "inventory.balance.view" },
    create: {
      id: ids.inventoryBalanceViewPermissionId,
      code: "inventory.balance.view",
      module: "inventory",
      action: "balance.view",
    },
    update: {},
  });

  await prisma.permission.upsert({
    where: { code: "inventory.ledger.view" },
    create: {
      id: ids.inventoryLedgerViewPermissionId,
      code: "inventory.ledger.view",
      module: "inventory",
      action: "ledger.view",
    },
    update: {},
  });

  await prisma.permission.upsert({
    where: { code: "inventory.transfer.view" },
    create: {
      id: ids.transferViewPermissionId,
      code: "inventory.transfer.view",
      module: "inventory",
      action: "transfer.view",
    },
    update: {},
  });

  await prisma.permission.upsert({
    where: { code: "inventory.transfer.create" },
    create: {
      id: ids.transferCreatePermissionId,
      code: "inventory.transfer.create",
      module: "inventory",
      action: "transfer.create",
    },
    update: {},
  });

  await prisma.permission.upsert({
    where: { code: "inventory.transfer.submit" },
    create: {
      id: ids.transferSubmitPermissionId,
      code: "inventory.transfer.submit",
      module: "inventory",
      action: "transfer.submit",
    },
    update: {},
  });

  await prisma.permission.upsert({
    where: { code: "inventory.transfer.cancel" },
    create: {
      id: ids.transferCancelPermissionId,
      code: "inventory.transfer.cancel",
      module: "inventory",
      action: "transfer.cancel",
    },
    update: {},
  });

  await prisma.permission.upsert({
    where: { code: "inventory.transfer.dispatch" },
    create: {
      id: ids.transferDispatchPermissionId,
      code: "inventory.transfer.dispatch",
      module: "inventory",
      action: "transfer.dispatch",
    },
    update: {},
  });

  await prisma.permission.upsert({
    where: { code: "inventory.transfer.receive" },
    create: {
      id: ids.transferReceivePermissionId,
      code: "inventory.transfer.receive",
      module: "inventory",
      action: "transfer.receive",
    },
    update: {},
  });

  await prisma.permission.upsert({
    where: { code: "inventory.transfer.receipt.reverse" },
    create: {
      id: ids.transferReceiptReversePermissionId,
      code: "inventory.transfer.receipt.reverse",
      module: "inventory",
      action: "transfer.receipt.reverse",
    },
    update: {},
  });

  await prisma.permission.upsert({
    where: { code: "inventory.transfer.discrepancy.settle" },
    create: {
      id: ids.transferDiscrepancySettlePermissionId,
      code: "inventory.transfer.discrepancy.settle",
      module: "inventory",
      action: "transfer.discrepancy.settle",
    },
    update: {},
  });

  const stockCountPermissions = [
    {
      id: ids.stockCountViewPermissionId,
      code: "inventory.stock_count.view",
      action: "stock_count.view",
    },
    {
      id: ids.stockCountCreatePermissionId,
      code: "inventory.stock_count.create",
      action: "stock_count.create",
    },
    {
      id: ids.stockCountEnterPermissionId,
      code: "inventory.stock_count.enter",
      action: "stock_count.enter",
    },
    {
      id: ids.stockCountSubmitPermissionId,
      code: "inventory.stock_count.submit",
      action: "stock_count.submit",
    },
    {
      id: ids.stockCountReviewPermissionId,
      code: "inventory.stock_count.review",
      action: "stock_count.review",
    },
    {
      id: ids.stockCountCancelPermissionId,
      code: "inventory.stock_count.cancel",
      action: "stock_count.cancel",
    },
  ];
  for (const permission of stockCountPermissions) {
    await prisma.permission.upsert({
      where: { code: permission.code },
      create: {
        id: permission.id,
        code: permission.code,
        module: "inventory",
        action: permission.action,
      },
      update: {},
    });
  }

  const wastagePermissions = [
    {
      id: ids.wastageViewPermissionId,
      code: "inventory.wastage.view",
      action: "wastage.view",
    },
    {
      id: ids.wastageCreatePermissionId,
      code: "inventory.wastage.create",
      action: "wastage.create",
    },
    {
      id: ids.wastageSubmitPermissionId,
      code: "inventory.wastage.submit",
      action: "wastage.submit",
    },
    {
      id: ids.wastageApprovePermissionId,
      code: "inventory.wastage.approve",
      action: "wastage.approve",
    },
    {
      id: ids.wastagePostPermissionId,
      code: "inventory.wastage.post",
      action: "wastage.post",
    },
    {
      id: ids.wastageReversePermissionId,
      code: "inventory.wastage.reverse",
      action: "wastage.reverse",
    },
    {
      id: ids.wastageReviewPermissionId,
      code: "inventory.wastage.review",
      action: "wastage.review",
    },
    {
      id: ids.wastageCancelPermissionId,
      code: "inventory.wastage.cancel",
      action: "wastage.cancel",
    },
  ];
  for (const permission of wastagePermissions) {
    await prisma.permission.upsert({
      where: { code: permission.code },
      create: {
        id: permission.id,
        code: permission.code,
        module: "inventory",
        action: permission.action,
      },
      update: {},
    });
  }

  const stockAdjustmentPermissions = [
    {
      id: ids.stockAdjustmentViewPermissionId,
      code: "inventory.stock_adjustment.view",
      action: "stock_adjustment.view",
    },
    {
      id: ids.stockAdjustmentCreatePermissionId,
      code: "inventory.stock_adjustment.create",
      action: "stock_adjustment.create",
    },
    {
      id: ids.stockAdjustmentSubmitPermissionId,
      code: "inventory.stock_adjustment.submit",
      action: "stock_adjustment.submit",
    },
    {
      id: ids.stockAdjustmentApprovePermissionId,
      code: "inventory.stock_adjustment.approve",
      action: "stock_adjustment.approve",
    },
    {
      id: ids.stockAdjustmentPostPermissionId,
      code: "inventory.stock_adjustment.post",
      action: "stock_adjustment.post",
    },
    {
      id: ids.stockAdjustmentReversePermissionId,
      code: "inventory.stock_adjustment.reverse",
      action: "stock_adjustment.reverse",
    },
    {
      id: ids.stockAdjustmentCancelPermissionId,
      code: "inventory.stock_adjustment.cancel",
      action: "stock_adjustment.cancel",
    },
  ];
  for (const permission of stockAdjustmentPermissions) {
    await prisma.permission.upsert({
      where: { code: permission.code },
      create: {
        id: permission.id,
        code: permission.code,
        module: "inventory",
        action: permission.action,
      },
      update: {},
    });
  }

  await prisma.permission.upsert({
    where: { code: "inventory.receiving.create" },
    create: {
      id: ids.receivingCreatePermissionId,
      code: "inventory.receiving.create",
      module: "inventory",
      action: "receiving.create",
    },
    update: {},
  });

  await prisma.permission.upsert({
    where: { code: "inventory.receiving.post" },
    create: {
      id: ids.receivingPostPermissionId,
      code: "inventory.receiving.post",
      module: "inventory",
      action: "receiving.post",
    },
    update: {},
  });

  await prisma.permission.upsert({
    where: { code: "inventory.receiving.reverse" },
    create: {
      id: ids.receivingReversePermissionId,
      code: "inventory.receiving.reverse",
      module: "inventory",
      action: "receiving.reverse",
    },
    update: {},
  });

  const projectPermissions = [
    {
      id: ids.projectViewPermissionId,
      code: "projects.project.view",
      action: "project.view",
    },
    {
      id: ids.projectCreatePermissionId,
      code: "projects.project.create",
      action: "project.create",
    },
    {
      id: ids.projectManagePermissionId,
      code: "projects.project.manage",
      action: "project.manage",
    },
    {
      id: ids.projectManageMembersPermissionId,
      code: "projects.project.manage_members",
      action: "project.manage_members",
    },
    {
      id: ids.projectRiskCreatePermissionId,
      code: "projects.risk.create",
      action: "risk.create",
    },
    {
      id: ids.projectRiskUpdatePermissionId,
      code: "projects.risk.update",
      action: "risk.update",
    },
    {
      id: ids.projectRiskResolvePermissionId,
      code: "projects.risk.resolve",
      action: "risk.resolve",
    },
    {
      id: ids.projectRiskArchivePermissionId,
      code: "projects.risk.archive",
      action: "risk.archive",
    },
    {
      id: ids.projectTemplateViewPermissionId,
      code: "projects.template.view",
      action: "template.view",
    },
    {
      id: ids.projectTemplateConfigurePermissionId,
      code: "projects.template.configure",
      action: "template.configure",
    },
  ];
  for (const permission of projectPermissions) {
    await prisma.permission.upsert({
      where: { code: permission.code },
      create: {
        id: permission.id,
        code: permission.code,
        module: "projects",
        action: permission.action,
      },
      update: {},
    });
  }

  const restaurantOperationsPermissions = [
    {
      id: ids.recipeViewPermissionId,
      code: "restaurant.recipe.view",
      action: "recipe.view",
    },
    {
      id: ids.recipeManagePermissionId,
      code: "restaurant.recipe.manage",
      action: "recipe.manage",
    },
    {
      id: ids.recipeSubmitPermissionId,
      code: "restaurant.recipe.submit",
      action: "recipe.submit",
    },
    {
      id: ids.recipeReviewPermissionId,
      code: "restaurant.recipe.review",
      action: "recipe.review",
    },
    {
      id: ids.recipeApprovePermissionId,
      code: "restaurant.recipe.approve",
      action: "recipe.approve",
    },
    {
      id: ids.recipePublishPermissionId,
      code: "restaurant.recipe.publish",
      action: "recipe.publish",
    },
    {
      id: ids.recipeArchivePermissionId,
      code: "restaurant.recipe.archive",
      action: "recipe.archive",
    },
    {
      id: ids.menuCostViewPermissionId,
      code: "restaurant.menu_cost.view",
      action: "menu_cost.view",
    },
    {
      id: ids.menuPriceDecidePermissionId,
      code: "restaurant.menu_price.decide",
      action: "menu_price.decide",
    },
    {
      id: ids.branchOperationsViewPermissionId,
      code: "restaurant.branch_operations.view",
      action: "branch_operations.view",
    },
    {
      id: ids.branchOperationsCreatePermissionId,
      code: "restaurant.branch_operations.create",
      action: "branch_operations.create",
    },
    {
      id: ids.branchOperationsReviewPermissionId,
      code: "restaurant.branch_operations.review",
      action: "branch_operations.review",
    },
    {
      id: ids.branchOperationsCorrectPermissionId,
      code: "restaurant.branch_operations.correct",
      action: "branch_operations.correct",
    },
    {
      id: ids.foodSafetyViewPermissionId,
      code: "restaurant.food_safety.view",
      action: "food_safety.view",
    },
    {
      id: ids.foodSafetyCreatePermissionId,
      code: "restaurant.food_safety.create",
      action: "food_safety.create",
    },
    {
      id: ids.foodSafetyReviewPermissionId,
      code: "restaurant.food_safety.review",
      action: "food_safety.review",
    },
    {
      id: ids.foodSafetyCorrectPermissionId,
      code: "restaurant.food_safety.correct",
      action: "food_safety.correct",
    },
    {
      id: ids.incidentViewPermissionId,
      code: "restaurant.incident.view",
      action: "incident.view",
    },
    {
      id: ids.incidentCreatePermissionId,
      code: "restaurant.incident.create",
      action: "incident.create",
    },
    {
      id: ids.incidentResolvePermissionId,
      code: "restaurant.incident.resolve",
      action: "incident.resolve",
    },
    {
      id: ids.incidentCorrectPermissionId,
      code: "restaurant.incident.correct",
      action: "incident.correct",
    },
    {
      id: ids.maintenanceViewPermissionId,
      code: "restaurant.maintenance.view",
      action: "maintenance.view",
    },
    {
      id: ids.maintenanceCreatePermissionId,
      code: "restaurant.maintenance.create",
      action: "maintenance.create",
    },
    {
      id: ids.maintenanceCompletePermissionId,
      code: "restaurant.maintenance.complete",
      action: "maintenance.complete",
    },
    {
      id: ids.maintenanceCorrectPermissionId,
      code: "restaurant.maintenance.correct",
      action: "maintenance.correct",
    },
  ];
  for (const permission of restaurantOperationsPermissions) {
    await prisma.permission.upsert({
      where: { code: permission.code },
      create: {
        id: permission.id,
        code: permission.code,
        module: "restaurant",
        action: permission.action,
      },
      update: {
        module: "restaurant",
        action: permission.action,
      },
    });
  }

  const financePermissions = [
    {
      id: ids.financeViewPermissionId,
      code: "finance.view",
      action: "view",
    },
    {
      id: ids.financeConfigurePermissionId,
      code: "finance.configure",
      action: "configure",
    },
    {
      id: ids.financeLedgerViewPermissionId,
      code: "finance.ledger.view",
      action: "ledger.view",
    },
    {
      id: ids.financePayablesViewPermissionId,
      code: "finance.payables.view",
      action: "payables.view",
    },
    {
      id: ids.financeApInvoiceCreatePermissionId,
      code: "finance.ap_invoice.create",
      action: "ap_invoice.create",
    },
    {
      id: ids.financeApInvoiceSubmitPermissionId,
      code: "finance.ap_invoice.submit",
      action: "ap_invoice.submit",
    },
    {
      id: ids.financeApInvoiceMatchPermissionId,
      code: "finance.ap_invoice.match",
      action: "ap_invoice.match",
    },
    {
      id: ids.financeApInvoiceReviewExceptionPermissionId,
      code: "finance.ap_invoice.review_exception",
      action: "ap_invoice.review_exception",
    },
    {
      id: ids.financeApInvoiceCancelPermissionId,
      code: "finance.ap_invoice.cancel",
      action: "ap_invoice.cancel",
    },
    {
      id: ids.financePaymentRequestCreatePermissionId,
      code: "finance.payment_request.create",
      action: "payment_request.create",
    },
    {
      id: ids.financePaymentRequestApprovePermissionId,
      code: "finance.payment_request.approve",
      action: "payment_request.approve",
    },
    {
      id: ids.financePaymentReleasePermissionId,
      code: "finance.payment.release",
      action: "payment.release",
    },
    {
      id: ids.financeCashDepositCreatePermissionId,
      code: "finance.cash_deposit.create",
      action: "cash_deposit.create",
    },
    {
      id: ids.financeReconciliationViewPermissionId,
      code: "finance.reconciliation.view",
      action: "reconciliation.view",
    },
    {
      id: ids.financeReconciliationMatchPermissionId,
      code: "finance.reconciliation.match",
      action: "reconciliation.match",
    },
    {
      id: ids.financePeriodCloseManagePermissionId,
      code: "finance.period_close.manage",
      action: "period_close.manage",
    },
    {
      id: ids.financeJournalCreatePermissionId,
      code: "finance.journal.create",
      action: "journal.create",
    },
    {
      id: ids.financeJournalSubmitPermissionId,
      code: "finance.journal.submit",
      action: "journal.submit",
    },
    {
      id: ids.financeJournalApprovePermissionId,
      code: "finance.journal.approve",
      action: "journal.approve",
    },
    {
      id: ids.financeJournalPostPermissionId,
      code: "finance.journal.post",
      action: "journal.post",
    },
    {
      id: ids.financeJournalReversePermissionId,
      code: "finance.journal.reverse",
      action: "journal.reverse",
    },
    {
      id: ids.financeBudgetViewPermissionId,
      code: "finance.budget.view",
      action: "budget.view",
    },
    {
      id: ids.financeBudgetManagePermissionId,
      code: "finance.budget.manage",
      action: "budget.manage",
    },
    {
      id: ids.financeBudgetApprovePermissionId,
      code: "finance.budget.approve",
      action: "budget.approve",
    },
    {
      id: ids.financeBudgetCommitmentReviewPermissionId,
      code: "finance.budget.commitment.review",
      action: "budget.commitment.review",
    },
    {
      id: ids.financeExpenseRequestViewPermissionId,
      code: "finance.expense_request.view",
      action: "expense_request.view",
    },
    {
      id: ids.financeExpenseRequestCreatePermissionId,
      code: "finance.expense_request.create",
      action: "expense_request.create",
    },
    {
      id: ids.financeExpenseRequestSubmitPermissionId,
      code: "finance.expense_request.submit",
      action: "expense_request.submit",
    },
    {
      id: ids.financeExpenseRequestApprovePermissionId,
      code: "finance.expense_request.approve",
      action: "expense_request.approve",
    },
    {
      id: ids.financeExpenseRequestCompletePermissionId,
      code: "finance.expense_request.complete",
      action: "expense_request.complete",
    },
    {
      id: ids.financeCashAdvanceViewPermissionId,
      code: "finance.cash_advance.view",
      action: "cash_advance.view",
    },
    {
      id: ids.financeCashAdvanceCreatePermissionId,
      code: "finance.cash_advance.create",
      action: "cash_advance.create",
    },
    {
      id: ids.financeCashAdvanceSubmitPermissionId,
      code: "finance.cash_advance.submit",
      action: "cash_advance.submit",
    },
    {
      id: ids.financeCashAdvanceApprovePermissionId,
      code: "finance.cash_advance.approve",
      action: "cash_advance.approve",
    },
    {
      id: ids.financeCashAdvanceLiquidatePermissionId,
      code: "finance.cash_advance.liquidate",
      action: "cash_advance.liquidate",
    },
    {
      id: ids.financeCashAdvanceReviewLiquidationPermissionId,
      code: "finance.cash_advance.review_liquidation",
      action: "cash_advance.review_liquidation",
    },
    {
      id: ids.financePettyCashViewPermissionId,
      code: "finance.petty_cash.view",
      action: "petty_cash.view",
    },
    {
      id: ids.financePettyCashCreatePermissionId,
      code: "finance.petty_cash.create",
      action: "petty_cash.create",
    },
    {
      id: ids.financePettyCashSubmitPermissionId,
      code: "finance.petty_cash.submit",
      action: "petty_cash.submit",
    },
    {
      id: ids.financePettyCashApprovePermissionId,
      code: "finance.petty_cash.approve",
      action: "petty_cash.approve",
    },
    {
      id: ids.financePettyCashReplenishPermissionId,
      code: "finance.petty_cash.replenish",
      action: "petty_cash.replenish",
    },
    {
      id: ids.financePettyCashLiquidatePermissionId,
      code: "finance.petty_cash.liquidate",
      action: "petty_cash.liquidate",
    },
    {
      id: ids.financePettyCashReviewLiquidationPermissionId,
      code: "finance.petty_cash.review_liquidation",
      action: "petty_cash.review_liquidation",
    },
  ];
  for (const permission of financePermissions) {
    await prisma.permission.upsert({
      where: { code: permission.code },
      create: {
        id: permission.id,
        code: permission.code,
        module: "finance",
        action: permission.action,
      },
      update: {
        module: "finance",
        action: permission.action,
      },
    });
  }

  const workforcePermissions = [
    {
      id: ids.workforceViewPermissionId,
      code: "workforce.view",
      action: "view",
    },
    {
      id: ids.workforceManagePermissionId,
      code: "workforce.manage",
      action: "manage",
    },
    {
      id: ids.workforceLeaveApprovePermissionId,
      code: "workforce.leave.approve",
      action: "leave.approve",
    },
    {
      id: ids.workforceOvertimeApprovePermissionId,
      code: "workforce.overtime.approve",
      action: "overtime.approve",
    },
    {
      id: ids.workforceScheduleViewPermissionId,
      code: "workforce.schedule.view",
      action: "schedule.view",
    },
    {
      id: ids.workforceScheduleManagePermissionId,
      code: "workforce.schedule.manage",
      action: "schedule.manage",
    },
    {
      id: ids.workforceAttendanceImportViewPermissionId,
      code: "workforce.attendance_import.view",
      action: "attendance_import.view",
    },
    {
      id: ids.workforceAttendanceImportManagePermissionId,
      code: "workforce.attendance_import.manage",
      action: "attendance_import.manage",
    },
  ];
  for (const permission of workforcePermissions) {
    await prisma.permission.upsert({
      where: { code: permission.code },
      create: {
        id: permission.id,
        code: permission.code,
        module: "workforce",
        action: permission.action,
      },
      update: {
        module: "workforce",
        action: permission.action,
      },
    });
  }

  await prisma.rolePermission.createMany({
    data: await existingRolePermissionRows([
      {
        roleId: ids.requesterRoleId,
        permissionId: ids.createPermissionId,
      },
      {
        roleId: ids.requesterRoleId,
        permissionId: ids.submitPermissionId,
      },
      {
        roleId: ids.requesterRoleId,
        permissionId: ids.purchaseOrderViewPermissionId,
      },
      {
        roleId: ids.requesterRoleId,
        permissionId: ids.inventoryBalanceViewPermissionId,
      },
      {
        roleId: ids.requesterRoleId,
        permissionId: ids.inventoryLedgerViewPermissionId,
      },
      {
        roleId: ids.requesterRoleId,
        permissionId: ids.transferViewPermissionId,
      },
      {
        roleId: ids.requesterRoleId,
        permissionId: ids.receivingViewPermissionId,
      },
      {
        roleId: ids.requesterRoleId,
        permissionId: ids.stockCountViewPermissionId,
      },
      {
        roleId: ids.requesterRoleId,
        permissionId: ids.wastageViewPermissionId,
      },
      {
        roleId: ids.requesterRoleId,
        permissionId: ids.wastageCreatePermissionId,
      },
      {
        roleId: ids.requesterRoleId,
        permissionId: ids.wastageSubmitPermissionId,
      },
      {
        roleId: ids.requesterRoleId,
        permissionId: ids.stockAdjustmentViewPermissionId,
      },
      {
        roleId: ids.requesterRoleId,
        permissionId: ids.stockAdjustmentCreatePermissionId,
      },
      {
        roleId: ids.requesterRoleId,
        permissionId: ids.stockAdjustmentSubmitPermissionId,
      },
      {
        roleId: ids.requesterRoleId,
        permissionId: ids.branchOperationsViewPermissionId,
      },
      {
        roleId: ids.requesterRoleId,
        permissionId: ids.branchOperationsCreatePermissionId,
      },
      {
        roleId: ids.requesterRoleId,
        permissionId: ids.foodSafetyViewPermissionId,
      },
      {
        roleId: ids.requesterRoleId,
        permissionId: ids.foodSafetyCreatePermissionId,
      },
      {
        roleId: ids.requesterRoleId,
        permissionId: ids.incidentViewPermissionId,
      },
      {
        roleId: ids.requesterRoleId,
        permissionId: ids.incidentCreatePermissionId,
      },
      {
        roleId: ids.requesterRoleId,
        permissionId: ids.incidentResolvePermissionId,
      },
      {
        roleId: ids.requesterRoleId,
        permissionId: ids.maintenanceViewPermissionId,
      },
      {
        roleId: ids.requesterRoleId,
        permissionId: ids.maintenanceCreatePermissionId,
      },
      {
        roleId: ids.requesterRoleId,
        permissionId: ids.maintenanceCompletePermissionId,
      },
      {
        roleId: ids.requesterRoleId,
        permissionId: ids.recipeViewPermissionId,
      },
      {
        roleId: ids.requesterRoleId,
        permissionId: ids.recipeManagePermissionId,
      },
      {
        roleId: ids.requesterRoleId,
        permissionId: ids.recipeSubmitPermissionId,
      },
      {
        roleId: ids.requesterRoleId,
        permissionId: ids.menuCostViewPermissionId,
      },
      {
        roleId: ids.requesterRoleId,
        permissionId: ids.workforceViewPermissionId,
      },
      {
        roleId: ids.requesterRoleId,
        permissionId: ids.workforceScheduleViewPermissionId,
      },
      {
        roleId: ids.requesterRoleId,
        permissionId: ids.workforceAttendanceImportViewPermissionId,
      },
    ]),
    skipDuplicates: true,
  });

  await prisma.rolePermission.createMany({
    data: await existingRolePermissionRows([
      {
        roleId: ids.approverRoleId,
        permissionId: ids.approvePermissionId,
      },
      {
        roleId: ids.approverRoleId,
        permissionId: ids.quoteApprovePermissionId,
      },
      {
        roleId: ids.approverRoleId,
        permissionId: ids.purchaseOrderApprovePermissionId,
      },
      {
        roleId: ids.approverRoleId,
        permissionId: ids.purchaseOrderViewPermissionId,
      },
      {
        roleId: ids.approverRoleId,
        permissionId: ids.wastageViewPermissionId,
      },
      {
        roleId: ids.approverRoleId,
        permissionId: ids.wastageApprovePermissionId,
      },
      {
        roleId: ids.approverRoleId,
        permissionId: ids.wastageReviewPermissionId,
      },
      {
        roleId: ids.approverRoleId,
        permissionId: ids.stockAdjustmentViewPermissionId,
      },
      {
        roleId: ids.approverRoleId,
        permissionId: ids.stockAdjustmentApprovePermissionId,
      },
      {
        roleId: ids.approverRoleId,
        permissionId: ids.transferDiscrepancySettlePermissionId,
      },
      {
        roleId: ids.approverRoleId,
        permissionId: ids.branchOperationsViewPermissionId,
      },
      {
        roleId: ids.approverRoleId,
        permissionId: ids.foodSafetyViewPermissionId,
      },
      {
        roleId: ids.approverRoleId,
        permissionId: ids.incidentViewPermissionId,
      },
      {
        roleId: ids.approverRoleId,
        permissionId: ids.maintenanceViewPermissionId,
      },
      {
        roleId: ids.approverRoleId,
        permissionId: ids.recipeViewPermissionId,
      },
      {
        roleId: ids.approverRoleId,
        permissionId: ids.recipeReviewPermissionId,
      },
      {
        roleId: ids.approverRoleId,
        permissionId: ids.recipeApprovePermissionId,
      },
      {
        roleId: ids.approverRoleId,
        permissionId: ids.menuCostViewPermissionId,
      },
      {
        roleId: ids.approverRoleId,
        permissionId: ids.menuPriceDecidePermissionId,
      },
      {
        roleId: ids.approverRoleId,
        permissionId: ids.branchOperationsReviewPermissionId,
      },
      {
        roleId: ids.approverRoleId,
        permissionId: ids.branchOperationsCorrectPermissionId,
      },
      {
        roleId: ids.approverRoleId,
        permissionId: ids.foodSafetyReviewPermissionId,
      },
      {
        roleId: ids.approverRoleId,
        permissionId: ids.foodSafetyCorrectPermissionId,
      },
      {
        roleId: ids.approverRoleId,
        permissionId: ids.incidentResolvePermissionId,
      },
      {
        roleId: ids.approverRoleId,
        permissionId: ids.incidentCorrectPermissionId,
      },
      {
        roleId: ids.approverRoleId,
        permissionId: ids.maintenanceCompletePermissionId,
      },
      {
        roleId: ids.approverRoleId,
        permissionId: ids.maintenanceCorrectPermissionId,
      },
      {
        roleId: ids.approverRoleId,
        permissionId: ids.workforceViewPermissionId,
      },
      {
        roleId: ids.approverRoleId,
        permissionId: ids.workforceLeaveApprovePermissionId,
      },
      {
        roleId: ids.approverRoleId,
        permissionId: ids.workforceOvertimeApprovePermissionId,
      },
      {
        roleId: ids.approverRoleId,
        permissionId: ids.workforceScheduleViewPermissionId,
      },
      {
        roleId: ids.approverRoleId,
        permissionId: ids.workforceAttendanceImportViewPermissionId,
      },
    ]),
    skipDuplicates: true,
  });

  await prisma.rolePermission.createMany({
    data: await existingRolePermissionRows([
      {
        roleId: ids.adminRoleId,
        permissionId: ids.administerPermissionId,
      },
      {
        roleId: ids.adminRoleId,
        permissionId: ids.quoteManagePermissionId,
      },
      {
        roleId: ids.adminRoleId,
        permissionId: ids.createPermissionId,
      },
      {
        roleId: ids.adminRoleId,
        permissionId: ids.submitPermissionId,
      },
      {
        roleId: ids.adminRoleId,
        permissionId: ids.approvePermissionId,
      },
      {
        roleId: ids.adminRoleId,
        permissionId: ids.quoteApprovePermissionId,
      },
      {
        roleId: ids.adminRoleId,
        permissionId: ids.purchaseOrderViewPermissionId,
      },
      {
        roleId: ids.adminRoleId,
        permissionId: ids.purchaseOrderCreatePermissionId,
      },
      {
        roleId: ids.adminRoleId,
        permissionId: ids.purchaseOrderSubmitPermissionId,
      },
      {
        roleId: ids.adminRoleId,
        permissionId: ids.purchaseOrderApprovePermissionId,
      },
      {
        roleId: ids.adminRoleId,
        permissionId: ids.purchaseOrderIssuePermissionId,
      },
      {
        roleId: ids.adminRoleId,
        permissionId: ids.purchaseOrderCancelPermissionId,
      },
      {
        roleId: ids.adminRoleId,
        permissionId: ids.purchaseOrderCloseRemainingPermissionId,
      },
      {
        roleId: ids.adminRoleId,
        permissionId: ids.purchaseOrderAmendPermissionId,
      },
      {
        roleId: ids.adminRoleId,
        permissionId: ids.inventoryBalanceViewPermissionId,
      },
      {
        roleId: ids.adminRoleId,
        permissionId: ids.inventoryLedgerViewPermissionId,
      },
      {
        roleId: ids.adminRoleId,
        permissionId: ids.transferViewPermissionId,
      },
      {
        roleId: ids.adminRoleId,
        permissionId: ids.transferCreatePermissionId,
      },
      {
        roleId: ids.adminRoleId,
        permissionId: ids.transferSubmitPermissionId,
      },
      {
        roleId: ids.adminRoleId,
        permissionId: ids.transferCancelPermissionId,
      },
      {
        roleId: ids.adminRoleId,
        permissionId: ids.transferDispatchPermissionId,
      },
      {
        roleId: ids.adminRoleId,
        permissionId: ids.transferReceivePermissionId,
      },
      {
        roleId: ids.adminRoleId,
        permissionId: ids.transferReceiptReversePermissionId,
      },
      {
        roleId: ids.adminRoleId,
        permissionId: ids.transferDiscrepancySettlePermissionId,
      },
      {
        roleId: ids.adminRoleId,
        permissionId: ids.stockCountViewPermissionId,
      },
      {
        roleId: ids.adminRoleId,
        permissionId: ids.stockCountCreatePermissionId,
      },
      {
        roleId: ids.adminRoleId,
        permissionId: ids.stockCountEnterPermissionId,
      },
      {
        roleId: ids.adminRoleId,
        permissionId: ids.stockCountSubmitPermissionId,
      },
      {
        roleId: ids.adminRoleId,
        permissionId: ids.stockCountReviewPermissionId,
      },
      {
        roleId: ids.adminRoleId,
        permissionId: ids.stockCountCancelPermissionId,
      },
      {
        roleId: ids.adminRoleId,
        permissionId: ids.wastageViewPermissionId,
      },
      {
        roleId: ids.adminRoleId,
        permissionId: ids.wastageCreatePermissionId,
      },
      {
        roleId: ids.adminRoleId,
        permissionId: ids.wastageSubmitPermissionId,
      },
      {
        roleId: ids.adminRoleId,
        permissionId: ids.wastageApprovePermissionId,
      },
      {
        roleId: ids.adminRoleId,
        permissionId: ids.wastagePostPermissionId,
      },
      {
        roleId: ids.adminRoleId,
        permissionId: ids.wastageReversePermissionId,
      },
      {
        roleId: ids.adminRoleId,
        permissionId: ids.wastageReviewPermissionId,
      },
      {
        roleId: ids.adminRoleId,
        permissionId: ids.wastageCancelPermissionId,
      },
      {
        roleId: ids.adminRoleId,
        permissionId: ids.stockAdjustmentViewPermissionId,
      },
      {
        roleId: ids.adminRoleId,
        permissionId: ids.stockAdjustmentCreatePermissionId,
      },
      {
        roleId: ids.adminRoleId,
        permissionId: ids.stockAdjustmentSubmitPermissionId,
      },
      {
        roleId: ids.adminRoleId,
        permissionId: ids.stockAdjustmentApprovePermissionId,
      },
      {
        roleId: ids.adminRoleId,
        permissionId: ids.stockAdjustmentPostPermissionId,
      },
      {
        roleId: ids.adminRoleId,
        permissionId: ids.stockAdjustmentReversePermissionId,
      },
      {
        roleId: ids.adminRoleId,
        permissionId: ids.stockAdjustmentCancelPermissionId,
      },
      {
        roleId: ids.adminRoleId,
        permissionId: ids.receivingViewPermissionId,
      },
      {
        roleId: ids.adminRoleId,
        permissionId: ids.receivingCreatePermissionId,
      },
      {
        roleId: ids.adminRoleId,
        permissionId: ids.receivingPostPermissionId,
      },
      {
        roleId: ids.adminRoleId,
        permissionId: ids.receivingReversePermissionId,
      },
      {
        roleId: ids.adminRoleId,
        permissionId: ids.projectViewPermissionId,
      },
      {
        roleId: ids.adminRoleId,
        permissionId: ids.projectCreatePermissionId,
      },
      {
        roleId: ids.adminRoleId,
        permissionId: ids.projectManagePermissionId,
      },
      {
        roleId: ids.adminRoleId,
        permissionId: ids.projectManageMembersPermissionId,
      },
      {
        roleId: ids.adminRoleId,
        permissionId: ids.projectRiskCreatePermissionId,
      },
      {
        roleId: ids.adminRoleId,
        permissionId: ids.projectRiskUpdatePermissionId,
      },
      {
        roleId: ids.adminRoleId,
        permissionId: ids.projectRiskResolvePermissionId,
      },
      {
        roleId: ids.adminRoleId,
        permissionId: ids.projectRiskArchivePermissionId,
      },
      {
        roleId: ids.adminRoleId,
        permissionId: ids.projectTemplateViewPermissionId,
      },
      {
        roleId: ids.adminRoleId,
        permissionId: ids.projectTemplateConfigurePermissionId,
      },
      {
        roleId: ids.adminRoleId,
        permissionId: ids.recipeViewPermissionId,
      },
      {
        roleId: ids.adminRoleId,
        permissionId: ids.recipeManagePermissionId,
      },
      {
        roleId: ids.adminRoleId,
        permissionId: ids.recipeSubmitPermissionId,
      },
      {
        roleId: ids.adminRoleId,
        permissionId: ids.recipeReviewPermissionId,
      },
      {
        roleId: ids.adminRoleId,
        permissionId: ids.recipeApprovePermissionId,
      },
      {
        roleId: ids.adminRoleId,
        permissionId: ids.recipePublishPermissionId,
      },
      {
        roleId: ids.adminRoleId,
        permissionId: ids.recipeArchivePermissionId,
      },
      {
        roleId: ids.adminRoleId,
        permissionId: ids.menuCostViewPermissionId,
      },
      {
        roleId: ids.adminRoleId,
        permissionId: ids.menuPriceDecidePermissionId,
      },
      {
        roleId: ids.adminRoleId,
        permissionId: ids.branchOperationsViewPermissionId,
      },
      {
        roleId: ids.adminRoleId,
        permissionId: ids.branchOperationsCreatePermissionId,
      },
      {
        roleId: ids.adminRoleId,
        permissionId: ids.branchOperationsReviewPermissionId,
      },
      {
        roleId: ids.adminRoleId,
        permissionId: ids.branchOperationsCorrectPermissionId,
      },
      {
        roleId: ids.adminRoleId,
        permissionId: ids.foodSafetyViewPermissionId,
      },
      {
        roleId: ids.adminRoleId,
        permissionId: ids.foodSafetyCreatePermissionId,
      },
      {
        roleId: ids.adminRoleId,
        permissionId: ids.foodSafetyReviewPermissionId,
      },
      {
        roleId: ids.adminRoleId,
        permissionId: ids.foodSafetyCorrectPermissionId,
      },
      {
        roleId: ids.adminRoleId,
        permissionId: ids.incidentViewPermissionId,
      },
      {
        roleId: ids.adminRoleId,
        permissionId: ids.incidentCreatePermissionId,
      },
      {
        roleId: ids.adminRoleId,
        permissionId: ids.incidentResolvePermissionId,
      },
      {
        roleId: ids.adminRoleId,
        permissionId: ids.incidentCorrectPermissionId,
      },
      {
        roleId: ids.adminRoleId,
        permissionId: ids.maintenanceViewPermissionId,
      },
      {
        roleId: ids.adminRoleId,
        permissionId: ids.maintenanceCreatePermissionId,
      },
      {
        roleId: ids.adminRoleId,
        permissionId: ids.maintenanceCompletePermissionId,
      },
      {
        roleId: ids.adminRoleId,
        permissionId: ids.maintenanceCorrectPermissionId,
      },
      {
        roleId: ids.requesterRoleId,
        permissionId: ids.financeViewPermissionId,
      },
      {
        roleId: ids.requesterRoleId,
        permissionId: ids.financePayablesViewPermissionId,
      },
      {
        roleId: ids.requesterRoleId,
        permissionId: ids.financeApInvoiceCreatePermissionId,
      },
      {
        roleId: ids.requesterRoleId,
        permissionId: ids.financeApInvoiceSubmitPermissionId,
      },
      {
        roleId: ids.requesterRoleId,
        permissionId: ids.financeJournalCreatePermissionId,
      },
      {
        roleId: ids.requesterRoleId,
        permissionId: ids.financeJournalSubmitPermissionId,
      },
      {
        roleId: ids.requesterRoleId,
        permissionId: ids.financeBudgetViewPermissionId,
      },
      {
        roleId: ids.requesterRoleId,
        permissionId: ids.financeExpenseRequestViewPermissionId,
      },
      {
        roleId: ids.requesterRoleId,
        permissionId: ids.financeExpenseRequestCreatePermissionId,
      },
      {
        roleId: ids.requesterRoleId,
        permissionId: ids.financeExpenseRequestSubmitPermissionId,
      },
      {
        roleId: ids.requesterRoleId,
        permissionId: ids.financeCashAdvanceViewPermissionId,
      },
      {
        roleId: ids.requesterRoleId,
        permissionId: ids.financeCashAdvanceCreatePermissionId,
      },
      {
        roleId: ids.requesterRoleId,
        permissionId: ids.financeCashAdvanceSubmitPermissionId,
      },
      {
        roleId: ids.requesterRoleId,
        permissionId: ids.financeCashAdvanceLiquidatePermissionId,
      },
      {
        roleId: ids.requesterRoleId,
        permissionId: ids.financePettyCashViewPermissionId,
      },
      {
        roleId: ids.requesterRoleId,
        permissionId: ids.financePettyCashCreatePermissionId,
      },
      {
        roleId: ids.requesterRoleId,
        permissionId: ids.financePettyCashSubmitPermissionId,
      },
      {
        roleId: ids.requesterRoleId,
        permissionId: ids.financePettyCashLiquidatePermissionId,
      },
      {
        roleId: ids.requesterRoleId,
        permissionId: ids.financeCashDepositCreatePermissionId,
      },
      {
        roleId: ids.approverRoleId,
        permissionId: ids.financeViewPermissionId,
      },
      {
        roleId: ids.approverRoleId,
        permissionId: ids.financePayablesViewPermissionId,
      },
      {
        roleId: ids.approverRoleId,
        permissionId: ids.financeApInvoiceMatchPermissionId,
      },
      {
        roleId: ids.approverRoleId,
        permissionId: ids.financeApInvoiceReviewExceptionPermissionId,
      },
      {
        roleId: ids.approverRoleId,
        permissionId: ids.financePaymentRequestApprovePermissionId,
      },
      {
        roleId: ids.approverRoleId,
        permissionId: ids.financeJournalApprovePermissionId,
      },
      {
        roleId: ids.approverRoleId,
        permissionId: ids.financeBudgetViewPermissionId,
      },
      {
        roleId: ids.approverRoleId,
        permissionId: ids.financeBudgetApprovePermissionId,
      },
      {
        roleId: ids.approverRoleId,
        permissionId: ids.financeBudgetCommitmentReviewPermissionId,
      },
      {
        roleId: ids.approverRoleId,
        permissionId: ids.financeExpenseRequestViewPermissionId,
      },
      {
        roleId: ids.approverRoleId,
        permissionId: ids.financeExpenseRequestApprovePermissionId,
      },
      {
        roleId: ids.approverRoleId,
        permissionId: ids.financeCashAdvanceViewPermissionId,
      },
      {
        roleId: ids.approverRoleId,
        permissionId: ids.financeCashAdvanceApprovePermissionId,
      },
      {
        roleId: ids.approverRoleId,
        permissionId: ids.financeCashAdvanceReviewLiquidationPermissionId,
      },
      {
        roleId: ids.approverRoleId,
        permissionId: ids.financePettyCashViewPermissionId,
      },
      {
        roleId: ids.approverRoleId,
        permissionId: ids.financePettyCashApprovePermissionId,
      },
      {
        roleId: ids.approverRoleId,
        permissionId: ids.financePettyCashReviewLiquidationPermissionId,
      },
      {
        roleId: ids.adminRoleId,
        permissionId: ids.financeViewPermissionId,
      },
      {
        roleId: ids.adminRoleId,
        permissionId: ids.financeConfigurePermissionId,
      },
      {
        roleId: ids.adminRoleId,
        permissionId: ids.financeLedgerViewPermissionId,
      },
      {
        roleId: ids.adminRoleId,
        permissionId: ids.financePayablesViewPermissionId,
      },
      {
        roleId: ids.adminRoleId,
        permissionId: ids.financeApInvoiceCreatePermissionId,
      },
      {
        roleId: ids.adminRoleId,
        permissionId: ids.financeApInvoiceSubmitPermissionId,
      },
      {
        roleId: ids.adminRoleId,
        permissionId: ids.financeApInvoiceMatchPermissionId,
      },
      {
        roleId: ids.adminRoleId,
        permissionId: ids.financeApInvoiceReviewExceptionPermissionId,
      },
      {
        roleId: ids.adminRoleId,
        permissionId: ids.financeApInvoiceCancelPermissionId,
      },
      {
        roleId: ids.adminRoleId,
        permissionId: ids.financePaymentRequestCreatePermissionId,
      },
      {
        roleId: ids.adminRoleId,
        permissionId: ids.financePaymentRequestApprovePermissionId,
      },
      {
        roleId: ids.adminRoleId,
        permissionId: ids.financePaymentReleasePermissionId,
      },
      {
        roleId: ids.adminRoleId,
        permissionId: ids.financeCashDepositCreatePermissionId,
      },
      {
        roleId: ids.adminRoleId,
        permissionId: ids.financeReconciliationViewPermissionId,
      },
      {
        roleId: ids.adminRoleId,
        permissionId: ids.financeReconciliationMatchPermissionId,
      },
      {
        roleId: ids.adminRoleId,
        permissionId: ids.financePeriodCloseManagePermissionId,
      },
      {
        roleId: ids.adminRoleId,
        permissionId: ids.financeJournalCreatePermissionId,
      },
      {
        roleId: ids.adminRoleId,
        permissionId: ids.financeJournalSubmitPermissionId,
      },
      {
        roleId: ids.adminRoleId,
        permissionId: ids.financeJournalApprovePermissionId,
      },
      {
        roleId: ids.adminRoleId,
        permissionId: ids.financeJournalPostPermissionId,
      },
      {
        roleId: ids.adminRoleId,
        permissionId: ids.financeJournalReversePermissionId,
      },
      {
        roleId: ids.adminRoleId,
        permissionId: ids.financeBudgetViewPermissionId,
      },
      {
        roleId: ids.adminRoleId,
        permissionId: ids.financeBudgetManagePermissionId,
      },
      {
        roleId: ids.adminRoleId,
        permissionId: ids.financeBudgetApprovePermissionId,
      },
      {
        roleId: ids.adminRoleId,
        permissionId: ids.financeBudgetCommitmentReviewPermissionId,
      },
      {
        roleId: ids.adminRoleId,
        permissionId: ids.financeExpenseRequestViewPermissionId,
      },
      {
        roleId: ids.adminRoleId,
        permissionId: ids.financeExpenseRequestCreatePermissionId,
      },
      {
        roleId: ids.adminRoleId,
        permissionId: ids.financeExpenseRequestSubmitPermissionId,
      },
      {
        roleId: ids.adminRoleId,
        permissionId: ids.financeExpenseRequestApprovePermissionId,
      },
      {
        roleId: ids.adminRoleId,
        permissionId: ids.financeExpenseRequestCompletePermissionId,
      },
      {
        roleId: ids.adminRoleId,
        permissionId: ids.financeCashAdvanceViewPermissionId,
      },
      {
        roleId: ids.adminRoleId,
        permissionId: ids.financeCashAdvanceCreatePermissionId,
      },
      {
        roleId: ids.adminRoleId,
        permissionId: ids.financeCashAdvanceSubmitPermissionId,
      },
      {
        roleId: ids.adminRoleId,
        permissionId: ids.financeCashAdvanceApprovePermissionId,
      },
      {
        roleId: ids.adminRoleId,
        permissionId: ids.financeCashAdvanceLiquidatePermissionId,
      },
      {
        roleId: ids.adminRoleId,
        permissionId: ids.financeCashAdvanceReviewLiquidationPermissionId,
      },
      {
        roleId: ids.adminRoleId,
        permissionId: ids.financePettyCashViewPermissionId,
      },
      {
        roleId: ids.adminRoleId,
        permissionId: ids.financePettyCashCreatePermissionId,
      },
      {
        roleId: ids.adminRoleId,
        permissionId: ids.financePettyCashSubmitPermissionId,
      },
      {
        roleId: ids.adminRoleId,
        permissionId: ids.financePettyCashApprovePermissionId,
      },
      {
        roleId: ids.adminRoleId,
        permissionId: ids.financePettyCashReplenishPermissionId,
      },
      {
        roleId: ids.adminRoleId,
        permissionId: ids.financePettyCashLiquidatePermissionId,
      },
      {
        roleId: ids.adminRoleId,
        permissionId: ids.financePettyCashReviewLiquidationPermissionId,
      },
      {
        roleId: ids.adminRoleId,
        permissionId: ids.workforceViewPermissionId,
      },
      {
        roleId: ids.adminRoleId,
        permissionId: ids.workforceManagePermissionId,
      },
      {
        roleId: ids.adminRoleId,
        permissionId: ids.workforceLeaveApprovePermissionId,
      },
      {
        roleId: ids.adminRoleId,
        permissionId: ids.workforceOvertimeApprovePermissionId,
      },
      {
        roleId: ids.adminRoleId,
        permissionId: ids.workforceScheduleViewPermissionId,
      },
      {
        roleId: ids.adminRoleId,
        permissionId: ids.workforceScheduleManagePermissionId,
      },
      {
        roleId: ids.adminRoleId,
        permissionId: ids.workforceAttendanceImportViewPermissionId,
      },
      {
        roleId: ids.adminRoleId,
        permissionId: ids.workforceAttendanceImportManagePermissionId,
      },
    ]),
    skipDuplicates: true,
  });

  const allSeededPermissions = await prisma.permission.findMany({
    where: {
      OR: [{ tenantId: ids.tenantId }, { tenantId: null }],
    },
    select: { id: true },
  });
  await prisma.rolePermission.createMany({
    data: allSeededPermissions.map((permission) => ({
      roleId: ids.superRoleId,
      permissionId: permission.id,
    })),
    skipDuplicates: true,
  });

  await prisma.userRoleAssignment.deleteMany({
    where: {
      userId: {
        in: [
          ids.userId,
          ids.approverUserId,
          ids.adminUserId,
          ids.secondaryAdminUserId,
          ids.superUserId,
          ids.chromiumScopeCandidateUserId,
          ids.mobileScopeCandidateUserId,
        ],
      },
    },
  });
  await prisma.userRoleAssignment.create({
    data: {
      userId: ids.userId,
      roleId: ids.requesterRoleId,
    },
  });
  await prisma.userRoleAssignment.create({
    data: {
      userId: ids.approverUserId,
      roleId: ids.approverRoleId,
    },
  });
  await prisma.userRoleAssignment.create({
    data: {
      userId: ids.adminUserId,
      roleId: ids.adminRoleId,
    },
  });
  await prisma.userRoleAssignment.create({
    data: {
      userId: ids.secondaryAdminUserId,
      roleId: ids.adminRoleId,
    },
  });
  await prisma.userRoleAssignment.create({
    data: {
      userId: ids.superUserId,
      roleId: ids.superRoleId,
    },
  });

  await prisma.userScopeAssignment.deleteMany({
    where: {
      userId: {
        in: [
          ids.userId,
          ids.approverUserId,
          ids.adminUserId,
          ids.secondaryAdminUserId,
          ids.superUserId,
          ids.chromiumScopeCandidateUserId,
          ids.mobileScopeCandidateUserId,
        ],
      },
    },
  });
  await prisma.userScopeAssignment.createMany({
    data: [
      {
        userId: ids.userId,
        scopeType: "LOCATION",
        scopeId: ids.locationId,
        accessLevel: "OPERATE",
      },
      {
        userId: ids.approverUserId,
        scopeType: "LOCATION",
        scopeId: ids.locationId,
        accessLevel: "APPROVE",
      },
      {
        userId: ids.adminUserId,
        scopeType: "COMPANY",
        scopeId: ids.companyId,
        accessLevel: "MANAGE",
      },
      {
        userId: ids.secondaryAdminUserId,
        scopeType: "COMPANY",
        scopeId: ids.companyId,
        accessLevel: "MANAGE",
      },
      {
        userId: ids.superUserId,
        scopeType: "COMPANY",
        scopeId: ids.companyId,
        accessLevel: "MANAGE",
      },
      ...[ids.adminUserId, ids.secondaryAdminUserId, ids.superUserId].flatMap((userId) => [
        ...demoBranchLocations.map((branch) => ({
          userId,
          scopeType: "LOCATION" as const,
          scopeId: branch.id,
          accessLevel: "MANAGE" as const,
        })),
        {
          userId,
          scopeType: "LOCATION" as const,
          scopeId: ids.warehouseLocationId,
          accessLevel: "MANAGE" as const,
        },
      ]),
    ],
  });

  await prisma.approvalRule.upsert({
    where: { id: ids.approvalRuleId },
    create: {
      id: ids.approvalRuleId,
      tenantId: ids.tenantId,
      companyId: ids.companyId,
      transactionType: "PURCHASE_REQUEST",
      priority: 100,
      isActive: true,
      scopeFilters: {
        source: "local-demo-sample-data",
      },
    },
    update: {
      transactionType: "PURCHASE_REQUEST",
      isActive: true,
    },
  });

  await prisma.approvalRuleStep.upsert({
    where: { id: ids.approvalRuleStepId },
    create: {
      id: ids.approvalRuleStepId,
      approvalRuleId: ids.approvalRuleId,
      stepOrder: 1,
      approverType: "ROLE",
      roleId: ids.approverRoleId,
      required: true,
    },
    update: {
      approverType: "ROLE",
      roleId: ids.approverRoleId,
      required: true,
    },
  });

  await prisma.approvalRule.upsert({
    where: { id: ids.emergencyPurchaseRequestApprovalRuleId },
    create: {
      id: ids.emergencyPurchaseRequestApprovalRuleId,
      tenantId: ids.tenantId,
      companyId: ids.companyId,
      transactionType: "PURCHASE_REQUEST",
      priority: 50,
      isActive: true,
      scopeFilters: {
        source: "local-demo-sample-data",
        route: "emergency_purchase",
        emergency: true,
      },
    },
    update: {
      transactionType: "PURCHASE_REQUEST",
      priority: 50,
      isActive: true,
      scopeFilters: {
        source: "local-demo-sample-data",
        route: "emergency_purchase",
        emergency: true,
      },
    },
  });

  await prisma.approvalRuleStep.upsert({
    where: { id: ids.emergencyPurchaseRequestApprovalRuleStepId },
    create: {
      id: ids.emergencyPurchaseRequestApprovalRuleStepId,
      approvalRuleId: ids.emergencyPurchaseRequestApprovalRuleId,
      stepOrder: 1,
      approverType: "ROLE",
      roleId: ids.approverRoleId,
      required: true,
    },
    update: {
      approverType: "ROLE",
      roleId: ids.approverRoleId,
      required: true,
    },
  });

  await prisma.approvalRule.upsert({
    where: { id: ids.quotationRecommendationApprovalRuleId },
    create: {
      id: ids.quotationRecommendationApprovalRuleId,
      tenantId: ids.tenantId,
      companyId: ids.companyId,
      transactionType: "QuotationRecommendation",
      priority: 100,
      isActive: true,
      scopeFilters: {
        source: "local-demo-sample-data",
        od04Pending: true,
        appliesTo: "supplier_selection",
      },
    },
    update: {
      transactionType: "QuotationRecommendation",
      priority: 100,
      isActive: true,
      scopeFilters: {
        source: "local-demo-sample-data",
        od04Pending: true,
        appliesTo: "supplier_selection",
      },
    },
  });

  await prisma.approvalRuleStep.upsert({
    where: { id: ids.quotationRecommendationApprovalRuleStepId },
    create: {
      id: ids.quotationRecommendationApprovalRuleStepId,
      approvalRuleId: ids.quotationRecommendationApprovalRuleId,
      stepOrder: 1,
      approverType: "ROLE",
      roleId: ids.approverRoleId,
      required: true,
    },
    update: {
      approvalRuleId: ids.quotationRecommendationApprovalRuleId,
      stepOrder: 1,
      approverType: "ROLE",
      roleId: ids.approverRoleId,
      required: true,
    },
  });

  await prisma.approvalRule.upsert({
    where: { id: ids.purchaseOrderApprovalRuleId },
    create: {
      id: ids.purchaseOrderApprovalRuleId,
      tenantId: ids.tenantId,
      companyId: ids.companyId,
      transactionType: "PurchaseOrder",
      priority: 100,
      isActive: true,
      scopeFilters: {
        source: "local-demo-sample-data",
        appliesTo: "po_approval",
      },
    },
    update: {
      transactionType: "PurchaseOrder",
      priority: 100,
      isActive: true,
      scopeFilters: {
        source: "local-demo-sample-data",
        appliesTo: "po_approval",
      },
    },
  });

  await prisma.approvalRuleStep.upsert({
    where: { id: ids.purchaseOrderApprovalRuleStepId },
    create: {
      id: ids.purchaseOrderApprovalRuleStepId,
      approvalRuleId: ids.purchaseOrderApprovalRuleId,
      stepOrder: 1,
      approverType: "ROLE",
      roleId: ids.approverRoleId,
      required: true,
    },
    update: {
      approvalRuleId: ids.purchaseOrderApprovalRuleId,
      stepOrder: 1,
      approverType: "ROLE",
      roleId: ids.approverRoleId,
      required: true,
    },
  });

  await prisma.approvalRule.upsert({
    where: { id: ids.purchaseOrderBalanceClosureApprovalRuleId },
    create: {
      id: ids.purchaseOrderBalanceClosureApprovalRuleId,
      tenantId: ids.tenantId,
      companyId: ids.companyId,
      transactionType: "PurchaseOrderBalanceClosure",
      priority: 100,
      isActive: true,
      scopeFilters: {
        source: "local-demo-sample-data",
        appliesTo: "po_remaining_balance_closure",
      },
    },
    update: {
      transactionType: "PurchaseOrderBalanceClosure",
      priority: 100,
      isActive: true,
      scopeFilters: {
        source: "local-demo-sample-data",
        appliesTo: "po_remaining_balance_closure",
      },
    },
  });

  await prisma.approvalRuleStep.upsert({
    where: { id: ids.purchaseOrderBalanceClosureApprovalRuleStepId },
    create: {
      id: ids.purchaseOrderBalanceClosureApprovalRuleStepId,
      approvalRuleId: ids.purchaseOrderBalanceClosureApprovalRuleId,
      stepOrder: 1,
      approverType: "ROLE",
      roleId: ids.approverRoleId,
      required: true,
    },
    update: {
      approvalRuleId: ids.purchaseOrderBalanceClosureApprovalRuleId,
      stepOrder: 1,
      approverType: "ROLE",
      roleId: ids.approverRoleId,
      required: true,
    },
  });

  await prisma.approvalRule.upsert({
    where: { id: ids.purchaseOrderAmendmentApprovalRuleId },
    create: {
      id: ids.purchaseOrderAmendmentApprovalRuleId,
      tenantId: ids.tenantId,
      companyId: ids.companyId,
      transactionType: "PurchaseOrderAmendment",
      priority: 100,
      isActive: true,
      scopeFilters: {
        source: "local-demo-sample-data",
        appliesTo: "issued_unreceived_po_amendment",
      },
    },
    update: {
      transactionType: "PurchaseOrderAmendment",
      priority: 100,
      isActive: true,
      scopeFilters: {
        source: "local-demo-sample-data",
        appliesTo: "issued_unreceived_po_amendment",
      },
    },
  });

  await prisma.approvalRuleStep.upsert({
    where: { id: ids.purchaseOrderAmendmentApprovalRuleStepId },
    create: {
      id: ids.purchaseOrderAmendmentApprovalRuleStepId,
      approvalRuleId: ids.purchaseOrderAmendmentApprovalRuleId,
      stepOrder: 1,
      approverType: "ROLE",
      roleId: ids.approverRoleId,
      required: true,
    },
    update: {
      approvalRuleId: ids.purchaseOrderAmendmentApprovalRuleId,
      stepOrder: 1,
      approverType: "ROLE",
      roleId: ids.approverRoleId,
      required: true,
    },
  });

  await prisma.approvalRule.upsert({
    where: { id: ids.wastageApprovalRuleId },
    create: {
      id: ids.wastageApprovalRuleId,
      tenantId: ids.tenantId,
      companyId: ids.companyId,
      transactionType: "WastageReport",
      priority: 100,
      isActive: true,
      scopeFilters: {
        source: "local-demo-sample-data",
        appliesTo: "non_posting_wastage_approval",
      },
    },
    update: {
      transactionType: "WastageReport",
      priority: 100,
      isActive: true,
      scopeFilters: {
        source: "local-demo-sample-data",
        appliesTo: "non_posting_wastage_approval",
      },
    },
  });

  await prisma.approvalRuleStep.upsert({
    where: { id: ids.wastageApprovalRuleStepId },
    create: {
      id: ids.wastageApprovalRuleStepId,
      approvalRuleId: ids.wastageApprovalRuleId,
      stepOrder: 1,
      approverType: "ROLE",
      roleId: ids.approverRoleId,
      required: true,
    },
    update: {
      approvalRuleId: ids.wastageApprovalRuleId,
      stepOrder: 1,
      approverType: "ROLE",
      roleId: ids.approverRoleId,
      required: true,
    },
  });

  await prisma.approvalRule.upsert({
    where: { id: ids.stockAdjustmentApprovalRuleId },
    create: {
      id: ids.stockAdjustmentApprovalRuleId,
      tenantId: ids.tenantId,
      companyId: ids.companyId,
      transactionType: "StockAdjustment",
      priority: 100,
      isActive: true,
      scopeFilters: {
        source: "local-demo-sample-data",
        appliesTo: "non_posting_stock_adjustment_approval",
      },
    },
    update: {
      transactionType: "StockAdjustment",
      priority: 100,
      isActive: true,
      scopeFilters: {
        source: "local-demo-sample-data",
        appliesTo: "non_posting_stock_adjustment_approval",
      },
    },
  });

  await prisma.approvalRuleStep.upsert({
    where: { id: ids.stockAdjustmentApprovalRuleStepId },
    create: {
      id: ids.stockAdjustmentApprovalRuleStepId,
      approvalRuleId: ids.stockAdjustmentApprovalRuleId,
      stepOrder: 1,
      approverType: "ROLE",
      roleId: ids.approverRoleId,
      required: true,
    },
    update: {
      approvalRuleId: ids.stockAdjustmentApprovalRuleId,
      stepOrder: 1,
      approverType: "ROLE",
      roleId: ids.approverRoleId,
      required: true,
    },
  });

  await prisma.approvalRule.upsert({
    where: { id: ids.stockCountVarianceApprovalRuleId },
    create: {
      id: ids.stockCountVarianceApprovalRuleId,
      tenantId: ids.tenantId,
      companyId: ids.companyId,
      transactionType: "StockCountVarianceAdjustment",
      priority: 100,
      isActive: true,
      scopeFilters: {
        source: "local-demo-sample-data",
        appliesTo: "count_variance_stock_adjustment_approval",
      },
    },
    update: {
      transactionType: "StockCountVarianceAdjustment",
      priority: 100,
      isActive: true,
      scopeFilters: {
        source: "local-demo-sample-data",
        appliesTo: "count_variance_stock_adjustment_approval",
      },
    },
  });

  await prisma.approvalRuleStep.upsert({
    where: { id: ids.stockCountVarianceApprovalRuleStepId },
    create: {
      id: ids.stockCountVarianceApprovalRuleStepId,
      approvalRuleId: ids.stockCountVarianceApprovalRuleId,
      stepOrder: 1,
      approverType: "ROLE",
      roleId: ids.approverRoleId,
      required: true,
    },
    update: {
      approvalRuleId: ids.stockCountVarianceApprovalRuleId,
      stepOrder: 1,
      approverType: "ROLE",
      roleId: ids.approverRoleId,
      required: true,
    },
  });

  await prisma.approvalRule.upsert({
    where: { id: ids.paymentRequestApprovalRuleId },
    create: {
      id: ids.paymentRequestApprovalRuleId,
      tenantId: ids.tenantId,
      companyId: ids.companyId,
      transactionType: "PaymentRequest",
      priority: 100,
      isActive: true,
      scopeFilters: {
        source: "local-demo-sample-data",
        appliesTo: "non_posting_payment_request_approval",
      },
    },
    update: {
      transactionType: "PaymentRequest",
      priority: 100,
      isActive: true,
      scopeFilters: {
        source: "local-demo-sample-data",
        appliesTo: "non_posting_payment_request_approval",
      },
    },
  });

  await prisma.approvalRuleStep.upsert({
    where: { id: ids.paymentRequestApprovalRuleStepId },
    create: {
      id: ids.paymentRequestApprovalRuleStepId,
      approvalRuleId: ids.paymentRequestApprovalRuleId,
      stepOrder: 1,
      approverType: "ROLE",
      roleId: ids.approverRoleId,
      required: true,
    },
    update: {
      approvalRuleId: ids.paymentRequestApprovalRuleId,
      stepOrder: 1,
      approverType: "ROLE",
      roleId: ids.approverRoleId,
      required: true,
    },
  });

  await prisma.approvalRule.upsert({
    where: { id: ids.paymentReleaseApprovalRuleId },
    create: {
      id: ids.paymentReleaseApprovalRuleId,
      tenantId: ids.tenantId,
      companyId: ids.companyId,
      transactionType: "PaymentRelease",
      priority: 100,
      isActive: true,
      scopeFilters: {
        source: "local-demo-sample-data",
        appliesTo: "non_posting_payment_release_approval",
      },
    },
    update: {
      transactionType: "PaymentRelease",
      priority: 100,
      isActive: true,
      scopeFilters: {
        source: "local-demo-sample-data",
        appliesTo: "non_posting_payment_release_approval",
      },
    },
  });

  await prisma.approvalRuleStep.upsert({
    where: { id: ids.paymentReleaseApprovalRuleStepId },
    create: {
      id: ids.paymentReleaseApprovalRuleStepId,
      approvalRuleId: ids.paymentReleaseApprovalRuleId,
      stepOrder: 1,
      approverType: "ROLE",
      roleId: ids.approverRoleId,
      required: true,
    },
    update: {
      approvalRuleId: ids.paymentReleaseApprovalRuleId,
      stepOrder: 1,
      approverType: "ROLE",
      roleId: ids.approverRoleId,
      required: true,
    },
  });

  await prisma.approvalRule.upsert({
    where: { id: ids.budgetRevisionApprovalRuleId },
    create: {
      id: ids.budgetRevisionApprovalRuleId,
      tenantId: ids.tenantId,
      companyId: ids.companyId,
      transactionType: "BudgetRevision",
      priority: 100,
      isActive: true,
      scopeFilters: {
        source: "local-demo-sample-data",
        appliesTo: "non_posting_budget_revision_approval",
      },
    },
    update: {
      transactionType: "BudgetRevision",
      priority: 100,
      isActive: true,
      scopeFilters: {
        source: "local-demo-sample-data",
        appliesTo: "non_posting_budget_revision_approval",
      },
    },
  });

  await prisma.approvalRuleStep.upsert({
    where: { id: ids.budgetRevisionApprovalRuleStepId },
    create: {
      id: ids.budgetRevisionApprovalRuleStepId,
      approvalRuleId: ids.budgetRevisionApprovalRuleId,
      stepOrder: 1,
      approverType: "ROLE",
      roleId: ids.approverRoleId,
      required: true,
    },
    update: {
      approvalRuleId: ids.budgetRevisionApprovalRuleId,
      stepOrder: 1,
      approverType: "ROLE",
      roleId: ids.approverRoleId,
      required: true,
    },
  });

  await prisma.approvalRule.upsert({
    where: { id: ids.expenseRequestApprovalRuleId },
    create: {
      id: ids.expenseRequestApprovalRuleId,
      tenantId: ids.tenantId,
      companyId: ids.companyId,
      transactionType: "ExpenseRequest",
      priority: 100,
      isActive: true,
      scopeFilters: {
        source: "local-demo-sample-data",
        appliesTo: "non_posting_expense_request_approval",
      },
    },
    update: {
      transactionType: "ExpenseRequest",
      priority: 100,
      isActive: true,
      scopeFilters: {
        source: "local-demo-sample-data",
        appliesTo: "non_posting_expense_request_approval",
      },
    },
  });

  await prisma.approvalRuleStep.upsert({
    where: { id: ids.expenseRequestApprovalRuleStepId },
    create: {
      id: ids.expenseRequestApprovalRuleStepId,
      approvalRuleId: ids.expenseRequestApprovalRuleId,
      stepOrder: 1,
      approverType: "ROLE",
      roleId: ids.approverRoleId,
      required: true,
    },
    update: {
      approvalRuleId: ids.expenseRequestApprovalRuleId,
      stepOrder: 1,
      approverType: "ROLE",
      roleId: ids.approverRoleId,
      required: true,
    },
  });

  await prisma.approvalRule.upsert({
    where: { id: ids.cashAdvanceApprovalRuleId },
    create: {
      id: ids.cashAdvanceApprovalRuleId,
      tenantId: ids.tenantId,
      companyId: ids.companyId,
      transactionType: "CashAdvanceRequest",
      priority: 100,
      isActive: true,
      scopeFilters: {
        source: "local-demo-sample-data",
        appliesTo: "non_posting_cash_advance_request_approval",
      },
    },
    update: {
      transactionType: "CashAdvanceRequest",
      priority: 100,
      isActive: true,
      scopeFilters: {
        source: "local-demo-sample-data",
        appliesTo: "non_posting_cash_advance_request_approval",
      },
    },
  });

  await prisma.approvalRuleStep.upsert({
    where: { id: ids.cashAdvanceApprovalRuleStepId },
    create: {
      id: ids.cashAdvanceApprovalRuleStepId,
      approvalRuleId: ids.cashAdvanceApprovalRuleId,
      stepOrder: 1,
      approverType: "ROLE",
      roleId: ids.approverRoleId,
      required: true,
    },
    update: {
      approvalRuleId: ids.cashAdvanceApprovalRuleId,
      stepOrder: 1,
      approverType: "ROLE",
      roleId: ids.approverRoleId,
      required: true,
    },
  });

  await prisma.approvalRule.upsert({
    where: { id: ids.pettyCashApprovalRuleId },
    create: {
      id: ids.pettyCashApprovalRuleId,
      tenantId: ids.tenantId,
      companyId: ids.companyId,
      transactionType: "PettyCashRequest",
      priority: 100,
      isActive: true,
      scopeFilters: {
        source: "local-demo-sample-data",
        appliesTo: "non_posting_petty_cash_request_approval",
      },
    },
    update: {
      transactionType: "PettyCashRequest",
      priority: 100,
      isActive: true,
      scopeFilters: {
        source: "local-demo-sample-data",
        appliesTo: "non_posting_petty_cash_request_approval",
      },
    },
  });

  await prisma.approvalRuleStep.upsert({
    where: { id: ids.pettyCashApprovalRuleStepId },
    create: {
      id: ids.pettyCashApprovalRuleStepId,
      approvalRuleId: ids.pettyCashApprovalRuleId,
      stepOrder: 1,
      approverType: "ROLE",
      roleId: ids.approverRoleId,
      required: true,
    },
    update: {
      approvalRuleId: ids.pettyCashApprovalRuleId,
      stepOrder: 1,
      approverType: "ROLE",
      roleId: ids.approverRoleId,
      required: true,
    },
  });

  await prisma.approvalRule.upsert({
    where: { id: ids.workforceLeaveApprovalRuleId },
    create: {
      id: ids.workforceLeaveApprovalRuleId,
      tenantId: ids.tenantId,
      companyId: ids.companyId,
      transactionType: "EmployeeLeaveRequest",
      priority: 100,
      isActive: true,
      scopeFilters: {
        source: "local-demo-sample-data",
        appliesTo: "non_payroll_leave_approval",
      },
    },
    update: {
      transactionType: "EmployeeLeaveRequest",
      priority: 100,
      isActive: true,
      scopeFilters: {
        source: "local-demo-sample-data",
        appliesTo: "non_payroll_leave_approval",
      },
    },
  });

  await prisma.approvalRuleStep.upsert({
    where: { id: ids.workforceLeaveApprovalRuleStepId },
    create: {
      id: ids.workforceLeaveApprovalRuleStepId,
      approvalRuleId: ids.workforceLeaveApprovalRuleId,
      stepOrder: 1,
      approverType: "ROLE",
      roleId: ids.approverRoleId,
      required: true,
    },
    update: {
      approvalRuleId: ids.workforceLeaveApprovalRuleId,
      stepOrder: 1,
      approverType: "ROLE",
      roleId: ids.approverRoleId,
      required: true,
    },
  });

  await prisma.approvalRule.upsert({
    where: { id: ids.workforceOvertimeApprovalRuleId },
    create: {
      id: ids.workforceOvertimeApprovalRuleId,
      tenantId: ids.tenantId,
      companyId: ids.companyId,
      transactionType: "EmployeeOvertimeRecord",
      priority: 100,
      isActive: true,
      scopeFilters: {
        source: "local-demo-sample-data",
        appliesTo: "non_payroll_overtime_approval",
      },
    },
    update: {
      transactionType: "EmployeeOvertimeRecord",
      priority: 100,
      isActive: true,
      scopeFilters: {
        source: "local-demo-sample-data",
        appliesTo: "non_payroll_overtime_approval",
      },
    },
  });

  await prisma.approvalRuleStep.upsert({
    where: { id: ids.workforceOvertimeApprovalRuleStepId },
    create: {
      id: ids.workforceOvertimeApprovalRuleStepId,
      approvalRuleId: ids.workforceOvertimeApprovalRuleId,
      stepOrder: 1,
      approverType: "ROLE",
      roleId: ids.approverRoleId,
      required: true,
    },
    update: {
      approvalRuleId: ids.workforceOvertimeApprovalRuleId,
      stepOrder: 1,
      approverType: "ROLE",
      roleId: ids.approverRoleId,
      required: true,
    },
  });

  await prisma.approvalRule.upsert({
    where: { id: ids.workforceScheduleApprovalRuleId },
    create: {
      id: ids.workforceScheduleApprovalRuleId,
      tenantId: ids.tenantId,
      companyId: ids.companyId,
      transactionType: "WorkforceSchedule",
      priority: 100,
      isActive: true,
      scopeFilters: {
        source: "local-demo-sample-data",
        appliesTo: "non_payroll_schedule_approval_before_publication",
      },
    },
    update: {
      transactionType: "WorkforceSchedule",
      priority: 100,
      isActive: true,
      scopeFilters: {
        source: "local-demo-sample-data",
        appliesTo: "non_payroll_schedule_approval_before_publication",
      },
    },
  });

  await prisma.approvalRuleStep.upsert({
    where: { id: ids.workforceScheduleApprovalRuleStepId },
    create: {
      id: ids.workforceScheduleApprovalRuleStepId,
      approvalRuleId: ids.workforceScheduleApprovalRuleId,
      stepOrder: 1,
      approverType: "ROLE",
      roleId: ids.approverRoleId,
      required: true,
    },
    update: {
      approvalRuleId: ids.workforceScheduleApprovalRuleId,
      stepOrder: 1,
      approverType: "ROLE",
      roleId: ids.approverRoleId,
      required: true,
    },
  });

  await prisma.approvalRule.upsert({
    where: { id: ids.attendanceImportApprovalRuleId },
    create: {
      id: ids.attendanceImportApprovalRuleId,
      tenantId: ids.tenantId,
      companyId: ids.companyId,
      transactionType: "AttendanceImportBatch",
      priority: 100,
      isActive: true,
      scopeFilters: {
        source: "local-demo-sample-data",
        appliesTo: "exception_or_rejection_attendance_import_review",
      },
    },
    update: {
      transactionType: "AttendanceImportBatch",
      priority: 100,
      isActive: true,
      scopeFilters: {
        source: "local-demo-sample-data",
        appliesTo: "exception_or_rejection_attendance_import_review",
      },
    },
  });

  await prisma.approvalRuleStep.upsert({
    where: { id: ids.attendanceImportApprovalRuleStepId },
    create: {
      id: ids.attendanceImportApprovalRuleStepId,
      approvalRuleId: ids.attendanceImportApprovalRuleId,
      stepOrder: 1,
      approverType: "ROLE",
      roleId: ids.approverRoleId,
      required: true,
    },
    update: {
      approvalRuleId: ids.attendanceImportApprovalRuleId,
      stepOrder: 1,
      approverType: "ROLE",
      roleId: ids.approverRoleId,
      required: true,
    },
  });

  await prisma.wastagePolicy.upsert({
    where: { id: ids.wastagePolicyId },
    create: {
      id: ids.wastagePolicyId,
      tenantId: ids.tenantId,
      companyId: ids.companyId,
      name: "Default wastage evidence and repeat-loss policy",
      policyVersion: "2026-06-demo",
      priority: 100,
      isActive: true,
      minimumEstimatedCost: 5000,
      requiresEvidence: true,
      repeatLookbackDays: 30,
      repeatItemLocationCount: 3,
      repeatReporterCount: 5,
      notes:
        "Demo policy: high-value wastage requires evidence and repeat patterns are flagged for review.",
    },
    update: {
      name: "Default wastage evidence and repeat-loss policy",
      policyVersion: "2026-06-demo",
      priority: 100,
      isActive: true,
      minimumEstimatedCost: 5000,
      requiresEvidence: true,
      repeatLookbackDays: 30,
      repeatItemLocationCount: 3,
      repeatReporterCount: 5,
      notes:
        "Demo policy: high-value wastage requires evidence and repeat patterns are flagged for review.",
    },
  });

  await seedOperationalReasonCodes();
  await seedPhase2WorkflowTransitionPolicies();
  await seedOpeningInventoryBalances();
  await seedPhase2ActualConsumptionDemoData();

  console.log(
    "Seeded local Core Administration, Yakiniku Like supplier, item, branch, recipe/menu-costing, POS-sales import, branch operations, food safety, incidents, maintenance, reason-code, workflow-policy, finance-configuration, finance-journal, budget-control, expense-request, cash-advance, petty-cash, period-close readiness, AP invoice, payment-request, payment-release, bank-cash reconciliation, workforce, opening-balance, and actual-consumption demo data.",
  );
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
