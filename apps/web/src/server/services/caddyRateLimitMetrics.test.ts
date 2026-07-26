import { describe, expect, it } from "vitest";
import { boundedMetricDelta, parseCaddyRateLimitDeclines } from "./caddyRateLimitMetrics";

describe("Caddy rate-limit metrics", () => {
  const family = [
    "# HELP caddy_rate_limit_declined_requests_total Total declined requests.",
    "# TYPE caddy_rate_limit_declined_requests_total counter",
  ];

  it("accepts only exact zone-level aggregates", () => {
    const metrics = [
      ...family,
      'caddy_rate_limit_declined_requests_total{key="",zone="item_option_global"} 7',
      'caddy_rate_limit_declined_requests_total{key="",zone="item_option_source"} 9',
      'caddy_rate_limit_declined_requests_total{key="203.0.113.7/32",zone="item_option_source"} 100',
      'caddy_rate_limit_declined_requests_total{key="",zone="sign_in_global"} 500',
    ].join("\n");
    expect(parseCaddyRateLimitDeclines(metrics, ["item_option_global", "item_option_source"])).toEqual({
      item_option_global: 7,
      item_option_source: 9,
    });
  });

  it("fails closed when an expected zone aggregate is missing", () => {
    const metrics = [...family,
      'caddy_rate_limit_declined_requests_total{key="",zone="item_option_global"} 7',
    ].join("\n");
    expect(() => parseCaddyRateLimitDeclines(metrics, ["item_option_global", "item_option_source"]))
      .toThrow("CADDY_RATE_LIMIT_ZONE_METRIC_MISSING");
  });

  it("bounds deltas and treats reset or first observation as a baseline", () => {
    expect(boundedMetricDelta(10, undefined)).toBe(0);
    expect(boundedMetricDelta(2, 10)).toBe(0);
    expect(boundedMetricDelta(15, 10)).toBe(5);
  });
});
