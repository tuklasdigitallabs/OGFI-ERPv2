"use client";

import { useMemo, useState } from "react";
import {
  BarChart3,
  Bell,
  BookOpenText,
  Boxes,
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  ClipboardList,
  FileText,
  Gauge,
  HandCoins,
  KeyRound,
  LayoutDashboard,
  Landmark,
  Megaphone,
  PackageCheck,
  PackageSearch,
  ReceiptText,
  RotateCw,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Truck,
  UsersRound,
  Utensils,
  WalletCards,
  type LucideIcon,
} from "lucide-react";
import type { SessionContext } from "@/server/services/context";

export type ShellActiveNav =
  | "dashboard"
  | "my-tasks"
  | "purchase-requests"
  | "approvals"
  | "quotes"
  | "purchase-orders"
  | "receiving"
  | "inventory"
  | "inventory-ledger"
  | "transfers"
  | "counts"
  | "wastage"
  | "adjustments"
  | "reports"
  | "notifications"
  | "knowledge-base"
  | "projects"
  | "project-templates"
  | "my-work"
  | "work-boards"
  | "work-calendar"
  | "recipes"
  | "food-cost"
  | "branch-operations"
  | "food-safety"
  | "incidents"
  | "maintenance"
  | "marketing-calendar"
  | "campaigns"
  | "promotions"
  | "item-launches"
  | "creative-board"
  | "expansion-dashboard"
  | "opening-playbooks"
  | "site-pipeline"
  | "feasibility"
  | "capex-procurement"
  | "lifecycle-gates"
  | "permits"
  | "construction-board"
  | "opening-readiness"
  | "punch-list"
  | "post-opening"
  | "finance-overview"
  | "budget-control"
  | "expense-requests"
  | "cash-advances"
  | "petty-cash"
  | "general-ledger"
  | "accounts-payable"
  | "bank-cash"
  | "period-close"
  | "workforce"
  | "suppliers"
  | "items"
  | "admin-reason-codes"
  | "admin-settings"
  | "admin-readiness"
  | "admin-break-glass"
  | "admin-mfa"
  | "admin-session-invalidation"
  | "admin-authentication"
  | "admin-evidence-retention"
  | "admin";

export type NavSection = {
  id: string;
  label: string;
  icon: LucideIcon;
  items: Array<{
    label: string;
    href?: string;
    activeKey?: ShellActiveNav;
    badge?: string;
    icon: LucideIcon;
    disabled?: boolean;
  }>;
};

export type MobileOperationalNavItem = {
  label: string;
  href: string;
  tone: "primary" | "dark" | "slate" | "admin";
};

