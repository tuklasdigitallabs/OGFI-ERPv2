"use client";

import {
  CheckCircle2,
  Clock3,
  FileWarning,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { EntryModal } from "@/components/EntryModal";
import { bytesLabel } from "./evidenceUploadClient";
import type { ControlledEvidenceDisplayRow, EvidenceSourceType } from "./types";

function attachmentState(attachment: ControlledEvidenceDisplayRow) {
  if (
    attachment.availabilityState === "AVAILABLE" &&
    attachment.scanState === "CLEAN"
  ) {
    return {
      label: "Available",
      help: "Safety checks passed",
      className: "border-emerald-200 bg-emerald-50 text-emerald-800",
      Icon: CheckCircle2,
      downloadable: true,
    };
  }
  if (
    attachment.availabilityState === "REJECTED" ||
    ["THREAT_FOUND", "UNSUPPORTED"].includes(attachment.scanState ?? "")
  ) {
    return {
      label: "File rejected",
      help: "Upload a different file or contact support",
      className: "border-red-200 bg-red-50 text-red-800",
      Icon: FileWarning,
      downloadable: false,
    };
  }
  if (
    attachment.availabilityState === "EXPIRED" ||
    attachment.uploadState === "EXPIRED"
  ) {
    return {
      label: "Upload expired",
      help: "Upload the file again",
      className: "border-amber-200 bg-amber-50 text-amber-800",
      Icon: RefreshCw,
      downloadable: false,
    };
  }
  if (
    attachment.uploadState === "FAILED" ||
    ["ACCESS_DENIED", "FAILED", "TIMED_OUT"].includes(
      attachment.scanState ?? "",
    )
  ) {
    return {
      label: "Processing failed",
      help: "Retry or contact support",
      className: "border-red-200 bg-red-50 text-red-800",
      Icon: FileWarning,
      downloadable: false,
    };
  }
  if (
    attachment.availabilityState === "REMOVED" ||
    attachment.status === "ARCHIVED"
  ) {
    return {
      label: "Archived",
      help: "Retained for audit",
      className: "border-slate-200 bg-slate-100 text-slate-700",
      Icon: ShieldCheck,
      downloadable: false,
    };
  }
  if (
    attachment.uploadState === "LEGACY_UNVERIFIED" ||
    attachment.scanState === "LEGACY_UNVERIFIED"
  ) {
    return {
      label: "Not yet verified",
      help: "Unavailable until verification is complete",
      className: "border-amber-200 bg-amber-50 text-amber-800",
      Icon: Clock3,
      downloadable: false,
    };
  }
  return {
    label: "Safety check in progress",
    help: "Available after checks pass; refresh this page later",
    className: "border-blue-200 bg-blue-50 text-blue-800",
    Icon: Clock3,
    downloadable: false,
  };
}

export function ControlledEvidenceList({
  attachments,
  canArchive,
  sourceType,
  sourceRecordId,
  archiveAction,
  archiveImpact,
}: {
  attachments: readonly ControlledEvidenceDisplayRow[];
  canArchive: boolean;
  sourceType: EvidenceSourceType;
  sourceRecordId: string;
  archiveAction?: ((formData: FormData) => Promise<void>) | undefined;
  archiveImpact: string;
}) {
  const visibleAttachments = attachments.slice(0, 10);

  if (visibleAttachments.length === 0) {
    return (
      <p className="text-xs text-slate-500">No controlled evidence uploaded.</p>
    );
  }

  return (
    <div className="grid gap-2" aria-label="Controlled evidence files">
      {visibleAttachments.map((attachment) => {
        const state = attachmentState(attachment);
        const StateIcon = state.Icon;
        return (
          <div
            key={attachment.id}
            className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3"
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <p className="break-words text-sm font-bold text-slate-950">
                  {attachment.originalFilename}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {bytesLabel(attachment.sizeBytes)} ·{" "}
                  {attachment.purpose.replaceAll("_", " ").toLowerCase()}
                </p>
                {attachment.caption ? (
                  <p className="mt-1 text-xs leading-5 text-slate-600">
                    {attachment.caption}
                  </p>
                ) : null}
                {attachment.legalHold ? (
                  <p className="mt-2 text-xs font-semibold text-violet-800">
                    Legal hold — this evidence link cannot be archived.
                  </p>
                ) : attachment.requiredForAction ? (
                  <p className="mt-2 text-xs font-semibold text-amber-800">
                    Required evidence — preserved for{" "}
                    {attachment.requiredForAction
                      .replaceAll("_", " ")
                      .toLowerCase()}
                    .
                  </p>
                ) : null}
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                <span
                  className={`inline-flex min-h-8 items-center gap-1.5 rounded-full border px-2.5 text-xs font-bold ${state.className}`}
                  title={state.help}
                >
                  <StateIcon aria-hidden="true" className="h-3.5 w-3.5" />
                  {state.label}
                </span>
                {state.downloadable ? (
                  <a
                    className="inline-flex min-h-10 items-center justify-center rounded-lg border border-blue-200 bg-white px-3 text-xs font-bold text-blue-700 hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                    href={`/evidence/${attachment.id}/download`}
                  >
                    Download
                  </a>
                ) : null}
                {archiveAction &&
                canArchive &&
                !attachment.requiredForAction &&
                !attachment.legalHold ? (
                  <EntryModal
                    title="Archive Evidence Link"
                    triggerLabel="Archive"
                    triggerClassName="border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                  >
                    <form action={archiveAction} className="grid gap-4 pt-5">
                      <input
                        name="controlledEvidenceAttachmentId"
                        type="hidden"
                        value={attachment.id}
                      />
                      <input
                        name="sourceType"
                        type="hidden"
                        value={sourceType}
                      />
                      <input
                        name="sourceRecordId"
                        type="hidden"
                        value={sourceRecordId}
                      />
                      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
                        {archiveImpact}
                      </div>
                      <label className="grid gap-1 text-sm font-medium text-slate-700">
                        Archive reason
                        <textarea
                          className="min-h-24 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950"
                          name="archiveReason"
                          placeholder="Duplicate link, wrong record, or superseded evidence"
                          required
                        />
                      </label>
                      <button className="inline-flex min-h-11 items-center justify-center rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                        Archive Evidence Link
                      </button>
                    </form>
                  </EntryModal>
                ) : archiveAction &&
                  canArchive &&
                  (attachment.requiredForAction || attachment.legalHold) ? (
                  <button
                    className="inline-flex min-h-10 cursor-not-allowed items-center justify-center rounded-lg border border-slate-200 bg-slate-100 px-3 text-xs font-bold text-slate-500"
                    disabled
                    title={
                      attachment.legalHold
                        ? "Legal hold prevents archival"
                        : "Required evidence cannot be archived"
                    }
                    type="button"
                  >
                    Archive unavailable
                  </button>
                ) : null}
              </div>
            </div>
            {!state.downloadable ? (
              <p className="mt-2 text-xs text-slate-500">{state.help}</p>
            ) : null}
          </div>
        );
      })}
      {attachments.length > 10 ? (
        <a
          className="inline-flex min-h-10 items-center justify-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-blue-700 hover:bg-blue-50"
          href={`/evidence?sourceType=${encodeURIComponent(sourceType)}&sourceRecordId=${encodeURIComponent(sourceRecordId)}&page=1`}
        >
          View all evidence
        </a>
      ) : null}
    </div>
  );
}
