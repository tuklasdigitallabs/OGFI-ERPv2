"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

export type SummarySnapshotTone =
  | "neutral"
  | "info"
  | "success"
  | "warning"
  | "destructive";

export type SummaryAccentTone =
  | "slate"
  | "blue"
  | "violet"
  | "amber"
  | "emerald"
  | "rose";

export type SingleOpenSummarySnapshot = {
  label: string;
  value: string;
  tone: SummarySnapshotTone;
};

export type SingleOpenSummarySection = {
  id: string;
  title: string;
  supportingText: string;
  snapshots: SingleOpenSummarySnapshot[];
  accent: SummaryAccentTone;
  icon: ReactNode;
  body: ReactNode;
};

const accentToneClasses = {
  slate: {
    accent: "border-l-slate-400",
    icon: "border-slate-200 bg-slate-50 text-slate-700",
    expanded: "bg-slate-50/60",
  },
  blue: {
    accent: "border-l-blue-500",
    icon: "border-blue-100 bg-blue-50 text-blue-700",
    expanded: "bg-blue-50/35",
  },
  violet: {
    accent: "border-l-violet-500",
    icon: "border-violet-100 bg-violet-50 text-violet-700",
    expanded: "bg-violet-50/25",
  },
  amber: {
    accent: "border-l-amber-500",
    icon: "border-amber-100 bg-amber-50 text-amber-700",
    expanded: "bg-amber-50/25",
  },
  emerald: {
    accent: "border-l-emerald-500",
    icon: "border-emerald-100 bg-emerald-50 text-emerald-700",
    expanded: "bg-emerald-50/25",
  },
  rose: {
    accent: "border-l-rose-500",
    icon: "border-rose-100 bg-rose-50 text-rose-700",
    expanded: "bg-rose-50/25",
  },
} as const;

const snapshotToneClasses = {
  neutral: "border-slate-200 bg-slate-50 text-slate-700",
  info: "border-blue-100 bg-blue-50 text-blue-800",
  success: "border-emerald-100 bg-emerald-50 text-emerald-800",
  warning: "border-amber-100 bg-amber-50 text-amber-900",
  destructive: "border-rose-100 bg-rose-50 text-rose-800",
} as const;

export function SingleOpenSummaryList({
  ariaLabel,
  headingLevel = 2,
  idPrefix,
  sections,
}: {
  ariaLabel: string;
  headingLevel?: 2 | 3 | 4;
  idPrefix: string;
  sections: SingleOpenSummarySection[];
}) {
  const sectionKey = sections.map((section) => section.id).join("|");
  const [openId, setOpenId] = useState<string | null>(null);
  const Heading: "h2" | "h3" | "h4" =
    headingLevel === 3 ? "h3" : headingLevel === 4 ? "h4" : "h2";

  useEffect(() => {
    setOpenId(null);
  }, [sectionKey]);

  function toggleSection(sectionId: string) {
    setOpenId((currentOpenId) =>
      currentOpenId === sectionId ? null : sectionId,
    );
  }

  return (
    <section
      aria-label={ariaLabel}
      className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
    >
      {sections.map((section) => {
        const expanded = openId === section.id;
        const buttonId = `${idPrefix}-summary-${section.id}`;
        const panelId = `${idPrefix}-panel-${section.id}`;
        const visual = accentToneClasses[section.accent];

        return (
          <div
            className={`border-b border-l-4 border-slate-200 last:border-b-0 ${visual.accent}`}
            key={section.id}
          >
            <Heading>
              <button
                aria-controls={panelId}
                aria-expanded={expanded}
                className="grid min-h-24 w-full min-w-0 gap-4 px-4 py-4 text-left transition-colors hover:bg-slate-50/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-600 md:grid-cols-[minmax(14rem,0.8fr)_minmax(0,1.4fr)_auto] md:items-center lg:px-5"
                id={buttonId}
                onClick={() => toggleSection(section.id)}
                type="button"
              >
                <span className="flex min-w-0 items-center gap-3">
                  <span
                    aria-hidden="true"
                    className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border ${visual.icon}`}
                  >
                    {section.icon}
                  </span>
                  <span className="min-w-0">
                    <span className="block font-bold text-slate-950">
                      {section.title}
                    </span>
                    <span className="mt-1 block break-words text-xs leading-5 text-slate-500">
                      {section.supportingText}
                    </span>
                  </span>
                </span>
                <span className="grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-3">
                  {section.snapshots.slice(0, 3).map((snapshot) => (
                    <span
                      className={`min-w-0 rounded-lg border px-3 py-2 ${snapshotToneClasses[snapshot.tone]}`}
                      key={`${snapshot.label}:${snapshot.value}`}
                    >
                      <span className="block truncate text-[0.65rem] font-bold uppercase tracking-wide opacity-70">
                        {snapshot.label}
                      </span>
                      <span
                        className="mt-0.5 block truncate text-sm font-bold"
                        title={snapshot.value}
                      >
                        {snapshot.value}
                      </span>
                    </span>
                  ))}
                </span>
                <span className="flex items-center justify-end gap-2 text-xs font-bold text-slate-500">
                  <span>{expanded ? "Close details" : "View details"}</span>
                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white shadow-sm">
                    <ChevronDown
                      aria-hidden="true"
                      className={`h-4 w-4 shrink-0 transition-transform motion-reduce:transition-none ${
                        expanded ? "rotate-180" : ""
                      }`}
                    />
                  </span>
                </span>
              </button>
            </Heading>
            <div
              aria-labelledby={buttonId}
              hidden={!expanded}
              id={panelId}
              role="region"
            >
              {expanded ? (
                <div className={`border-t border-slate-200 ${visual.expanded}`}>
                  {section.body}
                </div>
              ) : null}
            </div>
          </div>
        );
      })}
    </section>
  );
}
