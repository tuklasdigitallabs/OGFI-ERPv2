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
import { Badge, Panel } from "@ogfi/ui";
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
  listDeploymentEvidenceRecords,
  listEnablementEvidenceRecords,
  listReleaseBoardDecisions,
  listReleaseReadinessGates,
  listUatEvidenceRecords,
  releaseBoardDecisions,
  releaseReadinessCategories,
  releaseReadinessStatuses,
  summarizeDeploymentEvidence,
  summarizeEnablementEvidence,
  summarizeReleaseReadiness,
  summarizeUatEvidence,
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

  try {
    await updateDeploymentEvidenceStatus(formData);
  } catch (error) {
    redirect(actionErrorRedirectPath("/admin/readiness?category=deployment", error));
  }
  revalidatePath("/admin/readiness");
  redirect("/admin/readiness?category=deployment");
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

  try {
    await updateUatEvidenceStatus(formData);
  } catch (error) {
    redirect(actionErrorRedirectPath("/admin/readiness?category=uat", error));
  }
  revalidatePath("/admin/readiness");
  redirect("/admin/readiness?category=uat");
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

  try {
    await updateEnablementEvidenceStatus(formData);
  } catch (error) {
    redirect(actionErrorRedirectPath("/admin/readiness?category=enablement", error));
  }
  revalidatePath("/admin/readiness");
  redirect("/admin/readiness?category=enablement");
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
  const selectedCategory = normalizeCategory(getSearchParam(params, "category"));
  const gates = await listReleaseReadinessGates(session);
  const summary = summarizeReleaseReadiness(gates);
  const canExportReadiness = canExportReleaseReadiness(session);
  const category = releaseReadinessCategories.find(
    (item) => item.id === selectedCategory
  )!;
  const visibleGates = gates.filter((gate) => gate.category === selectedCategory);
  const uatEvidenceRecords =
    selectedCategory === "uat" ? await listUatEvidenceRecords(session) : [];
  const uatEvidenceSummary =
    selectedCategory === "uat" ? summarizeUatEvidence(uatEvidenceRecords) : null;
  const securityEvidenceSummary =
    selectedCategory === "security"
      ? await getReleaseSecurityEvidenceSummary(session)
      : null;
  const deploymentEvidenceRecords =
    selectedCategory === "deployment"
      ? await listDeploymentEvidenceRecords(session)
      : [];
  const deploymentEvidenceSummary =
    selectedCategory === "deployment"
      ? summarizeDeploymentEvidence(deploymentEvidenceRecords)
      : null;
  const enablementEvidenceRecords =
    selectedCategory === "enablement"
      ? await listEnablementEvidenceRecords(session)
      : [];
  const enablementEvidenceSummary =
    selectedCategory === "enablement"
      ? summarizeEnablementEvidence(enablementEvidenceRecords)
      : null;
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
            const count = gates.filter((gate) => gate.category === item.id).length;
            return (
              <a
                key={item.id}
                aria-current={isActive ? "page" : undefined}
                className={
                  isActive
                    ? "rounded-xl bg-blue-50 px-4 py-3 text-blue-700 ring-1 ring-blue-100"
                    : "rounded-xl px-4 py-3 text-slate-600 hover:bg-slate-50 hover:text-slate-950"
                }
                href={`/admin/readiness?category=${item.id}`}
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

      <Panel className="ogfi-detail-card">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <ClipboardCheck aria-hidden="true" className="h-5 w-5 text-blue-600" />
              <h2 className="text-lg font-bold text-slate-950">{category.label}</h2>
            </div>
            <p className="mt-1 text-sm text-slate-500">{category.description}</p>
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
            <div className="grid gap-3 border-b border-slate-100 bg-slate-50 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 md:grid-cols-[12rem_1fr_10rem_9rem_12rem]">
              <span>Type</span>
              <span>Evidence</span>
              <span>Result</span>
              <span>Status</span>
              <span>Control</span>
            </div>
            {uatEvidenceRecords.length > 0 ? (
              <div className="divide-y divide-slate-100">
                {uatEvidenceRecords.map((record) => (
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
                      <p className="font-semibold text-slate-950">{record.title}</p>
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
                    {record.verificationStatus === "RECORDED" ? (
                      <div className="grid gap-2">
                        <form action={updateUatEvidenceAction}>
                          <input name="evidenceId" type="hidden" value={record.id} />
                          <input name="status" type="hidden" value="VERIFIED" />
                          <input
                            name="reason"
                            type="hidden"
                            value="Verified UAT evidence for DEC-0036 release readiness."
                          />
                          <button className="min-h-9 w-full rounded-md border border-emerald-200 bg-emerald-50 px-3 text-xs font-semibold text-emerald-800 hover:bg-emerald-100">
                            Verify
                          </button>
                        </form>
                        <EntryModal
                          title={`Reject ${record.title}`}
                          triggerLabel="Reject"
                          triggerClassName="w-full border border-rose-200 bg-white text-rose-700 hover:bg-rose-50"
                        >
                          <form
                            action={updateUatEvidenceAction}
                            className="ogfi-form-shell mt-4 grid gap-4"
                          >
                            <input name="evidenceId" type="hidden" value={record.id} />
                            <input name="status" type="hidden" value="REJECTED" />
                            <label className="grid gap-1 text-sm font-medium text-slate-700">
                              Rejection reason
                              <textarea
                                className="min-h-24 rounded-md border border-slate-300 px-3 py-2"
                                name="reason"
                                required
                              />
                            </label>
                            <button className="min-h-10 rounded-md bg-rose-600 px-4 text-sm font-semibold text-white hover:bg-rose-700">
                              Reject Evidence
                            </button>
                          </form>
                        </EntryModal>
                      </div>
                    ) : (
                      <p className="text-xs text-slate-500">
                        {record.verifiedByUser
                          ? `Verified by ${
                              record.verifiedByUser.displayName ||
                              record.verifiedByUser.email
                            }`
                          : record.rejectedByUser
                            ? `Rejected by ${
                                record.rejectedByUser.displayName ||
                                record.rejectedByUser.email
                              }`
                            : "No action available"}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="px-4 py-6 text-sm text-slate-600">
                No UAT evidence recorded yet.
              </div>
            )}
          </div>
        ) : null}

        {deploymentEvidenceSummary ? (
          <div className="mb-5 overflow-hidden rounded-xl border border-slate-200">
            <div className="grid gap-3 border-b border-slate-100 bg-slate-50 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 md:grid-cols-[10rem_1fr_9rem_9rem_12rem]">
              <span>Type</span>
              <span>Evidence</span>
              <span>Environment</span>
              <span>Status</span>
              <span>Control</span>
            </div>
            {deploymentEvidenceRecords.length > 0 ? (
              <div className="divide-y divide-slate-100">
                {deploymentEvidenceRecords.map((record) => (
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
                    {record.verificationStatus === "RECORDED" ? (
                      <div className="grid gap-2">
                        <form action={updateDeploymentEvidenceAction}>
                          <input name="evidenceId" type="hidden" value={record.id} />
                          <input name="status" type="hidden" value="VERIFIED" />
                          <input
                            name="reason"
                            type="hidden"
                            value="Verified deployment evidence for DEC-0036 release readiness."
                          />
                          <button className="min-h-9 w-full rounded-md border border-emerald-200 bg-emerald-50 px-3 text-xs font-semibold text-emerald-800 hover:bg-emerald-100">
                            Verify
                          </button>
                        </form>
                        <EntryModal
                          title={`Reject ${record.title}`}
                          triggerLabel="Reject"
                          triggerClassName="w-full border border-rose-200 bg-white text-rose-700 hover:bg-rose-50"
                        >
                          <form
                            action={updateDeploymentEvidenceAction}
                            className="ogfi-form-shell mt-4 grid gap-4"
                          >
                            <input name="evidenceId" type="hidden" value={record.id} />
                            <input name="status" type="hidden" value="REJECTED" />
                            <label className="grid gap-1 text-sm font-medium text-slate-700">
                              Rejection reason
                              <textarea
                                className="min-h-24 rounded-md border border-slate-300 px-3 py-2"
                                name="reason"
                                required
                              />
                            </label>
                            <button className="min-h-10 rounded-md bg-rose-600 px-4 text-sm font-semibold text-white hover:bg-rose-700">
                              Reject Evidence
                            </button>
                          </form>
                        </EntryModal>
                      </div>
                    ) : (
                      <p className="text-xs text-slate-500">
                        {record.verifiedByUser
                          ? `Verified by ${
                              record.verifiedByUser.displayName ||
                              record.verifiedByUser.email
                            }`
                          : record.rejectedByUser
                            ? `Rejected by ${
                                record.rejectedByUser.displayName ||
                                record.rejectedByUser.email
                              }`
                            : "No action available"}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="px-4 py-6 text-sm text-slate-600">
                No deployment evidence recorded yet.
              </div>
            )}
          </div>
        ) : null}

        {enablementEvidenceSummary ? (
          <div className="mb-5 overflow-hidden rounded-xl border border-slate-200">
            <div className="grid gap-3 border-b border-slate-100 bg-slate-50 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 md:grid-cols-[12rem_1fr_10rem_9rem_12rem]">
              <span>Type</span>
              <span>Evidence</span>
              <span>Audience</span>
              <span>Status</span>
              <span>Control</span>
            </div>
            {enablementEvidenceRecords.length > 0 ? (
              <div className="divide-y divide-slate-100">
                {enablementEvidenceRecords.map((record) => (
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
                    {record.verificationStatus === "RECORDED" ? (
                      <div className="grid gap-2">
                        <form action={updateEnablementEvidenceAction}>
                          <input name="evidenceId" type="hidden" value={record.id} />
                          <input name="status" type="hidden" value="VERIFIED" />
                          <input
                            name="reason"
                            type="hidden"
                            value="Verified enablement evidence for DEC-0036 release readiness."
                          />
                          <button className="min-h-9 w-full rounded-md border border-emerald-200 bg-emerald-50 px-3 text-xs font-semibold text-emerald-800 hover:bg-emerald-100">
                            Verify
                          </button>
                        </form>
                        <EntryModal
                          title={`Reject ${record.title}`}
                          triggerLabel="Reject"
                          triggerClassName="w-full border border-rose-200 bg-white text-rose-700 hover:bg-rose-50"
                        >
                          <form
                            action={updateEnablementEvidenceAction}
                            className="ogfi-form-shell mt-4 grid gap-4"
                          >
                            <input name="evidenceId" type="hidden" value={record.id} />
                            <input name="status" type="hidden" value="REJECTED" />
                            <label className="grid gap-1 text-sm font-medium text-slate-700">
                              Rejection reason
                              <textarea
                                className="min-h-24 rounded-md border border-slate-300 px-3 py-2"
                                name="reason"
                                required
                              />
                            </label>
                            <button className="min-h-10 rounded-md bg-rose-600 px-4 text-sm font-semibold text-white hover:bg-rose-700">
                              Reject Evidence
                            </button>
                          </form>
                        </EntryModal>
                      </div>
                    ) : (
                      <p className="text-xs text-slate-500">
                        {record.verifiedByUser
                          ? `Verified by ${
                              record.verifiedByUser.displayName ||
                              record.verifiedByUser.email
                            }`
                          : record.rejectedByUser
                            ? `Rejected by ${
                                record.rejectedByUser.displayName ||
                                record.rejectedByUser.email
                              }`
                            : "No action available"}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="px-4 py-6 text-sm text-slate-600">
                No enablement evidence recorded yet.
              </div>
            )}
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
