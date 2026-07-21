import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { EvidenceStorageConfig } from "../services/evidenceStorageConfig";
import {
  LocalExplicitMalwareScanAdapter,
  LocalPrivateObjectStorageAdapter,
} from "./localPrivateAdapters";

const temporaryDirectories: string[] = [];
const key = "quarantine/550e8400-e29b-41d4-a716-446655440000";

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

async function config(
  localScanMode: "explicit-test-clean" | "quarantine-only" =
    "explicit-test-clean",
): Promise<Extract<EvidenceStorageConfig, { provider: "local-private" }>> {
  const rootDirectory = await mkdtemp(
    path.join(os.tmpdir(), "ogfi-evidence-storage-test-"),
  );
  temporaryDirectories.push(rootDirectory);
  return {
    provider: "local-private",
    production: false,
    rootDirectory,
    localScanMode,
    uploadIntentTtlSeconds: 300,
    uploadIntentAbsoluteTtlSeconds: 900,
    uploadLeaseSeconds: 180,
    maxActiveUploadIntentsPerUser: 20,
    maxActiveUploadIntentsPerCompany: 500,
    maxUploadIntentsPerUserHour: 100,
    maxUploadIntentsPerCompanyHour: 2000,
    maxUploadBytes: 1024,
    defaultCompanyQuotaBytes: 4096,
  };
}

describe("local-private controlled evidence adapters", () => {
  it("stores a checksum-verified immutable opaque-key version", async () => {
    const adapter = new LocalPrivateObjectStorageAdapter(await config());
    const body = new TextEncoder().encode("controlled evidence");
    const expectedChecksum = createHash("sha256").update(body).digest("base64");
    const stored = await adapter.writeObjectForDevelopment({
      key,
      body,
      contentType: "text/plain",
      checksumSha256Base64: expectedChecksum,
    });
    await expect(adapter.headExactVersion(stored)).resolves.toMatchObject({
      ...stored,
      size: body.byteLength,
      checksumSha256Base64: expectedChecksum,
      encryptionVerified: false,
    });
    const streamed = await adapter.streamExactVersion(stored);
    const chunks: Uint8Array[] = [];
    for await (const chunk of streamed.body) chunks.push(chunk);
    expect(Buffer.concat(chunks).toString("utf8")).toBe("controlled evidence");
    await expect(
      adapter.writeObjectForDevelopment({
        key,
        body,
        contentType: "text/plain",
        checksumSha256Base64: expectedChecksum,
      }),
    ).rejects.toThrow("EVIDENCE_STORAGE_OBJECT_KEY_ALREADY_USED");
  });

  it("rejects content whose checksum does not match", async () => {
    const adapter = new LocalPrivateObjectStorageAdapter(await config());
    await expect(
      adapter.writeObjectForDevelopment({
        key,
        body: new Uint8Array([1, 2, 3]),
        contentType: "application/octet-stream",
        checksumSha256Base64: Buffer.alloc(32).toString("base64"),
      }),
    ).rejects.toThrow("EVIDENCE_STORAGE_CHECKSUM_MISMATCH");
  });

  it("keeps quarantine-only local objects pending and makes test-clean explicit", async () => {
    const pending = new LocalExplicitMalwareScanAdapter(
      await config("quarantine-only"),
    );
    const explicit = new LocalExplicitMalwareScanAdapter(
      await config("explicit-test-clean"),
    );
    await expect(
      pending.scanExactVersion({
        key,
        versionId: "9d1bbf33-e5d2-4eb2-a8c1-952297c3f104",
      }),
    ).resolves.toMatchObject({ result: "PENDING" });
    await expect(
      explicit.scanExactVersion({
        key,
        versionId: "9d1bbf33-e5d2-4eb2-a8c1-952297c3f104",
      }),
    ).resolves.toMatchObject({ result: "NO_THREATS_FOUND" });
    await expect(pending.checkReadiness()).resolves.toMatchObject({
      status: "degraded",
    });
  });

  it("checks the private root without exposing its path", async () => {
    const storageConfig = await config();
    const adapter = new LocalPrivateObjectStorageAdapter(storageConfig);
    const readiness = await adapter.checkReadiness({ live: true });
    expect(readiness.status).toBe("ok");
    expect(JSON.stringify(readiness)).not.toContain(storageConfig.rootDirectory);
  });
});
