import { describe, expect, it } from "vitest";
import {
  authenticationThrottleHealthCodes,
  boundedHealthCount,
  type AuthenticationThrottleHealthFacts,
} from "./authenticationThrottleHealthPolicy";

const healthyFacts = (): AuthenticationThrottleHealthFacts => ({
  cleanupOverdueWindows: 0,
  cleanupOverdueLegacyAttempts: 0,
  incompatibleActiveWindows: 0,
  controlPresent: true,
  controlPaused: false,
  activeConfigurationMatches: true,
  previousOverlapValid: true,
  requestCount: 10,
  deniedCount: 0,
  maximumPressurePermille: 10,
  occupiedIdentifierShards: 2,
  occupiedSourceShards: 2,
  maximumShardPressurePermille: 10,
  argon2: { capacity: 2, active: 0, maximumActive: 1, rejected: 0, completed: 1, totalDurationMs: 20, maximumDurationMs: 20 },
  caddyRejectedDelta: 0,
});
const thresholds = { deniedCount: 100, pressurePermille: 900, argon2Rejected: 10, argon2MaximumDurationMs: 5_000, caddyRejectedDelta: 100 };

describe("authentication throttle health policy", () => {
  it("accepts a valid previous-key overlap and healthy aggregates", () => {
    expect(authenticationThrottleHealthCodes(healthyFacts(), thresholds)).toEqual([]);
  });

  it("raises only stable reason codes for control and aggregate pressure", () => {
    const facts = healthyFacts();
    facts.controlPaused = true;
    facts.previousOverlapValid = false;
    facts.deniedCount = 100;
    facts.maximumShardPressurePermille = 950;
    facts.argon2.rejected = 10;
    expect(authenticationThrottleHealthCodes(facts, thresholds)).toEqual([
      "AUTH_THROTTLE_CONTROL_PAUSED",
      "AUTH_THROTTLE_PREVIOUS_KEY_OVERLAP_INVALID",
      "AUTH_THROTTLE_DENIED_VELOCITY_HIGH",
      "AUTH_THROTTLE_SHARD_PRESSURE_HIGH",
      "AUTH_ARGON2_REJECTIONS_HIGH",
    ]);
  });

  it("bounds exported aggregate counts", () => {
    expect(boundedHealthCount(-1)).toBe(0);
    expect(boundedHealthCount(10n ** 30n)).toBe(1_000_000_000_000);
  });
});
