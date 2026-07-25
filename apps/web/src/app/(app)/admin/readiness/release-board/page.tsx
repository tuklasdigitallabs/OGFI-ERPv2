import { redirect } from "next/navigation";
import { Badge, PaginationBar, Panel } from "@ogfi/ui";
import { AppShell } from "@/components/AppShell";
import { actionErrorRedirectPath, getActionFeedback } from "@/server/services/actionFeedback";
import { permissions } from "@/server/services/authorization";
import { getSessionContext } from "@/server/services/context";
import {
  assertCanManageReleaseReadiness,
  createReleaseBoardDecision,
  getReleaseBoardDecision,
  listReleaseBoardDecisionPage,
  listReleaseReadinessGates,
  releaseBoardDecisions,
  summarizeReleaseReadiness,
} from "@/server/services/releaseReadiness";

export const dynamic = "force-dynamic";

type ReleaseBoardPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function param(params: Record<string, string | string[] | undefined>, key: string) {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}

function decisionLabel(value: string) {
  return value.replaceAll("_", " ");
}

function dateFilter(value: string | undefined) {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined;
}

async function recordDecisionAction(formData: FormData) {
  "use server";
  const context = new URLSearchParams();
  for (const key of ["q", "decisionFilter", "decidedFrom", "decidedTo", "page", "pageSize", "decisionId"]) {
    const value = formData.get(key);
    if (typeof value === "string" && value.length > 0 && value.length <= 160) context.set(key === "decisionFilter" ? "decision" : key, value);
  }
  const returnPath = `/admin/readiness/release-board?${context.toString()}`;
  try {
    await createReleaseBoardDecision(formData);
  } catch (error) {
    redirect(actionErrorRedirectPath(returnPath, error));
  }
  redirect(returnPath);
}

