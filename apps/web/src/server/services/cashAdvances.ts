import { randomUUID } from "node:crypto"
import { prisma } from "@ogfi/database"
import type { TransactionClient } from "@ogfi/database"
import {
  canUseFinance,
  getGrantedPermissionCodes,
  permissions,
  requirePermission
} from "./authorization"
import type { SessionContext } from "./context"
import {
  recordWorkflowNotifications
} from "./notifications"
import {
  assertAnyEligibleApprovalActorForStep,
  configureApprovalStepRouting
} from "./approvalRouting"
import { getApprovalRoutingPolicy } from "./approvalRoutingRegistry"
import {
  resolveEvidenceReadiness,
  type EvidenceCaptureMode,
  type EvidenceProductionReadiness
} from "./attachments"
import {
  getCashAdvanceRecoveryPolicy,
  type CashAdvanceRecoveryPolicy
} from "./policySettings"

type BadgeTone = "neutral" | "info" | "success" | "warning" | "destructive"

type DecimalLike = {
  toNumber?: () => number
  toString: () => string
}

export type CashAdvanceMetric = {
  id: string
  label: string
  displayValue: string
  detail: string
  tone: BadgeTone
}

export type CashAdvanceRow = {
  id: string
  publicReference: string
  title: string
  status: string
  sourceType: string
  budgetStatus: string
  requesterName: string
  beneficiaryName: string
  payeeType: "EMPLOYEE_OR_CUSTODIAN" | "SUPPLIER" | "REQUESTER" | "UNCLASSIFIED"
  payeeLabel: string
  paymentHandoffReadiness:
    | "PAYEE_IDENTIFIED_NO_SETTLEMENT"
    | "NEEDS_PAYEE_CLASSIFICATION"
  locationName: string
  supplierName: string
  categoryCode: string
  requestDate: string
  dueDate: string | null
  requestedAmountPhp: number
  issuedAmountPhp: number
  liquidatedAmountPhp: number
  outstandingAmountPhp: number
  evidenceReference: string | null
  disbursementRequestCount: number
  movementCount: number
  liquidationCount: number
}

export type CashAdvanceDisbursementRow = {
  id: string
  cashAdvanceRequestId: string | null
  publicReference: string
  cashAdvanceReference: string
  status: string
  sourceType: string
  payeeLabel: string
  payeeType: string
  amountPhp: number
  locationName: string
  requestedByName: string
  evidenceReference: string | null
  createdAt: string
}

export type CashAdvanceReportRow = {
  id: string
  publicReference: string
  title: string
  status: string
  dueState: "NOT_DUE" | "DUE_SOON" | "OVERDUE" | "NO_DUE_DATE" | "CLOSED"
  beneficiaryName: string
  payeeType: CashAdvanceRow["payeeType"]
  payeeLabel: string
  paymentHandoffReadiness: CashAdvanceRow["paymentHandoffReadiness"]
  locationName: string
  supplierName: string
  categoryCode: string
  issuedAmountPhp: number
  liquidatedAmountPhp: number
  outstandingAmountPhp: number
  evidenceState: "COMPLETE" | "MISSING"
  evidenceCaptureMode: EvidenceCaptureMode
  evidenceProductionReadiness: EvidenceProductionReadiness
  evidenceBlockerId: string | null
  movementCount: number
  liquidationCount: number
  exportSafeSummary: string
}

export type CashAdvanceLiquidationRow = {
  id: string
  cashAdvanceRequestId: string
  publicReference: string
  advanceReference: string
  advanceTitle: string
  status: string
  submittedByName: string
  locationName: string
  claimedAmountPhp: number
  approvedAmountPhp: number
  amountReturnedPhp: number
  lineCount: number
  evidenceReference: string | null
  submittedAt: string | null
  allowedActions: Array<
    | "approve_liquidation"
    | "return_liquidation"
    | "reject_liquidation"
    | "cancel_liquidation"
    | "mark_liquidation_closure_ready"
    | "reverse_liquidation"
    | "close_liquidation"
  >
}

export type CashAdvanceDraftOption = {
  id: string
  label: string
  detail: string
}

export type CashAdvanceDashboard = {
  generatedAt: string
  recoveryPolicy: {
    key: string
    policy: CashAdvanceRecoveryPolicy
    isOverridden: boolean
    sourceDecisionId: string
  }
  permissions: {
    canCreate: boolean
    canSubmit: boolean
    canApprove: boolean
    canLiquidate: boolean
    canReviewLiquidation: boolean
    canCreateDisbursement: boolean
    canApproveDisbursement: boolean
  }
  draftOptions: {
    suppliers: CashAdvanceDraftOption[]
    categories: CashAdvanceDraftOption[]
  }
  metrics: CashAdvanceMetric[]
  advances: CashAdvanceRow[]
  disbursementRequests: CashAdvanceDisbursementRow[]
  reportRows: CashAdvanceReportRow[]
  liquidations: CashAdvanceLiquidationRow[]
  guardrails: Array<{
    label: string
    detail: string
    tone: BadgeTone
  }>
}

export type CashAdvanceActionInput = {
  cashAdvanceRequestId: string
  reason?: string
  evidenceReference?: string
  idempotencyKey?: string
}

export type CreateDraftCashAdvanceInput = {
  title: string
  purpose: string
  categoryCode: string
  requestedAmountPhp: number
  requestDate: Date
  dueDate?: Date | null
  supplierId?: string | null
  evidenceReference?: string | undefined
  idempotencyKey?: string | undefined
}

export type CashAdvanceDisbursementHandoffInput = CashAdvanceActionInput & {
  paymentReferenceLabel?: string
}

export type CashAdvanceIssueInput = CashAdvanceActionInput & {
  amountPhp: number
  referenceNo?: string
}

export type CashAdvanceLiquidationLineInput = {
  spendDate: Date
  description: string
  categoryCode: string
  amountPhp: number
  taxAmountPhp?: number
  receiptReference?: string
  evidenceReference?: string
  supplierId?: string
}

export type SubmitCashAdvanceLiquidationInput = {
  cashAdvanceRequestId: string
  publicReference?: string | undefined
  evidenceReference: string
  notes?: string
  idempotencyKey?: string
  lines: CashAdvanceLiquidationLineInput[]
}

export type CashAdvanceLiquidationActionInput = {
  liquidationId: string
  reason?: string
  evidenceReference?: string
  approvedAmountPhp?: number
  amountReturnedPhp?: number
  idempotencyKey?: string
}

type CashAdvanceTransition =
  | "submit"
  | "approve"
  | "return"
  | "reject"
  | "cancel"
  | "issue"
  | "void_issue"
  | "close"

type CashAdvanceLiquidationTransition =
  | "submit_liquidation"
  | "approve_liquidation"
  | "return_liquidation"
  | "reject_liquidation"
  | "cancel_liquidation"
  | "mark_liquidation_closure_ready"
  | "reverse_liquidation"
  | "close_liquidation"

function decimalToNumber(value: DecimalLike | number | null | undefined) {
  if (value == null) {
    return 0
  }
  if (typeof value === "number") {
    return value
  }
  if (typeof value.toNumber === "function") {
    return value.toNumber()
  }
  return Number(value.toString())
}

function money(value: number) {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 0
  }).format(value)
}

function number(value: number) {
  return new Intl.NumberFormat("en-PH", {
    maximumFractionDigits: 0
  }).format(value)
}

function supplierName(
  supplier: { tradingName: string | null; legalName: string } | null
) {
  return supplier?.tradingName ?? supplier?.legalName ?? "No supplier linked"
}

function resolveCashAdvancePayee(input: {
  requestedBy: { displayName: string }
  beneficiary: { displayName: string } | null
  supplier: { tradingName: string | null; legalName: string } | null
}): Pick<
  CashAdvanceRow,
  "payeeType" | "payeeLabel" | "paymentHandoffReadiness"
> {
  if (input.beneficiary) {
    return {
      payeeType: "EMPLOYEE_OR_CUSTODIAN",
      payeeLabel: input.beneficiary.displayName,
      paymentHandoffReadiness: "PAYEE_IDENTIFIED_NO_SETTLEMENT"
    }
  }
  if (input.supplier) {
    return {
      payeeType: "SUPPLIER",
      payeeLabel: supplierName(input.supplier),
      paymentHandoffReadiness: "PAYEE_IDENTIFIED_NO_SETTLEMENT"
    }
  }
  if (input.requestedBy.displayName) {
    return {
      payeeType: "REQUESTER",
      payeeLabel: input.requestedBy.displayName,
      paymentHandoffReadiness: "PAYEE_IDENTIFIED_NO_SETTLEMENT"
    }
  }
  return {
    payeeType: "UNCLASSIFIED",
    payeeLabel: "Needs payee classification",
    paymentHandoffReadiness: "NEEDS_PAYEE_CLASSIFICATION"
  }
}

function resolveCashAdvanceDueState(
  advance: Pick<CashAdvanceRow, "status" | "dueDate" | "outstandingAmountPhp">
): CashAdvanceReportRow["dueState"] {
  if (
    ["CLOSED", "CANCELLED", "REJECTED"].includes(advance.status) ||
    advance.outstandingAmountPhp <= 0
  ) {
    return "CLOSED"
  }
  if (!advance.dueDate) {
    return "NO_DUE_DATE"
  }
  const dueDate = new Date(advance.dueDate)
  const daysUntilDue = Math.ceil((dueDate.getTime() - Date.now()) / 86_400_000)
  if (daysUntilDue < 0) {
    return "OVERDUE"
  }
  if (daysUntilDue <= 3) {
    return "DUE_SOON"
  }
  return "NOT_DUE"
}

function authorizedLocationIds(session: SessionContext) {
  return session.authorizedLocations.map((location) => location.locationId)
}

function assertReason(
  value: string | undefined,
  errorCode: string
): asserts value is string {
  if (!value?.trim()) {
    throw new Error(errorCode)
  }
}

function assertEvidence(
  value: string | undefined | null,
  errorCode: string
): asserts value is string {
  if (!value?.trim()) {
    throw new Error(errorCode)
  }
}

function assertPositiveAmount(value: number, errorCode: string) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(errorCode)
  }
}

function cleanText(value: string | null | undefined) {
  return value?.trim() ?? ""
}

function assertDate(value: Date, errorCode: string) {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new Error(errorCode)
  }
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

