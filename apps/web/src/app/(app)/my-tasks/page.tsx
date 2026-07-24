import { redirect } from "next/navigation";
import { AlertTriangle, ArrowRight, CheckCircle2, ClipboardCheck } from "lucide-react";
import { Badge, ButtonLink, Panel } from "@ogfi/ui";
import { AppShell } from "@/components/AppShell";
import { getSessionContext } from "@/server/services/context";
import { getMyTasksPage, type MyTasksPage } from "@/server/services/myTasks";
import { dashboardTaskPriorities, dashboardTaskStatusCatalog } from "@/server/services/dashboardTasks";

export const dynamic = "force-dynamic";

function getSearchParam(
  searchParams: Record<string, string | string[] | undefined>,
  key: string
) {
  const value = searchParams[key];
  return Array.isArray(value) ? value[0] : value;
}

function taskHref(cursor: string, module?: string, priority?: string, status?: string, due?: string) {
  const params = new URLSearchParams({ cursor });
  if (module) params.set("module", module);
  if (priority) params.set("priority", priority);
  if (status) params.set("status", status);
  if (due) params.set("due", due);
  return `/my-tasks?${params.toString()}`;
}

export default async function MyTasksPage({
  searchParams
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getSessionContext();
  if (!session) {
    redirect("/sign-in");
  }
  const params = searchParams ? await searchParams : {};
  const cursor = getSearchParam(params, "cursor");
  const module = getSearchParam(params, "module");
  const priority = getSearchParam(params, "priority");
  const status = getSearchParam(params, "status");
  const due = getSearchParam(params, "due");
  const cursorReset = getSearchParam(params, "cursorReset") === "1";
  let page: MyTasksPage;
  try {
    page = await getMyTasksPage(session, {
      ...(cursor ? { cursor } : {}),
      ...(module ? { module } : {}),
      ...(priority ? { priority } : {}),
      ...(status ? { status } : {}),
      ...(due ? { due } : {})
    });
  } catch (error) {
    if (error instanceof Error && error.message === "MY_TASK_CURSOR_INVALID") {
      redirect(module ? `/my-tasks?cursorReset=1&module=${encodeURIComponent(module)}` : "/my-tasks?cursorReset=1");
    }
    if (error instanceof Error && error.message === "MY_TASK_FILTER_INVALID") {
      redirect("/my-tasks?cursorReset=1");
    }
    throw error;
  }

  return (
    <AppShell
      session={session}
      title="My Tasks"
      subtitle="Current controlled actions available in your selected operating scope"
      activeNav="my-tasks"
    >
      {cursorReset ? (
        <Panel className="mb-6 border-blue-200 bg-blue-50 p-4">
          <p className="text-sm leading-6 text-blue-950">
            The previous task page expired or no longer matches your current scope. The queue restarted from the highest-priority current work.
          </p>
        </Panel>
      ) : null}
      <section className="mb-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto]">
        <Panel className="p-5">
          <div className="flex items-start gap-3">
            <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
              <ClipboardCheck aria-hidden="true" className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-base font-bold text-slate-950">Current action queue</h2>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                This controlled queue includes Purchase Request, Purchase Order, Transfer, Wastage, Stock Adjustment, Receiving, Branch Operations, Food Safety, eligible Incident resolution, eligible Maintenance completion, and assigned Stock Count start, entry, or submission. Some actions are role-pooled; Stock Count work is shown only to its assigned counter. Use each source workspace for other approved work.
              </p>
            </div>
          </div>
        </Panel>
        <Panel className="flex min-w-48 flex-col justify-center p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Enrolled sources</p>
          <p className="mt-1 text-2xl font-bold text-slate-950">{page.enrolledSources.length}</p>
          <p className="mt-1 text-sm text-slate-600">
            {page.totalCount === null ? "Count temporarily unavailable" : `${page.totalCount} actionable item${page.totalCount === 1 ? "" : "s"}`}
          </p>
        </Panel>
      </section>

      {page.unavailableSources.length > 0 ? (
        <Panel className="mb-6 border-amber-200 bg-amber-50 p-4">
          <div className="flex gap-3 text-amber-950">
            <AlertTriangle aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0" />
            <p className="text-sm leading-6">
              Some enrolled sources are temporarily unavailable ({page.unavailableSources.map((source) => source.label).join(", ")}). Their work is not shown and the total is withheld; open the source workspace to continue safely.
            </p>
          </div>
        </Panel>
      ) : null}

      <section aria-labelledby="my-tasks-list-heading">
        <div className="mb-3 flex items-end justify-between gap-4">
          <div>
            <h2 id="my-tasks-list-heading" className="text-lg font-bold text-slate-950">Action queue</h2>
            <p className="mt-1 text-sm text-slate-600">Highest priority first, then dated work by due date and oldest eligible undated work. Open an item in its authoritative workspace.</p>
          </div>
          {page.isComplete ? <Badge tone="success" size="sm">Available sources loaded</Badge> : <Badge tone="warning" size="sm">Partial availability</Badge>}
        </div>

        <Panel className="mb-4 p-4">
          <form method="get" className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0">
              <label htmlFor="my-tasks-module" className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Module
              </label>
              <select
                id="my-tasks-module"
                name="module"
                defaultValue={module ?? ""}
                className="mt-1 block min-h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 sm:w-72"
              >
                <option value="">All enrolled modules</option>
                {page.enrolledSources.map((source) => (
                  <option key={source.type} value={source.type}>{source.label}</option>
                ))}
              </select>
            </div>
            <div className="min-w-0">
              <label htmlFor="my-tasks-due" className="text-xs font-semibold uppercase tracking-wide text-slate-500">Due date</label>
              <select id="my-tasks-due" name="due" defaultValue={due ?? ""} className="mt-1 block min-h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 sm:w-48">
                <option value="">Any native due date</option>
                <option value="OVERDUE">Overdue</option>
                <option value="TODAY">Due today</option>
                <option value="UPCOMING">Upcoming</option>
                <option value="NO_DUE">No due date</option>
              </select>
            </div>
            <div className="min-w-0">
              <label htmlFor="my-tasks-priority" className="text-xs font-semibold uppercase tracking-wide text-slate-500">Priority</label>
              <select id="my-tasks-priority" name="priority" defaultValue={priority ?? ""} className="mt-1 block min-h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 sm:w-48">
                <option value="">All priorities</option>
                {dashboardTaskPriorities.map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            </div>
            <div className="min-w-0">
              <label htmlFor="my-tasks-status" className="text-xs font-semibold uppercase tracking-wide text-slate-500">Status</label>
              <select id="my-tasks-status" name="status" defaultValue={status ?? ""} disabled={!module} className="mt-1 block min-h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 sm:w-52">
                <option value="">{module ? "All source statuses" : "Select a module first"}</option>
                {module && dashboardTaskStatusCatalog[module as keyof typeof dashboardTaskStatusCatalog]?.map((value) => <option key={value} value={value}>{value.replaceAll("_", " ")}</option>)}
              </select>
            </div>
            <div className="flex gap-2">
              <ButtonLink href="/my-tasks" tone="secondary">Clear filters</ButtonLink>
              <button type="submit" className="min-h-11 rounded-md bg-blue-700 px-4 text-sm font-bold text-white hover:bg-blue-800">Apply filters</button>
            </div>
          </form>
          <p className="mt-2 text-xs leading-5 text-slate-500">
            Module, priority, and source-qualified status filtering narrow the already authorized enrolled sources. Due-date filtering uses only native Incident and Maintenance due fields; other sources intentionally return no rows for date buckets. Location and assignment filters remain server-contract work in progress.
          </p>
        </Panel>

        {page.items.length === 0 ? (
          <Panel className="p-8 text-center">
            <CheckCircle2 aria-hidden="true" className="mx-auto h-8 w-8 text-emerald-600" />
            <h3 className="mt-3 font-bold text-slate-950">No enrolled actions need you right now</h3>
            <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-600">
              Your queue only shows controls you are authorized to complete in the selected location. Check the relevant source workspace for other operational work.
            </p>
          </Panel>
        ) : (
          <div className="overflow-hidden rounded-[var(--radius-card)] border border-slate-200 bg-white shadow-sm">
            <div className="divide-y divide-slate-100">
              {page.items.map((task) => (
                <article key={task.taskId} className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone="info" size="sm">{task.sourceLabel}</Badge>
                      <Badge size="sm">{task.status.replaceAll("_", " ")}</Badge>
                      {task.sourceType === "INCIDENT" || task.sourceType === "MAINTENANCE" ? (
                        <Badge tone={task.priority === "CRITICAL" ? "danger" : task.priority === "HIGH" ? "warning" : "neutral"} size="sm">
                          {task.priority.toLowerCase()} {task.sourceType === "INCIDENT" ? "severity" : "priority"}
                        </Badge>
                      ) : null}
                    </div>
                    <h3 className="mt-2 font-bold text-slate-950">{task.actionLabel}</h3>
                    <p className="mt-1 text-sm text-slate-600">{task.publicReference} · {task.locationLabel}</p>
                  </div>
                  <ButtonLink href={task.href} className="shrink-0">
                    Open action <ArrowRight aria-hidden="true" className="h-4 w-4" />
                  </ButtonLink>
                </article>
              ))}
            </div>
          </div>
        )}
      </section>

      {page.nextCursor ? (
        <div className="mt-6 flex justify-end">
          <ButtonLink href={taskHref(page.nextCursor, module, priority, status, due)} tone="secondary">Load next actions</ButtonLink>
        </div>
      ) : null}
    </AppShell>
  );
}
