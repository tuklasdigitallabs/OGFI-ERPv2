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
  assertAuthoritativeApprovalEvidence,
  assertLegacyApprovalDecisionAllowed
} from "./approvalDecisionMode"
import { terminatePendingApprovalForCancellation } from "./approvalCancellation"
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

type BadgeTone = "neutral" | "info" | "success" | "warning" | "destructive"

type DecimalLike = {
  toNumber?: () => number
  toString: () => string
}

export type PettyCashMetric = {
  id: string
  label: string
  displayValue: string
  detail: string
  tone: BadgeTone
}

export type PettyCashFundRow = {
  id: string
  publicReference: string
  code: string
  name: string
  status: string
  locationName: string
  custodianName: string
  currentBalancePhp: number
  targetBalancePhp: number
  lowBalanceAlertPhp: number
  availableToTargetPhp: number
  requestCount: number
  openRequestCount: number
  liquidationCount: number
  openLiquidationCount: number
  ledgerEntryCount: number
  evidenceReference: string | null
}

export type PettyCashReportRow = {
  id: string
  publicReference: string
  code: string
  name: string
  status: string
  locationName: string
  custodianName: string
  balanceState: "HEALTHY" | "LOW_BALANCE" | "INACTIVE"
  currentBalancePhp: number
  targetBalancePhp: number
  availableToTargetPhp: number
  openRequestCount: number
  openLiquidationCount: number
  ledgerEntryCount: number
  evidenceState: "COMPLETE" | "MISSING"
  evidenceCaptureMode: EvidenceCaptureMode
  evidenceProductionReadiness: EvidenceProductionReadiness
  evidenceBlockerId: string | null
  exportSafeSummary: string
}

export type PettyCashExceptionRow = {
  id: string
  fundId: string
  fundName: string
  publicReference: string
  locationName: string
  custodianName: string
  severity: "HIGH" | "MEDIUM" | "LOW"
  issueType:
    | "LOW_BALANCE"
    | "OPEN_REQUESTS"
    | "OPEN_LIQUIDATIONS"
    | "MISSING_EVIDENCE"
  issueLabel: string
  amountPhp: number | null
  count: number | null
  nextAction: string
  blockerId: string | null
}

export type PettyCashRequestWorkflowRow = {
  id: string
  publicReference: string
  fundName: string
  requestType: string
  status: string
  requestedAmountPhp: number
  approvedAmountPhp: number
  allowedActions: Array<
    | "submit"
    | "approve"
    | "return"
    | "reject"
    | "cancel"
    | "create_handoff"
    | "fulfill"
    | "void"
    | "close"
  >
  disbursementHandoffReference: string | null
}

export type PettyCashLiquidationWorkflowRow = {
  id: string
  publicReference: string
  fundName: string
  status: string
  claimedAmountPhp: number
  approvedAmountPhp: number
  shortageAmountPhp: number
  overageAmountPhp: number
  allowedActions: Array<
    "approve" | "return" | "reject" | "cancel" | "reverse" | "close"
  >
}

export type PettyCashDraftOption = {
  id: string
  label: string
  detail: string
}

export type PettyCashDashboard = {
  generatedAt: string
  permissions: {
    canCreate: boolean
    canSubmit: boolean
    canApprove: boolean
    canReplenish: boolean
    canCreateDisbursementHandoff: boolean
    canLiquidate: boolean
    canReviewLiquidation: boolean
  }
  draftOptions: {
    funds: PettyCashDraftOption[]
    locations: PettyCashDraftOption[]
    custodians: PettyCashDraftOption[]
    suppliers: PettyCashDraftOption[]
    categories: PettyCashDraftOption[]
  }
  metrics: PettyCashMetric[]
  funds: PettyCashFundRow[]
  reportRows: PettyCashReportRow[]
  exceptionRows: PettyCashExceptionRow[]
  requests: PettyCashRequestWorkflowRow[]
  liquidations: PettyCashLiquidationWorkflowRow[]
  guardrails: Array<{
    label: string
    detail: string
    tone: BadgeTone
  }>
}

export type PettyCashActionInput = {
  pettyCashFundId: string
  reason?: string
  evidenceReference?: string
  idempotencyKey?: string
}

export type CreatePettyCashFundInput = {
  code: string
  name: string
  locationId: string
  custodianUserId: string
  openingBalancePhp: number
  targetBalancePhp: number
  lowBalanceAlertPhp: number
  evidenceReference: string
  notes?: string
  idempotencyKey?: string
}

export type PettyCashRequestActionInput = {
  pettyCashRequestId: string
  reason?: string
  evidenceReference?: string
  approvedAmountPhp?: number
  idempotencyKey?: string
}

export type PettyCashFulfillmentInput = PettyCashRequestActionInput & {
  amountPhp: number
  referenceNo?: string
}

export type PettyCashDisbursementHandoffInput = PettyCashRequestActionInput & {
  paymentReferenceLabel?: string
}

export type PettyCashLiquidationLineInput = {
  spendDate: Date
  categoryCode: string
  description: string
  amountPhp: number
  taxAmountPhp?: number
  receiptReference?: string
  evidenceReference?: string
  supplierId?: string
}

export type SubmitPettyCashLiquidationInput = {
  pettyCashFundId: string
  publicReference?: string
  cycleStart: Date
  cycleEnd: Date
  evidenceReference: string
  idempotencyKey?: string
  lines: PettyCashLiquidationLineInput[]
}

export type PettyCashLiquidationActionInput = {
  liquidationId: string
  reason?: string
  evidenceReference?: string
  approvedAmountPhp?: number
  shortageAmountPhp?: number
  overageAmountPhp?: number
  idempotencyKey?: string
}

type PettyCashFundTransition = "activate"

type PettyCashRequestTransition =
  | "submit"
  | "approve"
  | "return"
  | "reject"
  | "cancel"
  | "create_handoff"
  | "fulfill"
  | "void"
  | "close"

type PettyCashLiquidationTransition =
  | "submit_liquidation"
  | "approve_liquidation"
  | "return_liquidation"
  | "reject_liquidation"
  | "cancel_liquidation"
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

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

const pettyCashCategoryOptions = [
  {
    id: "STORE_OPERATIONS",
    label: "Store operations",
    detail: "Small operating purchases and branch supplies"
  },
  {
    id: "REPAIRS_MAINTENANCE",
    label: "Repairs and maintenance",
    detail: "Urgent repairs, minor maintenance, or service materials"
  },
  {
    id: "TRANSPORT_LOGISTICS",
    label: "Transport and logistics",
    detail: "Delivery, courier, parking, and local transport costs"
  },
  {
    id: "CLEANING_SANITATION",
    label: "Cleaning and sanitation",
    detail: "Cleaning, sanitation, safety, and hygiene supplies"
  },
  {
    id: "STAFF_MEALS_WELFARE",
    label: "Staff meals and welfare",
    detail: "Approved team meal, welfare, or meeting support costs"
  },
  {
    id: "MISC_APPROVED",
    label: "Other approved petty cash",
    detail: "Approved small-value spend that does not fit another category"
  }
] satisfies PettyCashDraftOption[]

async function nextPettyCashFundReference(
  tx: TransactionClient,
  companyId: string
) {
  const year = new Date().getUTCFullYear()
  const count = await tx.pettyCashFund.count({
    where: {
      companyId,
      publicReference: { startsWith: `PCF-${year}-` }
    }
  })
  return `PCF-${year}-${String(count + 1).padStart(5, "0")}`
}

async function nextPettyCashRequestReference(
  tx: TransactionClient,
  companyId: string
) {
  const year = new Date().getUTCFullYear()
  const count = await tx.pettyCashRequest.count({
    where: {
      companyId,
      publicReference: { startsWith: `PCR-${year}-` }
    }
  })
  return `PCR-${year}-${String(count + 1).padStart(5, "0")}`
}

async function nextDisbursementRequestReference(
  tx: TransactionClient,
  companyId: string
) {
  const year = new Date().getUTCFullYear()
  const count = await tx.nonSupplierDisbursementRequest.count({
    where: {
      companyId,
      publicReference: { startsWith: `DISB-${year}-` }
    }
  })
  return `DISB-${year}-${String(count + 1).padStart(5, "0")}`
}

async function nextPettyCashLiquidationReference(
  tx: TransactionClient,
  companyId: string
) {
  const year = new Date().getUTCFullYear()
  const count = await tx.pettyCashLiquidation.count({
    where: {
      companyId,
      publicReference: { startsWith: `PCL-${year}-` }
    }
  })
  return `PCL-${year}-${String(count + 1).padStart(5, "0")}`
}

const openRequestStatuses = new Set([
  "SUBMITTED",
  "AWAITING_APPROVAL",
  "APPROVED",
  "FULFILLED_OFFLINE",
  "RETURNED_FOR_REVISION"
])

const openLiquidationStatuses = new Set([
  "SUBMITTED",
  "UNDER_REVIEW",
  "RETURNED_FOR_REVISION",
  "APPROVED"
])

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

function resolvePettyCashRequestActions(input: {
  status: string
  hasOpenDisbursementHandoff?: boolean
  permissions: {
    canSubmit: boolean
    canApprove: boolean
    canReplenish: boolean
    canCreateDisbursementHandoff: boolean
  }
}): PettyCashRequestWorkflowRow["allowedActions"] {
  const actions: PettyCashRequestWorkflowRow["allowedActions"] = []
  if (
    input.permissions.canSubmit &&
    ["DRAFT", "RETURNED_FOR_REVISION"].includes(input.status)
  ) {
    actions.push("submit")
  }
  if (input.permissions.canApprove && input.status === "AWAITING_APPROVAL") {
    actions.push("approve", "return", "reject")
  }
  if (
    input.permissions.canSubmit &&
    [
      "DRAFT",
      "SUBMITTED",
      "AWAITING_APPROVAL",
      "RETURNED_FOR_REVISION",
      "APPROVED"
    ].includes(input.status)
  ) {
    actions.push("cancel")
  }
  if (input.permissions.canReplenish && input.status === "APPROVED") {
    actions.push("fulfill")
  }
  if (
    input.permissions.canCreateDisbursementHandoff &&
    input.status === "APPROVED" &&
    !input.hasOpenDisbursementHandoff
  ) {
    actions.push("create_handoff")
  }
  if (input.permissions.canApprove && input.status === "FULFILLED_OFFLINE") {
    actions.push("void")
  }
  if (input.permissions.canApprove && input.status === "FULFILLED_OFFLINE") {
    actions.push("close")
  }
  return actions
}

