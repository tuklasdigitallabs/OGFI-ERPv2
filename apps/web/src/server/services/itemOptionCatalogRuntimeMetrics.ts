import {
  boundedMetricDelta,
  parseCaddyRateLimitDeclines,
} from "./caddyRateLimitMetrics";
import { getItemOptionCatalogAdmissionGate } from "./itemOptionCatalogAdmission";

const MAX_METRICS_BYTES = 256 * 1024;
const METRICS_TIMEOUT_MS = 2_000;
const optionZones = ["item_option_global", "item_option_source"] as const;
let previousGlobalRejected: number | undefined;
let previousSourceRejected: number | undefined;

async function readBoundedText(response: Response, maximumBytes: number) {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maximumBytes) {
        await reader.cancel();
        throw new Error("ITEM_OPTION_CADDY_METRICS_TOO_LARGE");
      }
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } finally {
    reader.releaseLock();
  }
}

export function parseCaddyItemOptionCatalogRejections(metrics: string) {
  const totals = parseCaddyRateLimitDeclines(metrics, optionZones, MAX_METRICS_BYTES);
  return {
    global: totals.item_option_global!,
    source: totals.item_option_source!,
  };
}

export async function readItemOptionCatalogRuntimeMetrics(
  environment: NodeJS.ProcessEnv = process.env,
  fetcher: typeof fetch = fetch,
) {
  const metricsUrl = environment.CADDY_METRICS_URL;
  if (!metricsUrl) throw new Error("ITEM_OPTION_CADDY_METRICS_URL_REQUIRED");
  const parsed = new URL(metricsUrl);
  if (
    parsed.protocol !== "http:" ||
    parsed.hostname !== "caddy" ||
    parsed.port !== "2020" ||
    parsed.pathname !== "/metrics" ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash
  ) {
    throw new Error("ITEM_OPTION_CADDY_METRICS_URL_INVALID");
  }
  const response = await fetcher(parsed, {
    cache: "no-store",
    signal: AbortSignal.timeout(METRICS_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error("ITEM_OPTION_CADDY_METRICS_UNAVAILABLE");
  const declaredLength = Number(response.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_METRICS_BYTES) {
    throw new Error("ITEM_OPTION_CADDY_METRICS_TOO_LARGE");
  }
  const body = await readBoundedText(response, MAX_METRICS_BYTES);
  const rejected = parseCaddyItemOptionCatalogRejections(body);
  const edge = {
    globalRejectedDelta: boundedMetricDelta(rejected.global, previousGlobalRejected),
    sourceRejectedDelta: boundedMetricDelta(rejected.source, previousSourceRejected),
  };
  previousGlobalRejected = rejected.global;
  previousSourceRejected = rejected.source;
  return {
    edge,
    application: getItemOptionCatalogAdmissionGate(environment).drainMetrics(),
  };
}

export const itemOptionCatalogRuntimeMetricBounds = {
  maximumBodyBytes: MAX_METRICS_BYTES,
  timeoutMs: METRICS_TIMEOUT_MS,
} as const;
