export default function QuotesLoading() {
  return (
    <div aria-busy="true" aria-live="polite" className="grid gap-5">
      <div className="grid gap-4 md:grid-cols-4">
        {[0, 1, 2, 3].map((index) => (
          <section key={index} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="h-4 w-28 animate-pulse rounded bg-slate-100" />
            <div className="mt-3 h-8 w-24 animate-pulse rounded bg-slate-200" />
          </section>
        ))}
      </div>
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 p-5">
          <div className="h-5 w-56 animate-pulse rounded bg-slate-200" />
          <div className="mt-2 h-4 w-96 max-w-full animate-pulse rounded bg-slate-100" />
        </div>
        <div className="grid min-h-[28rem] lg:grid-cols-[minmax(16rem,0.7fr)_minmax(0,1.3fr)]">
          <div className="border-b border-slate-200 p-4 lg:border-b-0 lg:border-r">
            {[0, 1, 2, 3, 4].map((index) => (
              <div key={index} className="mb-3 h-16 animate-pulse rounded bg-slate-100 last:mb-0" />
            ))}
          </div>
          <div className="grid gap-4 p-5">
            <div className="h-20 animate-pulse rounded bg-slate-100" />
            <div className="h-40 animate-pulse rounded bg-slate-100" />
            <div className="h-32 animate-pulse rounded bg-slate-100" />
          </div>
        </div>
      </section>
      <p className="sr-only">Loading approved requests and supplier quote comparisons.</p>
    </div>
  );
}
