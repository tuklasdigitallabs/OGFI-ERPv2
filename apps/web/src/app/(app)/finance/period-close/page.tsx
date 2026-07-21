import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import Link from "next/link";
import {
  AlertTriangle,
  BadgeCheck,
  ClipboardCheck,
  FileText,
  LockKeyhole,
  ShieldCheck
} from "lucide-react";
import { Badge, ButtonLink, Panel } from "@ogfi/ui";
import { AppShell } from "@/components/AppShell";
import { EntryModal } from "@/components/EntryModal";
import { ControlledEvidencePanel } from "@/components/evidence/ControlledEvidencePanel";
import {
  FinancePagination,
  getPaginationState
} from "@/components/FinancePagination";
import {
  canUseFinance,
  getDefaultAppRoute,
  permissions
} from "@/server/services/authorization";
import {
  archiveControlledEvidenceAttachment,
  listControlledEvidenceAttachments
} from "@/server/services/attachments";
import { getSessionContext } from "@/server/services/context";
import { canExportFinance } from "@/server/services/exportAuthorization";
import {
  acknowledgePeriodCloseException,
  calculatePeriodCloseReadiness,
  cancelPeriodCloseRun,
  completePeriodCloseRun,
  getPeriodCloseDashboard,
  recordPeriodCloseChecklistResult,
  requestPeriodCloseSensitiveActionApproval,
  resolvePeriodCloseException,
  startPeriodCloseRun,
  waivePeriodCloseChecklistItem,
  waivePeriodCloseException
} from "@/server/services/financePeriodClose";

export const dynamic = "force-dynamic";

type PeriodClosePageProps = {
  searchParams?: Promise<{ page?: string; tab?: string }>;
};

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

const metricIcons = {
  "open-close-runs": LockKeyhole,
  "blocker-exceptions": AlertTriangle,
  "pending-checks": ClipboardCheck,
  "ready-runs": BadgeCheck
};

function formatDate(value: string | null) {
  if (!value) {
    return "Not set";
  }
  return new Intl.DateTimeFormat("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "Asia/Manila"
  }).format(new Date(value));
}

function optionalDateField(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? "").trim();
  return value ? new Date(`${value}T00:00:00.000Z`) : null;
}

function statusTone(status: string) {
  if (["READY_TO_CLOSE", "CLOSED", "PASS", "RESOLVED"].includes(status)) {
    return "success" as const;
  }
  if (
    ["BLOCKED", "FAIL", "OPEN", "ACKNOWLEDGED", "READY_FOR_REVIEW"].includes(status)
  ) {
    return "warning" as const;
  }
  if (["CANCELLED"].includes(status)) {
    return "destructive" as const;
  }
  return "info" as const;
}

function severityTone(severity: string) {
  if (severity === "BLOCKER") {
    return "destructive" as const;
  }
  if (severity === "SIGNIFICANT") {
    return "warning" as const;
  }
  return "info" as const;
}

async function runPeriodCloseStartAction(formData: FormData) {
  "use server";

  const session = await getSessionContext();
  if (!session) {
    redirect("/sign-in");
  }

  const accountingPeriodId = String(
    formData.get("accountingPeriodId") ?? ""
  ).trim();
  const runType = String(formData.get("runType") ?? "READINESS") as
    | "READINESS"
    | "MONTH_END"
    | "LOCK_CANDIDATE";
  const reason = String(formData.get("reason") ?? "").trim();
  const evidenceReference =
    String(formData.get("evidenceReference") ?? "").trim() || undefined;
  const notes = String(formData.get("notes") ?? "").trim() || undefined;
  const sourceWindowStartAt = optionalDateField(formData, "sourceWindowStartAt");
  const sourceWindowEndAt = optionalDateField(formData, "sourceWindowEndAt");

  await startPeriodCloseRun(session, {
    accountingPeriodId,
    runType,
    reason,
    ...(sourceWindowStartAt ? { sourceWindowStartAt } : {}),
    ...(sourceWindowEndAt ? { sourceWindowEndAt } : {}),
    ...(evidenceReference ? { evidenceReference } : {}),
    ...(notes ? { notes } : {}),
    idempotencyKey: [
      "period-close-start-ui",
      session.user.id,
      accountingPeriodId,
      runType,
      sourceWindowStartAt?.toISOString() ?? "period-start",
      sourceWindowEndAt?.toISOString() ?? "period-end"
    ].join(":")
  });

  revalidatePath("/finance/period-close");
}

