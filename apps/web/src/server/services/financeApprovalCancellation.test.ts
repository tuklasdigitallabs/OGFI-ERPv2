import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, test } from "vitest"

function exportedFunction(fileName: string, functionName: string) {
  const source = readFileSync(path.resolve(__dirname, fileName), "utf8")
  const start = source.indexOf(`export async function ${functionName}`)
  expect(start).toBeGreaterThanOrEqual(0)
  const next = source.indexOf("\nexport async function ", start + 1)
  return source.slice(start, next < 0 ? undefined : next)
}

const cases = [
  ["budgetControl.ts", "cancelBudgetRevision", "BudgetRevision", "BUDGET_REVISION_CANCELLATION_CONFLICT"],
  ["expenseRequests.ts", "cancelExpenseRequest", "ExpenseRequest", "EXPENSE_REQUEST_CANCELLATION_CONFLICT"],
  ["cashAdvances.ts", "cancelCashAdvanceRequest", "CashAdvanceRequest", "CASH_ADVANCE_CANCELLATION_CONFLICT"],
  ["pettyCash.ts", "cancelPettyCashRequest", "PettyCashRequest", "PETTY_CASH_REQUEST_CANCELLATION_CONFLICT"],
  ["finance.ts", "cancelPaymentRequest", "PaymentRequest", "PAYMENT_REQUEST_CANCELLATION_CONFLICT"],
  ["finance.ts", "cancelPaymentRelease", "PaymentRelease", "PAYMENT_RELEASE_CANCELLATION_CONFLICT"],
  ["financePeriodClose.ts", "cancelPeriodCloseRun", "FinanceCloseRun", "PERIOD_CLOSE_CANCELLATION_CONFLICT"]
] as const

describe("finance source cancellation integration", () => {
  for (const [fileName, functionName, documentType, conflictError] of cases) {
    test(`${functionName} terminates approval before scoped source CAS`, () => {
      const source = exportedFunction(fileName, functionName)
      const termination = source.indexOf("terminatePendingApprovalForCancellation")
      const sourceCas = source.indexOf(".updateMany(", termination)
      expect(termination).toBeGreaterThanOrEqual(0)
      expect(sourceCas).toBeGreaterThan(termination)
      expect(source).toContain(`documentType: "${documentType}"`)
      expect(source).toContain("tenantId: session.context.tenantId")
      expect(source).toContain("companyId: session.context.companyId")
      expect(source).toContain("status:")
      expect(source).toContain(conflictError)
      expect(source).toContain("approvalTerminationMode")
      expect(source).toContain("approvalInstanceId")
    })
  }

  test("pending source states require an approval while post-approval-only families are optional", () => {
    for (const [fileName, functionName] of cases.slice(0, 5)) {
      expect(exportedFunction(fileName, functionName)).toContain("APPROVAL_REQUIRED")
    }
    expect(exportedFunction("finance.ts", "cancelPaymentRelease")).toContain('policy: "APPROVAL_OPTIONAL"')
    expect(exportedFunction("financePeriodClose.ts", "cancelPeriodCloseRun")).toContain('policy: "APPROVAL_OPTIONAL"')
  })
})
