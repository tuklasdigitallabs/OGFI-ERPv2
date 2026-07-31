export default function OpeningInventoryLoading() {
  return <div className="grid gap-4" aria-busy="true" aria-live="polite"><div className="h-24 animate-pulse rounded-xl bg-slate-200" /><div className="h-80 animate-pulse rounded-xl bg-slate-200" /><p className="text-sm text-slate-600">Loading the authorized opening-inventory workspace…</p></div>;
}
