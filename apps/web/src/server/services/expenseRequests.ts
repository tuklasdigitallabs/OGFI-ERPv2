import { createHash } from "node:crypto"
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
  recordWorkflowNotifications,
  resolveScopedNotificationRecipients
} from "./notifications"
import {
  resolveEvidenceReadiness,
  type EvidenceCaptureMode,
  type EvidenceProductionReadiness
} from "./attachments"
import {
  getExpenseRequestHandoffPolicy,
  type ExpenseRequestHandoffPolicy
} from "./policySettings"

type BadgeTone = "neutral" | "info" | "success" | "warning" | "destructive"

type DecimalLike = {
  toNumber?: () => number
  toString: () => string
}

export type ExpenseRequestMetric = {
  id: string
  label: string
  displayValue: string
  detail: string
  tone: BadgeTone
}

export type ExpenseRequestRow = {
  id: string
  publicReference: string
  title: string
  status: string
  urgency: string
  budgetStatus: string
  requesterName: string
  locationName: string
  supplierName: string
  categoryCode: string
  requestDate: string
  requiredByDate: string | null
  totalRequestedAmount: number
  settledAmount: number
  lineCount: number
  evidenceReference: string | null
  sourceLinkCount: number
}

export type ExpenseRequestReportRow = {
  id: string
  publicReference: string
  title: string
  status: string
  budgetStatus: string
  dueState: "NOT_DUE" | "DUE_SOON" | "OVERDUE" | "NO_DUE_DATE" | "CLOSED"
  locationName: string
  supplierName: string
  categoryCode: string
  totalRequestedAmount: number
  settledAmount: number
  outstandingAmount: number
  evidenceState: "COMPLETE" | "MISSING"
  evidenceCaptureMode: EvidenceCaptureMode
  evidenceProductionReadiness: EvidenceProductionReadiness
  evidenceBlockerId: string | null
  sourceLinkCount: number
  exportSafeSummary: string
}

export type ExpenseRequestApHandoffRow = {
  id: string
  expenseRequestId: string
  expenseReference: string
  expenseTitle: string
  apInvoiceId: string
  apInvoiceReference: string
  supplierInvoiceNumber: string
  status: string
  amountPhp: number
  remainingAmountPhp: number
  locationName: string
  supplierName: string
  createdByName: string
  createdAt: string
  boundary: string
}

export type ExpenseRequestDraftOption = {
  id: string
  label: string
  detail: string
}

export type ExpenseRequestDashboard = {
  generatedAt: string
  handoffPolicy: {
    key: string
    policy: ExpenseRequestHandoffPolicy
    isOverridden: boolean
    sourceDecisionId: string
  }
  permissions: {
    canCreate: boolean
    canSubmit: boolean
    canApprove: boolean
    canComplete: boolean
  }
  draftOptions: {
    locations: ExpenseRequestDraftOption[]
    suppliers: ExpenseRequestDraftOption[]
    budgetLines: ExpenseRequestDraftOption[]
    categories: ExpenseRequestDraftOption[]
  }
  metrics: ExpenseRequestMetric[]
  requests: ExpenseRequestRow[]
  reportRows: ExpenseRequestReportRow[]
  apHandoffRows: ExpenseRequestApHandoffRow[]
  guardrails: Array<{
    label: string
    detail: string
    tone: BadgeTone
  }>
}

export type ExpenseRequestActionInput = {
  expenseRequestId: string
  reason?: string
  evidenceReference?: string
  idempotencyKey?: string
}

export type ExpenseRequestApHandoffInput = ExpenseRequestActionInput & {
  supplierInvoiceNumber?: string
  invoiceDate?: Date
  dueDate?: Date | null
  paymentTermsDays?: number | null
}

export type CreateDraftExpenseRequestLineInput = {
  lineDescription: string
  lineDate?: Date | undefined
  requestedAmountPhp: number
  taxAmountPhp?: number | undefined
  discountAmountPhp?: number | undefined
}

export type CreateDraftExpenseRequestInput = {
  title: string
  requestReason: string
  urgency: "NORMAL" | "URGENT" | "EMERGENCY"
  requestDate: Date
  requiredByDate?: Date | null
  locationId: string
  supplierId?: string | null
  categoryCode: string
  expenseType?: string | undefined
  branchImpactFlag?: boolean
  evidenceReference?: string | undefined
  lineDescription: string
  lineDate: Date
  requestedAmountPhp: number
  taxAmountPhp?: number | undefined
  discountAmountPhp?: number | undefined
  lines?: CreateDraftExpenseRequestLineInput[] | undefined
  budgetLineId?: string | null
  idempotencyKey?: string | undefined
}

type ExpenseRequestTransition =
  | "submit"
  | "approve"
  | "return"
  | "reject"
  | "cancel"
  | "complete"
  | "mark_handoff_ready"

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

function cleanText(value: string | null | undefined) {
  return value?.trim() ?? ""
}

function jsonRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function assertDate(value: Date, errorCode: string) {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new Error(errorCode)
  }
}

function assertNonNegativeMoney(value: number, errorCode: string) {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(errorCode)
  }
}

function assertPositiveMoney(value: number, errorCode: string) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(errorCode)
  }
}

function nextExpenseReference(input: {
  year: number
  idempotencyKey?: string | undefined
  title: string
  locationId: string
  categoryCode: string
}) {
  const hash = createHash("sha256")
    .update(
      [
        input.year,
        input.idempotencyKey ?? input.title,
        input.locationId,
        input.categoryCode
      ].join(":")
    )
    .digest("hex")
    .slice(0, 8)
    .toUpperCase()
  return `EXP-${input.year}-${hash}`
}

const expenseCategoryOptions = [
  {
    id: "REPAIRS",
    label: "Repairs and maintenance",
    detail: "Emergency or planned store repair spend"
  },
  {
    id: "PACKAGING",
    label: "Packaging and disposables",
    detail: "Takeaway packaging, labels, and consumables"
  },
  {
    id: "CLEANING",
    label: "Cleaning and sanitation",
    detail: "Food-safe cleaning, sanitation, and hygiene supplies"
  },
  {
    id: "OPERATIONS",
    label: "Store operations",
    detail: "Other branch operating expenses"
  }
] satisfies ExpenseRequestDraftOption[]

function supplierName(
  supplier: { tradingName: string | null; legalName: string } | null
) {
  return supplier?.tradingName ?? supplier?.legalName ?? "No supplier yet"
}

function authorizedLocationIds(session: SessionContext) {
  return session.authorizedLocations.map((location) => location.locationId)
}

function assertReason(value: string | undefined, errorCode: string) {
  if (!value?.trim()) {
    throw new Error(errorCode)
  }
}

function assertEvidence(value: string | undefined | null, errorCode: string) {
  if (!value?.trim()) {
    throw new Error(errorCode)
  }
}

async function nextExpenseApInvoiceReference(companyId: string) {
  const year = new Date().getUTCFullYear()
  const count = await prisma.apInvoice.count({
    where: {
      companyId,
      publicReference: { startsWith: `AP-INV-${year}-` }
    }
  })
  return `AP-INV-${year}-${String(count + 1).padStart(5, "0")}`
}

