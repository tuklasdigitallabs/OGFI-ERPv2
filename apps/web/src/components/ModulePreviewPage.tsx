import { redirect } from "next/navigation";
import { Badge, ButtonLink, Panel } from "@ogfi/ui";
import { AppShell } from "@/components/AppShell";
import { getSessionContext } from "@/server/services/context";
import {
  getDashboardSnapshotItems,
  getModulePreviewActions
} from "@/server/mockups/modulePreviewAccess";
import { getDefaultAppRoute } from "@/server/services/authorization";
import type { ShellActiveNav } from "@/components/ShellNavigation";

type PreviewMetric = {
  label: string;
  value: string;
  tone?: "neutral" | "info" | "success" | "warning";
};

type PreviewRow = {
  title: string;
  detail: string;
  status: string;
  owner: string;
  date: string;
};

type PreviewStage = {
  label: string;
  value: string;
  tone?: "neutral" | "info" | "success" | "warning";
};

export type PreviewBoardCard = {
  title: string;
  detail: string;
  owner: string;
  meta: string;
  tone?: "neutral" | "info" | "success" | "warning";
};

export type PreviewBoardLane = {
  title: string;
  cards: PreviewBoardCard[];
};

type PreviewCalendarItem = {
  day: string;
  date: string;
  title: string;
  detail: string;
  tone?: "neutral" | "info" | "success" | "warning";
};

type PreviewReportItem = {
  title: string;
  detail: string;
  cadence: string;
  format: string;
  owner: string;
};

type PreviewFinanceLine = {
  source: string;
  reference: string;
  debit: string;
  credit: string;
  status: string;
};

type PreviewAlertItem = {
  title: string;
  detail: string;
  priority: string;
  channel: string;
  owner: string;
};

type PreviewSettingItem = {
  title: string;
  detail: string;
  status: string;
  scope: string;
};

type PreviewPipelineStage = {
  title: string;
  count: string;
  detail: string;
  status: string;
};

type PreviewReadinessItem = {
  title: string;
  status: string;
  detail: string;
  owner: string;
};

type PreviewDocumentItem = {
  title: string;
  site: string;
  owner: string;
  due: string;
  status: string;
};

type PreviewDashboardItem = {
  title: string;
  value: string;
  detail: string;
  status: string;
};

export type ModulePreviewConfig = {
  activeNav: ShellActiveNav;
  title: string;
  subtitle: string;
  eyebrow: string;
  summary: string;
  primaryLabel: string;
  secondaryLabel: string;
  metrics: PreviewMetric[];
  stages: PreviewStage[];
  rows: PreviewRow[];
  board?: PreviewBoardLane[];
  calendar?: PreviewCalendarItem[];
  reports?: PreviewReportItem[];
  financeLines?: PreviewFinanceLine[];
  alerts?: PreviewAlertItem[];
  settings?: PreviewSettingItem[];
  pipeline?: PreviewPipelineStage[];
  readiness?: PreviewReadinessItem[];
  documents?: PreviewDocumentItem[];
  dashboardItems?: PreviewDashboardItem[];
  focus: string[];
  requiresAdmin?: boolean;
};

function statusTone(status: string) {
  if (status.includes("Approved") || status.includes("Ready") || status.includes("Live")) {
    return "success" as const;
  }
  if (status.includes("Blocked") || status.includes("Overdue") || status.includes("Risk")) {
    return "warning" as const;
  }
  if (status.includes("Review") || status.includes("Pending") || status.includes("Draft")) {
    return "warning" as const;
  }
  return "info" as const;
}

