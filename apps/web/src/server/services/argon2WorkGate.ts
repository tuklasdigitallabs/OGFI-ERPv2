type Argon2WorkGateSnapshot = {
  capacity: number;
  active: number;
  maximumActive: number;
  rejected: number;
  completed: number;
  totalDurationMs: number;
  maximumDurationMs: number;
};

const MAXIMUM_METRIC_VALUE = 1_000_000_000_000;

function boundedMetricSum(current: number, increment: number) {
  return Math.min(MAXIMUM_METRIC_VALUE, current + Math.max(0, increment));
}

const MINIMUM_CAPACITY = 1;
const MAXIMUM_CAPACITY = 4;
const DEFAULT_CAPACITY = 2;

function parseCapacity(raw: string | undefined) {
  const capacity = raw === undefined ? DEFAULT_CAPACITY : Number(raw);
  if (
    !Number.isInteger(capacity) ||
    capacity < MINIMUM_CAPACITY ||
    capacity > MAXIMUM_CAPACITY
  ) {
    throw new Error("AUTH_ARGON2_MAX_CONCURRENCY_INVALID");
  }
  return capacity;
}

export function loadArgon2WorkGateCapacity(
  environment: NodeJS.ProcessEnv = process.env,
) {
  return parseCapacity(environment.AUTH_ARGON2_MAX_CONCURRENCY);
}

export function assertProductionArgon2WorkGateConfiguration(
  environment: NodeJS.ProcessEnv = process.env,
) {
  if (
    ["production", "staging"].includes(
      (environment.DEPLOYMENT_ENVIRONMENT ?? environment.NODE_ENV ?? "")
        .trim()
        .toLowerCase(),
    ) &&
    environment.AUTH_ARGON2_MAX_CONCURRENCY === undefined
  ) {
    throw new Error("AUTH_ARGON2_MAX_CONCURRENCY_REQUIRED");
  }
  return loadArgon2WorkGateCapacity(environment);
}

export function createArgon2WorkGate(capacity: number) {
  const boundedCapacity = parseCapacity(String(capacity));
  let active = 0;
  let maximumActive = 0;
  let rejected = 0;
  let completed = 0;
  let totalDurationMs = 0;
  let maximumDurationMs = 0;

  async function run<T>(work: () => Promise<T>): Promise<T> {
    if (active >= boundedCapacity) {
      rejected = boundedMetricSum(rejected, 1);
      throw new Error("AUTH_ARGON2_CAPACITY_EXCEEDED");
    }
    active += 1;
    maximumActive = Math.max(maximumActive, active);
    const startedAt = performance.now();
    try {
      return await work();
    } finally {
      const durationMs = Math.max(0, performance.now() - startedAt);
      totalDurationMs = boundedMetricSum(totalDurationMs, durationMs);
      maximumDurationMs = Math.min(
        MAXIMUM_METRIC_VALUE,
        Math.max(maximumDurationMs, durationMs),
      );
      completed = boundedMetricSum(completed, 1);
      active -= 1;
    }
  }

  function snapshot(): Argon2WorkGateSnapshot {
    return {
      capacity: boundedCapacity,
      active,
      maximumActive,
      rejected,
      completed,
      totalDurationMs: Math.round(totalDurationMs),
      maximumDurationMs: Math.round(maximumDurationMs),
    };
  }

  function drainMetrics(): Argon2WorkGateSnapshot {
    const value = snapshot();
    maximumActive = active;
    rejected = 0;
    completed = 0;
    totalDurationMs = 0;
    maximumDurationMs = 0;
    return value;
  }

  return { run, snapshot, drainMetrics };
}

let sharedGate: ReturnType<typeof createArgon2WorkGate> | undefined;
let sharedCapacity: number | undefined;

export function getArgon2WorkGate() {
  const capacity = loadArgon2WorkGateCapacity();
  if (!sharedGate || sharedCapacity !== capacity) {
    sharedGate = createArgon2WorkGate(capacity);
    sharedCapacity = capacity;
  }
  return sharedGate;
}

export async function runWithArgon2WorkPermit<T>(work: () => Promise<T>) {
  return getArgon2WorkGate().run(work);
}
