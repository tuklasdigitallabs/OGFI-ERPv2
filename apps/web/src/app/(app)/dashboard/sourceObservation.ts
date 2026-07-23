export const DASHBOARD_TIME_ZONE = "Asia/Manila";

const dashboardCheckedAtFormatter = new Intl.DateTimeFormat("en-PH", {
  timeZone: DASHBOARD_TIME_ZONE,
  year: "numeric",
  month: "short",
  day: "2-digit",
  hour: "numeric",
  minute: "2-digit",
  second: "2-digit",
  hour12: true,
  timeZoneName: "short"
});

export function formatDashboardCheckedAt(value: string) {
  const checkedAt = new Date(value);
  if (Number.isNaN(checkedAt.getTime())) {
    return `Time unavailable (${DASHBOARD_TIME_ZONE})`;
  }

  return `${dashboardCheckedAtFormatter.format(checkedAt)} (${DASHBOARD_TIME_ZONE})`;
}