function resolvePettyCashLiquidationActions(input: {
  status: string
  permissions: {
    canLiquidate: boolean
    canReviewLiquidation: boolean
  }
}): PettyCashLiquidationWorkflowRow["allowedActions"] {
  const actions: PettyCashLiquidationWorkflowRow["allowedActions"] = []
  if (
    input.permissions.canReviewLiquidation &&
    ["SUBMITTED", "UNDER_REVIEW"].includes(input.status)
  ) {
    actions.push("approve", "return", "reject")
  }
  if (
    input.permissions.canLiquidate &&
    ["DRAFT", "SUBMITTED", "RETURNED_FOR_REVISION"].includes(input.status)
  ) {
    actions.push("cancel")
  }
  if (input.permissions.canReviewLiquidation && input.status === "APPROVED") {
    actions.push("reverse", "close")
  }
  if (input.permissions.canReviewLiquidation && input.status === "CLOSED") {
    actions.push("reverse")
  }
  return actions
}

function assertFundTransition(input: {
  transition: PettyCashFundTransition
  status: string
}) {
  const allowed: Record<PettyCashFundTransition, string[]> = {
    activate: ["DRAFT", "SUSPENDED"]
  }
  if (!allowed[input.transition].includes(input.status)) {
    throw new Error("PETTY_CASH_FUND_INVALID_STATUS_TRANSITION")
  }
}

function assertRequestTransition(input: {
  transition: PettyCashRequestTransition
  status: string
}) {
  const allowed: Record<PettyCashRequestTransition, string[]> = {
    submit: ["DRAFT", "RETURNED_FOR_REVISION"],
    approve: ["AWAITING_APPROVAL"],
    return: ["AWAITING_APPROVAL"],
    reject: ["AWAITING_APPROVAL"],
    cancel: [
      "DRAFT",
      "SUBMITTED",
      "AWAITING_APPROVAL",
      "RETURNED_FOR_REVISION",
      "APPROVED"
    ],
    create_handoff: ["APPROVED"],
    fulfill: ["APPROVED"],
    void: ["FULFILLED_OFFLINE"],
    close: ["FULFILLED_OFFLINE"]
  }
  if (!allowed[input.transition].includes(input.status)) {
    throw new Error("PETTY_CASH_REQUEST_INVALID_STATUS_TRANSITION")
  }
}