const cashAdvanceCategoryOptions = [
  {
    id: "REPAIRS",
    label: "Repairs and maintenance",
    detail: "Emergency or planned store repair spend"
  },
  {
    id: "OPERATIONS",
    label: "Store operations",
    detail: "Branch operating cash outlay"
  },
  {
    id: "TRANSPORT",
    label: "Transport and logistics",
    detail: "Delivery, travel, courier, or mobilization expenses"
  },
  {
    id: "CLEANING",
    label: "Cleaning and sanitation",
    detail: "Cleaning, sanitation, and safety-related spend"
  }
] satisfies CashAdvanceDraftOption[]

async function nextCashAdvanceRequestReference(
  tx: TransactionClient,
  companyId: string
) {
  const year = new Date().getUTCFullYear()
  const count = await tx.cashAdvanceRequest.count({
    where: {
      companyId,
      publicReference: { startsWith: `CA-${year}-` }
    }
  })
  return `CA-${year}-${String(count + 1).padStart(5, "0")}`
}

async function nextCashAdvanceLiquidationReference(companyId: string) {
  const year = new Date().getUTCFullYear()
  const count = await prisma.cashAdvanceLiquidation.count({
    where: {
      companyId,
      publicReference: { startsWith: `CA-LIQ-${year}-` }
    }
  })
  return `CA-LIQ-${year}-${String(count + 1).padStart(5, "0")}`
}

async function nextDisbursementRequestReference(companyId: string) {
  const year = new Date().getUTCFullYear()
  const count = await prisma.nonSupplierDisbursementRequest.count({
    where: {
      companyId,
      publicReference: { startsWith: `DISB-${year}-` }
    }
  })
  return `DISB-${year}-${String(count + 1).padStart(5, "0")}`
}

function resolveLiquidationAllowedActions(input: {
  status: string
  submittedByUserId: string
  currentUserId: string
  permissions: {
    canLiquidate: boolean
    canReviewLiquidation: boolean
  }
}): CashAdvanceLiquidationRow["allowedActions"] {
  const actions: CashAdvanceLiquidationRow["allowedActions"] = []
  if (
    input.permissions.canReviewLiquidation &&
    ["SUBMITTED", "UNDER_REVIEW"].includes(input.status) &&
    input.submittedByUserId !== input.currentUserId
  ) {
    actions.push(
      "approve_liquidation",
      "return_liquidation",
      "reject_liquidation"
    )
  }
  if (
    input.permissions.canLiquidate &&
    ["DRAFT", "SUBMITTED", "RETURNED_FOR_REVISION"].includes(input.status)
  ) {
    actions.push("cancel_liquidation")
  }
  if (input.permissions.canReviewLiquidation && input.status === "APPROVED") {
    actions.push("mark_liquidation_closure_ready", "reverse_liquidation")
  }
  if (
    input.permissions.canReviewLiquidation &&
    input.status === "CLOSURE_READY"
  ) {
    actions.push("reverse_liquidation", "close_liquidation")
  }
  if (input.permissions.canReviewLiquidation && input.status === "CLOSED") {
    actions.push("reverse_liquidation")
  }
  return actions
}

function assertCashAdvanceTransition(input: {
  transition: CashAdvanceTransition
  status: string
}) {
  const allowed: Record<CashAdvanceTransition, string[]> = {
    submit: ["DRAFT", "RETURNED_FOR_REVISION"],
    approve: ["AWAITING_APPROVAL"],
    return: ["AWAITING_APPROVAL"],
    reject: ["AWAITING_APPROVAL"],
    cancel: [
      "DRAFT",
      "SUBMITTED",
      "AWAITING_APPROVAL",
      "RETURNED_FOR_REVISION",
      "APPROVED",
      "RELEASE_PENDING",
      "ON_HOLD"
    ],
    issue: ["APPROVED", "RELEASE_PENDING"],
    void_issue: ["RELEASED_OFFLINE", "PARTIALLY_LIQUIDATED"],
    close: ["FULLY_LIQUIDATED"]
  }
  if (!allowed[input.transition].includes(input.status)) {
    throw new Error("CASH_ADVANCE_INVALID_STATUS_TRANSITION")
  }
}

function assertLiquidationTransition(input: {
  transition: CashAdvanceLiquidationTransition
  status: string
}) {
  const allowed: Record<CashAdvanceLiquidationTransition, string[]> = {
    submit_liquidation: ["DRAFT", "RETURNED_FOR_REVISION"],
    approve_liquidation: ["SUBMITTED", "UNDER_REVIEW"],
    return_liquidation: ["SUBMITTED", "UNDER_REVIEW"],
    reject_liquidation: ["SUBMITTED", "UNDER_REVIEW"],
    cancel_liquidation: ["DRAFT", "SUBMITTED", "RETURNED_FOR_REVISION"],
    mark_liquidation_closure_ready: ["APPROVED"],
    reverse_liquidation: ["APPROVED", "CLOSURE_READY", "CLOSED"],
    close_liquidation: ["CLOSURE_READY"]
  }
  if (!allowed[input.transition].includes(input.status)) {
    throw new Error("CASH_ADVANCE_LIQUIDATION_INVALID_STATUS_TRANSITION")
  }
}

async function lockGrantedFinancePermissions(
  tx: TransactionClient,
  session: SessionContext,
  permissionCodes: string[]
) {
  const grants = await tx.$queryRaw<Array<{ code: string }>>`
    SELECT permission.code
    FROM "UserRoleAssignment" AS ura
    INNER JOIN "Role" AS role ON role.id = ura."roleId"
    INNER JOIN "RolePermission" AS rp ON rp."roleId" = role.id
    INNER JOIN "Permission" AS permission ON permission.id = rp."permissionId"
    WHERE ura."userId" = ${session.user.id}::uuid
      AND ura.status::text = 'ACTIVE'
      AND ura."startsAt" <= NOW()
      AND (ura."endsAt" IS NULL OR ura."endsAt" > NOW())
      AND role.status::text = 'ACTIVE'
      AND (role."tenantId" = ${session.context.tenantId}::uuid OR role."tenantId" IS NULL)
      AND (permission."tenantId" = ${session.context.tenantId}::uuid OR permission."tenantId" IS NULL)
    FOR UPDATE OF ura, role, rp, permission
  `
  const requestedCodes = new Set(permissionCodes)
  return new Set(
    grants
      .map((grant) => grant.code)
      .filter((permissionCode) => requestedCodes.has(permissionCode))
  )
}

async function getScopedCashAdvanceOrThrow(
  tx: TransactionClient,
  session: SessionContext,
  cashAdvanceRequestId: string
) {
  const request = await tx.cashAdvanceRequest.findFirst({
    where: {
      id: cashAdvanceRequestId,
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      locationId: { in: authorizedLocationIds(session) }
    },
    include: {
      requestedBy: { select: { displayName: true } },
      beneficiary: { select: { displayName: true } },
      supplier: { select: { legalName: true, tradingName: true } },
      liquidations: {
        include: {
          lines: true
        }
      },
      movements: true,
      disbursementRequests: true
    }
  })
  if (!request) {
    throw new Error("CASH_ADVANCE_NOT_FOUND")
  }
  return request
}

async function findCashAdvanceApprovalRule(
  tx: TransactionClient,
  session: SessionContext
) {
  return tx.approvalRule.findFirst({
    where: {
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      transactionType: "CashAdvanceRequest",
      isActive: true
    },
    include: {
      steps: {
        orderBy: { stepOrder: "asc" }
      }
    },
    orderBy: { priority: "asc" }
  })
}

async function getScopedLiquidationOrThrow(
  tx: TransactionClient,
  session: SessionContext,
  liquidationId: string
) {
  const liquidation = await tx.cashAdvanceLiquidation.findFirst({
    where: {
      id: liquidationId,
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      locationId: { in: authorizedLocationIds(session) }
    },
    include: {
      lines: true,
      cashAdvanceRequest: true,
      movements: true
    }
  })
  if (!liquidation) {
    throw new Error("CASH_ADVANCE_LIQUIDATION_NOT_FOUND")
  }
  return liquidation
}

async function writeCashAdvanceAudit(
  tx: TransactionClient,
  input: {
    session: SessionContext
    entityType:
      | "CashAdvanceRequest"
      | "CashAdvanceLiquidation"
      | "NonSupplierDisbursementRequest"
    entityId: string
    eventType: string
    beforeStatus: string
    afterStatus: string
    reason?: string | null
    evidenceReference?: string | null
    metadata?: Record<string, unknown>
  }
) {
  return tx.auditEvent.create({
    data: {
      tenantId: input.session.context.tenantId,
      companyId: input.session.context.companyId,
      actorUserId: input.session.user.id,
      eventType: input.eventType,
      entityType: input.entityType,
      entityId: input.entityId,
      beforeData: {
        status: input.beforeStatus
      },
      afterData: {
        status: input.afterStatus,
        reason: input.reason ?? null,
        evidenceReference: input.evidenceReference ?? null
      },
      metadata: {
        noPaymentCreation: true,
        noPaymentRelease: true,
        noJournalPosting: true,
        noBankMutation: true,
        noApSettlement: true,
        ...(input.metadata ?? {})
      }
    }
  })
}

export function buildCashAdvanceRows(
  advances: Array<{
    id: string
    publicReference: string
    title: string
    status: string
    sourceType: string
    budgetStatus: string
    requestDate: Date
    dueDate: Date | null
    requestedAmountPhp: DecimalLike | number
    issuedAmountPhp: DecimalLike | number
    liquidatedAmountPhp: DecimalLike | number
    categoryCode: string
    evidenceReference: string | null
    requestedBy: { displayName: string }
    beneficiary: { displayName: string } | null
    location: { name: string }
    supplier: { tradingName: string | null; legalName: string } | null
    disbursementRequests?: Array<{ id: string }>
    movements: Array<{ id: string }>
    liquidations: Array<{ id: string }>
  }>
) {
  return advances.map((advance) => {
    const requestedAmountPhp = decimalToNumber(advance.requestedAmountPhp)
    const issuedAmountPhp = decimalToNumber(advance.issuedAmountPhp)
    const liquidatedAmountPhp = decimalToNumber(advance.liquidatedAmountPhp)
    const payee = resolveCashAdvancePayee(advance)

    return {
      id: advance.id,
      publicReference: advance.publicReference,
      title: advance.title,
      status: advance.status,
      sourceType: advance.sourceType,
      budgetStatus: advance.budgetStatus,
      requesterName: advance.requestedBy.displayName,
      beneficiaryName:
        advance.beneficiary?.displayName ?? advance.requestedBy.displayName,
      ...payee,
      locationName: advance.location.name,
      supplierName: supplierName(advance.supplier),
      categoryCode: advance.categoryCode,
      requestDate: advance.requestDate.toISOString(),
      dueDate: advance.dueDate?.toISOString() ?? null,
      requestedAmountPhp,
      issuedAmountPhp,
      liquidatedAmountPhp,
      outstandingAmountPhp: Math.max(issuedAmountPhp - liquidatedAmountPhp, 0),
      evidenceReference: advance.evidenceReference,
      disbursementRequestCount: advance.disbursementRequests?.length ?? 0,
      movementCount: advance.movements.length,
      liquidationCount: advance.liquidations.length
    }
  })
}