function resolveExpenseDueState(
  request: Pick<ExpenseRequestRow, "status" | "requiredByDate">
): ExpenseRequestReportRow["dueState"] {
  if (["COMPLETED", "CANCELLED", "REJECTED"].includes(request.status)) {
    return "CLOSED"
  }
  if (!request.requiredByDate) {
    return "NO_DUE_DATE"
  }
  const today = new Date()
  const requiredBy = new Date(request.requiredByDate)
  const daysUntilDue = Math.ceil(
    (requiredBy.getTime() - today.getTime()) / 86_400_000
  )
  if (daysUntilDue < 0) {
    return "OVERDUE"
  }
  if (daysUntilDue <= 3) {
    return "DUE_SOON"
  }
  return "NOT_DUE"
}

function assertExpenseTransition(input: {
  transition: ExpenseRequestTransition
  status: string
}) {
  const allowed: Record<ExpenseRequestTransition, string[]> = {
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
      "ON_HOLD"
    ],
    complete: ["APPROVED", "IN_PROGRESS"],
    mark_handoff_ready: ["APPROVED", "IN_PROGRESS"]
  }
  if (!allowed[input.transition].includes(input.status)) {
    throw new Error("EXPENSE_REQUEST_INVALID_STATUS_TRANSITION")
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

async function findExpenseRequestApprovalRule(
  tx: TransactionClient,
  session: SessionContext
) {
  return tx.approvalRule.findFirst({
    where: {
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      transactionType: "ExpenseRequest",
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

async function getScopedExpenseRequestOrThrow(
  tx: TransactionClient,
  session: SessionContext,
  expenseRequestId: string
) {
  const request = await tx.expenseRequest.findFirst({
    where: {
      id: expenseRequestId,
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      locationId: { in: authorizedLocationIds(session) }
    },
    include: {
      lines: true,
      sourceLinks: true
    }
  })
  if (!request) {
    throw new Error("EXPENSE_REQUEST_NOT_FOUND")
  }
  return request
}

async function writeExpenseAudit(
  tx: TransactionClient,
  input: {
    session: SessionContext
    requestId: string
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
      entityType: "ExpenseRequest",
      entityId: input.requestId,
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
        noApSettlement: true,
        ...(input.metadata ?? {})
      }
    }
  })
}

async function upsertExpenseRequestBudgetCommitments(
  tx: TransactionClient,
  input: {
    session: SessionContext
    request: Awaited<ReturnType<typeof getScopedExpenseRequestOrThrow>>
    reason?: string | null
    evidenceReference?: string | null
  }
) {
  const budgetedLines = input.request.lines.filter(
    (line) => line.budgetLineId && decimalToNumber(line.lineTotalPhp) > 0
  )
  if (budgetedLines.length === 0) {
    return []
  }

  const results = []
  for (const line of budgetedLines) {
    const budgetLine = await tx.budgetLine.findFirst({
      where: {
        id: line.budgetLineId!,
        tenantId: input.session.context.tenantId,
        companyId: input.session.context.companyId,
        status: "ACTIVE",
        budget: { status: { in: ["ACTIVE", "PARTIALLY_RELEASED"] } }
      },
      select: {
        id: true,
        budgetId: true,
        locationId: true
      }
    })
    if (!budgetLine) {
      throw new Error("EXPENSE_REQUEST_BUDGET_LINE_NOT_ACTIVE")
    }
    if (
      budgetLine.locationId &&
      !authorizedLocationIds(input.session).includes(budgetLine.locationId)
    ) {
      throw new Error("SCOPE_DENIED")
    }

    const sourceEventKey = `expense-request:${input.request.id}:approved:line:${line.lineNumber}`
    const existing = await tx.budgetCommitment.findUnique({
      where: {
        companyId_sourceType_sourceId_sourceEventKey: {
          companyId: input.session.context.companyId,
          sourceType: "EXPENSE_REQUEST",
          sourceId: input.request.id,
          sourceEventKey
        }
      },
      select: { id: true }
    })
    const committedAmountPhp = decimalToNumber(line.lineTotalPhp)
    const sourceSnapshot = {
      summary: `${input.request.publicReference} / ${line.description}`,
      expenseRequestId: input.request.id,
      expenseRequestLineId: line.id,
      lineNumber: line.lineNumber,
      categoryCode: line.categoryCode,
      budgetStatus: input.request.budgetStatus,
      overrideReason: input.reason?.trim() || null,
      evidenceReference:
        input.evidenceReference?.trim() || line.evidenceReference || null,
      boundary: "budget_commitment_only_no_source_mutation",
      noPaymentCreation: true,
      noPaymentRelease: true,
      noApSettlement: true,
      noJournalPosting: true
    }

    const commitment = await tx.budgetCommitment.upsert({
      where: {
        companyId_sourceType_sourceId_sourceEventKey: {
          companyId: input.session.context.companyId,
          sourceType: "EXPENSE_REQUEST",
          sourceId: input.request.id,
          sourceEventKey
        }
      },
      create: {
        budgetId: budgetLine.budgetId,
        budgetLineId: budgetLine.id,
        tenantId: input.session.context.tenantId,
        companyId: input.session.context.companyId,
        sourceType: "EXPENSE_REQUEST",
        sourceId: input.request.id,
        sourceLineId: line.id,
        sourceEventKey,
        sourceEventAt: new Date(),
        sourceReference: input.request.publicReference,
        sourceSnapshot,
        status: "APPROVED",
        committedAmountPhp,
        requestedByUserId: input.request.requestedByUserId,
        approvedByUserId: input.session.user.id,
        requestedAt: input.request.submittedAt ?? input.request.requestDate,
        approvedAt: new Date()
      },
      update: {
        budgetId: budgetLine.budgetId,
        budgetLineId: budgetLine.id,
        sourceLineId: line.id,
        sourceEventAt: new Date(),
        sourceReference: input.request.publicReference,
        sourceSnapshot,
        status: "APPROVED",
        committedAmountPhp,
        requestedByUserId: input.request.requestedByUserId,
        approvedByUserId: input.session.user.id,
        requestedAt: input.request.submittedAt ?? input.request.requestDate,
        approvedAt: new Date()
      },
      select: {
        id: true,
        status: true
      }
    })

    await tx.auditEvent.create({
      data: {
        tenantId: input.session.context.tenantId,
        companyId: input.session.context.companyId,
        actorUserId: input.session.user.id,
        eventType: existing
          ? "budget.commitment_updated"
          : "budget.commitment_created",
        entityType: "BudgetCommitment",
        entityId: commitment.id,
        afterData: {
          sourceType: "EXPENSE_REQUEST",
          sourceId: input.request.id,
          sourceReference: input.request.publicReference,
          committedAmountPhp,
          status: commitment.status
        },
        metadata: {
          sourceWorkflow: "ExpenseRequest",
          expenseRequestId: input.request.id,
          expenseRequestLineId: line.id,
          budgetLineId: budgetLine.id,
          noSourceMutation: true,
          noPaymentCreation: true,
          noPaymentRelease: true,
          noApSettlement: true,
          noJournalPosting: true
        }
      }
    })

    results.push(commitment)
  }
  return results
}

export function buildExpenseRequestRows(
  requests: Array<{
    id: string
    publicReference: string
    title: string
    status: string
    urgency: string
    budgetStatus: string
    requestDate: Date
    requiredByDate: Date | null
    totalRequestedAmount: DecimalLike | number
    settledAmount: DecimalLike | number
    categoryCode: string
    evidenceReference: string | null
    requestedBy: { displayName: string }
    location: { name: string }
    supplier: { tradingName: string | null; legalName: string } | null
    lines: Array<{ id: string }>
    sourceLinks: Array<{ id: string }>
  }>
) {
  return requests.map((request) => ({
    id: request.id,
    publicReference: request.publicReference,
    title: request.title,
    status: request.status,
    urgency: request.urgency,
    budgetStatus: request.budgetStatus,
    requesterName: request.requestedBy.displayName,
    locationName: request.location.name,
    supplierName: supplierName(request.supplier),
    categoryCode: request.categoryCode,
    requestDate: request.requestDate.toISOString(),
    requiredByDate: request.requiredByDate?.toISOString() ?? null,
    totalRequestedAmount: decimalToNumber(request.totalRequestedAmount),
    settledAmount: decimalToNumber(request.settledAmount),
    lineCount: request.lines.length,
    evidenceReference: request.evidenceReference,
    sourceLinkCount: request.sourceLinks.length
  }))
}

export function buildExpenseRequestReportRows(
  rows: ExpenseRequestRow[]
): ExpenseRequestReportRow[] {
  return rows.map((request) => {
    const outstandingAmount = Math.max(
      request.totalRequestedAmount - request.settledAmount,
      0
    )
    const evidenceReadiness = resolveEvidenceReadiness({
      evidenceReference: request.evidenceReference
    })
    return {
      id: request.id,
      publicReference: request.publicReference,
      title: request.title,
      status: request.status,
      budgetStatus: request.budgetStatus,
      dueState: resolveExpenseDueState(request),
      locationName: request.locationName,
      supplierName: request.supplierName,
      categoryCode: request.categoryCode,
      totalRequestedAmount: request.totalRequestedAmount,
      settledAmount: request.settledAmount,
      outstandingAmount,
      evidenceState: evidenceReadiness.evidenceState,
      evidenceCaptureMode: evidenceReadiness.evidenceCaptureMode,
      evidenceProductionReadiness:
        evidenceReadiness.evidenceProductionReadiness,
      evidenceBlockerId: evidenceReadiness.evidenceBlockerId,
      sourceLinkCount: request.sourceLinkCount,
      exportSafeSummary: [
        request.publicReference,
        request.status,
        request.budgetStatus,
        request.locationName,
        request.categoryCode,
        evidenceReadiness.evidenceState,
        evidenceReadiness.evidenceCaptureMode,
        `${request.sourceLinkCount} source link(s)`
      ].join(" / ")
    }
  })
}

export function buildExpenseRequestApHandoffRows(
  links: Array<{
    id: string
    expenseRequestId: string
    sourceDocumentId: string
    sourceAmountSnapshotPhp: DecimalLike | number
    remainingAmountSnapshotPhp: DecimalLike | number
    sourceDocumentSnapshot: unknown
    createdAt: Date
    createdBy: { displayName: string }
    expenseRequest: {
      publicReference: string
      title: string
      location: { name: string }
      supplier: { tradingName: string | null; legalName: string } | null
    }
  }>
): ExpenseRequestApHandoffRow[] {
  return links.map((link) => {
    const snapshot = jsonRecord(link.sourceDocumentSnapshot)
    return {
      id: link.id,
      expenseRequestId: link.expenseRequestId,
      expenseReference: link.expenseRequest.publicReference,
      expenseTitle: link.expenseRequest.title,
      apInvoiceId: link.sourceDocumentId,
      apInvoiceReference: String(
        snapshot.publicReference ?? "Linked AP invoice"
      ),
      supplierInvoiceNumber: String(
        snapshot.supplierInvoiceNumber ?? "Not captured"
      ),
      status: String(snapshot.status ?? "DRAFT"),
      amountPhp: decimalToNumber(link.sourceAmountSnapshotPhp),
      remainingAmountPhp: decimalToNumber(link.remainingAmountSnapshotPhp),
      locationName: link.expenseRequest.location.name,
      supplierName: supplierName(link.expenseRequest.supplier),
      createdByName: link.createdBy.displayName,
      createdAt: link.createdAt.toISOString(),
      boundary: String(
        snapshot.boundary ??
          "expense_to_ap_invoice_draft_only_no_payment_release_no_journal"
      )
    }
  })
}

export async function createDraftExpenseRequest(
  session: SessionContext,
  input: CreateDraftExpenseRequestInput
) {
  if (!canUseFinance(session.permissionCodes)) {
    throw new Error("PERMISSION_DENIED")
  }
  await requirePermission(session, permissions.financeExpenseRequestCreate)

  const title = cleanText(input.title)
  const requestReason = cleanText(input.requestReason)
  const locationId = cleanText(input.locationId)
  const supplierId = cleanText(input.supplierId) || null
  const categoryCode = cleanText(input.categoryCode).toUpperCase()
  const expenseType = cleanText(input.expenseType) || "OPERATING"
  const evidenceReference = cleanText(input.evidenceReference) || null
  const draftLines =
    input.lines && input.lines.length > 0
      ? input.lines
      : [
          {
            lineDescription: input.lineDescription,
            lineDate: input.lineDate,
            requestedAmountPhp: input.requestedAmountPhp,
            taxAmountPhp: input.taxAmountPhp,
            discountAmountPhp: input.discountAmountPhp
          }
        ]
  if (draftLines.length > 25) {
    throw new Error("EXPENSE_REQUEST_LINE_LIMIT_EXCEEDED")
  }
  const normalizedLines = draftLines.map((line, index) => {
    const lineDescription = cleanText(line.lineDescription)
    const requestedAmountPhp = roundMoney(Number(line.requestedAmountPhp))
    const taxAmountPhp = roundMoney(Number(line.taxAmountPhp ?? 0))
    const discountAmountPhp = roundMoney(Number(line.discountAmountPhp ?? 0))
    const lineTotalPhp = roundMoney(
      requestedAmountPhp + taxAmountPhp - discountAmountPhp
    )
    if (!lineDescription) {
      throw new Error("EXPENSE_REQUEST_LINE_DESCRIPTION_REQUIRED")
    }
    assertDate(
      line.lineDate ?? input.requestDate,
      "EXPENSE_REQUEST_LINE_DATE_INVALID"
    )
    assertPositiveMoney(requestedAmountPhp, "EXPENSE_REQUEST_AMOUNT_REQUIRED")
    assertNonNegativeMoney(taxAmountPhp, "EXPENSE_REQUEST_TAX_INVALID")
    assertNonNegativeMoney(
      discountAmountPhp,
      "EXPENSE_REQUEST_DISCOUNT_INVALID"
    )
    assertPositiveMoney(lineTotalPhp, "EXPENSE_REQUEST_LINE_TOTAL_REQUIRED")
    return {
      lineNumber: index + 1,
      lineDescription,
      lineDate: line.lineDate ?? input.requestDate,
      requestedAmountPhp,
      taxAmountPhp,
      discountAmountPhp,
      lineTotalPhp
    }
  })
  const totalRequestedAmountPhp = roundMoney(
    normalizedLines.reduce((sum, line) => sum + line.lineTotalPhp, 0)
  )
  const budgetLineId = cleanText(input.budgetLineId) || null
  const idempotencyKey = cleanText(input.idempotencyKey) || null

  if (!title) {
    throw new Error("EXPENSE_REQUEST_TITLE_REQUIRED")
  }
  if (!requestReason) {
    throw new Error("EXPENSE_REQUEST_REASON_REQUIRED")
  }
  if (!locationId) {
    throw new Error("EXPENSE_REQUEST_LOCATION_REQUIRED")
  }
  if (!categoryCode) {
    throw new Error("EXPENSE_REQUEST_CATEGORY_REQUIRED")
  }
  if (!["NORMAL", "URGENT", "EMERGENCY"].includes(input.urgency)) {
    throw new Error("EXPENSE_REQUEST_URGENCY_INVALID")
  }
  assertDate(input.requestDate, "EXPENSE_REQUEST_DATE_INVALID")
  if (input.requiredByDate) {
    assertDate(input.requiredByDate, "EXPENSE_REQUEST_REQUIRED_DATE_INVALID")
    if (input.requiredByDate < input.requestDate) {
      throw new Error("EXPENSE_REQUEST_REQUIRED_DATE_BEFORE_REQUEST")
    }
  }
  assertPositiveMoney(
    totalRequestedAmountPhp,
    "EXPENSE_REQUEST_LINE_TOTAL_REQUIRED"
  )

  const allowedLocationIds = new Set(authorizedLocationIds(session))
  if (!allowedLocationIds.has(locationId)) {
    throw new Error("SCOPE_DENIED")
  }

  return prisma.$transaction(async (tx) => {
    if (idempotencyKey) {
      const existing = await tx.expenseRequest.findUnique({
        where: {
          tenantId_companyId_idempotencyKey: {
            tenantId: session.context.tenantId,
            companyId: session.context.companyId,
            idempotencyKey
          }
        },
        include: { lines: true, sourceLinks: true }
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
        throw new Error("EXPENSE_REQUEST_IDEMPOTENCY_CONFLICT")
      }
    }

    const [location, supplier, budgetLine] = await Promise.all([
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
        : Promise.resolve(null),
      budgetLineId
        ? tx.budgetLine.findFirst({
            where: {
              id: budgetLineId,
              tenantId: session.context.tenantId,
              companyId: session.context.companyId,
              status: "ACTIVE",
              budget: { status: { in: ["ACTIVE", "PARTIALLY_RELEASED"] } },
              OR: [{ locationId: null }, { locationId }]
            },
            include: {
              budget: { select: { publicReference: true, name: true } },
              commitments: {
                select: {
                  status: true,
                  committedAmountPhp: true,
                  consumedAmountPhp: true,
                  releasedAmountPhp: true
                }
              }
            }
          })
        : Promise.resolve(null)
    ])

    if (!location) {
      throw new Error("EXPENSE_REQUEST_LOCATION_NOT_FOUND")
    }
    if (supplierId && !supplier) {
      throw new Error("EXPENSE_REQUEST_SUPPLIER_NOT_ACTIVE")
    }
    if (budgetLineId && !budgetLine) {
      throw new Error("EXPENSE_REQUEST_BUDGET_LINE_NOT_ACTIVE")
    }

    const activeCommitments =
      budgetLine?.commitments
        .filter((commitment) =>
          ["PENDING", "APPROVED"].includes(commitment.status)
        )
        .reduce(
          (sum, commitment) =>
            sum +
            decimalToNumber(commitment.committedAmountPhp) -
            decimalToNumber(commitment.consumedAmountPhp) -
            decimalToNumber(commitment.releasedAmountPhp),
          0
        ) ?? 0
    const budgetRemaining =
      budgetLine == null
        ? null
        : decimalToNumber(budgetLine.revisedAmountPhp) - activeCommitments
    const budgetStatus =
      budgetLine == null
        ? "UNBUDGETED"
        : budgetRemaining != null && totalRequestedAmountPhp > budgetRemaining
          ? "OVER_BUDGET"
          : "BUDGETED"

    const publicReference = nextExpenseReference({
      year: input.requestDate.getUTCFullYear(),
      idempotencyKey: idempotencyKey ?? undefined,
      title,
      locationId,
      categoryCode
    })

    const existingReference = await tx.expenseRequest.findUnique({
      where: {
        companyId_publicReference: {
          companyId: session.context.companyId,
          publicReference
        }
      },
      include: { lines: true, sourceLinks: true }
    })
    if (existingReference) {
      if (!allowedLocationIds.has(existingReference.locationId)) {
        throw new Error("SCOPE_DENIED")
      }
      if (
        existingReference.requestedByUserId === session.user.id &&
        existingReference.status === "DRAFT"
      ) {
        return existingReference
      }
      throw new Error("EXPENSE_REQUEST_REFERENCE_ALREADY_EXISTS")
    }

    const request = await tx.expenseRequest.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        publicReference,
        currencyCode: "PHP",
        totalRequestedAmount: totalRequestedAmountPhp,
        settledAmount: 0,
        status: "DRAFT",
        urgency: input.urgency,
        budgetStatus,
        requestDate: input.requestDate,
        requiredByDate: input.requiredByDate ?? null,
        title,
        requestReason,
        categoryCode,
        expenseType,
        branchImpactFlag:
          input.branchImpactFlag ?? input.urgency === "EMERGENCY",
        supplierId: supplier?.id ?? null,
        brandId: location.brandId ?? null,
        locationId: location.id,
        requestedByUserId: session.user.id,
        evidenceReference,
        budgetSnapshot: {
          phase: "phase3_create_only",
          budgetStatus,
          budgetLineId: budgetLine?.id ?? null,
          budgetReference: budgetLine?.budget.publicReference ?? null,
          budgetLineCode: budgetLine?.code ?? null,
          budgetLineName: budgetLine?.name ?? null,
          budgetRemainingAmountPhp: budgetRemaining,
          warningFirst: true,
          noPaymentCreation: true,
          noApSettlement: true,
          noJournalPosting: true
        },
        idempotencyKey,
        lines: {
          create: normalizedLines.map((line) => ({
            tenantId: session.context.tenantId,
            companyId: session.context.companyId,
            lineNumber: line.lineNumber,
            lineDate: line.lineDate,
            description: line.lineDescription,
            categoryCode,
            requestedAmountPhp: line.requestedAmountPhp,
            taxAmountPhp: line.taxAmountPhp,
            discountAmountPhp: line.discountAmountPhp,
            lineTotalPhp: line.lineTotalPhp,
            budgetLineId: budgetLine?.id ?? null,
            brandId: location.brandId ?? null,
            locationId: location.id,
            evidenceReference,
            idempotencyKey: idempotencyKey
              ? `${idempotencyKey}:line:${line.lineNumber}`
              : null,
            createdByUserId: session.user.id
          }))
        }
      },
      include: { lines: true, sourceLinks: true }
    })

    await writeExpenseAudit(tx, {
      session,
      requestId: request.id,
      eventType: "expense_request.created",
      beforeStatus: "NONE",
      afterStatus: request.status,
      reason: requestReason,
      evidenceReference,
      metadata: {
        phase: "phase3_create_only",
        publicReference,
        categoryCode,
        supplierId: supplier?.id ?? null,
        supplierCode: supplier?.supplierCode ?? null,
        locationName: location.name,
        lineCount: normalizedLines.length,
        totalRequestedAmountPhp,
        budgetStatus,
        budgetLineId: budgetLine?.id ?? null,
        budgetRemainingAmountPhp: budgetRemaining,
        idempotencyKey
      }
    })

    return request
  })
}

