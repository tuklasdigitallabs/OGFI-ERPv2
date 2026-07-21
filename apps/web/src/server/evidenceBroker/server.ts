import http, { type IncomingMessage, type ServerResponse } from "node:http";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { hasValidBrokerAuthorization } from "./auth";
import { ClamdInstreamClient } from "./clamd";
import { asBrokerError, EvidenceBrokerError } from "./errors";
import { EncryptedEvidenceStore } from "./storage";
import type { EvidenceBrokerConfig, ExactBrokerObject } from "./types";

export const brokerHeaders = {
  expectedSize: "x-evidence-expected-size",
  mime: "x-evidence-mime",
  plaintextSha256: "x-evidence-plaintext-sha256",
} as const;

const objectRoute =
  /^\/v1\/objects\/quarantine\/([0-9a-f-]+)\/versions\/([0-9a-f-]+)\/(stat|content|scan)$/i;
const createRoute =
  /^\/v1\/objects\/quarantine\/([0-9a-f-]+)\/versions\/([0-9a-f-]+)$/i;

function sendJson(
  response: ServerResponse,
  status: number,
  value: unknown,
) {
  const body = Buffer.from(JSON.stringify(value));
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": body.byteLength,
    "cache-control": "no-store",
  });
  response.end(body);
}

function routeObject(match: RegExpExecArray): ExactBrokerObject {
  return {
    key: `quarantine/${match[1] ?? ""}`,
    versionId: match[2] ?? "",
  };
}

function singleHeader(request: IncomingMessage, name: string) {
  const value = request.headers[name];
  if (typeof value !== "string") {
    throw new EvidenceBrokerError(400, "EVIDENCE_BROKER_REQUIRED_HEADER_MISSING");
  }
  return value;
}

export type EvidenceBrokerDependencies = {
  store?: EncryptedEvidenceStore;
  clamd?: ClamdInstreamClient;
};

export function createEvidenceBrokerServer(
  config: EvidenceBrokerConfig,
  dependencies: EvidenceBrokerDependencies = {},
) {
  const store = dependencies.store ?? new EncryptedEvidenceStore(config);
  const clamd = dependencies.clamd ?? new ClamdInstreamClient(config);

  const server = http.createServer(async (request, response) => {
    request.setTimeout(config.requestTimeoutMs, () => {
      request.destroy(new Error("request timeout"));
    });
    try {
      const url = new URL(request.url ?? "/", "http://evidence-broker.internal");
      if (url.search) {
        throw new EvidenceBrokerError(404, "EVIDENCE_BROKER_ROUTE_NOT_FOUND");
      }
      if (request.method === "GET" && url.pathname === "/health") {
        sendJson(response, 200, { status: "ok" });
        return;
      }
      if (!hasValidBrokerAuthorization(request.headers.authorization, config.sharedSecret)) {
        response.setHeader("www-authenticate", "Bearer");
        throw new EvidenceBrokerError(401, "EVIDENCE_BROKER_UNAUTHORIZED");
      }
      if (request.method === "GET" && url.pathname === "/ready") {
        const [storage, scan] = await Promise.all([
          store.checkReadiness(),
          clamd.checkReadiness(),
        ]);
        const ready = storage.status === "ok" && scan.status === "ok";
        sendJson(response, ready ? 200 : 503, {
          status: ready ? "ok" : "degraded",
          checks: { ...storage.checks, ...scan.checks },
          issueCodes: [...storage.issueCodes, ...scan.issueCodes],
        });
        return;
      }

      const create = createRoute.exec(url.pathname);
      if (request.method === "PUT" && create) {
        const expectedSizeRaw = singleHeader(request, brokerHeaders.expectedSize);
        const expectedSize = Number(expectedSizeRaw);
        if (
          !Number.isSafeInteger(expectedSize) ||
          request.headers["content-length"] !== expectedSizeRaw
        ) {
          throw new EvidenceBrokerError(400, "EVIDENCE_BROKER_CONTENT_LENGTH_INVALID");
        }
        const result = await store.createExactVersion({
          ...routeObject(create),
          body: request,
          contentType: singleHeader(request, brokerHeaders.mime),
          expectedSize,
          expectedChecksum: singleHeader(
            request,
            brokerHeaders.plaintextSha256,
          ),
        });
        sendJson(response, result.idempotent ? 200 : 201, result);
        return;
      }

      const object = objectRoute.exec(url.pathname);
      if (object) {
        const exact = routeObject(object);
        const action = object[3];
        if ((request.method === "GET" || request.method === "HEAD") && action === "stat") {
          const result = await store.verifyExactVersion(exact);
          if (request.method === "HEAD") {
            response.writeHead(200, {
              "content-length": "0",
              "x-evidence-size": String(result.size),
              "x-evidence-mime": result.mime,
              "x-evidence-plaintext-sha256": result.checksumSha256Base64,
              "x-evidence-key-id": result.keyId,
              "cache-control": "no-store",
            });
            response.end();
          } else {
            sendJson(response, 200, result);
          }
          return;
        }
        if (request.method === "GET" && action === "content") {
          const result = await store.streamExactVersion(exact);
          response.writeHead(200, {
            "content-type": result.contentType,
            "content-length": result.contentLength,
            "x-evidence-plaintext-sha256": result.checksumSha256Base64,
            "cache-control": "no-store",
            "x-content-type-options": "nosniff",
          });
          await pipeline(Readable.from(result.body), response);
          return;
        }
        if (request.method === "POST" && action === "scan") {
          if (
            request.headers["content-length"] !== "0" ||
            request.headers["transfer-encoding"]
          ) {
            throw new EvidenceBrokerError(400, "EVIDENCE_BROKER_SCAN_BODY_NOT_ALLOWED");
          }
          const result = await store.streamExactVersion(exact);
          sendJson(response, 200, await clamd.scan(result.body));
          return;
        }
      }
      throw new EvidenceBrokerError(404, "EVIDENCE_BROKER_ROUTE_NOT_FOUND");
    } catch (error) {
      if (response.headersSent) {
        response.destroy();
        return;
      }
      const brokerError = asBrokerError(error);
      sendJson(response, brokerError.status, { error: brokerError.code });
    }
  });
  server.requestTimeout = config.requestTimeoutMs;
  server.headersTimeout = Math.min(config.requestTimeoutMs, 60_000);
  server.keepAliveTimeout = 5_000;
  return server;
}
