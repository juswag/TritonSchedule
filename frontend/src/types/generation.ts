import type { CalendarEvent, CalendarExam } from "@/types/calendar";

export interface ScheduleMeeting {
  /** Monday = 0, Sunday = 6. */
  day: number;
  start: number;
  end: number;
  location: string;
  type: string;
  sectionId: string;
}

export interface ScheduleOption {
  exams?: CalendarExam[];
  id: string;
  sections: Array<{
    id: string;
    code: string;
    type: string;
    instructor: string;
  }>;
  meetings: ScheduleMeeting[];
}

export interface ScheduleCourse {
  key: string;
  term: string;
  code: string;
  title: string;
  options: ScheduleOption[];
  issues: string[];
}

export interface GeneratedSchedule {
  id: string;
  choices: Array<{ courseKey: string; optionId: string }>;
  events: CalendarEvent[];
  days: number;
  gapMinutes: number;
  latestEnd: number;
}

export type ScheduleWorkerRequest =
  | { type: "start"; courses: ScheduleCourse[]; blockedEvents: CalendarEvent[] }
  | { type: "more" };

export type ScheduleWorkerResponse =
  | { type: "results"; schedules: GeneratedSchedule[]; total: number }
  | { type: "paused" | "complete"; total: number }
  | { type: "error"; message: string };
