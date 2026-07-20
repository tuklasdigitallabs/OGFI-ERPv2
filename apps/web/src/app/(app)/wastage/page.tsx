import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Badge, ButtonLink } from "@ogfi/ui";
import { ActionFeedbackBanner } from "@/components/ActionFeedbackBanner";
import { AppShell } from "@/components/AppShell";
import { TaskSheet } from "@/components/TaskSheet";
import { WastageLinesEditor } from "@/components/WastageLinesEditor";
import {
  actionErrorRedirectPath,
  getActionFeedback
} from "@/server/services/actionFeedback";
import {
  canUseWastageReports,
  getDefaultAppRoute,
  permissions
} from "@/server/services/authorization";
import { getSessionContext } from "@/server/services/context";
import { canExportWastageReports } from "@/server/services/exportAuthorization";
import {
  createWastageReport,
  listWastageFormOptions,
  listWastageReports
} from "@/server/services/wastage";

export const dynamic = "force-dynamic";

type WastagePageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

async function createWastageAction(formData: FormData) {
  "use server";

  let reportId: string;
  try {
    reportId = await createWastageReport(formData);
  } catch (error) {
    redirect(actionErrorRedirectPath("/wastage", error));
  }
  revalidatePath("/wastage");
  redirect(`/wastage/${reportId}`);
}

function statusTone(status: string) {
  if (status === "DRAFT") {
    return "neutral" as const;
  }
  if (status === "SUBMITTED" || status === "PENDING_APPROVAL") {
    return "info" as const;
  }
  if (
    status === "REVIEWED" ||
    status === "APPROVED" ||
    status === "POSTED" ||
    status === "REVERSED"
  ) {
    return "success" as const;
  }
  return "warning" as const;
}

function formatMoney(amount: number) {
  return `PHP ${amount.toFixed(2)}`;
}

export default async function WastagePage({ searchParams }: WastagePageProps) {
  const session = await getSessionContext();
  if (!session) {
    redirect("/sign-in");
  }

  const canAccessWastage = canUseWastageReports(session.permissionCodes);
  const canCreateWastage = session.permissionCodes.includes(
    permissions.wastageCreate
  );
  const canExportWastage = canExportWastageReports(session);

  if (!canAccessWastage) {
    redirect(
      session.permissionCodes.includes(permissions.inventoryBalanceView)
        ? "/inventory"
        : getDefaultAppRoute(session.permissionCodes)
    );
  }

  const [reports, formOptions] = await Promise.all([
    listWastageReports(session),
    canCreateWastage ? listWastageFormOptions(session) : Promise.resolve(null)
  ]);
  const firstInventoryLocation = formOptions?.inventoryLocations[0];
  const firstItem = formOptions?.items[0];
  const params = searchParams ? await searchParams : {};
  const actionFeedback = getActionFeedback(params);

  return (
    <AppShell
      session={session}
      title="Wastage"
      subtitle="Capture, approve, post, and reverse documented stock losses"
      activeNav="wastage"
    >
      <ActionFeedbackBanner feedback={actionFeedback} />
      <div className="mb-5 ogfi-workflow-cue">
        <div className="flex flex-wrap gap-2">
          <span>Reason</span>
          <span>Evidence</span>
          <span>Approval</span>
          <span>Post WASTAGE_OUT</span>
          <span>Reversal</span>
        </div>
        <p className="mt-3 text-sm">
          <strong>Wastage requires documented reason and policy evidence.</strong>{" "}
          Approval is non-posting; stock changes only through the separate Post
          Wastage action.
        </p>
      </div>
      <div className="space-y-4">
        {canCreateWastage ? (
          <div className="flex justify-end">
            <TaskSheet title="Log Wastage" description="Capture loss quantities, reasons, and line evidence before review." trigger={<span>Log Wastage</span>} triggerClassName="bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700" size="workspace" bodyScroll="contained" bodyClassName="p-0">
              {!firstInventoryLocation || !firstItem ? (
                <div className="mt-4 rounded-lg border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                  The current location needs an active inventory location and tracked item
                  master data before wastage can be logged.
                </div>
              ) : (
                <WastageLinesEditor
                  action={createWastageAction}
                  inventoryLocations={formOptions.inventoryLocations}
                  items={formOptions.items}
                  reasonCodes={formOptions.reasonCodes}
                  wastageTypes={formOptions.wastageTypes}
                />
              )}
            </TaskSheet>
          </div>
        ) : null}

        <section className="ogfi-data-surface">
          <div className="ogfi-section-header">
            <div>
              <h2 className="text-lg font-bold text-slate-950">Wastage Reports</h2>
              <p className="text-sm text-slate-500">
                Approved reports can be posted separately. Post Wastage action creates WASTAGE_OUT
                inventory movements and updates balances.
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Badge tone="info">{session.context.locationName}</Badge>
              {canExportWastage ? (
                <ButtonLink
                  href="/wastage/export"
                  className="min-h-9 bg-slate-100 text-blue-700 hover:bg-blue-50"
                >
                  Export CSV
                </ButtonLink>
              ) : null}
            </div>
          </div>
          {reports.length === 0 ? (
            <div className="ogfi-empty-state">
              <p className="font-semibold text-slate-900">No wastage reports yet</p>
              <p className="mt-1 text-sm text-slate-600">
                Log wastage when stock is spoiled, damaged, expired, consumed, or
                otherwise lost with a documented reason.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {reports.map((report) => (
                <div key={report.id} className="ogfi-list-row grid gap-3">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                      <p className="text-xs font-bold uppercase text-slate-400">
                        {report.publicReference}
                      </p>
                      <h3 className="mt-1 text-lg font-bold text-slate-950">
                        {report.wastageType.replaceAll("_", " ")}
                      </h3>
                      <p className="text-sm text-slate-600">
                        {report.inventoryLocationName} / {report.reasonCode}
                      </p>
                    </div>
                    <div className="text-left md:text-right">
                      <Badge tone={statusTone(report.status)}>{report.status}</Badge>
                      <p className="mt-2 text-sm font-semibold text-slate-900">
                        {formatMoney(report.totalEstimatedCost)}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <span>Reported by {report.reportedByName}</span>
                    <span>/</span>
                    <span>{report.lineCount} line(s)</span>
                    <span>/</span>
                    <span>Submitted {report.submittedAt ? "yes" : "no"}</span>
                    <span>/</span>
                    <span>Posted {report.postedAt ? "yes" : "no"}</span>
                  </div>
                  {report.policyFlagLabels.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {report.policyFlagLabels.map((flag) => (
                        <Badge key={flag} tone="warning">
                          {flag}
                        </Badge>
                      ))}
                    </div>
                  ) : null}
                  <div>
                    <ButtonLink
                      href={`/wastage/${report.id}`}
                      className="bg-slate-100 text-blue-700 hover:bg-blue-50"
                    >
                      Open Report
                    </ButtonLink>
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
