import { createHash } from "node:crypto";
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  statfs,
  symlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { EvidenceBrokerError } from "./errors";
import { assertExactBrokerObject, EncryptedEvidenceStore } from "./storage";
import type { EvidenceBrokerConfig } from "./types";

const roots: string[] = [];
const key = "quarantine/550e8400-e29b-41d4-a716-446655440000";
const versionId = "9d1bbf33-e5d2-4eb2-a8c1-952297c3f104";

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function fixture(overrides: Partial<EvidenceBrokerConfig> = {}) {
  const storageRoot = overrides.storageRoot
    ?? await mkdtemp(path.join(os.tmpdir(), "ogfi-broker-store-"));
  await chmod(storageRoot, 0o700);
  if (!roots.includes(storageRoot)) roots.push(storageRoot);
  const config: EvidenceBrokerConfig = {
    storageRoot,
    sharedSecret: "s".repeat(40),
    activeKeyId: "key-2026-07",
    encryptionKeys: new Map([["key-2026-07", Buffer.alloc(32, 7)]]),
    maximumObjectBytes: 1024 * 1024,
    requestTimeoutMs: 10_000,
    minimumFreeBytes: 0,
    minimumFreePercent: 0,
    minimumFreeInodePercent: 0,
    clamdHost: "127.0.0.1",
    clamdPort: 3310,
    clamdTimeoutMs: 1_000,
    clamdMaximumResponseBytes: 8_192,
    maximumSignatureAgeSeconds: 172_800,
    ...overrides,
  };
  return { storageRoot, config, store: new EncryptedEvidenceStore(config) };
}

function upload(body: Buffer) {
  return {
    key,
    versionId,
    body: (async function* () {
      yield body.subarray(0, Math.max(1, Math.floor(body.length / 2)));
      yield body.subarray(Math.max(1, Math.floor(body.length / 2)));
    })(),
    contentType: "text/plain",
    expectedSize: body.byteLength,
    expectedChecksum: createHash("sha256").update(body).digest("base64"),
  };
}

