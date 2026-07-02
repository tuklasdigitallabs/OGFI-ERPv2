import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Badge, ButtonLink } from "@ogfi/ui";
import { ActionFeedbackBanner } from "@/components/ActionFeedbackBanner";
import { AppShell } from "@/components/AppShell";
import { EntryModal } from "@/components/EntryModal";
import { TransferLinesEditor } from "@/components/TransferLinesEditor";
import {
  actionErrorRedirectPath,
  getActionFeedback
} from "@/server/services/actionFeedback";
import {
  canUseTransfers,
  getDefaultAppRoute,
  permissions
} from "@/server/services/authorization";
import { getSessionContext } from "@/server/services/context";
import { canExportInventoryTransfers } from "@/server/services/exportAuthorization";
import {
  createInventoryTransfer,
  listInventoryTransfers,
  listTransferFormOptions,
  submitInventoryTransfer
} from "@/server/services/transfers";

export const dynamic = "force-dynamic";

type TransfersPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

async function createTransferAction(formData: FormData) {
  "use server";

  let transferId: string;
  try {
    transferId = await createInventoryTransfer(formData);
  } catch (error) {
    redirect(actionErrorRedirectPath("/transfers", error));
  }
  revalidatePath("/transfers");
  redirect(`/transfers/${transferId}`);
}

async function submitTransferAction(formData: FormData) {
  "use server";

  try {
    await submitInventoryTransfer(formData);
  } catch (error) {
    redirect(actionErrorRedirectPath("/transfers", error));
  }
  revalidatePath("/transfers");
  redirect("/transfers");
}

function statusTone(status: string) {
  if (status === "DRAFT") {
    return "neutral" as const;
  }
  if (status === "REQUESTED" || status === "PARTIALLY_RECEIVED") {
    return "info" as const;
  }
  if (status === "DISPATCHED" || status === "RECEIVED") {
    return "success" as const;
  }
  return "warning" as const;
}

export default async function TransfersPage({ searchParams }: TransfersPageProps) {
  const session = await getSessionContext();
  if (!session) {
    redirect("/sign-in");
  }

  const canAccessTransfers = canUseTransfers(session.permissionCodes);
  const canCreateTransfers = session.permissionCodes.includes(
    permissions.transferCreate
  );
  const canSubmitTransfers = session.permissionCodes.includes(
    permissions.transferSubmit
  );
  const canExportTransfers = canExportInventoryTransfers(session);

  if (!canAccessTransfers) {
    redirect(
      session.permissionCodes.includes(permissions.inventoryBalanceView)
        ? "/inventory"
        : getDefaultAppRoute(session.permissionCodes)
    );
  }

  const [transfers, formOptions] = await Promise.all([
    listInventoryTransfers(session),
    canCreateTransfers ? listTransferFormOptions(session) : Promise.resolve(null)
  ]);
  const firstSource = formOptions?.sourceInventoryLocations[0];
  const firstItem = formOptions?.items[0];
  const params = searchParams ? await searchParams : {};
  const actionFeedback = getActionFeedback(params);

  return (
    <AppShell
      session={session}
      title="Transfers"
      subtitle="Request, dispatch, and receive warehouse-to-location transfers"
      activeNav="transfers"
    >
      <ActionFeedbackBanner feedback={actionFeedback} />
      <div className="mb-5 ogfi-workflow-cue">
        <div className="flex flex-wrap gap-2">
          <span>Request Stock</span>
          <span>Source dispatch</span>
          <span>Destination receipt</span>
          <span>Discrepancy settlement</span>
        </div>
        <p className="mt-3 text-sm">
          <strong>Transfers separate source stock-out from destination stock-in.</strong>{" "}
          Source and destination stay explicit so branch and warehouse users can
          confirm the correct movement before posting.
        </p>
      </div>
      <div className="space-y-4">
        {canCreateTransfers ? (
          <div className="flex justify-end">
            <EntryModal title="Request Stock" triggerLabel="Request Stock">
              {!formOptions?.destinationInventoryLocation ? (
                <div className="mt-4 rounded-lg border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                  The current location needs an active inventory location before transfer
                  requests can be created.
                </div>
              ) : !firstSource || !firstItem ? (
                <div className="mt-4 rounded-lg border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                  Transfer requests need another active source inventory location and at least
                  one active inventory-tracked item.
                </div>
              ) : (
                <TransferLinesEditor
                  action={createTransferAction}
                  destinationInventoryLocation={formOptions.destinationInventoryLocation}
                  sourceInventoryLocations={formOptions.sourceInventoryLocations}
                  items={formOptions.items}
                />
              )}
            </EntryModal>
          </div>
        ) : null}

        <section className="ogfi-data-surface">
          <div className="ogfi-section-header">
            <div>
              <h2 className="text-lg font-bold text-slate-950">
                Stock Requests & Transfers
              </h2>
              <p className="text-sm text-slate-500">
                Requested transfers can be dispatched and received by authorized locations
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Badge tone="info">Dispatch ready</Badge>
              {canExportTransfers ? (
                <ButtonLink
                  href="/transfers/export"
                  className="min-h-9 bg-slate-100 text-blue-700 hover:bg-blue-50"
                >
                  Export CSV
                </ButtonLink>
              ) : null}
            </div>
          </div>
          {transfers.length === 0 ? (
            <div className="ogfi-empty-state">
              <p className="font-semibold text-slate-900">No transfer requests yet</p>
              <p className="mt-1 text-sm text-slate-600">
                Create a request to plan source-to-destination movement before dispatch
                from the source location.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {transfers.map((transfer) => (
                <div key={transfer.id} className="ogfi-list-row grid gap-3">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                      <p className="text-xs font-bold uppercase text-slate-400">
                        {transfer.publicReference}
                      </p>
                      <h3 className="mt-1 text-lg font-bold text-slate-950">
                        {transfer.sourceLocationName} to{" "}
                        {transfer.destinationLocationName}
                      </h3>
                      <p className="text-sm text-slate-600">
                        {transfer.transferType} / {transfer.lineCount} line(s)
                      </p>
                    </div>
                    <div className="text-left md:text-right">
                      <Badge tone={statusTone(transfer.status)}>
                        {transfer.status}
                      </Badge>
                      <p className="mt-2 text-sm font-semibold text-slate-900">
                        Requested {transfer.requestedQty}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <span>Requested by {transfer.requestedByName}</span>
                    <span>/</span>
                    <span>{new Date(transfer.createdAt).toLocaleDateString()}</span>
                    <span>/</span>
                    <span>Required {transfer.requiredByDate ?? "not set"}</span>
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <ButtonLink
                      href={`/transfers/${transfer.id}`}
                      className="bg-slate-100 text-blue-700 hover:bg-blue-50"
                    >
                      View Details
                    </ButtonLink>
                    {transfer.status === "DRAFT" && canSubmitTransfers ? (
                      <form action={submitTransferAction}>
                        <input name="id" type="hidden" value={transfer.id} />
                        <button className="inline-flex min-h-9 w-full items-center justify-center rounded-md bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 sm:w-auto">
                          Submit Request
                        </button>
                      </form>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

      </div>
    </AppShell>
  );
}