export async function submitExpenseRequestForApproval(
  session: SessionContext,
  input: ExpenseRequestActionInput
) {
  await requirePermission(session, permissions.financeExpenseRequestSubmit)
  return prisma.$transaction(async (tx) => {
    const request = await getScopedExpenseRequestOrThrow(
      tx,
      session,
      input.expenseRequestId
    )
    if (request.status === "AWAITING_APPROVAL") {
      return request
    }
    assertExpenseTransition({ transition: "submit", status: request.status })
    assertEvidence(
      input.evidenceReference ?? request.evidenceReference,
      "EXPENSE_REQUEST_EVIDENCE_REQUIRED"
    )
    if (
      request.lines.length === 0 ||
      decimalToNumber(request.totalRequestedAmount) <= 0
    ) {
      throw new Error("EXPENSE_REQUEST_LINES_REQUIRED")
    }
    const approvalRule = await findExpenseRequestApprovalRule(tx, session)
    if (!approvalRule || approvalRule.steps.length === 0) {
      throw new Error("EXPENSE_REQUEST_APPROVAL_RULE_NOT_CONFIGURED")
    }
    const firstStep = approvalRule.steps[0]
    if (!firstStep) {
      throw new Error("EXPENSE_REQUEST_APPROVAL_RULE_STEP_NOT_CONFIGURED")
    }
    const existingApproval = await tx.approvalInstance.findFirst({
      where: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        documentType: "ExpenseRequest",
        documentId: request.id,
        status: "PENDING"
      }
    })
    if (existingApproval) {
      throw new Error("EXPENSE_REQUEST_ALREADY_SUBMITTED")
    }

    const approvalInstance = await tx.approvalInstance.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        documentType: "ExpenseRequest",
        documentId: request.id,
        approvalRuleId: approvalRule.id,
        status: "PENDING",
        currentStepOrder: firstStep.stepOrder,
        steps: {
          create: approvalRule.steps.map((step, index) => ({
            stepOrder: step.stepOrder,
            assignedUserId: step.userId,
            assignedRoleId: step.roleId,
            status: index === 0 ? "PENDING" : "WAITING"
          }))
        }
      }
    })

    const updated = await tx.expenseRequest.update({
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
    const auditEvent = await writeExpenseAudit(tx, {
      session,
      requestId: request.id,
      eventType: "expense_request.submitted",
      beforeStatus: request.status,
      afterStatus: updated.status,
      evidenceReference: updated.evidenceReference,
      metadata: {
        lineCount: request.lines.length,
        approvalInstanceId: approvalInstance.id,
        approvalRuleId: approvalRule.id,
        idempotencyKey: input.idempotencyKey ?? null
      }
    })
    const recipientUserIds = await resolveScopedNotificationRecipients(tx, {
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      locationId: request.locationId,
      assignedUserId: firstStep.userId,
      assignedRoleId: firstStep.roleId
    })
    await recordWorkflowNotifications(tx, {
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      locationId: request.locationId,
      recipientUserIds,
      notificationType: "APPROVE_EXPENSE_REQUEST",
      priority: request.urgency === "EMERGENCY" ? "HIGH" : "NORMAL",
      title: `Approve Expense Request ${request.publicReference}`,
      body: `${session.user.displayName} submitted ${request.title} for approval.`,
      deepLink: `/approvals/${approvalInstance.id}`,
      entityType: "ExpenseRequest",
      entityId: request.id,
      sourceEventKey: auditEvent.id,
      recipientBasis: firstStep.userId ? "assigned_user" : "assigned_role",
      metadata: {
        approvalInstanceId: approvalInstance.id,
        approvalStepOrder: firstStep.stepOrder,
        publicReference: request.publicReference,
        urgency: request.urgency,
        totalRequestedAmountPhp: decimalToNumber(request.totalRequestedAmount),
        noPaymentCreation: true,
        noPaymentRelease: true,
        noJournalPosting: true
      }
    })
    return updated
  })
}

