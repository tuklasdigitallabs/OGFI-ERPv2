import { randomUUID } from "node:crypto";
import { prisma } from "@ogfi/database";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { permissions } from "../src/server/services/authorization";
import type { SessionContext } from "../src/server/services/context";
import { approvePurchaseRequest, rejectPurchaseRequest, returnPurchaseRequest } from "../src/server/services/approvals";
import { configureApprovalStepRouting, listEligibleApprovalStepPage } from "../src/server/services/approvalRouting";
import { approvalRoutingPolicies } from "../src/server/services/approvalRoutingRegistry";
import { runApprovalRoutingBackfill } from "../src/server/services/approvalRoutingBackfill";

const mockContext = vi.hoisted(() => ({ requireSessionContext: vi.fn() }));
vi.mock("../src/server/services/context", async () => {
  const actual = await vi.importActual<typeof import("../src/server/services/context")>("../src/server/services/context");
  return { ...actual, requireSessionContext: mockContext.requireSessionContext };
});

const runPg = process.env.RUN_APPROVAL_ROUTING_PG_TESTS === "true";
type Actor = { userId: string; roleAssignmentId: string; scopeAssignmentId: string; session: SessionContext };
type Scenario = { tenantId: string; companyId: string; roleId: string; permissionId: string; purchaseRequestId: string; approvalInstanceId: string; stepId: string; nextStepId: string | null; actors: Actor[] };
let priorRoutingFlag: string | undefined;

function decisionForm(approvalInstanceId: string) {
  const form = new FormData();
  form.set("approvalInstanceId", approvalInstanceId);
  form.set("remarks", "PostgreSQL race evidence");
  return form;
}

