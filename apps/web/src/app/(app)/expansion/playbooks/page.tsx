import Link from "next/link";
import { redirect } from "next/navigation";
import { BookOpenText, Filter, Plus, Search } from "lucide-react";
import { Badge } from "@ogfi/ui";
import { ActionFeedbackBanner } from "@/components/ActionFeedbackBanner";
import { AppShell } from "@/components/AppShell";
import { EntryModal } from "@/components/EntryModal";
import { ExpansionWorkspaceNav } from "@/components/ExpansionWorkspaceNav";
import { getPaginationState } from "@/components/FinancePagination";
import {
  actionErrorRedirectPath,
  getActionFeedback
} from "@/server/services/actionFeedback";
import {
  canConfigureProjectTemplates,
  canUseProjects,
  getDefaultAppRoute,
  permissions
} from "@/server/services/authorization";
import { getSessionContext } from "@/server/services/context";
import {
  createExpansionOpeningPlaybook,
  listExpansionOpeningPlaybooks
} from "@/server/services/projectTemplates";

export const dynamic = "force-dynamic";

const tabs = [
  { key: "all", label: "All" },
  { key: "published", label: "Published" },
  { key: "draft", label: "Draft" },
  { key: "archived", label: "Archived" }
] as const;

const expansionProjectTypes = [
  "Branch Opening",
  "Renovation",
  "Relocation",
  "Construction",
  "Expansion Project"
] as const;

type OpeningPlaybooksPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

async function createOpeningPlaybookAction(formData: FormData) {
  "use server";

  let createdId: string;
  try {
    createdId = await createExpansionOpeningPlaybook(formData);
  } catch (error) {
    redirect(actionErrorRedirectPath("/expansion/playbooks", error));
  }
  redirect(`/expansion/playbooks/${createdId}`);
}

function firstSearchValue(
  value: string | string[] | undefined,
  fallback = ""
) {
  return Array.isArray(value) ? value[0] ?? fallback : value ?? fallback;
}

function statusTone(status: string) {
  if (status === "PUBLISHED") {
    return "success" as const;
  }
  if (status === "ARCHIVED") {
    return "neutral" as const;
  }
  return "info" as const;
}

function playbookHref(input: { tab: string; query: string; page?: number }) {
  const params = new URLSearchParams();
  if (input.tab && input.tab !== "all") {
    params.set("tab", input.tab);
  }
  if (input.query) {
    params.set("q", input.query);
  }
  if (input.page && input.page > 1) {
    params.set("page", String(input.page));
  }
  const queryString = params.toString();
  return queryString ? `/expansion/playbooks?${queryString}` : "/expansion/playbooks";
}

