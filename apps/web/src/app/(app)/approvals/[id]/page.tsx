import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Badge, ButtonLink, Panel } from "@ogfi/ui";
import { ActionFeedbackBanner } from "@/components/ActionFeedbackBanner";
import { AppShell } from "@/components/AppShell";
import {
  actionErrorRedirectPath,
  getActionFeedback
} from "@/server/services/actionFeedback";
import {
  canUseApprovals,
  getDefaultAppRoute
} from "@/server/services/authorization";
import { getSessionContext } from "@/server/services/context";
import {
  executeCanonicalApprovalDecision,
  getApprovalDetail
} from "@/server/services/approvals";
import { isSupportedApprovalDocumentType } from "@/server/services/approvalRoutingRegistry";
import { addPurchaseRequestComment } from "@/server/services/purchaseRequests";

export const dynamic = "force-dynamic";

type ApprovalDetailPageProps = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function revalidateApprovalTargets() {
  revalidatePath("/approvals");
  revalidatePath("/purchase-orders");
  revalidatePath("/receiving");
  revalidatePath("/adjustments");
  revalidatePath("/workforce");
}

async function reviewApproval(formData: FormData) {
  "use server";

  const approvalInstanceId = String(formData.get("approvalInstanceId"));
  const approvalKind = String(formData.get("approvalKind") ?? "");
  const decision = String(formData.get("decision") ?? "");
  try {
    if (!supportsCanonicalSourceCommand(approvalKind, decision)) {
      throw new Error("APPROVAL_DECISION_REQUIRED");
    }
    const remarks = String(formData.get("remarks") ?? "").trim();
    const evidenceReference = String(
      formData.get("evidenceReference") ?? ""
    ).trim();
    await executeCanonicalApprovalDecision({
      approvalInstanceId,
      family: approvalKind,
      decision: decision.toUpperCase(),
      ...(remarks ? { remarks } : {}),
      ...(approvalKind === "PaymentRequest" || !evidenceReference
        ? {}
        : { evidenceReference }),
    });
  } catch (error) {
    redirect(actionErrorRedirectPath(`/approvals/${approvalInstanceId}`, error));
  }
  revalidateApprovalTargets();
  redirect("/approvals");
}

const evidenceDecisionApprovalKinds = [
  "BudgetRevision",
  "ExpenseRequest",
  "CashAdvanceRequest",
  "PettyCashRequest",
  "PaymentRequest",
  "EmployeeLeaveRequest",
  "EmployeeOvertimeRecord",
  "WorkforceSchedule"
] as const;

function supportsDecisionEvidence(approvalKind: string) {
  return evidenceDecisionApprovalKinds.some(
    (kind) => kind === approvalKind && kind !== "PaymentRequest"
  );
}

function supportsCanonicalSourceCommand(
  approvalKind: string,
  decision: string
) {
  return (
    isSupportedApprovalDocumentType(approvalKind) &&
    ["approve", "return", "reject"].includes(decision)
  );
}

async function addComment(formData: FormData) {
  "use server";

  const approvalInstanceId = String(formData.get("approvalInstanceId"));
  try {
    await addPurchaseRequestComment(formData);
  } catch (error) {
    redirect(actionErrorRedirectPath(`/approvals/${approvalInstanceId}`, error));
  }
  revalidatePath(`/approvals/${approvalInstanceId}`);
}

