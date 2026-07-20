import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Badge, ButtonLink, Panel } from "@ogfi/ui";
import { AppShell } from "@/components/AppShell";
import {
  runApprovalReminderScan
} from "@/server/services/approvals";
import { getSessionContext } from "@/server/services/context";
import {
  archiveNotification,
  listNotifications,
  markNotificationRead
} from "@/server/services/notifications";
import { runProjectTaskDeadlineReminderScan } from "@/server/services/projectNotifications";
import {
  canUseBranchOperations,
  canUseFoodSafety,
  canUseIncidents,
  canUseMaintenance,
  canUseRecipesAndCosting,
  permissions
} from "@/server/services/authorization";
import { runRestaurantOpsExceptionReminderScan } from "@/server/services/restaurantOpsNotifications";

export const dynamic = "force-dynamic";

type NotificationsPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

const notificationGroups = [
  "All",
  "Approvals",
  "Projects",
  "Restaurant Ops",
  "Other"
] as const;
type NotificationGroup = (typeof notificationGroups)[number];

function getSearchParam(
  searchParams: Record<string, string | string[] | undefined>,
  key: string
) {
  const value = searchParams[key];
  return Array.isArray(value) ? value[0] : value;
}

function normalizeStatus(value?: string) {
  return value === "UNREAD" || value === "ARCHIVED" ? value : "ALL";
}

function normalizeGroup(value?: string): NotificationGroup {
  const decoded = value?.replaceAll("-", " ");
  return notificationGroups.includes(decoded as NotificationGroup)
    ? (decoded as NotificationGroup)
    : "All";
}

function notificationGroupForType(notificationType: string): NotificationGroup {
  if (notificationType.startsWith("APPROVE_") || notificationType === "APPROVAL_OVERDUE") {
    return "Approvals";
  }
  if (notificationType.startsWith("PROJECT_")) {
    return "Projects";
  }
  if (
    [
      "FOOD_COST_EXCEPTION",
      "BRANCH_CHECKLIST_REVIEW_READY",
      "BRANCH_CHECKLIST_EXCEPTION",
      "FOOD_SAFETY_REVIEW_READY",
      "FOOD_SAFETY_EXCEPTION",
      "OPERATIONAL_INCIDENT_OPEN",
      "MAINTENANCE_FOLLOW_UP"
    ].includes(notificationType)
  ) {
    return "Restaurant Ops";
  }
  return "Other";
}

function buildQueryHref(
  basePath: string,
  params: Record<string, string | null | undefined>
) {
  const url = new URL(basePath, "http://localhost");
  for (const [key, value] of Object.entries(params)) {
    if (value) {
      url.searchParams.set(key, value);
    }
  }
  return `${url.pathname}${url.search}`;
}

function appendInboxFilterParams(params: URLSearchParams, formData: FormData) {
  const status = normalizeStatus(String(formData.get("status") ?? ""));
  const group = normalizeGroup(String(formData.get("group") ?? ""));
  if (status !== "ALL") {
    params.set("status", status);
  }
  if (group !== "All") {
    params.set("group", group.replaceAll(" ", "-"));
  }
}

function priorityTone(priority: string) {
  if (priority === "CRITICAL" || priority === "HIGH") {
    return "warning" as const;
  }
  if (priority === "INFORMATIONAL") {
    return "neutral" as const;
  }
  return "info" as const;
}

async function markReadAction(formData: FormData) {
  "use server";

  const session = await getSessionContext();
  if (!session) {
    redirect("/sign-in");
  }

  await markNotificationRead(session, String(formData.get("id")));
  revalidatePath("/notifications");
}

async function archiveAction(formData: FormData) {
  "use server";

  const session = await getSessionContext();
  if (!session) {
    redirect("/sign-in");
  }

  await archiveNotification(session, String(formData.get("id")));
  revalidatePath("/notifications");
}

async function scanDeadlineRemindersAction(formData: FormData) {
  "use server";

  const session = await getSessionContext();
  if (!session) {
    redirect("/sign-in");
  }

  const result = await runProjectTaskDeadlineReminderScan(session);
  const params = new URLSearchParams({
    scanned: String(result.scannedTaskCount),
    reminders: String(result.reminderCount)
  });
  appendInboxFilterParams(params, formData);
  revalidatePath("/notifications");
  redirect(`/notifications?${params.toString()}`);
}

async function scanApprovalRemindersAction(formData: FormData) {
  "use server";

  const session = await getSessionContext();
  if (!session) {
    redirect("/sign-in");
  }

  const result = await runApprovalReminderScan(session);
  const params = new URLSearchParams({
    approvalScanned: String(result.scannedApprovalCount),
    approvalReminders: String(result.reminderCount)
  });
  appendInboxFilterParams(params, formData);
  revalidatePath("/notifications");
  redirect(`/notifications?${params.toString()}`);
}

