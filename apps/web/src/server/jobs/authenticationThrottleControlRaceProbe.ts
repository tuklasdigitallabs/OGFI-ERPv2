import { createHmac } from "node:crypto";
import { prisma, type TransactionClient } from "@ogfi/database";
import {
  authenticationThrottleKeyFingerprint,
  authenticationThrottlePolicyDigest,
  loadAuthenticationThrottleConfig,
  reserveAuthenticationAttempt,
  transitionAuthenticationThrottleControl,
  type AuthenticationThrottleTransactionHost,
  type AuthenticationThrottleConfig
} from "../services/authenticationThrottle";

try {
  const config = loadAuthenticationThrottleConfig();
  const expectedGeneration = bigintEnvironment(
    "AUTH_THROTTLE_CONTROL_EXPECTED_GENERATION"
  );
  await verifyRejectedOperatorTransitions(config, expectedGeneration);
  const alternatives = [1, 2].map((offset) => alternateConfig(config, offset));
  const raced = await Promise.allSettled(
    alternatives.map((candidate) => transitionAuthenticationThrottleControl({
      expectedGeneration,
      requestedStatus: "ACTIVE",
      config: candidate
    }))
  );
  const winners = raced.filter(
    (result): result is PromiseFulfilledResult<Awaited<ReturnType<typeof transitionAuthenticationThrottleControl>>> =>
      result.status === "fulfilled"
  );
  if (winners.length !== 1 || raced.filter((result) => result.status === "rejected").length !== 1) {
    throw new Error("AUTH_THROTTLE_CONTROL_RACE_NOT_SERIALIZED");
  }
  const winner = winners[0];
  if (!winner) throw new Error("AUTH_THROTTLE_CONTROL_RACE_NOT_SERIALIZED");
  const bridge = alternateConfig(config, 3);
  const bridged = await transitionAuthenticationThrottleControl({
    expectedGeneration: winner.value.generation,
    requestedStatus: "ACTIVE",
    config: bridge
  });
  const restored = await transitionAuthenticationThrottleControl({
    expectedGeneration: bridged.generation,
    requestedStatus: "ACTIVE",
    config
  });
  if (
    restored.activeKeyVersion !== config.keyVersion ||
    restored.activeKeyFingerprint !== authenticationThrottleKeyFingerprint(config.hmacKey) ||
    restored.policyDigest !== authenticationThrottlePolicyDigest(config)
  ) {
    throw new Error("AUTH_THROTTLE_CONTROL_RACE_RESTORE_FAILED");
  }
  const idempotent = await transitionAuthenticationThrottleControl({
    expectedGeneration: restored.generation,
    requestedStatus: "ACTIVE",
    config
  });
  if (idempotent.generation !== restored.generation) {
    throw new Error("AUTH_THROTTLE_CONTROL_IDEMPOTENCE_FAILED");
  }
  const pauseReservationIterations = 25;
  let current = restored;
  for (let iteration = 0; iteration < pauseReservationIterations; iteration += 1) {
    const pauseRace = await Promise.allSettled([
      transitionAuthenticationThrottleControl({
        expectedGeneration: current.generation,
        requestedStatus: "PAUSED",
        config
      }),
      reserveAuthenticationAttempt({
        attemptType: "PASSWORD",
        identifierSignal: `control-race-probe-${iteration}@test.invalid`,
        sourceSignal: `control-race-probe-${iteration}`
      }, { config })
    ]);
    const paused = pauseRace[0];
    if (paused.status !== "fulfilled") {
      throw new Error(pauseTransitionFailureCode(paused.reason));
    }
    if (paused.value.status !== "PAUSED") {
      throw new Error("AUTH_THROTTLE_PAUSE_STATUS_INVALID");
    }
    const reservation = pauseRace[1];
    if (!reservation || reservation.status !== "fulfilled") {
      throw new Error("AUTH_THROTTLE_RESERVATION_PROMISE_REJECTED");
    }
    const whilePaused = await reserveAuthenticationAttempt({
      attemptType: "PASSWORD",
      identifierSignal: `control-race-paused-${iteration}@test.invalid`,
      sourceSignal: `control-race-paused-${iteration}`
    }, { config });
    if (whilePaused.allowed || whilePaused.reason !== "THROTTLE_UNAVAILABLE") {
      throw new Error("AUTH_THROTTLE_PAUSE_ADMISSION_FAILED");
    }
    current = await transitionAuthenticationThrottleControl({
      expectedGeneration: paused.value.generation,
      requestedStatus: "ACTIVE",
      config
    });
  }
  const postResume = await reserveAuthenticationAttempt({
    attemptType: "PASSWORD",
    identifierSignal: "control-race-post-resume@test.invalid",
    sourceSignal: "control-race-post-resume"
  }, { config });
  if (current.status !== "ACTIVE" || !postResume.allowed) {
    throw new Error("AUTH_THROTTLE_PAUSE_RESUME_FAILED");
  }
  console.log(JSON.stringify({
    event: "authentication_throttle_control_race_probe",
    status: "PASS",
    oneWinner: true,
    loserRolledBack: true,
    restored: true,
    idempotent: true,
    rejectedUnsafeRotations: true,
    pauseReservationSerialized: true,
    pauseReservationIterations,
    resumed: true
  }));
} catch (error) {
  console.error(JSON.stringify({
    event: "authentication_throttle_control_race_probe",
    status: "FAIL",
    code: safeErrorCode(error)
  }));
  process.exitCode = 1;
}

