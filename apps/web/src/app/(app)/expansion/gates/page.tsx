import Link from "next/link";
import { redirect } from "next/navigation";
import {
  CalendarClock,
  CheckCircle2,
  Filter,
  Flag,
  Search,
  ShieldCheck,
  XCircle
} from "lucide-react";
import { Badge, Panel } from "@ogfi/ui";
import { ActionFeedbackBanner } from "@/components/ActionFeedbackBanner";
import { AppShell } from "@/components/AppShell";
import { EntryModal } from "@/components/EntryModal";
import { ExpansionWorkspaceNav } from "@/components/ExpansionWorkspaceNav";
import { getPaginationState } from "@/components/FinancePagination";
import {
  actionErrorRedirectPath,
  getActionFeedback
} from "@/server/services/actionFeedback";
import { canUseProjects, getDefaultAppRoute } from "@/server/services/authorization";
import { getSessionContext } from "@/server/services/context";
import {
  getExpansionLifecycleGates,
  seedExpansionLifecycleGates,
  transitionExpansionLifecycleGate,
  type ExpansionLifecycleGateRow
} from "@/server/services/expansionProjects";

export const dynamic = "force-dynamic";

type LifecycleGatesPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

const gateStatusOptions = ["NOT_CREATED", "PLANNED", "ACHIEVED", "CANCELLED"];

async function seedGatesAction(formData: FormData) {
  "use server";

  try {
    await seedExpansionLifecycleGates(formData);
  } catch (error) {
    redirect(actionErrorRedirectPath("/expansion/gates", error));
  }
  redirect("/expansion/gates");
}

async function transitionGateAction(formData: FormData) {
  "use server";

  try {
    await transitionExpansionLifecycleGate(formData);
  } catch (error) {
    redirect(actionErrorRedirectPath("/expansion/gates", error));
  }
  redirect("/expansion/gates");
}

function firstSearchValue(
  value: string | string[] | undefined,
  fallback = ""
) {
  return Array.isArray(value) ? value[0] ?? fallback : value ?? fallback;
}

function formatDate(value: string | null) {
  if (!value) {
    return "No target";
  }
  return new Intl.DateTimeFormat("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "Asia/Manila"
  }).format(new Date(`${value}T00:00:00.000Z`));
}

function statusTone(status: ExpansionLifecycleGateRow["status"]) {
  if (status === "ACHIEVED") {
    return "success" as const;
  }
  if (status === "PLANNED") {
    return "warning" as const;
  }
  if (status === "CANCELLED") {
    return "destructive" as const;
  }
  return "neutral" as const;
}

function gatePageHref(input: {
  page: number;
  query: string;
  status: string;
}) {
  const params = new URLSearchParams();
  if (input.query) {
    params.set("q", input.query);
  }
  if (input.status) {
    params.set("status", input.status);
  }
  params.set("page", String(input.page));
  return `/expansion/gates?${params.toString()}`;
}

function Pagination({
  page,
  totalPages,
  totalCount,
  startIndex,
  endIndex,
  query,
  status
}: {
  page: number;
  totalPages: number;
  totalCount: number;
  startIndex: number;
  endIndex: number;
  query: string;
  status: string;
}) {
  if (totalCount <= 10) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-5 py-4 text-sm text-slate-600">
      <p>
        Showing {startIndex + 1}-{endIndex} of {totalCount}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Link
          aria-disabled={page === 1}
          className={
            page === 1
              ? "pointer-events-none inline-flex min-h-9 items-center rounded-lg border border-slate-200 bg-slate-100 px-3 font-semibold text-slate-400"
              : "inline-flex min-h-9 items-center rounded-lg border border-slate-200 bg-white px-3 font-semibold text-slate-700 hover:bg-slate-50"
          }
          href={gatePageHref({
            page: Math.max(1, page - 1),
            query,
            status
          })}
        >
          Previous
        </Link>
        <span className="px-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Page {page} of {totalPages}
        </span>
        <Link
          aria-disabled={page === totalPages}
          className={
            page === totalPages
              ? "pointer-events-none inline-flex min-h-9 items-center rounded-lg border border-slate-200 bg-slate-100 px-3 font-semibold text-slate-400"
              : "inline-flex min-h-9 items-center rounded-lg border border-blue-200 bg-blue-50 px-3 font-semibold text-blue-700 hover:bg-blue-100"
          }
          href={gatePageHref({
            page: Math.min(totalPages, page + 1),
            query,
            status
          })}
        >
          Next
        </Link>
      </div>
    </div>
  );
}

