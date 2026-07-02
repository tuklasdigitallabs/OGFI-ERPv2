import type {
  ModulePreviewConfig,
  PreviewBoardLane
} from "@/components/ModulePreviewPage";

const operationsRows = [
  {
    title: "Makati branch inventory control",
    detail: "Low-stock items, pending receipts, and transfer follow-ups",
    status: "Pending Review",
    owner: "Operations",
    date: "Today"
  },
  {
    title: "Main warehouse dispatch queue",
    detail: "Approved transfers awaiting release confirmation",
    status: "Ready",
    owner: "Warehouse",
    date: "This week"
  },
  {
    title: "Supplier delivery exceptions",
    detail: "Short, damaged, and rejected quantities for review",
    status: "Risk",
    owner: "Receiving",
    date: "Rolling 7 days"
  }
];

const dashboardControlItems = [
  {
    title: "Approval Aging",
    value: "12",
    detail: "PR, PO, wastage, and closure approvals awaiting action.",
    status: "Review"
  },
  {
    title: "Delivery Risk",
    value: "7",
    detail: "Expected deliveries due or overdue by supplier and branch.",
    status: "Pending"
  },
  {
    title: "Stock Exceptions",
    value: "15",
    detail: "Critical stock and transfer-first replenishment opportunities.",
    status: "Risk"
  },
  {
    title: "Inventory Tasks",
    value: "23",
    detail: "Counts due, wastage review, transfer receipt, and ledger follow-ups.",
    status: "Open"
  }
];

const reportCatalog = [
  {
    title: "Open PO and Delivery Aging",
    detail: "Issued, partially received, overdue, and closed-balance purchase orders.",
    cadence: "Daily",
    format: "CSV",
    owner: "Purchasing"
  },
  {
    title: "Receiving Discrepancy Report",
    detail: "Short, damaged, rejected, and outstanding quantities by supplier and PO.",
    cadence: "Daily",
    format: "CSV",
    owner: "Receiving"
  },
  {
    title: "Inventory Movement Ledger",
    detail: "Source-linked receipt, transfer, wastage, adjustment, and reversal activity.",
    cadence: "Live",
    format: "CSV",
    owner: "Warehouse"
  },
  {
    title: "Wastage Policy Flags",
    detail: "High-value, evidence-required, and repeat-loss review context.",
    cadence: "Weekly",
    format: "CSV",
    owner: "Operations"
  },
  {
    title: "Approval Turnaround",
    detail: "Pending, approved, returned, and rejected decisions by route and user.",
    cadence: "Weekly",
    format: "XLSX",
    owner: "Admin"
  },
  {
    title: "Stock Count Variance",
    detail: "Count session status, variance summaries, and review readiness.",
    cadence: "Cycle",
    format: "PDF",
    owner: "Inventory"
  }
];

const notificationAlerts = [
  {
    title: "PO delivery overdue",
    detail: "PO-2026-00418 expected yesterday and has no receiving draft yet.",
    priority: "High",
    channel: "In-app + email digest",
    owner: "Purchasing"
  },
  {
    title: "High-value wastage evidence required",
    detail: "WR-2026-00023 matched the configured evidence threshold and needs review.",
    priority: "Review",
    channel: "In-app",
    owner: "Operations"
  },
  {
    title: "Transfer receipt pending",
    detail: "Main warehouse dispatch is awaiting branch receiving confirmation.",
    priority: "Pending",
    channel: "In-app",
    owner: "Branch Manager"
  },
  {
    title: "Stock count due today",
    detail: "Critical category count is scheduled for the current location.",
    priority: "Due",
    channel: "In-app",
    owner: "Storekeeper"
  }
];

const workRows = [
  {
    title: "Branch opening checklist",
    detail: "IT, procurement, training, and punch-list coordination",
    status: "In Review",
    owner: "Project Lead",
    date: "Week 3"
  },
  {
    title: "Supplier onboarding sprint",
    detail: "Requirements, contracts, item mapping, and first PO readiness",
    status: "Pending",
    owner: "Purchasing",
    date: "Next 10 days"
  },
  {
    title: "Kitchen equipment maintenance",
    detail: "Tasks linked to branch operations and evidence attachments",
    status: "Blocked",
    owner: "Facilities",
    date: "Needs vendor date"
  }
];

const workBoardLanes: PreviewBoardLane[] = [
  {
    title: "Backlog",
    cards: [
      {
        title: "Supplier onboarding checklist",
        detail: "Collect requirements, assign approver, and link supplier record.",
        owner: "Purchasing",
        meta: "PRD",
        tone: "info"
      },
      {
        title: "Training rollout pack",
        detail: "Prepare branch job aids and attendance checklist.",
        owner: "Dunong",
        meta: "Due"
      }
    ]
  },
  {
    title: "In Progress",
    cards: [
      {
        title: "Makati receiving cleanup",
        detail: "Review discrepancy history and close open follow-ups.",
        owner: "Operations",
        meta: "Live",
        tone: "warning"
      },
      {
        title: "Inventory count dry run",
        detail: "Validate mobile count steps with storekeeper users.",
        owner: "Warehouse",
        meta: "UAT",
        tone: "info"
      }
    ]
  },
  {
    title: "Blocked",
    cards: [
      {
        title: "Kitchen equipment repair",
        detail: "Waiting for vendor schedule and photo evidence.",
        owner: "Facilities",
        meta: "Block",
        tone: "warning"
      }
    ]
  },
  {
    title: "Done",
    cards: [
      {
        title: "PO approval walkthrough",
        detail: "Manager review flow validated with sample users.",
        owner: "Project Lead",
        meta: "Done",
        tone: "success"
      },
      {
        title: "Wastage policy preview",
        detail: "Evidence and repeat-loss flags available for demo.",
        owner: "Operations",
        meta: "Done",
        tone: "success"
      }
    ]
  }
];

