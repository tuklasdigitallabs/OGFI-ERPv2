import { timingSafeEqual } from "node:crypto";
import { getArgon2WorkGate } from "./argon2WorkGate";

const MAX_METRICS_BYTES = 256 * 1024;
const METRICS_TIMEOUT_MS = 2_000;
const CADDY_REJECTION_METRIC = "caddy_rate_limit_declined_requests_total";
let previousCaddyRejected: number | undefined;

function boundedCount(value: number) {
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.min(1_000_000_000_000, Math.floor(value));
}

export function constantTimeTokenMatches(actual: string | null, expected: string) {
  const actualBuffer = Buffer.from(actual ?? "", "utf8");
  const expectedBuffer = Buffer.from(expected, "utf8");
  return actualBuffer.length === expectedBuffer.length &&
    timingSafeEqual(actualBuffer, expectedBuffer);
}

export function parseCaddyAuthenticationRejections(metrics: string) {
  if (Buffer.byteLength(metrics, "utf8") > MAX_METRICS_BYTES) {
    throw new Error("AUTH_CADDY_METRICS_TOO_LARGE");
  }
  let total = 0;
  let found = false;
  for (const line of metrics.split("\n")) {
    if (line.startsWith(`# HELP ${CADDY_REJECTION_METRIC} `) ||
        line === `# TYPE ${CADDY_REJECTION_METRIC} counter`) {
      found = true;
      continue;
    }
    if (!line || line.startsWith("#")) continue;
    const match = /^([a-zA-Z_:][a-zA-Z0-9_:]*)(?:\{[^\r\n]*\})?\s+([0-9]+(?:\.[0-9]+)?)(?:\s+[0-9]+)?$/.exec(line);
    if (!match) continue;
    const metricName = match[1]!;
    if (metricName !== CADDY_REJECTION_METRIC ||
        !/(?:^|[,{}])key=""(?:[,{}]|$)/.test(line.slice(metricName.length))) continue;
    found = true;
    total = boundedCount(total + Number(match[2]));
  }
  if (!found) throw new Error("AUTH_CADDY_REJECTION_METRIC_MISSING");
  return total;
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
  const caddyRejectedDelta = previousCaddyRejected === undefined || caddyRejected < previousCaddyRejected
    ? 0
    : boundedCount(caddyRejected - previousCaddyRejected);
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
