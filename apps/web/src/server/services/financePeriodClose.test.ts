import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildPeriodCloseDashboard,
  buildPeriodCloseRunRows
} from "./financePeriodClose";
import type { SessionContext } from "./context";

const serviceSource = readFileSync(
  path.resolve(__dirname, "financePeriodClose.ts"),
  "utf8"
);
const pageSource = readFileSync(
  path.resolve(__dirname, "../../app/(app)/finance/period-close/page.tsx"),
  "utf8"
);
const exportRouteSource = readFileSync(
  path.resolve(
    __dirname,
    "../../app/(app)/finance/period-close/export/route.ts"
  ),
  "utf8"
);

function functionSlice(source: string, functionName: string) {
  const start = source.indexOf(`export async function ${functionName}`);
  if (start === -1) {
    return "";
  }
  const nextExport = source.indexOf("\nexport ", start + 1);
  return source.slice(start, nextExport === -1 ? undefined : nextExport);
}

const period = {
  code: "2026-07",
  name: "July 2026",
  status: "OPEN",
  startDate: new Date("2026-07-01T00:00:00.000Z"),
  endDate: new Date("2026-07-31T23:59:59.000Z")
};

const session: SessionContext = {
  user: {
    id: "user-1",
    email: "finance@example.test",
    displayName: "Finance User",
    role: "Finance Controller"
  },
  context: {
    tenantId: "tenant-1",
    companyId: "company-1",
    companyName: "One Gourmet Foods Inc.",
    brandId: "brand-1",
    brandName: "Yakiniku Like",
    locationId: "location-1",
    locationName: "Yakiniku Like SM North Edsa",
    locationType: "BRANCH"
  },
  authorizedLocations: [],
  permissionCodes: ["finance.period_close.manage"]
};

const runFixture = [
  {
    id: "run-1",
    publicReference: "FCR-2026-07-READINESS",
    runType: "READINESS",
    status: "BLOCKED",
    sourceWindowStartAt: new Date("2026-07-01T00:00:00.000Z"),
    sourceWindowEndAt: new Date("2026-07-31T23:59:59.000Z"),
    evidenceReference: "DEMO-FCR-JULY-2026-PACK",
    initiatedBy: { displayName: "Nico Valdez" },
    accountingPeriod: period,
    checklistItems: [
      {
        id: "check-1",
        checklistType: "BRANCH_DEPOSITS",
        label: "Branch deposits reviewed",
        sequence: 1,
        isRequired: true,
        status: "PASS",
        dueAt: new Date("2026-08-02T09:00:00.000Z"),
        completedAt: new Date("2026-08-01T05:00:00.000Z"),
        evidenceReference: "DEMO-CLOSE-DEPOSIT-REVIEW-2026-07",
        resultSummary: "Deposits reviewed.",
        exceptionReason: null,
        owner: { displayName: "Nico Valdez" },
        completedBy: { displayName: "Nico Valdez" },
        reviewedBy: { displayName: "Alyssa Tan" }
      },
      {
        id: "check-2",
        checklistType: "BANK_RECONCILIATION",
        label: "Bank reconciliation reviewed",
        sequence: 2,
        isRequired: true,
        status: "FAIL",
        dueAt: new Date("2026-08-03T09:00:00.000Z"),
        completedAt: null,
        evidenceReference: "DEMO-CLOSE-BANK-RECON-2026-07",
        resultSummary: "One imported bank line remains unmatched.",
        exceptionReason: "Unmatched statement line needs review.",
        owner: { displayName: "Nico Valdez" },
        completedBy: null,
        reviewedBy: null
      },
      {
        id: "check-3",
        checklistType: "MANAGEMENT_SIGNOFF",
        label: "Finance management sign-off",
        sequence: 3,
        isRequired: true,
        status: "PENDING",
        dueAt: new Date("2026-08-06T09:00:00.000Z"),
        completedAt: null,
        evidenceReference: null,
        resultSummary: "Waiting for blockers.",
        exceptionReason: null,
        owner: { displayName: "Alyssa Tan" },
        completedBy: null,
        reviewedBy: null
      }
    ],
    exceptions: [
      {
        id: "exception-1",
        exceptionType: "UNMATCHED_BANK_LINE",
        severity: "BLOCKER",
        state: "OPEN",
        title: "Unmatched July bank statement line",
        description: "One imported bank statement line has no source link.",
        sourceEntityType: "BANK_STATEMENT_LINE",
        sourceEntityId: "statement-line-1",
        dueAt: new Date("2026-08-03T09:00:00.000Z"),
        resolvedAt: null,
        evidenceReference: "DEMO-CLOSE-EXC-BANK-001",
        raisedBy: { displayName: "Nico Valdez" },
        assignedTo: { displayName: "Alyssa Tan" }
      }
    ]
  }
];