async function runPeriodCloseRunAction(formData: FormData) {
  "use server";

  const session = await getSessionContext();
  if (!session) {
    redirect("/sign-in");
  }
  const financeCloseRunId = String(formData.get("financeCloseRunId") ?? "");
  const action = String(formData.get("action") ?? "");
  const reason = String(formData.get("reason") ?? "").trim() || undefined;
  const evidenceReference =
    String(formData.get("evidenceReference") ?? "").trim() || undefined;
  const baseInput = {
    financeCloseRunId,
    idempotencyKey: `period-close-run-ui:${financeCloseRunId}:${action}:${reason ?? "none"}`,
    ...(reason ? { reason } : {}),
    ...(evidenceReference ? { evidenceReference } : {})
  };

  switch (action) {
    case "calculate":
      await calculatePeriodCloseReadiness(session, baseInput);
      break;
    case "complete":
      await completePeriodCloseRun(session, baseInput);
      break;
    case "lock":
      await requestPeriodCloseSensitiveActionApproval(session, {
        ...baseInput,
        approvalAction: "LOCK_PERIOD"
      });
      break;
    case "reopen":
      await requestPeriodCloseSensitiveActionApproval(session, {
        ...baseInput,
        approvalAction: "REOPEN_PERIOD"
      });
      break;
    case "cancel":
      await cancelPeriodCloseRun(session, baseInput);
      break;
    default:
      throw new Error("PERIOD_CLOSE_RUN_ACTION_NOT_SUPPORTED");
  }

  revalidatePath("/finance/period-close");
}

async function runPeriodCloseChecklistAction(formData: FormData) {
  "use server";

  const session = await getSessionContext();
  if (!session) {
    redirect("/sign-in");
  }
  const financeCloseRunId = String(formData.get("financeCloseRunId") ?? "");
  const checklistItemId = String(formData.get("checklistItemId") ?? "");
  const action = String(formData.get("action") ?? "");
  const status = String(formData.get("status") ?? "PASS") as
    | "PASS"
    | "FAIL"
    | "NOT_APPLICABLE";
  const reason = String(formData.get("reason") ?? "").trim() || undefined;
  const evidenceReference =
    String(formData.get("evidenceReference") ?? "").trim() || undefined;
  const resultSummary =
    String(formData.get("resultSummary") ?? "").trim() || undefined;
  const baseInput = {
    financeCloseRunId,
    checklistItemId,
    idempotencyKey: `period-close-check-ui:${financeCloseRunId}:${checklistItemId}:${action}:${status}`,
    ...(reason ? { reason } : {}),
    ...(evidenceReference ? { evidenceReference } : {}),
    ...(resultSummary ? { resultSummary } : {})
  };

  switch (action) {
    case "record":
      await recordPeriodCloseChecklistResult(session, {
        ...baseInput,
        status
      });
      break;
    case "waive":
      await waivePeriodCloseChecklistItem(session, baseInput);
      break;
    default:
      throw new Error("PERIOD_CLOSE_CHECKLIST_ACTION_NOT_SUPPORTED");
  }

  revalidatePath("/finance/period-close");
}

async function runPeriodCloseExceptionAction(formData: FormData) {
  "use server";

  const session = await getSessionContext();
  if (!session) {
    redirect("/sign-in");
  }
  const financeCloseRunId = String(formData.get("financeCloseRunId") ?? "");
  const exceptionId = String(formData.get("exceptionId") ?? "");
  const action = String(formData.get("action") ?? "");
  const reason = String(formData.get("reason") ?? "").trim() || undefined;
  const evidenceReference =
    String(formData.get("evidenceReference") ?? "").trim() || undefined;
  const baseInput = {
    financeCloseRunId,
    exceptionId,
    idempotencyKey: `period-close-exception-ui:${financeCloseRunId}:${exceptionId}:${action}:${reason ?? "none"}`,
    ...(reason ? { reason } : {}),
    ...(evidenceReference ? { evidenceReference } : {})
  };

  switch (action) {
    case "acknowledge":
      await acknowledgePeriodCloseException(session, baseInput);
      break;
    case "resolve":
      await resolvePeriodCloseException(session, baseInput);
      break;
    case "waive":
      await waivePeriodCloseException(session, baseInput);
      break;
    default:
      throw new Error("PERIOD_CLOSE_EXCEPTION_ACTION_NOT_SUPPORTED");
  }

  revalidatePath("/finance/period-close");
}

