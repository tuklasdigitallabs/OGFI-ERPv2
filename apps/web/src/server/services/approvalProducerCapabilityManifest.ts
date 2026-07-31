import { createHash } from "node:crypto";
import {
  approvalRoutingPolicies,
  supportedApprovalDocumentTypes,
  type SupportedApprovalDocumentType,
} from "./approvalRoutingRegistry";

export const APPROVAL_PRODUCER_CAPABILITY_VERSION =
  "dec-0261.inventory-pilot-families.1";

export const approvalProducerStableErrors = Object.freeze({
  barrierRetry: "APPROVAL_ROUTING_PRODUCER_BARRIER_RETRY",
  contractMismatch: "APPROVAL_PRODUCER_CONTRACT_MISMATCH",
  sourceStale: "APPROVAL_PRODUCER_SOURCE_STALE",
  idempotencyConflict: "APPROVAL_PRODUCER_IDEMPOTENCY_CONFLICT",
  eligibleActorUnavailable: "APPROVAL_STEP_ELIGIBLE_ACTOR_NOT_AVAILABLE",
} as const);

type RequiredCapabilityDiscoveryFacts = Readonly<{
  documentType: SupportedApprovalDocumentType;
  sourceRelation: string;
  serializationRelation: string;
  producer: Readonly<{
    serviceFile: string;
    functionName: string;
  }>;
  proposedDatabaseCapability: Readonly<{
    name: string;
    signature: null;
    inputDesignStatus: "DEFERRED_FAMILY_SPECIFIC_DESIGN";
    parametersAreBindingsNotAuthority: true;
  }>;
  sourceStatuses: Readonly<{
    admitted: readonly string[];
    committed: readonly string[];
  }>;
  ruleInput: string;
  requiredPermissionCode: string;
  derivation: Readonly<{
    scope: string;
    due: string;
    prohibitedActors: readonly string[];
    activation: string;
    sourceLink: string;
  }>;
  concurrency: Readonly<{
    lock: string;
    compareAndSet: string;
  }>;
  stableErrors: readonly string[];
  idempotency: string;
}>;

function proposedDatabaseCapability(slug: string) {
  const name = `approval_writer.create_${slug}_v1`;
  return Object.freeze({
    name,
    signature: null,
    inputDesignStatus: "DEFERRED_FAMILY_SPECIFIC_DESIGN" as const,
    parametersAreBindingsNotAuthority: true as const,
  });
}

function errors(...familyErrors: string[]) {
  return Object.freeze([
    approvalProducerStableErrors.barrierRetry,
    approvalProducerStableErrors.contractMismatch,
    approvalProducerStableErrors.sourceStale,
    approvalProducerStableErrors.idempotencyConflict,
    approvalProducerStableErrors.eligibleActorUnavailable,
    ...familyErrors,
  ]);
}

const firstPending =
  "First rule step is PENDING with activation audit; later steps are WAITING.";
const exactReplay =
  "A retry may return the existing result only when source scope, pending approval, request/idempotency identity, and capability contract match; otherwise fail with a stable conflict.";

