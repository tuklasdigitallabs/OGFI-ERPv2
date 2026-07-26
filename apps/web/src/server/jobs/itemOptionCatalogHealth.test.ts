import { describe, expect, it } from "vitest";
import {
  isItemOptionCatalogProduction,
  validateItemOptionCatalogHealthFacts,
} from "./itemOptionCatalogHealth";

const validFacts = {
  edge: { globalRejectedDelta: 0, sourceRejectedDelta: 0 },
  application: {
    capacity: 8,
    active: 0,
    maximumActive: 2,
    admitted: 4,
    rejected: 0,
    completed: 4,
    totalDurationMs: 20,
    maximumDurationMs: 10,
    outcomes: { SUCCESS: 4, INVALID: 0, UNAUTHENTICATED: 0, DENIED: 0, UNAVAILABLE: 0 },
    kinds: { item: 2, uom: 1, category: 1, unknown: 0 },
  },
};

describe("item option catalog health input", () => {
  it("treats either production marker as fail-closed production", () => {
    expect(isItemOptionCatalogProduction({ NODE_ENV: "production" })).toBe(true);
    expect(isItemOptionCatalogProduction({ NODE_ENV: "test", APP_ENV: "production" })).toBe(true);
    expect(isItemOptionCatalogProduction({ NODE_ENV: "test", APP_ENV: "staging" })).toBe(false);
  });

  it("accepts only exact fixed-cardinality outcome and kind keys", () => {
    expect(validateItemOptionCatalogHealthFacts(validFacts)).toEqual(validFacts);
    expect(() => validateItemOptionCatalogHealthFacts({
      ...validFacts,
      application: {
        ...validFacts.application,
        outcomes: { ...validFacts.application.outcomes, SUCCESS: undefined, FORGED: 4 },
      },
    })).toThrow("ITEM_OPTION_RUNTIME_METRICS_INVALID");
    expect(() => validateItemOptionCatalogHealthFacts({
      ...validFacts,
      application: {
        ...validFacts.application,
        kinds: { item: 2, uom: 1, category: 1, forged: 0 },
      },
    })).toThrow("ITEM_OPTION_RUNTIME_METRICS_INVALID");
  });
});
