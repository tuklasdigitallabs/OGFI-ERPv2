import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { KeyRound } from "lucide-react";
import { Panel } from "@ogfi/ui";
import { ActionFeedbackBanner } from "@/components/ActionFeedbackBanner";
import {
  actionErrorRedirectPath,
  getActionFeedback
} from "@/server/services/actionFeedback";
import {
  assertTrustedServerActionOrigin,
  completeMfaChallenge,
  getTrustedRequestFingerprint,
} from "@/server/services/authentication";

export const dynamic = "force-dynamic";

async function verifyMfa(formData: FormData) {
  "use server";
  await assertTrustedServerActionOrigin();
  let nextPath: string;
  try {
    const requestHeaders = await headers();
    nextPath = await completeMfaChallenge(
      String(formData.get("code") ?? ""),
      getTrustedRequestFingerprint(requestHeaders),
    );
  } catch (error) {
    const code =
      error instanceof Error &&
      [
        "MFA_CODE_INVALID",
        "MFA_CODE_REPLAYED",
        "MFA_CHALLENGE_NOT_FOUND",
        "MFA_CHALLENGE_TEMPORARILY_THROTTLED"
      ].includes(
        error.message
      )
        ? error.message
        : "MFA_CODE_INVALID";
    redirect(actionErrorRedirectPath("/mfa-challenge", code));
  }
  redirect(nextPath);
}

export default async function MfaChallengePage({
  searchParams
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const feedback = getActionFeedback(searchParams ? await searchParams : {});
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <Panel className="w-full max-w-md rounded-[1.35rem] p-7">
        <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
          <KeyRound aria-hidden="true" className="h-5 w-5" />
        </div>
        <ActionFeedbackBanner feedback={feedback} />
        <h1 className="text-2xl font-bold tracking-tight text-slate-950">
          Verify authenticator
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          Enter the current six-digit code from your authenticator. You may also
          use one unused recovery code.
        </p>
        <form action={verifyMfa} className="mt-6 grid gap-3">
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Authenticator or recovery code
            <input
              className="min-h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm"
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              required
              autoFocus
            />
          </label>
          <button
            className="min-h-11 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700"
            type="submit"
          >
            Verify and continue
          </button>
        </form>
      </Panel>
    </main>
  );
}