export function buildCashAdvanceDisbursementRows(
  requests: Array<{
    id: string
    cashAdvanceRequestId: string | null
    publicReference: string
    status: string
    sourceType: string
    amountPhp: DecimalLike | number
    evidenceReference: string | null
    createdAt: Date
    payee: {
      payeeType: string
      displayName: string
    }
    location: { name: string }
    requestedBy: { displayName: string }
    cashAdvanceRequest: {
      publicReference: string
    } | null
  }>
): CashAdvanceDisbursementRow[] {
  return requests.map((request) => ({
    id: request.id,
    cashAdvanceRequestId: request.cashAdvanceRequestId,
    publicReference: request.publicReference,
    cashAdvanceReference:
      request.cashAdvanceRequest?.publicReference ?? "No source cash advance",
    status: request.status,
    sourceType: request.sourceType,
    payeeLabel: request.payee.displayName,
    payeeType: request.payee.payeeType,
    amountPhp: decimalToNumber(request.amountPhp),
    locationName: request.location.name,
    requestedByName: request.requestedBy.displayName,
    evidenceReference: request.evidenceReference,
    createdAt: request.createdAt.toISOString()
  }))
}

export function buildCashAdvanceReportRows(
  rows: CashAdvanceRow[]
): CashAdvanceReportRow[] {
  return rows.map((advance) => {
    const evidenceReadiness = resolveEvidenceReadiness({
      evidenceReference: advance.evidenceReference
    })
    return {
      id: advance.id,
      publicReference: advance.publicReference,
      title: advance.title,
      status: advance.status,
      dueState: resolveCashAdvanceDueState(advance),
      beneficiaryName: advance.beneficiaryName,
      payeeType: advance.payeeType,
      payeeLabel: advance.payeeLabel,
      paymentHandoffReadiness: advance.paymentHandoffReadiness,
      locationName: advance.locationName,
      supplierName: advance.supplierName,
      categoryCode: advance.categoryCode,
      issuedAmountPhp: advance.issuedAmountPhp,
      liquidatedAmountPhp: advance.liquidatedAmountPhp,
      outstandingAmountPhp: advance.outstandingAmountPhp,
      evidenceState: evidenceReadiness.evidenceState,
      evidenceCaptureMode: evidenceReadiness.evidenceCaptureMode,
      evidenceProductionReadiness:
        evidenceReadiness.evidenceProductionReadiness,
      evidenceBlockerId: evidenceReadiness.evidenceBlockerId,
      movementCount: advance.movementCount,
      liquidationCount: advance.liquidationCount,
      exportSafeSummary: [
        advance.publicReference,
        advance.status,
        advance.payeeType,
        advance.paymentHandoffReadiness,
        advance.locationName,
        advance.categoryCode,
        evidenceReadiness.evidenceState,
        evidenceReadiness.evidenceCaptureMode,
        `${advance.movementCount} movement(s)`,
        `${advance.liquidationCount} liquidation(s)`
      ].join(" / ")
    }
  })
}

export function buildCashAdvanceLiquidationRows(input: {
  liquidations: Array<{
    id: string
    cashAdvanceRequestId: string
    publicReference: string
    status: string
    claimedAmountPhp: DecimalLike | number
    approvedAmountPhp: DecimalLike | number
    amountReturnedPhp: DecimalLike | number
    evidenceReference: string | null
    submittedAt: Date | null
    submittedByUserId: string
    submittedBy: { displayName: string }
    location: { name: string }
    lines: Array<{ id: string }>
    cashAdvanceRequest: {
      publicReference: string
      title: string
    }
  }>
  permissions: {
    canLiquidate: boolean
    canReviewLiquidation: boolean
  }
  currentUserId: string
}) {
  return input.liquidations.map((liquidation) => ({
    id: liquidation.id,
    cashAdvanceRequestId: liquidation.cashAdvanceRequestId,
    publicReference: liquidation.publicReference,
    advanceReference: liquidation.cashAdvanceRequest.publicReference,
    advanceTitle: liquidation.cashAdvanceRequest.title,
    status: liquidation.status,
    submittedByName: liquidation.submittedBy.displayName,
    locationName: liquidation.location.name,
    claimedAmountPhp: decimalToNumber(liquidation.claimedAmountPhp),
    approvedAmountPhp: decimalToNumber(liquidation.approvedAmountPhp),
    amountReturnedPhp: decimalToNumber(liquidation.amountReturnedPhp),
    lineCount: liquidation.lines.length,
    evidenceReference: liquidation.evidenceReference,
    submittedAt: liquidation.submittedAt?.toISOString() ?? null,
    allowedActions: resolveLiquidationAllowedActions({
      status: liquidation.status,
      submittedByUserId: liquidation.submittedByUserId,
      currentUserId: input.currentUserId,
      permissions: input.permissions
    })
  }))
}

export async function createDraftCashAdvanceRequest(
  session: SessionContext,
  input: CreateDraftCashAdvanceInput
) {
  if (!canUseFinance(session.permissionCodes)) {
    throw new Error("PERMISSION_DENIED")
  }
  await requirePermission(session, permissions.financeCashAdvanceCreate)

  const title = cleanText(input.title)
  const purpose = cleanText(input.purpose)
  const categoryCode = cleanText(input.categoryCode).toUpperCase()
  const supplierId = cleanText(input.supplierId) || null
  const evidenceReference = cleanText(input.evidenceReference) || null
  const requestedAmountPhp = roundMoney(Number(input.requestedAmountPhp))
  const requestDate = input.requestDate
  const dueDate = input.dueDate ?? null
  const idempotencyKey = cleanText(input.idempotencyKey) || null

  if (!title) {
    throw new Error("CASH_ADVANCE_TITLE_REQUIRED")
  }
  if (!purpose) {
    throw new Error("CASH_ADVANCE_PURPOSE_REQUIRED")
  }
  if (!categoryCode) {
    throw new Error("CASH_ADVANCE_CATEGORY_REQUIRED")
  }
  assertPositiveAmount(requestedAmountPhp, "CASH_ADVANCE_AMOUNT_REQUIRED")
  assertDate(requestDate, "CASH_ADVANCE_REQUEST_DATE_INVALID")
  if (dueDate) {
    assertDate(dueDate, "CASH_ADVANCE_DUE_DATE_INVALID")
    if (dueDate < requestDate) {
      throw new Error("CASH_ADVANCE_DUE_DATE_BEFORE_REQUEST_DATE")
    }
  }

  const locationId = session.context.locationId
  const allowedLocationIds = new Set(authorizedLocationIds(session))
  if (!allowedLocationIds.has(locationId)) {
    throw new Error("SCOPE_DENIED")
  }

  return prisma.$transaction(async (tx) => {
    if (idempotencyKey) {
      const existing = await tx.cashAdvanceRequest.findUnique({
        where: {
          tenantId_companyId_idempotencyKey: {
            tenantId: session.context.tenantId,
            companyId: session.context.companyId,
            idempotencyKey
          }
        }
      })
      if (existing) {
        if (!allowedLocationIds.has(existing.locationId)) {
          throw new Error("SCOPE_DENIED")
        }
        if (
          existing.requestedByUserId === session.user.id &&
          existing.status === "DRAFT"
        ) {
          return existing
        }
        throw new Error("CASH_ADVANCE_IDEMPOTENCY_CONFLICT")
      }
    }

    const [location, supplier] = await Promise.all([
      tx.location.findFirst({
        where: {
          id: locationId,
          tenantId: session.context.tenantId,
          companyId: session.context.companyId,
          status: "ACTIVE"
        },
        select: { id: true, brandId: true, name: true }
      }),
      supplierId
        ? tx.supplier.findFirst({
            where: {
              id: supplierId,
              tenantId: session.context.tenantId,
              companyId: session.context.companyId,
              status: "ACTIVE"
            },
            select: {
              id: true,
              supplierCode: true,
              legalName: true,
              tradingName: true
            }
          })
        : Promise.resolve(null)
    ])

    if (!location) {
      throw new Error("CASH_ADVANCE_LOCATION_NOT_FOUND")
    }
    if (supplierId && !supplier) {
      throw new Error("CASH_ADVANCE_SUPPLIER_NOT_ACTIVE")
    }

    const publicReference = await nextCashAdvanceRequestReference(
      tx,
      session.context.companyId
    )
    const request = await tx.cashAdvanceRequest.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        publicReference,
        currencyCode: "PHP",
        requestedAmountPhp,
        issuedAmountPhp: 0,
        liquidatedAmountPhp: 0,
        status: "DRAFT",
        sourceType: "STANDALONE",
        budgetStatus: "NOT_APPLICABLE",
        requestDate,
        dueDate,
        title,
        purpose,
        categoryCode,
        supplierId: supplier?.id ?? null,
        brandId: location.brandId ?? null,
        locationId: location.id,
        beneficiaryUserId: session.user.id,
        requestedByUserId: session.user.id,
        evidenceReference,
        budgetSnapshot: {
          phase: "phase3_create_only",
          sourceType: "STANDALONE",
          noPaymentCreation: true,
          noPaymentRelease: true,
          noJournalPosting: true,
          noBankMutation: true,
          noApSettlement: true
        },
        idempotencyKey
      }
    })

    await writeCashAdvanceAudit(tx, {
      session,
      entityType: "CashAdvanceRequest",
      entityId: request.id,
      eventType: "cash_advance.created",
      beforeStatus: "NONE",
      afterStatus: request.status,
      reason: purpose,
      evidenceReference,
      metadata: {
        publicReference,
        locationId: location.id,
        locationName: location.name,
        categoryCode,
        requestedAmountPhp,
        supplierId: supplier?.id ?? null,
        supplierCode: supplier?.supplierCode ?? null,
        draftOnly: true,
        idempotencyKey
      }
    })

    return request
  })
}

