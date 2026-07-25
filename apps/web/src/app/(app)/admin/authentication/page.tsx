import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { TaskSheet } from "@/components/TaskSheet";
import { PaginationBar, Panel } from "@ogfi/ui";
import { getDefaultAppRoute, permissions } from "@/server/services/authorization";
import { getSessionContext } from "@/server/services/context";
import {
  approveAuthRecovery, getAuthRecoveryRequest, listAuthRecoveryRequestPage,
  listAuthenticationAccounts, rejectAuthRecovery, requestAuthRecovery,
} from "@/server/services/authenticationAdmin";
import { assertTrustedServerActionOrigin } from "@/server/services/authentication";

export const dynamic = "force-dynamic";
type Props = { searchParams?: Promise<Record<string, string | string[] | undefined>> };
const value = (p: Record<string, string | string[] | undefined>, k: string) => Array.isArray(p[k]) ? p[k]![0] : p[k];

async function manageRecovery(formData: FormData) {
  "use server";
  await assertTrustedServerActionOrigin();
  const session = await getSessionContext();
  if (!session) redirect("/sign-in");
  try {
    const intent = String(formData.get("intent") ?? "");
    if (intent === "request") await requestAuthRecovery(session, formData);
    else if (intent === "approve") await approveAuthRecovery(session, formData);
    else await rejectAuthRecovery(session, formData);
  } catch {
    const params = new URLSearchParams();
    for (const key of ["status", "query", "createdFrom", "createdTo", "page", "pageSize", "requestId"]) {
      const v = formData.get(key); if (typeof v === "string" && v) params.set(key, v);
    }
    params.set("error", "recovery_failed");
    redirect(`/admin/authentication?${params}`);
  }
  revalidatePath("/admin/authentication");
  const params = new URLSearchParams();
  for (const key of ["status", "query", "createdFrom", "createdTo", "page", "pageSize"]) {
    const v = formData.get(key); if (typeof v === "string" && v) params.set(key, v);
  }
  redirect(`/admin/authentication?${params}`);
}

