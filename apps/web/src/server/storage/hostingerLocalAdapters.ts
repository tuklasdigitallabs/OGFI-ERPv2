import type {
  BrokerScanResult,
  BrokerStorageReadiness,
  ExactBrokerObject,
} from "../evidenceBroker/types";
import type {
  MalwareScanAssessment,
  StoredObjectVersion,
} from "./contracts";
import {
  assertExactBrokerObject,
  brokerHeaders,
} from "../evidenceBroker";

export type HostingerLocalAdapterConfig = {
  brokerBaseUrl: string;
  sharedSecret: string;
  uploadIntentTtlSeconds: number;
  requestTimeoutMs: number;
  maximumObjectBytes: number;
  maximumJsonResponseBytes?: number;
};

type BrokerFailure = { error?: unknown };

function validateConfig(config: HostingerLocalAdapterConfig) {
  const url = new URL(config.brokerBaseUrl);
  if (!/^https?:$/.test(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error("EVIDENCE_HOSTINGER_BROKER_URL_INVALID");
  }
  if (Buffer.byteLength(config.sharedSecret, "utf8") < 32) {
    throw new Error("EVIDENCE_HOSTINGER_BROKER_SECRET_INVALID");
  }
  if (
    !Number.isInteger(config.requestTimeoutMs) ||
    config.requestTimeoutMs < 1 ||
    !Number.isSafeInteger(config.maximumObjectBytes) ||
    config.maximumObjectBytes < 1
  ) {
    throw new Error("EVIDENCE_HOSTINGER_BROKER_CONFIG_INVALID");
  }
}

function exactUrl(config: HostingerLocalAdapterConfig, input: ExactBrokerObject) {
  assertExactBrokerObject(input);
  return `${config.brokerBaseUrl.replace(/\/$/, "")}/v1/objects/${input.key}/versions/${input.versionId}`;
}

async function boundedJson(
  response: Response,
  maximumBytes: number,
): Promise<unknown> {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maximumBytes) {
    throw new Error("EVIDENCE_HOSTINGER_BROKER_RESPONSE_TOO_LARGE");
  }
  if (!response.body) throw new Error("EVIDENCE_HOSTINGER_BROKER_RESPONSE_INVALID");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maximumBytes) {
        throw new Error("EVIDENCE_HOSTINGER_BROKER_RESPONSE_TOO_LARGE");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new Error("EVIDENCE_HOSTINGER_BROKER_RESPONSE_INVALID");
  }
}

class HostingerBrokerClient {
  readonly maximumJsonBytes: number;

  constructor(readonly config: HostingerLocalAdapterConfig) {
    validateConfig(config);
    this.maximumJsonBytes = config.maximumJsonResponseBytes ?? 64 * 1024;
  }

  private authorizationHeaders() {
    return { authorization: `Bearer ${this.config.sharedSecret}` };
  }

  async requestJson(url: string, init: RequestInit = {}) {
    let response: Response;
    try {
      response = await fetch(url, {
        ...init,
        headers: { ...this.authorizationHeaders(), ...init.headers },
        signal: AbortSignal.timeout(this.config.requestTimeoutMs),
      });
    } catch {
      throw new Error("EVIDENCE_HOSTINGER_BROKER_UNAVAILABLE");
    }
    const parsed = (await boundedJson(response, this.maximumJsonBytes)) as BrokerFailure;
    if (!response.ok) {
      const code =
        typeof parsed?.error === "string"
          ? parsed.error
          : "EVIDENCE_HOSTINGER_BROKER_REQUEST_FAILED";
      throw new Error(code);
    }
    return parsed;
  }

  async readiness(): Promise<BrokerStorageReadiness> {
    try {
      return (await this.requestJson(
        `${this.config.brokerBaseUrl.replace(/\/$/, "")}/ready`,
      )) as BrokerStorageReadiness;
    } catch {
      return {
        status: "degraded",
        checks: { hostingerEvidenceBroker: "failed" },
        issueCodes: ["EVIDENCE_HOSTINGER_BROKER_UNAVAILABLE"],
      };
    }
  }

