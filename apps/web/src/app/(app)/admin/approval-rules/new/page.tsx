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
  createCoreAdminApprovalRuleVersion,
  listApprovalRuleComposerOptions,
} from "@/server/services/approvalRuleLifecycle";
import { getSessionContext } from "@/server/services/context";

export const dynamic = "force-dynamic";

async function createRuleAction(
  _state: ApprovalRuleComposerState,
  formData: FormData,
): Promise<ApprovalRuleComposerState> {
  "use server";
  let ruleId: string;
  try {
    ruleId = await createCoreAdminApprovalRuleVersion(formData);
  } catch (error) {
    const code = getActionErrorCode(error);
    return { error: getActionFeedback({ error: code })?.message ?? "The approval rule could not be saved. Review the form and try again." };
  }
  revalidatePath("/admin");
  revalidatePath(`/admin/approval-rules/${ruleId}`);
  redirect(`/admin/approval-rules/${ruleId}?success=APPROVAL_RULE_CREATED`);
}

export default async function CreateApprovalRulePage() {
  const session = await getSessionContext();
  if (!session) redirect("/sign-in");
  if (
    !session.permissionCodes.includes(permissions.coreAdminister) ||
    !session.permissionCodes.includes(permissions.tenantRoleAdminister)
  ) {
    redirect(getDefaultAppRoute(session.permissionCodes));
  }
  const options = await listApprovalRuleComposerOptions(session);

  return (
    <AppShell
      session={session}
      title="Create Approval Rule"
      subtitle={`Selected company: ${session.context.companyName}`}
      activeNav="admin"
    >
      <div className="mb-5 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-[var(--shadow-soft)] sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-950">Inactive-first policy configuration</p>
          <p className="mt-1 text-sm text-slate-600">Saving creates an immutable version. It will not route submissions until separately activated.</p>
        </div>
        <ButtonLink href="/admin?tab=approval-rules" tone="secondary">Back to Approval Rules</ButtonLink>
      </div>
      {options.roleCatalogHasMore ? (
        <Panel className="mb-5 border-amber-200 bg-amber-50">
          <p className="text-sm text-amber-950">The eligible role catalog exceeds 200 records. Refine the role catalog before creating a rule; this form is intentionally disabled to avoid a partial selection.</p>
        </Panel>
      ) : (
        <ApprovalRuleVersionComposer
          action={createRuleAction}
          idempotencyKey={randomUUID()}
          mode="create"
          roleOptions={options.roleOptions}
          transactionOptions={options.transactionOptions}
        />
      )}
    </AppShell>
  );
}
