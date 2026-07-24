import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ButtonLink, Panel } from "@ogfi/ui";
import { ActionFeedbackBanner } from "@/components/ActionFeedbackBanner";
import { AppShell } from "@/components/AppShell";
import { QuoteComparisonWorkspace } from "@/components/QuoteComparisonWorkspace";
import { listControlledEvidenceAttachmentPage } from "@/server/services/attachments";
import { actionErrorRedirectPath, getActionFeedback } from "@/server/services/actionFeedback";
import { getDefaultAppRoute, permissions } from "@/server/services/authorization";
import { getSessionContext } from "@/server/services/context";
import { createQuotationRecommendation, listQuoteOptions, listQuoteRequestsPage, submitQuotationRecommendation } from "@/server/services/quotes";
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

export default async function SupplierQuotesPage({ searchParams }: SupplierQuotesPageProps) {
  const session = await getSessionContext();
  if (!session) redirect("/sign-in");
  if (!session.permissionCodes.includes(permissions.quoteManage)) redirect(getDefaultAppRoute(session.permissionCodes));

  const params = searchParams ? await searchParams : {};
  const rawPage = Number.parseInt(Array.isArray(params.page) ? params.page[0] ?? "1" : params.page ?? "1", 10);
  const requestedPage = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1;
  const selectedRequestId = Array.isArray(params.requestId) ? params.requestId[0] : params.requestId;
  const [requestPage, options] = await Promise.all([
    listQuoteRequestsPage(session, { page: requestedPage, pageSize: 25 }),
    listQuoteOptions(session)
  ]);
  const requests = requestPage.items;
  const selectedRequest = requests.find((request) => request.id === selectedRequestId) ?? requests[0];
  const evidenceEntries = selectedRequest
    ? await Promise.all(selectedRequest.quotes.map(async (quote) => [
        quote.id,
        (await listControlledEvidenceAttachmentPage({
          sourceType: "SUPPLIER_QUOTATION",
          sourceRecordId: quote.id,
          requiredPermissionCode: "SERVICE_ENFORCED",
          page: 1,
          pageSize: 10,
        })).rows,
      ] as const))
    : [];
  const quoteEvidence = Object.fromEntries(evidenceEntries);
  const quoteCount = requests.reduce((count, request) => count + request.quotes.length, 0);
  const actionFeedback = getActionFeedback(params);
  const canExportQuotes = canExportSupplierQuotes(session);

  return (
    <AppShell session={session} title="Supplier Quotes" subtitle="Approved PR quote capture and comparison" activeNav="quotes">
      <ActionFeedbackBanner feedback={actionFeedback} />
      <div className="mb-5 ogfi-workflow-cue">
        <div className="flex flex-wrap gap-2"><span>Approved PR</span><span>Supplier quote</span><span>Comparison</span><span>Recommendation approval</span><span>PO creation</span></div>
        <p className="mt-3 text-sm"><strong>Compare supplier options before PO commitment.</strong> The selected supplier recommendation remains a separate approval-controlled action.</p>
      </div>
      <div className="mb-5 grid gap-4 md:grid-cols-4">
        <Panel><p className="text-sm font-semibold text-slate-500">Approved PRs</p><p className="mt-2 text-3xl font-bold text-slate-950">{requestPage.totalItems}</p></Panel>
        <Panel><p className="text-sm font-semibold text-slate-500">Recorded quotes on page</p><p className="mt-2 text-3xl font-bold text-emerald-700">{quoteCount}</p></Panel>
        <Panel><p className="text-sm font-semibold text-slate-500">Suppliers</p><p className="mt-2 text-3xl font-bold text-slate-950">{options.suppliers.length}</p></Panel>
        <Panel><p className="text-sm font-semibold text-slate-500">Location</p><p className="mt-2 text-lg font-bold text-slate-950">{session.context.locationName}</p></Panel>
      </div>
      <div className="mb-4 flex flex-wrap justify-end gap-2">
        <ButtonLink href="/quotes/new" className="bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700">Record Supplier Quote</ButtonLink>
        {canExportQuotes ? (
          <a className="inline-flex min-h-10 items-center justify-center rounded-md border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 hover:bg-slate-50" href="/quotes/export">Export CSV</a>
        ) : null}
      </div>
      <QuoteComparisonWorkspace
        requests={requests}
        selectedRequestId={selectedRequestId}
        page={requestPage.page}
        pageSize={requestPage.pageSize}
        totalItems={requestPage.totalItems}
        createRecommendationAction={createQuotationRecommendationAction}
        submitRecommendationAction={submitQuotationRecommendationAction}
        quoteEvidence={quoteEvidence}
      />
    </AppShell>
  );
}
