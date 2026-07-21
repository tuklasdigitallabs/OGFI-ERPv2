import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ShieldCheck, ShieldAlert } from "lucide-react";
import { Badge, Panel } from "@ogfi/ui";
import { ActionFeedbackBanner } from "@/components/ActionFeedbackBanner";
import { AppShell } from "@/components/AppShell";
import { EntryModal } from "@/components/EntryModal";
import {
  actionErrorRedirectPath,
  getActionFeedback,
} from "@/server/services/actionFeedback";
import { assertTrustedServerActionOrigin } from "@/server/services/authentication";
import {
  getDefaultAppRoute,
  permissions,
} from "@/server/services/authorization";
import { getSessionContext } from "@/server/services/context";
import {
  listEvidenceRetentionRegister,
  setEvidenceLegalHold,
} from "@/server/services/evidenceRetention";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type RegisterRow = Awaited<
  ReturnType<typeof listEvidenceRetentionRegister>
>["rows"][number];

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function normalizedPage(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 1 ? Math.floor(parsed) : 1;
}

function returnPath(formData: FormData) {
  const page = normalizedPage(formData.get("page"));
  const heldOnly = formData.get("heldOnly") === "1";
  return `/admin/evidence-retention?page=${page}${heldOnly ? "&heldOnly=1" : ""}`;
}

async function placeLegalHoldAction(formData: FormData) {
  "use server";
  await assertTrustedServerActionOrigin();
  const path = returnPath(formData);
  try {
    await setEvidenceLegalHold({
      attachmentId: String(formData.get("attachmentId") ?? ""),
      expectedRowVersion: Number(formData.get("expectedRowVersion")),
      authority: String(formData.get("authority") ?? ""),
      caseReference: String(formData.get("caseReference") ?? ""),
      reason: String(formData.get("reason") ?? ""),
    });
  } catch (error) {
    redirect(actionErrorRedirectPath(path, error));
  }
  revalidatePath("/admin/evidence-retention");
  redirect(`${path}&success=EVIDENCE_LEGAL_HOLD_PLACED`);
}

function date(value: Date | null) {
  if (!value) return "Not set";
  return new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Manila",
  }).format(value);
}

