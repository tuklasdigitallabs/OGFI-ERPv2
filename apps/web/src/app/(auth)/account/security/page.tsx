import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { ShieldCheck } from "lucide-react";
import { Panel } from "@ogfi/ui";
import {
  assertTrustedServerActionOrigin,
  beginMfaStepUp,
  completeMfaEnrollment,
  getValidatedSessionPrincipal,
  listUserSessions,
  revokeOwnSession,
  startMfaEnrollment
} from "@/server/services/authentication";
import {
  MfaEnrollmentPanel,
  type MfaEnrollmentState
} from "./MfaEnrollmentPanel";

export const dynamic = "force-dynamic";

async function manageEnrollment(
  state: MfaEnrollmentState,
  formData: FormData
): Promise<MfaEnrollmentState> {
  "use server";
  await assertTrustedServerActionOrigin();
  try {
    if (String(formData.get("intent")) === "start") {
      return { setup: await startMfaEnrollment() };
    }
    const recoveryCodes = await completeMfaEnrollment({
      authenticatorId: String(formData.get("authenticatorId") ?? ""),
      code: String(formData.get("code") ?? "")
    });
    return { recoveryCodes };
  } catch (error) {
    return {
      ...state,
      error:
        error instanceof Error && error.message === "MFA_CODE_INVALID"
          ? "That code is invalid or expired. Wait for a new code and try again."
          : "Authenticator setup could not be completed. Start again or contact an administrator."
    };
  }
}

async function stepUp() {
  "use server";
  await assertTrustedServerActionOrigin();
  await beginMfaStepUp();
  redirect("/mfa-challenge");
}

async function revokeSession(formData: FormData) {
  "use server";
  await assertTrustedServerActionOrigin();
  const revokedCurrent = await revokeOwnSession(
    String(formData.get("sessionId") ?? "")
  );
  if (revokedCurrent) {
    redirect("/sign-in");
  }
  revalidatePath("/account/security");
}

export default async function AccountSecurityPage() {
  const principal = await getValidatedSessionPrincipal();
  const sessions = principal ? await listUserSessions(principal.userId) : [];
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <Panel className="w-full max-w-lg rounded-[1.35rem] p-7">
        <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
          <ShieldCheck aria-hidden="true" className="h-5 w-5" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-950">
          Account security
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          Configure runtime multifactor authentication and refresh assurance before
          sensitive actions.
        </p>
        <div className="mt-6">
          {principal ? (
            <div className="grid gap-6">
            <form action={stepUp} className="grid gap-3">
              <p className="text-sm text-slate-600">
                Your account is active. Refresh MFA before a sensitive action when
                the application reports that step-up is required.
              </p>
              <button className="min-h-11 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white">
                Refresh MFA assurance
              </button>
              <a className="text-center text-sm font-semibold text-slate-700" href="/">
                Back to OGFI ERP
              </a>
            </form>
            <section>
              <h2 className="font-semibold text-slate-950">Active sessions</h2>
              <div className="mt-3 grid gap-2">
                {sessions.map((session) => (
                  <div
                    className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 p-3 text-sm"
                    key={session.id}
                  >
                    <div>
                      <p className="font-semibold text-slate-900">
                        {session.id === principal.sessionId ? "Current session" : "Signed-in session"}
                      </p>
                      <p className="text-slate-500">
                        {session.assuranceLevel} / last used {session.lastSeenAt.toISOString()}
                      </p>
                    </div>
                    <form action={revokeSession}>
                      <input name="sessionId" type="hidden" value={session.id} />
                      <button className="min-h-10 rounded-lg border border-red-200 px-3 text-xs font-semibold text-red-700">
                        Revoke
                      </button>
                    </form>
                  </div>
                ))}
              </div>
            </section>
            </div>
          ) : (
            <MfaEnrollmentPanel action={manageEnrollment} />
          )}
        </div>
      </Panel>
    </main>
  );
}
