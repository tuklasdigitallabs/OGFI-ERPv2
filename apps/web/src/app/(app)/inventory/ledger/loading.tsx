export default function InventoryLedgerLoading() {
  return (
    <div aria-live="polite" className="grid gap-5">
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="h-5 w-44 animate-pulse rounded bg-slate-200" />
        <div className="mt-4 h-16 animate-pulse rounded-xl bg-slate-100" />
      </section>
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="h-5 w-40 animate-pulse rounded bg-slate-200" />
        <div className="mt-4 grid gap-3">
          {[0, 1, 2].map((index) => (
            <div key={index} className="h-28 animate-pulse rounded-xl bg-slate-100" />
          ))}
        </div>
      </section>
      <p className="sr-only">Loading the immutable inventory ledger and exact trace.</p>
    </div>
  );
}