function size(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function stateTone(value: string) {
  if (["AVAILABLE", "CLEAN", "DURABLE", "VERIFIED"].includes(value)) {
    return "success" as const;
  }
  if (["QUARANTINED", "PENDING", "UPLOADING"].includes(value)) {
    return "warning" as const;
  }
  if (["REJECTED", "PURGED", "FAILED", "EXPIRED"].includes(value)) {
    return "destructive" as const;
  }
  return "neutral" as const;
}

function sourceLabels(row: RegisterRow) {
  return [
    ...row.controlledEvidenceLinks.map(
      (link) =>
        `${link.sourceType} · ${link.sourceRecordId.slice(0, 8)} · ${link.status === "ACTIVE" && !link.archivedAt ? "active" : "archived"}`,
    ),
    ...row.projectLinks.map(
      (link) =>
        `PROJECT · ${link.projectId.slice(0, 8)} · ${link.status === "ACTIVE" && !link.archivedAt ? "active" : "archived"}`,
    ),
  ];
}

function HoldControl({
  row,
  canSetHold,
  page,
  heldOnly,
}: {
  row: RegisterRow;
  canSetHold: boolean;
  page: number;
  heldOnly: boolean;
}) {
  if (row.legalHold) {
    return (
      <p className="text-xs leading-5 text-slate-600">
        Preservation hold is active. Release is not available in this release.
      </p>
    );
  }
  const purged = row.physicalState === "PURGED";
  if (!canSetHold || purged) {
    return (
      <p className="text-xs leading-5 text-slate-500">
        {purged
          ? "A hold cannot be placed because the evidence bytes were already purged."
          : "You have view-only access. Legal-hold placement requires separate authority."}
      </p>
    );
  }
  return (
    <EntryModal
      title="Place preservation legal hold"
      triggerLabel="Place Legal Hold"
    >
      <form action={placeLegalHoldAction} className="grid gap-4 pt-5">
        <input name="attachmentId" type="hidden" value={row.id} />
        <input name="expectedRowVersion" type="hidden" value={row.rowVersion} />
        <input name="page" type="hidden" value={page} />
        <input name="heldOnly" type="hidden" value={heldOnly ? "1" : "0"} />
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
          This is preservation-only. It prevents normal archival or disposal and
          cannot be released from this workspace. Current privileged MFA
          assurance is required.
        </div>
        <label className="grid gap-2 text-sm font-semibold text-slate-700">
          Authority
          <input
            className="min-h-11 rounded-lg border border-slate-200 px-3"
            maxLength={200}
            minLength={3}
            name="authority"
            placeholder="Legal, compliance, or authorized office"
            required
          />
        </label>
        <label className="grid gap-2 text-sm font-semibold text-slate-700">
          Case or instruction reference
          <input
            className="min-h-11 rounded-lg border border-slate-200 px-3"
            maxLength={200}
            minLength={2}
            name="caseReference"
            required
          />
        </label>
        <label className="grid gap-2 text-sm font-semibold text-slate-700">
          Preservation reason
          <textarea
            className="min-h-28 rounded-lg border border-slate-200 px-3 py-2"
            maxLength={1000}
            minLength={5}
            name="reason"
            required
          />
        </label>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <a
            className="text-sm font-semibold text-blue-700 underline"
            href="/account/security"
          >
            Refresh MFA assurance
          </a>
          <button
            className="min-h-11 rounded-lg bg-slate-950 px-4 text-sm font-bold text-white"
            type="submit"
          >
            Confirm Legal Hold
          </button>
        </div>
      </form>
    </EntryModal>
  );
}

function EvidenceRow({
  row,
  canSetHold,
  page,
  heldOnly,
}: {
  row: RegisterRow;
  canSetHold: boolean;
  page: number;
  heldOnly: boolean;
}) {
  const sources = sourceLabels(row);
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={stateTone(row.availabilityState)}>
          {row.availabilityState.replaceAll("_", " ")}
        </Badge>
        {row.legalHold ? <Badge tone="warning">LEGAL HOLD</Badge> : null}
      </div>
      <p className="break-all font-mono text-xs text-slate-600">{row.id}</p>
      <p className="text-sm text-slate-700">
        {row.mimeType} · {size(row.sizeBytes)} · {date(row.createdAt)}
      </p>
      <div className="flex flex-wrap gap-2">
        {[row.uploadState, row.scanState, row.physicalState].map((state) => (
          <Badge key={state} tone={stateTone(state)} size="sm">
            {state.replaceAll("_", " ")}
          </Badge>
        ))}
      </div>
      <p className="text-xs leading-5 text-slate-600">
        Sources: {sources.length ? sources.join(", ") : "No active source link"}
      </p>
      <p className="text-xs leading-5 text-slate-600">
        Retention: {row.retentionClass ?? "Policy pending"} · until{" "}
        {date(row.retainUntil)}
      </p>
      {row.legalHold ? (
        <div className="rounded-lg border border-violet-200 bg-violet-50 p-3 text-xs leading-5 text-violet-950">
          <p>
            Authority: {row.legalHoldAuthority ?? "Not recorded"} · Case:{" "}
            {row.legalHoldCaseReference ?? "Not recorded"}
          </p>
          <p className="mt-1">
            Reason: {row.legalHoldReason ?? "Not recorded"}
          </p>
        </div>
      ) : null}
      {row.legalHold ? (
        <p className="text-xs leading-5 text-slate-600">
          {row.legalHoldAuthority} · {row.legalHoldCaseReference} · placed{" "}
          {date(row.legalHoldSetAt)}
        </p>
      ) : null}
      <HoldControl
        row={row}
        canSetHold={canSetHold}
        page={page}
        heldOnly={heldOnly}
      />
    </div>
  );
}

function pageHref(page: number, heldOnly: boolean) {
  return `/admin/evidence-retention?page=${page}${heldOnly ? "&heldOnly=1" : ""}`;
}

