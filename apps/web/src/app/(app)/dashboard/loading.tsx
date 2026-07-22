export default function DashboardLoading() {
  return (
    <div aria-live="polite" className="grid gap-5">
      <section className="rounded-[1.25rem] border border-slate-200 bg-white p-5 shadow-sm">
        <div className="h-5 w-44 animate-pulse rounded bg-slate-200" />
        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((index) => (
            <div key={index} className="h-28 animate-pulse rounded-xl bg-slate-100" />
          ))}
        </div>
      </section>
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="h-5 w-36 animate-pulse rounded bg-slate-200" />
        <div className="mt-4 grid gap-3">
          {[0, 1, 2].map((index) => (
            <div key={index} className="h-24 animate-pulse rounded-xl bg-slate-100" />
          ))}
        </div>
      </section>
      <p className="sr-only">Loading company overview and assigned work.</p>
    </div>
  );
}