const requiredCapabilityDiscoveryFacts = {
  PurchaseRequest: {
    documentType: "PurchaseRequest",
    sourceRelation: "PurchaseRequest",
    serializationRelation: "PurchaseRequest",
    producer: { serviceFile: "purchaseRequests.ts", functionName: "submitPurchaseRequest" },
    proposedDatabaseCapability: proposedDatabaseCapability("purchase_request"),
    sourceStatuses: { admitted: ["DRAFT"], committed: ["PENDING_APPROVAL"] },
    ruleInput: "Active PurchaseRequest rule selected by emergency/non-emergency server route policy.",
    requiredPermissionCode: approvalRoutingPolicies.PurchaseRequest.requiredPermissionCode,
    derivation: {
      scope: "One LOCATION target from locked PurchaseRequest.requestLocationId.",
      due: "Current service converts PurchaseRequest.requiredDate to 00:00:00.000Z (UTC midnight).",
      prohibitedActors: approvalRoutingPolicies.PurchaseRequest.prohibitedActorSources,
      activation: firstPending,
      sourceLink: "ApprovalInstance.documentId equals PurchaseRequest.id; currentApprovalStep is set from the first sealed rule step.",
    },
    concurrency: {
      lock: "Shared company barrier, then exact scoped PurchaseRequest row and sealed rule definition.",
      compareAndSet: "DRAFT to PENDING_APPROVAL with version increment; one pending approval backstop.",
    },
    stableErrors: errors("INVALID_STATUS_TRANSITION", "APPROVAL_RULE_NOT_CONFIGURED"),
    idempotency: exactReplay,
  },
  QuotationRecommendation: {
    documentType: "QuotationRecommendation",
    sourceRelation: "QuotationRecommendation",
    serializationRelation: "QuotationRecommendation",
    producer: { serviceFile: "quotes.ts", functionName: "submitQuotationRecommendation" },
    proposedDatabaseCapability: proposedDatabaseCapability("quotation_recommendation"),
    sourceStatuses: { admitted: ["DRAFT"], committed: ["PENDING_APPROVAL"] },
    ruleInput: "Active QuotationRecommendation rule and its sealed ordered steps.",
    requiredPermissionCode: approvalRoutingPolicies.QuotationRecommendation.requiredPermissionCode,
    derivation: {
      scope: "One LOCATION target from locked quotation request purchase request requestLocationId.",
      due: "Locked purchase request requiredDate.",
      prohibitedActors:
        approvalRoutingPolicies.QuotationRecommendation.prohibitedActorSources,
      activation: firstPending,
      sourceLink: "ApprovalInstance.documentId equals QuotationRecommendation.id.",
    },
    concurrency: {
      lock: "Shared company barrier, then exact scoped recommendation and upstream request lineage.",
      compareAndSet: "DRAFT to PENDING_APPROVAL with submittedAt and version increment; one pending approval backstop.",
    },
    stableErrors: errors("QUOTATION_RECOMMENDATION_ALREADY_SUBMITTED", "APPROVAL_RULE_NOT_CONFIGURED"),
    idempotency: exactReplay,
  },
  PurchaseOrder: {
    documentType: "PurchaseOrder",
    sourceRelation: "PurchaseOrder",
    serializationRelation: "PurchaseOrder",
    producer: { serviceFile: "purchaseOrders.ts", functionName: "submitPurchaseOrderForApproval" },
    proposedDatabaseCapability: proposedDatabaseCapability("purchase_order"),
    sourceStatuses: { admitted: ["DRAFT"], committed: ["PENDING_APPROVAL"] },
    ruleInput: "Active PurchaseOrder rule and its sealed ordered steps.",
    requiredPermissionCode: approvalRoutingPolicies.PurchaseOrder.requiredPermissionCode,
    derivation: {
      scope: "One LOCATION target from locked PurchaseOrder.deliveryLocationId.",
      due: "Locked PurchaseOrder.expectedDeliveryDate.",
      prohibitedActors: approvalRoutingPolicies.PurchaseOrder.prohibitedActorSources,
      activation: firstPending,
      sourceLink: "ApprovalInstance.documentId equals PurchaseOrder.id.",
    },
    concurrency: {
      lock: "Shared company barrier, then exact scoped PurchaseOrder and required procurement lineage.",
      compareAndSet: "DRAFT to PENDING_APPROVAL; one pending approval backstop.",
    },
    stableErrors: errors("PURCHASE_ORDER_ALREADY_SUBMITTED", "PURCHASE_ORDER_NOT_DRAFT_FOR_APPROVAL"),
    idempotency: exactReplay,
  },
  PurchaseOrderBalanceClosure: {
    documentType: "PurchaseOrderBalanceClosure",
    sourceRelation: "PurchaseOrderBalanceClosure",
    serializationRelation: "PurchaseOrder",
    producer: { serviceFile: "purchaseOrders.ts", functionName: "requestPurchaseOrderBalanceClosure" },
    proposedDatabaseCapability: proposedDatabaseCapability("purchase_order_balance_closure"),
    sourceStatuses: { admitted: ["NOT_YET_CREATED"], committed: ["PENDING_APPROVAL"] },
    ruleInput: "Active PurchaseOrderBalanceClosure rule and its sealed ordered steps.",
    requiredPermissionCode: approvalRoutingPolicies.PurchaseOrderBalanceClosure.requiredPermissionCode,
    derivation: {
      scope: "One LOCATION target from locked parent PurchaseOrder.deliveryLocationId.",
      due: "Locked parent PurchaseOrder.expectedDeliveryDate.",
      prohibitedActors:
        approvalRoutingPolicies.PurchaseOrderBalanceClosure.prohibitedActorSources,
      activation: firstPending,
      sourceLink: "Preallocated closure id is both ApprovalInstance.documentId and the new PENDING_APPROVAL closure id.",
    },
    concurrency: {
      lock: "Shared company barrier, then parent PurchaseOrder row, receipt/line snapshot, pending closure set, and sealed rule.",
      compareAndSet: "Create exactly one pending closure from a still PARTIALLY_RECEIVED parent with no conflicting draft receipt/closure.",
    },
    stableErrors: errors("APPROVAL_RULE_NOT_CONFIGURED", "PURCHASE_ORDER_BALANCE_CLOSURE_NOT_ALLOWED"),
    idempotency: "Duplicate closure requests fail closed unless a future request hash proves an exact replay; parent pending-child state is authoritative.",
  },
  PurchaseOrderAmendment: {
    documentType: "PurchaseOrderAmendment",
    sourceRelation: "PurchaseOrderAmendment",
    serializationRelation: "PurchaseOrder",
    producer: { serviceFile: "purchaseOrders.ts", functionName: "requestPurchaseOrderAmendment" },
    proposedDatabaseCapability: proposedDatabaseCapability("purchase_order_amendment"),
    sourceStatuses: { admitted: ["NOT_YET_CREATED"], committed: ["PENDING_APPROVAL"] },
    ruleInput: "Active PurchaseOrderAmendment rule and its sealed ordered steps.",
    requiredPermissionCode: approvalRoutingPolicies.PurchaseOrderAmendment.requiredPermissionCode,
    derivation: {
      scope: "One LOCATION target from locked parent PurchaseOrder.deliveryLocationId.",
      due: "Locked parent PurchaseOrder.expectedDeliveryDate.",
      prohibitedActors:
        approvalRoutingPolicies.PurchaseOrderAmendment.prohibitedActorSources,
      activation: firstPending,
      sourceLink: "Preallocated amendment id is both ApprovalInstance.documentId and new amendment id; parent PO becomes AMENDMENT_PENDING.",
    },
    concurrency: {
      lock: "Shared company barrier, then parent PurchaseOrder row, lines/receipt/conflicting-child state, and sealed rule.",
      compareAndSet: "Parent ISSUED to AMENDMENT_PENDING plus one new PENDING_APPROVAL amendment in the same transaction.",
    },
    stableErrors: errors("APPROVAL_RULE_NOT_CONFIGURED", "PURCHASE_ORDER_NOT_ISSUED_FOR_AMENDMENT"),
    idempotency: "Duplicate amendments fail closed unless a future request hash proves the identical parent snapshot and proposal.",
  },
  InventoryTransfer: {
    documentType: "InventoryTransfer",
    sourceRelation: "InventoryTransfer",
    serializationRelation: "InventoryTransfer",
    producer: { serviceFile: "transfers.ts", functionName: "submitInventoryTransfer" },
    proposedDatabaseCapability: proposedDatabaseCapability("inventory_transfer"),
    sourceStatuses: { admitted: ["DRAFT", "RETURNED"], committed: ["PENDING_APPROVAL"] },
    ruleInput: "Active sealed InventoryTransfer rule plus the locked DEC-0261 pilot revision and activation attestation.",
    requiredPermissionCode: approvalRoutingPolicies.InventoryTransfer.requiredPermissionCode,
    derivation: {
      scope: "Two required LOCATION scope groups from locked source and destination endpoints.",
      due: "Locked InventoryTransfer.requiredByDate.",
      prohibitedActors: approvalRoutingPolicies.InventoryTransfer.prohibitedActorSources,
      activation: firstPending,
      sourceLink: "ApprovalInstance.documentId equals InventoryTransfer.id; the typed submission intent pins source and pilot revisions.",
    },
    concurrency: {
      lock: "Company/family barrier, pilot activation revision, exact transfer, endpoints, ordered lines, sealed rule, then graph.",
      compareAndSet: "Versioned DRAFT or RETURNED to PENDING_APPROVAL with one typed intent and one pending graph.",
    },
    stableErrors: errors("INVENTORY_TRANSFER_APPROVAL_DISABLED", "INVENTORY_PILOT_CLASSIFICATION_DENIED"),
    idempotency: "The append-only transfer submission intent returns only an exact source/configuration/request-hash replay; every mismatch conflicts.",
  },
  StockCountAttemptReview: {
    documentType: "StockCountAttemptReview",
    sourceRelation: "StockCountAttempt",
    serializationRelation: "StockCountSession",
    producer: { serviceFile: "stockCounts.ts", functionName: "submitStockCount" },
    proposedDatabaseCapability: proposedDatabaseCapability("stock_count_attempt_review"),
    sourceStatuses: { admitted: ["IN_PROGRESS"], committed: ["SUBMITTED"] },
    ruleInput: "Active sealed StockCountAttemptReview rule plus the locked DEC-0261 pilot revision and activation attestation.",
    requiredPermissionCode: approvalRoutingPolicies.StockCountAttemptReview.requiredPermissionCode,
    derivation: {
      scope: "One LOCATION target from the locked attempt InventoryLocation parent.",
      due: "No due timestamp.",
      prohibitedActors: approvalRoutingPolicies.StockCountAttemptReview.prohibitedActorSources,
      activation: firstPending,
      sourceLink: "ApprovalInstance.documentId equals current StockCountAttempt.id; typed intent pins attempt, session, lines, and pilot revision.",
    },
    concurrency: {
      lock: "Company/family barrier, pilot activation revision, session, current attempt, ordered attempt lines, sealed rule, then graph.",
      compareAndSet: "Versioned session and current attempt IN_PROGRESS to SUBMITTED with one immutable review intent.",
    },
    stableErrors: errors("STOCK_COUNT_ATTEMPT_REVIEW_APPROVAL_DISABLED", "INVENTORY_PILOT_CLASSIFICATION_DENIED"),
    idempotency: "The append-only count-review intent permits only an exact attempt/session/configuration/request-hash replay.",
  },
  WastageReport: {
    documentType: "WastageReport",
    sourceRelation: "WastageReport",
    serializationRelation: "WastageReport",
    producer: { serviceFile: "wastage.ts", functionName: "submitWastageReport" },
    proposedDatabaseCapability: proposedDatabaseCapability("wastage_report"),
    sourceStatuses: { admitted: ["DRAFT", "RETURNED"], committed: ["PENDING_APPROVAL"] },
    ruleInput: "Active WastageReport rule selected from the locked evaluated wastage policy.",
    requiredPermissionCode: approvalRoutingPolicies.WastageReport.requiredPermissionCode,
    derivation: {
      scope: "One LOCATION target from locked InventoryLocation.locationId.",
      due: "No due timestamp.",
      prohibitedActors: approvalRoutingPolicies.WastageReport.prohibitedActorSources,
      activation: firstPending,
      sourceLink: "ApprovalInstance.documentId equals WastageReport.id.",
    },
    concurrency: {
      lock: "Shared company barrier, then exact scoped WastageReport, location/policy facts, and sealed rule.",
      compareAndSet: "DRAFT or RETURNED to PENDING_APPROVAL; one pending approval backstop.",
    },
    stableErrors: errors("WASTAGE_APPROVAL_ALREADY_SUBMITTED", "WASTAGE_STATUS_CHANGED"),
    idempotency: exactReplay,
  },
  StockAdjustment: {
    documentType: "StockAdjustment",
    sourceRelation: "StockAdjustment",
    serializationRelation: "StockAdjustment",
    producer: { serviceFile: "stockAdjustments.ts", functionName: "submitStockAdjustment" },
    proposedDatabaseCapability: proposedDatabaseCapability("stock_adjustment"),
    sourceStatuses: { admitted: ["DRAFT", "SUBMITTED", "RETURNED"], committed: ["PENDING_APPROVAL"] },
    ruleInput: "Active StockAdjustment rule selected from locked adjustment/policy facts.",
    requiredPermissionCode: approvalRoutingPolicies.StockAdjustment.requiredPermissionCode,
    derivation: {
      scope: "One LOCATION target from locked InventoryLocation.locationId.",
      due: "No due timestamp.",
      prohibitedActors: approvalRoutingPolicies.StockAdjustment.prohibitedActorSources,
      activation: firstPending,
      sourceLink: "ApprovalInstance.documentId equals StockAdjustment.id.",
    },
    concurrency: {
      lock: "Shared company barrier, then exact scoped StockAdjustment, location/policy facts, and sealed rule.",
      compareAndSet: "DRAFT, SUBMITTED, or RETURNED to PENDING_APPROVAL; one pending approval backstop.",
    },
    stableErrors: errors("STOCK_ADJUSTMENT_APPROVAL_ALREADY_SUBMITTED", "STOCK_ADJUSTMENT_NOT_OPEN_FOR_SUBMIT"),
    idempotency: exactReplay,
  },
  OpeningInventoryCutover: {
    documentType: "OpeningInventoryCutover",
    sourceRelation: "OpeningInventoryCutover",
    serializationRelation: "OpeningInventoryCutover",
    producer: { serviceFile: "openingInventoryCutovers.ts", functionName: "submitOpeningInventoryCutoverForApproval" },
    proposedDatabaseCapability: proposedDatabaseCapability("opening_inventory_cutover"),
    sourceStatuses: { admitted: ["DRAFT", "RETURNED"], committed: ["PENDING_APPROVAL"] },
    ruleInput: "Sealed two-step OpeningInventoryCutover rule with Operations first and Accounting second; both permissions are server-owned.",
    requiredPermissionCode: approvalRoutingPolicies.OpeningInventoryCutover.requiredPermissionCode,
    derivation: {
      scope: "One exact LOCATION target from the locked OpeningInventoryCutover.locationId.",
      due: "No due timestamp.",
      prohibitedActors: approvalRoutingPolicies.OpeningInventoryCutover.prohibitedActorSources,
      activation: "Operations is PENDING; Accounting remains WAITING until the first step is approved.",
      sourceLink: "ApprovalInstance.documentId equals OpeningInventoryCutover.id and is bound by the source approvalInstanceId CAS.",
    },
    concurrency: {
      lock: "Shared company barrier, then exact cohort/cutover, sealed rule, source count-derived immutable lines, and routed approval graph.",
      compareAndSet: "DRAFT or RETURNED with exact version and empty approval link to PENDING_APPROVAL with version increment.",
    },
    stableErrors: errors("OPENING_INVENTORY_APPROVAL_RULE_NOT_CONFIGURED", "OPENING_INVENTORY_APPROVAL_ALREADY_SUBMITTED", "OPENING_INVENTORY_CONCURRENT_MODIFICATION"),
    idempotency: "No blind replay: prepared cutovers are bound to a cohort-scoped immutable idempotency key and approval submission requires an exact source version.",
  },
  FinanceCloseRun: {
    documentType: "FinanceCloseRun",
    sourceRelation: "FinanceCloseRun",
    serializationRelation: "FinanceCloseRun",
    producer: { serviceFile: "financePeriodClose.ts", functionName: "requestPeriodCloseSensitiveActionApproval" },
    proposedDatabaseCapability: proposedDatabaseCapability("finance_close_run"),
    sourceStatuses: { admitted: ["CLOSED"], committed: ["CLOSED"] },
    ruleInput: "Active FinanceCloseRun rule plus locked LOCK_PERIOD or REOPEN_PERIOD action in configSnapshot.",
    requiredPermissionCode: approvalRoutingPolicies.FinanceCloseRun.requiredPermissionCode,
    derivation: {
      scope: "One COMPANY target from the locked run company.",
      due: "No due timestamp.",
      prohibitedActors: approvalRoutingPolicies.FinanceCloseRun.prohibitedActorSources,
      activation: firstPending,
      sourceLink: "ApprovalInstance.documentId equals FinanceCloseRun.id; pending action is stored in the versioned config snapshot.",
    },
    concurrency: {
      lock: "Shared company barrier, then FinanceCloseRun, accounting period/readiness facts, and sealed rule.",
      compareAndSet: "CLOSED remains CLOSED while configSnapshot receives one pending action and run version increments.",
    },
    stableErrors: errors("PERIOD_CLOSE_APPROVAL_ALREADY_PENDING", "PERIOD_CLOSE_RUN_NOT_COMPLETED"),
    idempotency: exactReplay,
  },
  BudgetRevision: {
    documentType: "BudgetRevision",
    sourceRelation: "BudgetRevision",
    serializationRelation: "BudgetRevision",
    producer: { serviceFile: "budgetControl.ts", functionName: "submitBudgetRevisionForReview" },
    proposedDatabaseCapability: proposedDatabaseCapability("budget_revision"),
    sourceStatuses: { admitted: ["DRAFT"], committed: ["SUBMITTED"] },
    ruleInput: "Active BudgetRevision rule and locked budget/location-line scope set.",
    requiredPermissionCode: approvalRoutingPolicies.BudgetRevision.requiredPermissionCode,
    derivation: {
      scope: "One ALL group over distinct locked budget/line LOCATION targets, or one COMPANY target when no location exists.",
      due: "Flag-false path uses locked effectiveFrom; normalized deferred-review path uses null until review activation.",
      prohibitedActors: approvalRoutingPolicies.BudgetRevision.prohibitedActorSources,
      activation: "Flag false: first step PENDING and later WAITING. Normalized activation: every step WAITING until commitment-fit review.",
      sourceLink: "ApprovalInstance.documentId equals BudgetRevision.id; the source carries no direct approval link.",
    },
    concurrency: {
      lock: "Shared company barrier, then revision, budget/line scope facts, and sealed rule in the established lifecycle order.",
      compareAndSet: "DRAFT to SUBMITTED; existing SUBMITTED is an exact source-level replay only when the linked graph contract matches.",
    },
    stableErrors: errors("BUDGET_REVISION_ALREADY_SUBMITTED", "BUDGET_REVISION_INVALID_STATUS_TRANSITION"),
    idempotency: exactReplay,
  },
  ExpenseRequest: {
    documentType: "ExpenseRequest",
    sourceRelation: "ExpenseRequest",
    serializationRelation: "ExpenseRequest",
    producer: { serviceFile: "expenseRequests.ts", functionName: "submitExpenseRequestForApproval" },
    proposedDatabaseCapability: proposedDatabaseCapability("expense_request"),
    sourceStatuses: { admitted: ["DRAFT", "RETURNED_FOR_REVISION"], committed: ["AWAITING_APPROVAL"] },
    ruleInput: "Active ExpenseRequest rule and locked evidence/line/source scope facts.",
    requiredPermissionCode: approvalRoutingPolicies.ExpenseRequest.requiredPermissionCode,
    derivation: {
      scope: "One LOCATION target from locked ExpenseRequest.locationId.",
      due: "Locked ExpenseRequest.requiredByDate.",
      prohibitedActors: approvalRoutingPolicies.ExpenseRequest.prohibitedActorSources,
      activation: firstPending,
      sourceLink: "ExpenseRequest.approvalInstanceId is set to the new exact instance.",
    },
    concurrency: {
      lock: "Shared company barrier, then exact request/lines/evidence scope and sealed rule.",
      compareAndSet: "DRAFT or RETURNED_FOR_REVISION to AWAITING_APPROVAL with link and version increment.",
    },
    stableErrors: errors("EXPENSE_REQUEST_ALREADY_SUBMITTED", "EXPENSE_REQUEST_INVALID_STATUS_TRANSITION"),
    idempotency: exactReplay,
  },
  CashAdvanceRequest: {
    documentType: "CashAdvanceRequest",
    sourceRelation: "CashAdvanceRequest",
    serializationRelation: "CashAdvanceRequest",
    producer: { serviceFile: "cashAdvances.ts", functionName: "submitCashAdvanceForApproval" },
    proposedDatabaseCapability: proposedDatabaseCapability("cash_advance_request"),
    sourceStatuses: { admitted: ["DRAFT", "RETURNED_FOR_REVISION"], committed: ["AWAITING_APPROVAL"] },
    ruleInput: "Active CashAdvanceRequest rule and locked request/location facts.",
    requiredPermissionCode: approvalRoutingPolicies.CashAdvanceRequest.requiredPermissionCode,
    derivation: {
      scope: "One LOCATION target from locked CashAdvanceRequest.locationId.",
      due: "Locked CashAdvanceRequest.dueDate.",
      prohibitedActors: approvalRoutingPolicies.CashAdvanceRequest.prohibitedActorSources,
      activation: firstPending,
      sourceLink: "CashAdvanceRequest.approvalInstanceId is set to the new exact instance.",
    },
    concurrency: {
      lock: "Shared company barrier, then exact request/location and sealed rule.",
      compareAndSet: "Admitted draft/revision state to AWAITING_APPROVAL with link and version increment.",
    },
    stableErrors: errors("CASH_ADVANCE_ALREADY_SUBMITTED", "CASH_ADVANCE_INVALID_STATUS_TRANSITION"),
    idempotency: exactReplay,
  },
  PettyCashRequest: {
    documentType: "PettyCashRequest",
    sourceRelation: "PettyCashRequest",
    serializationRelation: "PettyCashRequest",
    producer: { serviceFile: "pettyCash.ts", functionName: "submitPettyCashRequest" },
    proposedDatabaseCapability: proposedDatabaseCapability("petty_cash_request"),
    sourceStatuses: { admitted: ["DRAFT", "RETURNED_FOR_REVISION"], committed: ["AWAITING_APPROVAL"] },
    ruleInput: "Active PettyCashRequest rule and locked request/fund facts.",
    requiredPermissionCode: approvalRoutingPolicies.PettyCashRequest.requiredPermissionCode,
    derivation: {
      scope: "One LOCATION target from locked PettyCashFund.locationId.",
      due: "Locked PettyCashRequest.dueBy.",
      prohibitedActors: approvalRoutingPolicies.PettyCashRequest.prohibitedActorSources,
      activation: firstPending,
      sourceLink: "PettyCashRequest.approvalInstanceId is set and the immutable proposal starts at the requested amount.",
    },
    concurrency: {
      lock: "Shared company barrier, then exact request/fund and sealed rule.",
      compareAndSet: "Admitted draft/revision state to AWAITING_APPROVAL with link and initialized proposal version.",
    },
    stableErrors: errors("PETTY_CASH_ALREADY_SUBMITTED", "PETTY_CASH_REQUEST_INVALID_STATUS_TRANSITION"),
    idempotency: exactReplay,
  },
  PaymentRequest: {
    documentType: "PaymentRequest",
    sourceRelation: "PaymentRequest",
    serializationRelation: "PaymentRequest",
    producer: { serviceFile: "finance.ts", functionName: "submitPaymentRequest" },
    proposedDatabaseCapability: proposedDatabaseCapability("payment_request"),
    sourceStatuses: { admitted: ["DRAFT", "RETURNED_FOR_REVISION"], committed: ["AWAITING_APPROVAL"] },
    ruleInput: "Active PaymentRequest rule and locked request/location/line facts.",
    requiredPermissionCode: approvalRoutingPolicies.PaymentRequest.requiredPermissionCode,
    derivation: {
      scope: "One LOCATION target from locked PaymentRequest.locationId.",
      due: "No due timestamp.",
      prohibitedActors: approvalRoutingPolicies.PaymentRequest.prohibitedActorSources,
      activation: firstPending,
      sourceLink: "PaymentRequest.approvalInstanceId is set to the new exact instance.",
    },
    concurrency: {
      lock: "Shared company barrier, then exact request/line/source facts and sealed rule.",
      compareAndSet: "DRAFT or RETURNED_FOR_REVISION to AWAITING_APPROVAL with exact instance link.",
    },
    stableErrors: errors("PAYMENT_REQUEST_ALREADY_SUBMITTED", "PAYMENT_REQUEST_NOT_SUBMITTABLE"),
    idempotency: exactReplay,
  },
  PaymentRelease: {
    documentType: "PaymentRelease",
    sourceRelation: "PaymentRelease",
    serializationRelation: "PaymentRequest",
    producer: { serviceFile: "finance.ts", functionName: "createPaymentReleaseDraft" },
    proposedDatabaseCapability: proposedDatabaseCapability("payment_release"),
    sourceStatuses: { admitted: ["NOT_YET_CREATED"], committed: ["DRAFT"] },
    ruleInput: "Active PaymentRelease rule and locked approved PaymentRequest, bank, allocation, and release facts.",
    requiredPermissionCode: approvalRoutingPolicies.PaymentRelease.requiredPermissionCode,
    derivation: {
      scope: "One LOCATION target from the new release location, validated against locked PaymentRequest scope.",
      due: "Requested scheduledAt stored on the new release.",
      prohibitedActors: approvalRoutingPolicies.PaymentRelease.prohibitedActorSources,
      activation: firstPending,
      sourceLink: "Preallocated release id is ApprovalInstance.documentId and PaymentRelease.approvalInstanceId links back after uncommitted DRAFT creation.",
    },
    concurrency: {
      lock: "Shared company barrier, then approved PaymentRequest/allocation exposure; create DRAFT source before the named capability links its graph.",
      compareAndSet: "Unique paymentRequestId/sourceEventKey/idempotency identity plus one exact DRAFT release and approval link.",
    },
    stableErrors: errors("PAYMENT_RELEASE_REQUEST_NOT_APPROVED", "PAYMENT_RELEASE_IDEMPOTENCY_CONFLICT"),
    idempotency: "An exact scoped idempotency-key replay returns the same release; changed payload or source lineage is a conflict.",
  },
  EmployeeLeaveRequest: {
    documentType: "EmployeeLeaveRequest",
    sourceRelation: "EmployeeLeaveRequest",
    serializationRelation: "EmployeeLeaveRequest",
    producer: { serviceFile: "workforce.ts", functionName: "submitLeaveRequest" },
    proposedDatabaseCapability: proposedDatabaseCapability("employee_leave_request"),
    sourceStatuses: { admitted: ["DRAFT", "RETURNED_FOR_REVISION"], committed: ["SUBMITTED"] },
    ruleInput: "Active EmployeeLeaveRequest rule and locked employee/location facts.",
    requiredPermissionCode: approvalRoutingPolicies.EmployeeLeaveRequest.requiredPermissionCode,
    derivation: {
      scope: "One LOCATION target from locked EmployeeLeaveRequest.locationId.",
      due: "Locked EmployeeLeaveRequest.startDate.",
      prohibitedActors:
        approvalRoutingPolicies.EmployeeLeaveRequest.prohibitedActorSources,
      activation: firstPending,
      sourceLink: "EmployeeLeaveRequest.approvalInstanceId is set to the new exact instance.",
    },
    concurrency: {
      lock: "Shared company barrier, then exact leave/employee/location and sealed rule.",
      compareAndSet: "DRAFT or RETURNED_FOR_REVISION to SUBMITTED with approval link; existing exact SUBMITTED is replay-safe.",
    },
    stableErrors: errors("WORKFORCE_LEAVE_ALREADY_SUBMITTED", "WORKFORCE_LEAVE_INVALID_SUBMIT_STATUS"),
    idempotency: exactReplay,
  },
  EmployeeOvertimeRecord: {
    documentType: "EmployeeOvertimeRecord",
    sourceRelation: "EmployeeOvertimeRecord",
    serializationRelation: "EmployeeOvertimeRecord",
    producer: { serviceFile: "workforce.ts", functionName: "submitOvertimeRecord" },
    proposedDatabaseCapability: proposedDatabaseCapability("employee_overtime_record"),
    sourceStatuses: { admitted: ["DRAFT"], committed: ["SUBMITTED"] },
    ruleInput: "Active EmployeeOvertimeRecord rule and locked employee/location facts.",
    requiredPermissionCode: approvalRoutingPolicies.EmployeeOvertimeRecord.requiredPermissionCode,
    derivation: {
      scope: "One LOCATION target from locked EmployeeOvertimeRecord.locationId.",
      due: "Locked EmployeeOvertimeRecord.workedStartAt.",
      prohibitedActors:
        approvalRoutingPolicies.EmployeeOvertimeRecord.prohibitedActorSources,
      activation: firstPending,
      sourceLink: "EmployeeOvertimeRecord.approvalInstanceId is set to the new exact instance.",
    },
    concurrency: {
      lock: "Shared company barrier, then exact overtime/employee/location and sealed rule.",
      compareAndSet: "DRAFT to SUBMITTED with approval link; existing exact SUBMITTED is replay-safe.",
    },
    stableErrors: errors("WORKFORCE_OVERTIME_ALREADY_SUBMITTED", "WORKFORCE_OVERTIME_INVALID_SUBMIT_STATUS"),
    idempotency: exactReplay,
  },
  WorkforceSchedule: {
    documentType: "WorkforceSchedule",
    sourceRelation: "WorkforceSchedule",
    serializationRelation: "WorkforceSchedule",
    producer: { serviceFile: "workforce.ts", functionName: "submitWorkforceSchedule" },
    proposedDatabaseCapability: proposedDatabaseCapability("workforce_schedule"),
    sourceStatuses: { admitted: ["DRAFT", "RETURNED_FOR_REVISION"], committed: ["SUBMITTED"] },
    ruleInput: "Active WorkforceSchedule rule and locked schedule/location/line facts.",
    requiredPermissionCode: approvalRoutingPolicies.WorkforceSchedule.requiredPermissionCode,
    derivation: {
      scope: "One LOCATION target from locked WorkforceSchedule.locationId.",
      due: "Locked WorkforceSchedule.scheduleDate.",
      prohibitedActors: approvalRoutingPolicies.WorkforceSchedule.prohibitedActorSources,
      activation: firstPending,
      sourceLink: "WorkforceSchedule.approvalInstanceId is set to the new exact instance.",
    },
    concurrency: {
      lock: "Shared company barrier, then exact schedule/location/lines and sealed rule.",
      compareAndSet: "DRAFT or RETURNED_FOR_REVISION to SUBMITTED with approval link.",
    },
    stableErrors: errors("WORKFORCE_SCHEDULE_ALREADY_SUBMITTED", "WORKFORCE_SCHEDULE_INVALID_SUBMIT_STATUS"),
    idempotency: exactReplay,
  },
  AttendanceImportBatch: {
    documentType: "AttendanceImportBatch",
    sourceRelation: "AttendanceImportBatch",
    serializationRelation: "AttendanceImportBatch",
    producer: { serviceFile: "workforce.ts", functionName: "reviewAttendanceImportBatch" },
    proposedDatabaseCapability: proposedDatabaseCapability("attendance_import_batch"),
    sourceStatuses: { admitted: ["IMPORTED", "VALIDATING", "REVIEW_READY", "EXCEPTION_LIST"], committed: ["VALIDATING"] },
    ruleInput: "Active AttendanceImportBatch rule only when review outcome or exception/duplicate facts require approval.",
    requiredPermissionCode: approvalRoutingPolicies.AttendanceImportBatch.requiredPermissionCode,
    derivation: {
      scope: "One LOCATION target from locked AttendanceImportBatch.locationId.",
      due: "No due timestamp.",
      prohibitedActors:
        approvalRoutingPolicies.AttendanceImportBatch.prohibitedActorSources,
      activation: firstPending,
      sourceLink: "AttendanceImportBatch.approvalInstanceId is set only on the approval-required branch; documentId equals batch id.",
    },
    concurrency: {
      lock: "Shared company barrier, then exact batch/line review facts, location, and sealed rule.",
      compareAndSet: "Approval-required admitted state to VALIDATING with exact approval link; non-approval review branch creates no graph.",
    },
    stableErrors: errors("WORKFORCE_ATTENDANCE_IMPORT_ALREADY_SUBMITTED", "WORKFORCE_ATTENDANCE_IMPORT_INVALID_REVIEW_STATUS"),
    idempotency: exactReplay,
  },
} satisfies Record<SupportedApprovalDocumentType, RequiredCapabilityDiscoveryFacts>;

