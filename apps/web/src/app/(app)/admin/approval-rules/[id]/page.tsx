import { redirect } from "next/navigation";
import { Badge, ButtonLink, PaginationBar, Panel } from "@ogfi/ui";
import { AppShell } from "@/components/AppShell";
import { getDefaultAppRoute, permissions } from "@/server/services/authorization";
import { getCoreAdminApprovalRuleDetail } from "@/server/services/coreAdmin";
import { getSessionContext } from "@/server/services/context";

export const dynamic = "force-dynamic";

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

  return (
    <AppShell
      session={session}
      title="Approval Rule"
      subtitle={`${rule.transactionType} / ${rule.companyName}`}
      activeNav="admin"
    >
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
          <ButtonLink href="/admin?tab=approval-rules" tone="secondary">
            Back to Approval Rules
          </ButtonLink>
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

      <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
        <Panel className="ogfi-detail-card">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-950">Approval Steps</h2>
              <p className="text-sm text-slate-500">Showing {rule.steps.length} of {rule.stepsPage.totalItems} approval steps</p>
            </div>
            <Badge tone="info">Read-only</Badge>
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