export async function ModulePreviewPage({ config }: { config: ModulePreviewConfig }) {
  const session = await getSessionContext();
  if (!session) {
    redirect("/sign-in");
  }
  const canAdminister = session.permissionCodes.includes("core.administer");

  if (config.requiresAdmin && !canAdminister) {
    redirect(getDefaultAppRoute(session.permissionCodes));
  }

  const { primaryAction, secondaryAction } = getModulePreviewActions(
    config,
    canAdminister,
    session.permissionCodes
  );
  const branchSnapshotItems = getDashboardSnapshotItems(session, canAdminister);
  const isFinancePreview = config.eyebrow === "Finance";

  return (
    <AppShell
      activeNav={config.activeNav}
      session={session}
      subtitle={config.subtitle}
      title={config.title}
    >
      <div className="grid gap-4">
        <div className="ogfi-preview-banner">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold">
                {isFinancePreview
                  ? "Finance preview mode. This screen uses sample accounting data for planning and walkthroughs only."
                  : "Preview mode. This screen uses sample data for planning and walkthroughs only."}
              </p>
              <p className="mt-1 text-xs text-amber-900/80">
                {isFinancePreview
                  ? "No journal, invoice, payment, reconciliation, period close, posting, or source-document status is created or changed here."
                  : "Actions route to available ERP areas or preview-safe destinations; no procurement, inventory, approval, finance, expansion, or marketing source records are created or changed here."}
              </p>
            </div>
            <span>Preview only</span>
          </div>
        </div>

        <Panel className="ogfi-detail-card">
          <div className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr] lg:items-start">
            <div>
              <Badge tone="info">{config.eyebrow}</Badge>
              <h2 className="mt-3 text-2xl font-bold text-slate-950">{config.title}</h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
                {config.summary}
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                <ButtonLink href={primaryAction.href} className="bg-blue-600 hover:bg-blue-700">
                  {primaryAction.label}
                </ButtonLink>
                <ButtonLink
                  href={secondaryAction.href}
                  className="bg-slate-100 text-blue-700 hover:bg-blue-50"
                >
                  {secondaryAction.label}
                </ButtonLink>
              </div>
            </div>
            <div className="ogfi-record-summary grid gap-3 p-4">
              {config.focus.map((item) => (
                <div key={item} className="flex items-start gap-3">
                  <span className="mt-1 h-2 w-2 rounded-full bg-blue-600" />
                  <p className="text-sm font-medium text-slate-700">{item}</p>
                </div>
              ))}
            </div>
          </div>
        </Panel>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {config.metrics.map((metric) => (
            <Panel key={metric.label} className="ogfi-detail-card">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-500">{metric.label}</p>
                  <p className="mt-2 text-3xl font-bold text-slate-950">{metric.value}</p>
                </div>
                <Badge tone={metric.tone ?? "info"}>Preview</Badge>
              </div>
            </Panel>
          ))}
        </div>

        {config.board ? (
          <section className="ogfi-data-surface">
            <div className="ogfi-section-header">
              <div>
                <h2 className="text-lg font-bold text-slate-950">Board Preview</h2>
                <p className="text-sm text-slate-500">
                  Lane-based mockup for client walkthrough only
                </p>
              </div>
              <Badge tone="warning">Mock data</Badge>
            </div>
            <div className="grid gap-4 overflow-x-auto p-4 lg:grid-cols-4">
              {config.board.map((lane) => (
                <div
                  key={lane.title}
                  className="ogfi-board-column min-w-64"
                >
                  <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-3 py-3">
                    <h3 className="text-sm font-bold uppercase text-slate-600">
                      {lane.title}
                    </h3>
                    <Badge>{lane.cards.length}</Badge>
                  </div>
                  <div className="grid gap-3 p-3">
                    {lane.cards.map((card) => (
                      <article
                        key={`${lane.title}-${card.title}`}
                        className="ogfi-board-card"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <h4 className="text-sm font-bold text-slate-950">
                            {card.title}
                          </h4>
                          <Badge tone={card.tone ?? "info"}>{card.meta}</Badge>
                        </div>
                        <p className="mt-2 text-xs leading-5 text-slate-600">
                          {card.detail}
                        </p>
                        <div className="mt-3 flex items-center justify-between gap-2 border-t border-slate-100 pt-3 text-xs text-slate-500">
                          <span>{card.owner}</span>
                          <span>Preview</span>
                        </div>
                      </article>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {config.calendar ? (
          <section className="ogfi-data-surface">
            <div className="ogfi-section-header">
              <div>
                <h2 className="text-lg font-bold text-slate-950">Calendar Preview</h2>
                <p className="text-sm text-slate-500">
                  Schedule-style mockup for milestone and activation planning
                </p>
              </div>
              <Badge tone="warning">Mock data</Badge>
            </div>
            <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-7">
              {config.calendar.map((item) => (
                <article
                  key={`${item.day}-${item.date}-${item.title}`}
                  className="ogfi-record-summary min-h-44 p-4"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-xs font-bold uppercase text-slate-400">
                        {item.day}
                      </p>
                      <p className="text-2xl font-bold text-slate-950">{item.date}</p>
                    </div>
                    <Badge tone={item.tone ?? "info"}>Plan</Badge>
                  </div>
                  <div className="mt-4 rounded-lg border border-slate-200 bg-white p-3">
                    <p className="text-sm font-bold text-slate-950">{item.title}</p>
                    <p className="mt-2 text-xs leading-5 text-slate-600">{item.detail}</p>
                  </div>
                </article>
              ))}
            </div>
          </section>
        ) : null}

        {config.reports ? (
          <section className="ogfi-data-surface">
            <div className="ogfi-section-header">
              <div>
                <h2 className="text-lg font-bold text-slate-950">Report Catalog</h2>
                <p className="text-sm text-slate-500">
                  Export and exception-report mockup for management review
                </p>
              </div>
              <Badge tone="warning">Mock data</Badge>
            </div>
            <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">
              {config.reports.map((report) => (
                <article
                  key={report.title}
                  className="ogfi-record-summary p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-bold text-slate-950">
                        {report.title}
                      </h3>
                      <p className="mt-2 text-xs leading-5 text-slate-600">
                        {report.detail}
                      </p>
                    </div>
                    <Badge tone="info">{report.format}</Badge>
                  </div>
                  <dl className="mt-4 grid gap-2 border-t border-slate-200 pt-3 text-xs">
                    <div className="flex justify-between gap-3">
                      <dt className="text-slate-500">Cadence</dt>
                      <dd className="font-semibold text-slate-800">{report.cadence}</dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-slate-500">Owner</dt>
                      <dd className="font-semibold text-slate-800">{report.owner}</dd>
                    </div>
                  </dl>
                </article>
              ))}
            </div>
          </section>
        ) : null}

        {config.financeLines ? (
          <section className="ogfi-data-surface">
            <div className="ogfi-section-header">
              <div>
                <h2 className="text-lg font-bold text-slate-950">Accounting Preview</h2>
                <p className="text-sm text-slate-500">
                  Source-linked ledger and matching view for finance walkthroughs
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {isFinancePreview ? <Badge>Read-only chain</Badge> : null}
                <Badge tone="warning">Mock data</Badge>
              </div>
            </div>
            <div className="hidden grid-cols-[1fr_1fr_0.7fr_0.7fr_0.7fr] gap-3 border-b border-slate-100 px-4 py-3 text-xs font-bold uppercase text-slate-400 md:grid">
              <span>Source</span>
              <span>Reference</span>
              <span>Debit</span>
              <span>Credit</span>
              <span>Status</span>
            </div>
            <div className="divide-y divide-slate-100">
              {config.financeLines.map((line) => (
                <div
                  key={`${line.source}-${line.reference}`}
                  className="ogfi-list-row grid gap-3 md:grid-cols-[1fr_1fr_0.7fr_0.7fr_0.7fr] md:items-center"
                >
                  <div>
                    <p className="font-semibold text-slate-950">{line.source}</p>
                    <p className="text-xs text-slate-500">Source linked</p>
                  </div>
                  <p className="text-sm text-slate-600">{line.reference}</p>
                  <p className="text-sm font-semibold text-slate-900 md:text-right">
                    {line.debit}
                  </p>
                  <p className="text-sm font-semibold text-slate-900 md:text-right">
                    {line.credit}
                  </p>
                  <Badge tone={statusTone(line.status)}>{line.status}</Badge>
                </div>
              ))}
            </div>
            {isFinancePreview ? (
              <div className="border-t border-slate-100 bg-slate-50 px-4 py-3 text-xs text-slate-600">
                Finance lines are source-chain previews only; posted, locked, payment-ready,
                and period-close states remain governed by future approved finance controls.
              </div>
            ) : null}
          </section>
        ) : null}

        {config.alerts ? (
          <section className="ogfi-data-surface">
            <div className="ogfi-section-header">
              <div>
                <h2 className="text-lg font-bold text-slate-950">Alert Inbox</h2>
                <p className="text-sm text-slate-500">
                  Operational notification mockup with source-record context
                </p>
              </div>
              <Badge tone="warning">Mock data</Badge>
            </div>
            <div className="grid gap-3 p-4 lg:grid-cols-2">
              {config.alerts.map((alert) => (
                <article
                  key={alert.title}
                  className="ogfi-record-summary p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-bold text-slate-950">{alert.title}</p>
                      <p className="mt-2 text-xs leading-5 text-slate-600">
                        {alert.detail}
                      </p>
                    </div>
                    <Badge tone={statusTone(alert.priority)}>{alert.priority}</Badge>
                  </div>
                  <div className="mt-4 grid gap-2 border-t border-slate-200 pt-3 text-xs sm:grid-cols-2">
                    <p className="text-slate-500">
                      Channel <span className="font-semibold text-slate-800">{alert.channel}</span>
                    </p>
                    <p className="text-slate-500">
                      Owner <span className="font-semibold text-slate-800">{alert.owner}</span>
                    </p>
                  </div>
                </article>
              ))}
            </div>
          </section>
        ) : null}

        {config.settings ? (
          <section className="ogfi-data-surface">
            <div className="ogfi-section-header">
              <div>
                <h2 className="text-lg font-bold text-slate-950">Configuration Console</h2>
                <p className="text-sm text-slate-500">
                  Policy and master-data setup mockup for client review
                </p>
              </div>
              <Badge tone="warning">Mock data</Badge>
            </div>
            <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-4">
              {config.settings.map((setting) => (
                <article
                  key={setting.title}
                  className="ogfi-record-summary p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="text-sm font-bold text-slate-950">{setting.title}</h3>
                    <Badge tone={statusTone(setting.status)}>{setting.status}</Badge>
                  </div>
                  <p className="mt-3 text-xs leading-5 text-slate-600">{setting.detail}</p>
                  <p className="mt-4 border-t border-slate-200 pt-3 text-xs font-semibold text-slate-500">
                    {setting.scope}
                  </p>
                </article>
              ))}
            </div>
          </section>
        ) : null}

        {config.pipeline ? (
          <section className="ogfi-data-surface">
            <div className="ogfi-section-header">
              <div>
                <h2 className="text-lg font-bold text-slate-950">Pipeline Preview</h2>
                <p className="text-sm text-slate-500">
                  Stage-gate mockup for site, build, and opening readiness review
                </p>
              </div>
              <Badge tone="warning">Mock data</Badge>
            </div>
            <div className="grid gap-3 p-4 lg:grid-cols-5">
              {config.pipeline.map((stage, index, stages) => (
                <article
                  key={stage.title}
                  className="ogfi-record-summary relative p-4"
                >
                  {index < stages.length - 1 ? (
                    <span className="absolute right-[-0.7rem] top-1/2 hidden h-px w-5 bg-slate-300 lg:block" />
                  ) : null}
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-bold uppercase text-slate-400">
                        Gate {index + 1}
                      </p>
                      <h3 className="mt-1 text-sm font-bold text-slate-950">
                        {stage.title}
                      </h3>
                    </div>
                    <Badge tone={statusTone(stage.status)}>{stage.status}</Badge>
                  </div>
                  <p className="mt-4 text-3xl font-bold text-slate-950">{stage.count}</p>
                  <p className="mt-2 text-xs leading-5 text-slate-600">{stage.detail}</p>
                </article>
              ))}
            </div>
          </section>
        ) : null}

        {config.readiness ? (
          <section className="ogfi-data-surface">
            <div className="ogfi-section-header">
              <div>
                <h2 className="text-lg font-bold text-slate-950">Readiness Preview</h2>
                <p className="text-sm text-slate-500">
                  Launch dependency mockup for branch execution planning
                </p>
              </div>
              <Badge tone="warning">Mock data</Badge>
            </div>
            <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-5">
              {config.readiness.map((item) => (
                <article
                  key={item.title}
                  className="ogfi-record-summary p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="text-sm font-bold text-slate-950">{item.title}</h3>
                    <Badge tone={statusTone(item.status)}>{item.status}</Badge>
                  </div>
                  <p className="mt-3 min-h-12 text-xs leading-5 text-slate-600">
                    {item.detail}
                  </p>
                  <p className="mt-4 border-t border-slate-200 pt-3 text-xs font-semibold text-slate-500">
                    {item.owner}
                  </p>
                </article>
              ))}
            </div>
          </section>
        ) : null}

        {config.documents ? (
          <section className="ogfi-data-surface">
            <div className="ogfi-section-header">
              <div>
                <h2 className="text-lg font-bold text-slate-950">Document Register</h2>
                <p className="text-sm text-slate-500">
                  Permit, lease, and site-document mockup for expansion review
                </p>
              </div>
              <Badge tone="warning">Mock data</Badge>
            </div>
            <div className="hidden grid-cols-[1.1fr_0.85fr_0.75fr_0.6fr_0.6fr] gap-3 border-b border-slate-100 px-4 py-3 text-xs font-bold uppercase text-slate-400 md:grid">
              <span>Document</span>
              <span>Site</span>
              <span>Owner</span>
              <span>Due</span>
              <span>Status</span>
            </div>
            <div className="divide-y divide-slate-100">
              {config.documents.map((document) => (
                <div
                  key={`${document.title}-${document.site}`}
                  className="ogfi-list-row grid gap-3 md:grid-cols-[1.1fr_0.85fr_0.75fr_0.6fr_0.6fr] md:items-center"
                >
                  <div>
                    <p className="font-semibold text-slate-950">{document.title}</p>
                    <p className="text-xs text-slate-500">Expansion source document</p>
                  </div>
                  <p className="text-sm text-slate-600">{document.site}</p>
                  <p className="text-sm font-medium text-slate-700">{document.owner}</p>
                  <p className="text-sm text-slate-600">{document.due}</p>
                  <Badge tone={statusTone(document.status)}>{document.status}</Badge>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {config.dashboardItems ? (
          <section className="ogfi-data-surface">
            <div className="ogfi-section-header">
              <div>
                <h2 className="text-lg font-bold text-slate-950">Operations Control Room</h2>
                <p className="text-sm text-slate-500">
                  Branch action queue and exception-summary mockup
                </p>
              </div>
              <Badge tone="warning">Mock data</Badge>
            </div>
            <div className="grid gap-4 p-4 xl:grid-cols-[1.1fr_0.9fr]">
              <div className="grid gap-3 sm:grid-cols-2">
                {config.dashboardItems.map((item) => (
                  <article
                    key={item.title}
                    className="ogfi-record-summary p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-500">{item.title}</p>
                        <p className="mt-2 text-3xl font-bold text-slate-950">
                          {item.value}
                        </p>
                      </div>
                      <Badge tone={statusTone(item.status)}>{item.status}</Badge>
                    </div>
                    <p className="mt-3 text-xs leading-5 text-slate-600">{item.detail}</p>
                  </article>
                ))}
              </div>
              <div className="ogfi-record-summary p-4">
                <h3 className="text-sm font-bold uppercase text-slate-500">
                  {canAdminister ? "Branch Status Snapshot" : "Current Scope Snapshot"}
                </h3>
                <div className="mt-4 grid gap-3">
                  {branchSnapshotItems.map(({ branch, detail, status }) => (
                    <div
                      key={branch}
                      className="grid grid-cols-[1fr_auto] items-center gap-3 rounded-lg border border-slate-200 bg-white p-3"
                    >
                      <div>
                        <p className="text-sm font-semibold text-slate-950">{branch}</p>
                        <p className="text-xs text-slate-500">{detail}</p>
                      </div>
                      <Badge tone={statusTone(status)}>{status}</Badge>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>
        ) : null}

        <div className="grid gap-4 xl:grid-cols-[0.85fr_1.15fr]">
          <Panel className="ogfi-detail-card">
            <h2 className="text-lg font-bold text-slate-950">Status Flow</h2>
            <div className="mt-4 grid gap-3">
              {config.stages.map((stage) => (
                <div
                  key={stage.label}
                  className="grid grid-cols-[1fr_auto] items-center gap-3 rounded-lg border border-slate-200 bg-white p-3"
                >
                  <div>
                    <p className="text-sm font-semibold text-slate-950">{stage.label}</p>
                    <p className="text-xs text-slate-500">{stage.value}</p>
                  </div>
                  <Badge tone={stage.tone ?? "neutral"}>{stage.tone ?? "Open"}</Badge>
                </div>
              ))}
            </div>
          </Panel>

          <section className="ogfi-data-surface">
            <div className="ogfi-section-header">
              <h2 className="text-lg font-bold text-slate-950">Client Preview List</h2>
              <Badge tone="warning">Mock data</Badge>
            </div>
            <div className="hidden grid-cols-[1.1fr_1fr_0.75fr_0.75fr] gap-3 border-b border-slate-100 px-4 py-3 text-xs font-bold uppercase text-slate-400 md:grid">
              <span>Record</span>
              <span>Context</span>
              <span>Status</span>
              <span>Owner</span>
            </div>
            <div className="divide-y divide-slate-100">
              {config.rows.map((row) => (
                <div
                  key={`${row.title}-${row.date}`}
                  className="ogfi-list-row grid gap-3 md:grid-cols-[1.1fr_1fr_0.75fr_0.75fr] md:items-center"
                >
                  <div>
                    <p className="font-semibold text-slate-950">{row.title}</p>
                    <p className="text-xs text-slate-500">{row.date}</p>
                  </div>
                  <p className="text-sm text-slate-600">{row.detail}</p>
                  <Badge tone={statusTone(row.status)}>{row.status}</Badge>
                  <p className="text-sm font-medium text-slate-700">{row.owner}</p>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </AppShell>
  );
}