export async function submitCashAdvanceForApproval(
  session: SessionContext,
  input: CashAdvanceActionInput
) {
  await requirePermission(session, permissions.financeCashAdvanceSubmit)
  return prisma.$transaction(async (tx) => {
    const request = await getScopedCashAdvanceOrThrow(
      tx,
      session,
      input.cashAdvanceRequestId
    )
    const existingApproval = await tx.approvalInstance.findFirst({
      where: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        documentType: "CashAdvanceRequest",
        documentId: request.id,
        status: "PENDING"
      }
    })
    if (request.status === "AWAITING_APPROVAL" && existingApproval) {
      return request
    }
    if (request.status !== "AWAITING_APPROVAL") {
      assertCashAdvanceTransition({
        transition: "submit",
        status: request.status
      })
    }
    assertEvidence(
      input.evidenceReference ?? request.evidenceReference,
      "CASH_ADVANCE_EVIDENCE_REQUIRED"
    )
    assertPositiveAmount(
      decimalToNumber(request.requestedAmountPhp),
      "CASH_ADVANCE_AMOUNT_REQUIRED"
    )
    const approvalRule = await findCashAdvanceApprovalRule(tx, session)
    if (!approvalRule || approvalRule.steps.length === 0) {
      throw new Error("CASH_ADVANCE_APPROVAL_RULE_NOT_CONFIGURED")
    }
    const firstStep = approvalRule.steps[0]
    if (!firstStep) {
      throw new Error("CASH_ADVANCE_APPROVAL_RULE_STEP_NOT_CONFIGURED")
    }
    if (existingApproval) {
      throw new Error("CASH_ADVANCE_ALREADY_SUBMITTED")
    }

    if (!request.locationId) {
      throw new Error("CASH_ADVANCE_APPROVAL_SCOPE_NOT_CONFIGURED")
    }
    const routedSteps = approvalRule.steps.map((step, index) => ({
      ...step,
      approvalInstanceStepId: randomUUID(),
      activationStatus: index === 0 ? "PENDING" as const : "WAITING" as const
    }))
    const firstRoutedStep = routedSteps[0]
    if (!firstRoutedStep) {
      throw new Error("CASH_ADVANCE_APPROVAL_RULE_STEP_NOT_CONFIGURED")
    }
    const approvalInstance = await tx.approvalInstance.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        documentType: "CashAdvanceRequest",
        documentId: request.id,
        approvalRuleId: approvalRule.id,
        status: "PENDING",
        currentStepOrder: firstStep.stepOrder,
        steps: {
          create: routedSteps.map((step) => ({
            id: step.approvalInstanceStepId,
            stepOrder: step.stepOrder,
            assignedUserId: step.userId,
            assignedRoleId: step.roleId,
            status: step.activationStatus
          }))
        }
      }
    })
    const prohibitedActors = Array.from(new Map([
      ...(request.beneficiaryUserId
        ? [[request.beneficiaryUserId, {
            userId: request.beneficiaryUserId,
            reasonCode: "BENEFICIARY"
          }] as const]
        : []),
      [request.requestedByUserId, {
        userId: request.requestedByUserId,
        reasonCode: "REQUESTER"
      }] as const
    ]).values())
    for (const step of routedSteps) {
      await configureApprovalStepRouting(tx, {
        approvalInstanceStepId: step.approvalInstanceStepId,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        routingPolicy: getApprovalRoutingPolicy("CashAdvanceRequest"),
        requiredPermissionCode: permissions.financeCashAdvanceApprove,
        dueAt: request.dueDate ?? null,
        activationAudit: {
          actorUserId: session.user.id,
          source: "cash_advance.submit"
        },
        scopeGroups: [{
          groupOrder: 1,
          targetMatchMode: "ANY",
          targets: [{
            scopeType: "LOCATION",
            companyId: session.context.companyId,
            locationId: request.locationId
          }]
        }],
        prohibitedActors
      })
    }
    await assertAnyEligibleApprovalActorForStep(tx, {
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      approvalInstanceStepId: firstRoutedStep.approvalInstanceStepId
    })

    const updated = await tx.cashAdvanceRequest.update({
      where: { id: request.id },
      data: {
        status: "AWAITING_APPROVAL",
        approvalInstanceId: approvalInstance.id,
        submittedByUserId: session.user.id,
        submittedAt: new Date(),
        evidenceReference:
          input.evidenceReference?.trim() ?? request.evidenceReference,
        version: { increment: 1 }
      }
    })
    const auditEvent = await writeCashAdvanceAudit(tx, {
      session,
      entityType: "CashAdvanceRequest",
      entityId: request.id,
      eventType: "cash_advance.submitted",
      beforeStatus: request.status,
      afterStatus: updated.status,
      evidenceReference: updated.evidenceReference,
      metadata: {
        approvalInstanceId: approvalInstance.id,
        approvalRuleId: approvalRule.id,
        idempotencyKey: input.idempotencyKey ?? null
      }
    })
    if (firstStep.userId) await recordWorkflowNotifications(tx, {
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      locationId: request.locationId,
      recipientUserIds: [firstStep.userId],
      notificationType: "APPROVE_CASH_ADVANCE",
      priority: request.budgetStatus === "OVER_BUDGET" ? "HIGH" : "NORMAL",
      title: `Approve Cash Advance ${request.publicReference}`,
      body: `${session.user.displayName} submitted ${request.title} for approval.`,
      deepLink: `/approvals/${approvalInstance.id}`,
      entityType: "CashAdvanceRequest",
      entityId: request.id,
      sourceEventKey: auditEvent.id,
      recipientBasis: firstStep.userId ? "assigned_user" : "assigned_role",
      metadata: {
        approvalInstanceId: approvalInstance.id,
        approvalStepOrder: firstStep.stepOrder,
        publicReference: request.publicReference,
        budgetStatus: request.budgetStatus,
        requestedAmountPhp: decimalToNumber(request.requestedAmountPhp),
        noPaymentCreation: true,
        noPaymentRelease: true,
        noJournalPosting: true,
        noBankMutation: true
      }
    })
    return updated
  })
}

export async function approveCashAdvanceRequest(
  session: SessionContext,
  input: CashAdvanceActionInput
) {
  await requirePermission(session, permissions.financeCashAdvanceApprove)
  return prisma.$transaction(async (tx) => {
    const request = await getScopedCashAdvanceOrThrow(
      tx,
      session,
      input.cashAdvanceRequestId
    )
    if (request.status === "APPROVED") {
      return request
    }
    assertCashAdvanceTransition({
      transition: "approve",
      status: request.status
    })
    if (request.requestedByUserId === session.user.id) {
      throw new Error("CASH_ADVANCE_SELF_APPROVAL_BLOCKED")
    }
    if (request.budgetStatus === "OVER_BUDGET") {
      assertReason(input.reason, "CASH_ADVANCE_BUDGET_OVERRIDE_REASON_REQUIRED")
      assertEvidence(
        input.evidenceReference ?? request.evidenceReference,
        "CASH_ADVANCE_BUDGET_OVERRIDE_EVIDENCE_REQUIRED"
      )
    }

    const updated = await tx.cashAdvanceRequest.update({
      where: { id: request.id },
      data: {
        status: "APPROVED",
        approvedByUserId: session.user.id,
        approvedAt: new Date(),
        evidenceReference:
          input.evidenceReference?.trim() ?? request.evidenceReference,
        budgetSnapshot: {
          budgetStatus: request.budgetStatus,
          overrideReason: input.reason?.trim() ?? null,
          nonPostingApproval: true,
          noPaymentRelease: true,
          noJournalPosting: true
        },
        version: { increment: 1 }
      }
    })
    await writeCashAdvanceAudit(tx, {
      session,
      entityType: "CashAdvanceRequest",
      entityId: request.id,
      eventType: "cash_advance.approved",
      beforeStatus: request.status,
      afterStatus: updated.status,
      reason: input.reason?.trim() ?? null,
      evidenceReference: updated.evidenceReference,
      metadata: {
        budgetStatus: request.budgetStatus,
        idempotencyKey: input.idempotencyKey ?? null
      }
    })
    return updated
  })
}

export async function createCashAdvanceDisbursementHandoff(
  session: SessionContext,
  input: CashAdvanceDisbursementHandoffInput
) {
  await requirePermission(session, permissions.financeDisbursementCreate)
  assertReason(input.reason, "CASH_ADVANCE_DISBURSEMENT_REASON_REQUIRED")
  const reason = input.reason.trim()

  return prisma.$transaction(async (tx) => {
    const request = await getScopedCashAdvanceOrThrow(
      tx,
      session,
      input.cashAdvanceRequestId
    )
    if (!["APPROVED", "RELEASE_PENDING"].includes(request.status)) {
      throw new Error("CASH_ADVANCE_DISBURSEMENT_STATUS_INVALID")
    }
    if (decimalToNumber(request.issuedAmountPhp) > 0) {
      throw new Error("CASH_ADVANCE_DISBURSEMENT_ALREADY_ISSUED")
    }
    if (request.supplierId || request.supplier) {
      throw new Error("CASH_ADVANCE_SUPPLIER_PAYEE_USE_AP_PAYMENT_REQUEST")
    }
    const beneficiaryUserId =
      request.beneficiaryUserId ?? request.requestedByUserId
    const payeeDisplayName =
      request.beneficiary?.displayName ?? request.requestedBy.displayName
    if (!beneficiaryUserId || !payeeDisplayName) {
      throw new Error("CASH_ADVANCE_DISBURSEMENT_PAYEE_REQUIRED")
    }
    const amountPhp = decimalToNumber(request.requestedAmountPhp)
    assertPositiveAmount(amountPhp, "CASH_ADVANCE_DISBURSEMENT_AMOUNT_REQUIRED")

    const sourceEventKey = `cash-advance:${request.id}:non-supplier-disbursement`
    const existing = await tx.nonSupplierDisbursementRequest.findFirst({
      where: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        sourceEventKey,
        status: { notIn: ["CANCELLED", "REJECTED"] }
      }
    })
    if (existing) {
      return existing
    }

    const payee = await tx.financePayee.upsert({
      where: {
        tenantId_companyId_payeeType_userId: {
          tenantId: session.context.tenantId,
          companyId: session.context.companyId,
          payeeType: "USER_CUSTODIAN",
          userId: beneficiaryUserId
        }
      },
      create: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        payeeType: "USER_CUSTODIAN",
        status: "ACTIVE",
        displayName: payeeDisplayName,
        userId: beneficiaryUserId,
        paymentReferenceLabel:
          input.paymentReferenceLabel?.trim() ||
          "Employee/custodian cash advance",
        evidenceReference:
          input.evidenceReference?.trim() ?? request.evidenceReference,
        createdByUserId: session.user.id
      },
      update: {
        status: "ACTIVE",
        displayName: payeeDisplayName,
        paymentReferenceLabel:
          input.paymentReferenceLabel?.trim() ||
          "Employee/custodian cash advance",
        evidenceReference:
          input.evidenceReference?.trim() ?? request.evidenceReference
      }
    })

    const publicReference = await nextDisbursementRequestReference(
      session.context.companyId
    )
    const created = await tx.nonSupplierDisbursementRequest.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        locationId: request.locationId,
        payeeId: payee.id,
        cashAdvanceRequestId: request.id,
        publicReference,
        currencyCode: "PHP",
        amountPhp,
        status: "DRAFT",
        sourceType: "CASH_ADVANCE",
        sourceEventKey,
        requestReason: reason,
        evidenceReference:
          input.evidenceReference?.trim() ?? request.evidenceReference,
        idempotencyKey: input.idempotencyKey ?? sourceEventKey,
        requestedByUserId: session.user.id
      }
    })

    await writeCashAdvanceAudit(tx, {
      session,
      entityType: "NonSupplierDisbursementRequest",
      entityId: created.id,
      eventType: "cash_advance.disbursement_handoff_created",
      beforeStatus: "NEW",
      afterStatus: created.status,
      reason,
      evidenceReference: created.evidenceReference,
      metadata: {
        cashAdvanceRequestId: request.id,
        cashAdvanceReference: request.publicReference,
        payeeId: payee.id,
        payeeType: payee.payeeType,
        sourceEventKey,
        idempotencyKey: input.idempotencyKey ?? null,
        nonSupplierDisbursementRequestCreated: true,
        noPaymentCreation: false,
        noSupplierApPaymentRequest: true,
        noPaymentRelease: true,
        noBankMutation: true,
        noJournalPosting: true,
        noApSettlement: true
      }
    })
    return created
  })
}

