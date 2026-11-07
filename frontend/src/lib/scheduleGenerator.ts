import type { CalendarEvent, Weekday } from "@/types/calendar";
import type {
  GeneratedSchedule,
  ScheduleCourse,
  ScheduleMeeting,
  ScheduleOption,
} from "@/types/generation";

const DAYS: Weekday[] = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const COLORS = [
  "#2563eb",
  "#15803d",
  "#7c3aed",
  "#b45309",
  "#be185d",
  "#0f766e",
];
type Interval = Pick<ScheduleMeeting, "day" | "start" | "end">;
type Choice = { course: ScheduleCourse; option: ScheduleOption };

export function courseColor(key: string): string {
  let hash = 0;
  for (const character of key)
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return COLORS[hash % COLORS.length];
}

function overlap(a: Interval, b: Interval): boolean {
  return a.day === b.day && a.start < b.end && b.start < a.end;
}

function validInterval(meeting: Interval): boolean {
  return (
    Number.isInteger(meeting.day) &&
    meeting.day >= 0 &&
    meeting.day < 7 &&
    Number.isInteger(meeting.start) &&
    Number.isInteger(meeting.end) &&
    meeting.start >= 0 &&
    meeting.end <= 1440 &&
    meeting.start < meeting.end
  );
}

function minutes(time: string): number {
  if (!/^\d{1,2}:\d{2}$/.test(time)) return NaN;
  const [hours, remainder] = time.split(":").map(Number);
  return hours <= 24 && remainder < 60 && (hours < 24 || remainder === 0)
    ? hours * 60 + remainder
    : NaN;
}

function clock(value: number): string {
  return `${Math.floor(value / 60)
    .toString()
    .padStart(2, "0")}:${(value % 60).toString().padStart(2, "0")}`;
}

function sectionKey(option: ScheduleOption): string {
  return JSON.stringify(option.sections.map((section) => section.id).sort());
}

function normalizeOptions(
  course: ScheduleCourse,
  blocked: Interval[],
): ScheduleOption[] {
  const unique = new Map<string, ScheduleOption>();
  const optionIds = new Set<string>();
  for (const option of course.options
    .slice()
    .sort((a, b) => a.id.localeCompare(b.id))) {
    if (
      !option.id ||
      optionIds.has(option.id) ||
      !option.sections?.length ||
      !option.meetings?.length
    ) {
      throw new Error(
        `Incomplete or duplicate section data for ${course.code}. Refresh the course and try again.`,
      );
    }
    optionIds.add(option.id);
    const sectionIds = new Set(option.sections.map((section) => section.id));
    if (
      sectionIds.has("") ||
      sectionIds.size !== option.sections.length ||
      option.meetings.some(
        (meeting) =>
          !validInterval(meeting) || !sectionIds.has(meeting.sectionId),
      ) ||
      option.sections.some(
        (section) =>
          !option.meetings.some((meeting) => meeting.sectionId === section.id),
      )
    ) {
      throw new Error(
        `Meeting times are incomplete for ${course.code}. Refresh the course and try again.`,
      );
    }
    const meetings = Array.from(
      new Map(
        option.meetings.map((meeting) => [
          JSON.stringify([
            meeting.sectionId,
            meeting.day,
            meeting.start,
            meeting.end,
          ]),
          meeting,
        ]),
      ).values(),
    );
    const normalized = { ...option, meetings };
    const key = sectionKey(option);
    const prior = unique.get(key);
    if (prior) {
      const signature = (value: ScheduleOption) =>
        value.meetings
          .map((meeting) =>
            JSON.stringify([
              meeting.sectionId,
              meeting.day,
              meeting.start,
              meeting.end,
            ]),
          )
          .sort()
          .join("|");
      if (signature(prior) !== signature(normalized)) {
        throw new Error(
          `Conflicting section data for ${course.code}. Refresh the course and try again.`,
        );
      }
      continue;
    }
    unique.set(key, normalized);
  }
  return Array.from(unique.values())
    .filter(
      (option) =>
        !option.meetings.some(
          (meeting, index) =>
            blocked.some((event) => overlap(meeting, event)) ||
            option.meetings
              .slice(index + 1)
              .some((other) => overlap(meeting, other)),
        ),
    )
    .sort((a, b) => a.id.localeCompare(b.id));
}

