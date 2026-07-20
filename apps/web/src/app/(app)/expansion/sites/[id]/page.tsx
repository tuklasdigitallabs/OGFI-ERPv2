import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Badge } from "@ogfi/ui";
import { ActionFeedbackBanner } from "@/components/ActionFeedbackBanner";
import { AppShell } from "@/components/AppShell";
import { ExpansionEntrySheet } from "@/components/ExpansionEntrySheet";
import { ExpansionWorkspaceNav } from "@/components/ExpansionWorkspaceNav";
import { FinancePagination, getPaginationState } from "@/components/FinancePagination";
import { actionErrorRedirectPath, getActionFeedback } from "@/server/services/actionFeedback";
import {
  canUseProjects,
  getDefaultAppRoute,
  permissions
} from "@/server/services/authorization";
import { getSessionContext } from "@/server/services/context";
import {
  getExpansionLifecycleGates,
  getExpansionCreateOptions,
  listExpansionProjectActivity,
  listExpansionSitePipeline
} from "@/server/services/expansionProjects";
import {
  listProjectMembers,
  updateProjectDetails,
  transitionProjectLifecycle,
  updateProjectLeadership
} from "@/server/services/projects";
import {
  decideProjectRequirement,
  listProjectRequirements,
  reassignProjectRequirementReviewer,
  resolveProjectRequirementException,
  type ProjectRequirementRow,
  submitProjectRequirement,
  uploadProjectRequirementEvidence
} from "@/server/services/projectRequirements";
import { createProjectRecordLink } from "@/server/services/projectRecordLinks";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function projectRequirementRedirect(projectId: string, error?: unknown): never {
  const path = `/expansion/sites/${projectId}`;
  if (error) {
    redirect(actionErrorRedirectPath(path, error));
  }
  redirect(path);
}

async function updateProjectLeadershipAction(formData: FormData) {
  "use server";
  await updateProjectLeadership(formData);
  redirect(`/expansion/sites/${String(formData.get("projectId"))}`);
}

async function transitionProjectLifecycleAction(formData: FormData) {
  "use server";
  const projectId = String(formData.get("projectId") ?? "");
  try {
    await transitionProjectLifecycle(formData);
  } catch (error) {
    projectRequirementRedirect(projectId, error);
  }
  projectRequirementRedirect(projectId);
}

async function updateProjectDetailsAction(formData: FormData) {
  "use server";
  const projectId = String(formData.get("projectId") ?? "");
  try {
    await updateProjectDetails(formData);
  } catch (error) {
    projectRequirementRedirect(projectId, error);
  }
  projectRequirementRedirect(projectId);
}

async function submitRequirementAction(formData: FormData) {
  "use server";
  const projectId = String(formData.get("projectId") ?? "");
  try { await submitProjectRequirement(formData); } catch (error) { projectRequirementRedirect(projectId, error); }
  projectRequirementRedirect(projectId);
}

async function decideRequirementAction(formData: FormData) {
  "use server";
  const projectId = String(formData.get("projectId") ?? "");
  try { await decideProjectRequirement(formData); } catch (error) { projectRequirementRedirect(projectId, error); }
  projectRequirementRedirect(projectId);
}

async function uploadRequirementEvidenceAction(formData: FormData) {
  "use server";
  const projectId = String(formData.get("projectId") ?? "");
  try { await uploadProjectRequirementEvidence(formData); } catch (error) { projectRequirementRedirect(projectId, error); }
  projectRequirementRedirect(projectId);
}

async function linkRequirementSourceAction(formData: FormData) {
  "use server";
  const projectId = String(formData.get("projectId") ?? "");
  try { await createProjectRecordLink(formData); } catch (error) { projectRequirementRedirect(projectId, error); }
  projectRequirementRedirect(projectId);
}

async function reassignRequirementReviewerAction(formData: FormData) {
  "use server";
  const projectId = String(formData.get("projectId") ?? "");
  try { await reassignProjectRequirementReviewer(formData); } catch (error) { projectRequirementRedirect(projectId, error); }
  projectRequirementRedirect(projectId);
}

