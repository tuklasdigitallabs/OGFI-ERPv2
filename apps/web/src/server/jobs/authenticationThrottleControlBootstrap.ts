import {
  loadAuthenticationThrottleConfig,
  transitionAuthenticationThrottleControl
} from "../services/authenticationThrottle";

try {
  const expectedGeneration = bigintEnvironment(
    "AUTH_THROTTLE_CONTROL_EXPECTED_GENERATION"
  );
  const requestedStatus = statusEnvironment(
    "AUTH_THROTTLE_CONTROL_REQUESTED_STATUS"
  );
  const config = loadAuthenticationThrottleConfig();
  const result = await transitionAuthenticationThrottleControl({
    expectedGeneration,
    requestedStatus,
    config
  });
  console.log(JSON.stringify({
    event: "authentication_throttle_control_bootstrap",
    status: result.status,
    generation: result.generation.toString(),
    activeKeyVersion: result.activeKeyVersion
  }));
} catch (error) {
  console.error(JSON.stringify({
    event: "authentication_throttle_control_bootstrap",
    status: "BLOCKED",
    code: safeErrorCode(error)
  }));
  process.exitCode = 1;
}

function bigintEnvironment(name: string) {
  const raw = process.env[name];
  if (!raw || !/^(0|[1-9][0-9]{0,18})$/.test(raw)) {
    throw new Error(`${name}_INVALID`);
  }
  return BigInt(raw);
}

function statusEnvironment(name: string): "ACTIVE" | "PAUSED" {
  const value = process.env[name];
  if (value !== "ACTIVE" && value !== "PAUSED") {
    throw new Error(`${name}_INVALID`);
  }
  return value;
}

function safeErrorCode(error: unknown) {
  if (error instanceof Error && /^[A-Z0-9_]+$/.test(error.message)) {
    return error.message;
  }
  return "AUTH_THROTTLE_CONTROL_BOOTSTRAP_FAILED";
}
