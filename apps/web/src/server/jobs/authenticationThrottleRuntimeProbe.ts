import { prisma } from "@ogfi/database";
import { reserveAuthenticationAttemptInTransaction } from "../services/authenticationThrottle";

const rollbackSignal = "AUTH_THROTTLE_RUNTIME_PROBE_ROLLBACK";

try {
  await prisma.$transaction(async (tx) => {
    const result = await reserveAuthenticationAttemptInTransaction(
      {
        attemptType: "PASSWORD",
        identifierSignal: "runtime-positive-probe",
        sourceSignal: "runtime-positive-probe"
      },
      { client: tx }
    );
    if (!result.allowed) throw new Error("AUTH_THROTTLE_RUNTIME_PROBE_DENIED");
    throw new Error(rollbackSignal);
  });
  throw new Error("AUTH_THROTTLE_RUNTIME_PROBE_COMMITTED");
} catch (error) {
  if (error instanceof Error && error.message === rollbackSignal) {
    console.log(JSON.stringify({
      event: "authentication_throttle_runtime_probe",
      status: "PASS",
      rolledBack: true
    }));
  } else {
    console.error(JSON.stringify({
      event: "authentication_throttle_runtime_probe",
      status: "FAIL",
      codes: safeErrorCodes(error)
    }));
    process.exitCode = 1;
  }
}

function safeErrorCodes(error: unknown) {
  const codes: string[] = [];
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current && typeof current === "object"; depth += 1) {
    const value = current as { message?: unknown; code?: unknown; cause?: unknown };
    for (const candidate of [value.message, value.code]) {
      if (typeof candidate === "string" && /^[A-Z0-9_]{2,80}$/.test(candidate)) {
        codes.push(candidate);
      }
    }
    current = value.cause;
  }
  return [...new Set(codes)].slice(0, 8);
}