function ActionCell({ gate }: { gate: ExpansionLifecycleGateRow }) {
  if (!gate.canMutate) {
    return (
      <span className="inline-block max-w-64 text-left text-xs font-semibold text-slate-500">
        {gate.actionDeniedReason ?? "View only"}
      </span>
    );
  }

  if (gate.status === "NOT_CREATED") {
    return (
      <EntryModal
        title="Generate Lifecycle Gates"
        triggerLabel="Generate"
        triggerClassName="min-h-9 px-3 text-xs"
      >
        <form action={seedGatesAction} className="grid gap-4 pt-5">
          <input name="projectId" type="hidden" value={gate.projectId} />
          <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-950">
            <p className="font-semibold">{gate.projectName}</p>
            <p className="mt-1 text-blue-900/75">
              This creates the standard Expansion gate milestones for this
              project only. It does not approve capex, POs, payments, permits,
              or branch records.
            </p>
          </div>
          <button
            className="inline-flex min-h-11 items-center justify-center rounded-lg bg-blue-600 px-4 text-sm font-bold text-white hover:bg-blue-700"
            type="submit"
          >
            Generate Gates
          </button>
        </form>
      </EntryModal>
    );
  }

  if (gate.status !== "PLANNED" || !gate.milestoneId || !gate.milestoneVersion) {
    return (
      <span className="text-xs font-semibold text-slate-400">
        No action
      </span>
    );
  }

  return (
    <div className="flex max-w-72 flex-wrap justify-end gap-2">
      {gate.canAchieve ? (
        <EntryModal
          title="Approve Gate Achievement"
          triggerLabel="Review & Approve"
          triggerClassName="min-h-9 px-3 text-xs"
        >
          <form action={transitionGateAction} className="grid gap-4 pt-5">
          <input name="milestoneId" type="hidden" value={gate.milestoneId} />
          <input
            name="expectedVersion"
            type="hidden"
            value={gate.milestoneVersion}
          />
          <input name="nextStatus" type="hidden" value="ACHIEVED" />
          <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-4 text-sm text-emerald-950">
            <p className="font-semibold">{gate.title}</p>
            <p className="mt-1 text-emerald-900/75">
              You are acting as project sponsor. Review the evidence and record
              why this coordination gate is achieved. Linked source records stay
              controlled in their own modules.
            </p>
          </div>
          <label className="grid gap-2 text-sm font-semibold text-slate-700">
            Evidence reference
            <input
              className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm"
              name="evidenceReference"
              placeholder="Document, attachment, decision, or source-record reference"
              minLength={5}
              required
            />
          </label>
          <label className="grid gap-2 text-sm font-semibold text-slate-700">
            Achievement reason
            <textarea
              className="min-h-28 rounded-lg border border-slate-300 px-3 py-2 text-sm"
              name="achievementReason"
              placeholder="Explain the reviewed decision and why the gate criteria are satisfied."
              minLength={5}
              required
            />
          </label>
          <button
            className="inline-flex min-h-11 items-center justify-center rounded-lg bg-blue-600 px-4 text-sm font-bold text-white hover:bg-blue-700"
            type="submit"
          >
            Approve Gate Achievement
          </button>
          </form>
        </EntryModal>
      ) : null}
      {gate.canCancel ? (
        <EntryModal
        title="Cancel Lifecycle Gate"
        triggerLabel="Cancel"
        triggerClassName="min-h-9 border border-red-200 bg-white px-3 text-xs text-red-700 hover:bg-red-50"
        >
          <form action={transitionGateAction} className="grid gap-4 pt-5">
          <input name="milestoneId" type="hidden" value={gate.milestoneId} />
          <input
            name="expectedVersion"
            type="hidden"
            value={gate.milestoneVersion}
          />
          <input name="nextStatus" type="hidden" value="CANCELLED" />
          <label className="grid gap-2 text-sm font-semibold text-slate-700">
            Cancellation reason
            <textarea
              className="min-h-28 rounded-lg border border-slate-300 px-3 py-2 text-sm"
              name="reason"
              placeholder="Explain why this gate is no longer applicable."
              minLength={5}
              required
            />
          </label>
          <button
            className="inline-flex min-h-11 items-center justify-center rounded-lg bg-red-600 px-4 text-sm font-bold text-white hover:bg-red-700"
            type="submit"
          >
            Cancel Gate
          </button>
          </form>
        </EntryModal>
      ) : null}
      {!gate.canAchieve && gate.actionDeniedReason ? (
        <p className="w-full text-left text-xs font-semibold text-slate-500">
          {gate.actionDeniedReason}
        </p>
      ) : null}
    </div>
  );
}

