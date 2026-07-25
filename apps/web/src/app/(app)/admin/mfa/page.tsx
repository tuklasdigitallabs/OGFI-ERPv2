import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ShieldCheck, ShieldAlert } from "lucide-react";
import { Badge, PaginationBar, Panel } from "@ogfi/ui";
import { ActionFeedbackBanner } from "@/components/ActionFeedbackBanner";
import { AppShell } from "@/components/AppShell";
import { EntryModal } from "@/components/EntryModal";
import { TaskSheet } from "@/components/TaskSheet";
import {
  actionErrorRedirectPath,
  getActionFeedback
} from "@/server/services/actionFeedback";
import { getDefaultAppRoute, permissions } from "@/server/services/authorization";
import { getSessionContext } from "@/server/services/context";
import {
  listPrivilegedMfaEnrollments,
  getPrivilegedMfaEnrollment,
  privilegedMfaRowStatuses,
  recordPrivilegedMfaEnrollment,
  revokePrivilegedMfaEnrollment,
  verifyPrivilegedMfaEnrollment
} from "@/server/services/privilegedMfa";

export const dynamic = "force-dynamic";

type AdminMfaPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type MfaRow = Awaited<ReturnType<typeof listPrivilegedMfaEnrollments>>["rows"][number];

function param(params: Record<string, string | string[] | undefined>, key: string) { const value = params[key]; return Array.isArray(value) ? value[0] : value; }
function contextPath(formData: FormData) { const context = new URLSearchParams(); for (const key of ["query", "status", "page", "pageSize", "enrollmentId", "selectedUserId"]) { const value = formData.get(key); if (typeof value === "string" && value.length > 0 && value.length <= 160) context.set(key, value); } const query = context.toString(); return `/admin/mfa${query ? `?${query}` : ""}`; }

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
    redirect(actionErrorRedirectPath(contextPath(formData), error));
  }
  revalidatePath("/admin/mfa");
  redirect(contextPath(formData));
}

async function verifyAction(formData: FormData) {
  "use server";
  try {
    await verifyPrivilegedMfaEnrollment(formData);
  } catch (error) {
    redirect(actionErrorRedirectPath(contextPath(formData), error));
  }
  revalidatePath("/admin/mfa");
  redirect(contextPath(formData));
}

