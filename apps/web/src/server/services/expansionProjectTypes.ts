export const expansionProjectTypes = [
  "Branch Opening",
  "Branch Relocation",
  "Branch Renovation",
  "Branch Expansion",
  "Kitchen Upgrade",
  "Warehouse / Commissary Project",
  "Major Equipment Replacement",
  "Mall Compliance Project"
] as const;

export type ExpansionProjectType = (typeof expansionProjectTypes)[number];
