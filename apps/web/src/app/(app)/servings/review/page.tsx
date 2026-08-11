import { redirect } from "next/navigation";
import { Badge, ButtonLink, EmptyState, PaginationBar } from "@ogfi/ui";
import { AppShell } from "@/components/AppShell";
import { ServingsWorkspaceTabs } from "@/components/ServingsWorkspaceTabs";
import {
  getGrantedPermissionCodes,
  permissions,
} from "@/server/services/authorization";
import { getSessionContext } from "@/server/services/context";
import { getRestaurantConsumptionWorkspace } from "@/server/services/restaurantConsumption";

export const dynamic = "force-dynamic";

type ReviewQueue = "verification" | "blocked" | "posting";

const queueStatus: Record<ReviewQueue, string> = {
  verification: "SUBMITTED",
  blocked: "DERIVATION_BLOCKED",
  posting: "READY_TO_POST",
};

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function reviewHref(queue: ReviewQueue, page = 1) {
  const params = new URLSearchParams({ queue });
  if (page > 1) params.set("page", String(page));
  return `/servings/review?${params.toString()}`;
}

function statusTone(status: string) {
  if (status === "READY_TO_POST") return "success" as const;
  return "warning" as const;
}

export default async function RestaurantConsumptionReviewPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getSessionContext();
  if (!session) redirect("/sign-in");
  const grantedPermissionCodes = await getGrantedPermissionCodes(session);
  const canVerify = grantedPermissionCodes.includes(
    permissions.consumptionVerify,
  );
  const canPost = grantedPermissionCodes.includes(permissions.consumptionPost);
  if (!canVerify && !canPost) redirect("/servings");

  const params = searchParams ? await searchParams : {};
  const requestedQueue = firstParam(params.queue);
  const permittedQueues: ReviewQueue[] = [
    ...(canVerify ? (["verification", "blocked"] as const) : []),
    ...(canPost || canVerify ? (["posting"] as const) : []),
  ];
  const queue = permittedQueues.includes(requestedQueue as ReviewQueue)
    ? (requestedQueue as ReviewQueue)
    : permittedQueues[0]!;
  const rawPage = firstParam(params.page);
  const workspace = await getRestaurantConsumptionWorkspace(session, {
    status: queueStatus[queue] as
      | "SUBMITTED"
      | "DERIVATION_BLOCKED"
      | "READY_TO_POST",
    page: rawPage && /^[1-9]\d*$/.test(rawPage) ? Number(rawPage) : 1,
    pageSize: 25,
  });

  const queueCards = [
    ...(canVerify
      ? [
          {
            id: "verification" as const,
            label: "Needs verification",
            count: workspace.statusCounts.SUBMITTED ?? 0,
            description: "Submitted serving facts awaiting manager review",
          },
          {
            id: "blocked" as const,
            label: "Derivation blocked",
            count: workspace.statusCounts.DERIVATION_BLOCKED ?? 0,
            description: "Verified facts with recipe or UOM blockers",
          },
        ]
      : []),
    {
      id: "posting" as const,
      label: "Ready to post",
      count: workspace.statusCounts.READY_TO_POST ?? 0,
      description: canPost
        ? "Complete snapshots awaiting expected-consumption posting"
        : "Complete snapshots available for final verification review",
    },
  ];

  return (
    <AppShell
      activeNav="servings"
      session={session}
      subtitle="Serving facts, controlled review, expected-consumption posting, and branch configuration"
      title="Servings & Consumption"
    >
      <div className="grid gap-5">
        <ServingsWorkspaceTabs
          active="review"
          permissionCodes={grantedPermissionCodes}
        />
        <section className="grid gap-3 md:grid-cols-3">
          {queueCards.map((card) => (
            <a
              aria-current={queue === card.id ? "page" : undefined}
              className={
                queue === card.id
                  ? "rounded-xl border border-blue-300 bg-blue-50 p-4 shadow-sm"
                  : "ogfi-data-surface p-4 hover:border-blue-200 hover:bg-blue-50/40"
              }
              href={reviewHref(card.id)}
              key={card.id}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-bold text-slate-950">{card.label}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {card.description}
                  </p>
                </div>
                <span className="text-2xl font-bold text-blue-700">
                  {card.count}
                </span>
              </div>
            </a>
          ))}
        </section>

        <section className="ogfi-data-surface overflow-hidden">
          <div className="ogfi-section-header">
            <div>
              <h2 className="text-lg font-bold text-slate-950">
                {queueCards.find((card) => card.id === queue)?.label}
              </h2>
              <p className="text-sm text-slate-500">
                Open a declaration to perform only the actions allowed by your
                current permission, exact branch scope, and segregation rules.
              </p>
            </div>
            <Badge tone={queue === "posting" ? "success" : "warning"}>
              {workspace.totalItems} IN QUEUE
            </Badge>
          </div>
          {workspace.declarations.length ? (
            <div className="divide-y divide-slate-200">
              {workspace.declarations.map((declaration: any) => (
                <a
                  className="grid min-h-16 gap-2 px-4 py-3 hover:bg-blue-50 md:grid-cols-[9rem_9rem_minmax(12rem,1fr)_10rem_auto] md:items-center"
                  href={`/servings/${declaration.id}`}
                  key={declaration.id}
                >
                  <span className="font-semibold text-slate-950">
                    {new Date(declaration.businessDate)
                      .toISOString()
                      .slice(0, 10)}
                  </span>
                  <span className="text-sm text-slate-600">
                    {declaration.servicePeriodCode}
                  </span>
                  <span className="text-sm text-slate-600">
                    {declaration.lines.length} menu line
                    {declaration.lines.length === 1 ? "" : "s"} ·{" "}
                    {declaration.lines
                      .reduce(
                        (sum: number, line: any) =>
                          sum + Number(line.quantityServed),
                        0,
                      )
                      .toLocaleString()}{" "}
                    servings
                  </span>
                  <Badge tone={statusTone(declaration.status)}>
                    {declaration.status.replaceAll("_", " ")}
                  </Badge>
                  <span className="text-sm font-semibold text-blue-700">
                    Review
                  </span>
                </a>
              ))}
            </div>
          ) : (
            <div className="p-5">
              <EmptyState
                description="There are no declarations requiring action in this queue for the selected branch."
                title="Queue is clear"
              />
            </div>
          )}
          {workspace.totalItems > 0 ? (
            <PaginationBar
              getPageHref={(page) => reviewHref(queue, page)}
              itemLabel="serving declarations"
              page={workspace.page}
              pageSize={workspace.pageSize}
              totalItems={workspace.totalItems}
            />
          ) : null}
        </section>
        <div>
          <ButtonLink href="/servings" tone="secondary">
            Back to all declarations
          </ButtonLink>
        </div>
      </div>
    </AppShell>
  );
}
