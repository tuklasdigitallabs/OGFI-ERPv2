import { timingSafeEqual } from "node:crypto";
import { getArgon2WorkGate } from "./argon2WorkGate";
import {
  boundedMetricDelta,
  parseCaddyRateLimitDeclines,
} from "./caddyRateLimitMetrics";

const MAX_METRICS_BYTES = 256 * 1024;
const METRICS_TIMEOUT_MS = 2_000;
let previousCaddyRejected: number | undefined;
const authenticationRateLimitZones = [
  "sign_in_global",
  "sign_in_source",
  "activate_global",
  "activate_source",
  "mfa_challenge_global",
  "mfa_challenge_source",
] as const;

export function constantTimeTokenMatches(actual: string | null, expected: string) {
  const actualBuffer = Buffer.from(actual ?? "", "utf8");
  const expectedBuffer = Buffer.from(expected, "utf8");
  return actualBuffer.length === expectedBuffer.length &&
    timingSafeEqual(actualBuffer, expectedBuffer);
}

export function parseCaddyAuthenticationRejections(metrics: string) {
  try {
    const totals = parseCaddyRateLimitDeclines(
      metrics,
      authenticationRateLimitZones,
      MAX_METRICS_BYTES,
    );
    return authenticationRateLimitZones.reduce(
      (sum, zone) => Math.min(1_000_000_000_000, sum + totals[zone]!),
      0,
    );
  } catch (error) {
    if (error instanceof Error && error.message === "CADDY_RATE_LIMIT_METRICS_TOO_LARGE") {
      throw new Error("AUTH_CADDY_METRICS_TOO_LARGE");
    }
    throw new Error("AUTH_CADDY_REJECTION_METRIC_MISSING");
  }
}

export async function readAuthenticationRuntimeMetrics(
  environment: NodeJS.ProcessEnv = process.env,
  fetcher: typeof fetch = fetch,
) {
  const metricsUrl = environment.CADDY_METRICS_URL;
  if (!metricsUrl) throw new Error("AUTH_CADDY_METRICS_URL_REQUIRED");
  const parsed = new URL(metricsUrl);
  if (parsed.protocol !== "http:" || parsed.hostname !== "caddy" || parsed.port !== "2020" || parsed.pathname !== "/metrics") {
    throw new Error("AUTH_CADDY_METRICS_URL_INVALID");
  }
  const response = await fetcher(parsed, {
    cache: "no-store",
    signal: AbortSignal.timeout(METRICS_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error("AUTH_CADDY_METRICS_UNAVAILABLE");
  const declaredLength = Number(response.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_METRICS_BYTES) throw new Error("AUTH_CADDY_METRICS_TOO_LARGE");
  const body = await response.text();
  const caddyRejected = parseCaddyAuthenticationRejections(body);
  const caddyRejectedDelta = boundedMetricDelta(caddyRejected, previousCaddyRejected);
  previousCaddyRejected = caddyRejected;
  return {
    argon2: getArgon2WorkGate().drainMetrics(),
    caddyRejectedDelta,
  };
}

export const authenticationRuntimeMetricBounds = {
  maximumBodyBytes: MAX_METRICS_BYTES,
  timeoutMs: METRICS_TIMEOUT_MS,
} as const;
