export default function InventoryBalancesLoading() {
  return (
    <div aria-live="polite" className="grid gap-5">
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="h-5 w-52 animate-pulse rounded bg-slate-200" />
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <div className="h-24 animate-pulse rounded-xl bg-slate-100" />
          <div className="h-24 animate-pulse rounded-xl bg-slate-100" />
        </div>
      </section>
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="h-11 animate-pulse rounded-lg bg-slate-100" />
        <div className="mt-4 grid gap-3">
          {[0, 1, 2].map((index) => (
            <div key={index} className="h-24 animate-pulse rounded-xl bg-slate-100" />
          ))}
        </div>
      </section>
      <p className="sr-only">Loading current stock balances.</p>
    </div>
  );
}
