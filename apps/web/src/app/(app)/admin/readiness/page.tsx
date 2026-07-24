import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  AlertTriangle,
  BadgeCheck,
  CalendarDays,
  ClipboardCheck,
  FileCheck2,
  ShieldCheck
} from "lucide-react";
import { Badge, PaginationBar, Panel } from "@ogfi/ui";
import { ActionFeedbackBanner } from "@/components/ActionFeedbackBanner";
import { AppShell } from "@/components/AppShell";
import { EntryModal } from "@/components/EntryModal";
import {
  actionErrorRedirectPath,
  getActionFeedback
} from "@/server/services/actionFeedback";
import { getDefaultAppRoute, permissions } from "@/server/services/authorization";
import { getSessionContext } from "@/server/services/context";
import { canExportReleaseReadiness } from "@/server/services/exportAuthorization";
import {
  createDeploymentEvidenceRecord,
  createEnablementEvidenceRecord,
  createReleaseBoardDecision,
  createUatEvidenceRecord,
  deploymentEvidenceTypes,
  enablementEvidenceTypes,
  getReleaseSecurityEvidenceSummary,
  getUatEvidenceSummary,
  getDeploymentEvidenceRecord,
  getDeploymentEvidenceSummary,
  getEnablementEvidenceRecord,
  getEnablementEvidenceSummary,
  getUatEvidenceRecord,
  listDeploymentEvidencePage,
  listEnablementEvidencePage,
  listReleaseBoardDecisions,
  listReleaseReadinessGates,
  listReleaseReadinessGatePage,
  listUatEvidencePage,
  releaseBoardDecisions,
  releaseReadinessCategories,
  releaseReadinessStatuses,
  summarizeReleaseReadiness,
  uatEvidenceResults,
  uatEvidenceTypes,
  uatWorkflowAreaOptions,
  updateDeploymentEvidenceStatus,
  updateEnablementEvidenceStatus,
  updateReleaseReadinessGate,
  updateUatEvidenceStatus
} from "@/server/services/releaseReadiness";

export const dynamic = "force-dynamic";

type AdminReadinessPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type ReleaseReadinessGate = Awaited<
  ReturnType<typeof listReleaseReadinessGates>
>[number];

function getSearchParam(
  searchParams: Record<string, string | string[] | undefined>,
  key: string
) {
  const value = searchParams[key];
  return Array.isArray(value) ? value[0] : value;
}

function normalizeCategory(value: string | undefined) {
  return releaseReadinessCategories.some((category) => category.id === value)
    ? value!
    : releaseReadinessCategories[0]!.id;
}

function readinessTone(status: ReleaseReadinessGate["status"]) {
  if (status === "READY") {
    return "success" as const;
  }
  if (status === "CONDITIONAL_GO" || status === "WAIVED") {
    return "warning" as const;
  }
  if (status === "HOLD") {
    return "destructive" as const;
  }
  return "info" as const;
}

function statusLabel(status: ReleaseReadinessGate["status"]) {
  return status.replaceAll("_", " ");
}