export function getNavigationSections(
  canAdminister: boolean,
  canManageQuotes: boolean,
  canUsePurchaseRequests: boolean,
  canUseApprovals: boolean,
  canViewPurchaseOrders: boolean,
  canUseReceiving: boolean,
  canUseTransfers: boolean,
  canUseCounts: boolean,
  canUseWastage: boolean,
  canUseStockAdjustments: boolean,
  canViewInventory: boolean,
  canViewInventoryLedger: boolean,
  canUseProjects = false,
  canUseProjectTemplates = false,
  canUseRecipesAndCosting = false,
  canUseBranchOperations = false,
  canUseFoodSafety = false,
  canUseIncidents = false,
  canUseMaintenance = false,
  canUseFinance = false,
  canUseWorkforce = false,
  canViewEvidenceRetention = false,
): NavSection[] {
  const procurementItems: NavSection["items"] = [
    canViewPurchaseOrders
      ? {
          label: "Purchase Orders",
          href: "/purchase-orders",
          activeKey: "purchase-orders",
          badge: "Draft",
          icon: ShoppingCart,
        }
      : {
          label: "Purchase Orders",
          badge: "PO",
          icon: ShoppingCart,
          disabled: true,
        },
    canUseReceiving
      ? {
          label: "Receiving",
          href: "/receiving",
          activeKey: "receiving",
          badge: "GRN",
          icon: PackageCheck,
        }
      : {
          label: "Receiving",
          badge: "GRN",
          icon: PackageCheck,
          disabled: true,
        },
  ];

  return [
    {
      id: "overview",
      label: "Overview",
      icon: LayoutDashboard,
      items: [
        {
          label: "Dashboard",
          href: "/dashboard",
          activeKey: "dashboard",
          badge: "Preview",
          icon: LayoutDashboard,
        },
        {
          label: "My Tasks",
          href: "/my-tasks",
          activeKey: "my-tasks",
          badge: "Queue",
          icon: ClipboardCheck,
        },
      ],
    },
    {
      id: "operations",
      label: "Operations",
      icon: Gauge,
      items: [
        ...(canUsePurchaseRequests
          ? [
              {
                label: "Purchase Requests",
                href: "/purchase-requests",
                activeKey: "purchase-requests" as const,
                badge: "PR",
                icon: FileText,
              },
            ]
          : []),
        ...(canUseApprovals
          ? [
              {
                label: "Approvals",
                href: "/approvals",
                activeKey: "approvals" as const,
                badge: "Live",
                icon: ClipboardCheck,
              },
            ]
          : []),
        ...(canManageQuotes
          ? [
              {
                label: "Supplier Quotes",
                href: "/quotes",
                activeKey: "quotes" as const,
                badge: "Quote",
                icon: ReceiptText,
              },
            ]
          : []),
        ...(canAdminister
          ? [
              {
                label: "Suppliers",
                href: "/suppliers",
                activeKey: "suppliers" as const,
                badge: "Master",
                icon: Truck,
              },
              {
                label: "Items",
                href: "/items",
                activeKey: "items" as const,
                badge: "Master",
                icon: PackageSearch,
              },
            ]
          : []),
      ],
    },
    ...(canAdminister || canViewPurchaseOrders || canUseReceiving
      ? [
          {
            id: "procurement",
            label: "Procurement",
            icon: ReceiptText,
            items: procurementItems,
          },
        ]
      : []),
    ...(canAdminister ||
    canViewInventory ||
    canViewInventoryLedger ||
    canUseTransfers ||
    canUseCounts ||
    canUseWastage ||
    canUseStockAdjustments
      ? [
          {
            id: "inventory",
            label: "Inventory",
            icon: Boxes,
            items: [
              canViewInventory
                ? {
                    label: "Stock Balances",
                    href: "/inventory",
                    activeKey: "inventory" as const,
                    badge: "Live",
                    icon: Boxes,
                  }
                : {
                    label: "Stock Balances",
                    badge: "Live",
                    icon: Boxes,
                    disabled: true,
                  },
              canUseTransfers
                ? {
                    label: "Transfers",
                    href: "/transfers",
                    activeKey: "transfers" as const,
                    badge: "Req",
                    icon: Truck,
                  }
                : {
                    label: "Transfers",
                    badge: "Move",
                    icon: Truck,
                    disabled: true,
                  },
              canViewInventoryLedger
                ? {
                    label: "Movement Ledger",
                    href: "/inventory/ledger",
                    activeKey: "inventory-ledger" as const,
                    badge: "Audit",
                    icon: ClipboardList,
                  }
                : {
                    label: "Movement Ledger",
                    badge: "Audit",
                    icon: ClipboardList,
                    disabled: true,
                  },
              canUseCounts
                ? {
                    label: "Stock Counts",
                    href: "/counts",
                    activeKey: "counts" as const,
                    badge: "Count",
                    icon: ClipboardCheck,
                  }
                : {
                    label: "Stock Counts",
                    badge: "Count",
                    icon: ClipboardCheck,
                    disabled: true,
                  },
              canUseWastage
                ? {
                    label: "Wastage",
                    href: "/wastage",
                    activeKey: "wastage" as const,
                    badge: "Loss",
                    icon: RotateCw,
                  }
                : {
                    label: "Wastage",
                    badge: "Loss",
                    icon: RotateCw,
                    disabled: true,
                  },
              canUseStockAdjustments
                ? {
                    label: "Adjustments",
                    href: "/adjustments",
                    activeKey: "adjustments" as const,
                    badge: "Adj",
                    icon: Boxes,
                  }
                : {
                    label: "Adjustments",
                    badge: "Adj",
                    icon: Boxes,
                    disabled: true,
                  },
            ],
          },
        ]
      : []),
    ...(canAdminister
      ? [
          {
            id: "insights",
            label: "Insights",
            icon: BarChart3,
            items: [
              {
                label: "Reports",
                href: "/reports",
                activeKey: "reports" as const,
                badge: "CSV",
                icon: BarChart3,
              },
              {
                label: "Notifications",
                href: "/notifications",
                activeKey: "notifications" as const,
                badge: "Alert",
                icon: Bell,
              },
            ],
          },
        ]
      : []),
    ...(canAdminister || canUseProjects || canUseProjectTemplates
      ? [
          {
            id: "phase-1-5",
            label: "Work Mgmt",
            icon: ClipboardList,
            items: [
              canUseProjects
                ? {
                    label: "Projects Tracker",
                    href: "/projects",
                    activeKey: "projects" as const,
                    badge: "Live",
                    icon: ClipboardList,
                  }
                : {
                    label: "Projects Tracker",
                    badge: "Preview",
                    icon: ClipboardList,
                    disabled: true,
                  },
              ...(canUseProjectTemplates
                ? [
                    {
                      label: "Project Templates",
                      href: "/project-templates",
                      activeKey: "project-templates" as const,
                      badge: "Draft",
                      icon: ClipboardList,
                    },
                  ]
                : []),
              ...(canUseProjects
                ? [
                    {
                      label: "My Work",
                      href: "/my-work",
                      activeKey: "my-work" as const,
                      badge: "Live",
                      icon: ClipboardCheck,
                    },
                    {
                      label: "Work Boards",
                      href: "/work-boards",
                      activeKey: "work-boards" as const,
                      badge: "Live",
                      icon: BriefcaseBusiness,
                    },
                  ]
                : []),
              ...(canUseProjects
                ? [
                    {
                      label: "Work Calendar",
                      href: "/work-calendar",
                      activeKey: "work-calendar" as const,
                      badge: "Live",
                      icon: CalendarDays,
                    },
                  ]
                : []),
            ],
          },
        ]
      : []),
    ...(canAdminister ||
    canUseRecipesAndCosting ||
    canUseBranchOperations ||
    canUseFoodSafety ||
    canUseIncidents ||
    canUseMaintenance
      ? [
          {
            id: "restaurant-ops",
            label: "Restaurant Ops",
            icon: Utensils,
            items: [
              canUseRecipesAndCosting || canAdminister
                ? {
                    label: "Recipes & Costing",
                    href: "/recipes",
                    activeKey: "recipes" as const,
                    badge: "Live",
                    icon: Utensils,
                  }
                : {
                    label: "Recipes & Costing",
                    badge: "Live",
                    icon: Utensils,
                    disabled: true,
                  },
              canUseBranchOperations || canAdminister
                ? {
                    label: "Branch Operations",
                    href: "/branch-operations",
                    activeKey: "branch-operations" as const,
                    badge: "Daily",
                    icon: ClipboardCheck,
                  }
                : {
                    label: "Branch Operations",
                    badge: "Daily",
                    icon: ClipboardCheck,
                    disabled: true,
                  },
              canUseFoodSafety || canAdminister
                ? {
                    label: "Food Safety",
                    href: "/food-safety",
                    activeKey: "food-safety" as const,
                    badge: "Compliance",
                    icon: ClipboardList,
                  }
                : {
                    label: "Food Safety",
                    badge: "Compliance",
                    icon: ClipboardList,
                    disabled: true,
                  },
              canUseIncidents || canAdminister
                ? {
                    label: "Incidents",
                    href: "/incidents",
                    activeKey: "incidents" as const,
                    badge: "Follow-up",
                    icon: ClipboardList,
                  }
                : {
                    label: "Incidents",
                    badge: "Follow-up",
                    icon: ClipboardList,
                    disabled: true,
                  },
              canUseMaintenance || canAdminister
                ? {
                    label: "Maintenance",
                    href: "/maintenance",
                    activeKey: "maintenance" as const,
                    badge: "SLA",
                    icon: Settings,
                  }
                : {
                    label: "Maintenance",
                    badge: "SLA",
                    icon: Settings,
                    disabled: true,
                  },
              ...(canUseRecipesAndCosting
                ? [
                    {
                      label: "Food Cost Analysis",
                      href: "/recipes/analysis",
                      activeKey: "food-cost" as const,
                      badge: "Source",
                      icon: BarChart3,
                    },
                  ]
                : []),
            ],
          },
        ]
      : []),
    ...(canUseWorkforce
      ? [
          {
            id: "workforce",
            label: "Workforce",
            icon: UsersRound,
            items: [
              {
                label: "Workforce Operations",
                href: "/workforce",
                activeKey: "workforce" as const,
                badge: "HR Ops",
                icon: UsersRound,
              },
            ],
          },
        ]
      : []),
    ...(canAdminister
      ? [
          {
            id: "marketing",
            label: "Marketing",
            icon: Megaphone,
            items: [
              {
                label: "Marketing Calendar",
                href: "/marketing/calendar",
                activeKey: "marketing-calendar" as const,
                badge: "Preview",
                icon: CalendarDays,
              },
              {
                label: "Campaigns",
                href: "/marketing/campaigns",
                activeKey: "campaigns" as const,
                badge: "Preview",
                icon: Megaphone,
              },
              {
                label: "Promotions",
                href: "/marketing/promotions",
                activeKey: "promotions" as const,
                badge: "Preview",
                icon: ReceiptText,
              },
              {
                label: "New Item Launches",
                href: "/marketing/item-launches",
                activeKey: "item-launches" as const,
                badge: "Preview",
                icon: PackageSearch,
              },
              {
                label: "Creative Board",
                href: "/marketing/creative-board",
                activeKey: "creative-board" as const,
                badge: "Preview",
                icon: ClipboardList,
              },
            ],
          },
          {
            id: "expansion",
            label: "Expansion",
            icon: Building2,
            items: [
              {
                label: "Expansion Dashboard",
                href: "/expansion",
                activeKey: "expansion-dashboard" as const,
                icon: LayoutDashboard,
              },
              {
                label: "Opening Playbooks",
                href: "/expansion/playbooks",
                activeKey: "opening-playbooks" as const,
                icon: BookOpenText,
              },
              {
                label: "Site Pipeline",
                href: "/expansion/sites",
                activeKey: "site-pipeline" as const,
                icon: Building2,
              },
              {
                label: "Feasibility",
                href: "/expansion/feasibility",
                activeKey: "feasibility" as const,
                icon: Gauge,
              },
              {
                label: "Capex & Procurement",
                href: "/expansion/capex-procurement",
                activeKey: "capex-procurement" as const,
                icon: ReceiptText,
              },
              {
                label: "Lifecycle Gates",
                href: "/expansion/gates",
                activeKey: "lifecycle-gates" as const,
                icon: ClipboardCheck,
              },
              {
                label: "Permits & Documents",
                href: "/expansion/permits",
                activeKey: "permits" as const,
                icon: FileText,
              },
              {
                label: "Construction Board",
                href: "/expansion/construction",
                activeKey: "construction-board" as const,
                icon: ClipboardList,
              },
              {
                label: "Opening Readiness",
                href: "/expansion/readiness",
                activeKey: "opening-readiness" as const,
                icon: PackageCheck,
              },
              {
                label: "Punch List",
                href: "/expansion/punch-list",
                activeKey: "punch-list" as const,
                icon: RotateCw,
              },
              {
                label: "Post-Opening Review",
                href: "/expansion/post-opening",
                activeKey: "post-opening" as const,
                icon: BarChart3,
              },
            ],
          },
          ...(canUseFinance
            ? [
                {
                  id: "finance",
                  label: "Finance",
                  icon: Landmark,
                  items: [
                    {
                      label: "Finance Control Center",
                      href: "/finance",
                      activeKey: "finance-overview" as const,
                      badge: "Guarded",
                      icon: BarChart3,
                    },
                    {
                      label: "Budget Control",
                      href: "/finance/budget-control",
                      activeKey: "budget-control" as const,
                      badge: "Budget",
                      icon: Gauge,
                    },
                    {
                      label: "Expense Requests",
                      href: "/finance/expense-requests",
                      activeKey: "expense-requests" as const,
                      badge: "Expense",
                      icon: FileText,
                    },
                    {
                      label: "Cash Advances",
                      href: "/finance/cash-advances",
                      activeKey: "cash-advances" as const,
                      badge: "Advance",
                      icon: HandCoins,
                    },
                    {
                      label: "Petty Cash",
                      href: "/finance/petty-cash",
                      activeKey: "petty-cash" as const,
                      badge: "Cash",
                      icon: WalletCards,
                    },
                    {
                      label: "General Ledger",
                      href: "/finance/general-ledger",
                      activeKey: "general-ledger" as const,
                      badge: "Gated",
                      icon: Landmark,
                    },
                    {
                      label: "Accounts Payable",
                      href: "/finance/accounts-payable",
                      activeKey: "accounts-payable" as const,
                      badge: "AP",
                      icon: ReceiptText,
                    },
                    {
                      label: "Bank & Cash",
                      href: "/finance/bank-cash",
                      activeKey: "bank-cash" as const,
                      badge: "Gated",
                      icon: BriefcaseBusiness,
                    },
                    {
                      label: "Period Close",
                      href: "/finance/period-close",
                      activeKey: "period-close" as const,
                      badge: "Gated",
                      icon: CalendarDays,
                    },
                  ],
                },
              ]
            : []),
          {
            id: "admin",
            label: "Admin",
            icon: Settings,
            items: [
              {
                label: "Core Administration",
                href: "/admin",
                activeKey: "admin" as const,
                badge: "Core",
                icon: Settings,
              },
              {
                label: "Reason Codes",
                href: "/admin/reason-codes",
                activeKey: "admin-reason-codes" as const,
                badge: "Config",
                icon: ClipboardList,
              },
              {
                label: "Admin Settings",
                href: "/admin/settings",
                activeKey: "admin-settings" as const,
                badge: "Config",
                icon: Settings,
              },
              {
                label: "Release Readiness",
                href: "/admin/readiness",
                activeKey: "admin-readiness" as const,
                badge: "Gate",
                icon: ClipboardCheck,
              },
              {
                label: "Authentication",
                href: "/admin/authentication",
                activeKey: "admin-authentication" as const,
                badge: "Security",
                icon: KeyRound,
              },
              {
                label: "Break-Glass Access",
                href: "/admin/break-glass",
                activeKey: "admin-break-glass" as const,
                badge: "Security",
                icon: KeyRound,
              },
              {
                label: "MFA Enrollment",
                href: "/admin/mfa",
                activeKey: "admin-mfa" as const,
                badge: "Evidence",
                icon: ShieldCheck,
              },
              {
                label: "Session Invalidation",
                href: "/admin/session-invalidation",
                activeKey: "admin-session-invalidation" as const,
                badge: "Provider",
                icon: RotateCw,
              },
              ...(canViewEvidenceRetention
                ? [
                    {
                      label: "Evidence Retention",
                      href: "/admin/evidence-retention",
                      activeKey: "admin-evidence-retention" as const,
                      badge: "Confidential",
                      icon: ShieldCheck,
                    },
                  ]
                : []),
            ],
          },
        ]
      : []),
    ...(!canAdminister && canViewEvidenceRetention
      ? [
          {
            id: "admin",
            label: "Admin",
            icon: Settings,
            items: [
              {
                label: "Evidence Retention",
                href: "/admin/evidence-retention",
                activeKey: "admin-evidence-retention" as const,
                badge: "Confidential",
                icon: ShieldCheck,
              },
            ],
          },
        ]
      : []),
    {
      id: "help",
      label: "Help",
      icon: BookOpenText,
      items: [
        {
          label: "Knowledge Base",
          href: "/knowledge-base",
          activeKey: "knowledge-base",
          badge: "KB",
          icon: BookOpenText,
        },
      ],
    },
  ];
}

