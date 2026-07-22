import { finalizeExpiredAuthorizationDenialBuckets } from "../services/authorizationDenials";

async function main() {
  const batchSize = integerEnvironment(
    "AUTHORIZATION_DENIAL_FINALIZER_BATCH_SIZE",
    100,
    1,
    500,
  );
  const maxSeconds = integerEnvironment(
    "AUTHORIZATION_DENIAL_FINALIZER_MAX_SECONDS",
    40,
    5,
    55,
  );
  const deadline = Date.now() + maxSeconds * 1000;
  let finalized = 0;

  while (Date.now() < deadline) {
    const count = await finalizeExpiredAuthorizationDenialBuckets({ batchSize });
    finalized += count;
    if (count < batchSize) break;
  }

  console.log(`AUTHORIZATION_DENIAL_FINALIZER_PASS | finalized=${finalized}`);
}

function integerEnvironment(name: string, fallback: number, minimum: number, maximum: number) {
  const raw = process.env[name];
  const value = raw === undefined ? fallback : Number(raw);
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name}_INVALID`);
  }
  return value;
}

main().catch(() => {
  console.error("AUTHORIZATION_DENIAL_FINALIZER_FAILED");
  process.exitCode = 1;
});
