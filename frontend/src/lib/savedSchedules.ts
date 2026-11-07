import { calendarExamSchema } from "@/lib/examSchedule";
import { optionEvents } from "@/lib/scheduleGenerator";
import { z } from "zod";
import type { CalendarEvent } from "@/types/calendar";
import type { GeneratedSchedule, ScheduleCourse } from "@/types/generation";
import { getCourseCode } from "@/lib/courseLabels";

export const WEEKDAYS = [
  "Mon",
  "Tue",
  "Wed",
  "Thu",
  "Fri",
  "Sat",
  "Sun",
] as const;
export const MAX_SAVED = 20;
export type PlanCourse = Pick<
  ScheduleCourse,
  "key" | "code" | "title" | "term"
>;
type OptionCheck = { courseKey: string; optionId: string; signature: string };
export interface PlanSnapshot {
  courses: PlanCourse[];
  events: CalendarEvent[];
  options: OptionCheck[];
}
export interface SavedPlan extends PlanSnapshot {
  id: string;
  name: string;
}
export interface PlanLibrary {
  plans: SavedPlan[];
  preferredId: string | null;
}

const clock = z.string().regex(/^(?:[01]?\d|2[0-3]):[0-5]\d$/);
const savedPlan = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(48),
  courses: z
    .array(
      z.object({
        key: z.string().min(1),
        code: z.string().min(1),
        title: z.string(),
        term: z.string(),
      }),
    )
    .min(1),
  events: z
    .array(
      z.object({
        id: z.string(),
        title: z.string(),
        courseTitle: z.string().optional(),
        exams: z.array(calendarExamSchema).optional(),
        dayOfWeek: z.enum(WEEKDAYS),
        startTime: clock,
        endTime: clock.or(z.literal("24:00")),
        color: z.string(),
        isCourse: z.literal(true),
        courseId: z.string().optional(),
        courseKey: z.string().optional(),
        term: z.string().optional(),
        eventType: z.string().optional(),
        sectionCode: z.string().optional(),
        instructor: z.string().optional(),
        location: z.string().optional(),
      }),
    )
    .min(1),
  options: z.array(
    z.object({
      courseKey: z.string(),
      optionId: z.string(),
      signature: z.string(),
    }),
  ),
});

export function readLibrary(raw: string | null, term: string): PlanLibrary {
  if (!raw) return { plans: [], preferredId: null };
  const data = JSON.parse(raw);
  if (!Array.isArray(data.plans)) throw new Error("Invalid saved schedules");
  const plans = data.plans.map((entry: unknown) =>
    savedPlan.parse(entry),
  ) as SavedPlan[];
  if (
    plans.some(
      (plan) =>
        plan.courses.some((c) => c.term !== term) ||
        plan.events.some((e) => e.term && e.term !== term),
    )
  )
    throw new Error("Invalid schedule term");
  return {
    plans,
    preferredId: typeof data.preferredId === "string" ? data.preferredId : null,
  };
}

export function currentSnapshot(
  events: CalendarEvent[],
  selected: PlanCourse[],
  term: string,
): PlanSnapshot {
  const courses = new Map<string, PlanCourse>();
  const meetings = events.filter(
    (e) => e.isCourse && (!e.term || e.term === term),
  );
  for (const e of meetings) {
    const code = getCourseCode(e.title);
    const course = selected.find((c) =>
      e.courseKey ? c.key === e.courseKey : c.code === code,
    );
    const key = course?.key || e.courseKey || code;
    courses.set(key, {
      key,
      term,
      code: course?.code || code,
      title: course?.title || e.title,
    });
  }
  return { courses: [...courses.values()], events: meetings, options: [] };
}

// Ignore presentation changes when identifying the plan currently on the calendar.
export function planFingerprint(events: CalendarEvent[]) {
  return JSON.stringify(
    events
      .map((e) =>
        JSON.stringify([
          e.id,
          e.courseId,
          e.title,
          e.dayOfWeek,
          e.startTime,
          e.endTime,
          e.eventType,
          e.location,
        ]),
      )
      .sort(),
  );
}

export function captureOptions(
  choices: GeneratedSchedule["choices"],
  courses: ScheduleCourse[],
): OptionCheck[] {
  return choices.map((choice) => {
    const option = courses
      .find((c) => c.key === choice.courseKey)
      ?.options.find((o) => o.id === choice.optionId);
    return { ...choice, signature: JSON.stringify(option) || "" };
  });
}

export function validateOptions(
  checks: OptionCheck[],
  latest: ScheduleCourse[],
) {
  const fresh = captureOptions(checks, latest);
  if (
    checks.some(
      (check, i) => !check.signature || check.signature !== fresh[i].signature,
    )
  ) {
    throw new Error(
      "The catalog changed. Generate again before keeping this schedule.",
    );
  }
}

// A copy of the applied calendar can outlive the original generator results.
export function validateSavedPlan(
  plan: PlanSnapshot,
  latest: ScheduleCourse[],
) {
  validateOptions(plan.options, latest);
  for (const course of latest) {
    if (plan.options.some((check) => check.courseKey === course.key)) continue;
    const meetings = plan.events.filter((e) => e.courseKey === course.key);
    const expected = planFingerprint(meetings);
    const matches = course.options.some((option) => {
      if (
        !option.sections.length ||
        option.sections[0].id !== meetings[0]?.courseId
      )
        return false;
      const distinct = new Map(
        optionEvents({ course, option }).map((event) => [event.id, event]),
      );
      return planFingerprint([...distinct.values()]) === expected;
    });
    if (!matches)
      throw new Error(
        "The catalog changed. Generate again before keeping this schedule.",
      );
  }
}

export function minutes(time: string) {
  const [hour, minute] = time.split(":").map(Number);
  return hour * 60 + minute;
}
