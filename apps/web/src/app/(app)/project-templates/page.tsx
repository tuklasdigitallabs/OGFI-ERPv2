import { redirect } from "next/navigation";
import { Badge, Panel } from "@ogfi/ui";
import { ActionFeedbackBanner } from "@/components/ActionFeedbackBanner";
import { AppShell } from "@/components/AppShell";
import { EntryModal } from "@/components/EntryModal";
import {
  actionErrorRedirectPath,
  getActionFeedback
} from "@/server/services/actionFeedback";
import {
  canConfigureProjectTemplates,
  getDefaultAppRoute,
  permissions
} from "@/server/services/authorization";
import { getSessionContext } from "@/server/services/context";
import {
  archiveProjectTemplate,
  createProjectTemplate,
  listProjectTemplates,
  publishProjectTemplate
} from "@/server/services/projectTemplates";

export const dynamic = "force-dynamic";

async function createTemplateAction(formData: FormData) {
  "use server";

  try {
    await createProjectTemplate(formData);
  } catch (error) {
    redirect(actionErrorRedirectPath("/project-templates", error));
  }
  redirect("/project-templates");
}

async function publishTemplateAction(formData: FormData) {
  "use server";

  try {
    await publishProjectTemplate(formData);
  } catch (error) {
    redirect(actionErrorRedirectPath("/project-templates", error));
  }
  redirect("/project-templates");
}

async function archiveTemplateAction(formData: FormData) {
  "use server";

  try {
    await archiveProjectTemplate(formData);
  } catch (error) {
    redirect(actionErrorRedirectPath("/project-templates", error));
  }
  redirect("/project-templates");
}

function templateTone(status: string) {
  if (status === "PUBLISHED") {
    return "success" as const;
  }
  if (status === "ARCHIVED") {
    return "neutral" as const;
  }
  return "info" as const;
}

type ProjectTemplatesPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ProjectTemplatesPage({
  searchParams
}: ProjectTemplatesPageProps) {
  const session = await getSessionContext();
  if (!session) {
    redirect("/sign-in");
  }
  if (!canConfigureProjectTemplates(session.permissionCodes)) {
    redirect(getDefaultAppRoute(session.permissionCodes));
  }

  const params = searchParams ? await searchParams : {};
  const actionFeedback = getActionFeedback(params);
  const templates = await listProjectTemplates(session);
  const canConfigure = session.permissionCodes.includes(
    permissions.projectTemplateConfigure
  );

  return (
    <AppShell
      session={session}
      title="Project Templates"
      subtitle="Reusable work patterns for future projects only"
      activeNav="project-templates"
    >
      <ActionFeedbackBanner feedback={actionFeedback} />
      <div className="ogfi-coordination-cue">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">
              <strong>Templates govern future work patterns only.</strong> Published
              template changes do not rewrite active project tasks, approvals, inventory,
              or linked ERP source records.
            </p>
            <p className="mt-1 text-xs text-blue-900/75">
              Use templates to standardize rollout, training, maintenance, supplier
              onboarding, and corrective-action project setup.
            </p>
          </div>
          <span>Template control</span>
        </div>
      </div>

      <div className="mb-5 grid gap-4 md:grid-cols-3">
        <Panel className="ogfi-detail-card">
          <p className="text-sm font-semibold text-slate-500">Templates</p>
          <p className="mt-2 text-3xl font-bold text-slate-950">{templates.length}</p>
        </Panel>
        <Panel className="ogfi-detail-card">
          <p className="text-sm font-semibold text-slate-500">Published</p>
          <p className="mt-2 text-3xl font-bold text-emerald-700">
            {templates.filter((template) => template.status === "PUBLISHED").length}
          </p>
        </Panel>
        <Panel className="ogfi-detail-card">
          <p className="text-sm font-semibold text-slate-500">Draft</p>
          <p className="mt-2 text-3xl font-bold text-blue-700">
            {templates.filter((template) => template.status === "DRAFT").length}
          </p>
        </Panel>
      </div>

      {canConfigure ? (
        <div className="mb-5 flex justify-end">
          <EntryModal title="Create Template" triggerLabel="Create Template">
            <form action={createTemplateAction} className="ogfi-form-shell mt-4 grid gap-3">
              <div className="grid gap-3 md:grid-cols-2">
                <input className="rounded-md border border-slate-300 px-3 py-2" name="code" placeholder="ROLL-001" required />
                <input className="rounded-md border border-slate-300 px-3 py-2" name="name" placeholder="Branch rollout template" required />
              </div>
              <input className="rounded-md border border-slate-300 px-3 py-2" name="projectType" placeholder="ERP / IT Implementation" required />
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input name="isRestrictedDefault" type="checkbox" />
                Restricted by default
              </label>
              <button className="rounded-md bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700">
                Create Template
              </button>
            </form>
          </EntryModal>
        </div>
      ) : null}

      <div className="space-y-4">
        <section className="ogfi-data-surface">
          <div className="ogfi-section-header">
            <h2 className="text-lg font-bold text-slate-950">Template Registry</h2>
            <p className="text-sm text-slate-500">
              Published template changes affect future projects only.
            </p>
          </div>
          {templates.length === 0 ? (
            <p className="ogfi-empty-state text-sm text-slate-600">No project templates yet.</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {templates.map((template) => (
                <div className="ogfi-list-row grid gap-3 md:grid-cols-[1fr_10rem_12rem]" key={template.id}>
                  <div>
                    <p className="text-xs font-bold uppercase text-slate-400">
                      {template.code} / {template.projectType}
                    </p>
                    <h3 className="font-bold text-slate-950">{template.name}</h3>
                    <p className="mt-1 text-xs text-slate-500">
                      Statuses: {template.statusSet.join(", ")}
                    </p>
                  </div>
                  <Badge tone={templateTone(template.status)}>
                    {template.status}
                  </Badge>
                  {canConfigure ? (
                    <div className="grid gap-2">
                      {template.status === "DRAFT" ? (
                        <form action={publishTemplateAction}>
                          <input name="id" type="hidden" value={template.id} />
                          <button className="ogfi-mobile-action w-full rounded-md border border-emerald-200 bg-emerald-50 px-3 text-xs font-bold text-emerald-700">
                            Publish
                          </button>
                        </form>
                      ) : null}
                      {template.status !== "ARCHIVED" ? (
                        <form action={archiveTemplateAction}>
                          <input name="id" type="hidden" value={template.id} />
                          <button className="ogfi-mobile-action w-full rounded-md border border-slate-300 px-3 text-xs font-bold text-slate-700">
                            Archive
                          </button>
                        </form>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}
