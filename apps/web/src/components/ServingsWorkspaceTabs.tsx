import { permissions } from "@/server/services/authorization";

type ServingsWorkspaceTab = "declarations" | "review" | "configuration";

export function ServingsWorkspaceTabs({
  active,
  permissionCodes,
}: {
  active: ServingsWorkspaceTab;
  permissionCodes: string[];
}) {
  const canReviewOrPost =
    permissionCodes.includes(permissions.consumptionVerify) ||
    permissionCodes.includes(permissions.consumptionPost);
  const tabs = [
    {
      id: "declarations" as const,
      href: "/servings",
      label: "Serving Declarations",
    },
    ...(canReviewOrPost
      ? [
          {
            id: "review" as const,
            href: "/servings/review",
            label: "Review & Posting",
          },
        ]
      : []),
    {
      id: "configuration" as const,
      href: "/servings/settings",
      label: "Branch Configuration",
    },
  ];

  return (
    <nav
      aria-label="Servings and Consumption workspace"
      className="flex gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-slate-50 p-1"
    >
      {tabs.map((tab) => (
        <a
          aria-current={active === tab.id ? "page" : undefined}
          className={
            active === tab.id
              ? "flex min-h-11 shrink-0 items-center rounded-lg border border-blue-200 bg-white px-4 text-sm font-bold text-blue-700 shadow-sm"
              : "flex min-h-11 shrink-0 items-center rounded-lg border border-transparent px-4 text-sm font-semibold text-slate-600 hover:border-slate-200 hover:bg-white hover:text-slate-950"
          }
          href={tab.href}
          key={tab.id}
        >
          {tab.label}
        </a>
      ))}
    </nav>
  );
}
