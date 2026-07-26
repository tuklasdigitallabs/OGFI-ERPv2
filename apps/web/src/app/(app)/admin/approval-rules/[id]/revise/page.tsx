import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { ButtonLink, Panel } from "@ogfi/ui";
import { AppShell } from "@/components/AppShell";
import {
  ApprovalRuleVersionComposer,
  type ApprovalRuleComposerState,
} from "@/components/ApprovalRuleVersionComposer";
import { getActionErrorCode, getActionFeedback } from "@/server/services/actionFeedback";
import { getDefaultAppRoute, permissions } from "@/server/services/authorization";
import {
  getApprovalRuleVersionForComposer,
  listApprovalRuleComposerOptions,
  reviseCoreAdminApprovalRuleVersion,
} from "@/server/services/approvalRuleLifecycle";
import { getSessionContext } from "@/server/services/context";

export const dynamic = "force-dynamic";

async function reviseRuleAction(
  _state: ApprovalRuleComposerState,
  formData: FormData,
): Promise<ApprovalRuleComposerState> {
  "use server";
  let ruleId: string;
  try {
    ruleId = await reviseCoreAdminApprovalRuleVersion(formData);
  } catch (error) {
    const code = getActionErrorCode(error);
    return { error: getActionFeedback({ error: code })?.message ?? "The approval rule revision could not be saved. Review the form and try again." };
  }
  revalidatePath("/admin");
  revalidatePath(`/admin/approval-rules/${ruleId}`);
  redirect(`/admin/approval-rules/${ruleId}?success=APPROVAL_RULE_REVISION_CREATED`);
}

export default async function ReviseApprovalRulePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSessionContext();
  if (!session) redirect("/sign-in");
  if (
    !session.permissionCodes.includes(permissions.coreAdminister) ||
    !session.permissionCodes.includes(permissions.tenantRoleAdminister)
  ) {
    redirect(getDefaultAppRoute(session.permissionCodes));
  }
  const { id } = await params;
  const [source, options] = await Promise.all([
    getApprovalRuleVersionForComposer(session, id),
    listApprovalRuleComposerOptions(session),
  ]);
  if (!source) redirect(`/admin/approval-rules/${id}`);

  const blockedReason = !source.isSupported
    ? "This transaction type is outside the current Phase I composer and remains read-only in this workspace."
    : source.hasLegacySteps
    ? "This version contains a named-user or unsupported historical step. It remains read-only until the named-approver policy is confirmed; it cannot be silently converted to roles."
    : source.successorRuleId
      ? "A successor version already exists. Open the latest version instead of branching this immutable lineage."
      : options.roleCatalogHasMore
        ? "The eligible role catalog exceeds 200 records. Reconciliation is required before a complete selector can be shown."
        : null;

  return (
    <AppShell
      session={session}
      title="Revise Approval Rule"
      subtitle={`${source.transactionType} / version ${source.version}`}
      activeNav="admin"
    >
      <div className="mb-5 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-[var(--shadow-soft)] sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-950">Create an immutable successor</p>
          <p className="mt-1 text-sm text-slate-600">The selected version and all approval instances that reference it remain unchanged.</p>
        </div>
        <ButtonLink href={`/admin/approval-rules/${source.id}`} tone="secondary">Back to Rule</ButtonLink>
      </div>
      {blockedReason ? (
        <Panel className="border-amber-200 bg-amber-50">
          <h2 className="text-lg font-bold text-amber-950">Revision unavailable</h2>
          <p className="mt-2 text-sm text-amber-900">{blockedReason}</p>
        </Panel>
      ) : (
        <ApprovalRuleVersionComposer
          action={reviseRuleAction}
          idempotencyKey={randomUUID()}
          initial={{
            sourceRuleId: source.id,
            transactionType: source.transactionType,
            routeKey: source.routeKey,
            priority: source.priority,
            expectedLifecycleVersion: source.lifecycleVersion,
            expectedActiveRuleId: source.expectedActiveRuleId,
            steps: source.steps.flatMap((step) => step.roleId ? [{ roleId: step.roleId }] : []),
          }}
          mode="revise"
          roleOptions={options.roleOptions}
          transactionOptions={options.transactionOptions}
        />
      )}
    </AppShell>
  );
}