async function resolveRequirementExceptionAction(formData: FormData) {
  "use server";
  const projectId = String(formData.get("projectId") ?? "");
  try {
    await resolveProjectRequirementException(formData);
  } catch (error) {
    projectRequirementRedirect(projectId, error);
  }
  projectRequirementRedirect(projectId);
}

function tone(status: string) {
  if (["ACHIEVED", "ACTIVE"].includes(status)) return "success" as const;
  if (["CANCELLED", "ON_HOLD"].includes(status)) return "warning" as const;
  return "info" as const;
}

function requirementTone(status: string) {
  if (status === "APPROVED") return "success" as const;
  if (["RETURNED", "WAIVED"].includes(status)) return "warning" as const;
  if (["CANCELLED"].includes(status)) return "destructive" as const;
  return "info" as const;
}

function RequirementActions({ projectId, requirement, reviewerOptions }: { projectId: string; requirement: ProjectRequirementRow; reviewerOptions: Array<{ id: string; displayName: string; email: string }> }) {
  const support = requirement.evidenceType === "SOURCE_RECORD_LINK"
    ? `${requirement.sourceRecordLinkCount} source link${requirement.sourceRecordLinkCount === 1 ? "" : "s"}`
    : requirement.evidenceType === "APPROVAL_NOTE"
      ? requirement.evidenceNote ? "Note recorded" : "Note required"
      : requirement.evidenceType
        ? `${requirement.attachmentCount} attachment${requirement.attachmentCount === 1 ? "" : "s"}`
        : "Signoff package";
  return <div className="flex flex-wrap justify-end gap-2">
    {requirement.canSubmit && requirement.kind === "SIGNOFF" ? <form action={submitRequirementAction}><input name="projectId" type="hidden" value={projectId} /><input name="requirementId" type="hidden" value={requirement.id} /><input name="expectedVersion" type="hidden" value={requirement.version} /><button className="min-h-11 rounded-lg bg-blue-600 px-3 text-sm font-bold text-white hover:bg-blue-700">Submit package</button></form> : null}
    {requirement.canSubmit && requirement.evidenceType === "APPROVAL_NOTE" ? <ExpansionEntrySheet title="Record Requirement Note" triggerLabel="Record note" submitLabel="Submit for review"><form action={submitRequirementAction} className="grid gap-4 pt-5"><input name="projectId" type="hidden" value={projectId} /><input name="requirementId" type="hidden" value={requirement.id} /><input name="expectedVersion" type="hidden" value={requirement.version} /><label className="grid gap-2 text-sm font-semibold text-slate-700">Evidence note<textarea className="min-h-28 rounded-lg border border-slate-300 px-3 py-2 text-sm" name="evidenceNote" placeholder="Record the confirmation, source, and accountable person." required /></label></form></ExpansionEntrySheet> : null}
    {requirement.canSubmit && ["DOCUMENT", "PHOTO"].includes(requirement.evidenceType ?? "") ? <ExpansionEntrySheet title={`Attach ${requirement.evidenceType === "PHOTO" ? "Photo" : "Document"} Evidence`} triggerLabel={requirement.attachmentCount > 0 ? "Add evidence" : "Attach evidence"} submitLabel="Save evidence"><form action={uploadRequirementEvidenceAction} className="grid gap-4 pt-5" encType="multipart/form-data"><input name="projectId" type="hidden" value={projectId} /><input name="requirementId" type="hidden" value={requirement.id} /><label className="grid gap-2 text-sm font-semibold text-slate-700">Evidence file<input accept={requirement.evidenceType === "PHOTO" ? "image/*" : ".pdf,.csv,.txt,.xlsx,.docx"} className="min-h-11 rounded-lg border border-slate-300 px-3 py-2 text-sm" name="file" type="file" required /></label><label className="grid gap-2 text-sm font-semibold text-slate-700">Caption <input className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm" name="caption" placeholder="What this evidence demonstrates" /></label></form></ExpansionEntrySheet> : null}
    {requirement.canSubmit && requirement.evidenceType === "SOURCE_RECORD_LINK" ? <ExpansionEntrySheet title="Link Authorized ERP Record" triggerLabel={requirement.sourceRecordLinkCount > 0 ? "Add source link" : "Link source record"} submitLabel="Save source link"><form action={linkRequirementSourceAction} className="grid gap-4 pt-5"><input name="projectId" type="hidden" value={projectId} /><input name="requirementId" type="hidden" value={requirement.id} /><input name="relationType" type="hidden" value="EVIDENCE" /><p className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-sm text-blue-950">Use the document number shown in its source workspace, such as a PR, PO, receipt, transfer, wastage, or adjustment reference. The link is validated against your current authorized scope and does not change the source record.</p><label className="grid gap-2 text-sm font-semibold text-slate-700">Record type<select className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm" name="sourceRecordType" required><option value="PURCHASE_REQUEST">Purchase request</option><option value="PURCHASE_ORDER">Purchase order</option><option value="GOODS_RECEIPT">Goods receipt</option><option value="INVENTORY_TRANSFER">Inventory transfer</option><option value="APPROVAL_INSTANCE">Approval decision</option><option value="WASTAGE_REPORT">Wastage report</option><option value="STOCK_ADJUSTMENT">Stock adjustment</option></select></label><label className="grid gap-2 text-sm font-semibold text-slate-700">Source document number<input className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm" name="sourceRecordId" placeholder="For example: PR-2026-000123" required /></label><label className="grid gap-2 text-sm font-semibold text-slate-700">Link label<input className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm" name="linkLabel" placeholder="What this record proves" required /></label></form></ExpansionEntrySheet> : null}
    {requirement.canSubmit && requirement.evidenceType && ((requirement.evidenceType === "SOURCE_RECORD_LINK" && requirement.sourceRecordLinkCount > 0) || (["DOCUMENT", "PHOTO"].includes(requirement.evidenceType) && requirement.attachmentCount > 0)) ? <form action={submitRequirementAction}><input name="projectId" type="hidden" value={projectId} /><input name="requirementId" type="hidden" value={requirement.id} /><input name="expectedVersion" type="hidden" value={requirement.version} /><button className="min-h-11 rounded-lg bg-blue-600 px-3 text-sm font-bold text-white hover:bg-blue-700">Submit for review</button></form> : null}
    {requirement.canDecide ? <form action={decideRequirementAction}><input name="projectId" type="hidden" value={projectId} /><input name="requirementId" type="hidden" value={requirement.id} /><input name="expectedVersion" type="hidden" value={requirement.version} /><input name="decision" type="hidden" value="APPROVED" /><button className="min-h-11 rounded-lg bg-emerald-600 px-3 text-sm font-bold text-white hover:bg-emerald-700">Accept requirement</button></form> : null}
    {requirement.canDecide ? <ExpansionEntrySheet title="Return Requirement" triggerLabel="Return" submitLabel="Return to owner" triggerClassName="border border-amber-300 text-amber-800 hover:bg-amber-50"><form action={decideRequirementAction} className="grid gap-4 pt-5"><input name="projectId" type="hidden" value={projectId} /><input name="requirementId" type="hidden" value={requirement.id} /><input name="expectedVersion" type="hidden" value={requirement.version} /><input name="decision" type="hidden" value="RETURNED" /><label className="grid gap-2 text-sm font-semibold text-slate-700">Return reason<textarea className="min-h-28 rounded-lg border border-slate-300 px-3 py-2 text-sm" name="reason" required /></label></form></ExpansionEntrySheet> : null}
    {requirement.canReassignReviewer ? <ExpansionEntrySheet title="Reassign Requirement Reviewer" triggerLabel={requirement.reviewerName ? "Reassign reviewer" : "Assign reviewer"} submitLabel="Save reviewer" triggerClassName="border border-slate-300 text-slate-700 hover:bg-slate-50"><form action={reassignRequirementReviewerAction} className="grid gap-4 pt-5"><input name="projectId" type="hidden" value={projectId} /><input name="requirementId" type="hidden" value={requirement.id} /><input name="expectedVersion" type="hidden" value={requirement.version} /><label className="grid gap-2 text-sm font-semibold text-slate-700">Independent reviewer<select className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm" defaultValue="" name="reviewerUserId" required><option value="">Select an active project member</option>{reviewerOptions.filter((user) => user.id !== requirement.ownerUserId).map((user) => <option key={user.id} value={user.id}>{user.displayName} / {user.email}</option>)}</select></label><label className="grid gap-2 text-sm font-semibold text-slate-700">Reason<textarea className="min-h-24 rounded-lg border border-slate-300 px-3 py-2 text-sm" name="reason" required /></label></form></ExpansionEntrySheet> : null}
    {requirement.canResolveException && ["PENDING", "RETURNED", "SUBMITTED"].includes(requirement.status) ? <ExpansionEntrySheet title="Resolve Requirement Exception" triggerLabel="Waive or cancel" submitLabel="Record exception" triggerClassName="border border-slate-300 text-slate-700 hover:bg-slate-50"><form action={resolveRequirementExceptionAction} className="grid gap-4 pt-5"><input name="projectId" type="hidden" value={projectId} /><input name="requirementId" type="hidden" value={requirement.id} /><input name="expectedVersion" type="hidden" value={requirement.version} /><p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">A waiver keeps this requirement visible in the audit trail and allows an authorized exception. Required requirements cannot be cancelled.</p><label className="grid gap-2 text-sm font-semibold text-slate-700">Resolution<select className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm" name="resolution" defaultValue="WAIVED"><option value="WAIVED">Waive requirement</option>{!requirement.isRequired ? <option value="CANCELLED">Cancel optional requirement</option> : null}</select></label><label className="grid gap-2 text-sm font-semibold text-slate-700">Exception reason<textarea className="min-h-24 rounded-lg border border-slate-300 px-3 py-2 text-sm" name="reason" placeholder="Policy exception, replacement control, or reason this requirement is no longer applicable" required /></label></form></ExpansionEntrySheet> : null}
    {!requirement.canSubmit && !requirement.canDecide ? <span className="text-xs text-slate-500">{support}</span> : null}
  </div>;
}

function RequirementRow({ projectId, requirement, reviewerOptions }: { projectId: string; requirement: ProjectRequirementRow; reviewerOptions: Array<{ id: string; displayName: string; email: string }> }) {
  return <tr><td className="px-5 py-4"><p className="font-bold text-slate-950">{requirement.label}</p><p className="mt-1 text-xs text-slate-500">{requirement.kind === "SIGNOFF" ? requirement.signoffStage?.replaceAll("_", " ") : requirement.evidenceType?.replaceAll("_", " ")} · {requirement.code}</p></td><td className="px-5 py-4"><p className="font-semibold text-slate-800">Owner: {requirement.ownerName}</p><p className="mt-1 text-xs text-slate-500">{requirement.reviewerName ? `Reviewer: ${requirement.reviewerName}` : "Reviewer assignment required"}</p></td><td className="px-5 py-4 text-slate-600">{requirement.evidenceType === "SOURCE_RECORD_LINK" ? `${requirement.sourceRecordLinkCount} authorized source link(s)` : requirement.evidenceType === "APPROVAL_NOTE" ? (requirement.evidenceNote ? "Note recorded" : "Note required") : requirement.evidenceType ? `${requirement.attachmentCount} attachment(s)` : "Signoff package"}</td><td className="px-5 py-4"><Badge tone={requirementTone(requirement.status)}>{requirement.status.replaceAll("_", " ")}</Badge></td><td className="px-5 py-4"><RequirementActions projectId={projectId} requirement={requirement} reviewerOptions={reviewerOptions} /></td></tr>;
}

function RequirementCard({ projectId, requirement, reviewerOptions }: { projectId: string; requirement: ProjectRequirementRow; reviewerOptions: Array<{ id: string; displayName: string; email: string }> }) {
  return <div className="grid gap-3"><div className="flex items-start justify-between gap-3"><div><p className="font-bold text-slate-950">{requirement.label}</p><p className="mt-1 text-xs text-slate-500">{requirement.code} · Owner: {requirement.ownerName}</p></div><Badge tone={requirementTone(requirement.status)}>{requirement.status.replaceAll("_", " ")}</Badge></div><p className="text-sm text-slate-600">{requirement.reviewerName ? `Reviewer: ${requirement.reviewerName}` : "Reviewer assignment required"}</p><RequirementActions projectId={projectId} requirement={requirement} reviewerOptions={reviewerOptions} /></div>;
}

export default async function ExpansionSiteDetailPage({ params, searchParams }: PageProps) {
  const session = await getSessionContext();
  if (!session) redirect("/sign-in");
  if (!canUseProjects(session.permissionCodes)) {
    redirect(getDefaultAppRoute(session.permissionCodes));
  }

  const { id } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const actionFeedback = getActionFeedback(resolvedSearchParams);
  const requestedView = Array.isArray(resolvedSearchParams.view)
    ? resolvedSearchParams.view[0]
    : resolvedSearchParams.view;
  const view = ["overview", "requirements", "lifecycle", "activity"].includes(
    requestedView ?? ""
  )
    ? requestedView!
    : "overview";
  const requirementPage = Array.isArray(resolvedSearchParams.page)
    ? resolvedSearchParams.page[0]
    : resolvedSearchParams.page;
  const activityPage = Array.isArray(resolvedSearchParams.activityPage)
    ? resolvedSearchParams.activityPage[0]
    : resolvedSearchParams.activityPage;
  const [projects, gatesDashboard, activityData, createOptions, requirements, projectMembers] = await Promise.all([
    listExpansionSitePipeline(session),
    getExpansionLifecycleGates(session),
    listExpansionProjectActivity(session, id, { page: Number.parseInt(activityPage ?? "1", 10) || 1 }),
    getExpansionCreateOptions(session),
    listProjectRequirements(session, { projectId: id }),
    listProjectMembers(session)
  ]);
  const project = projects.find((row) => row.id === id);
  if (!project) notFound();
  const gates = gatesDashboard.gates.filter((gate) => gate.projectId === id);
  const reviewerOptions = projectMembers
    .filter((member) => member.projectId === id)
    .map((member) => ({
      id: member.userId,
      displayName: member.userName,
      email: member.userEmail
    }));
  const projectQuery = `q=${encodeURIComponent(project.code)}`;
  const projectWorkspaces = [
    ["Lifecycle Gates", `/expansion/gates?${projectQuery}`],
    ["Permits", `/expansion/permits?${projectQuery}`],
    ["Construction", `/expansion/construction?${projectQuery}`],
    ["Readiness", `/expansion/readiness?${projectQuery}`],
    ["Punch List", `/expansion/punch-list?${projectQuery}`],
    ["Post-opening", `/expansion/post-opening?${projectQuery}`]
  ] as const;
  const projectTabs = [
    ["overview", "Overview"],
    ["requirements", "Requirements"],
    ["lifecycle", "Lifecycle gates"],
    ["activity", "Activity"]
  ] as const;
  const requirementPagination = getPaginationState(requirements.length, requirementPage);
  const activityPagination = getPaginationState(activityData.totalCount, activityPage);
  const activity = activityData.events;
  const visibleRequirements = requirements.slice(
    requirementPagination.startIndex,
    requirementPagination.endIndex
  );

  return (
    <AppShell
      activeNav="site-pipeline"
      session={session}
      subtitle={`${project.code} / ${project.projectType}`}
      title={project.name}
    >
      <ExpansionWorkspaceNav />
      <ActionFeedbackBanner feedback={actionFeedback} />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Link className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 hover:bg-slate-50" href="/expansion/sites">
          <ArrowLeft aria-hidden="true" className="h-4 w-4" /> Back to Site Pipeline
        </Link>
        <div className="flex flex-wrap gap-2">
          <Badge tone={tone(project.status)}>{project.status.replaceAll("_", " ")}</Badge>
          <Badge tone={project.isRestricted ? "warning" : "info"}>{project.isRestricted ? "Restricted" : "Standard access"}</Badge>
          <Badge tone={project.scheduleState === "AT_RISK" ? "warning" : "neutral"}>{project.scheduleState.replaceAll("_", " ")}</Badge>
          {(session.permissionCodes.includes(permissions.projectManage) ||
            project.sponsorName === session.user.displayName ||
            project.managerName === session.user.displayName) &&
          !["COMPLETED", "CANCELLED", "ARCHIVED"].includes(project.status) ? (
            <ExpansionEntrySheet
              title="Change Project Status"
              triggerLabel="Change status"
              submitLabel="Save status"
              triggerClassName="border border-blue-200 bg-white text-blue-700 hover:bg-blue-50"
            >
              <form action={transitionProjectLifecycleAction} className="grid gap-5 pt-5">
                <input name="projectId" type="hidden" value={project.id} />
                <input name="expectedVersion" type="hidden" value={project.version} />
                <p className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-sm text-blue-950">
                  Status changes are audited. Completing or archiving remains blocked until the project gates, checklist, and required evidence/signoffs are ready.
                </p>
                <label className="grid gap-2 text-sm font-semibold text-slate-700">
                  New status
                  <select className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm" name="nextStatus" defaultValue={project.status === "ON_HOLD" ? "ACTIVE" : "ON_HOLD"} required>
                    {project.status !== "ACTIVE" ? <option value="ACTIVE">Active</option> : null}
                    {project.status !== "ON_HOLD" ? <option value="ON_HOLD">On hold</option> : null}
                    <option value="COMPLETED">Completed</option>
                    <option value="CANCELLED">Cancelled</option>
                  </select>
                </label>
                <label className="grid gap-2 text-sm font-semibold text-slate-700">
                  Reason
                  <textarea className="min-h-24 rounded-lg border border-slate-300 px-3 py-2 text-sm" name="reason" placeholder="Explain the status change" required />
                </label>
              </form>
            </ExpansionEntrySheet>
          ) : null}
        </div>
      </div>

      <nav
        aria-label="Project detail views"
        className="mb-5 flex flex-wrap gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-sm"
      >
        {projectTabs.map(([key, label]) => (
          <Link
            key={key}
            aria-current={view === key ? "page" : undefined}
            className={`inline-flex min-h-11 items-center rounded-lg px-4 text-sm font-bold transition-colors ${
              view === key
                ? "bg-blue-600 text-white"
                : "text-slate-600 hover:bg-slate-50 hover:text-slate-950"
            }`}
            href={`/expansion/sites/${project.id}?view=${key}`}
          >
            {label}
          </Link>
        ))}
      </nav>

      {view === "overview" ? <section className="ogfi-data-surface overflow-hidden">
        <div className="ogfi-section-header">
          <div>
            <h2 className="text-lg font-bold text-slate-950">Project Overview</h2>
            <p className="text-sm text-slate-500">Source-backed project scope, lifecycle gates, and current exceptions.</p>
          </div>
          {(session.permissionCodes.includes(permissions.projectManage) ||
            project.sponsorName === session.user.displayName ||
            project.managerName === session.user.displayName) ? (
            <ExpansionEntrySheet
              title="Edit Project Details"
              triggerLabel="Edit details"
              submitLabel="Save details"
              triggerClassName="border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
            >
              <form action={updateProjectDetailsAction} className="grid gap-5 pt-5">
                <input name="projectId" type="hidden" value={project.id} />
                <input name="expectedVersion" type="hidden" value={project.version} />
                <label className="grid gap-2 text-sm font-semibold text-slate-700">
                  Target opening date
                  <input className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm" name="targetEndAt" type="date" defaultValue={project.targetOpeningDate ?? ""} />
                </label>
                <label className="grid gap-2 text-sm font-semibold text-slate-700">
                  Project description
                  <textarea className="min-h-28 rounded-lg border border-slate-300 px-3 py-2 text-sm" name="description" defaultValue={project.description ?? ""} placeholder="Opening objective, site context, dependencies, or planning assumptions." />
                </label>
              </form>
            </ExpansionEntrySheet>
          ) : null}
        </div>
        <div className="grid gap-4 p-5 md:grid-cols-3">
          <div><p className="text-xs font-semibold uppercase text-slate-500">Brand / site</p><p className="mt-1 font-bold text-slate-950">{project.brandName}</p><p className="text-sm text-slate-600">{project.siteName}</p></div>
          <div><p className="text-xs font-semibold uppercase text-slate-500">Sponsor / manager</p><p className="mt-1 font-bold text-slate-950">{project.sponsorName}</p><p className="text-sm text-slate-600">Manager: {project.managerName}</p></div>
          <div><p className="text-xs font-semibold uppercase text-slate-500">Target opening</p><p className="mt-1 font-bold text-slate-950">{project.targetOpeningDate ?? "Not recorded"}</p><p className="text-sm text-slate-600">Next: {project.nextMilestoneTitle ?? "No upcoming milestone"}</p></div>
        </div>
        <div className="border-t border-slate-100 px-5 py-4">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Project work</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {projectWorkspaces.map(([label, href]) => <Link className="inline-flex min-h-11 items-center rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 hover:bg-slate-50" href={href} key={href}>{label}</Link>)}
          </div>
          {project.sponsorName === project.managerName ? (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
              <p className="text-sm text-amber-900">Lifecycle gate review is paused until distinct independent project leaders are assigned.</p>
              <ExpansionEntrySheet title="Assign Independent Project Leaders" triggerLabel="Assign leaders" submitLabel="Save leadership" triggerClassName="bg-amber-700 text-white hover:bg-amber-800">
                <form action={updateProjectLeadershipAction} className="grid gap-5 pt-5">
                  <input name="projectId" type="hidden" value={project.id} />
                  <input name="expectedVersion" type="hidden" value={project.version} />
                  <label className="grid gap-2 text-sm font-semibold text-slate-700">Project manager<select className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm" defaultValue="" name="managerUserId" required><option value="">Select manager</option>{createOptions.leadershipUsers.filter((user) => user.id !== session.user.id).map((user) => <option key={user.id} value={user.id}>{user.displayName} / {user.email}</option>)}</select></label>
                  <label className="grid gap-2 text-sm font-semibold text-slate-700">Primary sponsor<select className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm" defaultValue="" name="sponsorUserId" required><option value="">Select sponsor</option>{createOptions.leadershipUsers.filter((user) => user.id !== session.user.id).map((user) => <option key={user.id} value={user.id}>{user.displayName} / {user.email}</option>)}</select></label>
                  <label className="grid gap-2 text-sm font-semibold text-slate-700">Reason<textarea className="min-h-24 rounded-lg border border-slate-300 px-3 py-2 text-sm" name="reason" placeholder="Why leadership is being assigned or corrected" required /></label>
                </form>
              </ExpansionEntrySheet>
            </div>
          ) : null}
        </div>
      </section> : null}

      {view === "requirements" ? <section className="ogfi-data-surface overflow-hidden">
        <div className="ogfi-section-header">
          <div><h2 className="text-lg font-bold text-slate-950">Evidence & Signoffs</h2><p className="text-sm text-slate-500">Project requirements copied from the selected opening playbook. These controls never approve or change linked ERP records.</p></div>
          <Badge tone="info">{requirements.length} requirement{requirements.length === 1 ? "" : "s"}</Badge>
        </div>
        {requirements.length === 0 ? <p className="px-5 py-8 text-sm text-slate-500">This project has no additional playbook evidence or signoff requirements.</p> : <>
          <div className="hidden overflow-x-auto md:block"><table className="w-full min-w-[860px] text-sm"><thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-3">Requirement</th><th className="px-5 py-3">Responsibility</th><th className="px-5 py-3">Evidence</th><th className="px-5 py-3">Status</th><th className="px-5 py-3 text-right">Action</th></tr></thead><tbody className="divide-y divide-slate-100">{visibleRequirements.map((requirement) => <RequirementRow key={requirement.id} projectId={project.id} requirement={requirement} reviewerOptions={reviewerOptions} />)}</tbody></table></div>
          <div className="divide-y divide-slate-100 md:hidden">{visibleRequirements.map((requirement) => <div className="p-4" key={requirement.id}><RequirementCard projectId={project.id} requirement={requirement} reviewerOptions={reviewerOptions} /></div>)}</div>
          <FinancePagination basePath={`/expansion/sites/${project.id}`} tab="requirements" {...requirementPagination} totalCount={requirements.length} />
        </>}
      </section> : null}

      {view === "lifecycle" ? <section className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="ogfi-data-surface overflow-hidden">
          <div className="ogfi-section-header"><div><h2 className="text-lg font-bold text-slate-950">Lifecycle Gates</h2><p className="text-sm text-slate-500">Each gate is reviewed in the Lifecycle Gates workspace.</p></div><Link className="text-sm font-bold text-blue-700 hover:text-blue-800" href={`/expansion/gates?q=${encodeURIComponent(project.code)}`}>Open this project&apos;s gates</Link></div>
          <div className="divide-y divide-slate-100">
            {gates.map((gate) => <div className="grid gap-2 px-5 py-4 sm:grid-cols-[3rem_minmax(0,1fr)_auto]" key={gate.gateKey}><p className="text-sm font-bold text-slate-500">{gate.gateOrder}</p><div><p className="font-bold text-slate-950">{gate.title}</p><p className="mt-1 text-xs text-slate-500">Owner: {gate.ownerName ?? "Not assigned"} · Evidence: {gate.evidenceState.replaceAll("_", " ")}</p>{gate.atRiskReason ? <p className="mt-1 text-xs text-amber-700">{gate.atRiskReason}</p> : null}</div><Badge tone={tone(gate.status)}>{gate.status.replaceAll("_", " ")}</Badge></div>)}
            {gates.length === 0 ? <p className="px-5 py-8 text-sm text-slate-500">Lifecycle gates have not been generated for this project yet.</p> : null}
          </div>
        </div>
        <aside className="ogfi-data-surface h-fit overflow-hidden"><div className="ogfi-section-header"><div><h2 className="text-base font-bold text-slate-950">Attention</h2><p className="text-sm text-slate-500">Live project exceptions</p></div></div><dl className="grid grid-cols-2 gap-4 p-5 text-sm"><div><dt className="text-slate-500">Progress</dt><dd className="mt-1 font-bold text-slate-950">{project.completionPercent}%</dd></div><div><dt className="text-slate-500">Overdue</dt><dd className="mt-1 font-bold text-slate-950">{project.overdueTaskCount}</dd></div><div><dt className="text-slate-500">Blocked</dt><dd className="mt-1 font-bold text-slate-950">{project.blockedTaskCount > 0 ? <Link className="text-blue-700 hover:text-blue-900" href={`/expansion/construction?q=${encodeURIComponent(project.code)}&status=BLOCKED`}>{project.blockedTaskCount}</Link> : 0}</dd></div><div><dt className="text-slate-500">Open risks</dt><dd className="mt-1 font-bold text-slate-950">{project.openRiskCount}</dd></div></dl><div className="border-t border-slate-100 p-5 text-xs text-slate-500">Use Project work to record the next controlled action. Financial, procurement, inventory, and approval records remain in their authoritative ERP modules.</div></aside>
      </section> : null}

      {view === "activity" ? <section className="mt-5 ogfi-data-surface overflow-hidden"><div className="ogfi-section-header"><div><h2 className="text-lg font-bold text-slate-950">Project Activity</h2><p className="text-sm text-slate-500">Controlled project actions, their outcomes, and recorded reasons.</p></div><Badge tone="info">{activityData.totalCount} event{activityData.totalCount === 1 ? "" : "s"}</Badge></div><div className="divide-y divide-slate-100">{activity.map((event) => <div className="flex flex-wrap items-start justify-between gap-3 px-5 py-4" key={event.id}><div className="min-w-0"><p className="font-semibold text-slate-950">{event.eventType.replaceAll("_", " ")}</p><p className="mt-1 text-sm text-slate-600">{event.summary}</p>{event.reason ? <p className="mt-1 text-xs text-slate-500">Reason: {event.reason}</p> : null}<p className="mt-1 text-xs text-slate-500">{event.actorName}</p></div><time className="shrink-0 text-xs text-slate-500">{new Date(event.occurredAt).toLocaleString("en-PH", { timeZone: "Asia/Manila" })}</time></div>)}{activity.length === 0 ? <p className="px-5 py-8 text-sm text-slate-500">No project activity is available.</p> : null}</div><FinancePagination basePath={`/expansion/sites/${project.id}`} tab="activity" tabParam="view" pageParam="activityPage" {...activityPagination} totalCount={activityData.totalCount} /></section> : null}
    </AppShell>
  );
}