async function revokeAction(formData: FormData) {
  "use server";
  try {
    await revokePrivilegedMfaEnrollment(formData);
  } catch (error) {
    redirect(actionErrorRedirectPath(contextPath(formData), error));
  }
  revalidatePath("/admin/mfa");
  redirect(contextPath(formData));
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
  const query = (param(params, "query") ?? "").slice(0, 120);
  const statusValue = param(params, "status");
  const status = privilegedMfaRowStatuses.includes(statusValue as (typeof privilegedMfaRowStatuses)[number]) ? statusValue as (typeof privilegedMfaRowStatuses)[number] : undefined;
  const requestedPage = Number.parseInt(param(params, "page") ?? "1", 10);
  const requestedPageSize = Number.parseInt(param(params, "pageSize") ?? "25", 10);
  const { rows, options, optionsHasMore, page: currentPage, pageSize, totalItems, summary } = await listPrivilegedMfaEnrollments(session, { query, status, page: Number.isFinite(requestedPage) ? requestedPage : 1, pageSize: Number.isFinite(requestedPageSize) ? Math.min(Math.max(requestedPageSize, 10), 100) : 25, selectedUserId: param(params, "selectedUserId") });
  const verifiedCount = summary.verified;
  const pendingCount = summary.pending;
  const missingCount = summary.missing;
  const revokedCount = summary.revoked;
  const readyForStrictEnforcement =
    summary.total > 0 && missingCount === 0 && pendingCount === 0 && revokedCount === 0;
  const selectedId = param(params, "enrollmentId");
  const selected = selectedId ? await getPrivilegedMfaEnrollment(session, selectedId) : null;
  const contextFields = <><input name="query" type="hidden" value={query} /><input name="status" type="hidden" value={status ?? ""} /><input name="page" type="hidden" value={String(currentPage)} /><input name="pageSize" type="hidden" value={String(pageSize)} /></>;

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
          <p className="mt-2 text-3xl font-bold text-slate-950">{summary.total}</p>
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
          {optionsHasMore ? <span className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-950">Record Evidence unavailable until the privileged-user catalog is refined.</span> : <EntryModal title="Record MFA Evidence" triggerLabel="Record Evidence">
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
          </EntryModal>}
        </div>

        <form method="get" className="mb-4 grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 md:grid-cols-[1fr_14rem_auto] md:items-end">
          <label className="grid gap-1 text-sm font-medium text-slate-700">Search privileged user<input name="query" defaultValue={query} className="min-h-11 rounded-md border border-slate-300 bg-white px-3" /></label>
          <label className="grid gap-1 text-sm font-medium text-slate-700">Evidence status<select name="status" defaultValue={status ?? ""} className="min-h-11 rounded-md border border-slate-300 bg-white px-3"><option value="">All statuses</option>{privilegedMfaRowStatuses.map((value) => <option key={value} value={value}>{value.replaceAll("_", " ")}</option>)}</select></label>
          <button className="min-h-11 rounded-md bg-blue-600 px-4 text-sm font-semibold text-white">Apply</button>
        </form>

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
                <a className="inline-flex min-h-10 items-center justify-center rounded-md border border-blue-200 bg-white px-3 text-sm font-semibold text-blue-700 hover:bg-blue-50" href={`/admin/mfa?${new URLSearchParams({ query, ...(status ? { status } : {}), page: String(currentPage), pageSize: String(pageSize), ...(row.enrollmentId ? { enrollmentId: row.enrollmentId } : { selectedUserId: row.userId }) }).toString()}`}>Open details</a>
              </div>
            ))
          )}
        </div>
        <PaginationBar className="border-t border-slate-100 px-1 py-3" page={currentPage} pageSize={pageSize} totalItems={totalItems} itemLabel="privileged users" getPageHref={(nextPage) => `/admin/mfa?${new URLSearchParams({ query, ...(status ? { status } : {}), page: String(nextPage), pageSize: String(pageSize) }).toString()}`} />
      </Panel>
      {selected ? <TaskSheet title="MFA evidence actions" defaultOpen description={`Review ${selected.targetUserName}. ERP stores evidence only; the external provider remains authoritative.`}><div className="grid gap-4 text-sm text-slate-700"><div className="rounded-lg border border-slate-200 bg-slate-50 p-3"><p className="font-semibold text-slate-950">{selected.targetUserName} / {label(selected.status)}</p><p className="mt-1">{selected.evidenceReference ?? "No evidence recorded"}</p></div>{selected.status === "PENDING_VERIFICATION" ? <details className="rounded-lg border border-slate-200 p-3"><summary className="cursor-pointer font-semibold">Verify MFA evidence</summary><form action={verifyAction} className="mt-3 grid gap-3"><input name="enrollmentId" type="hidden" value={selected.id} />{contextFields}<textarea name="reason" className="min-h-24 rounded-md border border-slate-300 px-3 py-2" placeholder="Verification note" required /><button className="min-h-11 rounded-md bg-blue-600 px-4 text-sm font-semibold text-white">Verify Evidence</button></form></details> : null}{selected.status !== "REVOKED" ? <details className="rounded-lg border border-slate-200 p-3"><summary className="cursor-pointer font-semibold text-red-700">Revoke MFA evidence</summary><form action={revokeAction} className="mt-3 grid gap-3"><input name="enrollmentId" type="hidden" value={selected.id} />{contextFields}<textarea name="reason" className="min-h-24 rounded-md border border-slate-300 px-3 py-2" placeholder="Revocation reason" required /><button className="min-h-11 rounded-md bg-red-600 px-4 text-sm font-semibold text-white">Revoke Evidence</button></form></details> : null}</div></TaskSheet> : selectedId ? <Panel className="mt-5 border-amber-200 bg-amber-50"><p className="text-sm text-amber-950">The selected MFA evidence is unavailable in the current company scope.</p></Panel> : null}
    </AppShell>
  );
}
