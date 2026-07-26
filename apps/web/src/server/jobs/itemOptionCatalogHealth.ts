import { pathToFileURL } from "node:url";
import type { ItemOptionCatalogHealthFacts } from "./itemOptionCatalogHealthPolicy";
import { itemOptionCatalogHealthCodes } from "./itemOptionCatalogHealthPolicy";

function integerEnvironment(
  name: string,
  fallback: number | undefined,
  minimum: number,
  maximum: number,
) {
  const raw = process.env[name];
  const value = raw === undefined || raw.trim() === "" ? fallback : Number(raw);
  if (value === undefined || !Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name}_INVALID`);
  }
  return value;
}

function isSafeCounter(value: unknown) {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

function hasExactKeys(value: unknown, expected: readonly string[]) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const keys = Object.keys(value).sort();
  return keys.length === expected.length &&
    keys.every((key, index) => key === [...expected].sort()[index]);
}

export function isItemOptionCatalogProduction(
  environment: NodeJS.ProcessEnv = process.env,
) {
  return environment.APP_ENV === "production" || environment.NODE_ENV === "production";
}

export function validateItemOptionCatalogHealthFacts(value: unknown) {
  const facts = value as ItemOptionCatalogHealthFacts;
  if (
    !hasExactKeys(facts, ["edge", "application"]) ||
    !hasExactKeys(facts.edge, ["globalRejectedDelta", "sourceRejectedDelta"]) ||
    !hasExactKeys(facts.application, [
      "capacity", "active", "maximumActive", "admitted", "rejected",
      "completed", "totalDurationMs", "maximumDurationMs", "outcomes", "kinds",
    ]) ||
    !hasExactKeys(facts.application.outcomes, [
      "SUCCESS", "INVALID", "UNAUTHENTICATED", "DENIED", "UNAVAILABLE",
    ]) ||
    !hasExactKeys(facts.application.kinds, ["item", "uom", "category", "unknown"])
  ) {
    throw new Error("ITEM_OPTION_RUNTIME_METRICS_INVALID");
  }
  const values = [
    facts.edge.globalRejectedDelta,
    facts.edge.sourceRejectedDelta,
    facts.application.capacity,
    facts.application.active,
    facts.application.maximumActive,
    facts.application.admitted,
    facts.application.rejected,
    facts.application.completed,
    facts.application.totalDurationMs,
    facts.application.maximumDurationMs,
    ...Object.values(facts.application.outcomes),
    ...Object.values(facts.application.kinds),
  ];
  if (
    values.length !== 19 ||
    values.some((counter) => !isSafeCounter(counter)) ||
    facts.application.capacity < 1 ||
    facts.application.capacity > 64 ||
    facts.application.active > facts.application.capacity ||
    facts.application.maximumActive > facts.application.capacity ||
    facts.application.completed > facts.application.admitted
  ) {
    throw new Error("ITEM_OPTION_RUNTIME_METRICS_INVALID");
  }
  return facts;
}

async function readRuntimeMetrics() {
  const rawUrl = process.env.ITEM_OPTION_CATALOG_RUNTIME_METRICS_URL;
  const token = process.env.AUTH_HEALTH_METRICS_TOKEN;
  if (!rawUrl || !token || Buffer.byteLength(token, "utf8") < 32) {
    throw new Error("ITEM_OPTION_RUNTIME_METRICS_CONFIG_INVALID");
  }
  const url = new URL(rawUrl);
  if (
    url.protocol !== "http:" ||
    !["127.0.0.1", "localhost", "::1"].includes(url.hostname) ||
    url.port !== "2021" ||
    url.pathname !== "/api/internal/item-option-catalog-metrics" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error("ITEM_OPTION_RUNTIME_METRICS_URL_INVALID");
  }
  const response = await fetch(url, {
    headers: { authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(3_000),
    cache: "no-store",
  });
  const declaredLength = Number(response.headers.get("content-length") ?? 0);
  if (!response.ok || declaredLength > 16_384) {
    throw new Error("ITEM_OPTION_RUNTIME_METRICS_UNAVAILABLE");
  }
  const body = await response.text();
  if (Buffer.byteLength(body, "utf8") > 16_384) {
    throw new Error("ITEM_OPTION_RUNTIME_METRICS_INVALID");
  }
  return validateItemOptionCatalogHealthFacts(JSON.parse(body));
}

export async function runItemOptionCatalogHealth() {
  const checkedAt = new Date().toISOString();
  try {
    const facts = await readRuntimeMetrics();
    const production = isItemOptionCatalogProduction();
    const codes = itemOptionCatalogHealthCodes(facts, {
      globalRejectedDelta: integerEnvironment(
        "ITEM_OPTION_CATALOG_HEALTH_GLOBAL_REJECTED_THRESHOLD",
        production ? undefined : 1,
        1,
        1_000_000_000,
      ),
      sourceRejectedDelta: integerEnvironment(
        "ITEM_OPTION_CATALOG_HEALTH_SOURCE_REJECTED_THRESHOLD",
        production ? undefined : 20,
        1,
        1_000_000_000,
      ),
      applicationRejected: integerEnvironment(
        "ITEM_OPTION_CATALOG_HEALTH_BUSY_THRESHOLD",
        production ? undefined : 1,
        1,
        1_000_000_000,
      ),
      unavailable: integerEnvironment(
        "ITEM_OPTION_CATALOG_HEALTH_UNAVAILABLE_THRESHOLD",
        production ? undefined : 1,
        1,
        1_000_000_000,
      ),
      maximumDurationMs: integerEnvironment(
        "ITEM_OPTION_CATALOG_HEALTH_DURATION_MS",
        production ? undefined : 2_000,
        1,
        3_600_000,
      ),
    });
    const payload = {
      event: "item_option_catalog_health",
      status: codes.length ? "CRITICAL" : "OK",
      checkedAt,
      codes,
      aggregates: facts,
    };
    if (codes.length) {
      console.error(JSON.stringify(payload));
      process.exitCode = 1;
    } else {
      console.log(JSON.stringify(payload));
    }
  } catch (error) {
    const code =
      error instanceof Error && /^[A-Z0-9_]+$/.test(error.message)
        ? error.message
        : "ITEM_OPTION_CATALOG_HEALTH_FAILED";
    console.error(
      JSON.stringify({
        event: "item_option_catalog_health",
        status: "CRITICAL",
        checkedAt,
        code,
      }),
    );
    process.exitCode = 1;
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  void runItemOptionCatalogHealth();
}
