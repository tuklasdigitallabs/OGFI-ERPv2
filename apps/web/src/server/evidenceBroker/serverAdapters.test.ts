import { createHash } from "node:crypto";
import { chmod, mkdtemp, rm } from "node:fs/promises";
import type { Server } from "node:http";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  HostingerBrokerMalwareScanAdapter,
  HostingerBrokerObjectStorageAdapter,
  type HostingerLocalAdapterConfig,
} from "../storage/hostingerLocalAdapters";
import { createEvidenceBrokerServer } from "./server";
import type { EvidenceBrokerConfig } from "./types";

const roots: string[] = [];
const servers: Server[] = [];
const secret = "broker-shared-secret-".padEnd(40, "x");
const key = "quarantine/550e8400-e29b-41d4-a716-446655440000";
const versionId = "9d1bbf33-e5d2-4eb2-a8c1-952297c3f104";

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) => new Promise<void>((resolve) => server.close(() => resolve())),
    ),
  );
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function startBroker() {
  const storageRoot = await mkdtemp(path.join(os.tmpdir(), "ogfi-broker-http-"));
  await chmod(storageRoot, 0o700);
  roots.push(storageRoot);
  const config: EvidenceBrokerConfig = {
    storageRoot,
    sharedSecret: secret,
    activeKeyId: "active-v1",
    encryptionKeys: new Map([["active-v1", Buffer.alloc(32, 3)]]),
    maximumObjectBytes: 1024 * 1024,
    requestTimeoutMs: 2_000,
    minimumFreeBytes: 0,
    minimumFreePercent: 0,
    minimumFreeInodePercent: 0,
    clamdHost: "127.0.0.1",
    clamdPort: 1,
    clamdTimeoutMs: 1_000,
    clamdMaximumResponseBytes: 8_192,
    maximumSignatureAgeSeconds: 172_800,
  };
  const server = createEvidenceBrokerServer(config);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("missing address");
  const brokerBaseUrl = `http://127.0.0.1:${address.port}`;
  const adapterConfig: HostingerLocalAdapterConfig = {
    brokerBaseUrl,
    sharedSecret: secret,
    uploadIntentTtlSeconds: 300,
    requestTimeoutMs: 2_000,
    maximumObjectBytes: 1024 * 1024,
  };
  return { brokerBaseUrl, adapterConfig };
}

async function collect(body: AsyncIterable<Uint8Array>) {
  const chunks: Buffer[] = [];
  for await (const chunk of body) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

describe("evidence broker HTTP boundary and web adapters", () => {
  it("allows public liveness but requires a valid bearer secret for broker operations", async () => {
    const { brokerBaseUrl } = await startBroker();
    await expect(fetch(`${brokerBaseUrl}/health`).then((value) => value.status)).resolves.toBe(200);
    await expect(fetch(`${brokerBaseUrl}/ready`).then((value) => value.status)).resolves.toBe(401);
    await expect(
      fetch(`${brokerBaseUrl}/ready`, {
        headers: { authorization: `Bearer ${"wrong".repeat(10)}` },
      }).then((value) => value.status),
    ).resolves.toBe(401);
    await expect(
      fetch(`${brokerBaseUrl}/ready`, {
        headers: { authorization: `Bearer ${secret}` },
      }).then((value) => value.status),
    ).resolves.toBe(503);
  });

  it("uses application-proxy intents and writes, stats, and reads one exact version", async () => {
    const { adapterConfig } = await startBroker();
    const adapter = new HostingerBrokerObjectStorageAdapter(adapterConfig);
    await expect(
      adapter.createUploadIntent({
        key,
        contentType: "text/plain",
        checksumSha256Base64: Buffer.alloc(32).toString("base64"),
        maximumBytes: 1024,
        expiresInSeconds: 120,
      }),
    ).resolves.toMatchObject({
      method: "application-proxy",
      url: "/api/evidence/uploads/content",
      fields: {},
      key,
    });

    const body = Buffer.from("broker adapter exact content");
    const checksum = createHash("sha256").update(body).digest("base64");
    const write = () =>
      adapter.writeExactVersion({
        key,
        versionId,
        body: (async function* () {
          yield body;
        })(),
        contentType: "text/plain",
        expectedSize: body.byteLength,
        expectedChecksumSha256Base64: checksum,
      });
    await expect(write()).resolves.toMatchObject({ idempotent: false });
    await expect(write()).resolves.toMatchObject({ idempotent: true });
    await expect(adapter.headExactVersion({ key, versionId })).resolves.toMatchObject({
      size: body.byteLength,
      contentType: "text/plain",
      checksumSha256Base64: checksum,
      encryptionVerified: true,
      encryptionAlgorithm: "AES-256-GCM",
      encryptionKeyId: "active-v1",
      storedChecksum: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    const streamed = await adapter.streamExactVersion({ key, versionId });
    await expect(collect(streamed.body)).resolves.toEqual(body);
  });

  it("fails closed when the broker is unavailable", async () => {
    const unavailable = await startBroker();
    const address = servers[0]?.address();
    if (!address || typeof address === "string") throw new Error("missing address");
    await new Promise<void>((resolve) => servers.shift()?.close(() => resolve()));
    const objectStorage = new HostingerBrokerObjectStorageAdapter(unavailable.adapterConfig);
    const malwareScan = new HostingerBrokerMalwareScanAdapter(unavailable.adapterConfig);
    await expect(objectStorage.headExactVersion({ key, versionId })).rejects.toThrow(
      "EVIDENCE_HOSTINGER_BROKER_UNAVAILABLE",
    );
    await expect(malwareScan.checkReadiness()).resolves.toMatchObject({
      status: "degraded",
      issueCodes: ["EVIDENCE_HOSTINGER_BROKER_UNAVAILABLE"],
    });
  });
});
