import type { CalendarEvent } from "@/types/calendar";

// Up to twelve selected courses; text labels also identify each course.
const COLORS = [
  "#1d4ed8",
  "#047857",
  "#7e22ce",
  "#b45309",
  "#be185d",
  "#0e7490",
  "#4338ca",
  "#4d7c0f",
  "#b91c1c",
  "#a16207",
  "#6d28d9",
  "#334155",
];
export function coursePalette(keys: string[]) {
  return new Map(
    [...new Set(keys)].sort().map((key, i) => [key, COLORS[i % COLORS.length]]),
  );
}
const meetingPosition = (event: CalendarEvent) =>
  JSON.stringify([
    event.courseKey || event.courseId || event.title,
    event.eventType,
    event.dayOfWeek,
    event.startTime,
    event.endTime,
  ]);
export function changedMeetings(
  before: CalendarEvent[],
  after: CalendarEvent[],
) {
  const positions = new Set(before.map(meetingPosition));
  return new Set(
    after
      .filter((event) => !positions.has(meetingPosition(event)))
      .map((event) => event.id),
  );
}
