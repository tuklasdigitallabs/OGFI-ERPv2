import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  getStockCountRecoveryState,
  StockCountRecoveryPanel
} from "./StockCountRecoveryPanel";

describe("StockCountRecoveryPanel", () => {
  it("maps every DEC-0264 linked-adjustment disposition to a safe default-off state", () => {
    expect(getStockCountRecoveryState(null).adjustmentAction).toBe("NONE");
    expect(getStockCountRecoveryState("DRAFT").adjustmentAction).toBe("CANCEL");
    expect(getStockCountRecoveryState("PENDING_APPROVAL").adjustmentAction).toBe(
      "CANCEL"
    );
    expect(getStockCountRecoveryState("APPROVED").adjustmentAction).toBe("VOID");
    expect(getStockCountRecoveryState("POSTING").adjustmentAction).toBe("WAIT");
    expect(getStockCountRecoveryState("POSTED").adjustmentAction).toBe("REVERSE");
    expect(getStockCountRecoveryState("REVERSED").adjustmentAction).toBe("READY");
  });

  it("shows immutable lineage and a disabled recovery action for a reviewer", () => {
    const html = renderToStaticMarkup(
      <StockCountRecoveryPanel
        adjustment={{
          id: "adjustment-1",
          publicReference: "ADJ-001",
          status: "APPROVED"
        }}
        canShowProtectedFacts
        caseStatus="REVIEWED"
        currentAttemptNumber={2}
        freezeMovements
        inventoryLocationName="Main Warehouse"
        attemptHistory={[{
          id: "attempt-2",
          attemptNumber: 2,
          status: "REVIEWED",
          cutoffAt: "2026-07-31T08:00:00.000Z",
          reviewedAt: "2026-07-31T09:00:00.000Z",
          assignedToName: "Counter A",
          reviewedByName: "Reviewer B",
          hasEvidence: true,
          adjustment: {
            id: "adjustment-history-1",
            publicReference: "ADJ-HISTORY-001",
            status: "REVERSED"
          },
          recovery: null
        }]}
      />
    );

    expect(html).toContain("Attempts &amp; lineage");
    expect(html).toContain("Attempt 2");
    expect(html).toContain("Stable case status");
    expect(html).toContain("new cutoff");
    expect(html).toContain("Approved adjustment requires protected void");
    expect(html).toContain("ADJ-001");
    expect(html).toContain("ADJ-HISTORY-001");
    expect(html).toContain("/ REVERSED");
    expect(html).toContain("Request protected recount (not available)");
    expect(html).toContain("disabled");
  });

  it("does not disclose adjustment linkage or recovery state to blind-count users", () => {
    const html = renderToStaticMarkup(
      <StockCountRecoveryPanel
        adjustment={{
          id: "adjustment-1",
          publicReference: "ADJ-SECRET",
          status: "POSTED"
        }}
        canShowProtectedFacts={false}
        caseStatus="SUBMITTED"
        currentAttemptNumber={1}
        freezeMovements={false}
        inventoryLocationName="Branch A"
        attemptHistory={[]}
      />
    );

    expect(html).toContain("restricted to the independent reviewer");
    expect(html).not.toContain("ADJ-SECRET");
    expect(html).not.toContain("Full reversal required");
    expect(html).not.toContain("POSTED");
  });
});
