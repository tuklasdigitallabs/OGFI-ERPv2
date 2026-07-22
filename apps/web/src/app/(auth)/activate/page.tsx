import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { Panel } from "@ogfi/ui";
import { ActionFeedbackBanner } from "@/components/ActionFeedbackBanner";
import {
  actionErrorRedirectPath,
  getActionFeedback
} from "@/server/services/actionFeedback";
import {
  activateAccount,
  assertTrustedServerActionOrigin,
  getTrustedRequestFingerprint,
} from "@/server/services/authentication";

export const dynamic = "force-dynamic";

async function activate(formData: FormData) {
  "use server";
  await assertTrustedServerActionOrigin();
  const token = String(formData.get("token") ?? "");
  const requestHeaders = await headers();
  let nextPath: string;
  try {
    nextPath = await activateAccount({
      token,
      password: String(formData.get("password") ?? ""),
      passwordConfirmation: String(formData.get("passwordConfirmation") ?? ""),
      fingerprint: getTrustedRequestFingerprint(requestHeaders)
    });
  } catch (error) {
    const code =
      error instanceof Error &&
      [
        "AUTHENTICATION_CAPACITY_TEMPORARILY_UNAVAILABLE",
        "PASSWORD_POLICY_NOT_MET",
        "PASSWORD_CONFIRMATION_MISMATCH",
        "AUTH_ACTIVATION_INVALID"
      ].includes(error.message)
        ? error.message
        : "AUTH_ACTIVATION_INVALID";
    redirect(actionErrorRedirectPath(`/activate?token=${encodeURIComponent(token)}`, code));
  }
  redirect(nextPath);
}

export default async function ActivatePage({
  searchParams
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = searchParams ? await searchParams : {};
  const token = typeof params.token === "string" ? params.token : "";
  const feedback = getActionFeedback(params);
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <Panel className="w-full max-w-md rounded-[1.35rem] p-7">
        <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
          <ShieldCheck aria-hidden="true" className="h-5 w-5" />
        </div>
        <ActionFeedbackBanner feedback={feedback} />
        <h1 className="text-2xl font-bold tracking-tight text-slate-950">
          Activate your account
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          Create a password with at least 12 characters, including uppercase,
          lowercase, and a number. Activation links expire after 30 minutes.
        </p>
        <form action={activate} className="mt-6 grid gap-3">
          <input name="token" type="hidden" value={token} />
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            New password
            <input
              className="min-h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm"
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={12}
              required
            />
          </label>
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Confirm new password
            <input
              className="min-h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm"
              name="passwordConfirmation"
              type="password"
              autoComplete="new-password"
              minLength={12}
              required
            />
          </label>
          <button
            className="min-h-11 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 disabled:bg-slate-300"
            type="submit"
            disabled={!token}
          >
            Activate account
          </button>
        </form>
      </Panel>
    </main>
  );
}
