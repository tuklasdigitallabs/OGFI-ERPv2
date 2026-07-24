import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { ArrowLeft } from "lucide-react";
import { Badge, ButtonLink } from "@ogfi/ui";
import { ActionFeedbackBanner } from "@/components/ActionFeedbackBanner";
import { AppShell } from "@/components/AppShell";
import { GoodsReceiptLinesEditor } from "@/components/GoodsReceiptLinesEditor";
import { actionErrorRedirectPath, getActionFeedback } from "@/server/services/actionFeedback";
import { canUseReceiving, getDefaultAppRoute, permissions } from "@/server/services/authorization";
import { getSessionContext } from "@/server/services/context";
import { createGoodsReceiptFromPurchaseOrder, listReceivablePurchaseOrders } from "@/server/services/receiving";

export const dynamic = "force-dynamic";

async function createReceiptAction(formData: FormData) {
  "use server";

  try {
    const receiptId = await createGoodsReceiptFromPurchaseOrder(formData);
    revalidatePath("/receiving");
    redirect(`/receiving/${receiptId}`);
  } catch (error) {
    redirect(actionErrorRedirectPath("/receiving/new", error));
  }
}

export default async function NewReceivingPage({
  searchParams
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getSessionContext();
  if (!session) {
    redirect("/sign-in");
  }
  if (!canUseReceiving(session.permissionCodes)) {
    redirect(getDefaultAppRoute(session.permissionCodes));
  }
  if (!session.permissionCodes.includes(permissions.receivingCreate)) {
    redirect("/receiving");
  }

  const orders = await listReceivablePurchaseOrders(session);
  const params = searchParams ? await searchParams : {};
  const feedback = getActionFeedback(params);

  return (
    <AppShell
      session={session}
      title="Create Draft Receipt"
      subtitle="Focused receiving entry against one issued Purchase Order"
      activeNav="receiving"
    >
      <ActionFeedbackBanner feedback={feedback} />
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <ButtonLink href="/receiving" tone="ghost" className="ogfi-chip">
          <ArrowLeft aria-hidden="true" className="h-4 w-4" />
          Cancel and return to Receiving
        </ButtonLink>
        <div className="flex flex-wrap gap-2">
          <Badge tone="info">Draft only</Badge>
          <Badge tone="neutral">{session.context.companyName}</Badge>
          <Badge tone="neutral">{session.context.locationName}</Badge>
        </div>
      </div>
      <section className="ogfi-data-surface overflow-hidden">
        <div className="ogfi-section-header">
          <div>
            <h2 className="text-lg font-bold text-slate-950">Delivery quantities and discrepancies</h2>
            <p className="text-sm text-slate-500">
              Review quantities and discrepancy evidence here. Inventory changes only after the saved draft is posted from its detail page.
            </p>
          </div>
          <Badge tone="warning">No inventory posting</Badge>
        </div>
        {orders.length === 0 ? (
          <div className="m-4 rounded-lg border border-dashed border-slate-200 bg-slate-50 p-5 text-sm text-slate-600">
            No issued Purchase Orders are ready for receiving in this location.
          </div>
        ) : (
          <GoodsReceiptLinesEditor action={createReceiptAction} orders={orders} />
        )}
      </section>
    </AppShell>
  );
}
