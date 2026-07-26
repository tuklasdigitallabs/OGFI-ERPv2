export const itemOptionCatalogOutcomes = [
  "SUCCESS",
  "INVALID",
  "UNAUTHENTICATED",
  "DENIED",
  "UNAVAILABLE",
] as const;

export const itemOptionCatalogKinds = ["item", "uom", "category", "unknown"] as const;

export type ItemOptionCatalogOutcome = (typeof itemOptionCatalogOutcomes)[number];
export type ItemOptionCatalogKind = (typeof itemOptionCatalogKinds)[number];

export class ItemOptionCatalogRateLimitedError extends Error {
  constructor(readonly retryAfterSeconds: number) {
    super("OPTION_LOOKUP_RATE_LIMITED");
    this.name = "ItemOptionCatalogRateLimitedError";
  }
}

type Counters = Record<ItemOptionCatalogOutcome, number>;
type KindCounters = Record<ItemOptionCatalogKind, number>;

function emptyOutcomes(): Counters {
  return {
    SUCCESS: 0,
    INVALID: 0,
    UNAUTHENTICATED: 0,
    DENIED: 0,
    UNAVAILABLE: 0,
  };
}

function emptyKinds(): KindCounters {
  return { item: 0, uom: 0, category: 0, unknown: 0 };
}

function boundedInteger(
  raw: string | undefined,
  fallback: number | undefined,
  minimum: number,
  maximum: number,
  code: string,
) {
  const value = raw === undefined || raw.trim() === "" ? fallback : Number(raw);
  if (value === undefined || !Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(code);
  }
  return value;
}

export function getItemOptionCatalogAdmissionConfig(
  environment: NodeJS.ProcessEnv = process.env,
) {
  const production =
    environment.APP_ENV === "production" || environment.NODE_ENV === "production";
  return {
    maxInFlight: boundedInteger(
      environment.ITEM_OPTION_CATALOG_MAX_IN_FLIGHT,
      production ? undefined : 12,
      1,
      64,
      "ITEM_OPTION_CATALOG_MAX_IN_FLIGHT_INVALID",
    ),
    retryAfterSeconds: boundedInteger(
      environment.ITEM_OPTION_CATALOG_BUSY_RETRY_SECONDS,
      production ? undefined : 2,
      1,
      60,
      "ITEM_OPTION_CATALOG_BUSY_RETRY_SECONDS_INVALID",
    ),
  };
}

export function getItemOptionCatalogAdmissionStaticReadiness(
  environment: NodeJS.ProcessEnv = process.env,
) {
  try {
    getItemOptionCatalogAdmissionConfig(environment);
    return { status: "ok" as const, issues: [] as string[] };
  } catch (error) {
    const code = error instanceof Error && /^[A-Z0-9_]+$/.test(error.message)
      ? error.message
      : "ITEM_OPTION_CATALOG_ADMISSION_CONFIGURATION_INVALID";
    return { status: "degraded" as const, issues: [code] };
  }
}

export class ItemOptionCatalogAdmissionGate {
  private active = 0;
  private maximumActive = 0;
  private admitted = 0;
  private rejected = 0;
  private completed = 0;
  private totalDurationMs = 0;
  private maximumDurationMs = 0;
  private outcomes = emptyOutcomes();
  private kinds = emptyKinds();

  constructor(
    readonly capacity: number,
    readonly retryAfterSeconds: number,
  ) {
    if (!Number.isInteger(capacity) || capacity < 1 || capacity > 64) {
      throw new Error("ITEM_OPTION_CATALOG_MAX_IN_FLIGHT_INVALID");
    }
    if (!Number.isInteger(retryAfterSeconds) || retryAfterSeconds < 1 || retryAfterSeconds > 60) {
      throw new Error("ITEM_OPTION_CATALOG_BUSY_RETRY_SECONDS_INVALID");
    }
  }

  tryAcquire() {
    if (this.active >= this.capacity) {
      this.rejected += 1;
      return null;
    }
    this.active += 1;
    this.admitted += 1;
    this.maximumActive = Math.max(this.maximumActive, this.active);
    const startedAt = performance.now();
    let released = false;
    return (kind: ItemOptionCatalogKind, outcome: ItemOptionCatalogOutcome) => {
      if (released) throw new Error("ITEM_OPTION_CATALOG_ADMISSION_RELEASE_DUPLICATE");
      released = true;
      this.active -= 1;
      this.completed += 1;
      this.outcomes[outcome] += 1;
      this.kinds[kind] += 1;
      const durationMs = Math.max(0, Math.round(performance.now() - startedAt));
      this.totalDurationMs = Math.min(1_000_000_000_000, this.totalDurationMs + durationMs);
      this.maximumDurationMs = Math.max(this.maximumDurationMs, durationMs);
    };
  }

  drainMetrics() {
    const snapshot = {
      capacity: this.capacity,
      active: this.active,
      maximumActive: this.maximumActive,
      admitted: this.admitted,
      rejected: this.rejected,
      completed: this.completed,
      totalDurationMs: this.totalDurationMs,
      maximumDurationMs: this.maximumDurationMs,
      outcomes: { ...this.outcomes },
      kinds: { ...this.kinds },
    };
    this.maximumActive = this.active;
    this.admitted = 0;
    this.rejected = 0;
    this.completed = 0;
    this.totalDurationMs = 0;
    this.maximumDurationMs = 0;
    this.outcomes = emptyOutcomes();
    this.kinds = emptyKinds();
    return snapshot;
  }
}

let sharedGate: ItemOptionCatalogAdmissionGate | undefined;
let sharedSignature = "";

export function getItemOptionCatalogAdmissionGate(
  environment: NodeJS.ProcessEnv = process.env,
) {
  const config = getItemOptionCatalogAdmissionConfig(environment);
  const signature = `${config.maxInFlight}:${config.retryAfterSeconds}`;
  if (!sharedGate || sharedSignature !== signature) {
    if (sharedGate?.drainMetrics().active) {
      throw new Error("ITEM_OPTION_CATALOG_ADMISSION_CONFIG_CHANGED_WHILE_ACTIVE");
    }
    sharedGate = new ItemOptionCatalogAdmissionGate(
      config.maxInFlight,
      config.retryAfterSeconds,
    );
    sharedSignature = signature;
  }
  return sharedGate;
}

export function resetItemOptionCatalogAdmissionForTest() {
  sharedGate = undefined;
  sharedSignature = "";
}

export async function runWithItemOptionCatalogAdmission<T>(
  kind: Exclude<ItemOptionCatalogKind, "unknown">,
  work: () => Promise<T>,
  environment: NodeJS.ProcessEnv = process.env,
) {
  const gate = getItemOptionCatalogAdmissionGate(environment);
  const release = gate.tryAcquire();
  if (!release) {
    throw new ItemOptionCatalogRateLimitedError(gate.retryAfterSeconds);
  }
  let outcome: ItemOptionCatalogOutcome = "UNAVAILABLE";
  try {
    const result = await work();
    outcome = "SUCCESS";
    return result;
  } finally {
    release(kind, outcome);
  }
}