export default async function ReleaseBoardPage({ searchParams }: ReleaseBoardPageProps) {
  const session = await getSessionContext();
  if (!session) redirect("/sign-in");
  if (!session.permissionCodes.includes(permissions.coreAdminister)) {
    redirect("/overview");
  }
  const params = searchParams ? await searchParams : {};
  const feedback = getActionFeedback(params);
  try {
    await assertCanManageReleaseReadiness(session);
  } catch {
    return (
      <AppShell session={session} title="Release Board" subtitle="Decision and release blocker review" activeNav="admin-readiness">
        <Panel className="border-amber-200 bg-amber-50 text-amber-950">
          <h2 className="text-lg font-bold">Release Board is unavailable</h2>
          <p className="mt-2 text-sm">Core Administration permission and active Manage scope for the selected company are required.</p>
        </Panel>
      </AppShell>
    );
  }

  const query = (param(params, "q") ?? "").slice(0, 120);
  const decisionValue = param(params, "decision");
  const decision = releaseBoardDecisions.includes(decisionValue as (typeof releaseBoardDecisions)[number])
    ? (decisionValue as (typeof releaseBoardDecisions)[number])
    : undefined;
  const decidedFrom = dateFilter(param(params, "decidedFrom"));
  const decidedTo = dateFilter(param(params, "decidedTo"));
  const requestedPage = Number.parseInt(param(params, "page") ?? "1", 10);
  const requestedPageSize = Number.parseInt(param(params, "pageSize") ?? "10", 10);
  const [gates, page] = await Promise.all([
    listReleaseReadinessGates(session),
    listReleaseBoardDecisionPage(session, {
      query,
      decision,
      decidedFrom,
      decidedTo,
      page: Number.isFinite(requestedPage) ? Math.min(Math.max(requestedPage, 1), 10_000) : 1,
      pageSize: Number.isFinite(requestedPageSize) ? Math.min(Math.max(requestedPageSize, 10), 100) : 10,
    }),
  ]);
  const summary = summarizeReleaseReadiness(gates);
  const latestPage = await listReleaseBoardDecisionPage(session, { page: 1, pageSize: 1 });
  const latest = latestPage.items[0] ?? null;
  const selectedId = param(params, "decisionId");
  const selected = selectedId ? await getReleaseBoardDecision(session, selectedId) : null;

  return (
    <AppShell session={session} title="Release Board" subtitle="Decision and release blocker review" activeNav="admin-readiness">
      {feedback ? <p className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">{feedback.message}</p> : null}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div><p className="text-sm text-slate-600">Selected company release decision workspace</p><a className="text-sm font-semibold text-blue-700 hover:underline" href="/admin/readiness?category=go_no_go">Back to Readiness</a></div>
        <span className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600">Append-only decision history</span>
      </div>

      <section className="mb-5 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <Panel className="border-blue-100 bg-blue-50/50">
          <p className="text-xs font-semibold uppercase tracking-wide text-blue-800">Latest Release Board decision</p>
          {latest ? <><h2 className="mt-2 text-2xl font-bold text-slate-950">{decisionLabel(latest.decision)}</h2><p className="mt-1 text-sm text-slate-700">{new Date(latest.decidedAt).toLocaleString()} · {latest.chairUser.displayName || latest.chairUser.email}</p><p className="mt-3 text-sm text-slate-700">{latest.decisionNote}</p><a className="mt-3 inline-flex min-h-11 items-center font-semibold text-blue-700 hover:underline" href={`/admin/readiness/release-board?decisionId=${latest.id}`}>Open latest detail</a></> : <p className="mt-2 text-sm text-slate-700">No decision recorded for this company yet.</p>}
        </Panel>
        <Panel>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Current readiness blockers</p>
          <div className="mt-3 grid grid-cols-3 gap-3 text-center"><div><p className="text-2xl font-bold text-slate-950">{summary.ready}/{summary.required}</p><p className="text-xs text-slate-600">ready</p></div><div><p className="text-2xl font-bold text-amber-700">{summary.blocking}</p><p className="text-xs text-slate-600">pending</p></div><div><p className="text-2xl font-bold text-rose-700">{summary.hold}</p><p className="text-xs text-slate-600">hold</p></div></div>
          <p className="mt-3 text-xs text-slate-600">{summary.canProceed ? "All required gate statuses can proceed to final review." : "One or more required gates still block final review."}</p>
        </Panel>
      </section>

      {selectedId ? <Panel className="mb-5 border-blue-100 bg-blue-50/40">{selected ? <div className="grid gap-2 text-sm text-slate-700"><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg font-bold text-slate-950">Selected decision: {decisionLabel(selected.decision)}</h2><Badge tone={selected.decision === "GO" ? "success" : selected.decision === "HOLD" || selected.decision === "ROLLBACK" ? "destructive" : "warning"}>{decisionLabel(selected.decision)}</Badge></div><p>Decided {new Date(selected.decidedAt).toLocaleString()} by {selected.chairUser.displayName || selected.chairUser.email}</p><p>Evidence: {selected.evidenceReference}</p><p>{selected.decisionNote}</p><p>Participants: {Array.isArray(selected.participants) ? selected.participants.join(", ") : "Participant list unavailable"}</p><a className="font-semibold text-blue-700 hover:underline" href={`/admin/readiness/release-board?${new URLSearchParams({ q: query, ...(decision ? { decision } : {}), ...(decidedFrom ? { decidedFrom } : {}), ...(decidedTo ? { decidedTo } : {}), page: String(page.page), pageSize: String(page.pageSize) }).toString()}`}>Close detail</a></div> : <p className="text-sm text-slate-700">The selected decision is unavailable in the current company scope.</p>}</Panel> : null}

      <section className="mb-5 rounded-xl border border-slate-200 bg-white p-4 shadow-[var(--shadow-surface)]">
        <h2 className="text-lg font-bold text-slate-950">Record a Release Board decision</h2>
        <p className="mt-1 text-sm text-slate-600">Review the readiness snapshot above first. Recording a decision does not change gate status; it creates an audited append-only decision.</p>
        <form action={recordDecisionAction} className="mt-4 grid gap-3 md:grid-cols-2">
          <label className="grid gap-1 text-sm font-medium text-slate-700">Decision<select name="decision" required className="min-h-11 rounded-md border border-slate-300 px-3"><option value="">Select outcome</option>{releaseBoardDecisions.map((value) => <option key={value} value={value}>{decisionLabel(value)}</option>)}</select></label>
          <label className="grid gap-1 text-sm font-medium text-slate-700">Decision date/time (UTC)<input name="decidedAt" type="datetime-local" required className="min-h-11 rounded-md border border-slate-300 px-3" /></label>
          <label className="grid gap-1 text-sm font-medium text-slate-700 md:col-span-2">Evidence reference<input name="evidenceReference" required minLength={3} maxLength={500} className="min-h-11 rounded-md border border-slate-300 px-3" placeholder="Signed board pack or release evidence reference" /></label>
          <label className="grid gap-1 text-sm font-medium text-slate-700 md:col-span-2">Decision basis and conditions<textarea name="decisionNote" required minLength={10} maxLength={1500} rows={4} className="rounded-md border border-slate-300 px-3 py-2" /></label>
          <label className="grid gap-1 text-sm font-medium text-slate-700 md:col-span-2">Participants<textarea name="participants" required minLength={10} maxLength={2000} rows={3} className="rounded-md border border-slate-300 px-3 py-2" placeholder="Names and roles" /></label>
          <label className="grid gap-1 text-sm font-medium text-slate-700 md:col-span-2">Reason for recording<textarea name="reason" required minLength={5} maxLength={500} rows={2} className="rounded-md border border-slate-300 px-3 py-2" /></label>
          <input name="q" type="hidden" value={query} /><input name="decisionFilter" type="hidden" value={decision ?? ""} /><input name="decidedFrom" type="hidden" value={decidedFrom ?? ""} /><input name="decidedTo" type="hidden" value={decidedTo ?? ""} /><input name="page" type="hidden" value={String(page.page)} /><input name="pageSize" type="hidden" value={String(page.pageSize)} />
          <button type="submit" className="min-h-11 rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white md:col-span-2">Record audited decision</button>
        </form>
      </section>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[var(--shadow-surface)]">
        <form method="get" className="grid gap-3 border-b border-slate-100 bg-slate-50 p-4 md:grid-cols-[1fr_12rem_12rem_12rem_auto] md:items-end"><label className="grid gap-1 text-sm font-medium text-slate-700">Search note/reference<input name="q" defaultValue={query} className="min-h-11 rounded-md border border-slate-300 bg-white px-3" /></label><label className="grid gap-1 text-sm font-medium text-slate-700">Decision<select name="decision" defaultValue={decision ?? ""} className="min-h-11 rounded-md border border-slate-300 bg-white px-3"><option value="">All decisions</option>{releaseBoardDecisions.map((value) => <option key={value} value={value}>{decisionLabel(value)}</option>)}</select></label><label className="grid gap-1 text-sm font-medium text-slate-700">From (UTC)<input name="decidedFrom" type="date" defaultValue={decidedFrom} className="min-h-11 rounded-md border border-slate-300 bg-white px-3" /></label><label className="grid gap-1 text-sm font-medium text-slate-700">To (UTC)<input name="decidedTo" type="date" defaultValue={decidedTo} className="min-h-11 rounded-md border border-slate-300 bg-white px-3" /></label><button type="submit" className="min-h-11 rounded-md bg-blue-600 px-4 text-sm font-semibold text-white">Apply</button></form>
        {page.filterError ? <p className="border-b border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">{page.filterError} Adjust the UTC date range and try again.</p> : null}
        <div className="divide-y divide-slate-100">{page.items.length ? page.items.map((item) => <div key={item.id} className="grid gap-3 px-4 py-4 text-sm md:grid-cols-[10rem_12rem_1fr_12rem] md:items-start"><div><Badge tone={item.decision === "GO" ? "success" : item.decision === "HOLD" || item.decision === "ROLLBACK" ? "destructive" : "warning"}>{decisionLabel(item.decision)}</Badge></div><p>{new Date(item.decidedAt).toLocaleString()}</p><div><a className="font-semibold text-blue-700 hover:underline" href={`/admin/readiness/release-board?${new URLSearchParams({ q: query, ...(decision ? { decision } : {}), ...(decidedFrom ? { decidedFrom } : {}), ...(decidedTo ? { decidedTo } : {}), page: String(page.page), pageSize: String(page.pageSize), decisionId: item.id }).toString()}`}>{item.evidenceReference}</a><p className="mt-1 text-slate-600">{item.decisionNote}</p></div><p className="text-slate-700">{item.chairUser.displayName || item.chairUser.email}</p></div>) : <p className="px-4 py-8 text-sm text-slate-600">No Release Board decisions match the current filters.</p>}</div>
        <PaginationBar className="border-t border-slate-100 px-4 py-3" page={page.page} pageSize={page.pageSize} totalItems={page.totalItems} itemLabel="Release Board decisions" getPageHref={(nextPage) => { const next = new URLSearchParams({ q: query, page: String(nextPage), pageSize: String(page.pageSize) }); if (decision) next.set("decision", decision); if (decidedFrom) next.set("decidedFrom", decidedFrom); if (decidedTo) next.set("decidedTo", decidedTo); return `/admin/readiness/release-board?${next.toString()}`; }} />
      </section>
    </AppShell>
  );
}
