"use client";

import { useEffect } from "react";

export function OpeningInventoryDraftClearer({ tenantId, userId, cohortId, attemptId }: { tenantId: string; userId: string; cohortId: string; attemptId: string }) {
  useEffect(() => {
    try {
      window.sessionStorage.removeItem(`ogfi:opening-inventory:${tenantId}:${userId}:${cohortId}:${attemptId}`);
    } catch { /* storage is best effort only */ }
  }, [attemptId, cohortId, tenantId, userId]);
  return null;
}
