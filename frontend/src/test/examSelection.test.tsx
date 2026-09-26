import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { CalendarProvider } from "@/context/CalendarContext";
import SearchCourses from "@/pages/SearchCourses";
import CalendarPage from "@/pages/CalendarPage";
import type { CalendarEvent } from "@/types/calendar";

const course = {
  id: "exam-integration-cse11",
  Name: "CSE 11 - Introduction to Computer Science",
  Term: "FA26",
  Teacher: "Test Professor",
  Lecture: { Days: "Mon Wed Fri", Time: "10:00 AM - 10:50 AM", Location: "CENTR 101" },
  Midterms: [{ Days: "10/27/2026", Time: "7:00 PM - 9:00 PM", Location: "MIDTERM ROOM" }],
  Final: { Days: "12/07/2026", Time: "8:00 AM - 11:00 AM", Location: "FINAL ROOM" },
  Discussions: [
    {
      SectionCode: "A01", Days: "Tue", Time: "11:00 AM - 11:50 AM", Location: "DISCUSSION ROOM",
      Exams: [{ Type: "midterm", Days: "11/03/2026", Time: "6:00 PM - 7:00 PM", Location: "SELECTED EXAM ROOM" }],
    },
    {
      SectionCode: "A02", Days: "Tue", Time: "12:00 PM - 12:50 PM", Location: "OTHER DISCUSSION ROOM",
      Exams: [{ Type: "midterm", Days: "11/04/2026", Time: "6:00 PM - 7:00 PM", Location: "UNSELECTED EXAM ROOM" }],
    },
  ],
};

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input), "http://localhost");
    if (url.pathname.endsWith("/term")) return new Response(JSON.stringify({ Term: "FA26" }), { headers: { "content-type": "application/json" } });
    if (url.pathname.endsWith("/course")) return new Response(JSON.stringify({ data: [course] }), { headers: { "content-type": "application/json" } });
    throw new Error(`Unexpected test request: ${url}`);
  }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
  sessionStorage.clear();
});

describe("exam metadata through course selection", () => {
  it("saves only the selected section exams and reloads them in the Exams tab", async () => {
    const search = render(
      <MemoryRouter initialEntries={["/courses?q=CSE%2011"]}>
        <CalendarProvider><SearchCourses /></CalendarProvider>
      </MemoryRouter>
    );

    const add = await screen.findByRole("button", { name: "Add section" });
    expect(add).toBeEnabled();
    fireEvent.click(add);
    await screen.findByRole("button", { name: "Added to schedule" });

    await waitFor(() => {
      const saved = JSON.parse(localStorage.getItem("calendarEvents") ?? "[]") as CalendarEvent[];
      expect(saved).toHaveLength(4);
      for (const event of saved) {
        expect(event.courseTitle).toBe(course.Name);
        expect(event.exams).toEqual(expect.arrayContaining([
          expect.objectContaining({ type: "midterm", location: "MIDTERM ROOM", time: "10/27/2026 7:00 PM - 9:00 PM" }),
          expect.objectContaining({ type: "final", location: "FINAL ROOM", time: "12/07/2026 8:00 AM - 11:00 AM" }),
          expect.objectContaining({ type: "midterm", location: "SELECTED EXAM ROOM" }),
        ]));
        expect(event.exams).toHaveLength(3);
        expect(event.exams?.some((exam) => exam.location === "UNSELECTED EXAM ROOM")).toBe(false);
      }
    });

    search.unmount();
    render(<MemoryRouter><CalendarProvider><CalendarPage /></CalendarProvider></MemoryRouter>);
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Exams" }), { button: 0, ctrlKey: false });
    const midterms = screen.getByRole("table", { name: "Midterms" });
    const finals = screen.getByRole("table", { name: "Finals" });
    expect(within(midterms).getByText("MIDTERM ROOM")).toBeVisible();
    expect(within(midterms).getByText("SELECTED EXAM ROOM")).toBeVisible();
    expect(within(finals).getByText("FINAL ROOM")).toBeVisible();
    expect(within(midterms).getAllByRole("row")).toHaveLength(3);
    expect(within(finals).getAllByRole("row")).toHaveLength(2);
    expect(screen.queryByText("UNSELECTED EXAM ROOM")).not.toBeInTheDocument();
    expect(screen.queryByText(/Exam details weren’t saved/)).not.toBeInTheDocument();
  });
});
