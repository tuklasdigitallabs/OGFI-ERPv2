import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { TransactionClient } from "@ogfi/database";
import {
  approvalCancellationErrors,
  terminatePendingApprovalForCancellation
} from "./approvalCancellation";

const input = {
  tenantId: "10000000-0000-0000-0000-000000000001",
  companyId: "20000000-0000-0000-0000-000000000001",
  documentType: "WastageReport",
  documentId: "30000000-0000-0000-0000-000000000001",
  policy: "APPROVAL_REQUIRED" as const
};

const budgetPreReviewInput = {
  ...input,
  documentType: "BudgetRevision",
  coherenceMode: "BUDGET_PRE_REVIEW_ALL_WAITING" as const
};

function mockTx(
  approvals: Array<{ id: string; currentStepOrder: number | null }>,
  steps: Array<{
    id: string;
    stepOrder: number;
    status: string;
    actedAt?: Date | null;
    activatedAt?: Date | null;
    dueAt?: Date | null;
  }> = [],
  stepCount = steps.filter((step) => step.status === "PENDING" || step.status === "WAITING").length,
  instanceCount = 1
) {
  const lockedSteps = steps.map((step) => ({
    ...step,
    actedAt: step.actedAt ?? null,
    activatedAt: step.activatedAt ?? null,
    dueAt: step.dueAt ?? null,
  }));
  return {
    $queryRaw: vi.fn().mockResolvedValueOnce(approvals).mockResolvedValueOnce(lockedSteps),
    approvalInstanceStep: {
      updateMany: vi.fn().mockResolvedValue({ count: stepCount }),
      findFirst: vi.fn().mockResolvedValue(null)
    },
    approvalInstance: {
      updateMany: vi.fn().mockResolvedValue({ count: instanceCount })
    }
  } as unknown as TransactionClient;
}

