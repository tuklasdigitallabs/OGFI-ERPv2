import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionContext } from "./context";
import {
  issueApprovalReviewToken,
  verifyApprovalReviewToken,
  type ApprovalReviewTokenInput,
} from "./approvalReviewToken";

const now = Date.parse("2026-08-06T04:00:00.000Z");
const ids = {
  tenant: "00000000-0000-4000-8000-000000000001",
  company: "00000000-0000-4000-8000-000000000002",
  otherCompany: "00000000-0000-4000-8000-000000000003",
  user: "00000000-0000-4000-8000-000000000004",
  otherUser: "00000000-0000-4000-8000-000000000005",
  session: "00000000-0000-4000-8000-000000000006",
  otherSession: "00000000-0000-4000-8000-000000000007",
  approval: "00000000-0000-4000-8000-000000000008",
  otherApproval: "00000000-0000-4000-8000-000000000009",
  step: "00000000-0000-4000-8000-000000000010",
  document: "00000000-0000-4000-8000-000000000011",
};

function session(overrides: {
  companyId?: string;
  userId?: string;
  sessionId?: string;
} = {}): SessionContext {
  return {
    user: {
      id: overrides.userId ?? ids.user,
      email: "approver@ogfi.example",
      displayName: "OGFI Approver",
      role: "Approver",
    },
    context: {
      tenantId: ids.tenant,
      companyId: overrides.companyId ?? ids.company,
      companyName: "OGFI",
      brandId: "00000000-0000-4000-8000-000000000012",
      brandName: "OGFI",
      locationId: "00000000-0000-4000-8000-000000000013",
      locationName: "Main Warehouse",
      locationType: "WAREHOUSE",
    },
    authorizedLocations: [],
    permissionCodes: [],
    authentication: {
      sessionId: overrides.sessionId ?? ids.session,
      assuranceLevel: "MFA",
      mfaAuthenticatedAt: new Date(now),
      absoluteExpiresAt: new Date(now + 60 * 60_000),
    },
  };
}

const input: ApprovalReviewTokenInput = {
  approvalId: ids.approval,
  family: "PurchaseRequest",
  stepId: ids.step,
  stepOrder: 1,
  assignedUserId: null,
  assignedRoleId: "00000000-0000-4000-8000-000000000014",
  requiredPermissionCode: "purchasing.purchase_request.approve",
  routingFingerprint: "b".repeat(64),
  routingSchemaVersion: 1,
  activatedAt: "2026-08-06T03:55:00.000Z",
  documentId: ids.document,
  sourceRevision: "version:4",
  reviewDigest: "a".repeat(64),
};

const expected = {
  approvalId: ids.approval,
  family: "PurchaseRequest" as const,
};

beforeEach(() => {
  vi.stubEnv("AUTH_SECRET", "a".repeat(32));
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("approval review tokens", () => {
  it("issues a deterministic token and verifies its bound review payload", () => {
    const token = issueApprovalReviewToken(session(), input, now);
    expect(issueApprovalReviewToken(session(), input, now)).toBe(token);

    expect(verifyApprovalReviewToken(session(), token, expected, now)).toMatchObject({
      version: 1,
      issuedAt: now,
      expiresAt: now + 15 * 60_000,
      tenantId: ids.tenant,
      companyId: ids.company,
      actorUserId: ids.user,
      sessionId: ids.session,
      ...input,
    });
  });

  it("rejects a tampered token without disclosing the cause", () => {
    const token = issueApprovalReviewToken(session(), input, now);
    const [encoded, signature] = token.split(".");
    const tampered = `${encoded!.slice(0, -1)}${encoded!.endsWith("a") ? "b" : "a"}.${signature}`;

    expect(() =>
      verifyApprovalReviewToken(session(), tampered, expected, now),
    ).toThrow("APPROVAL_REVIEW_STALE");
  });

  it("rejects an expired token", () => {
    const token = issueApprovalReviewToken(session(), input, now);

    expect(() =>
      verifyApprovalReviewToken(session(), token, expected, now + 15 * 60_000),
    ).toThrow("APPROVAL_REVIEW_STALE");
  });

  it.each([
    ["user", session({ userId: ids.otherUser })],
    ["session", session({ sessionId: ids.otherSession })],
    ["company", session({ companyId: ids.otherCompany })],
  ])("rejects a token replayed across %s boundaries", (_boundary, otherSession) => {
    const token = issueApprovalReviewToken(session(), input, now);

    expect(() =>
      verifyApprovalReviewToken(otherSession, token, expected, now),
    ).toThrow("APPROVAL_REVIEW_STALE");
  });

  it("rejects the wrong approval or approval family", () => {
    const token = issueApprovalReviewToken(session(), input, now);

    expect(() =>
      verifyApprovalReviewToken(
        session(),
        token,
        { ...expected, approvalId: ids.otherApproval },
        now,
      ),
    ).toThrow("APPROVAL_REVIEW_STALE");
    expect(() =>
      verifyApprovalReviewToken(
        session(),
        token,
        { ...expected, family: "PurchaseOrder" },
        now,
      ),
    ).toThrow("APPROVAL_REVIEW_STALE");
  });

  it("verifies a signed family before a record probe when only the approval is expected", () => {
    const token = issueApprovalReviewToken(session(), input, now);

    expect(
      verifyApprovalReviewToken(
        session(),
        token,
        { approvalId: ids.approval },
        now,
      ).family,
    ).toBe("PurchaseRequest");
  });

  it.each(["", "not-a-token", "e30.invalid", "a.b.c"])(
    "rejects malformed token %j",
    (token) => {
      expect(() =>
        verifyApprovalReviewToken(session(), token, expected, now),
      ).toThrow("APPROVAL_REVIEW_STALE");
    },
  );
});
