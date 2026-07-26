import { readFileSync } from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  ApprovalDecisionComposer,
  type ApprovalDecisionActionState,
  type ApprovalDecisionPresentation
} from "./ApprovalDecisionComposer";
import { getApprovalDecisionSurfaceContract } from "../server/services/approvalDecisionCapabilities";

const action = vi.fn(async (): Promise<ApprovalDecisionActionState> => ({ status: "idle" }));

function render(presentation: ApprovalDecisionPresentation) {
  vi.stubGlobal("React", React);
  return renderToStaticMarkup(
    <ApprovalDecisionComposer
      action={action}
      approvalInstanceId="approval-1"
      presentation={presentation}
    />
  );
}

describe("Approval decision composer", () => {
  it("renders Payment return and reject while normalized approve is disabled with its policy reason", () => {
    const presentation = getApprovalDecisionSurfaceContract("PaymentRequest");
    const approve = presentation.decisions.find((entry) => entry.decision === "APPROVE");
    const html = render(presentation);

    expect(approve?.disabledReasonCode).toBe(
      "PAYMENT_REQUEST_APPROVAL_POLICY_UNCONFIRMED"
    );
    expect(html).toContain(
      "Approval is unavailable until Finance confirms the Payment Request invoice-eligibility and capacity policy."
    );
    expect(html).toMatch(/aria-describedby="[^"]+-approve-reason"[^>]*disabled=""[^>]*value="APPROVE"/);
    expect(html).toContain('value="RETURN"');
    expect(html).toContain('value="REJECT"');
    expect(html).not.toContain('name="evidenceReference"');
  });

  it("renders only supported actions and preserves the accessible 44px interaction contract", () => {
    const html = render({
      family: "BudgetRevision",
      supportsSupplementalEvidence: true,
      decisions: [
        { decision: "APPROVE", label: "Approve Budget Revision", supported: true, available: true },
        { decision: "RETURN", label: "Return for Revision", supported: false, available: false },
        { decision: "REJECT", label: "Reject Budget Revision", supported: true, available: true }
      ]
    });

    expect(html).toContain('aria-busy="false"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('name="evidenceReference"');
    expect(html).toContain('value="APPROVE"');
    expect(html).toContain('value="REJECT"');
    expect(html).not.toContain('value="RETURN"');
    expect(html.match(/min-h-11/g)?.length).toBeGreaterThanOrEqual(3);
  });

  it("keeps drafts client-owned after returned errors and locks competing submissions", () => {
    const component = readFileSync(path.resolve(__dirname, "ApprovalDecisionComposer.tsx"), "utf8");
    const page = readFileSync(path.resolve(__dirname, "../app/(app)/approvals/[id]/page.tsx"), "utf8");

    expect(component).toContain('const [remarks, setRemarks] = useState("")');
    expect(component).toContain('const [evidenceReference, setEvidenceReference] = useState("")');
    expect(component).toContain("if (pending || submitLockRef.current)");
    expect(component).toContain("disabled={pending}");
    expect(component).toContain('aria-invalid={state.status === "error"');
    expect(component).toContain("remarksRef.current?.focus()");
    expect(component).toContain("evidenceRef.current?.focus()");
    expect(component).toContain("errorSummaryRef.current?.focus()");
    expect(component).toContain("Your remarks and evidence draft remain available.");
    expect(page).toContain("assertNormalizedApprovalDecisionAvailable(approvalKind, decision)");
    expect(page.match(/if \(!normalizedApprovalRoutingEnabled\(\)\)/g)).toHaveLength(2);
    expect(page).toContain('redirect("/approvals?error=APPROVAL_ROUTING_V1_DISABLED")');
    expect(page).toContain('status: "error"');
    expect(page).toContain("<ApprovalDecisionComposer");
    expect(page).toContain("min-h-11 w-full");
  });
});
