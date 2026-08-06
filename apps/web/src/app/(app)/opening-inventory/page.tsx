import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Badge, ButtonLink, PaginationBar } from "@ogfi/ui";
import { ActionFeedbackBanner } from "@/components/ActionFeedbackBanner";
import { AppShell } from "@/components/AppShell";
import { EntryModal } from "@/components/EntryModal";
import { OpeningInventorySubmitButton } from "@/components/opening-inventory/OpeningInventorySubmitButton";
import { actionErrorRedirectPath, getActionFeedback } from "@/server/services/actionFeedback";
import { getDefaultAppRoute, permissions } from "@/server/services/authorization";
import { assertTrustedServerActionOrigin } from "@/server/services/authentication";
import { getSessionContext } from "@/server/services/context";
import { createOpeningInventoryCohort, getOpeningInventoryFormOptions, listOpeningInventoryCutoverPage, openingInventoryStableErrors } from "@/server/services/openingInventoryCutovers";

export const dynamic = "force-dynamic";

type Props = { searchParams?: Promise<Record<string, string | string[] | undefined>> };
const value = (input: string | string[] | undefined) => Array.isArray(input) ? input[0] ?? "" : input ?? "";
const pageNumber = (input: string | string[] | undefined) => Math.max(1, Number.parseInt(value(input), 10) || 1);
const timeZone = "Asia/Manila";
const formatDate = (input: Date | string | null | undefined) => input ? new Intl.DateTimeFormat("en-PH", { timeZone, dateStyle: "medium", timeStyle: "short" }).format(new Date(input)) : "Not recorded";
const tone = (status: string) => ["ACTIVE", "RECONCILED"].includes(status) ? "success" as const : ["PENDING_APPROVAL", "APPROVED", "STAGED"].includes(status) ? "info" as const : ["REJECTED", "CANCELLED", "REVERSED"].includes(status) ? "destructive" as const : "neutral" as const;
type FormOptions = Awaited<ReturnType<typeof getOpeningInventoryFormOptions>>;

function preparationOptionsState(options: FormOptions | null, error: unknown) {
  if (error) {
    const code = error instanceof Error ? error.message : "";
    if (["PERMISSION_DENIED", openingInventoryStableErrors.endpointScope, openingInventoryStableErrors.authorityStale].includes(code)) return { kind: "denied" as const, reason: "Your live preparation permission or location scope does not cover this action." };
    if (["OPENING_INVENTORY_CUTOVER_NOT_FOUND", "OPENING_INVENTORY_CONFIGURATION_NOT_FOUND"].includes(code)) return { kind: "not_found" as const, reason: "The preparation context is no longer available in this company. Refresh before choosing a revision." };
    return { kind: "load_error" as const, reason: "Preparation options could not be loaded. No cohort was created; retry this queue before continuing." };
  }
  if (!options) return { kind: "denied" as const, reason: "Opening-inventory preparation is not available for this role." };
  if (options.revisions.length > 0) return { kind: "ready" as const, reason: null };
  const code = options.configurationEligibility.code;
  if (code === openingInventoryStableErrors.endpointScope) return { kind: "denied" as const, reason: "Your live preparation scope does not cover every opening-stock endpoint retained by the latest revision." };
  if (code === openingInventoryStableErrors.unsupportedConfiguration) return { kind: "no_eligible_revision" as const, reason: "No latest sealed Inventory Pilot revision is available for a new cohort." };
  if (code === openingInventoryStableErrors.configurationEvidenceInvalid || code === openingInventoryStableErrors.configurationLiveReadinessBlocked) return { kind: "ineligible" as const, reason: "The latest sealed revision is not currently eligible. Review its seal evidence and live readiness blockers in Setup Center." };
  return { kind: "ineligible" as const, reason: "The latest sealed revision is outside the authorized preparation scope or is otherwise ineligible for a new cohort." };
}

async function createCohortAction(formData: FormData) {
  "use server";
  try {
    await assertTrustedServerActionOrigin();
    const cohort = await createOpeningInventoryCohort({
      configurationRevisionId: String(formData.get("configurationRevisionId") ?? ""),
      effectiveAt: `${String(formData.get("effectiveAt") ?? "")}+08:00`,
    });
    revalidatePath("/opening-inventory");
    redirect(`/opening-inventory/prepare?cohort=${encodeURIComponent(cohort.id)}`);
  } catch (error) {
    redirect(actionErrorRedirectPath("/opening-inventory", error));
  }
}

