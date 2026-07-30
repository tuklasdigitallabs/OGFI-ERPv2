import { approvalProducerCapabilityContracts } from "./approvalProducerCapabilityManifest";
import { supportedApprovalDocumentTypes } from "./approvalRoutingRegistry";

export const approvalGraphModels = [
  "approvalInstance",
  "approvalInstanceStep",
  "approvalInstanceStepScopeGroup",
  "approvalInstanceStepScopeTarget",
  "approvalInstanceStepProhibitedActor",
  "approvalRoutingProducerProvenance",
] as const;

export type ApprovalGraphModel = (typeof approvalGraphModels)[number];

export const approvalGraphDirectMutationOperations = [
  "create",
  "createMany",
  "createManyAndReturn",
  "update",
  "updateMany",
  "updateManyAndReturn",
  "upsert",
  "delete",
  "deleteMany",
] as const;

export const approvalGraphNestedMutationOperations = [
  "create",
  "createMany",
  "connectOrCreate",
  "upsert",
  "update",
  "updateMany",
  "delete",
  "deleteMany",
  "connect",
  "disconnect",
  "set",
] as const;

export const approvalGraphMutationOperations = [
  ...approvalGraphDirectMutationOperations,
  ...approvalGraphNestedMutationOperations.filter(
    (operation) => !(approvalGraphDirectMutationOperations as readonly string[]).includes(operation),
  ),
] as const;

export type ApprovalGraphMutationOperation =
  (typeof approvalGraphMutationOperations)[number];

export type ApprovalGraphMutationInventoryEntry = Readonly<{
  id: string;
  category:
    | "PRODUCER_CREATION"
    | "ROUTING_CONFIGURATION"
    | "STEP_ACTIVATION"
    | "CANONICAL_DECISION"
    | "SPECIALIZED_DECISION"
    | "CANCELLATION"
    | "TERMINAL_CLEANUP"
    | "BACKFILL_MAINTENANCE";
  file: string;
  functionName: string;
  documentTypes: readonly string[];
  dataAuthority: string;
  mutations: readonly Readonly<{
    model: ApprovalGraphModel;
    operation: ApprovalGraphMutationOperation;
    access: "DIRECT_DELEGATE" | "NESTED_RELATION";
    count: number;
  }>[];
}>;

export const canonicalApprovalDocumentTypes = [
  "PurchaseRequest",
  "QuotationRecommendation",
  "PurchaseOrder",
  "PurchaseOrderBalanceClosure",
  "PurchaseOrderAmendment",
  "InventoryTransfer",
  "StockCountAttemptReview",
  "WastageReport",
  "StockAdjustment",
] as const;

export const specializedApprovalDocumentTypes = [
  "BudgetRevision",
  "ExpenseRequest",
  "CashAdvanceRequest",
  "PettyCashRequest",
  "PaymentRequest",
  "PaymentRelease",
  "EmployeeLeaveRequest",
  "EmployeeOvertimeRecord",
  "WorkforceSchedule",
  "AttendanceImportBatch",
] as const;

export const financeCloseApprovalDocumentTypes = ["FinanceCloseRun"] as const;
export const activateNextApprovalDocumentTypes = [
  ...canonicalApprovalDocumentTypes,
  ...specializedApprovalDocumentTypes,
] as const;
const normalizedCancellationDocumentTypes = [
  "InventoryTransfer",
  ...specializedApprovalDocumentTypes,
  ...financeCloseApprovalDocumentTypes,
] as const;

const producerEntries: ApprovalGraphMutationInventoryEntry[] =
  approvalProducerCapabilityContracts.map((contract) => ({
    id: `producer.${contract.documentType}`,
    category: "PRODUCER_CREATION",
    file: `services/${contract.currentCompatibility.producer.serviceFile}`,
    functionName: contract.currentCompatibility.producer.functionName,
    documentTypes: [contract.documentType],
    dataAuthority:
      "Current compatibility writer creates one ApprovalInstance with nested steps; DEC-0247 C0 inventories but does not authorize it as a future capability.",
    mutations: [
      { model: "approvalInstance", operation: "create", access: "DIRECT_DELEGATE", count: 1 },
      { model: "approvalInstanceStep", operation: "create", access: "NESTED_RELATION", count: 1 },
    ],
  }));

