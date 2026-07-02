import { redirect } from "next/navigation";
import { Badge, ButtonLink, Panel } from "@ogfi/ui";
import { AppShell } from "@/components/AppShell";
import { getDefaultAppRoute } from "@/server/services/authorization";
import { getSessionContext } from "@/server/services/context";
import {
  canUseOperationalReports,
  listOperationalReports,
  type OperationalReportCard
} from "@/server/services/reports";

export const dynamic = "force-dynamic";

const reportGroups: OperationalReportCard["group"][] = [
  "Purchasing",
  "Receiving",
  "Inventory",
  "Controls",
  "Audit"
];

export default async function ReportsPage() {
  const session = await getSessionContext();
  if (!session) {
    redirect("/sign-in");
  }
  if (!canUseOperationalReports(session)) {
    redirect(getDefaultAppRoute(session.permissionCodes));
  }

  const reports = listOperationalReports(session);
  const exportCount = reports.filter((report) => report.exportHref).length;

  return (
    <AppShell
      session={session}
      title="Operational Reports"
      subtitle="Scoped Phase I source-record reports and controlled exports"
      activeNav="reports"
    >
      <div className="ogfi-coordination-cue">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">
              <strong>Reports are scoped source-record views.</strong> Exports use the
              same server-side permissions and selected company/location context as the
              operational modules.
            </p>
            <p className="mt-1 text-xs text-blue-900/75">
              Opening or exporting a report does not approve, post, reverse, or mutate
              any procurement, receiving, inventory, or audit source record.
            </p>
          </div>
          <span>Controlled exports</span>
        </div>
      </div>
      <div className="mb-5 grid gap-4 md:grid-cols-3">
        <Panel className="ogfi-detail-card">
          <p className="text-sm font-semibold text-slate-500">Available reports</p>
          <p className="mt-2 text-3xl font-bold text-slate-950">{reports.length}</p>
        </Panel>
        <Panel className="ogfi-detail-card">
          <p className="text-sm font-semibold text-slate-500">CSV exports</p>
          <p className="mt-2 text-3xl font-bold text-blue-700">{exportCount}</p>
        </Panel>
        <Panel className="ogfi-detail-card">
          <p className="text-sm font-semibold text-slate-500">Scope</p>
          <p className="mt-2 text-lg font-bold text-slate-950">
            {session.context.locationName}
          </p>
        </Panel>
      </div>

      <div className="space-y-5">
        {reportGroups.map((group) => {
          const groupReports = reports.filter((report) => report.group === group);
          if (groupReports.length === 0) {
            return null;
          }

          return (
            <section key={group} className="ogfi-data-surface">
              <div className="ogfi-section-header">
                <div>
                  <h2 className="text-lg font-bold text-slate-950">{group}</h2>
                  <p className="text-sm text-slate-500">
                    Reports use the same server-side permissions and selected-location scope
                    as their source modules.
                  </p>
                </div>
                <Badge tone="info">{groupReports.length} report{groupReports.length === 1 ? "" : "s"}</Badge>
              </div>
              <div className="grid gap-4 p-4 lg:grid-cols-2">
                {groupReports.map((report) => (
                  <Panel key={report.id} className="ogfi-record-summary shadow-none">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <h3 className="font-bold text-slate-950">{report.title}</h3>
                        <p className="mt-1 text-sm text-slate-600">{report.description}</p>
                      </div>
                      <Badge tone={report.status === "CSV_AVAILABLE" ? "success" : "neutral"}>
                        {report.status === "CSV_AVAILABLE" ? "CSV" : "View"}
                      </Badge>
                    </div>
                    <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                      <ButtonLink
                        href={report.sourceHref}
                        className="min-h-9 bg-slate-100 text-blue-700 hover:bg-blue-50"
                      >
                        Open Source
                      </ButtonLink>
                      {report.exportHref ? (
                        <ButtonLink href={report.exportHref} className="min-h-9">
                          Export CSV
                        </ButtonLink>
                      ) : null}
                    </div>
                  </Panel>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </AppShell>
  );
}