type CurrentControlLevel = "IMPLEMENTED" | "PARTIAL" | "ABSENT";

const currentTransactionFacts = {
  PurchaseRequest: { lock: "IMPLEMENTED", cas: "IMPLEMENTED", replay: "ABSENT", fact: "The producer transaction locks the exact tenant/company/location source row, derives routing facts from that snapshot, and claims DRAFT with an exact version/status/scope compare-and-set; durable replay identity remains absent." },
  QuotationRecommendation: { lock: "IMPLEMENTED", cas: "IMPLEMENTED", replay: "ABSENT", fact: "The producer barrier now locks the recommendation, quotation-request, and linked Purchase Request lineage inside the transaction, re-reads the authoritative recommendation, and claims DRAFT with exact scoped version/status/lineage predicates; durable replay identity remains absent." },
  PurchaseOrder: { lock: "IMPLEMENTED", cas: "IMPLEMENTED", replay: "ABSENT", fact: "The producer barrier now locks PurchaseOrder then recommendation→quotation-request→Purchase Request lineage, re-reads authoritative status and scope, and claims DRAFT before graph creation with exact scoped linkage predicates; durable replay identity remains absent." },
  PurchaseOrderBalanceClosure: { lock: "IMPLEMENTED", cas: "PARTIAL", replay: "ABSENT", fact: "Parent PurchaseOrder is locked and revalidated; the closure child is now created before the approval graph in the same transaction, but has no request-hash replay contract or durable child intent identity." },
  PurchaseOrderAmendment: { lock: "IMPLEMENTED", cas: "IMPLEMENTED", replay: "ABSENT", fact: "The producer barrier now locks and re-reads the scoped PurchaseOrder before snapshotting, creates the amendment child before graph work, and claims ISSUED-to-AMENDMENT_PENDING before routing with exact parent scope/status predicates; durable replay identity remains absent." },
  InventoryTransfer: { lock: "PARTIAL", cas: "ABSENT", replay: "ABSENT", fact: "The legacy producer locks the transfer and lines but transitions directly to REQUESTED; DEC-0260/0261 normalized graph, source-version, classifier, and typed-intent controls are not yet implemented." },
  StockCountAttemptReview: { lock: "PARTIAL", cas: "ABSENT", replay: "ABSENT", fact: "The legacy count submit locks session/location and mirrors attempt state, but creates no normalized review graph or typed intent and has no source-version replay contract." },
  WastageReport: { lock: "IMPLEMENTED", cas: "IMPLEMENTED", replay: "ABSENT", fact: "Shared company barrier now locks the scoped WastageReport through InventoryLocation→Location, reloads lines and policy in-transaction, and claims DRAFT/RETURNED before approval graph creation; durable replay identity remains absent." },
  StockAdjustment: { lock: "IMPLEMENTED", cas: "IMPLEMENTED", replay: "ABSENT", fact: "Shared company barrier now locks the scoped StockAdjustment through InventoryLocation→Location, reloads header/lines, requires a sealed rule, and claims DRAFT/SUBMITTED/RETURNED before approval graph creation; durable replay identity remains absent." },
  OpeningInventoryCutover: { lock: "IMPLEMENTED", cas: "IMPLEMENTED", replay: "PARTIAL", fact: "The producer binds a previously prepared immutable source-count/valuation/evidence digest to a sealed two-step rule, creates scoped Operations then Accounting routing, and CAS-links DRAFT/RETURNED cutovers to one PENDING graph; cutover preparation provides cohort-scoped request identity." },
  FinanceCloseRun: { lock: "IMPLEMENTED", cas: "IMPLEMENTED", replay: "ABSENT", fact: "Run row is explicitly locked and pending-action snapshot claims CLOSED plus the exact expected version before approval graph creation; durable replay identity remains absent, while accounting-period/readiness child locking remains a separate finance-control gate." },
  BudgetRevision: { lock: "IMPLEMENTED", cas: "IMPLEMENTED", replay: "ABSENT", fact: "Shared company barrier now locks BudgetRevision, parent Budget, ordered BudgetLine/location scope rows, and requires a sealed rule before exact updatedAt DRAFT→SUBMITTED CAS; already-submitted revisions fail closed because durable replay identity and coherent graph proof remain absent." },
  ExpenseRequest: { lock: "IMPLEMENTED", cas: "IMPLEMENTED", replay: "ABSENT", fact: "Shared company barrier now locks the scoped ExpenseRequest through active Location, requires a sealed rule, claims DRAFT/RETURNED_FOR_REVISION with version/status/link predicates before graph creation, and attaches the exact approval backlink with a second CAS; durable replay identity remains absent." },
  CashAdvanceRequest: { lock: "IMPLEMENTED", cas: "IMPLEMENTED", replay: "ABSENT", fact: "Shared company barrier now locks the scoped CashAdvanceRequest through active Location, requires a sealed rule, claims DRAFT/RETURNED_FOR_REVISION with version/status/link predicates before graph creation, and attaches the exact approval backlink with a second CAS; beneficiary self-approval is blocked in the legacy decision path, while durable replay and linked-source lineage proof remain absent." },
  PettyCashRequest: { lock: "IMPLEMENTED", cas: "IMPLEMENTED", replay: "ABSENT", fact: "Shared company barrier now locks PettyCashRequest with its active PettyCashFund/Location, requires a sealed rule, initializes the immutable requested-amount proposal before graph creation, and attaches the exact approval backlink with a second CAS; durable replay and decision-intent proof remain absent." },
  PaymentRequest: { lock: "IMPLEMENTED", cas: "IMPLEMENTED", replay: "ABSENT", fact: "Shared company barrier now locks PaymentRequest through active tenant/company Location, locks ordered PaymentRequestLine rows and linked AP invoices, requires a sealed rule, claims DRAFT/RETURNED_FOR_REVISION before graph creation, and attaches the exact ApprovalInstance backlink with a second CAS; durable replay identity, normalized policy approval, and legacy decision-writer parity remain absent." },
  PaymentRelease: { lock: "ABSENT", cas: "PARTIAL", replay: "PARTIAL", fact: "A new release and graph are constructed together; idempotency-key lookup returns an existing row without a request-payload hash." },
  EmployeeLeaveRequest: { lock: "IMPLEMENTED", cas: "IMPLEMENTED", replay: "ABSENT", fact: "Shared company barrier now locks EmployeeLeaveRequest, active Employee, and active Location, requires a sealed rule, rejects blind SUBMITTED replay, and binds the exact ApprovalInstance backlink with scoped graph/source CAS; durable submit replay, lifecycle-writer parity, and planned Phase III policy remain absent." },
  EmployeeOvertimeRecord: { lock: "IMPLEMENTED", cas: "IMPLEMENTED", replay: "ABSENT", fact: "Shared company barrier now locks EmployeeOvertimeRecord, active Employee, and active Location, requires a sealed rule, rejects blind SUBMITTED replay, and binds the exact ApprovalInstance backlink with scoped DRAFT/updatedAt CAS; durable submit replay and lifecycle-writer parity remain absent." },
  WorkforceSchedule: { lock: "IMPLEMENTED", cas: "IMPLEMENTED", replay: "ABSENT", fact: "Shared company barrier now locks WorkforceSchedule, ordered same-scope lines, and active Location, requires a sealed rule, and binds the exact ApprovalInstance backlink with scoped DRAFT/RETURNED and updatedAt CAS; durable replay and lifecycle-writer parity remain absent." },
  AttendanceImportBatch: { lock: "IMPLEMENTED", cas: "IMPLEMENTED", replay: "ABSENT", fact: "Conditional review now locks AttendanceImportBatch, ordered same-scope lines, and active Location, requires a sealed rule for approval-required outcomes, and uses scoped updatedAt/status/link CAS in both graph and clean branches; durable review replay and lifecycle-writer parity remain absent." },
} as const satisfies Record<SupportedApprovalDocumentType, Readonly<{
  lock: CurrentControlLevel;
  cas: CurrentControlLevel;
  replay: CurrentControlLevel;
  fact: string;
}>>;

