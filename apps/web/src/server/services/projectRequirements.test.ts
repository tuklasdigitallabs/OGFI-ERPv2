import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import {
  assertProjectRequirementDecision,
  assertProjectRequirementExceptionResolution,
  assertProjectRequirementSubmission,
  mimeMatchesProjectRequirementEvidence
} from "./projectRequirements";

const ownerId = "00000000-0000-4000-8000-000000000001";
const reviewerId = "00000000-0000-4000-8000-000000000002";

describe("project requirement controls", () => {
  test("submission is owner-only and permits only pending or returned work", () => {
    expect(() =>
      assertProjectRequirementSubmission({
        status: "PENDING",
        ownerUserId: ownerId,
        actorUserId: reviewerId,
        kind: "SIGNOFF",
        evidenceType: null,
        hasMatchingAttachment: false,
        hasSourceRecordLink: false
      })
    ).toThrow("PROJECT_REQUIREMENT_SUBMISSION_OWNER_REQUIRED");

    expect(() =>
      assertProjectRequirementSubmission({
        status: "APPROVED",
        ownerUserId: ownerId,
        actorUserId: ownerId,
        kind: "SIGNOFF",
        evidenceType: null,
        hasMatchingAttachment: false,
        hasSourceRecordLink: false
      })
    ).toThrow("PROJECT_REQUIREMENT_INVALID_SUBMIT_STATE");
  });

  test.each([
    ["APPROVAL_NOTE", "PROJECT_REQUIREMENT_EVIDENCE_NOTE_REQUIRED"],
    ["DOCUMENT", "PROJECT_REQUIREMENT_MATCHING_ATTACHMENT_REQUIRED"],
    ["PHOTO", "PROJECT_REQUIREMENT_MATCHING_ATTACHMENT_REQUIRED"],
    ["SOURCE_RECORD_LINK", "PROJECT_REQUIREMENT_SOURCE_RECORD_LINK_REQUIRED"]
  ])("enforces %s submission evidence", (evidenceType, errorCode) => {
    expect(() =>
      assertProjectRequirementSubmission({
        status: "PENDING",
        ownerUserId: ownerId,
        actorUserId: ownerId,
        kind: "EVIDENCE",
        evidenceType,
        hasMatchingAttachment: false,
        hasSourceRecordLink: false
      })
    ).toThrow(errorCode);
  });

  test("matches photo and document MIME categories", () => {
    expect(mimeMatchesProjectRequirementEvidence("PHOTO", "image/jpeg")).toBe(true);
    expect(mimeMatchesProjectRequirementEvidence("PHOTO", "application/pdf")).toBe(false);
    expect(mimeMatchesProjectRequirementEvidence("DOCUMENT", "application/pdf")).toBe(true);
    expect(mimeMatchesProjectRequirementEvidence("DOCUMENT", "text/plain")).toBe(true);
    expect(mimeMatchesProjectRequirementEvidence("DOCUMENT", "video/mp4")).toBe(false);
  });

  test("decision is submitted-state, reviewer-only, and independent", () => {
    expect(() =>
      assertProjectRequirementDecision({
        status: "PENDING",
        reviewerUserId: reviewerId,
        submittedByUserId: ownerId,
        actorUserId: reviewerId,
        decision: "APPROVED"
      })
    ).toThrow("PROJECT_REQUIREMENT_INVALID_DECISION_STATE");

    expect(() =>
      assertProjectRequirementDecision({
        status: "SUBMITTED",
        reviewerUserId: reviewerId,
        submittedByUserId: ownerId,
        actorUserId: ownerId,
        decision: "APPROVED"
      })
    ).toThrow("PROJECT_REQUIREMENT_DECISION_REVIEWER_REQUIRED");

    expect(() =>
      assertProjectRequirementDecision({
        status: "SUBMITTED",
        reviewerUserId: reviewerId,
        submittedByUserId: reviewerId,
        actorUserId: reviewerId,
        decision: "APPROVED"
      })
    ).toThrow("PROJECT_REQUIREMENT_SELF_DECISION_DENIED");
  });

  test("return requires a reason while an independent reviewer may approve", () => {
    expect(() =>
      assertProjectRequirementDecision({
        status: "SUBMITTED",
        reviewerUserId: reviewerId,
        submittedByUserId: ownerId,
        actorUserId: reviewerId,
        decision: "RETURNED",
        reason: "no"
      })
    ).toThrow("PROJECT_REQUIREMENT_RETURN_REASON_REQUIRED");

    expect(() =>
      assertProjectRequirementDecision({
        status: "SUBMITTED",
        reviewerUserId: reviewerId,
        submittedByUserId: ownerId,
        actorUserId: reviewerId,
        decision: "APPROVED"
      })
    ).not.toThrow();
  });

  test("required requirements are waived rather than silently cancelled", () => {
    expect(() =>
      assertProjectRequirementExceptionResolution({
        status: "PENDING",
        isRequired: true,
        resolution: "CANCELLED"
      })
    ).toThrow("PROJECT_REQUIREMENT_REQUIRED_CANCELLATION_DENIED");
    expect(() =>
      assertProjectRequirementExceptionResolution({
        status: "APPROVED",
        isRequired: true,
        resolution: "WAIVED"
      })
    ).toThrow("PROJECT_REQUIREMENT_EXCEPTION_INVALID_STATE");
    expect(() =>
      assertProjectRequirementExceptionResolution({
        status: "SUBMITTED",
        isRequired: true,
        resolution: "WAIVED"
      })
    ).not.toThrow();
    expect(() =>
      assertProjectRequirementExceptionResolution({
        status: "PENDING",
        isRequired: false,
        resolution: "CANCELLED"
      })
    ).not.toThrow();
  });

  test("writes use scoped CAS, transactional history, and never mutate source records", () => {
    const source = readFileSync(path.resolve(__dirname, "projectRequirements.ts"), "utf8");

    expect(source).toContain("listAuthorizedProjectAccess(session)");
    expect(source).toContain("findAuthorizedProject(session, requirement.projectId)");
    expect(source).toContain("assertPermissionAllowed(session.permissionCodes, permissions.projectManage)");
    expect(source).toContain('status: "ACTIVE",\n      user: { status: "ACTIVE" }');
    expect(source.match(/projectRequirement\.updateMany/g)).toHaveLength(4);
    expect(source.match(/version: values\.expectedVersion/g)?.length).toBeGreaterThanOrEqual(4);
    expect(source.match(/version: \{ increment: 1 \}/g)).toHaveLength(4);
    expect(source.match(/prisma\.\$transaction/g)?.length).toBeGreaterThanOrEqual(4);
    expect(source).toContain("await tx.projectActivityEvent.create");
    expect(source).toContain("await tx.auditEvent.create");
    expect(source).toContain('uploadState: "VERIFIED"');
    expect(source).toContain('physicalState: "DURABLE"');
    expect(source).toContain('scanState: "CLEAN"');
    expect(source).toContain('availabilityState: "AVAILABLE"');
    expect(source).not.toMatch(/tx\.(projectRecordLink|projectAttachment|purchaseRequest|purchaseOrder|inventoryMovement)\.(update|updateMany|delete|deleteMany)/);
  });
});