export async function approveExpenseRequest(
  session: SessionContext,
  input: ExpenseRequestActionInput
) {
  await requirePermission(session, permissions.financeExpenseRequestApprove)
  return prisma.$transaction(async (tx) => {
    const request = await getScopedExpenseRequestOrThrow(
      tx,
      session,
      input.expenseRequestId
    )
    if (request.status === "APPROVED") {
      return request
    }
    assertExpenseTransition({ transition: "approve", status: request.status })
    if (request.requestedByUserId === session.user.id) {
      throw new Error("EXPENSE_REQUEST_SELF_APPROVAL_BLOCKED")
    }
    if (request.budgetStatus === "OVER_BUDGET") {
      assertReason(
        input.reason,
        "EXPENSE_REQUEST_BUDGET_OVERRIDE_REASON_REQUIRED"
      )
      assertEvidence(
        input.evidenceReference ?? request.evidenceReference,
        "EXPENSE_REQUEST_BUDGET_OVERRIDE_EVIDENCE_REQUIRED"
      )
    }

    const updated = await tx.expenseRequest.update({
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
          warningFirst: true,
          noPaymentMutation: true,
          noJournalPosting: true
        },
        version: { increment: 1 }
      }
    })
    const budgetCommitments = await upsertExpenseRequestBudgetCommitments(tx, {
      session,
      request,
      reason: input.reason ?? null,
      evidenceReference: updated.evidenceReference
    })
    await writeExpenseAudit(tx, {
      session,
      requestId: request.id,
      eventType: "expense_request.approved",
      beforeStatus: request.status,
      afterStatus: updated.status,
      reason: input.reason?.trim() ?? null,
      evidenceReference: updated.evidenceReference,
      metadata: {
        budgetStatus: request.budgetStatus,
        budgetCommitmentCount: budgetCommitments.length,
        sourceEventType: "EXPENSE_REQUEST",
        budgetCommitmentBoundary: "budget_commitment_only_no_source_mutation",
        idempotencyKey: input.idempotencyKey ?? null
      }
    })
    return updated
  })
}

