import { redirect } from "next/navigation";
import { Badge, ButtonLink, Panel } from "@ogfi/ui";
import { AppShell } from "@/components/AppShell";
import {
  canUseApprovals,
  getDefaultAppRoute
} from "@/server/services/authorization";
import { getSessionContext } from "@/server/services/context";
import {
  listPendingApprovals,
  type ApprovalQueueItem
} from "@/server/services/approvals";

export const dynamic = "force-dynamic";

function approvalTone(status: string) {
  const normalized = status.toUpperCase();
  if (normalized.includes("REJECT") || normalized.includes("CANCEL")) {
    return "destructive" as const;
  }
  if (normalized.includes("APPROVED") || normalized.includes("ACTIVE")) {
    return "success" as const;
  }
  if (normalized.includes("PENDING") || normalized.includes("WAITING")) {
    return "warning" as const;
  }
  if (normalized.includes("DRAFT") || normalized.includes("RETURN")) {
    return "neutral" as const;
  }
  return "info" as const;
}

function isDueSoon(approval: ApprovalQueueItem) {
  const required = new Date(`${approval.requiredDate}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.ceil((required.getTime() - today.getTime()) / 86_400_000);
  return days <= 1;
}

export default async function ApprovalsPage() {
  const session = await getSessionContext();
  if (!session) {
    redirect("/sign-in");
  }
  if (!canUseApprovals(session.permissionCodes)) {
    redirect(getDefaultAppRoute(session.permissionCodes));
  }

  const approvals = await listPendingApprovals(session);
  const urgentApprovals = approvals.filter(isDueSoon);

  return (
    <AppShell
      session={session}
      title="Approval Inbox"
      subtitle="Assigned controlled record decisions"
      activeNav="approvals"
    >
      <div className="mb-5 grid gap-4 md:grid-cols-3">
        <Panel className="ogfi-metric-card p-5">
          <p className="text-sm font-semibold text-slate-500">Assigned</p>
          <p className="mt-2 text-3xl font-bold text-slate-950">{approvals.length}</p>
        </Panel>
        <Panel className="ogfi-metric-card p-5">
          <p className="text-sm font-semibold text-slate-500">Due soon</p>
          <p className="mt-2 text-3xl font-bold text-amber-700">{urgentApprovals.length}</p>
        </Panel>
        <Panel className="ogfi-metric-card p-5">
          <p className="text-sm font-semibold text-slate-500">Approver</p>
          <p className="mt-2 text-lg font-bold text-slate-950">{session.user.displayName}</p>
        </Panel>
      </div>

      <div className="ogfi-data-surface">
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="ogfi-tab-list mb-4">
              <span className="ogfi-tab is-active">Inbox</span>
              <span className="ogfi-tab">Due soon</span>
              <span className="ogfi-tab">Returned</span>
              <span className="ogfi-tab">Audit</span>
            </div>
            <h2 className="text-2xl font-bold tracking-tight text-slate-950">Pending decisions</h2>
            <p className="text-sm text-slate-500">
              Review controlled records assigned to your role and scoped locations.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge tone="info" size="sm">Scoped</Badge>
            <Badge tone="warning" size="sm">Self-approval blocked</Badge>
          </div>
        </div>
        <div className="ogfi-table-head hidden grid-cols-[1.35fr_1fr_1fr_1fr_auto] gap-4 border-b border-slate-100 bg-slate-50 px-5 py-3 text-xs font-bold text-slate-500 md:grid">
          <span>Record</span>
          <span>Requester</span>
          <span>Location</span>
          <span>Next action</span>
          <span>Action</span>
        </div>
        {approvals.length === 0 ? (
          <div className="p-5">
            <p className="font-semibold text-slate-900">No pending approvals</p>
            <p className="mt-1 text-sm text-slate-600">
              Assigned decisions appear here after a requester submits a controlled record.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {approvals.map((approval) => (
              <div
                key={approval.approvalInstanceId}
                data-testid="approval-row"
                  className="ogfi-table-row grid gap-4 px-5 py-4 md:grid-cols-[1.35fr_1fr_1fr_1fr_auto] md:items-center"
              >
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-bold text-slate-950">{approval.publicReference}</h3>
                    <Badge tone={approvalTone(approval.status)} size="sm">
                      {approval.status.replaceAll("_", " ")}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    {approval.documentType} / {approval.lineDescription}
                  </p>
                  {approval.evidenceStatus ? (
                    <p className="mt-1 text-xs font-medium text-slate-600">
                      Evidence: {approval.evidenceStatus}
                    </p>
                  ) : null}
                  {approval.policyFlagLabels && approval.policyFlagLabels.length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {approval.policyFlagLabels.map((flag) => (
                        <Badge key={flag} tone="warning">
                          {flag}
                        </Badge>
                      ))}
                    </div>
                  ) : null}
                </div>
                <div className="text-sm text-slate-700">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 md:hidden">
                    Requester
                  </p>
                  <p className="font-medium">{approval.requesterName}</p>
                </div>
                <div className="text-sm text-slate-700">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 md:hidden">
                    Location
                  </p>
                  <p className="font-medium">{approval.locationName}</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600 md:bg-white">
                  <p className="font-semibold text-slate-900">Review assigned step</p>
                  <p className="mt-1">
                    Step {approval.currentStepOrder ?? "current"} / Due {approval.requiredDate}
                  </p>
                  {isDueSoon(approval) ? (
                    <p className="mt-1 font-semibold text-amber-700">Due soon</p>
                  ) : null}
                </div>
                <ButtonLink
                  href={`/approvals/${approval.approvalInstanceId}`}
                  tone="secondary"
                  className="min-h-11 text-blue-700 hover:bg-blue-50"
                >
                  Review
                </ButtonLink>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