const sharedEntries = [
  {
    id: "routing.configure-step-v1",
    category: "ROUTING_CONFIGURATION",
    file: "services/approvalRouting.ts",
    functionName: "configureApprovalStepRouting",
    documentTypes: supportedApprovalDocumentTypes,
    dataAuthority: "Typed ConfigureApprovalStepRoutingInput after policy/permission parity checks; nested scope targets are created with each group.",
    mutations: [
      { model: "approvalInstanceStepScopeGroup", operation: "create", access: "DIRECT_DELEGATE", count: 1 },
      { model: "approvalInstanceStepScopeTarget", operation: "create", access: "NESTED_RELATION", count: 1 },
      { model: "approvalInstanceStepProhibitedActor", operation: "createMany", access: "DIRECT_DELEGATE", count: 1 },
      { model: "approvalInstanceStep", operation: "updateMany", access: "DIRECT_DELEGATE", count: 1 },
    ],
  },
  {
    id: "routing.activate-step",
    category: "STEP_ACTIVATION",
    file: "services/approvalRouting.ts",
    functionName: "activateApprovalStepWithEligibility",
    documentTypes: supportedApprovalDocumentTypes,
    dataAuthority: "Fixed WAITING-to-PENDING CAS after live eligibility assertion.",
    mutations: [
      { model: "approvalInstanceStep", operation: "updateMany", access: "DIRECT_DELEGATE", count: 1 },
    ],
  },
  {
    id: "decision.activate-next-legacy",
    category: "STEP_ACTIVATION",
    file: "services/approvals.ts",
    functionName: "activateNextApprovalStep",
    documentTypes: activateNextApprovalDocumentTypes,
    dataAuthority: "Legacy v0 WAITING-to-PENDING compatibility CAS; v1 delegates to the eligibility activation helper.",
    mutations: [
      { model: "approvalInstanceStep", operation: "updateMany", access: "DIRECT_DELEGATE", count: 1 },
    ],
  },
  {
    id: "decision.specialized-current-step",
    category: "SPECIALIZED_DECISION",
    file: "services/approvals.ts",
    functionName: "decideSpecializedCurrentApprovalStep",
    documentTypes: specializedApprovalDocumentTypes,
    dataAuthority: "Caller-supplied Prisma update data is permitted only after the specialized locked-source authority preflight and fixed current-step CAS.",
    mutations: [
      { model: "approvalInstanceStep", operation: "updateMany", access: "DIRECT_DELEGATE", count: 1 },
    ],
  },
  {
    id: "decision.specialized-instance",
    category: "SPECIALIZED_DECISION",
    file: "services/approvals.ts",
    functionName: "transitionSpecializedApprovalInstance",
    documentTypes: specializedApprovalDocumentTypes,
    dataAuthority: "Closed specialized transition union and pending/current-step CAS.",
    mutations: [
      { model: "approvalInstance", operation: "updateMany", access: "DIRECT_DELEGATE", count: 1 },
    ],
  },
  {
    id: "decision.canonical-approve",
    category: "CANONICAL_DECISION",
    file: "services/approvals.ts",
    functionName: "approveCurrentStepAndAdvance",
    documentTypes: canonicalApprovalDocumentTypes,
    dataAuthority: "Fixed approve-step CAS plus exactly one advance or terminal instance CAS.",
    mutations: [
      { model: "approvalInstanceStep", operation: "updateMany", access: "DIRECT_DELEGATE", count: 1 },
      { model: "approvalInstance", operation: "updateMany", access: "DIRECT_DELEGATE", count: 2 },
    ],
  },
  {
    id: "decision.canonical-close",
    category: "CANONICAL_DECISION",
    file: "services/approvals.ts",
    functionName: "closeCurrentApprovalDecision",
    documentTypes: canonicalApprovalDocumentTypes,
    dataAuthority: "Fixed RETURNED/REJECTED step and instance CAS after canonical authority preparation.",
    mutations: [
      { model: "approvalInstanceStep", operation: "updateMany", access: "DIRECT_DELEGATE", count: 1 },
      { model: "approvalInstance", operation: "updateMany", access: "DIRECT_DELEGATE", count: 1 },
    ],
  },
  {
    id: "decision.petty-cash-terminal-skip",
    category: "TERMINAL_CLEANUP",
    file: "services/approvals.ts",
    functionName: "skipLockedPettyCashFutureApprovalSteps",
    documentTypes: ["PettyCashRequest"],
    dataAuthority: "Locked full-graph future-step id set and WAITING-to-SKIPPED CAS.",
    mutations: [
      { model: "approvalInstanceStep", operation: "updateMany", access: "DIRECT_DELEGATE", count: 1 },
    ],
  },
  {
    id: "terminal.shared-future-step-skip",
    category: "TERMINAL_CLEANUP",
    file: "services/approvalTerminal.ts",
    functionName: "skipFutureApprovalStepsForTerminalDecision",
    documentTypes: supportedApprovalDocumentTypes,
    dataAuthority: "Locked pending instance and future WAITING step set.",
    mutations: [
      { model: "approvalInstanceStep", operation: "updateMany", access: "DIRECT_DELEGATE", count: 1 },
    ],
  },
  {
    id: "cancellation.shared-pending-approval",
    category: "CANCELLATION",
    file: "services/approvalCancellation.ts",
    functionName: "terminatePendingApprovalForCancellation",
    documentTypes: normalizedCancellationDocumentTypes,
    dataAuthority: "Locked coherent graph; active steps become SKIPPED and the pending instance becomes CANCELLED.",
    mutations: [
      { model: "approvalInstanceStep", operation: "updateMany", access: "DIRECT_DELEGATE", count: 1 },
      { model: "approvalInstance", operation: "updateMany", access: "DIRECT_DELEGATE", count: 1 },
    ],
  },
  {
    id: "cancellation.wastage-compatibility",
    category: "CANCELLATION",
    file: "services/wastage.ts",
    functionName: "cancelWastageReport",
    documentTypes: ["WastageReport"],
    dataAuthority: "Bespoke locked cancellation compatibility path for pending Wastage approval.",
    mutations: [
      { model: "approvalInstance", operation: "updateMany", access: "DIRECT_DELEGATE", count: 1 },
      { model: "approvalInstanceStep", operation: "updateMany", access: "DIRECT_DELEGATE", count: 1 },
    ],
  },
  {
    id: "cancellation.stock-adjustment-compatibility",
    category: "CANCELLATION",
    file: "services/stockAdjustments.ts",
    functionName: "cancelStockAdjustment",
    documentTypes: ["StockAdjustment"],
    dataAuthority: "Bespoke locked cancellation compatibility path for pending Stock Adjustment approval.",
    mutations: [
      { model: "approvalInstance", operation: "updateMany", access: "DIRECT_DELEGATE", count: 1 },
      { model: "approvalInstanceStep", operation: "updateMany", access: "DIRECT_DELEGATE", count: 1 },
    ],
  },
  {
    id: "decision.finance-close-step",
    category: "SPECIALIZED_DECISION",
    file: "services/financePeriodClose.ts",
    functionName: "decideFinanceCloseApprovalStep",
    documentTypes: ["FinanceCloseRun"],
    dataAuthority: "Fixed pending Finance Close step CAS after live close authority checks.",
    mutations: [
      { model: "approvalInstanceStep", operation: "updateMany", access: "DIRECT_DELEGATE", count: 1 },
    ],
  },
  {
    id: "decision.finance-close-instance",
    category: "SPECIALIZED_DECISION",
    file: "services/financePeriodClose.ts",
    functionName: "transitionFinanceCloseApprovalInstance",
    documentTypes: ["FinanceCloseRun"],
    dataAuthority: "Closed Finance Close instance transition and current-step CAS.",
    mutations: [
      { model: "approvalInstance", operation: "updateMany", access: "DIRECT_DELEGATE", count: 1 },
    ],
  },
  {
    id: "backfill.routing-v1-apply",
    category: "BACKFILL_MAINTENANCE",
    file: "services/approvalRoutingBackfill.ts",
    functionName: "inspectOrApplyInstance",
    documentTypes: supportedApprovalDocumentTypes,
    dataAuthority: "Governed APPLY-mode derived descriptor; nested scope targets are created with each group. DEC-0246 authority remains unresolved.",
    mutations: [
      { model: "approvalInstanceStepScopeGroup", operation: "create", access: "DIRECT_DELEGATE", count: 1 },
      { model: "approvalInstanceStepScopeTarget", operation: "create", access: "NESTED_RELATION", count: 1 },
      { model: "approvalInstanceStepProhibitedActor", operation: "createMany", access: "DIRECT_DELEGATE", count: 1 },
      { model: "approvalInstanceStep", operation: "updateMany", access: "DIRECT_DELEGATE", count: 1 },
    ],
  },
] as const satisfies readonly ApprovalGraphMutationInventoryEntry[];

