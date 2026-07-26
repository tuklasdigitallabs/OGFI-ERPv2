import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { Badge, ButtonLink, PaginationBar, Panel } from "@ogfi/ui";
import { ActionFeedbackBanner } from "@/components/ActionFeedbackBanner";
import { AppShell } from "@/components/AppShell";
import { PendingActionButton } from "@/components/PendingActionButton";
import { TaskSheet } from "@/components/TaskSheet";
import { actionErrorRedirectPath, getActionFeedback } from "@/server/services/actionFeedback";
import { getDefaultAppRoute, permissions } from "@/server/services/authorization";
import {
  activateCoreAdminApprovalRuleVersion,
  deactivateCoreAdminApprovalRuleVersion,
  getApprovalRuleVersionForComposer,
} from "@/server/services/approvalRuleLifecycle";
import { getCoreAdminApprovalRuleDetail } from "@/server/services/coreAdmin";
import { getSessionContext } from "@/server/services/context";

export const dynamic = "force-dynamic";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function runLifecycleAction(formData: FormData, activate: boolean) {
  const submittedId = String(formData.get("ruleId") ?? "");
  const returnPath = uuidPattern.test(submittedId)
    ? `/admin/approval-rules/${submittedId}`
    : "/admin?tab=approval-rules";
  let ruleId: string;
  try {
    ruleId = activate
      ? await activateCoreAdminApprovalRuleVersion(formData)
      : await deactivateCoreAdminApprovalRuleVersion(formData);
  } catch (error) {
    redirect(actionErrorRedirectPath(returnPath, error));
  }
  revalidatePath("/admin");
  revalidatePath(`/admin/approval-rules/${ruleId}`);
  redirect(`/admin/approval-rules/${ruleId}?success=${activate ? "APPROVAL_RULE_ACTIVATED" : "APPROVAL_RULE_DEACTIVATED"}`);
}

async function activateRuleAction(formData: FormData) {
  "use server";
  return runLifecycleAction(formData, true);
}

async function deactivateRuleAction(formData: FormData) {
  "use server";
  return runLifecycleAction(formData, false);
}

export default async function CoreAdminApprovalRuleDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getSessionContext();
  if (!session) {
    redirect("/sign-in");
  }
  if (!session.permissionCodes.includes(permissions.coreAdminister)) {
    redirect(getDefaultAppRoute(session.permissionCodes));
  }

  const { id } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const stepsPageValue = Number.parseInt(String(resolvedSearchParams.stepsPage ?? "1"), 10);
  const stepsPageSizeValue = Number.parseInt(String(resolvedSearchParams.stepsPageSize ?? "25"), 10);
  const auditPageValue = Number.parseInt(String(resolvedSearchParams.auditPage ?? "1"), 10);
  const auditPageSizeValue = Number.parseInt(String(resolvedSearchParams.auditPageSize ?? "25"), 10);
  const rule = await getCoreAdminApprovalRuleDetail(session, id, {
    stepsPage: Number.isFinite(stepsPageValue) ? stepsPageValue : 1,
    stepsPageSize: Number.isFinite(stepsPageSizeValue) ? stepsPageSizeValue : 25,
    auditPage: Number.isFinite(auditPageValue) ? auditPageValue : 1,
    auditPageSize: Number.isFinite(auditPageSizeValue) ? auditPageSizeValue : 25,
  });
  if (!rule) {
    redirect("/admin");
  }
  const hasLifecyclePermission = session.permissionCodes.includes(
    permissions.tenantRoleAdminister,
  );
  const composerRule = hasLifecyclePermission
    ? await getApprovalRuleVersionForComposer(session, id)
    : null;
  const feedback = getActionFeedback(resolvedSearchParams);
  const successCode = String(resolvedSearchParams.success ?? "");
  const success = new Set([
    "APPROVAL_RULE_CREATED",
    "APPROVAL_RULE_REVISION_CREATED",
    "APPROVAL_RULE_ACTIVATED",
    "APPROVAL_RULE_DEACTIVATED",
  ]).has(successCode)
    ? successCode
    : "";

  return (
    <AppShell
      session={session}
      title="Approval Rule"
      subtitle={`${rule.transactionType} / ${rule.companyName}`}
      activeNav="admin"
    >
      <ActionFeedbackBanner feedback={feedback} />
      {success ? (
        <p className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-900">
          {success === "APPROVAL_RULE_CREATED"
            ? "The inactive approval rule version was created. Review it before activation."
            : success === "APPROVAL_RULE_REVISION_CREATED"
              ? "The inactive successor version was created. The prior version and existing approval instances are unchanged."
              : success === "APPROVAL_RULE_ACTIVATED"
                ? "This rule version is now active for future submissions in its route slot."
                : "This rule version is inactive. Existing approval instances continue unchanged."}
        </p>
      ) : null}
      <div className="mb-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-[var(--shadow-soft)]">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-2 text-sm">
              <ButtonLink href="/admin?tab=approval-rules" tone="ghost" className="ogfi-chip">
                Approval Rules
              </ButtonLink>
              <span className="text-slate-400">/</span>
              <span className="font-semibold text-slate-700">{rule.transactionType}</span>
            </nav>
            <p className="mt-2 text-sm text-slate-500">
              You are inspecting one approval rule. Return to the Approval Rules workspace to compare routing.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {composerRule && composerRule.isSupported && !composerRule.hasLegacySteps && !composerRule.successorRuleId ? (
              <ButtonLink href={`/admin/approval-rules/${rule.id}/revise`} tone="secondary">Revise Rule</ButtonLink>
            ) : null}
            {composerRule?.successorRuleId ? (
              <ButtonLink href={`/admin/approval-rules/${composerRule.successorRuleId}`} tone="secondary">Open Successor</ButtonLink>
            ) : null}
            <ButtonLink href="/admin?tab=approval-rules" tone="secondary">Back to Approval Rules</ButtonLink>
          </div>
        </div>
      </div>
      <div className="mb-5 grid gap-4 md:grid-cols-4">
        <Panel className="ogfi-detail-card">
          <p className="text-sm font-semibold text-slate-500">Status</p>
          <div className="mt-3">
            <Badge tone={rule.isActive ? "success" : "neutral"}>
              {rule.isActive ? "ACTIVE" : "INACTIVE"}
            </Badge>
          </div>
        </Panel>
        <Panel className="ogfi-detail-card">
          <p className="text-sm font-semibold text-slate-500">Priority</p>
          <p className="mt-2 text-3xl font-bold text-slate-950">{rule.priority}</p>
          <p className="mt-1 text-xs text-slate-500">Version {rule.version} / {rule.routeKey.replaceAll("_", " ")}</p>
        </Panel>
        <Panel className="ogfi-detail-card">
          <p className="text-sm font-semibold text-slate-500">Steps</p>
          <p className="mt-2 text-3xl font-bold text-slate-950">{rule.stepsPage.totalItems}</p>
        </Panel>
        <Panel className="ogfi-detail-card">
          <p className="text-sm font-semibold text-slate-500">Created</p>
          <p className="mt-2 text-sm font-semibold text-slate-950">{new Date(rule.createdAt).toLocaleString("en-PH", { timeZone: rule.timezone })}</p>
        </Panel>
      </div>

      <Panel className="mb-5 ogfi-detail-card">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-950">Lifecycle controls</h2>
            <p className="mt-1 text-sm text-slate-600">
              Changes affect future submissions only. Existing approval instances retain this exact version and its copied steps.
            </p>
          </div>
          {composerRule && composerRule.isSupported && !composerRule.hasLegacySteps ? (
            <div className="flex flex-wrap gap-2">
              {!composerRule.isActive ? (
                <TaskSheet title="Activate Approval Rule Version" trigger={<span>Activate Version</span>} triggerClassName="min-h-11 bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700" description={`Activate version ${composerRule.version} for ${composerRule.transactionType}. The current active version in this exact route slot will be deactivated atomically.`}>
                  <form action={activateRuleAction} className="grid gap-4">
                    <input name="ruleId" type="hidden" value={composerRule.id} />
                    <input name="expectedLifecycleVersion" type="hidden" value={composerRule.lifecycleVersion} />
                    <input name="expectedActiveRuleId" type="hidden" value={composerRule.expectedActiveRuleId ?? ""} />
                    <input name="idempotencyKey" type="hidden" value={randomUUID()} />
                    <label className="grid gap-1 text-sm font-medium text-slate-700">Activation reason<textarea className="min-h-28 rounded-md border border-slate-300 px-3 py-2" minLength={5} maxLength={500} name="reason" required /></label>
                    <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">The server rechecks MFA, company authority, role permissions, scoped approver availability, the active route slot, and this version before changing routing.</p>
                    <PendingActionButton label="Activate Version" pendingLabel="Activating…" confirmation="Activate this version for future submissions and replace the current active version in this route slot?" />
                  </form>
                </TaskSheet>
              ) : (
                <TaskSheet title="Deactivate Approval Rule Version" trigger={<span>Deactivate Version</span>} triggerClassName="min-h-11 border border-red-200 px-4 text-sm font-semibold text-red-700 hover:bg-red-50" description="Deactivation stops this route for new submissions. It does not cancel or reroute approval instances already in progress.">
                  <form action={deactivateRuleAction} className="grid gap-4">
                    <input name="ruleId" type="hidden" value={composerRule.id} />
                    <input name="expectedLifecycleVersion" type="hidden" value={composerRule.lifecycleVersion} />
                    <input name="expectedActiveRuleId" type="hidden" value={composerRule.id} />
                    <input name="idempotencyKey" type="hidden" value={randomUUID()} />
                    <label className="grid gap-1 text-sm font-medium text-slate-700">Deactivation reason<textarea className="min-h-28 rounded-md border border-slate-300 px-3 py-2" minLength={5} maxLength={500} name="reason" required /></label>
                    <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">New submissions may be blocked with Approval rule not configured until another valid version is activated.</p>
                    <PendingActionButton tone="danger" label="Deactivate Version" pendingLabel="Deactivating…" confirmation="Deactivate this route for future submissions? Existing approvals will continue." />
                  </form>
                </TaskSheet>
              )}
            </div>
          ) : (
            <Badge tone="neutral">Read-only</Badge>
          )}
        </div>
        {!composerRule ? (
          <p className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">{rule.companyName === "Tenant-wide" ? "Tenant-wide rules are inspectable here but cannot be changed until cross-company policy ownership and audit scope are confirmed." : "You may inspect this version, but lifecycle changes require tenant-role administration authority in addition to selected-company Manage access."}</p>
        ) : !composerRule.isSupported ? (
          <p className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">This transaction type is outside the current Phase I composer. Its historical definition remains visible, but lifecycle controls are unavailable here.</p>
        ) : composerRule.hasLegacySteps ? (
          <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">This historical version contains a named-user or unsupported step. It cannot be revised or reactivated through the role-only composer and will never be silently converted.</p>
        ) : composerRule.successorRuleId ? (
          <p className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">A successor already exists, so this version cannot branch into another revision. Open the successor above to continue the lineage. Retained validated versions may still be activated as a controlled rollback.</p>
        ) : null}
      </Panel>

      <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
        <Panel className="ogfi-detail-card">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-950">Approval Steps</h2>
              <p className="text-sm text-slate-500">Showing {rule.steps.length} of {rule.stepsPage.totalItems} approval steps</p>
            </div>
            <Badge tone="info">Immutable version</Badge>
          </div>
          <div className="mt-4 divide-y divide-slate-100">
            {rule.steps.length === 0 ? (
              <p className="py-4 text-sm text-slate-600">No approval steps are configured for this rule.</p>
            ) : (
              rule.steps.map((step) => (
                <div key={step.id} data-testid="admin-rule-step-row" className="ogfi-list-row">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold text-slate-950">
                        Step {step.stepOrder}: {step.approverType}
                      </p>
                      <p className="text-sm text-slate-700">{step.assigneeName}</p>
                      <p className="text-xs text-slate-500">{step.assigneeCode} / {step.assigneeStatus}</p>
                    </div>
                    <Badge tone={step.required ? "success" : "neutral"}>
                      {step.required ? "Required" : "Optional"}
                    </Badge>
                  </div>
                  <p className="mt-2 text-sm text-slate-600">
                    Escalation: {step.escalationHours ?? "Not configured"}
                  </p>
                </div>
              ))
            )}
          </div>
          {rule.stepsPage.totalItems > 0 ? (
            <PaginationBar
              page={rule.stepsPage.page}
              pageSize={rule.stepsPage.pageSize}
              totalItems={rule.stepsPage.totalItems}
              itemLabel="approval steps"
              getPageHref={(nextPage) => `/admin/approval-rules/${rule.id}?stepsPage=${nextPage}&stepsPageSize=${rule.stepsPage.pageSize}&auditPage=${rule.auditPage.page}&auditPageSize=${rule.auditPage.pageSize}`}
            />
          ) : null}
        </Panel>

        <Panel className="ogfi-detail-card">
          <h2 className="text-lg font-bold text-slate-950">Rule Scope</h2>
          <dl className="mt-4 grid gap-4 text-sm">
            <div>
              <dt className="font-medium text-slate-500">Transaction type</dt>
              <dd className="mt-1 font-semibold text-slate-950">{rule.transactionType}</dd>
            </div>
            <div>
              <dt className="font-medium text-slate-500">Company</dt>
              <dd className="mt-1 font-semibold text-slate-950">{rule.companyName}</dd>
            </div>
            <div>
              <dt className="font-medium text-slate-500">Scope filters</dt>
              <dd className="mt-1 rounded-lg bg-slate-50 p-3 font-mono text-xs text-slate-700">
                {JSON.stringify(rule.scopeFilters ?? {}, null, 2)}
              </dd>
            </div>
          </dl>
        </Panel>

        <Panel className="xl:col-span-2">
          <h2 className="text-lg font-bold text-slate-950">Related Audit Activity</h2>
          <p className="mt-1 text-sm text-slate-500">Showing {rule.relatedAuditEvents.length} of {rule.auditPage.totalItems} events in the selected company.</p>
          {rule.relatedAuditEvents.length === 0 ? (
            <p className="mt-4 text-sm text-slate-600">
              No recent controlled actions reference this approval rule.
            </p>
          ) : (
            <div className="mt-4 divide-y divide-slate-100">
              {rule.relatedAuditEvents.map((event) => (
                <div key={event.id} data-testid="admin-rule-audit-row" className="ogfi-list-row">
                  <p className="font-semibold text-slate-950">{event.eventType}</p>
                  <p className="text-sm text-slate-600">
                    {event.entityType} / {event.entityId}
                  </p>
                  <p className="text-xs text-slate-500">
                    {event.actorName} / {new Date(event.occurredAt).toLocaleString("en-PH", { timeZone: rule.timezone })}
                  </p>
                </div>
              ))}
            </div>
          )}
          {rule.auditPage.totalItems > 0 ? (
            <PaginationBar
              page={rule.auditPage.page}
              pageSize={rule.auditPage.pageSize}
              totalItems={rule.auditPage.totalItems}
              itemLabel="audit events"
              getPageHref={(nextPage) => `/admin/approval-rules/${rule.id}?stepsPage=${rule.stepsPage.page}&stepsPageSize=${rule.stepsPage.pageSize}&auditPage=${nextPage}&auditPageSize=${rule.auditPage.pageSize}`}
            />
          ) : null}
        </Panel>
      </div>

      <div className="mt-5">
        <ButtonLink href="/admin?tab=approval-rules" tone="ghost" className="ogfi-chip">
          Back to Approval Rules
        </ButtonLink>
      </div>
    </AppShell>
  );
}
