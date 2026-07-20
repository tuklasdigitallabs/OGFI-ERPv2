import { describe, expect, test } from "vitest";
import {
  dateOnlyInTimeZone,
  dateOnlyString,
  daysBetweenDateOnly,
  isProjectTaskOverdue,
  parseDateOnlyUtc,
  projectDateWindowBounds,
  projectTaskDaysUntilDue,
  projectTaskDueDateString,
  projectTaskDueState
} from "./projectDates";

describe("project date helpers", () => {
  test("date-only timezone rendering uses the configured company day", () => {
    const lateUtc = new Date("2026-06-29T16:30:00.000Z");

    expect(dateOnlyInTimeZone(lateUtc, "Asia/Manila")).toBe("2026-06-30");
    expect(dateOnlyInTimeZone(lateUtc, "UTC")).toBe("2026-06-29");
  });

  test("task due-date strings prefer dueDate and preserve date-only values", () => {
    expect(
      projectTaskDueDateString({
        dueDate: "2026-07-04T18:00:00.000Z",
        dueAt: "2026-07-05T00:00:00.000Z"
      })
    ).toBe("2026-07-04");
    expect(
      projectTaskDueDateString({
        dueDate: null,
        dueAt: new Date("2026-07-05T00:00:00.000Z")
      })
    ).toBe("2026-07-05");
    expect(dateOnlyString(null)).toBeNull();
  });

  test("strict date-only parsing rejects malformed calendar dates", () => {
    expect(parseDateOnlyUtc("2026-07-04")?.toISOString()).toBe(
      "2026-07-04T00:00:00.000Z"
    );
    expect(parseDateOnlyUtc("2026-02-31")).toBeNull();
    expect(parseDateOnlyUtc("2026-13-01")).toBeNull();
    expect(parseDateOnlyUtc("not-a-date")).toBeNull();
  });

  test("day math is based on calendar dates, not elapsed hours", () => {
    expect(daysBetweenDateOnly("2026-06-30", "2026-07-02")).toBe(2);
    expect(daysBetweenDateOnly("2026-07-02", "2026-06-30")).toBe(-2);
  });

  test("calendar date windows include the full selected end date", () => {
    const bounds = projectDateWindowBounds({
      from: "2026-07-01",
      to: "2026-07-03"
    });

    expect(bounds.fromDate.toISOString()).toBe("2026-07-01T00:00:00.000Z");
    expect(bounds.toDateExclusive.toISOString()).toBe("2026-07-04T00:00:00.000Z");
  });

  test("calendar date windows fall back to a one-day range when inverted", () => {
    const bounds = projectDateWindowBounds({
      from: "2026-07-03",
      to: "2026-07-01"
    });

    expect(bounds.fromDate.toISOString()).toBe("2026-07-03T00:00:00.000Z");
    expect(bounds.toDateExclusive.toISOString()).toBe("2026-07-04T00:00:00.000Z");
  });

  test("due-state helpers treat terminal tasks as on time", () => {
    const asOf = new Date("2026-06-30T01:00:00.000Z");

    expect(
      projectTaskDaysUntilDue({
        dueDate: "2026-07-02",
        asOf,
        timeZone: "Asia/Manila"
      })
    ).toBe(2);
    expect(
      projectTaskDueState({
        dueDate: "2026-06-29",
        status: "IN_PROGRESS",
        asOf,
        timeZone: "Asia/Manila"
      })
    ).toEqual({ dueState: "OVERDUE", overdueDays: 1 });
    expect(
      projectTaskDueState({
        dueDate: "2026-06-30",
        status: "BLOCKED",
        asOf,
        timeZone: "Asia/Manila"
      })
    ).toEqual({ dueState: "DUE_TODAY", overdueDays: 0 });
    expect(
      projectTaskDueState({
        dueDate: "2026-06-29",
        status: "COMPLETED",
        asOf,
        timeZone: "Asia/Manila"
      })
    ).toEqual({ dueState: "ON_TIME", overdueDays: 0 });
    expect(
      isProjectTaskOverdue({
        dueDate: "2026-06-29",
        status: "IN_PROGRESS",
        asOf,
        timeZone: "Asia/Manila"
      })
    ).toBe(true);
  });
});
