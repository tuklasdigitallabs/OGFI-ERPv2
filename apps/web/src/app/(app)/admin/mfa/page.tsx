import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ShieldCheck, ShieldAlert } from "lucide-react";
import { Badge, Panel } from "@ogfi/ui";
import { ActionFeedbackBanner } from "@/components/ActionFeedbackBanner";
import { AppShell } from "@/components/AppShell";
import { EntryModal } from "@/components/EntryModal";
import {
  actionErrorRedirectPath,
  getActionFeedback
} from "@/server/services/actionFeedback";
import { getDefaultAppRoute, permissions } from "@/server/services/authorization";
import { getSessionContext } from "@/server/services/context";
import {
  listPrivilegedMfaEnrollments,
  recordPrivilegedMfaEnrollment,
  revokePrivilegedMfaEnrollment,
  verifyPrivilegedMfaEnrollment
} from "@/server/services/privilegedMfa";

export const dynamic = "force-dynamic";

type AdminMfaPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type MfaRow = Awaited<ReturnType<typeof listPrivilegedMfaEnrollments>>["rows"][number];

function tone(status: MfaRow["status"]) {
  if (status === "VERIFIED") {
    return "success" as const;
  }
  if (status === "PENDING_VERIFICATION") {
    return "warning" as const;
  }
  if (status === "REVOKED") {
    return "destructive" as const;
  }
  return "neutral" as const;
}

function label(status: string) {
  return status.replaceAll("_", " ");
}

async function recordAction(formData: FormData) {
  "use server";
  try {
    await recordPrivilegedMfaEnrollment(formData);
  } catch (error) {
    redirect(actionErrorRedirectPath("/admin/mfa", error));
  }
  revalidatePath("/admin/mfa");
  redirect("/admin/mfa");
}

async function verifyAction(formData: FormData) {
  "use server";
  try {
    await verifyPrivilegedMfaEnrollment(formData);
  } catch (error) {
    redirect(actionErrorRedirectPath("/admin/mfa", error));
  }
  revalidatePath("/admin/mfa");
  redirect("/admin/mfa");
}

async function revokeAction(formData: FormData) {
  "use server";
  try {
    await revokePrivilegedMfaEnrollment(formData);
  } catch (error) {
    redirect(actionErrorRedirectPath("/admin/mfa", error));
  }
  revalidatePath("/admin/mfa");
  redirect("/admin/mfa");
}

