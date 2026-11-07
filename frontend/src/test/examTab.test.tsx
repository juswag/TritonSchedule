import { fireEvent, render, screen, within, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";
import { CalendarProvider } from "@/context/CalendarContext";
import CalendarPage from "@/pages/CalendarPage";
import type { CalendarEvent } from "@/types/calendar";

const courses: CalendarEvent[] = ["CSE 11", "MATH 20A", "PHYS 2A", "ECON 1"].map((code, index) => ({
  id: code, courseId: code, title: `${code}: Course`, courseTitle: `${code}: Course`,
  dayOfWeek: "Mon", startTime: "09:00", endTime: "09:50", isCourse: true, eventType: "Lecture", color: "#2563eb",
  exams: [
    { id: `${code}-m`, type: "midterm", name: "Midterm", location: "CENTR 101",
      time: ["2026-10-27 7:00pm-9:00pm", "2026-10-27 8:00pm-9:30pm", "2026-10-19 6:00pm-7:30pm", "2026-11-05 5:00pm-6:30pm"][index] },
    { id: `${code}-f`, type: "final", name: "Final", location: "TBA", time: `2026-12-${7 + index} 8:00am-11:00am`.replace("-7 ", "-07 ").replace("-8 ", "-08 ").replace("-9 ", "-09 ") },
  ],
}));

function mount(events = courses) {
  localStorage.setItem("calendarEvents", JSON.stringify(events));
  return render(<MemoryRouter><CalendarProvider><CalendarPage /></CalendarProvider></MemoryRouter>);
}
function expandConflicts() {
  fireEvent.click(screen.getByText(/^\d+ exam conflicts?$/, { selector: "summary" }));
}
function openExams() {
  fireEvent.mouseDown(screen.getByRole("tab", { name: /Exams/ }), { button: 0, ctrlKey: false });
}

describe("exam tab", () => {
  beforeEach(() => localStorage.clear());
  it("groups exams by date and links each conflicting exam to its overlap", () => {
    mount([...courses, { ...courses[0], id: "second-lecture", dayOfWeek: "Wed" }]);
    expect(screen.getByRole("tab", { name: "Weekly classes" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: /Exams 1 conflict/ })).toBeInTheDocument();
    openExams();
    expandConflicts();
    const midterms = screen.getByRole("table", { name: "Midterms" });
    expect(within(midterms).getAllByText("Tue, Oct 27, 2026")).toHaveLength(1);
    expect(within(midterms).getAllByRole("cell", { name: "CENTR 101" })).toHaveLength(4);
    expect(within(screen.getByRole("table", { name: "Finals" })).getAllByRole("cell", { name: "TBA" })).toHaveLength(4);
    expect(screen.getByText("CSE 11 and MATH 20A overlap")).toBeVisible();
    expect(screen.getByText("Tue, Oct 27, 2026 · 8:00 PM – 9:00 PM")).toBeVisible();
    expect(screen.getAllByLabelText("Exam time conflict")).toHaveLength(2);
    const ids = within(midterms).getAllByRole("cell").map((cell) => cell.getAttribute("aria-describedby")).filter(Boolean);
    expect(ids).toHaveLength(2);
    for (const id of ids) expect(document.getElementById(id!)).toHaveTextContent("CSE 11 and MATH 20A overlap");
  });
  it("retains exam data after refresh and clears conflicts when a course is removed", async () => {
    const first = mount();
    await waitFor(() => expect(JSON.parse(localStorage.getItem("calendarEvents")!)[0].exams).toHaveLength(2));
    first.unmount();
    render(<MemoryRouter><CalendarProvider><CalendarPage /></CalendarProvider></MemoryRouter>);
    fireEvent.click(screen.getAllByRole("button", { name: "Remove CSE 11: Course" })[0]);
    expect(screen.queryByRole("tab", { name: /Exams.*conflict/ })).not.toBeInTheDocument();
    openExams();
    expect(screen.queryByText("CSE 11: Course")).not.toBeInTheDocument();
    expect(screen.queryByText(/and MATH 20A overlap/)).not.toBeInTheDocument();
    expect(within(screen.getByRole("table", { name: "Midterms" })).getAllByText("CENTR 101")).toHaveLength(3);
  });
  it("explains missing saved metadata without inventing exams", () => {
    mount([{ ...courses[0], exams: undefined }]);
    openExams();
    expect(screen.getByText(/re-add these courses/)).toBeInTheDocument();
    expect(screen.queryByText(/No midterms listed/)).not.toBeInTheDocument();
    expect(screen.queryByRole("table", { name: "Finals" })).toBeNull();
  });
  it("keeps Midterms visible for a schedule with only a final", () => {
    mount([{ ...courses[0], exams: courses[0].exams!.filter((exam) => exam.type === "final") }]);
    openExams();
    const midterms = within(screen.getByRole("region", { name: "Midterms" }));
    expect(midterms.getByText("No midterms listed for CSE 11.")).toBeVisible();
    expect(midterms.queryByRole("table")).toBeNull();
    expect(screen.getByRole("table", { name: "Finals" })).toBeVisible();
  });
  it("shows an empty schedule state", () => {
    mount([]);
    openExams();
    expect(screen.getByText("Add courses to see their exam details")).toBeInTheDocument();
  });
});

describe("schedule compatibility", () => {
  beforeEach(() => localStorage.clear());
  it("lists each cross-type conflict once and associates it with both exams", () => {
    const overlapping = courses.slice(0, 3).map((course, index) => ({
      ...course,
      exams: [{ ...course.exams![0], type: index === 0 ? "final" as const : "midterm" as const, time: "2026-12-07 8:00am-11:00am" }],
    }));
    mount(overlapping);
    expect(screen.getByRole("tab", { name: /Exams 3 conflicts/ })).toBeInTheDocument();
    openExams();
    expandConflicts();
    expect(screen.getAllByText(/ overlap$/)).toHaveLength(3);
    for (const table of screen.getAllByRole("table")) {
      for (const marker of within(table).getAllByLabelText("Exam time conflict")) {
        const ids = marker.closest("td")?.getAttribute("aria-describedby")?.split(" ") ?? [];
        expect(ids).toHaveLength(2);
        for (const id of ids) expect(document.getElementById(id)).toHaveTextContent(/overlap/);
      }
    }
  });
  it("keeps personal events editable and out of the exam list", () => {
    mount([
      { id: "lunch", title: "Lunch", dayOfWeek: "Mon", startTime: "12:00", endTime: "13:00", color: "blue" },
      { id: "study", title: "Study group", dayOfWeek: "Tue", startTime: "19:00", endTime: "20:30", color: "green", location: "Library" },
      { id: "call", title: "Quick call", dayOfWeek: "Mon", startTime: "08:00", endTime: "08:15", color: "purple" },
    ]);
    expect(screen.getByTitle(/^Lunch/)).toHaveTextContent("12:00 PM");
    expect(screen.getByTitle(/^Study group/)).toHaveTextContent("7:00 PM");
    fireEvent.click(screen.getByRole("button", { name: "Tue" }));
    expect(screen.getByText("Library", { selector: "p" })).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: "Remove Study group" })[0]);
    expect(screen.queryByTitle(/^Study group/)).not.toBeInTheDocument();
    openExams();
    expect(screen.getByText("Add courses to see their exam details")).toBeInTheDocument();
  });
  it.each(["not json", "null", "{}", '[{"id":123}]'])("recovers safely from invalid stored schedules: %s", (stored) => {
    localStorage.setItem("calendarEvents", stored);
    render(<MemoryRouter><CalendarProvider><CalendarPage /></CalendarProvider></MemoryRouter>);
    openExams();
    expect(screen.getByText("Add courses to see their exam details")).toBeInTheDocument();
  });
});
