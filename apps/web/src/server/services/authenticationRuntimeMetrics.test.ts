import { describe, expect, it } from "vitest";
import {
  constantTimeTokenMatches,
  parseCaddyAuthenticationRejections,
  readAuthenticationRuntimeMetrics,
} from "./authenticationRuntimeMetrics";

describe("authentication runtime metrics", () => {
  it("accepts only allowlisted aggregate Caddy rejection counters", () => {
    const text = [
      "# HELP caddy_rate_limit_declined_requests_total Total declined requests.",
      "# TYPE caddy_rate_limit_declined_requests_total counter",
      'caddy_rate_limit_declined_requests_total{key="",zone="sign_in_source"} 4',
      'caddy_rate_limit_declined_requests_total{key="",zone="mfa_source"} 3',
      'caddy_rate_limit_declined_requests_total{key="198.51.100.1/32",zone="mfa_source"} 3',
      'untrusted_identifier_metric{address="198.51.100.1"} 999',
    ].join("\n");
    expect(parseCaddyAuthenticationRejections(text)).toBe(7);
    expect(parseCaddyAuthenticationRejections(
      "# HELP caddy_rate_limit_declined_requests_total Total declined requests.\n# TYPE caddy_rate_limit_declined_requests_total counter",
    )).toBe(0);
    expect(() => parseCaddyAuthenticationRejections("other_metric 1")).toThrow(
      "AUTH_CADDY_REJECTION_METRIC_MISSING",
    );
  });

  it("bounds input and requires the private Caddy metrics endpoint", async () => {
    expect(() => parseCaddyAuthenticationRejections("x".repeat(256 * 1024 + 1))).toThrow(
      "AUTH_CADDY_METRICS_TOO_LARGE",
    );
    await expect(readAuthenticationRuntimeMetrics(
      { NODE_ENV: "test", CADDY_METRICS_URL: "https://example.test/metrics" },
      async () => new Response("", { status: 200 }),
    )).rejects.toThrow("AUTH_CADDY_METRICS_URL_INVALID");
  });

  it("does not disclose or partially match the internal token", () => {
    const token = "a".repeat(32);
    expect(constantTimeTokenMatches(token, token)).toBe(true);
    expect(constantTimeTokenMatches("a".repeat(31), token)).toBe(false);
    expect(constantTimeTokenMatches(null, token)).toBe(false);
  });
});
