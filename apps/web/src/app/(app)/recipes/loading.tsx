export default function RecipesWorkspaceLoading() {
  return (
    <div aria-busy="true" aria-label="Loading recipes and menu costing" className="grid gap-5">
      <section className="h-32 animate-pulse rounded-xl border border-blue-100 bg-blue-50/60" />
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {Array.from({ length: 5 }, (_, index) => (
          <div
            className="h-28 animate-pulse rounded-xl border border-slate-200 bg-white"
            key={index}
          />
        ))}
      </section>
      <section className="h-96 animate-pulse rounded-xl border border-slate-200 bg-white" />
    </div>
  );
}