async function verifyRejectedOperatorTransitions(
  config: AuthenticationThrottleConfig,
  expectedGeneration: bigint
) {
  await expectRolledBackRejection(async (host) => {
    await transitionAuthenticationThrottleControl({
      expectedGeneration,
      requestedStatus: null as never,
      config
    }, { client: host });
  }, "AUTH_THROTTLE_CONTROL_STATUS_INVALID", "AUTH_THROTTLE_NULL_STATUS_NOT_REJECTED");

  await expectRolledBackRejection(async (_host, tx) => {
    await tx.$queryRaw`
      SELECT * FROM public.operator_transition_authentication_throttle_control(
        ${expectedGeneration},
        ${null}::"AuthenticationThrottleControlStatus",
        ${config.keyVersion}::integer,
        ${authenticationThrottleKeyFingerprint(config.hmacKey)},
        ${authenticationThrottlePolicyDigest(config)}
      )`;
  }, "AUTH_THROTTLE_CONTROL_INPUT_INVALID", "AUTH_THROTTLE_SQL_NULL_STATUS_NOT_REJECTED");

  await expectRolledBackRejection(async (host) => {
    await transitionAuthenticationThrottleControl({
      expectedGeneration,
      requestedStatus: "ACTIVE",
      config: { ...config, keyVersion: alternateKeyVersion(config.keyVersion, 10) }
    }, { client: host });
  }, "AUTH_THROTTLE_KEY_IDENTITY_REUSE_FORBIDDEN", "AUTH_THROTTLE_ACTIVE_FINGERPRINT_REUSE_NOT_REJECTED");

  await expectRolledBackRejection(async (host) => {
    const reserved = await reserveAuthenticationAttempt({
      attemptType: "PASSWORD",
      identifierSignal: "unexpired-previous@test.invalid",
      sourceSignal: "unexpired-previous"
    }, { client: host, config });
    if (!reserved.allowed) throw new Error("AUTH_THROTTLE_RACE_SETUP_FAILED");
    const first = await transitionAuthenticationThrottleControl({
      expectedGeneration,
      requestedStatus: "ACTIVE",
      config: alternateConfig(config, 20)
    }, { client: host });
    await transitionAuthenticationThrottleControl({
      expectedGeneration: first.generation,
      requestedStatus: "ACTIVE",
      config: alternateConfig(config, 21)
    }, { client: host });
  }, "AUTH_THROTTLE_PREVIOUS_GENERATION_UNEXPIRED", "AUTH_THROTTLE_UNEXPIRED_PREVIOUS_NOT_REJECTED");

  await expectRolledBackRejection(async (host) => {
    const first = await transitionAuthenticationThrottleControl({
      expectedGeneration,
      requestedStatus: "ACTIVE",
      config: alternateConfig(config, 30)
    }, { client: host });
    await transitionAuthenticationThrottleControl({
      expectedGeneration: first.generation,
      requestedStatus: "ACTIVE",
      config: {
        ...alternateConfig(config, 31),
        keyVersion: config.keyVersion
      }
    }, { client: host });
  }, "AUTH_THROTTLE_KEY_IDENTITY_REUSE_FORBIDDEN", "AUTH_THROTTLE_PREVIOUS_VERSION_REUSE_NOT_REJECTED");

  await expectRolledBackRejection(async (host) => {
    const first = await transitionAuthenticationThrottleControl({
      expectedGeneration,
      requestedStatus: "ACTIVE",
      config: alternateConfig(config, 40)
    }, { client: host });
    await transitionAuthenticationThrottleControl({
      expectedGeneration: first.generation,
      requestedStatus: "ACTIVE",
      config: {
        ...alternateConfig(config, 41),
        hmacKey: config.hmacKey
      }
    }, { client: host });
  }, "AUTH_THROTTLE_KEY_IDENTITY_REUSE_FORBIDDEN", "AUTH_THROTTLE_PREVIOUS_FINGERPRINT_REUSE_NOT_REJECTED");
}