const myWorkBoardLanes: PreviewBoardLane[] = [
  {
    title: "Today",
    cards: [
      {
        title: "Approve Makati PR",
        detail: "Review branch replenishment request before warehouse check cutoff.",
        owner: "Current user",
        meta: "Due",
        tone: "warning"
      },
      {
        title: "Confirm transfer receipt",
        detail: "Acknowledge dispatch from Main Warehouse with accepted quantities.",
        owner: "Current user",
        meta: "Stock",
        tone: "info"
      }
    ]
  },
  {
    title: "Waiting",
    cards: [
      {
        title: "Supplier onboarding documents",
        detail: "Purchasing is waiting for contract and master-data review.",
        owner: "Purchasing",
        meta: "Docs",
        tone: "info"
      }
    ]
  },
  {
    title: "Blocked",
    cards: [
      {
        title: "Equipment repair follow-up",
        detail: "Vendor visit date is missing; blocker reason is required.",
        owner: "Facilities",
        meta: "Block",
        tone: "warning"
      }
    ]
  },
  {
    title: "Done",
    cards: [
      {
        title: "Receiving discrepancy note",
        detail: "Short delivery follow-up captured with source PO context.",
        owner: "Current user",
        meta: "Done",
        tone: "success"
      }
    ]
  }
];

const workCalendarItems = [
  {
    day: "Mon",
    date: "01",
    title: "Supplier onboarding kickoff",
    detail: "Purchasing, master data, and approval owner alignment.",
    tone: "info" as const
  },
  {
    day: "Tue",
    date: "02",
    title: "Branch count dry run",
    detail: "Storekeeper UAT with stock count checklist.",
    tone: "warning" as const
  },
  {
    day: "Wed",
    date: "03",
    title: "Training pack review",
    detail: "How-to cards for receiving, transfers, and wastage.",
    tone: "info" as const
  },
  {
    day: "Thu",
    date: "04",
    title: "Implementation checkpoint",
    detail: "Risks, blockers, and open branch readiness items.",
    tone: "warning" as const
  },
  {
    day: "Fri",
    date: "05",
    title: "Pilot sign-off",
    detail: "Operations review with evidence and next actions.",
    tone: "success" as const
  },
  {
    day: "Sat",
    date: "06",
    title: "Maintenance follow-up",
    detail: "Equipment repair check and vendor confirmation.",
    tone: "neutral" as const
  },
  {
    day: "Sun",
    date: "07",
    title: "No rollout tasks",
    detail: "Reserved for escalation or emergency support.",
    tone: "neutral" as const
  }
];

const marketingRows = [
  {
    title: "Summer beverage campaign",
    detail: "Creative, branch kits, promo mechanics, and launch readiness",
    status: "Draft",
    owner: "Marketing",
    date: "July"
  },
  {
    title: "New item launch board",
    detail: "Photos, item master readiness, training notes, and branch rollout",
    status: "Pending Review",
    owner: "Product",
    date: "Aug 5"
  },
  {
    title: "Local store marketing calendar",
    detail: "Events by branch with procurement and staffing dependencies",
    status: "Live",
    owner: "Area Manager",
    date: "Monthly"
  }
];

const marketingCalendarItems = [
  {
    day: "Mon",
    date: "08",
    title: "Campaign brief lock",
    detail: "Finalize scope, branch list, and promo objective.",
    tone: "info" as const
  },
  {
    day: "Tue",
    date: "09",
    title: "Creative asset review",
    detail: "Approve posters, social tiles, and branch kit copy.",
    tone: "warning" as const
  },
  {
    day: "Wed",
    date: "10",
    title: "New item photo shoot",
    detail: "Capture hero and menu-board assets for launch.",
    tone: "info" as const
  },
  {
    day: "Thu",
    date: "11",
    title: "Branch kit release",
    detail: "Send print files, talking points, and activation notes.",
    tone: "success" as const
  },
  {
    day: "Fri",
    date: "12",
    title: "Stock readiness check",
    detail: "Confirm supplier availability and launch quantities.",
    tone: "warning" as const
  },
  {
    day: "Sat",
    date: "13",
    title: "Local store activation",
    detail: "Branch event support and photo evidence checklist.",
    tone: "success" as const
  },
  {
    day: "Sun",
    date: "14",
    title: "Campaign pulse report",
    detail: "Gather branch notes and exception follow-ups.",
    tone: "neutral" as const
  }
];

const marketingReadinessItems = [
  {
    title: "Branch Scope",
    status: "Ready",
    detail: "24 participating locations grouped by brand and area.",
    owner: "Area Managers"
  },
  {
    title: "Creative Assets",
    status: "Review",
    detail: "Window poster, counter card, and social tiles awaiting final check.",
    owner: "Marketing"
  },
  {
    title: "Stock Check",
    status: "Pending",
    detail: "Launch quantities and supplier availability need confirmation.",
    owner: "Purchasing"
  },
  {
    title: "Training Notes",
    status: "Ready",
    detail: "Branch talking points and operating reminders drafted.",
    owner: "Operations"
  },
  {
    title: "Launch Approval",
    status: "Review",
    detail: "Final go/no-go after stock and creative checks are complete.",
    owner: "Management"
  }
];

const creativeBoardLanes: PreviewBoardLane[] = [
  {
    title: "Requested",
    cards: [
      {
        title: "Beverage poster set",
        detail: "Branch-ready artwork for counter and window placements.",
        owner: "Marketing",
        meta: "Brief",
        tone: "info"
      },
      {
        title: "New item photo shoot",
        detail: "Shot list, item availability, and brand review notes.",
        owner: "Product",
        meta: "Plan"
      }
    ]
  },
  {
    title: "Designing",
    cards: [
      {
        title: "Promo social tiles",
        detail: "Create three format sizes and caption variants.",
        owner: "Creative",
        meta: "WIP",
        tone: "warning"
      }
    ]
  },
  {
    title: "Review",
    cards: [
      {
        title: "Branch launch kit",
        detail: "Operations to confirm instructions and release timing.",
        owner: "Area Manager",
        meta: "Review",
        tone: "warning"
      }
    ]
  },
  {
    title: "Approved",
    cards: [
      {
        title: "Menu board update",
        detail: "Final copy and layout approved for print.",
        owner: "Marketing",
        meta: "Ready",
        tone: "success"
      }
    ]
  }
];

