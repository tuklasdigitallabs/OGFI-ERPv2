import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Badge, ButtonLink, Panel } from "@ogfi/ui";
import { ActionFeedbackBanner } from "@/components/ActionFeedbackBanner";
import {
  ApprovalDecisionComposer,
  type ApprovalDecisionActionState
} from "@/components/ApprovalDecisionComposer";
import { AppShell } from "@/components/AppShell";
import { BoundedApprovalReviewPanel } from "@/components/BoundedApprovalReviewPanel";
import {
  actionSuccessRedirectPath,
  getActionErrorFeedback,
  getActionFeedback
} from "@/server/services/actionFeedback";
import {
  canUseApprovals,
  getDefaultAppRoute
} from "@/server/services/authorization";
import { getSessionContext } from "@/server/services/context";
import {
  executeEligibleApprovalDecision,
  getApprovalDetail
} from "@/server/services/approvals";
import { getBoundedInventoryUatApprovalReview } from "@/server/services/boundedApprovalReview";
import { assertTrustedServerActionOrigin } from "@/server/services/authentication";
import { getApprovalDecisionFieldErrors } from "@/server/services/approvalDecisionCommands";
import {
  getApprovalDecisionSurfaceContract
} from "@/server/services/approvalDecisionCapabilities";
import {
  approvalWorklistMode,
} from "@/server/services/boundedApprovalWorklist";

export const dynamic = "force-dynamic";

type ApprovalDetailPageProps = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function revalidateApprovalTargets() {
  revalidatePath("/approvals");
  revalidatePath("/purchase-requests");
  revalidatePath("/quotes");
  revalidatePath("/purchase-orders");
  revalidatePath("/receiving");
  revalidatePath("/transfers");
  revalidatePath("/counts");
  revalidatePath("/wastage");
  revalidatePath("/adjustments");
  revalidatePath("/workforce");
}

async function reviewApproval(
  _previousState: ApprovalDecisionActionState,
  formData: FormData
): Promise<ApprovalDecisionActionState> {
  "use server";

  const approvalInstanceId = String(formData.get("approvalInstanceId"));
  const decision = String(formData.get("decision") ?? "");
  try {
    await assertTrustedServerActionOrigin();
    const mode = approvalWorklistMode();
    if (mode === "DISABLED") {
      throw new Error("APPROVAL_WORKLIST_ITEM_UNAVAILABLE");
    }
    const remarks = String(formData.get("remarks") ?? "").trim();
    const evidenceReference = String(
      formData.get("evidenceReference") ?? ""
    ).trim();
    const reviewToken = String(formData.get("reviewToken") ?? "").trim();
    await executeEligibleApprovalDecision({
      approvalInstanceId,
      decision: decision.toUpperCase(),
      ...(reviewToken ? { reviewToken } : {}),
      ...(remarks ? { remarks } : {}),
      ...(evidenceReference
        ? { evidenceReference }
        : {}),
    });
  } catch (error) {
    const feedback = getActionErrorFeedback(error);
    const fieldErrors = getApprovalDecisionFieldErrors(error);
    return {
      status: "error",
      code: feedback.code,
      message: feedback.message,
      ...(Object.keys(fieldErrors).length > 0 ? { fieldErrors } : {})
    };
  }
  revalidateApprovalTargets();
  const successCode = decision.toUpperCase() === "APPROVE"
    ? "APPROVAL_DECISION_APPROVED"
    : decision.toUpperCase() === "RETURN"
      ? "APPROVAL_DECISION_RETURNED"
      : "APPROVAL_DECISION_REJECTED";
  redirect(actionSuccessRedirectPath("/approvals", successCode));
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
  const worklistMode = approvalWorklistMode();
  if (worklistMode === "DISABLED") {
    redirect("/approvals?error=APPROVAL_ROUTING_V1_DISABLED");
  }

  const { id } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const actionFeedback = getActionFeedback(resolvedSearchParams);

  if (worklistMode === "BOUNDED_UAT") {
    let review;
    try {
      review = await getBoundedInventoryUatApprovalReview(session, id);
    } catch {
      redirect("/approvals?error=APPROVAL_WORKLIST_ITEM_UNAVAILABLE&stale=1");
    }
    const boundedDecisionPresentation = getApprovalDecisionSurfaceContract(
      review.family,
    );
    return (
      <AppShell
        session={session}
        title="Inventory Control UAT Approval Review"
        subtitle={`${review.presentation.publicReference} / ${review.family}`}
        activeNav="approvals"
      >
        <ActionFeedbackBanner feedback={actionFeedback} />
        <BoundedApprovalReviewPanel
          action={reviewApproval}
          decisionPresentation={boundedDecisionPresentation}
          review={review}
        />
      </AppShell>
    );
  }

  const approval = await getApprovalDetail(session, id);
  if (!approval) {
    redirect("/approvals?error=APPROVAL_WORKLIST_ITEM_UNAVAILABLE&stale=1");
  }
  const decisionPresentation = getApprovalDecisionSurfaceContract(
    approval.approvalKind
  );
  const nextActionLabel = decisionPresentation.decisions
    .filter((entry) => entry.supported && entry.available)
    .map((entry) => entry.label)
    .join(", ");

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
              <dd className="text-slate-950">{nextActionLabel}</dd>
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

          <ApprovalDecisionComposer
            action={reviewApproval}
            approvalInstanceId={approval.approvalInstanceId}
            presentation={decisionPresentation}
          />

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
            <p className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
              Comments are read-only here for this approval type. Add discussion in the authoritative source workspace.
            </p>
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
            <p className="text-sm text-slate-500">Append-only activity for this controlled record</p>
            {approval.auditEvents.length === 0 ? (
              <p className="mt-4 rounded-lg border border-dashed border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                No audit events recorded yet.
              </p>
            ) : (
              <ol className="mt-4 space-y-4">
                {approval.auditEvents.map((event) => (
                  <li key={event.id} className="border-l-2 border-blue-200 pl-3">
                    <p className="text-sm font-medium text-slate-950">{event.eventType}</p>
                    <p className="text-xs text-slate-500">{event.occurredAt}</p>
                  </li>
                ))}
              </ol>
            )}
          </Panel>
        </div>
      </div>
    </AppShell>
  );
}
