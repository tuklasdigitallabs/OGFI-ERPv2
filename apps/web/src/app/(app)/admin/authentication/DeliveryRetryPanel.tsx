"use client";

import { useActionState } from "react";

export type DeliveryRetryState = {
  message?: string;
  error?: string;
};

export function DeliveryRetryPanel({
  deliveries,
  action,
}: {
  deliveries: Array<{
    id: string;
    target: string;
    deliveryStatus: string;
    deliveryAttemptCount: number;
    expiresAt: string;
  }>;
  action: (
    state: DeliveryRetryState,
    formData: FormData,
  ) => Promise<DeliveryRetryState>;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  if (deliveries.length === 0) {
    return null;
  }
  return (
    <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
      <h2 className="text-lg font-semibold text-amber-950">
        Activation delivery attention
      </h2>
      <p className="mt-1 text-sm text-amber-900">
        These active links have not reached the account email address. Retry before
        expiry; the link itself is never shown to administrators.
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
      <div className="mt-4 grid gap-3">
        {deliveries.map((delivery) => (
          <form
            action={formAction}
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-white p-4"
            key={delivery.id}
          >
            <input
              name="activationTokenId"
              type="hidden"
              value={delivery.id}
            />
            <div>
              <p className="text-sm font-semibold text-slate-950">
                {delivery.target}
              </p>
              <p className="text-xs text-slate-600">
                {delivery.deliveryStatus} / {delivery.deliveryAttemptCount} attempt(s)
                / expires {delivery.expiresAt}
              </p>
            </div>
            <button
              className="min-h-10 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white disabled:bg-slate-300"
              disabled={pending}
            >
              Retry delivery
            </button>
          </form>
        ))}
      </div>
    </section>
  );
}
