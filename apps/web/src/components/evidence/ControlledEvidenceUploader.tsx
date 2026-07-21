"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, FileWarning, RefreshCw, Upload, X } from "lucide-react";
import {
  bytesLabel,
  checksumBase64,
  friendlyUploadError,
  responseJson,
  uploadEvidenceObject,
  validateEvidenceFile,
} from "./evidenceUploadClient";
import {
  acceptedFileTypes,
  type EvidencePurpose,
  type EvidenceSourceType,
  type UploadIntentResponse,
  type UploadPhase,
} from "./types";

export function ControlledEvidenceUploader({
  sourceType,
  sourceRecordId,
  sourceLineId,
  purpose,
  requiredForAction,
  triggerLabel,
  captionPlaceholder,
}: {
  sourceType: EvidenceSourceType;
  sourceRecordId: string;
  sourceLineId?: string | null | undefined;
  purpose: EvidencePurpose;
  requiredForAction?: string | undefined;
  triggerLabel: string;
  captionPlaceholder: string;
}) {
  const router = useRouter();
  const titleId = useId();
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const dialogRef = useRef<HTMLElement | null>(null);
  const idempotencyRef = useRef<{ fingerprint: string; key: string } | null>(
    null,
  );
  const [isOpen, setIsOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [caption, setCaption] = useState("");
  const [phase, setPhase] = useState<UploadPhase>("idle");
  const [progress, setProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const busy = ["hashing", "uploading"].includes(phase);

  function resetForFile(nextFile: File | null) {
    setFile(nextFile);
    setErrorMessage(nextFile ? validateEvidenceFile(nextFile) : null);
    setPhase("idle");
    setProgress(0);
    idempotencyRef.current = null;
  }

  async function submitUpload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file || busy) return;
    const validationError = validateEvidenceFile(file);
    if (validationError) {
      setErrorMessage(validationError);
      setPhase("error");
      return;
    }

    try {
      setErrorMessage(null);
      setPhase("hashing");
      setProgress(0);
      const checksumSha256Base64 = checksumBase64(
        await window.crypto.subtle.digest("SHA-256", await file.arrayBuffer()),
      );
      const fingerprint = JSON.stringify({
        sourceType,
        sourceRecordId,
        sourceLineId: sourceLineId ?? null,
        purpose,
        requiredForAction: requiredForAction ?? null,
        caption: caption.trim(),
        name: file.name,
        type: file.type,
        size: file.size,
        checksumSha256Base64,
      });
      if (idempotencyRef.current?.fingerprint !== fingerprint) {
        idempotencyRef.current = {
          fingerprint,
          key: `evidence-ui:${window.crypto.randomUUID()}`,
        };
      }
      const intent = await responseJson<UploadIntentResponse>(
        await fetch("/api/evidence/uploads", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sourceType,
            sourceRecordId,
            ...(sourceLineId ? { sourceLineId } : {}),
            purpose,
            ...(caption.trim() ? { caption: caption.trim() } : {}),
            originalFilename: file.name,
            mimeType: file.type,
            sizeBytes: file.size,
            checksumSha256Base64,
            idempotencyKey: idempotencyRef.current.key,
          }),
        }),
      );
      if (new Date(intent.upload.expiresAt).getTime() <= Date.now()) {
        throw new Error("EVIDENCE_UPLOAD_INTENT_EXPIRED");
      }
      setPhase("uploading");
      await uploadEvidenceObject(intent, file, setProgress);
      setProgress(100);
      setPhase("scanning");
      router.refresh();
    } catch (error) {
      if (
        error instanceof Error &&
        (error.message.includes("EXPIRED") ||
          error.message.includes("IDEMPOTENCY_TERMINAL"))
      ) {
        idempotencyRef.current = null;
      }
      setErrorMessage(friendlyUploadError(error));
      setPhase("error");
    }
  }

  const closeUploader = useCallback(() => {
    if (busy) return;
    if (
      (file || caption) &&
      phase !== "scanning" &&
      !window.confirm("Discard this evidence upload?")
    ) {
      return;
    }
    setIsOpen(false);
    if (phase === "scanning") {
      setFile(null);
      setErrorMessage(null);
      setPhase("idle");
      setProgress(0);
      idempotencyRef.current = null;
      setCaption("");
    }
    window.setTimeout(() => triggerRef.current?.focus(), 0);
  }, [busy, caption, file, phase]);

  useEffect(() => {
    if (!isOpen) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        closeUploader();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          "button:not(:disabled), input:not([type='hidden']):not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex='-1'])",
        ),
      ).filter((element) => element.offsetParent !== null);
      if (focusable.length === 0) return;
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);
    window.setTimeout(() => {
      dialogRef.current
        ?.querySelector<HTMLInputElement>("input[type='file']")
        ?.focus();
    }, 0);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [closeUploader, isOpen]);

  return (
    <>
      <button
        ref={triggerRef}
        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-blue-200 bg-white px-4 text-sm font-bold text-blue-700 hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        type="button"
        onClick={() => setIsOpen(true)}
      >
        <Upload aria-hidden="true" className="h-4 w-4" />
        {triggerLabel}
      </button>

      {isOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/45 p-0 backdrop-blur-sm sm:items-center sm:p-4"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeUploader();
          }}
        >
          <section
            ref={dialogRef}
            aria-labelledby={titleId}
            aria-modal="true"
            className="flex max-h-[94vh] w-full flex-col overflow-hidden rounded-t-2xl border border-white/70 bg-white shadow-2xl sm:max-w-2xl sm:rounded-2xl"
            role="dialog"
          >
            <div className="flex items-center justify-between gap-4 border-b border-slate-200 bg-gradient-to-br from-white via-slate-50 to-blue-50/70 px-4 py-4 sm:px-6">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Private controlled evidence
                </p>
                <h2
                  id={titleId}
                  className="mt-1 text-lg font-bold text-slate-950"
                >
                  Upload Evidence
                </h2>
              </div>
              <button
                aria-label="Close evidence uploader"
                className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:cursor-wait disabled:opacity-50"
                disabled={busy}
                type="button"
                onClick={closeUploader}
              >
                <X aria-hidden="true" className="h-4 w-4" />
              </button>
            </div>
            <form
              className="grid min-h-0 gap-4 overflow-y-auto p-4 sm:p-6"
              onSubmit={submitUpload}
            >
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm leading-6 text-blue-950">
                The file stays private and cannot be downloaded until safety
                checks pass. Uploading evidence does not change or approve the
                source record.
              </div>
              <label className="grid gap-2 text-sm font-semibold text-slate-700">
                Evidence file
                <input
                  accept={acceptedFileTypes}
                  className="min-h-12 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 file:mr-3 file:rounded-md file:border-0 file:bg-blue-600 file:px-3 file:py-2 file:text-sm file:font-bold file:text-white"
                  disabled={busy || phase === "scanning"}
                  type="file"
                  required
                  onChange={(event) =>
                    resetForFile(event.target.files?.[0] ?? null)
                  }
                />
                <span className="text-xs font-normal leading-5 text-slate-500">
                  PDF, JPG, PNG, WebP, or text. Maximum 25 MB. On mobile you may
                  choose a saved file or take a photo when supported.
                </span>
              </label>
              {file ? (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
                  <p className="break-words font-bold text-slate-900">
                    {file.name}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {bytesLabel(file.size)}
                  </p>
                </div>
              ) : null}
              {requiredForAction ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-950">
                  This evidence is required for{" "}
                  {requiredForAction.replaceAll("_", " ").toLowerCase()} and is
                  preserved against normal archival.
                </div>
              ) : null}
              <div className="grid gap-4">
                <label className="grid gap-2 text-sm font-semibold text-slate-700">
                  Caption
                  <input
                    className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-950"
                    disabled={busy || phase === "scanning"}
                    maxLength={500}
                    placeholder={captionPlaceholder}
                    value={caption}
                    onChange={(event) => setCaption(event.target.value)}
                  />
                </label>
              </div>

              {phase !== "idle" ? (
                <div
                  aria-live="polite"
                  className={`rounded-lg border p-3 text-sm ${
                    phase === "error"
                      ? "border-red-200 bg-red-50 text-red-900"
                      : phase === "scanning"
                        ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                        : "border-blue-200 bg-blue-50 text-blue-900"
                  }`}
                >
                  <div className="flex items-center gap-2 font-bold">
                    {phase === "scanning" ? (
                      <CheckCircle2 aria-hidden="true" className="h-4 w-4" />
                    ) : phase === "error" ? (
                      <FileWarning aria-hidden="true" className="h-4 w-4" />
                    ) : (
                      <RefreshCw
                        aria-hidden="true"
                        className="h-4 w-4 animate-spin"
                      />
                    )}
                    {phase === "hashing"
                      ? "Preparing file securely"
                      : phase === "uploading"
                        ? `Uploading · ${progress}%`
                        : phase === "scanning"
                          ? "Upload received"
                          : "Upload needs attention"}
                  </div>
                  {phase === "uploading" ? (
                    <div
                      aria-label={`Upload ${progress}% complete`}
                      aria-valuemax={100}
                      aria-valuemin={0}
                      aria-valuenow={progress}
                      className="mt-2 h-2 overflow-hidden rounded-full bg-blue-100"
                      role="progressbar"
                    >
                      <div
                        className="h-full rounded-full bg-blue-600 transition-[width]"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  ) : null}
                  {phase === "scanning" ? (
                    <p className="mt-1 text-xs leading-5">
                      Safety checks are running. The file will become available
                      after they pass; refresh this page later to see the
                      result.
                    </p>
                  ) : null}
                  {phase === "error" && errorMessage ? (
                    <p className="mt-1 text-xs leading-5">{errorMessage}</p>
                  ) : null}
                </div>
              ) : errorMessage ? (
                <p
                  className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900"
                  role="alert"
                >
                  {errorMessage}
                </p>
              ) : null}

              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button
                  className="min-h-11 rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  disabled={busy}
                  type="button"
                  onClick={closeUploader}
                >
                  {phase === "scanning" ? "Done" : "Cancel"}
                </button>
                {phase !== "scanning" ? (
                  <button
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-bold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={
                      !file || busy || Boolean(validateEvidenceFile(file))
                    }
                    type="submit"
                  >
                    {phase === "error" ? (
                      <RefreshCw aria-hidden="true" className="h-4 w-4" />
                    ) : (
                      <Upload aria-hidden="true" className="h-4 w-4" />
                    )}
                    {phase === "error"
                      ? "Retry Upload"
                      : busy
                        ? "Uploading…"
                        : "Upload Evidence"}
                  </button>
                ) : null}
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </>
  );
}
