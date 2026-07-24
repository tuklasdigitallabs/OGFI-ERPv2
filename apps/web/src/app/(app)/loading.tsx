export default function AppWorkspaceLoading() {
  return (
    <div aria-busy="true" aria-live="polite" className="grid gap-5">
      <div className="h-8 w-56 animate-pulse rounded bg-slate-200" />
      <div className="h-4 w-96 max-w-full animate-pulse rounded bg-slate-100" />
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap gap-3 border-b border-slate-200 p-4">
          {[0, 1, 2].map((index) => (
            <div key={index} className="h-11 w-28 animate-pulse rounded-lg bg-slate-100" />
          ))}
        </div>
        <div className="grid gap-3 p-4">
          {[0, 1, 2, 3, 4].map((index) => (
            <div key={index} className="h-16 animate-pulse rounded-lg bg-slate-100" />
          ))}
        </div>
      </section>
      <p className="sr-only">Loading workspace data and available actions.</p>
    </div>
  );
}
