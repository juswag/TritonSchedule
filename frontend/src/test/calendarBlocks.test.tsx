import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";
import { CalendarProvider } from "@/context/CalendarContext";
import { getCourseCode } from "@/lib/courseLabels";
import CalendarPage from "@/pages/CalendarPage";
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
  window.localStorage.setItem("calendarEvents", JSON.stringify(events));
  render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <CalendarProvider>
        <CalendarPage />
      </CalendarProvider>
    </MemoryRouter>
  );
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
    expect(parseFloat(block.parentElement!.style.height)).toBeCloseTo(50 / 60 * 64);
  });

  it("prioritizes course labels over meeting types when blocks overlap", () => {
    renderSchedule([
      lecture,
      { ...lecture, id: "discussion", title: "CSE 101: Algorithms", eventType: "Discussion" },
    ]);

    for (const code of ["CSE 100", "CSE 101"]) {
      const block = screen.getByTitle(new RegExp(`^${code}:`));
      expect(within(block).getByText(code)).toBeInTheDocument();
      expect(within(block).queryByText(/^(Lecture|Discussion)$/)).not.toBeInTheDocument();
      expect(within(block).getByText("CENTR 101")).toBeInTheDocument();
      expect(block.parentElement?.style.width).toBe("50%");
    }
  });

  it("keeps legacy events readable when no location was saved", () => {
    renderSchedule([{ ...lecture, location: undefined }]);
    expect(within(screen.getByTitle(/^CSE 100:/)).getByText("Location unavailable")).toBeInTheDocument();
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
