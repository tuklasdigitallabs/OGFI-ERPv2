import { existsSync } from "fs";
import { readFile } from "fs/promises";
import path from "path";
import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { Badge, ButtonLink, Panel } from "@ogfi/ui";
import { AppShell } from "@/components/AppShell";
import { getSessionContext } from "@/server/services/context";

export const dynamic = "force-dynamic";

type KnowledgeBaseArticle = {
  slug: string;
  title: string;
  file: string;
  source?: "knowledge-base" | "phase-02";
  workspaceHref?: string;
  workspaceLabel?: string;
};

type ComputationCheck = {
  label: string;
  formula: string;
  logic: string;
};

type KnowledgeBaseSection = {
  title: string;
  description: string;
  status: "Ready" | "Expanding";
  articles: KnowledgeBaseArticle[];
};

const knowledgeBaseSections: KnowledgeBaseSection[] = [
  {
    title: "Getting Started",
    description: "Sign in, choose your operating location, and understand ERP status cues.",
    status: "Ready",
    articles: [
      {
        slug: "signing-in-and-selecting-your-location",
        title: "Signing in and selecting your location",
        file: "getting-started/signing-in-and-selecting-your-location.md",
        workspaceHref: "/dashboard",
        workspaceLabel: "Open Dashboard"
      },
      {
        slug: "dashboard-my-tasks-and-notifications",
        title: "Understanding the dashboard, my tasks, and notifications",
        file: "getting-started/understanding-the-dashboard-my-tasks-and-notifications.md",
        workspaceHref: "/notifications",
        workspaceLabel: "Open Notifications"
      },
      {
        slug: "statuses-audit-history-and-attachments",
        title: "Understanding statuses, audit history, and attachments",
        file: "getting-started/understanding-statuses-audit-history-and-attachments.md"
      }
    ]
  },
  {
    title: "Purchasing",
    description: "Purchase Requests, approvals, Purchase Orders, receiving, and replenishment flow.",
    status: "Ready",
    articles: [
      {
        slug: "creating-a-purchase-request",
        title: "Creating a purchase request",
        file: "purchasing/creating-a-purchase-request.md",
        workspaceHref: "/purchase-requests",
        workspaceLabel: "Open PRs"
      },
      {
        slug: "reviewing-and-approving-a-purchase-request",
        title: "Reviewing and approving a purchase request",
        file: "purchasing/reviewing-and-approving-a-purchase-request.md",
        workspaceHref: "/approvals",
        workspaceLabel: "Open Approvals"
      },
      {
        slug: "receiving-issued-purchase-orders",
        title: "Receiving issued purchase orders",
        file: "purchasing/receiving-issued-purchase-orders.md",
        workspaceHref: "/receiving",
        workspaceLabel: "Open Receiving"
      },
      {
        slug: "receiving-partial-damaged-or-rejected-deliveries",
        title: "Receiving partial, damaged, or rejected deliveries",
        file: "purchasing/receiving-partial-damaged-or-rejected-deliveries.md",
        workspaceHref: "/receiving",
        workspaceLabel: "Open Receiving"
      },
      {
        slug: "understanding-purchase-order-statuses",
        title: "Understanding purchase order statuses",
        file: "purchasing/understanding-purchase-order-statuses.md",
        workspaceHref: "/purchase-orders",
        workspaceLabel: "Open POs"
      },
      {
        slug: "requesting-stock-when-a-branch-item-is-low",
        title: "Requesting stock when a branch item is low",
        file: "purchasing/requesting-stock-when-a-branch-item-is-low.md",
        workspaceHref: "/transfers",
        workspaceLabel: "Open Transfers"
      }
    ]
  },
  {
    title: "Warehouse And Inventory",
    description: "Stock balances, movement ledger, transfers, counts, wastage, and adjustments.",
    status: "Ready",
    articles: [
      {
        slug: "viewing-stock-balances",
        title: "Viewing stock balances",
        file: "warehouse-inventory/viewing-stock-balances.md",
        workspaceHref: "/inventory",
        workspaceLabel: "Open Stock"
      },
      {
        slug: "viewing-inventory-ledger",
        title: "Viewing inventory ledger",
        file: "warehouse-inventory/viewing-inventory-ledger.md",
        workspaceHref: "/inventory/ledger",
        workspaceLabel: "Open Ledger"
      },
      {
        slug: "creating-transfer-requests",
        title: "Creating transfer requests",
        file: "warehouse-inventory/creating-transfer-requests.md",
        workspaceHref: "/transfers",
        workspaceLabel: "Open Transfers"
      },
      {
        slug: "dispatching-warehouse-transfers",
        title: "Dispatching warehouse transfers",
        file: "warehouse-inventory/dispatching-warehouse-transfers.md",
        workspaceHref: "/transfers",
        workspaceLabel: "Open Transfers"
      },
      {
        slug: "receiving-warehouse-transfers",
        title: "Receiving warehouse transfers",
        file: "warehouse-inventory/receiving-warehouse-transfers.md",
        workspaceHref: "/transfers",
        workspaceLabel: "Open Transfers"
      },
      {
        slug: "running-stock-counts",
        title: "Running stock counts",
        file: "warehouse-inventory/running-stock-counts.md",
        workspaceHref: "/counts",
        workspaceLabel: "Open Counts"
      },
      {
        slug: "logging-wastage",
        title: "Logging wastage",
        file: "warehouse-inventory/logging-wastage.md",
        workspaceHref: "/wastage",
        workspaceLabel: "Open Wastage"
      },
      {
        slug: "understanding-stock-adjustments",
        title: "Understanding stock adjustments",
        file: "warehouse-inventory/understanding-stock-adjustments.md",
        workspaceHref: "/adjustments",
        workspaceLabel: "Open Adjustments"
      }
    ]
  },
  {
    title: "Projects And Work Management",
    description: "Project tracker access, tasks, blockers, milestones, comments, and linked ERP records.",
    status: "Ready",
    articles: [
      {
        slug: "understanding-projects-tasks-and-your-access",
        title: "Understanding projects, tasks, and your access",
        file: "projects/understanding-projects-tasks-and-your-access.md",
        workspaceHref: "/projects",
        workspaceLabel: "Open Projects"
      },
      {
        slug: "viewing-and-completing-your-assigned-tasks",
        title: "Viewing and completing your assigned tasks",
        file: "projects/viewing-and-completing-your-assigned-tasks.md",
        workspaceHref: "/my-work",
        workspaceLabel: "Open My Work"
      },
      {
        slug: "creating-a-project-from-a-template",
        title: "Creating a project from a template",
        file: "projects/creating-a-project-from-a-template.md",
        workspaceHref: "/project-templates",
        workspaceLabel: "Open Templates"
      },
      {
        slug: "marking-a-task-blocked-and-requesting-help",
        title: "Marking a task blocked and requesting help",
        file: "projects/marking-a-task-blocked-and-requesting-help.md"
      },
      {
        slug: "linking-a-task-to-an-erp-record",
        title: "Linking a task to an ERP record",
        file: "projects/linking-a-task-to-an-erp-record.md"
      },
      {
        slug: "why-cant-i-see-this-project-or-linked-record",
        title: "Why cannot I see this project or linked record?",
        file: "projects/why-cant-i-see-this-project-or-linked-record.md"
      }
    ]
  },
  {
    title: "Reports And Troubleshooting",
    description: "Exports, visibility problems, approval blockers, and supporting evidence.",
    status: "Ready",
    articles: [
      {
        slug: "how-to-export-a-report",
        title: "How to export a report",
        file: "reports/how-to-export-a-report.md",
        workspaceHref: "/reports",
        workspaceLabel: "Open Reports"
      },
      {
        slug: "why-cant-i-approve-this-request",
        title: "Why cannot I approve this request?",
        file: "troubleshooting/why-cant-i-approve-this-request.md"
      },
      {
        slug: "why-cant-i-see-my-branch-warehouse-or-request",
        title: "Why cannot I see my branch, warehouse, or request?",
        file: "troubleshooting/why-cant-i-see-my-branch-warehouse-or-request.md"
      },
      {
        slug: "how-to-attach-supporting-documents-or-photo-evidence",
        title: "How to attach supporting documents or photo evidence",
        file: "troubleshooting/how-to-attach-supporting-documents-or-photo-evidence.md"
      }
    ]
  },
  {
    title: "Administration And Branch Operations",
    description: "Admin and branch-operation guides as implemented behavior is finalized.",
    status: "Expanding",
    articles: [
      {
        slug: "administration-index",
        title: "Administration guide index",
        file: "administration/README.md",
        workspaceHref: "/admin",
        workspaceLabel: "Open Admin"
      },
      {
        slug: "branch-operations-index",
        title: "Branch operations guide index",
        file: "branch-operations/README.md",
        workspaceHref: "/branch-operations",
        workspaceLabel: "Open Branch Ops"
      },
      {
        slug: "open-knowledge-base-gaps",
        title: "Open knowledge-base gaps",
        file: "OPEN_KNOWLEDGE_BASE_GAPS.md"
      },
      {
        slug: "glossary",
        title: "Glossary",
        file: "GLOSSARY.md"
      }
    ]
  },
  {
    title: "Restaurant Operations",
    description: "Recipes, menu costing, branch operations, food safety, incidents, maintenance, reports, and UAT documentation.",
    status: "Ready",
    articles: [
      {
        slug: "phase-2-overview",
        title: "Restaurant operations overview",
        file: "README.md",
        source: "phase-02",
        workspaceHref: "/recipes",
        workspaceLabel: "Open Restaurant Ops"
      },
      {
        slug: "phase-2-recipe-management-workflow",
        title: "Recipe management workflow",
        file: "workflows/recipe-management-workflow.md",
        source: "phase-02",
        workspaceHref: "/recipes",
        workspaceLabel: "Open Recipes"
      },
      {
        slug: "phase-2-menu-costing-workflow",
        title: "Menu costing workflow",
        file: "workflows/menu-costing-workflow.md",
        source: "phase-02",
        workspaceHref: "/recipes?view=food-cost",
        workspaceLabel: "Open Food Cost"
      },
      {
        slug: "phase-2-theoretical-vs-actual-food-cost",
        title: "Theoretical vs actual food cost workflow",
        file: "workflows/theoretical-vs-actual-food-cost-workflow.md",
        source: "phase-02",
        workspaceHref: "/recipes/analysis",
        workspaceLabel: "Open Analysis"
      },
      {
        slug: "phase-2-branch-opening-closing-workflow",
        title: "Branch opening and closing workflow",
        file: "workflows/branch-opening-closing-workflow.md",
        source: "phase-02",
        workspaceHref: "/branch-operations",
        workspaceLabel: "Open Branch Ops"
      },
      {
        slug: "phase-2-food-safety-workflow",
        title: "Food safety workflow",
        file: "workflows/food-safety-workflow.md",
        source: "phase-02",
        workspaceHref: "/food-safety",
        workspaceLabel: "Open Food Safety"
      },
      {
        slug: "phase-2-incident-management-workflow",
        title: "Incident management workflow",
        file: "workflows/incident-management-workflow.md",
        source: "phase-02",
        workspaceHref: "/incidents",
        workspaceLabel: "Open Incidents"
      },
      {
        slug: "phase-2-maintenance-workflow",
        title: "Maintenance workflow",
        file: "workflows/maintenance-workflow.md",
        source: "phase-02",
        workspaceHref: "/maintenance",
        workspaceLabel: "Open Maintenance"
      },
      {
        slug: "phase-2-recipe-costing-ui-spec",
        title: "Recipes and costing UI specification",
        file: "specs/recipes-costing-ui-spec.md",
        source: "phase-02",
        workspaceHref: "/recipes",
        workspaceLabel: "Open Recipes"
      },
      {
        slug: "phase-2-reporting-and-export-spec",
        title: "Restaurant operations reporting and export specification",
        file: "reports/PHASE2_REPORTING_AND_EXPORT_SPEC.md",
        source: "phase-02",
        workspaceHref: "/reports?tab=Restaurant-Ops",
        workspaceLabel: "Open Reports"
      },
      {
        slug: "phase-2-uat-scenarios",
        title: "Restaurant operations UAT scenarios",
        file: "quality/PHASE2_UAT_SCENARIOS.md",
        source: "phase-02"
      },
      {
        slug: "phase-2-data-extensions",
        title: "Restaurant operations data extensions",
        file: "data/PHASE2_DATA_EXTENSIONS.md",
        source: "phase-02"
      }
    ]
  }
];

