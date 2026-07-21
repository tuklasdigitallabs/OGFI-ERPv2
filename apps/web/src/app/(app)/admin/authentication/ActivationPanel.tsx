"use client";

import { useActionState } from "react";

export type ActivationState = {
  message?: string;
  deliveryStatus?: string;
  expiresAt?: string;
  error?: string;
};

export function ActivationPanel({
  users,
  action
}: {
  users: Array<{ id: string; label: string }>;
  action: (state: ActivationState, formData: FormData) => Promise<ActivationState>;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-950">Send activation link</h2>
      <p className="mt-1 text-sm text-slate-600">
        Links are single-use, expire after 30 minutes, replace prior active links,
        and are sent directly to the account email address.
      </p>
      <form action={formAction} className="mt-4 grid gap-3 md:grid-cols-[1fr_auto]">
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Account
          <select
            className="min-h-11 rounded-xl border border-slate-300 bg-white px-3"
            name="targetUserId"
            required
          >
            <option value="">Select an account</option>
            {users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.label}
              </option>
            ))}
          </select>
        </label>
        <button
          className="min-h-11 self-end rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white disabled:bg-slate-300"
          disabled={pending}
        >
          Send link
        </button>
      </form>
      {state.error ? (
        <p className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {state.error}
        </p>
      ) : null}
      {state.message ? (
        <p className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
          {state.message} It expires at {state.expiresAt}.
        </p>
      ) : null}
    </section>
  );
}
