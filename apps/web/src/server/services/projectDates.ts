const defaultProjectTimeZone = "Asia/Manila";

export function dateOnlyInTimeZone(
  value: Date,
  timeZone = defaultProjectTimeZone
) {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(value);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  if (!year || !month || !day) {
    return value.toISOString().slice(0, 10);
  }
  return `${year}-${month}-${day}`;
}

export function dateOnlyString(value: Date | string | null | undefined) {
  if (!value) {
    return null;
  }
  if (typeof value === "string") {
    return value.slice(0, 10);
  }
  return value.toISOString().slice(0, 10);
}

export function projectTaskDueDateString(input: {
  dueDate?: Date | string | null;
  dueAt?: Date | string | null;
}) {
  return dateOnlyString(input.dueDate ?? input.dueAt ?? null);
}

export function daysBetweenDateOnly(fromDate: string, toDate: string) {
  const [fromYear = 0, fromMonth = 1, fromDay = 1] = fromDate
    .split("-")
    .map(Number);
  const [toYear = 0, toMonth = 1, toDay = 1] = toDate.split("-").map(Number);
  const fromTime = Date.UTC(fromYear, fromMonth - 1, fromDay);
  const toTime = Date.UTC(toYear, toMonth - 1, toDay);
  return Math.floor((toTime - fromTime) / 86_400_000);
}

function dateOnlyUtcStart(value: string) {
  const [year = 0, month = 1, day = 1] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function addUtcDays(value: Date, days: number) {
  return new Date(value.getTime() + days * 86_400_000);
}

export function projectDateWindowBounds(input: { from: string; to: string }) {
  const fromDate = dateOnlyUtcStart(input.from);
  const toDateExclusive = addUtcDays(dateOnlyUtcStart(input.to), 1);

  if (toDateExclusive.getTime() <= fromDate.getTime()) {
    return {
      fromDate,
      toDateExclusive: addUtcDays(fromDate, 1)
    };
  }

  return { fromDate, toDateExclusive };
}

export function projectTaskDaysUntilDue(input: {
  dueDate?: Date | string | null;
  dueAt?: Date | string | null;
  asOf?: Date;
  timeZone?: string;
}) {
  const dueDate = projectTaskDueDateString(input);
  if (!dueDate) {
    return null;
  }
  const asOfDate = dateOnlyInTimeZone(
    input.asOf ?? new Date(),
    input.timeZone ?? defaultProjectTimeZone
  );
  return daysBetweenDateOnly(asOfDate, dueDate);
}

export function projectTaskDueState(input: {
  dueDate?: Date | string | null;
  dueAt?: Date | string | null;
  status: string;
  asOf?: Date;
  timeZone?: string;
}) {
  if (["COMPLETED", "CANCELLED"].includes(input.status)) {
    return { dueState: "ON_TIME" as const, overdueDays: 0 };
  }
  const dueDate = projectTaskDueDateString(input);
  if (!dueDate) {
    return { dueState: "ON_TIME" as const, overdueDays: 0 };
  }
  const asOfDate = dateOnlyInTimeZone(
    input.asOf ?? new Date(),
    input.timeZone ?? defaultProjectTimeZone
  );
  const dayDelta = daysBetweenDateOnly(dueDate, asOfDate);
  if (dayDelta > 0) {
    return { dueState: "OVERDUE" as const, overdueDays: dayDelta };
  }
  if (dayDelta === 0) {
    return { dueState: "DUE_TODAY" as const, overdueDays: 0 };
  }
  return { dueState: "ON_TIME" as const, overdueDays: 0 };
}

export function isProjectTaskOverdue(input: Parameters<typeof projectTaskDueState>[0]) {
  return projectTaskDueState(input).dueState === "OVERDUE";
}
