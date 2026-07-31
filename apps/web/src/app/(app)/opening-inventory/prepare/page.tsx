import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Badge, ButtonLink, PaginationBar } from "@ogfi/ui";
import { ActionFeedbackBanner } from "@/components/ActionFeedbackBanner";
import { AppShell } from "@/components/AppShell";
import { ControlledEvidencePanel } from "@/components/evidence/ControlledEvidencePanel";
import { OpeningInventoryPreparationForm } from "@/components/opening-inventory/OpeningInventoryPreparationForm";
import { OpeningInventoryDraftClearer } from "@/components/opening-inventory/OpeningInventoryDraftClearer";
import { actionErrorRedirectPath, getActionFeedback } from "@/server/services/actionFeedback";
import { getDefaultAppRoute, permissions } from "@/server/services/authorization";
import { getSessionContext } from "@/server/services/context";
import { getOpeningInventoryFormOptions, getOpeningInventoryPreparationFormOptions, prepareOpeningInventoryCutover } from "@/server/services/openingInventoryCutovers";
import { randomUUID } from "node:crypto";

export const dynamic = "force-dynamic";
type Props = { searchParams?: Promise<Record<string, string | string[] | undefined>> };
const value = (input: string | string[] | undefined) => Array.isArray(input) ? input[0] ?? "" : input ?? "";
const formatDate = (input: Date | string | null | undefined) => input ? new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium", timeStyle: "short" }).format(new Date(input)) : "Not recorded";

async function prepareAction(formData: FormData) {
  "use server";
  const cohortId = String(formData.get("cohortId") ?? ""); const attemptId = String(formData.get("stockCountAttemptId") ?? "");
  try { await prepareOpeningInventoryCutover({ cohortId, stockCountAttemptId: attemptId, idempotencyKey: randomUUID(), controlledEvidenceAttachmentIds: formData.getAll("evidenceAttachmentId").map(String), evidenceNote: String(formData.get("evidenceNote") ?? ""), valuationLines: formData.getAll("itemId").map((itemId, index) => ({ itemId: String(itemId), lotKey: String(formData.getAll("lotKey")[index] ?? ""), unitCost: String(formData.getAll("unitCost")[index] ?? "") })) }); }
  catch (error) { redirect(actionErrorRedirectPath(`/opening-inventory/prepare?cohort=${encodeURIComponent(cohortId)}&attempt=${encodeURIComponent(attemptId)}`, error)); }
  revalidatePath("/opening-inventory"); redirect(`/opening-inventory/prepare?cohort=${encodeURIComponent(cohortId)}&prepared=1&preparedAttempt=${encodeURIComponent(attemptId)}`);
}