export default async function OpeningPlaybooksPage({
  searchParams
}: OpeningPlaybooksPageProps) {
  const session = await getSessionContext();
  if (!session) {
    redirect("/sign-in");
  }
  const canView =
    canUseProjects(session.permissionCodes) ||
    canConfigureProjectTemplates(session.permissionCodes);
  if (!canView) {
    redirect(getDefaultAppRoute(session.permissionCodes));
  }

  const resolvedSearchParams = searchParams ? await searchParams : {};
  const query = firstSearchValue(resolvedSearchParams.q);
  const requestedTab = firstSearchValue(resolvedSearchParams.tab, "all");
  const tab = tabs.some((item) => item.key === requestedTab) ? requestedTab : "all";
  const actionFeedback = getActionFeedback(resolvedSearchParams);
  const playbooks = await listExpansionOpeningPlaybooks(session);
  const canConfigure = session.permissionCodes.includes(
    permissions.projectTemplateConfigure
  );
  const normalizedQuery = query.trim().toUpperCase();
  const filteredPlaybooks = playbooks.filter((playbook) => {
    const matchesTab =
      tab === "all" ? true : playbook.status.toLowerCase() === tab;
    const matchesQuery = normalizedQuery
      ? [
          playbook.code,
          playbook.name,
          playbook.projectType,
          playbook.status,
          playbook.statusSet.join(" ")
        ]
          .join(" ")
          .toUpperCase()
          .includes(normalizedQuery)
      : true;
    return matchesTab && matchesQuery;
  });
  const pagination = getPaginationState(
    filteredPlaybooks.length,
    firstSearchValue(resolvedSearchParams.page)
  );
  const visiblePlaybooks = filteredPlaybooks.slice(
    pagination.startIndex,
    pagination.endIndex
  );

  return (
    <AppShell
      session={session}
      title="Opening Playbooks"
      subtitle="Reusable branch-opening patterns for future Expansion projects"
      activeNav="opening-playbooks"
    >
      <ActionFeedbackBanner feedback={actionFeedback} />
      <ExpansionWorkspaceNav />

      <div className="ogfi-coordination-cue">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">
              <strong>Opening playbooks seed future Expansion projects only.</strong>{" "}
              They can create starter tasks, milestones, checklist items, and reminder
              defaults when a site project is created.
            </p>
            <p className="mt-1 text-xs text-blue-900/75">
              Publishing or archiving a playbook does not rewrite active projects,
              approve capex, issue POs, create branches, release payments, or post
              inventory.
            </p>
          </div>
          <Badge tone="info">Future-project template</Badge>
        </div>
      </div>

      <section className="ogfi-data-surface overflow-hidden">
        <div className="ogfi-section-header">
          <div>
            <h2 className="text-lg font-bold text-slate-950">Playbook Library</h2>
            <p className="text-sm text-slate-500">
              Select one during site-project creation to start with the standard opening
              workplan.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              className="inline-flex min-h-10 items-center rounded-lg border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 hover:bg-slate-50"
              href="/expansion/sites"
            >
              Create Site Project
            </Link>
            <EntryModal
              title="Create Opening Playbook"
              triggerLabel="Create Opening Playbook"
              triggerClassName="gap-2"
              disabled={!canConfigure}
              disabledReason="Creating an opening playbook requires the Configure Project Templates permission."
            >
              <form action={createOpeningPlaybookAction} className="grid gap-5 pt-5">
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="grid gap-2 text-sm font-semibold text-slate-700">
                    Playbook code
                    <input
                      className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm"
                      name="code"
                      placeholder="YL-BRANCH-OPENING"
                      required
                    />
                  </label>
                  <label className="grid gap-2 text-sm font-semibold text-slate-700">
                    Playbook name
                    <input
                      className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm"
                      name="name"
                      placeholder="Yakiniku Like Branch Opening Playbook"
                      required
                    />
                  </label>
                  <label className="grid gap-2 text-sm font-semibold text-slate-700">
                    Expansion type
                    <select
                      className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm"
                      name="projectType"
                      required
                    >
                      {expansionProjectTypes.map((type) => (
                        <option key={type} value={type}>
                          {type}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <label className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm font-semibold text-slate-700">
                  <input className="mt-1" name="isRestrictedDefault" type="checkbox" />
                  <span>
                    Restricted by default
                    <span className="block text-xs font-normal leading-5 text-slate-500">
                      New projects created from this playbook should start as restricted
                      unless the creator changes the project access.
                    </span>
                  </span>
                </label>
                <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-950">
                  This creates the playbook header and then opens the builder where you
                  can configure tasks, milestones, checklist lines, evidence/signoffs,
                  and reminder defaults.
                </div>
                <button
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-bold text-white hover:bg-blue-700"
                  type="submit"
                >
                  <Plus aria-hidden="true" className="h-4 w-4" />
                  Create and Configure Playbook
                </button>
              </form>
            </EntryModal>
          </div>
        </div>

        <div className="border-b border-slate-100 px-5 pt-4">
          <div className="flex flex-wrap gap-2">
            {tabs.map((item) => (
              <Link
                className={
                  item.key === tab
                    ? "inline-flex min-h-9 items-center rounded-lg bg-blue-600 px-4 text-sm font-bold text-white"
                    : "inline-flex min-h-9 items-center rounded-lg border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 hover:bg-slate-50"
                }
                href={playbookHref({ tab: item.key, query })}
                key={item.key}
              >
                {item.label}
              </Link>
            ))}
          </div>
        </div>

        <form
          action="/expansion/playbooks"
          className="grid gap-3 border-b border-slate-100 px-5 py-4 md:grid-cols-[1fr_auto_auto]"
        >
          <input name="tab" type="hidden" value={tab} />
          <label className="grid gap-2 text-sm font-semibold text-slate-700">
            Search
            <span className="relative">
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
              />
              <input
                className="min-h-10 w-full rounded-lg border border-slate-300 pl-9 pr-3 text-sm"
                defaultValue={query}
                name="q"
                placeholder="Playbook, type, status"
              />
            </span>
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
            href="/expansion/playbooks"
          >
            Clear
          </Link>
        </form>

        <div className="hidden overflow-x-auto md:block">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-5 py-3">Playbook</th>
                <th className="px-5 py-3">Expansion Type</th>
                <th className="px-5 py-3">Starter Work</th>
                <th className="px-5 py-3">Default Access</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visiblePlaybooks.length === 0 ? (
                <tr>
                  <td className="px-5 py-8" colSpan={6}>
                    <div className="flex items-start gap-3">
                      <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-blue-100 bg-blue-50 text-blue-700">
                        <BookOpenText aria-hidden="true" className="h-5 w-5" />
                      </span>
                      <div>
                        <p className="font-bold text-slate-950">
                          No opening playbooks found
                        </p>
                        <p className="mt-1 max-w-2xl text-sm text-slate-500">
                          Create a playbook to make site-project creation faster and
                          more consistent. Published playbooks appear in the Template
                          selector when creating a site project.
                        </p>
                      </div>
                    </div>
                  </td>
                </tr>
              ) : (
                visiblePlaybooks.map((playbook) => (
                  <tr className="align-top hover:bg-slate-50/70" key={playbook.id}>
                    <td className="px-5 py-4">
                      <p className="text-xs font-bold uppercase text-slate-400">
                        {playbook.code}
                      </p>
                      <Link
                        className="mt-1 inline-flex font-bold text-slate-950 hover:text-blue-700"
                        href={`/expansion/playbooks/${playbook.id}`}
                      >
                        {playbook.name}
                      </Link>
                      <p className="mt-1 text-xs text-slate-500">
                        Status flow: {playbook.statusSet.join(", ")}
                      </p>
                    </td>
                    <td className="px-5 py-4 font-semibold text-slate-700">
                      {playbook.projectType}
                    </td>
                    <td className="px-5 py-4 text-slate-600">
                      {playbook.taskCount} task defaults / {playbook.milestoneCount}{" "}
                      milestones
                    </td>
                    <td className="px-5 py-4">
                      <Badge tone={playbook.isRestrictedDefault ? "warning" : "info"}>
                        {playbook.isRestrictedDefault ? "Restricted" : "Standard"}
                      </Badge>
                    </td>
                    <td className="px-5 py-4">
                      <Badge tone={statusTone(playbook.status)}>
                        {playbook.status.replaceAll("_", " ")}
                      </Badge>
                    </td>
                    <td className="px-5 py-4">
                      {canConfigure ? (
                        <div className="flex flex-wrap gap-2">
                          <Link
                            className="inline-flex min-h-10 items-center rounded-lg border border-blue-200 bg-blue-50 px-3 text-xs font-bold text-blue-700 hover:bg-blue-100"
                            href={`/expansion/playbooks/${playbook.id}`}
                          >
                            {playbook.status === "DRAFT" ? "Continue Draft" : "Open Version"}
                          </Link>
                        </div>
                      ) : (
                        <span className="text-xs font-semibold text-slate-500">
                          View only — template configuration permission required.
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="divide-y divide-slate-100 md:hidden">
          {visiblePlaybooks.length === 0 ? <div className="px-5 py-8"><p className="font-bold text-slate-950">No opening playbooks found</p><p className="mt-1 text-sm text-slate-500">Create a playbook to make site-project creation faster and more consistent.</p></div> : visiblePlaybooks.map((playbook) => (
            <Link className="block px-5 py-4 hover:bg-slate-50" href={`/expansion/playbooks/${playbook.id}`} key={playbook.id}>
              <div className="flex items-start justify-between gap-3"><div><p className="font-bold text-slate-950">{playbook.name}</p><p className="mt-1 text-xs text-slate-500">{playbook.code} / {playbook.projectType}</p></div><Badge tone={statusTone(playbook.status)}>{playbook.status.replaceAll("_", " ")}</Badge></div>
              <div className="mt-3 flex flex-wrap gap-2"><Badge tone="neutral">{playbook.taskCount} task defaults</Badge><Badge tone="neutral">{playbook.milestoneCount} milestones</Badge><Badge tone={playbook.isRestrictedDefault ? "warning" : "info"}>{playbook.isRestrictedDefault ? "Restricted default" : "Standard access"}</Badge></div>
              <p className="mt-3 text-sm font-semibold text-blue-700">{canConfigure ? playbook.status === "DRAFT" ? "Continue draft" : "Open version" : "Open playbook"}</p>
            </Link>
          ))}
        </div>

        {filteredPlaybooks.length > pagination.pageSize ? (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-5 py-4 text-sm text-slate-600">
            <p>
              Showing {pagination.startIndex + 1}-{pagination.endIndex} of{" "}
              {filteredPlaybooks.length}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Link
                aria-disabled={pagination.page === 1}
                className={
                  pagination.page === 1
                    ? "pointer-events-none inline-flex min-h-9 items-center rounded-lg border border-slate-200 bg-slate-100 px-3 font-semibold text-slate-400"
                    : "inline-flex min-h-9 items-center rounded-lg border border-slate-200 bg-white px-3 font-semibold text-slate-700 hover:bg-slate-50"
                }
                href={playbookHref({
                  tab,
                  query,
                  page: Math.max(1, pagination.page - 1)
                })}
              >
                Previous
              </Link>
              <span className="px-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Page {pagination.page} of {pagination.totalPages}
              </span>
              <Link
                aria-disabled={pagination.page === pagination.totalPages}
                className={
                  pagination.page === pagination.totalPages
                    ? "pointer-events-none inline-flex min-h-9 items-center rounded-lg border border-slate-200 bg-slate-100 px-3 font-semibold text-slate-400"
                    : "inline-flex min-h-9 items-center rounded-lg border border-blue-200 bg-blue-50 px-3 font-semibold text-blue-700 hover:bg-blue-100"
                }
                href={playbookHref({
                  tab,
                  query,
                  page: Math.min(pagination.totalPages, pagination.page + 1)
                })}
              >
                Next
              </Link>
            </div>
          </div>
        ) : null}
      </section>
    </AppShell>
  );
}
