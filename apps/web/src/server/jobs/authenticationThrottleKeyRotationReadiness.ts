import { assertAuthenticationThrottleKeyRotationReady } from "../services/authenticationThrottle";

const checkedAt = new Date();

try {
  const currentKeyVersion = integerEnvironment(
    "AUTH_THROTTLE_ROTATE_FROM_KEY_VERSION",
    1,
    1_000_000
  );
  const result = await assertAuthenticationThrottleKeyRotationReady({
    currentKeyVersion
  });
  console.log(JSON.stringify({
    event: "authentication_throttle_key_rotation_readiness",
    status: "READY",
    checkedAt: checkedAt.toISOString(),
    currentKeyVersion,
    activeWindowCount: result.activeWindowCount
  }));
} catch (error) {
  console.error(JSON.stringify({
    event: "authentication_throttle_key_rotation_readiness",
    status: "BLOCKED",
    code: readinessErrorCode(error),
    checkedAt: checkedAt.toISOString()
  }));
  process.exitCode = 1;
}

function integerEnvironment(name: string, minimum: number, maximum: number) {
  const value = Number(process.env[name]);
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name}_INVALID`);
  }
  return value;
}

function readinessErrorCode(error: unknown) {
  if (error instanceof Error && /^[A-Z0-9_]+$/.test(error.message)) return error.message;
  return "AUTH_THROTTLE_KEY_ROTATION_CHECK_FAILED";
}
