import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, join } from "node:path";

export function manifestSha256(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

export function checksumSidecarPath(filePath) {
  return `${filePath}.sha256`;
}

export function manifestChecksumSidecarPath(filePath) {
  return checksumSidecarPath(filePath);
}

export function writeChecksumLine(filePath) {
  return `${manifestSha256(filePath)}  ${basename(filePath)}\n`;
}

export function writeManifestChecksumLine(filePath) {
  return writeChecksumLine(filePath);
}

export function evaluateChecksumSidecar(filePath, label = "artifact") {
  const sidecarPath = checksumSidecarPath(filePath);

  if (!existsSync(sidecarPath)) {
    return {
      pass: false,
      detail: `missing ${label} checksum sidecar: ${sidecarPath}`
    };
  }

  const expected = manifestSha256(filePath);
  const sidecar = readFileSync(sidecarPath, "utf8").trim();

  if (!sidecar.startsWith(`${expected} `)) {
    return {
      pass: false,
      detail: `${label} checksum mismatch: expected ${expected}`
    };
  }

  if (!sidecar.includes(basename(filePath))) {
    return {
      pass: false,
      detail: `${label} checksum sidecar does not name ${basename(filePath)}`
    };
  }

  return {
    pass: true,
    detail: basename(sidecarPath)
  };
}

export function evaluateManifestChecksum(manifestPath) {
  return evaluateChecksumSidecar(manifestPath, "manifest");
}

export function evaluateLatestManifestChecksum(evidenceRoot) {
  const manifestDirectory = join(evidenceRoot, "manifests");

  if (!existsSync(manifestDirectory)) {
    return {
      pass: false,
      detail: `missing manifest directory: ${manifestDirectory}`
    };
  }

  const latestManifest = readdirSync(manifestDirectory)
    .filter((file) => /^release-evidence-manifest-.*\.txt$/.test(file))
    .sort()
    .at(-1);

  if (!latestManifest) {
    return {
      pass: false,
      detail: `no release evidence manifest found in ${manifestDirectory}`
    };
  }

  return evaluateManifestChecksum(join(manifestDirectory, latestManifest));
}
