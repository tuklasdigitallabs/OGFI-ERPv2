import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { constants } from "node:fs";
import {
  access,
  mkdir,
  open,
  readFile,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import type { EvidenceStorageConfig } from "../services/evidenceStorageConfig";
import type {
  ExactObjectVersion,
  MalwareScanAdapter,
  ObjectStorageAdapter,
  StorageReadiness,
} from "./contracts";
import {
  assertExactObjectVersion,
  assertOpaqueEvidenceObjectKey,
} from "./objectKey";

type LocalConfig = Extract<
  EvidenceStorageConfig,
  { provider: "local-private" }
>;

type LocalMetadata = {
  key: string;
  versionId: string;
  size: number;
  contentType: string;
  checksumSha256Base64: string;
  createdAt: string;
  retainUntil?: string;
  legalHold?: boolean;
  tags: Record<string, string>;
};

function objectId(key: string) {
  assertOpaqueEvidenceObjectKey(key);
  return key.slice("quarantine/".length);
}

function checksum(body: Uint8Array) {
  return createHash("sha256").update(body).digest("base64");
}

function checksumsEqual(left: string, right: string) {
  const a = Buffer.from(left, "base64");
  const b = Buffer.from(right, "base64");
  return a.length === b.length && timingSafeEqual(a, b);
}

export class LocalPrivateObjectStorageAdapter implements ObjectStorageAdapter {
  readonly provider = "local-private" as const;

  constructor(private readonly config: LocalConfig) {}

  private paths(input: ExactObjectVersion) {
    assertExactObjectVersion(input);
    const directory = path.join(this.config.rootDirectory, "objects", objectId(input.key));
    return {
      directory,
      body: path.join(directory, `${input.versionId}.bin`),
      metadata: path.join(directory, `${input.versionId}.json`),
    };
  }

  async createUploadIntent(input: {
    key: string;
    contentType: string;
    checksumSha256Base64: string;
    maximumBytes: number;
    expiresInSeconds: number;
  }) {
    assertOpaqueEvidenceObjectKey(input.key);
    if (
      !/^[A-Za-z0-9+/]{43}=$/.test(input.checksumSha256Base64) ||
      input.maximumBytes < 1 ||
      input.maximumBytes > this.config.maxUploadBytes ||
      input.expiresInSeconds < 1 ||
      input.expiresInSeconds > this.config.uploadIntentTtlSeconds
    ) {
      throw new Error("EVIDENCE_STORAGE_UPLOAD_INTENT_INVALID");
    }
    return {
      method: "application-proxy" as const,
      url: "/api/evidence/uploads/content",
      fields: {},
      expiresAt: new Date(Date.now() + input.expiresInSeconds * 1000),
      key: input.key,
    };
  }

  async writeObjectForDevelopment(input: {
    key: string;
    versionId?: string;
    body: Uint8Array;
    contentType: string;
    checksumSha256Base64: string;
  }) {
    assertOpaqueEvidenceObjectKey(input.key);
    if (input.body.byteLength > this.config.maxUploadBytes) {
      throw new Error("EVIDENCE_STORAGE_UPLOAD_SIZE_EXCEEDED");
    }
    const actualChecksum = checksum(input.body);
    if (!checksumsEqual(actualChecksum, input.checksumSha256Base64)) {
      throw new Error("EVIDENCE_STORAGE_CHECKSUM_MISMATCH");
    }
    const versionId = input.versionId ?? randomUUID();
    const target = this.paths({ key: input.key, versionId });
    await mkdir(path.dirname(target.directory), { recursive: true, mode: 0o700 });
    try {
      await mkdir(target.directory, { mode: 0o700 });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") {
        throw new Error("EVIDENCE_STORAGE_OBJECT_KEY_ALREADY_USED");
      }
      throw error;
    }
    const handle = await open(target.body, "wx", 0o600);
    try {
      await handle.writeFile(input.body);
    } finally {
      await handle.close();
    }
    const metadata: LocalMetadata = {
      key: input.key,
      versionId,
      size: input.body.byteLength,
      contentType: input.contentType,
      checksumSha256Base64: actualChecksum,
      createdAt: new Date().toISOString(),
      tags: {},
    };
    await writeFile(target.metadata, JSON.stringify(metadata), {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600,
    });
    return { key: input.key, versionId };
  }

  async writeExactVersion(input: ExactObjectVersion & {
    body: AsyncIterable<Uint8Array>;
    contentType: string;
    expectedSize: number;
    expectedChecksumSha256Base64: string;
  }) {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of input.body) {
      const bytes = Buffer.from(chunk);
      size += bytes.byteLength;
      if (size > input.expectedSize || size > this.config.maxUploadBytes) {
        throw new Error("EVIDENCE_STORAGE_UPLOAD_SIZE_EXCEEDED");
      }
      chunks.push(bytes);
    }
    if (size !== input.expectedSize) {
      throw new Error("EVIDENCE_STORAGE_UPLOAD_SIZE_MISMATCH");
    }
    await this.writeObjectForDevelopment({
      key: input.key,
      versionId: input.versionId,
      body: Buffer.concat(chunks),
      contentType: input.contentType,
      checksumSha256Base64: input.expectedChecksumSha256Base64,
    });
    return this.headExactVersion(input);
  }

  private async readMetadata(input: ExactObjectVersion) {
    const target = this.paths(input);
    const parsed = JSON.parse(await readFile(target.metadata, "utf8")) as LocalMetadata;
    if (parsed.key !== input.key || parsed.versionId !== input.versionId) {
      throw new Error("EVIDENCE_STORAGE_LOCAL_METADATA_INVALID");
    }
    return { metadata: parsed, target };
  }

  async headExactVersion(input: ExactObjectVersion) {
    const { metadata } = await this.readMetadata(input);
    return {
      ...input,
      size: metadata.size,
      contentType: metadata.contentType,
      checksumSha256Base64: metadata.checksumSha256Base64,
      encryptionVerified: false,
    };
  }

  async streamExactVersion(input: ExactObjectVersion) {
    const { metadata, target } = await this.readMetadata(input);
    const handle = await open(target.body, "r");
    return {
      body: handle.createReadStream(),
      contentLength: metadata.size,
      contentType: metadata.contentType,
      checksumSha256Base64: metadata.checksumSha256Base64,
    };
  }

  async checkReadiness(input: { live?: boolean } = {}) {
    const checks: StorageReadiness["checks"] = {
      configuration: "ok",
      localPrivateRoot: input.live ? "failed" : "not_checked",
    };
    if (!input.live) return { status: "ok" as const, checks, issueCodes: [] };
    try {
      await mkdir(this.config.rootDirectory, { recursive: true, mode: 0o700 });
      await access(this.config.rootDirectory, constants.R_OK | constants.W_OK);
      checks.localPrivateRoot = "ok";
      return { status: "ok" as const, checks, issueCodes: [] };
    } catch {
      return {
        status: "degraded" as const,
        checks,
        issueCodes: ["EVIDENCE_STORAGE_LOCAL_ROOT_UNAVAILABLE"],
      };
    }
  }
}

export class LocalExplicitMalwareScanAdapter implements MalwareScanAdapter {
  readonly provider = "local-explicit" as const;

  constructor(private readonly config: LocalConfig) {}

  async scanExactVersion(input: ExactObjectVersion) {
    assertExactObjectVersion(input);
    return {
      result:
        this.config.localScanMode === "explicit-test-clean"
          ? ("NO_THREATS_FOUND" as const)
          : ("PENDING" as const),
      engineVersion: "local-development-waiver",
      signatureVersion: "not-applicable",
    };
  }

  async checkReadiness(_input: { live?: boolean } = {}) {
    const explicitlyEnabled = this.config.localScanMode === "explicit-test-clean";
    return {
      status: explicitlyEnabled ? ("ok" as const) : ("degraded" as const),
      checks: {
        localDevelopmentScanWaiver: explicitlyEnabled ? ("ok" as const) : ("failed" as const),
      },
      issueCodes: explicitlyEnabled
        ? []
        : ["EVIDENCE_SCAN_LOCAL_WAIVER_NOT_ENABLED"],
    };
  }
}