export const approvalGraphMutationInventory = Object.freeze([
  ...producerEntries,
  ...sharedEntries,
]);

export const approvalGraphToolingMutationInventory = Object.freeze([
  {
    file: "scripts/run-disposable-postgres-tests.mjs",
    operation: "UPDATE",
    relation: "ApprovalInstanceStep",
    count: 1,
    purpose: "Disposable predecessor fixture normalization; never an application runtime writer.",
  },
  {
    file: "scripts/run-disposable-postgres-tests.mjs",
    operation: "INSERT",
    relation: "ApprovalInstance",
    count: 1,
    purpose: "Disposable authorization fixture seed; never an application runtime writer.",
  },
  {
    file: "scripts/release-predecessor-baseline.mjs",
    operation: "INSERT",
    relation: "ApprovalInstance",
    count: 1,
    purpose: "Controlled predecessor-baseline fixture construction outside application runtime.",
  },
] as const);

export const approvalGraphToolingDdlInventory = Object.freeze([
  "infra/hostinger/postgres/reconcile-ownership-and-grants.sql",
  "packages/database/prisma/migrations/0001_core_administration_foundation/migration.sql",
  "packages/database/prisma/migrations/20260626015833_sync_prisma_schema/migration.sql",
  "packages/database/prisma/migrations/20260629195500_approval_step_actor_snapshot/migration.sql",
  "packages/database/prisma/migrations/20260708002000_phase3_payment_request_foundation/migration.sql",
  "packages/database/prisma/migrations/20260708014000_phase3_expense_request_foundation/migration.sql",
  "packages/database/prisma/migrations/20260708032000_phase3_cash_advance_approval_instance/migration.sql",
  "packages/database/prisma/migrations/20260708033000_phase3_petty_cash_approval_instance/migration.sql",
  "packages/database/prisma/migrations/20260708035000_phase3_payment_release_approval_instance/migration.sql",
  "packages/database/prisma/migrations/20260708044000_phase3_workforce_leave_approval_instance/migration.sql",
  "packages/database/prisma/migrations/20260708045000_phase3_workforce_overtime_approval_instance/migration.sql",
  "packages/database/prisma/migrations/20260708050000_phase3_workforce_schedule_approval_instance/migration.sql",
  "packages/database/prisma/migrations/20260708051000_phase3_attendance_import_approval_instance/migration.sql",
  "packages/database/prisma/migrations/20260722140000_approval_step_eligibility_routing/migration.sql",
  "packages/database/prisma/migrations/20260722150000_approval_routing_prisma_alignment/migration.sql",
  "packages/database/prisma/migrations/20260722170000_approval_routing_child_trigger_always/migration.sql",
  "packages/database/prisma/migrations/20260722180000_approval_routing_backfill_audit_uniqueness/migration.sql",
  "packages/database/prisma/migrations/20260722200000_approval_routing_step_order_guard/migration.sql",
  "packages/database/prisma/migrations/20260722210000_approval_integrity_petty_cash_intents/migration.sql",
  "packages/database/prisma/migrations/20260722230000_budget_revision_atomic_step_activation/migration.sql",
  "packages/database/prisma/migrations/20260724010000_controlled_evidence_qualification_foundation/migration.sql",
  "packages/database/prisma/migrations/20260727140000_approval_routing_backfill_orchestration/migration.sql",
  "packages/database/prisma/migrations/20260727150000_approval_routing_producer_barrier_dormant/migration.sql",
  "packages/database/prisma/migrations/20260727160000_approval_routing_shadow_observers/migration.sql",
  "packages/database/prisma/migrations/20260731090000_inventory_pilot_classifier_activation_intents/migration.sql",
] as const);

