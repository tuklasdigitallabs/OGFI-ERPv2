import { redirect } from "next/navigation";
import { AlertTriangle, ArrowRight, CheckCircle2, ClipboardCheck } from "lucide-react";
import { Badge, ButtonLink, Panel } from "@ogfi/ui";
import { AppShell } from "@/components/AppShell";
import { getSessionContext } from "@/server/services/context";
import { getMyTasksPage } from "@/server/services/myTasks";

export const dynamic = "force-dynamic";

function getSearchParam(
  searchParams: Record<string, string | string[] | undefined>,
  key: string
) {
  const value = searchParams[key];
  return Array.isArray(value) ? value[0] : value;
}

function taskHref(cursor: string) {
  return `/my-tasks?cursor=${encodeURIComponent(cursor)}`;
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
  const page = await getMyTasksPage(session, cursor ? { cursor } : {});

  return (
    <AppShell
      session={session}
      title="My Tasks"
      subtitle="Current controlled actions assigned to your selected operating scope"
      activeNav="my-tasks"
    >
      <section className="mb-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto]">
        <Panel className="p-5">
          <div className="flex items-start gap-3">
            <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
              <ClipboardCheck aria-hidden="true" className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-base font-bold text-slate-950">Current action queue</h2>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                This initial queue includes actionable Transfer, Wastage, Stock Adjustment, and Receiving controls. Use each source workspace for other approved work.
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
            <p className="mt-1 text-sm text-slate-600">Oldest eligible action first. Open an item to complete it in its authoritative workspace.</p>
          </div>
          {page.isComplete ? <Badge tone="success" size="sm">Available sources loaded</Badge> : <Badge tone="warning" size="sm">Partial availability</Badge>}
        </div>

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
          <ButtonLink href={taskHref(page.nextCursor)} tone="secondary">Load next actions</ButtonLink>
        </div>
      ) : null}
    </AppShell>
  );
}
