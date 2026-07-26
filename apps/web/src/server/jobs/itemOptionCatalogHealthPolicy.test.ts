import { describe, expect, it } from "vitest";
import { itemOptionCatalogHealthCodes, type ItemOptionCatalogHealthFacts } from "./itemOptionCatalogHealthPolicy";

const facts: ItemOptionCatalogHealthFacts = {
  edge: { globalRejectedDelta: 0, sourceRejectedDelta: 0 },
  application: {
    capacity: 8,
    active: 0,
    maximumActive: 2,
    admitted: 10,
    rejected: 0,
    completed: 10,
    totalDurationMs: 100,
    maximumDurationMs: 20,
    outcomes: { SUCCESS: 10, INVALID: 0, UNAUTHENTICATED: 0, DENIED: 0, UNAVAILABLE: 0 },
    kinds: { item: 4, uom: 3, category: 3, unknown: 0 },
  },
};

describe("item option catalog health policy", () => {
  const thresholds = {
    globalRejectedDelta: 1,
    sourceRejectedDelta: 20,
    applicationRejected: 1,
    unavailable: 1,
    maximumDurationMs: 2_000,
  };

  it("reports healthy bounded traffic", () => {
    expect(itemOptionCatalogHealthCodes(facts, thresholds)).toEqual([]);
  });

  it("emits stable codes for each breached aggregate", () => {
    expect(itemOptionCatalogHealthCodes({
      edge: { globalRejectedDelta: 1, sourceRejectedDelta: 20 },
      application: {
        ...facts.application,
        rejected: 1,
        maximumDurationMs: 2_000,
        outcomes: { ...facts.application.outcomes, UNAVAILABLE: 1 },
      },
    }, thresholds)).toEqual([
      "ITEM_OPTION_GLOBAL_REJECTION_HIGH",
      "ITEM_OPTION_SOURCE_REJECTION_HIGH",
      "ITEM_OPTION_APPLICATION_SATURATION_HIGH",
      "ITEM_OPTION_UNAVAILABLE_HIGH",
      "ITEM_OPTION_LATENCY_HIGH",
    ]);
  });
});