export async function returnExpenseRequestForRevision(
  session: SessionContext,
  input: ExpenseRequestActionInput
) {
  await requirePermission(session, permissions.financeExpenseRequestApprove)
  const reason = input.reason?.trim()
  if (!reason) {
    throw new Error("EXPENSE_REQUEST_RETURN_REASON_REQUIRED")
  }
  return prisma.$transaction(async (tx) => {
    const request = await getScopedExpenseRequestOrThrow(
      tx,
      session,
      input.expenseRequestId
    )
    assertExpenseTransition({ transition: "return", status: request.status })
    const updated = await tx.expenseRequest.update({
      where: { id: request.id },
      data: {
        status: "RETURNED_FOR_REVISION",
        returnedByUserId: session.user.id,
        returnedAt: new Date(),
        returnReason: reason,
        version: { increment: 1 }
      }
    })
    await writeExpenseAudit(tx, {
      session,
      requestId: request.id,
      eventType: "expense_request.returned",
      beforeStatus: request.status,
      afterStatus: updated.status,
      reason,
      evidenceReference: input.evidenceReference ?? request.evidenceReference
    })
    return updated
  })
}

export async function rejectExpenseRequest(
  session: SessionContext,
  input: ExpenseRequestActionInput
) {
  await requirePermission(session, permissions.financeExpenseRequestApprove)
  const reason = input.reason?.trim()
  if (!reason) {
    throw new Error("EXPENSE_REQUEST_REJECTION_REASON_REQUIRED")
  }
  return prisma.$transaction(async (tx) => {
    const request = await getScopedExpenseRequestOrThrow(
      tx,
      session,
      input.expenseRequestId
    )
    assertExpenseTransition({ transition: "reject", status: request.status })
    const updated = await tx.expenseRequest.update({
      where: { id: request.id },
      data: {
        status: "REJECTED",
        rejectedByUserId: session.user.id,
        rejectedAt: new Date(),
        rejectionReason: reason,
        version: { increment: 1 }
      }
    })
    await writeExpenseAudit(tx, {
      session,
      requestId: request.id,
      eventType: "expense_request.rejected",
      beforeStatus: request.status,
      afterStatus: updated.status,
      reason,
      evidenceReference: input.evidenceReference ?? request.evidenceReference
    })
    return updated
  })
}

