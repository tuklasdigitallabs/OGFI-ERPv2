import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Badge, ButtonLink, EmptyState, PaginationBar, WorkspaceTabs } from "@ogfi/ui";
import { ActionFeedbackBanner } from "@/components/ActionFeedbackBanner";
import { AppShell } from "@/components/AppShell";
import { TaskSheet } from "@/components/TaskSheet";
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
  listInventoryTransfersDashboardProfilePage,
  listTransferFormOptions,
  resolveTransferDashboardProfile,
  submitInventoryTransfer,
  transferDashboardProfileHref
} from "@/server/services/transfers";

export const dynamic = "force-dynamic";

type TransfersPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type TransferTab = "all" | "draft" | "dispatch" | "receive" | "completed";

const PAGE_SIZE = 10;

function getStringParam(
  searchParams: Record<string, string | string[] | undefined>,
  key: string
) {
  const value = searchParams[key];
  return Array.isArray(value) ? value[0] : value;
}

function getTransferTab(
  searchParams: Record<string, string | string[] | undefined>
): TransferTab {
  const tab = getStringParam(searchParams, "tab");
  if (tab === "draft" || tab === "dispatch" || tab === "receive" || tab === "completed") {
    return tab;
  }
  return "all";
}

function getPage(searchParams: Record<string, string | string[] | undefined>) {
  const page = Number.parseInt(getStringParam(searchParams, "page") ?? "1", 10);
  return Number.isFinite(page) && page > 0 ? page : 1;
}

