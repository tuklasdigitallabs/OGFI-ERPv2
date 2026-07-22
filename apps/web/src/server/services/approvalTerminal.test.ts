import { describe, expect, test, vi } from "vitest";
import type { TransactionClient } from "@ogfi/database";
import {
  approvalTerminalErrors,
  skipFutureApprovalStepsForTerminalDecision
} from "./approvalTerminal";

const input = {
  tenantId: "10000000-0000-0000-0000-000000000001",
  companyId: "20000000-0000-0000-0000-000000000001",
  approvalInstanceId: "30000000-0000-0000-0000-000000000001",
  currentStepOrder: 2
};

function txWith(futureSteps: Array<{ id: string; status: string }>, count = futureSteps.length) {
  return {
    $queryRaw: vi.fn().mockResolvedValue(futureSteps),
    approvalInstanceStep: {
      updateMany: vi.fn().mockResolvedValue({ count }),
      findFirst: vi.fn().mockResolvedValue(null)
    }
  } as unknown as TransactionClient;
}

describe("terminal approval future-step invariant", () => {
  test("accepts a terminal decision with zero future steps", async () => {
    const tx = txWith([]);
    await expect(
      skipFutureApprovalStepsForTerminalDecision(tx, input)
    ).resolves.toBeUndefined();
    expect(tx.approvalInstanceStep.updateMany).not.toHaveBeenCalled();
    expect(tx.approvalInstanceStep.findFirst).not.toHaveBeenCalled();
  });

  test("rejects unless every locked future step is exactly WAITING", async () => {
    const tx = txWith([
      { id: "step-3", status: "WAITING" },
      { id: "step-4", status: "PENDING" }
    ]);
    await expect(
      skipFutureApprovalStepsForTerminalDecision(tx, input)
    ).rejects.toThrow(approvalTerminalErrors.invalidFutureState);
    expect(tx.approvalInstanceStep.updateMany).not.toHaveBeenCalled();
  });

  test("requires an exact scoped CAS count", async () => {
    const tx = txWith(
      [
        { id: "step-3", status: "WAITING" },
        { id: "step-4", status: "WAITING" }
      ],
      1
    );
    await expect(
      skipFutureApprovalStepsForTerminalDecision(tx, input)
    ).rejects.toThrow(approvalTerminalErrors.casFailed);
    expect(tx.approvalInstanceStep.findFirst).not.toHaveBeenCalled();
  });

  test("rejects any non-SKIPPED future residue after the CAS", async () => {
    const tx = txWith([{ id: "step-3", status: "WAITING" }]);
    vi.mocked(tx.approvalInstanceStep.findFirst).mockResolvedValueOnce({
      id: "step-3"
    } as never);
    await expect(
      skipFutureApprovalStepsForTerminalDecision(tx, input)
    ).rejects.toThrow(approvalTerminalErrors.residueDetected);
  });

  test("uses ascending locks and tenant/company-qualified mutations", async () => {
    const tx = txWith([{ id: "step-3", status: "WAITING" }]);
    await skipFutureApprovalStepsForTerminalDecision(tx, input);

    const query = vi.mocked(tx.$queryRaw).mock.calls[0]?.[0] as unknown as string[];
    expect(query.join("?")).toContain('ORDER BY s."stepOrder" ASC, s.id ASC');
    expect(query.join("?")).toContain("FOR UPDATE OF s");
    expect(tx.approvalInstanceStep.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          approvalInstanceId: input.approvalInstanceId,
          status: "WAITING",
          approvalInstance: {
            tenantId: input.tenantId,
            companyId: input.companyId
          }
        })
      })
    );
    expect(tx.approvalInstanceStep.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          stepOrder: { gt: input.currentStepOrder },
          status: { not: "SKIPPED" }
        })
      })
    );
  });
});
