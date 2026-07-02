import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { Badge, ButtonLink, Panel } from "@ogfi/ui";
import { ActionFeedbackBanner } from "@/components/ActionFeedbackBanner";
import { AppShell } from "@/components/AppShell";
import {
  actionErrorRedirectPath,
  getActionFeedback,
} from "@/server/services/actionFeedback";
import {
  canUsePurchaseRequests,
  getDefaultAppRoute,
} from "@/server/services/authorization";
import { getSessionContext } from "@/server/services/context";
import {
  addPurchaseRequestComment,
  cancelPurchaseRequest,
  getPurchaseRequest,
  reopenReturnedPurchaseRequest,
  submitPurchaseRequest,
} from "@/server/services/purchaseRequests";

export const dynamic = "force-dynamic";

type PurchaseRequestDetailPageProps = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

async function submit(formData: FormData) {
  "use server";

  const id = String(formData.get("id"));
  try {
    await submitPurchaseRequest(id);
  } catch (error) {
    redirect(actionErrorRedirectPath(`/purchase-requests/${id}`, error));
  }
  revalidatePath(`/purchase-requests/${id}`);
}

async function reopen(formData: FormData) {
  "use server";

  const id = String(formData.get("id"));
  try {
    await reopenReturnedPurchaseRequest(id);
  } catch (error) {
    redirect(actionErrorRedirectPath(`/purchase-requests/${id}`, error));
  }
  revalidatePath(`/purchase-requests/${id}`);
}

async function cancel(formData: FormData) {
  "use server";

  const id = String(formData.get("id"));
  try {
    await cancelPurchaseRequest(formData);
  } catch (error) {
    redirect(actionErrorRedirectPath(`/purchase-requests/${id}`, error));
  }
  revalidatePath(`/purchase-requests/${id}`);
}

async function addComment(formData: FormData) {
  "use server";

  const id = String(formData.get("purchaseRequestId"));
  try {
    await addPurchaseRequestComment(formData);
  } catch (error) {
    redirect(actionErrorRedirectPath(`/purchase-requests/${id}`, error));
  }
  revalidatePath(`/purchase-requests/${id}`);
}

function getNextAction(status: string) {
  if (status === "DRAFT") {
    return "Submit for approval";
  }
  if (status === "RETURNED") {
    return "Reopen as draft";
  }
  if (status === "PENDING_APPROVAL") {
    return "Await approval";
  }
  return "No pending action";
}

