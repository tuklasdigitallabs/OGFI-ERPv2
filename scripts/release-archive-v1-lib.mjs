import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { lstatSync, realpathSync } from "node:fs";
import { resolve, relative, isAbsolute } from "node:path";

const BLOCK = 512;
const ROOT = Buffer.from("ogfi-release-v1");
const SHA = /^[a-f0-9]{40}$/;
const GIT = "/usr/bin/git";
export const RELEASE_ARCHIVE_LIMITS = Object.freeze({ maxArchiveBytes: 512 * 1024 * 1024, maxBlobBytes: 128 * 1024 * 1024, maxEntries: 100_000, maxPathBytes: 255, maxLinkBytes: 100 });
const modeMap = new Map([
  ["040000", { type: "5", mode: 0o755 }],
  ["100644", { type: "0", mode: 0o644 }],
  ["100755", { type: "0", mode: 0o755 }],
  ["120000", { type: "2", mode: 0o777 }],
]);

const fail = (code) => { throw new Error(code); };
const compareBytes = (left, right) => Buffer.compare(left, right);
const isSafePath = (path) => path.length > 0 && path[0] !== 0x2f && !path.includes(0) && !path.toString("binary").split("/").some((part) => part.length === 0 || part === "." || part === "..");

function trustedRepository(repositoryRoot, trustRoot) {
  if (!isAbsolute(repositoryRoot ?? "") || !isAbsolute(trustRoot ?? "")) fail("RELEASE_ARCHIVE_REPOSITORY_INVALID");
  const repository = realpathSync(resolve(repositoryRoot));
  const boundary = realpathSync(resolve(trustRoot));
  const boundaryRelativePath = relative(boundary, repository);
  if (lstatSync(repository).isDirectory() && lstatSync(boundary).isDirectory() && (boundaryRelativePath === "" || (!boundaryRelativePath.startsWith("..") && !isAbsolute(boundaryRelativePath)))) return repository;
  fail("RELEASE_ARCHIVE_REPOSITORY_INVALID");
}