async function createScenario(actorCount = 1, stepCount = 1, configureRouting = true): Promise<Scenario> {
  const ids = { tenant: randomUUID(), company: randomUUID(), brand: randomUUID(), location: randomUUID(), requester: randomUUID(), role: randomUUID(), rule: randomUUID(), request: randomUUID(), approval: randomUUID(), step: randomUUID() };
  const suffix = ids.tenant.slice(0, 8);
  const dueAt = new Date(Date.now() + 7 * 24 * 60 * 60_000);
  const permission = await prisma.permission.findUniqueOrThrow({ where: { code: permissions.purchaseRequestApprove }, select: { id: true } });
  await prisma.tenant.create({ data: { id: ids.tenant, name: `Action Tenant ${suffix}`, loginCode: `action-${suffix}` } });
  await prisma.company.create({ data: { id: ids.company, tenantId: ids.tenant, code: `ACT-${suffix}`, legalName: `Action Company ${suffix}`, currencyCode: "PHP" } });
  await prisma.brand.create({ data: { id: ids.brand, tenantId: ids.tenant, companyId: ids.company, code: `ACT-${suffix}`, name: `Action Brand ${suffix}` } });
  await prisma.location.create({ data: { id: ids.location, tenantId: ids.tenant, companyId: ids.company, brandId: ids.brand, locationType: "BRANCH", code: `ACT-${suffix}`, name: `Action Location ${suffix}` } });
  await prisma.user.create({ data: { id: ids.requester, tenantId: ids.tenant, email: `requester-${suffix}@test.invalid`, displayName: "Action Requester" } });
  await prisma.role.create({ data: { id: ids.role, tenantId: ids.tenant, code: `ACTION_APPROVER_${suffix}`, name: `Action Approver ${suffix}`, permissions: { create: { permissionId: permission.id } } } });
  const actors: Actor[] = [];
  for (let index = 0; index < actorCount; index += 1) {
    const userId = randomUUID();
    const email = `approver-${index}-${suffix}@test.invalid`;
    await prisma.user.create({ data: { id: userId, tenantId: ids.tenant, email, displayName: `Action Approver ${index + 1}` } });
    const roleAssignment = await prisma.userRoleAssignment.create({ data: { userId, roleId: ids.role, startsAt: new Date(Date.now() - 60_000) }, select: { id: true } });
    const scopeAssignment = await prisma.userScopeAssignment.create({ data: { userId, scopeType: "LOCATION", scopeId: ids.location, accessLevel: "APPROVE", startsAt: new Date(Date.now() - 60_000) }, select: { id: true } });
    actors.push({ userId, roleAssignmentId: roleAssignment.id, scopeAssignmentId: scopeAssignment.id, session: { user: { id: userId, email, displayName: `Action Approver ${index + 1}`, role: "Approver" }, context: { tenantId: ids.tenant, companyId: ids.company, companyName: `Action Company ${suffix}`, brandId: ids.brand, brandName: `Action Brand ${suffix}`, locationId: ids.location, locationName: `Action Location ${suffix}`, locationType: "BRANCH" }, authorizedLocations: [], permissionCodes: [permissions.purchaseRequestApprove] } });
  }
  await prisma.approvalRule.create({ data: { id: ids.rule, tenantId: ids.tenant, companyId: ids.company, transactionType: `PURCHASE_REQUEST_ACTION_${suffix}`, priority: 1 } });
  await prisma.purchaseRequest.create({ data: { id: ids.request, publicReference: `PR-ACT-${suffix}`, tenantId: ids.tenant, companyId: ids.company, requestLocationId: ids.location, requesterUserId: ids.requester, requiredDate: dueAt, urgency: "NORMAL", justification: "Approval action concurrency evidence", status: "PENDING_APPROVAL", currentApprovalStep: 1 } });
  await prisma.approvalInstance.create({ data: { id: ids.approval, tenantId: ids.tenant, companyId: ids.company, documentType: "PurchaseRequest", documentId: ids.request, approvalRuleId: ids.rule, status: "PENDING", currentStepOrder: 1, steps: { create: { id: ids.step, stepOrder: 1, assignedRoleId: ids.role, status: "PENDING" } } } });
  const nextStepId = stepCount > 1 ? randomUUID() : null;
  if (nextStepId) {
    await prisma.approvalInstanceStep.create({ data: { id: nextStepId, approvalInstanceId: ids.approval, stepOrder: 2, assignedRoleId: ids.role, status: "WAITING" } });
  }
  if (configureRouting) {
    await prisma.$transaction((tx) => configureApprovalStepRouting(tx, { approvalInstanceStepId: ids.step, tenantId: ids.tenant, companyId: ids.company, routingPolicy: approvalRoutingPolicies.PurchaseRequest, requiredPermissionCode: permissions.purchaseRequestApprove, activatedAt: new Date(), dueAt, activationAudit: { actorUserId: null, source: "approval-action-postgresql-fixture" }, scopeGroups: [{ groupOrder: 1, targetMatchMode: "ANY", targets: [{ scopeType: "LOCATION", companyId: ids.company, locationId: ids.location }] }], prohibitedActors: [{ userId: ids.requester, reasonCode: "REQUESTER" }] }));
  }
  if (nextStepId && configureRouting) {
    await prisma.$transaction((tx) => configureApprovalStepRouting(tx, { approvalInstanceStepId: nextStepId, tenantId: ids.tenant, companyId: ids.company, routingPolicy: approvalRoutingPolicies.PurchaseRequest, requiredPermissionCode: permissions.purchaseRequestApprove, activatedAt: null, dueAt, scopeGroups: [{ groupOrder: 1, targetMatchMode: "ANY", targets: [{ scopeType: "LOCATION", companyId: ids.company, locationId: ids.location }] }], prohibitedActors: [{ userId: ids.requester, reasonCode: "REQUESTER" }, ...(actors[1] ? [{ userId: actors[0]!.userId, reasonCode: "PRIOR_APPROVER" }] : [])] }));
  }
  return { tenantId: ids.tenant, companyId: ids.company, roleId: ids.role, permissionId: permission.id, purchaseRequestId: ids.request, approvalInstanceId: ids.approval, stepId: ids.step, nextStepId, actors };
}