export async function returnCashAdvanceForRevision(
  session: SessionContext,
  input: CashAdvanceActionInput
) {
  await requirePermission(session, permissions.financeCashAdvanceApprove)
  const reason = input.reason?.trim()
  assertReason(reason, "CASH_ADVANCE_RETURN_REASON_REQUIRED")
  return prisma.$transaction(async (tx) => {
    const request = await getScopedCashAdvanceOrThrow(
      tx,
      session,
      input.cashAdvanceRequestId
    )
    assertCashAdvanceTransition({
      transition: "return",
      status: request.status
    })
    const updated = await tx.cashAdvanceRequest.update({
      where: { id: request.id },
      data: {
        status: "RETURNED_FOR_REVISION",
        returnedByUserId: session.user.id,
        returnedAt: new Date(),
        returnReason: reason,
        version: { increment: 1 }
      }
    })
    await writeCashAdvanceAudit(tx, {
      session,
      entityType: "CashAdvanceRequest",
      entityId: request.id,
      eventType: "cash_advance.returned",
      beforeStatus: request.status,
      afterStatus: updated.status,
      reason,
      evidenceReference: input.evidenceReference ?? request.evidenceReference
    })
    return updated
  })
}

export async function rejectCashAdvanceRequest(
  session: SessionContext,
  input: CashAdvanceActionInput
) {
  await requirePermission(session, permissions.financeCashAdvanceApprove)
  const reason = input.reason?.trim()
  assertReason(reason, "CASH_ADVANCE_REJECTION_REASON_REQUIRED")
  return prisma.$transaction(async (tx) => {
    const request = await getScopedCashAdvanceOrThrow(
      tx,
      session,
      input.cashAdvanceRequestId
    )
    assertCashAdvanceTransition({
      transition: "reject",
      status: request.status
    })
    const updated = await tx.cashAdvanceRequest.update({
      where: { id: request.id },
      data: {
        status: "REJECTED",
        rejectedByUserId: session.user.id,
        rejectedAt: new Date(),
        rejectionReason: reason,
        version: { increment: 1 }
      }
    })
    await writeCashAdvanceAudit(tx, {
      session,
      entityType: "CashAdvanceRequest",
      entityId: request.id,
      eventType: "cash_advance.rejected",
      beforeStatus: request.status,
      afterStatus: updated.status,
      reason,
      evidenceReference: input.evidenceReference ?? request.evidenceReference
    })
    return updated
  })
}

export async function cancelCashAdvanceRequest(
  session: SessionContext,
  input: CashAdvanceActionInput
) {
  await requirePermission(session, permissions.financeCashAdvanceSubmit)
  const reason = input.reason?.trim()
  assertReason(reason, "CASH_ADVANCE_CANCELLATION_REASON_REQUIRED")
  return prisma.$transaction(async (tx) => {
    const grantedPermissionCodes = await lockGrantedFinancePermissions(
      tx,
      session,
      [
        permissions.financeCashAdvanceSubmit,
        permissions.financeCashAdvanceApprove
      ]
    )
    if (!grantedPermissionCodes.has(permissions.financeCashAdvanceSubmit)) {
      throw new Error("PERMISSION_DENIED")
    }
    const request = await getScopedCashAdvanceOrThrow(
      tx,
      session,
      input.cashAdvanceRequestId
    )
    assertCashAdvanceTransition({
      transition: "cancel",
      status: request.status
    })
    const requesterCancellingOwn = request.requestedByUserId === session.user.id
    if (
      !requesterCancellingOwn &&
      !grantedPermissionCodes.has(permissions.financeCashAdvanceApprove)
    ) {
      throw new Error("CASH_ADVANCE_CANCEL_PERMISSION_DENIED")
    }
    if (decimalToNumber(request.issuedAmountPhp) > 0) {
      throw new Error("CASH_ADVANCE_CANCEL_REQUIRES_REVERSAL")
    }
    const updated = await tx.cashAdvanceRequest.update({
      where: { id: request.id },
      data: {
        status: "CANCELLED",
        cancelledByUserId: session.user.id,
        cancelledAt: new Date(),
        cancellationReason: reason,
        version: { increment: 1 }
      }
    })
    await writeCashAdvanceAudit(tx, {
      session,
      entityType: "CashAdvanceRequest",
      entityId: request.id,
      eventType: "cash_advance.cancelled",
      beforeStatus: request.status,
      afterStatus: updated.status,
      reason,
      evidenceReference: input.evidenceReference ?? request.evidenceReference,
      metadata: {
        issuedAmountPhp: decimalToNumber(request.issuedAmountPhp)
      }
    })
    return updated
  })
}

export async function issueCashAdvanceOffline(
  session: SessionContext,
  input: CashAdvanceIssueInput
) {
  await requirePermission(session, permissions.financeCashAdvanceApprove)
  const reason = input.reason?.trim()
  const evidenceReference = input.evidenceReference?.trim()
  assertReason(reason, "CASH_ADVANCE_ISSUE_REASON_REQUIRED")
  assertEvidence(evidenceReference, "CASH_ADVANCE_ISSUE_EVIDENCE_REQUIRED")
  assertPositiveAmount(input.amountPhp, "CASH_ADVANCE_ISSUE_AMOUNT_REQUIRED")
  return prisma.$transaction(async (tx) => {
    const request = await getScopedCashAdvanceOrThrow(
      tx,
      session,
      input.cashAdvanceRequestId
    )
    const sourceEventKey =
      input.idempotencyKey ??
      `cash-advance:${request.id}:issue:${input.referenceNo ?? "manual"}`
    const existingMovement = await tx.cashAdvanceMovement.findFirst({
      where: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        sourceEventKey
      }
    })
    if (existingMovement) {
      return request
    }
    assertCashAdvanceTransition({
      transition: "issue",
      status: request.status
    })
    if (request.approvedByUserId === session.user.id) {
      throw new Error("CASH_ADVANCE_ISSUER_APPROVER_SEGREGATION_REQUIRED")
    }
    const issuedAmountPhp = decimalToNumber(request.issuedAmountPhp)
    const requestedAmountPhp = decimalToNumber(request.requestedAmountPhp)
    if (issuedAmountPhp + input.amountPhp > requestedAmountPhp) {
      throw new Error("CASH_ADVANCE_ISSUE_EXCEEDS_APPROVED_AMOUNT")
    }

    await tx.cashAdvanceMovement.create({
      data: {
        tenantId: request.tenantId,
        companyId: request.companyId,
        locationId: request.locationId,
        cashAdvanceRequestId: request.id,
        actorUserId: session.user.id,
        movementType: "ISSUE",
        amountPhp: input.amountPhp,
        sourceEventKey,
        referenceNo: input.referenceNo?.trim() ?? null,
        notes: reason,
        idempotencyKey: input.idempotencyKey ?? null
      }
    })
    const updatedIssuedAmount = issuedAmountPhp + input.amountPhp
    const updated = await tx.cashAdvanceRequest.update({
      where: { id: request.id },
      data: {
        status: "RELEASED_OFFLINE",
        issuedAmountPhp: updatedIssuedAmount,
        evidenceReference,
        version: { increment: 1 }
      }
    })
    await writeCashAdvanceAudit(tx, {
      session,
      entityType: "CashAdvanceRequest",
      entityId: request.id,
      eventType: "cash_advance.issued_offline",
      beforeStatus: request.status,
      afterStatus: updated.status,
      reason,
      evidenceReference,
      metadata: {
        amountPhp: input.amountPhp,
        sourceEventKey,
        referenceNo: input.referenceNo ?? null,
        offlineOnlyNoBankMutation: true
      }
    })
    return updated
  })
}

