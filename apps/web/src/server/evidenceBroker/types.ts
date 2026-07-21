export type BrokerStorageReadiness = {
  status: "ok" | "degraded";
  checks: Record<string, "ok" | "failed">;
  issueCodes: string[];
};

export type BrokerObjectHeader = {
  format: "ogfi-evidence-aes-256-gcm-v1";
  keyId: string;
  key: string;
  versionId: string;
  nonce: string;
  size: number;
  checksumSha256Base64: string;
  mime: string;
};

export type ExactBrokerObject = {
  key: string;
  versionId: string;
};

export type BrokerScanResult = {
  result: "NO_THREATS_FOUND" | "THREATS_FOUND";
  engineVersion: string;
  signatureVersion: string;
  signaturePublishedAt?: string;
};

export type EvidenceBrokerConfig = {
  storageRoot: string;
  sharedSecret: string;
  activeKeyId: string;
  encryptionKeys: ReadonlyMap<string, Buffer>;
  maximumObjectBytes: number;
  requestTimeoutMs: number;
  minimumFreeBytes: number;
  minimumFreePercent: number;
  minimumFreeInodePercent: number;
  clamdHost: string;
  clamdPort: number;
  clamdTimeoutMs: number;
  clamdMaximumResponseBytes: number;
  maximumSignatureAgeSeconds: number;
};