const currentRoutingObservations = Object.fromEntries(
  supportedApprovalDocumentTypes.map((documentType) => [documentType, {
    scope: `The current ${documentType} producer persists explicitly assembled routing scope targets; this observation does not infer a source-row lock.`,
    due: documentType === "PurchaseRequest"
      ? "The current producer converts PurchaseRequest.requiredDate to UTC midnight when present."
      : "The current producer persists its explicitly assembled due value; required future derivation is documented separately.",
    prohibitedActors: approvalRoutingPolicies[documentType].prohibitedActorSources,
    activation: "The current producer persists its explicitly assembled initial step statuses; required future activation semantics are documented separately.",
    sourceLink: "The current producer persists its existing document and source-link fields; required future identity semantics are documented separately.",
  }]),
) as unknown as Record<SupportedApprovalDocumentType, RequiredCapabilityDiscoveryFacts["derivation"]>;

const newChildIdentityDesign = {
  PurchaseOrderBalanceClosure: {
    parentIdentifier: "PurchaseOrder.id",
    childIdentifier: "PurchaseOrderBalanceClosure.id (currently preallocated)",
    unresolvedRequiredDesign: "Define whether the future capability creates the child or binds a precreated uncommitted child, and define exact parent/child CAS plus replay identity.",
  },
  PurchaseOrderAmendment: {
    parentIdentifier: "PurchaseOrder.id",
    childIdentifier: "PurchaseOrderAmendment.id (currently preallocated)",
    unresolvedRequiredDesign: "Define whether the future capability creates the child or binds a precreated uncommitted child, and define exact parent/child CAS plus replay identity.",
  },
  PaymentRelease: {
    parentIdentifier: "PaymentRequest.id",
    childIdentifier: "PaymentRelease.id (currently preallocated)",
    unresolvedRequiredDesign: "Define DRAFT child creation versus binding order, allocation identity, payload hashing, parent exposure lock, and exact replay before any executable signature is approved.",
  },
} as const;

