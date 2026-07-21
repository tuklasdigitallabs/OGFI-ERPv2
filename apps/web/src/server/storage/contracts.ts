export const malwareScanResults = [
  "PENDING",
  "NO_THREATS_FOUND",
  "THREATS_FOUND",
  "UNSUPPORTED",
  "ACCESS_DENIED",
  "FAILED",
  "INDETERMINATE",
] as const;

export type MalwareScanResult = (typeof malwareScanResults)[number];

export type MalwareScanAssessment = {
  result: MalwareScanResult;
  engineVersion: string;
  signatureVersion: string;
  signaturePublishedAt?: Date;
};

export type StorageReadiness = {
  status: "ok" | "degraded";
  checks: Record<string, "ok" | "failed" | "not_checked">;
  issueCodes: string[];
};

export type ExactObjectVersion = {
  key: string;
  versionId: string;
};

export type UploadIntent = {
  method: "application-proxy";
  url: string;
  fields: Record<string, string>;
  expiresAt: Date;
  key: string;
};

export type StoredObjectVersion = ExactObjectVersion & {
  size: number;
  contentType?: string;
  checksumSha256Base64?: string;
  encryptionVerified: boolean;
  encryptionAlgorithm?: "AES-256-GCM";
  encryptionKeyId?: string;
  storedChecksum?: string;
};

export interface ObjectStorageAdapter {
  readonly provider: "hostinger-local" | "local-private";

  createUploadIntent(input: {
    key: string;
    contentType: string;
    checksumSha256Base64: string;
    maximumBytes: number;
    expiresInSeconds: number;
  }): Promise<UploadIntent>;

  writeExactVersion(input: ExactObjectVersion & {
    body: AsyncIterable<Uint8Array>;
    contentType: string;
    expectedSize: number;
    expectedChecksumSha256Base64: string;
  }): Promise<StoredObjectVersion>;

  headExactVersion(input: ExactObjectVersion): Promise<StoredObjectVersion>;

  streamExactVersion(input: ExactObjectVersion): Promise<{
    body: AsyncIterable<Uint8Array>;
    contentLength?: number;
    contentType?: string;
    checksumSha256Base64?: string;
  }>;

  checkReadiness(input?: { live?: boolean }): Promise<StorageReadiness>;
}

export interface MalwareScanAdapter {
  readonly provider: "clamav" | "local-explicit";

  scanExactVersion(
    input: ExactObjectVersion,
  ): Promise<MalwareScanAssessment>;

  checkReadiness(input?: { live?: boolean }): Promise<StorageReadiness>;
}

export function isCleanMalwareScanResult(result: MalwareScanAssessment) {
  return result.result === "NO_THREATS_FOUND";
}