async function collect(body: AsyncIterable<Uint8Array>) {
  const chunks: Buffer[] = [];
  for await (const chunk of body) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

function objectFile(storageRoot: string) {
  return path.join(
    storageRoot,
    "objects",
    "55",
    "550e8400-e29b-41d4-a716-446655440000",
    `${versionId}.evd`,
  );
}

describe("encrypted evidence store", () => {
  it("encrypts plaintext, verifies the exact version, and decrypts only after authentication", async () => {
    const { store, storageRoot } = await fixture();
    const body = Buffer.from("private controlled evidence: marker-7926");
    await expect(store.createExactVersion(upload(body))).resolves.toMatchObject({
      key,
      versionId,
      idempotent: false,
    });
    const storedBytes = await readFile(objectFile(storageRoot));
    expect(storedBytes.includes(body)).toBe(false);
    await expect(store.verifyExactVersion({ key, versionId })).resolves.toMatchObject({
      size: body.byteLength,
      encryptionVerified: true,
    });
    const streamed = await store.streamExactVersion({ key, versionId });
    await expect(collect(streamed.body)).resolves.toEqual(body);
  });

  it("rejects traversal, malformed opaque keys, and non-UUID versions", async () => {
    for (const input of [
      { key: "../quarantine/550e8400-e29b-41d4-a716-446655440000", versionId },
      { key: `${key}/extra`, versionId },
      { key, versionId: "../../outside" },
    ]) {
      expect(() => assertExactBrokerObject(input)).toThrow(EvidenceBrokerError);
    }
  });

  it("fails closed on a symlinked object directory", async () => {
    const { store, storageRoot } = await fixture();
    const shard = path.join(storageRoot, "objects", "55");
    const alternate = path.join(storageRoot, "alternate");
    await mkdir(shard, { recursive: true, mode: 0o700 });
    await chmod(path.join(storageRoot, "objects"), 0o700);
    await chmod(shard, 0o700);
    await mkdir(alternate, { mode: 0o700 });
    await symlink(
      alternate,
      path.join(shard, "550e8400-e29b-41d4-a716-446655440000"),
      "junction",
    );
    await expect(store.createExactVersion(upload(Buffer.from("blocked")))).rejects.toThrow(
      "EVIDENCE_BROKER_UNSAFE_STORAGE_PATH",
    );
  });

  it("rejects size and checksum mismatches without publishing a version", async () => {
    const { store, storageRoot } = await fixture();
    const body = Buffer.from("evidence");
    await expect(
      store.createExactVersion({ ...upload(body), expectedSize: body.length + 1 }),
    ).rejects.toThrow("EVIDENCE_BROKER_SIZE_MISMATCH");
    await expect(
      store.createExactVersion({
        ...upload(body),
        expectedChecksum: Buffer.alloc(32).toString("base64"),
      }),
    ).rejects.toThrow("EVIDENCE_BROKER_CHECKSUM_MISMATCH");
    await expect(readFile(objectFile(storageRoot))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("accepts only an exact idempotent retry and never overwrites a version", async () => {
    const { store } = await fixture();
    const original = Buffer.from("original immutable evidence");
    await store.createExactVersion(upload(original));
    await expect(store.createExactVersion(upload(original))).resolves.toMatchObject({
      idempotent: true,
    });
    await expect(store.createExactVersion(upload(Buffer.from("different immutable evidence"))))
      .rejects.toThrow("EVIDENCE_BROKER_VERSION_CONFLICT");
    const streamed = await store.streamExactVersion({ key, versionId });
    await expect(collect(streamed.body)).resolves.toEqual(original);
  });

  it("detects ciphertext tampering before releasing plaintext", async () => {
    const { store, storageRoot } = await fixture();
    const body = Buffer.from("tamper protected evidence");
    await store.createExactVersion(upload(body));
    const file = objectFile(storageRoot);
    const bytes = await readFile(file);
    bytes[bytes.length - 17] = (bytes[bytes.length - 17] ?? 0) ^ 0xff;
    await writeFile(file, bytes, { mode: 0o600 });
    await expect(store.verifyExactVersion({ key, versionId })).rejects.toThrow(
      "EVIDENCE_BROKER_OBJECT_AUTHENTICATION_FAILED",
    );
    await expect(store.streamExactVersion({ key, versionId })).rejects.toThrow(
      "EVIDENCE_BROKER_OBJECT_AUTHENTICATION_FAILED",
    );
  });

  it("reserves projected capacity across concurrent writes", async () => {
    const storageRoot = await mkdtemp(path.join(os.tmpdir(), "ogfi-broker-store-"));
    await chmod(storageRoot, 0o700);
    roots.push(storageRoot);
    const body = Buffer.alloc(4 * 1024 * 1024, 9);
    const projectedBytes = body.byteLength + 16_384 + 32;
    const { config, store } = await fixture({
      storageRoot,
      maximumObjectBytes: 8 * 1024 * 1024,
      minimumFreeBytes: 0,
    });
    let allowFirstBody!: () => void;
    const firstBodyGate = new Promise<void>((resolve) => {
      allowFirstBody = resolve;
    });
    let signalFirstReserved!: () => void;
    const firstReservationReached = new Promise<void>((resolve) => {
      signalFirstReserved = resolve;
    });
    const first = store.createExactVersion({
      ...upload(body),
      body: (async function* () {
        signalFirstReserved();
        await firstBodyGate;
        yield body;
      })(),
    });
    await Promise.race([
      firstReservationReached,
      first.then(() => {
        throw new Error("FIRST_EVIDENCE_WRITE_COMPLETED_BEFORE_BODY_GATE");
      }),
    ]);
    const filesystem = await statfs(storageRoot);
    const availableBytes = filesystem.bavail * filesystem.bsize;
    config.minimumFreeBytes = Math.max(
      0,
      availableBytes - Math.floor(projectedBytes * 1.5),
    );
    const second = store.createExactVersion({
      ...upload(body),
      key: "quarantine/650e8400-e29b-41d4-a716-446655440000",
      versionId: "8d1bbf33-e5d2-4eb2-a8c1-952297c3f104",
    });
    let firstResult: Awaited<typeof first> | undefined;
    try {
      await expect(second).rejects.toThrow(
        "EVIDENCE_BROKER_STORAGE_WATERMARK_REACHED",
      );
    } finally {
      allowFirstBody();
      firstResult = await first;
    }
    expect(firstResult).toMatchObject({ idempotent: false });
  });
});
