import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Badge, ButtonLink, Panel } from "@ogfi/ui";
import { ActionFeedbackBanner } from "@/components/ActionFeedbackBanner";
import { AppShell } from "@/components/AppShell";
import {
  actionErrorRedirectPath,
  getActionFeedback
} from "@/server/services/actionFeedback";
import { getDefaultAppRoute, permissions } from "@/server/services/authorization";
import { getSessionContext } from "@/server/services/context";
import {
  createQuotationRecommendation,
  listQuoteOptions,
  listQuoteRequests,
  submitQuotationRecommendation
} from "@/server/services/quotes";
import { canExportSupplierQuotes } from "@/server/services/exportAuthorization";

export const dynamic = "force-dynamic";

async function createQuotationRecommendationAction(formData: FormData) {
  "use server";

  try {
    await createQuotationRecommendation(formData);
  } catch (error) {
    redirect(actionErrorRedirectPath("/quotes", error));
  }
  revalidatePath("/quotes");
  redirect("/quotes");
}

async function submitQuotationRecommendationAction(formData: FormData) {
  "use server";

  try {
    await submitQuotationRecommendation(formData);
  } catch (error) {
    redirect(actionErrorRedirectPath("/quotes", error));
  }
  revalidatePath("/quotes");
  redirect("/quotes");
}

type SupplierQuotesPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function SupplierQuotesPage({
  searchParams
}: SupplierQuotesPageProps) {
  const session = await getSessionContext();
  if (!session) {
    redirect("/sign-in");
  }
  if (!session.permissionCodes.includes(permissions.quoteManage)) {
    redirect(getDefaultAppRoute(session.permissionCodes));
  }
  const canExportQuotes = canExportSupplierQuotes(session);

  const [requests, options] = await Promise.all([
    listQuoteRequests(session),
    listQuoteOptions(session)
  ]);
  const quoteCount = requests.reduce((count, request) => count + request.quotes.length, 0);
  const params = searchParams ? await searchParams : {};
  const actionFeedback = getActionFeedback(params);

  return (
    <AppShell
      session={session}
      title="Supplier Quotes"
      subtitle="Approved PR quote capture"
      activeNav="quotes"
    >
      <ActionFeedbackBanner feedback={actionFeedback} />
      <div className="mb-5 ogfi-workflow-cue">
        <div className="flex flex-wrap gap-2">
          <span>Approved PR</span>
          <span>Supplier quote</span>
          <span>Recommendation</span>
          <span>PO creation</span>
        </div>
        <p className="mt-3 text-sm">
          <strong>Quotes compare supplier options before PO commitment.</strong>{" "}
          Recommendations preserve cost, availability, and justification context
          for approval review.
        </p>
      </div>
      <div className="mb-5 grid gap-4 md:grid-cols-4">
        <Panel>
          <p className="text-sm font-semibold text-slate-500">Approved PRs</p>
          <p className="mt-2 text-3xl font-bold text-slate-950">{requests.length}</p>
        </Panel>
        <Panel>
          <p className="text-sm font-semibold text-slate-500">Recorded quotes</p>
          <p className="mt-2 text-3xl font-bold text-emerald-700">{quoteCount}</p>
        </Panel>
        <Panel>
          <p className="text-sm font-semibold text-slate-500">Suppliers</p>
          <p className="mt-2 text-3xl font-bold text-slate-950">{options.suppliers.length}</p>
        </Panel>
        <Panel>
          <p className="text-sm font-semibold text-slate-500">Location</p>
          <p className="mt-2 text-lg font-bold text-slate-950">{session.context.locationName}</p>
        </Panel>
      </div>

      <div className="space-y-4">
        <div className="flex justify-end">
          <ButtonLink href="/quotes/new" className="bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700">
            Record Supplier Quote
          </ButtonLink>
        </div>

        <section className="ogfi-data-surface">
          <div className="ogfi-section-header">
            <div>
              <h2 className="text-lg font-bold text-slate-950">Approved Requests</h2>
              <p className="text-sm text-slate-500">Only requests in the selected location are shown</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="info">Quote capture</Badge>
              {canExportQuotes ? (
                <a
                  className="inline-flex min-h-8 items-center justify-center rounded-md border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 hover:bg-slate-50"
                  href="/quotes/export"
                >
                  Export CSV
                </a>
              ) : null}
            </div>
          </div>
          {requests.length === 0 ? (
            <div className="ogfi-empty-state">
              <p className="font-semibold text-slate-900">No approved requests ready for quotes</p>
              <p className="mt-1 text-sm text-slate-600">
                Approve a Purchase Request before recording supplier quotations.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {requests.map((request) => (
                <div key={request.id} data-testid="quote-request-row" className="ogfi-list-row grid gap-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                      <p className="text-xs font-bold uppercase text-slate-400">{request.publicReference}</p>
                      <h3 className="mt-1 text-lg font-bold text-slate-950">
                        {request.line.itemName ?? request.line.description}
                      </h3>
                      <p className="text-sm text-slate-600">
                        {request.lines.length} request line{request.lines.length === 1 ? "" : "s"} required by{" "}
                        {request.requiredDate}
                      </p>
                    </div>
                    <Badge tone="success">APPROVED</Badge>
                  </div>
                  <div className="grid gap-2 md:grid-cols-2">
                    {request.lines.map((line) => (
                      <div
                        key={line.id}
                        className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm"
                      >
                        <p className="font-semibold text-slate-900">
                          {line.itemName ?? line.description}
                        </p>
                        <p className="text-slate-500">
                          {line.requestedQty} {line.uomCode} / {line.purpose}
                        </p>
                      </div>
                    ))}
                  </div>
                  {request.quotes.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                      No supplier quotes recorded yet.
                    </div>
                  ) : (
                    <div className="grid gap-3">
                      {request.quotes.map((quote) => (
                        <div
                          key={quote.id}
                          data-testid="supplier-quote-row"
                          className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 md:grid-cols-[1.2fr_1fr_1fr_1fr]"
                        >
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="font-bold text-slate-950">{quote.supplierName}</p>
                              {quote.isLowestRecordedCost ? (
                                <Badge tone="success">Lowest recorded cost</Badge>
                              ) : null}
                            </div>
                            <p className="text-xs text-slate-500">{quote.quoteReference}</p>
                          </div>
                          <p className="text-sm font-semibold text-slate-800">
                            {quote.currencyCode} {quote.totalAmount.toFixed(2)}
                          </p>
                          <p className="text-sm text-slate-600">
                            {quote.lines.length} quoted line{quote.lines.length === 1 ? "" : "s"}
                          </p>
                          <div>
                            <Badge tone="neutral">{quote.status}</Badge>
                            <p className="mt-1 text-xs text-slate-500">
                              {quote.lines[0]?.availabilityStatus ?? "No availability"}
                              {quote.lines[0]?.leadTimeDays != null
                                ? ` / ${quote.lines[0].leadTimeDays} lead days`
                                : ""}
                            </p>
                          </div>
                          <div className="md:col-span-4">
                            <div className="grid gap-2 md:grid-cols-2">
                              {quote.lines.map((line) => (
                                <div
                                  key={line.id}
                                  className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600"
                                >
                                  <p className="font-semibold text-slate-900">
                                    {line.itemName}
                                  </p>
                                  <p>
                                    {line.quantity} {line.uomCode} @{" "}
                                    {line.unitPrice.toFixed(2)} ={" "}
                                    {line.lineTotal.toFixed(2)}
                                  </p>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {request.quotes.length > 0 && request.quotationRequestId ? (
                    <div className="rounded-lg border border-blue-100 bg-blue-50 p-4">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <h4 className="font-bold text-slate-950">Supplier Recommendation</h4>
                          <p className="text-sm text-slate-600">Comparison control</p>
                        </div>
                        <span data-testid="quotation-recommendation-status">
                          <Badge tone={request.recommendation ? "info" : "neutral"}>
                            {request.recommendation?.status.replace("_", " ") ?? "Not recorded"}
                          </Badge>
                        </span>
                      </div>
                      {request.recommendation ? (
                        <div
                          className="mt-3 grid gap-3 rounded-md border border-blue-100 bg-white p-3 text-sm"
                          data-testid="quotation-recommendation"
                        >
                          <div className="grid gap-3 md:grid-cols-3">
                            <div>
                              <p className="text-xs font-bold uppercase text-slate-400">Selected quote</p>
                              <p className="font-semibold text-slate-900">
                                {request.recommendation.selectedSupplierName}
                              </p>
                              <p className="text-slate-500">
                                {request.recommendation.selectedQuoteReference}
                              </p>
                            </div>
                            <div>
                              <p className="text-xs font-bold uppercase text-slate-400">Evaluated total</p>
                              <p className="font-semibold text-slate-900">
                                {request.quotes[0]?.currencyCode}{" "}
                                {request.recommendation.selectedEvaluatedTotal.toFixed(2)}
                              </p>
                              <p className="text-slate-500">
                                Lowest {request.recommendation.lowestEvaluatedTotal.toFixed(2)}
                              </p>
                            </div>
                            <div>
                              <p className="text-xs font-bold uppercase text-slate-400">Prepared by</p>
                              <p className="font-semibold text-slate-900">
                                {request.recommendation.preparedByName}
                              </p>
                              <p className="text-slate-500">
                                {new Date(request.recommendation.createdAt).toLocaleDateString()}
                              </p>
                            </div>
                          </div>
                          <p>
                            <span className="font-semibold text-slate-800">Reason: </span>
                            {request.recommendation.selectionReason}
                          </p>
                          {request.recommendation.nonLowestJustification ? (
                            <p>
                              <span className="font-semibold text-slate-800">Non-lowest: </span>
                              {request.recommendation.nonLowestJustification}
                            </p>
                          ) : null}
                          {request.recommendation.singleSourceJustification ? (
                            <p>
                              <span className="font-semibold text-slate-800">Single source: </span>
                              {request.recommendation.singleSourceJustification}
                            </p>
                          ) : null}
                          {request.recommendation.status === "DRAFT" ? (
                            <form action={submitQuotationRecommendationAction}>
                              <input
                                name="quotationRecommendationId"
                                type="hidden"
                                value={request.recommendation.id}
                              />
                              <button className="inline-flex min-h-9 items-center justify-center rounded-md bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700">
                                Submit Recommendation
                              </button>
                            </form>
                          ) : null}
                        </div>
                      ) : (
                        <form
                          action={createQuotationRecommendationAction}
                          className="mt-3 grid gap-3 rounded-md border border-blue-100 bg-white p-3"
                        >
                          <input
                            name="quotationRequestId"
                            type="hidden"
                            value={request.quotationRequestId}
                          />
                          <label className="grid gap-1 text-sm font-medium text-slate-700">
                            Selected supplier quote
                            <select
                              className="rounded-md border border-slate-300 px-3 py-2"
                              name="selectedSupplierQuotationId"
                              required
                            >
                              {request.quotes.map((quote) => (
                                <option key={quote.id} value={quote.id}>
                                  {quote.supplierName} / {quote.quoteReference} /{" "}
                                  {quote.currencyCode} {quote.totalAmount.toFixed(2)}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="grid gap-1 text-sm font-medium text-slate-700">
                            Selection reason
                            <input
                              className="rounded-md border border-slate-300 px-3 py-2"
                              name="selectionReason"
                              required
                            />
                          </label>
                          <label className="grid gap-1 text-sm font-medium text-slate-700">
                            Non-lowest justification
                            <input
                              className="rounded-md border border-slate-300 px-3 py-2"
                              name="nonLowestJustification"
                            />
                          </label>
                          <label className="grid gap-1 text-sm font-medium text-slate-700">
                            Single-source justification
                            <input
                              className="rounded-md border border-slate-300 px-3 py-2"
                              name="singleSourceJustification"
                            />
                          </label>
                          <button className="inline-flex min-h-9 items-center justify-center rounded-md bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700">
                            Record Recommendation
                          </button>
                        </form>
                      )}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </section>

      </div>
    </AppShell>
  );
}