  headers() {
    return this.authorizationHeaders();
  }
}

export class HostingerBrokerObjectStorageAdapter {
  readonly provider = "hostinger-local" as const;
  private readonly client: HostingerBrokerClient;

  constructor(private readonly config: HostingerLocalAdapterConfig) {
    this.client = new HostingerBrokerClient(config);
  }

  async createUploadIntent(input: {
    key: string;
    contentType: string;
    checksumSha256Base64: string;
    maximumBytes: number;
    expiresInSeconds: number;
  }) {
    assertExactBrokerObject({
      key: input.key,
      versionId: "00000000-0000-4000-8000-000000000000",
    });
    if (
      input.maximumBytes < 1 ||
      input.maximumBytes > this.config.maximumObjectBytes ||
      input.expiresInSeconds < 1 ||
      input.expiresInSeconds > this.config.uploadIntentTtlSeconds ||
      !/^[\x20-\x7e]{1,255}$/.test(input.contentType) ||
      !/^[A-Za-z0-9+/]{43}=$/.test(input.checksumSha256Base64)
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

  async writeExactVersion(input: ExactBrokerObject & {
    body: AsyncIterable<Uint8Array>;
    contentType: string;
    expectedSize: number;
    expectedChecksumSha256Base64: string;
  }): Promise<StoredObjectVersion & { idempotent: boolean }> {
    assertExactBrokerObject(input);
    if (
      !Number.isSafeInteger(input.expectedSize) ||
      input.expectedSize < 1 ||
      input.expectedSize > this.config.maximumObjectBytes
    ) {
      throw new Error("EVIDENCE_STORAGE_UPLOAD_SIZE_INVALID");
    }
    const written = (await this.client.requestJson(exactUrl(this.config, input), {
      method: "PUT",
      headers: {
        [brokerHeaders.expectedSize]: String(input.expectedSize),
        [brokerHeaders.mime]: input.contentType,
        [brokerHeaders.plaintextSha256]: input.expectedChecksumSha256Base64,
        "content-length": String(input.expectedSize),
      },
      body: input.body as unknown as BodyInit,
      // Required by Node's fetch for streaming request bodies; intentionally
      // local to this internal adapter because it is not part of DOM RequestInit.
      ...({ duplex: "half" } as Record<string, unknown>),
    })) as { idempotent?: unknown };
    if (typeof written.idempotent !== "boolean") {
      throw new Error("EVIDENCE_HOSTINGER_BROKER_RESPONSE_INVALID");
    }
    return {
      ...(await this.headExactVersion(input)),
      idempotent: written.idempotent,
    };
  }

  async headExactVersion(input: ExactBrokerObject) {
    const result = (await this.client.requestJson(
      `${exactUrl(this.config, input)}/stat`,
    )) as Record<string, unknown>;
    if (
      result.key !== input.key ||
      result.versionId !== input.versionId ||
      !Number.isSafeInteger(result.size) ||
      typeof result.mime !== "string" ||
      typeof result.checksumSha256Base64 !== "string" ||
      result.encryptionVerified !== true ||
      result.format !== "ogfi-evidence-aes-256-gcm-v1" ||
      typeof result.keyId !== "string" ||
      !/^[A-Za-z0-9._-]{1,64}$/.test(result.keyId) ||
      typeof result.storedChecksum !== "string" ||
      !/^[a-f0-9]{64}$/.test(result.storedChecksum)
    ) {
      throw new Error("EVIDENCE_HOSTINGER_BROKER_RESPONSE_INVALID");
    }
    return {
      key: input.key,
      versionId: input.versionId,
      size: result.size as number,
      contentType: result.mime,
      checksumSha256Base64: result.checksumSha256Base64,
      encryptionVerified: true,
      encryptionAlgorithm: "AES-256-GCM" as const,
      encryptionKeyId: result.keyId,
      storedChecksum: result.storedChecksum,
    };
  }

  async streamExactVersion(input: ExactBrokerObject) {
    let response: Response;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.requestTimeoutMs);
    try {
      response = await fetch(`${exactUrl(this.config, input)}/content`, {
        headers: this.client.headers(),
        signal: controller.signal,
      });
    } catch {
      clearTimeout(timeout);
      throw new Error("EVIDENCE_HOSTINGER_BROKER_UNAVAILABLE");
    }
    if (!response.ok || !response.body) {
      clearTimeout(timeout);
      const failure = await boundedJson(response, this.client.maximumJsonBytes).catch(
        () => ({ error: "EVIDENCE_HOSTINGER_BROKER_REQUEST_FAILED" }),
      );
      throw new Error(
        typeof (failure as BrokerFailure).error === "string"
          ? String((failure as BrokerFailure).error)
          : "EVIDENCE_HOSTINGER_BROKER_REQUEST_FAILED",
      );
    }
    const contentLength = Number(response.headers.get("content-length"));
    const contentType = response.headers.get("content-type") ?? undefined;
    const checksumSha256Base64 = response.headers.get(
      brokerHeaders.plaintextSha256,
    ) ?? undefined;
    if (
      !Number.isSafeInteger(contentLength) ||
      contentLength < 1 ||
      contentLength > this.config.maximumObjectBytes ||
      !contentType ||
      !checksumSha256Base64
    ) {
      clearTimeout(timeout);
      controller.abort();
      throw new Error("EVIDENCE_HOSTINGER_BROKER_RESPONSE_INVALID");
    }
    const reader = response.body.getReader();
    return {
      body: (async function* () {
        let received = 0;
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            received += value.byteLength;
            if (received > contentLength) {
              throw new Error("EVIDENCE_HOSTINGER_BROKER_RESPONSE_INVALID");
            }
            yield value;
          }
          if (received !== contentLength) {
            throw new Error("EVIDENCE_HOSTINGER_BROKER_RESPONSE_INVALID");
          }
        } finally {
          clearTimeout(timeout);
          reader.releaseLock();
        }
      })(),
      contentLength,
      contentType,
      checksumSha256Base64,
    };
  }

  async checkReadiness(_input: { live?: boolean } = {}) {
    return this.client.readiness();
  }
}

