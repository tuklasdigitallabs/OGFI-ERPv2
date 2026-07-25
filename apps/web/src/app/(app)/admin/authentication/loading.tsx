export default function AuthenticationAdminLoading() {
  return (
    <div className="grid gap-4" aria-busy="true" aria-label="Loading Authentication Recovery">
      <div className="h-8 w-64 animate-pulse rounded bg-slate-200" />
      <div className="h-28 animate-pulse rounded-2xl bg-slate-100" />
      <div className="h-64 animate-pulse rounded-2xl bg-slate-100" />
    </div>
  );
}
