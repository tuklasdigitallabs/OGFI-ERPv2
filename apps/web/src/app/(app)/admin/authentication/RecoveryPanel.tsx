"use client";

import { useActionState } from "react";

export type RecoveryState = {
  deliveryStatus?: string;
  expiresAt?: string;
  message?: string;
  error?: string;
};

export function RecoveryPanel({
  users,
  requests,
  action
}: {
  users: Array<{ id: string; label: string }>;
  requests: Array<{
    id: string;
    target: string;
    requester: string;
    resetMfa: boolean;
    reason: string;
    evidenceReference: string;
  }>;
  action: (state: RecoveryState, formData: FormData) => Promise<RecoveryState>;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-950">Controlled recovery</h2>
      <p className="mt-1 text-sm text-slate-600">
        Existing accounts require one administrator to request recovery and a
        different administrator to approve or reject it. Approved recovery revokes
        all prior sessions; lost-device recovery also revokes the old authenticator.
      </p>
      {state.error ? (
        <p className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {state.error}
        </p>
      ) : null}
      {state.message ? (
        <p className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
          {state.message}
        </p>
      ) : null}
      <form action={formAction} className="mt-5 grid gap-3 md:grid-cols-2">
        <input name="intent" type="hidden" value="request" />
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Account
          <select className="min-h-11 rounded-xl border border-slate-300 px-3" name="targetUserId" required>
            <option value="">Select an account</option>
            {users.map((user) => (
              <option key={user.id} value={user.id}>{user.label}</option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Recovery scope
          <select className="min-h-11 rounded-xl border border-slate-300 px-3" name="resetMfa" required>
            <option value="false">Password / credentials only</option>
            <option value="true">Password and lost MFA device</option>
          </select>
        </label>
        <label className="grid gap-1 text-sm font-medium text-slate-700 md:col-span-2">
          Identity-verification reason
          <textarea className="min-h-24 rounded-xl border border-slate-300 p-3" name="reason" required minLength={10} />
        </label>
        <label className="grid gap-1 text-sm font-medium text-slate-700 md:col-span-2">
          Evidence reference
          <input className="min-h-11 rounded-xl border border-slate-300 px-3" name="evidenceReference" required />
        </label>
        <button className="min-h-11 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white disabled:bg-slate-300 md:col-span-2" disabled={pending}>
          Request recovery review
        </button>
      </form>
      <div className="mt-6 grid gap-3">
        <h3 className="font-semibold text-slate-950">Pending independent review</h3>
        {requests.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-500">No pending recovery requests.</p>
        ) : requests.map((request) => (
          <form action={formAction} className="grid gap-3 rounded-xl border border-slate-200 p-4" key={request.id}>
            <input name="requestId" type="hidden" value={request.id} />
            <p className="text-sm font-semibold text-slate-900">
              {request.target} / requested by {request.requester}
            </p>
            <p className="text-sm text-slate-600">
              {request.resetMfa ? "Password and MFA reset" : "Password reset"} / {request.reason} / evidence {request.evidenceReference}
            </p>
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              Independent review reason
              <textarea className="min-h-20 rounded-xl border border-slate-300 p-3" name="reason" required minLength={10} />
            </label>
            <div className="flex gap-2">
              <button className="min-h-10 rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white" name="intent" value="approve" disabled={pending}>Approve and send link</button>
              <button className="min-h-10 rounded-lg border border-red-200 px-4 text-sm font-semibold text-red-700" name="intent" value="reject" disabled={pending}>Reject</button>
            </div>
          </form>
        ))}
      </div>
    </section>
  );
}
