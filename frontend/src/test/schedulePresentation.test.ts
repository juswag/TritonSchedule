import { describe, expect, it } from "vitest";
import { coursePalette, changedMeetings } from "@/lib/schedulePresentation";
import type { CalendarEvent } from "@/types/calendar";

const meeting: CalendarEvent = {
  id: "a",
  courseKey: "cse",
  title: "CSE 101",
  dayOfWeek: "Mon",
  startTime: "09:00",
  endTime: "10:00",
  color: "blue",
  eventType: "Lecture",
};
describe("schedule comparison presentation", () => {
  it("assigns distinct colors to all twelve choices regardless of selection order", () => {
    const keys = Array.from({ length: 12 }, (_, i) => `course-${i}`);
    const palette = coursePalette(keys);
    expect(new Set(palette.values()).size).toBe(12);
    expect([...coursePalette(keys.reverse())]).toEqual([...palette]);
  });
  it("highlights moved meetings, without highlighting an unchanged lecture in a new section set", () => {
    const before = [
      meeting,
      {
        ...meeting,
        id: "di",
        eventType: "Discussion",
        dayOfWeek: "Tue" as const,
      },
    ];
    const after = [
      { ...meeting, id: "new-lecture" },
      { ...before[1], id: "new-di", dayOfWeek: "Thu" as const },
    ];
    expect([...changedMeetings(before, after)]).toEqual(["new-di"]);
  });
  it("highlights a changed time and leaves unchanged meetings alone", () => {
    expect(changedMeetings([meeting], [meeting]).size).toBe(0);
    expect([
      ...changedMeetings([meeting], [{ ...meeting, startTime: "08:00" }]),
    ]).toEqual(["a"]);
  });
});