const allArticles = knowledgeBaseSections.flatMap((section) =>
  section.articles.map((article) => ({ ...article, sectionTitle: section.title }))
);
const articleCount = allArticles.length;

function getSearchParam(
  searchParams: Record<string, string | string[] | undefined>,
  key: string
) {
  const value = searchParams[key];
  return Array.isArray(value) ? value[0] : value;
}

function getDocumentationRoot(source: KnowledgeBaseArticle["source"]) {
  if (source === "phase-02") {
    const repositoryDocsRoot = path.resolve(
      process.cwd(),
      "docs",
      "phases",
      "phase-02-restaurant-operations-and-food-cost"
    );
    const appPackageDocsRoot = path.resolve(
      process.cwd(),
      "..",
      "..",
      "docs",
      "phases",
      "phase-02-restaurant-operations-and-food-cost"
    );
    const candidates = [repositoryDocsRoot, appPackageDocsRoot];
    return candidates.find((candidate) => existsSync(candidate)) ?? repositoryDocsRoot;
  }

  const repositoryDocsRoot = path.resolve(process.cwd(), "docs", "knowledge-base");
  const appPackageDocsRoot = path.resolve(process.cwd(), "..", "..", "docs", "knowledge-base");
  const candidates = [
    repositoryDocsRoot,
    appPackageDocsRoot
  ];
  return candidates.find((candidate) => existsSync(candidate)) ?? repositoryDocsRoot;
}

