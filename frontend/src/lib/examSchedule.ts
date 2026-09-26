import type { Course, DiscussionSection } from "@/data/sampleCourses";
import type { CalendarCourse, CalendarEvent, CalendarExam } from "@/types/calendar";
import { getCourseCode } from "@/lib/courseLabels";

export interface ScheduledExam {
  id: string;
  courseId: string;
  courseTitle: string;
  courseCode: string;
  color: string;
  type: "midterm" | "final";
  name: string;
  dateLabel: string;
  timeLabel: string;
  location: string;
  start: number | null;
  end: number | null;
}

export interface ExamConflict {
  id: string;
  first: ScheduledExam;
  second: ScheduledExam;
}

export function getCourseExams(course: Course, discussion?: DiscussionSection, lab?: DiscussionSection): CalendarExam[] {
  const midterms = course.midtermSections?.length
    ? course.midtermSections
    : course.midterm
      ? [{ id: `${course.id}-midterm`, name: "Midterm", time: course.midterm, location: "TBA" }]
      : [];
  const final = course.finalSection ?? (course.final
    ? { id: `${course.id}-final`, name: "Final", time: course.final, location: "TBA" }
    : null);
  return [
    ...(course.exams ?? [
      ...midterms.map((exam): CalendarExam => ({ ...exam, type: "midterm" })),
      ...(final ? [{ ...final, type: "final" as const }] : []),
    ]),
    ...(discussion?.exams ?? []),
    ...(lab?.exams ?? []),
  ];
}

function clockMinutes(hour: string, minute: string | undefined, period: string | undefined): number | null {
  let h = Number(hour);
  const m = Number(minute ?? 0);
  if (m > 59 || (period ? h < 1 || h > 12 : h > 23)) return null;
  if (period) h = h % 12 + (period.toLowerCase().startsWith("p") ? 12 : 0);
  return h * 60 + m;
}

function formatClock(minutes: number): string {
  const hour = Math.floor(minutes / 60);
  return `${hour % 12 || 12}:${String(minutes % 60).padStart(2, "0")} ${hour >= 12 ? "PM" : "AM"}`;
}

/** Compare campus wall-clock times without inferring a year, duration, or overnight end. */
export function parseExamSchedule(value: string) {
  const isoDate = value.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  const usDate = value.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/);
  const year = Number(isoDate?.[1] ?? usDate?.[3]);
  const month = Number(isoDate?.[2] ?? usDate?.[1]);
  const day = Number(isoDate?.[3] ?? usDate?.[2]);
  const date = Date.UTC(year, month - 1, day);
  const parsed = new Date(date);
  const validDate = Number.isFinite(date) && parsed.getUTCFullYear() === year
    && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
  const withoutDate = value.replace(isoDate?.[0] ?? usDate?.[0] ?? /$^/, "");
  const range = withoutDate.match(/\b(\d{1,2})(?::(\d{2}))?\s*([ap](?:m)?)?\s*[-–—]\s*(\d{1,2})(?::(\d{2}))?\s*([ap](?:m)?)?\b/i);
  const startMinutes = range ? clockMinutes(range[1], range[2], range[3]) : null;
  const endMinutes = range ? clockMinutes(range[4], range[5], range[6]) : null;
  // A missing AM/PM at only one end is ambiguous; retain the source text instead.
  const validTime = startMinutes !== null && endMinutes !== null && endMinutes > startMinutes
    && Boolean(range?.[3]) === Boolean(range?.[6]);
  return {
    dateLabel: validDate ? parsed.toLocaleDateString("en-US", {
      weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC",
    }) : "Date TBA",
    timeLabel: validTime ? `${formatClock(startMinutes)} – ${formatClock(endMinutes)}` : value.trim() || "Time TBA",
    start: validDate && validTime ? date + startMinutes * 60_000 : null,
    end: validDate && validTime ? date + endMinutes * 60_000 : null,
  };
}

function isExam(value: unknown): value is CalendarExam {
  if (!value || typeof value !== "object") return false;
  const exam = value as Partial<CalendarExam>;
  return typeof exam.id === "string" && typeof exam.name === "string"
    && (exam.type === "midterm" || exam.type === "final") && typeof exam.time === "string"
    && typeof exam.location === "string";
}

export function getExamSchedule(events: CalendarEvent[], examOnlyCourses: CalendarCourse[] = []): {
  exams: ScheduledExam[];
  conflicts: ExamConflict[];
  missingCourses: { id: string; title: string }[];
} {
  const courses = new Map<string, CalendarEvent[]>();
  for (const event of events) {
    if (!event.isCourse) continue;
    const id = event.courseId || event.id;
    courses.set(id, [...(courses.get(id) ?? []), event]);
  }
  const exams: ScheduledExam[] = [];
  const missingCourses: { id: string; title: string }[] = [];
  const scheduledCourses = new Map<string, { id: string; title: string; color: string; exams?: CalendarExam[] }>(
    examOnlyCourses.map((course) => [course.id, course]),
  );
  for (const [courseId, meetings] of courses) {
    const course = meetings.find((meeting) => meeting.eventType === "Lecture") ?? meetings[0];
    const saved = meetings.find((meeting) => Array.isArray(meeting.exams));
    scheduledCourses.set(courseId, {
      id: courseId, title: course.courseTitle || course.title, color: course.color, exams: saved?.exams,
    });
  }
  for (const [courseId, course] of scheduledCourses) {
    const courseTitle = course.title;
    if (!Array.isArray(course.exams)) {
      missingCourses.push({ id: courseId, title: courseTitle });
      continue;
    }
    const sittings = new Map<string, ScheduledExam>();
    for (const exam of course.exams.filter(isExam)) {
      const schedule = parseExamSchedule(exam.time);
      const key = JSON.stringify([exam.type, schedule.start ?? exam.time, schedule.end,
        schedule.start === null ? exam.id : null]);
      const existing = sittings.get(key);
      const location = exam.location.trim() || "TBA";
      if (existing) {
        const rooms = new Set(existing.location.split(", "));
        rooms.add(location);
        existing.location = [...rooms].join(", ");
        continue;
      }
      const sitting: ScheduledExam = {
        ...exam,
        id: JSON.stringify([courseId, exam.id, key]),
        courseId, courseTitle, courseCode: getCourseCode(courseTitle), color: course.color,
        location,
        ...schedule,
      };
      sittings.set(key, sitting);
      exams.push(sitting);
    }
  }
  exams.sort((a, b) => (a.start ?? Infinity) - (b.start ?? Infinity)
    || a.courseTitle.localeCompare(b.courseTitle) || a.id.localeCompare(b.id));
  const conflicts: ExamConflict[] = [];
  for (let i = 0; i < exams.length; i++) {
    const first = exams[i];
    if (first.start === null || first.end === null) continue;
    for (const second of exams.slice(i + 1)) {
      if (second.start === null || second.end === null || second.start >= first.end) break;
      // One course can publish the same sitting in multiple rooms/sections.
      if (first.courseId === second.courseId) continue;
      if (first.start < second.end) {
        conflicts.push({ id: JSON.stringify([first.id, second.id]), first, second });
      }
    }
  }
  return { exams, conflicts, missingCourses };
}