const shadowObserverNames = {
  PurchaseRequest: "approval_shadow.observe_purchase_request_v1",
  QuotationRecommendation: "approval_shadow.observe_quotation_recommendation_v1",
  PurchaseOrder: "approval_shadow.observe_purchase_order_v1",
  PurchaseOrderBalanceClosure: "approval_shadow.observe_purchase_order_balance_closure_v1",
  PurchaseOrderAmendment: "approval_shadow.observe_purchase_order_amendment_v1",
  InventoryTransfer: "approval_shadow.observe_inventory_transfer_v1",
  StockCountAttemptReview: "approval_shadow.observe_stock_count_attempt_review_v1",
  WastageReport: "approval_shadow.observe_wastage_report_v1",
  StockAdjustment: "approval_shadow.observe_stock_adjustment_v1",
  OpeningInventoryCutover: "approval_shadow.observe_opening_inventory_cutover_v1",
  FinanceCloseRun: "approval_shadow.observe_finance_close_run_v1",
  BudgetRevision: "approval_shadow.observe_budget_revision_v1",
  ExpenseRequest: "approval_shadow.observe_expense_request_v1",
  CashAdvanceRequest: "approval_shadow.observe_cash_advance_request_v1",
  PettyCashRequest: "approval_shadow.observe_petty_cash_request_v1",
  PaymentRequest: "approval_shadow.observe_payment_request_v1",
  PaymentRelease: "approval_shadow.observe_payment_release_v1",
  EmployeeLeaveRequest: "approval_shadow.observe_employee_leave_request_v1",
  EmployeeOvertimeRecord: "approval_shadow.observe_employee_overtime_record_v1",
  WorkforceSchedule: "approval_shadow.observe_workforce_schedule_v1",
  AttendanceImportBatch: "approval_shadow.observe_attendance_import_batch_v1",
} as const satisfies Record<SupportedApprovalDocumentType, string>;