export function getMobilePreviewRailItems(sections: NavSection[]) {
  return sections
    .filter(
      (section) =>
        section.id !== "operations" &&
        section.id !== "overview" &&
        section.id !== "admin",
    )
    .flatMap((section) =>
      section.items.filter((item) => item.href && !item.disabled),
    );
}

export function getMobileOperationalNavItems({
  canAdminister,
  canManageQuotes,
  canUsePurchaseRequests,
  canUseApprovals,
  canViewPurchaseOrders,
  canUseReceiving,
  canUseTransfers,
  canUseCounts,
  canUseWastage,
  canUseStockAdjustments,
  canViewInventory,
  canViewInventoryLedger,
  canViewEvidenceRetention = false,
}: {
  canAdminister: boolean;
  canManageQuotes: boolean;
  canUsePurchaseRequests: boolean;
  canUseApprovals: boolean;
  canViewPurchaseOrders: boolean;
  canUseReceiving: boolean;
  canUseTransfers: boolean;
  canUseCounts: boolean;
  canUseWastage: boolean;
  canUseStockAdjustments: boolean;
  canViewInventory: boolean;
  canViewInventoryLedger: boolean;
  canViewEvidenceRetention?: boolean;
}): MobileOperationalNavItem[] {
  return [
    ...(canUsePurchaseRequests
      ? [
          {
            label: "Requests",
            href: "/purchase-requests",
            tone: "primary" as const,
          },
        ]
      : []),
    ...(canUseApprovals
      ? [{ label: "Approvals", href: "/approvals", tone: "dark" as const }]
      : []),
    ...(canManageQuotes
      ? [{ label: "Quotes", href: "/quotes", tone: "slate" as const }]
      : []),
    ...(canViewPurchaseOrders
      ? [{ label: "Orders", href: "/purchase-orders", tone: "slate" as const }]
      : []),
    ...(canUseReceiving
      ? [{ label: "Receiving", href: "/receiving", tone: "slate" as const }]
      : []),
    ...(canViewInventory
      ? [{ label: "Stock", href: "/inventory", tone: "slate" as const }]
      : []),
    ...(canViewInventoryLedger
      ? [{ label: "Ledger", href: "/inventory/ledger", tone: "slate" as const }]
      : []),
    ...(canUseTransfers
      ? [{ label: "Transfers", href: "/transfers", tone: "slate" as const }]
      : []),
    ...(canUseCounts
      ? [{ label: "Counts", href: "/counts", tone: "slate" as const }]
      : []),
    ...(canUseWastage
      ? [{ label: "Wastage", href: "/wastage", tone: "slate" as const }]
      : []),
    ...(canUseStockAdjustments
      ? [{ label: "Adjustments", href: "/adjustments", tone: "slate" as const }]
      : []),
    ...(canAdminister
      ? [
          { label: "Suppliers", href: "/suppliers", tone: "slate" as const },
          { label: "Items", href: "/items", tone: "slate" as const },
          { label: "Admin", href: "/admin", tone: "admin" as const },
        ]
      : []),
    ...(!canAdminister && canViewEvidenceRetention
      ? [
          {
            label: "Evidence",
            href: "/admin/evidence-retention",
            tone: "admin" as const,
          },
        ]
      : []),
  ];
}