const expansionRows = [
  {
    title: "BGC site feasibility",
    detail: "Lease review, traffic notes, utilities, and brand fit",
    status: "Pending Review",
    owner: "Expansion",
    date: "Gate 2"
  },
  {
    title: "Quezon City construction board",
    detail: "Permits, contractor milestones, procurement links, and blockers",
    status: "Risk",
    owner: "Project Site",
    date: "Week 6"
  },
  {
    title: "Opening readiness checklist",
    detail: "Inventory, POS, training, suppliers, permits, and soft opening",
    status: "Ready",
    owner: "Opening Team",
    date: "T-14"
  }
];

const expansionPipelineStages = [
  {
    title: "Lead",
    count: "18",
    detail: "Candidate sites captured with owner, brand fit, and next action.",
    status: "Open"
  },
  {
    title: "Feasibility",
    count: "7",
    detail: "Traffic, utilities, permits, and operating assumptions under review.",
    status: "Review"
  },
  {
    title: "Approved",
    count: "2",
    detail: "Sites released for lease/design coordination and project setup.",
    status: "Ready"
  },
  {
    title: "Build",
    count: "4",
    detail: "Construction, procurement, documents, and blockers tracked by site.",
    status: "Risk"
  },
  {
    title: "Opening",
    count: "2",
    detail: "Training, inventory, supplier setup, and handover readiness.",
    status: "Ready"
  }
];

const permitDocumentItems = [
  {
    title: "Business permit renewal",
    site: "Quezon City build",
    owner: "Expansion",
    due: "Jul 12",
    status: "Review"
  },
  {
    title: "Lease agreement package",
    site: "BGC candidate",
    owner: "Legal",
    due: "Jul 18",
    status: "Pending"
  },
  {
    title: "Fire safety inspection",
    site: "Quezon City build",
    owner: "Contractor",
    due: "Jul 22",
    status: "Risk"
  },
  {
    title: "Contractor accreditation",
    site: "Makati refresh",
    owner: "Procurement",
    due: "Current",
    status: "Ready"
  }
];

const constructionBoardLanes: PreviewBoardLane[] = [
  {
    title: "To Do",
    cards: [
      {
        title: "Electrical inspection",
        detail: "Schedule inspection and attach permit reference.",
        owner: "Contractor",
        meta: "Site",
        tone: "info"
      },
      {
        title: "Smallwares delivery",
        detail: "Coordinate receiving date with branch setup team.",
        owner: "Procurement",
        meta: "PO"
      }
    ]
  },
  {
    title: "Doing",
    cards: [
      {
        title: "Counter installation",
        detail: "Track progress photos and contractor daily note.",
        owner: "Project Site",
        meta: "WIP",
        tone: "warning"
      }
    ]
  },
  {
    title: "Blocked",
    cards: [
      {
        title: "Signage permit",
        detail: "Awaiting city release before exterior install.",
        owner: "Expansion",
        meta: "Risk",
        tone: "warning"
      }
    ]
  },
  {
    title: "Accepted",
    cards: [
      {
        title: "Storage room racks",
        detail: "Installed and accepted with photo evidence.",
        owner: "Warehouse",
        meta: "Done",
        tone: "success"
      }
    ]
  }
];

const openingReadinessItems = [
  {
    title: "Inventory Setup",
    status: "Review",
    detail: "Opening stock list, transfer plan, and supplier readiness need final validation.",
    owner: "Warehouse"
  },
  {
    title: "User Access",
    status: "Ready",
    detail: "Branch users and approvers mapped to company, brand, and location scope.",
    owner: "Admin"
  },
  {
    title: "Training",
    status: "Pending",
    detail: "Receiving, transfers, count, and wastage training sessions scheduled.",
    owner: "Operations"
  },
  {
    title: "Permits",
    status: "Risk",
    detail: "Fire safety certificate and occupancy document remain open.",
    owner: "Expansion"
  },
  {
    title: "Supplier Cutover",
    status: "Ready",
    detail: "Primary suppliers and first PO readiness confirmed for opening week.",
    owner: "Purchasing"
  }
];

const financeRows = [
  {
    title: "Approved PO exposure",
    detail: "Issued POs, partial receipts, balance closures, and accrual context",
    status: "Pending Review",
    owner: "Finance",
    date: "Current period"
  },
  {
    title: "AP invoice matching",
    detail: "PO, receiving, supplier document, and discrepancy checks",
    status: "Draft",
    owner: "Accounting",
    date: "Preview"
  },
  {
    title: "Period close checklist",
    detail: "Receiving cutoff, wastage review, adjustments, and exception sign-off",
    status: "In Review",
    owner: "Controller",
    date: "Month end"
  }
];

const financePreviewLines = [
  {
    source: "Purchase Order",
    reference: "PO-2026-00418 / supplier invoice pending",
    debit: "PHP 84,250.00",
    credit: "-",
    status: "Pending Review"
  },
  {
    source: "Goods Receipt",
    reference: "GRN-2026-00102 / partial receipt matched",
    debit: "PHP 42,900.00",
    credit: "PHP 42,900.00",
    status: "Ready"
  },
  {
    source: "Wastage Report",
    reference: "WR-2026-00023 / evidence policy satisfied",
    debit: "PHP 6,420.00",
    credit: "PHP 6,420.00",
    status: "Approved"
  },
  {
    source: "Period Close",
    reference: "June close / receiving cutoff review",
    debit: "-",
    credit: "-",
    status: "In Review"
  }
];

const adminSettingsItems = [
  {
    title: "Approval Rules",
    detail: "Route PRs, POs, balance closures, wastage, and future finance approvals.",
    status: "Live",
    scope: "Company policy"
  },
  {
    title: "Wastage Evidence Policy",
    detail: "Configurable thresholds, repeat flags, and photo/evidence requirements.",
    status: "Live",
    scope: "Company / location"
  },
  {
    title: "Reason Codes",
    detail: "Controlled classifications for wastage, adjustments, receiving, and cancellations.",
    status: "Review",
    scope: "Operations"
  },
  {
    title: "Notification Rules",
    detail: "Priority, channel, and escalation settings for operational alerts.",
    status: "Draft",
    scope: "Role-aware"
  }
];

