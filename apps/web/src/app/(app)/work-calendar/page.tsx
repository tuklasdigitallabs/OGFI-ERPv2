import Link from "next/link";
import { redirect } from "next/navigation";
import { Badge, Panel } from "@ogfi/ui";
import { ActionFeedbackBanner } from "@/components/ActionFeedbackBanner";
import { AppShell } from "@/components/AppShell";
import { EntryModal } from "@/components/EntryModal";
import { canUseProjects, getDefaultAppRoute } from "@/server/services/authorization";
import {
  actionErrorRedirectPath,
  getActionFeedback
} from "@/server/services/actionFeedback";
import { getSessionContext } from "@/server/services/context";
import {
  createProjectMilestone,
  listProjectCalendarEvents,
  listProjectMilestones,
  transitionProjectMilestone,
  type ProjectCalendarEvent
} from "@/server/services/projectMilestones";
import { listProjects } from "@/server/services/projects";

export const dynamic = "force-dynamic";

type WorkCalendarPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function getParam(
  params: Record<string, string | string[] | undefined>,
  key: string
) {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}

async function createMilestoneAction(formData: FormData) {
  "use server";

  const projectId = String(formData.get("projectId") ?? "");
  try {
    await createProjectMilestone(formData);
  } catch (error) {
    redirect(actionErrorRedirectPath(`/work-calendar?projectId=${projectId}`, error));
  }
  redirect(`/work-calendar?projectId=${projectId}`);
}

async function transitionMilestoneAction(formData: FormData) {
  "use server";

  const projectId = String(formData.get("projectId") ?? "");
  try {
    await transitionProjectMilestone(formData);
  } catch (error) {
    redirect(actionErrorRedirectPath(`/work-calendar?projectId=${projectId}`, error));
  }
  redirect(`/work-calendar?projectId=${projectId}`);
}

function eventTone(event: ProjectCalendarEvent) {
  if (event.status === "ACHIEVED" || event.status === "COMPLETED") {
    return "success" as const;
  }
  if (event.isAtRisk || event.status === "BLOCKED" || event.status === "CANCELLED") {
    return "warning" as const;
  }
  return event.type === "MILESTONE" ? ("info" as const) : ("neutral" as const);
}