const shadowObserverLineage = {
  PurchaseRequest: "PurchaseRequest only.",
  QuotationRecommendation: "QuotationRecommendation through QuotationRequest to PurchaseRequest.",
  PurchaseOrder: "PurchaseOrder through PurchaseRequest and QuotationRecommendation.",
  PurchaseOrderBalanceClosure: "PurchaseOrderBalanceClosure through its parent PurchaseOrder, PurchaseRequest, and QuotationRecommendation.",
  PurchaseOrderAmendment: "PurchaseOrderAmendment through its parent PurchaseOrder, PurchaseRequest, and QuotationRecommendation.",
  InventoryTransfer: "InventoryTransfer through both endpoint Locations, every transfer line, both InventoryLocations, and every Item.",
  StockCountAttemptReview: "StockCountAttempt through its parent StockCountSession, current-attempt link, InventoryLocation, Location, and attempt lines.",
  WastageReport: "WastageReport through InventoryLocation.",
  StockAdjustment: "StockAdjustment through InventoryLocation.",
  OpeningInventoryCutover: "OpeningInventoryCutover through its exact cohort, inventory location, reviewed stock-count attempt, immutable count-derived lines, and source evidence/valuation digests.",
  FinanceCloseRun: "FinanceCloseRun through its company and pending sensitive-action config snapshot.",
  BudgetRevision: "BudgetRevision through Budget and its distinct location-line scope.",
  ExpenseRequest: "ExpenseRequest through its lines, source links, and controlled evidence facts.",
  CashAdvanceRequest: "CashAdvanceRequest through its location, beneficiary, and configured source lineage.",
  PettyCashRequest: "PettyCashRequest through PettyCashFund.",
  PaymentRequest: "PaymentRequest through its lines and payable-source lineage.",
  PaymentRelease: "PaymentRelease through PaymentRequest, BankAccount, and allocations.",
  EmployeeLeaveRequest: "EmployeeLeaveRequest through employee and location facts.",
  EmployeeOvertimeRecord: "EmployeeOvertimeRecord through employee and location facts.",
  WorkforceSchedule: "WorkforceSchedule through schedule lines and location facts.",
  AttendanceImportBatch: "AttendanceImportBatch through import lines, location, and review-branch facts.",
} as const satisfies Record<SupportedApprovalDocumentType, string>;

const postChildObserverDocumentTypes = new Set<SupportedApprovalDocumentType>([
  "PurchaseOrderBalanceClosure",
  "PurchaseOrderAmendment",
  "PaymentRelease",
]);

const shadowObserverSignature =
  "(p_tenant_id uuid, p_company_id uuid, p_approval_instance_id uuid)";

type ObserverRelationPredicate = Readonly<{
  relation: string;
  binding: string;
  scope: "EXACT_TENANT_COMPANY" | "EXACT_TENANT";
}>;

type ObserverPredicateMatrix = Readonly<{
  approvalInstance: Readonly<{
    relation: "ApprovalInstance";
    idBinding: "id = p_approval_instance_id";
    tenantBinding: "tenantId = p_tenant_id";
    companyBinding: "companyId = p_company_id";
    familyBinding: "documentType = fixedDocumentType";
    sourceBinding: "source.id = ApprovalInstance.documentId";
  }>;
  source: Readonly<{
    relation: string;
    scope: "EXACT_TENANT_COMPANY";
    approvalInstanceBacklink: string | null;
  }>;
  mandatoryRelations: readonly ObserverRelationPredicate[];
  optionalRelationAntiMismatch: readonly ObserverRelationPredicate[];
  presentChildAntiMismatch: readonly ObserverRelationPredicate[];
  jsonShape: Readonly<{
    relation: "FinanceCloseRun";
    objectPath: "configSnapshot.pendingSensitiveApproval";
    requiredNonEmptyStringKeys: readonly [
      "approvalAction",
      "requestedByUserId",
      "requestedAt",
    ];
    validatesAllowedValues: false;
  }> | null;
  excludedFacts: readonly [
    "SOURCE_OR_APPROVAL_STATUS",
    "APPROVAL_RULE_OR_RULE_STEPS",
    "APPROVAL_INSTANCE_STEPS",
    "ROUTING_SCOPE_OR_TARGETS",
    "PROHIBITED_OR_ELIGIBLE_ACTORS",
    "DUE_OR_ACTIVATION",
    "PERMISSION_OR_POLICY",
    "AMOUNTS_OR_TOTALS",
    "CHILD_CARDINALITY_OR_COMPLETENESS",
    "EVIDENCE_SUFFICIENCY_OR_SELECTION",
    "SNAPSHOT_VALUE_POLICY",
  ];
}>;

const exactScope = "EXACT_TENANT_COMPANY" as const;
const predicate = (relation: string, binding: string): ObserverRelationPredicate => ({
  relation,
  binding,
  scope: exactScope,
});
const tenantPredicate = (relation: string, binding: string): ObserverRelationPredicate => ({
  relation,
  binding,
  scope: "EXACT_TENANT",
});
const excludedObserverFacts = [
  "SOURCE_OR_APPROVAL_STATUS",
  "APPROVAL_RULE_OR_RULE_STEPS",
  "APPROVAL_INSTANCE_STEPS",
  "ROUTING_SCOPE_OR_TARGETS",
  "PROHIBITED_OR_ELIGIBLE_ACTORS",
  "DUE_OR_ACTIVATION",
  "PERMISSION_OR_POLICY",
  "AMOUNTS_OR_TOTALS",
  "CHILD_CARDINALITY_OR_COMPLETENESS",
  "EVIDENCE_SUFFICIENCY_OR_SELECTION",
  "SNAPSHOT_VALUE_POLICY",
] as const;

const commonApprovalInstancePredicate = {
  relation: "ApprovalInstance",
  idBinding: "id = p_approval_instance_id",
  tenantBinding: "tenantId = p_tenant_id",
  companyBinding: "companyId = p_company_id",
  familyBinding: "documentType = fixedDocumentType",
  sourceBinding: "source.id = ApprovalInstance.documentId",
} as const;

const sourceBacklinks = {
  PurchaseRequest: null,
  QuotationRecommendation: null,
  PurchaseOrder: null,
  PurchaseOrderBalanceClosure: null,
  PurchaseOrderAmendment: null,
  InventoryTransfer: null,
  StockCountAttemptReview: null,
  WastageReport: null,
  StockAdjustment: null,
  OpeningInventoryCutover: "OpeningInventoryCutover.approvalInstanceId = ApprovalInstance.id",
  FinanceCloseRun: null,
  BudgetRevision: null,
  ExpenseRequest: "ExpenseRequest.approvalInstanceId = ApprovalInstance.id",
  CashAdvanceRequest: "CashAdvanceRequest.approvalInstanceId = ApprovalInstance.id",
  PettyCashRequest: "PettyCashRequest.approvalInstanceId = ApprovalInstance.id",
  PaymentRequest: "PaymentRequest.approvalInstanceId = ApprovalInstance.id",
  PaymentRelease: "PaymentRelease.approvalInstanceId = ApprovalInstance.id",
  EmployeeLeaveRequest: "EmployeeLeaveRequest.approvalInstanceId = ApprovalInstance.id",
  EmployeeOvertimeRecord: "EmployeeOvertimeRecord.approvalInstanceId = ApprovalInstance.id",
  WorkforceSchedule: "WorkforceSchedule.approvalInstanceId = ApprovalInstance.id",
  AttendanceImportBatch: "AttendanceImportBatch.approvalInstanceId = ApprovalInstance.id",
} as const satisfies Record<SupportedApprovalDocumentType, string | null>;

