"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

type RecipeBrandOption = {
  brandId: string;
  brandName: string;
};

export function RecipeBrandContextSelect({
  options,
  selectedBrandId,
}: {
  options: RecipeBrandOption[];
  selectedBrandId: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, setPending] = useState(false);
  const [nextBrandId, setNextBrandId] = useState(selectedBrandId);

  function handleOpen() {
    if (pending || !nextBrandId || nextBrandId === selectedBrandId) return;
    setPending(true);
    const query = new URLSearchParams(searchParams.toString());
    query.set("brandId", nextBrandId);
    query.delete("page");
    router.push(`${pathname}?${query.toString()}`);
  }

  if (options.length === 0) {
    return (
      <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-900">
        No active recipe brand is available within your Company or Brand scope.
      </p>
    );
  }

  return (
    <div
      aria-busy={pending}
      className="grid gap-2 sm:grid-cols-[minmax(12rem,1fr)_auto] sm:items-end"
    >
      <label className="grid gap-1 text-sm font-semibold text-slate-700">
        Current recipe brand
        <select
          className="min-h-11 rounded-lg border border-slate-300 bg-white px-3"
          disabled={pending}
          onChange={(event) => setNextBrandId(event.target.value)}
          value={nextBrandId}
        >
          {options.map((option) => (
            <option key={option.brandId} value={option.brandId}>
              {option.brandName}
            </option>
          ))}
        </select>
      </label>
      <button
        className="min-h-11 rounded-lg border border-blue-200 bg-blue-50 px-4 text-sm font-bold text-blue-700 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-60"
        disabled={pending || !nextBrandId || nextBrandId === selectedBrandId}
        onClick={handleOpen}
        type="button"
      >
        {pending ? "Opening…" : "Open brand"}
      </button>
      <p className="text-xs text-slate-500 sm:col-span-2">
        Recipe ownership follows your authorized Company or Brand scope. The
        current location remains optional preview context and does not limit
        this brand list.
      </p>
    </div>
  );
}
