import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
} from "node:fs";
import { basename, isAbsolute, join, relative, resolve, sep } from "node:path";
import {
  EVIDENCE_RECOVERY_SCHEMA,
  STAGED_RECEIPT_FILE,
  canonicalJson,
  componentRecord,
  inventoryEvidenceRoot,
  sha256Text,
  writeJsonExclusive,
} from "./evidence-recovery-contract.mjs";
import {
  postgresClientConnectionUrl,
  resolvePostgresTool,
} from "./postgres-client-tools.mjs";

const databaseUrl = secretEnv("DATABASE_URL", "DATABASE_URL_FILE");
const stageRoot = requiredAbsoluteDirectory("EVIDENCE_RECOVERY_STAGE_ROOT");
const evidenceRoot = requiredAbsoluteDirectory(
  "EVIDENCE_RECOVERY_EVIDENCE_ROOT",
);
const sourceHostId = requiredEnv("EVIDENCE_RECOVERY_SOURCE_HOST_ID");
const sourceFailureDomain = requiredEnv(
  "EVIDENCE_RECOVERY_SOURCE_FAILURE_DOMAIN",
);
const ageRecipient = secretEnv(
  "EVIDENCE_RECOVERY_AGE_RECIPIENT",
  "EVIDENCE_RECOVERY_AGE_RECIPIENT_FILE",
);
if (process.env.EVIDENCE_RECOVERY_WRITE_FREEZE_CONFIRMED !== "true") {
  throw new Error(
    "EVIDENCE_RECOVERY_WRITE_FREEZE_CONFIRMED=true is required after evidence intake and key rotation are frozen for the capture window.",
  );
}
assertSeparatedPaths(stageRoot, evidenceRoot);

const psql = requirePostgresTool("psql");
const pgDump = requirePostgresTool("pg_dump");
const age = requireNamedTool("age", "AGE_BIN");
const tar = requireNamedTool("tar", "TAR_BIN");
const createdAtUtc = new Date().toISOString();
const recoverySetId = `${createdAtUtc.replace(/[-:.]/g, "")}-${randomUUID()}`;
const setDirectory = join(stageRoot, `ogfi-evidence-recovery-${recoverySetId}`);
if (existsSync(setDirectory))
  throw new Error("Recovery set directory already exists.");
mkdirSync(setDirectory, { mode: 0o700 });