function assertLiquidationTransition(input: {
  transition: PettyCashLiquidationTransition
  status: string
}) {
  const allowed: Record<PettyCashLiquidationTransition, string[]> = {
    submit_liquidation: ["DRAFT", "RETURNED_FOR_REVISION"],
    approve_liquidation: ["SUBMITTED", "UNDER_REVIEW"],
    return_liquidation: ["SUBMITTED", "UNDER_REVIEW"],
    reject_liquidation: ["SUBMITTED", "UNDER_REVIEW"],
    cancel_liquidation: ["DRAFT", "SUBMITTED", "RETURNED_FOR_REVISION"],
    reverse_liquidation: ["APPROVED", "CLOSED"],
    close_liquidation: ["APPROVED"]
  }
  if (!allowed[input.transition].includes(input.status)) {
    throw new Error("PETTY_CASH_LIQUIDATION_INVALID_STATUS_TRANSITION")
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

async function getScopedFundOrThrow(
  tx: TransactionClient,
  session: SessionContext,
  pettyCashFundId: string
) {
  const fund = await tx.pettyCashFund.findFirst({
    where: {
      id: pettyCashFundId,
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      locationId: { in: authorizedLocationIds(session) }
    },
    include: {
      requests: true,
      liquidations: true,
      ledgerEntries: true
    }
  })
  if (!fund) {
    throw new Error("PETTY_CASH_FUND_NOT_FOUND")
  }
  return fund
}

async function getScopedRequestOrThrow(
  tx: TransactionClient,
  session: SessionContext,
  pettyCashRequestId: string
) {
  const request = await tx.pettyCashRequest.findFirst({
    where: {
      id: pettyCashRequestId,
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      fund: {
        locationId: { in: authorizedLocationIds(session) }
      }
    },
    include: {
      fund: {
        include: {
          custodian: true
        }
      },
      ledgerEntries: true,
      disbursementRequests: true
    }
  })
  if (!request) {
    throw new Error("PETTY_CASH_REQUEST_NOT_FOUND")
  }
  return request
}

async function findPettyCashApprovalRule(
  tx: TransactionClient,
  session: SessionContext
) {
  return tx.approvalRule.findFirst({
    where: {
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      transactionType: "PettyCashRequest",
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
  const liquidation = await tx.pettyCashLiquidation.findFirst({
    where: {
      id: liquidationId,
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      fund: {
        locationId: { in: authorizedLocationIds(session) }
      }
    },
    include: {
      fund: true,
      lines: true,
      ledgerEntries: true
    }
  })
  if (!liquidation) {
    throw new Error("PETTY_CASH_LIQUIDATION_NOT_FOUND")
  }
  return liquidation
}

async function writePettyCashAudit(
  tx: TransactionClient,
  input: {
    session: SessionContext
    entityType:
      | "PettyCashFund"
      | "PettyCashRequest"
      | "PettyCashLiquidation"
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
        noPeriodCloseMutation: true,
        ...(input.metadata ?? {})
      }
    }
  })
}

export function validatePettyCashApprovedAmount(input: {
  approvedAmountPhp: number | undefined
  requestedAmountPhp: number
  currentProposedAmountPhp?: number | undefined
}) {
  const currentAmountPhp =
    input.currentProposedAmountPhp ?? input.requestedAmountPhp
  if (
    input.approvedAmountPhp !== undefined &&
    input.approvedAmountPhp !== currentAmountPhp
  ) {
    throw new Error("PETTY_CASH_AMOUNT_CHANGE_POLICY_UNCONFIRMED")
  }
  const approvedAmountPhp = input.approvedAmountPhp ?? currentAmountPhp
  assertPositiveAmount(
    approvedAmountPhp,
    "PETTY_CASH_REQUEST_APPROVED_AMOUNT_REQUIRED"
  )
  if (approvedAmountPhp > input.requestedAmountPhp) {
    throw new Error("PETTY_CASH_REQUEST_APPROVAL_EXCEEDS_REQUEST")
  }
  return approvedAmountPhp
}

export async function validatePettyCashApprovalInTransaction(
  tx: TransactionClient,
  session: SessionContext,
  input: Pick<PettyCashRequestActionInput, "pettyCashRequestId" | "approvedAmountPhp">
) {
  const request = await getScopedRequestOrThrow(
    tx,
    session,
    input.pettyCashRequestId
  )
  assertRequestTransition({ transition: "approve", status: request.status })
  if (request.requestedByUserId === session.user.id) {
    throw new Error("PETTY_CASH_REQUEST_SELF_APPROVAL_BLOCKED")
  }
  return {
    request,
    approvedAmountPhp: validatePettyCashApprovedAmount({
      approvedAmountPhp: input.approvedAmountPhp,
      requestedAmountPhp: decimalToNumber(request.requestedAmountPhp),
      currentProposedAmountPhp:
        request.currentProposedAmountPhp === null
          ? undefined
          : decimalToNumber(request.currentProposedAmountPhp)
    })
  }
}

export async function approvePettyCashRequestInTransaction(
  tx: TransactionClient,
  session: SessionContext,
  input: PettyCashRequestActionInput & {
    approvalInstanceId?: string
    supplementalEvidenceReference?: string
  }
) {
  const request = await getScopedRequestOrThrow(
    tx,
    session,
    input.pettyCashRequestId
  )
  if (request.status === "APPROVED") {
    return request
  }
  const { approvedAmountPhp } = await validatePettyCashApprovalInTransaction(
    tx,
    session,
    input
  )
  const evidenceReference = request.evidenceReference
  const supplementalEvidenceReference =
    input.supplementalEvidenceReference?.trim() || null
  assertAuthoritativeApprovalEvidence(
    evidenceReference,
    "PETTY_CASH_REQUEST_EVIDENCE_REQUIRED"
  )
  const sourceUpdate = await tx.pettyCashRequest.updateMany({
    where: {
      id: request.id,
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      status: "AWAITING_APPROVAL",
      ...(input.approvalInstanceId
        ? { approvalInstanceId: input.approvalInstanceId }
        : {})
    },
    data: {
      status: "APPROVED",
      approvedByUserId: session.user.id,
      approvedAt: new Date(),
      approvedAmountPhp,
      currentProposedAmountPhp: null,
      evidenceReference
    }
  })
  if (sourceUpdate.count !== 1) {
    throw new Error("PETTY_CASH_REQUEST_NOT_AWAITING_APPROVAL")
  }
  const updated = await getScopedRequestOrThrow(tx, session, request.id)
  await writePettyCashAudit(tx, {
    session,
    entityType: "PettyCashRequest",
    entityId: request.id,
    eventType: "petty_cash.request_approved",
    beforeStatus: request.status,
    afterStatus: updated.status,
    reason: input.reason?.trim() ?? null,
    evidenceReference: updated.evidenceReference,
    metadata: {
      approvalInstanceId: input.approvalInstanceId ?? null,
      approvedAmountPhp,
      idempotencyKey: input.idempotencyKey ?? null,
      supplementalEvidenceReference
    }
  })
  return updated
}

export function buildPettyCashFundRows(
  funds: Array<{
    id: string
    publicReference: string
    code: string
    name: string
    status: string
    currentBalancePhp: DecimalLike | number
    targetBalancePhp: DecimalLike | number
    lowBalanceAlertPhp: DecimalLike | number
    evidenceReference: string | null
    location: { name: string }
    custodian: { displayName: string }
    requests: Array<{ id: string; status: string }>
    liquidations: Array<{ id: string; status: string }>
    ledgerEntries: Array<{ id: string }>
  }>
) {
  return funds.map((fund) => {
    const currentBalancePhp = decimalToNumber(fund.currentBalancePhp)
    const targetBalancePhp = decimalToNumber(fund.targetBalancePhp)
    const lowBalanceAlertPhp = decimalToNumber(fund.lowBalanceAlertPhp)

    return {
      id: fund.id,
      publicReference: fund.publicReference,
      code: fund.code,
      name: fund.name,
      status: fund.status,
      locationName: fund.location.name,
      custodianName: fund.custodian.displayName,
      currentBalancePhp,
      targetBalancePhp,
      lowBalanceAlertPhp,
      availableToTargetPhp: Math.max(targetBalancePhp - currentBalancePhp, 0),
      requestCount: fund.requests.length,
      openRequestCount: fund.requests.filter((request) =>
        openRequestStatuses.has(request.status)
      ).length,
      liquidationCount: fund.liquidations.length,
      openLiquidationCount: fund.liquidations.filter((liquidation) =>
        openLiquidationStatuses.has(liquidation.status)
      ).length,
      ledgerEntryCount: fund.ledgerEntries.length,
      evidenceReference: fund.evidenceReference
    }
  })
}

export function buildPettyCashReportRows(
  rows: PettyCashFundRow[]
): PettyCashReportRow[] {
  return rows.map((fund) => {
    const balanceState =
      fund.status !== "ACTIVE"
        ? "INACTIVE"
        : fund.currentBalancePhp <= fund.lowBalanceAlertPhp
          ? "LOW_BALANCE"
          : "HEALTHY"
    const evidenceReadiness = resolveEvidenceReadiness({
      evidenceReference: fund.evidenceReference
    })
    return {
      id: fund.id,
      publicReference: fund.publicReference,
      code: fund.code,
      name: fund.name,
      status: fund.status,
      locationName: fund.locationName,
      custodianName: fund.custodianName,
      balanceState,
      currentBalancePhp: fund.currentBalancePhp,
      targetBalancePhp: fund.targetBalancePhp,
      availableToTargetPhp: fund.availableToTargetPhp,
      openRequestCount: fund.openRequestCount,
      openLiquidationCount: fund.openLiquidationCount,
      ledgerEntryCount: fund.ledgerEntryCount,
      evidenceState: evidenceReadiness.evidenceState,
      evidenceCaptureMode: evidenceReadiness.evidenceCaptureMode,
      evidenceProductionReadiness:
        evidenceReadiness.evidenceProductionReadiness,
      evidenceBlockerId: evidenceReadiness.evidenceBlockerId,
      exportSafeSummary: [
        fund.publicReference,
        fund.status,
        fund.locationName,
        fund.custodianName,
        balanceState,
        evidenceReadiness.evidenceState,
        evidenceReadiness.evidenceCaptureMode,
        `${fund.openRequestCount} open request(s)`,
        `${fund.openLiquidationCount} open liquidation(s)`
      ].join(" / ")
    }
  })
}

const pettyCashExceptionPriority = {
  HIGH: 0,
  MEDIUM: 1,
  LOW: 2
} as const

export function buildPettyCashExceptionRows(
  reportRows: PettyCashReportRow[]
): PettyCashExceptionRow[] {
  const exceptionRows = reportRows.flatMap((fund) => {
    const rows: PettyCashExceptionRow[] = []
    if (fund.balanceState === "LOW_BALANCE") {
      rows.push({
        id: `${fund.id}:low-balance`,
        fundId: fund.id,
        fundName: fund.name,
        publicReference: fund.publicReference,
        locationName: fund.locationName,
        custodianName: fund.custodianName,
        severity: "HIGH",
        issueType: "LOW_BALANCE",
        issueLabel: "Fund below low-balance alert",
        amountPhp: fund.availableToTargetPhp,
        count: null,
        nextAction:
          "Review open cycles, then create or approve a replenishment request if still needed.",
        blockerId: null
      })
    }
    if (fund.openRequestCount > 0) {
      rows.push({
        id: `${fund.id}:open-requests`,
        fundId: fund.id,
        fundName: fund.name,
        publicReference: fund.publicReference,
        locationName: fund.locationName,
        custodianName: fund.custodianName,
        severity: "MEDIUM",
        issueType: "OPEN_REQUESTS",
        issueLabel: "Open petty cash request cycle",
        amountPhp: null,
        count: fund.openRequestCount,
        nextAction:
          "Use Petty Cash Request Actions to submit, approve, fulfill, void, or close the request.",
        blockerId: null
      })
    }
    if (fund.openLiquidationCount > 0) {
      rows.push({
        id: `${fund.id}:open-liquidations`,
        fundId: fund.id,
        fundName: fund.name,
        publicReference: fund.publicReference,
        locationName: fund.locationName,
        custodianName: fund.custodianName,
        severity: "HIGH",
        issueType: "OPEN_LIQUIDATIONS",
        issueLabel: "Open liquidation requiring review",
        amountPhp: null,
        count: fund.openLiquidationCount,
        nextAction:
          "Review receipt evidence, capture shortage or overage if applicable, then close the liquidation.",
        blockerId: null
      })
    }
    if (fund.evidenceState === "MISSING") {
      rows.push({
        id: `${fund.id}:missing-evidence`,
        fundId: fund.id,
        fundName: fund.name,
        publicReference: fund.publicReference,
        locationName: fund.locationName,
        custodianName: fund.custodianName,
        severity: "LOW",
        issueType: "MISSING_EVIDENCE",
        issueLabel: "Evidence reference incomplete",
        amountPhp: null,
        count: null,
        nextAction:
          "Upload petty-cash evidence or link approved metadata; production retention and scan/waiver signoff remain for UAT.",
        blockerId: fund.evidenceBlockerId
      })
    }
    return rows
  })

  return exceptionRows.sort((left, right) => {
    const priorityDelta =
      pettyCashExceptionPriority[left.severity] -
      pettyCashExceptionPriority[right.severity]
    if (priorityDelta !== 0) {
      return priorityDelta
    }
    return left.fundName.localeCompare(right.fundName)
  })
}

export async function createPettyCashFund(
  session: SessionContext,
  input: CreatePettyCashFundInput
) {
  await requirePermission(session, permissions.financePettyCashCreate)
  const code = input.code.trim().toUpperCase()
  const name = input.name.trim()
  const evidenceReference = input.evidenceReference.trim()
  const notes = input.notes?.trim() || null
  const openingBalancePhp = roundMoney(Number(input.openingBalancePhp))
  const targetBalancePhp = roundMoney(Number(input.targetBalancePhp))
  const lowBalanceAlertPhp = roundMoney(Number(input.lowBalanceAlertPhp))
  const idempotencyKey = input.idempotencyKey?.trim() || null

  if (!code) {
    throw new Error("PETTY_CASH_FUND_CODE_REQUIRED")
  }
  if (!name) {
    throw new Error("PETTY_CASH_FUND_NAME_REQUIRED")
  }
  if (!input.locationId) {
    throw new Error("PETTY_CASH_FUND_LOCATION_REQUIRED")
  }
  if (!input.custodianUserId) {
    throw new Error("PETTY_CASH_FUND_CUSTODIAN_REQUIRED")
  }
  if (!evidenceReference) {
    throw new Error("PETTY_CASH_FUND_EVIDENCE_REQUIRED")
  }
  if (openingBalancePhp < 0 || targetBalancePhp < 0 || lowBalanceAlertPhp < 0) {
    throw new Error("PETTY_CASH_FUND_AMOUNT_INVALID")
  }
  if (lowBalanceAlertPhp > targetBalancePhp) {
    throw new Error("PETTY_CASH_FUND_LOW_ALERT_ABOVE_TARGET")
  }

  const authorizedLocationIds = session.authorizedLocations.map(
    (location) => location.locationId
  )
  if (!authorizedLocationIds.includes(input.locationId)) {
    throw new Error("SCOPE_DENIED")
  }

  return prisma.$transaction(async (tx) => {
    if (idempotencyKey) {
      const existing = await tx.pettyCashFund.findUnique({
        where: {
          tenantId_companyId_idempotencyKey: {
            tenantId: session.context.tenantId,
            companyId: session.context.companyId,
            idempotencyKey
          }
        },
        include: { ledgerEntries: true }
      })
      if (existing) {
        if (!authorizedLocationIds.includes(existing.locationId)) {
          throw new Error("SCOPE_DENIED")
        }
        return existing
      }
    }

    const [location, custodian, duplicateCode] = await Promise.all([
      tx.location.findFirst({
        where: {
          id: input.locationId,
          tenantId: session.context.tenantId,
          companyId: session.context.companyId,
          status: "ACTIVE"
        },
        select: { id: true, brandId: true }
      }),
      tx.user.findFirst({
        where: {
          id: input.custodianUserId,
          tenantId: session.context.tenantId,
          status: "ACTIVE",
          scopeAssignments: {
            some: {
              scopeType: "LOCATION",
              scopeId: input.locationId,
              status: "ACTIVE"
            }
          }
        },
        select: { id: true, displayName: true }
      }),
      tx.pettyCashFund.findUnique({
        where: {
          companyId_code: {
            companyId: session.context.companyId,
            code
          }
        },
        select: { id: true }
      })
    ])

    if (!location) {
      throw new Error("PETTY_CASH_FUND_LOCATION_NOT_FOUND")
    }
    if (!custodian) {
      throw new Error("PETTY_CASH_FUND_CUSTODIAN_NOT_SCOPED")
    }
    if (duplicateCode) {
      throw new Error("PETTY_CASH_FUND_CODE_ALREADY_EXISTS")
    }

    const publicReference = await nextPettyCashFundReference(
      tx,
      session.context.companyId
    )
    const fund = await tx.pettyCashFund.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        publicReference,
        code,
        name,
        currencyCode: "PHP",
        openingBalancePhp,
        currentBalancePhp: openingBalancePhp,
        targetBalancePhp,
        lowBalanceAlertPhp,
        status: "DRAFT",
        brandId: location.brandId ?? null,
        locationId: location.id,
        custodianUserId: custodian.id,
        createdByUserId: session.user.id,
        evidenceReference,
        notes,
        idempotencyKey
      },
      include: { ledgerEntries: true }
    })

    if (openingBalancePhp > 0) {
      await tx.pettyCashLedgerEntry.create({
        data: {
          tenantId: session.context.tenantId,
          companyId: session.context.companyId,
          pettyCashFundId: fund.id,
          locationId: fund.locationId,
          entryType: "OPENING",
          direction: 1,
          amountPhp: openingBalancePhp,
          balanceBeforePhp: 0,
          balanceAfterPhp: openingBalancePhp,
          currencyCode: "PHP",
          postedAt: new Date(),
          postedByUserId: session.user.id,
          reason: notes ?? "Opening petty cash fund baseline",
          sourceEventKey: `petty-cash-fund:${fund.id}:opening`,
          idempotencyKey: idempotencyKey ? `${idempotencyKey}:opening` : null,
          notes:
            "Opening balance marker only; no bank, payment, or journal posting."
        }
      })
    }

    await writePettyCashAudit(tx, {
      session,
      entityType: "PettyCashFund",
      entityId: fund.id,
      eventType: "petty_cash.fund_created",
      beforeStatus: "NONE",
      afterStatus: fund.status,
      reason: notes,
      evidenceReference,
      metadata: {
        publicReference,
        code,
        locationId: fund.locationId,
        custodianUserId: custodian.id,
        openingBalancePhp,
        targetBalancePhp,
        lowBalanceAlertPhp,
        openingLedgerMarkerCreated: openingBalancePhp > 0,
        noPaymentRequest: true,
        noPaymentRelease: true,
        noBankMutation: true,
        noJournalPosting: true,
        idempotencyKey
      }
    })

    return fund
  })
}

