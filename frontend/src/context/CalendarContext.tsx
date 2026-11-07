import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from "react";
import { CalendarCourse, CalendarEvent } from "@/types/calendar";
import type { ScheduleCourse } from "@/types/generation";

type ScheduleUndo =
  | { kind: "replace"; courses: CalendarEvent[]; selection?: ScheduleCourse[] }
  | {
      kind: "clear";
      selection: ScheduleCourse[];
      events: CalendarEvent[];
      examOnlyCourses: CalendarCourse[];
    };

interface CalendarContextType {
  events: CalendarEvent[];
  examOnlyCourses: CalendarCourse[];
  addExamOnlyCourse: (course: CalendarCourse) => void;
  addEvent: (event: CalendarEvent) => void;
  updateEvent: (id: string, event: Partial<CalendarEvent>) => void;
  deleteEvent: (id: string) => void;
  deleteEventsByCourseId: (courseId: string) => void;
  replaceCourseEvents: (
    courses: CalendarEvent[],
    selection?: ScheduleCourse[],
  ) => void;
  clearSchedule: (term: string, selection: ScheduleCourse[]) => void;
  undoScheduleChange: () => ScheduleCourse[] | undefined;
  canUndoScheduleChange: boolean;
}

const CalendarContext = createContext<CalendarContextType | undefined>(
  undefined,
);
const CALENDAR_EVENTS_STORAGE_KEY = "calendarEvents";

const EXAM_ONLY_COURSES_STORAGE_KEY = "calendarExamOnlyCourses";

function loadExamOnlyCourses(): CalendarCourse[] {
  if (typeof window === "undefined") return [];
  try {
    const stored: unknown = JSON.parse(
      window.localStorage.getItem(EXAM_ONLY_COURSES_STORAGE_KEY) ?? "[]",
    );
    if (!Array.isArray(stored)) return [];
    return stored.filter(
      (course): course is CalendarCourse =>
        course &&
        typeof course.id === "string" &&
        typeof course.title === "string" &&
        typeof course.color === "string" &&
        Array.isArray(course.exams),
    );
  } catch {
    return [];
  }
}

function loadStoredEvents(): CalendarEvent[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const storedEvents = window.localStorage.getItem(
      CALENDAR_EVENTS_STORAGE_KEY,
    );
    if (!storedEvents) return [];
    const parsed = JSON.parse(storedEvents) as CalendarEvent[];
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter((event) => {
      return (
        typeof event?.id === "string" &&
        typeof event?.title === "string" &&
        typeof event?.dayOfWeek === "string" &&
        typeof event?.startTime === "string" &&
        typeof event?.endTime === "string" &&
        typeof event?.color === "string"
      );
    });
  } catch {
    return [];
  }
}

export function CalendarProvider({ children }: { children: ReactNode }) {
  const [events, setEvents] = useState<CalendarEvent[]>(() =>
    loadStoredEvents(),
  );
  const [examOnlyCourses, setExamOnlyCourses] =
    useState<CalendarCourse[]>(loadExamOnlyCourses);
  const [undo, setUndo] = useState<ScheduleUndo | null>(null);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        CALENDAR_EVENTS_STORAGE_KEY,
        JSON.stringify(events),
      );
    } catch {
      /* Keep the current session usable when browser storage is unavailable. */
    }
  }, [events]);

  useEffect(() => {
    window.localStorage.setItem(
      EXAM_ONLY_COURSES_STORAGE_KEY,
      JSON.stringify(examOnlyCourses),
    );
  }, [examOnlyCourses]);

  const addExamOnlyCourse = (course: CalendarCourse) => {
    setUndo((previous) => (previous?.kind === "clear" ? null : previous));
    setExamOnlyCourses((previous) => [
      ...previous.filter((item) => item.id !== course.id),
      course,
    ]);
  };

  const addEvent = (event: CalendarEvent) => {
    if (event.isCourse) setUndo(null);
    setEvents((prev) => [...prev, event]);
  };

  const updateEvent = (id: string, updatedFields: Partial<CalendarEvent>) => {
    setUndo(null);
    setEvents((prev) =>
      prev.map((event) =>
        event.id === id ? { ...event, ...updatedFields } : event,
      ),
    );
  };

  const deleteEvent = (id: string) => {
    setUndo(null);
    setEvents((prev) => prev.filter((event) => event.id !== id));
  };

  const deleteEventsByCourseId = (courseId: string) => {
    setUndo(null);
    setEvents((prev) => prev.filter((event) => event.courseId !== courseId));
    setExamOnlyCourses((prev) =>
      prev.filter((course) => course.id !== courseId),
    );
  };

  const replaceCourseEvents = (
    courses: CalendarEvent[],
    selection?: ScheduleCourse[],
  ) => {
    setUndo({
      kind: "replace",
      selection,
      courses: events.filter((event) => event.isCourse),
    });
    setEvents((current) => [
      ...current.filter((event) => !event.isCourse),
      ...courses,
    ]);
  };

  const clearSchedule = (term: string, selection: ScheduleCourse[]) => {
    const inTerm = (item: { term?: string }) =>
      !item.term || item.term === term;
    setUndo({
      kind: "clear",
      selection,
      events: events.filter(inTerm),
      examOnlyCourses: examOnlyCourses.filter(inTerm),
    });
    setEvents((current) => current.filter((event) => !inTerm(event)));
    setExamOnlyCourses((current) =>
      current.filter((course) => !inTerm(course)),
    );
  };

  const undoScheduleChange = () => {
    if (!undo) return;
    if (undo.kind === "clear") {
      setEvents((current) => [...current, ...undo.events]);
      setExamOnlyCourses((current) => [...current, ...undo.examOnlyCourses]);
    } else {
      setEvents((current) => [
        ...current.filter((event) => !event.isCourse),
        ...undo.courses,
      ]);
    }
    setUndo(null);
    return undo.selection;
  };

  return (
    <CalendarContext.Provider
      value={{
        events,
        examOnlyCourses,
        addExamOnlyCourse,
        addEvent,
        updateEvent,
        deleteEvent,
        deleteEventsByCourseId,
        replaceCourseEvents,
        clearSchedule,
        undoScheduleChange,
        canUndoScheduleChange: undo !== null,
      }}
    >
      {children}
    </CalendarContext.Provider>
  );
}

export function useCalendar() {
  const context = useContext(CalendarContext);
  if (context === undefined) {
    throw new Error("useCalendar must be used within a CalendarProvider");
  }
  return context;
}
