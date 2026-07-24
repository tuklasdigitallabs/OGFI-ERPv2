import { redirect } from "next/navigation";
import { Badge, ButtonLink, EmptyState, PaginationBar, WorkspaceTabs } from "@ogfi/ui";
import { AppShell } from "@/components/AppShell";
import { ActionFeedbackBanner } from "@/components/ActionFeedbackBanner";
import { getActionFeedback } from "@/server/services/actionFeedback";
import {
  canUseApprovals,
  getDefaultAppRoute
} from "@/server/services/authorization";
import { getSessionContext } from "@/server/services/context";
import {
  getApprovalDetail,
  listNormalizedApprovalInboxPage,
  listPendingApprovals,
  type ApprovalQueueItem
} from "@/server/services/approvals";
import { normalizedApprovalRoutingEnabled } from "@/server/services/approvalRouting";
import type { PurchaseRequestSlaStatus } from "@/server/services/purchaseRequests";

export const dynamic = "force-dynamic";

type ApprovalInboxTab = "inbox" | "due-soon";

type ApprovalsPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

const PAGE_SIZE = 10;

function getStringParam(
  searchParams: Record<string, string | string[] | undefined>,
  key: string
) {
  const value = searchParams[key];
  return Array.isArray(value) ? value[0] : value;
}

function getTab(searchParams: Record<string, string | string[] | undefined>): ApprovalInboxTab {
  const tab = getStringParam(searchParams, "tab");
  return tab === "due-soon" ? tab : "inbox";
}

function getPage(searchParams: Record<string, string | string[] | undefined>) {
  const page = Number.parseInt(getStringParam(searchParams, "page") ?? "1", 10);
  return Number.isFinite(page) && page > 0 ? page : 1;
}