export default async function LifecycleGatesPage({
  searchParams
}: LifecycleGatesPageProps) {
  const session = await getSessionContext();
  if (!session) {
    redirect("/sign-in");
  }
  if (!canUseProjects(session.permissionCodes)) {
    redirect(getDefaultAppRoute(session.permissionCodes));
  }

  const resolvedSearchParams = searchParams ? await searchParams : {};
  const query = firstSearchValue(resolvedSearchParams.q);
  const status = firstSearchValue(resolvedSearchParams.status);
  const actionFeedback = getActionFeedback(resolvedSearchParams);
  const dashboard = await getExpansionLifecycleGates(session);
  const normalizedQuery = query.trim().toUpperCase();
  const normalizedStatus = status.trim().toUpperCase();
  const filteredGates = dashboard.gates.filter((gate) => {
    const matchesQuery = normalizedQuery
      ? [
          gate.projectCode,
          gate.projectName,
          gate.brandName,
          gate.siteName,
          gate.title,
          gate.ownerName ?? ""
        ]
          .join(" ")
          .toUpperCase()
          .includes(normalizedQuery)
      : true;
    const matchesStatus = normalizedStatus
      ? gate.status === normalizedStatus
      : true;
    return matchesQuery && matchesStatus;
  });
  const pagination = getPaginationState(
    filteredGates.length,
    firstSearchValue(resolvedSearchParams.page)
  );
  const visibleGates = filteredGates.slice(
    pagination.startIndex,
    pagination.endIndex
  );
  const projectsMissingGates = dashboard.projects.filter(
    (project) =>
      project.canMutate &&
      dashboard.gates.some(
        (gate) => gate.projectId === project.id && gate.status === "NOT_CREATED"
      )
  );

  return (
    <AppShell
      session={session}
      title="Lifecycle Gates"
      subtitle="Controlled expansion milestones for site opening readiness"
      activeNav="lifecycle-gates"
    >
      <ExpansionWorkspaceNav />

      <ActionFeedbackBanner feedback={actionFeedback} />

      <div className="ogfi-coordination-cue">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">
              <strong>Lifecycle gates are shared Project Milestones.</strong>{" "}
              Gate actions record progress and evidence only.
            </p>
            <p className="mt-1 text-xs text-blue-900/75">
              They do not approve capex, release payments, issue POs, post
              journals, create branches, or mutate linked source records.
            </p>
          </div>
          <Badge tone="info">Project milestone source</Badge>
        </div>
      </div>

      <div className="mb-5 grid gap-3 lg:grid-cols-5">
        <Panel className="ogfi-detail-card">
          <p className="text-sm font-semibold text-slate-500">Expansion projects</p>
          <p className="mt-2 text-3xl font-bold text-slate-950">
            {dashboard.projectCount}
          </p>
        </Panel>
        <Panel className="ogfi-detail-card">
          <p className="text-sm font-semibold text-slate-500">Gate records</p>
          <p className="mt-2 text-3xl font-bold text-slate-950">
            {dashboard.gateCount}
          </p>
        </Panel>
        <Panel className="ogfi-detail-card">
          <p className="text-sm font-semibold text-slate-500">Achieved</p>
          <p className="mt-2 text-3xl font-bold text-emerald-700">
            {dashboard.achievedGateCount}
          </p>
        </Panel>
        <Panel className="ogfi-detail-card">
          <p className="text-sm font-semibold text-slate-500">At risk</p>
          <p className="mt-2 text-3xl font-bold text-amber-700">
            {dashboard.atRiskGateCount}
          </p>
        </Panel>
        <Panel className="ogfi-detail-card">
          <p className="text-sm font-semibold text-slate-500">Need setup</p>
          <p className="mt-2 text-3xl font-bold text-slate-950">
            {dashboard.missingGateCount}
          </p>
        </Panel>
      </div>

      <section className="ogfi-data-surface overflow-hidden">
        <div className="ogfi-section-header">
          <div>
            <h2 className="text-lg font-bold text-slate-950">Gate List</h2>
            <p className="text-sm text-slate-500">
              Searchable lifecycle controls with evidence-required actions.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              className="inline-flex min-h-10 items-center rounded-lg border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 hover:bg-slate-50"
              href="/expansion"
            >
              Dashboard
            </Link>
            <EntryModal
              title="Generate Lifecycle Gates"
              triggerLabel="Generate Gates"
              triggerClassName="gap-2"
              disabled={projectsMissingGates.length === 0}
              disabledReason="Every Expansion project you can edit already has its lifecycle gates, or you do not have an editable project in scope."
            >
              <form action={seedGatesAction} className="grid gap-5 pt-5">
                <label className="grid gap-2 text-sm font-semibold text-slate-700">
                  Expansion project
                  <select
                    className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm"
                    name="projectId"
                    required
                  >
                    <option value="">Select project</option>
                    {projectsMissingGates.map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.code} / {project.name} / {project.siteName}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-950">
                  <p className="font-semibold">Standard expansion gate set</p>
                  <p className="mt-1 text-blue-900/75">
                    Missing gates are created as project milestones using the
                    project target opening date. Existing gates are preserved.
                  </p>
                </div>
                <button
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-bold text-white hover:bg-blue-700"
                  type="submit"
                >
                  <Flag aria-hidden="true" className="h-4 w-4" />
                  Generate Missing Gates
                </button>
              </form>
            </EntryModal>
          </div>
        </div>

        <form
          className="grid gap-3 border-b border-slate-100 px-5 py-4 md:grid-cols-[1fr_14rem_auto_auto]"
          action="/expansion/gates"
        >
          <label className="grid gap-2 text-sm font-semibold text-slate-700">
            Search
            <span className="relative">
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
              />
              <input
                className="min-h-10 w-full rounded-lg border border-slate-300 pl-9 pr-3 text-sm"
                name="q"
                placeholder="Project, gate, site, owner"
                defaultValue={query}
              />
            </span>
          </label>
          <label className="grid gap-2 text-sm font-semibold text-slate-700">
            Status
            <select
              className="min-h-10 rounded-lg border border-slate-300 px-3 text-sm"
              name="status"
              defaultValue={status}
            >
              <option value="">All statuses</option>
              {gateStatusOptions.map((option) => (
                <option key={option} value={option}>
                  {option.replaceAll("_", " ")}
                </option>
              ))}
            </select>
          </label>
          <button
            className="inline-flex min-h-10 items-center justify-center gap-2 self-end rounded-lg bg-blue-600 px-4 text-sm font-bold text-white hover:bg-blue-700"
            type="submit"
          >
            <Filter aria-hidden="true" className="h-4 w-4" />
            Apply
          </button>
          <Link
            className="inline-flex min-h-10 items-center justify-center self-end rounded-lg border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 hover:bg-slate-50"
            href="/expansion/gates"
          >
            Clear
          </Link>
        </form>

        <div className="hidden overflow-x-auto md:block">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-5 py-3">Gate</th>
                <th className="px-5 py-3">Project / Site</th>
                <th className="px-5 py-3">Target</th>
                <th className="px-5 py-3">Owner</th>
                <th className="px-5 py-3">Evidence</th>
                <th className="px-5 py-3">Next Action</th>
                <th className="px-5 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visibleGates.length === 0 ? (
                <tr>
                  <td className="px-5 py-8" colSpan={7}>
                    <div className="flex items-start gap-3">
                      <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-blue-100 bg-blue-50 text-blue-700">
                        <ShieldCheck aria-hidden="true" className="h-5 w-5" />
                      </span>
                      <div>
                        <p className="font-bold text-slate-950">
                          No lifecycle gates found
                        </p>
                        <p className="mt-1 text-sm text-slate-500">
                          Adjust filters or generate gates for an expansion
                          project with missing milestone controls.
                        </p>
                      </div>
                    </div>
                  </td>
                </tr>
              ) : (
                visibleGates.map((gate) => (
                  <tr key={`${gate.projectId}-${gate.gateKey}`}>
                    <td className="px-5 py-4 align-top">
                      <div className="flex items-start gap-3">
                        <span className="mt-1 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600">
                          {gate.status === "ACHIEVED" ? (
                            <CheckCircle2 aria-hidden="true" className="h-4 w-4" />
                          ) : gate.status === "CANCELLED" ? (
                            <XCircle aria-hidden="true" className="h-4 w-4" />
                          ) : (
                            <CalendarClock
                              aria-hidden="true"
                              className="h-4 w-4"
                            />
                          )}
                        </span>
                        <div>
                          <p className="font-bold text-slate-950">
                            {gate.gateOrder}. {gate.title}
                          </p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            <Badge tone={statusTone(gate.status)}>
                              {gate.status.replaceAll("_", " ")}
                            </Badge>
                            {gate.isAtRisk ? (
                              <Badge tone="warning">At risk</Badge>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4 align-top">
                      <p className="font-semibold text-slate-950">
                        {gate.projectCode}
                      </p>
                      <p className="text-sm text-slate-600">{gate.projectName}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {gate.brandName} / {gate.siteName}
                      </p>
                    </td>
                    <td className="px-5 py-4 align-top font-semibold text-slate-700">
                      {formatDate(gate.targetDate)}
                    </td>
                    <td className="px-5 py-4 align-top text-slate-700">
                      <p>{gate.ownerName ?? "Not assigned"}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        Reviewer: {gate.reviewerName}
                      </p>
                    </td>
                    <td className="px-5 py-4 align-top">
                      <Badge
                        tone={
                          gate.evidenceState === "RECORDED"
                            ? "success"
                            : gate.evidenceState === "MISSING"
                              ? "warning"
                              : "neutral"
                        }
                      >
                        {gate.evidenceState.replaceAll("_", " ")}
                      </Badge>
                      {gate.evidenceReference ? (
                        <p className="mt-2 max-w-xs break-words text-xs text-slate-600">
                          {gate.evidenceReference}
                        </p>
                      ) : null}
                      {gate.atRiskReason ? (
                        <p className="mt-2 max-w-xs text-xs text-amber-700">
                          {gate.atRiskReason}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-5 py-4 align-top text-slate-700">
                      {gate.nextAction}
                    </td>
                    <td className="px-5 py-4 align-top text-right">
                      <ActionCell gate={gate} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="divide-y divide-slate-100 md:hidden">
          {visibleGates.length === 0 ? (
            <div className="px-5 py-8">
              <p className="font-bold text-slate-950">No lifecycle gates found</p>
              <p className="mt-1 text-sm text-slate-500">Adjust filters or generate gates for an Expansion project with missing milestone controls.</p>
            </div>
          ) : (
            visibleGates.map((gate) => (
              <article className="grid gap-3 px-5 py-4" key={`${gate.projectId}-${gate.gateKey}`}>
                <div className="flex items-start justify-between gap-3">
                  <div><p className="font-bold text-slate-950">{gate.gateOrder}. {gate.title}</p><p className="mt-1 text-xs text-slate-500">{gate.projectCode} / {gate.projectName}</p></div>
                  <Badge tone={statusTone(gate.status)}>{gate.status.replaceAll("_", " ")}</Badge>
                </div>
                <div className="flex flex-wrap gap-2">
                  {gate.isAtRisk ? <Badge tone="warning">At risk</Badge> : null}
                  <Badge tone={gate.evidenceState === "RECORDED" ? "success" : gate.evidenceState === "MISSING" ? "warning" : "neutral"}>{gate.evidenceState.replaceAll("_", " ")}</Badge>
                  <Badge tone="neutral">Target {formatDate(gate.targetDate)}</Badge>
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm"><div><p className="text-xs font-semibold uppercase text-slate-500">Owner</p><p className="mt-1 font-semibold text-slate-800">{gate.ownerName ?? "Not assigned"}</p></div><div><p className="text-xs font-semibold uppercase text-slate-500">Reviewer</p><p className="mt-1 font-semibold text-slate-800">{gate.reviewerName}</p></div></div>
                <p className="text-sm text-slate-600">Next: {gate.nextAction}</p>
                <ActionCell gate={gate} />
              </article>
            ))
          )}
        </div>
        <Pagination
          page={pagination.page}
          totalPages={pagination.totalPages}
          totalCount={filteredGates.length}
          startIndex={pagination.startIndex}
          endIndex={pagination.endIndex}
          query={query}
          status={status}
        />
      </section>
    </AppShell>
  );
}