export async function cancelExpenseRequest(
  session: SessionContext,
  input: ExpenseRequestActionInput
) {
  await requirePermission(session, permissions.financeExpenseRequestCreate)
  const reason = input.reason?.trim()
  if (!reason) {
    throw new Error("EXPENSE_REQUEST_CANCELLATION_REASON_REQUIRED")
  }
  return prisma.$transaction(async (tx) => {
    const grantedPermissionCodes = await lockGrantedFinancePermissions(
      tx,
      session,
      [
        permissions.financeExpenseRequestCreate,
        permissions.financeExpenseRequestApprove
      ]
    )
    if (!grantedPermissionCodes.has(permissions.financeExpenseRequestCreate)) {
      throw new Error("PERMISSION_DENIED")
    }
    const request = await getScopedExpenseRequestOrThrow(
      tx,
      session,
      input.expenseRequestId
    )
    assertExpenseTransition({ transition: "cancel", status: request.status })
    if (
      request.requestedByUserId !== session.user.id &&
      !grantedPermissionCodes.has(permissions.financeExpenseRequestApprove)
    ) {
      throw new Error("EXPENSE_REQUEST_CANCEL_PERMISSION_DENIED")
    }
    const updated = await tx.expenseRequest.update({
      where: { id: request.id },
      data: {
        status: "CANCELLED",
        cancelledByUserId: session.user.id,
        cancelledAt: new Date(),
        cancellationReason: reason,
        version: { increment: 1 }
      }
    })
    await writeExpenseAudit(tx, {
      session,
      requestId: request.id,
      eventType: "expense_request.cancelled",
      beforeStatus: request.status,
      afterStatus: updated.status,
      reason,
      evidenceReference: input.evidenceReference ?? request.evidenceReference
    })
    return updated
  })
}

export async function completeExpenseRequest(
  session: SessionContext,
  input: ExpenseRequestActionInput
) {
  await requirePermission(session, permissions.financeExpenseRequestComplete)
  const reason = input.reason?.trim()
  if (!reason) {
    throw new Error("EXPENSE_REQUEST_COMPLETION_NOTE_REQUIRED")
  }
  return prisma.$transaction(async (tx) => {
    const request = await getScopedExpenseRequestOrThrow(
      tx,
      session,
      input.expenseRequestId
    )
    assertExpenseTransition({ transition: "complete", status: request.status })
    assertEvidence(
      input.evidenceReference ?? request.evidenceReference,
      "EXPENSE_REQUEST_COMPLETION_EVIDENCE_REQUIRED"
    )
    const updated = await tx.expenseRequest.update({
      where: { id: request.id },
      data: {
        status: "COMPLETED",
        completedByUserId: session.user.id,
        completedAt: new Date(),
        completionNotes: reason,
        evidenceReference:
          input.evidenceReference?.trim() ?? request.evidenceReference,
        version: { increment: 1 }
      }
    })
    await writeExpenseAudit(tx, {
      session,
      requestId: request.id,
      eventType: "expense_request.completed",
      beforeStatus: request.status,
      afterStatus: updated.status,
      reason,
      evidenceReference: updated.evidenceReference,
      metadata: {
        paymentHandoffReady: true
      }
    })
    return updated
  })
}

export async function markExpenseRequestPaymentHandoffReady(
  session: SessionContext,
  input: ExpenseRequestActionInput
) {
  await requirePermission(session, permissions.financeExpenseRequestComplete)
  const reason = input.reason?.trim()
  if (!reason) {
    throw new Error("EXPENSE_REQUEST_HANDOFF_REASON_REQUIRED")
  }
  return prisma.$transaction(async (tx) => {
    const request = await getScopedExpenseRequestOrThrow(
      tx,
      session,
      input.expenseRequestId
    )
    assertExpenseTransition({
      transition: "mark_handoff_ready",
      status: request.status
    })
    assertEvidence(
      input.evidenceReference ?? request.evidenceReference,
      "EXPENSE_REQUEST_HANDOFF_EVIDENCE_REQUIRED"
    )
    await writeExpenseAudit(tx, {
      session,
      requestId: request.id,
      eventType: "expense_request.payment_handoff_ready",
      beforeStatus: request.status,
      afterStatus: request.status,
      reason,
      evidenceReference: input.evidenceReference ?? request.evidenceReference,
      metadata: {
        paymentHandoffReady: true,
        handoffRecordCreated: false,
        handoffBoundary:
          "ready_marker_only_payment_request_or_ap_creation_deferred"
      }
    })
    return {
      expenseRequestId: request.id,
      status: request.status,
      paymentHandoffReady: true,
      handoffRecordCreated: false
    }
  })
}