export async function voidCashAdvanceOfflineIssue(
  session: SessionContext,
  input: CashAdvanceActionInput
) {
  await requirePermission(session, permissions.financeCashAdvanceApprove)
  const reason = input.reason?.trim()
  const evidenceReference = input.evidenceReference?.trim()
  assertReason(reason, "CASH_ADVANCE_VOID_ISSUE_REASON_REQUIRED")
  assertEvidence(evidenceReference, "CASH_ADVANCE_VOID_ISSUE_EVIDENCE_REQUIRED")

  return prisma.$transaction(async (tx) => {
    const request = await getScopedCashAdvanceOrThrow(
      tx,
      session,
      input.cashAdvanceRequestId
    )
    if (request.status === "VOIDED") {
      return request
    }
    assertCashAdvanceTransition({
      transition: "void_issue",
      status: request.status
    })
    const issuedAmountPhp = decimalToNumber(request.issuedAmountPhp)
    const liquidatedAmountPhp = decimalToNumber(request.liquidatedAmountPhp)
    if (issuedAmountPhp <= 0.009) {
      throw new Error("CASH_ADVANCE_VOID_ISSUE_AMOUNT_REQUIRED")
    }
    if (liquidatedAmountPhp > 0.009) {
      throw new Error("CASH_ADVANCE_VOID_ISSUE_REQUIRES_LIQUIDATION_REVERSAL")
    }

    const sourceEventKey =
      input.idempotencyKey ?? `cash-advance:${request.id}:void-issue`
    const existingMovement = await tx.cashAdvanceMovement.findFirst({
      where: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        sourceEventKey
      }
    })
    if (existingMovement) {
      return request
    }

    const issueMovements = request.movements.filter(
      (movement) => movement.movementType === "ISSUE"
    )
    if (issueMovements.length === 0) {
      throw new Error("CASH_ADVANCE_ISSUE_MOVEMENT_NOT_FOUND")
    }

    await tx.cashAdvanceMovement.create({
      data: {
        tenantId: request.tenantId,
        companyId: request.companyId,
        locationId: request.locationId,
        cashAdvanceRequestId: request.id,
        actorUserId: session.user.id,
        movementType: "REVERSAL",
        amountPhp: issuedAmountPhp,
        sourceEventKey,
        referenceNo: request.publicReference,
        notes: `Voids offline issue exposure; ${reason}. No payment, bank, AP, or journal mutation.`,
        idempotencyKey: input.idempotencyKey ?? null
      }
    })
    const updated = await tx.cashAdvanceRequest.update({
      where: { id: request.id },
      data: {
        status: "VOIDED",
        issuedAmountPhp: 0,
        evidenceReference,
        cancellationReason: reason,
        cancelledByUserId: session.user.id,
        cancelledAt: new Date(),
        version: { increment: 1 }
      }
    })
    await writeCashAdvanceAudit(tx, {
      session,
      entityType: "CashAdvanceRequest",
      entityId: request.id,
      eventType: "cash_advance.issue_voided",
      beforeStatus: request.status,
      afterStatus: updated.status,
      reason,
      evidenceReference,
      metadata: {
        reversalMovementType: "REVERSAL",
        reversedIssueAmountPhp: issuedAmountPhp,
        issueMovementCount: issueMovements.length,
        sourceEventKey,
        noPaymentCreation: true,
        noPaymentRelease: true,
        noJournalPosting: true,
        noBankMutation: true,
        noApSettlement: true
      }
    })
    return updated
  })
}

export async function submitCashAdvanceLiquidation(
  session: SessionContext,
  input: SubmitCashAdvanceLiquidationInput
) {
  await requirePermission(session, permissions.financeCashAdvanceLiquidate)
  assertEvidence(
    input.evidenceReference,
    "CASH_ADVANCE_LIQUIDATION_EVIDENCE_REQUIRED"
  )
  if (input.lines.length === 0) {
    throw new Error("CASH_ADVANCE_LIQUIDATION_LINES_REQUIRED")
  }
  if (input.lines.length > 25) {
    throw new Error("CASH_ADVANCE_LIQUIDATION_LINE_LIMIT_EXCEEDED")
  }
  const claimedAmountPhp = input.lines.reduce((sum, line) => {
    assertPositiveAmount(
      line.amountPhp,
      "CASH_ADVANCE_LIQUIDATION_LINE_AMOUNT_REQUIRED"
    )
    if (!line.description.trim()) {
      throw new Error("CASH_ADVANCE_LIQUIDATION_LINE_DESCRIPTION_REQUIRED")
    }
    return sum + line.amountPhp
  }, 0)

  return prisma.$transaction(async (tx) => {
    const request = await getScopedCashAdvanceOrThrow(
      tx,
      session,
      input.cashAdvanceRequestId
    )
    if (
      !["RELEASED_OFFLINE", "PARTIALLY_LIQUIDATED"].includes(request.status)
    ) {
      throw new Error("CASH_ADVANCE_LIQUIDATION_REQUEST_NOT_RELEASED")
    }
    const outstandingAmountPhp =
      decimalToNumber(request.issuedAmountPhp) -
      decimalToNumber(request.liquidatedAmountPhp)
    if (claimedAmountPhp > outstandingAmountPhp) {
      throw new Error("CASH_ADVANCE_LIQUIDATION_EXCEEDS_OUTSTANDING")
    }
    if (input.idempotencyKey) {
      const existing = await tx.cashAdvanceLiquidation.findFirst({
        where: {
          tenantId: session.context.tenantId,
          companyId: session.context.companyId,
          idempotencyKey: input.idempotencyKey
        }
      })
      if (existing) {
        return existing
      }
    }

    const publicReference =
      input.publicReference?.trim() ||
      (await nextCashAdvanceLiquidationReference(session.context.companyId))

    const liquidation = await tx.cashAdvanceLiquidation.create({
      data: {
        tenantId: request.tenantId,
        companyId: request.companyId,
        locationId: request.locationId,
        cashAdvanceRequestId: request.id,
        publicReference,
        claimedAmountPhp,
        status: "SUBMITTED",
        submittedByUserId: session.user.id,
        submittedAt: new Date(),
        evidenceReference: input.evidenceReference.trim(),
        notes: input.notes?.trim() ?? null,
        idempotencyKey: input.idempotencyKey ?? null,
        lines: {
          create: input.lines.map((line, index) => ({
            tenantId: request.tenantId,
            companyId: request.companyId,
            locationId: request.locationId,
            lineNumber: index + 1,
            spendDate: line.spendDate,
            description: line.description.trim(),
            categoryCode: line.categoryCode.trim(),
            amountPhp: line.amountPhp,
            taxAmountPhp: line.taxAmountPhp ?? 0,
            receiptReference: line.receiptReference?.trim() ?? null,
            evidenceReference:
              line.evidenceReference?.trim() ?? input.evidenceReference.trim(),
            supplierId: line.supplierId ?? null,
            createdByUserId: session.user.id
          }))
        }
      }
    })
    await writeCashAdvanceAudit(tx, {
      session,
      entityType: "CashAdvanceLiquidation",
      entityId: liquidation.id,
      eventType: "cash_advance.liquidation_submitted",
      beforeStatus: "DRAFT",
      afterStatus: liquidation.status,
      evidenceReference: liquidation.evidenceReference,
      metadata: {
        cashAdvanceRequestId: request.id,
        claimedAmountPhp,
        lineCount: input.lines.length,
        idempotencyKey: input.idempotencyKey ?? null
      }
    })
    return liquidation
  })
}

export async function approveCashAdvanceLiquidation(
  session: SessionContext,
  input: CashAdvanceLiquidationActionInput
) {
  await requirePermission(
    session,
    permissions.financeCashAdvanceReviewLiquidation
  )
  return prisma.$transaction(async (tx) => {
    const liquidation = await getScopedLiquidationOrThrow(
      tx,
      session,
      input.liquidationId
    )
    if (liquidation.status === "APPROVED") {
      return liquidation
    }
    assertLiquidationTransition({
      transition: "approve_liquidation",
      status: liquidation.status
    })
    if (
      liquidation.cashAdvanceRequest.requestedByUserId === session.user.id ||
      liquidation.submittedByUserId === session.user.id
    ) {
      throw new Error("CASH_ADVANCE_LIQUIDATION_SELF_APPROVAL_BLOCKED")
    }
    assertEvidence(
      input.evidenceReference ?? liquidation.evidenceReference,
      "CASH_ADVANCE_LIQUIDATION_APPROVAL_EVIDENCE_REQUIRED"
    )
    const approvedAmountPhp =
      input.approvedAmountPhp ?? decimalToNumber(liquidation.claimedAmountPhp)
    assertPositiveAmount(
      approvedAmountPhp,
      "CASH_ADVANCE_LIQUIDATION_APPROVED_AMOUNT_REQUIRED"
    )
    const request = liquidation.cashAdvanceRequest
    const outstandingAmountPhp =
      decimalToNumber(request.issuedAmountPhp) -
      decimalToNumber(request.liquidatedAmountPhp)
    if (approvedAmountPhp > outstandingAmountPhp) {
      throw new Error("CASH_ADVANCE_LIQUIDATION_APPROVAL_EXCEEDS_OUTSTANDING")
    }
    const sourceEventKey =
      input.idempotencyKey ??
      `cash-advance:${request.id}:liquidation:${liquidation.id}`
    const existingMovement = await tx.cashAdvanceMovement.findFirst({
      where: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        sourceEventKey
      }
    })
    if (existingMovement) {
      return liquidation
    }

    await tx.cashAdvanceMovement.create({
      data: {
        tenantId: request.tenantId,
        companyId: request.companyId,
        locationId: request.locationId,
        cashAdvanceRequestId: request.id,
        liquidationId: liquidation.id,
        actorUserId: session.user.id,
        movementType: "LIQUIDATION_SETTLEMENT",
        amountPhp: approvedAmountPhp,
        sourceEventKey,
        referenceNo: liquidation.publicReference,
        notes: input.reason?.trim() ?? "Liquidation approved",
        idempotencyKey: input.idempotencyKey ?? null
      }
    })
    const updatedLiquidatedAmount =
      decimalToNumber(request.liquidatedAmountPhp) + approvedAmountPhp
    const remainingOutstanding =
      decimalToNumber(request.issuedAmountPhp) - updatedLiquidatedAmount
    const nextRequestStatus =
      remainingOutstanding <= 0.009
        ? "FULLY_LIQUIDATED"
        : "PARTIALLY_LIQUIDATED"

    const updated = await tx.cashAdvanceLiquidation.update({
      where: { id: liquidation.id },
      data: {
        status: "APPROVED",
        approvedByUserId: session.user.id,
        approvedAt: new Date(),
        approvedAmountPhp,
        amountReturnedPhp: input.amountReturnedPhp ?? 0,
        evidenceReference:
          input.evidenceReference?.trim() ?? liquidation.evidenceReference,
        reviewReason: input.reason?.trim() ?? null
      }
    })
    await tx.cashAdvanceRequest.update({
      where: { id: request.id },
      data: {
        status: nextRequestStatus,
        liquidatedAmountPhp: updatedLiquidatedAmount,
        version: { increment: 1 }
      }
    })
    await writeCashAdvanceAudit(tx, {
      session,
      entityType: "CashAdvanceLiquidation",
      entityId: liquidation.id,
      eventType: "cash_advance.liquidation_approved",
      beforeStatus: liquidation.status,
      afterStatus: updated.status,
      reason: input.reason?.trim() ?? null,
      evidenceReference: updated.evidenceReference,
      metadata: {
        cashAdvanceRequestId: request.id,
        approvedAmountPhp,
        sourceEventKey,
        requestStatusAfterLiquidation: nextRequestStatus
      }
    })
    return updated
  })
}