export default async function EvidenceRetentionPage({
  searchParams,
}: PageProps) {
  const session = await getSessionContext();
  if (!session) redirect("/sign-in");
  if (!session.permissionCodes.includes(permissions.evidenceRetentionView)) {
    redirect(getDefaultAppRoute(session.permissionCodes));
  }
  const params = searchParams ? await searchParams : {};
  const requestedPage = normalizedPage(first(params.page));
  const heldOnly = first(params.heldOnly) === "1";
  const register = await listEvidenceRetentionRegister({
    page: requestedPage,
    pageSize: 10,
    heldOnly,
  });
  const totalPages = Math.max(1, register.totalPages);
  if (register.totalCount > 0 && requestedPage > totalPages) {
    redirect(pageHref(totalPages, heldOnly));
  }
  const canSetHold = session.permissionCodes.includes(
    permissions.evidenceLegalHoldSet,
  );

  return (
    <AppShell
      session={session}
      title="Evidence Retention"
      subtitle="Confidential preservation and legal-hold register"
      activeNav="admin-evidence-retention"
    >
      <ActionFeedbackBanner feedback={getActionFeedback(params)} />
      {first(params.success) === "EVIDENCE_LEGAL_HOLD_PLACED" ? (
        <div
          className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950"
          role="status"
        >
          <p className="font-bold">Legal hold placed</p>
          <p className="mt-1">
            The preservation hold is active and recorded in the audit history.
          </p>
        </div>
      ) : null}
      <section className="mb-5 grid gap-4 lg:grid-cols-[1.35fr_0.65fr]">
        <Panel className="ogfi-detail-card">
          <Badge tone="info">Metadata only</Badge>
          <h2 className="mt-3 text-xl font-bold text-slate-950">
            Company-scoped evidence preservation register
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            This workspace exposes retention metadata and source lineage only.
            It never exposes storage paths, object keys, checksums, or file
            bytes.
          </p>
        </Panel>
        <Panel className="ogfi-detail-card">
          <div className="flex items-start gap-3">
            <ShieldAlert
              aria-hidden="true"
              className="mt-0.5 h-5 w-5 text-amber-600"
            />
            <div>
              <p className="font-bold text-slate-950">
                Preservation-only control
              </p>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                Hold release and physical purge are intentionally unavailable.
              </p>
            </div>
          </div>
        </Panel>
      </section>

      <Panel className="ogfi-detail-card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-bold text-slate-950">
              {register.totalCount} evidence record
              {register.totalCount === 1 ? "" : "s"}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Page {requestedPage} of {totalPages}
            </p>
          </div>
          <a
            className="min-h-10 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700"
            href={pageHref(1, !heldOnly)}
          >
            {heldOnly ? "Show all evidence" : "Show legal holds only"}
          </a>
        </div>

        {register.rows.length === 0 ? (
          <div className="mt-5 rounded-xl border border-dashed border-slate-300 p-8 text-center">
            <ShieldCheck
              aria-hidden="true"
              className="mx-auto h-7 w-7 text-slate-400"
            />
            <p className="mt-3 font-bold text-slate-900">
              {heldOnly
                ? "No legal holds in this company"
                : "No evidence records yet"}
            </p>
            <p className="mt-1 text-sm text-slate-500">
              Records appear here after an authorized workspace issues an
              evidence upload.
            </p>
          </div>
        ) : (
          <div className="mt-5 grid gap-3">
            {register.rows.map((row) => (
              <article
                key={row.id}
                className="rounded-xl border border-slate-200 p-4"
              >
                <EvidenceRow
                  row={row}
                  canSetHold={canSetHold}
                  page={requestedPage}
                  heldOnly={heldOnly}
                />
              </article>
            ))}
          </div>
        )}

        <nav
          aria-label="Evidence retention pages"
          className="mt-5 flex items-center justify-between gap-3"
        >
          {requestedPage > 1 ? (
            <a
              className="text-sm font-semibold text-blue-700"
              href={pageHref(requestedPage - 1, heldOnly)}
            >
              Previous
            </a>
          ) : (
            <span />
          )}
          {requestedPage < totalPages ? (
            <a
              className="text-sm font-semibold text-blue-700"
              href={pageHref(requestedPage + 1, heldOnly)}
            >
              Next
            </a>
          ) : (
            <span />
          )}
        </nav>
      </Panel>
    </AppShell>
  );
}
