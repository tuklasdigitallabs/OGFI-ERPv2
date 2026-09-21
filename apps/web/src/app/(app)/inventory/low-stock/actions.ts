"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSessionContext } from "@/server/services/context";
import { saveLowStockThreshold } from "@/server/services/lowStock";

export type ThresholdActionState = { error?: string };

export async function saveThresholdAction(_previous: ThresholdActionState, form: FormData): Promise<ThresholdActionState> {
  const session = await getSessionContext();
  if (!session) return { error: "Your session has expired. Sign in again." };
  try {
    await saveLowStockThreshold(session, {
      inventoryLocationId: form.get("inventoryLocationId"), itemCode: form.get("itemCode"),
      thresholdQuantity: form.get("thresholdQuantity"), active: form.get("active") === "true",
      expectedVersion: Number(form.get("expectedVersion")), reason: form.get("reason"),
    });
  } catch (error) {
    const messages: Record<string, string> = {
      LOW_STOCK_THRESHOLD_STALE: "This threshold changed or already exists. Return to the list and reopen it before saving.",
      LOW_STOCK_ITEM_INVALID: "Enter an active inventory item code from this company with an active base unit of measure.",
      SCOPE_DENIED: "Managing thresholds requires MANAGE access to this location or company.",
      PERMISSION_DENIED: "Your current account cannot manage item thresholds.",
    };
    return { error: error instanceof Error && error.name === "ZodError"
      ? "Check the item code, storage location, reason, and nonnegative threshold (up to six decimal places)."
      : messages[error instanceof Error ? error.message : ""] ?? "The threshold could not be saved. Try again or contact your administrator." };
  }
  revalidatePath("/inventory/low-stock");
  revalidatePath("/dashboard");
  redirect("/inventory/low-stock?view=all&saved=1");
}
