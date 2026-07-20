import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { KeyRound, LogIn, UserRound } from "lucide-react";
import { ButtonLink, Panel } from "@ogfi/ui";
import { ActionFeedbackBanner } from "@/components/ActionFeedbackBanner";
import {
  actionErrorRedirectPath,
  getActionFeedback,
} from "@/server/services/actionFeedback";
import { getDefaultAppRoute } from "@/server/services/authorization";
import { getConfiguredContext } from "@/server/services/context";

export const dynamic = "force-dynamic";

async function signIn(formData: FormData) {
  "use server";

  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  if (!email) {
    redirect(actionErrorRedirectPath("/sign-in", "AUTH_REQUIRED"));
  }

  let session: Awaited<ReturnType<typeof getConfiguredContext>>;
  try {
    session = await getConfiguredContext(email);
  } catch {
    redirect(actionErrorRedirectPath("/sign-in", "LOGIN_ACCOUNT_NOT_FOUND"));
  }

  const cookieStore = await cookies();
  cookieStore.set("ogfi_demo_session", email, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
  });
  cookieStore.set("ogfi_demo_session_issued_at", new Date().toISOString(), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
  });
  redirect(getDefaultAppRoute(session.permissionCodes));
}

export default async function SignInPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const requesterEmail =
    process.env.DEMO_USER_EMAIL ?? "storekeeper.bgc@ogfi.example";
  const approverEmail =
    process.env.DEMO_APPROVER_EMAIL ?? "ops.approver@ogfi.example";
  const adminEmail = process.env.DEMO_ADMIN_EMAIL ?? "erp.admin@ogfi.example";
  const superUserEmail =
    process.env.DEMO_SUPER_USER_EMAIL ?? "super.admin@ogfi.example";
  const configured = await getConfiguredContext(requesterEmail);
  const params = searchParams ? await searchParams : {};
  const actionFeedback = getActionFeedback(params);
  const sampleAccounts = [
    {
      label: "Branch Storekeeper",
      email: requesterEmail,
    },
    {
      label: "Operations Approver",
      email: approverEmail,
    },
    {
      label: "ERP Administrator",
      email: adminEmail,
    },
    {
      label: "System Super User",
      email: superUserEmail,
    },
  ];

  return (
    <main className="ogfi-auth-page flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-md">
        <div className="mb-5 flex items-center justify-center gap-3 text-slate-950">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-white shadow-sm">
            <KeyRound aria-hidden="true" className="h-5 w-5" />
          </div>
          <p className="text-xl font-bold tracking-tight">OGFI ERP</p>
        </div>
      <Panel className="ogfi-auth-card w-full rounded-[1.35rem] p-7">
        <ActionFeedbackBanner feedback={actionFeedback} />
        <div className="space-y-2">
          <h1 className="text-2xl font-bold tracking-tight text-slate-950">Sign in</h1>
          <p className="text-sm text-slate-600">
            Enter the account email. Role access is loaded from the user
            account.
          </p>
        </div>
        <form action={signIn} className="mt-6 grid gap-3">
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Email
            <span className="relative">
              <UserRound aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                className="min-h-11 w-full rounded-xl border border-slate-300 bg-white px-10 py-2 text-sm"
                defaultValue={configured.user.email}
                name="email"
                type="email"
                required
              />
            </span>
          </label>
          <button
            className="mt-2 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
            type="submit"
          >
            <LogIn aria-hidden="true" className="h-4 w-4" />
            Sign in
          </button>
        </form>
        <div className="my-6 flex items-center gap-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
          <span className="h-px flex-1 bg-slate-200" />
          Demo access
          <span className="h-px flex-1 bg-slate-200" />
        </div>
        <dl className="grid gap-3 text-sm">
          <div>
            <dt className="font-medium text-slate-700">Sample accounts</dt>
            <dd className="mt-2 grid gap-2 text-slate-600">
              {sampleAccounts.map((account) => (
                <span key={account.email}>
                  <span className="font-medium text-slate-800">
                    {account.label}
                  </span>{" "}
                  / {account.email}
                </span>
              ))}
            </dd>
          </div>
          <div>
            <dt className="font-medium text-slate-700">Authorized context</dt>
            <dd className="text-slate-600">
              {configured.context.companyName} / {configured.context.brandName}{" "}
              / {configured.context.locationName}
            </dd>
          </div>
        </dl>
        <ButtonLink
          href="/"
          className="mt-3 w-full rounded-xl bg-slate-700 hover:bg-slate-800"
        >
          Back
        </ButtonLink>
      </Panel>
      </div>
    </main>
  );
}