describe("period close readiness foundation", () => {
  it("summarizes readiness without treating failed blockers as close-ready", () => {
    const [run] = buildPeriodCloseRunRows(runFixture);
    expect(run).toBeDefined();
    if (!run) {
      throw new Error("PERIOD_CLOSE_TEST_RUN_MISSING");
    }

    expect(run.publicReference).toBe("FCR-2026-07-READINESS");
    expect(run.requiredCheckCount).toBe(3);
    expect(run.passedCheckCount).toBe(1);
    expect(run.failedCheckCount).toBe(1);
    expect(run.pendingCheckCount).toBe(1);
    expect(run.blockerExceptionCount).toBe(1);
    expect(run.readinessPercent).toBe(33);
  });

  it("shows dashboard metrics for open runs, blockers, and pending checks", () => {
    const dashboard = buildPeriodCloseDashboard(session, runFixture);

    expect(dashboard.metrics.map((metric) => metric.id)).toEqual([
      "open-close-runs",
      "blocker-exceptions",
      "pending-checks",
      "ready-runs"
    ]);
    expect(dashboard.metrics[1]).toMatchObject({
      displayValue: "1",
      tone: "warning"
    });
    expect(dashboard.metrics[3]).toMatchObject({
      displayValue: "0"
    });
  });

  it("defines export rows for close runs, checklist items, and exceptions", () => {
    expect(serviceSource).toContain("buildPeriodCloseExportRows");
    expect(serviceSource).toContain('"Close Run"');
    expect(serviceSource).toContain('"Checklist"');
    expect(serviceSource).toContain('"Exception"');
    expect(serviceSource).toContain("getPeriodCloseDashboard(session)");
  });

  it("keeps the period close dashboard read-only while close completion is explicit", () => {
    const dashboardSource = functionSlice(serviceSource, "getPeriodCloseDashboard");
    const completionSource = functionSlice(serviceSource, "completePeriodCloseRun");

    expect(dashboardSource).toContain("financeCloseRun.findMany");
    expect(serviceSource).toContain("requirePermission");
    expect(dashboardSource).not.toMatch(/accountingPeriod\.(create|update|updateMany|upsert|delete)/);
    expect(completionSource).toContain("accountingPeriod.updateMany");
    expect(completionSource).toContain('status: "SOFT_CLOSED"');
    expect(serviceSource).not.toContain("apInvoice.update");
    expect(serviceSource).not.toContain("paymentRelease.update");
    expect(serviceSource).not.toContain("bankReconciliation.update");
    expect(serviceSource).not.toContain("financeJournal.create");
  });

  it("defines close-readiness action commands for checklist, exceptions, and attempts", () => {
    expect(serviceSource).toContain("recordPeriodCloseChecklistResult");
    expect(serviceSource).toContain("waivePeriodCloseChecklistItem");
    expect(serviceSource).toContain("acknowledgePeriodCloseException");
    expect(serviceSource).toContain("resolvePeriodCloseException");
    expect(serviceSource).toContain("waivePeriodCloseException");
    expect(serviceSource).toContain("calculatePeriodCloseReadiness");
    expect(serviceSource).toContain("syncBankStatementCloseExceptions");
    expect(serviceSource).toContain("completePeriodCloseRun");
    expect(serviceSource).toContain("lockAccountingPeriodFromCloseRun");
    expect(serviceSource).toContain("reopenAccountingPeriodFromCloseRun");
    expect(serviceSource).toContain("cancelPeriodCloseRun");
    expect(serviceSource).toContain("writeCloseAudit");
  });

  it("requires evidence and preserves non-mutating close boundaries", () => {
    expect(serviceSource).toContain("PERIOD_CLOSE_CHECKLIST_EVIDENCE_REQUIRED");
    expect(serviceSource).toContain("PERIOD_CLOSE_EXCEPTION_RESOLUTION_EVIDENCE_REQUIRED");
    expect(serviceSource).toContain("PERIOD_CLOSE_EXCEPTION_WAIVER_EVIDENCE_REQUIRED");
    expect(serviceSource).toContain("PERIOD_CLOSE_COMPLETION_EVIDENCE_REQUIRED");
    expect(serviceSource).toContain("PERIOD_CLOSE_LOCK_EVIDENCE_REQUIRED");
    expect(serviceSource).toContain("PERIOD_CLOSE_REOPEN_EVIDENCE_REQUIRED");
    expect(serviceSource).toContain("PERIOD_CLOSE_CANCELLATION_EVIDENCE_REQUIRED");
    expect(serviceSource).toContain("PERIOD_CLOSE_APPROVAL_EVIDENCE_REQUIRED");
    expect(serviceSource).toContain("accountingPeriodSoftClosed");
    expect(serviceSource).toContain("accountingPeriodLocked");
    expect(serviceSource).toContain("accountingPeriodReopened");
    expect(serviceSource).toContain("noBankReconciliationMutation");
    expect(serviceSource).toContain("noJournalPosting");
  });

  it("computes readiness from checklist and exception state before close packet completion", () => {
    expect(serviceSource).toContain("summarizeReadiness");
    expect(serviceSource).toContain("bankStatementLine.findMany");
    expect(serviceSource).toContain("UNMATCHED_BANK_LINE");
    expect(serviceSource).toContain("BANK_STATEMENT_LINE");
    expect(serviceSource).toContain("finance_close.bank_statement_exceptions_synced");
    expect(serviceSource).toContain("syncedBankExceptionCount");
    expect(serviceSource).toContain("READY_TO_CLOSE");
    expect(serviceSource).toContain("PERIOD_CLOSE_RUN_MUST_BE_READY");
    expect(serviceSource).toContain("PERIOD_CLOSE_NOT_READY_TO_COMPLETE");
    expect(serviceSource).toContain("status: \"CLOSED\"");
    expect(serviceSource).toContain("ACCOUNTING_PERIOD_NOT_CLOSEABLE");
    expect(serviceSource).toContain("ACCOUNTING_PERIOD_CLOSE_STATE_CONFLICT");
    expect(serviceSource).toContain("finance_close.accounting_period_soft_closed");
    expect(serviceSource).toContain("finance_close.close_packet_completed");
    expect(serviceSource).toContain("PERIOD_CLOSE_NOT_READY");
    expect(serviceSource).toContain("financeCloseAttempt.create");
    expect(serviceSource).toContain("status: \"LOCKED\"");
    expect(serviceSource).toContain("lockedAt");
    expect(serviceSource).toContain("PERIOD_CLOSE_RUN_NOT_COMPLETED");
    expect(serviceSource).toContain("ACCOUNTING_PERIOD_NOT_SOFT_CLOSED");
    expect(serviceSource).toContain("PERIOD_CLOSE_NOT_READY_TO_LOCK");
    expect(serviceSource).toContain("finance_close.accounting_period_locked");
    expect(serviceSource).toContain("ACCOUNTING_PERIOD_NOT_REOPENABLE");
    expect(serviceSource).toContain("ACCOUNTING_PERIOD_REOPEN_STATE_CONFLICT");
    expect(serviceSource).toContain("status: \"REOPENED\"");
    expect(serviceSource).toContain("reopenedUntil");
    expect(serviceSource).toContain("REOPEN_PERIOD");
    expect(serviceSource).toContain("getFinancePeriodClosePolicy");
    expect(serviceSource).toContain("Post-reopen review required before re-close.");
    expect(serviceSource).toContain("finance_close.accounting_period_reopened");
    expect(serviceSource).toContain("finance_close.close_run_reopened_for_validation");
  });

  it("routes sensitive period lock and reopen actions through approval instances", () => {
    expect(serviceSource).toContain("requestPeriodCloseSensitiveActionApproval");
    expect(serviceSource).toContain("findFinanceCloseRunApprovalRule");
    expect(serviceSource).toContain('transactionType: "FinanceCloseRun"');
    expect(serviceSource).toContain('documentType: "FinanceCloseRun"');
    expect(serviceSource).toContain("pendingSensitiveApproval");
    expect(serviceSource).toContain("finance_close.sensitive_action_approval_requested");
    expect(serviceSource).toContain("approveFinanceCloseRunApproval");
    expect(serviceSource).toContain("rejectFinanceCloseRunApproval");
    expect(serviceSource).toContain("SELF_APPROVAL_BLOCKED");
    expect(serviceSource).toContain("PERIOD_CLOSE_APPROVAL_ALREADY_PENDING");
    expect(serviceSource).toContain("PERIOD_CLOSE_APPROVAL_RULE_NOT_CONFIGURED");
  });

  it("wires period-close readiness actions through the page server actions", () => {
    expect(pageSource).toContain("runPeriodCloseRunAction");
    expect(pageSource).toContain("requestPeriodCloseSensitiveActionApproval");
    expect(pageSource).toContain("runPeriodCloseChecklistAction");
    expect(pageSource).toContain("runPeriodCloseExceptionAction");
    expect(pageSource).toContain("Export Period Close CSV");
    expect(pageSource).toContain("/finance/period-close/export");
    expect(pageSource).toContain("Recalculate Readiness");
    expect(pageSource).toContain("Complete Close Packet");
    expect(pageSource).toContain("Request Lock Approval");
    expect(pageSource).toContain("Request Reopen Approval");
    expect(pageSource).toContain("Record Result");
    expect(pageSource).toContain("Waive Check");
    expect(pageSource).toContain("Acknowledge");
    expect(pageSource).toContain("Resolve");
    expect(pageSource).toContain("Waive");
    expect(exportRouteSource).toContain("buildPeriodCloseExportRows");
    expect(exportRouteSource).toContain("phase-3-period-close");
    expect(exportRouteSource).toContain("checksumHeader: true");
  });

  it("exposes period-close private evidence upload/download links without close source mutation", () => {
    expect(pageSource).toContain("listControlledEvidenceAttachments");
    expect(pageSource).toContain("createControlledEvidenceAttachmentMetadataLink");
    expect(pageSource).toContain("createControlledEvidenceAttachmentUploadLink");
    expect(pageSource).toContain('name="evidenceFile"');
    expect(pageSource).toContain('type="file"');
    expect(pageSource).toContain('href={`/evidence/${attachment.id}/download`}');
    expect(pageSource).toContain("archiveControlledEvidenceAttachment");
    expect(pageSource).toContain("FINANCE_CLOSE_RUN");
    expect(pageSource).toContain("FINANCE_CLOSE_ITEM");
    expect(pageSource).toContain("Upload Close Evidence");
    expect(pageSource).toContain("Add Close Evidence");
    expect(pageSource).toContain("Upload Evidence");
    expect(pageSource).toContain("Link metadata-only evidence instead");
    expect(pageSource).toContain("archivePeriodCloseEvidenceMetadata");
    expect(pageSource).toContain("Archive Evidence Link");
    expect(pageSource).toContain("Files stay private");
    expect(pageSource).toContain("downloads are audited");
    expect(pageSource).not.toContain("Save Evidence Metadata");
    expect(pageSource).not.toContain("Binary upload");
    expect(pageSource).not.toContain("P3-BLOCK-002");
    expect(pageSource).toContain("permissions.financePeriodCloseManage");
    expect(pageSource).not.toContain("financeJournal.create");
    expect(pageSource).not.toContain("apInvoice.update");
    expect(pageSource).not.toContain("paymentRelease.update");
    expect(pageSource).not.toContain("bankReconciliation.update");
  });
});
