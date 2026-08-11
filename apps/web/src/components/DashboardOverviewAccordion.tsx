"use client";

import {
  BarChart3,
  Boxes,
  ClipboardCheck,
  TriangleAlert,
} from "lucide-react";
import {
  SingleOpenSummaryList,
  type SingleOpenSummarySection,
  type SingleOpenSummarySnapshot,
} from "@/components/SingleOpenSummaryList";

export type DashboardOverviewSnapshot = SingleOpenSummarySnapshot;

export type DashboardOverviewAccordionSection = Omit<
  SingleOpenSummarySection,
  "accent" | "icon"
>;

const sectionVisuals = {
  "assigned-approvals": {
    accent: "blue",
    icon: <ClipboardCheck className="h-5 w-5" />,
  },
  "operational-exceptions": {
    accent: "amber",
    icon: <TriangleAlert className="h-5 w-5" />,
  },
  "priority-indicators": {
    accent: "violet",
    icon: <BarChart3 className="h-5 w-5" />,
  },
  "stock-balance-signals": {
    accent: "emerald",
    icon: <Boxes className="h-5 w-5" />,
  },
} as const;

export function DashboardOverviewAccordion({
  sections,
}: {
  sections: DashboardOverviewAccordionSection[];
}) {
  const visualSections: SingleOpenSummarySection[] = sections.map((section) => {
    const visual =
      sectionVisuals[section.id as keyof typeof sectionVisuals] ??
      sectionVisuals["priority-indicators"];

    return {
      ...section,
      accent: visual.accent,
      icon: visual.icon,
    };
  });

  return (
    <SingleOpenSummaryList
      ariaLabel="Dashboard overview summaries"
      idPrefix="dashboard"
      sections={visualSections}
    />
  );
}
