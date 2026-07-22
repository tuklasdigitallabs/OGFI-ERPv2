export type AuthenticationThrottleHealthFacts = {
  cleanupOverdueWindows: number;
  cleanupOverdueLegacyAttempts: number;
  incompatibleActiveWindows: number;
  controlPresent: boolean;
  controlPaused: boolean;
  activeConfigurationMatches: boolean;
  previousOverlapValid: boolean;
  requestCount: number;
  deniedCount: number;
  maximumPressurePermille: number;
  occupiedIdentifierShards: number;
  occupiedSourceShards: number;
  maximumShardPressurePermille: number;
  argon2: {
    capacity: number;
    active: number;
    maximumActive: number;
    rejected: number;
    completed: number;
    totalDurationMs: number;
    maximumDurationMs: number;
  };
  caddyRejectedDelta: number;
};

export type AuthenticationThrottleHealthThresholds = {
  deniedCount: number;
  pressurePermille: number;
  argon2Rejected: number;
  argon2MaximumDurationMs: number;
  caddyRejectedDelta: number;
};

export function authenticationThrottleHealthCodes(
  facts: AuthenticationThrottleHealthFacts,
  thresholds: AuthenticationThrottleHealthThresholds,
) {
  const codes: string[] = [];
  if (facts.cleanupOverdueWindows > 0) codes.push("AUTH_THROTTLE_WINDOW_CLEANUP_OVERDUE");
  if (facts.cleanupOverdueLegacyAttempts > 0) codes.push("AUTH_LOGIN_ATTEMPT_CLEANUP_OVERDUE");
  if (facts.incompatibleActiveWindows > 0) codes.push("AUTH_THROTTLE_KEY_VERSION_INCOMPATIBLE");
  if (!facts.controlPresent) codes.push("AUTH_THROTTLE_CONTROL_MISSING");
  else {
    if (facts.controlPaused) codes.push("AUTH_THROTTLE_CONTROL_PAUSED");
    if (!facts.activeConfigurationMatches) codes.push("AUTH_THROTTLE_ACTIVE_CONFIGURATION_MISMATCH");
    if (!facts.previousOverlapValid) codes.push("AUTH_THROTTLE_PREVIOUS_KEY_OVERLAP_INVALID");
  }
  if (facts.deniedCount >= thresholds.deniedCount) codes.push("AUTH_THROTTLE_DENIED_VELOCITY_HIGH");
  if (facts.maximumPressurePermille >= thresholds.pressurePermille) codes.push("AUTH_THROTTLE_PRESSURE_HIGH");
  if (facts.maximumShardPressurePermille >= thresholds.pressurePermille) codes.push("AUTH_THROTTLE_SHARD_PRESSURE_HIGH");
  if (facts.argon2.rejected >= thresholds.argon2Rejected) codes.push("AUTH_ARGON2_REJECTIONS_HIGH");
  if (facts.argon2.maximumDurationMs >= thresholds.argon2MaximumDurationMs) codes.push("AUTH_ARGON2_DURATION_HIGH");
  if (facts.caddyRejectedDelta >= thresholds.caddyRejectedDelta) codes.push("AUTH_CADDY_REJECTIONS_HIGH");
  return [...new Set(codes)];
}

export function boundedHealthCount(value: bigint | number) {
  const numeric = typeof value === "bigint" ? Number(value) : value;
  if (!Number.isFinite(numeric) || numeric < 0) return 0;
  return Math.min(1_000_000_000_000, Math.floor(numeric));
}
