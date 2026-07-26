export type ItemOptionCatalogHealthFacts = {
  edge: {
    globalRejectedDelta: number;
    sourceRejectedDelta: number;
  };
  application: {
    capacity: number;
    active: number;
    maximumActive: number;
    admitted: number;
    rejected: number;
    completed: number;
    totalDurationMs: number;
    maximumDurationMs: number;
    outcomes: {
      SUCCESS: number;
      INVALID: number;
      UNAUTHENTICATED: number;
      DENIED: number;
      UNAVAILABLE: number;
    };
    kinds: {
      item: number;
      uom: number;
      category: number;
      unknown: number;
    };
  };
};

export type ItemOptionCatalogHealthThresholds = {
  globalRejectedDelta: number;
  sourceRejectedDelta: number;
  applicationRejected: number;
  unavailable: number;
  maximumDurationMs: number;
};

export function itemOptionCatalogHealthCodes(
  facts: ItemOptionCatalogHealthFacts,
  thresholds: ItemOptionCatalogHealthThresholds,
) {
  const codes: string[] = [];
  if (facts.edge.globalRejectedDelta >= thresholds.globalRejectedDelta) {
    codes.push("ITEM_OPTION_GLOBAL_REJECTION_HIGH");
  }
  if (facts.edge.sourceRejectedDelta >= thresholds.sourceRejectedDelta) {
    codes.push("ITEM_OPTION_SOURCE_REJECTION_HIGH");
  }
  if (facts.application.rejected >= thresholds.applicationRejected) {
    codes.push("ITEM_OPTION_APPLICATION_SATURATION_HIGH");
  }
  if (facts.application.outcomes.UNAVAILABLE >= thresholds.unavailable) {
    codes.push("ITEM_OPTION_UNAVAILABLE_HIGH");
  }
  if (facts.application.maximumDurationMs >= thresholds.maximumDurationMs) {
    codes.push("ITEM_OPTION_LATENCY_HIGH");
  }
  return codes;
}
