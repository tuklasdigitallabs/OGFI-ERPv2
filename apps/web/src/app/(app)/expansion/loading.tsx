export default function ExpansionLoading() {
  return (
    <main aria-label="Loading Expansion workspace" className="space-y-5 p-5">
      <div className="h-12 animate-pulse rounded-lg bg-slate-100" />
      <div className="grid gap-3 md:grid-cols-4">
        {[0, 1, 2, 3].map((index) => <div className="h-28 animate-pulse rounded-xl border border-slate-200 bg-white" key={index} />)}
      </div>
      <div className="h-12 animate-pulse rounded-lg bg-slate-100" />
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        {[0, 1, 2, 3, 4].map((index) => <div className="h-16 animate-pulse border-b border-slate-100 last:border-0" key={index} />)}
      </div>
    </main>
  );
}