const observerRelationCatalog = {
  PurchaseRequest: {
    mandatory: [predicate("Location", "PurchaseRequest.requestLocationId = Location.id")],
    optional: [predicate("Brand", "when PurchaseRequest.brandId is present it equals a same-scope Brand.id")],
    children: [],
  },
  QuotationRecommendation: {
    mandatory: [
      predicate("QuotationRequest", "QuotationRecommendation.quotationRequestId = QuotationRequest.id"),
      predicate("PurchaseRequest", "QuotationRequest.purchaseRequestId = PurchaseRequest.id"),
      predicate("Location", "PurchaseRequest.requestLocationId = Location.id"),
    ], optional: [], children: [],
  },
  PurchaseOrder: {
    mandatory: [
      predicate("PurchaseRequest", "PurchaseOrder.purchaseRequestId = PurchaseRequest.id"),
      predicate("QuotationRecommendation", "PurchaseOrder.quotationRecommendationId = QuotationRecommendation.id"),
      predicate("QuotationRequest", "PurchaseOrder.quotationRequestId = QuotationRequest.id AND QuotationRecommendation.quotationRequestId = QuotationRequest.id AND QuotationRequest.purchaseRequestId = PurchaseRequest.id"),
      predicate("Location", "PurchaseRequest.requestLocationId = Location.id"),
      predicate("Location", "PurchaseOrder.deliveryLocationId = Location.id"),
    ], optional: [], children: [],
  },
  PurchaseOrderBalanceClosure: {
    mandatory: [
      predicate("PurchaseOrder", "PurchaseOrderBalanceClosure.purchaseOrderId = PurchaseOrder.id"),
      predicate("PurchaseRequest", "PurchaseOrder.purchaseRequestId = PurchaseRequest.id"),
      predicate("QuotationRecommendation", "PurchaseOrder.quotationRecommendationId = QuotationRecommendation.id"),
      predicate("QuotationRequest", "PurchaseOrder.quotationRequestId = QuotationRequest.id AND QuotationRecommendation.quotationRequestId = QuotationRequest.id AND QuotationRequest.purchaseRequestId = PurchaseRequest.id"),
      predicate("Location", "PurchaseRequest.requestLocationId = Location.id"),
      predicate("Location", "PurchaseOrder.deliveryLocationId = Location.id"),
    ], optional: [], children: [],
  },
  PurchaseOrderAmendment: {
    mandatory: [
      predicate("PurchaseOrder", "PurchaseOrderAmendment.purchaseOrderId = PurchaseOrder.id"),
      predicate("PurchaseRequest", "PurchaseOrder.purchaseRequestId = PurchaseRequest.id"),
      predicate("QuotationRecommendation", "PurchaseOrder.quotationRecommendationId = QuotationRecommendation.id"),
      predicate("QuotationRequest", "PurchaseOrder.quotationRequestId = QuotationRequest.id AND QuotationRecommendation.quotationRequestId = QuotationRequest.id AND QuotationRequest.purchaseRequestId = PurchaseRequest.id"),
      predicate("Location", "PurchaseRequest.requestLocationId = Location.id"),
      predicate("Location", "PurchaseOrder.deliveryLocationId = Location.id"),
    ], optional: [], children: [],
  },
  InventoryTransfer: {
    mandatory: [
      predicate("Location", "InventoryTransfer.sourceLocationId = source Location.id"),
      predicate("Location", "InventoryTransfer.destinationLocationId = destination Location.id"),
    ],
    optional: [],
    children: [
      predicate("InventoryTransferLine", "every present InventoryTransferLine.inventoryTransferId = InventoryTransfer.id has exact scope"),
      predicate("InventoryLocation", "every transfer line source/destination InventoryLocation has exact scope and the matching endpoint parent"),
      predicate("Item", "every present transfer line itemId equals a same-scope Item.id"),
    ],
  },
  StockCountAttemptReview: {
    mandatory: [
      predicate("StockCountSession", "StockCountAttempt.stockCountSessionId = StockCountSession.id and StockCountSession.currentAttemptId = StockCountAttempt.id"),
      predicate("InventoryLocation", "StockCountAttempt.inventoryLocationId = InventoryLocation.id and matches the session"),
      predicate("Location", "InventoryLocation.locationId = Location.id"),
    ],
    optional: [],
    children: [
      predicate("StockCountAttemptLine", "every present StockCountAttemptLine.stockCountAttemptId = StockCountAttempt.id has exact scope and location"),
      predicate("Item", "every present attempt line itemId equals a same-scope Item.id"),
    ],
  },
  WastageReport: {
    mandatory: [
      predicate("InventoryLocation", "WastageReport.inventoryLocationId = InventoryLocation.id"),
      predicate("Location", "InventoryLocation.locationId = Location.id"),
    ], optional: [], children: [],
  },
  StockAdjustment: {
    mandatory: [
      predicate("InventoryLocation", "StockAdjustment.inventoryLocationId = InventoryLocation.id"),
      predicate("Location", "InventoryLocation.locationId = Location.id"),
    ], optional: [], children: [],
  },
  OpeningInventoryCutover: {
    mandatory: [
      predicate("OpeningInventoryCohort", "OpeningInventoryCutover.cohortId = OpeningInventoryCohort.id"),
      predicate("InventoryLocation", "OpeningInventoryCutover.inventoryLocationId = InventoryLocation.id"),
      predicate("StockCountAttempt", "OpeningInventoryCutover.stockCountAttemptId = StockCountAttempt.id"),
    ],
    optional: [],
    children: [
      predicate("OpeningInventoryCutoverLine", "every OpeningInventoryCutoverLine.cutoverId = OpeningInventoryCutover.id has exact tenant/company/inventory location scope"),
    ],
  },
  FinanceCloseRun: {
    mandatory: [predicate("Company", "FinanceCloseRun.companyId = Company.id")],
    optional: [], children: [],
  },
  BudgetRevision: {
    mandatory: [predicate("Budget", "BudgetRevision.budgetId = Budget.id")],
    optional: [predicate("Location", "when Budget.locationId is present it equals Location.id")],
    children: [
      predicate("BudgetLine", "every present BudgetLine.budgetId = Budget.id has exact scope"),
      predicate("Location", "when a present BudgetLine.locationId is set it equals a same-scope Location.id"),
    ],
  },
  ExpenseRequest: {
    mandatory: [predicate("Location", "ExpenseRequest.locationId = Location.id")],
    optional: [],
    children: [
      predicate("ExpenseRequestLine", "every present ExpenseRequestLine.expenseRequestId = ExpenseRequest.id has exact scope"),
      predicate("ExpenseRequestSourceLink", "every present ExpenseRequestSourceLink.expenseRequestId = ExpenseRequest.id has exact scope and any expenseRequestLineId belongs to that ExpenseRequest"),
    ],
  },
  CashAdvanceRequest: {
    mandatory: [predicate("Location", "CashAdvanceRequest.locationId = Location.id")],
    optional: [
      tenantPredicate("User", "when CashAdvanceRequest.beneficiaryUserId is present it equals a same-tenant User.id"),
      predicate("ExpenseRequest", "when CashAdvanceRequest.expenseRequestId is present it equals a same-scope ExpenseRequest.id"),
      predicate("PaymentRequest", "when CashAdvanceRequest.paymentRequestId is present it equals a same-scope PaymentRequest.id"),
      predicate("BudgetCommitment", "when CashAdvanceRequest.budgetCommitmentId is present it equals a same-scope BudgetCommitment.id"),
      predicate("BankAccount", "when CashAdvanceRequest.intendedBankAccountId is present it equals a same-scope BankAccount.id"),
    ], children: [],
  },
  PettyCashRequest: {
    mandatory: [
      predicate("PettyCashFund", "PettyCashRequest.pettyCashFundId = PettyCashFund.id"),
      predicate("Location", "PettyCashFund.locationId = Location.id"),
    ],
    optional: [predicate("Location", "when PettyCashRequest.locationId is present it equals PettyCashFund.locationId")],
    children: [],
  },
  PaymentRequest: {
    mandatory: [predicate("Location", "PaymentRequest.locationId = Location.id")],
    optional: [],
    children: [
      predicate("PaymentRequestLine", "every present PaymentRequestLine.paymentRequestId = PaymentRequest.id has exact scope and the same locationId"),
      predicate("ApInvoice", "every present PaymentRequestLine.apInvoiceId equals a same-scope ApInvoice.id"),
    ],
  },
  PaymentRelease: {
    mandatory: [
      predicate("PaymentRequest", "PaymentRelease.paymentRequestId = PaymentRequest.id"),
      predicate("BankAccount", "PaymentRelease.bankAccountId = BankAccount.id"),
      predicate("Location", "PaymentRelease.locationId = PaymentRequest.locationId AND PaymentRelease.locationId = Location.id"),
    ],
    optional: [],
    children: [
      predicate("PaymentReleaseAllocation", "every present PaymentReleaseAllocation.paymentReleaseId = PaymentRelease.id has exact scope"),
      predicate("PaymentRequestLine", "every present PaymentReleaseAllocation.paymentRequestLineId belongs to the same PaymentRequest"),
      predicate("ApInvoice", "every present PaymentReleaseAllocation.apInvoiceId equals its PaymentRequestLine.apInvoiceId and a same-scope ApInvoice.id"),
    ],
  },
  EmployeeLeaveRequest: {
    mandatory: [predicate("Employee", "EmployeeLeaveRequest.employeeId = Employee.id")],
    optional: [predicate("Location", "when EmployeeLeaveRequest.locationId is present it equals a same-scope Location.id")],
    children: [],
  },
  EmployeeOvertimeRecord: {
    mandatory: [predicate("Employee", "EmployeeOvertimeRecord.employeeId = Employee.id")],
    optional: [predicate("Location", "when EmployeeOvertimeRecord.locationId is present it equals a same-scope Location.id")],
    children: [],
  },
  WorkforceSchedule: {
    mandatory: [predicate("Location", "WorkforceSchedule.locationId = Location.id")],
    optional: [],
    children: [
      predicate("WorkforceScheduleLine", "every present WorkforceScheduleLine.workforceScheduleId = WorkforceSchedule.id has exact scope and the same locationId"),
      predicate("Employee", "when a present WorkforceScheduleLine.employeeId is set it equals a same-scope Employee.id"),
    ],
  },
  AttendanceImportBatch: {
    mandatory: [predicate("Location", "AttendanceImportBatch.locationId = Location.id")],
    optional: [],
    children: [
      predicate("AttendanceImportLine", "every present AttendanceImportLine.attendanceImportBatchId = AttendanceImportBatch.id has exact scope and the same locationId"),
      predicate("Employee", "when a present AttendanceImportLine.employeeId is set it equals a same-scope Employee.id"),
    ],
  },
} as const satisfies Record<SupportedApprovalDocumentType, Readonly<{
  mandatory: readonly ObserverRelationPredicate[];
  optional: readonly ObserverRelationPredicate[];
  children: readonly ObserverRelationPredicate[];
}>>;