export default async function OpeningInventoryQueuePage({ searchParams }: Props) {
  const session = await getSessionContext();
  if (!session) redirect("/sign-in");
  if (!session.permissionCodes.includes(permissions.openingInventoryView)) redirect(getDefaultAppRoute(session.permissionCodes));
  const params = searchParams ? await searchParams : {};
  const query = value(params.q).trim().toLowerCase();
  const status = value(params.status);
  const page = pageNumber(params.page);
  const canPrepare = session.permissionCodes.includes(permissions.openingInventoryPrepare);
  const canConfigurePilot = session.permissionCodes.includes(permissions.inventoryPilotConfigurationView);
  const [cutovers, formOptionsResult] = await Promise.all([
    listOpeningInventoryCutoverPage(session, { page, ...(query ? { query } : {}), ...(status ? { status } : {}) }),
    canPrepare
      ? getOpeningInventoryFormOptions(session)
          .then((options) => ({ options, error: null as unknown }))
          .catch((error: unknown) => ({ options: null, error }))
      : Promise.resolve({ options: null, error: null as unknown }),
  ]);
  const formOptions = formOptionsResult.options;
  const preparationState = preparationOptionsState(formOptions, formOptionsResult.error);
  const feedback = getActionFeedback(params);
  const statuses = ["DRAFT", "PENDING_APPROVAL", "RETURNED", "REJECTED", "APPROVED", "RECONCILED", "ACTIVE", "CANCELLED", "REVERSING", "REVERSED"];
  const href = (nextPage: number) => `/opening-inventory?${new URLSearchParams({ ...(query ? { q: query } : {}), ...(status ? { status } : {}), page: String(nextPage) })}`;
  const preparationRetryHref = href(page);
  const locationLabel = session.context.locationName ?? "Company-wide authorized queue";

  return <AppShell session={session} title="Opening Inventory Cutover" subtitle="Controlled pilot opening-stock location batch queue" activeNav="opening-inventory">
    <ActionFeedbackBanner feedback={feedback} />
    <nav aria-label="Opening inventory workspace" className="ogfi-tab-list mb-5"><ButtonLink href="/opening-inventory" className="ogfi-tab is-active">Cutover queue</ButtonLink>{canConfigurePilot ? <ButtonLink href="/opening-inventory/setup" className="ogfi-tab">Setup Center</ButtonLink> : null}</nav>
    <div className="mb-5 ogfi-workflow-cue"><div className="flex flex-wrap gap-2"><span>Sealed cohort</span><span>Reviewed opening count</span><span>Operations + Accounting</span><span>Isolated executor</span></div><p className="mt-3 text-sm"><strong>This is not a stock-adjustment form.</strong> A controlled cohort is prepared from reviewed count facts, then separately approved and executed.</p></div>
    <section className="ogfi-data-surface">
      <div className="ogfi-section-header"><div><h2 className="text-lg font-bold text-slate-950">Location cutover queue</h2><p className="text-sm text-slate-500">{session.context.companyName} / {locationLabel}</p></div><Badge tone="info">Company-level cohort · no brand binding</Badge></div>
      <div className="border-b border-slate-100 bg-slate-50 p-4"><form className="grid gap-3 md:grid-cols-[minmax(0,1fr)_14rem_auto]" method="get"><label className="grid gap-1 text-sm font-medium text-slate-700">Search cutover batches<input className="min-h-11 rounded-md border border-slate-300 bg-white px-3" name="q" defaultValue={query} maxLength={120} placeholder="Batch, cohort, or source count ID" /></label><label className="grid gap-1 text-sm font-medium text-slate-700">Status<select className="min-h-11 rounded-md border border-slate-300 bg-white px-3" name="status" defaultValue={status}><option value="">All statuses</option>{statuses.map((item) => <option key={item} value={item}>{item.replaceAll("_", " ")}</option>)}</select></label><button className="mt-auto min-h-11 rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-blue-700">Apply filters</button></form>{query || status ? <ButtonLink href="/opening-inventory" className="mt-3 bg-white text-blue-700">Reset filters</ButtonLink> : null}</div>
      {canPrepare ? <div className="border-b border-slate-200 bg-slate-50 p-4">{preparationState.kind === "load_error" || preparationState.kind === "not_found" ? <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950" role="alert"><strong>{preparationState.kind === "not_found" ? "Preparation context unavailable." : "Preparation options unavailable."}</strong> {preparationState.reason}<ButtonLink href={preparationRetryHref} className="mt-3 bg-white text-blue-700">Retry preparation options</ButtonLink></div> : null}<EntryModal title="Create opening-inventory cohort" triggerLabel="Create opening cohort" disabled={preparationState.kind !== "ready"} {...(preparationState.reason ? { disabledReason: preparationState.reason } : {})}><form action={createCohortAction} className="ogfi-form-shell mt-4 grid gap-4"><p className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-950"><strong>Creates a draft cohort only from the latest eligible sealed configuration.</strong> Older revisions remain pinned to their existing cohorts and cannot be selected for new work. This action does not load stock, freeze inventory, or activate the pilot.</p><label className="grid gap-1 text-sm font-medium text-slate-700">Latest eligible sealed configuration<select className="min-h-11 rounded-md border border-slate-300 bg-white px-3" name="configurationRevisionId" required>{formOptions?.revisions.map((revision) => <option key={revision.id} value={revision.id}>Revision {revision.revisionNumber} · {revision.itemMemberships.length} item(s) · {revision.endpointMemberships.length} location(s)</option>)}</select></label><label className="grid gap-1 text-sm font-medium text-slate-700">Effective cutover time (Asia/Manila)<input className="min-h-11 rounded-md border border-slate-300 bg-white px-3" name="effectiveAt" type="datetime-local" required /></label><OpeningInventorySubmitButton label="Create draft cohort" className="min-h-11 rounded-md bg-blue-600 px-4 text-sm font-semibold text-white disabled:bg-slate-400" /></form></EntryModal></div> : null}
      {cutovers.items.length === 0 ? <div className="p-5"><h3 className="font-semibold text-slate-950">No opening-inventory batches match this queue</h3><p className="mt-1 text-sm text-slate-600">Create a controlled draft cohort or adjust the server-side search and status filters.</p></div> : <div className="divide-y divide-slate-100">{cutovers.items.map((cutover) => <article key={cutover.id} className="ogfi-list-row grid gap-3"><div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between"><div><p className="text-xs font-bold uppercase text-slate-400">{cutover.cohort.publicReference} / location batch</p><h3 className="mt-1 text-base font-bold text-slate-950">{cutover.inventoryLocation.location.code} / {cutover.inventoryLocation.name}</h3><p className="text-sm text-slate-600">Requested by {cutover.requesterName ?? "Not recorded"} · cohort owner {cutover.ownerName ?? "Not recorded"}</p></div><div className="text-left md:text-right"><Badge tone={tone(cutover.status)}>{cutover.status.replaceAll("_", " ")}</Badge><p className="mt-2 text-xs text-slate-500">Updated {formatDate(cutover.updatedAt)}</p></div></div><div className="grid gap-2 text-xs text-slate-600 sm:grid-cols-2 xl:grid-cols-4"><span>Effective {formatDate(cutover.cohort.effectiveAt)}</span><span>{cutover.currentApprover ? `Current approver: ${cutover.currentApprover}` : "Next action: open record"}</span><span>{cutover.lines.length} immutable line(s)</span><span>Last activity {cutover.auditSummary[0] ? formatDate(cutover.auditSummary[0].occurredAt) : "Not recorded"}</span></div><ButtonLink href={`/opening-inventory/${cutover.id}`} className="min-h-11 w-fit bg-slate-100 text-blue-700">Open controlled detail</ButtonLink></article>)}</div>}
      {cutovers.totalItems > 0 ? <PaginationBar page={cutovers.page} pageSize={cutovers.pageSize} totalItems={cutovers.totalItems} itemLabel="opening-inventory batches" getPageHref={href} /> : null}
    </section>
  </AppShell>;
}
