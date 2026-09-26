import React, { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { CalendarCourse, CalendarEvent } from "@/types/calendar";

interface CalendarContextType {
  events: CalendarEvent[];
  examOnlyCourses: CalendarCourse[];
  addExamOnlyCourse: (course: CalendarCourse) => void;
  addEvent: (event: CalendarEvent) => void;
  updateEvent: (id: string, event: Partial<CalendarEvent>) => void;
  deleteEvent: (id: string) => void;
  deleteEventsByCourseId: (courseId: string) => void;
}

const CalendarContext = createContext<CalendarContextType | undefined>(undefined);
const CALENDAR_EVENTS_STORAGE_KEY = "calendarEvents";
const EXAM_ONLY_COURSES_STORAGE_KEY = "calendarExamOnlyCourses";

function loadExamOnlyCourses(): CalendarCourse[] {
  if (typeof window === "undefined") return [];
  try {
    const stored: unknown = JSON.parse(window.localStorage.getItem(EXAM_ONLY_COURSES_STORAGE_KEY) ?? "[]");
    if (!Array.isArray(stored)) return [];
    return stored.filter((course): course is CalendarCourse => course && typeof course.id === "string"
      && typeof course.title === "string" && typeof course.color === "string" && Array.isArray(course.exams));
  } catch {
    return [];
  }
}

function loadStoredEvents(): CalendarEvent[] {
  if (typeof window === "undefined") {
    return [];
  }

  const storedEvents = window.localStorage.getItem(CALENDAR_EVENTS_STORAGE_KEY);
  if (!storedEvents) {
    return [];
  }

  try {
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
  const [events, setEvents] = useState<CalendarEvent[]>(() => loadStoredEvents());
  const [examOnlyCourses, setExamOnlyCourses] = useState<CalendarCourse[]>(loadExamOnlyCourses);

  useEffect(() => {
    window.localStorage.setItem(CALENDAR_EVENTS_STORAGE_KEY, JSON.stringify(events));
  }, [events]);

  useEffect(() => {
    window.localStorage.setItem(EXAM_ONLY_COURSES_STORAGE_KEY, JSON.stringify(examOnlyCourses));
  }, [examOnlyCourses]);

  const addExamOnlyCourse = (course: CalendarCourse) => {
    setExamOnlyCourses((previous) => [...previous.filter((item) => item.id !== course.id), course]);
  };

  const addEvent = (event: CalendarEvent) => {
    setEvents((prev) => [...prev, event]);
  };

  const updateEvent = (id: string, updatedFields: Partial<CalendarEvent>) => {
    setEvents((prev) =>
      prev.map((event) =>
        event.id === id ? { ...event, ...updatedFields } : event
      )
    );
  };

  const deleteEvent = (id: string) => {
    setEvents((prev) => prev.filter((event) => event.id !== id));
  };

  const deleteEventsByCourseId = (courseId: string) => {
    setEvents((prev) => prev.filter((event) => event.courseId !== courseId));
    setExamOnlyCourses((prev) => prev.filter((course) => course.id !== courseId));
  };

  return (
    <CalendarContext.Provider
      value={{ events, examOnlyCourses, addExamOnlyCourse, addEvent, updateEvent, deleteEvent, deleteEventsByCourseId }}
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