export default async function PurchaseRequestDetailPage({
  params,
  searchParams,
}: PurchaseRequestDetailPageProps) {
  const session = await getSessionContext();
  if (!session) {
    redirect("/sign-in");
  }
  if (!canUsePurchaseRequests(session.permissionCodes)) {
    redirect(getDefaultAppRoute(session.permissionCodes));
  }

  const { id } = await params;
  const request = await getPurchaseRequest(session, id);
  if (!request) {
    redirect(getDefaultAppRoute(session.permissionCodes));
  }
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const actionFeedback = getActionFeedback(resolvedSearchParams);

  return (
    <AppShell
      session={session}
      title="Purchase Request"
      subtitle={`${request.publicReference} / ${session.context.locationName}`}
    >
      <ActionFeedbackBanner feedback={actionFeedback} />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <Panel className="ogfi-detail-card">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-sm font-medium text-blue-700">
                Purchase Request
              </p>
              <h2 className="text-2xl font-semibold text-slate-950">
                {request.publicReference}
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                {session.context.companyName} / {session.context.brandName} /{" "}
                {session.context.locationName}
              </p>
            </div>
            <Badge tone={request.status === "DRAFT" ? "neutral" : "warning"}>
              {request.status.replace("_", " ")}
            </Badge>
          </div>

          <dl className="mt-6 grid gap-4 ogfi-record-summary p-4 sm:grid-cols-2">
            <div>
              <dt className="text-sm font-medium text-slate-500">Requester</dt>
              <dd className="text-slate-950">{session.user.displayName}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-slate-500">
                Required date
              </dt>
              <dd className="text-slate-950">{request.requiredDate}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-slate-500">
                Current approver
              </dt>
              <dd className="text-slate-950">
                {request.currentApprovalStep
                  ? "Configured approval step"
                  : "Not submitted"}
              </dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-slate-500">
                Next action
              </dt>
              <dd className="text-slate-950">
                {getNextAction(request.status)}
              </dd>
            </div>
          </dl>

          <div className="mt-6 rounded-lg border border-slate-200">
            <div className="border-b border-slate-100 p-4">
              <h3 className="font-semibold text-slate-950">Request Lines</h3>
              <p className="mt-1 text-sm text-slate-700">
                {request.justification}
              </p>
            </div>
            <div className="divide-y divide-slate-100">
              {request.lines.map((line) => (
                <div
                  key={line.id}
                  className="grid gap-3 p-4 md:grid-cols-[3rem_1fr_8rem_1fr]"
                >
                  <p className="text-sm font-semibold text-slate-500">
                    #{line.lineNumber}
                  </p>
                  <div>
                    <p className="font-semibold text-slate-950">
                      {line.itemName ?? line.description}
                    </p>
                    {line.itemName ? (
                      <p className="mt-1 text-xs font-medium text-slate-500">
                        {line.description}
                      </p>
                    ) : null}
                  </div>
                  <p className="text-sm font-medium text-slate-700">
                    {line.requestedQty} {line.uomCode}
                  </p>
                  <p className="text-sm text-slate-600">{line.purpose}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <ButtonLink
              href="/purchase-requests"
              className="bg-slate-700 hover:bg-slate-800"
            >
              Back to list
            </ButtonLink>
            {request.status === "DRAFT" ? (
              <form action={submit}>
                <input name="id" type="hidden" value={request.id} />
                <button className="inline-flex min-h-9 w-full items-center justify-center rounded-md bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 sm:w-auto">
                  Submit for Approval
                </button>
              </form>
            ) : null}
            {request.status === "RETURNED" ? (
              <form action={reopen}>
                <input name="id" type="hidden" value={request.id} />
                <button className="inline-flex min-h-9 w-full items-center justify-center rounded-md bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 sm:w-auto">
                  Reopen as Draft
                </button>
              </form>
            ) : null}
          </div>
          {["DRAFT", "RETURNED"].includes(request.status) ? (
            <form
              action={cancel}
              className="mt-4 grid gap-2 rounded-lg border border-red-100 bg-red-50 p-4"
            >
              <input name="id" type="hidden" value={request.id} />
              <label className="grid gap-1 text-sm font-medium text-slate-700">
                Cancellation reason
                <input
                  className="rounded-md border border-red-200 bg-white px-3 py-2"
                  name="reason"
                  required
                />
              </label>
              <button className="inline-flex min-h-9 w-full items-center justify-center rounded-md bg-red-600 px-4 text-sm font-semibold text-white hover:bg-red-700 sm:w-auto">
                Cancel Purchase Request
              </button>
            </form>
          ) : null}
        </Panel>

        <div className="grid gap-4">
          <Panel className="ogfi-detail-card">
            <h2 className="text-lg font-bold text-slate-950">
              Supplier Quotes
            </h2>
            <p className="text-sm text-slate-500">
              Recorded quotations for this approved request
            </p>
            <div className="mt-4 space-y-3">
              {request.supplierQuotes.length === 0 ? (
                <p className="text-sm text-slate-500">
                  No supplier quotes recorded yet.
                </p>
              ) : (
                request.supplierQuotes.map((quote) => (
                  <div
                    key={quote.id}
                    data-testid="purchase-request-quote-row"
                    className="rounded-lg border border-slate-200 bg-slate-50 p-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-950">
                          {quote.supplierName}
                        </p>
                        <p className="text-xs text-slate-500">
                          {quote.quoteReference} / {quote.quoteDate}
                        </p>
                      </div>
                      <Badge tone="neutral">{quote.status}</Badge>
                    </div>
                    <p className="mt-2 text-sm font-semibold text-slate-800">
                      {quote.currencyCode} {quote.totalAmount.toFixed(2)}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {quote.availabilityStatus ?? "No availability"}
                      {quote.leadTimeDays != null
                        ? ` / ${quote.leadTimeDays} lead days`
                        : ""}
                    </p>
                  </div>
                ))
              )}
            </div>
          </Panel>

          <Panel className="ogfi-detail-card">
            <h2 className="text-lg font-bold text-slate-950">Comments</h2>
            <p className="text-sm text-slate-500">
              Scoped operational discussion
            </p>
            <form action={addComment} className="mt-4 grid gap-2">
              <input
                name="purchaseRequestId"
                type="hidden"
                value={request.id}
              />
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
            <div className="mt-4 space-y-3">
              {request.comments.length === 0 ? (
                <p className="text-sm text-slate-500">No comments yet.</p>
              ) : (
                request.comments.map((comment) => (
                  <div
                    key={comment.id}
                    data-testid="purchase-request-comment"
                    className="rounded-lg border border-slate-200 bg-slate-50 p-3"
                  >
                    <p className="text-sm font-semibold text-slate-950">
                      {comment.authorName}
                    </p>
                    <p className="mt-1 text-sm text-slate-700">
                      {comment.body}
                    </p>
                    <p className="mt-2 text-xs text-slate-500">
                      {comment.createdAt}
                    </p>
                  </div>
                ))
              )}
            </div>
          </Panel>

          <Panel className="ogfi-detail-card">
            <h2 className="text-lg font-bold text-slate-950">Audit History</h2>
            <p className="text-sm text-slate-500">
              Append-only activity for this request
            </p>
            <ol className="mt-4 space-y-4">
              {request.auditEvents.map((event) => (
                <li key={event.id} className="border-l-2 border-blue-200 pl-3">
                  <p className="text-sm font-medium text-slate-950">
                    {event.eventType}
                  </p>
                  <p className="text-xs text-slate-500">{event.occurredAt}</p>
                </li>
              ))}
            </ol>
          </Panel>

          <Panel className="ogfi-detail-card">
            <h2 className="text-lg font-bold text-slate-950">
              Approval Actions
            </h2>
            <p className="text-sm text-slate-500">Step decisions and remarks</p>
            <div className="mt-4 space-y-3">
              {request.approvalActions.length === 0 ? (
                <p className="text-sm text-slate-500">No approval steps yet.</p>
              ) : (
                request.approvalActions.map((action) => (
                  <div
                    key={action.id}
                    data-testid="purchase-request-approval-action"
                    className="rounded-lg border border-slate-200 bg-slate-50 p-3"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-slate-950">
                        Step {action.stepOrder}
                      </p>
                      <Badge
                        tone={
                          action.status === "APPROVED"
                            ? "success"
                            : action.status === "WAITING"
                              ? "neutral"
                              : "warning"
                        }
                      >
                        {action.status}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      {action.actedByName ?? "Not acted"}{" "}
                      {action.actedAt ? `/ ${action.actedAt}` : ""}
                    </p>
                    {action.remarks ? (
                      <p className="mt-2 text-sm text-slate-700">
                        {action.remarks}
                      </p>
                    ) : null}
                  </div>
                ))
              )}
            </div>
          </Panel>
        </div>
      </div>
    </AppShell>
  );
}
