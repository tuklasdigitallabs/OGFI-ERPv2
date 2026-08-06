"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useActionToast } from "@/components/ActionToastProvider";
import type { ActionFeedback } from "@/server/services/actionFeedback";

type LocationOption = {
  scopeAssignmentId: string;
  locationId: string;
  locationName: string;
};

type LocationContextSwitchProps = {
  locations: LocationOption[];
  selectedLocationId: string;
};

type LocationContextResponse = {
  status: "success" | "error";
  feedback: ActionFeedback | null;
};

export function LocationContextSwitch({ locations, selectedLocationId }: LocationContextSwitchProps) {
  const router = useRouter();
  const { showActionToast } = useActionToast();
  const [isPending, setIsPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isPending) return;
    setIsPending(true);
    try {
      const response = await fetch("/api/context/location", {
        method: "POST",
        body: new FormData(event.currentTarget),
        headers: { accept: "application/json" },
        cache: "no-store",
      });
      const payload = await response.json().catch(() => null) as LocationContextResponse | null;
      if (!payload?.feedback) throw new Error("LOCATION_CONTEXT_RESPONSE_INVALID");
      showActionToast(payload.feedback);
      if (payload.status === "success") router.refresh();
    } catch {
      showActionToast({
        code: "ACTION_FAILED",
        title: "Location not switched",
        message: "The selected operating location could not be opened. Try again.",
        tone: "error",
      });
    } finally {
      setIsPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-2" aria-busy={isPending}>
      <select
        aria-label="Location context"
        className="h-10 min-w-52 rounded-[var(--radius-control)] border border-slate-200 bg-white/95 px-4 text-sm font-semibold text-slate-800 shadow-sm focus:ring-2 focus:ring-blue-500"
        defaultValue={selectedLocationId}
        disabled={isPending}
        name="locationId"
      >
        {locations.map((location) => (
          <option key={location.scopeAssignmentId} value={location.locationId}>
            {location.locationName}
          </option>
        ))}
      </select>
      <button
        className="h-10 rounded-[var(--radius-control)] border border-blue-200 bg-blue-50 px-3 text-xs font-bold text-blue-700 shadow-sm transition-colors hover:bg-blue-100 disabled:cursor-wait disabled:opacity-70"
        disabled={isPending}
        type="submit"
      >
        {isPending ? "Switching…" : "Switch"}
      </button>
    </form>
  );
}
