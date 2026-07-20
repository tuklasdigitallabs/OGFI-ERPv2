import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { RotateCw, ShieldAlert } from "lucide-react";
import { Badge, Panel } from "@ogfi/ui";
import { ActionFeedbackBanner } from "@/components/ActionFeedbackBanner";
import { AppShell } from "@/components/AppShell";
import { EntryModal } from "@/components/EntryModal";
import {
  actionErrorRedirectPath,
  getActionFeedback
} from "@/server/services/actionFeedback";
import {
  completeAuthSessionInvalidation,
  listAuthSessionInvalidations
} from "@/server/services/authInvalidation";
import { getDefaultAppRoute, permissions } from "@/server/services/authorization";
import { getSessionContext } from "@/server/services/context";

export const dynamic = "force-dynamic";

type AdminSessionInvalidationPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type InvalidationRecord = Awaited<
  ReturnType<typeof listAuthSessionInvalidations>
>[number];

function statusTone(status: InvalidationRecord["status"]) {
  return status === "PROVIDER_COMPLETED" ? ("success" as const) : ("warning" as const);
}

async function completeAction(formData: FormData) {
  "use server";
  try {
    await completeAuthSessionInvalidation(formData);
  } catch (error) {
    redirect(actionErrorRedirectPath("/admin/session-invalidation", error));
  }
  revalidatePath("/admin/session-invalidation");
  redirect("/admin/session-invalidation");
}

export default async function AdminSessionInvalidationPage({
  searchParams
}: AdminSessionInvalidationPageProps) {
  const session = await getSessionContext();
  if (!session) {
    redirect("/sign-in");
  }
  if (!session.permissionCodes.includes(permissions.coreAdminister)) {
    redirect(getDefaultAppRoute(session.permissionCodes));
  }

  const params = searchParams ? await searchParams : {};
  const actionFeedback = getActionFeedback(params);
  const records = await listAuthSessionInvalidations(session);

  return (
    <AppShell
      session={session}
      title="Session Invalidation"
      subtitle="Provider follow-up queue for privilege changes"
      activeNav="admin-session-invalidation"
    >
      <ActionFeedbackBanner feedback={actionFeedback} />

      <section className="mb-5 rounded-2xl border border-blue-200 bg-blue-50 p-5">
        <div className="flex items-start gap-3">
          <ShieldAlert aria-hidden="true" className="mt-0.5 h-5 w-5 text-blue-700" />
          <div>
            <Badge tone="info">Provider-neutral register</Badge>
            <h2 className="mt-3 text-xl font-bold text-slate-950">
              Demo sessions are blocked locally; production provider termination
              still needs external evidence.
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-700">
              These records are created when role, scope, high-risk access, or
              break-glass actions change privileges. Mark provider completion only
              after the IdP/session provider action is evidenced by a separate
              admin reviewer.
            </p>
          </div>
        </div>
      </section>

      <Panel className="ogfi-detail-card">
        <div className="mb-4 flex items-center gap-2">
          <RotateCw aria-hidden="true" className="h-5 w-5 text-blue-600" />
          <h2 className="text-lg font-bold text-slate-950">
            Invalidation Queue
          </h2>
        </div>

        <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200">
          {records.length === 0 ? (
            <p className="p-4 text-sm text-slate-600">
              No session invalidation records found for this company scope.
            </p>
          ) : (
            records.map((record) => (
              <div
                key={record.id}
                className="grid gap-4 p-4 lg:grid-cols-[1fr_auto] lg:items-center"
              >
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-bold text-slate-950">
                      {record.targetUserName}
                    </p>
                    <Badge tone={statusTone(record.status)}>
                      {record.status.replaceAll("_", " ")}
                    </Badge>
                    {record.demoEpochEnforced ? (
                      <Badge tone="success">Demo epoch enforced</Badge>
                    ) : null}
                  </div>
                  <p className="mt-1 text-sm text-slate-600">
                    {record.targetUserEmail}
                  </p>
                  <p className="mt-2 text-sm text-slate-700">{record.reason}</p>
                  <p className="mt-1 text-xs font-semibold text-slate-500">
                    Source: {record.sourceEventType}
                    {record.sourceRecordId ? ` / ${record.sourceRecordId}` : ""} /
                    Created {new Date(record.createdAt).toLocaleString()}
                  </p>
                  {record.providerReference ? (
                    <p className="mt-1 text-xs font-semibold text-emerald-700">
                      Provider: {record.providerName} / {record.providerReference}
                    </p>
                  ) : null}
                </div>
                {record.status === "PENDING_PROVIDER" ? (
                  <EntryModal
                    title="Complete Provider Invalidation"
                    triggerLabel="Mark Provider Complete"
                  >
                    <form action={completeAction} className="ogfi-form-shell mt-4 grid gap-4">
                      <input name="invalidationId" type="hidden" value={record.id} />
                      <label className="grid gap-1 text-sm font-medium text-slate-700">
                        Provider name
                        <input name="providerName" className="rounded-md border border-slate-300 px-3 py-2" required />
                      </label>
                      <label className="grid gap-1 text-sm font-medium text-slate-700">
                        Provider reference
                        <input name="providerReference" className="rounded-md border border-slate-300 px-3 py-2" required />
                      </label>
                      <label className="grid gap-1 text-sm font-medium text-slate-700">
                        Completion reason
                        <textarea name="reason" className="min-h-24 rounded-md border border-slate-300 px-3 py-2" required />
                      </label>
                      <button className="min-h-10 rounded-md bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700">
                        Save Provider Completion
                      </button>
                    </form>
                  </EntryModal>
                ) : null}
              </div>
            ))
          )}
        </div>
      </Panel>
    </AppShell>
  );
}
