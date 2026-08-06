import { Badge, ButtonLink, Panel } from "@ogfi/ui";
import {
  ApprovalDecisionComposer,
  type ApprovalDecisionAction,
  type ApprovalDecisionPresentation,
} from "./ApprovalDecisionComposer";
import type { BoundedApprovalReview } from "@/server/services/boundedApprovalReview";

type Props = {
  review: BoundedApprovalReview;
  decisionPresentation: ApprovalDecisionPresentation;
  action: ApprovalDecisionAction;
};

function displayValue(value: string | null | undefined) {
  return value?.trim() || "Not recorded";
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "Not recorded";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Manila",
  }).format(parsed);
}

function formatMoney(raw: string, currencyCode: string) {
  return `${currencyCode} ${raw}`;
}

function formatBytes(sizeBytes: number) {
  if (sizeBytes < 1024) return `${sizeBytes} B`;
  if (sizeBytes < 1024 * 1024) return `${(sizeBytes / 1024).toFixed(1)} KB`;
  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-slate-200 bg-white p-3">
      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </dt>
      <dd className="mt-1 break-words text-sm font-medium text-slate-900">{value}</dd>
    </div>
  );
}

export function BoundedApprovalReviewPanel({
  review,
  decisionPresentation,
  action,
}: Props) {
  const presentation = review.presentation;
  const procurement = "heading" in presentation;
  const title = procurement ? presentation.heading : presentation.title;
  const company = procurement
    ? `${presentation.scope.company.name} / ${presentation.scope.company.code}`
    : `${presentation.scope.companyName} / ${presentation.scope.companyCode}`;
  const brand = procurement
    ? presentation.scope.brand
      ? `${presentation.scope.brand.name} / ${presentation.scope.brand.code}`
      : "Company-level"
    : presentation.scope.brandName ?? "Company-level";
  const location = procurement
    ? `${presentation.scope.location.name} / ${presentation.scope.location.code}`
    : presentation.scope.locationName ??
      presentation.scope.sourceEndpoint?.name ??
      "Company-level";
  const owner = procurement
    ? `${presentation.owner.displayName} / ${presentation.owner.roleLabel}`
    : presentation.ownerName;
  const stepOrder = procurement
    ? presentation.approval.stepOrder
    : presentation.currentStepOrder;
  const activatedAt = "reviewDigest" in review
    ? review.canonicalSnapshot.approval.activatedAt
    : review.canonicalSnapshot.approvalStep.activatedAt;
  const dueAt = procurement ? presentation.approval.dueAt : presentation.dueAt;
  const riskFlags = procurement ? presentation.riskFlags : presentation.risks;
  const approvalInstanceId = "reviewDigest" in review
    ? review.canonicalSnapshot.approval.approvalInstanceId
    : review.canonicalSnapshot.approvalStep.approvalInstanceId;
  const inventoryCurrency =
    review.family === "WastageReport" || review.family === "StockAdjustment"
      ? review.canonicalSnapshot.currencyCode
      : null;
  const currentApprover = review.routing.assignedUserName
    ? review.routing.assignedUserName
    : review.routing.assignedRoleName
      ? `${review.routing.assignedRoleName} role`
      : "Any currently eligible scoped approver";
  const recordDates = procurement
    ? presentation.dates
    : [
        { label: "Created", value: presentation.createdAt },
        { label: "Submitted", value: presentation.submittedAt },
        { label: "Required / cutoff", value: presentation.requiredAt },
        {
          label: "Source updated",
          value:
            "reviewDigest" in review
              ? review.canonicalSnapshot.source.updatedAt
              : review.canonicalSnapshot.updatedAt,
        },
      ];

  return (
    <>
      <div
        className="mb-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950"
        role="status"
      >
        <p className="font-bold">Inventory Control UAT — seven eligible families only</p>
        <p className="mt-1">
          Review the complete current source snapshot below. The decision expires after
          15 minutes or immediately when the source, route, scope, or assignment changes.
        </p>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <Panel className="ogfi-detail-card min-w-0">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-blue-700">{title}</p>
              <h2 className="break-words text-2xl font-semibold text-slate-950">
                {presentation.publicReference}
              </h2>
              <p className="mt-1 text-sm text-slate-600">Owner {owner}</p>
            </div>
            <Badge tone="warning">{presentation.status.replaceAll("_", " ")}</Badge>
          </div>

          <dl className="ogfi-record-summary mt-6 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
            <Fact label="Company" value={company} />
            <Fact label="Brand" value={brand} />
            <Fact label="Location" value={location} />
            {procurement && presentation.scope.department ? (
              <Fact
                label="Department"
                value={`${presentation.scope.department.name} / ${presentation.scope.department.code}`}
              />
            ) : null}
            {procurement && presentation.scope.costCenter ? (
              <Fact
                label="Cost center"
                value={`${presentation.scope.costCenter.name} / ${presentation.scope.costCenter.code}`}
              />
            ) : null}
            {!procurement && presentation.scope.sourceEndpoint ? (
              <Fact
                label="Source location"
                value={`${presentation.scope.sourceEndpoint.name} / ${presentation.scope.sourceEndpoint.code}`}
              />
            ) : null}
            {!procurement && presentation.scope.destinationEndpoint ? (
              <Fact
                label="Destination location"
                value={`${presentation.scope.destinationEndpoint.name} / ${presentation.scope.destinationEndpoint.code}`}
              />
            ) : null}
            <Fact label="Current step" value={`Step ${stepOrder}`} />
            <Fact label="Current approver" value={currentApprover} />
            <Fact label="Required permission" value={review.routing.requiredPermissionCode} />
            <Fact label="Step activated" value={formatDateTime(activatedAt)} />
            <Fact label="Approval due" value={formatDateTime(dueAt)} />
          </dl>

          <section className="mt-6" aria-labelledby="source-timing-and-value">
            <h3 className="text-lg font-bold text-slate-950" id="source-timing-and-value">
              Source timing and value
            </h3>
            <dl className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {recordDates.map((entry) => (
                <Fact
                  key={`${entry.label}:${entry.value ?? "none"}`}
                  label={entry.label}
                  value={formatDateTime(entry.value)}
                />
              ))}
              {procurement
                ? presentation.amounts.map((amount) => (
                    <Fact
                      key={`${amount.label}:${amount.raw}`}
                      label={amount.label}
                      value={formatMoney(amount.raw, amount.currencyCode)}
                    />
                  ))
                : null}
              {review.family === "PurchaseOrder" ? (
                <>
                  <Fact
                    label="Subtotal"
                    value={formatMoney(
                      review.canonicalSnapshot.source.subtotalAmount,
                      review.canonicalSnapshot.source.currencyCode,
                    )}
                  />
                  <Fact
                    label="Tax"
                    value={formatMoney(
                      review.canonicalSnapshot.source.taxAmount,
                      review.canonicalSnapshot.source.currencyCode,
                    )}
                  />
                  <Fact
                    label="Discount"
                    value={formatMoney(
                      review.canonicalSnapshot.source.discountAmount,
                      review.canonicalSnapshot.source.currencyCode,
                    )}
                  />
                </>
              ) : null}
            </dl>
          </section>

          {riskFlags.length > 0 ? (
            <div className="mt-4 flex flex-wrap gap-2" aria-label="Policy and risk flags">
              {riskFlags.map((flag) => (
                <Badge key={flag} tone="warning">
                  {flag.replaceAll("_", " ")}
                </Badge>
              ))}
            </div>
          ) : null}

          <section className="mt-6" aria-labelledby="approval-rationale">
            <h3 className="text-lg font-bold text-slate-950" id="approval-rationale">
              Decision rationale
            </h3>
            <dl className="mt-3 grid gap-3 sm:grid-cols-2">
              {procurement
                ? presentation.rationale.map((fact) => (
                    <Fact key={`${fact.label}:${fact.value}`} label={fact.label} value={fact.value} />
                  ))
                : presentation.rationale.map((value, index) => (
                    <Fact key={`${index}:${value}`} label={`Review fact ${index + 1}`} value={value} />
                  ))}
            </dl>
          </section>

          {review.family === "StockCountAttemptReview" ? (
            <section className="mt-6" aria-labelledby="stock-count-control-context">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-lg font-bold text-slate-950" id="stock-count-control-context">
                  Stock-count control context
                </h3>
                <Badge tone="info">Attempt {review.canonicalSnapshot.attemptNumber}</Badge>
              </div>
              <dl className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <Fact label="Count type" value={review.canonicalSnapshot.countType} />
                <Fact label="Scope type" value={review.canonicalSnapshot.scopeType} />
                <Fact
                  label="Assigned counter"
                  value={review.canonicalSnapshot.assignedToName ?? "No named counter"}
                />
                <Fact label="Blind count" value={review.canonicalSnapshot.blindCount ? "Yes" : "No"} />
                <Fact
                  label="Movements frozen"
                  value={review.canonicalSnapshot.freezeMovements ? "Yes" : "No"}
                />
                <Fact
                  label="Attempt / session revision"
                  value={`${review.canonicalSnapshot.attemptVersion} / ${review.canonicalSnapshot.sessionVersion}`}
                />
                <Fact label="Cutoff" value={formatDateTime(review.canonicalSnapshot.cutoffAt)} />
                <Fact label="Scheduled" value={formatDateTime(review.canonicalSnapshot.scheduledDate)} />
                <Fact label="Started" value={formatDateTime(review.canonicalSnapshot.startedAt)} />
                <Fact label="Submitted" value={formatDateTime(review.canonicalSnapshot.submittedAt)} />
                <Fact label="Updated" value={formatDateTime(review.canonicalSnapshot.updatedAt)} />
              </dl>
              {review.canonicalSnapshot.recountTransitions.length > 0 ? (
                <div className="mt-4 space-y-3">
                  <h4 className="font-semibold text-slate-950">Recount lineage</h4>
                  {review.canonicalSnapshot.recountTransitions.map((transition) => (
                    <article className="rounded-lg border border-slate-200 bg-slate-50 p-3" key={transition.id}>
                      <p className="font-semibold text-slate-950">
                        Successor attempt {transition.successorAttemptId}
                      </p>
                      <p className="mt-1 text-sm text-slate-700">{transition.reason}</p>
                      <p className="mt-1 break-words text-sm text-slate-600">
                        Adjustment: {transition.adjustmentDisposition} / Cutoff: {transition.cutoffDisposition}
                        {transition.linkedStockAdjustmentId
                          ? ` / Linked adjustment ${transition.linkedStockAdjustmentId}`
                          : ""}
                        {` / ${formatDateTime(transition.occurredAt)}`}
                      </p>
                      <p className="mt-1 break-words text-sm text-slate-600">
                        Evidence: {transition.evidenceReference}
                      </p>
                    </article>
                  ))}
                </div>
              ) : (
                <p className="mt-4 text-sm text-slate-600">No recount successor is recorded for this attempt.</p>
              )}
            </section>
          ) : null}

          <section className="mt-6" aria-labelledby="approval-lines">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-lg font-bold text-slate-950" id="approval-lines">
                Material lines
              </h3>
              <Badge tone="info">
                {procurement ? presentation.lines.length : presentation.materialLines.length} lines
              </Badge>
            </div>
            <div className="mt-3 space-y-3">
              {procurement
                ? presentation.lines.map((line) => (
                    <article className="rounded-xl border border-slate-200 p-4" key={line.id}>
                      <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                        <h4 className="min-w-0 break-words font-semibold text-slate-950">
                          {line.lineNumber ?? "—"}. {line.itemCode ? `${line.itemCode} / ` : ""}
                          {line.itemName ?? line.description}
                        </h4>
                        <span className="shrink-0 font-semibold text-slate-900">
                          {line.quantity.raw} {line.quantity.uomCode}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-slate-600">{line.description}</p>
                      <dl className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                        <Fact
                          label="Unit amount"
                          value={
                            line.unitAmount
                              ? formatMoney(line.unitAmount.raw, line.unitAmount.currencyCode)
                              : "Not recorded"
                          }
                        />
                        <Fact
                          label="Line total"
                          value={
                            line.lineAmount
                              ? formatMoney(line.lineAmount.raw, line.lineAmount.currencyCode)
                              : "Not recorded"
                          }
                        />
                        <Fact label="Availability" value={displayValue(line.availabilityStatus)} />
                        <Fact
                          label="Lead time"
                          value={line.leadTimeDays === null ? "Not recorded" : `${line.leadTimeDays} days`}
                        />
                      </dl>
                      {line.purpose || line.notes ? (
                        <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">
                          {[line.purpose, line.notes].filter(Boolean).join(" / ")}
                        </p>
                      ) : null}
                    </article>
                  ))
                : presentation.materialLines.map((line) => {
                    const countLine =
                      review.family === "StockCountAttemptReview"
                        ? review.canonicalSnapshot.lines.find(
                            (candidate) => candidate.lineNumber === line.lineNumber,
                          )
                        : null;
                    return (
                      <article
                        className="rounded-xl border border-slate-200 p-4"
                        key={`${line.lineNumber}:${line.itemCode}`}
                      >
                        <h4 className="break-words font-semibold text-slate-950">
                          {line.lineNumber}. {line.itemCode} / {line.itemName}
                        </h4>
                        <p className="mt-1 text-sm text-slate-600">{line.description}</p>
                        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-800">
                          {line.quantities.map((quantity) => (
                            <span key={`${quantity.label}:${quantity.value}`}>
                              {quantity.label}: <strong>{quantity.value} {quantity.uomCode}</strong>
                            </span>
                          ))}
                        </div>
                        {line.unitCost || line.totalCost ? (
                          <div className="mt-3 grid gap-2 sm:grid-cols-2">
                            <Fact
                              label="Unit cost"
                              value={
                                line.unitCost
                                  ? inventoryCurrency
                                    ? formatMoney(line.unitCost, inventoryCurrency)
                                    : line.unitCost
                                  : "Not recorded"
                              }
                            />
                            <Fact
                              label="Estimated total"
                              value={
                                line.totalCost
                                  ? inventoryCurrency
                                    ? formatMoney(line.totalCost, inventoryCurrency)
                                    : line.totalCost
                                  : "Not recorded"
                              }
                            />
                          </div>
                        ) : null}
                        <p className="mt-2 break-words text-sm text-slate-700">
                          {[line.reasonCode, line.evidenceReference, line.lotNumber, line.expiryDate, line.notes]
                            .filter(Boolean)
                            .join(" / ") || "No additional line note"}
                        </p>
                        {countLine ? (
                          <p className="mt-2 text-sm text-slate-700">
                            Counted by {countLine.countedByName ?? "Not recorded"} / {formatDateTime(countLine.countedAt)}
                          </p>
                        ) : null}
                      </article>
                    );
                  })}
            </div>
          </section>

          {procurement && presentation.quoteComparisons.length > 0 ? (
            <section className="mt-6" aria-labelledby="quote-comparison">
              <h3 className="text-lg font-bold text-slate-950" id="quote-comparison">
                Complete quotation comparison
              </h3>
              <p className="mt-1 text-sm text-slate-600">
                Quantities remain in each supplier line&apos;s quoted UOM. Mixed UOMs are not combined.
              </p>
              <div className="mt-3 space-y-3">
                {presentation.quoteComparisons.map((quote) => (
                  <details className="rounded-xl border border-slate-200 p-4" key={quote.quoteId} open={quote.selected}>
                    <summary className="cursor-pointer list-none">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                          <h4 className="break-words font-semibold text-slate-950">
                            {quote.supplierName} / {quote.quoteReference}
                          </h4>
                          <p className="text-sm text-slate-600">
                            {formatMoney(quote.totalAmount, quote.currencyCode)} / {quote.lines.length} lines
                          </p>
                        </div>
                        {quote.selected ? <Badge tone="success">Selected</Badge> : <Badge tone="neutral">Compared</Badge>}
                      </div>
                    </summary>
                    <dl className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                      <Fact label="Quote date" value={formatDateTime(quote.quoteDate)} />
                      <Fact label="Valid until" value={formatDateTime(quote.validityDate)} />
                      <Fact label="Accreditation" value={quote.supplierAccreditationStatus} />
                      <Fact label="Quote status" value={quote.status} />
                      <Fact label="Subtotal" value={formatMoney(quote.subtotalAmount, quote.currencyCode)} />
                      <Fact label="Tax" value={formatMoney(quote.taxAmount, quote.currencyCode)} />
                      <Fact label="Discount" value={formatMoney(quote.discountAmount, quote.currencyCode)} />
                      <Fact label="Freight" value={formatMoney(quote.freightAmount, quote.currencyCode)} />
                      <Fact label="Other charges" value={formatMoney(quote.otherChargesAmount, quote.currencyCode)} />
                      <Fact label="Total" value={formatMoney(quote.totalAmount, quote.currencyCode)} />
                      <Fact label="Commercial terms" value={displayValue(quote.terms)} />
                      <Fact label="Evidence" value={`${quote.evidence.length} controlled reference(s)`} />
                    </dl>
                    {quote.evidence.length > 0 ? (
                      <div className="mt-4">
                        <h5 className="text-sm font-semibold text-slate-950">Quotation evidence</h5>
                        <ul className="mt-2 grid gap-2 sm:grid-cols-2">
                          {quote.evidence.map((evidence) => (
                            <li
                              className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm"
                              key={evidence.id}
                            >
                              <p className="break-words font-semibold text-slate-950">
                                {evidence.originalFilename}
                              </p>
                              <p className="mt-1 break-words text-slate-700">
                                {evidence.caption ?? evidence.purpose}
                              </p>
                              <p className="mt-1 text-xs text-slate-600">
                                Scan {evidence.scanState} / {evidence.availabilityState} / {formatBytes(evidence.sizeBytes)}
                              </p>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                    <div className="mt-4 overflow-x-auto">
                      <table className="w-full min-w-[44rem] border-separate border-spacing-0 text-left text-sm">
                        <thead>
                          <tr className="text-slate-600">
                            <th className="border-b border-slate-200 px-2 py-2">Line / item</th>
                            <th className="border-b border-slate-200 px-2 py-2">Quantity and UOM</th>
                            <th className="border-b border-slate-200 px-2 py-2">Unit price</th>
                            <th className="border-b border-slate-200 px-2 py-2">Line total</th>
                            <th className="border-b border-slate-200 px-2 py-2">Availability / lead</th>
                          </tr>
                        </thead>
                        <tbody>
                          {quote.lines.map((line) => (
                            <tr key={line.id}>
                              <td className="border-b border-slate-100 px-2 py-2">
                                {line.lineNumber ?? "—"}. {line.itemCode ? `${line.itemCode} / ` : ""}
                                {line.itemName ?? line.description}
                              </td>
                              <td className="border-b border-slate-100 px-2 py-2 font-semibold">
                                {line.quantity.raw} {line.quantity.uomCode}
                              </td>
                              <td className="border-b border-slate-100 px-2 py-2">
                                {line.unitAmount
                                  ? formatMoney(line.unitAmount.raw, line.unitAmount.currencyCode)
                                  : "Not recorded"}
                              </td>
                              <td className="border-b border-slate-100 px-2 py-2">
                                {line.lineAmount
                                  ? formatMoney(line.lineAmount.raw, line.lineAmount.currencyCode)
                                  : "Not recorded"}
                              </td>
                              <td className="border-b border-slate-100 px-2 py-2">
                                {displayValue(line.availabilityStatus)} / {line.leadTimeDays === null ? "No lead time" : `${line.leadTimeDays} days`}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </details>
                ))}
              </div>
            </section>
          ) : null}

          <section className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4" aria-labelledby="review-evidence">
            <h3 className="font-bold text-slate-950" id="review-evidence">
              Evidence and authoritative source
            </h3>
            {procurement ? (
              presentation.evidence.length > 0 ? (
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  {presentation.evidence.map((evidence) => (
                    <article className="rounded-lg border border-slate-200 bg-white p-3" key={evidence.id}>
                      <p className="break-words font-semibold text-slate-950">{evidence.originalFilename}</p>
                      <p className="mt-1 break-words text-sm text-slate-700">
                        {evidence.caption ?? evidence.purpose}
                      </p>
                      <p className="mt-2 text-xs text-slate-600">
                        {evidence.mimeType} / {formatBytes(evidence.sizeBytes)} / Upload {evidence.uploadState} / Scan {evidence.scanState} / {evidence.availabilityState}
                      </p>
                      <p className="mt-1 text-xs text-slate-600">
                        Required for: {evidence.requiredForAction ?? "No specific action"} / Added {formatDateTime(evidence.createdAt)}
                      </p>
                    </article>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-sm text-slate-700">No controlled evidence reference is attached to this review.</p>
              )
            ) : presentation.evidence.length > 0 ? (
              <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-700">
                {presentation.evidence.map((evidence) => (
                  <li className="break-words" key={evidence}>{evidence}</li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-slate-700">No evidence reference recorded.</p>
            )}
            <p className="mt-3 text-sm text-slate-600">
              Source activity and audit history remain authoritative in the source record. This bounded worklist does not create a second approval or inventory ledger.
            </p>
            <ButtonLink className="mt-3 bg-white text-blue-700" href={review.sourceHref}>
              Open source record and activity
            </ButtonLink>
          </section>
        </Panel>

        <aside className="self-start xl:sticky xl:top-4">
          <Panel className="ogfi-detail-card">
            <h2 className="text-lg font-bold text-slate-950">Review decision</h2>
            <p className="mt-1 text-sm text-slate-600">
              Authority, current MFA, source revision, and the reviewed line digest are rechecked inside the controlled decision transaction.
            </p>
            {review.family === "StockCountAttemptReview" ? (
              <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-950">
                <p className="font-bold">Approve-only stock-count policy</p>
                <p className="mt-1">
                  This review step supports approval only. If the count is not acceptable, do not approve it; use the authoritative stock-count recovery or recount workflow from the source record.
                </p>
              </div>
            ) : null}
            <ApprovalDecisionComposer
              action={action}
              approvalInstanceId={approvalInstanceId}
              presentation={decisionPresentation}
              reloadCurrentReviewHref={`/approvals/${encodeURIComponent(approvalInstanceId)}`}
              reviewToken={review.reviewToken}
            />
            <ButtonLink className="mt-4 bg-slate-100 text-blue-700" href="/approvals">
              Back to inbox
            </ButtonLink>
          </Panel>
        </aside>
      </div>
    </>
  );
}