export default async function OpeningInventoryPreparationPage({ searchParams }: Props) {
  const session = await getSessionContext(); if (!session) redirect("/sign-in");
  if (!session.permissionCodes.includes(permissions.openingInventoryPrepare)) redirect(getDefaultAppRoute(session.permissionCodes));
  const params = searchParams ? await searchParams : {}; const cohortId = value(params.cohort); const attemptId = value(params.attempt); const preparedAttempt = value(params.preparedAttempt); const prepared = value(params.prepared) === "1" && Boolean(preparedAttempt); const evidencePage = Math.max(1, Number.parseInt(value(params.evidencePage), 10) || 1);
  const options = await getOpeningInventoryFormOptions(session, cohortId ? { cohortId, evidencePage, evidencePageSize: 10 } : {});
  const cohort = options.draftCohorts.find((item) => item.id === cohortId) ?? null;
  const preparation = cohort && attemptId ? await getOpeningInventoryPreparationFormOptions(session, { cohortId, stockCountAttemptId: attemptId }) : null;
  const evidence = options.eligibleEvidenceAttachments.map((link) => ({ id: link.id, originalFilename: link.attachment.originalFilename, mimeType: link.attachment.mimeType, sizeBytes: link.attachment.sizeBytes, purpose: link.purpose, caption: link.caption, status: link.status, uploadState: link.attachment.uploadState, scanState: link.attachment.scanState, availabilityState: link.attachment.availabilityState, createdAt: link.createdAt.toISOString() }));
  return <AppShell session={session} title="Prepare Opening Inventory" subtitle="Focused immutable valuation task" activeNav="opening-inventory"><ActionFeedbackBanner feedback={getActionFeedback(params)} />{prepared && cohort ? <><OpeningInventoryDraftClearer tenantId={session.context.tenantId} userId={session.user.id} cohortId={cohort.id} attemptId={preparedAttempt} /><div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950"><strong>Immutable location batch prepared.</strong> The temporary browser draft for that exact count attempt was cleared. Return to the cutover queue to open the batch, seal the cohort when all locations are prepared, then submit for Operations and Accounting approval.</div></> : null}
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><ButtonLink href="/opening-inventory" className="bg-slate-100 text-blue-700">Back to cutover queue</ButtonLink><p className="mt-3 text-sm text-slate-600">Preparation does not post stock, freeze inventory, or activate a cohort.</p></div><Badge tone="warning">Draft cohort only</Badge></div>
    {!cohort ? <section className="ogfi-data-surface p-5"><h2 className="text-lg font-bold text-slate-950">Select a draft cohort</h2><p className="mt-1 text-sm text-slate-600">Only authorized draft cohorts can be prepared. Create one from the queue if needed.</p><div className="mt-4 grid gap-2">{options.draftCohorts.map((item) => <ButtonLink key={item.id} href={`/opening-inventory/prepare?cohort=${item.id}`} className="justify-start bg-slate-100 text-blue-700">{item.publicReference} · effective {formatDate(item.effectiveAt)}</ButtonLink>)}</div></section> : <section className="ogfi-data-surface p-4 sm:p-5"><div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"><div><h2 className="text-lg font-bold text-slate-950">{cohort.publicReference}</h2><p className="text-sm text-slate-600">Effective {formatDate(cohort.effectiveAt)} · immutable cohort digest already assigned</p></div><Badge tone="warning">Draft — not sealed</Badge></div><ControlledEvidencePanel attachments={evidence} canAdd sourceType="OPENING_INVENTORY_COHORT" sourceRecordId={cohort.id} purpose="RECONCILIATION_SUPPORT" requiredForAction="OPENING_INVENTORY_COHORT_SEAL" triggerLabel="Add controlled cohort evidence" captionPlaceholder="What this opening-inventory cohort evidence supports" /><PaginationBar page={options.eligibleEvidencePage.page} pageSize={options.eligibleEvidencePage.pageSize} totalItems={options.eligibleEvidencePage.totalItems} itemLabel="eligible evidence files" getPageHref={(next) => `/opening-inventory/prepare?${new URLSearchParams({ cohort: cohort.id, ...(attemptId ? { attempt: attemptId } : {}), evidencePage: String(next) })}`} />
      <form className="mt-5 grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4" method="get"><input name="cohort" type="hidden" value={cohort.id} /><label className="grid gap-1 text-sm font-medium text-slate-700">Reviewed opening count<select className="min-h-11 rounded-md border border-slate-300 bg-white px-3" name="attempt" defaultValue={attemptId} required><option value="">Select a reviewed opening count</option>{options.reviewedOpeningAttempts.map((attempt) => <option key={attempt.id} value={attempt.id}>{attempt.stockCountSession.publicReference} · cutoff {formatDate(attempt.cutoffAt)}</option>)}</select></label><button className="min-h-11 w-fit rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-blue-700">Load immutable count lines</button></form>
      {!options.reviewedOpeningAttempts.length ? <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">No reviewed opening count with an active movement freeze is available for this location.</p> : null}
      {preparation ? <><div className="mt-5 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-950"><strong>{preparation.attempt.stockCountSessionReference}</strong> / cutoff {formatDate(preparation.attempt.cutoffAt)}. Every immutable stock key, including explicit zeros, must have the controlled valuation evidence required by the server.</div><OpeningInventoryPreparationForm tenantId={session.context.tenantId} userId={session.user.id} cohortId={preparation.cohort.id} attemptId={preparation.attempt.id} lines={preparation.attempt.lines} evidence={options.eligibleEvidenceAttachments} action={prepareAction} /></> : null}
    </section>}</AppShell>;
}