let snapshotKeeper;
try {
  snapshotKeeper = await openExportedSnapshot(psql, databaseUrl);
  const initialInventory = await inventoryEvidenceRoot(evidenceRoot);
  const databaseFile = join(setDirectory, "database.dump.age");
  await encryptProcessOutput({
    executable: pgDump,
    args: [
      "--format=custom",
      "--no-owner",
      "--no-privileges",
      `--snapshot=${snapshotKeeper.snapshotId}`,
    ],
    env: postgresChildEnv(databaseUrl),
    age,
    ageRecipient,
    outputFile: databaseFile,
  });

  const evidenceFile = join(setDirectory, "evidence.tar.age");
  await encryptProcessOutput({
    executable: tar,
    args: [
      "--create",
      "--file=-",
      `--directory=${evidenceRoot}`,
      "--numeric-owner",
      ".",
    ],
    age,
    ageRecipient,
    outputFile: evidenceFile,
  });

  const finalInventory = await inventoryEvidenceRoot(evidenceRoot);
  if (initialInventory.inventorySha256 !== finalInventory.inventorySha256) {
    throw new Error(
      "Evidence inventory changed during capture. The recovery set was not committed; repeat under a confirmed write freeze.",
    );
  }

  const inventoryDocument = {
    schema: EVIDENCE_RECOVERY_SCHEMA,
    recoverySetId,
    databaseSnapshot: {
      capturedAtUtc: snapshotKeeper.capturedAtUtc,
      walLsn: snapshotKeeper.walLsn,
      snapshotIdSha256: sha256Text(snapshotKeeper.snapshotId),
    },
    evidence: finalInventory,
  };
  const inventoryFile = join(setDirectory, "inventory.json.age");
  await encryptBuffer({
    value: Buffer.from(`${canonicalJson(inventoryDocument)}\n`, "utf8"),
    age,
    ageRecipient,
    outputFile: inventoryFile,
  });

  const components = await Promise.all(
    ["database.dump.age", "evidence.tar.age", "inventory.json.age"].map(
      (file) => componentRecord(setDirectory, file),
    ),
  );
  const receipt = {
    schema: EVIDENCE_RECOVERY_SCHEMA,
    recoverySetId,
    state: "STAGED",
    createdAtUtc,
    committedAtUtc: new Date().toISOString(),
    source: {
      hostId: sourceHostId,
      failureDomain: sourceFailureDomain,
    },
    databaseSnapshot: inventoryDocument.databaseSnapshot,
    components,
    evidence: {
      objectCount: finalInventory.objectCount,
      totalBytes: finalInventory.totalBytes,
      inventorySha256: finalInventory.inventorySha256,
      keyIdInventorySha256: finalInventory.keyIdInventorySha256,
    },
    encryption: {
      format: "age",
      recipientSha256: sha256Text(ageRecipient),
    },
    destination: {
      identity: "UNSELECTED",
      independentFailureDomain: false,
      readBackVerified: false,
      readBackVerifiedAtUtc: null,
    },
    writeFreezeConfirmed: true,
    keyringIncluded: false,
    keyringEscrowRequired: true,
    activation: {
      recoverable: false,
      blocker:
        "Copy to an approved independent destination, verify by read-back there, and prove an isolated paired restore before activation.",
    },
  };

  // The staged receipt is deliberately written only after all encrypted
  // components are durable and checksummed. No later writer may append to this
  // directory except the destination-side verifier's commit receipt.
  fsyncTreeFiles(setDirectory);
  writeJsonExclusive(join(setDirectory, STAGED_RECEIPT_FILE), receipt);
  fsyncTreeFiles(setDirectory);
  fsyncDirectory(setDirectory);
  console.log(`Recovery set staged: ${setDirectory}`);
  console.log("Recovery state: STAGED");
  console.log(
    "Activation remains blocked until independent read-back and an isolated paired restore are proven.",
  );
} catch (error) {
  rmSync(setDirectory, { recursive: true, force: true });
  throw error;
} finally {
  if (snapshotKeeper) await snapshotKeeper.close().catch(() => undefined);
}

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function secretEnv(valueName, fileName) {
  const direct = process.env[valueName]?.trim();
  const sourceFile = process.env[fileName]?.trim();
  if (direct && sourceFile)
    throw new Error(`Set only one of ${valueName} or ${fileName}.`);
  if (sourceFile) {
    if (!isAbsolute(sourceFile))
      throw new Error(`${fileName} must be an absolute path.`);
    const value = readFileSync(sourceFile, "utf8").trim();
    if (!value) throw new Error(`${fileName} is empty.`);
    return value;
  }
  if (direct) return direct;
  throw new Error(`${valueName} or ${fileName} is required.`);
}

function requiredAbsoluteDirectory(name) {
  const value = requiredEnv(name);
  if (!isAbsolute(value)) throw new Error(`${name} must be an absolute path.`);
  const normalized = resolve(value);
  const info = statSync(normalized);
  if (!info.isDirectory())
    throw new Error(`${name} must identify a directory.`);
  return normalized;
}

function assertSeparatedPaths(stage, evidence) {
  const stageRelative = relative(evidence, stage);
  const evidenceRelative = relative(stage, evidence);
  const nested = (value) =>
    value === "" || (!value.startsWith(`..${sep}`) && value !== "..");
  if (nested(stageRelative) || nested(evidenceRelative)) {
    throw new Error(
      "Recovery staging and evidence roots must not contain one another.",
    );
  }
}

function requirePostgresTool(name) {
  const value = resolvePostgresTool(name);
  if (!value)
    throw new Error(`${name} is required for evidence recovery capture.`);
  return value;
}

function requireNamedTool(name, envName) {
  const candidate = process.env[envName]?.trim() || name;
  const normalizedName = basename(
    candidate.replaceAll("\\", "/"),
  ).toLowerCase();
  if (normalizedName !== name && normalizedName !== `${name}.exe`) {
    throw new Error(`${envName} override must be named ${name}.`);
  }
  const probe = spawnSync(candidate, ["--version"], { stdio: "ignore" });
  if (probe.status !== 0)
    throw new Error(`${name} is required for evidence recovery capture.`);
  return candidate;
}

