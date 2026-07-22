import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  execute: vi.fn()
}))

vi.mock("@ogfi/database", () => ({
  prisma: { approvalInstance: { findMany: mocks.findMany } }
}))

vi.mock("./approvals", () => ({
  executeCanonicalApprovalDecision: mocks.execute
}))

import {
  assertAuthoritativeApprovalEvidence,
  assertLegacyApprovalDecisionAllowed,
  assertPaymentRequestApprovalPolicyConfirmed,
  canonicalApprovalDecisionsEnabled
} from "./approvalDecisionMode"
import type { SessionContext } from "./context"
import {
  routeSourceWorkspaceApprovalDecision,
  type SourceApprovalDecisionInput
} from "./sourceApprovalDecisionBridge"

const originalFlag = process.env.APPROVAL_ROUTING_V1_ENABLED
const sessionFixture = {
  user: { id: "10000000-0000-0000-0000-000000000001" },
  context: {
    tenantId: "20000000-0000-0000-0000-000000000001",
    companyId: "30000000-0000-0000-0000-000000000001"
  },
  permissionCodes: []
}
const session = sessionFixture as unknown as SessionContext

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  if (originalFlag == null) {
    delete process.env.APPROVAL_ROUTING_V1_ENABLED
  } else {
    process.env.APPROVAL_ROUTING_V1_ENABLED = originalFlag
  }
})

