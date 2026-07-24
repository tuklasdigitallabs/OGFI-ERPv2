import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Badge, ButtonLink } from "@ogfi/ui";
import { ActionFeedbackBanner } from "@/components/ActionFeedbackBanner";
import { AppShell } from "@/components/AppShell";
import { SupplierQuoteLinesEditor } from "@/components/SupplierQuoteLinesEditor";
import { actionErrorRedirectPath, getActionFeedback } from "@/server/services/actionFeedback";
import { getDefaultAppRoute, permissions } from "@/server/services/authorization";
import { getSessionContext } from "@/server/services/context";
import { createSupplierQuote, listQuoteOptions, listQuoteRequests } from "@/server/services/quotes";

export const dynamic = "force-dynamic";

async function createSupplierQuoteAction(formData: FormData) {
  "use server";

  try {
    await createSupplierQuote(formData);
  } catch (error) {
    redirect(actionErrorRedirectPath("/quotes/new", error));
  }
  redirect("/quotes");
}

export default async function NewSupplierQuotePage({
  searchParams
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getSessionContext();
  if (!session) {
    redirect("/sign-in");
  }
  if (!session.permissionCodes.includes(permissions.quoteManage)) {
    redirect(getDefaultAppRoute(session.permissionCodes));
  }

  const [requests, options, params] = await Promise.all([
    listQuoteRequests(session),
    listQuoteOptions(session),
    searchParams ?? Promise.resolve({})
  ]);
  const feedback = getActionFeedback(params);

  return (
    <AppShell
      session={session}
      title="Record Supplier Quote"
      subtitle="Focused quote capture for one approved Purchase Request"
      activeNav="quotes"
    >
      <ActionFeedbackBanner feedback={feedback} />
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <ButtonLink href="/quotes" tone="ghost" className="ogfi-chip">
          <ArrowLeft aria-hidden="true" className="h-4 w-4" />
          Cancel and return to Quotes
        </ButtonLink>
        <div className="flex flex-wrap gap-2">
          <Badge tone="info">Quote capture</Badge>
          <Badge tone="neutral">{session.context.companyName}</Badge>
          <Badge tone="neutral">{session.context.locationName}</Badge>
        </div>
      </div>
      <section className="ogfi-data-surface overflow-hidden">
        <div className="ogfi-section-header">
          <div>
            <h2 className="text-lg font-bold text-slate-950">Supplier quote details</h2>
            <p className="text-sm text-slate-500">
              Price the approved request lines for one supplier. Recording a quote does not issue a Purchase Order.
            </p>
          </div>
          <Badge tone="warning">No PO commitment</Badge>
        </div>
        {requests.length === 0 ? (
          <div className="m-4 rounded-lg border border-dashed border-slate-200 bg-slate-50 p-5 text-sm text-slate-600">
            No approved Purchase Requests are ready for quote capture in this location.
          </div>
        ) : options.suppliers.length === 0 || options.uoms.length === 0 ? (
          <div className="m-4 rounded-lg border border-dashed border-slate-200 bg-slate-50 p-5 text-sm text-slate-600">
            Quote capture is unavailable until supplier and unit-of-measure options are configured.
          </div>
        ) : (
          <SupplierQuoteLinesEditor
            action={createSupplierQuoteAction}
            requests={requests}
            suppliers={options.suppliers}
            uoms={options.uoms}
          />
        )}
      </section>
    </AppShell>
  );
}
