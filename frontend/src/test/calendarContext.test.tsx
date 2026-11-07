import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { CalendarProvider, useCalendar } from "../context/CalendarContext";

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: () => {
      store = {};
    },
  };
})();

Object.defineProperty(window, "localStorage", { value: localStorageMock });

describe("CalendarContext", () => {
  beforeEach(() => {
    localStorageMock.clear();
    vi.clearAllMocks();
  });

  it("should provide initial events from localStorage", () => {
    const mockEvents = [
      {
        id: "1",
        title: "Test Event",
        dayOfWeek: "Monday",
        startTime: "09:00",
        endTime: "10:00",
        color: "#ff0000",
        courseId: "COURSE001",
      },
    ];
    localStorageMock.getItem.mockReturnValueOnce(JSON.stringify(mockEvents));

    const { result } = renderHook(() => useCalendar(), {
      wrapper: CalendarProvider,
    });

    expect(result.current.events).toHaveLength(1);
    expect(result.current.events[0].title).toBe("Test Event");
  });

  it("should add an event", () => {
    const { result } = renderHook(() => useCalendar(), {
      wrapper: CalendarProvider,
    });

    const newEvent = {
      id: "2",
      title: "New Event",
      dayOfWeek: "Tue" as const,
      startTime: "10:00",
      endTime: "11:00",
      color: "#00ff00",
      courseId: "COURSE002",
    };

    act(() => {
      result.current.addEvent(newEvent);
    });

    expect(result.current.events).toHaveLength(1);
    expect(result.current.events[0].title).toBe("New Event");
    expect(localStorageMock.setItem).toHaveBeenCalled();
  });

  it("should update an event", () => {
    const { result } = renderHook(() => useCalendar(), {
      wrapper: CalendarProvider,
    });

    const event = {
      id: "3",
      title: "Original Title",
      dayOfWeek: "Wed" as const,
      startTime: "11:00",
      endTime: "12:00",
      color: "#0000ff",
      courseId: "COURSE003",
    };

    act(() => {
      result.current.addEvent(event);
    });

    act(() => {
      result.current.updateEvent("3", { title: "Updated Title" });
    });

    expect(result.current.events[0].title).toBe("Updated Title");
  });

  it("should delete an event by id", () => {
    const { result } = renderHook(() => useCalendar(), {
      wrapper: CalendarProvider,
    });

    const event = {
      id: "4",
      title: "To Delete",
      dayOfWeek: "Thu" as const,
      startTime: "13:00",
      endTime: "14:00",
      color: "#ffff00",
      courseId: "COURSE004",
    };

    act(() => {
      result.current.addEvent(event);
    });

    expect(result.current.events).toHaveLength(1);

    act(() => {
      result.current.deleteEvent("4");
    });

    expect(result.current.events).toHaveLength(0);
  });

  it("should delete events by courseId", () => {
    const { result } = renderHook(() => useCalendar(), {
      wrapper: CalendarProvider,
    });

    act(() => {
      result.current.addEvent({
        id: "5",
        title: "Event 1",
        dayOfWeek: "Fri",
        startTime: "14:00",
        endTime: "15:00",
        color: "#ff00ff",
        courseId: "COURSE005",
      });
      result.current.addEvent({
        id: "6",
        title: "Event 2",
        dayOfWeek: "Fri",
        startTime: "15:00",
        endTime: "16:00",
        color: "#00ffff",
        courseId: "COURSE005",
      });
    });

    expect(result.current.events).toHaveLength(2);

    act(() => {
      result.current.deleteEventsByCourseId("COURSE005");
    });

    expect(result.current.events).toHaveLength(0);
  });

  it("replaces all course meetings, keeps personal events, and restores courses with Undo", () => {
    const oldCourse = {
      id: "old",
      title: "CSE 100",
      dayOfWeek: "Mon" as const,
      startTime: "09:00",
      endTime: "10:00",
      color: "blue",
      isCourse: true,
    };
    const personal = {
      ...oldCourse,
      id: "personal",
      title: "Appointment",
      isCourse: false,
    };
    const replacement = {
      ...oldCourse,
      id: "new",
      startTime: "11:00",
      endTime: "12:00",
    };
    localStorageMock.setItem(
      "calendarEvents",
      JSON.stringify([oldCourse, personal]),
    );
    const { result } = renderHook(() => useCalendar(), {
      wrapper: CalendarProvider,
    });
    act(() => result.current.replaceCourseEvents([replacement]));
    expect(result.current.events).toEqual([personal, replacement]);
    expect(JSON.parse(localStorageMock.getItem("calendarEvents")!)).toEqual([
      personal,
      replacement,
    ]);
    expect(result.current.canUndoCourseReplacement).toBe(true);
    const laterPersonal = { ...personal, id: "later" };
    act(() => result.current.addEvent(laterPersonal));
    act(() => result.current.undoCourseReplacement());
    expect(result.current.events).toEqual([personal, laterPersonal, oldCourse]);
    expect(result.current.canUndoCourseReplacement).toBe(false);
    act(() => result.current.undoCourseReplacement());
    expect(result.current.events).toHaveLength(3);
  });

  it("invalidates Undo when course meetings are edited after applying", () => {
    const course = {
      id: "new",
      title: "CSE 100",
      dayOfWeek: "Mon" as const,
      startTime: "09:00",
      endTime: "10:00",
      color: "blue",
      isCourse: true,
    };
    const { result } = renderHook(() => useCalendar(), {
      wrapper: CalendarProvider,
    });
    act(() => result.current.replaceCourseEvents([course]));
    act(() => result.current.updateEvent("new", { startTime: "10:00" }));
    expect(result.current.canUndoCourseReplacement).toBe(false);
  });

  it("should throw error when useCalendar is used outside provider", () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    expect(() => {
      renderHook(() => useCalendar());
    }).toThrow("useCalendar must be used within a CalendarProvider");

    consoleError.mockRestore();
  });
});
