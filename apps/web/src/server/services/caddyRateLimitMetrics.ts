const declinedMetric = "caddy_rate_limit_declined_requests_total";

function boundedCount(value: number) {
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.min(1_000_000_000_000, Math.floor(value));
}

function labelValue(labels: string, name: string) {
  const match = new RegExp(`(?:^|,)${name}="([^"\\r\\n]*)"(?:,|$)`).exec(labels);
  return match?.[1];
}

export function parseCaddyRateLimitDeclines(
  metrics: string,
  zones: readonly string[],
  maximumBytes = 256 * 1024,
) {
  if (Buffer.byteLength(metrics, "utf8") > maximumBytes) {
    throw new Error("CADDY_RATE_LIMIT_METRICS_TOO_LARGE");
  }
  const expected = new Set(zones);
  const totals = Object.fromEntries(zones.map((zone) => [zone, 0])) as Record<string, number>;
  const seen = new Set<string>();
  let familyFound = false;

  for (const line of metrics.split("\n")) {
    if (line.startsWith(`# HELP ${declinedMetric} `) || line === `# TYPE ${declinedMetric} counter`) {
      familyFound = true;
      continue;
    }
    const match = new RegExp(`^${declinedMetric}\\{([^\\r\\n]*)\\}\\s+([0-9]+(?:\\.[0-9]+)?)(?:\\s+[0-9]+)?$`).exec(line);
    if (!match) continue;
    familyFound = true;
    const zone = labelValue(match[1]!, "zone");
    const key = labelValue(match[1]!, "key");
    if (!zone || !expected.has(zone) || key !== "") continue;
    totals[zone] = boundedCount(Number(match[2]));
    seen.add(zone);
  }

  if (!familyFound) throw new Error("CADDY_RATE_LIMIT_METRIC_MISSING");
  for (const zone of zones) {
    if (!seen.has(zone)) throw new Error("CADDY_RATE_LIMIT_ZONE_METRIC_MISSING");
  }
  return totals;
}

export function boundedMetricDelta(current: number, previous: number | undefined) {
  if (previous === undefined || current < previous) return 0;
  return boundedCount(current - previous);
}