function evidenceTypeLabel(type: string) {
  return type
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function enablementEvidenceTypeLabel(type: string) {
  return evidenceTypeLabel(type);
}

function uatEvidenceTypeLabel(type: string) {
  return evidenceTypeLabel(type);
}

function boardDecisionLabel(decision: string) {
  return decision.replaceAll("_", " ");
}

async function updateReadinessGateAction(formData: FormData) {
  "use server";

  try {
    await updateReleaseReadinessGate(formData);
  } catch (error) {
    redirect(actionErrorRedirectPath("/admin/readiness", error));
  }
  revalidatePath("/admin/readiness");
  redirect("/admin/readiness");
}

async function createDeploymentEvidenceAction(formData: FormData) {
  "use server";

  try {
    await createDeploymentEvidenceRecord(formData);
  } catch (error) {
    redirect(actionErrorRedirectPath("/admin/readiness?category=deployment", error));
  }
  revalidatePath("/admin/readiness");
  redirect("/admin/readiness?category=deployment");
}

async function updateDeploymentEvidenceAction(formData: FormData) {
  "use server";
  const context = new URLSearchParams({ category: "deployment" });
  for (const key of ["deploymentQ", "deploymentType", "deploymentStatus", "deploymentEnvironment", "deploymentPage", "deploymentPageSize", "deploymentEvidenceId"]) {
    const value = formData.get(key);
    if (typeof value === "string" && value.length > 0 && value.length <= 160) context.set(key, value);
  }
  const returnPath = `/admin/readiness?${context.toString()}`;

  try {
    await updateDeploymentEvidenceStatus(formData);
  } catch (error) {
    redirect(actionErrorRedirectPath(returnPath, error));
  }
  revalidatePath("/admin/readiness");
  redirect(returnPath);
}

async function createUatEvidenceAction(formData: FormData) {
  "use server";

  try {
    await createUatEvidenceRecord(formData);
  } catch (error) {
    redirect(actionErrorRedirectPath("/admin/readiness?category=uat", error));
  }
  revalidatePath("/admin/readiness");
  redirect("/admin/readiness?category=uat");
}

async function updateUatEvidenceAction(formData: FormData) {
  "use server";

  const context = new URLSearchParams({ category: "uat" });
  for (const key of ["uatQ", "uatEvidenceType", "uatResult", "uatVerificationStatus", "uatWorkflowArea", "uatEnvironment", "uatPage", "uatPageSize", "evidenceId"]) {
    const value = formData.get(key);
    if (typeof value === "string" && value.length > 0 && value.length <= 160) context.set(key, value);
  }
  const returnPath = `/admin/readiness?${context.toString()}`;

  try {
    await updateUatEvidenceStatus(formData);
  } catch (error) {
    redirect(actionErrorRedirectPath(returnPath, error));
  }
  revalidatePath("/admin/readiness");
  redirect(returnPath);
}

async function createEnablementEvidenceAction(formData: FormData) {
  "use server";

  try {
    await createEnablementEvidenceRecord(formData);
  } catch (error) {
    redirect(actionErrorRedirectPath("/admin/readiness?category=enablement", error));
  }
  revalidatePath("/admin/readiness");
  redirect("/admin/readiness?category=enablement");
}

async function updateEnablementEvidenceAction(formData: FormData) {
  "use server";
  const context = new URLSearchParams({ category: "enablement" });
  for (const key of ["enablementQ", "enablementType", "enablementStatus", "enablementAudienceRole", "enablementPage", "enablementPageSize", "enablementEvidenceId"]) {
    const value = formData.get(key);
    if (typeof value === "string" && value.length > 0 && value.length <= 160) context.set(key, value);
  }
  const returnPath = `/admin/readiness?${context.toString()}`;

  try {
    await updateEnablementEvidenceStatus(formData);
  } catch (error) {
    redirect(actionErrorRedirectPath(returnPath, error));
  }
  revalidatePath("/admin/readiness");
  redirect(returnPath);
}

async function createReleaseBoardDecisionAction(formData: FormData) {
  "use server";

  try {
    await createReleaseBoardDecision(formData);
  } catch (error) {
    redirect(actionErrorRedirectPath("/admin/readiness?category=go_no_go", error));
  }
  revalidatePath("/admin/readiness");
  redirect("/admin/readiness?category=go_no_go");
}

export default async function AdminReadinessPage({
  searchParams
}: AdminReadinessPageProps) {
  const session = await getSessionContext();
  if (!session) {
    redirect("/sign-in");
  }
  if (!session.permissionCodes.includes(permissions.coreAdminister)) {
    redirect(getDefaultAppRoute(session.permissionCodes));
  }

  const params = searchParams ? await searchParams : {};
  const actionFeedback = getActionFeedback(params);
  const selectedCategory = normalizeCategory(getSearchParam(params, "category")) as (typeof releaseReadinessCategories)[number]["id"];
  const gates = await listReleaseReadinessGates(session);
  const summary = summarizeReleaseReadiness(gates);
  const canExportReadiness = canExportReleaseReadiness(session);
  const category = releaseReadinessCategories.find(
    (item) => item.id === selectedCategory
  )!;
  const query = getSearchParam(params, "q") ?? "";
  const statusValue = getSearchParam(params, "status");
  const selectedStatus = releaseReadinessStatuses.includes(statusValue as (typeof releaseReadinessStatuses)[number])
    ? (statusValue as (typeof releaseReadinessStatuses)[number])
    : undefined;
  const pageValue = Number.parseInt(getSearchParam(params, "page") ?? "1", 10);
  const pageSizeValue = Number.parseInt(getSearchParam(params, "pageSize") ?? "10", 10);
  const uatQuery = (getSearchParam(params, "uatQ") ?? "").slice(0, 120);
  const uatEvidenceTypeValue = getSearchParam(params, "uatEvidenceType");
  const uatEvidenceType = uatEvidenceTypes.includes(uatEvidenceTypeValue as (typeof uatEvidenceTypes)[number])
    ? (uatEvidenceTypeValue as (typeof uatEvidenceTypes)[number])
    : undefined;
  const uatResultValue = getSearchParam(params, "uatResult");
  const uatResult = uatEvidenceResults.includes(uatResultValue as (typeof uatEvidenceResults)[number])
    ? (uatResultValue as (typeof uatEvidenceResults)[number])
    : undefined;
  const uatStatusValue = getSearchParam(params, "uatVerificationStatus");
  const uatVerificationStatus = ["RECORDED", "VERIFIED", "REJECTED"].includes(uatStatusValue ?? "")
    ? (uatStatusValue as "RECORDED" | "VERIFIED" | "REJECTED")
    : undefined;
  const uatWorkflowArea = (getSearchParam(params, "uatWorkflowArea") ?? "").slice(0, 120);
  const uatEnvironment = (getSearchParam(params, "uatEnvironment") ?? "").slice(0, 80);
  const uatPageValue = Number.parseInt(getSearchParam(params, "uatPage") ?? "1", 10);
  const uatPageSizeValue = Number.parseInt(getSearchParam(params, "uatPageSize") ?? "10", 10);
  const gatePage = await listReleaseReadinessGatePage(session, {
    category: selectedCategory,
    query,
    ...(selectedStatus ? { status: selectedStatus } : {}),
    page: Number.isFinite(pageValue) ? Math.min(Math.max(pageValue, 1), 10_000) : 1,
    pageSize: Number.isFinite(pageSizeValue) ? Math.min(Math.max(pageSizeValue, 10), 100) : 10,
  });
  const visibleGates = gatePage.items;
  const uatEvidenceSummary = selectedCategory === "uat"
    ? await getUatEvidenceSummary(session)
    : null;
  const uatEvidencePage = selectedCategory === "uat"
    ? await listUatEvidencePage(session, {
        query: uatQuery,
        evidenceType: uatEvidenceType,
        result: uatResult,
        verificationStatus: uatVerificationStatus,
        workflowArea: uatWorkflowArea,
        environment: uatEnvironment,
        page: Number.isFinite(uatPageValue) ? Math.min(Math.max(uatPageValue, 1), 10_000) : 1,
        pageSize: Number.isFinite(uatPageSizeValue) ? Math.min(Math.max(uatPageSizeValue, 10), 100) : 10,
      })
    : { items: [], page: 1, pageSize: 10, totalItems: 0 };
  const selectedUatEvidence = selectedCategory === "uat" && getSearchParam(params, "evidenceId")
    ? await getUatEvidenceRecord(session, getSearchParam(params, "evidenceId") as string)
    : null;
  const uatContextParams = new URLSearchParams({ category: "uat", uatPage: String(uatEvidencePage.page), uatPageSize: String(uatEvidencePage.pageSize) });
  if (uatQuery) uatContextParams.set("uatQ", uatQuery);
  if (uatEvidenceType) uatContextParams.set("uatEvidenceType", uatEvidenceType);
  if (uatResult) uatContextParams.set("uatResult", uatResult);
  if (uatVerificationStatus) uatContextParams.set("uatVerificationStatus", uatVerificationStatus);
  if (uatWorkflowArea) uatContextParams.set("uatWorkflowArea", uatWorkflowArea);
  if (uatEnvironment) uatContextParams.set("uatEnvironment", uatEnvironment);
  const uatContextHref = `/admin/readiness?${uatContextParams.toString()}`;
  const securityEvidenceSummary =
    selectedCategory === "security"
      ? await getReleaseSecurityEvidenceSummary(session)
      : null;
  const deploymentQ = (getSearchParam(params, "deploymentQ") ?? "").slice(0, 120);
  const deploymentTypeValue = getSearchParam(params, "deploymentType");
  const deploymentEvidenceType = deploymentEvidenceTypes.includes(deploymentTypeValue as (typeof deploymentEvidenceTypes)[number]) ? (deploymentTypeValue as (typeof deploymentEvidenceTypes)[number]) : undefined;
  const deploymentStatusValue = getSearchParam(params, "deploymentStatus");
  const deploymentVerificationStatus = ["RECORDED", "VERIFIED", "REJECTED"].includes(deploymentStatusValue ?? "") ? (deploymentStatusValue as "RECORDED" | "VERIFIED" | "REJECTED") : undefined;
  const deploymentEnvironment = (getSearchParam(params, "deploymentEnvironment") ?? "").slice(0, 80);
  const deploymentPageValue = Number.parseInt(getSearchParam(params, "deploymentPage") ?? "1", 10);
  const deploymentPageSizeValue = Number.parseInt(getSearchParam(params, "deploymentPageSize") ?? "10", 10);
  const deploymentEvidencePage = selectedCategory === "deployment" ? await listDeploymentEvidencePage(session, {
    query: deploymentQ,
    evidenceType: deploymentEvidenceType,
    verificationStatus: deploymentVerificationStatus,
    environment: deploymentEnvironment,
    page: Number.isFinite(deploymentPageValue) ? Math.min(Math.max(deploymentPageValue, 1), 10_000) : 1,
    pageSize: Number.isFinite(deploymentPageSizeValue) ? Math.min(Math.max(deploymentPageSizeValue, 10), 100) : 10,
  }) : { items: [], page: 1, pageSize: 10, totalItems: 0 };
  const deploymentContextParams = new URLSearchParams({ category: "deployment", deploymentPage: String(deploymentEvidencePage.page), deploymentPageSize: String(deploymentEvidencePage.pageSize) });
  if (deploymentQ) deploymentContextParams.set("deploymentQ", deploymentQ);
  if (deploymentEvidenceType) deploymentContextParams.set("deploymentType", deploymentEvidenceType);
  if (deploymentVerificationStatus) deploymentContextParams.set("deploymentStatus", deploymentVerificationStatus);
  if (deploymentEnvironment) deploymentContextParams.set("deploymentEnvironment", deploymentEnvironment);
  const deploymentContextHref = `/admin/readiness?${deploymentContextParams.toString()}`;
  const selectedDeploymentEvidence = selectedCategory === "deployment" && getSearchParam(params, "deploymentEvidenceId")
    ? await getDeploymentEvidenceRecord(session, getSearchParam(params, "deploymentEvidenceId") as string)
    : null;
  const deploymentEvidenceSummary = selectedCategory === "deployment" ? await getDeploymentEvidenceSummary(session) : null;
  const enablementQ = (getSearchParam(params, "enablementQ") ?? "").slice(0, 120);
  const enablementTypeValue = getSearchParam(params, "enablementType");
  const enablementEvidenceType = enablementEvidenceTypes.includes(enablementTypeValue as (typeof enablementEvidenceTypes)[number]) ? (enablementTypeValue as (typeof enablementEvidenceTypes)[number]) : undefined;
  const enablementStatusValue = getSearchParam(params, "enablementStatus");
  const enablementVerificationStatus = ["RECORDED", "VERIFIED", "REJECTED"].includes(enablementStatusValue ?? "") ? (enablementStatusValue as "RECORDED" | "VERIFIED" | "REJECTED") : undefined;
  const enablementAudienceRole = (getSearchParam(params, "enablementAudienceRole") ?? "").slice(0, 120);
  const enablementPageValue = Number.parseInt(getSearchParam(params, "enablementPage") ?? "1", 10);
  const enablementPageSizeValue = Number.parseInt(getSearchParam(params, "enablementPageSize") ?? "10", 10);
  const enablementEvidencePage = selectedCategory === "enablement" ? await listEnablementEvidencePage(session, {
    query: enablementQ,
    evidenceType: enablementEvidenceType,
    verificationStatus: enablementVerificationStatus,
    audienceRole: enablementAudienceRole,
    page: Number.isFinite(enablementPageValue) ? Math.min(Math.max(enablementPageValue, 1), 10_000) : 1,
    pageSize: Number.isFinite(enablementPageSizeValue) ? Math.min(Math.max(enablementPageSizeValue, 10), 100) : 10,
  }) : { items: [], page: 1, pageSize: 10, totalItems: 0 };
  const enablementContextParams = new URLSearchParams({ category: "enablement", enablementPage: String(enablementEvidencePage.page), enablementPageSize: String(enablementEvidencePage.pageSize) });
  if (enablementQ) enablementContextParams.set("enablementQ", enablementQ);
  if (enablementEvidenceType) enablementContextParams.set("enablementType", enablementEvidenceType);
  if (enablementVerificationStatus) enablementContextParams.set("enablementStatus", enablementVerificationStatus);
  if (enablementAudienceRole) enablementContextParams.set("enablementAudienceRole", enablementAudienceRole);
  const enablementContextHref = `/admin/readiness?${enablementContextParams.toString()}`;
  const selectedEnablementEvidence = selectedCategory === "enablement" && getSearchParam(params, "enablementEvidenceId")
    ? await getEnablementEvidenceRecord(session, getSearchParam(params, "enablementEvidenceId") as string)
    : null;
  const enablementEvidenceSummary = selectedCategory === "enablement" ? await getEnablementEvidenceSummary(session) : null;
  const releaseBoardDecisionRecords =
    selectedCategory === "go_no_go" ? await listReleaseBoardDecisions(session) : [];
  const exportGeneratedAt = new Date().toISOString();
  const exportGeneratedAtParam = encodeURIComponent(exportGeneratedAt);
  const exportHref = `/admin/readiness/export?generatedAt=${exportGeneratedAtParam}`;
  const exportChecksumHref = `${exportHref}&format=sha256`;
  const phase3UatCoverage = uatEvidenceSummary
    ? [
        {
          label: "Phase 3 finance",
          ready: uatEvidenceSummary.phase3FinanceReady,
          detail: "Scenario and acceptance matrix evidence"
        },
        {
          label: "Phase 3 workforce",
          ready: uatEvidenceSummary.phase3WorkforceReady,
          detail: "Scenario and acceptance matrix evidence"
        },
        {
          label: "Deferred blockers",
          ready: uatEvidenceSummary.phase3DeferredBlockerReviewReady,
          detail: "Defect disposition and revision register"
        }
      ]
    : [];

  return (
    <AppShell
      session={session}
      title="Release Readiness"
      subtitle="UAT, deployment, enablement, and GO / NO-GO gates"
      activeNav="admin-readiness"
    >
      <ActionFeedbackBanner feedback={actionFeedback} />

      <section className="mb-5 overflow-hidden rounded-2xl border border-blue-200 bg-white shadow-[var(--shadow-surface)]">
        <div className="grid gap-5 bg-gradient-to-br from-blue-50 via-white to-slate-50 p-5 lg:grid-cols-[1.25fr_0.75fr] lg:p-6">
          <div>
            <Badge tone="info">Release governance</Badge>
            <h2 className="mt-3 text-2xl font-bold text-slate-950">
              Keep pilot readiness explicit, evidence-backed, and auditable.
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              These gates mirror DEC-0036 and the ERP evidence pack across the
              active delivery phases. They do not approve release by themselves;
              they track owner evidence, conditions, holds, and waivers before
              the final GO / NO-GO review.
            </p>
            {canExportReadiness ? (
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <a
                  className="inline-flex min-h-10 items-center rounded-md border border-blue-200 bg-white px-4 text-sm font-semibold text-blue-700 shadow-sm hover:bg-blue-50"
                  href={exportHref}
                >
                  Export Readiness Register
                </a>
                <a
                  className="inline-flex min-h-10 items-center rounded-md border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
                  href={exportChecksumHref}
                >
                  Download SHA-256
                </a>
                <span className="max-w-xl text-xs leading-5 text-slate-500">
                  Download both files in this view together; the checksum file
                  matches this CSV timestamp. Browser CSV responses also include
                  X-OGFI-CSV-SHA256.
                </span>
              </div>
            ) : null}
          </div>
          <div className="rounded-xl border border-blue-100 bg-white/85 p-4">
            <div className="flex items-start gap-3">
              <ShieldCheck aria-hidden="true" className="mt-0.5 h-5 w-5 text-blue-600" />
              <div>
                <p className="font-semibold text-slate-950">Controlled changes</p>
                <p className="mt-1 text-sm text-slate-600">
                  Readiness updates require Core Admin permission, company Manage
                  scope, a reason, and audit history.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mb-5 grid gap-4 md:grid-cols-5">
        <Panel className="ogfi-detail-card">
          <p className="text-sm font-semibold text-slate-500">Total gates</p>
          <p className="mt-2 text-3xl font-bold text-slate-950">{summary.total}</p>
        </Panel>
        <Panel className="ogfi-detail-card">
          <p className="text-sm font-semibold text-slate-500">Required</p>
          <p className="mt-2 text-3xl font-bold text-slate-950">{summary.required}</p>
        </Panel>
        <Panel className="ogfi-detail-card">
          <p className="text-sm font-semibold text-slate-500">Ready / waived</p>
          <p className="mt-2 text-3xl font-bold text-emerald-700">{summary.ready}</p>
        </Panel>
        <Panel className="ogfi-detail-card">
          <p className="text-sm font-semibold text-slate-500">Still blocking</p>
          <p className="mt-2 text-3xl font-bold text-amber-700">{summary.blocking}</p>
        </Panel>
        <Panel className="ogfi-detail-card">
          <p className="text-sm font-semibold text-slate-500">Hold gates</p>
          <p className="mt-2 text-3xl font-bold text-rose-700">{summary.hold}</p>
        </Panel>
      </section>

      <section
        className={`mb-5 rounded-2xl border p-4 ${
          summary.canProceed
            ? "border-emerald-200 bg-emerald-50 text-emerald-950"
            : "border-amber-200 bg-amber-50 text-amber-950"
        }`}
      >
        <div className="flex items-start gap-3">
          {summary.canProceed ? (
            <BadgeCheck aria-hidden="true" className="mt-0.5 h-5 w-5" />
          ) : (
            <AlertTriangle aria-hidden="true" className="mt-0.5 h-5 w-5" />
          )}
          <div>
            <p className="font-bold">
              {summary.canProceed
                ? "All required gates are ready for final review"
                : "Release remains blocked until required gates are ready or formally waived"}
            </p>
            <p className="mt-1 text-sm leading-6">
              Final release still requires signed evidence, owner review, and the
              GO / NO-GO decision record.
            </p>
          </div>
        </div>
      </section>

      <section className="ogfi-data-surface mb-5 p-2">
        <div className="grid gap-2 lg:grid-cols-5">
          {releaseReadinessCategories.map((item) => {
            const isActive = item.id === selectedCategory;
            const count = gatePage.categoryCounts[item.id] ?? 0;
            return (
              <a
                key={item.id}
                aria-current={isActive ? "page" : undefined}
                className={
                  isActive
                    ? "rounded-xl bg-blue-50 px-4 py-3 text-blue-700 ring-1 ring-blue-100"
                    : "rounded-xl px-4 py-3 text-slate-600 hover:bg-slate-50 hover:text-slate-950"
                }
                href={`/admin/readiness?${new URLSearchParams({
                  category: item.id,
                  ...(query ? { q: query } : {}),
                  ...(selectedStatus ? { status: selectedStatus } : {}),
                }).toString()}`}
              >
                <span className="block text-sm font-bold">{item.label}</span>
                <span className="mt-1 block text-xs text-slate-500">
                  {count} gate{count === 1 ? "" : "s"}
                </span>
              </a>
            );
          })}
        </div>
      </section>

      <form className="mb-5 grid gap-3 rounded-xl border border-slate-200 bg-white p-4 md:grid-cols-[1fr_12rem_auto_auto] md:items-end" method="get">
        <input name="category" type="hidden" value={selectedCategory} />
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Search gates
          <input
            className="min-h-10 rounded-md border border-slate-300 px-3 py-2"
            defaultValue={query}
            name="q"
            placeholder="Gate, owner, or description"
          />
        </label>
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Status
          <select className="min-h-10 rounded-md border border-slate-300 px-3 py-2" defaultValue={selectedStatus ?? ""} name="status">
            <option value="">All statuses</option>
            {releaseReadinessStatuses.map((status) => <option key={status} value={status}>{statusLabel(status)}</option>)}
          </select>
        </label>
        <button className="min-h-10 rounded-md bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700" type="submit">Apply</button>
        <a className="inline-flex min-h-10 items-center justify-center rounded-md border border-slate-300 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50" href={`/admin/readiness?category=${selectedCategory}`}>Reset</a>
      </form>

      <Panel className="ogfi-detail-card">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <ClipboardCheck aria-hidden="true" className="h-5 w-5 text-blue-600" />
              <h2 className="text-lg font-bold text-slate-950">{category.label}</h2>
            </div>
            <p className="mt-1 text-sm text-slate-500">{category.description}</p>
            <p className="mt-2 text-xs font-semibold text-slate-500">Showing {visibleGates.length} of {gatePage.totalItems} gates</p>
            {selectedCategory === "uat" ? (
              <p className="mt-2 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-800">
                UAT gates require evidence plus a decision note naming owner
                signoff, finding disposition, or DEC-0036 default revision.
              </p>
            ) : null}
            {uatEvidenceSummary ? (
              <p className="mt-2 rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">
                UAT gates require verified scenario execution, defect disposition,
                policy trace, acceptance matrix, and default revision evidence with
                no unresolved failed or blocked results. For Phase 3 gates, use
                workflow-area labels such as Phase 3 finance controlled foundation,
                Phase 3 workforce controlled foundation, or Phase 3 deferred
                blocker review so coverage is traceable.
              </p>
            ) : null}
            {securityEvidenceSummary ? (
              <p className="mt-2 rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">
                Security gates should not be marked ready while MFA evidence,
                provider invalidation, break-glass post-review, or controlled
                access request items still need attention. Final GO / NO-GO also
                requires approved external-security proof references with the same
                evidence run ID and the marker RESULT | PASS | External security
                proof captured.
              </p>
            ) : null}
            {deploymentEvidenceSummary ? (
              <p className="mt-2 rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">
                Deployment gates require verified evidence for migration, backup,
                restore rehearsal, rollback path, smoke testing, and monitoring or
                hypercare before they can be marked ready.
              </p>
            ) : null}
            {enablementEvidenceSummary ? (
              <p className="mt-2 rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">
                Enablement gates require verified training signoff, known-limit
                acknowledgement, support-route confirmation, KB review, release-note
                review, and training-impact evidence before they can be marked ready.
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            {uatEvidenceSummary ? (
              <EntryModal
                title="Record UAT Evidence"
                triggerLabel="Record Evidence"
                triggerClassName="border border-blue-200 bg-blue-600 text-white hover:bg-blue-700"
              >
                <form
                  action={createUatEvidenceAction}
                  className="ogfi-form-shell mt-4 grid gap-4"
                >
                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="grid gap-1 text-sm font-medium text-slate-700">
                      Evidence type
                      <select
                        className="rounded-md border border-slate-300 px-3 py-2"
                        name="evidenceType"
                        required
                      >
                        {uatEvidenceTypes.map((type) => (
                          <option key={type} value={type}>
                            {uatEvidenceTypeLabel(type)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="grid gap-1 text-sm font-medium text-slate-700">
                      Result
                      <select
                        className="rounded-md border border-slate-300 px-3 py-2"
                        name="result"
                        required
                      >
                        {uatEvidenceResults.map((result) => (
                          <option key={result} value={result}>
                            {result.replaceAll("_", " ")}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <label className="grid gap-1 text-sm font-medium text-slate-700">
                    Title
                    <input
                      className="rounded-md border border-slate-300 px-3 py-2"
                      name="title"
                      placeholder="PR approval denied-path scenario executed"
                      required
                    />
                  </label>
                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="grid gap-1 text-sm font-medium text-slate-700">
                      Workflow area
                      <select
                        className="rounded-md border border-slate-300 px-3 py-2"
                        name="workflowArea"
                        required
                      >
                        {uatWorkflowAreaOptions.map((area) => (
                          <option key={area} value={area}>
                            {area}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="grid gap-1 text-sm font-medium text-slate-700">
                      Environment
                      <input
                        className="rounded-md border border-slate-300 px-3 py-2"
                        name="environment"
                        placeholder="Staging, pilot"
                        required
                      />
                    </label>
                  </div>
                  <label className="grid gap-1 text-sm font-medium text-slate-700">
                    Evidence reference
                    <input
                      className="rounded-md border border-slate-300 px-3 py-2"
                      name="evidenceReference"
                      placeholder="UAT sheet, screenshot pack, defect ticket, signoff packet"
                      required
                    />
                  </label>
                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="grid gap-1 text-sm font-medium text-slate-700">
                      Executed at
                      <input
                        className="rounded-md border border-slate-300 px-3 py-2"
                        name="executedAt"
                        type="datetime-local"
                        required
                      />
                    </label>
                    <label className="grid gap-1 text-sm font-medium text-slate-700">
                      Tester / owner
                      <input
                        className="rounded-md border border-slate-300 px-3 py-2"
                        name="testerName"
                        placeholder="QA lead, process owner, tester"
                        required
                      />
                    </label>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="grid gap-1 text-sm font-medium text-slate-700">
                      Policy version
                      <input
                        className="rounded-md border border-slate-300 px-3 py-2"
                        name="policyVersion"
                        placeholder="DEC-0036"
                      />
                    </label>
                    <label className="grid gap-1 text-sm font-medium text-slate-700">
                      Defect reference
                      <input
                        className="rounded-md border border-slate-300 px-3 py-2"
                        name="defectReference"
                        placeholder="Optional ticket or waiver reference"
                      />
                    </label>
                  </div>
                  <label className="grid gap-1 text-sm font-medium text-slate-700">
                    Notes
                    <textarea
                      className="min-h-20 rounded-md border border-slate-300 px-3 py-2"
                      name="notes"
                      placeholder="Device, browser, retest notes, finding disposition, or owner signoff"
                    />
                  </label>
                  <label className="grid gap-1 text-sm font-medium text-slate-700">
                    Reason for recording
                    <textarea
                      className="min-h-20 rounded-md border border-slate-300 px-3 py-2"
                      name="reason"
                      required
                    />
                  </label>
                  <button className="min-h-10 rounded-md bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700">
                    Save Evidence
                  </button>
                </form>
              </EntryModal>
            ) : null}
            {deploymentEvidenceSummary ? (
              <EntryModal
                title="Record Deployment Evidence"
                triggerLabel="Record Evidence"
                triggerClassName="border border-blue-200 bg-blue-600 text-white hover:bg-blue-700"
              >
                <form
                  action={createDeploymentEvidenceAction}
                  className="ogfi-form-shell mt-4 grid gap-4"
                >
                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="grid gap-1 text-sm font-medium text-slate-700">
                      Evidence type
                      <select
                        className="rounded-md border border-slate-300 px-3 py-2"
                        name="evidenceType"
                        required
                      >
                        {deploymentEvidenceTypes.map((type) => (
                          <option key={type} value={type}>
                            {evidenceTypeLabel(type)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="grid gap-1 text-sm font-medium text-slate-700">
                      Environment
                      <input
                        className="rounded-md border border-slate-300 px-3 py-2"
                        name="environment"
                        placeholder="Staging, pilot, production"
                        required
                      />
                    </label>
                  </div>
                  <label className="grid gap-1 text-sm font-medium text-slate-700">
                    Title
                    <input
                      className="rounded-md border border-slate-300 px-3 py-2"
                      name="title"
                      placeholder="Staging restore rehearsal completed"
                      required
                    />
                  </label>
                  <label className="grid gap-1 text-sm font-medium text-slate-700">
                    Evidence reference
                    <input
                      className="rounded-md border border-slate-300 px-3 py-2"
                      name="evidenceReference"
                      placeholder="Checklist, runbook, ticket, artifact, or screenshot reference"
                      required
                    />
                  </label>
                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="grid gap-1 text-sm font-medium text-slate-700">
                      Performed at
                      <input
                        className="rounded-md border border-slate-300 px-3 py-2"
                        name="performedAt"
                        type="datetime-local"
                        required
                      />
                    </label>
                    <label className="grid gap-1 text-sm font-medium text-slate-700">
                      Performed by
                      <input
                        className="rounded-md border border-slate-300 px-3 py-2"
                        name="performedBy"
                        placeholder="Person, team, or vendor"
                        required
                      />
                    </label>
                  </div>
                  <label className="grid gap-1 text-sm font-medium text-slate-700">
                    Notes
                    <textarea
                      className="min-h-20 rounded-md border border-slate-300 px-3 py-2"
                      name="notes"
                      placeholder="Scope, checksum result, rollback notes, or known limits"
                    />
                  </label>
                  <label className="grid gap-1 text-sm font-medium text-slate-700">
                    Reason for recording
                    <textarea
                      className="min-h-20 rounded-md border border-slate-300 px-3 py-2"
                      name="reason"
                      required
                    />
                  </label>
                  <button className="min-h-10 rounded-md bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700">
                    Save Evidence
                  </button>
                </form>
              </EntryModal>
            ) : null}
            {enablementEvidenceSummary ? (
              <EntryModal
                title="Record Enablement Evidence"
                triggerLabel="Record Evidence"
                triggerClassName="border border-blue-200 bg-blue-600 text-white hover:bg-blue-700"
              >
                <form
                  action={createEnablementEvidenceAction}
                  className="ogfi-form-shell mt-4 grid gap-4"
                >
                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="grid gap-1 text-sm font-medium text-slate-700">
                      Evidence type
                      <select
                        className="rounded-md border border-slate-300 px-3 py-2"
                        name="evidenceType"
                        required
                      >
                        {enablementEvidenceTypes.map((type) => (
                          <option key={type} value={type}>
                            {enablementEvidenceTypeLabel(type)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="grid gap-1 text-sm font-medium text-slate-700">
                      Audience / role
                      <input
                        className="rounded-md border border-slate-300 px-3 py-2"
                        name="audienceRole"
                        placeholder="Branch managers, storekeepers, purchasing"
                        required
                      />
                    </label>
                  </div>
                  <label className="grid gap-1 text-sm font-medium text-slate-700">
                    Title
                    <input
                      className="rounded-md border border-slate-300 px-3 py-2"
                      name="title"
                      placeholder="Branch manager training signoff completed"
                      required
                    />
                  </label>
                  <label className="grid gap-1 text-sm font-medium text-slate-700">
                    Evidence reference
                    <input
                      className="rounded-md border border-slate-300 px-3 py-2"
                      name="evidenceReference"
                      placeholder="Attendance sheet, KB review checklist, release note, or training impact reference"
                      required
                    />
                  </label>
                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="grid gap-1 text-sm font-medium text-slate-700">
                      Completed at
                      <input
                        className="rounded-md border border-slate-300 px-3 py-2"
                        name="completedAt"
                        type="datetime-local"
                        required
                      />
                    </label>
                    <label className="grid gap-1 text-sm font-medium text-slate-700">
                      Owner / trainer
                      <input
                        className="rounded-md border border-slate-300 px-3 py-2"
                        name="ownerName"
                        placeholder="Trainer, enablement owner, or reviewer"
                        required
                      />
                    </label>
                  </div>
                  <div className="grid gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                    <label className="flex items-center gap-2">
                      <input name="knownLimitAcknowledged" type="checkbox" />
                      Known limitations were acknowledged by the audience.
                    </label>
                    <label className="flex items-center gap-2">
                      <input name="supportRouteConfirmed" type="checkbox" />
                      Support route and escalation path were confirmed.
                    </label>
                  </div>
                  <label className="grid gap-1 text-sm font-medium text-slate-700">
                    Notes
                    <textarea
                      className="min-h-20 rounded-md border border-slate-300 px-3 py-2"
                      name="notes"
                      placeholder="Coverage, exclusions, trainer notes, known limits, or follow-up"
                    />
                  </label>
                  <label className="grid gap-1 text-sm font-medium text-slate-700">
                    Reason for recording
                    <textarea
                      className="min-h-20 rounded-md border border-slate-300 px-3 py-2"
                      name="reason"
                      required
                    />
                  </label>
                  <button className="min-h-10 rounded-md bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700">
                    Save Evidence
                  </button>
                </form>
              </EntryModal>
            ) : null}
            {selectedCategory === "go_no_go" ? (
              <EntryModal
                title="Record Release Board Decision"
                triggerLabel="Record Decision"
                triggerClassName="border border-blue-200 bg-blue-600 text-white hover:bg-blue-700"
              >
                <form
                  action={createReleaseBoardDecisionAction}
                  className="ogfi-form-shell mt-4 grid gap-4"
                >
                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="grid gap-1 text-sm font-medium text-slate-700">
                      Decision
                      <select
                        className="rounded-md border border-slate-300 px-3 py-2"
                        name="decision"
                        required
                      >
                        {releaseBoardDecisions.map((decision) => (
                          <option key={decision} value={decision}>
                            {boardDecisionLabel(decision)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="grid gap-1 text-sm font-medium text-slate-700">
                      Decided at
                      <input
                        className="rounded-md border border-slate-300 px-3 py-2"
                        name="decidedAt"
                        type="datetime-local"
                        required
                      />
                    </label>
                  </div>
                  <label className="grid gap-1 text-sm font-medium text-slate-700">
                    Evidence reference
                    <input
                      className="rounded-md border border-slate-300 px-3 py-2"
                      name="evidenceReference"
                      placeholder="Signed decision record, meeting minutes, or approval packet"
                      required
                    />
                  </label>
                  <label className="grid gap-1 text-sm font-medium text-slate-700">
                    Participants
                    <textarea
                      className="min-h-24 rounded-md border border-slate-300 px-3 py-2"
                      name="participants"
                      placeholder="Product Owner, QA Lead, Release Manager, Security Owner, Operations Owner, Warehouse/Inventory Owner, Enablement Owner"
                      required
                    />
                  </label>
                  <label className="grid gap-1 text-sm font-medium text-slate-700">
                    Decision note
                    <textarea
                      className="min-h-28 rounded-md border border-slate-300 px-3 py-2"
                      name="decisionNote"
                      placeholder="Decision basis, conditions, rollback trigger, mitigation, owner, expiry, or forward-fix plan"
                      required
                    />
                  </label>
                  <label className="grid gap-1 text-sm font-medium text-slate-700">
                    Reason for recording
                    <textarea
                      className="min-h-20 rounded-md border border-slate-300 px-3 py-2"
                      name="reason"
                      required
                    />
                  </label>
                  <button className="min-h-10 rounded-md bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700">
                    Save Decision
                  </button>
                </form>
              </EntryModal>
            ) : null}
            <Badge tone="info">Source DEC-0036</Badge>
          </div>
        </div>

        {selectedCategory === "uat" && getSearchParam(params, "evidenceId") ? (
          <Panel className="mb-5 border-blue-100 bg-blue-50/40">
            {selectedUatEvidence ? (
              <div className="grid gap-3 text-sm text-slate-700">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Selected UAT evidence</p>
                    <h3 className="text-lg font-bold text-slate-950">{selectedUatEvidence.title}</h3>
                  </div>
                  <Badge tone={selectedUatEvidence.verificationStatus === "VERIFIED" ? "success" : selectedUatEvidence.verificationStatus === "REJECTED" ? "destructive" : "warning"}>{selectedUatEvidence.verificationStatus}</Badge>
                </div>
                <p>{uatEvidenceTypeLabel(selectedUatEvidence.evidenceType)} · {selectedUatEvidence.workflowArea} · {selectedUatEvidence.environment}</p>
                <p>Result: {selectedUatEvidence.result}; executed {new Date(selectedUatEvidence.executedAt).toLocaleString()}; tester {selectedUatEvidence.testerName}</p>
                <p>Reference: {selectedUatEvidence.evidenceReference}</p>
                {selectedUatEvidence.verificationStatus === "RECORDED" ? (
                  selectedUatEvidence.createdByUserId === session.user.id ? (
                    <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900">Another authorized reviewer must verify or reject evidence recorded by you.</p>
                  ) : (
                    <div className="grid gap-2 sm:grid-cols-2">
                      <form action={updateUatEvidenceAction}>
                        <input name="evidenceId" type="hidden" value={selectedUatEvidence.id} />
                        <input name="status" type="hidden" value="VERIFIED" />
                        <input name="reason" type="hidden" value="Verified UAT evidence from the selected evidence review panel." />
                        <input name="uatQ" type="hidden" value={uatQuery} /><input name="uatEvidenceType" type="hidden" value={uatEvidenceType ?? ""} /><input name="uatResult" type="hidden" value={uatResult ?? ""} /><input name="uatVerificationStatus" type="hidden" value={uatVerificationStatus ?? ""} /><input name="uatWorkflowArea" type="hidden" value={uatWorkflowArea} /><input name="uatEnvironment" type="hidden" value={uatEnvironment} /><input name="uatPage" type="hidden" value={String(uatEvidencePage.page)} /><input name="uatPageSize" type="hidden" value={String(uatEvidencePage.pageSize)} />
                        <button className="min-h-11 w-full rounded-md border border-emerald-200 bg-emerald-50 px-3 text-sm font-semibold text-emerald-800 hover:bg-emerald-100">Verify evidence</button>
                      </form>
                      <form action={updateUatEvidenceAction} className="grid gap-2">
                        <input name="evidenceId" type="hidden" value={selectedUatEvidence.id} />
                        <input name="status" type="hidden" value="REJECTED" />
                        <input name="uatQ" type="hidden" value={uatQuery} /><input name="uatEvidenceType" type="hidden" value={uatEvidenceType ?? ""} /><input name="uatResult" type="hidden" value={uatResult ?? ""} /><input name="uatVerificationStatus" type="hidden" value={uatVerificationStatus ?? ""} /><input name="uatWorkflowArea" type="hidden" value={uatWorkflowArea} /><input name="uatEnvironment" type="hidden" value={uatEnvironment} /><input name="uatPage" type="hidden" value={String(uatEvidencePage.page)} /><input name="uatPageSize" type="hidden" value={String(uatEvidencePage.pageSize)} />
                        <input name="reason" className="min-h-11 rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder="Rejection reason (required)" minLength={5} required />
                        <button className="min-h-11 rounded-md border border-rose-200 bg-rose-50 px-3 text-sm font-semibold text-rose-800 hover:bg-rose-100">Reject evidence</button>
                      </form>
                    </div>
                  )
                ) : null}
                <a className="text-sm font-semibold text-blue-700 hover:underline" href={uatContextHref}>Close selected evidence</a>
              </div>
            ) : (
              <p className="text-sm text-slate-700">The selected UAT evidence is unavailable in the current company scope.</p>
            )}
          </Panel>
        ) : null}

        {uatEvidenceSummary ? (
          <div className="mb-5 grid gap-3 lg:grid-cols-4">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Evidence records
              </p>
              <p className="mt-2 text-2xl font-bold text-slate-950">
                {uatEvidenceSummary.total}
              </p>
              <p className="mt-1 text-xs text-slate-600">recorded for UAT</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Verified
              </p>
              <p className="mt-2 text-2xl font-bold text-emerald-700">
                {uatEvidenceSummary.verified}
              </p>
              <p className="mt-1 text-xs text-slate-600">accepted by reviewer</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Needs review
              </p>
              <p className="mt-2 text-2xl font-bold text-amber-700">
                {uatEvidenceSummary.recorded}
              </p>
              <p className="mt-1 text-xs text-slate-600">recorded, not verified</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Failed / blocked
              </p>
              <p className="mt-2 text-2xl font-bold text-rose-700">
                {uatEvidenceSummary.unresolvedResultCount}
              </p>
              <p className="mt-1 text-xs text-slate-600">verified unresolved results</p>
            </div>
            {uatEvidenceSummary.missingTypes.length > 0 ? (
              <div className="rounded-xl border border-amber-100 bg-amber-50 p-4 text-sm text-amber-950 lg:col-span-4">
                <p className="font-bold">Missing verified UAT evidence</p>
                <p className="mt-1">
                  {uatEvidenceSummary.missingTypes.map(uatEvidenceTypeLabel).join(", ")}
                </p>
              </div>
            ) : null}
            <div className="grid gap-3 lg:col-span-4 lg:grid-cols-3">
              {phase3UatCoverage.map((item) => (
                <div
                  key={item.label}
                  className={`rounded-xl border p-4 text-sm ${
                    item.ready
                      ? "border-emerald-200 bg-emerald-50 text-emerald-950"
                      : "border-amber-200 bg-amber-50 text-amber-950"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-bold">{item.label}</p>
                    <Badge tone={item.ready ? "success" : "warning"}>
                      {item.ready ? "Covered" : "Missing"}
                    </Badge>
                  </div>
                  <p className="mt-2 text-xs leading-5">{item.detail}</p>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {deploymentEvidenceSummary ? (
          <div className="mb-5 grid gap-3 lg:grid-cols-4">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Evidence records
              </p>
              <p className="mt-2 text-2xl font-bold text-slate-950">
                {deploymentEvidenceSummary.total}
              </p>
              <p className="mt-1 text-xs text-slate-600">recorded for release</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Verified
              </p>
              <p className="mt-2 text-2xl font-bold text-emerald-700">
                {deploymentEvidenceSummary.verified}
              </p>
              <p className="mt-1 text-xs text-slate-600">accepted by reviewer</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Needs review
              </p>
              <p className="mt-2 text-2xl font-bold text-amber-700">
                {deploymentEvidenceSummary.recorded}
              </p>
              <p className="mt-1 text-xs text-slate-600">recorded, not verified</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Rejected
              </p>
              <p className="mt-2 text-2xl font-bold text-rose-700">
                {deploymentEvidenceSummary.rejected}
              </p>
              <p className="mt-1 text-xs text-slate-600">needs replacement</p>
            </div>
            {deploymentEvidenceSummary.missingMigrationGateTypes.length > 0 ||
            deploymentEvidenceSummary.missingMonitoringGateTypes.length > 0 ? (
              <div className="rounded-xl border border-amber-100 bg-amber-50 p-4 text-sm text-amber-950 lg:col-span-4">
                <p className="font-bold">Missing verified evidence</p>
                {deploymentEvidenceSummary.missingMigrationGateTypes.length > 0 ? (
                  <p className="mt-1">
                    Migration/backup/restore gate:{" "}
                    {deploymentEvidenceSummary.missingMigrationGateTypes
                      .map(evidenceTypeLabel)
                      .join(", ")}
                  </p>
                ) : null}
                {deploymentEvidenceSummary.missingMonitoringGateTypes.length > 0 ? (
                  <p className="mt-1">
                    Monitoring/hypercare gate:{" "}
                    {deploymentEvidenceSummary.missingMonitoringGateTypes
                      .map(evidenceTypeLabel)
                      .join(", ")}
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}

        {enablementEvidenceSummary ? (
          <div className="mb-5 grid gap-3 lg:grid-cols-4">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Evidence records
              </p>
              <p className="mt-2 text-2xl font-bold text-slate-950">
                {enablementEvidenceSummary.total}
              </p>
              <p className="mt-1 text-xs text-slate-600">recorded for enablement</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Verified
              </p>
              <p className="mt-2 text-2xl font-bold text-emerald-700">
                {enablementEvidenceSummary.verified}
              </p>
              <p className="mt-1 text-xs text-slate-600">accepted by reviewer</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Needs review
              </p>
              <p className="mt-2 text-2xl font-bold text-amber-700">
                {enablementEvidenceSummary.recorded}
              </p>
              <p className="mt-1 text-xs text-slate-600">recorded, not verified</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Rejected
              </p>
              <p className="mt-2 text-2xl font-bold text-rose-700">
                {enablementEvidenceSummary.rejected}
              </p>
              <p className="mt-1 text-xs text-slate-600">needs replacement</p>
            </div>
            {enablementEvidenceSummary.missingTrainingGateTypes.length > 0 ||
            enablementEvidenceSummary.missingKbGateTypes.length > 0 ? (
              <div className="rounded-xl border border-amber-100 bg-amber-50 p-4 text-sm text-amber-950 lg:col-span-4">
                <p className="font-bold">Missing verified evidence</p>
                {enablementEvidenceSummary.missingTrainingGateTypes.length > 0 ? (
                  <p className="mt-1">
                    Training signoff gate:{" "}
                    {enablementEvidenceSummary.missingTrainingGateTypes
                      .map(enablementEvidenceTypeLabel)
                      .join(", ")}
                  </p>
                ) : null}
                {enablementEvidenceSummary.missingKbGateTypes.length > 0 ? (
                  <p className="mt-1">
                    KB and release notes gate:{" "}
                    {enablementEvidenceSummary.missingKbGateTypes
                      .map(enablementEvidenceTypeLabel)
                      .join(", ")}
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}

        {securityEvidenceSummary ? (
          <div className="mb-5 grid gap-3 lg:grid-cols-5">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Privileged MFA
              </p>
              <p className="mt-2 text-2xl font-bold text-slate-950">
                {securityEvidenceSummary.verifiedMfaUserCount}/
                {securityEvidenceSummary.privilegedUserCount}
              </p>
              <p className="mt-1 text-xs text-slate-600">
                verified privileged users
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                MFA gaps
              </p>
              <p className="mt-2 text-2xl font-bold text-amber-700">
                {securityEvidenceSummary.pendingMfaUserCount +
                  securityEvidenceSummary.missingOrRevokedMfaUserCount}
              </p>
              <p className="mt-1 text-xs text-slate-600">
                pending, missing, or revoked
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Provider sessions
              </p>
              <p className="mt-2 text-2xl font-bold text-amber-700">
                {securityEvidenceSummary.pendingProviderInvalidationCount}
              </p>
              <p className="mt-1 text-xs text-slate-600">
                pending external invalidation
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Break-glass
              </p>
              <p className="mt-2 text-2xl font-bold text-amber-700">
                {securityEvidenceSummary.openBreakGlassCount +
                  securityEvidenceSummary.breakGlassPostReviewDueCount}
              </p>
              <p className="mt-1 text-xs text-slate-600">
                open or post-review due
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Controlled access
              </p>
              <p className="mt-2 text-2xl font-bold text-amber-700">
                {securityEvidenceSummary.pendingControlledAccessRequestCount}
              </p>
              <p className="mt-1 text-xs text-slate-600">
                pending role or scope request
              </p>
            </div>
            {securityEvidenceSummary.sampleAttentionUsers.length > 0 ? (
              <div className="rounded-xl border border-amber-100 bg-amber-50 p-4 text-sm text-amber-950 lg:col-span-5">
                <p className="font-bold">MFA attention sample</p>
                <p className="mt-1">
                  {securityEvidenceSummary.sampleAttentionUsers.join(", ")}
                </p>
              </div>
            ) : null}
            {securityEvidenceSummary.pendingControlledAccessRequestCount > 0 ? (
              <div className="rounded-xl border border-amber-100 bg-amber-50 p-4 text-sm text-amber-950 lg:col-span-5">
                <p className="font-bold">Controlled access requests need review</p>
                <p className="mt-1">
                  {securityEvidenceSummary.pendingSensitiveRoleRequestCount} sensitive
                  role request
                  {securityEvidenceSummary.pendingSensitiveRoleRequestCount === 1
                    ? ""
                    : "s"}{" "}
                  and {securityEvidenceSummary.pendingHighRiskScopeRequestCount} high-risk
                  scope request
                  {securityEvidenceSummary.pendingHighRiskScopeRequestCount === 1
                    ? ""
                    : "s"}{" "}
                  remain pending before release.
                </p>
              </div>
            ) : null}
            <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-950 lg:col-span-5">
              <p className="font-bold">Final release proof targets</p>
              <p className="mt-1">
                Before final review, Security and IT owners must copy approved
                provider/vault proof references into `external-security/` using:
                `mfa-provider-enrollment-and-runtime-proof.*`,
                `idp-session-invalidation-proof.*`,
                `vault-or-artifact-storage-index.*`, and
                `break-glass-review-and-revocation-proof.*`.
              </p>
            </div>
          </div>
        ) : null}

        {uatEvidenceSummary ? (
          <div className="mb-5 overflow-hidden rounded-xl border border-slate-200">
            <form className="grid gap-3 border-b border-slate-100 bg-slate-50 p-4 md:grid-cols-[1fr_12rem_10rem_12rem_12rem_auto] md:items-end" method="get">
              <input name="category" type="hidden" value="uat" />
              <label className="grid gap-1 text-sm font-medium text-slate-700">Search
                <input className="min-h-11 rounded-md border border-slate-300 bg-white px-3 py-2" name="uatQ" defaultValue={uatQuery} placeholder="Title, reference, or tester" />
              </label>
              <label className="grid gap-1 text-sm font-medium text-slate-700">Evidence type
                <select className="min-h-11 rounded-md border border-slate-300 bg-white px-3 py-2" name="uatEvidenceType" defaultValue={uatEvidenceType ?? ""}><option value="">All types</option>{uatEvidenceTypes.map((type) => <option key={type} value={type}>{uatEvidenceTypeLabel(type)}</option>)}</select>
              </label>
              <label className="grid gap-1 text-sm font-medium text-slate-700">Result
                <select className="min-h-11 rounded-md border border-slate-300 bg-white px-3 py-2" name="uatResult" defaultValue={uatResult ?? ""}><option value="">All results</option>{uatEvidenceResults.map((result) => <option key={result} value={result}>{result.replaceAll("_", " ")}</option>)}</select>
              </label>
              <label className="grid gap-1 text-sm font-medium text-slate-700">Review status
                <select className="min-h-11 rounded-md border border-slate-300 bg-white px-3 py-2" name="uatVerificationStatus" defaultValue={uatVerificationStatus ?? ""}><option value="">All statuses</option>{["RECORDED", "VERIFIED", "REJECTED"].map((status) => <option key={status} value={status}>{status}</option>)}</select>
              </label>
              <label className="grid gap-1 text-sm font-medium text-slate-700">Environment
                <input className="min-h-11 rounded-md border border-slate-300 bg-white px-3 py-2" name="uatEnvironment" defaultValue={uatEnvironment} placeholder="Staging" />
              </label>
              <label className="grid gap-1 text-sm font-medium text-slate-700">Workflow area
                <select className="min-h-11 rounded-md border border-slate-300 bg-white px-3 py-2" name="uatWorkflowArea" defaultValue={uatWorkflowArea}><option value="">All workflow areas</option>{uatWorkflowAreaOptions.map((area) => <option key={area} value={area}>{area}</option>)}</select>
              </label>
              <button className="min-h-11 rounded-md bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700" type="submit">Apply</button>
            </form>
            <div className="grid gap-3 border-b border-slate-100 bg-slate-50 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 md:grid-cols-[12rem_1fr_10rem_9rem_12rem]">
              <span>Type</span>
              <span>Evidence</span>
              <span>Result</span>
              <span>Status</span>
              <span>Control</span>
            </div>
            {uatEvidencePage.items.length > 0 ? (
              <div className="divide-y divide-slate-100">
                {uatEvidencePage.items.map((record) => (
                  <div
                    key={record.id}
                    className="grid gap-3 px-4 py-4 text-sm md:grid-cols-[12rem_1fr_10rem_9rem_12rem] md:items-center"
                  >
                    <div>
                      <p className="font-semibold text-slate-950">
                        {uatEvidenceTypeLabel(record.evidenceType)}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {new Date(record.executedAt).toLocaleDateString()}
                      </p>
                    </div>
                    <div>
                      <a className="font-semibold text-blue-700 hover:underline" href={`/admin/readiness?${new URLSearchParams(`${uatContextParams.toString()}&evidenceId=${record.id}`).toString()}`}>{record.title}</a>
                      <p className="mt-1 text-xs text-slate-600">
                        {record.evidenceReference}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {record.workflowArea} / {record.environment}; tester{" "}
                        {record.testerName}
                      </p>
                      {record.defectReference ? (
                        <p className="mt-1 text-xs text-amber-700">
                          Defect: {record.defectReference}
                        </p>
                      ) : null}
                    </div>
                    <Badge
                      tone={
                        record.result === "PASS" || record.result === "RETEST_PASS"
                          ? "success"
                          : record.result === "WAIVED"
                            ? "warning"
                            : "destructive"
                      }
                    >
                      {record.result.replaceAll("_", " ")}
                    </Badge>
                    <Badge
                      tone={
                        record.verificationStatus === "VERIFIED"
                          ? "success"
                          : record.verificationStatus === "REJECTED"
                            ? "destructive"
                            : "warning"
                      }
                    >
                      {record.verificationStatus.replaceAll("_", " ")}
                    </Badge>
                    <a className="min-h-11 inline-flex items-center justify-center rounded-md border border-blue-200 px-3 text-xs font-semibold text-blue-700 hover:bg-blue-50" href={`/admin/readiness?${new URLSearchParams(`${uatContextParams.toString()}&evidenceId=${record.id}`).toString()}`}>Open evidence</a>
                  </div>
                ))}
              </div>
            ) : (
              <div className="px-4 py-6 text-sm text-slate-600">
                No UAT evidence recorded yet.
              </div>
            )}
            <PaginationBar
              className="border-t border-slate-100 px-4 py-3"
              page={uatEvidencePage.page}
              pageSize={uatEvidencePage.pageSize}
              totalItems={uatEvidencePage.totalItems}
              itemLabel="UAT evidence records"
              getPageHref={(nextPage) => {
                const next = new URLSearchParams({ category: "uat", uatPage: String(nextPage), uatPageSize: String(uatEvidencePage.pageSize) });
                if (uatQuery) next.set("uatQ", uatQuery);
                if (uatEvidenceType) next.set("uatEvidenceType", uatEvidenceType);
                if (uatResult) next.set("uatResult", uatResult);
                if (uatVerificationStatus) next.set("uatVerificationStatus", uatVerificationStatus);
                if (uatWorkflowArea) next.set("uatWorkflowArea", uatWorkflowArea);
                if (uatEnvironment) next.set("uatEnvironment", uatEnvironment);
                return `/admin/readiness?${next.toString()}`;
              }}
            />
          </div>
        ) : null}

        {selectedCategory === "deployment" && getSearchParam(params, "deploymentEvidenceId") ? (
          <Panel className="mb-5 border-blue-100 bg-blue-50/40">
            {selectedDeploymentEvidence ? (
              <div className="grid gap-3 text-sm text-slate-700">
                <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Selected deployment evidence</p><h3 className="text-lg font-bold text-slate-950">{selectedDeploymentEvidence.title}</h3></div><Badge tone={selectedDeploymentEvidence.verificationStatus === "VERIFIED" ? "success" : selectedDeploymentEvidence.verificationStatus === "REJECTED" ? "destructive" : "warning"}>{selectedDeploymentEvidence.verificationStatus}</Badge></div>
                <p>{evidenceTypeLabel(selectedDeploymentEvidence.evidenceType)} · {selectedDeploymentEvidence.environment} · performed by {selectedDeploymentEvidence.performedBy}</p>
                <p>Performed {new Date(selectedDeploymentEvidence.performedAt).toLocaleString()}; reference {selectedDeploymentEvidence.evidenceReference}</p>
                {selectedDeploymentEvidence.verificationStatus === "RECORDED" ? (selectedDeploymentEvidence.createdByUserId === session.user.id ? <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 font-semibold text-amber-900">Another authorized reviewer must review evidence recorded by you.</p> : <div className="grid gap-2 sm:grid-cols-2"><form action={updateDeploymentEvidenceAction}><input name="evidenceId" type="hidden" value={selectedDeploymentEvidence.id} /><input name="status" type="hidden" value="VERIFIED" /><input name="reason" type="hidden" value="Verified deployment evidence from the selected evidence review panel." /><input name="deploymentQ" type="hidden" value={deploymentQ} /><input name="deploymentType" type="hidden" value={deploymentEvidenceType ?? ""} /><input name="deploymentStatus" type="hidden" value={deploymentVerificationStatus ?? ""} /><input name="deploymentEnvironment" type="hidden" value={deploymentEnvironment} /><input name="deploymentPage" type="hidden" value={String(deploymentEvidencePage.page)} /><input name="deploymentPageSize" type="hidden" value={String(deploymentEvidencePage.pageSize)} /><input name="deploymentEvidenceId" type="hidden" value={selectedDeploymentEvidence.id} /><button className="min-h-11 w-full rounded-md border border-emerald-200 bg-emerald-50 px-3 text-sm font-semibold text-emerald-800">Verify evidence</button></form><form action={updateDeploymentEvidenceAction} className="grid gap-2"><input name="evidenceId" type="hidden" value={selectedDeploymentEvidence.id} /><input name="status" type="hidden" value="REJECTED" /><input name="reason" className="min-h-11 rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder="Rejection reason (required)" minLength={5} required /><input name="deploymentQ" type="hidden" value={deploymentQ} /><input name="deploymentType" type="hidden" value={deploymentEvidenceType ?? ""} /><input name="deploymentStatus" type="hidden" value={deploymentVerificationStatus ?? ""} /><input name="deploymentEnvironment" type="hidden" value={deploymentEnvironment} /><input name="deploymentPage" type="hidden" value={String(deploymentEvidencePage.page)} /><input name="deploymentPageSize" type="hidden" value={String(deploymentEvidencePage.pageSize)} /><input name="deploymentEvidenceId" type="hidden" value={selectedDeploymentEvidence.id} /><button className="min-h-11 rounded-md border border-rose-200 bg-rose-50 px-3 text-sm font-semibold text-rose-800">Reject evidence</button></form></div>) : null}
                <a className="font-semibold text-blue-700 hover:underline" href={deploymentContextHref}>Close selected evidence</a>
              </div>
            ) : <p className="text-sm text-slate-700">The selected deployment evidence is unavailable in the current company scope.</p>}
          </Panel>
        ) : null}

        {deploymentEvidenceSummary ? (
          <div className="mb-5 overflow-hidden rounded-xl border border-slate-200">
            <form className="grid gap-3 border-b border-slate-100 bg-slate-50 p-4 md:grid-cols-[1fr_12rem_12rem_auto] md:items-end" method="get"><input name="category" type="hidden" value="deployment" /><label className="grid gap-1 text-sm font-medium text-slate-700">Search<input className="min-h-11 rounded-md border border-slate-300 bg-white px-3 py-2" name="deploymentQ" defaultValue={deploymentQ} placeholder="Title, reference, or performer" /></label><label className="grid gap-1 text-sm font-medium text-slate-700">Evidence type<select className="min-h-11 rounded-md border border-slate-300 bg-white px-3 py-2" name="deploymentType" defaultValue={deploymentEvidenceType ?? ""}><option value="">All types</option>{deploymentEvidenceTypes.map((type) => <option key={type} value={type}>{evidenceTypeLabel(type)}</option>)}</select></label><label className="grid gap-1 text-sm font-medium text-slate-700">Review status<select className="min-h-11 rounded-md border border-slate-300 bg-white px-3 py-2" name="deploymentStatus" defaultValue={deploymentVerificationStatus ?? ""}><option value="">All statuses</option>{["RECORDED", "VERIFIED", "REJECTED"].map((status) => <option key={status} value={status}>{status}</option>)}</select></label><button className="min-h-11 rounded-md bg-blue-600 px-4 text-sm font-semibold text-white" type="submit">Apply</button></form>
            <div className="grid gap-3 border-b border-slate-100 bg-slate-50 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 md:grid-cols-[10rem_1fr_9rem_9rem_12rem]">
              <span>Type</span>
              <span>Evidence</span>
              <span>Environment</span>
              <span>Status</span>
              <span>Control</span>
            </div>
            {deploymentEvidencePage.items.length > 0 ? (
              <div className="divide-y divide-slate-100">
                {deploymentEvidencePage.items.map((record) => (
                  <div
                    key={record.id}
                    className="grid gap-3 px-4 py-4 text-sm md:grid-cols-[10rem_1fr_9rem_9rem_12rem] md:items-center"
                  >
                    <div>
                      <p className="font-semibold text-slate-950">
                        {evidenceTypeLabel(record.evidenceType)}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {new Date(record.performedAt).toLocaleDateString()}
                      </p>
                    </div>
                    <div>
                      <p className="font-semibold text-slate-950">{record.title}</p>
                      <p className="mt-1 text-xs text-slate-600">
                        {record.evidenceReference}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        Performed by {record.performedBy}; recorded by{" "}
                        {record.createdByUser.displayName ||
                          record.createdByUser.email}
                      </p>
                    </div>
                    <p className="text-slate-700">{record.environment}</p>
                    <Badge
                      tone={
                        record.verificationStatus === "VERIFIED"
                          ? "success"
                          : record.verificationStatus === "REJECTED"
                            ? "destructive"
                            : "warning"
                      }
                    >
                      {record.verificationStatus.replaceAll("_", " ")}
                    </Badge>
                    <a className="min-h-11 inline-flex items-center justify-center rounded-md border border-blue-200 px-3 text-xs font-semibold text-blue-700 hover:bg-blue-50" href={`/admin/readiness?${new URLSearchParams(`${deploymentContextParams.toString()}&deploymentEvidenceId=${record.id}`).toString()}`}>Open evidence</a>
                  </div>
                ))}
              </div>
            ) : (
              <div className="px-4 py-6 text-sm text-slate-600">
                No deployment evidence recorded yet.
              </div>
            )}
            <PaginationBar
              className="border-t border-slate-100 px-4 py-3"
              page={deploymentEvidencePage.page}
              pageSize={deploymentEvidencePage.pageSize}
              totalItems={deploymentEvidencePage.totalItems}
              itemLabel="deployment evidence records"
              getPageHref={(nextPage) => {
                const next = new URLSearchParams({ category: "deployment", deploymentPage: String(nextPage), deploymentPageSize: String(deploymentEvidencePage.pageSize) });
                if (deploymentQ) next.set("deploymentQ", deploymentQ);
                if (deploymentEvidenceType) next.set("deploymentType", deploymentEvidenceType);
                if (deploymentVerificationStatus) next.set("deploymentStatus", deploymentVerificationStatus);
                if (deploymentEnvironment) next.set("deploymentEnvironment", deploymentEnvironment);
                return `/admin/readiness?${next.toString()}`;
              }}
            />
          </div>
        ) : null}

        {selectedCategory === "enablement" && getSearchParam(params, "enablementEvidenceId") ? (
          <Panel className="mb-5 border-blue-100 bg-blue-50/40">
            {selectedEnablementEvidence ? (
              <div className="grid gap-3 text-sm text-slate-700">
                <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Selected enablement evidence</p><h3 className="text-lg font-bold text-slate-950">{selectedEnablementEvidence.title}</h3></div><Badge tone={selectedEnablementEvidence.verificationStatus === "VERIFIED" ? "success" : selectedEnablementEvidence.verificationStatus === "REJECTED" ? "destructive" : "warning"}>{selectedEnablementEvidence.verificationStatus}</Badge></div>
                <p>{enablementEvidenceTypeLabel(selectedEnablementEvidence.evidenceType)} · {selectedEnablementEvidence.audienceRole} · owner {selectedEnablementEvidence.ownerName}</p>
                <p>Completed {new Date(selectedEnablementEvidence.completedAt).toLocaleString()}; reference {selectedEnablementEvidence.evidenceReference}</p>
                {selectedEnablementEvidence.verificationStatus === "RECORDED" ? (selectedEnablementEvidence.createdByUserId === session.user.id ? <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 font-semibold text-amber-900">Another authorized reviewer must review evidence recorded by you.</p> : <div className="grid gap-2 sm:grid-cols-2"><form action={updateEnablementEvidenceAction}><input name="evidenceId" type="hidden" value={selectedEnablementEvidence.id} /><input name="status" type="hidden" value="VERIFIED" /><input name="reason" type="hidden" value="Verified enablement evidence from the selected evidence review panel." /><input name="enablementQ" type="hidden" value={enablementQ} /><input name="enablementType" type="hidden" value={enablementEvidenceType ?? ""} /><input name="enablementStatus" type="hidden" value={enablementVerificationStatus ?? ""} /><input name="enablementAudienceRole" type="hidden" value={enablementAudienceRole} /><input name="enablementPage" type="hidden" value={String(enablementEvidencePage.page)} /><input name="enablementPageSize" type="hidden" value={String(enablementEvidencePage.pageSize)} /><input name="enablementEvidenceId" type="hidden" value={selectedEnablementEvidence.id} /><button className="min-h-11 w-full rounded-md border border-emerald-200 bg-emerald-50 px-3 text-sm font-semibold text-emerald-800">Verify evidence</button></form><form action={updateEnablementEvidenceAction} className="grid gap-2"><input name="evidenceId" type="hidden" value={selectedEnablementEvidence.id} /><input name="status" type="hidden" value="REJECTED" /><input name="reason" className="min-h-11 rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder="Rejection reason (required)" minLength={5} required /><button className="min-h-11 rounded-md border border-rose-200 bg-rose-50 px-3 text-sm font-semibold text-rose-800">Reject evidence</button></form></div>) : null}
                <a className="font-semibold text-blue-700 hover:underline" href={enablementContextHref}>Close selected evidence</a>
              </div>
            ) : <p className="text-sm text-slate-700">The selected enablement evidence is unavailable in the current company scope.</p>}
          </Panel>
        ) : null}

        {enablementEvidenceSummary ? (
          <div className="mb-5 overflow-hidden rounded-xl border border-slate-200">
            <form className="grid gap-3 border-b border-slate-100 bg-slate-50 p-4 md:grid-cols-[1fr_12rem_12rem_auto] md:items-end" method="get"><input name="category" type="hidden" value="enablement" /><label className="grid gap-1 text-sm font-medium text-slate-700">Search<input className="min-h-11 rounded-md border border-slate-300 bg-white px-3 py-2" name="enablementQ" defaultValue={enablementQ} placeholder="Title, reference, owner, or audience" /></label><label className="grid gap-1 text-sm font-medium text-slate-700">Evidence type<select className="min-h-11 rounded-md border border-slate-300 bg-white px-3 py-2" name="enablementType" defaultValue={enablementEvidenceType ?? ""}><option value="">All types</option>{enablementEvidenceTypes.map((type) => <option key={type} value={type}>{enablementEvidenceTypeLabel(type)}</option>)}</select></label><label className="grid gap-1 text-sm font-medium text-slate-700">Review status<select className="min-h-11 rounded-md border border-slate-300 bg-white px-3 py-2" name="enablementStatus" defaultValue={enablementVerificationStatus ?? ""}><option value="">All statuses</option>{["RECORDED", "VERIFIED", "REJECTED"].map((status) => <option key={status} value={status}>{status}</option>)}</select></label><button className="min-h-11 rounded-md bg-blue-600 px-4 text-sm font-semibold text-white" type="submit">Apply</button></form>
            <div className="grid gap-3 border-b border-slate-100 bg-slate-50 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 md:grid-cols-[12rem_1fr_10rem_9rem_12rem]">
              <span>Type</span>
              <span>Evidence</span>
              <span>Audience</span>
              <span>Status</span>
              <span>Control</span>
            </div>
            {enablementEvidencePage.items.length > 0 ? (
              <div className="divide-y divide-slate-100">
                {enablementEvidencePage.items.map((record) => (
                  <div
                    key={record.id}
                    className="grid gap-3 px-4 py-4 text-sm md:grid-cols-[12rem_1fr_10rem_9rem_12rem] md:items-center"
                  >
                    <div>
                      <p className="font-semibold text-slate-950">
                        {enablementEvidenceTypeLabel(record.evidenceType)}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {new Date(record.completedAt).toLocaleDateString()}
                      </p>
                    </div>
                    <div>
                      <p className="font-semibold text-slate-950">{record.title}</p>
                      <p className="mt-1 text-xs text-slate-600">
                        {record.evidenceReference}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        Owner {record.ownerName}; recorded by{" "}
                        {record.createdByUser.displayName ||
                          record.createdByUser.email}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {record.knownLimitAcknowledged ? (
                          <Badge tone="success" size="sm">Known limits acknowledged</Badge>
                        ) : null}
                        {record.supportRouteConfirmed ? (
                          <Badge tone="success" size="sm">Support route confirmed</Badge>
                        ) : null}
                      </div>
                    </div>
                    <p className="text-slate-700">{record.audienceRole}</p>
                    <Badge
                      tone={
                        record.verificationStatus === "VERIFIED"
                          ? "success"
                          : record.verificationStatus === "REJECTED"
                            ? "destructive"
                            : "warning"
                      }
                    >
                      {record.verificationStatus.replaceAll("_", " ")}
                    </Badge>
                    <a className="min-h-11 inline-flex items-center justify-center rounded-md border border-blue-200 px-3 text-xs font-semibold text-blue-700 hover:bg-blue-50" href={`/admin/readiness?category=enablement&enablementEvidenceId=${record.id}`}>Open evidence</a>
                  </div>
                ))}
              </div>
            ) : (
              <div className="px-4 py-6 text-sm text-slate-600">
                No enablement evidence recorded yet.
              </div>
            )}
            <PaginationBar
              className="border-t border-slate-100 px-4 py-3"
              page={enablementEvidencePage.page}
              pageSize={enablementEvidencePage.pageSize}
              totalItems={enablementEvidencePage.totalItems}
              itemLabel="enablement evidence records"
              getPageHref={(nextPage) => {
                const next = new URLSearchParams({ category: "enablement", enablementPage: String(nextPage), enablementPageSize: String(enablementEvidencePage.pageSize) });
                if (enablementQ) next.set("enablementQ", enablementQ);
                if (enablementEvidenceType) next.set("enablementType", enablementEvidenceType);
                if (enablementVerificationStatus) next.set("enablementStatus", enablementVerificationStatus);
                if (enablementAudienceRole) next.set("enablementAudienceRole", enablementAudienceRole);
                return `/admin/readiness?${next.toString()}`;
              }}
            />
          </div>
        ) : null}

        {selectedCategory === "go_no_go" ? (
          <div className="mb-5 overflow-hidden rounded-xl border border-slate-200">
            <div className="grid gap-3 border-b border-slate-100 bg-slate-50 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 md:grid-cols-[10rem_10rem_1fr_12rem]">
              <span>Decision</span>
              <span>Decided</span>
              <span>Basis</span>
              <span>Chair</span>
            </div>
            {releaseBoardDecisionRecords.length > 0 ? (
              <div className="divide-y divide-slate-100">
                {releaseBoardDecisionRecords.map((decision) => (
                  <div
                    key={decision.id}
                    className="grid gap-3 px-4 py-4 text-sm md:grid-cols-[10rem_10rem_1fr_12rem] md:items-start"
                  >
                    <Badge
                      tone={
                        decision.decision === "GO"
                          ? "success"
                          : decision.decision === "HOLD" ||
                              decision.decision === "ROLLBACK"
                            ? "destructive"
                            : "warning"
                      }
                    >
                      {boardDecisionLabel(decision.decision)}
                    </Badge>
                    <p className="text-slate-700">
                      {new Date(decision.decidedAt).toLocaleDateString()}
                    </p>
                    <div>
                      <p className="font-semibold text-slate-950">
                        {decision.evidenceReference}
                      </p>
                      <p className="mt-1 text-sm leading-5 text-slate-600">
                        {decision.decisionNote}
                      </p>
                      {Array.isArray(decision.participants) ? (
                        <p className="mt-2 text-xs text-slate-500">
                          Participants: {decision.participants.join(", ")}
                        </p>
                      ) : null}
                    </div>
                    <p className="text-slate-700">
                      {decision.chairUser.displayName || decision.chairUser.email}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="px-4 py-6 text-sm text-slate-600">
                No Release Board decision recorded yet.
              </div>
            )}
          </div>
        ) : null}

        <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200">
          {visibleGates.map((gate) => (
            <div
              key={gate.gateKey}
              className="grid gap-4 px-4 py-4 lg:grid-cols-[1.2fr_11rem_11rem_10rem] lg:items-center"
            >
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-bold text-slate-950">{gate.title}</p>
                  <Badge tone={gate.requiredByPolicy ? "warning" : "neutral"} size="sm">
                    {gate.requiredByPolicy ? "Required" : "Optional by policy"}
                  </Badge>
                </div>
                <p className="mt-1 text-sm leading-5 text-slate-600">
                  {gate.description}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <span className="rounded-full bg-slate-100 px-2 py-1">
                    Owner: {gate.ownerRole}
                  </span>
                  <span className="rounded-full bg-slate-100 px-2 py-1">
                    {gate.sourceDecisionId}
                  </span>
                  {gate.targetDate ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1">
                      <CalendarDays aria-hidden="true" className="h-3.5 w-3.5" />
                      Target {new Date(gate.targetDate).toLocaleDateString()}
                    </span>
                  ) : null}
                </div>
                {gate.evidenceReference ? (
                  <p className="mt-2 rounded-md border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800">
                    Evidence: {gate.evidenceReference}
                  </p>
                ) : null}
                {gate.blockerSummary ? (
                  <p className="mt-2 rounded-md border border-rose-100 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-800">
                    Blocker: {gate.blockerSummary}
                  </p>
                ) : null}
              </div>
              <div>
                <Badge tone={readinessTone(gate.status)}>
                  {statusLabel(gate.status)}
                </Badge>
              </div>
              <div className="text-sm text-slate-600">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Signed off
                </p>
                <p className="mt-1 font-semibold text-slate-800">
                  {gate.signedOffAt
                    ? new Date(gate.signedOffAt).toLocaleDateString()
                    : "Not yet"}
                </p>
              </div>
              <EntryModal
                title={`Update ${gate.title}`}
                triggerLabel="Update Gate"
                triggerClassName="w-full border border-blue-200 bg-white text-blue-700 hover:bg-blue-50"
              >
                <form
                  action={updateReadinessGateAction}
                  className="ogfi-form-shell mt-4 grid gap-4"
                >
                  <input name="gateKey" type="hidden" value={gate.gateKey} />
                  <div className="rounded-xl border border-blue-100 bg-blue-50/70 p-4">
                    <p className="font-bold text-slate-950">{gate.title}</p>
                    <p className="mt-1 text-sm leading-5 text-slate-600">
                      {gate.description}
                    </p>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="grid gap-1 text-sm font-medium text-slate-700">
                      Status
                      <select
                        className="rounded-md border border-slate-300 px-3 py-2"
                        name="status"
                        defaultValue={gate.status}
                      >
                        {releaseReadinessStatuses.map((status) => (
                          <option key={status} value={status}>
                            {statusLabel(status)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="grid gap-1 text-sm font-medium text-slate-700">
                      Target date
                      <input
                        className="rounded-md border border-slate-300 px-3 py-2"
                        name="targetDate"
                        type="date"
                        defaultValue={
                          gate.targetDate ? gate.targetDate.slice(0, 10) : undefined
                        }
                      />
                    </label>
                  </div>
                  <label className="grid gap-1 text-sm font-medium text-slate-700">
                    Evidence reference
                    <input
                      className="rounded-md border border-slate-300 px-3 py-2"
                      name="evidenceReference"
                      defaultValue={gate.evidenceReference ?? ""}
                      placeholder="Artifact path, signed pack, screenshot ID, or report reference"
                    />
                  </label>
                  <label className="grid gap-1 text-sm font-medium text-slate-700">
                    Decision note
                    <textarea
                      className="min-h-20 rounded-md border border-slate-300 px-3 py-2"
                      name="decisionNote"
                      defaultValue={gate.decisionNote ?? ""}
                      placeholder={
                        gate.category === "uat"
                          ? "Required for UAT READY, Conditional GO, or Waived. Include owner signoff, finding disposition, or default revision decision."
                          : "Required for Conditional GO or Waived."
                      }
                    />
                  </label>
                  <label className="grid gap-1 text-sm font-medium text-slate-700">
                    Blocker summary
                    <textarea
                      className="min-h-20 rounded-md border border-slate-300 px-3 py-2"
                      name="blockerSummary"
                      defaultValue={gate.blockerSummary ?? ""}
                      placeholder="Required when placing this gate on HOLD."
                    />
                  </label>
                  <label className="grid gap-1 text-sm font-medium text-slate-700">
                    Reason for update
                    <textarea
                      className="min-h-24 rounded-md border border-slate-300 px-3 py-2"
                      name="reason"
                      placeholder="Explain why this readiness gate is being updated."
                      required
                    />
                  </label>
                  <button className="min-h-10 rounded-md bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700">
                    Save Readiness Gate
                  </button>
                </form>
              </EntryModal>
            </div>
          ))}
        </div>

        <PaginationBar
          className="mt-4 border-t border-slate-100 pt-3"
          page={gatePage.page}
          pageSize={gatePage.pageSize}
          totalItems={gatePage.totalItems}
          itemLabel="gates"
          getPageHref={(nextPage) => {
            const next = new URLSearchParams({ category: selectedCategory, page: String(nextPage), pageSize: String(gatePage.pageSize) });
            if (query) next.set("q", query);
            if (selectedStatus) next.set("status", selectedStatus);
            return `/admin/readiness?${next.toString()}`;
          }}
        />

        <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
          <div className="flex items-start gap-3">
            <FileCheck2 aria-hidden="true" className="mt-0.5 h-5 w-5 text-blue-600" />
            <p>
              This page records gate status only. The actual evidence remains in the
              signed UAT pack, deployment checklist, training assessment, release
              notes, generated release artifacts, or approved external evidence
              repository.
            </p>
          </div>
        </div>
      </Panel>
    </AppShell>
  );
}
