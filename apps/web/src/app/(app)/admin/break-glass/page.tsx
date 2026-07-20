import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { AlertTriangle, KeyRound, ShieldCheck } from "lucide-react";
import { Badge, Panel } from "@ogfi/ui";
import { ActionFeedbackBanner } from "@/components/ActionFeedbackBanner";
import { AppShell } from "@/components/AppShell";
import { EntryModal } from "@/components/EntryModal";
import {
  actionErrorRedirectPath,
  getActionFeedback
} from "@/server/services/actionFeedback";
import { getDefaultAppRoute, permissions } from "@/server/services/authorization";
import {
  approveBreakGlassAccess,
  completeBreakGlassPostReview,
  listBreakGlassAccessGrants,
  listBreakGlassAccessOptions,
  rejectBreakGlassAccess,
  requestBreakGlassAccess,
  revokeBreakGlassAccess
} from "@/server/services/breakGlassAccess";
import { getSessionContext } from "@/server/services/context";

export const dynamic = "force-dynamic";

type AdminBreakGlassPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type BreakGlassGrant = Awaited<
  ReturnType<typeof listBreakGlassAccessGrants>
>[number];

function humanize(value: string) {
  return value
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function statusTone(status: BreakGlassGrant["status"]) {
  if (status === "ACTIVE") {
    return "destructive" as const;
  }
  if (status === "PENDING_REVIEW") {
    return "warning" as const;
  }
  if (status === "POST_REVIEWED") {
    return "success" as const;
  }
  return "neutral" as const;
}

async function requestAction(formData: FormData) {
  "use server";

  try {
    await requestBreakGlassAccess(formData);
  } catch (error) {
    redirect(actionErrorRedirectPath("/admin/break-glass", error));
  }
  revalidatePath("/admin/break-glass");
  redirect("/admin/break-glass");
}

async function approveAction(formData: FormData) {
  "use server";

  try {
    await approveBreakGlassAccess(formData);
  } catch (error) {
    redirect(actionErrorRedirectPath("/admin/break-glass", error));
  }
  revalidatePath("/admin/break-glass");
  redirect("/admin/break-glass");
}

async function rejectAction(formData: FormData) {
  "use server";

  try {
    await rejectBreakGlassAccess(formData);
  } catch (error) {
    redirect(actionErrorRedirectPath("/admin/break-glass", error));
  }
  revalidatePath("/admin/break-glass");
  redirect("/admin/break-glass");
}

async function revokeAction(formData: FormData) {
  "use server";

  try {
    await revokeBreakGlassAccess(formData);
  } catch (error) {
    redirect(actionErrorRedirectPath("/admin/break-glass", error));
  }
  revalidatePath("/admin/break-glass");
  redirect("/admin/break-glass");
}

async function postReviewAction(formData: FormData) {
  "use server";

  try {
    await completeBreakGlassPostReview(formData);
  } catch (error) {
    redirect(actionErrorRedirectPath("/admin/break-glass", error));
  }
  revalidatePath("/admin/break-glass");
  redirect("/admin/break-glass");
}

export default async function AdminBreakGlassPage({
  searchParams
}: AdminBreakGlassPageProps) {
  const session = await getSessionContext();
  if (!session) {
    redirect("/sign-in");
  }
  if (!session.permissionCodes.includes(permissions.coreAdminister)) {
    redirect(getDefaultAppRoute(session.permissionCodes));
  }

  const params = searchParams ? await searchParams : {};
  const actionFeedback = getActionFeedback(params);
  const [grants, options] = await Promise.all([
    listBreakGlassAccessGrants(session),
    listBreakGlassAccessOptions(session)
  ]);

  return (
    <AppShell
      session={session}
      title="Break-Glass Access"
      subtitle="Emergency privileged access register and post-use review"
      activeNav="admin-break-glass"
    >
      <ActionFeedbackBanner feedback={actionFeedback} />

      <section className="mb-5 overflow-hidden rounded-2xl border border-amber-200 bg-white shadow-[var(--shadow-surface)]">
        <div className="grid gap-5 bg-gradient-to-br from-amber-50 via-white to-slate-50 p-5 lg:grid-cols-[1.3fr_0.7fr] lg:p-6">
          <div>
            <Badge tone="warning">Security control</Badge>
            <h2 className="mt-3 text-2xl font-bold text-slate-950">
              Use only for time-boxed emergency access.
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              Break-glass grants require reason, evidence, expiry, separate
              approval, automatic expiry checks, revocation, and post-use review.
              They are not routine role or scope setup.
            </p>
          </div>
          <div className="rounded-xl border border-amber-200 bg-white/85 p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle aria-hidden="true" className="mt-0.5 h-5 w-5 text-amber-600" />
              <p className="text-sm leading-6 text-slate-700">
                Maximum duration is {options.maxDurationHours} hours. Target
                user sessions are invalidated when access activates, expires, or
                is revoked.
              </p>
            </div>
          </div>
        </div>
      </section>

      <Panel className="ogfi-detail-card">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <KeyRound aria-hidden="true" className="h-5 w-5 text-amber-600" />
              <h2 className="text-lg font-bold text-slate-950">
                Break-glass register
              </h2>
            </div>
            <p className="mt-1 text-sm text-slate-500">
              Request, approve, revoke, expire, and post-review emergency access.
            </p>
          </div>
          <EntryModal
            title="Request Break-Glass Access"
            triggerLabel="Request Access"
            triggerClassName="bg-amber-600 hover:bg-amber-700"
          >
            <form action={requestAction} className="ogfi-form-shell mt-4 grid gap-4">
              <div className="grid gap-3 md:grid-cols-2">
                <label className="grid gap-1 text-sm font-medium text-slate-700">
                  Target user
                  <select name="targetUserId" className="rounded-md border border-slate-300 px-3 py-2" required>
                    {options.users.map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-1 text-sm font-medium text-slate-700">
                  Location
                  <select name="locationId" className="rounded-md border border-slate-300 px-3 py-2" required>
                    {options.locations.map((location) => (
                      <option key={location.id} value={location.id}>
                        {location.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <label className="grid gap-1 text-sm font-medium text-slate-700">
                  Access level
                  <select name="accessLevel" className="rounded-md border border-slate-300 px-3 py-2" required>
                    <option value="VIEW">VIEW</option>
                    <option value="OPERATE">OPERATE</option>
                    <option value="APPROVE">APPROVE</option>
                    <option value="MANAGE">MANAGE</option>
                  </select>
                </label>
                <label className="grid gap-1 text-sm font-medium text-slate-700">
                  Expires at
                  <input name="requestedUntil" type="datetime-local" className="rounded-md border border-slate-300 px-3 py-2" required />
                </label>
              </div>
              <label className="grid gap-1 text-sm font-medium text-slate-700">
                Reason
                <textarea name="reason" className="min-h-24 rounded-md border border-slate-300 px-3 py-2" required />
              </label>
              <label className="grid gap-1 text-sm font-medium text-slate-700">
                Evidence reference
                <input name="evidenceReference" className="rounded-md border border-slate-300 px-3 py-2" required />
              </label>
              <button className="min-h-10 rounded-md bg-amber-600 px-4 text-sm font-semibold text-white hover:bg-amber-700">
                Submit Break-Glass Request
              </button>
            </form>
          </EntryModal>
        </div>

        <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200">
          {grants.length === 0 ? (
            <p className="p-4 text-sm text-slate-600">
              No break-glass access has been recorded.
            </p>
          ) : (
            grants.map((grant) => {
              const canReviewDecision =
                grant.status === "PENDING_REVIEW" &&
                grant.targetUserId !== session.user.id;
              const canPostReview = ["REVOKED", "EXPIRED", "REJECTED"].includes(
                grant.status
              );
              return (
                <div key={grant.id} className="grid gap-4 p-4 xl:grid-cols-[1fr_auto]">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-bold text-slate-950">
                        {grant.targetUserName}
                      </p>
                      <Badge tone={statusTone(grant.status)}>
                        {humanize(grant.status)}
                      </Badge>
                      <Badge tone="info">{humanize(grant.accessLevel)}</Badge>
                    </div>
                    <p className="mt-1 text-sm text-slate-600">
                      {grant.locationName} / {grant.locationCode} /{" "}
                      {humanize(grant.locationType)}
                    </p>
                    <p className="mt-2 text-sm text-slate-700">{grant.reason}</p>
                    <p className="mt-1 text-xs font-semibold text-slate-500">
                      Evidence: {grant.evidenceReference} / Requested by{" "}
                      {grant.requestedByName} / Expires{" "}
                      {new Date(grant.requestedUntil).toLocaleString()}
                    </p>
                    {grant.approvedByName ? (
                      <p className="mt-1 text-xs font-semibold text-slate-500">
                        Approved by {grant.approvedByName} /{" "}
                        {grant.approvalReason}
                      </p>
                    ) : null}
                    {grant.revokedAt ? (
                      <p className="mt-1 text-xs font-semibold text-slate-500">
                        Closed {new Date(grant.revokedAt).toLocaleString()} /{" "}
                        {grant.revocationReason}
                      </p>
                    ) : null}
                    {grant.postReviewedAt ? (
                      <p className="mt-1 text-xs font-semibold text-emerald-700">
                        Post-reviewed by {grant.postReviewedByName} /{" "}
                        {humanize(grant.postReviewOutcome ?? "completed")} /{" "}
                        {grant.postReviewEvidenceReference}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-2 xl:justify-end">
                    {canReviewDecision ? (
                      <>
                        <EntryModal title="Approve Break-Glass Access" triggerLabel="Approve">
                          <form action={approveAction} className="ogfi-form-shell mt-4 grid gap-3">
                            <input name="grantId" type="hidden" value={grant.id} />
                            <label className="grid gap-1 text-sm font-medium text-slate-700">
                              Approval reason
                              <textarea name="reason" className="min-h-24 rounded-md border border-slate-300 px-3 py-2" required />
                            </label>
                            <button className="min-h-10 rounded-md bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700">
                              Activate Access
                            </button>
                          </form>
                        </EntryModal>
                        <EntryModal title="Reject Break-Glass Access" triggerLabel="Reject" triggerClassName="bg-red-600 hover:bg-red-700">
                          <form action={rejectAction} className="ogfi-form-shell mt-4 grid gap-3">
                            <input name="grantId" type="hidden" value={grant.id} />
                            <label className="grid gap-1 text-sm font-medium text-slate-700">
                              Rejection reason
                              <textarea name="reason" className="min-h-24 rounded-md border border-slate-300 px-3 py-2" required />
                            </label>
                            <button className="min-h-10 rounded-md bg-red-600 px-4 text-sm font-semibold text-white hover:bg-red-700">
                              Reject Access
                            </button>
                          </form>
                        </EntryModal>
                      </>
                    ) : null}
                    {grant.status === "ACTIVE" ? (
                      <EntryModal title="Revoke Break-Glass Access" triggerLabel="Revoke" triggerClassName="bg-red-600 hover:bg-red-700">
                        <form action={revokeAction} className="ogfi-form-shell mt-4 grid gap-3">
                          <input name="grantId" type="hidden" value={grant.id} />
                          <label className="grid gap-1 text-sm font-medium text-slate-700">
                            Revocation reason
                            <textarea name="reason" className="min-h-24 rounded-md border border-slate-300 px-3 py-2" required />
                          </label>
                          <button className="min-h-10 rounded-md bg-red-600 px-4 text-sm font-semibold text-white hover:bg-red-700">
                            Revoke Access
                          </button>
                        </form>
                      </EntryModal>
                    ) : null}
                    {canPostReview ? (
                      <EntryModal title="Complete Break-Glass Post-Review" triggerLabel="Post-Review" triggerClassName="border border-blue-200 bg-white text-blue-700 hover:bg-blue-50">
                        <form action={postReviewAction} className="ogfi-form-shell mt-4 grid gap-3">
                          <input name="grantId" type="hidden" value={grant.id} />
                          <label className="grid gap-1 text-sm font-medium text-slate-700">
                            Outcome
                            <select name="postReviewOutcome" className="rounded-md border border-slate-300 px-3 py-2" required>
                              <option value="ACCEPTED">Accepted</option>
                              <option value="FOLLOW_UP_REQUIRED">Follow-up required</option>
                              <option value="POLICY_EXCEPTION">Policy exception</option>
                            </select>
                          </label>
                          <label className="grid gap-1 text-sm font-medium text-slate-700">
                            Review reason
                            <textarea name="postReviewReason" className="min-h-24 rounded-md border border-slate-300 px-3 py-2" required />
                          </label>
                          <label className="grid gap-1 text-sm font-medium text-slate-700">
                            Review evidence
                            <input name="postReviewEvidenceReference" className="rounded-md border border-slate-300 px-3 py-2" required />
                          </label>
                          <button className="min-h-10 rounded-md bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700">
                            Save Post-Review
                          </button>
                        </form>
                      </EntryModal>
                    ) : null}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </Panel>

      <div className="mt-5 rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-900">
        <div className="flex items-start gap-3">
          <ShieldCheck aria-hidden="true" className="mt-0.5 h-5 w-5" />
          <p>
            This register records ERP break-glass scope access. External MFA,
            identity-provider elevation, infrastructure access, and password
            vault activity must still be evidenced in their approved systems.
          </p>
        </div>
      </div>
    </AppShell>
  );
}