export const modulePreviews = {
  dashboard: {
    activeNav: "dashboard",
    title: "Operations Dashboard",
    subtitle: "Phase I control-room preview",
    eyebrow: "Overview",
    summary:
      "A role-aware operating view for approvals, deliveries, low stock, transfer work, counts, and wastage exceptions across the current company and location context.",
    primaryLabel: "Review Approvals",
    secondaryLabel: "Open Reports",
    metrics: [
      { label: "Pending approvals", value: "12", tone: "warning" },
      { label: "Open POs", value: "28", tone: "info" },
      { label: "Due deliveries", value: "7", tone: "warning" },
      { label: "Critical stock", value: "15", tone: "warning" }
    ],
    stages: [
      { label: "Requests", value: "PRs awaiting review", tone: "warning" },
      { label: "Purchasing", value: "POs issued or partly received", tone: "info" },
      { label: "Inventory", value: "Transfers, counts, wastage", tone: "success" }
    ],
    rows: operationsRows,
    dashboardItems: dashboardControlItems,
    focus: [
      "Shows restaurant operational controls instead of sales vanity metrics.",
      "Keeps location and posting context visible for branch teams.",
      "Highlights exceptions that need management action."
    ]
  },
  reports: {
    activeNav: "reports",
    title: "Reports",
    subtitle: "Operational exports and exception summaries",
    eyebrow: "Insights",
    summary:
      "A preview of export-ready operational reports for purchasing, receiving, inventory movement, transfers, counts, wastage, and approval turnaround.",
    primaryLabel: "Review Approvals",
    secondaryLabel: "Open Reports",
    metrics: [
      { label: "Saved views", value: "9", tone: "info" },
      { label: "CSV exports", value: "14", tone: "success" },
      { label: "Exception reports", value: "6", tone: "warning" },
      { label: "Audit trails", value: "Live", tone: "success" }
    ],
    stages: [
      { label: "Procurement", value: "PR, quote, PO, receiving", tone: "info" },
      { label: "Inventory", value: "Ledger, counts, wastage, transfers", tone: "success" },
      { label: "Controls", value: "Approvals and exceptions", tone: "warning" }
    ],
    rows: operationsRows,
    reports: reportCatalog,
    focus: [
      "Exports include status, owner, dates, scope, and exception context.",
      "Reports separate live transaction data from future analytics.",
      "Management can trace numbers back to source records."
    ],
    requiresAdmin: true
  },
  notifications: {
    activeNav: "notifications",
    title: "Notifications",
    subtitle: "Approval, delivery, stock, and exception alerts",
    eyebrow: "Insights",
    summary:
      "A preview queue for operational alerts that need action, including overdue approvals, delivery exceptions, stock risks, and high-value wastage flags.",
    primaryLabel: "Review Approvals",
    secondaryLabel: "Open Reports",
    metrics: [
      { label: "High priority", value: "5", tone: "warning" },
      { label: "Approvals due", value: "8", tone: "warning" },
      { label: "Delivery alerts", value: "4", tone: "info" },
      { label: "Stock alerts", value: "11", tone: "warning" }
    ],
    stages: [
      { label: "Created", value: "System or workflow trigger", tone: "info" },
      { label: "Assigned", value: "Role and scope aware", tone: "warning" },
      { label: "Resolved", value: "Linked source record closed", tone: "success" }
    ],
    rows: operationsRows,
    alerts: notificationAlerts,
    focus: [
      "Alerts are scoped by company, location, and user authority.",
      "Each notification links back to the controlled source record.",
      "Priority reflects operational risk, not generic message volume."
    ],
    requiresAdmin: true
  },
  projects: {
    activeNav: "projects",
    title: "Projects Tracker",
    subtitle: "Phase 1.5 implementation coordination preview",
    eyebrow: "Work Management",
    summary:
      "A project coordination layer for rollouts, supplier onboarding, branch improvements, maintenance, and corrective-action work linked to ERP records without changing their controlled status.",
    primaryLabel: "Review Approvals",
    secondaryLabel: "Open Reports",
    metrics: [
      { label: "Active projects", value: "18", tone: "info" },
      { label: "Blocked tasks", value: "6", tone: "warning" },
      { label: "Milestones due", value: "9", tone: "warning" },
      { label: "Linked ERP records", value: "34", tone: "success" }
    ],
    stages: [
      { label: "Plan", value: "Scope, members, template", tone: "info" },
      { label: "Execute", value: "Tasks, checklists, blockers", tone: "warning" },
      { label: "Close", value: "Evidence and activity history", tone: "success" }
    ],
    rows: workRows,
    board: workBoardLanes,
    focus: [
      "Task cards can link to ERP records but do not alter money or inventory records.",
      "Sensitive projects stay membership-controlled.",
      "Activity, blockers, comments, and attachments remain auditable."
    ],
    requiresAdmin: true
  },
  myWork: {
    activeNav: "my-work",
    title: "My Work",
    subtitle: "Assigned tasks, approvals, blockers, and follow-ups",
    eyebrow: "Work Management",
    summary:
      "A personal work queue preview combining assigned project tasks, checklist items, pending approvals, and operational follow-ups for the signed-in user.",
    primaryLabel: "Review Approvals",
    secondaryLabel: "Open Reports",
    metrics: [
      { label: "Assigned today", value: "10", tone: "warning" },
      { label: "Blocked", value: "3", tone: "warning" },
      { label: "Due this week", value: "21", tone: "info" },
      { label: "Completed", value: "14", tone: "success" }
    ],
    stages: [
      { label: "Assigned", value: "Task or approval routed", tone: "info" },
      { label: "In progress", value: "Evidence and comments", tone: "warning" },
      { label: "Done", value: "Completed-by and timestamp", tone: "success" }
    ],
    rows: workRows,
    board: myWorkBoardLanes,
    focus: [
      "Shows work by role and scope rather than all company tasks.",
      "Completed tasks capture user and timestamp.",
      "Blocked tasks require a reason."
    ],
    requiresAdmin: true
  },
  workBoards: {
    activeNav: "work-boards",
    title: "Work Boards",
    subtitle: "Project task boards and operational work lanes",
    eyebrow: "Work Management",
    summary:
      "A board-style preview for implementation tasks, branch readiness, supplier onboarding, training rollout, and corrective action tracking.",
    primaryLabel: "Review Approvals",
    secondaryLabel: "Open Reports",
    metrics: [
      { label: "Boards", value: "7", tone: "info" },
      { label: "In progress", value: "42", tone: "warning" },
      { label: "Blocked", value: "8", tone: "warning" },
      { label: "Done this week", value: "25", tone: "success" }
    ],
    stages: [
      { label: "Backlog", value: "Approved scope", tone: "neutral" },
      { label: "Doing", value: "Assigned work", tone: "warning" },
      { label: "Done", value: "Auditable completion", tone: "success" }
    ],
    rows: workRows,
    board: workBoardLanes,
    focus: [
      "Boards organize work without replacing controlled ERP workflows.",
      "Cards can carry links, checklists, comments, and blockers.",
      "Role and membership control visibility."
    ],
    requiresAdmin: true
  },
  workCalendar: {
    activeNav: "work-calendar",
    title: "Work Calendar",
    subtitle: "Project milestones, rollouts, and operational deadlines",
    eyebrow: "Work Management",
    summary:
      "A calendar preview for rollout milestones, training dates, opening-readiness checks, maintenance visits, and follow-up deadlines.",
    primaryLabel: "Review Approvals",
    secondaryLabel: "Open Reports",
    metrics: [
      { label: "This week", value: "16", tone: "info" },
      { label: "Overdue", value: "4", tone: "warning" },
      { label: "Milestones", value: "9", tone: "warning" },
      { label: "Completed", value: "12", tone: "success" }
    ],
    stages: [
      { label: "Scheduled", value: "Date committed", tone: "info" },
      { label: "At risk", value: "Dependency or blocker", tone: "warning" },
      { label: "Closed", value: "Evidence captured", tone: "success" }
    ],
    rows: workRows,
    calendar: workCalendarItems,
    focus: [
      "Calendar dates stay tied to project membership and scope.",
      "Operational deadlines can link back to source records.",
      "Late work remains visible without changing ERP transaction status."
    ],
    requiresAdmin: true
  },
  marketingCalendar: {
    activeNav: "marketing-calendar",
    title: "Marketing Calendar",
    subtitle: "Campaign and local-store activation schedule",
    eyebrow: "Marketing",
    summary:
      "A calendar preview for campaign launches, branch-level activations, promo windows, creative deadlines, and new item rollout readiness.",
    primaryLabel: "Review Approvals",
    secondaryLabel: "Open Reports",
    metrics: [
      { label: "Campaigns", value: "6", tone: "info" },
      { label: "Branch activations", value: "18", tone: "warning" },
      { label: "Creative due", value: "7", tone: "warning" },
      { label: "Ready kits", value: "11", tone: "success" }
    ],
    stages: [
      { label: "Plan", value: "Calendar and objective", tone: "info" },
      { label: "Prepare", value: "Creative, branch kits, item readiness", tone: "warning" },
      { label: "Launch", value: "Approved activation window", tone: "success" }
    ],
    rows: marketingRows,
    calendar: marketingCalendarItems,
    focus: [
      "Marketing work can coordinate with procurement and item master readiness.",
      "Branch activations can be tracked by location.",
      "Creative and launch tasks remain auditable work items."
    ],
    requiresAdmin: true
  },
  campaigns: {
    activeNav: "campaigns",
    title: "Campaigns",
    subtitle: "Campaign planning, readiness, and launch control",
    eyebrow: "Marketing",
    summary:
      "A campaign preview for planned activations, target branches, promo materials, dependencies, and launch approval status.",
    primaryLabel: "Review Approvals",
    secondaryLabel: "Open Reports",
    metrics: [
      { label: "Planned", value: "8", tone: "info" },
      { label: "In production", value: "5", tone: "warning" },
      { label: "Blocked", value: "2", tone: "warning" },
      { label: "Live", value: "3", tone: "success" }
    ],
    stages: [
      { label: "Brief", value: "Objective and branch scope", tone: "info" },
      { label: "Production", value: "Assets and operating notes", tone: "warning" },
      { label: "Go live", value: "Launch checklist complete", tone: "success" }
    ],
    rows: marketingRows,
    readiness: marketingReadinessItems,
    focus: [
      "Campaign records preview scope, dates, owners, and launch status.",
      "Branch execution can be tracked without POS integration.",
      "Dependencies are visible before launch."
    ],
    requiresAdmin: true
  },
  promotions: {
    activeNav: "promotions",
    title: "Promotions",
    subtitle: "Promo mechanics and branch readiness preview",
    eyebrow: "Marketing",
    summary:
      "A promotion planning preview for mechanics, participating brands/locations, operating instructions, and readiness status.",
    primaryLabel: "Review Approvals",
    secondaryLabel: "Open Reports",
    metrics: [
      { label: "Draft promos", value: "5", tone: "warning" },
      { label: "Locations", value: "24", tone: "info" },
      { label: "Ready", value: "12", tone: "success" },
      { label: "Exceptions", value: "3", tone: "warning" }
    ],
    stages: [
      { label: "Mechanics", value: "Offer and period", tone: "info" },
      { label: "Branch prep", value: "Materials and stock check", tone: "warning" },
      { label: "Active", value: "Launch approved", tone: "success" }
    ],
    rows: marketingRows,
    readiness: marketingReadinessItems,
    focus: [
      "Promo previews include branch scope and launch window.",
      "Stock and training dependencies stay visible.",
      "Future POS validation remains out of this preview."
    ],
    requiresAdmin: true
  },
  itemLaunches: {
    activeNav: "item-launches",
    title: "New Item Launches",
    subtitle: "Launch readiness for menu and inventory items",
    eyebrow: "Marketing",
    summary:
      "A launch readiness preview for new items, item master setup, supplier readiness, training content, marketing assets, and branch rollout status.",
    primaryLabel: "Review Approvals",
    secondaryLabel: "Open Reports",
    metrics: [
      { label: "Items planned", value: "9", tone: "info" },
      { label: "Supplier ready", value: "6", tone: "success" },
      { label: "Training due", value: "4", tone: "warning" },
      { label: "Blocked", value: "1", tone: "warning" }
    ],
    stages: [
      { label: "Setup", value: "Master data and suppliers", tone: "info" },
      { label: "Prepare", value: "Photos, training, launch assets", tone: "warning" },
      { label: "Rollout", value: "Branch readiness confirmed", tone: "success" }
    ],
    rows: marketingRows,
    readiness: marketingReadinessItems,
    focus: [
      "Launch work references item and supplier setup.",
      "Branch readiness is visible before rollout.",
      "Recipe/costing behavior remains future scope."
    ],
    requiresAdmin: true
  },
  creativeBoard: {
    activeNav: "creative-board",
    title: "Creative Board",
    subtitle: "Creative requests, assets, and approval preview",
    eyebrow: "Marketing",
    summary:
      "A board preview for creative requests, design tasks, copy, photography, approval status, and branch kit readiness.",
    primaryLabel: "Review Approvals",
    secondaryLabel: "Open Reports",
    metrics: [
      { label: "Requests", value: "17", tone: "info" },
      { label: "In review", value: "6", tone: "warning" },
      { label: "Blocked", value: "2", tone: "warning" },
      { label: "Approved", value: "9", tone: "success" }
    ],
    stages: [
      { label: "Request", value: "Brief and owner", tone: "info" },
      { label: "Review", value: "Stakeholder feedback", tone: "warning" },
      { label: "Ready", value: "Approved asset kit", tone: "success" }
    ],
    rows: marketingRows,
    board: creativeBoardLanes,
    focus: [
      "Creative tasks carry owners, due dates, and review status.",
      "Assets can be grouped by campaign or branch kit.",
      "Approval context is visible before launch."
    ],
    requiresAdmin: true
  },
  expansionDashboard: {
    activeNav: "expansion-dashboard",
    title: "Expansion Dashboard",
    subtitle: "Site pipeline and opening readiness preview",
    eyebrow: "Expansion",
    summary:
      "A portfolio view for site pipeline, lifecycle gates, permits, construction readiness, supplier setup, and opening checklists.",
    primaryLabel: "Review Approvals",
    secondaryLabel: "Open Reports",
    metrics: [
      { label: "Sites tracked", value: "11", tone: "info" },
      { label: "At risk", value: "3", tone: "warning" },
      { label: "Gate reviews", value: "5", tone: "warning" },
      { label: "Openings ready", value: "2", tone: "success" }
    ],
    stages: [
      { label: "Pipeline", value: "Lead, feasibility, lease", tone: "info" },
      { label: "Build", value: "Permits and construction", tone: "warning" },
      { label: "Open", value: "Readiness and handover", tone: "success" }
    ],
    rows: expansionRows,
    pipeline: expansionPipelineStages,
    focus: [
      "Expansion previews coordinate work without replacing controlled ERP records.",
      "Gate status makes next decisions visible.",
      "Opening readiness ties operations, procurement, and training together."
    ],
    requiresAdmin: true
  },
  sitePipeline: {
    activeNav: "site-pipeline",
    title: "Site Pipeline",
    subtitle: "Candidate locations and feasibility gates",
    eyebrow: "Expansion",
    summary:
      "A pipeline preview for candidate sites, lease status, feasibility notes, expected brand fit, and next decision gates.",
    primaryLabel: "Review Approvals",
    secondaryLabel: "Open Reports",
    metrics: [
      { label: "Leads", value: "18", tone: "info" },
      { label: "Feasibility", value: "7", tone: "warning" },
      { label: "Negotiation", value: "4", tone: "warning" },
      { label: "Approved", value: "2", tone: "success" }
    ],
    stages: [
      { label: "Lead", value: "Candidate site captured", tone: "info" },
      { label: "Evaluate", value: "Feasibility and risk", tone: "warning" },
      { label: "Approve", value: "Gate decision recorded", tone: "success" }
    ],
    rows: expansionRows,
    pipeline: expansionPipelineStages,
    focus: [
      "Pipeline rows show location, owner, and gate status.",
      "Site data remains separate from live operational locations.",
      "Future lease/accounting controls remain separate."
    ],
    requiresAdmin: true
  },
  lifecycleGates: {
    activeNav: "lifecycle-gates",
    title: "Lifecycle Gates",
    subtitle: "Expansion gate review and decision preview",
    eyebrow: "Expansion",
    summary:
      "A gate-control preview for feasibility, lease, design, construction, training, stock readiness, and opening approval.",
    primaryLabel: "Review Approvals",
    secondaryLabel: "Open Reports",
    metrics: [
      { label: "Gate reviews", value: "8", tone: "warning" },
      { label: "Approved gates", value: "15", tone: "success" },
      { label: "Blocked gates", value: "3", tone: "warning" },
      { label: "Due soon", value: "6", tone: "info" }
    ],
    stages: [
      { label: "Submit", value: "Gate evidence ready", tone: "info" },
      { label: "Review", value: "Approver decision", tone: "warning" },
      { label: "Release", value: "Next stage unlocked", tone: "success" }
    ],
    rows: expansionRows,
    pipeline: expansionPipelineStages,
    focus: [
      "Gate rows emphasize evidence and next decision.",
      "Approvals are visible but not wired to finance/inventory effects.",
      "Activity history supports audit review."
    ],
    requiresAdmin: true
  },
  permits: {
    activeNav: "permits",
    title: "Permits & Documents",
    subtitle: "Expansion document register preview",
    eyebrow: "Expansion",
    summary:
      "A document register preview for permits, leases, contractor documents, expiry dates, responsible owners, and approval status.",
    primaryLabel: "Review Approvals",
    secondaryLabel: "Open Reports",
    metrics: [
      { label: "Documents", value: "46", tone: "info" },
      { label: "Expiring soon", value: "5", tone: "warning" },
      { label: "Missing", value: "3", tone: "warning" },
      { label: "Approved", value: "28", tone: "success" }
    ],
    stages: [
      { label: "Requested", value: "Owner assigned", tone: "info" },
      { label: "Submitted", value: "Evidence uploaded", tone: "warning" },
      { label: "Accepted", value: "Ready for gate use", tone: "success" }
    ],
    rows: expansionRows,
    documents: permitDocumentItems,
    focus: [
      "Document status is visible by site and owner.",
      "Expiry dates and blockers surface before launch risk.",
      "Files remain linked to the site/project context."
    ],
    requiresAdmin: true
  },
  constructionBoard: {
    activeNav: "construction-board",
    title: "Construction Board",
    subtitle: "Build milestones and blocker preview",
    eyebrow: "Expansion",
    summary:
      "A construction coordination board preview for contractor tasks, dependencies, punch-list items, procurement links, and opening risk.",
    primaryLabel: "Review Approvals",
    secondaryLabel: "Open Reports",
    metrics: [
      { label: "Milestones", value: "22", tone: "info" },
      { label: "Delayed", value: "4", tone: "warning" },
      { label: "In progress", value: "13", tone: "warning" },
      { label: "Accepted", value: "5", tone: "success" }
    ],
    stages: [
      { label: "Scheduled", value: "Task committed", tone: "info" },
      { label: "In progress", value: "Updates and blockers", tone: "warning" },
      { label: "Accepted", value: "Evidence captured", tone: "success" }
    ],
    rows: expansionRows,
    board: constructionBoardLanes,
    focus: [
      "Build tasks can reference procurement and site documents.",
      "Blockers require owner and reason.",
      "Punch-list handoff remains traceable."
    ],
    requiresAdmin: true
  },
  openingReadiness: {
    activeNav: "opening-readiness",
    title: "Opening Readiness",
    subtitle: "Pre-opening checklist and branch handover preview",
    eyebrow: "Expansion",
    summary:
      "A readiness preview for training, inventory, supplier setup, system access, permits, equipment, and opening-day controls.",
    primaryLabel: "Review Approvals",
    secondaryLabel: "Open Reports",
    metrics: [
      { label: "Checklist items", value: "84", tone: "info" },
      { label: "Open risks", value: "6", tone: "warning" },
      { label: "Due this week", value: "19", tone: "warning" },
      { label: "Complete", value: "72%", tone: "success" }
    ],
    stages: [
      { label: "Prepare", value: "Setup tasks assigned", tone: "info" },
      { label: "Validate", value: "Evidence and sign-off", tone: "warning" },
      { label: "Handover", value: "Branch operations ready", tone: "success" }
    ],
    rows: expansionRows,
    readiness: openingReadinessItems,
    focus: [
      "Opening readiness ties operations, inventory, users, and training.",
      "Handover status is visible before launch.",
      "Final approval remains a controlled decision."
    ],
    requiresAdmin: true
  },
  punchList: {
    activeNav: "punch-list",
    title: "Punch List",
    subtitle: "Defects, fixes, and handover closure preview",
    eyebrow: "Expansion",
    summary:
      "A punch-list preview for defects, owner assignments, vendor follow-ups, photos, target dates, and closure evidence.",
    primaryLabel: "Review Approvals",
    secondaryLabel: "Open Reports",
    metrics: [
      { label: "Open items", value: "31", tone: "warning" },
      { label: "Critical", value: "5", tone: "warning" },
      { label: "Due today", value: "7", tone: "info" },
      { label: "Closed", value: "48", tone: "success" }
    ],
    stages: [
      { label: "Logged", value: "Issue and evidence", tone: "info" },
      { label: "Assigned", value: "Owner and due date", tone: "warning" },
      { label: "Closed", value: "Accepted evidence", tone: "success" }
    ],
    rows: expansionRows,
    board: constructionBoardLanes,
    focus: [
      "Each item carries owner, severity, and evidence.",
      "Closure is auditable and visible for handover.",
      "Operational blockers can be separated from cosmetic fixes."
    ],
    requiresAdmin: true
  },
  financeOverview: {
    activeNav: "finance-overview",
    title: "Finance Overview",
    subtitle: "Accounting system-of-record preview",
    eyebrow: "Finance",
    summary:
      "A finance preview showing how controlled procurement, receiving, inventory, wastage, and period-close signals will support the ERP as the accounting system of record.",
    primaryLabel: "Review Approvals",
    secondaryLabel: "Open Reports",
    metrics: [
      { label: "PO exposure", value: "PHP 1.8M", tone: "warning" },
      { label: "Pending AP", value: "42", tone: "info" },
      { label: "Close tasks", value: "13", tone: "warning" },
      { label: "Exceptions", value: "6", tone: "warning" }
    ],
    stages: [
      { label: "Source record", value: "PO, receipt, wastage, adjustment", tone: "info" },
      { label: "Review", value: "Finance control and matching", tone: "warning" },
      { label: "Post", value: "Future accounting entry", tone: "success" }
    ],
    rows: financeRows,
    financeLines: financePreviewLines,
    focus: [
      "Finance preview uses controlled source records, not manual spreadsheets.",
      "PO/receiving exceptions remain visible before AP posting.",
      "Period-close dependencies are explicit.",
      "No live journals, payments, reconciliations, or close locks are created here."
    ],
    requiresAdmin: true
  },
  generalLedger: {
    activeNav: "general-ledger",
    title: "General Ledger",
    subtitle: "Future ledger structure and posting preview",
    eyebrow: "Finance",
    summary:
      "A general-ledger preview for account activity, source-document lineage, posting status, and period context once finance posting is formally implemented.",
    primaryLabel: "Review Approvals",
    secondaryLabel: "Open Reports",
    metrics: [
      { label: "Draft journals", value: "18", tone: "warning" },
      { label: "Source-linked", value: "94%", tone: "success" },
      { label: "Unposted", value: "7", tone: "info" },
      { label: "Exceptions", value: "2", tone: "warning" }
    ],
    stages: [
      { label: "Capture", value: "Source document context", tone: "info" },
      { label: "Validate", value: "Period and approval checks", tone: "warning" },
      { label: "Post", value: "Ledger entry created", tone: "success" }
    ],
    rows: financeRows,
    financeLines: financePreviewLines,
    focus: [
      "Ledger rows preview source-document traceability.",
      "Posting remains future finance scope.",
      "Closed-period controls will govern backdated entries.",
      "Preview rows are read-only and not editable ledger entries."
    ],
    requiresAdmin: true
  },
  accountsPayable: {
    activeNav: "accounts-payable",
    title: "Accounts Payable",
    subtitle: "Supplier invoice matching preview",
    eyebrow: "Finance",
    summary:
      "An AP preview for supplier invoices, PO matching, receiving evidence, discrepancy review, and payment readiness.",
    primaryLabel: "Review Approvals",
    secondaryLabel: "Open Reports",
    metrics: [
      { label: "Invoices", value: "37", tone: "info" },
      { label: "Matched", value: "21", tone: "success" },
      { label: "Needs review", value: "9", tone: "warning" },
      { label: "Blocked", value: "4", tone: "warning" }
    ],
    stages: [
      { label: "Invoice", value: "Supplier document captured", tone: "info" },
      { label: "Match", value: "PO and receiving checked", tone: "warning" },
      { label: "Ready", value: "Payment approval context", tone: "success" }
    ],
    rows: financeRows,
    financeLines: financePreviewLines,
    focus: [
      "AP preview links supplier invoices to PO and receiving controls.",
      "Partial receipt and discrepancy context stays visible.",
      "Payment workflow remains future controlled finance scope.",
      "No supplier invoice or payment readiness status is changed here."
    ],
    requiresAdmin: true
  },
  bankCash: {
    activeNav: "bank-cash",
    title: "Bank & Cash",
    subtitle: "Cash position and reconciliation preview",
    eyebrow: "Finance",
    summary:
      "A bank and cash preview for balances, pending payments, deposits, reconciliation status, and exception review.",
    primaryLabel: "Review Approvals",
    secondaryLabel: "Open Reports",
    metrics: [
      { label: "Accounts", value: "8", tone: "info" },
      { label: "Unreconciled", value: "14", tone: "warning" },
      { label: "Exceptions", value: "3", tone: "warning" },
      { label: "Ready", value: "5", tone: "success" }
    ],
    stages: [
      { label: "Import", value: "Bank activity captured", tone: "info" },
      { label: "Match", value: "Payment and deposit links", tone: "warning" },
      { label: "Reconcile", value: "Period-ready status", tone: "success" }
    ],
    rows: financeRows,
    financeLines: financePreviewLines,
    focus: [
      "Cash preview emphasizes reconciliation and exceptions.",
      "Supplier payment context will link to AP records.",
      "No live bank integration is implied in this mockup.",
      "No cash, bank, payment, or reconciliation record is changed here."
    ],
    requiresAdmin: true
  },
  periodClose: {
    activeNav: "period-close",
    title: "Period Close",
    subtitle: "Month-end control checklist preview",
    eyebrow: "Finance",
    summary:
      "A period-close preview for cutoff tasks, unposted receiving, wastage and adjustment review, AP matching, approvals, and close sign-off.",
    primaryLabel: "Review Approvals",
    secondaryLabel: "Open Reports",
    metrics: [
      { label: "Close tasks", value: "28", tone: "warning" },
      { label: "Complete", value: "61%", tone: "info" },
      { label: "Blockers", value: "5", tone: "warning" },
      { label: "Signed off", value: "9", tone: "success" }
    ],
    stages: [
      { label: "Cutoff", value: "Operational activity reviewed", tone: "info" },
      { label: "Review", value: "Exceptions and approvals", tone: "warning" },
      { label: "Close", value: "Sign-off and lock", tone: "success" }
    ],
    rows: financeRows,
    financeLines: financePreviewLines,
    focus: [
      "Close preview shows operational dependencies before finance lock.",
      "Backdated changes require future controlled policy.",
      "Every close task carries owner and status.",
      "No accounting period is locked or reopened from this preview."
    ],
    requiresAdmin: true
  },
  adminSettings: {
    activeNav: "admin-settings",
    title: "Admin Settings",
    subtitle: "Tenant, workflow, and control configuration preview",
    eyebrow: "Admin",
    summary:
      "An admin settings preview for company configuration, approval policies, notification rules, reason codes, evidence controls, and master-data governance.",
    primaryLabel: "Review Approvals",
    secondaryLabel: "Open Reports",
    metrics: [
      { label: "Approval rules", value: "6", tone: "info" },
      { label: "Reason codes", value: "38", tone: "success" },
      { label: "Policy drafts", value: "4", tone: "warning" },
      { label: "Config gaps", value: "2", tone: "warning" }
    ],
    stages: [
      { label: "Configure", value: "Policy and master-data setup", tone: "info" },
      { label: "Review", value: "Control and scope validation", tone: "warning" },
      { label: "Activate", value: "Available to workflows", tone: "success" }
    ],
    rows: [
      {
        title: "Wastage evidence policy",
        detail: "Thresholds, repeat flags, and photo requirements",
        status: "Live",
        owner: "Admin",
        date: "Current"
      },
      {
        title: "Approval matrix",
        detail: "Purchasing, PO closure, wastage, and future finance routing",
        status: "In Review",
        owner: "Admin",
        date: "This month"
      },
      {
        title: "Reason-code governance",
        detail: "Wastage, adjustment, receiving discrepancy, and cancellation reasons",
        status: "Pending Review",
        owner: "Operations",
        date: "Next update"
      }
    ],
    settings: adminSettingsItems,
    focus: [
      "Settings are policy data, not hidden component constants.",
      "Scope and approval changes remain server-enforced.",
      "Configuration history supports audit and training.",
      "This preview does not activate policies, approval routes, or workflow changes."
    ],
    requiresAdmin: true
  }
} satisfies Record<string, ModulePreviewConfig>;

export type ModulePreviewKey = keyof typeof modulePreviews;