function git(args, cwd) {
  const result = spawnSync(GIT, ["--no-replace-objects", ...args], {
    cwd,
    env: { PATH: "/usr/bin:/bin", HOME: "/nonexistent", LC_ALL: "C", GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null", GIT_NO_REPLACE_OBJECTS: "1" },
    encoding: "buffer",
    maxBuffer: RELEASE_ARCHIVE_LIMITS.maxBlobBytes,
  });
  if (result.error || result.status !== 0) fail("RELEASE_ARCHIVE_GIT_INPUT_INVALID");
  return result.stdout;
}

function fullCommit(commitSha, cwd) {
  if (!SHA.test(commitSha ?? "")) fail("RELEASE_ARCHIVE_COMMIT_SHA_INVALID");
  const resolved = git(["rev-parse", "--verify", `${commitSha}^{commit}`], cwd).toString("ascii").trim();
  if (resolved !== commitSha) fail("RELEASE_ARCHIVE_COMMIT_SHA_INVALID");
  return resolved;
}

function treeEntries(commitSha, cwd) {
  const records = git(["ls-tree", "-rz", "-r", "-t", commitSha], cwd).subarray(0);
  const entries = [];
  for (const record of records.toString("binary").split("\0")) {
    if (!record) continue;
    const raw = Buffer.from(record, "binary");
    const tab = raw.indexOf(0x09);
    const metadata = tab < 0 ? [] : raw.subarray(0, tab).toString("ascii").split(" ");
    const path = tab < 0 ? Buffer.alloc(0) : raw.subarray(tab + 1);
    const [gitMode, kind, objectSha] = metadata;
    const mapped = modeMap.get(gitMode);
    if (!mapped || !/^[a-f0-9]{40}$/.test(objectSha ?? "") || path.length > RELEASE_ARCHIVE_LIMITS.maxPathBytes || !isSafePath(path)) fail("RELEASE_ARCHIVE_TREE_ENTRY_INVALID");
    if ((gitMode === "040000" && kind !== "tree") || (gitMode !== "040000" && kind !== "blob")) fail("RELEASE_ARCHIVE_TREE_ENTRY_INVALID");
    if (entries.length >= RELEASE_ARCHIVE_LIMITS.maxEntries) fail("RELEASE_ARCHIVE_TREE_LIMIT_EXCEEDED");
    entries.push({ path, gitMode, kind, objectSha, ...mapped });
  }
  entries.sort((left, right) => compareBytes(left.path, right.path));
  for (let index = 1; index < entries.length; index += 1) if (compareBytes(entries[index - 1].path, entries[index].path) === 0) fail("RELEASE_ARCHIVE_TREE_ENTRY_INVALID");
  return entries;
}

function octal(value, length) {
  if (!Number.isSafeInteger(value) || value < 0 || value >= 8 ** (length - 1)) fail("RELEASE_ARCHIVE_USTAR_VALUE_INVALID");
  return Buffer.from(`${value.toString(8).padStart(length - 1, "0")}\0`, "ascii");
}

function splitPath(path) {
  if (path.length <= 100) return { name: path, prefix: Buffer.alloc(0) };
  for (let index = path.length - 1; index >= 0; index -= 1) {
    if (path[index] !== 0x2f) continue;
    const prefix = path.subarray(0, index);
    const name = path.subarray(index + 1);
    if (prefix.length > 0 && prefix.length <= 155 && name.length > 0 && name.length <= 100) return { name, prefix };
  }
  fail("RELEASE_ARCHIVE_USTAR_PATH_UNREPRESENTABLE");
}

function header({ path, mode, type, size, linkname = Buffer.alloc(0) }) {
  const output = Buffer.alloc(BLOCK);
  const { name, prefix } = splitPath(path);
  if (linkname.length > 100 || linkname.includes(0)) fail("RELEASE_ARCHIVE_USTAR_LINK_INVALID");
  name.copy(output, 0);
  octal(mode, 8).copy(output, 100);
  octal(0, 8).copy(output, 108);
  octal(0, 8).copy(output, 116);
  octal(size, 12).copy(output, 124);
  octal(0, 12).copy(output, 136);
  Buffer.from("        ", "ascii").copy(output, 148);
  output[156] = type.charCodeAt(0);
  linkname.copy(output, 157);
  Buffer.from("ustar\0", "ascii").copy(output, 257);
  Buffer.from("00", "ascii").copy(output, 263);
  prefix.copy(output, 345);
  const checksum = output.reduce((sum, value) => sum + value, 0);
  Buffer.from(`${checksum.toString(8).padStart(6, "0")}\0 `, "ascii").copy(output, 148);
  return output;
}

function padded(payload) {
  if (payload.length === 0) return Buffer.alloc(0);
  const padding = (BLOCK - (payload.length % BLOCK)) % BLOCK;
  return padding === 0 ? payload : Buffer.concat([payload, Buffer.alloc(padding)]);
}

export function createReleaseArchiveV1({ commitSha, repositoryRoot = process.cwd(), trustRoot = repositoryRoot }) {
  const cwd = trustedRepository(repositoryRoot, trustRoot);
  const canonicalCommitSha = fullCommit(commitSha, cwd);
  const entries = treeEntries(canonicalCommitSha, cwd);
  const records = [header({ path: ROOT, mode: 0o755, type: "5", size: 0 })];
  let archiveBytes = BLOCK * 3;
  for (const entry of entries) {
    const path = Buffer.concat([ROOT, Buffer.from("/"), entry.path]);
    const blobSize = entry.kind === "tree" ? 0 : Number(git(["cat-file", "-s", entry.objectSha], cwd).toString("ascii").trim());
    if (!Number.isSafeInteger(blobSize) || blobSize < 0 || blobSize > RELEASE_ARCHIVE_LIMITS.maxBlobBytes) fail("RELEASE_ARCHIVE_BLOB_LIMIT_EXCEEDED");
    const blob = entry.kind === "tree" ? Buffer.alloc(0) : git(["cat-file", "blob", entry.objectSha], cwd);
    if (blob.length !== blobSize) fail("RELEASE_ARCHIVE_GIT_INPUT_INVALID");
    const payload = entry.type === "0" ? blob : Buffer.alloc(0);
    const linkname = entry.type === "2" ? blob : Buffer.alloc(0);
    if (linkname.length > RELEASE_ARCHIVE_LIMITS.maxLinkBytes) fail("RELEASE_ARCHIVE_USTAR_LINK_INVALID");
    archiveBytes += BLOCK + payload.length + ((BLOCK - (payload.length % BLOCK)) % BLOCK);
    if (archiveBytes > RELEASE_ARCHIVE_LIMITS.maxArchiveBytes) fail("RELEASE_ARCHIVE_SIZE_LIMIT_EXCEEDED");
    records.push(header({ path, mode: entry.mode, type: entry.type, size: payload.length, linkname }), padded(payload));
  }
  const archive = Buffer.concat([...records, Buffer.alloc(BLOCK * 2)]);
  return { archive, artifactSha256: createHash("sha256").update(archive).digest("hex"), commitSha: canonicalCommitSha };
}

export function verifyReleaseArchiveV1({ commitSha, archive, artifactSha256, repositoryRoot = process.cwd(), trustRoot = repositoryRoot }) {
  if (!Buffer.isBuffer(archive) || archive.length > RELEASE_ARCHIVE_LIMITS.maxArchiveBytes || !/^[a-f0-9]{64}$/.test(artifactSha256 ?? "")) fail("RELEASE_ARCHIVE_VERIFICATION_INPUT_INVALID");
  const actual = createHash("sha256").update(archive).digest("hex");
  if (actual !== artifactSha256) fail("RELEASE_ARCHIVE_DIGEST_MISMATCH");
  const expected = createReleaseArchiveV1({ commitSha, repositoryRoot, trustRoot });
  if (actual !== expected.artifactSha256 || !archive.equals(expected.archive)) fail("RELEASE_ARCHIVE_CONTRACT_MISMATCH");
  return { artifactSha256: actual, commitSha: expected.commitSha };
}
