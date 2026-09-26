export interface CalendarEvent {
  id: string;
  title: string;
  dayOfWeek: Weekday;
  startTime: string;
  endTime: string;
  color: string;
  isCourse?: boolean;
  courseId?: string;
  eventType?: string;
  location?: string;
  /** Original course label, shared by lecture and section events. */
  courseTitle?: string;
  /** Undefined on schedules saved before exam metadata was supported. */
  exams?: CalendarExam[];
}

export interface CalendarExam {
  id: string;
  name: string;
  type: "midterm" | "final";
  time: string;
  location: string;
}

export type Weekday = "Mon" | "Tue" | "Wed" | "Thu" | "Fri";

export type EventColor = {
  label: string;
  value: string;
};

export const eventColors: EventColor[] = [
  { label: "Blue", value: "hsl(221, 83%, 53%)" },
  { label: "Green", value: "hsl(142, 71%, 45%)" },
  { label: "Purple", value: "hsl(262, 83%, 58%)" },
  { label: "Orange", value: "hsl(25, 95%, 53%)" },
  { label: "Pink", value: "hsl(340, 82%, 52%)" },
  { label: "Teal", value: "hsl(180, 70%, 45%)" },
];