export default async function AdminMfaPage({ searchParams }: AdminMfaPageProps) {
  const session = await getSessionContext();
  if (!session) {
    redirect("/sign-in");
  }
  if (!session.permissionCodes.includes(permissions.coreAdminister)) {
    redirect(getDefaultAppRoute(session.permissionCodes));
  }
  const params = searchParams ? await searchParams : {};
  const actionFeedback = getActionFeedback(params);
  const { rows, options } = await listPrivilegedMfaEnrollments(session);
  const verifiedCount = rows.filter((row) => row.status === "VERIFIED").length;
  const pendingCount = rows.filter(
    (row) => row.status === "PENDING_VERIFICATION"
  ).length;
  const missingCount = rows.filter((row) => row.status === "NOT_RECORDED").length;
  const revokedCount = rows.filter((row) => row.status === "REVOKED").length;
  const readyForStrictEnforcement =
    rows.length > 0 && missingCount === 0 && pendingCount === 0 && revokedCount === 0;

  return (
    <AppShell
      session={session}
      title="MFA Enrollment"
      subtitle="Privileged MFA evidence register"
      activeNav="admin-mfa"
    >
      <ActionFeedbackBanner feedback={actionFeedback} />

      <section className="mb-5 overflow-hidden rounded-2xl border border-blue-200 bg-white shadow-[var(--shadow-surface)]">
        <div className="grid gap-5 bg-gradient-to-br from-blue-50 via-white to-slate-50 p-5 lg:grid-cols-[1.3fr_0.7fr] lg:p-6">
          <div>
            <Badge tone="info">ERP-side enrollment evidence tracking only</Badge>
            <h2 className="mt-3 text-2xl font-bold text-slate-950">
              Track MFA evidence for users with sensitive permissions.
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              This register does not replace runtime MFA authentication at sign-in.
              External IdP/provider or vault proof is required for production
              enforcement.
            </p>
          </div>
          <div className="rounded-xl border border-blue-100 bg-white/85 p-4">
            <div className="flex items-start gap-3">
              <ShieldAlert aria-hidden="true" className="mt-0.5 h-5 w-5 text-blue-600" />
              <p className="text-sm leading-6 text-slate-700">
                Attestation and verification must be performed by different admins.
                Self-attestation and self-verification are blocked.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="mb-5 grid gap-4 md:grid-cols-4">
        <Panel className="ogfi-detail-card">
          <p className="text-sm font-semibold text-slate-500">Privileged users</p>
          <p className="mt-2 text-3xl font-bold text-slate-950">{rows.length}</p>
        </Panel>
        <Panel className="ogfi-detail-card">
          <p className="text-sm font-semibold text-slate-500">Verified evidence</p>
          <p className="mt-2 text-3xl font-bold text-emerald-700">
            {verifiedCount}
          </p>
        </Panel>
        <Panel className="ogfi-detail-card">
          <p className="text-sm font-semibold text-slate-500">Pending verification</p>
          <p className="mt-2 text-3xl font-bold text-amber-700">{pendingCount}</p>
        </Panel>
        <Panel className="ogfi-detail-card">
          <p className="text-sm font-semibold text-slate-500">Missing / revoked</p>
          <p className="mt-2 text-3xl font-bold text-rose-700">
            {missingCount + revokedCount}
          </p>
        </Panel>
      </section>

      <section
        className={`mb-5 rounded-2xl border p-4 text-sm ${
          readyForStrictEnforcement
            ? "border-emerald-200 bg-emerald-50 text-emerald-950"
            : "border-amber-200 bg-amber-50 text-amber-950"
        }`}
      >
        <div className="flex items-start gap-3">
          <ShieldAlert aria-hidden="true" className="mt-0.5 h-5 w-5" />
          <div>
            <p className="font-bold">
              {readyForStrictEnforcement
                ? "Preflight ready for strict privileged MFA enforcement"
                : "Keep privileged MFA in warn/audit mode until all privileged users are verified"}
            </p>
            <p className="mt-1 leading-6">
              Hard-block mode should only be enabled after every privileged user in
              this company scope has verified MFA evidence or an approved rollout
              exception.
            </p>
          </div>
        </div>
      </section>

      <Panel className="ogfi-detail-card">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <ShieldCheck aria-hidden="true" className="h-5 w-5 text-blue-600" />
              <h2 className="text-lg font-bold text-slate-950">
                Privileged users
              </h2>
            </div>
            <p className="mt-1 text-sm text-slate-500">
              Users are included when active roles grant sensitive permissions in
              the current company scope.
            </p>
          </div>
          <EntryModal title="Record MFA Evidence" triggerLabel="Record Evidence">
            <form action={recordAction} className="ogfi-form-shell mt-4 grid gap-4">
              <label className="grid gap-1 text-sm font-medium text-slate-700">
                Target user
                <select name="targetUserId" className="rounded-md border border-slate-300 px-3 py-2" required>
                  {options.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <div className="grid gap-3 md:grid-cols-2">
                <label className="grid gap-1 text-sm font-medium text-slate-700">
                  Provider
                  <input name="providerName" className="rounded-md border border-slate-300 px-3 py-2" placeholder="e.g. Microsoft Entra, Google Workspace" required />
                </label>
                <label className="grid gap-1 text-sm font-medium text-slate-700">
                  Provider subject
                  <input name="providerSubject" className="rounded-md border border-slate-300 px-3 py-2" placeholder="Optional opaque IdP reference" />
                </label>
              </div>
              <label className="grid gap-1 text-sm font-medium text-slate-700">
                Evidence reference
                <input name="evidenceReference" className="rounded-md border border-slate-300 px-3 py-2" required />
              </label>
              <label className="grid gap-1 text-sm font-medium text-slate-700">
                Attestation note
                <textarea name="attestationNote" className="min-h-24 rounded-md border border-slate-300 px-3 py-2" required />
              </label>
              <button className="min-h-10 rounded-md bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700">
                Save Evidence
              </button>
            </form>
          </EntryModal>
        </div>

        <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200">
          {rows.length === 0 ? (
            <p className="p-4 text-sm text-slate-600">
              No privileged users were found for this company scope.
            </p>
          ) : (
            rows.map((row) => (
              <div key={row.userId} className="grid gap-4 p-4 xl:grid-cols-[1fr_auto]">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-bold text-slate-950">{row.userName}</p>
                    <Badge tone={tone(row.status)}>{label(row.status)}</Badge>
                    <Badge tone="warning">
                      {row.sensitivePermissionCount} sensitive
                    </Badge>
                  </div>
                  <p className="mt-1 text-sm text-slate-600">{row.email}</p>
                  {row.providerName ? (
                    <p className="mt-2 text-sm text-slate-700">
                      {row.providerName}
                      {row.providerSubject ? ` / ${row.providerSubject}` : ""}
                    </p>
                  ) : null}
                  {row.evidenceReference ? (
                    <p className="mt-1 text-xs font-semibold text-slate-500">
                      Evidence: {row.evidenceReference} / Attested by{" "}
                      {row.attestedByName}
                    </p>
                  ) : null}
                  {row.verifiedAt ? (
                    <p className="mt-1 text-xs font-semibold text-emerald-700">
                      Verified by {row.verifiedByName} / {row.verificationNote}
                    </p>
                  ) : null}
                  {row.revokedAt ? (
                    <p className="mt-1 text-xs font-semibold text-red-700">
                      Revoked by {row.revokedByName} / {row.revocationReason}
                    </p>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2 xl:justify-end">
                  {row.enrollmentId && row.status === "PENDING_VERIFICATION" ? (
                    <EntryModal title="Verify MFA Evidence" triggerLabel="Verify">
                      <form action={verifyAction} className="ogfi-form-shell mt-4 grid gap-3">
                        <input name="enrollmentId" type="hidden" value={row.enrollmentId} />
                        <label className="grid gap-1 text-sm font-medium text-slate-700">
                          Verification note
                          <textarea name="reason" className="min-h-24 rounded-md border border-slate-300 px-3 py-2" required />
                        </label>
                        <button className="min-h-10 rounded-md bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700">
                          Verify Evidence
                        </button>
                      </form>
                    </EntryModal>
                  ) : null}
                  {row.enrollmentId && row.status !== "REVOKED" ? (
                    <EntryModal title="Revoke MFA Evidence" triggerLabel="Revoke" triggerClassName="bg-red-600 hover:bg-red-700">
                      <form action={revokeAction} className="ogfi-form-shell mt-4 grid gap-3">
                        <input name="enrollmentId" type="hidden" value={row.enrollmentId} />
                        <label className="grid gap-1 text-sm font-medium text-slate-700">
                          Revocation reason
                          <textarea name="reason" className="min-h-24 rounded-md border border-slate-300 px-3 py-2" required />
                        </label>
                        <button className="min-h-10 rounded-md bg-red-600 px-4 text-sm font-semibold text-white hover:bg-red-700">
                          Revoke Evidence
                        </button>
                      </form>
                    </EntryModal>
                  ) : null}
                </div>
              </div>
            ))
          )}
        </div>
      </Panel>
    </AppShell>
  );
}
