import Link from "next/link";
import { Badge, PaginationBar } from "@ogfi/ui";
import type { listQuoteRequests } from "@/server/services/quotes";

type QuoteRequest = Awaited<ReturnType<typeof listQuoteRequests>>[number];
type Action = (formData: FormData) => void | Promise<void>;

type Props = {
  requests: QuoteRequest[];
  selectedRequestId?: string | undefined;
  page: number;
  pageSize: number;
  totalItems: number;
  createRecommendationAction: Action;
  submitRecommendationAction: Action;
};

export function QuoteComparisonWorkspace({
  requests,
  selectedRequestId,
  page,
  pageSize,
  totalItems,
  createRecommendationAction,
  submitRecommendationAction
}: Props) {
  const selected = requests.find((request) => request.id === selectedRequestId) ?? requests[0];
  const selectedHref = (id: string, nextPage = page) => `/quotes?page=${nextPage}&requestId=${id}`;

  return (
    <section className="ogfi-data-surface overflow-hidden" data-testid="quote-comparison-workspace">
      <div className="ogfi-section-header">
        <div>
          <h2 className="text-lg font-bold text-slate-950">Quote comparison workspace</h2>
          <p className="text-sm text-slate-500">Select one approved request, compare its supplier options, then prepare one controlled recommendation.</p>
        </div>
        <Badge tone="info">Server-paginated queue</Badge>
      </div>
      {requests.length === 0 ? (
        <div className="ogfi-empty-state">
          <p className="font-semibold text-slate-900">No approved requests ready for quotes</p>
          <p className="mt-1 text-sm text-slate-600">Approve a Purchase Request before recording supplier quotations.</p>
        </div>
      ) : (
        <div className="grid min-h-[34rem] lg:grid-cols-[minmax(16rem,0.7fr)_minmax(0,1.3fr)]">
          <aside className="border-b border-slate-200 lg:border-b-0 lg:border-r" aria-label="Approved request queue">
            <div className="border-b border-slate-200 px-4 py-3">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Approved requests</p>
              <p className="mt-1 text-sm text-slate-600">{totalItems} in this selected location</p>
            </div>
            <div className="max-h-80 divide-y divide-slate-100 overflow-y-auto lg:max-h-[38rem]">
              {requests.map((request) => {
                const active = selected?.id === request.id;
                return (
                  <Link
                    key={request.id}
                    href={selectedHref(request.id)}
                    data-testid="quote-request-row"
                    className={`block min-h-16 px-4 py-3 ${active ? "bg-blue-50" : "hover:bg-slate-50"}`}
                    aria-current={active ? "true" : undefined}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-xs font-bold uppercase text-slate-500">{request.publicReference}</p>
                      <Badge tone="success">APPROVED</Badge>
                    </div>
                    <p className="mt-1 truncate text-sm font-bold text-slate-950">{request.line.itemName ?? request.line.description}</p>
                    <p className="mt-1 text-xs text-slate-500">{request.quotes.length} quote{request.quotes.length === 1 ? "" : "s"} · due {request.requiredDate}</p>
                  </Link>
                );
              })}
            </div>
          </aside>

          {selected ? (
            <div className="min-w-0 p-4 sm:p-5">
              <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{selected.publicReference}</p>
                  <h3 className="mt-1 text-xl font-bold text-slate-950">{selected.line.itemName ?? selected.line.description}</h3>
                  <p className="mt-1 text-sm text-slate-600">Requester: {selected.requesterName} · Required by {selected.requiredDate}</p>
                </div>
                <Badge tone="neutral">Selected location context</Badge>
              </div>

              <div className="mt-4 grid gap-4">
                <section>
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <h4 className="text-sm font-bold text-slate-950">Requested lines</h4>
                    <Badge tone="neutral">{selected.lines.length} line{selected.lines.length === 1 ? "" : "s"}</Badge>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {selected.lines.map((line) => (
                      <div key={line.id} className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                        <p className="font-semibold text-slate-900">{line.itemName ?? line.description}</p>
                        <p className="text-slate-500">{line.requestedQty} {line.uomCode} · {line.purpose}</p>
                      </div>
                    ))}
                  </div>
                </section>

                <section>
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <h4 className="text-sm font-bold text-slate-950">Supplier comparison</h4>
                    <span className="text-xs text-slate-500">Recorded totals only; no PO commitment</span>
                  </div>
                  {selected.quotes.length === 0 ? (
                    <div className="rounded-md border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">No supplier quotes recorded yet. Use Record Supplier Quote to add one.</div>
                  ) : (
                    <div className="grid gap-3">
                      {selected.quotes.map((quote) => (
                        <article key={quote.id} data-testid="supplier-quote-row" className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                            <div>
                              <div className="flex flex-wrap items-center gap-2">
                                <h5 className="font-bold text-slate-950">{quote.supplierName}</h5>
                                {quote.isLowestRecordedCost ? <Badge tone="success">Lowest recorded cost</Badge> : null}
                              </div>
                              <p className="text-xs text-slate-500">{quote.quoteReference} · quoted {quote.quoteDate}{quote.validityDate ? ` · valid until ${quote.validityDate}` : ""}</p>
                            </div>
                            <div className="text-left sm:text-right">
                              <p className="text-lg font-bold text-slate-950">{quote.currencyCode} {quote.totalAmount.toFixed(2)}</p>
                              <Badge tone="neutral">{quote.status}</Badge>
                            </div>
                          </div>
                          <div className="mt-3 grid gap-2 sm:grid-cols-2">
                            {quote.lines.map((line) => (
                              <div key={line.id} className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                                <p className="font-semibold text-slate-900">{line.itemName}</p>
                                <p>{line.quantity} {line.uomCode} @ {line.unitPrice.toFixed(2)} = {line.lineTotal.toFixed(2)}</p>
                                <p>{line.availabilityStatus}{line.leadTimeDays != null ? ` · ${line.leadTimeDays} lead days` : ""}</p>
                                {line.notes ? <p className="mt-1">Note: {line.notes}</p> : null}
                              </div>
                            ))}
                          </div>
                          <div className="mt-3 grid gap-1 text-xs text-slate-500 sm:grid-cols-2">
                            <p>Supplier accreditation: <span className="font-semibold text-slate-700">{quote.supplierAccreditationStatus.replaceAll("_", " ")}</span></p>
                            <p>Payment terms: <span className="font-semibold text-slate-700">{quote.terms ?? quote.supplierPaymentTerms ?? "Not recorded"}</span></p>
                            <p className="sm:col-span-2">Tax/discount/freight breakdown and attachments are not captured in this quote record yet.</p>
                          </div>
                        </article>
                      ))}
                    </div>
                  )}
                </section>

                {selected.quotes.length > 0 && selected.quotationRequestId ? (
                  <section className="rounded-lg border border-blue-100 bg-blue-50 p-4" data-testid="quotation-recommendation-composer">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <h4 className="font-bold text-slate-950">Recommendation and approval</h4>
                        <p className="text-sm text-slate-600">Selecting a quote does not issue a Purchase Order. Submission starts the configured approval route.</p>
                      </div>
                      <Badge tone={selected.recommendation ? "info" : "neutral"}>{selected.recommendation?.status.replace("_", " ") ?? "Not recorded"}</Badge>
                    </div>
                    {selected.recommendation ? (
                      <div className="mt-3 grid gap-3 rounded-md border border-blue-100 bg-white p-3 text-sm" data-testid="quotation-recommendation">
                        <div className="grid gap-3 sm:grid-cols-3">
                          <div><p className="text-xs font-bold uppercase text-slate-400">Selected quote</p><p className="font-semibold text-slate-900">{selected.recommendation.selectedSupplierName}</p><p className="text-slate-500">{selected.recommendation.selectedQuoteReference}</p></div>
                          <div><p className="text-xs font-bold uppercase text-slate-400">Evaluated total</p><p className="font-semibold text-slate-900">{selected.quotes[0]?.currencyCode} {selected.recommendation.selectedEvaluatedTotal.toFixed(2)}</p><p className="text-slate-500">Lowest {selected.recommendation.lowestEvaluatedTotal.toFixed(2)}</p></div>
                          <div><p className="text-xs font-bold uppercase text-slate-400">Prepared by</p><p className="font-semibold text-slate-900">{selected.recommendation.preparedByName}</p><p className="text-slate-500">{selected.recommendation.createdAt.slice(0, 10)}</p></div>
                        </div>
                        <p><span className="font-semibold text-slate-800">Reason: </span>{selected.recommendation.selectionReason}</p>
                        {selected.recommendation.nonLowestJustification ? <p><span className="font-semibold text-slate-800">Non-lowest: </span>{selected.recommendation.nonLowestJustification}</p> : null}
                        {selected.recommendation.singleSourceJustification ? <p><span className="font-semibold text-slate-800">Single source: </span>{selected.recommendation.singleSourceJustification}</p> : null}
                        {selected.recommendation.status === "DRAFT" ? <form action={submitRecommendationAction}><input name="quotationRecommendationId" type="hidden" value={selected.recommendation.id} /><button className="inline-flex min-h-11 items-center justify-center rounded-md bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700">Submit Recommendation</button></form> : null}
                      </div>
                    ) : (
                      <form action={createRecommendationAction} className="mt-3 grid gap-3 rounded-md border border-blue-100 bg-white p-3">
                        <input name="quotationRequestId" type="hidden" value={selected.quotationRequestId} />
                        <label className="grid gap-1 text-sm font-medium text-slate-700">Selected supplier quote<select className="min-h-11 rounded-md border border-slate-300 px-3 py-2" name="selectedSupplierQuotationId" required>{selected.quotes.map((quote) => <option key={quote.id} value={quote.id}>{quote.supplierName} / {quote.quoteReference} / {quote.currencyCode} {quote.totalAmount.toFixed(2)}</option>)}</select></label>
                        <label className="grid gap-1 text-sm font-medium text-slate-700">Selection reason<input className="min-h-11 rounded-md border border-slate-300 px-3 py-2" name="selectionReason" required /></label>
                        <div className="grid gap-3 sm:grid-cols-2"><label className="grid gap-1 text-sm font-medium text-slate-700">Non-lowest justification<input className="min-h-11 rounded-md border border-slate-300 px-3 py-2" name="nonLowestJustification" /></label><label className="grid gap-1 text-sm font-medium text-slate-700">Single-source justification<input className="min-h-11 rounded-md border border-slate-300 px-3 py-2" name="singleSourceJustification" /></label></div>
                        <button className="inline-flex min-h-11 items-center justify-center rounded-md bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700">Record Recommendation</button>
                      </form>
                    )}
                  </section>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      )}
      {totalItems > 0 ? <PaginationBar page={page} pageSize={pageSize} totalItems={totalItems} itemLabel="approved requests" getPageHref={(nextPage) => `/quotes?page=${nextPage}${selected ? `&requestId=${selected.id}` : ""}`} /> : null}
    </section>
  );
}
