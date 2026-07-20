"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const lifecycleGroups = [
  {
    label: "Portfolio",
    destinations: [
      { label: "Dashboard", href: "/expansion" },
      { label: "Sites", href: "/expansion/sites" },
      { label: "Opening Playbooks", href: "/expansion/playbooks" },
      { label: "Project Tasks", href: "/my-work" },
      { label: "Project Calendar", href: "/work-calendar" }
    ]
  },
  {
    label: "Plan",
    destinations: [
      { label: "Feasibility", href: "/expansion/feasibility" },
      { label: "Capex & Procurement", href: "/expansion/capex-procurement" },
      { label: "Lifecycle Gates", href: "/expansion/gates" }
    ]
  },
  {
    label: "Deliver",
    destinations: [
      { label: "Permits & Documents", href: "/expansion/permits" },
      { label: "Construction Board", href: "/expansion/construction" }
    ]
  },
  {
    label: "Open & Stabilize",
    destinations: [
      { label: "Opening Readiness", href: "/expansion/readiness" },
      { label: "Punch List", href: "/expansion/punch-list" },
      { label: "Post-Opening Review", href: "/expansion/post-opening" }
    ]
  }
] as const;

function isActiveDestination(pathname: string, href: string) {
  if (href === "/expansion") {
    return pathname === href;
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

export function ExpansionWorkspaceNav() {
  const pathname = usePathname();
  const currentGroup =
    lifecycleGroups.find((group) =>
      group.destinations.some((destination) => isActiveDestination(pathname, destination.href))
    ) ?? lifecycleGroups[0];

  return (
    <nav
      aria-label="Expansion lifecycle"
      className="mb-5 border-y border-[var(--color-border-default)] bg-[var(--color-bg-surface)] px-3 py-3 sm:rounded-[var(--radius-card)] sm:border sm:px-4"
    >
      <p className="sr-only">Expansion workspace navigation</p>
      <details className="group sm:hidden">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-lg px-2 text-sm font-bold text-slate-800 hover:bg-slate-50">
          <span>{currentGroup.label} workspaces</span>
          <span className="text-xs font-semibold text-slate-500 group-open:hidden">Show all</span>
          <span className="hidden text-xs font-semibold text-slate-500 group-open:inline">Hide</span>
        </summary>
        <div className="mt-2 grid gap-3 border-t border-slate-100 pt-3">
          {lifecycleGroups.map((group) => (
            <section key={group.label}>
              <h2 className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--color-text-muted)]">{group.label}</h2>
              <div className="flex flex-wrap gap-1.5">
                {group.destinations.map((destination) => {
                  const active = isActiveDestination(pathname, destination.href);
                  return <Link key={destination.href} aria-current={active ? "page" : undefined} className={`inline-flex min-h-11 items-center rounded-[var(--radius-control)] px-3 py-2 text-sm font-semibold transition-colors ${active ? "bg-[var(--color-action-primary-subtle)] text-[var(--color-action-primary)]" : "text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-muted)] hover:text-[var(--color-text-primary)]"}`} href={destination.href}>{destination.label}</Link>;
                })}
              </div>
            </section>
          ))}
        </div>
      </details>
      <div className="hidden grid-cols-1 gap-x-5 gap-y-3 sm:grid sm:grid-cols-2 xl:grid-cols-4">
        {lifecycleGroups.map((group) => (
          <section key={group.label} aria-labelledby={`expansion-nav-${group.label.replaceAll(" ", "-").toLowerCase()}`}>
            <h2
              id={`expansion-nav-${group.label.replaceAll(" ", "-").toLowerCase()}`}
              className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--color-text-muted)]"
            >
              {group.label}
            </h2>
            <div className="flex flex-wrap gap-1.5">
              {group.destinations.map((destination) => {
                const active = isActiveDestination(pathname, destination.href);

                return (
                  <Link
                    key={destination.href}
                    aria-current={active ? "page" : undefined}
                    className={`inline-flex min-h-11 items-center rounded-[var(--radius-control)] px-3 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 ${
                      active
                        ? "bg-[var(--color-action-primary-subtle)] text-[var(--color-action-primary)]"
                        : "text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-muted)] hover:text-[var(--color-text-primary)]"
                    }`}
                    href={destination.href}
                  >
                    {destination.label}
                  </Link>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </nav>
  );
}