export function optionEvents({ course, option }: Choice): CalendarEvent[] {
  return option.meetings.map((meeting) => {
    const section = option.sections.find(
      (item) => item.id === meeting.sectionId,
    );
    return {
      id: JSON.stringify([
        course.key,
        meeting.sectionId,
        meeting.day,
        meeting.start,
        meeting.end,
      ]),
      title: `${course.code}: ${course.title}`,
      ...(option.exams && { exams: option.exams }),
      dayOfWeek: DAYS[meeting.day],
      startTime: clock(meeting.start),
      endTime: clock(meeting.end),
      color: courseColor(course.key),
      isCourse: true,
      courseKey: course.key,
      courseId: option.sections[0].id,
      term: course.term,
      eventType: meeting.type,
      sectionCode: section?.code,
      instructor: section?.instructor,
      location: meeting.location,
    };
  });
}

function toSchedule(chosen: Choice[]): GeneratedSchedule {
  const sorted = chosen
    .slice()
    .sort((a, b) => a.course.key.localeCompare(b.course.key));
  const choices = sorted.map(({ course, option }) => ({
    courseKey: course.key,
    optionId: option.id,
  }));
  const events = sorted.flatMap(optionEvents);
  const meetings = sorted.flatMap(({ option }) => option.meetings);
  let gapMinutes = 0;
  for (let day = 0; day < DAYS.length; day++) {
    const today = meetings
      .filter((meeting) => meeting.day === day)
      .sort((a, b) => a.start - b.start);
    for (let index = 1; index < today.length; index++)
      gapMinutes += today[index].start - today[index - 1].end;
  }
  return {
    id: JSON.stringify(
      sorted.map(({ course, option }) => [course.key, sectionKey(option)]),
    ),
    choices,
    events,
    gapMinutes,
    days: new Set(meetings.map((meeting) => meeting.day)).size,
    latestEnd: Math.max(...meetings.map((meeting) => meeting.end)),
  };
}

export interface ScheduleSearch {
  /** Bounded work lets the worker yield even when a search finds no results. */
  advance: (budget?: { maxSteps?: number; maxResults?: number }) => {
    schedules: GeneratedSchedule[];
    complete: boolean;
  };
}

/** Enumerates every compatible section set; the cursor remains local to this search. */
export function createScheduleSearch(
  courses: ScheduleCourse[],
  blockedEvents: CalendarEvent[] = [],
): ScheduleSearch {
  if (!courses.length || courses.length > 12)
    throw new Error("Choose between 1 and 12 courses.");
  const keys = new Set(courses.map((course) => course.key));
  if (
    keys.size !== courses.length ||
    keys.has("") ||
    courses.some((course) => !course.term || !Array.isArray(course.options))
  ) {
    throw new Error("Course selection is invalid. Select each course once.");
  }
  if (new Set(courses.map((course) => course.term)).size !== 1)
    throw new Error("Choose courses from the same term.");
  const blocked = blockedEvents.map((event) => ({
    day: DAYS.indexOf(event.dayOfWeek),
    start: minutes(event.startTime),
    end: minutes(event.endTime),
  }));
  if (blocked.some((event) => !validInterval(event))) {
    throw new Error(
      "A saved event has an invalid time. Fix it before generating schedules.",
    );
  }
  const candidates = courses
    .map((course) => ({ course, options: normalizeOptions(course, blocked) }))
    .sort(
      (a, b) =>
        a.options.length - b.options.length ||
        a.course.key.localeCompare(b.course.key),
    );
  const nextOption = Array(candidates.length).fill(0) as number[];
  const chosen: Choice[] = [];
  let depth = candidates.some((candidate) => candidate.options.length === 0)
    ? -1
    : 0;

  return {
    advance({ maxSteps = 2000, maxResults = 50 } = {}) {
      if (
        !Number.isInteger(maxSteps) ||
        maxSteps < 1 ||
        !Number.isInteger(maxResults) ||
        maxResults < 1
      ) {
        throw new Error("Search budgets must be positive integers.");
      }
      const schedules: GeneratedSchedule[] = [];
      for (
        let step = 0;
        step < maxSteps && depth >= 0 && schedules.length < maxResults;
        step++
      ) {
        if (depth === candidates.length) {
          schedules.push(toSchedule(chosen));
          depth--;
          continue;
        }
        const candidate = candidates[depth];
        if (nextOption[depth] >= candidate.options.length) {
          nextOption[depth] = 0;
          chosen.length = depth;
          depth--;
          continue;
        }
        const option = candidate.options[nextOption[depth]++];
        if (
          chosen
            .slice(0, depth)
            .some((prior) =>
              option.meetings.some((meeting) =>
                prior.option.meetings.some((other) => overlap(meeting, other)),
              ),
            )
        )
          continue;
        chosen[depth] = { course: candidate.course, option };
        chosen.length = depth + 1;
        depth++;
      }
      return { schedules, complete: depth < 0 };
    },
  };
}
