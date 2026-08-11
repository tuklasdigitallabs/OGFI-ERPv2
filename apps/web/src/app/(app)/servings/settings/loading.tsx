export default function RestaurantConsumptionSettingsLoading() {
  return (
    <div aria-busy="true" aria-label="Loading servings settings" className="grid gap-5">
      <div className="h-10 w-44 animate-pulse rounded-lg bg-slate-200" />
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div
            className="h-28 animate-pulse rounded-xl border border-slate-200 bg-white"
            key={index}
          />
        ))}
      </section>
      <section className="h-80 animate-pulse rounded-xl border border-slate-200 bg-white" />
      <section className="h-72 animate-pulse rounded-xl border border-slate-200 bg-white" />
    </div>
  );
}