export async function createExpenseRequestApInvoiceDraft(
  session: SessionContext,
  input: ExpenseRequestApHandoffInput
) {
  await requirePermission(session, permissions.financeExpenseRequestComplete)
  await requirePermission(session, permissions.financeApInvoiceCreate)
  const reason = input.reason?.trim()
  if (!reason) {
    throw new Error("EXPENSE_REQUEST_AP_HANDOFF_REASON_REQUIRED")
  }

  return prisma.$transaction(async (tx) => {
    const request = await getScopedExpenseRequestOrThrow(
      tx,
      session,
      input.expenseRequestId
    )
    if (!["APPROVED", "COMPLETED"].includes(request.status)) {
      throw new Error("EXPENSE_REQUEST_AP_HANDOFF_STATUS_INVALID")
    }
    if (request.currencyCode !== "PHP") {
      throw new Error("EXPENSE_REQUEST_AP_HANDOFF_PHP_ONLY")
    }
    if (!request.supplierId) {
      throw new Error("EXPENSE_REQUEST_AP_HANDOFF_SUPPLIER_REQUIRED")
    }
    if (request.requestedByUserId === request.approvedByUserId) {
      throw new Error("EXPENSE_REQUEST_HANDOFF_SELF_APPROVAL_BLOCKED")
    }
    if (request.requestedByUserId === session.user.id) {
      throw new Error("EXPENSE_REQUEST_HANDOFF_SELF_SERVICE_BLOCKED")
    }
    assertEvidence(
      input.evidenceReference ?? request.evidenceReference,
      "EXPENSE_REQUEST_AP_HANDOFF_EVIDENCE_REQUIRED"
    )
    if (
      request.lines.length === 0 ||
      decimalToNumber(request.totalRequestedAmount) <= 0
    ) {
      throw new Error("EXPENSE_REQUEST_AP_HANDOFF_AMOUNT_REQUIRED")
    }

    const existingLink = request.sourceLinks.find(
      (link) =>
        link.sourceDocumentType === "AP_INVOICE" &&
        link.sourceEventKey === "expense_ap_invoice_handoff_v1"
    )
    if (existingLink) {
      const existingInvoice = await tx.apInvoice.findFirst({
        where: {
          id: existingLink.sourceDocumentId,
          tenantId: session.context.tenantId,
          companyId: session.context.companyId
        },
        include: { lines: true }
      })
      if (existingInvoice) {
        return {
          expenseRequestId: request.id,
          apInvoiceId: existingInvoice.id,
          publicReference: existingInvoice.publicReference,
          created: false
        }
      }
    }

    const supplier = await tx.supplier.findFirst({
      where: {
        id: request.supplierId,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        status: "ACTIVE"
      },
      select: { id: true }
    })
    if (!supplier) {
      throw new Error("EXPENSE_REQUEST_AP_HANDOFF_SUPPLIER_NOT_ACTIVE")
    }

    const lines = request.lines.map((line, index) => {
      const requestedAmount = decimalToNumber(line.requestedAmountPhp)
      const taxAmount = decimalToNumber(line.taxAmountPhp)
      const discountAmount = decimalToNumber(line.discountAmountPhp)
      const lineTotalAmount = decimalToNumber(line.lineTotalPhp)
      if (lineTotalAmount <= 0) {
        throw new Error("EXPENSE_REQUEST_AP_HANDOFF_LINE_AMOUNT_REQUIRED")
      }
      return {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        lineNumber: index + 1,
        purchaseOrderLineId: null,
        goodsReceiptLineId: null,
        itemId: null,
        uomId: null,
        description: line.description,
        invoicedQty: 1,
        unitPrice: requestedAmount,
        taxAmount,
        discountAmount,
        lineTotalAmount
      }
    })
    const subtotalAmount = roundMoney(
      lines.reduce((sum, line) => sum + line.unitPrice, 0)
    )
    const taxAmount = roundMoney(
      lines.reduce((sum, line) => sum + line.taxAmount, 0)
    )
    const discountAmount = roundMoney(
      lines.reduce((sum, line) => sum + line.discountAmount, 0)
    )
    const totalAmount = roundMoney(
      lines.reduce((sum, line) => sum + line.lineTotalAmount, 0)
    )
    if (totalAmount <= 0) {
      throw new Error("EXPENSE_REQUEST_AP_HANDOFF_AMOUNT_REQUIRED")
    }

    const supplierInvoiceNumber =
      input.supplierInvoiceNumber?.trim() || `EXP-${request.publicReference}`
    const idempotencyKey =
      input.idempotencyKey?.trim() || `expense-ap-invoice:${request.id}:v1`
    const duplicate = await tx.apInvoice.findFirst({
      where: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        supplierId: request.supplierId,
        supplierInvoiceNumber,
        status: { notIn: ["CANCELLED", "REVERSED"] }
      },
      select: { id: true, publicReference: true }
    })
    if (duplicate) {
      throw new Error("EXPENSE_REQUEST_AP_HANDOFF_DUPLICATE_INVOICE")
    }

    const publicReference = await nextExpenseApInvoiceReference(
      session.context.companyId
    )
    const invoice = await tx.apInvoice.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        publicReference,
        supplierId: request.supplierId,
        locationId: request.locationId,
        currencyCode: "PHP",
        supplierInvoiceNumber,
        invoiceDate: input.invoiceDate ?? new Date(),
        receivedAt: new Date(),
        dueDate: input.dueDate ?? null,
        paymentTermsDays: input.paymentTermsDays ?? null,
        subtotalAmount,
        taxAmount,
        discountAmount,
        freightAmount: 0,
        totalAmount,
        status: "DRAFT",
        matchStatus: "NOT_EVALUATED",
        duplicateRisk: "CLEAN",
        captureIdempotencyKey: idempotencyKey,
        nonPoReason: `Expense request handoff: ${reason}`,
        evidenceReference:
          input.evidenceReference?.trim() ?? request.evidenceReference,
        createdByUserId: session.user.id,
        lines: {
          createMany: { data: lines }
        }
      },
      include: { lines: true }
    })

    await tx.expenseRequestSourceLink.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        expenseRequestId: request.id,
        sourceDocumentType: "AP_INVOICE",
        sourceDocumentId: invoice.id,
        sourceEventKey: "expense_ap_invoice_handoff_v1",
        sourceAmountSnapshotPhp: totalAmount,
        remainingAmountSnapshotPhp: totalAmount,
        sourceDocumentSnapshot: {
          publicReference: invoice.publicReference,
          supplierInvoiceNumber,
          status: invoice.status,
          totalAmount,
          reason,
          boundary:
            "expense_to_ap_invoice_draft_only_no_payment_release_no_journal"
        },
        createdByUserId: session.user.id
      }
    })

    await writeExpenseAudit(tx, {
      session,
      requestId: request.id,
      eventType: "expense_request.ap_invoice_draft_created",
      beforeStatus: request.status,
      afterStatus: request.status,
      reason,
      evidenceReference: input.evidenceReference ?? request.evidenceReference,
      metadata: {
        apInvoiceId: invoice.id,
        apInvoiceReference: invoice.publicReference,
        idempotencyKey,
        noPaymentCreation: true,
        noPaymentRelease: true,
        noJournalPosting: true,
        noSourceMutation: true
      }
    })
    await tx.auditEvent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        actorUserId: session.user.id,
        eventType: "ap_invoice.created_from_expense_request",
        entityType: "ApInvoice",
        entityId: invoice.id,
        afterData: {
          status: invoice.status,
          publicReference: invoice.publicReference,
          supplierInvoiceNumber,
          totalAmount
        },
        metadata: {
          expenseRequestId: request.id,
          expenseRequestReference: request.publicReference,
          sourceLinkCreated: true,
          noPaymentCreation: true,
          noPaymentRelease: true,
          noJournalPosting: true,
          noSourceMutation: true
        }
      }
    })

    return {
      expenseRequestId: request.id,
      apInvoiceId: invoice.id,
      publicReference: invoice.publicReference,
      created: true
    }
  })
}