function getApproveButtonLabel(approvalKind: string) {
  if (approvalKind === "PurchaseRequest") {
    return "Approve Purchase Request";
  }
  if (approvalKind === "PurchaseOrder") {
    return "Approve Purchase Order";
  }
  if (approvalKind === "PurchaseOrderBalanceClosure") {
    return "Approve Balance Closure";
  }
  if (approvalKind === "WastageReport") {
    return "Approve Wastage Report";
  }
  if (approvalKind === "StockAdjustment") {
    return "Approve Stock Adjustment";
  }
  if (approvalKind === "BudgetRevision") {
    return "Approve Budget Revision";
  }
  if (approvalKind === "ExpenseRequest") {
    return "Approve Expense Request";
  }
  if (approvalKind === "CashAdvanceRequest") {
    return "Approve Cash Advance";
  }
  if (approvalKind === "PettyCashRequest") {
    return "Approve Petty Cash";
  }
  if (approvalKind === "PaymentRequest") {
    return "Approve Payment Request";
  }
  if (approvalKind === "PaymentRelease") {
    return "Approve Payment Release";
  }
  if (approvalKind === "FinanceCloseRun") {
    return "Approve Period Action";
  }
  if (approvalKind === "EmployeeLeaveRequest") {
    return "Approve Leave";
  }
  if (approvalKind === "EmployeeOvertimeRecord") {
    return "Approve Overtime";
  }
  if (approvalKind === "WorkforceSchedule") {
    return "Approve Schedule";
  }
  if (approvalKind === "AttendanceImportBatch") {
    return "Approve Attendance Review";
  }
  return "Approve Recommendation";
}

function getRejectButtonLabel(approvalKind: string) {
  if (approvalKind === "PurchaseOrder") {
    return "Reject Purchase Order";
  }
  if (approvalKind === "PurchaseOrderBalanceClosure") {
    return "Reject Balance Closure";
  }
  if (approvalKind === "QuotationRecommendation") {
    return "Reject Recommendation";
  }
  if (approvalKind === "WastageReport") {
    return "Reject Wastage Report";
  }
  if (approvalKind === "StockAdjustment") {
    return "Reject Stock Adjustment";
  }
  if (approvalKind === "BudgetRevision") {
    return "Reject Budget Revision";
  }
  if (approvalKind === "ExpenseRequest") {
    return "Reject Expense Request";
  }
  if (approvalKind === "CashAdvanceRequest") {
    return "Reject Cash Advance";
  }
  if (approvalKind === "PettyCashRequest") {
    return "Reject Petty Cash";
  }
  if (approvalKind === "PaymentRequest") {
    return "Reject Payment Request";
  }
  if (approvalKind === "PaymentRelease") {
    return "Reject Payment Release";
  }
  if (approvalKind === "FinanceCloseRun") {
    return "Reject Period Action";
  }
  if (approvalKind === "EmployeeLeaveRequest") {
    return "Reject Leave";
  }
  if (approvalKind === "EmployeeOvertimeRecord") {
    return "Reject Overtime";
  }
  if (approvalKind === "WorkforceSchedule") {
    return "Reject Schedule";
  }
  if (approvalKind === "AttendanceImportBatch") {
    return "Reject Attendance Review";
  }
  return "Reject Purchase Request";
}

function canReturnApprovalKind(approvalKind: string) {
  return ![
    "BudgetRevision",
    "PaymentRelease",
    "FinanceCloseRun",
    "EmployeeOvertimeRecord"
  ].includes(approvalKind);
}