export default async function AuthenticationAdminPage({ searchParams }: Props) {
  const session = await getSessionContext();
  if (!session) redirect("/sign-in");
  if (!session.permissionCodes.includes(permissions.coreAdminister)) redirect(getDefaultAppRoute(session.permissionCodes));
  const params = searchParams ? await searchParams : {};
  const status = ["PENDING", "APPROVED", "REJECTED"].includes(value(params, "status") ?? "") ? value(params, "status") as "PENDING" | "APPROVED" | "REJECTED" : undefined;
  const query = value(params, "query") ?? "";
  const createdFrom = value(params, "createdFrom") ?? "";
  const createdTo = value(params, "createdTo") ?? "";
  const page = Math.max(1, Number.parseInt(value(params, "page") ?? "1", 10) || 1);
  const pageSize = Math.min(100, Math.max(10, Number.parseInt(value(params, "pageSize") ?? "25", 10) || 25));
  const [recovery, accounts] = await Promise.all([
    listAuthRecoveryRequestPage(session, { page, pageSize, query, status, createdFrom: createdFrom || undefined, createdTo: createdTo || undefined }),
    listAuthenticationAccounts(session),
  ]);
  const requestUsers = accounts.filter((a) => a.id !== session.user.id && a.localIdentityActive);
  const selectedId = value(params, "requestId");
  const selected = selectedId ? await getAuthRecoveryRequest(session, selectedId) : null;
  const context = { ...(status ? { status } : {}), ...(query ? { query } : {}), ...(createdFrom ? { createdFrom } : {}), ...(createdTo ? { createdTo } : {}), page: String(recovery.page), pageSize: String(recovery.pageSize) };
  const contextFields = Object.entries(context).map(([k, v]) => <input key={k} name={k} type="hidden" value={v} />);
  const actionError = value(params, "error");
  return <AppShell session={session} title="Authentication" subtitle="Controlled account recovery and audit-safe access restoration" activeNav="admin-authentication">
    <div className="mb-5"><span className="inline-flex min-h-11 items-center rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white">Recovery</span><span className="ml-2 text-sm text-slate-500">Account readiness and activation delivery remain separate follow-up sections.</span></div>
    {actionError ? <Panel className="mb-5 border-red-200 bg-red-50"><p className="text-sm text-red-800">Recovery action could not be completed. Refresh the selected record and verify scope, evidence, and reviewer separation.</p></Panel> : null}
    <Panel className="ogfi-detail-card">
      <h2 className="text-lg font-semibold text-slate-950">Controlled recovery</h2>
      <p className="mt-1 text-sm text-slate-600">Company-scoped recovery requires identity evidence and an independent privileged reviewer. Approved recovery revokes prior sessions and sends a single-use activation link.</p>
      <form action={manageRecovery} className="mt-4 grid gap-3 rounded-xl border border-blue-100 bg-blue-50/40 p-4 md:grid-cols-2"><input name="intent" type="hidden" value="request" />{contextFields}<label className="grid gap-1 text-sm font-medium text-slate-700">Existing account<select name="targetUserId" className="min-h-11 rounded-md border border-slate-300 bg-white px-3" required><option value="">Select an account</option>{requestUsers.map((u) => <option key={u.id} value={u.id}>{u.displayName || u.email} / {u.email}</option>)}</select></label><label className="grid gap-1 text-sm font-medium text-slate-700">Recovery scope<select name="resetMfa" className="min-h-11 rounded-md border border-slate-300 bg-white px-3"><option value="false">Password / credentials only</option><option value="true">Password and lost MFA device</option></select></label><label className="grid gap-1 text-sm font-medium text-slate-700 md:col-span-2">Identity-verification reason<textarea name="reason" className="min-h-20 rounded-md border border-slate-300 p-3" required minLength={10} /></label><label className="grid gap-1 text-sm font-medium text-slate-700 md:col-span-2">Evidence reference<input name="evidenceReference" className="min-h-11 rounded-md border border-slate-300 px-3" required /></label><button className="min-h-11 rounded-md bg-blue-600 px-4 text-sm font-semibold text-white md:col-span-2">Request recovery review</button></form>
      <form method="get" className="mt-5 grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 md:grid-cols-[1fr_11rem_11rem_11rem_auto] md:items-end">
        <label className="grid gap-1 text-sm font-medium text-slate-700">Search account/requester/evidence<input name="query" defaultValue={query} className="min-h-11 rounded-md border border-slate-300 bg-white px-3" /></label>
        <label className="grid gap-1 text-sm font-medium text-slate-700">Status<select name="status" defaultValue={status ?? ""} className="min-h-11 rounded-md border border-slate-300 bg-white px-3"><option value="">All statuses</option><option>PENDING</option><option>APPROVED</option><option>REJECTED</option></select></label>
        <label className="grid gap-1 text-sm font-medium text-slate-700">Created from<input name="createdFrom" type="date" defaultValue={createdFrom} className="min-h-11 rounded-md border border-slate-300 bg-white px-3" /></label>
        <label className="grid gap-1 text-sm font-medium text-slate-700">Created to<input name="createdTo" type="date" defaultValue={createdTo} className="min-h-11 rounded-md border border-slate-300 bg-white px-3" /></label>
        <button className="min-h-11 rounded-md bg-blue-600 px-4 text-sm font-semibold text-white">Apply</button>
      </form>
      <div className="mt-4 divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200">{recovery.items.length ? recovery.items.map((item) => <div key={item.id} className="grid gap-3 p-4 lg:grid-cols-[1fr_auto] lg:items-center"><div><div className="flex flex-wrap items-center gap-2"><p className="font-semibold text-slate-950">{item.targetUser.displayName || item.targetUser.email}</p><span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold">{item.status}</span><span className="text-xs text-slate-500">Company scope</span></div><p className="mt-1 text-sm text-slate-600">Requested by {item.requestedByUser.displayName || item.requestedByUser.email} · {item.resetMfa ? "Password + MFA reset" : "Password reset"}</p><p className="mt-1 text-xs text-slate-500">Created {item.createdAt.toISOString()} · {item.status === "PENDING" ? "Next action: independent review" : "Read-only history"}</p></div><a className="inline-flex min-h-11 items-center justify-center rounded-md border border-blue-200 px-3 text-sm font-semibold text-blue-700" href={`/admin/authentication?${new URLSearchParams({ ...context, requestId: item.id }).toString()}`}>Open details</a></div>) : <p className="p-6 text-sm text-slate-600">No recovery requests match the current filters.</p>}</div>
      <PaginationBar className="border-t border-slate-100 px-1 py-3" page={recovery.page} pageSize={recovery.pageSize} totalItems={recovery.totalItems} itemLabel="recovery requests" getPageHref={(next) => `/admin/authentication?${new URLSearchParams({ ...context, page: String(next) }).toString()}`} />
    </Panel>
    {selected ? <TaskSheet title="Recovery request details" defaultOpen description={`Company scope: ${session.context.companyName}. Approval rechecks target scope; rejection closes only the company-scoped pending request.`}><div className="grid gap-4 text-sm text-slate-700"><div className="rounded-lg border border-slate-200 bg-slate-50 p-3"><p className="font-semibold text-slate-950">{selected.targetUser.displayName || selected.targetUser.email} / {selected.status}</p><p className="mt-1">Requested by {selected.requestedByUser.displayName || selected.requestedByUser.email}</p><p className="mt-1">{selected.reason}</p><p className="mt-1 text-xs">Evidence: {selected.evidenceReference}</p>{selected.reviewReason ? <p className="mt-1 text-xs">Review: {selected.reviewReason}</p> : null}{selected.reviewedByUser ? <p className="mt-1 text-xs">Reviewed by {selected.reviewedByUser.displayName || selected.reviewedByUser.email} {selected.reviewedAt ? `at ${selected.reviewedAt.toISOString()}` : ""}</p> : null}</div>{selected.status === "PENDING" && selected.requestedByUserId !== session.user.id && selected.targetUserId !== session.user.id ? <><form action={manageRecovery} className="grid gap-3"><input name="requestId" type="hidden" value={selected.id} />{contextFields}<input name="intent" type="hidden" value="approve" /><label className="grid gap-1 font-medium">Independent review reason<textarea name="reason" className="min-h-24 rounded-md border border-slate-300 p-3" required minLength={10} /></label><button className="min-h-11 rounded-md bg-emerald-600 px-4 text-sm font-semibold text-white">Approve and send link</button></form><form action={manageRecovery} className="grid gap-3"><input name="requestId" type="hidden" value={selected.id} />{contextFields}<input name="intent" type="hidden" value="reject" /><label className="grid gap-1 font-medium">Rejection reason<textarea name="reason" className="min-h-24 rounded-md border border-slate-300 p-3" required minLength={10} /></label><button className="min-h-11 rounded-md border border-red-200 px-4 py-2 text-sm font-semibold text-red-700">Reject request</button></form></> : <p className="rounded-md border border-slate-200 bg-slate-50 p-3">{selected.status === "PENDING" ? "You requested this recovery or are its target; another administrator must review it." : "This request is read-only because it is already terminal."}</p>}</div></TaskSheet> : selectedId ? <Panel className="mt-5 border-amber-200 bg-amber-50"><p className="text-sm text-amber-950">The selected recovery request is unavailable in the current company scope.</p></Panel> : null}
  </AppShell>;
}