describe("normalized approval cancellation termination", () => {
  beforeEach(() => {
    process.env.APPROVAL_ROUTING_V1_ENABLED = "true";
  });
  afterEach(() => {
    delete process.env.APPROVAL_ROUTING_V1_ENABLED;
  });

  test("preserves legacy behavior without touching the transaction", async () => {
    process.env.APPROVAL_ROUTING_V1_ENABLED = "false";
    const tx = mockTx([]);
    await expect(terminatePendingApprovalForCancellation(tx, input)).resolves.toEqual({
      mode: "LEGACY",
      approvalInstanceId: null
    });
    expect(tx.$queryRaw).not.toHaveBeenCalled();

    const budgetTx = mockTx([{ id: "approval-1", currentStepOrder: 1 }]);
    await expect(
      terminatePendingApprovalForCancellation(budgetTx, budgetPreReviewInput)
    ).resolves.toEqual({ mode: "LEGACY", approvalInstanceId: null });
    expect(budgetTx.$queryRaw).not.toHaveBeenCalled();
  });

  test("allows a cancellable draft with no pending approval only under optional policy", async () => {
    const optionalTx = mockTx([]);
    await expect(
      terminatePendingApprovalForCancellation(optionalTx, {
        ...input,
        policy: "APPROVAL_OPTIONAL"
      })
    ).resolves.toEqual({ mode: "NO_PENDING_APPROVAL", approvalInstanceId: null });

    await expect(
      terminatePendingApprovalForCancellation(mockTx([]), input)
    ).rejects.toThrow(approvalCancellationErrors.missing);
  });

  test("rejects ambiguous tuple matches and incoherent step state", async () => {
    await expect(
      terminatePendingApprovalForCancellation(
        mockTx([
          { id: "approval-1", currentStepOrder: 2 },
          { id: "approval-2", currentStepOrder: 1 }
        ]),
        input
      )
    ).rejects.toThrow(approvalCancellationErrors.ambiguous);

    await expect(
      terminatePendingApprovalForCancellation(
        mockTx(
          [{ id: "approval-1", currentStepOrder: 2 }],
          [
            { id: "step-1", stepOrder: 1, status: "APPROVED" },
            { id: "step-2", stepOrder: 2, status: "PENDING" },
            { id: "step-3", stepOrder: 3, status: "APPROVED" }
          ]
        ),
        input
      )
    ).rejects.toThrow(approvalCancellationErrors.incoherent);
  });

  test("skips current and future steps and cancels the instance with exact scoped CAS", async () => {
    const tx = mockTx(
      [{ id: "approval-1", currentStepOrder: 2 }],
      [
        { id: "step-1", stepOrder: 1, status: "APPROVED" },
        { id: "step-2", stepOrder: 2, status: "PENDING" },
        { id: "step-3", stepOrder: 3, status: "WAITING" }
      ]
    );
    await expect(terminatePendingApprovalForCancellation(tx, input)).resolves.toEqual({
      mode: "CANCELLED",
      approvalInstanceId: "approval-1"
    });
    expect(tx.approvalInstanceStep.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: { in: ["step-2", "step-3"] },
          status: { in: ["PENDING", "WAITING"] }
        })
      })
    );
    expect(tx.approvalInstance.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: input.tenantId,
          companyId: input.companyId,
          documentType: input.documentType,
          documentId: input.documentId,
          status: "PENDING",
          currentStepOrder: 2
        }),
        data: { status: "CANCELLED", currentStepOrder: null }
      })
    );
  });

  test("cancels a coherent Budget pre-review graph by CAS-skipping every WAITING step", async () => {
    const tx = mockTx(
      [{ id: "approval-1", currentStepOrder: 10 }],
      [
        { id: "step-1", stepOrder: 10, status: "WAITING" },
        { id: "step-2", stepOrder: 20, status: "WAITING" },
        { id: "step-3", stepOrder: 30, status: "WAITING" }
      ]
    );

    await expect(
      terminatePendingApprovalForCancellation(tx, budgetPreReviewInput)
    ).resolves.toEqual({
      mode: "CANCELLED",
      approvalInstanceId: "approval-1"
    });
    expect(tx.approvalInstanceStep.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: { in: ["step-1", "step-2", "step-3"] },
          approvalInstanceId: "approval-1",
          status: "WAITING",
          approvalInstance: {
            tenantId: input.tenantId,
            companyId: input.companyId,
            status: "PENDING"
          }
        }),
        data: { status: "SKIPPED" }
      })
    );
    expect(tx.approvalInstance.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          documentType: "BudgetRevision",
          currentStepOrder: 10
        }),
        data: { status: "CANCELLED", currentStepOrder: null }
      })
    );
    expect(tx.approvalInstanceStep.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          approvalInstanceId: "approval-1",
          status: { in: ["PENDING", "WAITING"] }
        })
      })
    );
  });

  test.each([
    ["actedAt", { actedAt: new Date() }],
    ["activatedAt", { activatedAt: new Date() }],
    ["dueAt", { dueAt: new Date() }],
  ] as const)("rejects a Budget pre-review graph with non-null %s", async (_field, value) => {
    const tx = mockTx(
      [{ id: "approval-1", currentStepOrder: 1 }],
      [
        { id: "step-1", stepOrder: 1, status: "WAITING", ...value },
        { id: "step-2", stepOrder: 2, status: "WAITING" },
      ],
    );

    await expect(
      terminatePendingApprovalForCancellation(tx, budgetPreReviewInput),
    ).rejects.toThrow(approvalCancellationErrors.incoherent);
    expect(tx.approvalInstanceStep.updateMany).not.toHaveBeenCalled();
  });

  test.each([
    {
      name: "has no steps",
      currentStepOrder: 1,
      steps: []
    },
    {
      name: "points currentStepOrder at a later step",
      currentStepOrder: 2,
      steps: [
        { id: "step-1", stepOrder: 1, status: "WAITING" },
        { id: "step-2", stepOrder: 2, status: "WAITING" }
      ]
    },
    {
      name: "has no step matching currentStepOrder",
      currentStepOrder: 0,
      steps: [
        { id: "step-1", stepOrder: 1, status: "WAITING" },
        { id: "step-2", stepOrder: 2, status: "WAITING" }
      ]
    },
    {
      name: "has no currentStepOrder",
      currentStepOrder: null,
      steps: [
        { id: "step-1", stepOrder: 1, status: "WAITING" },
        { id: "step-2", stepOrder: 2, status: "WAITING" }
      ]
    },
    {
      name: "contains a pending step",
      currentStepOrder: 1,
      steps: [
        { id: "step-1", stepOrder: 1, status: "WAITING" },
        { id: "step-2", stepOrder: 2, status: "PENDING" }
      ]
    },
    {
      name: "contains an approved step",
      currentStepOrder: 1,
      steps: [
        { id: "step-1", stepOrder: 1, status: "APPROVED" },
        { id: "step-2", stepOrder: 2, status: "WAITING" }
      ]
    },
    {
      name: "contains a rejected step",
      currentStepOrder: 1,
      steps: [
        { id: "step-1", stepOrder: 1, status: "WAITING" },
        { id: "step-2", stepOrder: 2, status: "REJECTED" }
      ]
    },
    {
      name: "contains a returned step",
      currentStepOrder: 1,
      steps: [
        { id: "step-1", stepOrder: 1, status: "WAITING" },
        { id: "step-2", stepOrder: 2, status: "RETURNED" }
      ]
    },
    {
      name: "contains a skipped step",
      currentStepOrder: 1,
      steps: [
        { id: "step-1", stepOrder: 1, status: "WAITING" },
        { id: "step-2", stepOrder: 2, status: "SKIPPED" }
      ]
    },
    {
      name: "contains duplicate step orders",
      currentStepOrder: 1,
      steps: [
        { id: "step-1", stepOrder: 1, status: "WAITING" },
        { id: "step-2", stepOrder: 1, status: "WAITING" }
      ]
    },
    {
      name: "is not returned in deterministic step order",
      currentStepOrder: 1,
      steps: [
        { id: "step-2", stepOrder: 2, status: "WAITING" },
        { id: "step-1", stepOrder: 1, status: "WAITING" }
      ]
    }
  ])("rejects a Budget pre-review graph that $name", async ({ currentStepOrder, steps }) => {
    const tx = mockTx([{ id: "approval-1", currentStepOrder }], steps);

    await expect(
      terminatePendingApprovalForCancellation(tx, budgetPreReviewInput)
    ).rejects.toThrow(approvalCancellationErrors.incoherent);
    expect(tx.approvalInstanceStep.updateMany).not.toHaveBeenCalled();
    expect(tx.approvalInstance.updateMany).not.toHaveBeenCalled();
  });

  test("does not implicitly accept an all-WAITING graph in the default actionable mode", async () => {
    const tx = mockTx(
      [{ id: "approval-1", currentStepOrder: 1 }],
      [
        { id: "step-1", stepOrder: 1, status: "WAITING" },
        { id: "step-2", stepOrder: 2, status: "WAITING" }
      ]
    );

    await expect(
      terminatePendingApprovalForCancellation(tx, input)
    ).rejects.toThrow(approvalCancellationErrors.incoherent);
    expect(tx.approvalInstanceStep.updateMany).not.toHaveBeenCalled();
  });

  test("does not allow a non-Budget document to opt into the pre-review mode", async () => {
    const tx = mockTx(
      [{ id: "approval-1", currentStepOrder: 1 }],
      [
        { id: "step-1", stepOrder: 1, status: "WAITING" },
        { id: "step-2", stepOrder: 2, status: "WAITING" }
      ]
    );

    await expect(
      terminatePendingApprovalForCancellation(tx, {
        ...input,
        coherenceMode: "BUDGET_PRE_REVIEW_ALL_WAITING"
      })
    ).rejects.toThrow(approvalCancellationErrors.incoherent);
    expect(tx.approvalInstanceStep.updateMany).not.toHaveBeenCalled();
  });

  test("fails closed when Budget pre-review step CAS is short or active residue remains", async () => {
    const steps = [
      { id: "step-1", stepOrder: 1, status: "WAITING" },
      { id: "step-2", stepOrder: 2, status: "WAITING" }
    ];
    const shortTx = mockTx(
      [{ id: "approval-1", currentStepOrder: 1 }],
      steps,
      1
    );
    await expect(
      terminatePendingApprovalForCancellation(shortTx, budgetPreReviewInput)
    ).rejects.toThrow(approvalCancellationErrors.stepCasFailed);
    expect(shortTx.approvalInstance.updateMany).not.toHaveBeenCalled();

    const residueTx = mockTx(
      [{ id: "approval-1", currentStepOrder: 1 }],
      steps
    );
    vi.mocked(residueTx.approvalInstanceStep.findFirst).mockResolvedValueOnce({
      id: "step-2"
    } as never);
    await expect(
      terminatePendingApprovalForCancellation(residueTx, budgetPreReviewInput)
    ).rejects.toThrow(approvalCancellationErrors.residueDetected);
  });

  test("uses deterministic locks and rejects short CAS or active residue", async () => {
    const steps = [
      { id: "step-1", stepOrder: 1, status: "PENDING" },
      { id: "step-2", stepOrder: 2, status: "WAITING" }
    ];
    const shortTx = mockTx([{ id: "approval-1", currentStepOrder: 1 }], steps, 1);
    await expect(
      terminatePendingApprovalForCancellation(shortTx, input)
    ).rejects.toThrow(approvalCancellationErrors.stepCasFailed);

    const residueTx = mockTx([{ id: "approval-1", currentStepOrder: 1 }], steps);
    vi.mocked(residueTx.approvalInstanceStep.findFirst).mockResolvedValueOnce({
      id: "step-2"
    } as never);
    await expect(
      terminatePendingApprovalForCancellation(residueTx, input)
    ).rejects.toThrow(approvalCancellationErrors.residueDetected);

    const queries = vi.mocked(residueTx.$queryRaw).mock.calls.map(
      (call) => (call[0] as unknown as string[]).join("?")
    );
    expect(queries[0]).toContain("ORDER BY ai.id ASC");
    expect(queries[1]).toContain('ORDER BY s."stepOrder" ASC, s.id ASC');
    expect(queries.every((query) => query.includes("FOR UPDATE"))).toBe(true);
  });

  test("rejects a stale approval-instance CAS", async () => {
    const tx = mockTx(
      [{ id: "approval-1", currentStepOrder: 1 }],
      [{ id: "step-1", stepOrder: 1, status: "PENDING" }],
      1,
      0
    );
    await expect(
      terminatePendingApprovalForCancellation(tx, input)
    ).rejects.toThrow(approvalCancellationErrors.instanceCasFailed);
    expect(tx.approvalInstanceStep.findFirst).not.toHaveBeenCalled();
  });
});
