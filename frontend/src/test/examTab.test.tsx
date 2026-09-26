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
function openExams() {
  fireEvent.mouseDown(screen.getByRole("tab", { name: /Exams/ }), { button: 0, ctrlKey: false });
}

describe("exam tab", () => {
  beforeEach(() => localStorage.clear());
  it("shows four courses, one persistent badge, and one compact notice scoped to the pair", () => {
    mount([...courses, { ...courses[0], id: "second-lecture", dayOfWeek: "Wed" }]);
    expect(screen.getByText("4 courses")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Weekly classes" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: /Exams 1 conflict/ })).toBeInTheDocument();
    openExams();
    const midterms = screen.getByRole("table", { name: "Midterms" });
    expect(within(midterms).getAllByRole("row")).toHaveLength(6);
    expect(within(screen.getByRole("table", { name: "Finals" })).getAllByRole("row")).toHaveLength(5);
    const notice = screen.getByText("CSE 11 and MATH 20A overlap");
    expect(notice.parentElement?.textContent).toBe("CSE 11 and MATH 20A overlap");
    expect(screen.getAllByLabelText("Exam time conflict")).toHaveLength(2);
    const ids = within(midterms).getAllByRole("cell").map((cell) => cell.getAttribute("aria-describedby")).filter(Boolean);
    expect(ids).toHaveLength(2);
    for (const id of ids) expect(document.getElementById(id!)).toHaveTextContent("CSE 11 and MATH 20A overlap");
    const rows = within(midterms).getAllByRole("row");
    expect(rows[3]).toHaveTextContent("MATH 20A");
    expect(rows[4]).toContainElement(notice);
    expect(rows[5]).toHaveTextContent("ECON 1");
  });
  it("retains exam data after refresh and clears conflicts when a course is removed", async () => {
    const first = mount();
    await waitFor(() => expect(JSON.parse(localStorage.getItem("calendarEvents")!)[0].exams).toHaveLength(2));
    first.unmount();
    render(<MemoryRouter><CalendarProvider><CalendarPage /></CalendarProvider></MemoryRouter>);
    fireEvent.click(screen.getAllByRole("button", { name: "Remove CSE 11: Course" })[0]);
    expect(screen.queryByText("1 conflict")).not.toBeInTheDocument();
    openExams();
    expect(screen.queryByText("CSE 11: Course")).not.toBeInTheDocument();
    expect(screen.queryByText(/and MATH 20A overlap/)).not.toBeInTheDocument();
    expect(screen.getByText("3 courses")).toBeInTheDocument();
  });
  it("explains missing saved metadata without inventing exams", () => {
    mount([{ ...courses[0], exams: undefined }]);
    openExams();
    expect(screen.getByText(/Remove and re-add these courses/)).toBeInTheDocument();
    expect(screen.getByText("No final details available.")).toBeInTheDocument();
  });
  it("shows an empty schedule state", () => {
    mount([]);
    openExams();
    expect(screen.getByText("Add courses to see their exam details")).toBeInTheDocument();
  });
});

describe("schedule compatibility", () => {
  beforeEach(() => localStorage.clear());
  it("places a cross-type notice once after the final and counts distinct pairs", () => {
    const overlapping = courses.slice(0, 3).map((course, index) => ({
      ...course,
      exams: [{ ...course.exams![0], type: index === 0 ? "final" as const : "midterm" as const, time: "2026-12-07 8:00am-11:00am" }],
    }));
    mount(overlapping);
    expect(screen.getByText("3 conflicts")).toBeInTheDocument();
    openExams();
    const finals = screen.getByRole("table", { name: "Finals" });
    expect(within(finals).getAllByText(/ overlap$/)).toHaveLength(2);
    expect(within(screen.getByRole("table", { name: "Midterms" })).getAllByText(/ overlap$/)).toHaveLength(1);
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