function mobileNavItemClass(
  tone: MobileOperationalNavItem["tone"],
  active = false,
) {
  if (tone === "primary") {
    return `block rounded-[var(--radius-control)] px-3 py-2.5 text-center text-xs font-semibold shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 min-h-11 ${
      active
        ? "bg-blue-800 text-white ring-2 ring-blue-200"
        : "bg-[var(--color-action-primary)] text-white hover:bg-[var(--color-action-primary-hover)]"
    }`;
  }
  if (tone === "admin") {
    return `block rounded-[var(--radius-control)] px-3 py-2.5 text-center text-xs font-semibold shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 min-h-11 ${
      active
        ? "bg-slate-950 text-white ring-2 ring-slate-300"
        : "bg-slate-900 text-white hover:bg-slate-950"
    }`;
  }
  if (tone === "dark") {
    return `block rounded-[var(--radius-control)] px-3 py-2.5 text-center text-xs font-semibold shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 min-h-11 ${
      active
        ? "bg-slate-950 text-white ring-2 ring-slate-300"
        : "bg-slate-800 text-white hover:bg-slate-700"
    }`;
  }
  return `block rounded-[var(--radius-control)] border px-3 py-2.5 text-center text-xs font-semibold shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 min-h-11 ${
    active
      ? "border-blue-200 bg-blue-50 text-blue-800 ring-1 ring-blue-100"
      : "border-slate-200 bg-white text-slate-700 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
  }`;
}

