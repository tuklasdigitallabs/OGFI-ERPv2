import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";

const routeRoot = path.resolve(__dirname, "../../app/(app)");

describe("shared application workspace states", () => {
  test("provides a generic loading boundary for operational routes", () => {
    const source = readFileSync(path.join(routeRoot, "loading.tsx"), "utf8");
    expect(source).toContain('aria-busy="true"');
    expect(source).toContain("Loading workspace data and available actions.");
  });

  test("provides a retryable safe error boundary without mutation claims", () => {
    const source = readFileSync(path.join(routeRoot, "error.tsx"), "utf8");
    expect(source).toContain('"use client"');
    expect(source).toContain("No operational record or workflow action was changed.");
    expect(source).toContain("onClick={reset}");
  });
});
