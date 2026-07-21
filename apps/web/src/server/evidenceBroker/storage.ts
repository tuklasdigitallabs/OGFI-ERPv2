import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { constants } from "node:fs";
import {
  lstat,
  link,
  mkdir,
  open,
  realpath,
  statfs,
  unlink,
} from "node:fs/promises";
import path from "node:path";
import { EvidenceBrokerError } from "./errors";
import type {
  BrokerObjectHeader,
  BrokerStorageReadiness,
  EvidenceBrokerConfig,
  ExactBrokerObject,
} from "./types";

const FORMAT = "ogfi-evidence-aes-256-gcm-v1" as const;
const AUTH_TAG_BYTES = 16;
const MAXIMUM_HEADER_BYTES = 16_384;
const opaqueKeyPattern =
  /^quarantine\/([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i;
const uuidVersionPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function exactBase64(value: string, bytes: number) {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value)) return undefined;
  const decoded = Buffer.from(value, "base64");
  return decoded.byteLength === bytes && decoded.toString("base64") === value
    ? decoded
    : undefined;
}

function safeEqual(left: string, right: string) {
  const a = Buffer.from(left, "utf8");
  const b = Buffer.from(right, "utf8");
  return a.byteLength === b.byteLength && timingSafeEqual(a, b);
}

export function assertExactBrokerObject(input: ExactBrokerObject) {
  if (!opaqueKeyPattern.test(input.key)) {
    throw new EvidenceBrokerError(400, "EVIDENCE_BROKER_OBJECT_KEY_INVALID");
  }
  if (!uuidVersionPattern.test(input.versionId)) {
    throw new EvidenceBrokerError(400, "EVIDENCE_BROKER_VERSION_ID_INVALID");
  }
  return input;
}

function validateWriteMetadata(input: {
  contentType: string;
  expectedSize: number;
  expectedChecksum: string;
  maximumObjectBytes: number;
}) {
  if (
    !Number.isSafeInteger(input.expectedSize) ||
    input.expectedSize < 1 ||
    input.expectedSize > input.maximumObjectBytes
  ) {
    throw new EvidenceBrokerError(400, "EVIDENCE_BROKER_SIZE_INVALID");
  }
  if (!exactBase64(input.expectedChecksum, 32)) {
    throw new EvidenceBrokerError(400, "EVIDENCE_BROKER_CHECKSUM_INVALID");
  }
  if (
    input.contentType.length < 1 ||
    input.contentType.length > 255 ||
    !/^[\x20-\x7e]+$/.test(input.contentType)
  ) {
    throw new EvidenceBrokerError(400, "EVIDENCE_BROKER_MIME_INVALID");
  }
}

async function writeAll(
  handle: Awaited<ReturnType<typeof open>>,
  value: Uint8Array,
) {
  let offset = 0;
  while (offset < value.byteLength) {
    const { bytesWritten } = await handle.write(
      value,
      offset,
      value.byteLength - offset,
    );
    if (bytesWritten < 1) throw new Error("zero-byte write");
    offset += bytesWritten;
  }
}