function getDefaultSection(activeNav: ShellActiveNav) {
  if (activeNav === "dashboard" || activeNav === "my-tasks") {
    return "overview";
  }
  if (activeNav === "admin") {
    return "admin";
  }
  if (
    activeNav === "admin-settings" ||
    activeNav === "admin-readiness" ||
    activeNav === "admin-break-glass" ||
    activeNav === "admin-mfa" ||
    activeNav === "admin-session-invalidation" ||
    activeNav === "admin-authentication" ||
    activeNav === "admin-evidence-retention" ||
    activeNav === "admin-reason-codes"
  ) {
    return "admin";
  }
  if (activeNav === "knowledge-base") {
    return "help";
  }
  if (activeNav === "reports" || activeNav === "notifications") {
    return "insights";
  }
  if (
    activeNav === "projects" ||
    activeNav === "project-templates" ||
    activeNav === "my-work" ||
    activeNav === "work-boards" ||
    activeNav === "work-calendar"
  ) {
    return "phase-1-5";
  }
  if (
    activeNav === "recipes" ||
    activeNav === "food-cost" ||
    activeNav === "branch-operations" ||
    activeNav === "food-safety" ||
    activeNav === "incidents" ||
    activeNav === "maintenance"
  ) {
    return "restaurant-ops";
  }
  if (
    activeNav === "marketing-calendar" ||
    activeNav === "campaigns" ||
    activeNav === "promotions" ||
    activeNav === "item-launches" ||
    activeNav === "creative-board"
  ) {
    return "marketing";
  }
  if (
    activeNav === "expansion-dashboard" ||
    activeNav === "opening-playbooks" ||
    activeNav === "site-pipeline" ||
    activeNav === "feasibility" ||
    activeNav === "capex-procurement" ||
    activeNav === "lifecycle-gates" ||
    activeNav === "permits" ||
    activeNav === "construction-board" ||
    activeNav === "opening-readiness" ||
    activeNav === "punch-list" ||
    activeNav === "post-opening"
  ) {
    return "expansion";
  }
  if (
    activeNav === "finance-overview" ||
    activeNav === "budget-control" ||
    activeNav === "expense-requests" ||
    activeNav === "cash-advances" ||
    activeNav === "petty-cash" ||
    activeNav === "general-ledger" ||
    activeNav === "accounts-payable" ||
    activeNav === "bank-cash" ||
    activeNav === "period-close"
  ) {
    return "finance";
  }
  if (activeNav === "workforce") {
    return "workforce";
  }
  if (activeNav === "purchase-orders") {
    return "procurement";
  }
  if (activeNav === "receiving") {
    return "procurement";
  }
  if (
    activeNav === "inventory" ||
    activeNav === "inventory-ledger" ||
    activeNav === "transfers" ||
    activeNav === "counts" ||
    activeNav === "wastage" ||
    activeNav === "adjustments"
  ) {
    return "inventory";
  }
  return "operations";
}

