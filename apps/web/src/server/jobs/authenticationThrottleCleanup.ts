import { loadAuthenticationThrottleConfig } from "../services/authenticationThrottle";
import { runAuthenticationThrottleCleanup } from "./authenticationThrottleMaintenance";

const startedAt = Date.now();

try {
  const throttleConfig = loadAuthenticationThrottleConfig();
  const batchSize = integerEnvironment("AUTH_THROTTLE_CLEANUP_BATCH_SIZE", 250, 1, 1_000);
  const maxBatches = integerEnvironment("AUTH_THROTTLE_CLEANUP_MAX_BATCHES", 20, 1, 100);
  const maxSeconds = integerEnvironment("AUTH_THROTTLE_CLEANUP_MAX_SECONDS", 40, 5, 50);
  const result = await runAuthenticationThrottleCleanup({
    batchSize,
    maxBatches,
    maxRuntimeMs: maxSeconds * 1_000,
    retentionDays: throttleConfig.retentionDays
  });
  console.log(JSON.stringify({
    event: "authentication_throttle_cleanup",
    status: "OK",
    checkedAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
    batchSize,
    maxBatches,
    ...result
  }));
} catch (error) {
  console.error(JSON.stringify({
    event: "authentication_throttle_cleanup",
    status: "CRITICAL",
    code: cleanupErrorCode(error),
    checkedAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt
  }));
  process.exitCode = 1;
}

function integerEnvironment(name: string, fallback: number, minimum: number, maximum: number) {
  const raw = process.env[name];
  const value = raw === undefined ? fallback : Number(raw);
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name}_INVALID`);
  }
  return value;
}

function cleanupErrorCode(error: unknown) {
  if (error instanceof Error && /^[A-Z0-9_]+$/.test(error.message)) return error.message;
  return "AUTH_THROTTLE_CLEANUP_FAILED";
}