describe("source approval decision bridge", () => {
  test("keeps legacy Payment Request approval available only while canonical routing is disabled", () => {
    process.env.APPROVAL_ROUTING_V1_ENABLED = "false"
    expect(() => assertPaymentRequestApprovalPolicyConfirmed()).not.toThrow()

    process.env.APPROVAL_ROUTING_V1_ENABLED = "true"
    expect(() => assertPaymentRequestApprovalPolicyConfirmed()).toThrow(
      "PAYMENT_REQUEST_APPROVAL_POLICY_UNCONFIRMED"
    )
  })

  test("qualifies required evidence from the authoritative source only", () => {
    expect(() =>
      assertAuthoritativeApprovalEvidence(
        "fixture://source/evidence",
        "SOURCE_EVIDENCE_REQUIRED"
      )
    ).not.toThrow()
    expect(() =>
      assertAuthoritativeApprovalEvidence(null, "SOURCE_EVIDENCE_REQUIRED")
    ).toThrow("SOURCE_EVIDENCE_REQUIRED")
    expect(() =>
      assertAuthoritativeApprovalEvidence("   ", "SOURCE_EVIDENCE_REQUIRED")
    ).toThrow("SOURCE_EVIDENCE_REQUIRED")
  })

  test("preserves legacy mode without querying or dispatching", async () => {
    process.env.APPROVAL_ROUTING_V1_ENABLED = "false"
    expect(canonicalApprovalDecisionsEnabled()).toBe(false)
    expect(() => assertLegacyApprovalDecisionAllowed()).not.toThrow()

    await expect(
      routeSourceWorkspaceApprovalDecision(session, {
        documentType: "ExpenseRequest",
        documentId: "40000000-0000-0000-0000-000000000001",
        action: "approve",
        evidenceReference: "LEGACY-EVIDENCE"
      })
    ).resolves.toBe(false)
    expect(mocks.findMany).not.toHaveBeenCalled()
    expect(mocks.execute).not.toHaveBeenCalled()
  })

  test.each([
    ["approve", "APPROVE"],
    ["return", "RETURN"],
    ["reject", "REJECT"]
  ] as const)("dispatches %s through the exact pending approval", async (action, decision) => {
    process.env.APPROVAL_ROUTING_V1_ENABLED = "true"
    mocks.findMany.mockResolvedValue([{ id: "50000000-0000-0000-0000-000000000001" }])

    await expect(
      routeSourceWorkspaceApprovalDecision(session, {
        documentType: "ExpenseRequest",
        documentId: "40000000-0000-0000-0000-000000000001",
        action,
        remarks: "Controlled decision"
      })
    ).resolves.toBe(true)

    expect(mocks.findMany).toHaveBeenCalledWith({
      where: {
        tenantId: sessionFixture.context.tenantId,
        companyId: sessionFixture.context.companyId,
        documentType: "ExpenseRequest",
        documentId: "40000000-0000-0000-0000-000000000001",
        status: "PENDING"
      },
      orderBy: { createdAt: "asc" },
      take: 2,
      select: { id: true }
    })
    expect(mocks.execute).toHaveBeenCalledWith({
      approvalInstanceId: "50000000-0000-0000-0000-000000000001",
      family: "ExpenseRequest",
      decision,
      remarks: "Controlled decision"
    })
  })

  test.each([
    "BudgetRevision",
    "ExpenseRequest",
    "CashAdvanceRequest",
    "PettyCashRequest",
    "EmployeeLeaveRequest",
    "EmployeeOvertimeRecord",
    "WorkforceSchedule"
  ] as const)("forwards evidenceReference for %s decisions", async (documentType) => {
    process.env.APPROVAL_ROUTING_V1_ENABLED = "true"
    mocks.findMany.mockResolvedValue([{ id: "50000000-0000-0000-0000-000000000001" }])

    await routeSourceWorkspaceApprovalDecision(session, {
      documentType,
      documentId: "40000000-0000-0000-0000-000000000001",
      action: "approve",
      evidenceReference: "CONTROLLED-EVIDENCE"
    })

    expect(mocks.execute).toHaveBeenCalledWith(
      expect.objectContaining({ evidenceReference: "CONTROLLED-EVIDENCE" })
    )
  })

  test("does not forward an injected Petty Cash amount override", async () => {
    process.env.APPROVAL_ROUTING_V1_ENABLED = "true"
    mocks.findMany.mockResolvedValue([{ id: "50000000-0000-0000-0000-000000000001" }])

    const unsafePettyCashInput = {
      documentType: "PettyCashRequest",
      documentId: "40000000-0000-0000-0000-000000000001",
      action: "approve",
      approvedAmountPhp: 0
    } as unknown as SourceApprovalDecisionInput

    await routeSourceWorkspaceApprovalDecision(session, unsafePettyCashInput)

    expect(mocks.execute).toHaveBeenCalledWith({
      approvalInstanceId: "50000000-0000-0000-0000-000000000001",
      family: "PettyCashRequest",
      decision: "APPROVE"
    })
  })

  test("does not leak fields into a document family that does not support them", async () => {
    process.env.APPROVAL_ROUTING_V1_ENABLED = "true"
    mocks.findMany.mockResolvedValue([{ id: "50000000-0000-0000-0000-000000000001" }])
    const unsafePaymentInput = {
      documentType: "PaymentRequest",
      documentId: "40000000-0000-0000-0000-000000000001",
      action: "approve",
      remarks: "Invoice eligibility stays server-derived",
      evidenceReference: "MUST-NOT-FORWARD",
      approvedAmountPhp: 42,
      apInvoiceId: "60000000-0000-0000-0000-000000000001"
    } as unknown as SourceApprovalDecisionInput

    await routeSourceWorkspaceApprovalDecision(session, unsafePaymentInput)

    expect(mocks.execute).toHaveBeenCalledWith({
      approvalInstanceId: "50000000-0000-0000-0000-000000000001",
      family: "PaymentRequest",
      decision: "APPROVE",
      remarks: "Invoice eligibility stays server-derived"
    })
  })

  test("does not forward approve-only Petty Cash fields on rejection", async () => {
    process.env.APPROVAL_ROUTING_V1_ENABLED = "true"
    mocks.findMany.mockResolvedValue([{ id: "50000000-0000-0000-0000-000000000001" }])
    const unsafeRejectInput = {
      documentType: "PettyCashRequest",
      documentId: "40000000-0000-0000-0000-000000000001",
      action: "reject",
      remarks: "Rejected with a controlled reason",
      approvedAmountPhp: 25
    } as unknown as SourceApprovalDecisionInput

    await routeSourceWorkspaceApprovalDecision(session, unsafeRejectInput)

    expect(mocks.execute).toHaveBeenCalledWith({
      approvalInstanceId: "50000000-0000-0000-0000-000000000001",
      family: "PettyCashRequest",
      decision: "REJECT",
      remarks: "Rejected with a controlled reason"
    })
  })

  test.each([
    [[], "SOURCE_APPROVAL_INSTANCE_NOT_FOUND"],
    [
      [
        { id: "50000000-0000-0000-0000-000000000001" },
        { id: "50000000-0000-0000-0000-000000000002" }
      ],
      "SOURCE_APPROVAL_INSTANCE_AMBIGUOUS"
    ]
  ])("fails closed when pending tuple resolution is not exact", async (rows, error) => {
    process.env.APPROVAL_ROUTING_V1_ENABLED = "true"
    mocks.findMany.mockResolvedValue(rows)

    await expect(
      routeSourceWorkspaceApprovalDecision(session, {
        documentType: "ExpenseRequest",
        documentId: "40000000-0000-0000-0000-000000000001",
        action: "approve"
      })
    ).rejects.toThrow(error as string)
    expect(mocks.execute).not.toHaveBeenCalled()
  })

  test("blocks direct legacy decisions when canonical mode is enabled", () => {
    process.env.APPROVAL_ROUTING_V1_ENABLED = "true"
    expect(canonicalApprovalDecisionsEnabled()).toBe(true)
    expect(() => assertLegacyApprovalDecisionAllowed()).toThrow(
      "LEGACY_APPROVAL_DECISION_DISABLED"
    )
  })
})
