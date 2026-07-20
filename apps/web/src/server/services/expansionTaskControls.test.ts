import { describe, expect, test } from "vitest";
import {
  assertExpansionSpecializedTaskTransition,
  getExpansionSpecializedTaskKind,
  hasExpansionStructuredEvidence
} from "./expansionTaskControls";

const feasibilityDescription =
  'EXPANSION_FEASIBILITY_MODEL:{"evidenceReference":"Executive deck approval"}';

describe("Expansion specialized task controls", () => {
  test("recognizes only specialized Expansion work-item markers", () => {
    expect(getExpansionSpecializedTaskKind(feasibilityDescription)).toBe(
      "EXPANSION_FEASIBILITY_MODEL"
    );
    expect(getExpansionSpecializedTaskKind("General project task")).toBeNull();
  });

  test("requires structured evidence rather than a completion note", () => {
    expect(
      hasExpansionStructuredEvidence({
        description: feasibilityDescription,
        activeAttachmentCount: 0,
        sourceRecordLinkCount: 0
      })
    ).toBe(true);
    expect(
      hasExpansionStructuredEvidence({
        description: 'EXPANSION_FEASIBILITY_MODEL:{"evidenceReference":null}',
        activeAttachmentCount: 0,
        sourceRecordLinkCount: 0
      })
    ).toBe(false);
    expect(
      hasExpansionStructuredEvidence({
        description: null,
        activeAttachmentCount: 1,
        sourceRecordLinkCount: 0
      })
    ).toBe(true);
  });

  test("prevents direct completion and requires review first", () => {
    expect(() =>
      assertExpansionSpecializedTaskTransition({
        description: feasibilityDescription,
        currentStatus: "PLANNED",
        nextStatus: "COMPLETED",
        hasStructuredEvidence: true
      })
    ).toThrow("EXPANSION_TASK_INVALID_TRANSITION");

    expect(() =>
      assertExpansionSpecializedTaskTransition({
        description: feasibilityDescription,
        currentStatus: "FOR_REVIEW",
        nextStatus: "COMPLETED",
        hasStructuredEvidence: false
      })
    ).toThrow("EXPANSION_TASK_EVIDENCE_REQUIRED");

    expect(() =>
      assertExpansionSpecializedTaskTransition({
        description: feasibilityDescription,
        currentStatus: "FOR_REVIEW",
        nextStatus: "COMPLETED",
        hasStructuredEvidence: true
      })
    ).not.toThrow();
  });

  test("enforces independent high-severity punch-list closure for direct service calls", () => {
    const description =
      'EXPANSION_PUNCH_LIST_ITEM:{"severity":"HIGH","independentReviewerUserId":"reviewer"}';
    expect(() =>
      assertExpansionSpecializedTaskTransition({
        description,
        currentStatus: "FOR_REVIEW",
        nextStatus: "COMPLETED",
        hasStructuredEvidence: true,
        actorUserId: "owner",
        ownerUserId: "owner",
        createdByUserId: "creator",
        sponsorUserId: "sponsor"
      })
    ).toThrow("EXPANSION_PUNCH_LIST_INDEPENDENT_REVIEW_REQUIRED");
    expect(() =>
      assertExpansionSpecializedTaskTransition({
        description,
        currentStatus: "FOR_REVIEW",
        nextStatus: "COMPLETED",
        hasStructuredEvidence: true,
        actorUserId: "reviewer",
        ownerUserId: "owner",
        createdByUserId: "creator",
        sponsorUserId: "sponsor"
      })
    ).not.toThrow();
  });
});
