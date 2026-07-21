import {
  acceptedExtensions,
  acceptedMimeTypes,
  maximumFileSizeBytes,
  type UploadIntentResponse,
} from "./types";

export function bytesLabel(value: number) {
  if (value >= 1024 * 1024) {
    return `${(value / (1024 * 1024)).toLocaleString("en-PH", {
      maximumFractionDigits: 1,
    })} MB`;
  }
  return `${(value / 1024).toLocaleString("en-PH", {
    maximumFractionDigits: 1,
  })} KB`;
}

function extensionOf(filename: string) {
  const parts = filename.toLowerCase().split(".");
  return parts.length > 1 ? (parts.at(-1) ?? "") : "";
}

function extensionMatchesMimeType(filename: string, mimeType: string) {
  const extension = extensionOf(filename);
  return (
    (mimeType === "application/pdf" && extension === "pdf") ||
    (mimeType === "image/jpeg" && ["jpg", "jpeg"].includes(extension)) ||
    (mimeType === "image/png" && extension === "png") ||
    (mimeType === "image/webp" && extension === "webp") ||
    (mimeType === "text/plain" && extension === "txt")
  );
}

export function validateEvidenceFile(file: File) {
  if (file.size < 1) return "Choose a file that is not empty.";
  if (file.size > maximumFileSizeBytes) {
    return "This file is larger than the 25 MB upload limit.";
  }
  if (
    !acceptedMimeTypes.has(file.type) ||
    !acceptedExtensions.has(extensionOf(file.name)) ||
    !extensionMatchesMimeType(file.name, file.type)
  ) {
    return "Choose a PDF, JPG, PNG, WebP, or text file.";
  }
  return null;
}

export function checksumBase64(bytes: ArrayBuffer) {
  const view = new Uint8Array(bytes);
  let binary = "";
  for (let index = 0; index < view.length; index += 1) {
    binary += String.fromCharCode(view[index]!);
  }
  return window.btoa(binary);
}

export async function responseJson<T>(response: Response): Promise<T> {
  const value = (await response.json().catch(() => ({}))) as T & {
    error?: string;
  };
  if (!response.ok) {
    throw new Error(value.error || "EVIDENCE_UPLOAD_REQUEST_FAILED");
  }
  return value;
}

export function uploadEvidenceObject(
  intent: UploadIntentResponse,
  file: File,
  onProgress: (progress: number) => void,
) {
  return new Promise<void>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("POST", intent.upload.url);
    request.withCredentials = true;
    request.setRequestHeader("Content-Type", file.type);
    request.setRequestHeader("X-Evidence-Intent-Id", intent.intentId);
    request.setRequestHeader("X-Evidence-Intent-Token", intent.intentToken);
    request.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable) {
        onProgress(Math.max(1, Math.round((event.loaded / event.total) * 100)));
      }
    });
    request.addEventListener("error", () =>
      reject(new Error("EVIDENCE_UPLOAD_NETWORK_FAILED")),
    );
    request.addEventListener("abort", () =>
      reject(new Error("EVIDENCE_UPLOAD_CANCELLED")),
    );
    request.addEventListener("load", () => {
      if (request.status < 200 || request.status >= 300) {
        reject(
          new Error(uploadFailureCode(request.status, request.responseText)),
        );
        return;
      }
      resolve();
    });

    request.send(file);
  });
}

export function uploadFailureCode(status: number, responseText: string) {
  try {
    const parsed = JSON.parse(responseText) as { error?: unknown };
    if (
      typeof parsed.error === "string" &&
      /^EVIDENCE_[A-Z0-9_]+$/.test(parsed.error)
    ) {
      return parsed.error;
    }
  } catch {
    // The browser boundary intentionally collapses non-JSON failures.
  }
  return status === 413
    ? "EVIDENCE_UPLOAD_SIZE_EXCEEDED"
    : "EVIDENCE_UPLOAD_STORAGE_REJECTED";
}

export function friendlyUploadError(error: unknown) {
  const code = error instanceof Error ? error.message : "";
  if (code.includes("EXPIRED") || code.includes("IDEMPOTENCY_TERMINAL")) {
    return "The upload window expired. Choose Retry to request a new upload.";
  }
  if (code.includes("QUOTA")) {
    return "Evidence storage is currently at its limit. Contact an administrator before retrying.";
  }
  if (
    code.includes("MIME") ||
    code.includes("SIZE") ||
    code.includes("INVALID")
  ) {
    return "The file did not meet the evidence upload requirements. Check its type and size, then retry.";
  }
  if (code.includes("ORIGIN_DENIED") || code.includes("PERMISSION")) {
    return "You no longer have permission to upload evidence for this record. Refresh the page or contact an administrator.";
  }
  if (code.includes("VERIFICATION_REFERENCE_MISSING")) {
    return "The file reached storage, but its verification reference was not returned. Retry the upload; the system will safely reuse this attempt.";
  }
  if (code.includes("NETWORK") || code.includes("STORAGE_REJECTED")) {
    return "The upload was interrupted. Check your connection and retry; your selected file is still here.";
  }
  return "The evidence could not be uploaded. Retry, or contact support if the problem continues.";
}
