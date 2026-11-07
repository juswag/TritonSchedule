import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { getCourseCode } from "@/lib/courseLabels";
import { WeekCalendar } from "@/components/schedule/WeekCalendar";
import type { CalendarEvent } from "@/types/calendar";

const lecture: CalendarEvent = {
  id: "lecture",
  title: "CSE 100: Advanced Data Structures",
  dayOfWeek: "Tue",
  startTime: "09:00",
  endTime: "09:50",
  color: "#2563eb",
  isCourse: true,
  eventType: "Lecture",
  location: "CENTR 101",
};

function renderSchedule(events: CalendarEvent[]) {
  render(<WeekCalendar events={events} />);
}

describe("calendar class blocks", () => {
  beforeEach(() => window.localStorage.clear());

  it("shows saved locations and meeting types without changing the time footprint", () => {
    renderSchedule([lecture]);
    const block = screen.getByTitle(/^CSE 100:/);

    expect(within(block).getByText("CSE 100")).toBeInTheDocument();
    expect(within(block).getByText("Lecture")).toBeInTheDocument();
    expect(within(block).getByText("CENTR 101")).toBeInTheDocument();
    expect(block.parentElement?.style.top).toBe("144px");
    expect(parseFloat(block.parentElement!.style.height)).toBeCloseTo(
      (50 / 60) * 64,
    );
  });

  it("prioritizes course labels over meeting types when blocks overlap", () => {
    renderSchedule([
      lecture,
      {
        ...lecture,
        id: "discussion",
        title: "CSE 101: Algorithms",
        eventType: "Discussion",
      },
    ]);

    for (const code of ["CSE 100", "CSE 101"]) {
      const block = screen.getByTitle(new RegExp(`^${code}:`));
      expect(within(block).getByText(code)).toBeInTheDocument();
      expect(
        within(block).queryByText(/^(Lecture|Discussion)$/),
      ).not.toBeInTheDocument();
      expect(within(block).getByText("CENTR 101")).toBeInTheDocument();
      expect(block.parentElement?.style.width).toBe("50%");
    }
  });

  it("includes weekend and early/late meetings in the grid", () => {
    renderSchedule([
      {
        ...lecture,
        id: "early",
        startTime: "06:00",
        endTime: "06:50",
        dayOfWeek: "Sat",
      },
      {
        ...lecture,
        id: "late",
        title: "CSE 101: Algorithms",
        startTime: "23:00",
        endTime: "24:00",
        dayOfWeek: "Sun",
      },
    ]);
    expect(screen.getByText("Saturday")).toBeInTheDocument();
    expect(screen.getByText("Sunday")).toBeInTheDocument();
    expect(screen.getByText("6 AM")).toBeInTheDocument();
    expect(screen.getByText("11 PM")).toBeInTheDocument();
    expect(screen.getByTitle(/^CSE 100:/).parentElement?.style.top).toBe(
      "16px",
    );
  });

  it("frames all candidate times so switching previews does not hide later meetings", () => {
    const later = {
      ...lecture,
      id: "late",
      startTime: "18:00",
      endTime: "19:00",
    };
    render(
      <WeekCalendar
        events={[lecture]}
        rangeEvents={[lecture, later]}
        focusHours
      />,
    );
    expect(screen.queryByText("7 AM")).not.toBeInTheDocument();
    expect(screen.getByText("8 AM")).toBeInTheDocument();
    expect(screen.getByText("7 PM")).toBeInTheDocument();
    expect(screen.getByTitle(/^CSE 100:/).parentElement?.style.top).toBe(
      "80px",
    );
  });

  it("keeps the empty day concise", () => {
    render(<WeekCalendar events={[]} />);
    expect(screen.getByText("No classes on Mon")).toBeInTheDocument();
    expect(
      screen.queryByText("Choose another day or add a course."),
    ).not.toBeInTheDocument();
  });

  it("uses extra screen height for later hours without pushing morning classes down", () => {
    const originalHeight = window.innerHeight;
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: 1301,
    });
    try {
      render(<WeekCalendar events={[lecture]} focusHours />);
      expect(screen.getByText("8 AM")).toBeInTheDocument();
      expect(screen.queryByText("7 AM")).not.toBeInTheDocument();
      expect(screen.getByText("8 PM")).toBeInTheDocument();
      const firstClassTop = parseFloat(
        screen.getByTitle(/^CSE 100:/).parentElement!.style.top,
      );
      expect(firstClassTop).toBeLessThanOrEqual(112);
    } finally {
      Object.defineProperty(window, "innerHeight", {
        configurable: true,
        value: originalHeight,
      });
    }
  });

  it("keeps legacy events readable when no location was saved", () => {
    renderSchedule([{ ...lecture, location: undefined }]);
    expect(
      within(screen.getByTitle(/^CSE 100:/)).getByText("Location unavailable"),
    ).toBeInTheDocument();
  });
});

describe("shared course labels", () => {
  it.each([
    ["CSE 029: Systems", "CSE 029"],
    ["cse229a: Seminar", "CSE 229A"],
    ["MATH 20C: Calculus", "MATH 20C"],
    ["Study group", "Study group"],
  ])("formats %s as %s", (name, expected) => {
    expect(getCourseCode(name)).toBe(expected);
  });
});
