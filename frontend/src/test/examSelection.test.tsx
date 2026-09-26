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

function mockCatalog(payload: unknown, status = 200, term: unknown = { Term: { Term: "FA26" } }) {
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input), "http://localhost");
    return new Response(JSON.stringify(url.pathname.endsWith("/term") ? term : payload), {
      status: url.pathname.endsWith("/term") ? 200 : status,
      headers: { "content-type": "application/json" },
    });
  }));
}

function renderSearch(path = "/courses?q=CSE%2011") {
  return render(<MemoryRouter initialEntries={[path]}><CalendarProvider><SearchCourses /></CalendarProvider></MemoryRouter>);
}

function savedEvents(): CalendarEvent[] {
  return JSON.parse(localStorage.getItem("calendarEvents") ?? "[]");
}

describe("course search selection and recovery", () => {
  it.each([400, 404, 200])("shows no results for an empty catalog response (%s)", async (status) => {
    mockCatalog({}, status);
    renderSearch();
    expect((await screen.findAllByText("No results"))[0]).toBeVisible();
    expect(screen.queryByRole("button", { name: "Add section" })).not.toBeInTheDocument();
  });

  it("shows a recoverable error for failed searches", async () => {
    mockCatalog({}, 500);
    renderSearch();
    expect(await screen.findByText("Search unavailable")).toBeVisible();
    mockCatalog([course]);
    fireEvent.change(screen.getByRole("textbox", { name: "Search courses" }), { target: { value: "CSE" } });
    expect(await screen.findByRole("button", { name: "Add section" })).toBeEnabled();
  });

  it("starts empty, searches typed input and clears the result", async () => {
    renderSearch("/courses");
    expect(screen.getByText("Search courses", { selector: "p" })).toBeVisible();
    fireEvent.change(screen.getByRole("textbox", { name: "Search courses" }), { target: { value: "CSE 11" } });
    await screen.findByRole("button", { name: "Add section" });
    fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
    expect(screen.getByRole("textbox", { name: "Search courses" })).toHaveValue("");
    await waitFor(() => expect(screen.queryByRole("button", { name: "Add section" })).not.toBeInTheDocument());
  });

  it("uses the chosen discussion and lab exams instead of their defaults", async () => {
    mockCatalog([{ ...course, Labs: [
      { SectionCode: "L01", Days: "Thu", Time: "1:00 PM - 2:00 PM", Exams: [{ Type: "final", Days: "12/08/2026", Time: "3:00 PM - 4:00 PM", Location: "DEFAULT LAB EXAM" }] },
      { SectionCode: "L02", Days: "Thu", Time: "3:00 PM - 4:00 PM", Exams: [{ Type: "final", Days: "12/09/2026", Time: "3:00 PM - 4:00 PM", Location: "CHOSEN LAB EXAM" }] },
    ] }]);
    renderSearch();
    fireEvent.click(await screen.findByRole("combobox", { name: "Choose discussion section" }));
    fireEvent.click(await screen.findByRole("option", { name: /A02/ }));
    await waitFor(() => expect(screen.queryByRole("listbox", { name: "Discussion sections" })).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole("combobox", { name: "Choose lab section" }));
    fireEvent.click(await screen.findByRole("option", { name: /L02/ }));
    await waitFor(() => expect(screen.getByRole("combobox", { name: "Choose lab section" })).toHaveTextContent("L02"));
    fireEvent.click(screen.getByRole("button", { name: "Add section" }));
    await waitFor(() => expect(savedEvents()).toHaveLength(5));
    const exams = savedEvents()[0].exams!;
    expect(exams.map((exam) => exam.location)).toEqual(expect.arrayContaining(["UNSELECTED EXAM ROOM", "CHOSEN LAB EXAM"]));
    expect(exams.map((exam) => exam.location)).not.toContain("SELECTED EXAM ROOM");
    expect(exams.map((exam) => exam.location)).not.toContain("DEFAULT LAB EXAM");
  });

  it("accepts lowercase catalog fields, compact days and optional exam details", async () => {
    mockCatalog([{
      name: "MATH 20A", term: "FA26", teacher: "Another Professor", rating: "4.1",
      lecture: [{ Days: "MWF", Time: "9:00-9:50a" }],
      discussions: [{ Days: "Tu", Time: "12:00-12:50p", Exams: [{ Type: "final", Location: "TBA" }] }],
      labs: [{ Days: "Th", Time: "2:00p-3:00p" }],
      midterms: [{}, { Location: "ROOM ONLY" }, { Time: "6:00p-7:00p" }], final: { Location: "FINAL ONLY" },
    }]);
    renderSearch();
    fireEvent.click(await screen.findByRole("button", { name: "Add section" }));
    await waitFor(() => expect(savedEvents()).toHaveLength(5));
    expect(savedEvents()[0].exams).toHaveLength(4);
    expect(savedEvents().every((event) => event.location === "TBA")).toBe(true);
    expect(savedEvents().find((event) => event.eventType === "Discussion")?.startTime).toBe("12:00");
    expect(savedEvents().find((event) => event.eventType === "Lab")?.dayOfWeek).toBe("Thu");
  });

  it("retains an explicitly empty exam list for courses with no published exams", async () => {
    mockCatalog([{ Name: "Independent Studies", Lecture: { Days: "Friday", Time: "11:00 AM - 12:00 PM" }, Final: {} }]);
    renderSearch();
    expect(await screen.findByText("No discussion required")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Add section" }));
    await waitFor(() => expect(savedEvents()).toHaveLength(1));
    expect(savedEvents()[0].exams).toEqual([]);
  });

  it("disables adding a catalog course without a usable meeting time", async () => {
    mockCatalog([{}]);
    renderSearch();
    expect(await screen.findByRole("button", { name: "Add section" })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Select Untitled Course with Instructor TBA/ })).toBeVisible();
    expect(savedEvents()).toEqual([]);
  });

  it("filters unavailable and conflicting discussion sections", async () => {
    mockCatalog([{ ...course, Discussions: [
      { Days: "Mon", Time: "10:00 AM - 10:50 AM" },
      { Days: "TBA", Time: "TBA" },
      { Days: "Thu", Time: "11:00 AM - 11:50 AM" },
    ] }]);
    renderSearch();
    expect(await screen.findByText("2 conflicting discussion sections hidden")).toBeVisible();
    expect(screen.getByRole("combobox", { name: "Choose discussion section" })).toHaveTextContent("Discussion 3");
  });

  it("explains when every discussion is unavailable", async () => {
    mockCatalog([{ ...course, Discussions: [{ Days: "ARRANGED", Time: "" }] }]);
    renderSearch();
    expect(await screen.findByText("No conflict-free discussion sections are available.")).toBeVisible();
  });

  it("blocks adding a lecture that overlaps the saved schedule", async () => {
    localStorage.setItem("calendarEvents", JSON.stringify([
      { id: "existing", courseId: "other", title: "MATH 20B (A01)", dayOfWeek: "Mon", startTime: "10:15", endTime: "11:00", color: "#123456", isCourse: true },
      { id: "free", title: "Study", dayOfWeek: "Fri", startTime: "15:00", endTime: "16:00", color: "#123456" },
    ]));
    renderSearch();
    expect(await screen.findByRole("button", { name: "Resolve schedule conflict" })).toBeDisabled();
    expect(screen.getByText(/Conflicts with MATH 20B on Mon/)).toBeVisible();
    expect(savedEvents()).toHaveLength(2);
  });

  it.each([[4.8, "Excellent"], [4.2, "Very good"], [3.4, "Good"], [2.5, "Mixed"]])("shows verified professor details with rating %s", async (rating, label) => {
    mockCatalog([{ ...course, rmp: { avgRating: rating, avgDiff: 3, takeAgainPercent: 90, profileUrl: "https://www.ratemyprofessors.com/professor/123" }, TssFallbackUrl: "https://tss.ucsd.edu/fiori#YSchedule-view&/YUCSD_CON_MODULE(AcademicYear='2026',AcademicPeriod='FA',ModuleID='123')?layout=MidColumnFullScreen" }]);
    renderSearch();
    expect(await screen.findByText(label)).toBeVisible();
    expect(screen.getByText(/90% would take again/)).toBeVisible();
    expect(screen.getByRole("link", { name: "Open in TSS" })).toHaveAttribute("href", expect.stringContaining("tss.ucsd.edu"));
  });

  it("switches between course results before adding", async () => {
    mockCatalog([course, { ...course, id: "physics", Name: "PHYS 2A - Mechanics", Lecture: { Days: "Monday Thursday", Time: "2:00 PM - 3:00 PM" }, Lectures: [{ Days: "Monday", Time: "2:00 PM - 3:00 PM" }, { Days: "Thursday", Time: "4:00 PM - 5:00 PM", Location: "LAB" }], Discussions: [] }]);
    renderSearch();
    fireEvent.click(await screen.findByRole("button", { name: /Select PHYS 2A/ }));
    fireEvent.click(screen.getByRole("button", { name: "Add section" }));
    await waitFor(() => expect(savedEvents()).toHaveLength(2));
    expect(savedEvents().every((event) => event.courseId === "physics")).toBe(true);
  });

  it.each(["broken json", JSON.stringify({ results: [], searchState: "not_found" })])("recovers from cached search state %s", async (cache) => {
    sessionStorage.setItem("searchCourseResultsCache:v5", cache);
    sessionStorage.setItem("searchCoursesQuery", "CSE 11");
    renderSearch("/courses");
    expect(await screen.findByRole("button", { name: "Add section" })).toBeEnabled();
    expect(screen.getByRole("textbox", { name: "Search courses" })).toHaveValue("CSE 11");
  });
});