function approvalsHref(tab: ApprovalInboxTab, page = 1) {
  const params = new URLSearchParams();
  if (tab !== "inbox") {
    params.set("tab", tab);
  }
  if (page > 1) {
    params.set("page", String(page));
  }
  const query = params.toString();
  return query ? `/approvals?${query}` : "/approvals";
}

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
  if (approval.slaStatus === "OVERDUE" || approval.slaStatus === "DUE_TODAY") {
    return true;
  }
  const required = new Date(`${approval.requiredDate}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.ceil((required.getTime() - today.getTime()) / 86_400_000);
  return days <= 1;
}

function slaBadgeTone(status: PurchaseRequestSlaStatus) {
  if (status === "OVERDUE") {
    return "destructive" as const;
  }
  if (status === "DUE_TODAY") {
    return "warning" as const;
  }
  if (status === "ON_TRACK") {
    return "info" as const;
  }
  return "neutral" as const;
}

export default async function ApprovalsPage({ searchParams }: ApprovalsPageProps) {
  const session = await getSessionContext();
  if (!session) {
    redirect("/sign-in");
  }
  if (!canUseApprovals(session.permissionCodes)) {
    redirect(getDefaultAppRoute(session.permissionCodes));
  }

  const params = searchParams ? await searchParams : {};
  const activeTab = getTab(params);
  const page = getPage(params);
  const actionFeedback = getActionFeedback(params);
  const normalizedRouting = normalizedApprovalRoutingEnabled();
  let approvals: ApprovalQueueItem[];
  let urgentApprovals: ApprovalQueueItem[];
  let pagedApprovals: ApprovalQueueItem[];
  let approvalCount: number;
  let urgentApprovalCount: number;
  let visibleApprovalCount: number;
  let safePage: number;

  if (normalizedRouting) {
    const dueBefore = new Date(Date.now() + 86_400_000);
    const [inboxPage, dueSoonPage] = await Promise.all([
      listNormalizedApprovalInboxPage(session, {
        page: activeTab === "inbox" ? page : 1,
        pageSize: activeTab === "inbox" ? PAGE_SIZE : 1
      }),
      listNormalizedApprovalInboxPage(session, {
        page: activeTab === "due-soon" ? page : 1,
        pageSize: activeTab === "due-soon" ? PAGE_SIZE : 1,
        view: "DUE_SOON",
        dueBefore
      })
    ]);
    approvalCount = inboxPage.totalItems;
    urgentApprovalCount = dueSoonPage.totalItems;
    visibleApprovalCount = activeTab === "due-soon" ? urgentApprovalCount : approvalCount;
    const pageCount = Math.max(1, Math.ceil(visibleApprovalCount / PAGE_SIZE));
    safePage = Math.min(page, pageCount);
    let selectedPage = activeTab === "due-soon" ? dueSoonPage : inboxPage;
    if (safePage !== page) {
      selectedPage = await listNormalizedApprovalInboxPage(session, {
        page: safePage,
        pageSize: PAGE_SIZE,
        ...(activeTab === "due-soon" ? { view: "DUE_SOON" as const, dueBefore } : {})
      });
    }
    const details = await Promise.all(
      selectedPage.items.map((item) => getApprovalDetail(session, item.approvalInstanceId))
    );
    const staleDetail = details.some((detail) => detail === null);
    if (staleDetail && getStringParam(params, "stale") !== "1") {
      redirect("/approvals?error=APPROVAL_AUTHORITY_STALE&stale=1");
    }
    pagedApprovals = details.filter((detail): detail is NonNullable<typeof detail> => detail !== null);
    approvals = activeTab === "inbox" ? pagedApprovals : [];
    urgentApprovals = activeTab === "due-soon" ? pagedApprovals : [];
  } else {
    approvals = await listPendingApprovals(session);
    urgentApprovals = approvals.filter(isDueSoon);
    const visibleApprovals = activeTab === "due-soon" ? urgentApprovals : approvals;
    approvalCount = approvals.length;
    urgentApprovalCount = urgentApprovals.length;
    visibleApprovalCount = visibleApprovals.length;
    const pageCount = Math.max(1, Math.ceil(visibleApprovalCount / PAGE_SIZE));
    safePage = Math.min(page, pageCount);
    pagedApprovals = visibleApprovals.slice(
      (safePage - 1) * PAGE_SIZE,
      safePage * PAGE_SIZE
    );
  }
  const tabEmptyCopy =
    activeTab === "due-soon"
          ? {
              title: "No approvals due soon",
              description:
                "Approvals that are overdue or due today will be isolated here for faster review."
            }
          : {
              title: "No pending approvals",
              description:
                "Assigned decisions appear here after a requester submits a controlled record."
            };

  return (
    <AppShell
      session={session}
      title="Approval Inbox"
      subtitle="Assigned controlled record decisions"
      activeNav="approvals"
    >
      <ActionFeedbackBanner feedback={actionFeedback} />
      <div className="ogfi-data-surface">
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h2 className="text-2xl font-bold tracking-tight text-slate-950">Pending decisions</h2>
            <p className="text-sm text-slate-500">
              {approvalCount} assigned to {session.user.displayName}; {urgentApprovalCount} due soon.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge tone="info" size="sm">Scoped</Badge>
            <Badge tone="warning" size="sm">Self-approval blocked</Badge>
          </div>
        </div>
        <div className="border-b border-slate-100 p-4">
          <WorkspaceTabs
            items={[
              {
                label: "Inbox",
                href: approvalsHref("inbox"),
                active: activeTab === "inbox",
                count: approvalCount
              },
              {
                label: "Due soon",
                href: approvalsHref("due-soon"),
                active: activeTab === "due-soon",
                count: urgentApprovalCount
              }
            ]}
          />
        </div>
        <div className="ogfi-table-head hidden grid-cols-[1.35fr_1fr_1fr_1fr_auto] gap-4 border-b border-slate-100 bg-slate-50 px-5 py-3 text-xs font-bold text-slate-500 md:grid">
          <span>Record</span>
          <span>Requester</span>
          <span>Location</span>
          <span>Next action</span>
          <span>Action</span>
        </div>
        {visibleApprovalCount === 0 ? (
          <div className="p-5">
            <EmptyState title={tabEmptyCopy.title} description={tabEmptyCopy.description} />
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {pagedApprovals.map((approval) => (
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
                  {approval.isEmergency && approval.slaStatus ? (
                    <div className="mt-2">
                      <Badge tone={slaBadgeTone(approval.slaStatus)}>
                        {approval.slaLabel}
                      </Badge>
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
                  {approval.slaStatus === "OVERDUE" ? (
                    <p className="mt-1 font-semibold text-rose-700">Overdue</p>
                  ) : isDueSoon(approval) ? (
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
        {visibleApprovalCount > 0 ? (
          <PaginationBar
            page={safePage}
            pageSize={PAGE_SIZE}
            totalItems={visibleApprovalCount}
            itemLabel="approvals"
            getPageHref={(nextPage) => approvalsHref(activeTab, nextPage)}
          />
        ) : null}
      </div>
    </AppShell>
  );
}