export async function returnCashAdvanceLiquidationForRevision(
  session: SessionContext,
  input: CashAdvanceLiquidationActionInput
) {
  await requirePermission(
    session,
    permissions.financeCashAdvanceReviewLiquidation
  )
  const reason = input.reason?.trim()
  assertReason(reason, "CASH_ADVANCE_LIQUIDATION_RETURN_REASON_REQUIRED")
  return prisma.$transaction(async (tx) => {
    const liquidation = await getScopedLiquidationOrThrow(
      tx,
      session,
      input.liquidationId
    )
    assertLiquidationTransition({
      transition: "return_liquidation",
      status: liquidation.status
    })
    const updated = await tx.cashAdvanceLiquidation.update({
      where: { id: liquidation.id },
      data: {
        status: "RETURNED_FOR_REVISION",
        reviewedByUserId: session.user.id,
        reviewedAt: new Date(),
        reviewReason: reason
      }
    })
    await writeCashAdvanceAudit(tx, {
      session,
      entityType: "CashAdvanceLiquidation",
      entityId: liquidation.id,
      eventType: "cash_advance.liquidation_returned",
      beforeStatus: liquidation.status,
      afterStatus: updated.status,
      reason,
      evidenceReference:
        input.evidenceReference ?? liquidation.evidenceReference
    })
    return updated
  })
}

export async function rejectCashAdvanceLiquidation(
  session: SessionContext,
  input: CashAdvanceLiquidationActionInput
) {
  await requirePermission(
    session,
    permissions.financeCashAdvanceReviewLiquidation
  )
  const reason = input.reason?.trim()
  assertReason(reason, "CASH_ADVANCE_LIQUIDATION_REJECTION_REASON_REQUIRED")
  return prisma.$transaction(async (tx) => {
    const liquidation = await getScopedLiquidationOrThrow(
      tx,
      session,
      input.liquidationId
    )
    assertLiquidationTransition({
      transition: "reject_liquidation",
      status: liquidation.status
    })
    const updated = await tx.cashAdvanceLiquidation.update({
      where: { id: liquidation.id },
      data: {
        status: "REJECTED",
        reviewedByUserId: session.user.id,
        reviewedAt: new Date(),
        reviewReason: reason
      }
    })
    await writeCashAdvanceAudit(tx, {
      session,
      entityType: "CashAdvanceLiquidation",
      entityId: liquidation.id,
      eventType: "cash_advance.liquidation_rejected",
      beforeStatus: liquidation.status,
      afterStatus: updated.status,
      reason,
      evidenceReference:
        input.evidenceReference ?? liquidation.evidenceReference
    })
    return updated
  })
}

export async function cancelCashAdvanceLiquidation(
  session: SessionContext,
  input: CashAdvanceLiquidationActionInput
) {
  await requirePermission(session, permissions.financeCashAdvanceLiquidate)
  const reason = input.reason?.trim()
  assertReason(reason, "CASH_ADVANCE_LIQUIDATION_CANCELLATION_REASON_REQUIRED")
  return prisma.$transaction(async (tx) => {
    const grantedPermissionCodes = await lockGrantedFinancePermissions(
      tx,
      session,
      [
        permissions.financeCashAdvanceLiquidate,
        permissions.financeCashAdvanceReviewLiquidation
      ]
    )
    if (!grantedPermissionCodes.has(permissions.financeCashAdvanceLiquidate)) {
      throw new Error("PERMISSION_DENIED")
    }
    const liquidation = await getScopedLiquidationOrThrow(
      tx,
      session,
      input.liquidationId
    )
    assertLiquidationTransition({
      transition: "cancel_liquidation",
      status: liquidation.status
    })
    if (
      liquidation.submittedByUserId !== session.user.id &&
      !grantedPermissionCodes.has(
        permissions.financeCashAdvanceReviewLiquidation
      )
    ) {
      throw new Error("CASH_ADVANCE_LIQUIDATION_CANCEL_PERMISSION_DENIED")
    }
    const updated = await tx.cashAdvanceLiquidation.update({
      where: { id: liquidation.id },
      data: {
        status: "CANCELLED",
        cancelledByUserId: session.user.id,
        cancelledAt: new Date(),
        cancellationReason: reason
      }
    })
    await writeCashAdvanceAudit(tx, {
      session,
      entityType: "CashAdvanceLiquidation",
      entityId: liquidation.id,
      eventType: "cash_advance.liquidation_cancelled",
      beforeStatus: liquidation.status,
      afterStatus: updated.status,
      reason,
      evidenceReference:
        input.evidenceReference ?? liquidation.evidenceReference
    })
    return updated
  })
}

export async function markCashAdvanceLiquidationClosureReady(
  session: SessionContext,
  input: CashAdvanceLiquidationActionInput
) {
  await requirePermission(
    session,
    permissions.financeCashAdvanceReviewLiquidation
  )
  const reason = input.reason?.trim()
  assertReason(reason, "CASH_ADVANCE_LIQUIDATION_CLOSURE_READY_REASON_REQUIRED")
  assertEvidence(
    input.evidenceReference,
    "CASH_ADVANCE_LIQUIDATION_CLOSURE_READY_EVIDENCE_REQUIRED"
  )
  const evidenceReference = input.evidenceReference.trim()
  return prisma.$transaction(async (tx) => {
    const liquidation = await getScopedLiquidationOrThrow(
      tx,
      session,
      input.liquidationId
    )
    if (liquidation.status === "CLOSURE_READY") {
      return liquidation
    }
    assertLiquidationTransition({
      transition: "mark_liquidation_closure_ready",
      status: liquidation.status
    })
    const settlementMovement = liquidation.movements.find(
      (movement) => movement.movementType === "LIQUIDATION_SETTLEMENT"
    )
    if (!settlementMovement) {
      throw new Error("CASH_ADVANCE_LIQUIDATION_SETTLEMENT_REQUIRED")
    }
    const updated = await tx.cashAdvanceLiquidation.update({
      where: { id: liquidation.id },
      data: {
        status: "CLOSURE_READY",
        reviewedByUserId: session.user.id,
        reviewedAt: new Date(),
        reviewReason: reason,
        evidenceReference
      }
    })
    await writeCashAdvanceAudit(tx, {
      session,
      entityType: "CashAdvanceLiquidation",
      entityId: liquidation.id,
      eventType: "cash_advance.liquidation_closure_ready",
      beforeStatus: liquidation.status,
      afterStatus: updated.status,
      reason,
      evidenceReference: updated.evidenceReference,
      metadata: {
        cashAdvanceRequestId: liquidation.cashAdvanceRequestId,
        settlementMovementId: settlementMovement.id,
        closureReadinessOnlyNoPaymentMutation: true
      }
    })
    return updated
  })
}

export async function reverseCashAdvanceLiquidation(
  session: SessionContext,
  input: CashAdvanceLiquidationActionInput
) {
  await requirePermission(
    session,
    permissions.financeCashAdvanceReviewLiquidation
  )
  const reason = input.reason?.trim()
  const evidenceReference = input.evidenceReference?.trim()
  assertReason(reason, "CASH_ADVANCE_LIQUIDATION_REVERSAL_REASON_REQUIRED")
  assertEvidence(
    evidenceReference,
    "CASH_ADVANCE_LIQUIDATION_REVERSAL_EVIDENCE_REQUIRED"
  )

  return prisma.$transaction(async (tx) => {
    const liquidation = await getScopedLiquidationOrThrow(
      tx,
      session,
      input.liquidationId
    )
    if (liquidation.status === "REVERSED") {
      return liquidation
    }
    assertLiquidationTransition({
      transition: "reverse_liquidation",
      status: liquidation.status
    })
    const request = liquidation.cashAdvanceRequest
    const settlementMovement = liquidation.movements.find(
      (movement) => movement.movementType === "LIQUIDATION_SETTLEMENT"
    )
    if (!settlementMovement) {
      throw new Error("CASH_ADVANCE_LIQUIDATION_SETTLEMENT_REQUIRED")
    }
    const approvedAmountPhp = decimalToNumber(liquidation.approvedAmountPhp)
    if (approvedAmountPhp <= 0.009) {
      throw new Error("CASH_ADVANCE_LIQUIDATION_REVERSAL_AMOUNT_REQUIRED")
    }
    const sourceEventKey =
      input.idempotencyKey ??
      `cash-advance:${request.id}:liquidation-reversal:${liquidation.id}`
    const existingMovement = await tx.cashAdvanceMovement.findFirst({
      where: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        sourceEventKey
      }
    })
    if (existingMovement) {
      return liquidation
    }

    await tx.cashAdvanceMovement.create({
      data: {
        tenantId: request.tenantId,
        companyId: request.companyId,
        locationId: request.locationId,
        cashAdvanceRequestId: request.id,
        liquidationId: liquidation.id,
        actorUserId: session.user.id,
        movementType: "REVERSAL",
        amountPhp: approvedAmountPhp,
        sourceEventKey,
        referenceNo: liquidation.publicReference,
        notes: `Reverses liquidation settlement movement ${settlementMovement.id}; ${reason}. No payment, bank, AP, or journal mutation.`,
        idempotencyKey: input.idempotencyKey ?? null
      }
    })

    const currentLiquidatedAmountPhp = decimalToNumber(
      request.liquidatedAmountPhp
    )
    const updatedLiquidatedAmountPhp = Math.max(
      currentLiquidatedAmountPhp - approvedAmountPhp,
      0
    )
    const issuedAmountPhp = decimalToNumber(request.issuedAmountPhp)
    const remainingOutstanding = issuedAmountPhp - updatedLiquidatedAmountPhp
    const nextRequestStatus =
      updatedLiquidatedAmountPhp <= 0.009
        ? "RELEASED_OFFLINE"
        : remainingOutstanding <= 0.009
          ? "FULLY_LIQUIDATED"
          : "PARTIALLY_LIQUIDATED"

    const updated = await tx.cashAdvanceLiquidation.update({
      where: { id: liquidation.id },
      data: {
        status: "REVERSED",
        reviewedByUserId: session.user.id,
        reviewedAt: new Date(),
        reviewReason: reason,
        evidenceReference
      }
    })
    await tx.cashAdvanceRequest.update({
      where: { id: request.id },
      data: {
        status: nextRequestStatus,
        liquidatedAmountPhp: updatedLiquidatedAmountPhp,
        version: { increment: 1 }
      }
    })
    await writeCashAdvanceAudit(tx, {
      session,
      entityType: "CashAdvanceLiquidation",
      entityId: liquidation.id,
      eventType: "cash_advance.liquidation_reversed",
      beforeStatus: liquidation.status,
      afterStatus: updated.status,
      reason,
      evidenceReference,
      metadata: {
        cashAdvanceRequestId: request.id,
        settlementMovementId: settlementMovement.id,
        reversalMovementType: "REVERSAL",
        reversedLiquidationAmountPhp: approvedAmountPhp,
        liquidatedAmountBeforePhp: currentLiquidatedAmountPhp,
        liquidatedAmountAfterPhp: updatedLiquidatedAmountPhp,
        requestStatusAfterReversal: nextRequestStatus,
        sourceEventKey,
        noPaymentCreation: true,
        noPaymentRelease: true,
        noJournalPosting: true,
        noBankMutation: true,
        noApSettlement: true
      }
    })
    return updated
  })
}