export async function activatePettyCashFund(
  session: SessionContext,
  input: PettyCashActionInput
) {
  await requirePermission(session, permissions.financePettyCashCreate)
  const reason = input.reason?.trim()
  const evidenceReference = input.evidenceReference?.trim()
  assertReason(reason, "PETTY_CASH_FUND_ACTIVATION_REASON_REQUIRED")
  assertEvidence(
    evidenceReference,
    "PETTY_CASH_FUND_ACTIVATION_EVIDENCE_REQUIRED"
  )

  return prisma.$transaction(async (tx) => {
    const fund = await getScopedFundOrThrow(tx, session, input.pettyCashFundId)
    if (fund.status === "ACTIVE") {
      return fund
    }
    assertFundTransition({ transition: "activate", status: fund.status })
    const updated = await tx.pettyCashFund.update({
      where: { id: fund.id },
      data: {
        status: "ACTIVE",
        activatedAt: new Date(),
        updatedByUserId: session.user.id,
        evidenceReference,
        notes: reason,
        version: { increment: 1 }
      }
    })
    await writePettyCashAudit(tx, {
      session,
      entityType: "PettyCashFund",
      entityId: fund.id,
      eventType: "petty_cash.fund_activated",
      beforeStatus: fund.status,
      afterStatus: updated.status,
      reason,
      evidenceReference,
      metadata: {
        idempotencyKey: input.idempotencyKey ?? null
      }
    })
    return updated
  })
}

export type CreatePettyCashRequestInput = {
  pettyCashFundId: string
  publicReference?: string
  requestType: "REPLENISHMENT" | "DISBURSEMENT"
  requestedAmountPhp: number
  purpose: string
  justification: string
  dueBy?: Date
  evidenceReference?: string
  sourceDocumentType?: string
  sourceDocumentId?: string
  sourceEventKey?: string
  idempotencyKey?: string
}

