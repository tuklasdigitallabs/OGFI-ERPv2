import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { supportedApprovalDocumentTypes } from "./approvalRoutingRegistry";

function serviceSource(fileName: string) {
  return readFileSync(path.resolve(__dirname, fileName), "utf8");
}

function exportedFunction(source: string, functionName: string) {
  const start = source.indexOf(`export async function ${functionName}`);
  expect(start, `${functionName} exists`).toBeGreaterThanOrEqual(0);
  const next = source.indexOf("\nexport async function ", start + 1);
  return source.slice(start, next < 0 ? undefined : next);
}

const producerManifest = [
  ["purchaseRequests.ts", "submitPurchaseRequest", "PurchaseRequest"],
  ["quotes.ts", "submitQuotationRecommendation", "QuotationRecommendation"],
  ["purchaseOrders.ts", "submitPurchaseOrderForApproval", "PurchaseOrder"],
  ["purchaseOrders.ts", "requestPurchaseOrderBalanceClosure", "PurchaseOrderBalanceClosure"],
  ["purchaseOrders.ts", "requestPurchaseOrderAmendment", "PurchaseOrderAmendment"],
  ["wastage.ts", "submitWastageReport", "WastageReport"],
  ["stockAdjustments.ts", "submitStockAdjustment", "StockAdjustment"],
  ["financePeriodClose.ts", "requestPeriodCloseSensitiveActionApproval", "FinanceCloseRun"],
  ["budgetControl.ts", "submitBudgetRevisionForReview", "BudgetRevision"],
  ["expenseRequests.ts", "submitExpenseRequestForApproval", "ExpenseRequest"],
  ["cashAdvances.ts", "submitCashAdvanceForApproval", "CashAdvanceRequest"],
  ["pettyCash.ts", "submitPettyCashRequest", "PettyCashRequest"],
  ["finance.ts", "submitPaymentRequest", "PaymentRequest"],
  ["finance.ts", "createPaymentReleaseDraft", "PaymentRelease"],
  ["workforce.ts", "submitLeaveRequest", "EmployeeLeaveRequest"],
  ["workforce.ts", "submitOvertimeRecord", "EmployeeOvertimeRecord"],
  ["workforce.ts", "submitWorkforceSchedule", "WorkforceSchedule"],
  ["workforce.ts", "reviewAttendanceImportBatch", "AttendanceImportBatch"],
] as const;

describe("approval producer shared-lock participation", () => {
  test("calls the database barrier before invoking the producer body", () => {
    const source = serviceSource("approvalProducerBarrier.ts");
    const transactionAt = source.indexOf("prisma.$transaction");
    const barrierAt = source.indexOf(
      "public.acquire_approval_routing_producer_barrier_shared",
      transactionAt,
    );
    const actionAt = source.indexOf("return action(tx)", transactionAt);

    expect(transactionAt).toBeGreaterThanOrEqual(0);
    expect(barrierAt).toBeGreaterThan(transactionAt);
    expect(actionAt).toBeGreaterThan(barrierAt);
    expect(source).toContain("await tx.$executeRaw`");
    expect(source).not.toContain("await tx.$queryRaw`");
    expect(source).not.toMatch(/generation|provenance|readiness|certif|mappingHash|capabilityHash/i);
  });

  test("covers the exact closed 18-family producer registry with literals", () => {
    expect(producerManifest).toHaveLength(18);
    expect(producerManifest.map(([, , family]) => family).sort()).toEqual(
      [...supportedApprovalDocumentTypes].sort(),
    );

    const sources = new Map(
      [...new Set(producerManifest.map(([fileName]) => fileName))].map(
        (fileName) => [fileName, serviceSource(fileName)],
      ),
    );

    for (const [fileName, functionName, documentType] of producerManifest) {
      const source = exportedFunction(sources.get(fileName)!, functionName);
      expect(source.match(/withApprovalProducerTransaction\(/g)).toHaveLength(1);
      expect(source).toMatch(
        new RegExp(
          `withApprovalProducerTransaction\\(\\s*\\{[\\s\\S]*?documentType:\\s*"${documentType}"[\\s\\S]*?\\},\\s*async \\(tx\\)`,
        ),
      );
    }

    const combinedSource = [...sources.values()].join("\n");
    const wrapperCalls = combinedSource.match(/withApprovalProducerTransaction\(/g) ?? [];
    const literalCalls = combinedSource.match(
      /withApprovalProducerTransaction\(\s*\{[\s\S]*?documentType:\s*"[A-Za-z]+"[\s\S]*?\},\s*async \(tx\)/g,
    ) ?? [];
    // The registry covers 18 producer families; terminal and lifecycle
    // writers in those same services also participate in the shared barrier.
    expect(wrapperCalls).toHaveLength(34);
    expect(literalCalls).toHaveLength(34);
  });
});
