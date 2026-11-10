import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { toast } from "sonner";
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
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
  sessionStorage.clear();
});

describe("exam metadata through course selection", () => {
  it("saves only the selected section exams and reloads them in the Exams tab", async () => {
    const successToast = vi.spyOn(toast, "success");
    const search = render(
      <MemoryRouter initialEntries={["/courses?q=CSE%2011"]}>
        <CalendarProvider><SearchCourses /></CalendarProvider>
      </MemoryRouter>
    );

    const add = await screen.findByRole("button", { name: "Add section" });
    expect(add).toBeEnabled();
    fireEvent.click(add);
    expect(await screen.findByRole("button", { name: "Remove from schedule" })).toBeEnabled();
    expect(successToast).not.toHaveBeenCalled();

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
  it("shows enrollment for the primary section and the chosen discussion", async () => {
    mockCatalog([{ ...course,
      Lecture: { ...course.Lecture, Enrollment: { enrolled: 90, capacity: 100, seatsAvailable: 10, waitlisted: 0 } },
      Discussions: [
        { ...course.Discussions[0], Enrollment: { enrolled: 30, capacity: 30, seatsAvailable: 0, waitlisted: 2 } },
        { ...course.Discussions[1], Enrollment: { enrolled: 0, capacity: null, seatsAvailable: null, waitlisted: null } },
      ],
    }]);
    renderSearch();
    expect(await screen.findByText("90 of 100 enrolled")).toBeVisible();
    expect(screen.getByText("0 waitlisted")).toBeVisible();
    expect(screen.getAllByText("10 open seats")).toHaveLength(2);
    const discussion = screen.getByRole("combobox", { name: "Choose discussion section" });
    expect(discussion).toHaveTextContent("No open seats");
    expect(discussion).toHaveTextContent("30 of 30 enrolled");
    expect(discussion).toHaveTextContent("2 waitlisted");
    fireEvent.click(discussion);
    fireEvent.click(await screen.findByRole("option", { name: /A02/ }));
    expect(discussion).toHaveTextContent("0 enrolled");
  });

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
    expect(await screen.findByText("2 unavailable discussion sections hidden")).toBeVisible();
    expect(screen.getByRole("combobox", { name: "Choose discussion section" })).toHaveTextContent("Discussion 3");
  });

  it("offers a conflicting discussion and defaults to the free section", async () => {
    localStorage.setItem("calendarEvents", JSON.stringify([
      { id: "study", title: "Study group", dayOfWeek: "Tue", startTime: "11:15", endTime: "12:00", color: "#123456" },
    ]));
    renderSearch();
    const picker = await screen.findByRole("combobox", { name: "Choose discussion section" });
    expect(picker).toHaveTextContent("A02");
    fireEvent.click(picker);
    fireEvent.click(await screen.findByRole("option", { name: /A01.*Schedule conflict/ }));
    expect(screen.getByText(/Conflicts with Study group on Tue/)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Add with conflict" }));
    await waitFor(() => expect(savedEvents().some((event) => event.location === "DISCUSSION ROOM")).toBe(true));
  });

  it("explains when every discussion is unavailable", async () => {
    mockCatalog([{ ...course, Discussions: [{ Days: "ARRANGED", Time: "" }] }]);
    renderSearch();
    expect(await screen.findByText("No discussion sections have a usable time that fits the selected course meetings.")).toBeVisible();
  });

  it("warns before adding an overlapping lecture and clears the calendar warning after removal", async () => {
    localStorage.setItem("calendarEvents", JSON.stringify([
      { id: "existing", courseId: "other", title: "MATH 20B (A01)", dayOfWeek: "Mon", startTime: "10:15", endTime: "11:00", color: "#123456", isCourse: true },
      { id: "existing-wed", courseId: "other", title: "MATH 20B (A01)", dayOfWeek: "Wed", startTime: "10:15", endTime: "11:00", color: "#123456", isCourse: true },
      { id: "free", title: "Study", dayOfWeek: "Fri", startTime: "15:00", endTime: "16:00", color: "#123456" },
    ]));
    const search = renderSearch();
    const add = await screen.findByRole("button", { name: "Add with conflict" });
    expect(add).toBeEnabled();
    expect(screen.getByText(/Conflicts with MATH 20B on Mon/)).toBeVisible();
    fireEvent.click(add);
    await waitFor(() => expect(savedEvents()).toHaveLength(7));
    search.unmount();
    render(<MemoryRouter><CalendarProvider><CalendarPage /></CalendarProvider></MemoryRouter>);
    const notices = within(screen.getByRole("region", { name: "Weekly schedule conflicts" })).getAllByRole("listitem");
    expect(notices).toHaveLength(1);
    expect(notices[0].textContent).toBe("MATH 20B and CSE 11 overlap.");
    expect(screen.getAllByLabelText("Time conflict")).toHaveLength(4);
    expect(screen.getAllByText("Time conflict")).toHaveLength(2);
    fireEvent.click(screen.getAllByRole("button", { name: "Remove MATH 20B (A01)" })[0]);
    expect(screen.queryByRole("region", { name: "Weekly schedule conflicts" })).toBeNull();
  });

  it.each([[4.8, "Excellent", "emerald"], [4, "Very good", "emerald"], [3.6, "Good", "orange"], [3, "Good", "orange"], [2.9, "Mixed", "red"]])("shows verified professor details with rating %s", async (rating, label, color) => {
    mockCatalog([{ ...course, rmp: { avgRating: rating, avgDiff: 3, takeAgainPercent: 90, profileUrl: "https://www.ratemyprofessors.com/professor/123" }, TssFallbackUrl: "https://tss.ucsd.edu/fiori#YSchedule-view&/YUCSD_CON_MODULE(AcademicYear='2026',AcademicPeriod='FA',ModuleID='123')?layout=MidColumnFullScreen" }]);
    renderSearch();
    expect(await screen.findByText(label)).toBeVisible();
    const profile = screen.getByRole("link", { name: /on Rate My Professors/ });
    expect(profile.querySelector("svg.lucide-star")).toHaveClass("fill-current", `text-${color}-600`, `dark:text-${color}-400`);
    expect(screen.getByText(/90% would take again/)).toBeVisible();
    expect(screen.getByRole("link", { name: "Open in TSS" })).toHaveAttribute("href", expect.stringContaining("tss.ucsd.edu"));
  });

  it.each([
    { rating: 2.96, displayed: "3.0", color: "orange" },
    { rating: 3.96, displayed: "4.0", color: "emerald" },
  ])("colors the star for $rating using the displayed score $displayed", async ({ rating, displayed, color }) => {
    mockCatalog([{ ...course, rmp: { avgRating: rating } }]);
    renderSearch();
    const profile = await screen.findByRole("link", { name: /on Rate My Professors/ });
    expect(within(profile).getByText(displayed)).toBeVisible();
    expect(profile.querySelector("svg.lucide-star")).toHaveClass(`text-${color}-600`, `dark:text-${color}-400`);
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

describe("courses with published exams but no weekly meetings", () => {
  it("saves, reloads and removes the course without creating a weekly placeholder", async () => {
    const successToast = vi.spyOn(toast, "success");
    mockCatalog([{ ...course, Lecture: { Days: "TBA", Time: "TBA" }, Discussions: [] }]);
    const search = renderSearch();
    const add = await screen.findByRole("button", { name: "Add section" });
    expect(add).toBeEnabled();
    fireEvent.click(add);
    expect(await screen.findByRole("button", { name: "Remove from schedule" })).toBeEnabled();
    expect(successToast).not.toHaveBeenCalled();
    await waitFor(() => {
      const stored = JSON.parse(localStorage.getItem("calendarExamOnlyCourses") ?? "[]");
      expect(stored).toHaveLength(1);
      expect(stored[0]).toMatchObject({ id: course.id, title: course.Name, exams: expect.arrayContaining([
        expect.objectContaining({ location: "MIDTERM ROOM" }),
        expect.objectContaining({ location: "FINAL ROOM" }),
      ]) });
    });
    expect(savedEvents()).toEqual([]);
    search.unmount();
    render(<MemoryRouter><CalendarProvider><CalendarPage /></CalendarProvider></MemoryRouter>);
    expect(screen.getByText("1 course")).toBeVisible();
    expect(screen.queryByText(course.Name)).not.toBeInTheDocument();
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Exams" }), { button: 0, ctrlKey: false });
    expect(screen.getByText("No weekly meetings")).toBeVisible();
    expect(within(screen.getByRole("table", { name: "Midterms" })).getByText("MIDTERM ROOM")).toBeVisible();
    expect(within(screen.getByRole("table", { name: "Finals" })).getByText("FINAL ROOM")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: `Remove ${course.Name}` }));
    expect(screen.getByText("0 courses")).toBeVisible();
    expect(screen.getByText("Add courses to see their exam details")).toBeVisible();
    await waitFor(() => expect(JSON.parse(localStorage.getItem("calendarExamOnlyCourses") ?? "[]")).toEqual([]));
  });

  it("does not bypass an unavailable required discussion to save only exams", async () => {
    mockCatalog([{ ...course, Lecture: { Days: "TBA", Time: "TBA" }, Discussions: [{ Days: "TBA", Time: "TBA" }] }]);
    renderSearch();
    expect(await screen.findByRole("button", { name: "Add section" })).toBeDisabled();
    expect(screen.getByText("No discussion sections have a usable time that fits the selected course meetings.")).toBeVisible();
  });
});

describe("removing scheduled courses from either view", () => {
  it("removes all meetings from the details panel, preserves other events and allows re-adding", async () => {
    const personal = { id: "personal", title: "Lunch", dayOfWeek: "Mon", startTime: "12:00", endTime: "13:00", color: "#333", isCourse: false };
    localStorage.setItem("calendarEvents", JSON.stringify([personal]));
    renderSearch();
    fireEvent.click(await screen.findByRole("button", { name: "Add section" }));
    await waitFor(() => expect(savedEvents()).toHaveLength(5));
    fireEvent.click(screen.getByRole("button", { name: "Remove from schedule" }));
    await waitFor(() => expect(savedEvents()).toEqual([personal]));
    fireEvent.click(screen.getByRole("button", { name: "Add section" }));
    await waitFor(() => expect(savedEvents()).toHaveLength(5));
  });

  it("removes exam-only courses from the details panel and allows re-adding", async () => {
    mockCatalog([{ ...course, Lecture: { Days: "TBA", Time: "TBA" }, Discussions: [] }]);
    renderSearch();
    fireEvent.click(await screen.findByRole("button", { name: "Add section" }));
    fireEvent.click(await screen.findByRole("button", { name: "Remove from schedule" }));
    await waitFor(() => expect(JSON.parse(localStorage.getItem("calendarExamOnlyCourses") ?? "[]")).toEqual([]));
    expect(savedEvents()).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "Add section" }));
    await waitFor(() => expect(JSON.parse(localStorage.getItem("calendarExamOnlyCourses") ?? "[]")).toHaveLength(1));
  });

  it("removes a whole course using its final row and persists the change on reload", async () => {
    const search = renderSearch();
    fireEvent.click(await screen.findByRole("button", { name: "Add section" }));
    await waitFor(() => expect(savedEvents()).toHaveLength(4));
    search.unmount();
    const calendar = render(<MemoryRouter><CalendarProvider><CalendarPage /></CalendarProvider></MemoryRouter>);
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Exams" }), { button: 0, ctrlKey: false });
    const finals = screen.getByRole("table", { name: "Finals" });
    fireEvent.click(within(finals).getByRole("button", { name: `Remove ${course.Name} from schedule` }));
    expect(screen.getByText("Add courses to see their exam details")).toBeVisible();
    await waitFor(() => expect(savedEvents()).toEqual([]));
    calendar.unmount();
    renderSearch();
    expect(await screen.findByRole("button", { name: "Add section" })).toBeEnabled();
  });
});
