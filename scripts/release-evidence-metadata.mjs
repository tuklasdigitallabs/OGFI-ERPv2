import { createHash } from "node:crypto";
import { loadLocalEnvValue } from "./local-env.mjs";

export function evidenceRunId(env = process.env, fallback) {
  if (env === process.env) {
    return (
      loadLocalEnvValue("RELEASE_EVIDENCE_RUN_ID", env) ||
      fallback ||
      "not-configured"
    );
  }
  return env.RELEASE_EVIDENCE_RUN_ID ?? fallback ?? "not-configured";
}

export function evidenceMetadataValue(name, env = process.env, fallback = "") {
  if (env === process.env) {
    return loadLocalEnvValue(name, env) || fallback;
  }
  return env[name] ?? fallback;
}

export function databaseUrlFingerprint(value) {
  if (!value) {
    return "not-configured";
  }

  let normalized;
  try {
    const parsed = new URL(value);
    normalized = `${parsed.protocol}//${parsed.hostname}:${parsed.port || "default"}${parsed.pathname}`;
  } catch {
    normalized = "unparseable";
  }

  return createHash("sha256").update(normalized).digest("hex").slice(0, 16);
}