export async function getExpenseRequestDashboard(
  session: SessionContext
): Promise<ExpenseRequestDashboard> {
  if (!canUseFinance(await getGrantedPermissionCodes(session))) {
    throw new Error("PERMISSION_DENIED")
  }
  await requirePermission(session, permissions.financeExpenseRequestView)

  const authorizedLocationIds = session.authorizedLocations.map(
    (location) => location.locationId
  )

  const requests = await prisma.expenseRequest.findMany({
    where: {
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      locationId: { in: authorizedLocationIds }
    },
    include: {
      requestedBy: { select: { displayName: true } },
      location: { select: { name: true } },
      supplier: { select: { legalName: true, tradingName: true } },
      lines: { select: { id: true } },
      sourceLinks: { select: { id: true } }
    },
    orderBy: { createdAt: "desc" },
    take: 50
  })

  const rows = buildExpenseRequestRows(requests)
  const reportRows = buildExpenseRequestReportRows(rows)
  const openRows = rows.filter((row) =>
    [
      "SUBMITTED",
      "AWAITING_APPROVAL",
      "APPROVED",
      "IN_PROGRESS",
      "ON_HOLD"
    ].includes(row.status)
  )
  const pendingApprovalRows = rows.filter(
    (row) => row.status === "AWAITING_APPROVAL"
  )
  const overBudgetRows = rows.filter(
    (row) => row.budgetStatus === "OVER_BUDGET"
  )
  const totalOpenAmount = openRows.reduce(
    (sum, row) => sum + row.totalRequestedAmount,
    0
  )

  const [suppliers, budgetLines, apHandoffLinks, handoffPolicy] =
    await Promise.all([
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
      prisma.budgetLine.findMany({
        where: {
          tenantId: session.context.tenantId,
          companyId: session.context.companyId,
          status: "ACTIVE",
          budget: { status: { in: ["ACTIVE", "PARTIALLY_RELEASED"] } },
          OR: [
            { locationId: null },
            { locationId: { in: authorizedLocationIds } }
          ]
        },
        select: {
          id: true,
          code: true,
          name: true,
          revisedAmountPhp: true,
          location: { select: { name: true } },
          budget: { select: { publicReference: true, name: true } }
        },
        orderBy: [{ budget: { publicReference: "asc" } }, { code: "asc" }],
        take: 100
      }),
      prisma.expenseRequestSourceLink.findMany({
        where: {
          tenantId: session.context.tenantId,
          companyId: session.context.companyId,
          sourceDocumentType: "AP_INVOICE",
          sourceEventKey: "expense_ap_invoice_handoff_v1",
          expenseRequest: {
            locationId: { in: authorizedLocationIds }
          }
        },
        include: {
          createdBy: { select: { displayName: true } },
          expenseRequest: {
            select: {
              publicReference: true,
              title: true,
              location: { select: { name: true } },
              supplier: { select: { legalName: true, tradingName: true } }
            }
          }
        },
        orderBy: [{ createdAt: "desc" }],
        take: 50
      }),
      getExpenseRequestHandoffPolicy(session)
    ])
  const apHandoffRows = buildExpenseRequestApHandoffRows(apHandoffLinks)

  return {
    generatedAt: new Date().toISOString(),
    handoffPolicy,
    permissions: {
      canCreate: session.permissionCodes.includes(
        permissions.financeExpenseRequestCreate
      ),
      canSubmit: session.permissionCodes.includes(
        permissions.financeExpenseRequestSubmit
      ),
      canApprove: session.permissionCodes.includes(
        permissions.financeExpenseRequestApprove
      ),
      canComplete: session.permissionCodes.includes(
        permissions.financeExpenseRequestComplete
      )
    },
    draftOptions: {
      locations: session.authorizedLocations.map((location) => ({
        id: location.locationId,
        label: location.locationName,
        detail: `${location.companyName} / ${location.brandName || "Company-wide"} / ${location.locationType}`
      })),
      suppliers: suppliers.map((supplier) => ({
        id: supplier.id,
        label: `${supplier.supplierCode} / ${
          supplier.tradingName ?? supplier.legalName
        }`,
        detail: supplier.legalName
      })),
      budgetLines: budgetLines.map((line) => ({
        id: line.id,
        label: `${line.code} / ${line.name}`,
        detail: `${line.budget.publicReference} / ${
          line.location?.name ?? "Company-wide"
        } / ${money(decimalToNumber(line.revisedAmountPhp))}`
      })),
      categories: expenseCategoryOptions
    },
    metrics: [
      {
        id: "open-expense-requests",
        label: "Open requests",
        displayValue: number(openRows.length),
        detail:
          "Submitted, approved, in-progress, or on-hold expense requests in scope.",
        tone: openRows.length > 0 ? "info" : "neutral"
      },
      {
        id: "pending-approval",
        label: "Pending approval",
        displayValue: number(pendingApprovalRows.length),
        detail:
          "Requests waiting for a scoped approver. Requesters cannot approve their own.",
        tone: pendingApprovalRows.length > 0 ? "warning" : "success"
      },
      {
        id: "open-value",
        label: "Open value",
        displayValue: money(totalOpenAmount),
        detail:
          "PHP-only requested value. This is not a payment, AP settlement, or journal.",
        tone: totalOpenAmount > 0 ? "info" : "neutral"
      },
      {
        id: "budget-exceptions",
        label: "Budget exceptions",
        displayValue: number(overBudgetRows.length),
        detail: "Warning-first budget exceptions captured for finance review.",
        tone: overBudgetRows.length > 0 ? "destructive" : "success"
      }
    ],
    requests: rows,
    reportRows,
    apHandoffRows,
    guardrails: [
      {
        label: "Expense requests are source records",
        detail:
          "This workspace captures operational expense intent, lifecycle decisions, and evidence. It does not create payments, release cash, post journals, or settle AP.",
        tone: "success"
      },
      {
        label: "Budget is warning-first",
        detail:
          "Budget status is stored as visibility and review context. Hard budget blocking remains pending policy and UAT.",
        tone: "info"
      },
      {
        label: "Scope and SoD remain server-side",
        detail:
          "Expense records are filtered by authorized locations and approval permissions are enforced in services, not only in the UI.",
        tone: "success"
      },
      {
        label: "Payment handoff is gated",
        detail:
          "Completion can mark a request ready for payment/AP handoff, but the actual payment or AP artifact is intentionally deferred to a separate controlled workflow.",
        tone: "info"
      }
    ]
  }
}
