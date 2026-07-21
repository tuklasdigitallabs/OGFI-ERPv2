import { constants, closeSync, fstatSync, openSync, readFileSync } from "node:fs";
import {
  readEvidenceStorageConfig,
  type EvidenceStorageConfig,
} from "../services/evidenceStorageConfig";
import {
  HostingerBrokerMalwareScanAdapter,
  HostingerBrokerObjectStorageAdapter,
} from "./hostingerLocalAdapters";
import {
  LocalExplicitMalwareScanAdapter,
  LocalPrivateObjectStorageAdapter,
} from "./localPrivateAdapters";

export * from "./contracts";
export * from "./objectKey";
export * from "./hostingerLocalAdapters";
export * from "./localPrivateAdapters";

function readBrokerSharedSecret(filePath: string) {
  const descriptor = openSync(
    filePath,
    constants.O_RDONLY | constants.O_NOFOLLOW,
  );
  try {
    const stats = fstatSync(descriptor);
    if (!stats.isFile() || stats.size < 32 || stats.size > 64 * 1024) {
      throw new Error("EVIDENCE_BROKER_SHARED_SECRET_FILE_INVALID");
    }
    const value = readFileSync(descriptor, "utf8").trim();
    if (Buffer.byteLength(value, "utf8") < 32) {
      throw new Error("EVIDENCE_BROKER_SHARED_SECRET_INVALID");
    }
    return value;
  } finally {
    closeSync(descriptor);
  }
}

export function createEvidenceStorageAdapters(
  config: EvidenceStorageConfig = readEvidenceStorageConfig(),
) {
  if (config.provider === "hostinger-local") {
    const hostingerConfig = {
      brokerBaseUrl: config.brokerUrl,
      sharedSecret: readBrokerSharedSecret(config.brokerSharedSecretFile),
      uploadIntentTtlSeconds: config.uploadIntentTtlSeconds,
      requestTimeoutMs: config.brokerRequestTimeoutMs,
      maximumObjectBytes: config.maxUploadBytes,
    };
    const objectStorage = new HostingerBrokerObjectStorageAdapter(hostingerConfig);
    return {
      objectStorage,
      malwareScan: new HostingerBrokerMalwareScanAdapter(hostingerConfig),
    };
  }
  return {
    objectStorage: new LocalPrivateObjectStorageAdapter(config),
    malwareScan: new LocalExplicitMalwareScanAdapter(config),
  };
}