async function openExportedSnapshot(psqlPath, connectionUrl) {
  const child = spawn(
    psqlPath,
    [
      "--no-psqlrc",
      "--quiet",
      "--tuples-only",
      "--no-align",
      "--set=ON_ERROR_STOP=1",
    ],
    {
      stdio: ["pipe", "pipe", "pipe"],
      env: postgresChildEnv(connectionUrl),
    },
  );
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    stdout += chunk;
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });
  child.stdin.write(
    [
      "BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY;",
      "SELECT 'OGFI_SNAPSHOT|' || pg_export_snapshot();",
      "SELECT 'OGFI_LSN|' || pg_current_wal_lsn();",
      "SELECT 'OGFI_TIME|' || to_char(transaction_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"');",
      "SELECT 'OGFI_READY';",
      "",
    ].join("\n"),
  );
  await waitUntil(
    () => stdout.includes("OGFI_READY"),
    () => child.exitCode !== null,
    30_000,
  );
  if (child.exitCode !== null) {
    throw new Error(
      `PostgreSQL snapshot keeper exited before capture: ${redact(stderr)}`,
    );
  }
  const snapshotId = marker(stdout, "OGFI_SNAPSHOT");
  const walLsn = marker(stdout, "OGFI_LSN");
  const capturedAtUtc = marker(stdout, "OGFI_TIME");
  let closed = false;
  return {
    snapshotId,
    walLsn,
    capturedAtUtc,
    async close() {
      if (closed) return;
      closed = true;
      child.stdin.end("ROLLBACK;\n\\q\n");
      await waitForExit(child, "PostgreSQL snapshot keeper");
    },
  };
}

function marker(output, name) {
  const line = output
    .split(/\r?\n/)
    .find((candidate) => candidate.startsWith(`${name}|`));
  const value = line?.slice(name.length + 1).trim();
  if (!value)
    throw new Error(`PostgreSQL snapshot keeper did not return ${name}.`);
  return value;
}

async function encryptProcessOutput({
  executable,
  args,
  age,
  ageRecipient,
  outputFile,
  env = process.env,
}) {
  const temporary = `${outputFile}.partial`;
  const producer = spawn(executable, args, {
    stdio: ["ignore", "pipe", "inherit"],
    env,
  });
  const encryptor = spawn(
    age,
    ["--encrypt", "--recipient", ageRecipient, "--output", temporary],
    { stdio: ["pipe", "inherit", "inherit"] },
  );
  producer.stdout.pipe(encryptor.stdin);
  try {
    await Promise.all([
      waitForExit(producer, basename(executable)),
      waitForExit(encryptor, "age encryption"),
    ]);
    renameSync(temporary, outputFile);
  } catch (error) {
    rmSync(temporary, { force: true });
    throw error;
  }
}

async function encryptBuffer({ value, age, ageRecipient, outputFile }) {
  const temporary = `${outputFile}.partial`;
  const encryptor = spawn(
    age,
    ["--encrypt", "--recipient", ageRecipient, "--output", temporary],
    { stdio: ["pipe", "inherit", "inherit"] },
  );
  encryptor.stdin.end(value);
  try {
    await waitForExit(encryptor, "age encryption");
    renameSync(temporary, outputFile);
  } catch (error) {
    rmSync(temporary, { force: true });
    throw error;
  }
}

function waitForExit(child, label) {
  if (child.exitCode !== null) {
    return child.exitCode === 0
      ? Promise.resolve()
      : Promise.reject(
          new Error(`${label} failed (exit=${child.exitCode}, signal=none).`),
        );
  }
  return new Promise((resolveExit, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolveExit();
      else
        reject(
          new Error(
            `${label} failed (exit=${code ?? "none"}, signal=${signal ?? "none"}).`,
          ),
        );
    });
  });
}

async function waitUntil(predicate, exited, timeoutMs) {
  const started = Date.now();
  while (!predicate()) {
    if (exited()) return;
    if (Date.now() - started > timeoutMs)
      throw new Error("PostgreSQL snapshot keeper timed out.");
    await new Promise((resolveWait) => setTimeout(resolveWait, 25));
  }
}

function fsyncTreeFiles(directory) {
  for (const name of [
    "database.dump.age",
    "evidence.tar.age",
    "inventory.json.age",
    STAGED_RECEIPT_FILE,
  ]) {
    const target = join(directory, name);
    if (!existsSync(target)) continue;
    const descriptor = openSync(target, "r");
    try {
      fsyncSync(descriptor);
    } finally {
      closeSync(descriptor);
    }
  }
}

function fsyncDirectory(directory) {
  if (process.platform === "win32") return;
  const descriptor = openSync(directory, "r");
  try {
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
}

function redact(message) {
  return message
    .trim()
    .slice(0, 500)
    .replace(/postgres(?:ql)?:\/\/[^\s]+/gi, "<database-url-redacted>");
}

function postgresChildEnv(connectionUrl) {
  return {
    ...process.env,
    PGDATABASE: postgresClientConnectionUrl(connectionUrl),
  };
}
