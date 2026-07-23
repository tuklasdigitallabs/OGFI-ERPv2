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
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 p-4">
          <div className="h-4 w-24 animate-pulse rounded bg-slate-100" />
          <div className="mt-2 h-6 w-36 animate-pulse rounded bg-slate-200" />
          <div className="mt-2 h-4 w-3/4 animate-pulse rounded bg-slate-100" />
        </div>
        <div className="grid gap-4 p-4 xl:grid-cols-2">
          {[0, 1].map((column) => (
            <div key={column} className="overflow-hidden rounded-xl border border-slate-200">
              <div className="h-16 animate-pulse border-b border-slate-100 bg-slate-50" />
              {[0, 1].map((row) => (
                <div key={row} className="h-28 animate-pulse border-b border-slate-100 bg-white last:border-b-0" />
              ))}
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