export class HostingerBrokerMalwareScanAdapter {
  readonly provider = "clamav" as const;
  private readonly client: HostingerBrokerClient;

  constructor(private readonly config: HostingerLocalAdapterConfig) {
    this.client = new HostingerBrokerClient(config);
  }

  async scanExactVersion(
    input: ExactBrokerObject,
  ): Promise<MalwareScanAssessment> {
    const result = (await this.client.requestJson(
      `${exactUrl(this.config, input)}/scan`,
      { method: "POST", headers: { "content-length": "0" } },
    )) as Partial<BrokerScanResult>;
    if (
      (result.result !== "NO_THREATS_FOUND" && result.result !== "THREATS_FOUND") ||
      typeof result.engineVersion !== "string" ||
      typeof result.signatureVersion !== "string" ||
      (result.signaturePublishedAt !== undefined &&
        typeof result.signaturePublishedAt !== "string")
    ) {
      throw new Error("EVIDENCE_HOSTINGER_BROKER_RESPONSE_INVALID");
    }
    const assessment = result as BrokerScanResult;
    return assessment.signaturePublishedAt
      ? {
          result: assessment.result,
          engineVersion: assessment.engineVersion,
          signatureVersion: assessment.signatureVersion,
          signaturePublishedAt: new Date(assessment.signaturePublishedAt),
        }
      : {
          result: assessment.result,
          engineVersion: assessment.engineVersion,
          signatureVersion: assessment.signatureVersion,
        };
  }

  async checkReadiness(_input: { live?: boolean } = {}) {
    return this.client.readiness();
  }
}