export async function createPettyCashRequest(
  session: SessionContext,
  input: CreatePettyCashRequestInput
) {
  await requirePermission(session, permissions.financePettyCashCreate)
  assertPositiveAmount(
    input.requestedAmountPhp,
    "PETTY_CASH_REQUEST_AMOUNT_REQUIRED"
  )
  if (!input.purpose.trim()) {
    throw new Error("PETTY_CASH_REQUEST_PURPOSE_REQUIRED")
  }
  if (!input.justification.trim()) {
    throw new Error("PETTY_CASH_REQUEST_JUSTIFICATION_REQUIRED")
  }

  return prisma.$transaction(async (tx) => {
    const fund = await getScopedFundOrThrow(tx, session, input.pettyCashFundId)
    if (fund.status !== "ACTIVE") {
      throw new Error("PETTY_CASH_FUND_NOT_ACTIVE")
    }
    if (input.idempotencyKey) {
      const existing = await tx.pettyCashRequest.findFirst({
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
      (await nextPettyCashRequestReference(tx, session.context.companyId))
    const request = await tx.pettyCashRequest.create({
      data: {
        tenantId: fund.tenantId,
        companyId: fund.companyId,
        pettyCashFundId: fund.id,
        locationId: fund.locationId,
        publicReference,
        requestType: input.requestType,
        requestedAmountPhp: input.requestedAmountPhp,
        purpose: input.purpose.trim(),
        justification: input.justification.trim(),
        dueBy: input.dueBy ?? null,
        requestedByUserId: session.user.id,
        evidenceReference: input.evidenceReference?.trim() ?? null,
        sourceDocumentType: input.sourceDocumentType?.trim() ?? null,
        sourceDocumentId: input.sourceDocumentId?.trim() ?? null,
        sourceEventKey: input.sourceEventKey?.trim() ?? null,
        idempotencyKey: input.idempotencyKey ?? null
      }
    })
    await writePettyCashAudit(tx, {
      session,
      entityType: "PettyCashRequest",
      entityId: request.id,
      eventType: "petty_cash.request_created",
      beforeStatus: "NEW",
      afterStatus: request.status,
      evidenceReference: request.evidenceReference,
      metadata: {
        requestType: request.requestType,
        requestedAmountPhp: input.requestedAmountPhp,
        idempotencyKey: input.idempotencyKey ?? null
      }
    })
    return request
  })
}

export async function submitPettyCashRequest(
  session: SessionContext,
  input: PettyCashRequestActionInput
) {
  await requirePermission(session, permissions.financePettyCashSubmit)
  const evidenceReference = input.evidenceReference?.trim()
  return prisma.$transaction(async (tx) => {
    const request = await getScopedRequestOrThrow(
      tx,
      session,
      input.pettyCashRequestId
    )
    const existingApproval = await tx.approvalInstance.findFirst({
      where: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        documentType: "PettyCashRequest",
        documentId: request.id,
        status: "PENDING"
      }
    })
    if (request.status === "AWAITING_APPROVAL" && existingApproval) {
      return request
    }
    if (request.status !== "AWAITING_APPROVAL") {
      assertRequestTransition({ transition: "submit", status: request.status })
    }
    assertEvidence(
      evidenceReference ?? request.evidenceReference,
      "PETTY_CASH_REQUEST_EVIDENCE_REQUIRED"
    )
    assertPositiveAmount(
      decimalToNumber(request.requestedAmountPhp),
      "PETTY_CASH_REQUEST_AMOUNT_REQUIRED"
    )
    const approvalRule = await findPettyCashApprovalRule(tx, session)
    if (!approvalRule || approvalRule.steps.length === 0) {
      throw new Error("PETTY_CASH_APPROVAL_RULE_NOT_CONFIGURED")
    }
    const firstStep = approvalRule.steps[0]
    if (!firstStep) {
      throw new Error("PETTY_CASH_APPROVAL_RULE_STEP_NOT_CONFIGURED")
    }
    if (existingApproval) {
      throw new Error("PETTY_CASH_ALREADY_SUBMITTED")
    }

    if (!request.fund.locationId) {
      throw new Error("PETTY_CASH_APPROVAL_SCOPE_NOT_CONFIGURED")
    }
    const routedSteps = approvalRule.steps.map((step, index) => ({
      ...step,
      approvalInstanceStepId: randomUUID(),
      activationStatus: index === 0 ? "PENDING" as const : "WAITING" as const
    }))
    const firstRoutedStep = routedSteps[0]
    if (!firstRoutedStep) {
      throw new Error("PETTY_CASH_APPROVAL_RULE_STEP_NOT_CONFIGURED")
    }
    const approvalInstance = await tx.approvalInstance.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        documentType: "PettyCashRequest",
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
    for (const step of routedSteps) {
      await configureApprovalStepRouting(tx, {
        approvalInstanceStepId: step.approvalInstanceStepId,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        routingPolicy: getApprovalRoutingPolicy("PettyCashRequest"),
        requiredPermissionCode: permissions.financePettyCashApprove,
        dueAt: request.dueBy ?? null,
        activationAudit: {
          actorUserId: session.user.id,
          source: "petty_cash_request.submit"
        },
        scopeGroups: [{
          groupOrder: 1,
          targetMatchMode: "ANY",
          targets: [{
            scopeType: "LOCATION",
            companyId: session.context.companyId,
            locationId: request.fund.locationId
          }]
        }],
        prohibitedActors: [{
          userId: request.requestedByUserId,
          reasonCode: "REQUESTER"
        }]
      })
    }
    await assertAnyEligibleApprovalActorForStep(tx, {
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      approvalInstanceStepId: firstRoutedStep.approvalInstanceStepId
    })

    const updated = await tx.pettyCashRequest.update({
      where: { id: request.id },
      data: {
        status: "AWAITING_APPROVAL",
        approvalInstanceId: approvalInstance.id,
        currentProposedAmountPhp: request.requestedAmountPhp,
        approvalProposalVersion: 1,
        submittedByUserId: session.user.id,
        submittedAt: new Date(),
        evidenceReference: evidenceReference ?? request.evidenceReference
      }
    })
    const auditEvent = await writePettyCashAudit(tx, {
      session,
      entityType: "PettyCashRequest",
      entityId: request.id,
      eventType: "petty_cash.request_submitted",
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
      locationId: request.fund.locationId,
      recipientUserIds: [firstStep.userId],
      notificationType: "APPROVE_PETTY_CASH",
      priority: request.requestType === "REPLENISHMENT" ? "NORMAL" : "HIGH",
      title: `Approve Petty Cash ${request.publicReference}`,
      body: `${session.user.displayName} submitted ${request.purpose} for approval.`,
      deepLink: `/approvals/${approvalInstance.id}`,
      entityType: "PettyCashRequest",
      entityId: request.id,
      sourceEventKey: auditEvent.id,
      recipientBasis: firstStep.userId ? "assigned_user" : "assigned_role",
      metadata: {
        approvalInstanceId: approvalInstance.id,
        approvalStepOrder: firstStep.stepOrder,
        publicReference: request.publicReference,
        requestType: request.requestType,
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

export async function approvePettyCashRequest(
  session: SessionContext,
  input: PettyCashRequestActionInput
) {
  await requirePermission(session, permissions.financePettyCashApprove)
  assertLegacyApprovalDecisionAllowed()
  return prisma.$transaction((tx) =>
    approvePettyCashRequestInTransaction(tx, session, input)
  )
}

export async function returnPettyCashRequestForRevision(
  session: SessionContext,
  input: PettyCashRequestActionInput
) {
  await requirePermission(session, permissions.financePettyCashApprove)
  assertLegacyApprovalDecisionAllowed()
  const reason = input.reason?.trim()
  assertReason(reason, "PETTY_CASH_REQUEST_RETURN_REASON_REQUIRED")
  return prisma.$transaction(async (tx) => {
    const request = await getScopedRequestOrThrow(
      tx,
      session,
      input.pettyCashRequestId
    )
    assertRequestTransition({ transition: "return", status: request.status })
    const updated = await tx.pettyCashRequest.update({
      where: { id: request.id },
      data: {
        status: "RETURNED_FOR_REVISION",
        currentProposedAmountPhp: null,
        returnedByUserId: session.user.id,
        returnedAt: new Date(),
        returnReason: reason
      }
    })
    await writePettyCashAudit(tx, {
      session,
      entityType: "PettyCashRequest",
      entityId: request.id,
      eventType: "petty_cash.request_returned",
      beforeStatus: request.status,
      afterStatus: updated.status,
      reason,
      evidenceReference: input.evidenceReference ?? request.evidenceReference
    })
    return updated
  })
}

export async function rejectPettyCashRequest(
  session: SessionContext,
  input: PettyCashRequestActionInput
) {
  await requirePermission(session, permissions.financePettyCashApprove)
  assertLegacyApprovalDecisionAllowed()
  const reason = input.reason?.trim()
  assertReason(reason, "PETTY_CASH_REQUEST_REJECTION_REASON_REQUIRED")
  return prisma.$transaction(async (tx) => {
    const request = await getScopedRequestOrThrow(
      tx,
      session,
      input.pettyCashRequestId
    )
    assertRequestTransition({ transition: "reject", status: request.status })
    const updated = await tx.pettyCashRequest.update({
      where: { id: request.id },
      data: {
        status: "REJECTED",
        currentProposedAmountPhp: null,
        rejectedByUserId: session.user.id,
        rejectedAt: new Date(),
        rejectionReason: reason
      }
    })
    await writePettyCashAudit(tx, {
      session,
      entityType: "PettyCashRequest",
      entityId: request.id,
      eventType: "petty_cash.request_rejected",
      beforeStatus: request.status,
      afterStatus: updated.status,
      reason,
      evidenceReference: input.evidenceReference ?? request.evidenceReference
    })
    return updated
  })
}

export async function cancelPettyCashRequest(
  session: SessionContext,
  input: PettyCashRequestActionInput
) {
  await requirePermission(session, permissions.financePettyCashSubmit)
  const reason = input.reason?.trim()
  assertReason(reason, "PETTY_CASH_REQUEST_CANCELLATION_REASON_REQUIRED")
  return prisma.$transaction(async (tx) => {
    const grantedPermissionCodes = await lockGrantedFinancePermissions(
      tx,
      session,
      [permissions.financePettyCashSubmit, permissions.financePettyCashApprove]
    )
    if (!grantedPermissionCodes.has(permissions.financePettyCashSubmit)) {
      throw new Error("PERMISSION_DENIED")
    }
    const request = await getScopedRequestOrThrow(
      tx,
      session,
      input.pettyCashRequestId
    )
    assertRequestTransition({ transition: "cancel", status: request.status })
    if (
      request.requestedByUserId !== session.user.id &&
      !grantedPermissionCodes.has(permissions.financePettyCashApprove)
    ) {
      throw new Error("PETTY_CASH_REQUEST_CANCEL_PERMISSION_DENIED")
    }
    if (request.ledgerEntries.length > 0) {
      throw new Error("PETTY_CASH_REQUEST_CANCEL_REQUIRES_REVERSAL")
    }
    const approvalTermination = await terminatePendingApprovalForCancellation(tx, {
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      documentType: "PettyCashRequest",
      documentId: request.id,
      policy: ["SUBMITTED", "AWAITING_APPROVAL"].includes(request.status) ? "APPROVAL_REQUIRED" : "APPROVAL_OPTIONAL"
    })
    const sourceUpdate = await tx.pettyCashRequest.updateMany({
      where: { id: request.id, tenantId: session.context.tenantId, companyId: session.context.companyId, status: request.status },
      data: {
        status: "CANCELLED",
        currentProposedAmountPhp: null,
        cancelledByUserId: session.user.id,
        cancelledAt: new Date(),
        cancellationReason: reason
      }
    })
    if (sourceUpdate.count !== 1) throw new Error("PETTY_CASH_REQUEST_CANCELLATION_CONFLICT")
    const updated = await tx.pettyCashRequest.findFirstOrThrow({
      where: {
        id: request.id,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId
      }
    })
    await writePettyCashAudit(tx, {
      session,
      entityType: "PettyCashRequest",
      entityId: request.id,
      eventType: "petty_cash.request_cancelled",
      beforeStatus: request.status,
      afterStatus: updated.status,
      reason,
      evidenceReference: input.evidenceReference ?? request.evidenceReference,
      metadata: { approvalTerminationMode: approvalTermination.mode, approvalInstanceId: approvalTermination.approvalInstanceId }
    })
    return updated
  })
}

export async function createPettyCashDisbursementHandoff(
  session: SessionContext,
  input: PettyCashDisbursementHandoffInput
) {
  await requirePermission(session, permissions.financeDisbursementCreate)
  const reason = input.reason?.trim()
  assertReason(reason, "PETTY_CASH_DISBURSEMENT_HANDOFF_REASON_REQUIRED")

  return prisma.$transaction(async (tx) => {
    const request = await getScopedRequestOrThrow(
      tx,
      session,
      input.pettyCashRequestId
    )
    assertRequestTransition({
      transition: "create_handoff",
      status: request.status
    })

    const sourceEventKey = `petty-cash-request:${request.id}:non-supplier-disbursement`
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

    const amountPhp = decimalToNumber(request.approvedAmountPhp)
    assertPositiveAmount(amountPhp, "PETTY_CASH_DISBURSEMENT_AMOUNT_REQUIRED")

    const payee = await tx.financePayee.upsert({
      where: {
        tenantId_companyId_payeeType_userId: {
          tenantId: session.context.tenantId,
          companyId: session.context.companyId,
          payeeType: "USER_CUSTODIAN",
          userId: request.fund.custodianUserId
        }
      },
      create: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        payeeType: "USER_CUSTODIAN",
        status: "ACTIVE",
        displayName: request.fund.custodian.displayName,
        userId: request.fund.custodianUserId,
        paymentReferenceLabel:
          input.paymentReferenceLabel?.trim() ||
          `Petty cash ${request.requestType.toLowerCase().replaceAll("_", " ")}`,
        evidenceReference:
          input.evidenceReference?.trim() ?? request.evidenceReference,
        createdByUserId: session.user.id
      },
      update: {
        status: "ACTIVE",
        displayName: request.fund.custodian.displayName,
        paymentReferenceLabel:
          input.paymentReferenceLabel?.trim() ||
          `Petty cash ${request.requestType.toLowerCase().replaceAll("_", " ")}`,
        evidenceReference:
          input.evidenceReference?.trim() ?? request.evidenceReference
      }
    })

    const publicReference = await nextDisbursementRequestReference(
      tx,
      session.context.companyId
    )
    const created = await tx.nonSupplierDisbursementRequest.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        locationId: request.fund.locationId,
        payeeId: payee.id,
        pettyCashRequestId: request.id,
        publicReference,
        currencyCode: "PHP",
        amountPhp,
        status: "DRAFT",
        sourceType: "PETTY_CASH",
        sourceEventKey,
        requestReason: reason,
        evidenceReference:
          input.evidenceReference?.trim() ?? request.evidenceReference,
        idempotencyKey: input.idempotencyKey ?? sourceEventKey,
        requestedByUserId: session.user.id
      }
    })

    await writePettyCashAudit(tx, {
      session,
      entityType: "NonSupplierDisbursementRequest",
      entityId: created.id,
      eventType: "petty_cash.disbursement_handoff_created",
      beforeStatus: "NEW",
      afterStatus: created.status,
      reason,
      evidenceReference: created.evidenceReference,
      metadata: {
        pettyCashRequestId: request.id,
        pettyCashRequestReference: request.publicReference,
        pettyCashRequestType: request.requestType,
        pettyCashFundId: request.pettyCashFundId,
        pettyCashFundReference: request.fund.publicReference,
        payeeId: payee.id,
        payeeType: payee.payeeType,
        sourceEventKey,
        idempotencyKey: input.idempotencyKey ?? null,
        nonSupplierDisbursementRequestCreated: true,
        noSupplierApPaymentRequest: true,
        noPaymentRelease: true,
        noBankMutation: true,
        noJournalPosting: true,
        noApSettlement: true,
        noPettyCashLedgerMutation: true
      }
    })
    return created
  })
}

export async function fulfillPettyCashRequestOffline(
  session: SessionContext,
  input: PettyCashFulfillmentInput
) {
  await requirePermission(session, permissions.financePettyCashReplenish)
  const reason = input.reason?.trim()
  const evidenceReference = input.evidenceReference?.trim()
  assertReason(reason, "PETTY_CASH_FULFILLMENT_REASON_REQUIRED")
  assertEvidence(evidenceReference, "PETTY_CASH_FULFILLMENT_EVIDENCE_REQUIRED")
  assertPositiveAmount(
    input.amountPhp,
    "PETTY_CASH_FULFILLMENT_AMOUNT_REQUIRED"
  )

  return prisma.$transaction(async (tx) => {
    const request = await getScopedRequestOrThrow(
      tx,
      session,
      input.pettyCashRequestId
    )
    assertRequestTransition({ transition: "fulfill", status: request.status })
    if (request.approvedByUserId === session.user.id) {
      throw new Error("PETTY_CASH_FULFILLER_APPROVER_SEGREGATION_REQUIRED")
    }
    const approvedAmountPhp = decimalToNumber(request.approvedAmountPhp)
    if (input.amountPhp > approvedAmountPhp) {
      throw new Error("PETTY_CASH_FULFILLMENT_EXCEEDS_APPROVED_AMOUNT")
    }
    const sourceEventKey =
      input.idempotencyKey ??
      `petty-cash:${request.id}:fulfill:${input.referenceNo ?? "manual"}`
    const existingLedger = await tx.pettyCashLedgerEntry.findFirst({
      where: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        sourceEventKey
      }
    })
    if (existingLedger) {
      return request
    }

    const balanceBeforePhp = decimalToNumber(request.fund.currentBalancePhp)
    const isReplenishment = request.requestType === "REPLENISHMENT"
    const direction = isReplenishment ? 1 : -1
    const balanceAfterPhp = balanceBeforePhp + direction * input.amountPhp
    if (balanceAfterPhp < -0.009) {
      throw new Error("PETTY_CASH_FULFILLMENT_INSUFFICIENT_FUND_BALANCE")
    }

    await tx.pettyCashLedgerEntry.create({
      data: {
        tenantId: request.tenantId,
        companyId: request.companyId,
        pettyCashFundId: request.pettyCashFundId,
        pettyCashRequestId: request.id,
        locationId: request.fund.locationId,
        entryType: isReplenishment ? "REPLENISHMENT" : "ISSUE",
        direction,
        amountPhp: input.amountPhp,
        balanceBeforePhp,
        balanceAfterPhp,
        postedAt: new Date(),
        postedByUserId: session.user.id,
        reason,
        sourceEventKey,
        idempotencyKey: input.idempotencyKey ?? null,
        notes: input.referenceNo?.trim() ?? null
      }
    })
    await tx.pettyCashFund.update({
      where: { id: request.pettyCashFundId },
      data: {
        currentBalancePhp: balanceAfterPhp,
        updatedByUserId: session.user.id,
        evidenceReference,
        version: { increment: 1 }
      }
    })
    const updated = await tx.pettyCashRequest.update({
      where: { id: request.id },
      data: {
        status: "FULFILLED_OFFLINE",
        evidenceReference,
        metadata: {
          fulfilledOffline: true,
          noPaymentRelease: true,
          noBankMutation: true,
          noJournalPosting: true,
          sourceEventKey
        }
      }
    })
    await writePettyCashAudit(tx, {
      session,
      entityType: "PettyCashRequest",
      entityId: request.id,
      eventType: "petty_cash.request_fulfilled_offline",
      beforeStatus: request.status,
      afterStatus: updated.status,
      reason,
      evidenceReference,
      metadata: {
        entryType: isReplenishment ? "REPLENISHMENT" : "ISSUE",
        amountPhp: input.amountPhp,
        balanceBeforePhp,
        balanceAfterPhp,
        sourceEventKey
      }
    })
    return updated
  })
}

export async function voidPettyCashFulfillment(
  session: SessionContext,
  input: PettyCashRequestActionInput
) {
  await requirePermission(session, permissions.financePettyCashApprove)
  const reason = input.reason?.trim()
  const evidenceReference = input.evidenceReference?.trim()
  assertReason(reason, "PETTY_CASH_VOID_REASON_REQUIRED")
  assertEvidence(evidenceReference, "PETTY_CASH_VOID_EVIDENCE_REQUIRED")

  return prisma.$transaction(async (tx) => {
    const request = await getScopedRequestOrThrow(
      tx,
      session,
      input.pettyCashRequestId
    )
    if (request.status === "VOIDED") {
      return request
    }
    assertRequestTransition({ transition: "void", status: request.status })
    const originalLedger = request.ledgerEntries.find(
      (entry) =>
        ["REPLENISHMENT", "ISSUE"].includes(entry.entryType) && !entry.voidedAt
    )
    if (!originalLedger) {
      throw new Error("PETTY_CASH_FULFILLMENT_LEDGER_NOT_FOUND")
    }
    const reversalEventKey =
      input.idempotencyKey ??
      `petty-cash:${request.id}:void:${originalLedger.id}`
    const existingReversal = await tx.pettyCashLedgerEntry.findFirst({
      where: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        sourceEventKey: reversalEventKey
      }
    })
    if (existingReversal) {
      return request
    }

    const balanceBeforePhp = decimalToNumber(request.fund.currentBalancePhp)
    const originalDirection = originalLedger.direction
    const originalAmountPhp = decimalToNumber(originalLedger.amountPhp)
    const reversalDirection = originalDirection * -1
    const balanceAfterPhp =
      balanceBeforePhp + reversalDirection * originalAmountPhp
    if (balanceAfterPhp < -0.009) {
      throw new Error("PETTY_CASH_VOID_INSUFFICIENT_FUND_BALANCE")
    }

    await tx.pettyCashLedgerEntry.update({
      where: { id: originalLedger.id },
      data: {
        voidedByUserId: session.user.id,
        voidedAt: new Date(),
        notes: [originalLedger.notes, `Voided: ${reason}`]
          .filter(Boolean)
          .join(" / ")
      }
    })
    const reversalLedger = await tx.pettyCashLedgerEntry.create({
      data: {
        tenantId: request.tenantId,
        companyId: request.companyId,
        pettyCashFundId: request.pettyCashFundId,
        pettyCashRequestId: request.id,
        locationId: request.fund.locationId,
        entryType: "REVERSAL",
        direction: reversalDirection,
        amountPhp: originalAmountPhp,
        balanceBeforePhp,
        balanceAfterPhp,
        postedAt: new Date(),
        postedByUserId: session.user.id,
        reason,
        sourceEventKey: reversalEventKey,
        idempotencyKey: input.idempotencyKey ?? null,
        notes: `Reverses petty cash ledger entry ${originalLedger.id}; no bank, payment, or journal posting.`
      }
    })
    await tx.pettyCashFund.update({
      where: { id: request.pettyCashFundId },
      data: {
        currentBalancePhp: balanceAfterPhp,
        updatedByUserId: session.user.id,
        evidenceReference,
        version: { increment: 1 }
      }
    })
    const updated = await tx.pettyCashRequest.update({
      where: { id: request.id },
      data: {
        status: "VOIDED",
        cancelledByUserId: session.user.id,
        cancelledAt: new Date(),
        cancellationReason: reason,
        evidenceReference,
        metadata: {
          voidedFulfillment: true,
          originalLedgerEntryId: originalLedger.id,
          reversalLedgerEntryId: reversalLedger.id,
          noPaymentRelease: true,
          noBankMutation: true,
          noJournalPosting: true
        }
      }
    })
    await writePettyCashAudit(tx, {
      session,
      entityType: "PettyCashRequest",
      entityId: request.id,
      eventType: "petty_cash.request_fulfillment_voided",
      beforeStatus: request.status,
      afterStatus: updated.status,
      reason,
      evidenceReference,
      metadata: {
        originalLedgerEntryId: originalLedger.id,
        reversalLedgerEntryId: reversalLedger.id,
        reversalDirection,
        amountPhp: originalAmountPhp,
        balanceBeforePhp,
        balanceAfterPhp,
        noPaymentRelease: true,
        noBankMutation: true,
        noJournalPosting: true
      }
    })
    return updated
  })
}

export async function closePettyCashRequest(
  session: SessionContext,
  input: PettyCashRequestActionInput
) {
  await requirePermission(session, permissions.financePettyCashApprove)
  const reason = input.reason?.trim()
  assertReason(reason, "PETTY_CASH_REQUEST_CLOSE_REASON_REQUIRED")
  return prisma.$transaction(async (tx) => {
    const request = await getScopedRequestOrThrow(
      tx,
      session,
      input.pettyCashRequestId
    )
    assertRequestTransition({ transition: "close", status: request.status })
    const updated = await tx.pettyCashRequest.update({
      where: { id: request.id },
      data: {
        status: "CLOSED",
        closedByUserId: session.user.id,
        closedAt: new Date(),
        closureNotes: reason
      }
    })
    await writePettyCashAudit(tx, {
      session,
      entityType: "PettyCashRequest",
      entityId: request.id,
      eventType: "petty_cash.request_closed",
      beforeStatus: request.status,
      afterStatus: updated.status,
      reason,
      evidenceReference: input.evidenceReference ?? request.evidenceReference
    })
    return updated
  })
}

export async function submitPettyCashLiquidation(
  session: SessionContext,
  input: SubmitPettyCashLiquidationInput
) {
  await requirePermission(session, permissions.financePettyCashLiquidate)
  assertEvidence(
    input.evidenceReference,
    "PETTY_CASH_LIQUIDATION_EVIDENCE_REQUIRED"
  )
  if (input.cycleEnd.getTime() < input.cycleStart.getTime()) {
    throw new Error("PETTY_CASH_LIQUIDATION_INVALID_CYCLE_DATES")
  }
  if (input.lines.length === 0) {
    throw new Error("PETTY_CASH_LIQUIDATION_LINES_REQUIRED")
  }
  if (input.lines.length > 25) {
    throw new Error("PETTY_CASH_LIQUIDATION_LINE_LIMIT_EXCEEDED")
  }
  const claimedAmountPhp = input.lines.reduce((sum, line) => {
    assertPositiveAmount(
      line.amountPhp,
      "PETTY_CASH_LIQUIDATION_LINE_AMOUNT_REQUIRED"
    )
    if (!line.description.trim()) {
      throw new Error("PETTY_CASH_LIQUIDATION_LINE_DESCRIPTION_REQUIRED")
    }
    assertEvidence(
      line.evidenceReference ??
        line.receiptReference ??
        input.evidenceReference,
      "PETTY_CASH_LIQUIDATION_LINE_EVIDENCE_REQUIRED"
    )
    return sum + line.amountPhp
  }, 0)

  return prisma.$transaction(async (tx) => {
    const fund = await getScopedFundOrThrow(tx, session, input.pettyCashFundId)
    if (fund.status !== "ACTIVE") {
      throw new Error("PETTY_CASH_FUND_NOT_ACTIVE")
    }
    if (input.idempotencyKey) {
      const existing = await tx.pettyCashLiquidation.findFirst({
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
      (await nextPettyCashLiquidationReference(tx, session.context.companyId))
    const liquidation = await tx.pettyCashLiquidation.create({
      data: {
        tenantId: fund.tenantId,
        companyId: fund.companyId,
        pettyCashFundId: fund.id,
        locationId: fund.locationId,
        publicReference,
        cycleStart: input.cycleStart,
        cycleEnd: input.cycleEnd,
        claimedAmountPhp,
        status: "SUBMITTED",
        submittedByUserId: session.user.id,
        submittedAt: new Date(),
        evidenceReference: input.evidenceReference.trim(),
        idempotencyKey: input.idempotencyKey ?? null,
        lines: {
          create: input.lines.map((line, index) => ({
            tenantId: fund.tenantId,
            companyId: fund.companyId,
            pettyCashFundId: fund.id,
            locationId: fund.locationId,
            lineNumber: index + 1,
            spendDate: line.spendDate,
            categoryCode: line.categoryCode.trim(),
            description: line.description.trim(),
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
    await writePettyCashAudit(tx, {
      session,
      entityType: "PettyCashLiquidation",
      entityId: liquidation.id,
      eventType: "petty_cash.liquidation_submitted",
      beforeStatus: "DRAFT",
      afterStatus: liquidation.status,
      evidenceReference: liquidation.evidenceReference,
      metadata: {
        pettyCashFundId: fund.id,
        claimedAmountPhp,
        lineCount: input.lines.length,
        idempotencyKey: input.idempotencyKey ?? null
      }
    })
    return liquidation
  })
}

export async function approvePettyCashLiquidation(
  session: SessionContext,
  input: PettyCashLiquidationActionInput
) {
  await requirePermission(
    session,
    permissions.financePettyCashReviewLiquidation
  )
  const evidenceReference = input.evidenceReference?.trim()
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
    if (liquidation.submittedByUserId === session.user.id) {
      throw new Error("PETTY_CASH_LIQUIDATION_SELF_APPROVAL_BLOCKED")
    }
    assertEvidence(
      evidenceReference ?? liquidation.evidenceReference,
      "PETTY_CASH_LIQUIDATION_APPROVAL_EVIDENCE_REQUIRED"
    )
    const approvedAmountPhp =
      input.approvedAmountPhp ?? decimalToNumber(liquidation.claimedAmountPhp)
    assertPositiveAmount(
      approvedAmountPhp,
      "PETTY_CASH_LIQUIDATION_APPROVED_AMOUNT_REQUIRED"
    )
    if (approvedAmountPhp > decimalToNumber(liquidation.claimedAmountPhp)) {
      throw new Error("PETTY_CASH_LIQUIDATION_APPROVAL_EXCEEDS_CLAIM")
    }
    const shortageAmountPhp = input.shortageAmountPhp ?? 0
    const overageAmountPhp = input.overageAmountPhp ?? 0
    if (shortageAmountPhp < 0 || overageAmountPhp < 0) {
      throw new Error("PETTY_CASH_LIQUIDATION_VARIANCE_AMOUNT_INVALID")
    }
    if (shortageAmountPhp > 0 && overageAmountPhp > 0) {
      throw new Error("PETTY_CASH_LIQUIDATION_VARIANCE_CONFLICT")
    }
    if (shortageAmountPhp > 0 || overageAmountPhp > 0) {
      assertReason(
        input.reason?.trim(),
        "PETTY_CASH_LIQUIDATION_VARIANCE_REASON_REQUIRED"
      )
      assertEvidence(
        evidenceReference ?? liquidation.evidenceReference,
        "PETTY_CASH_LIQUIDATION_VARIANCE_EVIDENCE_REQUIRED"
      )
    }
    const sourceEventKey =
      input.idempotencyKey ??
      `petty-cash:${liquidation.pettyCashFundId}:liquidation:${liquidation.id}`
    const existingLedger = await tx.pettyCashLedgerEntry.findFirst({
      where: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        sourceEventKey
      }
    })
    if (existingLedger) {
      return liquidation
    }
    const balanceBeforePhp = decimalToNumber(liquidation.fund.currentBalancePhp)

    await tx.pettyCashLedgerEntry.create({
      data: {
        tenantId: liquidation.tenantId,
        companyId: liquidation.companyId,
        pettyCashFundId: liquidation.pettyCashFundId,
        liquidationId: liquidation.id,
        locationId: liquidation.fund.locationId,
        entryType: "LIQUIDATION_SETTLEMENT",
        direction: 0,
        amountPhp: approvedAmountPhp,
        balanceBeforePhp,
        balanceAfterPhp: balanceBeforePhp,
        postedAt: new Date(),
        postedByUserId: session.user.id,
        reason: input.reason?.trim() ?? "Petty cash liquidation approved",
        sourceEventKey,
        idempotencyKey: input.idempotencyKey ?? null,
        notes: "Custody review marker only; no cash, bank, or journal mutation."
      }
    })
    const updated = await tx.pettyCashLiquidation.update({
      where: { id: liquidation.id },
      data: {
        status: "APPROVED",
        reviewedByUserId: session.user.id,
        reviewedAt: new Date(),
        approvedByUserId: session.user.id,
        approvedAt: new Date(),
        approvedAmountPhp,
        shortageAmountPhp,
        overageAmountPhp,
        evidenceReference: evidenceReference ?? liquidation.evidenceReference,
        reviewReason: input.reason?.trim() ?? null
      }
    })
    await writePettyCashAudit(tx, {
      session,
      entityType: "PettyCashLiquidation",
      entityId: liquidation.id,
      eventType: "petty_cash.liquidation_approved",
      beforeStatus: liquidation.status,
      afterStatus: updated.status,
      reason: input.reason?.trim() ?? null,
      evidenceReference: updated.evidenceReference,
      metadata: {
        approvedAmountPhp,
        shortageAmountPhp,
        overageAmountPhp,
        sourceEventKey,
        noBalanceChange: true
      }
    })
    return updated
  })
}

export async function returnPettyCashLiquidationForRevision(
  session: SessionContext,
  input: PettyCashLiquidationActionInput
) {
  await requirePermission(
    session,
    permissions.financePettyCashReviewLiquidation
  )
  const reason = input.reason?.trim()
  assertReason(reason, "PETTY_CASH_LIQUIDATION_RETURN_REASON_REQUIRED")
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
    const updated = await tx.pettyCashLiquidation.update({
      where: { id: liquidation.id },
      data: {
        status: "RETURNED_FOR_REVISION",
        reviewedByUserId: session.user.id,
        reviewedAt: new Date(),
        reviewReason: reason
      }
    })
    await writePettyCashAudit(tx, {
      session,
      entityType: "PettyCashLiquidation",
      entityId: liquidation.id,
      eventType: "petty_cash.liquidation_returned",
      beforeStatus: liquidation.status,
      afterStatus: updated.status,
      reason,
      evidenceReference:
        input.evidenceReference ?? liquidation.evidenceReference
    })
    return updated
  })
}

export async function rejectPettyCashLiquidation(
  session: SessionContext,
  input: PettyCashLiquidationActionInput
) {
  await requirePermission(
    session,
    permissions.financePettyCashReviewLiquidation
  )
  const reason = input.reason?.trim()
  assertReason(reason, "PETTY_CASH_LIQUIDATION_REJECTION_REASON_REQUIRED")
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
    const updated = await tx.pettyCashLiquidation.update({
      where: { id: liquidation.id },
      data: {
        status: "REJECTED",
        reviewedByUserId: session.user.id,
        reviewedAt: new Date(),
        reviewReason: reason
      }
    })
    await writePettyCashAudit(tx, {
      session,
      entityType: "PettyCashLiquidation",
      entityId: liquidation.id,
      eventType: "petty_cash.liquidation_rejected",
      beforeStatus: liquidation.status,
      afterStatus: updated.status,
      reason,
      evidenceReference:
        input.evidenceReference ?? liquidation.evidenceReference
    })
    return updated
  })
}

export async function cancelPettyCashLiquidation(
  session: SessionContext,
  input: PettyCashLiquidationActionInput
) {
  await requirePermission(session, permissions.financePettyCashLiquidate)
  const reason = input.reason?.trim()
  assertReason(reason, "PETTY_CASH_LIQUIDATION_CANCELLATION_REASON_REQUIRED")
  return prisma.$transaction(async (tx) => {
    const grantedPermissionCodes = await lockGrantedFinancePermissions(
      tx,
      session,
      [
        permissions.financePettyCashLiquidate,
        permissions.financePettyCashReviewLiquidation
      ]
    )
    if (!grantedPermissionCodes.has(permissions.financePettyCashLiquidate)) {
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
      !grantedPermissionCodes.has(permissions.financePettyCashReviewLiquidation)
    ) {
      throw new Error("PETTY_CASH_LIQUIDATION_CANCEL_PERMISSION_DENIED")
    }
    if (liquidation.ledgerEntries.length > 0) {
      throw new Error("PETTY_CASH_LIQUIDATION_CANCEL_REQUIRES_REVERSAL")
    }
    const updated = await tx.pettyCashLiquidation.update({
      where: { id: liquidation.id },
      data: {
        status: "CANCELLED",
        cancelledByUserId: session.user.id,
        cancelledAt: new Date(),
        cancellationReason: reason
      }
    })
    await writePettyCashAudit(tx, {
      session,
      entityType: "PettyCashLiquidation",
      entityId: liquidation.id,
      eventType: "petty_cash.liquidation_cancelled",
      beforeStatus: liquidation.status,
      afterStatus: updated.status,
      reason,
      evidenceReference:
        input.evidenceReference ?? liquidation.evidenceReference
    })
    return updated
  })
}

export async function reversePettyCashLiquidation(
  session: SessionContext,
  input: PettyCashLiquidationActionInput
) {
  await requirePermission(
    session,
    permissions.financePettyCashReviewLiquidation
  )
  const reason = input.reason?.trim()
  const evidenceReference = input.evidenceReference?.trim()
  assertReason(reason, "PETTY_CASH_LIQUIDATION_REVERSAL_REASON_REQUIRED")
  assertEvidence(
    evidenceReference,
    "PETTY_CASH_LIQUIDATION_REVERSAL_EVIDENCE_REQUIRED"
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
    const settlementLedger = liquidation.ledgerEntries.find(
      (entry) => entry.entryType === "LIQUIDATION_SETTLEMENT" && !entry.voidedAt
    )
    if (!settlementLedger) {
      throw new Error("PETTY_CASH_LIQUIDATION_SETTLEMENT_REQUIRED")
    }

    const reversalEventKey =
      input.idempotencyKey ??
      `petty-cash:${liquidation.id}:reverse:${settlementLedger.id}`
    const existingReversal = await tx.pettyCashLedgerEntry.findFirst({
      where: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        sourceEventKey: reversalEventKey
      }
    })
    if (existingReversal) {
      return liquidation
    }

    const balanceBeforePhp = decimalToNumber(liquidation.fund.currentBalancePhp)
    await tx.pettyCashLedgerEntry.update({
      where: { id: settlementLedger.id },
      data: {
        voidedByUserId: session.user.id,
        voidedAt: new Date(),
        notes: [settlementLedger.notes, `Reversed: ${reason}`]
          .filter(Boolean)
          .join(" / ")
      }
    })
    const reversalLedger = await tx.pettyCashLedgerEntry.create({
      data: {
        tenantId: liquidation.tenantId,
        companyId: liquidation.companyId,
        pettyCashFundId: liquidation.pettyCashFundId,
        liquidationId: liquidation.id,
        locationId: liquidation.fund.locationId,
        entryType: "REVERSAL",
        direction: 0,
        amountPhp: decimalToNumber(settlementLedger.amountPhp),
        balanceBeforePhp,
        balanceAfterPhp: balanceBeforePhp,
        postedAt: new Date(),
        postedByUserId: session.user.id,
        reason,
        sourceEventKey: reversalEventKey,
        idempotencyKey: input.idempotencyKey ?? null,
        notes: `Reverses petty cash liquidation settlement marker ${settlementLedger.id}; no bank, payment, or journal posting.`
      }
    })
    const updated = await tx.pettyCashLiquidation.update({
      where: { id: liquidation.id },
      data: {
        status: "REVERSED",
        reviewedByUserId: session.user.id,
        reviewedAt: new Date(),
        closureNotes: reason,
        evidenceReference
      }
    })
    await writePettyCashAudit(tx, {
      session,
      entityType: "PettyCashLiquidation",
      entityId: liquidation.id,
      eventType: "petty_cash.liquidation_reversed",
      beforeStatus: liquidation.status,
      afterStatus: updated.status,
      reason,
      evidenceReference,
      metadata: {
        settlementLedgerEntryId: settlementLedger.id,
        reversalLedgerEntryId: reversalLedger.id,
        amountPhp: decimalToNumber(settlementLedger.amountPhp),
        noBalanceChange: true,
        noPaymentCreation: true,
        noPaymentRelease: true,
        noJournalPosting: true,
        noBankMutation: true
      }
    })
    return updated
  })
}

export async function closePettyCashLiquidation(
  session: SessionContext,
  input: PettyCashLiquidationActionInput
) {
  await requirePermission(
    session,
    permissions.financePettyCashReviewLiquidation
  )
  const reason = input.reason?.trim()
  const evidenceReference = input.evidenceReference?.trim()
  assertReason(reason, "PETTY_CASH_LIQUIDATION_CLOSE_REASON_REQUIRED")
  assertEvidence(
    evidenceReference,
    "PETTY_CASH_LIQUIDATION_CLOSE_EVIDENCE_REQUIRED"
  )
  return prisma.$transaction(async (tx) => {
    const liquidation = await getScopedLiquidationOrThrow(
      tx,
      session,
      input.liquidationId
    )
    assertLiquidationTransition({
      transition: "close_liquidation",
      status: liquidation.status
    })
    const settlementLedger = liquidation.ledgerEntries.find(
      (entry) => entry.entryType === "LIQUIDATION_SETTLEMENT"
    )
    if (!settlementLedger) {
      throw new Error("PETTY_CASH_LIQUIDATION_SETTLEMENT_REQUIRED")
    }
    const updated = await tx.pettyCashLiquidation.update({
      where: { id: liquidation.id },
      data: {
        status: "CLOSED",
        closedByUserId: session.user.id,
        closedAt: new Date(),
        closureNotes: reason,
        evidenceReference
      }
    })
    await writePettyCashAudit(tx, {
      session,
      entityType: "PettyCashLiquidation",
      entityId: liquidation.id,
      eventType: "petty_cash.liquidation_closed",
      beforeStatus: liquidation.status,
      afterStatus: updated.status,
      reason,
      evidenceReference: updated.evidenceReference,
      metadata: {
        settlementLedgerEntryId: settlementLedger.id,
        shortageAmountPhp: decimalToNumber(liquidation.shortageAmountPhp),
        overageAmountPhp: decimalToNumber(liquidation.overageAmountPhp),
        noPaymentCreation: true,
        noPaymentRelease: true,
        noJournalPosting: true,
        noBankMutation: true
      }
    })
    return updated
  })
}

export async function getPettyCashDashboard(
  session: SessionContext
): Promise<PettyCashDashboard> {
  if (!canUseFinance(await getGrantedPermissionCodes(session))) {
    throw new Error("PERMISSION_DENIED")
  }
  await requirePermission(session, permissions.financePettyCashView)

  const authorizedLocationIds = session.authorizedLocations.map(
    (location) => location.locationId
  )

  const [funds, suppliers, locations, custodians] = await Promise.all([
    prisma.pettyCashFund.findMany({
      where: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        locationId: { in: authorizedLocationIds }
      },
      include: {
        location: { select: { name: true } },
        custodian: { select: { displayName: true } },
        requests: {
          select: {
            id: true,
            publicReference: true,
            requestType: true,
            status: true,
            requestedAmountPhp: true,
            approvedAmountPhp: true,
            disbursementRequests: {
              where: {
                status: { notIn: ["CANCELLED", "REJECTED"] }
              },
              select: {
                publicReference: true
              },
              take: 1
            }
          }
        },
        liquidations: {
          select: {
            id: true,
            publicReference: true,
            status: true,
            claimedAmountPhp: true,
            approvedAmountPhp: true,
            shortageAmountPhp: true,
            overageAmountPhp: true
          }
        },
        ledgerEntries: { select: { id: true } }
      },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
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
    prisma.location.findMany({
      where: {
        id: { in: authorizedLocationIds },
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        status: "ACTIVE"
      },
      select: {
        id: true,
        name: true,
        code: true,
        locationType: true
      },
      orderBy: [{ name: "asc" }]
    }),
    prisma.user.findMany({
      where: {
        tenantId: session.context.tenantId,
        status: "ACTIVE",
        scopeAssignments: {
          some: {
            scopeType: "LOCATION",
            scopeId: { in: authorizedLocationIds },
            status: "ACTIVE"
          }
        }
      },
      select: {
        id: true,
        displayName: true,
        email: true
      },
      orderBy: [{ displayName: "asc" }],
      take: 100
    })
  ])

  const rows = buildPettyCashFundRows(funds)
  const reportRows = buildPettyCashReportRows(rows)
  const exceptionRows = buildPettyCashExceptionRows(reportRows)
  const workflowPermissions = {
    canCreate: session.permissionCodes.includes(
      permissions.financePettyCashCreate
    ),
    canSubmit: session.permissionCodes.includes(
      permissions.financePettyCashSubmit
    ),
    canApprove: session.permissionCodes.includes(
      permissions.financePettyCashApprove
    ),
    canReplenish: session.permissionCodes.includes(
      permissions.financePettyCashReplenish
    ),
    canCreateDisbursementHandoff: session.permissionCodes.includes(
      permissions.financeDisbursementCreate
    ),
    canLiquidate: session.permissionCodes.includes(
      permissions.financePettyCashLiquidate
    ),
    canReviewLiquidation: session.permissionCodes.includes(
      permissions.financePettyCashReviewLiquidation
    )
  }
  const activeRows = rows.filter((row) => row.status === "ACTIVE")
  const openRequestCount = rows.reduce(
    (sum, row) => sum + row.openRequestCount,
    0
  )
  const openLiquidationCount = rows.reduce(
    (sum, row) => sum + row.openLiquidationCount,
    0
  )
  const totalCurrentBalance = rows.reduce(
    (sum, row) => sum + row.currentBalancePhp,
    0
  )

  return {
    generatedAt: new Date().toISOString(),
    permissions: workflowPermissions,
    draftOptions: {
      funds: activeRows.map((fund) => ({
        id: fund.id,
        label: `${fund.code} / ${fund.name}`,
        detail: `${fund.locationName} / balance ${money(
          fund.currentBalancePhp
        )}`
      })),
      locations: locations.map((location) => ({
        id: location.id,
        label: `${location.code} / ${location.name}`,
        detail: location.locationType
      })),
      custodians: custodians.map((user) => ({
        id: user.id,
        label: user.displayName,
        detail: user.email
      })),
      suppliers: suppliers.map((supplier) => ({
        id: supplier.id,
        label: `${supplier.supplierCode} / ${
          supplier.tradingName ?? supplier.legalName
        }`,
        detail: supplier.legalName
      })),
      categories: pettyCashCategoryOptions
    },
    metrics: [
      {
        id: "active-funds",
        label: "Active funds",
        displayValue: number(activeRows.length),
        detail: "Scoped petty cash funds with assigned custodians.",
        tone: activeRows.length > 0 ? "info" : "neutral"
      },
      {
        id: "cash-on-hand",
        label: "Cash on hand",
        displayValue: money(totalCurrentBalance),
        detail:
          "PHP-only fund balance snapshots from controlled petty cash markers.",
        tone: totalCurrentBalance > 0 ? "success" : "neutral"
      },
      {
        id: "open-requests",
        label: "Open requests",
        displayValue: number(openRequestCount),
        detail:
          "Replenishment or disbursement requests still requiring action.",
        tone: openRequestCount > 0 ? "warning" : "success"
      },
      {
        id: "open-liquidations",
        label: "Open liquidations",
        displayValue: number(openLiquidationCount),
        detail:
          "Liquidation cycles pending receipt review, shortage, or overage closure.",
        tone: openLiquidationCount > 0 ? "warning" : "success"
      }
    ],
    funds: rows,
    reportRows,
    exceptionRows,
    requests: funds.flatMap((fund) =>
      fund.requests.map((request) => ({
        id: request.id,
        publicReference: request.publicReference,
        fundName: fund.name,
        requestType: request.requestType,
        status: request.status,
        requestedAmountPhp: decimalToNumber(request.requestedAmountPhp),
        approvedAmountPhp: decimalToNumber(request.approvedAmountPhp),
        disbursementHandoffReference:
          request.disbursementRequests[0]?.publicReference ?? null,
        allowedActions: resolvePettyCashRequestActions({
          status: request.status,
          hasOpenDisbursementHandoff: request.disbursementRequests.length > 0,
          permissions: workflowPermissions
        })
      }))
    ),
    liquidations: funds.flatMap((fund) =>
      fund.liquidations.map((liquidation) => ({
        id: liquidation.id,
        publicReference: liquidation.publicReference,
        fundName: fund.name,
        status: liquidation.status,
        claimedAmountPhp: decimalToNumber(liquidation.claimedAmountPhp),
        approvedAmountPhp: decimalToNumber(liquidation.approvedAmountPhp),
        shortageAmountPhp: decimalToNumber(liquidation.shortageAmountPhp),
        overageAmountPhp: decimalToNumber(liquidation.overageAmountPhp),
        allowedActions: resolvePettyCashLiquidationActions({
          status: liquidation.status,
          permissions: workflowPermissions
        })
      }))
    ),
    guardrails: [
      {
        label: "Petty cash is custody control",
        detail:
          "This workspace tracks fund setup, requests, liquidation evidence, and ledger markers. It does not post official GL journals or mutate bank balances.",
        tone: "success"
      },
      {
        label: "Replenishment is an offline marker",
        detail:
          "Approved replenishments can be recorded as evidence/readiness, but payment release and bank reconciliation remain separate controlled workflows.",
        tone: "info"
      },
      {
        label: "Liquidation evidence stays reviewable",
        detail:
          "Liquidation lines capture receipt references and shortage/overage context for UAT; real file upload storage remains in pending evidence-upload work.",
        tone: "info"
      }
    ]
  }
}