async function readKnowledgeBaseArticle(article: KnowledgeBaseArticle) {
  const root = getDocumentationRoot(article.source);
  const resolvedPath = path.resolve(root, article.file);
  if (!resolvedPath.startsWith(root)) {
    throw new Error("KNOWLEDGE_BASE_ARTICLE_OUT_OF_SCOPE");
  }
  const markdown = await readFile(resolvedPath, "utf8");
  return prepareArticleMarkdown(article, markdown);
}

function getArticleSourceLabel(article: KnowledgeBaseArticle) {
  if (article.source === "phase-02") {
    return `Restaurant Operations documentation / ${article.file}`;
  }
  return `docs/knowledge-base/${article.file}`;
}

function removeInternalMarkdownSections(markdown: string) {
  const hiddenHeadings = new Set(["open decisions"]);
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const visibleLines: string[] = [];
  let hiddenHeadingLevel: number | null = null;

  for (const line of lines) {
    const headingMatch = /^(#{1,6})\s+(.+)$/.exec(line.trim());
    const headingMarks = headingMatch?.[1];
    const headingTitle = headingMatch?.[2];
    const headingLevel = headingMarks?.length;

    if (headingLevel && hiddenHeadingLevel !== null && headingLevel <= hiddenHeadingLevel) {
      hiddenHeadingLevel = null;
    } else if (hiddenHeadingLevel !== null) {
      continue;
    }

    if (headingLevel && headingTitle) {
      const headingText = headingTitle.trim().toLowerCase();
      if (hiddenHeadings.has(headingText)) {
        hiddenHeadingLevel = headingLevel;
        continue;
      }
    }

    visibleLines.push(line);
  }

  return visibleLines.join("\n");
}

function prepareArticleMarkdown(article: KnowledgeBaseArticle, markdown: string) {
  if (article.source !== "phase-02") {
    return markdown;
  }

  return removeInternalMarkdownSections(markdown)
    .replaceAll("Phase II", "Restaurant Operations")
    .replaceAll("Phase 2", "Restaurant Operations")
    .replaceAll("phase-specific", "module-specific")
    .replace(/\bphase\b/g, "module");
}

function statusTone(status: KnowledgeBaseSection["status"]) {
  return status === "Ready" ? "success" : "warning";
}

function getComputationChecks(slug: string): ComputationCheck[] {
  const sharedReceiving = [
    {
      label: "Accepted quantity",
      formula: "Accepted quantity = Delivered quantity - Rejected quantity - Damaged quantity",
      logic:
        "Only accepted quantity is eligible for inventory posting. Rejected and damaged quantities remain evidence/discrepancy records unless a later approved correction posts stock."
    },
    {
      label: "Outstanding purchase order quantity",
      formula: "Outstanding quantity = Ordered quantity - Cumulative accepted quantity - Authorized closed/cancelled quantity",
      logic:
        "A partial receipt keeps the PO open while outstanding quantity remains above zero, unless an authorized close or cancellation is posted."
    }
  ];

  const sharedInventoryBalance = [
    {
      label: "On-hand stock",
      formula: "On hand = Sum of posted signed inventory movements for item + location + lot/expiry/storage keys",
      logic:
        "Inventory balances are derived from the immutable movement ledger. The balance page should reconcile back to the movement rows."
    },
    {
      label: "Balance after movement",
      formula: "Balance after = Previous balance + Signed movement quantity",
      logic:
        "Inbound movement quantities are positive. Outbound, wastage, transfer dispatch, and reversal-out quantities are negative."
    }
  ];

  switch (slug) {
    case "receiving-issued-purchase-orders":
    case "receiving-partial-damaged-or-rejected-deliveries":
    case "understanding-purchase-order-statuses":
      return sharedReceiving;
    case "viewing-stock-balances":
    case "viewing-inventory-ledger":
      return sharedInventoryBalance;
    case "creating-transfer-requests":
    case "dispatching-warehouse-transfers":
    case "receiving-warehouse-transfers":
      return [
        {
          label: "Transfer in-transit quantity",
          formula: "In transit = Dispatched quantity - Accepted received quantity - Settled discrepancy quantity",
          logic:
            "Dispatch reduces source stock. Receipt increases destination stock only for accepted quantity, preventing duplicate inventory."
        },
        {
          label: "Transfer stock impact",
          formula: "Source balance decreases by dispatched quantity; destination balance increases by accepted received quantity",
          logic:
            "A transfer is not complete until the destination receipt confirms accepted quantities and discrepancies are handled."
        }
      ];
    case "running-stock-counts":
      return [
        {
          label: "Count variance",
          formula: "Variance quantity = Counted physical quantity - System on-hand quantity",
          logic:
            "A positive variance increases stock after approval. A negative variance decreases stock after approval."
        },
        {
          label: "Posted count adjustment",
          formula: "Adjustment movement quantity = Approved variance quantity",
          logic:
            "The count does not change stock until the variance is approved and posted through the inventory ledger."
        }
      ];
    case "logging-wastage":
      return [
        {
          label: "Wastage stock impact",
          formula: "New on-hand quantity = Previous on-hand quantity - Approved wastage quantity",
          logic:
            "Wastage posts as a negative inventory movement only after required reason, evidence, and approval controls are satisfied."
        }
      ];
    case "understanding-stock-adjustments":
      return [
        {
          label: "Adjustment stock impact",
          formula: "New on-hand quantity = Previous on-hand quantity +/- Approved adjustment quantity",
          logic:
            "Increase adjustments post positive movements. Decrease adjustments post negative movements. Reversals use equal opposite movements."
        }
      ];
    case "phase-2-recipe-management-workflow":
    case "phase-2-menu-costing-workflow":
    case "phase-2-recipe-costing-ui-spec":
      return [
        {
          label: "Ingredient line cost",
          formula: "Line cost = Recipe quantity converted to supplier price UOM x Supplier unit price",
          logic:
            "If the required UOM conversion or supplier price is missing, the line remains pending and should not be treated as fully costed."
        },
        {
          label: "Recipe plate cost",
          formula: "Recipe plate cost = Sum of all costed ingredient line costs",
          logic:
            "Sub-recipes are link-only unless an approved published sub-recipe cost is available for the selected version."
        },
        {
          label: "Target menu price check",
          formula: "Suggested menu price = Plate cost / Target food cost %",
          logic:
            "Menu price changes remain controlled decisions. Costing does not automatically mutate selling price."
        }
      ];
    case "phase-2-theoretical-vs-actual-food-cost":
      return [
        {
          label: "Theoretical food cost",
          formula: "Theoretical food cost = Units sold x Recipe plate cost",
          logic:
            "This uses approved recipe cost and sales quantity for the selected business date range."
        },
        {
          label: "Actual food cost",
          formula: "Actual food cost = Opening inventory + Purchases/receipts + Transfers in - Transfers out - Closing inventory",
          logic:
            "Actual cost should come from posted inventory and receiving records, not from manual dashboard estimates."
        },
        {
          label: "Food cost percentage",
          formula: "Food cost % = Food cost / Net sales x 100",
          logic:
            "Use the same date range and scope for cost and sales. Variance is Actual food cost - Theoretical food cost."
        }
      ];
    case "phase-2-branch-opening-closing-workflow":
      return [
        {
          label: "Checklist completion",
          formula: "Completion % = Completed required checklist items / Total required checklist items x 100",
          logic:
            "A checklist with unresolved required exceptions should remain open for follow-up rather than being treated as cleanly complete."
        }
      ];
    case "phase-2-food-safety-workflow":
      return [
        {
          label: "Food-safety exception",
          formula: "Exception = Reading value outside configured min/max range or required check not completed",
          logic:
            "Exception counts should be traceable to the exact reading, checklist item, reason, and evidence where required."
        },
        {
          label: "Compliance rate",
          formula: "Compliance rate = Passing checks / Total required checks x 100",
          logic:
            "Use only required checks in the denominator when validating branch compliance."
        }
      ];
    case "phase-2-incident-management-workflow":
      return [
        {
          label: "Incident aging",
          formula: "Aging days = Current date - Incident reported date",
          logic:
            "Resolved or cancelled incidents stop aging for open-queue purposes, but retain audit history."
        },
        {
          label: "Overdue incident",
          formula: "Overdue = Due date is before today and status is not resolved/cancelled",
          logic:
            "Overdue counts should be scoped to the selected company/location and user permissions."
        }
      ];
    case "phase-2-maintenance-workflow":
      return [
        {
          label: "Maintenance SLA due date",
          formula: "Target due date = Requested date + configured SLA for priority/category",
          logic:
            "The due date should not be earlier than the requested date. Priority and category determine expected response timing."
        },
        {
          label: "Downtime duration",
          formula: "Downtime = Restored/completed timestamp - Downtime start timestamp",
          logic:
            "Use this to validate equipment history, SLA reporting, and operational impact."
        }
      ];
    case "phase-2-reporting-and-export-spec":
    case "how-to-export-a-report":
      return [
        {
          label: "Export scope",
          formula: "Export rows = Records matching selected filters + current scope + user permissions",
          logic:
            "The CSV should not include rows hidden from the user in the source workspace."
        }
      ];
    default:
      return [];
  }
}

function renderInline(text: string) {
  const tokens = text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g).filter(Boolean);
  return tokens.map((token, index) => {
    if (token.startsWith("`") && token.endsWith("`")) {
      return (
        <code
          key={`${token}-${index}`}
          className="rounded bg-slate-100 px-1.5 py-0.5 text-[0.92em] font-semibold text-slate-800"
        >
          {token.slice(1, -1)}
        </code>
      );
    }
    if (token.startsWith("**") && token.endsWith("**")) {
      return (
        <strong key={`${token}-${index}`} className="font-bold text-slate-950">
          {renderInline(token.slice(2, -2))}
        </strong>
      );
    }
    return token;
  });
}