export const approvalGraphToolingProbeInventory = Object.freeze([
  "infra/hostinger/postgres/verify-role-contract.sql",
  "scripts/db-append-only-contract.mjs",
  "scripts/release-data-invariants.mjs",
  "scripts/release-data-snapshot.mjs",
  "scripts/release-predecessor-baseline.mjs",
  "scripts/run-disposable-postgres-tests.mjs",
] as const);

export const approvalRawSqlMethods = ["$executeRawUnsafe", "$queryRawUnsafe"] as const;

export type ApprovalRawSqlCallInventoryEntry = Readonly<{
  file: string;
  functionName: string;
  method: (typeof approvalRawSqlMethods)[number];
  count: number;
  dynamicArgumentCount: number;
  ownerBodyDigest: string;
  dynamicArgumentReview?: string;
}>;

// Exact runtime ownership is pinned by the compiler-AST guard. This list is
// intentionally data-only and grants no permission to add another raw call.
export const approvalRawSqlCallInventory: readonly ApprovalRawSqlCallInventoryEntry[] = Object.freeze([
  { file: "apps/web/src/server/services/approvalRoutingBackfill.ts", functionName: "acquireScopedAdvisoryLock", method: "$queryRawUnsafe", count: 1, dynamicArgumentCount: 0, ownerBodyDigest: "3f215809382ae6b1253883d8e8f0a1781924a8a7309c62d6179811260d9e25fd" },
  { file: "apps/web/src/server/services/approvalRoutingBackfill.ts", functionName: "findAnyEligibleActorForExpectedDescriptor", method: "$queryRawUnsafe", count: 1, dynamicArgumentCount: 0, ownerBodyDigest: "1a739780ee43e0897af538fef36aab704c804aacb4a5ae811a7348445b676f07" },
  { file: "apps/web/src/server/services/approvalRoutingBackfill.ts", functionName: "inspectOrApplyInstance", method: "$queryRawUnsafe", count: 1, dynamicArgumentCount: 0, ownerBodyDigest: "49ad485f32afcea9413e232128922222d00cbfab67c48bd191cc43df0daad88b" },
  { file: "apps/web/src/server/services/approvalRoutingBackfill.ts", functionName: "loadReplayBatch", method: "$queryRawUnsafe", count: 1, dynamicArgumentCount: 0, ownerBodyDigest: "bbefd04d80ac545fddcf573e1c357b17d19f7f5268e3b9ef6145ff0b92ee1be9" },
  { file: "apps/web/src/server/services/approvalRoutingBackfill.ts", functionName: "lockMainSource", method: "$queryRawUnsafe", count: 1, dynamicArgumentCount: 1, ownerBodyDigest: "16308f0b055857e4bb7a7aa86dd1633d7c9cf3346631f3fdaa2802b510602d48", dynamicArgumentReview: "Reviewed closed document-type table mapping and owner body; digest drift requires re-review." },
  { file: "apps/web/src/server/services/approvalRoutingBackfill.ts", functionName: "processDurablePage", method: "$executeRawUnsafe", count: 7, dynamicArgumentCount: 0, ownerBodyDigest: "38f3e94c592225c17b61362df2562a2e7bee4d8204797e5ce5f810608c8a363d" },
  { file: "apps/web/src/server/services/approvalRoutingBackfill.ts", functionName: "processDurablePage", method: "$queryRawUnsafe", count: 2, dynamicArgumentCount: 0, ownerBodyDigest: "38f3e94c592225c17b61362df2562a2e7bee4d8204797e5ce5f810608c8a363d" },
  { file: "apps/web/src/server/services/approvalRoutingBackfill.ts", functionName: "replayResult", method: "$queryRawUnsafe", count: 1, dynamicArgumentCount: 0, ownerBodyDigest: "73535f1e5bbc716f44f4910beb21fdccbb2757e9d6f234ef6a551b8fa7637770" },
  { file: "apps/web/src/server/services/approvalRoutingBackfill.ts", functionName: "runDurableApprovalRoutingBackfill", method: "$executeRawUnsafe", count: 2, dynamicArgumentCount: 0, ownerBodyDigest: "bbc82fda10955fa378451db1b8ef2458ea5f3ec50cdda1856e2fa01b37ff1242" },
  { file: "apps/web/src/server/services/approvalRoutingBackfill.ts", functionName: "runDurableApprovalRoutingBackfill", method: "$queryRawUnsafe", count: 8, dynamicArgumentCount: 0, ownerBodyDigest: "bbc82fda10955fa378451db1b8ef2458ea5f3ec50cdda1856e2fa01b37ff1242" },
  { file: "apps/web/src/server/services/approvalRoutingBackfill.ts", functionName: "runReadOnlyApprovalRoutingBackfill", method: "$executeRawUnsafe", count: 2, dynamicArgumentCount: 0, ownerBodyDigest: "f8f250dc99bcc88e81355299bef575e84a4e708b3dcd05357efd5938cdce49dd" },
  { file: "apps/web/src/server/services/approvalRoutingBackfill.ts", functionName: "runReadOnlyApprovalRoutingBackfill", method: "$queryRawUnsafe", count: 1, dynamicArgumentCount: 0, ownerBodyDigest: "f8f250dc99bcc88e81355299bef575e84a4e708b3dcd05357efd5938cdce49dd" },
  { file: "apps/web/src/server/services/attachments.ts", functionName: "assertControlledEvidenceSourceAccess", method: "$queryRawUnsafe", count: 1, dynamicArgumentCount: 1, ownerBodyDigest: "6ead7a2ad94892294594dde85dc8e2ab210879c0605ee0907badf5bf2868e198", dynamicArgumentReview: "Reviewed closed evidence-source table mapping and owner body; digest drift requires re-review." },
  { file: "apps/web/src/server/services/attachments.ts", functionName: "listWorkforceControlledEvidenceAttachmentsBatch", method: "$queryRawUnsafe", count: 1, dynamicArgumentCount: 0, ownerBodyDigest: "584e8f16765b40fcc05e7bd86d979993386d7fca9ab416d24bb9f9b462a3e176" },
  { file: "apps/web/src/server/services/authorizationDenials.ts", functionName: "withinAuthorizationDenialSavepoint", method: "$executeRawUnsafe", count: 4, dynamicArgumentCount: 4, ownerBodyDigest: "71ddb9ab5cee5ff823cde9ea05521e1e6b9196ef4a9e6c36f24dd170e41ae1c8", dynamicArgumentReview: "Reviewed fixed savepoint statement bundle and owner body; digest drift requires re-review." },
  { file: "apps/web/src/server/services/evidenceScanLifecycle.ts", functionName: "reconcileEvidenceScans", method: "$queryRawUnsafe", count: 1, dynamicArgumentCount: 0, ownerBodyDigest: "2ba7c1e8122df09240b07977272896b28ba2c1baf63af2f5a47c1c59395c17d1" },
  { file: "apps/web/src/server/services/evidenceUploads.ts", functionName: "lockCompanyQuota", method: "$executeRawUnsafe", count: 1, dynamicArgumentCount: 0, ownerBodyDigest: "6a480834329d3551ea5d95907bf7ba0c53fe863b5cf4b4d9de05b6586ac9ddb6" },
  { file: "apps/web/src/server/services/evidenceUploads.ts", functionName: "lockCompanyQuota", method: "$queryRawUnsafe", count: 1, dynamicArgumentCount: 0, ownerBodyDigest: "6a480834329d3551ea5d95907bf7ba0c53fe863b5cf4b4d9de05b6586ac9ddb6" },
]);

export const prismaRawFragmentInventory = Object.freeze([] as const);