async function scanRestaurantOpsRemindersAction(formData: FormData) {
  "use server";

  const session = await getSessionContext();
  if (!session) {
    redirect("/sign-in");
  }

  const result = await runRestaurantOpsExceptionReminderScan(session);
  const params = new URLSearchParams({
    restaurantOpsScanned: String(result.scannedExceptionCount),
    restaurantOpsReminders: String(result.reminderCount)
  });
  appendInboxFilterParams(params, formData);
  revalidatePath("/notifications");
  redirect(`/notifications?${params.toString()}`);
}

export default async function NotificationsPage({
  searchParams
}: NotificationsPageProps) {
  const session = await getSessionContext();
  if (!session) {
    redirect("/sign-in");
  }

  const params = searchParams ? await searchParams : {};
  const status = normalizeStatus(getSearchParam(params, "status"));
  const group = normalizeGroup(getSearchParam(params, "group"));
  const scannedTaskCount = getSearchParam(params, "scanned");
  const reminderCount = getSearchParam(params, "reminders");
  const scannedApprovalCount = getSearchParam(params, "approvalScanned");
  const approvalReminderCount = getSearchParam(params, "approvalReminders");
  const scannedRestaurantOpsCount = getSearchParam(params, "restaurantOpsScanned");
  const restaurantOpsReminderCount = getSearchParam(
    params,
    "restaurantOpsReminders"
  );
  const scanSummary =
    scannedTaskCount && reminderCount
      ? `${scannedTaskCount} tasks scanned / ${reminderCount} reminder groups generated`
      : null;
  const approvalScanSummary =
    scannedApprovalCount && approvalReminderCount
      ? `${scannedApprovalCount} approvals scanned / ${approvalReminderCount} reminders generated`
      : null;
  const restaurantOpsScanSummary =
    scannedRestaurantOpsCount && restaurantOpsReminderCount
      ? `${scannedRestaurantOpsCount} restaurant exceptions scanned / ${restaurantOpsReminderCount} reminders generated`
      : null;
  const notifications = await listNotifications(session, { status });
  const visibleNotifications =
    group === "All"
      ? notifications
      : notifications.filter(
          (notification) => notificationGroupForType(notification.notificationType) === group
        );
  const unreadCount = notifications.filter(
    (notification) => notification.status === "UNREAD"
  ).length;
  const actionCount = notifications.filter(
    (notification) => notification.priority !== "INFORMATIONAL"
  ).length;
  const canRunProjectReminderScan = session.permissionCodes.includes(
    permissions.projectManage
  );
  const canRunApprovalReminderScan = [
    permissions.purchaseRequestApprove,
    permissions.quoteApprove,
    permissions.purchaseOrderApprove,
    permissions.wastageApprove,
    permissions.stockAdjustmentApprove
  ].some((permission) => session.permissionCodes.includes(permission));
  const canRunRestaurantOpsReminderScan =
    canUseRecipesAndCosting(session.permissionCodes) ||
    canUseBranchOperations(session.permissionCodes) ||
    canUseFoodSafety(session.permissionCodes) ||
    canUseIncidents(session.permissionCodes) ||
    canUseMaintenance(session.permissionCodes);

  return (
    <AppShell
      session={session}
      title="Notifications"
      subtitle="Scoped in-app workflow notifications"
      activeNav="notifications"
    >
      <div className="mb-5 grid gap-4 md:grid-cols-3">
        <Panel>
          <p className="text-sm font-semibold text-slate-500">Visible notifications</p>
          <p className="mt-2 text-3xl font-bold text-slate-950">
            {notifications.length}
          </p>
        </Panel>
        <Panel>
          <p className="text-sm font-semibold text-slate-500">Unread</p>
          <p className="mt-2 text-3xl font-bold text-blue-700">{unreadCount}</p>
        </Panel>
        <Panel>
          <p className="text-sm font-semibold text-slate-500">Actionable priority</p>
          <p className="mt-2 text-3xl font-bold text-amber-700">{actionCount}</p>
        </Panel>
      </div>
      {canRunProjectReminderScan ? (
        <Panel className="mb-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-bold text-slate-900">Project deadline reminders</p>
              <p className="text-sm text-slate-500">
                Manual in-app reminder scan for configured project due dates
              </p>
            </div>
            <form action={scanDeadlineRemindersAction}>
              <input name="status" type="hidden" value={status} />
              <input name="group" type="hidden" value={group} />
              <button className="inline-flex min-h-10 items-center justify-center rounded-md bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700">
                Scan Reminders
              </button>
            </form>
          </div>
          {scanSummary ? (
            <p className="mt-3 text-sm font-semibold text-blue-700">{scanSummary}</p>
          ) : null}
        </Panel>
      ) : null}
      {canRunApprovalReminderScan ? (
        <Panel className="mb-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-bold text-slate-900">Approval reminders</p>
              <p className="text-sm text-slate-500">
                Manual in-app scan for your due and overdue approval queue
              </p>
            </div>
            <form action={scanApprovalRemindersAction}>
              <input name="status" type="hidden" value={status} />
              <input name="group" type="hidden" value={group} />
              <button className="inline-flex min-h-10 items-center justify-center rounded-md bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700">
                Scan Approvals
              </button>
            </form>
          </div>
          {approvalScanSummary ? (
            <p className="mt-3 text-sm font-semibold text-blue-700">
              {approvalScanSummary}
            </p>
          ) : null}
        </Panel>
      ) : null}
      {canRunRestaurantOpsReminderScan ? (
        <Panel className="mb-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-bold text-slate-900">
                Restaurant operations exceptions
              </p>
              <p className="text-sm text-slate-500">
                Manual scan for food-cost, checklist review, food-safety review,
                incident, and maintenance follow-ups in your authorized scope
              </p>
            </div>
            <form action={scanRestaurantOpsRemindersAction}>
              <input name="status" type="hidden" value={status} />
              <input name="group" type="hidden" value={group} />
              <button className="inline-flex min-h-10 items-center justify-center rounded-md bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700">
                Scan Restaurant Ops
              </button>
            </form>
          </div>
          {restaurantOpsScanSummary ? (
            <p className="mt-3 text-sm font-semibold text-blue-700">
              {restaurantOpsScanSummary}
            </p>
          ) : null}
        </Panel>
      ) : null}

      <section className="rounded-lg border border-slate-200 bg-white">
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-950">Notification Center</h2>
            <p className="text-sm text-slate-500">
              Read status never changes the source workflow state
            </p>
          </div>
          <form className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              Status
              <select
                className="rounded-md border border-slate-300 px-3 py-2"
                defaultValue={status}
                name="status"
              >
                <option value="ALL">Active</option>
                <option value="UNREAD">Unread</option>
                <option value="ARCHIVED">Archived</option>
              </select>
            </label>
            <input name="group" type="hidden" value={group} />
            <button className="inline-flex min-h-10 items-center justify-center rounded-md bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700">
              Apply
            </button>
          </form>
        </div>

        <div className="border-b border-slate-100 px-4 py-3">
          <div className="grid gap-2 md:grid-cols-5">
            {notificationGroups.map((tab) => {
              const count =
                tab === "All"
                  ? notifications.length
                  : notifications.filter(
                      (notification) =>
                        notificationGroupForType(notification.notificationType) === tab
                    ).length;
              const active = group === tab;
              return (
                <a
                  key={tab}
                  className={
                    active
                      ? "rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-blue-800 shadow-sm"
                      : "rounded-xl border border-transparent px-4 py-3 text-slate-600 hover:border-slate-200 hover:bg-slate-50 hover:text-slate-950"
                  }
                  href={buildQueryHref("/notifications", {
                    status: status === "ALL" ? null : status,
                    group: tab === "All" ? null : tab.replaceAll(" ", "-")
                  })}
                >
                  <span className="block text-sm font-bold">{tab}</span>
                  <span className="mt-1 block text-xs font-semibold text-slate-500">
                    {count} item{count === 1 ? "" : "s"}
                  </span>
                </a>
              );
            })}
          </div>
        </div>

        {visibleNotifications.length === 0 ? (
          <div className="p-5">
            <p className="font-semibold text-slate-900">No notifications found</p>
            <p className="mt-1 text-sm text-slate-600">
              Assigned approvals and controlled workflow updates will appear here when
              they are addressed to your authorized scope.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {visibleNotifications.map((notification) => (
              <div
                key={notification.id}
                data-testid="notification-row"
                className="grid gap-3 p-5 lg:grid-cols-[1fr_auto]"
              >
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={priorityTone(notification.priority)}>
                      {notification.priority}
                    </Badge>
                    <Badge
                      tone={notification.status === "UNREAD" ? "info" : "neutral"}
                    >
                      {notification.status}
                    </Badge>
                    <span className="text-xs font-semibold uppercase text-slate-400">
                      {notification.notificationType.replaceAll("_", " ")}
                    </span>
                  </div>
                  <h3 className="mt-2 text-lg font-bold text-slate-950">
                    {notification.title}
                  </h3>
                  <p className="mt-1 text-sm text-slate-600">{notification.body}</p>
                  <p className="mt-2 text-xs text-slate-500">
                    {new Date(notification.generatedAt).toLocaleString()} /{" "}
                    {notification.entityType}
                  </p>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row lg:flex-col">
                  <ButtonLink
                    href={notification.deepLink}
                    className="min-h-9 bg-slate-100 text-blue-700 hover:bg-blue-50"
                  >
                    Open Record
                  </ButtonLink>
                  {notification.status === "UNREAD" ? (
                    <form action={markReadAction}>
                      <input name="id" type="hidden" value={notification.id} />
                      <button className="inline-flex min-h-9 w-full items-center justify-center rounded-md bg-white px-4 text-sm font-semibold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50">
                        Mark Read
                      </button>
                    </form>
                  ) : null}
                  {notification.archivedAt ? null : (
                    <form action={archiveAction}>
                      <input name="id" type="hidden" value={notification.id} />
                      <button className="inline-flex min-h-9 w-full items-center justify-center rounded-md bg-white px-4 text-sm font-semibold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50">
                        Archive
                      </button>
                    </form>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </AppShell>
  );
}