const observerPredicateMatrices = Object.fromEntries(
  supportedApprovalDocumentTypes.map((documentType) => {
    const relations = observerRelationCatalog[documentType];
    return [documentType, {
      approvalInstance: commonApprovalInstancePredicate,
      source: {
        relation: requiredCapabilityDiscoveryFacts[documentType].sourceRelation,
        scope: exactScope,
        approvalInstanceBacklink: sourceBacklinks[documentType],
      },
      mandatoryRelations: relations.mandatory,
      optionalRelationAntiMismatch: relations.optional,
      presentChildAntiMismatch: relations.children,
      jsonShape: documentType === "FinanceCloseRun" ? {
        relation: "FinanceCloseRun" as const,
        objectPath: "configSnapshot.pendingSensitiveApproval" as const,
        requiredNonEmptyStringKeys: [
          "approvalAction",
          "requestedByUserId",
          "requestedAt",
        ] as const,
        validatesAllowedValues: false as const,
      } : null,
      excludedFacts: excludedObserverFacts,
    } satisfies ObserverPredicateMatrix];
  }),
) as unknown as Record<SupportedApprovalDocumentType, ObserverPredicateMatrix>;

const shadowObserverDesigns = Object.fromEntries(
  supportedApprovalDocumentTypes.map((documentType) => [documentType, {
    contractKind: "DORMANT_BINARY_SHADOW_OBSERVER_DESIGN" as const,
    proposedName: shadowObserverNames[documentType],
    signature: shadowObserverSignature,
    parameters: [
      "p_tenant_id",
      "p_company_id",
      "p_approval_instance_id",
    ] as const,
    parametersAreBindingsNotAuthority: true as const,
    fixedDocumentType: documentType,
    derivation: {
      documentId: "Derived only from the bound ApprovalInstance.documentId.",
      sourceRelation: requiredCapabilityDiscoveryFacts[documentType].sourceRelation,
      parentLineage: shadowObserverLineage[documentType],
      lifecycle: postChildObserverDocumentTypes.has(documentType)
        ? "POST_CHILD_ONLY" as const
        : "POST_SOURCE_ONLY" as const,
    },
    predicateMatrix: observerPredicateMatrices[documentType],
    noMatchSemantics:
      "Absent, wrong-scope, wrong-family, missing-source, ambiguous-source, lineage mismatch, and every other mismatch collapse identically.",
    resultDesign: {
      values: ["SHADOW_MATCH", "SHADOW_NO_MATCH"] as const,
      authoritative: false as const,
      payload: "NONE" as const,
    },
    futureRoutineRequirements: {
      security: "SECURITY INVOKER" as const,
      volatility: "STABLE" as const,
      leakproof: false as const,
      exposure: "PRIVATE_UNGRANTED" as const,
      allowsDml: false as const,
      acquiresExplicitLocks: false as const,
      allowsDynamicSql: false as const,
      searchPath: ["pg_catalog"] as const,
    },
    sqlExecutable: true as const,
    runtimeCallable: false as const,
    sqlExists: true as const,
    grantsAuthority: false as const,
  }]),
) as unknown as Record<SupportedApprovalDocumentType, Readonly<{
  contractKind: "DORMANT_BINARY_SHADOW_OBSERVER_DESIGN";
  proposedName: string;
  signature: string;
  parameters: readonly ["p_tenant_id", "p_company_id", "p_approval_instance_id"];
  parametersAreBindingsNotAuthority: true;
  fixedDocumentType: SupportedApprovalDocumentType;
  derivation: Readonly<{
    documentId: string;
    sourceRelation: string;
    parentLineage: string;
    lifecycle: "POST_CHILD_ONLY" | "POST_SOURCE_ONLY";
  }>;
  predicateMatrix: ObserverPredicateMatrix;
  noMatchSemantics: string;
  resultDesign: Readonly<{
    values: readonly ["SHADOW_MATCH", "SHADOW_NO_MATCH"];
    authoritative: false;
    payload: "NONE";
  }>;
  futureRoutineRequirements: Readonly<{
    security: "SECURITY INVOKER";
    volatility: "STABLE";
    leakproof: false;
    exposure: "PRIVATE_UNGRANTED";
    allowsDml: false;
    acquiresExplicitLocks: false;
    allowsDynamicSql: false;
    searchPath: readonly ["pg_catalog"];
  }>;
  sqlExecutable: true;
  runtimeCallable: false;
  sqlExists: true;
  grantsAuthority: false;
}>>;

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, stable(item)]),
    );
  }
  return value;
}

function deepFreeze<T>(value: T): Readonly<T> {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const item of Object.values(value as Record<string, unknown>)) {
      deepFreeze(item);
    }
  }
  return value;
}

export const approvalProducerCapabilityManifest = deepFreeze(
  Object.fromEntries(
    supportedApprovalDocumentTypes.map((documentType) => {
      const facts = requiredCapabilityDiscoveryFacts[documentType];
      return [documentType, {
        contractKind: "DORMANT_DISCOVERY_CONTRACT" as const,
        executable: false as const,
        grantsAuthority: false as const,
        documentType,
        producerId: `approval-producer:${documentType}:${facts.producer.functionName}`,
        currentCompatibility: {
          sourceRelation: facts.sourceRelation,
          serializationRelation: facts.serializationRelation,
          producer: facts.producer,
          sourceStatuses: facts.sourceStatuses,
          routingObserved: currentRoutingObservations[documentType],
          transactionControl: currentTransactionFacts[documentType],
        },
        requiredCapability: {
          proposedName: facts.proposedDatabaseCapability.name,
          signature: null,
          inputDesignStatus: facts.proposedDatabaseCapability.inputDesignStatus,
          parametersAreBindingsNotAuthority: true as const,
          ruleInput: facts.ruleInput,
          requiredPermissionCode: facts.requiredPermissionCode,
          derivation: facts.derivation,
          concurrency: facts.concurrency,
          stableErrors: facts.stableErrors,
          idempotency: facts.idempotency,
        },
        observerDesign: shadowObserverDesigns[documentType],
        identityLifecycle:
          documentType in newChildIdentityDesign
            ? newChildIdentityDesign[
                documentType as keyof typeof newChildIdentityDesign
              ]
            : null,
      }];
    }),
  ) as unknown as Record<SupportedApprovalDocumentType, {
    contractKind: "DORMANT_DISCOVERY_CONTRACT";
    executable: false;
    grantsAuthority: false;
    documentType: SupportedApprovalDocumentType;
    producerId: string;
    currentCompatibility: {
      sourceRelation: string;
      serializationRelation: string;
      producer: { serviceFile: string; functionName: string };
      sourceStatuses: { admitted: readonly string[]; committed: readonly string[] };
      routingObserved: RequiredCapabilityDiscoveryFacts["derivation"];
      transactionControl: (typeof currentTransactionFacts)[SupportedApprovalDocumentType];
    };
    requiredCapability: {
      proposedName: string;
      signature: null;
      inputDesignStatus: "DEFERRED_FAMILY_SPECIFIC_DESIGN";
      parametersAreBindingsNotAuthority: true;
      ruleInput: string;
      requiredPermissionCode: string;
      derivation: RequiredCapabilityDiscoveryFacts["derivation"];
      concurrency: RequiredCapabilityDiscoveryFacts["concurrency"];
      stableErrors: readonly string[];
      idempotency: string;
    };
    observerDesign: (typeof shadowObserverDesigns)[SupportedApprovalDocumentType];
    identityLifecycle: (typeof newChildIdentityDesign)[keyof typeof newChildIdentityDesign] | null;
  }>,
);

export const APPROVAL_PRODUCER_CAPABILITY_MANIFEST_DIGEST = createHash("sha256")
  .update(JSON.stringify(stable(approvalProducerCapabilityManifest)))
  .digest("hex");

export const approvalProducerCapabilityContracts = deepFreeze(
  Object.values(approvalProducerCapabilityManifest),
);
