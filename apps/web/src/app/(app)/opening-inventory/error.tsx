"use client";

export default function OpeningInventoryError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <section className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-amber-950" role="alert"><h2 className="font-bold">Opening-inventory workspace unavailable</h2><p className="mt-1 text-sm">The controlled record could not be loaded. Your scope or the record state may have changed; no inventory action was performed.</p><button className="mt-4 min-h-11 rounded-md bg-amber-900 px-4 text-sm font-semibold text-white" onClick={reset}>Try again</button></section>;
}