export default async function ApprovalDetailPage({
  params,
  searchParams
}: ApprovalDetailPageProps) {
  const session = await getSessionContext();
  if (!session) {
    redirect("/sign-in");
  }
  if (!canUseApprovals(session.permissionCodes)) {
    redirect(getDefaultAppRoute(session.permissionCodes));
  }

  const { id } = await params;
  const approval = await getApprovalDetail(session, id);
  if (!approval) {
    redirect(getDefaultAppRoute(session.permissionCodes));
  }
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const actionFeedback = getActionFeedback(resolvedSearchParams);

  return (
    <AppShell
      session={session}
      title="Approval Review"
      subtitle={`${approval.publicReference} / ${approval.locationName}`}
      activeNav="approvals"
    >
      <ActionFeedbackBanner feedback={actionFeedback} />
      <div className="grid gap-4 xl:grid-cols-[1fr_24rem]">
        <Panel className="ogfi-detail-card">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-sm font-medium text-blue-700">{approval.approvalTitle}</p>
              <h2 className="text-2xl font-semibold text-slate-950">
                {approval.publicReference}
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                Owner {approval.requesterName} / {approval.locationName}
              </p>
            </div>
            <Badge tone="warning">{approval.status.replace("_", " ")}</Badge>
          </div>

          <dl className="mt-6 grid gap-4 ogfi-record-summary p-4 sm:grid-cols-2">
            <div>
              <dt className="text-sm font-medium text-slate-500">Current step</dt>
              <dd className="text-slate-950">{approval.currentStepOrder ?? "Pending"}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-slate-500">Required date</dt>
              <dd className="text-slate-950">{approval.requiredDate}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-slate-500">Quantity</dt>
              <dd className="text-slate-950">
                {approval.quantity} {approval.uomCode}
              </dd>
            </div>
            {approval.amountLabel ? (
              <div>
                <dt className="text-sm font-medium text-slate-500">Amount</dt>
                <dd className="text-slate-950">{approval.amountLabel}</dd>
              </div>
            ) : null}
            <div>
              <dt className="text-sm font-medium text-slate-500">Next action</dt>
              <dd className="text-slate-950">
                {canReturnApprovalKind(approval.approvalKind)
                  ? "Approve, return, or reject"
                  : "Approve or reject"}
              </dd>
            </div>
          </dl>

          <div className="mt-6 rounded-lg border border-slate-200 p-4">
            <h3 className="font-semibold text-slate-950">{approval.lineDescription}</h3>
            <p className="mt-3 text-sm text-slate-700">{approval.justification}</p>
            {approval.evidenceStatus ? (
              <p className="mt-3 text-sm font-medium text-slate-700">
                Evidence: {approval.evidenceStatus}
              </p>
            ) : null}
            {approval.policyFlagLabels && approval.policyFlagLabels.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {approval.policyFlagLabels.map((flag) => (
                  <Badge key={flag} tone="warning">
                    {flag}
                  </Badge>
                ))}
              </div>
            ) : null}
            {approval.selectedSupplierName ? (
              <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                <div>
                  <dt className="font-semibold text-slate-500">Selected supplier</dt>
                  <dd className="text-slate-900">{approval.selectedSupplierName}</dd>
                </div>
                <div>
                  <dt className="font-semibold text-slate-500">Quote reference</dt>
                  <dd className="text-slate-900">{approval.selectedQuoteReference}</dd>
                </div>
                {approval.nonLowestJustification ? (
                  <div>
                    <dt className="font-semibold text-slate-500">Non-lowest justification</dt>
                    <dd className="text-slate-900">{approval.nonLowestJustification}</dd>
                  </div>
                ) : null}
                {approval.singleSourceJustification ? (
                  <div>
                    <dt className="font-semibold text-slate-500">Single-source justification</dt>
                    <dd className="text-slate-900">{approval.singleSourceJustification}</dd>
                  </div>
                ) : null}
              </dl>
            ) : null}
          </div>

          <form
            action={reviewApproval}
            className="mt-6 rounded-xl border border-blue-100 bg-blue-50/60 p-4"
          >
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h3 className="font-bold text-slate-950">Decision composer</h3>
                <p className="text-sm text-slate-600">
                  Choose one outcome for this approval step. Remarks are required for return or reject decisions.
                </p>
              </div>
              <Badge tone="info" size="sm">One decision only</Badge>
            </div>
            <div className="mt-4 grid gap-3">
              <input name="approvalInstanceId" type="hidden" value={approval.approvalInstanceId} />
              <input name="approvalKind" type="hidden" value={approval.approvalKind} />
              <label className="grid gap-1 text-sm font-medium text-slate-700">
                Decision remarks
                <textarea
                  className="min-h-24 rounded-md border border-slate-300 bg-white px-3 py-2"
                  name="remarks"
                  placeholder="Optional for approval; required for return or rejection"
                />
              </label>
              {supportsDecisionEvidence(approval.approvalKind) ? (
                <label className="grid gap-1 text-sm font-medium text-slate-700">
                  Supplemental decision evidence reference
                  <input
                    className="rounded-md border border-slate-300 bg-white px-3 py-2"
                    name="evidenceReference"
                    placeholder="Approval memo, review note, or supporting reference"
                  />
                  <span className="text-xs font-normal text-slate-500">
                    Adds decision-support context. It does not replace or verify
                    evidence already attached to the source record.
                  </span>
                </label>
              ) : null}
              {approval.approvalKind === "PaymentRequest" ? (
                <div className="rounded-lg border border-blue-200 bg-white px-3 py-2 text-xs text-blue-900">
                  Legacy approval remains available while normalized routing is
                  disabled. Normalized approval stays blocked until Finance confirms
                  the invoice eligibility and capacity policy.
                </div>
              ) : null}
              <div
                className={
                  canReturnApprovalKind(approval.approvalKind)
                    ? "grid gap-2 sm:grid-cols-3"
                    : "grid gap-2 sm:grid-cols-2"
                }
              >
                <button
                  className="inline-flex min-h-10 items-center justify-center rounded-md bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700"
                  name="decision"
                  value="approve"
                >
                  {getApproveButtonLabel(approval.approvalKind)}
                </button>
                {canReturnApprovalKind(approval.approvalKind) ? (
                  <button
                    className="inline-flex min-h-10 items-center justify-center rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 hover:bg-slate-50"
                    name="decision"
                    value="return"
                  >
                    Return for Revision
                  </button>
                ) : null}
                <button
                  className="inline-flex min-h-10 items-center justify-center rounded-md bg-red-600 px-4 text-sm font-semibold text-white hover:bg-red-700"
                  name="decision"
                  value="reject"
                >
                  {getRejectButtonLabel(approval.approvalKind)}
                </button>
              </div>
            </div>
          </form>

          <div className="mt-6">
            <ButtonLink href="/approvals" className="bg-slate-100 text-blue-700 hover:bg-blue-50">
              Back to inbox
            </ButtonLink>
          </div>
        </Panel>

        <div className="grid gap-4">
          <Panel className="ogfi-detail-card">
            <h2 className="text-lg font-bold text-slate-950">Comments</h2>
            <p className="text-sm text-slate-500">Scoped operational discussion</p>
            {approval.approvalKind === "PurchaseRequest" ? (
              <form action={addComment} className="mt-4 grid gap-2">
                <input name="approvalInstanceId" type="hidden" value={approval.approvalInstanceId} />
                <input name="purchaseRequestId" type="hidden" value={approval.documentId} />
                <label className="grid gap-1 text-sm font-medium text-slate-700">
                  Add comment
                  <textarea
                    className="min-h-24 rounded-md border border-slate-300 px-3 py-2"
                    name="body"
                    required
                  />
                </label>
                <button className="inline-flex min-h-9 w-full items-center justify-center rounded-md bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700">
                  Add Comment
                </button>
              </form>
            ) : null}
            <div className="mt-4 space-y-3">
              {approval.comments.length === 0 ? (
                <p className="text-sm text-slate-500">No comments yet.</p>
              ) : (
                approval.comments.map((comment) => (
                  <div key={comment.id} data-testid="approval-comment" className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <p className="text-sm font-semibold text-slate-950">{comment.authorName}</p>
                    <p className="mt-1 text-sm text-slate-700">{comment.body}</p>
                    <p className="mt-2 text-xs text-slate-500">{comment.createdAt}</p>
                  </div>
                ))
              )}
            </div>
          </Panel>

          <Panel className="ogfi-detail-card">
            <h2 className="text-lg font-bold text-slate-950">Audit History</h2>
            <p className="text-sm text-slate-500">Append-only activity for this request</p>
            <ol className="mt-4 space-y-4">
              {approval.auditEvents.map((event) => (
                <li key={event.id} className="border-l-2 border-blue-200 pl-3">
                  <p className="text-sm font-medium text-slate-950">{event.eventType}</p>
                  <p className="text-xs text-slate-500">{event.occurredAt}</p>
                </li>
              ))}
            </ol>
          </Panel>
        </div>
      </div>
    </AppShell>
  );
}