async function mutationSnapshot(scenario: Scenario) {
  const [request, approval, step, audits, notifications] = await Promise.all([
    prisma.purchaseRequest.findUniqueOrThrow({ where: { id: scenario.purchaseRequestId }, select: { status: true, currentApprovalStep: true, version: true } }),
    prisma.approvalInstance.findUniqueOrThrow({ where: { id: scenario.approvalInstanceId }, select: { status: true, currentStepOrder: true } }),
    prisma.approvalInstanceStep.findUniqueOrThrow({ where: { id: scenario.stepId }, select: { status: true, actedAt: true, actedByUserId: true } }),
    prisma.auditEvent.findMany({ where: { tenantId: scenario.tenantId, entityType: "PurchaseRequest", entityId: scenario.purchaseRequestId }, select: { eventType: true }, orderBy: { occurredAt: "asc" } }),
    prisma.notification.findMany({ where: { tenantId: scenario.tenantId, entityType: "PurchaseRequest", entityId: scenario.purchaseRequestId }, select: { notificationType: true }, orderBy: { generatedAt: "asc" } }),
  ]);
  return { request, approval, step, audits, notifications };
}

describe.skipIf(!runPg).sequential("normalized approval action-time authority PostgreSQL matrix", () => {
  beforeAll(() => { priorRoutingFlag = process.env.APPROVAL_ROUTING_V1_ENABLED; process.env.APPROVAL_ROUTING_V1_ENABLED = "true"; });
  afterAll(() => { if (priorRoutingFlag === undefined) delete process.env.APPROVAL_ROUTING_V1_ENABLED; else process.env.APPROVAL_ROUTING_V1_ENABLED = priorRoutingFlag; });

  test.each([
    ["permission", "PERMISSION_DENIED"],
    ["role", "PERMISSION_DENIED"],
    ["scope", "APPROVAL_SCOPE_DENIED"]
  ] as const)("inbox read followed by %s revocation rejects with zero mutation", async (revocation, expectedError) => {
    const scenario = await createScenario();
    const actor = scenario.actors[0]!;
    expect((await listEligibleApprovalStepPage(actor.session)).items.map((item) => item.approvalInstanceStepId)).toEqual([scenario.stepId]);
    const before = await mutationSnapshot(scenario);
    if (revocation === "permission") await prisma.rolePermission.delete({ where: { roleId_permissionId: { roleId: scenario.roleId, permissionId: scenario.permissionId } } });
    else if (revocation === "role") await prisma.userRoleAssignment.update({ where: { id: actor.roleAssignmentId }, data: { status: "INACTIVE" } });
    else await prisma.userScopeAssignment.update({ where: { id: actor.scopeAssignmentId }, data: { status: "INACTIVE" } });
    mockContext.requireSessionContext.mockResolvedValueOnce(actor.session);
    await expect(approvePurchaseRequest(decisionForm(scenario.approvalInstanceId))).rejects.toThrow(expectedError);
    expect(await mutationSnapshot(scenario)).toEqual(before);
  });

  test("a legacy runtime step fails closed before any workflow mutation", async () => {
    const scenario = await createScenario(1, 1, false);
    const before = await mutationSnapshot(scenario);
    mockContext.requireSessionContext.mockResolvedValueOnce(scenario.actors[0]!.session);

    await expect(approvePurchaseRequest(decisionForm(scenario.approvalInstanceId))).rejects.toThrow("APPROVAL_ROUTING_BACKFILL_REQUIRED");
    expect(await mutationSnapshot(scenario)).toEqual(before);
  });

  test.each([["reject", rejectPurchaseRequest, "REJECTED"], ["return", returnPurchaseRequest, "RETURNED"]] as const)("approve versus %s commits exactly one coherent outcome", async (_label, competingDecision, competingStatus) => {
    const scenario = await createScenario(2);
    mockContext.requireSessionContext.mockResolvedValueOnce(scenario.actors[0]!.session).mockResolvedValueOnce(scenario.actors[1]!.session);
    const results = await Promise.allSettled([approvePurchaseRequest(decisionForm(scenario.approvalInstanceId)), competingDecision(decisionForm(scenario.approvalInstanceId))]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const loser = results.find((result) => result.status === "rejected") as PromiseRejectedResult;
    expect(String(loser.reason)).toMatch(/APPROVAL_(?:NOT_ACTIONABLE|DOCUMENT_NOT_FOUND)/);
    const after = await mutationSnapshot(scenario);
    expect(["APPROVED", competingStatus]).toContain(after.request.status);
    expect(after.approval.status).toBe(after.request.status);
    expect(after.step.status).toBe(after.request.status);
    expect(after.step.actedAt).not.toBeNull();
    const outcome = after.request.status;
    expect(after.audits).toEqual([{ eventType: `purchase_request.${outcome.toLowerCase()}` }]);
    expect(after.notifications).toEqual([{ notificationType: `APPROVAL_OUTCOME_${outcome}` }]);
  }, 4_000);

  test("two eligible actors racing the same role step commit one transition", async () => {
    const scenario = await createScenario(2);
    mockContext.requireSessionContext.mockResolvedValueOnce(scenario.actors[0]!.session).mockResolvedValueOnce(scenario.actors[1]!.session);
    const results = await Promise.allSettled([approvePurchaseRequest(decisionForm(scenario.approvalInstanceId)), approvePurchaseRequest(decisionForm(scenario.approvalInstanceId))]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    const after = await mutationSnapshot(scenario);
    expect(after.request.status).toBe("APPROVED");
    expect(after.approval.status).toBe("APPROVED");
    expect(after.step.status).toBe("APPROVED");
    expect(after.audits).toEqual([{ eventType: "purchase_request.approved" }]);
    expect(after.notifications).toEqual([{ notificationType: "APPROVAL_OUTCOME_APPROVED" }]);
  }, 4_000);

  test("a normalized two-step approval advances into one coherent next pending step", async () => {
    const scenario = await createScenario(2, 2);
    expect(scenario.nextStepId).not.toBeNull();
    const before = await mutationSnapshot(scenario);
    mockContext.requireSessionContext.mockResolvedValueOnce(scenario.actors[0]!.session);

    await approvePurchaseRequest(decisionForm(scenario.approvalInstanceId));

    const [after, nextStep, activationAudits] = await Promise.all([
      mutationSnapshot(scenario),
      prisma.approvalInstanceStep.findUniqueOrThrow({
        where: { id: scenario.nextStepId! },
        select: { status: true, activatedAt: true, actedAt: true }
      }),
      prisma.auditEvent.findMany({
        where: {
          tenantId: scenario.tenantId,
          entityType: "ApprovalInstanceStep",
          entityId: scenario.nextStepId!,
          eventType: "approval.step_activated"
        },
        select: { eventType: true }
      })
    ]);
    expect(after.request).toMatchObject({
      status: "PENDING_APPROVAL",
      currentApprovalStep: 2,
      version: before.request.version + 1
    });
    expect(after.approval).toEqual({ status: "PENDING", currentStepOrder: 2 });
    expect(after.step.status).toBe("APPROVED");
    expect(nextStep.status).toBe("PENDING");
    expect(nextStep.activatedAt).not.toBeNull();
    expect(nextStep.actedAt).toBeNull();
    expect(after.audits).toEqual([{ eventType: "purchase_request.approval_step_approved" }]);
    expect(activationAudits).toEqual([{ eventType: "approval.step_activated" }]);
    expect(after.notifications).toEqual([]);
  }, 4_000);

  test.each(["action-first", "operator-first"] as const)("%s action versus operator dry-run serializes without deadlock", async (startOrder) => {
    const scenario = await createScenario();
    mockContext.requireSessionContext.mockResolvedValueOnce(scenario.actors[0]!.session);
    const action = () => approvePurchaseRequest(decisionForm(scenario.approvalInstanceId));
    const operator = () => runApprovalRoutingBackfill({ tenantId: scenario.tenantId, companyId: scenario.companyId, apply: false, maxSeconds: 5 });
    const operations = startOrder === "action-first" ? [action(), operator()] : [operator(), action()];
    const results = await Promise.allSettled(operations);
    expect(results.map((result) => result.status)).toEqual(["fulfilled", "fulfilled"]);
    const after = await mutationSnapshot(scenario);
    expect(after.request.status).toBe("APPROVED");
    expect(after.approval.status).toBe("APPROVED");
    expect(after.step.status).toBe("APPROVED");
    expect(after.audits).toEqual([{ eventType: "purchase_request.approved" }]);
    expect(after.notifications).toEqual([{ notificationType: "APPROVAL_OUTCOME_APPROVED" }]);
  }, 4_000);
});