function NavIcon({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <Icon aria-hidden="true" className="h-4 w-4 shrink-0" strokeWidth={2} />
  );
}

function NavItem({
  item,
  activeNav,
  collapsed,
}: {
  item: NavSection["items"][number];
  activeNav: ShellActiveNav;
  collapsed: boolean;
}) {
  const active = item.activeKey === activeNav;
  const baseClass = active
    ? "shell-nav-item flex min-h-9 items-center justify-between gap-2 rounded-[var(--radius-control)] border border-blue-100 bg-blue-50 px-3 py-2 font-semibold text-blue-700 shadow-sm"
    : item.disabled
      ? "shell-nav-item flex min-h-9 cursor-not-allowed items-center justify-between gap-2 rounded-[var(--radius-control)] px-3 py-2 font-medium text-slate-400"
      : "shell-nav-item flex min-h-9 items-center justify-between gap-2 rounded-[var(--radius-control)] px-3 py-2 font-medium text-slate-600 transition-colors hover:bg-white hover:text-slate-950 hover:shadow-sm";

  const content = (
    <>
      <span className="flex min-w-0 items-center gap-2">
        <NavIcon icon={item.icon} />
        {!collapsed ? <span className="truncate">{item.label}</span> : null}
      </span>
    </>
  );
  const title = item.badge ? `${item.label} (${item.badge})` : item.label;

  if (item.disabled || !item.href) {
    return (
      <span aria-disabled="true" className={baseClass} title={title}>
        {content}
      </span>
    );
  }

  return (
    <a
      aria-current={active ? "page" : undefined}
      aria-label={item.label}
      className={baseClass}
      href={item.href}
      title={title}
    >
      {content}
    </a>
  );
}