function transfersHref(tab: TransferTab, page = 1) {
  const params = new URLSearchParams();
  if (tab !== "all") {
    params.set("tab", tab);
  }
  if (page > 1) {
    params.set("page", String(page));
  }
  const query = params.toString();
  return query ? `/transfers?${query}` : "/transfers";
}

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

  const params = searchParams ? await searchParams : {};
  const profileParam = getStringParam(params, "dashboard");
  const profile = resolveTransferDashboardProfile(profileParam);
  if (profileParam && !profile) {
    redirect("/transfers");
  }

  const profilePage = profile
    ? await listInventoryTransfersDashboardProfilePage(session, profile, getPage(params))
    : null;
  const [workspaceTransfers, formOptions] = profile
    ? [null, null]
    : await Promise.all([
        listInventoryTransfers(session),
        canCreateTransfers ? listTransferFormOptions(session) : Promise.resolve(null)
      ]);
  const transfers = profilePage?.transfers ?? workspaceTransfers ?? [];
  const firstSource = formOptions?.sourceInventoryLocations[0];
  const firstItem = formOptions?.items[0];
  const actionFeedback = getActionFeedback(params);
  const activeTab = getTransferTab(params);
  const page = getPage(params);
  const draftTransfers = transfers.filter((transfer) => transfer.status === "DRAFT");
  const dispatchTransfers = transfers.filter(
    (transfer) => transfer.status === "REQUESTED"
  );
  const receiveTransfers = transfers.filter((transfer) =>
    ["DISPATCHED", "PARTIALLY_RECEIVED"].includes(transfer.status)
  );
  const completedTransfers = transfers.filter((transfer) => transfer.status === "RECEIVED");
  const visibleTransfers =
    profile
      ? transfers
      : activeTab === "draft"
      ? draftTransfers
      : activeTab === "dispatch"
        ? dispatchTransfers
        : activeTab === "receive"
          ? receiveTransfers
          : activeTab === "completed"
            ? completedTransfers
            : transfers;
  const pageCount = profilePage
    ? Math.max(1, Math.ceil(profilePage.totalItems / profilePage.pageSize))
    : Math.max(1, Math.ceil(visibleTransfers.length / PAGE_SIZE));
  const safePage = profilePage ? profilePage.page : Math.min(page, pageCount);
  const pagedTransfers = profilePage
    ? visibleTransfers
    : visibleTransfers.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const emptyCopy =
    profile
      ? {
          title: "No transfers need follow-up",
          description:
            "No requested, dispatched, partially received, or disputed transfers involve the selected location."
        }
      : activeTab === "draft"
      ? {
          title: "No draft transfer requests",
          description: "Draft transfer requests waiting for submission will appear here."
        }
      : activeTab === "dispatch"
        ? {
            title: "No transfers ready for dispatch",
            description: "Submitted transfer requests waiting for source dispatch will appear here."
          }
        : activeTab === "receive"
          ? {
              title: "No transfers ready to receive",
              description:
                "Dispatched or partially received transfers waiting for destination confirmation will appear here."
            }
          : activeTab === "completed"
            ? {
                title: "No completed transfers",
                description: "Fully received transfers will appear here."
              }
            : {
                title: "No transfer requests yet",
                description:
                  "Create a request to plan source-to-destination movement before dispatch from the source location."
              };

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
        {!profile && canCreateTransfers ? (
          <div className="flex justify-end">
            <TaskSheet title="Request Stock" description="Choose the source and build the requested transfer lines." trigger={<span>Request Stock</span>} triggerClassName="bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700" size="workspace" bodyScroll="contained" bodyClassName="p-0">
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
            </TaskSheet>
          </div>
        ) : null}

        <section className="ogfi-data-surface">
          <div className="ogfi-section-header">
            <div>
              <h2 className="text-lg font-bold text-slate-950">
                {profile ? "Transfer Follow-up" : "Stock Requests & Transfers"}
              </h2>
              <p className="text-sm text-slate-500">
                {profile
                  ? `${profilePage?.totalItems ?? 0} transfers requiring follow-up at the selected location`
                  : `${transfers.length} total, ${dispatchTransfers.length} awaiting dispatch, ${receiveTransfers.length} awaiting receipt`}
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              {profile ? <ButtonLink href="/transfers">View all transfers</ButtonLink> : <Badge tone="info">Dispatch ready</Badge>}
              {canExportTransfers && profile ? (
                <ButtonLink
                  href={`/transfers/export?dashboard=${profile}`}
                  className="min-h-9 bg-slate-100 text-blue-700 hover:bg-blue-50"
                >
                  Export CSV
                </ButtonLink>
              ) : canExportTransfers ? (
                <ButtonLink
                  href="/transfers/export"
                  className="min-h-9 bg-slate-100 text-blue-700 hover:bg-blue-50"
                >
                  Export CSV
                </ButtonLink>
              ) : null}
            </div>
          </div>
          {profile ? (
            <div className="border-b border-slate-100 bg-blue-50 p-4 text-sm text-slate-700">
              Showing the dashboard follow-up population only: requested, dispatched,
              partially received, and disputed transfers where the selected location is
              the source or destination. This view does not grant transfer or inventory actions.
            </div>
          ) : (
            <div className="border-b border-slate-100 p-4">
              <WorkspaceTabs
                items={[
                  { label: "All", href: transfersHref("all"), active: activeTab === "all", count: transfers.length },
                  { label: "Draft", href: transfersHref("draft"), active: activeTab === "draft", count: draftTransfers.length },
                  { label: "Dispatch", href: transfersHref("dispatch"), active: activeTab === "dispatch", count: dispatchTransfers.length },
                  { label: "Receive", href: transfersHref("receive"), active: activeTab === "receive", count: receiveTransfers.length },
                  { label: "Completed", href: transfersHref("completed"), active: activeTab === "completed", count: completedTransfers.length }
                ]}
              />
            </div>
          )}
          {visibleTransfers.length === 0 ? (
            <div className="p-5">
              <EmptyState title={emptyCopy.title} description={emptyCopy.description} />
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {pagedTransfers.map((transfer) => (
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
          {visibleTransfers.length > 0 ? (
            <PaginationBar
              page={safePage}
              pageSize={profilePage?.pageSize ?? PAGE_SIZE}
              totalItems={profilePage?.totalItems ?? visibleTransfers.length}
              itemLabel="transfers"
              getPageHref={(nextPage) =>
                profile
                  ? transferDashboardProfileHref(profile, nextPage)
                  : transfersHref(activeTab, nextPage)
              }
            />
          ) : null}
        </section>

      </div>
    </AppShell>
  );
}
