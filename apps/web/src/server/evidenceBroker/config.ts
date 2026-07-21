import { constants } from "node:fs";
import { open } from "node:fs/promises";
import path from "node:path";
import type { EvidenceBrokerConfig } from "./types";

type Environment = Record<string, string | undefined>;

export class EvidenceBrokerConfigurationError extends Error {
  constructor(readonly issueCodes: readonly string[]) {
    super("EVIDENCE_BROKER_CONFIGURATION_INVALID");
    this.name = "EvidenceBrokerConfigurationError";
  }
}

async function readSecretFile(filePath: string) {
  const handle = await open(
    filePath,
    constants.O_RDONLY | constants.O_NOFOLLOW,
  );
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > 64 * 1024) {
      throw new Error("EVIDENCE_BROKER_SECRET_FILE_INVALID");
    }
    return (await handle.readFile("utf8")).trim();
  } finally {
    await handle.close();
  }
}

async function secretValue(
  env: Environment,
  valueName: string,
  fileName: string,
  issues: string[],
) {
  const inline = env[valueName]?.trim();
  const secretFile = env[fileName]?.trim();
  if ((inline && secretFile) || (!inline && !secretFile)) {
    issues.push(`${valueName}_SOURCE_INVALID`);
    return "";
  }
  try {
    return secretFile ? await readSecretFile(secretFile) : (inline ?? "");
  } catch {
    issues.push(`${fileName}_UNREADABLE`);
    return "";
  }
}

function integer(
  env: Environment,
  name: string,
  fallback: number,
  minimum: number,
  maximum: number,
  issues: string[],
) {
  const raw = env[name]?.trim();
  const value = raw ? Number(raw) : fallback;
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    issues.push(`${name}_INVALID`);
  }
  return value;
}

function percentage(
  env: Environment,
  name: string,
  fallback: number,
  issues: string[],
) {
  const raw = env[name]?.trim();
  const value = raw ? Number(raw) : fallback;
  if (!Number.isFinite(value) || value < 0 || value > 100) {
    issues.push(`${name}_INVALID`);
  }
  return value;
}

function decodeKey(value: unknown) {
  if (typeof value !== "string" || !/^[A-Za-z0-9+/]{43}=$/.test(value)) {
    return undefined;
  }
  const key = Buffer.from(value, "base64");
  return key.byteLength === 32 ? key : undefined;
}

export async function readEvidenceBrokerConfig(
  env: Environment = process.env,
): Promise<EvidenceBrokerConfig> {
  const issues: string[] = [];
  const storageRoot = env.EVIDENCE_BROKER_STORAGE_ROOT?.trim() ?? "";
  if (!storageRoot || !path.isAbsolute(storageRoot)) {
    issues.push("EVIDENCE_BROKER_STORAGE_ROOT_INVALID");
  }

  const authFile = env.EVIDENCE_BROKER_SHARED_SECRET_FILE?.trim();
  const keysFile = env.EVIDENCE_BROKER_KEYS_FILE?.trim();
  if (authFile && keysFile && path.resolve(authFile) === path.resolve(keysFile)) {
    issues.push("EVIDENCE_BROKER_SECRET_FILES_NOT_SEPARATE");
  }
  const sharedSecret = await secretValue(
    env,
    "EVIDENCE_BROKER_SHARED_SECRET",
    "EVIDENCE_BROKER_SHARED_SECRET_FILE",
    issues,
  );
  if (Buffer.byteLength(sharedSecret, "utf8") < 32) {
    issues.push("EVIDENCE_BROKER_SHARED_SECRET_TOO_SHORT");
  }

  const keysJson = await secretValue(
    env,
    "EVIDENCE_BROKER_KEYS_JSON",
    "EVIDENCE_BROKER_KEYS_FILE",
    issues,
  );
  let activeKeyId = "";
  const encryptionKeys = new Map<string, Buffer>();
  try {
    const parsed = JSON.parse(keysJson) as {
      activeKeyId?: unknown;
      keys?: unknown;
    };
    if (
      typeof parsed.activeKeyId !== "string" ||
      !/^[A-Za-z0-9._-]{1,64}$/.test(parsed.activeKeyId)
    ) {
      throw new Error("active key id");
    }
    activeKeyId = parsed.activeKeyId;
    if (!parsed.keys || typeof parsed.keys !== "object" || Array.isArray(parsed.keys)) {
      throw new Error("keys");
    }
    for (const [keyId, encoded] of Object.entries(parsed.keys)) {
      if (!/^[A-Za-z0-9._-]{1,64}$/.test(keyId)) throw new Error("key id");
      const key = decodeKey(encoded);
      if (!key) throw new Error("key");
      encryptionKeys.set(keyId, key);
    }
    if (!encryptionKeys.has(activeKeyId)) throw new Error("active key");
  } catch {
    issues.push("EVIDENCE_BROKER_KEYS_INVALID");
  }

  const maximumObjectBytes = integer(
    env,
    "EVIDENCE_BROKER_MAXIMUM_OBJECT_BYTES",
    26_214_400,
    1,
    1_073_741_824,
    issues,
  );
  const requestTimeoutMs = integer(
    env,
    "EVIDENCE_BROKER_REQUEST_TIMEOUT_MS",
    30_000,
    1_000,
    300_000,
    issues,
  );
  const minimumFreeBytes = integer(
    env,
    "EVIDENCE_BROKER_MINIMUM_FREE_BYTES",
    1_073_741_824,
    0,
    Number.MAX_SAFE_INTEGER,
    issues,
  );
  const minimumFreePercent = percentage(
    env,
    "EVIDENCE_BROKER_MINIMUM_FREE_PERCENT",
    5,
    issues,
  );
  const minimumFreeInodePercent = percentage(
    env,
    "EVIDENCE_BROKER_MINIMUM_FREE_INODE_PERCENT",
    5,
    issues,
  );
  const clamdPort = integer(
    env,
    "EVIDENCE_BROKER_CLAMD_PORT",
    3310,
    1,
    65_535,
    issues,
  );
  const clamdTimeoutMs = integer(
    env,
    "EVIDENCE_BROKER_CLAMD_TIMEOUT_MS",
    60_000,
    1_000,
    300_000,
    issues,
  );
  const clamdMaximumResponseBytes = integer(
    env,
    "EVIDENCE_BROKER_CLAMD_MAXIMUM_RESPONSE_BYTES",
    8_192,
    128,
    65_536,
    issues,
  );
  const maximumSignatureAgeSeconds = integer(
    env,
    "EVIDENCE_BROKER_MAXIMUM_SIGNATURE_AGE_SECONDS",
    172_800,
    60,
    31_536_000,
    issues,
  );
  const clamdHost = env.EVIDENCE_BROKER_CLAMD_HOST?.trim() || "clamd";
  if (/[/\s\0]/.test(clamdHost)) issues.push("EVIDENCE_BROKER_CLAMD_HOST_INVALID");

  if (issues.length) throw new EvidenceBrokerConfigurationError(issues);
  return {
    storageRoot,
    sharedSecret,
    activeKeyId,
    encryptionKeys,
    maximumObjectBytes,
    requestTimeoutMs,
    minimumFreeBytes,
    minimumFreePercent,
    minimumFreeInodePercent,
    clamdHost,
    clamdPort,
    clamdTimeoutMs,
    clamdMaximumResponseBytes,
    maximumSignatureAgeSeconds,
  };
}
