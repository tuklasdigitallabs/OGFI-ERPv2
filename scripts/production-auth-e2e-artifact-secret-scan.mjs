import {
  appendFileSync,
  existsSync,
  lstatSync,
  readFileSync,
  readdirSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

function required(value, name) {
  if (!value?.trim()) throw new Error(`${name}_REQUIRED`);
  return value;
}

function regularFiles(root) {
  if (!existsSync(root)) return [];
  const stat = lstatSync(root);
  if (stat.isSymbolicLink()) {
    throw new Error("PRODUCTION_AUTH_E2E_ARTIFACT_SYMLINK_FORBIDDEN");
  }
  if (stat.isFile()) return [root];
  if (!stat.isDirectory()) return [];
  return readdirSync(root).flatMap((entry) => regularFiles(path.join(root, entry)));
}

export function capturePrivateDatabaseArtifactSecrets(
  needleFile,
  browserFixtureFile,
  runtimeEnvironmentFile,
) {
  const fixture = JSON.parse(readFileSync(browserFixtureFile, "utf8"));
  const runtimeLines = readFileSync(runtimeEnvironmentFile, "utf8").split(/\r?\n/);
  const databaseUrl = runtimeLines
    .find((line) => line.startsWith("DATABASE_URL="))
    ?.slice("DATABASE_URL=".length);
  if (!databaseUrl) {
    throw new Error("PRODUCTION_AUTH_E2E_ARTIFACT_RUNTIME_URL_MISSING");
  }
  const runtimePassword = decodeURIComponent(new URL(databaseUrl).password);
  const secrets = [
    fixture?.branch?.password,
    fixture?.privileged?.password,
    fixture?.privileged?.totpSecret,
    databaseUrl,
    runtimePassword,
  ];
  if (secrets.some((secret) => typeof secret !== "string" || secret.length < 8)) {
    throw new Error("PRODUCTION_AUTH_E2E_ARTIFACT_SECRET_CAPTURE_INVALID");
  }
  appendFileSync(needleFile, `${secrets.join("\n")}\n`, { mode: 0o600 });
}

export function assertArtifactRootsSanitized(needleFile, roots) {
  const secrets = [
    ...new Set(
      readFileSync(needleFile, "utf8")
        .split(/\r?\n/)
        .filter((value) => value.length >= 8),
    ),
  ];
  if (secrets.length === 0) {
    throw new Error("PRODUCTION_AUTH_E2E_ARTIFACT_SECRET_NEEDLES_MISSING");
  }
  for (const file of roots.flatMap(regularFiles)) {
    const content = readFileSync(file);
    if (secrets.some((secret) => content.includes(Buffer.from(secret)))) {
      throw new Error(
        `PRODUCTION_AUTH_E2E_RETAINED_ARTIFACT_SECRET_LEAK:${path.basename(file)}`,
      );
    }
  }
}

function cli() {
  const [command, needleFile, ...args] = process.argv.slice(2);
  required(needleFile, "PRODUCTION_AUTH_E2E_ARTIFACT_SECRET_NEEDLE_FILE");
  if (command === "capture-private-database") {
    if (args.length !== 2) {
      throw new Error("PRODUCTION_AUTH_E2E_ARTIFACT_SECRET_CAPTURE_ARGUMENTS_INVALID");
    }
    capturePrivateDatabaseArtifactSecrets(needleFile, args[0], args[1]);
    return;
  }
  if (command === "scan") {
    if (args.length === 0) {
      throw new Error("PRODUCTION_AUTH_E2E_ARTIFACT_ROOT_REQUIRED");
    }
    assertArtifactRootsSanitized(needleFile, args);
    return;
  }
  throw new Error("PRODUCTION_AUTH_E2E_ARTIFACT_SECRET_SCAN_COMMAND_INVALID");
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
) {
  try {
    cli();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
