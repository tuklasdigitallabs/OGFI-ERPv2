import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const source = readFileSync(new URL("./stockCounts.ts", import.meta.url), "utf8");
const submit = source.slice(source.indexOf("export async function submitStockCount"));
const review = source.slice(source.indexOf("export async function reviewStockCount"));
const cancel = source.slice(source.indexOf("export async function cancelStockCount"));

describe("stock count ordinary review approval adapter", () => {
  test("uses the producer barrier for both admitted and default-off submit paths", () => {
    expect(submit).toContain(
      'process.env.STOCK_COUNT_ATTEMPT_REVIEW_APPROVAL_V1_ENABLED === "true"'
    );
    expect(submit).toContain("await withApprovalProducerTransaction({");
    expect(submit).not.toContain(": prisma.$transaction(action)");
    expect(submit).toContain("classifyStockCountAttemptForPilotApproval");
  });

  test("treats an environment switch as denial-only and blocks direct-review bypasses", () => {
    expect(source).toContain("assertLegacyStockCountReviewIsAllowed");
    expect(source).toContain("INVENTORY_PILOT_APPROVAL_ERRORS.DISABLED");
    expect(source).toContain("INVENTORY_PILOT_APPROVAL_ERRORS.SCOPE_MISMATCH");
    expect(source).toContain(
      "INVENTORY_PILOT_APPROVAL_ERRORS.ENDPOINT_CAPABILITY_MISMATCH"
    );
    expect(submit).toContain('count, "SUBMIT"');
    expect(review).toContain('"REVALIDATE"');
    expect(review).toContain("STOCK_COUNT_ATTEMPT_REVIEW_APPROVAL_REQUIRED");
    expect(review).toContain("await withApprovalProducerTransaction({");
  });

  test("admits only the locked current attempt and creates the normalized graph and intent", () => {
    expect(submit).toContain("lockCurrentStockCountAttemptForApproval");
    expect(submit).toContain('documentType: "StockCountAttemptReview"');
    expect(submit).toContain("definitionSealed: true");
    expect(submit).toContain("configureApprovalStepRouting(tx");
    expect(submit).toContain("stockCountReviewSubmissionIntent.create");
    expect(submit).toContain("currentAttemptId: locked.attempt.id");
    expect(submit).toContain("version: { increment: 1 }");
  });

  test("locks exact current-attempt counter rows without PostgreSQL's unsupported distinct-lock combination", () => {
    const prohibitedActors = source.slice(
      source.indexOf("async function allStockCountApprovalProhibitedActors"),
      source.indexOf("async function assertLegacyStockCountReviewIsAllowed")
    );
    expect(prohibitedActors).toContain('WHERE a.id = ${attempt.id}::uuid');
    expect(prohibitedActors).toContain('a."stockCountSessionId" = ${count.id}::uuid');
    expect(prohibitedActors).toContain('a."tenantId" = ${session.context.tenantId}::uuid');
    expect(prohibitedActors).toContain('a."companyId" = ${session.context.companyId}::uuid');
    expect(prohibitedActors).toContain('al."inventoryLocationId" = ${count.inventoryLocationId}::uuid');
    expect(prohibitedActors).toContain("FOR UPDATE OF a, al");
    expect(prohibitedActors).not.toMatch(/SELECT\s+DISTINCT[\s\S]*FOR UPDATE/i);
  });

  test("handles exact replay and fails closed for idempotency or attempt-link conflicts", () => {
    expect(submit).toContain("STOCK_COUNT_APPROVAL_IDEMPOTENCY_KEY_REQUIRED");
    expect(submit).toContain("STOCK_COUNT_APPROVAL_IDEMPOTENCY_CONFLICT");
    expect(submit).toContain("replay.requestCanonicalJson !== request.canonicalJson");
    expect(submit).toContain("count.currentAttemptId !== locked.attempt.id");
    expect(submit).toContain("currentActivation.currentActivationEventId !== replay.activationEventId");
    expect(submit).toContain("currentActivation.generation !== replay.activationGeneration");
    expect(submit).not.toContain("count.version !== replay.sessionVersionAfter");
    expect(submit).not.toContain("locked.attempt.version !== replay.attemptVersionAfter");
  });

  test("writes source versions, intent, audit, and notification in one producer transaction", () => {
    const sessionCas = submit.indexOf("const submitted = await tx.stockCountSession.updateMany");
    const attemptCas = submit.indexOf("const attemptSubmitted = await tx.$executeRaw");
    const intent = submit.indexOf("stockCountReviewSubmissionIntent.create");
    const audit = submit.indexOf("eventType: \"stock_count.submitted\"");
    const notification = submit.indexOf("recordWorkflowNotifications(tx");
    expect(sessionCas).toBeGreaterThan(-1);
    expect(attemptCas).toBeGreaterThan(sessionCas);
    expect(intent).toBeGreaterThan(attemptCas);
    expect(audit).toBeGreaterThan(intent);
    expect(notification).toBeGreaterThan(audit);
  });

  test("cancels an admitted pending review through its immutable exact intent and locked graph", () => {
    const intentRead = cancel.indexOf('FROM "StockCountReviewSubmissionIntent" i');
    const graphLock = cancel.indexOf('FOR UPDATE OF ai');
    const termination = cancel.indexOf("terminatePendingApprovalForCancellation");
    const sessionCas = cancel.indexOf("const cancelled = await tx.stockCountSession.updateMany");
    expect(intentRead).toBeGreaterThan(-1);
    expect(cancel).not.toContain('FOR UPDATE OF i');
    expect(graphLock).toBeGreaterThan(intentRead);
    expect(termination).toBeGreaterThan(graphLock);
    expect(sessionCas).toBeGreaterThan(termination);
    expect(cancel).toContain("STOCK_COUNT_CANCELLATION_APPROVAL_LINEAGE_CONFLICT");
    expect(cancel).toContain('documentType: "StockCountAttemptReview"');
    expect(cancel).toContain("forceWhenDisabled: true");
    expect(cancel).toContain("attemptVersionAfter !== count.currentAttemptVersion");
    expect(cancel).toContain("sessionVersionAfter !== count.version");
    expect(cancel).toContain("approvalInstanceId: intent?.approvalInstanceId ?? null");
  });
});