export async function closeCashAdvanceLiquidation(
  session: SessionContext,
  input: CashAdvanceLiquidationActionInput
) {
  await requirePermission(
    session,
    permissions.financeCashAdvanceReviewLiquidation
  )
  const reason = input.reason?.trim()
  assertReason(reason, "CASH_ADVANCE_LIQUIDATION_CLOSE_REASON_REQUIRED")
  assertEvidence(
    input.evidenceReference,
    "CASH_ADVANCE_LIQUIDATION_CLOSE_EVIDENCE_REQUIRED"
  )
  const evidenceReference = input.evidenceReference.trim()
  return prisma.$transaction(async (tx) => {
    const liquidation = await getScopedLiquidationOrThrow(
      tx,
      session,
      input.liquidationId
    )
    if (liquidation.status === "CLOSED") {
      return liquidation
    }
    assertLiquidationTransition({
      transition: "close_liquidation",
      status: liquidation.status
    })
    const updated = await tx.cashAdvanceLiquidation.update({
      where: { id: liquidation.id },
      data: {
        status: "CLOSED",
        closedByUserId: session.user.id,
        closedAt: new Date(),
        closureNotes: reason,
        evidenceReference
      }
    })
    await writeCashAdvanceAudit(tx, {
      session,
      entityType: "CashAdvanceLiquidation",
      entityId: liquidation.id,
      eventType: "cash_advance.liquidation_closed",
      beforeStatus: liquidation.status,
      afterStatus: updated.status,
      reason,
      evidenceReference: updated.evidenceReference,
      metadata: {
        cashAdvanceRequestId: liquidation.cashAdvanceRequestId,
        noPaymentCreation: true,
        noPaymentRelease: true,
        noJournalPosting: true,
        noBankMutation: true
      }
    })
    return updated
  })
}

export async function closeCashAdvanceRequest(
  session: SessionContext,
  input: CashAdvanceActionInput
) {
  await requirePermission(
    session,
    permissions.financeCashAdvanceReviewLiquidation
  )
  const reason = input.reason?.trim()
  assertReason(reason, "CASH_ADVANCE_CLOSE_REASON_REQUIRED")
  return prisma.$transaction(async (tx) => {
    const request = await getScopedCashAdvanceOrThrow(
      tx,
      session,
      input.cashAdvanceRequestId
    )
    assertCashAdvanceTransition({
      transition: "close",
      status: request.status
    })
    const outstandingAmountPhp =
      decimalToNumber(request.issuedAmountPhp) -
      decimalToNumber(request.liquidatedAmountPhp)
    if (outstandingAmountPhp > 0.009) {
      throw new Error("CASH_ADVANCE_CLOSE_OUTSTANDING_BALANCE")
    }
    const updated = await tx.cashAdvanceRequest.update({
      where: { id: request.id },
      data: {
        status: "CLOSED",
        closedByUserId: session.user.id,
        closedAt: new Date(),
        closureNotes: reason,
        version: { increment: 1 }
      }
    })
    await writeCashAdvanceAudit(tx, {
      session,
      entityType: "CashAdvanceRequest",
      entityId: request.id,
      eventType: "cash_advance.closed",
      beforeStatus: request.status,
      afterStatus: updated.status,
      reason,
      evidenceReference: input.evidenceReference ?? request.evidenceReference,
      metadata: {
        outstandingAmountPhp
      }
    })
    return updated
  })
}

export async function getCashAdvanceDashboard(
  session: SessionContext
): Promise<CashAdvanceDashboard> {
  if (!canUseFinance(await getGrantedPermissionCodes(session))) {
    throw new Error("PERMISSION_DENIED")
  }
  await requirePermission(session, permissions.financeCashAdvanceView)

  const authorizedLocationIds = session.authorizedLocations.map(
    (location) => location.locationId
  )

  const permissionsState = {
    canCreate: session.permissionCodes.includes(
      permissions.financeCashAdvanceCreate
    ),
    canSubmit: session.permissionCodes.includes(
      permissions.financeCashAdvanceSubmit
    ),
    canApprove: session.permissionCodes.includes(
      permissions.financeCashAdvanceApprove
    ),
    canLiquidate: session.permissionCodes.includes(
      permissions.financeCashAdvanceLiquidate
    ),
    canReviewLiquidation: session.permissionCodes.includes(
      permissions.financeCashAdvanceReviewLiquidation
    ),
    canCreateDisbursement: session.permissionCodes.includes(
      permissions.financeDisbursementCreate
    ),
    canApproveDisbursement: session.permissionCodes.includes(
      permissions.financeDisbursementApprove
    )
  }

  const [
    advances,
    liquidations,
    disbursementRequests,
    suppliers,
    recoveryPolicy
  ] = await Promise.all([
    prisma.cashAdvanceRequest.findMany({
      where: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        locationId: { in: authorizedLocationIds }
      },
      include: {
        requestedBy: { select: { displayName: true } },
        beneficiary: { select: { displayName: true } },
        location: { select: { name: true } },
        supplier: { select: { legalName: true, tradingName: true } },
        disbursementRequests: { select: { id: true } },
        movements: { select: { id: true } },
        liquidations: { select: { id: true } }
      },
      orderBy: { createdAt: "desc" },
      take: 50
    }),
    prisma.cashAdvanceLiquidation.findMany({
      where: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        locationId: { in: authorizedLocationIds }
      },
      include: {
        submittedBy: { select: { displayName: true } },
        location: { select: { name: true } },
        lines: { select: { id: true } },
        cashAdvanceRequest: {
          select: {
            publicReference: true,
            title: true
          }
        }
      },
      orderBy: [{ updatedAt: "desc" }, { publicReference: "asc" }],
      take: 50
    }),
    prisma.nonSupplierDisbursementRequest.findMany({
      where: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        locationId: { in: authorizedLocationIds }
      },
      include: {
        payee: { select: { payeeType: true, displayName: true } },
        location: { select: { name: true } },
        requestedBy: { select: { displayName: true } },
        cashAdvanceRequest: { select: { publicReference: true } }
      },
      orderBy: [{ createdAt: "desc" }],
      take: 50
    }),
    prisma.supplier.findMany({
      where: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        status: "ACTIVE"
      },
      select: {
        id: true,
        supplierCode: true,
        legalName: true,
        tradingName: true
      },
      orderBy: [{ supplierCode: "asc" }],
      take: 100
    }),
    getCashAdvanceRecoveryPolicy(session)
  ])

  const rows = buildCashAdvanceRows(advances)
  const disbursementRows =
    buildCashAdvanceDisbursementRows(disbursementRequests)
  const reportRows = buildCashAdvanceReportRows(rows)
  const liquidationRows = buildCashAdvanceLiquidationRows({
    liquidations,
    permissions: {
      canLiquidate: permissionsState.canLiquidate,
      canReviewLiquidation: permissionsState.canReviewLiquidation
    },
    currentUserId: session.user.id
  })
  const activeRows = rows.filter((row) =>
    [
      "SUBMITTED",
      "AWAITING_APPROVAL",
      "APPROVED",
      "RELEASE_PENDING",
      "RELEASED_OFFLINE",
      "PARTIALLY_LIQUIDATED",
      "ON_HOLD"
    ].includes(row.status)
  )
  const pendingApprovalRows = rows.filter(
    (row) => row.status === "AWAITING_APPROVAL"
  )
  const outstandingRows = rows.filter((row) => row.outstandingAmountPhp > 0)
  const overdueRows = rows.filter((row) => {
    if (!row.dueDate || row.outstandingAmountPhp <= 0) {
      return false
    }
    return new Date(row.dueDate).getTime() < Date.now()
  })
  const totalOutstanding = outstandingRows.reduce(
    (sum, row) => sum + row.outstandingAmountPhp,
    0
  )

  return {
    generatedAt: new Date().toISOString(),
    recoveryPolicy,
    permissions: permissionsState,
    draftOptions: {
      suppliers: suppliers.map((supplier) => ({
        id: supplier.id,
        label: `${supplier.supplierCode} / ${
          supplier.tradingName ?? supplier.legalName
        }`,
        detail: supplier.legalName
      })),
      categories: cashAdvanceCategoryOptions
    },
    metrics: [
      {
        id: "active-advances",
        label: "Active advances",
        displayValue: number(activeRows.length),
        detail:
          "Submitted, approved, released offline, or partially liquidated advances in scope.",
        tone: activeRows.length > 0 ? "info" : "neutral"
      },
      {
        id: "pending-approval",
        label: "Pending approval",
        displayValue: number(pendingApprovalRows.length),
        detail:
          "Cash advances waiting for scoped approval. Requesters cannot approve their own.",
        tone: pendingApprovalRows.length > 0 ? "warning" : "success"
      },
      {
        id: "outstanding-value",
        label: "Outstanding",
        displayValue: money(totalOutstanding),
        detail:
          "Issued less liquidated PHP amount. This does not post settlement or bank movement.",
        tone: totalOutstanding > 0 ? "warning" : "success"
      },
      {
        id: "overdue-liquidations",
        label: "Overdue liquidation",
        displayValue: number(overdueRows.length),
        detail:
          "Outstanding advances past due date and ready for finance follow-up.",
        tone: overdueRows.length > 0 ? "destructive" : "success"
      }
    ],
    advances: rows,
    disbursementRequests: disbursementRows,
    reportRows,
    liquidations: liquidationRows,
    guardrails: [
      {
        label: "Non-posting cash control",
        detail:
          "This workspace records cash advance and liquidation readiness only. It does not release cash, post journals, or reconcile bank accounts.",
        tone: "success"
      },
      {
        label: "Source records stay authoritative",
        detail:
          "Linked expense or payment records remain independent source records. Cash advance actions do not approve, settle, or mutate them.",
        tone: "success"
      },
      {
        label: "Liquidation evidence is mandatory for UAT",
        detail:
          "The model supports liquidation lines and receipt references; document upload storage remains in pending evidence-upload work.",
        tone: "info"
      }
    ]
  }
}