async function archivePeriodCloseEvidenceMetadata(formData: FormData) {
  "use server";

  const session = await getSessionContext();
  if (!session) {
    redirect("/sign-in");
  }

  const sourceType = String(formData.get("sourceType") ?? "").trim();
  if (sourceType !== "FINANCE_CLOSE_RUN" && sourceType !== "FINANCE_CLOSE_ITEM") {
    throw new Error("PERIOD_CLOSE_EVIDENCE_SOURCE_INVALID");
  }

  await archiveControlledEvidenceAttachment({
    controlledEvidenceAttachmentId: String(
      formData.get("controlledEvidenceAttachmentId") ?? ""
    ),
    archiveReason: String(formData.get("archiveReason") ?? "").trim(),
    requiredPermissionCode: permissions.financePeriodCloseManage
  });

  revalidatePath("/finance/period-close");
}

export default async function PeriodClosePage({
  searchParams
}: PeriodClosePageProps) {
  const resolvedSearchParams = await searchParams;
  const session = await getSessionContext();
  if (!session) {
    redirect("/sign-in");
  }
  if (!canUseFinance(session.permissionCodes)) {
    redirect(getDefaultAppRoute(session.permissionCodes));
  }
  if (!session.permissionCodes.includes(permissions.financePeriodCloseManage)) {
    redirect("/finance");
  }

  const dashboard = await getPeriodCloseDashboard(session);
  const currentRun = dashboard.runs[0] ?? null;
  const canStartCloseRun =
    dashboard.permissions.canManagePeriodClose &&
    dashboard.periodOptions.length > 0;
  const canExportPeriodClose = canExportFinance(session);
  const periodCloseEvidencePermission = permissions.financePeriodCloseManage;
  const closeRunEvidenceById = new Map(
    await Promise.all(
      dashboard.runs.map(async (run) => [
        run.id,
        await listControlledEvidenceAttachments({
          sourceType: "FINANCE_CLOSE_RUN",
          sourceRecordId: run.id,
          requiredPermissionCode: periodCloseEvidencePermission
        })
      ] as const)
    )
  );
  const closeItemRows = dashboard.runs.flatMap((run) => [
    ...run.checklistItems.map((item) => item.id),
    ...run.exceptions.map((exception) => exception.id)
  ]);
  const closeItemEvidenceById = new Map(
    await Promise.all(
      closeItemRows.map(async (id) => [
        id,
        await listControlledEvidenceAttachments({
          sourceType: "FINANCE_CLOSE_ITEM",
          sourceRecordId: id,
          requiredPermissionCode: periodCloseEvidencePermission
        })
      ] as const)
    )
  );
  const checklistCount = dashboard.runs.reduce(
    (total, run) => total + run.checklistItems.length,
    0
  );
  const exceptionCount = dashboard.runs.reduce(
    (total, run) => total + run.exceptions.length,
    0
  );
  const tabs = [
    {
      id: "runs",
      label: "Close runs",
      description: "Readiness cycles, status, and packet actions.",
      count: dashboard.runs.length
    },
    {
      id: "checklist",
      label: "Checklist",
      description: "Checklist results, waivers, and evidence.",
      count: checklistCount
    },
    {
      id: "exceptions",
      label: "Exceptions",
      description: "Close blockers, acknowledgement, and resolution.",
      count: exceptionCount
    },
    {
      id: "summary",
      label: "Summary",
      description: "Close readiness metrics.",
      count: dashboard.metrics.length
    },
    {
      id: "controls",
      label: "Controls",
      description: "Close guardrails and release gates."
    }
  ];
  const activeTab = tabs.some((tab) => tab.id === resolvedSearchParams?.tab)
    ? String(resolvedSearchParams?.tab)
    : "runs";
  const paginate = <T,>(rows: T[]) => {
    const pagination = getPaginationState(rows.length, resolvedSearchParams?.page);
    return {
      pagination,
      rows: rows.slice(pagination.startIndex, pagination.endIndex)
    };
  };
  const pagedRuns = paginate(dashboard.runs);
  const pagedChecklistItems = paginate(currentRun?.checklistItems ?? []);
  const pagedExceptions = paginate(currentRun?.exceptions ?? []);

  return (
    <AppShell
      session={session}
      title="Period Close"
      subtitle="Readiness checks, close blockers, evidence, and finance sign-off preparation"
      activeNav="period-close"
    >
      <div className="ogfi-coordination-cue">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">
              <strong>Period close is readiness control first.</strong> This
              workspace tracks required checks, exceptions, evidence, and close
              attempts without locking periods, settling AP, releasing bank funds,
              or mutating operational records.
            </p>
            <p className="mt-1 text-xs text-blue-900/75">
              Source records remain in AP, payments, bank/cash, inventory, petty
              cash, cash advances, and workforce. Period close links to their
              evidence and blocker status only.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <EntryModal
              title="Start Period Close Run"
              triggerLabel="Start Close Run"
              disabled={!canStartCloseRun}
            >
              <form action={runPeriodCloseStartAction} className="grid gap-4 pt-5">
                {!canStartCloseRun ? (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                    Starting a close run needs period-close manage permission and
                    at least one open or reopened accounting period.
                  </div>
                ) : null}
                <div className="grid gap-4 lg:grid-cols-2">
                  <label className="block">
                    <span className="text-xs font-semibold uppercase text-slate-500">
                      Accounting period
                    </span>
                    <select
                      className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                      name="accountingPeriodId"
                      defaultValue={dashboard.periodOptions[0]?.id ?? ""}
                      required
                    >
                      {dashboard.periodOptions.map((period) => (
                        <option key={period.id} value={period.id}>
                          {period.code} / {period.name} /{" "}
                          {period.status.replaceAll("_", " ")}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="text-xs font-semibold uppercase text-slate-500">
                      Run type
                    </span>
                    <select
                      className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                      name="runType"
                      defaultValue="READINESS"
                      required
                    >
                      <option value="READINESS">Readiness</option>
                      <option value="MONTH_END">Month end</option>
                      <option value="LOCK_CANDIDATE">Lock candidate</option>
                    </select>
                  </label>
                  <label className="block">
                    <span className="text-xs font-semibold uppercase text-slate-500">
                      Source window start
                    </span>
                    <input
                      className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                      name="sourceWindowStartAt"
                      type="date"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-semibold uppercase text-slate-500">
                      Source window end
                    </span>
                    <input
                      className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                      name="sourceWindowEndAt"
                      type="date"
                    />
                  </label>
                </div>
                <label className="block">
                  <span className="text-xs font-semibold uppercase text-slate-500">
                    Start reason
                  </span>
                  <textarea
                    className="mt-1 min-h-24 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                    name="reason"
                    placeholder="Why this close readiness cycle is being started"
                    required
                  />
                </label>
                <div className="grid gap-4 lg:grid-cols-2">
                  <label className="block">
                    <span className="text-xs font-semibold uppercase text-slate-500">
                      External evidence reference
                    </span>
                    <input
                      className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                      name="evidenceReference"
                      placeholder="Close packet, checklist kickoff, or sign-off reference"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-semibold uppercase text-slate-500">
                      Notes
                    </span>
                    <input
                      className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                      name="notes"
                      placeholder="Optional finance context"
                    />
                  </label>
                </div>
                <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-xs leading-5 text-blue-900">
                  Starting a close run creates only the readiness packet and
                  checklist. It does not lock the period, settle AP, release
                  payments, reconcile bank accounts, or post journals.
                </div>
                <button
                  className="inline-flex w-fit items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                  disabled={!canStartCloseRun}
                  type="submit"
                >
                  Start Period Close Run
                </button>
              </form>
            </EntryModal>
            {canExportPeriodClose ? (
              <ButtonLink href="/finance/period-close/export" tone="secondary">
                Export Period Close CSV
              </ButtonLink>
            ) : null}
            <Badge tone="info">Readiness foundation</Badge>
          </div>
        </div>
      </div>

      <nav
        aria-label="Period close sections"
        className="mb-5 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-sm"
      >
        <div className="flex min-w-max gap-2">
          {tabs.map((tab) => {
            const selected = tab.id === activeTab;
            return (
              <Link
                key={tab.id}
                aria-current={selected ? "page" : undefined}
                className={cx(
                  "flex min-w-44 flex-col rounded-xl px-4 py-3 text-left transition",
                  selected
                    ? "bg-blue-600 text-white shadow-sm"
                    : "text-slate-700 hover:bg-slate-50"
                )}
                href={`/finance/period-close?tab=${tab.id}`}
              >
                <span className="flex items-center justify-between gap-3 text-sm font-bold">
                  {tab.label}
                  {tab.count != null ? (
                    <span
                      className={cx(
                        "rounded-full px-2 py-0.5 text-xs font-bold",
                        selected
                          ? "bg-white/20 text-white"
                          : "bg-blue-50 text-blue-700"
                      )}
                    >
                      {tab.count}
                    </span>
                  ) : null}
                </span>
                <span
                  className={cx(
                    "mt-1 text-xs leading-5",
                    selected
                      ? "text-blue-50"
                      : "text-slate-500"
                  )}
                >
                  {tab.description}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>

      <div
        className={cx(
          "mb-5 grid gap-4 md:grid-cols-4",
          activeTab === "summary" ? "" : "hidden"
        )}
      >
        {dashboard.metrics.map((metric) => {
          const Icon =
            metricIcons[metric.id as keyof typeof metricIcons] ?? FileText;
          return (
            <Panel key={metric.id} className="ogfi-metric-card p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {metric.label}
                  </p>
                  <p className="mt-2 truncate text-2xl font-bold text-slate-950">
                    {metric.displayValue}
                  </p>
                </div>
                <span className="ogfi-icon-tile inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-blue-100 bg-blue-50 text-blue-700">
                  <Icon aria-hidden="true" className="h-5 w-5" />
                </span>
              </div>
              <p className="mt-3 min-h-12 text-sm leading-6 text-slate-600">
                {metric.detail}
              </p>
              <Badge tone={metric.tone} size="sm">
                Close readiness
              </Badge>
            </Panel>
          );
        })}
      </div>

      <section
        className={cx(
          "ogfi-data-surface mb-5 overflow-hidden",
          activeTab === "runs" ? "" : "hidden"
        )}
      >
        <div className="ogfi-section-header">
          <div>
            <h2 className="text-lg font-bold text-slate-950">
              Close Runs
            </h2>
            <p className="text-sm text-slate-500">
              Company-scoped period close readiness runs with checklist progress
              and blocker visibility.
            </p>
          </div>
          <Badge tone="info">
            {dashboard.runs.length} run{dashboard.runs.length === 1 ? "" : "s"}
          </Badge>
        </div>

        <div className="divide-y divide-slate-100">
          {dashboard.runs.length === 0 ? (
            <div className="p-6">
              <p className="font-semibold text-slate-950">
                No period close run yet
              </p>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                Close runs appear here after finance starts a readiness cycle for
                an accounting period.
              </p>
            </div>
          ) : (
            pagedRuns.rows.map((run) => (
              <div
                key={run.id}
                className="grid gap-4 px-5 py-4 xl:grid-cols-[1fr_28rem] xl:items-start"
              >
                <div className="grid gap-4 lg:grid-cols-[1fr_10rem_10rem_9rem_9rem] lg:items-center">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-bold text-slate-950">
                        {run.publicReference}
                      </p>
                      <Badge tone={statusTone(run.status)} size="sm">
                        {run.status.replaceAll("_", " ")}
                      </Badge>
                      <Badge tone="info" size="sm">
                        {run.runType.replaceAll("_", " ")}
                      </Badge>
                    </div>
                    <p className="mt-1 text-sm text-slate-600">
                      {run.periodName} / {run.periodCode} / Period{" "}
                      {run.periodStatus.replaceAll("_", " ")}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      Started by {run.initiatedByName}; source window{" "}
                      {formatDate(run.sourceWindowStartAt)} to{" "}
                      {formatDate(run.sourceWindowEndAt)}
                    </p>
                    <ControlledEvidencePanel
                      archiveAction={archivePeriodCloseEvidenceMetadata}
                      attachments={closeRunEvidenceById.get(run.id) ?? []}
                      canAdd={dashboard.permissions.canManagePeriodClose}
                      sourceRecordId={run.id}
                      sourceType="FINANCE_CLOSE_RUN"
                      triggerLabel="Add Close Evidence"
                    />
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                      Readiness
                    </p>
                    <p className="mt-1 font-semibold text-slate-900">
                      {run.readinessPercent}%
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                      Checks
                    </p>
                    <p className="mt-1 font-semibold text-slate-900">
                      {run.passedCheckCount}/{run.requiredCheckCount} passed
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                      Pending
                    </p>
                    <p className="mt-1 font-semibold text-slate-900">
                      {run.pendingCheckCount}
                    </p>
                  </div>
                  <Badge
                    tone={run.blockerExceptionCount > 0 ? "warning" : "success"}
                  >
                    {run.blockerExceptionCount} blocker
                    {run.blockerExceptionCount === 1 ? "" : "s"}
                  </Badge>
                </div>
                {dashboard.permissions.canManagePeriodClose ? (
                  <div className="flex items-start justify-end">
                    <EntryModal
                      title={`Manage ${run.publicReference}`}
                      triggerLabel="Manage Actions"
                      triggerClassName="border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100"
                    >
                      <form action={runPeriodCloseRunAction} className="grid gap-4 pt-5">
                        <input
                          name="financeCloseRunId"
                          type="hidden"
                          value={run.id}
                        />
                        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                          <p className="font-bold text-slate-950">
                            {run.periodName}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            {run.publicReference} / readiness {run.readinessPercent}%
                          </p>
                        </div>
                        <div className="grid gap-3 md:grid-cols-2">
                          <label className="block">
                            <span className="text-xs font-semibold uppercase text-slate-500">
                              Reason
                            </span>
                            <input
                              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                              name="reason"
                              placeholder="Close, reopen, or cancellation reason"
                            />
                          </label>
                          <label className="block">
                            <span className="text-xs font-semibold uppercase text-slate-500">
                              External evidence reference
                            </span>
                            <input
                              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                              name="evidenceReference"
                              placeholder="Close packet, reopen approval, or cancellation proof"
                            />
                          </label>
                        </div>
                        <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
                          <button
                            className="rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm font-semibold text-blue-700 shadow-sm transition hover:border-blue-300 hover:bg-blue-50"
                            name="action"
                            type="submit"
                            value="calculate"
                          >
                            Recalculate Readiness
                          </button>
                          {run.status === "READY_TO_CLOSE" ? (
                            <button
                              className="rounded-lg border border-emerald-200 bg-emerald-600 px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700"
                              name="action"
                              type="submit"
                              value="complete"
                            >
                              Complete Close Packet
                            </button>
                          ) : null}
                          {run.status === "CLOSED" &&
                          run.periodStatus === "SOFT_CLOSED" ? (
                            <button
                              className="rounded-lg border border-slate-300 bg-slate-950 px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
                              name="action"
                              type="submit"
                              value="lock"
                            >
                              Request Lock Approval
                            </button>
                          ) : null}
                          {run.status === "CLOSED" &&
                          ["SOFT_CLOSED", "LOCKED"].includes(run.periodStatus) ? (
                            <button
                              className="rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm font-semibold text-amber-700 shadow-sm transition hover:border-amber-300 hover:bg-amber-50"
                              name="action"
                              type="submit"
                              value="reopen"
                            >
                              Request Reopen Approval
                            </button>
                          ) : null}
                          <button
                            className="rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-semibold text-red-700 shadow-sm transition hover:border-red-300 hover:bg-red-50"
                            name="action"
                            type="submit"
                            value="cancel"
                          >
                            Cancel Run
                          </button>
                        </div>
                      </form>
                    </EntryModal>
                  </div>
                ) : null}
              </div>
            ))
          )}
        </div>
        <FinancePagination
          basePath="/finance/period-close"
          tab={activeTab}
          page={pagedRuns.pagination.page}
          totalPages={pagedRuns.pagination.totalPages}
          totalCount={dashboard.runs.length}
          startIndex={pagedRuns.pagination.startIndex}
          endIndex={pagedRuns.pagination.endIndex}
        />
      </section>

      {currentRun ? (
        <div
          className={cx(
            "mb-5 grid gap-4",
            activeTab === "checklist" || activeTab === "exceptions"
              ? "xl:grid-cols-1"
              : "hidden"
          )}
        >
          <section
            className={cx(
              "ogfi-data-surface overflow-hidden",
              activeTab === "checklist" ? "" : "hidden"
            )}
          >
            <div className="ogfi-section-header">
              <div>
                <h2 className="text-lg font-bold text-slate-950">
                  Checklist For {currentRun.periodCode}
                </h2>
                <p className="text-sm text-slate-500">
                  Required evidence checks before a future hard-close workflow can
                  be considered.
                </p>
              </div>
              <Badge tone="warning">No auto-complete</Badge>
            </div>
            <div className="divide-y divide-slate-100">
              {pagedChecklistItems.rows.map((item) => (
                <div
                  key={item.id}
                  className="grid gap-4 px-5 py-4 2xl:grid-cols-[1fr_26rem] 2xl:items-start"
                >
                  <div className="grid gap-4 md:grid-cols-[3rem_1fr_9rem_9rem] md:items-center">
                    <p className="text-sm font-bold text-slate-400">
                      {String(item.sequence).padStart(2, "0")}
                    </p>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-bold text-slate-950">{item.label}</p>
                        <Badge tone={statusTone(item.status)} size="sm">
                          {item.status.replaceAll("_", " ")}
                        </Badge>
                        {item.isRequired ? (
                          <Badge tone="info" size="sm">
                            Required
                          </Badge>
                        ) : null}
                      </div>
                      <p className="mt-1 text-sm text-slate-600">
                        Owner {item.ownerName ?? "Unassigned"} / Evidence{" "}
                        {item.evidenceReference ?? "pending"}
                      </p>
                      {item.exceptionReason ? (
                        <p className="mt-1 text-xs text-amber-700">
                          {item.exceptionReason}
                        </p>
                      ) : null}
                      <ControlledEvidencePanel
                        archiveAction={archivePeriodCloseEvidenceMetadata}
                        attachments={closeItemEvidenceById.get(item.id) ?? []}
                        canAdd={dashboard.permissions.canManagePeriodClose}
                        sourceRecordId={item.id}
                        sourceType="FINANCE_CLOSE_ITEM"
                        triggerLabel="Add Evidence"
                      />
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                        Due
                      </p>
                      <p className="mt-1 font-semibold text-slate-900">
                        {formatDate(item.dueAt)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                        Completed
                      </p>
                      <p className="mt-1 font-semibold text-slate-900">
                        {item.completedByName ?? "Pending"}
                      </p>
                    </div>
                  </div>
                  {dashboard.permissions.canManagePeriodClose ? (
                    <div className="flex items-start justify-end">
                      <EntryModal
                        title={`Record ${item.label}`}
                        triggerLabel="Manage Check"
                        triggerClassName="border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100"
                      >
                        <form
                          action={runPeriodCloseChecklistAction}
                          className="grid gap-4 pt-5"
                        >
                          <input
                            name="financeCloseRunId"
                            type="hidden"
                            value={currentRun.id}
                          />
                          <input
                            name="checklistItemId"
                            type="hidden"
                            value={item.id}
                          />
                          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                            <p className="font-bold text-slate-950">{item.label}</p>
                            <p className="mt-1 text-xs text-slate-500">
                              {item.status.replaceAll("_", " ")} / Owner{" "}
                              {item.ownerName ?? "Unassigned"}
                            </p>
                          </div>
                          <div className="grid gap-3 md:grid-cols-2">
                            <label className="block">
                              <span className="text-xs font-semibold uppercase text-slate-500">
                                Result
                              </span>
                              <select
                                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                                name="status"
                              >
                                <option value="PASS">Pass</option>
                                <option value="FAIL">Fail</option>
                                <option value="NOT_APPLICABLE">Not applicable</option>
                              </select>
                            </label>
                            <label className="block">
                              <span className="text-xs font-semibold uppercase text-slate-500">
                                Reason
                              </span>
                              <input
                                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                                name="reason"
                                placeholder="Required for fail or waiver"
                              />
                            </label>
                            <label className="block">
                              <span className="text-xs font-semibold uppercase text-slate-500">
                                External evidence reference
                              </span>
                              <input
                                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                                name="evidenceReference"
                                placeholder="Deposit review, AP aging, reconciliation proof"
                              />
                            </label>
                            <label className="block">
                              <span className="text-xs font-semibold uppercase text-slate-500">
                                Result summary
                              </span>
                              <input
                                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                                name="resultSummary"
                                placeholder="What was verified"
                              />
                            </label>
                          </div>
                          <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
                            <button
                              className="rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm font-semibold text-blue-700 shadow-sm transition hover:border-blue-300 hover:bg-blue-50"
                              name="action"
                              type="submit"
                              value="record"
                            >
                              Record Result
                            </button>
                            <button
                              className="rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm font-semibold text-amber-700 shadow-sm transition hover:border-amber-300 hover:bg-amber-50"
                              name="action"
                              type="submit"
                              value="waive"
                            >
                              Waive Check
                            </button>
                          </div>
                        </form>
                      </EntryModal>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
            <FinancePagination
              basePath="/finance/period-close"
              tab={activeTab}
              page={pagedChecklistItems.pagination.page}
              totalPages={pagedChecklistItems.pagination.totalPages}
              totalCount={currentRun.checklistItems.length}
              startIndex={pagedChecklistItems.pagination.startIndex}
              endIndex={pagedChecklistItems.pagination.endIndex}
            />
          </section>

          <section
            className={cx(
              "ogfi-data-surface overflow-hidden",
              activeTab === "exceptions" ? "" : "hidden"
            )}
          >
            <div className="ogfi-section-header">
              <div>
                <h2 className="text-lg font-bold text-slate-950">
                  Close Exceptions
                </h2>
                <p className="text-sm text-slate-500">
                  Blockers and carried-forward issues are visible before sign-off.
                </p>
              </div>
              <Badge tone="warning">
                {currentRun.openExceptionCount} open
              </Badge>
            </div>
            <div className="divide-y divide-slate-100">
              {currentRun.exceptions.length === 0 ? (
                <div className="p-5 text-sm text-slate-600">
                  No close exceptions recorded for this run.
                </div>
              ) : (
                pagedExceptions.rows.map((exception) => (
                  <div
                    key={exception.id}
                    className="grid gap-4 px-5 py-4 2xl:grid-cols-[1fr_24rem] 2xl:items-start"
                  >
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-bold text-slate-950">
                          {exception.title}
                        </p>
                        <Badge tone={severityTone(exception.severity)} size="sm">
                          {exception.severity.toLowerCase()}
                        </Badge>
                        <Badge tone={statusTone(exception.state)} size="sm">
                          {exception.state.replaceAll("_", " ")}
                        </Badge>
                      </div>
                      <p className="mt-1 text-sm leading-6 text-slate-600">
                        {exception.description}
                      </p>
                      <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                        Assigned to {exception.assignedToName ?? "Unassigned"} /
                        Due {formatDate(exception.dueAt)}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        Source {exception.sourceEntityType ?? "Not linked"} /{" "}
                        {exception.sourceEntityId ?? "No source id"} / Evidence{" "}
                        {exception.evidenceReference ?? "pending"}
                      </p>
                      <ControlledEvidencePanel
                        archiveAction={archivePeriodCloseEvidenceMetadata}
                        attachments={closeItemEvidenceById.get(exception.id) ?? []}
                        canAdd={dashboard.permissions.canManagePeriodClose}
                        sourceRecordId={exception.id}
                        sourceType="FINANCE_CLOSE_ITEM"
                        triggerLabel="Add Evidence"
                      />
                    </div>
                    {dashboard.permissions.canManagePeriodClose &&
                    ["OPEN", "ACKNOWLEDGED"].includes(exception.state) ? (
                      <div className="flex items-start justify-end">
                        <EntryModal
                          title={`Resolve ${exception.title}`}
                          triggerLabel="Manage Exception"
                          triggerClassName="border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100"
                        >
                          <form
                            action={runPeriodCloseExceptionAction}
                            className="grid gap-4 pt-5"
                          >
                            <input
                              name="financeCloseRunId"
                              type="hidden"
                              value={currentRun.id}
                            />
                            <input
                              name="exceptionId"
                              type="hidden"
                              value={exception.id}
                            />
                            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                              <p className="font-bold text-slate-950">
                                {exception.title}
                              </p>
                              <p className="mt-1 text-xs text-slate-500">
                                {exception.severity.toLowerCase()} /{" "}
                                {exception.state.replaceAll("_", " ")}
                              </p>
                            </div>
                            <div className="grid gap-3 md:grid-cols-2">
                              <label className="block">
                                <span className="text-xs font-semibold uppercase text-slate-500">
                                  Reason
                                </span>
                                <input
                                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                                  name="reason"
                                  placeholder="Acknowledgment, resolution, or waiver reason"
                                />
                              </label>
                              <label className="block">
                                <span className="text-xs font-semibold uppercase text-slate-500">
                                  External evidence reference
                                </span>
                                <input
                                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                                  name="evidenceReference"
                                  placeholder="Resolution proof or waiver approval"
                                />
                              </label>
                            </div>
                            <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
                              {exception.state === "OPEN" ? (
                                <button
                                  className="rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm font-semibold text-blue-700 shadow-sm transition hover:border-blue-300 hover:bg-blue-50"
                                  name="action"
                                  type="submit"
                                  value="acknowledge"
                                >
                                  Acknowledge
                                </button>
                              ) : null}
                              <button
                                className="rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm font-semibold text-blue-700 shadow-sm transition hover:border-blue-300 hover:bg-blue-50"
                                name="action"
                                type="submit"
                                value="resolve"
                              >
                                Resolve
                              </button>
                              <button
                                className="rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm font-semibold text-amber-700 shadow-sm transition hover:border-amber-300 hover:bg-amber-50"
                                name="action"
                                type="submit"
                                value="waive"
                              >
                                Waive
                              </button>
                            </div>
                          </form>
                        </EntryModal>
                      </div>
                    ) : null}
                  </div>
                ))
              )}
            </div>
            <FinancePagination
              basePath="/finance/period-close"
              tab={activeTab}
              page={pagedExceptions.pagination.page}
              totalPages={pagedExceptions.pagination.totalPages}
              totalCount={currentRun.exceptions.length}
              startIndex={pagedExceptions.pagination.startIndex}
              endIndex={pagedExceptions.pagination.endIndex}
            />
          </section>
        </div>
      ) : null}

      <div
        className={cx(
          "grid gap-4 md:grid-cols-3",
          activeTab === "controls" ? "" : "hidden"
        )}
      >
        {dashboard.guardrails.map((guardrail) => (
          <Panel key={guardrail.label} className="ogfi-detail-card">
            <div className="flex items-start gap-3">
              <ShieldCheck
                aria-hidden="true"
                className="mt-1 h-5 w-5 text-blue-600"
              />
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-bold text-slate-950">
                    {guardrail.label}
                  </h3>
                  <Badge tone={guardrail.tone} size="sm">
                    Control
                  </Badge>
                </div>
                <p className="mt-1 text-sm leading-6 text-slate-600">
                  {guardrail.detail}
                </p>
              </div>
            </div>
          </Panel>
        ))}
      </div>
    </AppShell>
  );
}