function isTableSeparator(line: string) {
  return /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line);
}

function splitTableCells(line: string) {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function isBlockBoundary(line: string, nextLine?: string) {
  return (
    line.trim() === "" ||
    line.startsWith("#") ||
    line.startsWith("- ") ||
    /^\d+\.\s/.test(line) ||
    (line.includes("|") && Boolean(nextLine && isTableSeparator(nextLine)))
  );
}

function MarkdownDocument({ markdown }: { markdown: string }) {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const nodes: ReactNode[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index] ?? "";
    const trimmed = line.trim();

    if (!trimmed) {
      index += 1;
      continue;
    }

    if (trimmed.startsWith("# ")) {
      nodes.push(
        <h1 key={index} className="text-3xl font-bold tracking-normal text-slate-950">
          {renderInline(trimmed.slice(2))}
        </h1>
      );
      index += 1;
      continue;
    }

    if (trimmed.startsWith("## ")) {
      nodes.push(
        <h2 key={index} className="pt-5 text-xl font-bold tracking-normal text-slate-950">
          {renderInline(trimmed.slice(3))}
        </h2>
      );
      index += 1;
      continue;
    }

    if (trimmed.startsWith("### ")) {
      nodes.push(
        <h3 key={index} className="pt-3 text-base font-bold tracking-normal text-slate-950">
          {renderInline(trimmed.slice(4))}
        </h3>
      );
      index += 1;
      continue;
    }

    if (trimmed.includes("|") && isTableSeparator(lines[index + 1] ?? "")) {
      const headers = splitTableCells(trimmed);
      const rows: string[][] = [];
      index += 2;
      while (index < lines.length && lines[index]?.includes("|")) {
        rows.push(splitTableCells(lines[index] ?? ""));
        index += 1;
      }
      nodes.push(
        <div key={index} className="overflow-x-auto rounded-[var(--radius-card)] border border-slate-200">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50">
              <tr>
                {headers.map((header) => (
                  <th
                    key={header}
                    className="px-4 py-3 text-left text-xs font-bold uppercase tracking-[0.04em] text-slate-500"
                  >
                    {renderInline(header)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {rows.map((row, rowIndex) => (
                <tr key={`${row.join("-")}-${rowIndex}`}>
                  {headers.map((header, cellIndex) => (
                    <td key={`${header}-${cellIndex}`} className="px-4 py-3 align-top text-slate-700">
                      {renderInline(row[cellIndex] ?? "")}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      continue;
    }

    if (trimmed.startsWith("- ")) {
      const items: string[] = [];
      while (index < lines.length && lines[index]?.trim().startsWith("- ")) {
        items.push((lines[index] ?? "").trim().slice(2));
        index += 1;
      }
      nodes.push(
        <ul key={index} className="ml-5 list-disc space-y-2 text-sm leading-6 text-slate-700">
          {items.map((item) => (
            <li key={item}>{renderInline(item)}</li>
          ))}
        </ul>
      );
      continue;
    }

    if (/^\d+\.\s/.test(trimmed)) {
      const items: string[] = [];
      while (index < lines.length && /^\d+\.\s/.test(lines[index]?.trim() ?? "")) {
        items.push((lines[index] ?? "").trim().replace(/^\d+\.\s/, ""));
        index += 1;
      }
      nodes.push(
        <ol key={index} className="ml-5 list-decimal space-y-2 text-sm leading-6 text-slate-700">
          {items.map((item) => (
            <li key={item}>{renderInline(item)}</li>
          ))}
        </ol>
      );
      continue;
    }

    if (trimmed.startsWith("[Screenshot placeholder:")) {
      nodes.push(
        <div
          key={index}
          className="rounded-[var(--radius-card)] border border-dashed border-blue-200 bg-blue-50 px-4 py-3 text-sm font-medium text-blue-900"
        >
          {trimmed.replace(/^\[|\]$/g, "")}
        </div>
      );
      index += 1;
      continue;
    }

    const paragraph: string[] = [];
    while (
      index < lines.length &&
      !isBlockBoundary(lines[index] ?? "", lines[index + 1])
    ) {
      paragraph.push((lines[index] ?? "").trim().replace(/  $/, ""));
      index += 1;
    }
    nodes.push(
      <p key={index} className="text-sm leading-7 text-slate-700">
        {renderInline(paragraph.join(" "))}
      </p>
    );
  }

  return <div className="space-y-5">{nodes}</div>;
}

export default async function KnowledgeBasePage({
  searchParams
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getSessionContext();
  if (!session) {
    redirect("/sign-in");
  }

  const params = searchParams ? await searchParams : {};
  const selectedSlug = getSearchParam(params, "article");
  const defaultArticle = allArticles[0];
  if (!defaultArticle) {
    throw new Error("KNOWLEDGE_BASE_ARTICLE_CATALOG_EMPTY");
  }
  const selectedArticle =
    allArticles.find((article) => article.slug === selectedSlug) ?? defaultArticle;
  const markdown = await readKnowledgeBaseArticle(selectedArticle);
  const computationChecks = getComputationChecks(selectedArticle.slug);

  return (
    <AppShell
      session={session}
      title="Knowledge Base"
      subtitle="User-facing guides with what, where, how, expected results, and controls"
      activeNav="knowledge-base"
    >
      <div className="ogfi-coordination-cue">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">
              <strong>This is the ERP help reader.</strong> The article content below is
              pulled from the approved knowledge-base documentation, not from mock links.
            </p>
            <p className="mt-1 text-xs text-blue-900/75">
              Use workspace buttons only after reading the guide. The KB explains the
              workflow; operational source records still live in their proper modules.
            </p>
          </div>
          <Badge tone="info">Documentation</Badge>
        </div>
      </div>

      <div className="mb-5 grid gap-4 md:grid-cols-3">
        <Panel className="ogfi-detail-card">
          <p className="text-sm font-semibold text-slate-500">Guide sections</p>
          <p className="mt-2 text-3xl font-bold text-slate-950">
            {knowledgeBaseSections.length}
          </p>
        </Panel>
        <Panel className="ogfi-detail-card">
          <p className="text-sm font-semibold text-slate-500">Readable articles</p>
          <p className="mt-2 text-3xl font-bold text-blue-700">{articleCount}</p>
        </Panel>
        <Panel className="ogfi-detail-card">
          <p className="text-sm font-semibold text-slate-500">Current article</p>
          <p className="mt-2 text-lg font-bold text-slate-950">{selectedArticle.sectionTitle}</p>
        </Panel>
      </div>

      <div className="grid gap-5 xl:grid-cols-[360px_1fr]">
        <aside className="ogfi-data-surface overflow-hidden">
          <div className="ogfi-section-header">
            <div>
              <h2 className="text-lg font-bold text-slate-950">Article Library</h2>
              <p className="text-sm text-slate-500">Choose a guide to read inside the ERP.</p>
            </div>
          </div>
          <div className="max-h-[72vh] overflow-y-auto px-4 pb-4">
            {knowledgeBaseSections.map((section) => (
              <div key={section.title} className="border-b border-slate-100 py-4 last:border-b-0">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-bold text-slate-950">{section.title}</h3>
                    <p className="mt-1 text-xs leading-5 text-slate-500">{section.description}</p>
                  </div>
                  <Badge tone={statusTone(section.status)} size="sm">
                    {section.status}
                  </Badge>
                </div>
                <div className="space-y-1.5">
                  {section.articles.map((article) => {
                    const active = article.slug === selectedArticle.slug;
                    return (
                      <a
                        key={article.slug}
                        className={
                          active
                            ? "block rounded-[var(--radius-control)] border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-bold text-blue-800"
                            : "block rounded-[var(--radius-control)] px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 hover:text-slate-950"
                        }
                        href={`/knowledge-base?article=${article.slug}`}
                      >
                        {article.title}
                      </a>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </aside>

        <article className="ogfi-data-surface overflow-hidden">
          <div className="ogfi-section-header gap-4">
            <div>
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <Badge tone="info">{selectedArticle.sectionTitle}</Badge>
                <Badge tone="neutral">Read-only guide</Badge>
              </div>
              <h2 className="text-xl font-bold text-slate-950">{selectedArticle.title}</h2>
              <p className="mt-1 text-sm text-slate-500">
                Source: {getArticleSourceLabel(selectedArticle)}
              </p>
            </div>
            {selectedArticle.workspaceHref ? (
              <ButtonLink
                href={selectedArticle.workspaceHref}
                tone="secondary"
                className="min-h-10 border border-blue-200 bg-blue-50 font-bold !text-blue-800 hover:bg-blue-100"
              >
                {selectedArticle.workspaceLabel}
              </ButtonLink>
            ) : null}
          </div>
          <div className="px-5 py-6">
            {computationChecks.length > 0 ? (
              <section className="mb-6 rounded-[var(--radius-card)] border border-blue-200 bg-blue-50/70 p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-base font-bold text-slate-950">Computation checks</h3>
                    <p className="mt-1 text-sm text-blue-900/75">
                      Use these formulas to verify system values after creating or posting entries.
                    </p>
                  </div>
                  <Badge tone="info">Formula</Badge>
                </div>
                <div className="grid gap-3 lg:grid-cols-2">
                  {computationChecks.map((check) => (
                    <div
                      key={check.label}
                      className="rounded-[var(--radius-card)] border border-blue-100 bg-white p-4 shadow-sm"
                    >
                      <p className="text-sm font-bold text-slate-950">{check.label}</p>
                      <p className="mt-2 rounded bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-800">
                        {check.formula}
                      </p>
                      <p className="mt-2 text-sm leading-6 text-slate-600">{check.logic}</p>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}
            <MarkdownDocument markdown={markdown} />
          </div>
        </article>
      </div>
    </AppShell>
  );
}
