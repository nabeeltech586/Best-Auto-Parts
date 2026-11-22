import { describe, expect, it } from "vitest";
import {
  editConditionConfig,
  isValidTimeZone,
  isWithinTimeWindow,
  listTimeZones,
  minutesInTimeZone,
  withConditionTimezone,
} from "./time-of-day";

const at = (iso: string) => new Date(iso);

describe("time_of_day evaluation", () => {
  it("reads the wall clock of the given zone, not the server's", () => {
    expect(minutesInTimeZone(at("2026-01-15T23:30:00Z"), "UTC")).toBe(23 * 60 + 30);
    expect(minutesInTimeZone(at("2026-01-15T23:30:00Z"), "Asia/Seoul")).toBe(8 * 60 + 30);
    expect(minutesInTimeZone(at("2026-01-15T00:05:00Z"), "America/Sao_Paulo")).toBe(21 * 60 + 5);
  });

  it("reports midnight as 0 minutes", () => {
    expect(minutesInTimeZone(at("2026-01-15T00:00:00Z"), "UTC")).toBe(0);
  });

  it("handles over-midnight windows in the account's zone", () => {
    const night = "18:00-09:00";
    expect(isWithinTimeWindow(night, at("2026-01-15T10:00:00Z"), "Asia/Seoul")).toBe(true);
    expect(isWithinTimeWindow(night, at("2026-01-15T10:00:00Z"), "UTC")).toBe(false);
    expect(isWithinTimeWindow(night, at("2026-01-15T20:00:00Z"), "UTC")).toBe(true);
  });

  it("handles same-day windows with an exclusive end", () => {
    expect(isWithinTimeWindow("09:00-17:00", at("2026-01-15T09:00:00Z"), "UTC")).toBe(true);
    expect(isWithinTimeWindow("09:00-17:00", at("2026-01-15T17:00:00Z"), "UTC")).toBe(false);
  });

  it("falls back to UTC when the condition has no time zone", () => {
    expect(isWithinTimeWindow("18:00-09:00", at("2026-01-15T10:00:00Z"), undefined)).toBe(false);
    expect(isWithinTimeWindow("18:00-09:00", at("2026-01-15T19:00:00Z"), undefined)).toBe(true);
  });

  it("never matches an invalid zone or a malformed window", () => {
    expect(isWithinTimeWindow("18:00-09:00", at("2026-01-15T19:00:00Z"), "Mars/Base")).toBe(false);
    expect(isWithinTimeWindow("18:00", at("2026-01-15T19:00:00Z"), "UTC")).toBe(false);
  });
});

describe("time zone helpers", () => {
  it("validates IANA names", () => {
    expect(isValidTimeZone("Europe/Vilnius")).toBe(true);
    expect(isValidTimeZone("UTC")).toBe(true);
    expect(isValidTimeZone("Mars/Base")).toBe(false);
    expect(isValidTimeZone("")).toBe(false);
    expect(isValidTimeZone(3)).toBe(false);
  });

  it("lists UTC first and keeps the current value selectable", () => {
    const zones = listTimeZones("Europe/Vilnius");
    expect(zones[0]).toBe("UTC");
    expect(zones).toContain("Europe/Vilnius");
    expect(new Set(zones).size).toBe(zones.length);
  });

  it("stamps a time zone only on time_of_day conditions that lack one", () => {
    expect(withConditionTimezone({ subject: "time_of_day", operand: "18:00-09:00" }, "Asia/Seoul"))
      .toEqual({ subject: "time_of_day", operand: "18:00-09:00", timezone: "Asia/Seoul" });
    expect(withConditionTimezone({ subject: "time_of_day", timezone: "UTC" }, "Asia/Seoul"))
      .toEqual({ subject: "time_of_day", timezone: "UTC" });
    expect(withConditionTimezone({ subject: "tag_presence" }, "Asia/Seoul"))
      .toEqual({ subject: "tag_presence" });
  });

  it("defaults the zone when an edit turns a condition into time_of_day", () => {
    expect(editConditionConfig({ subject: "tag_presence" }, { subject: "time_of_day" }, "Europe/Vilnius"))
      .toMatchObject({ subject: "time_of_day", timezone: "Europe/Vilnius" });
    expect(editConditionConfig({ subject: "time_of_day", timezone: "UTC" }, { timezone: "Asia/Seoul" }, "Europe/Vilnius"))
      .toMatchObject({ timezone: "Asia/Seoul" });
  });
});

describe("Best Auto Parts — Out of Office Schedule & Boundary Times (Asia/Kolkata)", () => {
  const schedule = "20:00-09:00, fri:12:30-14:30";
  const tz = "Asia/Kolkata";

  it("handles all required boundary times accurately in Asia/Kolkata", () => {
    // Friday: 2026-01-16
    // 08:59 IST (03:29 UTC) -> Out of office (before 09:00)
    expect(isWithinTimeWindow(schedule, at("2026-01-16T03:29:00Z"), tz)).toBe(true);

    // 09:00 IST (03:30 UTC) -> Open (business hours start)
    expect(isWithinTimeWindow(schedule, at("2026-01-16T03:30:00Z"), tz)).toBe(false);

    // 12:29 IST (06:59 UTC) on Friday -> Open (Juma break starts at 12:30)
    expect(isWithinTimeWindow(schedule, at("2026-01-16T06:59:00Z"), tz)).toBe(false);

    // 12:30 IST (07:00 UTC) on Friday -> Out of office (Juma break active)
    expect(isWithinTimeWindow(schedule, at("2026-01-16T07:00:00Z"), tz)).toBe(true);

    // 14:29 IST (08:59 UTC) on Friday -> Out of office (Juma break active)
    expect(isWithinTimeWindow(schedule, at("2026-01-16T08:59:00Z"), tz)).toBe(true);

    // 14:30 IST (09:00 UTC) on Friday -> Open (Juma break ended)
    expect(isWithinTimeWindow(schedule, at("2026-01-16T09:00:00Z"), tz)).toBe(false);

    // 19:59 IST (14:29 UTC) on Friday -> Open (closing at 20:00)
    expect(isWithinTimeWindow(schedule, at("2026-01-16T14:29:00Z"), tz)).toBe(false);

    // 20:00 IST (14:30 UTC) on Friday -> Out of office (night hours active)
    expect(isWithinTimeWindow(schedule, at("2026-01-16T14:30:00Z"), tz)).toBe(true);

    // Midnight 00:00 IST (18:30 UTC on 2026-01-15) -> Out of office (midnight handled cleanly)
    expect(isWithinTimeWindow(schedule, at("2026-01-15T18:30:00Z"), tz)).toBe(true);
  });

  it("does not apply Friday Juma break on Thursday or other days", () => {
    // Thursday 12:30 IST (07:00 UTC on 2026-01-15) -> Store is OPEN
    expect(isWithinTimeWindow(schedule, at("2026-01-15T07:00:00Z"), tz)).toBe(false);

    // Thursday 13:00 IST -> Store is OPEN
    expect(isWithinTimeWindow(schedule, at("2026-01-15T07:30:00Z"), tz)).toBe(false);

    // Thursday 20:00 IST -> Store is CLOSED (night window)
    expect(isWithinTimeWindow(schedule, at("2026-01-15T14:30:00Z"), tz)).toBe(true);
  });
});
