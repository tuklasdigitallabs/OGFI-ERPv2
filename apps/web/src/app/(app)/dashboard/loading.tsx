export default function DashboardLoading() {
  return (
    <div aria-busy="true" aria-live="polite" className="grid gap-5">
      <section className="overflow-hidden rounded-[1.25rem] border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-4">
          <div className="flex gap-3">
            {[0, 1, 2, 3].map((index) => (
              <div key={index} className="h-11 w-24 animate-pulse rounded-lg bg-slate-100" />
            ))}
          </div>
        </div>
        <div className="p-5">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
            <div className="h-4 w-40 animate-pulse rounded bg-slate-200" />
            <div className="mt-3 h-7 w-64 max-w-full animate-pulse rounded bg-slate-200" />
            <div className="mt-3 h-4 w-80 max-w-full animate-pulse rounded bg-slate-100" />
            <div className="mt-4 h-6 w-72 max-w-full animate-pulse rounded bg-slate-200" />
          </div>
        </div>
        <div className="flex min-h-14 items-center gap-3 border-t border-slate-200 bg-slate-50 px-5">
          <div className="h-5 w-5 animate-pulse rounded bg-slate-200" />
          <div className="h-4 w-52 animate-pulse rounded bg-slate-200" />
        </div>
      </section>
      <section
        aria-label="Loading dashboard overview summaries"
        className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
      >
        <div className="divide-y divide-slate-200">
          {[0, 1, 2, 3].map((row) => (
            <div
              className="grid min-h-24 gap-4 border-l-4 border-l-slate-200 px-4 py-4 md:grid-cols-[minmax(14rem,0.8fr)_minmax(0,1.4fr)_auto] md:items-center"
              key={row}
            >
              <div className="flex min-w-0 items-center gap-3">
                <div className="h-11 w-11 shrink-0 animate-pulse rounded-xl bg-slate-100" />
                <div className="min-w-0 flex-1">
                  <div className="h-5 w-40 max-w-full animate-pulse rounded bg-slate-200" />
                  <div className="mt-2 h-3 w-56 max-w-full animate-pulse rounded bg-slate-100" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {[0, 1, 2].map((snapshot) => (
                  <div
                    className="h-12 animate-pulse rounded-lg bg-slate-100"
                    key={snapshot}
                  />
                ))}
              </div>
              <div className="flex items-center justify-end gap-2">
                <div className="h-3 w-16 animate-pulse rounded bg-slate-100" />
                <div className="h-9 w-9 shrink-0 animate-pulse rounded-full bg-slate-100" />
              </div>
            </div>
          ))}
        </div>
      </section>
      <p className="sr-only">
        Loading selected operating scope, dashboard source status, and today&apos;s work.
      </p>
    </div>
  );
}