export default async function WorkCalendarPage({ searchParams }: WorkCalendarPageProps) {
  const session = await getSessionContext();
  if (!session) {
    redirect("/sign-in");
  }
  if (!canUseProjects(session.permissionCodes)) {
    redirect(getDefaultAppRoute(session.permissionCodes));
  }

  const params = searchParams ? await searchParams : {};
  const actionFeedback = getActionFeedback(params);
  const projects = await listProjects(session);
  const selectedProjectId = getParam(params, "projectId");
  const selectedProject =
    projects.find((project) => project.id === selectedProjectId) ?? projects[0] ?? null;
  const from = getParam(params, "from");
  const to = getParam(params, "to");
  const [events, milestones] = selectedProject
    ? await Promise.all([
        listProjectCalendarEvents(session, {
          projectId: selectedProject.id,
          ...(from ? { from } : {}),
          ...(to ? { to } : {})
        }),
        listProjectMilestones(session, selectedProject.id)
      ])
    : [[], []];

  const today = new Date().toISOString().slice(0, 10);
  const overdueEvents = events.filter(
    (event) =>
      event.eventDate < today &&
      !["ACHIEVED", "COMPLETED", "CANCELLED"].includes(event.status)
  );
  const nextMilestone = milestones.find((milestone) => milestone.status === "PLANNED");

  return (
    <AppShell
      session={session}
      title="Work Calendar"
      subtitle="Derived milestone and task due-date view for authorized projects"
      activeNav="work-calendar"
    >
      <ActionFeedbackBanner feedback={actionFeedback} />
      <div className="ogfi-coordination-cue">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">
              <strong>Schedule view, not a resource scheduler.</strong> This page
              projects milestone dates and task due dates from authorized project
              records.
            </p>
            <p className="mt-1 text-xs text-blue-900/75">
              Changing dates or statuses still happens through the project milestone and
              task actions, with source ERP records remaining controlled in their own
              modules.
            </p>
          </div>
          <span>Schedule View</span>
        </div>
      </div>

      <div className="mb-5 grid gap-4 md:grid-cols-4">
        <Panel className="ogfi-detail-card">
          <p className="text-sm font-semibold text-slate-500">Visible events</p>
          <p className="mt-2 text-3xl font-bold text-slate-950">{events.length}</p>
        </Panel>
        <Panel className="ogfi-detail-card">
          <p className="text-sm font-semibold text-slate-500">Milestones</p>
          <p className="mt-2 text-3xl font-bold text-blue-700">
            {events.filter((event) => event.type === "MILESTONE").length}
          </p>
        </Panel>
        <Panel className="ogfi-detail-card">
          <p className="text-sm font-semibold text-slate-500">Overdue</p>
          <p className="mt-2 text-3xl font-bold text-amber-700">
            {overdueEvents.length}
          </p>
        </Panel>
        <Panel className="ogfi-detail-card">
          <p className="text-sm font-semibold text-slate-500">Next milestone</p>
          <p className="mt-2 text-base font-bold text-slate-950">
            {nextMilestone ? nextMilestone.title : "None planned"}
          </p>
        </Panel>
      </div>

      {projects.length === 0 ? (
        <Panel className="ogfi-empty-state">
          <p className="font-semibold text-slate-900">No visible projects yet</p>
          <p className="mt-1 text-sm text-slate-600">
            Calendar events appear after a scoped project exists.
          </p>
        </Panel>
      ) : (
        <div className="grid gap-4">
          <div className="flex justify-end">
            <EntryModal title="Add Milestone" triggerLabel="Add Milestone">
              <div className="mt-1 flex items-center justify-between gap-3">
                <p className="text-sm text-slate-500">
                  Date-only planning marker for the selected project.
                </p>
                <Badge tone="info">{selectedProject?.code}</Badge>
              </div>
              {selectedProject?.canMutateWork ? (
                <form action={createMilestoneAction} className="mt-4 grid gap-3">
                  <input name="projectId" type="hidden" value={selectedProject.id} />
                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="grid gap-1 text-sm font-medium text-slate-700">
                      Title
                      <input
                        className="rounded-md border border-slate-300 px-3 py-2"
                        name="title"
                        placeholder="Training complete"
                        required
                      />
                    </label>
                    <label className="grid gap-1 text-sm font-medium text-slate-700">
                      Target date
                      <input
                        className="rounded-md border border-slate-300 px-3 py-2"
                        name="targetDate"
                        required
                        type="date"
                      />
                    </label>
                  </div>
                  <label className="grid gap-1 text-sm font-medium text-slate-700">
                    Description
                    <textarea
                      className="min-h-20 rounded-md border border-slate-300 px-3 py-2"
                      name="description"
                      placeholder="Milestone outcome and acceptance signal"
                    />
                  </label>
                  <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                    <input name="isAtRisk" type="checkbox" />
                    Mark at risk
                  </label>
                  <input
                    className="rounded-md border border-amber-300 px-3 py-2 text-sm"
                    name="atRiskReason"
                    placeholder="At-risk reason"
                  />
                  <button className="min-h-10 rounded-md bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700">
                    Add Milestone
                  </button>
                </form>
              ) : (
                <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <p className="text-sm font-semibold text-slate-800">
                    Read-only calendar access
                  </p>
                  <p className="mt-1 text-sm text-slate-600">
                    You can view milestones and task dates for this project, but milestone
                    changes require project work access.
                  </p>
                </div>
              )}
            </EntryModal>
          </div>

          <div className="grid gap-4 xl:grid-cols-[18rem_1fr_22rem]">
          <aside className="grid content-start gap-2">
            <h2 className="text-sm font-bold uppercase text-slate-500">Projects</h2>
            {projects.map((project) => (
              <Link
                className={`rounded-lg border px-3 py-3 text-sm font-semibold ${
                  selectedProject?.id === project.id
                    ? "border-blue-300 bg-blue-50 text-blue-900"
                    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                }`}
                href={`/work-calendar?projectId=${project.id}`}
                key={project.id}
              >
                <span className="block">{project.name}</span>
                <span className="text-xs font-medium text-slate-500">
                  {project.code} / {project.scopeLabel}
                </span>
              </Link>
            ))}
          </aside>

          <section className="ogfi-data-surface">
            <div className="flex flex-col gap-3 border-b border-slate-100 p-4 md:flex-row md:items-end md:justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-950">Calendar Events</h2>
                <p className="text-sm text-slate-500">
                  Task due dates and milestone dates only; no operational source records
                  are changed here.
                </p>
              </div>
              <form className="ogfi-filter-bar flex flex-wrap gap-2 rounded-xl border border-slate-100 p-2">
                <input name="projectId" type="hidden" value={selectedProject?.id} />
                <input
                  className="rounded-md border border-slate-300 px-3 text-sm"
                  defaultValue={from}
                  name="from"
                  type="date"
                />
                <input
                  className="rounded-md border border-slate-300 px-3 text-sm"
                  defaultValue={to}
                  name="to"
                  type="date"
                />
                <button className="rounded-md border border-blue-200 bg-blue-50 px-3 text-xs font-bold text-blue-700">
                  Filter
                </button>
              </form>
            </div>
            {events.length === 0 ? (
              <div className="ogfi-empty-state">
                <p className="font-semibold text-slate-900">No calendar events</p>
                <p className="mt-1 text-sm text-slate-600">
                  Add a milestone or task due date for this project.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {events.map((event) => (
                  <Link
                    className="ogfi-list-row grid gap-3 hover:bg-slate-50 md:grid-cols-[7rem_1fr_9rem_8rem] md:items-center"
                    href={event.href}
                    key={`${event.type}-${event.id}`}
                  >
                    <time className="text-sm font-bold text-slate-950">
                      {event.eventDate}
                    </time>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-bold text-slate-950">{event.title}</h3>
                        <Badge tone={eventTone(event)}>
                          {event.type === "MILESTONE" ? "Milestone" : "Task"}
                        </Badge>
                      </div>
                      <p className="text-xs text-slate-500">
                        {event.projectCode} / {event.projectName} / Owner:{" "}
                        {event.ownerName}
                      </p>
                    </div>
                    <Badge tone={eventTone(event)}>
                      {event.status.replaceAll("_", " ")}
                    </Badge>
                    {event.isAtRisk ? <Badge tone="warning">At risk</Badge> : null}
                  </Link>
                ))}
              </div>
            )}
          </section>

          <aside className="grid content-start gap-4">
            <Panel className="ogfi-detail-card">
              <h2 className="text-lg font-bold text-slate-950">Milestones</h2>
              <div className="mt-3 grid gap-3">
                {milestones.length === 0 ? (
                  <p className="text-sm text-slate-600">No milestones yet.</p>
                ) : (
                  milestones.map((milestone) => (
                    <div
                      className="rounded-lg border border-slate-200 p-3"
                      key={milestone.id}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-bold text-slate-950">
                            {milestone.title}
                          </p>
                          <p className="text-xs text-slate-500">
                            {milestone.targetDate} / {milestone.ownerName}
                          </p>
                        </div>
                        <Badge tone={milestone.isAtRisk ? "warning" : "neutral"}>
                          {milestone.status}
                        </Badge>
                      </div>
                      {milestone.canMutate && milestone.status === "PLANNED" ? (
                        <div className="mt-3 grid gap-2 sm:grid-cols-2">
                          <form action={transitionMilestoneAction}>
                            <input name="milestoneId" type="hidden" value={milestone.id} />
                            <input name="projectId" type="hidden" value={milestone.projectId} />
                            <input
                              name="expectedVersion"
                              type="hidden"
                              value={milestone.version}
                            />
                            <input name="nextStatus" type="hidden" value="ACHIEVED" />
                            <button className="ogfi-mobile-action w-full rounded-md border border-emerald-200 bg-emerald-50 px-3 text-xs font-bold text-emerald-700">
                              Achieve
                            </button>
                          </form>
                          <EntryModal title="Cancel Milestone" triggerLabel="Cancel">
                            <form action={transitionMilestoneAction} className="mt-4 grid gap-3">
                              <input name="milestoneId" type="hidden" value={milestone.id} />
                              <input name="projectId" type="hidden" value={milestone.projectId} />
                              <input
                                name="expectedVersion"
                                type="hidden"
                                value={milestone.version}
                              />
                              <input name="nextStatus" type="hidden" value="CANCELLED" />
                              <input
                                className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                                name="reason"
                                placeholder="Cancel reason"
                                required
                              />
                              <button className="min-h-10 rounded-md border border-slate-300 px-3 text-sm font-bold text-slate-700 sm:w-fit">
                                Cancel
                              </button>
                            </form>
                          </EntryModal>
                        </div>
                      ) : null}
                    </div>
                  ))
                )}
              </div>
            </Panel>
          </aside>
          </div>
        </div>
      )}
    </AppShell>
  );
}