export function ShellNavigation({
  session,
  activeNav,
  canAdminister,
  canManageQuotes,
  canUsePurchaseRequests,
  canUseApprovals,
  canViewPurchaseOrders,
  canUseReceiving,
  canUseTransfers,
  canUseCounts,
  canUseWastage,
  canUseStockAdjustments,
  canViewInventory,
  canViewInventoryLedger,
  canUseProjects,
  canUseProjectTemplates,
  canUseRecipesAndCosting,
  canUseBranchOperations,
  canUseFoodSafety,
  canUseIncidents,
  canUseMaintenance,
  canUseFinance,
  canUseWorkforce,
  canViewEvidenceRetention,
  children,
}: {
  session: SessionContext;
  activeNav: ShellActiveNav;
  canAdminister: boolean;
  canManageQuotes: boolean;
  canUsePurchaseRequests: boolean;
  canUseApprovals: boolean;
  canViewPurchaseOrders: boolean;
  canUseReceiving: boolean;
  canUseTransfers: boolean;
  canUseCounts: boolean;
  canUseWastage: boolean;
  canUseStockAdjustments: boolean;
  canViewInventory: boolean;
  canViewInventoryLedger: boolean;
  canUseProjects: boolean;
  canUseProjectTemplates: boolean;
  canUseRecipesAndCosting: boolean;
  canUseBranchOperations: boolean;
  canUseFoodSafety: boolean;
  canUseIncidents: boolean;
  canUseMaintenance: boolean;
  canUseFinance: boolean;
  canUseWorkforce: boolean;
  canViewEvidenceRetention: boolean;
  children: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false);
  const [openSection, setOpenSection] = useState<string | null>(
    getDefaultSection(activeNav),
  );
  const activeSection = getDefaultSection(activeNav);
  const sections = useMemo(
    () =>
      getNavigationSections(
        canAdminister,
        canManageQuotes,
        canUsePurchaseRequests,
        canUseApprovals,
        canViewPurchaseOrders,
        canUseReceiving,
        canUseTransfers,
        canUseCounts,
        canUseWastage,
        canUseStockAdjustments,
        canViewInventory,
        canViewInventoryLedger,
        canUseProjects,
        canUseProjectTemplates,
        canUseRecipesAndCosting,
        canUseBranchOperations,
        canUseFoodSafety,
        canUseIncidents,
        canUseMaintenance,
        canUseFinance,
        canUseWorkforce,
        canViewEvidenceRetention,
      ),
    [
      canAdminister,
      canManageQuotes,
      canUsePurchaseRequests,
      canUseApprovals,
      canViewPurchaseOrders,
      canUseReceiving,
      canUseTransfers,
      canUseCounts,
      canUseWastage,
      canUseStockAdjustments,
      canViewInventory,
      canViewInventoryLedger,
      canUseProjects,
      canUseProjectTemplates,
      canUseRecipesAndCosting,
      canUseBranchOperations,
      canUseFoodSafety,
      canUseIncidents,
      canUseMaintenance,
      canUseFinance,
      canUseWorkforce,
      canViewEvidenceRetention,
    ],
  );
  const mobileOperationalItems = getMobileOperationalNavItems({
    canAdminister,
    canManageQuotes,
    canUsePurchaseRequests,
    canUseApprovals,
    canViewPurchaseOrders,
    canUseReceiving,
    canUseTransfers,
    canUseCounts,
    canUseWastage,
    canUseStockAdjustments,
    canViewInventory,
    canViewInventoryLedger,
    canViewEvidenceRetention,
  });
  const mobileNavigationItems = sections.flatMap((section) =>
    section.items.filter(
      (item): item is NavSection["items"][number] & { href: string } =>
        Boolean(item.href) && !item.disabled,
    ),
  );
  const mobilePrimaryItem =
    mobileOperationalItems.find((item) => item.tone === "dark") ??
    mobileOperationalItems[0] ??
    null;
  const activeMobileHref = mobileNavigationItems.find(
    (item) => item.activeKey === activeNav,
  )?.href;
  const isMobileMoreActive =
    activeNav !== "dashboard" &&
    activeNav !== "notifications" &&
    Boolean(activeMobileHref) &&
    activeMobileHref !== mobilePrimaryItem?.href;

  function selectSection(sectionId: string) {
    if (collapsed) {
      setOpenSection(sectionId);
      setCollapsed(false);
      return;
    }
    setOpenSection((currentSection) =>
      currentSection === sectionId ? null : sectionId,
    );
  }

  return (
    <div className="ogfi-shell min-h-screen bg-[var(--color-bg-canvas)]">
      <aside
        className={`ogfi-sidebar fixed inset-y-0 left-0 hidden border-r border-slate-200/80 bg-white/90 shadow-[1px_0_0_rgba(16,24,40,0.04)] backdrop-blur-xl transition-[width] duration-200 lg:flex lg:flex-col ${
          collapsed ? "w-[4.5rem]" : "w-[16.5rem]"
        }`}
      >
        <div
          className={`ogfi-sidebar-brand flex h-[5.75rem] border-b border-slate-200/80 bg-white/80 ${
            collapsed
              ? "flex-col items-center justify-center gap-2 px-0"
              : "items-center gap-3 px-4"
          }`}
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-control)] bg-slate-950 text-sm font-bold text-white shadow-sm ring-4 ring-blue-50">
            OG
          </div>
          {!collapsed ? (
            <div className="min-w-0">
              <div className="text-base font-bold leading-5 text-slate-950">
                OGFI ERP
              </div>
              <div className="text-xs font-medium text-slate-500">
                Restaurant operations
              </div>
            </div>
          ) : null}
          <button
            aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
            className={`flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-[var(--radius-control)] border border-slate-200 bg-white text-slate-600 shadow-sm hover:bg-slate-50 ${
              collapsed ? "" : "ml-auto"
            }`}
            onClick={() => setCollapsed((value) => !value)}
            title={collapsed ? "Expand navigation" : "Collapse navigation"}
            type="button"
          >
            {collapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <ChevronLeft className="h-4 w-4" />
            )}
          </button>
        </div>

        <nav className="ogfi-sidebar-nav flex-1 overflow-y-auto px-3 py-4 text-sm">
          {sections.map((section) => {
            const SectionIcon = section.icon;
            const open = !collapsed && section.id === openSection;
            const sectionHighlighted =
              section.id === activeSection || section.id === openSection;

            return (
              <div key={section.id} className="mb-2">
                <button
                  className={`shell-nav-section flex min-h-10 w-full items-center gap-2 rounded-[var(--radius-control)] px-3 py-2 text-left text-xs font-bold transition-colors ${
                    collapsed ? "justify-center" : "justify-between"
                  } ${sectionHighlighted ? "is-active" : ""}`}
                  onClick={() => selectSection(section.id)}
                  aria-expanded={!collapsed && open}
                  aria-controls={`${section.id}-links`}
                  title={section.label}
                  type="button"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <SectionIcon
                      aria-hidden="true"
                      className="shell-nav-section-icon h-4 w-4 shrink-0"
                      strokeWidth={2}
                    />
                    {!collapsed ? (
                      <span className="truncate">{section.label}</span>
                    ) : null}
                  </span>
                  {!collapsed ? (
                    <ChevronDown
                      aria-hidden="true"
                      className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`}
                    />
                  ) : null}
                </button>
                {open ? (
                  <div
                    id={`${section.id}-links`}
                    className="shell-nav-subitems ml-4 mt-1 grid gap-1 border-l border-slate-200/80 pl-2"
                  >
                    {section.items.map((item) => (
                      <NavItem
                        key={item.label}
                        item={item}
                        activeNav={activeNav}
                        collapsed={collapsed}
                      />
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}
        </nav>

        <div className="ogfi-sidebar-user border-t border-slate-200/80 bg-white/80 p-3">
          <div className="flex items-center gap-3 rounded-[var(--radius-control)] border border-slate-200/80 bg-slate-50/80 p-2">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-bold text-white shadow-sm ring-2 ring-white">
              {session.user.displayName
                .split(" ")
                .map((part) => part[0])
                .join("")
                .slice(0, 2)}
            </div>
            {!collapsed ? (
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-slate-950">
                  {session.user.displayName}
                </div>
                <div className="truncate text-xs text-slate-500">
                  {session.user.role}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </aside>

      <div
        className={`shell-main-transition ${collapsed ? "lg:pl-[4.5rem]" : "lg:pl-[16.5rem]"}`}
      >
        {children}
      </div>

      {mobileNavigationOpen ? (
        <div className="fixed inset-x-0 bottom-[4.75rem] z-30 border-t border-slate-200 bg-white p-4 shadow-[0_-18px_48px_-26px_rgba(15,23,42,0.48)] lg:hidden">
          <div className="mx-auto flex max-h-[min(60vh,32rem)] max-w-lg flex-col">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-bold text-slate-950">All workspaces</p>
                <p className="text-xs text-slate-500">Only workspaces available to your current role are shown.</p>
              </div>
              <button
                aria-label="Close workspace navigation"
                className="min-h-10 rounded-[var(--radius-control)] border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                onClick={() => setMobileNavigationOpen(false)}
                type="button"
              >
                Close
              </button>
            </div>
            <div className="grid gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
              {mobileNavigationItems.map((item) => (
                <a
                  key={item.href}
                  aria-current={item.activeKey === activeNav ? "page" : undefined}
                  className={`flex min-h-11 items-center rounded-[var(--radius-control)] border px-3 py-2 text-sm font-semibold transition-colors ${
                    item.activeKey === activeNav
                      ? "border-blue-200 bg-blue-50 text-blue-800"
                      : "border-slate-200 bg-white text-slate-700 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
                  }`}
                  href={item.href}
                  onClick={() => setMobileNavigationOpen(false)}
                >
                  {item.label}
                </a>
              ))}
            </div>
          </div>
        </div>
      ) : null}
      <div className="fixed bottom-0 left-0 right-0 z-20 border-t border-[var(--color-border-default)] bg-white/95 px-3 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] pt-2 shadow-[0_-14px_32px_-24px_rgba(15,23,42,0.45)] backdrop-blur-xl lg:hidden">
        <div className="grid grid-cols-4 gap-2 px-1">
          <a
            aria-current={activeNav === "dashboard" ? "page" : undefined}
            className={mobileNavItemClass("primary", activeNav === "dashboard")}
            href="/dashboard"
          >
            Overview
          </a>
          {mobilePrimaryItem ? (
            <a
              aria-current={activeMobileHref === mobilePrimaryItem.href ? "page" : undefined}
              className={mobileNavItemClass(
                mobilePrimaryItem.tone,
                activeMobileHref === mobilePrimaryItem.href,
              )}
              href={mobilePrimaryItem.href}
            >
              {mobilePrimaryItem.label}
            </a>
          ) : (
            <a
              className={mobileNavItemClass("slate")}
              href="/notifications"
            >
              Alerts
            </a>
          )}
          <a
            aria-current={activeNav === "notifications" ? "page" : undefined}
            className={mobileNavItemClass("slate", activeNav === "notifications")}
            href="/notifications"
          >
            Alerts
          </a>
          <button
            aria-expanded={mobileNavigationOpen}
            aria-label="Open all workspaces"
            className={mobileNavItemClass("slate", isMobileMoreActive)}
            onClick={() => setMobileNavigationOpen((open) => !open)}
            type="button"
          >
            More
          </button>
        </div>
      </div>
    </div>
  );
}