async function expectRolledBackRejection(
  operation: (
    host: AuthenticationThrottleTransactionHost,
    tx: TransactionClient
  ) => Promise<unknown>,
  expectedCode: string,
  failureCode: string
) {
  let rejected = false;
  try {
    await prisma.$transaction(async (tx) => {
      const host = {
        $transaction: async (callback: (client: typeof tx) => Promise<unknown>) =>
          callback(tx)
      } as AuthenticationThrottleTransactionHost;
      try {
        await operation(host, tx);
      } catch (error) {
        if (!errorIncludesCode(error, expectedCode)) {
          throw new Error(failureCode, { cause: error });
        }
        rejected = true;
        throw new Error("AUTH_THROTTLE_EXPECTED_ROLLBACK");
      }
      throw new Error(failureCode);
    });
  } catch (error) {
    if (!rejected || (error instanceof Error && error.message === failureCode)) {
      throw error;
    }
  }
}

function errorIncludesCode(error: unknown, code: string): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 8 && current; depth += 1) {
    if (current instanceof Error && current.message.includes(code)) return true;
    current = typeof current === "object" && current !== null && "cause" in current
      ? (current as { cause?: unknown }).cause
      : null;
  }
  return false;
}

function pauseTransitionFailureCode(error: unknown) {
  if (errorIncludesCode(error, "AUTH_THROTTLE_CONTROL_GENERATION_CONFLICT")) {
    return "AUTH_THROTTLE_PAUSE_GENERATION_CONFLICT";
  }
  if (isTransientDatabaseError(error)) {
    return "AUTH_THROTTLE_PAUSE_TRANSIENT_EXHAUSTED";
  }
  const databaseCode = safeDatabaseErrorCode(error);
  if (databaseCode) {
    return `AUTH_THROTTLE_PAUSE_DATABASE_${databaseCode}`;
  }
  return "AUTH_THROTTLE_PAUSE_RESERVATION_RACE_FAILED";
}

function safeDatabaseErrorCode(error: unknown): string | null {
  if (!error || typeof error !== "object") return null;
  const value = error as {
    code?: unknown;
    meta?: { code?: unknown };
    cause?: unknown;
  };
  for (const candidate of [value.code, value.meta?.code]) {
    if (typeof candidate === "string" && /^(?:P[0-9]{4}|[0-9A-Z]{5})$/.test(candidate)) {
      return candidate;
    }
  }
  return safeDatabaseErrorCode(value.cause);
}

function isTransientDatabaseError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const value = error as {
    code?: unknown;
    meta?: { code?: unknown };
    cause?: unknown;
  };
  return value.code === "P2034" || value.code === "P2028" ||
    value.meta?.code === "40001" ||
    value.meta?.code === "40P01" || isTransientDatabaseError(value.cause);
}

function alternateConfig(
  config: AuthenticationThrottleConfig,
  offset: number
): AuthenticationThrottleConfig {
  const {
    previousHmacKey: _previousHmacKey,
    previousKeyVersion: _previousKeyVersion,
    ...activeConfig
  } = config;
  const keyVersion = alternateKeyVersion(config.keyVersion, offset);
  return {
    ...activeConfig,
    hmacKey: createHmac("sha256", config.hmacKey)
      .update(`disposable-control-race:${offset}`, "utf8")
      .digest("hex"),
    keyVersion
  };
}

function alternateKeyVersion(keyVersion: number, offset: number) {
  let candidate = ((keyVersion + offset - 1) % 1_000_000) + 1;
  if (candidate === keyVersion) candidate = (candidate % 1_000_000) + 1;
  return candidate;
}

function bigintEnvironment(name: string) {
  const raw = process.env[name];
  if (!raw || !/^[1-9][0-9]{0,18}$/.test(raw)) {
    throw new Error(`${name}_INVALID`);
  }
  return BigInt(raw);
}

function safeErrorCode(error: unknown) {
  if (error instanceof Error && /^[A-Z0-9_]+$/.test(error.message)) {
    return error.message;
  }
  return "AUTH_THROTTLE_CONTROL_RACE_PROBE_FAILED";
}
