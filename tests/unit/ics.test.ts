import { describe, it, expect } from "vitest";
import { createEvents } from "ics";

describe("ICS Calendar Generation", () => {
  it("should create a valid ICS event", () => {
    const { value, error } = createEvents([
      {
        start: [2025, 3, 15, 10, 0],
        end: [2025, 3, 15, 11, 0],
        title: "Healthfolio: Cardiology Appointment",
        description: "Prepared with Healthfolio",
        location: "City Hospital",
        status: "CONFIRMED",
        calName: "Healthfolio",
      },
    ]);

    // ics library returns null (not undefined) when there's no error
    expect(error === null || error === undefined).toBe(true);
    expect(value).toBeDefined();
    expect(value).toContain("BEGIN:VCALENDAR");
    expect(value).toContain("BEGIN:VEVENT");
    expect(value).toContain("Healthfolio: Cardiology Appointment");
    expect(value).toContain("END:VEVENT");
    expect(value).toContain("END:VCALENDAR");
  });

  it("should include proper date format", () => {
    const { value } = createEvents([
      {
        start: [2025, 12, 25, 9, 30],
        end: [2025, 12, 25, 10, 30],
        title: "Holiday Appointment",
        status: "CONFIRMED",
        calName: "Healthfolio",
      },
    ]);

    expect(value).toContain("DTSTART:");
    expect(value).toContain("DTEND:");
  });

  it("should handle minimal event data", () => {
    const { value, error } = createEvents([
      {
        start: [2025, 6, 1, 14, 0],
        end: [2025, 6, 1, 15, 0],
        title: "Basic Appointment",
        status: "CONFIRMED",
        calName: "Healthfolio",
      },
    ]);

    expect(error === null || error === undefined).toBe(true);
    expect(value).toBeDefined();
  });
});
