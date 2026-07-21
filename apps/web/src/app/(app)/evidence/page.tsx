import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { ActionFeedbackBanner } from "@/components/ActionFeedbackBanner";
import { AppShell } from "@/components/AppShell";
import { ControlledEvidenceList } from "@/components/evidence/ControlledEvidenceList";
import {
  archiveControlledEvidenceAttachment,
  canArchiveControlledEvidenceSource,
  evidenceAttachmentSourceTypes,
  listControlledEvidenceAttachmentPage,
  type EvidenceAttachmentSourceType,
} from "@/server/services/attachments";
import {
  actionErrorRedirectPath,
  getActionFeedback,
} from "@/server/services/actionFeedback";
import { assertTrustedServerActionOrigin } from "@/server/services/authentication";
import { getSessionContext } from "@/server/services/context";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function normalizedPage(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 1 ? Math.floor(parsed) : 1;
}

function pageHref(sourceType: string, sourceRecordId: string, page: number) {
  const query = new URLSearchParams({
    sourceType,
    sourceRecordId,
    page: String(page),
  });
  return `/evidence?${query.toString()}`;
}

async function archiveEvidenceFromRegisterAction(formData: FormData) {
  "use server";
  await assertTrustedServerActionOrigin();
  const sourceType = String(formData.get("sourceType") ?? "");
  const sourceRecordId = String(formData.get("sourceRecordId") ?? "");
  const returnPath =
    evidenceAttachmentSourceTypes.includes(
      sourceType as EvidenceAttachmentSourceType,
    ) && /^[0-9a-f-]{36}$/i.test(sourceRecordId)
      ? pageHref(sourceType, sourceRecordId, 1)
      : "/evidence";
  try {
    await archiveControlledEvidenceAttachment({
      controlledEvidenceAttachmentId: String(
        formData.get("controlledEvidenceAttachmentId") ?? "",
      ),
      archiveReason: String(formData.get("archiveReason") ?? "").trim(),
      requiredPermissionCode: "SERVICE_ENFORCED",
    });
  } catch (error) {
    redirect(actionErrorRedirectPath(returnPath, error));
  }
  revalidatePath("/evidence");
  redirect(`${returnPath}&success=EVIDENCE_LINK_ARCHIVED`);
}

export default async function EvidenceRegisterPage({
  searchParams,
}: PageProps) {
  const session = await getSessionContext();
  if (!session) redirect("/sign-in");
  const params = searchParams ? await searchParams : {};
  const sourceType = first(params.sourceType);
  const sourceRecordId = first(params.sourceRecordId);
  if (
    !sourceType ||
    !evidenceAttachmentSourceTypes.includes(
      sourceType as EvidenceAttachmentSourceType,
    ) ||
    !sourceRecordId ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      sourceRecordId,
    )
  ) {
    notFound();
  }
  const requestedPage = normalizedPage(first(params.page));
  let register;
  try {
    register = await listControlledEvidenceAttachmentPage({
      sourceType: sourceType as EvidenceAttachmentSourceType,
      sourceRecordId,
      requiredPermissionCode: "SERVICE_ENFORCED",
      page: requestedPage,
      pageSize: 10,
    });
  } catch (error) {
    if (
      error instanceof Error &&
      [
        "PERMISSION_DENIED",
        "CONTROLLED_EVIDENCE_SOURCE_NOT_AVAILABLE",
        "COMPANY_CONTEXT_REQUIRED",
      ].includes(error.message)
    ) {
      notFound();
    }
    throw error;
  }
  const totalPages = Math.max(1, register.totalPages);
  if (register.totalCount > 0 && requestedPage > totalPages) {
    redirect(pageHref(sourceType, sourceRecordId, totalPages));
  }
  const canArchive = await canArchiveControlledEvidenceSource(
    session,
    sourceType as EvidenceAttachmentSourceType,
    sourceRecordId,
  );
  const actionFeedback = getActionFeedback(params);

  return (
    <AppShell
      session={session}
      title="Controlled Evidence"
      subtitle="Private evidence attached to the selected business record"
      activeNav="dashboard"
    >
      <ActionFeedbackBanner feedback={actionFeedback} />
      {first(params.success) === "EVIDENCE_LINK_ARCHIVED" ? (
        <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950">
          The optional evidence link was archived. The file remains preserved
          for audit and recovery.
        </div>
      ) : null}
      <section className="grid gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            {sourceType.replaceAll("_", " ").toLowerCase()}
          </p>
          <h2 className="mt-1 text-lg font-bold text-slate-950">
            Evidence register
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Showing {register.rows.length} of {register.totalCount} active
            files.
          </p>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            {canArchive
              ? "You may archive optional links here. Required or legally held evidence remains preserved."
              : "This register is read-only for your current authority. Return to the source workspace for other record actions."}
          </p>
        </div>
        <ControlledEvidenceList
          archiveAction={
            canArchive ? archiveEvidenceFromRegisterAction : undefined
          }
          archiveImpact="This archives the optional evidence link only. The file remains preserved for audit and recovery; the source record is not changed."
          attachments={register.rows}
          canArchive={canArchive}
          sourceRecordId={sourceRecordId}
          sourceType={sourceType as EvidenceAttachmentSourceType}
        />
        {register.totalPages > 1 ? (
          <nav
            aria-label="Evidence pages"
            className="flex items-center justify-between gap-3 border-t border-slate-200 pt-4"
          >
            <a
              aria-disabled={register.page <= 1}
              className={`inline-flex min-h-10 items-center rounded-lg border px-3 text-sm font-semibold ${
                register.page <= 1
                  ? "pointer-events-none border-slate-200 text-slate-400"
                  : "border-blue-200 text-blue-700 hover:bg-blue-50"
              }`}
              href={pageHref(sourceType, sourceRecordId, register.page - 1)}
            >
              Previous
            </a>
            <span className="text-sm text-slate-600">
              Page {register.page} of {register.totalPages}
            </span>
            <a
              aria-disabled={register.page >= register.totalPages}
              className={`inline-flex min-h-10 items-center rounded-lg border px-3 text-sm font-semibold ${
                register.page >= register.totalPages
                  ? "pointer-events-none border-slate-200 text-slate-400"
                  : "border-blue-200 text-blue-700 hover:bg-blue-50"
              }`}
              href={pageHref(sourceType, sourceRecordId, register.page + 1)}
            >
              Next
            </a>
          </nav>
        ) : null}
      </section>
    </AppShell>
  );
}
