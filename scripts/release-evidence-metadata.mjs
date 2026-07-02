import { createHash } from "node:crypto";

export function evidenceRunId(env = process.env, fallback) {
  return env.RELEASE_EVIDENCE_RUN_ID ?? fallback ?? "not-configured";
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
