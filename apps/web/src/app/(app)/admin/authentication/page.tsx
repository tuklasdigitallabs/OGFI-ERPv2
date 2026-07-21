import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { AppShell } from "@/components/AppShell";
import { getDefaultAppRoute, permissions } from "@/server/services/authorization";
import { getSessionContext } from "@/server/services/context";
import {
  issueAuthenticationActivation,
  approveAuthRecovery,
  listAuthenticationActivationDeliveries,
  listAuthenticationAccounts,
  listAuthRecoveryRequests,
  rejectAuthRecovery,
  requestAuthRecovery,
  retryAuthenticationActivationDelivery,
  revokeAuthenticationSessions
} from "@/server/services/authenticationAdmin";
import { ActivationPanel, type ActivationState } from "./ActivationPanel";
import { assertTrustedServerActionOrigin } from "@/server/services/authentication";
import { RecoveryPanel, type RecoveryState } from "./RecoveryPanel";
import {
  DeliveryRetryPanel,
  type DeliveryRetryState,
} from "./DeliveryRetryPanel";

export const dynamic = "force-dynamic";

async function issueActivation(
  _state: ActivationState,
  formData: FormData
): Promise<ActivationState> {
  "use server";
  await assertTrustedServerActionOrigin();
  const session = await getSessionContext();
  if (!session) {
    return { error: "Sign in again before issuing an activation link." };
  }
  try {
    return await issueAuthenticationActivation(session, formData);
  } catch (error) {
    return {
      error:
        error instanceof Error && error.message === "PRIVILEGED_MFA_STEP_UP_REQUIRED"
          ? "Refresh MFA assurance under Account security, then try again."
          : "The activation link could not be issued. Check scope and separation controls."
    };
  }
}

async function revokeSessions(formData: FormData) {
  "use server";
  await assertTrustedServerActionOrigin();
  const session = await getSessionContext();
  if (!session) {
    redirect("/sign-in");
  }
  await revokeAuthenticationSessions(session, formData);
  redirect("/admin/authentication");
}

async function retryDelivery(
  _state: DeliveryRetryState,
  formData: FormData
): Promise<DeliveryRetryState> {
  "use server";
  await assertTrustedServerActionOrigin();
  const session = await getSessionContext();
  if (!session) {
    return { error: "Sign in again before retrying delivery." };
  }
  try {
    await retryAuthenticationActivationDelivery(session, formData);
    revalidatePath("/admin/authentication");
    return { message: "Activation link delivered to the account email address." };
  } catch (error) {
    return {
      error:
        error instanceof Error && error.message === "PRIVILEGED_MFA_STEP_UP_REQUIRED"
          ? "Refresh MFA assurance under Account security, then try again."
          : "Delivery failed. Verify the email transport configuration and retry."
    };
  }
}

async function manageRecovery(
  _state: RecoveryState,
  formData: FormData
): Promise<RecoveryState> {
  "use server";
  await assertTrustedServerActionOrigin();
  const session = await getSessionContext();
  if (!session) {
    return { error: "Sign in again before managing recovery." };
  }
  try {
    const intent = String(formData.get("intent") ?? "");
    if (intent === "request") {
      await requestAuthRecovery(session, formData);
      revalidatePath("/admin/authentication");
      return { message: "Recovery request recorded for independent review." };
    }
    if (intent === "approve") {
      const result = await approveAuthRecovery(session, formData);
      revalidatePath("/admin/authentication");
      return result;
    }
    await rejectAuthRecovery(session, formData);
    revalidatePath("/admin/authentication");
    return { message: "Recovery request rejected." };
  } catch (error) {
    return {
      error:
        error instanceof Error && error.message === "PRIVILEGED_MFA_STEP_UP_REQUIRED"
          ? "Refresh MFA assurance under Account security, then try again."
          : "Recovery could not be processed. Check scope, evidence, and reviewer separation."
    };
  }
}

export default async function AuthenticationAdminPage() {
  const session = await getSessionContext();
  if (!session) {
    redirect("/sign-in");
  }
  if (!session.permissionCodes.includes(permissions.coreAdminister)) {
    redirect(getDefaultAppRoute(session.permissionCodes));
  }
  const [accounts, recoveryRequests, activationDeliveries] = await Promise.all([
    listAuthenticationAccounts(session),
    listAuthRecoveryRequests(session),
    listAuthenticationActivationDeliveries(session)
  ]);
  const accountOptions = accounts
    .filter((account) => account.id !== session.user.id)
    .map((account) => ({
      id: account.id,
      label: `${account.displayName} / ${account.email}`
    }));
  return (
    <AppShell
      session={session}
      title="Authentication"
      subtitle="Account activation, runtime MFA status, and revocable sessions"
      activeNav="admin-authentication"
    >
      <div className="grid gap-5">
        <ActivationPanel
          action={issueActivation}
          users={accountOptions.filter((option) =>
            accounts.some(
              (account) => account.id === option.id && !account.localIdentityActive
            )
          )}
        />
        <RecoveryPanel
          action={manageRecovery}
          users={accountOptions.filter((option) =>
            accounts.some(
              (account) => account.id === option.id && account.localIdentityActive
            )
          )}
          requests={recoveryRequests
            .filter((request) => request.status === "PENDING")
            .map((request) => ({
              id: request.id,
              target: request.targetUser.displayName || request.targetUser.email,
              requester:
                request.requestedByUser.displayName || request.requestedByUser.email,
              resetMfa: request.resetMfa,
              reason: request.reason,
              evidenceReference: request.evidenceReference
            }))}
        />
        <DeliveryRetryPanel
          action={retryDelivery}
          deliveries={activationDeliveries.map((delivery) => ({
            id: delivery.id,
            target:
              delivery.targetUser.displayName || delivery.targetUser.email,
            deliveryStatus: delivery.deliveryStatus,
            deliveryAttemptCount: delivery.deliveryAttemptCount,
            expiresAt: delivery.expiresAt.toISOString()
          }))}
        />
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 p-5">
            <h2 className="text-lg font-semibold text-slate-950">Account readiness</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-3">User</th>
                  <th className="px-5 py-3">Credentials</th>
                  <th className="px-5 py-3">Runtime MFA</th>
                  <th className="px-5 py-3">Active sessions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {accounts.map((account) => (
                  <tr key={account.id}>
                    <td className="px-5 py-3">
                      <p className="font-semibold text-slate-900">{account.displayName}</p>
                      <p className="text-slate-500">{account.email}</p>
                    </td>
                    <td className="px-5 py-3">{account.localIdentityActive ? "Active" : "Not activated"}</td>
                    <td className="px-5 py-3">{account.mfaActive ? "Active" : "Not enrolled"}</td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <span>{account.activeSessionCount}</span>
                        {account.id !== session.user.id && account.activeSessionCount > 0 ? (
                          <form action={revokeSessions}>
                            <input name="targetUserId" type="hidden" value={account.id} />
                            <button className="min-h-9 rounded-lg border border-red-200 px-3 text-xs font-semibold text-red-700">
                              Revoke all
                            </button>
                          </form>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
