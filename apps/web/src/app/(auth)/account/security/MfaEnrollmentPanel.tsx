"use client";

import { useActionState } from "react";
import Image from "next/image";

export type MfaEnrollmentState = {
  setup?: {
    authenticatorId: string;
    manualKey: string;
    qrDataUrl: string;
  };
  recoveryCodes?: string[];
  error?: string;
};

export function MfaEnrollmentPanel({
  action
}: {
  action: (
    state: MfaEnrollmentState,
    formData: FormData
  ) => Promise<MfaEnrollmentState>;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  if (state.recoveryCodes) {
    return (
      <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
        <h2 className="font-semibold text-emerald-950">MFA is active</h2>
        <p className="mt-1 text-sm text-emerald-900">
          Save these one-time recovery codes now. They will not be shown again.
        </p>
        <ul className="mt-3 grid grid-cols-2 gap-2 font-mono text-sm text-emerald-950">
          {state.recoveryCodes.map((code) => (
            <li key={code}>{code}</li>
          ))}
        </ul>
        <a className="mt-4 inline-flex text-sm font-semibold text-blue-700" href="/">
          Continue to OGFI ERP
        </a>
      </section>
    );
  }
  return (
    <form action={formAction} className="grid gap-4">
      {state.error ? (
        <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {state.error}
        </p>
      ) : null}
      {!state.setup ? (
        <>
          <p className="text-sm text-slate-600">
            Privileged access requires a live authenticator challenge. Start setup,
            then scan the QR code with a compatible authenticator app.
          </p>
          <button
            className="min-h-11 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white disabled:bg-slate-300"
            name="intent"
            value="start"
            disabled={pending}
          >
            Start authenticator setup
          </button>
        </>
      ) : (
        <>
          <Image
            alt="Authenticator setup QR code"
            className="mx-auto h-60 w-60 rounded-xl border border-slate-200"
            src={state.setup.qrDataUrl}
            width={240}
            height={240}
            unoptimized
          />
          <p className="break-all rounded-lg bg-slate-100 p-3 font-mono text-xs text-slate-700">
            Manual key: {state.setup.manualKey}
          </p>
          <input
            name="authenticatorId"
            type="hidden"
            value={state.setup.authenticatorId}
          />
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Six-digit code
            <input
              className="min-h-11 rounded-xl border border-slate-300 px-3"
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              required
            />
          </label>
          <button
            className="min-h-11 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white disabled:bg-slate-300"
            name="intent"
            value="verify"
            disabled={pending}
          >
            Verify and activate MFA
          </button>
        </>
      )}
    </form>
  );
}