async function ensureDirectory(directory: string, create: boolean) {
  if (create) {
    try {
      await mkdir(directory, { mode: 0o700 });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
  }
  const info = await lstat(directory);
  if (!info.isDirectory() || info.isSymbolicLink()) {
    throw new EvidenceBrokerError(500, "EVIDENCE_BROKER_UNSAFE_STORAGE_PATH");
  }
  if (process.platform !== "win32" && (info.mode & 0o077) !== 0) {
    throw new EvidenceBrokerError(500, "EVIDENCE_BROKER_STORAGE_PERMISSIONS_INVALID");
  }
}

type OpenVerifiedObject = {
  handle: Awaited<ReturnType<typeof open>>;
  header: BrokerObjectHeader;
  headerBytes: Buffer;
  contentOffset: number;
  contentEnd: number;
  authTag: Buffer;
};

export class EncryptedEvidenceStore {
  private reservationTail: Promise<void> = Promise.resolve();
  private reservedWriteBytes = 0;
  private reservedWriteInodes = 0;

  constructor(private readonly config: EvidenceBrokerConfig) {
    if (!path.isAbsolute(config.storageRoot)) {
      throw new EvidenceBrokerError(500, "EVIDENCE_BROKER_STORAGE_ROOT_INVALID");
    }
  }

  private objectParts(input: ExactBrokerObject) {
    assertExactBrokerObject(input);
    const objectId = opaqueKeyPattern.exec(input.key)?.[1]?.toLowerCase();
    if (!objectId) throw new EvidenceBrokerError(400, "EVIDENCE_BROKER_OBJECT_KEY_INVALID");
    const objects = path.join(this.config.storageRoot, "objects");
    const shard = path.join(objects, objectId.slice(0, 2));
    const directory = path.join(shard, objectId);
    return {
      objects,
      shard,
      directory,
      target: path.join(directory, `${input.versionId.toLowerCase()}.evd`),
    };
  }

  private async ensureRoot() {
    await ensureDirectory(this.config.storageRoot, false);
    if ((await realpath(this.config.storageRoot)) !== path.resolve(this.config.storageRoot)) {
      throw new EvidenceBrokerError(500, "EVIDENCE_BROKER_STORAGE_ROOT_SYMLINKED");
    }
  }

  private async ensureObjectDirectory(input: ExactBrokerObject) {
    await this.ensureRoot();
    const parts = this.objectParts(input);
    await ensureDirectory(parts.objects, true);
    await ensureDirectory(parts.shard, true);
    await ensureDirectory(parts.directory, true);
    return parts;
  }

  private async ensureExistingObjectDirectory(input: ExactBrokerObject) {
    await this.ensureRoot();
    const parts = this.objectParts(input);
    try {
      await ensureDirectory(parts.objects, false);
      await ensureDirectory(parts.shard, false);
      await ensureDirectory(parts.directory, false);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        throw new EvidenceBrokerError(404, "EVIDENCE_BROKER_OBJECT_NOT_FOUND");
      }
      throw error;
    }
    return parts;
  }

  private async targetExists(target: string) {
    try {
      await lstat(target);
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
      throw error;
    }
  }

  private async assertWatermarks(projectedBytes = 0, projectedInodes = 1) {
    await this.ensureRoot();
    const stats = await statfs(this.config.storageRoot);
    const availableBytes = stats.bavail * stats.bsize;
    const totalBytes = stats.blocks * stats.bsize;
    const remainingBytes = availableBytes - projectedBytes;
    const remainingPercent = totalBytes > 0 ? (remainingBytes / totalBytes) * 100 : 0;
    const remainingInodes = stats.ffree - projectedInodes;
    const remainingInodePercent =
      stats.files > 0 ? (remainingInodes / stats.files) * 100 : 0;
    if (
      remainingBytes < this.config.minimumFreeBytes ||
      remainingPercent < this.config.minimumFreePercent ||
      remainingInodePercent < this.config.minimumFreeInodePercent
    ) {
      throw new EvidenceBrokerError(507, "EVIDENCE_BROKER_STORAGE_WATERMARK_REACHED");
    }
  }

  private async reserveWrite(bytes: number) {
    let releaseQueue!: () => void;
    const previous = this.reservationTail;
    this.reservationTail = new Promise<void>((resolve) => {
      releaseQueue = resolve;
    });
    await previous;
    try {
      await this.assertWatermarks(
        this.reservedWriteBytes + bytes,
        this.reservedWriteInodes + 1,
      );
      this.reservedWriteBytes += bytes;
      this.reservedWriteInodes += 1;
    } finally {
      releaseQueue();
    }
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.reservedWriteBytes = Math.max(0, this.reservedWriteBytes - bytes);
      this.reservedWriteInodes = Math.max(0, this.reservedWriteInodes - 1);
    };
  }

  async checkReadiness(): Promise<BrokerStorageReadiness> {
    try {
      await this.assertWatermarks();
      return {
        status: "ok",
        checks: { storageRoot: "ok", storageWatermark: "ok" },
        issueCodes: [],
      };
    } catch (error) {
      const code =
        error instanceof EvidenceBrokerError
          ? error.code
          : "EVIDENCE_BROKER_STORAGE_UNAVAILABLE";
      return {
        status: "degraded",
        checks: { storageRoot: "failed", storageWatermark: "failed" },
        issueCodes: [code],
      };
    }
  }

  private makeHeader(input: ExactBrokerObject & {
    contentType: string;
    expectedSize: number;
    expectedChecksum: string;
  }): { header: BrokerObjectHeader; bytes: Buffer } {
    const header: BrokerObjectHeader = {
      format: FORMAT,
      keyId: this.config.activeKeyId,
      key: input.key.toLowerCase(),
      versionId: input.versionId.toLowerCase(),
      nonce: randomBytes(12).toString("base64"),
      size: input.expectedSize,
      checksumSha256Base64: input.expectedChecksum,
      mime: input.contentType,
    };
    const bytes = Buffer.from(JSON.stringify(header), "utf8");
    if (bytes.byteLength > MAXIMUM_HEADER_BYTES) {
      throw new EvidenceBrokerError(400, "EVIDENCE_BROKER_HEADER_TOO_LARGE");
    }
    return { header, bytes };
  }

  private async consumeAndVerifyBody(
    body: AsyncIterable<Uint8Array>,
    expectedSize: number,
    expectedChecksum: string,
  ) {
    const digest = createHash("sha256");
    let size = 0;
    for await (const raw of body) {
      const chunk = Buffer.from(raw);
      size += chunk.byteLength;
      if (size > expectedSize || size > this.config.maximumObjectBytes) {
        throw new EvidenceBrokerError(400, "EVIDENCE_BROKER_SIZE_MISMATCH");
      }
      digest.update(chunk);
    }
    if (size !== expectedSize) {
      throw new EvidenceBrokerError(400, "EVIDENCE_BROKER_SIZE_MISMATCH");
    }
    if (!safeEqual(digest.digest("base64"), expectedChecksum)) {
      throw new EvidenceBrokerError(400, "EVIDENCE_BROKER_CHECKSUM_MISMATCH");
    }
  }

  async createExactVersion(input: ExactBrokerObject & {
    body: AsyncIterable<Uint8Array>;
    contentType: string;
    expectedSize: number;
    expectedChecksum: string;
  }) {
    assertExactBrokerObject(input);
    validateWriteMetadata({
      ...input,
      maximumObjectBytes: this.config.maximumObjectBytes,
    });
    const parts = await this.ensureObjectDirectory(input);
    if (await this.targetExists(parts.target)) {
      await this.consumeAndVerifyBody(
        input.body,
        input.expectedSize,
        input.expectedChecksum,
      );
      await this.verifyExactVersion(input, {
        size: input.expectedSize,
        checksum: input.expectedChecksum,
        mime: input.contentType,
      });
      return { key: input.key, versionId: input.versionId, idempotent: true };
    }

    const projectedBytes = input.expectedSize + MAXIMUM_HEADER_BYTES + 32;
    const releaseReservation = await this.reserveWrite(projectedBytes);
    const temporary = path.join(parts.directory, `.tmp-${randomUUID()}`);
    let handle: Awaited<ReturnType<typeof open>> | undefined;
    let published = false;
    try {
      handle = await open(
        temporary,
        constants.O_WRONLY |
          constants.O_CREAT |
          constants.O_EXCL |
          constants.O_NOFOLLOW,
        0o600,
      );
      const { header, bytes: headerBytes } = this.makeHeader(input);
      const prefix = Buffer.alloc(4);
      prefix.writeUInt32BE(headerBytes.byteLength);
      await writeAll(handle, prefix);
      await writeAll(handle, headerBytes);

      const key = this.config.encryptionKeys.get(header.keyId);
      if (!key) throw new EvidenceBrokerError(500, "EVIDENCE_BROKER_KEY_UNAVAILABLE");
      const nonce = exactBase64(header.nonce, 12);
      if (!nonce) throw new EvidenceBrokerError(500, "EVIDENCE_BROKER_NONCE_INVALID");
      const cipher = createCipheriv("aes-256-gcm", key, nonce);
      cipher.setAAD(headerBytes, { plaintextLength: header.size });
      const digest = createHash("sha256");
      let size = 0;
      for await (const raw of input.body) {
        const chunk = Buffer.from(raw);
        size += chunk.byteLength;
        if (size > input.expectedSize || size > this.config.maximumObjectBytes) {
          throw new EvidenceBrokerError(400, "EVIDENCE_BROKER_SIZE_MISMATCH");
        }
        digest.update(chunk);
        const encrypted = cipher.update(chunk);
        if (encrypted.byteLength) await writeAll(handle, encrypted);
      }
      if (size !== input.expectedSize) {
        throw new EvidenceBrokerError(400, "EVIDENCE_BROKER_SIZE_MISMATCH");
      }
      if (!safeEqual(digest.digest("base64"), input.expectedChecksum)) {
        throw new EvidenceBrokerError(400, "EVIDENCE_BROKER_CHECKSUM_MISMATCH");
      }
      const final = cipher.final();
      if (final.byteLength) await writeAll(handle, final);
      await writeAll(handle, cipher.getAuthTag());
      await handle.sync();
      await handle.close();

      try {
        // link(2) is an atomic same-filesystem no-overwrite publication. The
        // temporary name is removed only after the immutable target exists.
        await link(temporary, parts.target);
        published = true;
        await unlink(temporary);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        await unlink(temporary).catch(() => undefined);
        await this.verifyExactVersion(input, {
          size: input.expectedSize,
          checksum: input.expectedChecksum,
          mime: input.contentType,
        });
        return { key: input.key, versionId: input.versionId, idempotent: true };
      }
      const directory = await open(
        parts.directory,
        constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
      );
      try {
        // Windows does not permit fsync on directory handles. The production
        // broker is Linux-only and always performs this durability barrier.
        if (process.platform !== "win32") await directory.sync();
      } finally {
        await directory.close();
      }
      return { key: input.key, versionId: input.versionId, idempotent: false };
    } finally {
      await handle?.close().catch(() => undefined);
      if (!published) await unlink(temporary).catch(() => undefined);
      releaseReservation();
    }
  }

  private async openAndReadHeader(input: ExactBrokerObject): Promise<OpenVerifiedObject> {
    const parts = await this.ensureExistingObjectDirectory(input);
    const handle = await open(
      parts.target,
      constants.O_RDONLY | constants.O_NOFOLLOW,
    ).catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") {
        throw new EvidenceBrokerError(404, "EVIDENCE_BROKER_OBJECT_NOT_FOUND");
      }
      if (error.code === "ELOOP") {
        throw new EvidenceBrokerError(409, "EVIDENCE_BROKER_OBJECT_INTEGRITY_INVALID");
      }
      throw error;
    });
    try {
      const stats = await handle.stat();
      if (
        !stats.isFile() ||
        stats.isSymbolicLink() ||
        stats.nlink !== 1 ||
        (process.platform !== "win32" && (stats.mode & 0o077) !== 0) ||
        stats.size < 4 + AUTH_TAG_BYTES
      ) {
        throw new EvidenceBrokerError(409, "EVIDENCE_BROKER_OBJECT_INTEGRITY_INVALID");
      }
      const prefix = Buffer.alloc(4);
      const prefixRead = await handle.read(prefix, 0, 4, 0);
      if (prefixRead.bytesRead !== 4) throw new Error("short prefix");
      const headerLength = prefix.readUInt32BE();
      if (headerLength < 2 || headerLength > MAXIMUM_HEADER_BYTES) {
        throw new EvidenceBrokerError(409, "EVIDENCE_BROKER_OBJECT_HEADER_INVALID");
      }
      const headerBytes = Buffer.alloc(headerLength);
      const headerRead = await handle.read(headerBytes, 0, headerLength, 4);
      if (headerRead.bytesRead !== headerLength) throw new Error("short header");
      const header = JSON.parse(headerBytes.toString("utf8")) as BrokerObjectHeader;
      if (
        header.format !== FORMAT ||
        header.key !== input.key.toLowerCase() ||
        header.versionId !== input.versionId.toLowerCase() ||
        !/^[A-Za-z0-9._-]{1,64}$/.test(header.keyId) ||
        !exactBase64(header.nonce, 12) ||
        !Number.isSafeInteger(header.size) ||
        header.size < 1 ||
        header.size > this.config.maximumObjectBytes ||
        !exactBase64(header.checksumSha256Base64, 32) ||
        typeof header.mime !== "string" ||
        !/^[\x20-\x7e]{1,255}$/.test(header.mime)
      ) {
        throw new EvidenceBrokerError(409, "EVIDENCE_BROKER_OBJECT_HEADER_INVALID");
      }
      const contentOffset = 4 + headerLength;
      const contentEnd = stats.size - AUTH_TAG_BYTES - 1;
      if (contentEnd - contentOffset + 1 !== header.size) {
        throw new EvidenceBrokerError(409, "EVIDENCE_BROKER_OBJECT_SIZE_INVALID");
      }
      const authTag = Buffer.alloc(AUTH_TAG_BYTES);
      const tagRead = await handle.read(
        authTag,
        0,
        AUTH_TAG_BYTES,
        stats.size - AUTH_TAG_BYTES,
      );
      if (tagRead.bytesRead !== AUTH_TAG_BYTES) throw new Error("short tag");
      return { handle, header, headerBytes, contentOffset, contentEnd, authTag };
    } catch (error) {
      await handle.close();
      if (error instanceof EvidenceBrokerError) throw error;
      throw new EvidenceBrokerError(409, "EVIDENCE_BROKER_OBJECT_HEADER_INVALID");
    }
  }

  private decryptedBody(opened: OpenVerifiedObject) {
    const key = this.config.encryptionKeys.get(opened.header.keyId);
    if (!key) throw new EvidenceBrokerError(409, "EVIDENCE_BROKER_OBJECT_KEY_ID_UNKNOWN");
    const nonce = exactBase64(opened.header.nonce, 12);
    if (!nonce) throw new EvidenceBrokerError(409, "EVIDENCE_BROKER_OBJECT_HEADER_INVALID");
    const decipher = createDecipheriv("aes-256-gcm", key, nonce);
    decipher.setAAD(opened.headerBytes, { plaintextLength: opened.header.size });
    decipher.setAuthTag(opened.authTag);
    const source = opened.handle.createReadStream({
      start: opened.contentOffset,
      end: opened.contentEnd,
      autoClose: false,
    });
    return (async function* () {
      try {
        for await (const raw of source) {
          const plain = decipher.update(Buffer.from(raw));
          if (plain.byteLength) yield plain;
        }
        const final = decipher.final();
        if (final.byteLength) yield final;
      } catch {
        throw new EvidenceBrokerError(409, "EVIDENCE_BROKER_OBJECT_AUTHENTICATION_FAILED");
      }
    })();
  }

  private async authenticateOpened(opened: OpenVerifiedObject) {
    const digest = createHash("sha256");
    let size = 0;
    for await (const chunk of this.decryptedBody(opened)) {
      size += chunk.byteLength;
      digest.update(chunk);
    }
    if (
      size !== opened.header.size ||
      !safeEqual(digest.digest("base64"), opened.header.checksumSha256Base64)
    ) {
      throw new EvidenceBrokerError(409, "EVIDENCE_BROKER_OBJECT_INTEGRITY_INVALID");
    }
  }

  private async checksumStoredObject(opened: OpenVerifiedObject) {
    const digest = createHash("sha256");
    const source = opened.handle.createReadStream({
      start: 0,
      autoClose: false,
    });
    for await (const chunk of source) digest.update(Buffer.from(chunk));
    return digest.digest("hex");
  }

  async verifyExactVersion(
    input: ExactBrokerObject,
    expected?: { size: number; checksum: string; mime: string },
  ) {
    assertExactBrokerObject(input);
    const opened = await this.openAndReadHeader(input);
    try {
      await this.authenticateOpened(opened);
      if (
        expected &&
        (opened.header.size !== expected.size ||
          !safeEqual(opened.header.checksumSha256Base64, expected.checksum) ||
          opened.header.mime !== expected.mime)
      ) {
        throw new EvidenceBrokerError(409, "EVIDENCE_BROKER_VERSION_CONFLICT");
      }
      const storedChecksum = await this.checksumStoredObject(opened);
      return {
        ...input,
        ...opened.header,
        storedChecksum,
        encryptionVerified: true,
      };
    } finally {
      await opened.handle.close();
    }
  }

  async streamExactVersion(input: ExactBrokerObject) {
    assertExactBrokerObject(input);
    const opened = await this.openAndReadHeader(input);
    try {
      // Never release unauthenticated plaintext. Verify the complete exact file
      // before exposing a second-pass stream from the same open file descriptor.
      await this.authenticateOpened(opened);
    } catch (error) {
      await opened.handle.close();
      throw error;
    }
    const body = this.decryptedBody(opened);
    const handle = opened.handle;
    return {
      body: (async function* () {
        try {
          yield* body;
        } finally {
          await handle.close();
        }
      })(),
      contentLength: opened.header.size,
      contentType: opened.header.mime,
      checksumSha256Base64: opened.header.checksumSha256Base64,
    };
  }
}
