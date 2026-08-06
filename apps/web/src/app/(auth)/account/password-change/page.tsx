import { redirect } from "next/navigation";
import { Panel } from "@ogfi/ui";
import { assertTrustedServerActionOrigin, changeRequiredPassword } from "@/server/services/authentication";

export const dynamic = "force-dynamic";

async function changePassword(formData: FormData) {
  "use server";
  await assertTrustedServerActionOrigin();
  try {
    const destination = await changeRequiredPassword({ password: String(formData.get("password") ?? ""), passwordConfirmation: String(formData.get("passwordConfirmation") ?? "") });
    redirect(destination);
  } catch (error) {
    redirect(`/account/password-change?error=${encodeURIComponent(error instanceof Error ? error.message : "PASSWORD_CHANGE_FAILED")}`);
  }
}

export default async function PasswordChangePage({ searchParams }: { searchParams?: Promise<{ error?: string }> }) {
  const error = (await searchParams)?.error;
  return <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4"><Panel className="w-full max-w-lg rounded-[1.35rem] p-7"><h1 className="text-2xl font-bold text-slate-950">Set your password</h1><p className="mt-2 text-sm text-slate-600">Your temporary password can only be used to set a new password. You cannot open ERP workspaces until this is complete.</p>{error ? <p className="mt-4 text-sm text-red-700">Use a matching password with at least 12 characters, upper and lower case letters, and a number.</p> : null}<form action={changePassword} className="mt-6 grid gap-4"><label className="grid gap-1 text-sm font-medium">New password<input className="min-h-11 rounded-md border border-slate-300 px-3" name="password" type="password" autoComplete="new-password" required /></label><label className="grid gap-1 text-sm font-medium">Confirm password<input className="min-h-11 rounded-md border border-slate-300 px-3" name="passwordConfirmation" type="password" autoComplete="new-password" required /></label><button className="min-h-11 rounded-md bg-blue-600 px-4 text-sm font-semibold text-white">Set password and continue</button></form></Panel></main>;
}
