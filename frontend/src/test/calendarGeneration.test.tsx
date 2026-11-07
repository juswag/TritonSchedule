import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import CalendarPage from "@/pages/CalendarPage";
import { CalendarProvider, useCalendar } from "@/context/CalendarContext";
import {
  getScheduleOptions,
  getScheduleTerm,
  searchScheduleCourses,
} from "@/lib/scheduleApi";
import {
  createScheduleSearch,
  type ScheduleSearch,
} from "@/lib/scheduleGenerator";
import type { CalendarEvent } from "@/types/calendar";
import type {
  GeneratedSchedule,
  ScheduleCourse,
  ScheduleOption,
  ScheduleWorkerRequest,
  ScheduleWorkerResponse,
} from "@/types/generation";

vi.mock("@/lib/scheduleApi", () => ({
  getScheduleTerm: vi.fn(),
  getScheduleOptions: vi.fn(),
  searchScheduleCourses: vi.fn(),
}));

const TERM = "FA26";
const selectionsKey = `scheduleSelections:v1:${TERM}`;
const seenKey = `scheduleSeenCourses:v1:${TERM}`;

function option(
  id: string,
  day: number,
  start: number,
  end: number,
): ScheduleOption {
  return {
    id,
    sections: [
      {
        id: `${TERM}:${id}`,
        code: id,
        type: "Lecture",
        instructor: "Professor Example",
      },
    ],
    meetings: [
      {
        day,
        start,
        end,
        sectionId: `${TERM}:${id}`,
        type: "Lecture",
        location: "CENTR 101",
      },
    ],
  };
}

const cse: ScheduleCourse = {
  key: "cse-101",
  term: TERM,
  code: "CSE 101",
  title: "Algorithms",
  issues: [],
  options: [option("A00", 0, 540, 600), option("B00", 1, 780, 840)],
};
const math: ScheduleCourse = {
  key: "math-109",
  term: TERM,
  code: "MATH 109",
  title: "Proofs",
  issues: [],
  options: [option("C00", 0, 660, 720)],
};
const personal: CalendarEvent = {
  id: "personal",
  title: "Work shift",
  dayOfWeek: "Wed",
  startTime: "15:00",
  endTime: "16:00",
  color: "#008888",
};
const oldCourse: CalendarEvent = {
  id: "old-course",
  title: "CSE 101: Previous lecture",
  dayOfWeek: "Fri",
  startTime: "10:00",
  endTime: "11:00",
  color: "#2563eb",
  isCourse: true,
  courseId: "old-section",
  courseKey: cse.key,
  term: TERM,
};
const saved = [personal, oldCourse];

/** Control delivery, but compute every result with the production search engine. */
class GeneratorWorker {
  static instances: GeneratorWorker[] = [];
  onmessage: ((event: MessageEvent<ScheduleWorkerResponse>) => void) | null =
    null;
  onerror: ((event: Event) => void) | null = null;
  terminate = vi.fn();
  cursor?: ScheduleSearch;
  total = 0;
  postMessage = vi.fn((message: ScheduleWorkerRequest) => {
    if (message.type === "start")
      this.cursor = createScheduleSearch(
        message.courses,
        message.blockedEvents,
      );
  });

  constructor() {
    GeneratorWorker.instances.push(this);
  }

  emit(message: ScheduleWorkerResponse) {
    // Deliberately allow already queued messages after termination to exercise the page's stale-run guard.
    this.onmessage?.({ data: message } as MessageEvent<ScheduleWorkerResponse>);
  }

  flush(limit = 100): GeneratedSchedule[] {
    if (!this.cursor)
      throw new Error("Worker did not receive a start request.");
    const schedules: GeneratedSchedule[] = [];
    let complete = false;
    while (schedules.length < limit && !complete) {
      const batch = this.cursor.advance({
        maxSteps: 100,
        maxResults: limit - schedules.length,
      });
      schedules.push(...batch.schedules);
      complete = batch.complete;
    }
    this.total += schedules.length;
    if (schedules.length)
      this.emit({ type: "results", schedules, total: this.total });
    this.emit({ type: complete ? "complete" : "paused", total: this.total });
    return schedules;
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function CalendarMutation() {
  const { addEvent } = useCalendar();
  return (
    <button
      onClick={() =>
        addEvent({
          ...personal,
          id: "new-personal",
          title: "New commitment",
          dayOfWeek: "Thu",
        })
      }
    >
      Add personal event
    </button>
  );
}

function mountPage({
  courses = [cse, math],
  events = saved,
  seed = true,
  mutation = false,
}: {
  courses?: ScheduleCourse[];
  events?: CalendarEvent[];
  seed?: boolean;
  mutation?: boolean;
} = {}) {
  if (seed) {
    localStorage.setItem(selectionsKey, JSON.stringify(courses));
    localStorage.setItem("calendarEvents", JSON.stringify(events));
    localStorage.setItem(
      seenKey,
      JSON.stringify(
        events.filter((e) => e.isCourse).map((e) => e.courseId || e.id),
      ),
    );
  }
  return render(
    <MemoryRouter
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <CalendarProvider>
        <CalendarPage />
        {mutation && <CalendarMutation />}
      </CalendarProvider>
    </MemoryRouter>,
  );
}

function storedEvents(): CalendarEvent[] {
  return JSON.parse(localStorage.getItem("calendarEvents") || "[]");
}

async function ready() {
  await waitFor(() =>
    expect(
      screen.getByRole("combobox", { name: "Quick course search" }),
    ).toBeEnabled(),
  );
}

async function generate() {
  await ready();
  const count = GeneratorWorker.instances.length;
  fireEvent.click(
    screen.getByRole("button", { name: /Generate (schedules|again)/ }),
  );
  await waitFor(() =>
    expect(GeneratorWorker.instances).toHaveLength(count + 1),
  );
  return GeneratorWorker.instances[count];
}

describe("schedule page generation", () => {
  const scrollIntoView = Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    "scrollIntoView",
  );

  beforeAll(() => {
    // Radix Select scrolls the focused option; jsdom has no layout scrolling.
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: vi.fn(),
    });
  });

  afterAll(() => {
    if (scrollIntoView)
      Object.defineProperty(
        HTMLElement.prototype,
        "scrollIntoView",
        scrollIntoView,
      );
    else Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView");
  });

  beforeEach(() => {
    localStorage.clear();
    vi.resetAllMocks();
    GeneratorWorker.instances = [];
    vi.stubGlobal("Worker", GeneratorWorker);
    vi.mocked(getScheduleTerm).mockResolvedValue(TERM);
    vi.mocked(getScheduleOptions).mockImplementation(async (_term, keys) =>
      [cse, math].filter((course) => keys.includes(course.key)),
    );
    vi.mocked(searchScheduleCourses).mockResolvedValue([]);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("previews real alternatives, revalidates before applying, preserves personal events, and undoes the replacement", async () => {
    mountPage();
    await ready();
    expect(screen.getByText("2 selected")).toBeInTheDocument();
    expect(screen.getByTitle(/^CSE 101: Previous lecture/)).toBeInTheDocument();
    const worker = await generate();
    let generated: GeneratedSchedule[] = [];
    act(() => {
      generated = worker.flush();
    });

    expect(screen.getByText("2 schedules found")).toBeInTheDocument();
    expect(screen.queryByText("Schedule details")).not.toBeInTheDocument();
    expect(screen.queryByText(/gaps \/ week/)).not.toBeInTheDocument();
    expect(screen.queryByText("Search complete")).not.toBeInTheDocument();
    expect(
      screen.queryByTitle(/^CSE 101: Previous lecture/),
    ).not.toBeInTheDocument();
    expect(screen.getByTitle(/^CSE 101: Algorithms/)).toHaveAttribute(
      "title",
      expect.stringContaining("1:00 PM"),
    );
    expect(screen.getByTitle(/^Work shift/)).toBeInTheDocument();
    expect(storedEvents()).toEqual(saved);
    expect(worker.postMessage).toHaveBeenCalledWith({
      type: "start",
      courses: [cse, math],
      blockedEvents: [personal],
    });

    fireEvent.keyDown(screen.getByRole("combobox", { name: "Sort by" }), {
      key: "ArrowDown",
    });
    fireEvent.click(
      await screen.findByRole("option", { name: "Earliest finish" }),
    );
    expect(screen.getByTitle(/^CSE 101: Algorithms/)).toHaveAttribute(
      "title",
      expect.stringContaining("9:00 AM"),
    );

    fireEvent.click(screen.getByRole("button", { name: "Next schedule" }));
    await waitFor(() =>
      expect(
        document.querySelectorAll("[data-changed=true]").length,
      ).toBeGreaterThan(0),
    );
    expect(screen.getByTitle(/^CSE 101: Algorithms/)).toHaveAttribute(
      "title",
      expect.stringContaining("1:00 PM"),
    );
    fireEvent.click(screen.getByRole("button", { name: "Previous schedule" }));
    fireEvent.keyDown(screen.getByRole("combobox", { name: "Sort by" }), {
      key: "ArrowDown",
    });
    fireEvent.click(await screen.findByRole("option", { name: "Fewest days" }));

    const refresh = deferred<ScheduleCourse[]>();
    vi.mocked(getScheduleOptions).mockReturnValueOnce(refresh.promise);
    fireEvent.click(screen.getByRole("button", { name: "Use schedule" }));
    expect(screen.getByRole("combobox", { name: "Sort by" })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Next schedule" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Remove CSE 101" }),
    ).toBeDisabled();
    expect(storedEvents()).toEqual(saved);
    await act(async () => refresh.resolve([cse, math]));

    expect(getScheduleOptions).toHaveBeenCalledTimes(2);
    expect(screen.getByText("Schedule applied.")).toBeInTheDocument();
    const expected = generated.find((schedule) => schedule.days === 1)!;
    expect(storedEvents()).toEqual([
      personal,
      ...expected.events.map((event) => ({
        ...event,
        color: event.courseKey === "cse-101" ? "#1d4ed8" : "#047857",
      })),
    ]);
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(screen.getByText("Previous schedule restored.")).toBeInTheDocument();
    expect(storedEvents()).toEqual(saved);
    expect(screen.getByTitle(/^CSE 101: Previous lecture/)).toBeInTheDocument();
  });

  it("returns to the saved calendar and generates fresh alternatives without changing saved meetings", async () => {
    mountPage();
    const worker = await generate();
    act(() => worker.flush());
    fireEvent.click(screen.getByRole("button", { name: "Next schedule" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Back to saved schedule" }),
    );
    expect(screen.getByTitle(/^CSE 101: Previous lecture/)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Review alternatives" }),
    ).not.toBeInTheDocument();
    const regenerated = await generate();
    act(() => regenerated.flush());
    expect(screen.getByTitle(/^CSE 101: Algorithms/)).toBeInTheDocument();
    expect(getScheduleOptions).toHaveBeenCalledTimes(2);
    expect(GeneratorWorker.instances).toHaveLength(2);
    expect(storedEvents()).toEqual(saved);
  });

  it("generates again after applying a schedule and revalidates a second choice", async () => {
    mountPage();
    const worker = await generate();
    act(() => worker.flush());
    fireEvent.click(screen.getByRole("button", { name: "Use schedule" }));
    await screen.findByText("Schedule applied.");
    const firstSaved = storedEvents();
    expect(
      screen.queryByRole("button", { name: "Review alternatives" }),
    ).not.toBeInTheDocument();
    const regenerated = await generate();
    act(() => regenerated.flush());
    expect(screen.getByRole("button", { name: "Use schedule" })).toBeEnabled();
    expect(storedEvents()).toEqual(firstSaved);
    fireEvent.click(screen.getByRole("button", { name: "Next schedule" }));
    fireEvent.click(screen.getByRole("button", { name: "Use schedule" }));
    await screen.findByText("Schedule applied.");
    expect(getScheduleOptions).toHaveBeenCalledTimes(4);
    expect(storedEvents()).not.toEqual(firstSaved);
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(storedEvents()).toEqual(firstSaved);
  });

  async function namePlan(action: string, name: string) {
    fireEvent.click(screen.getByRole("button", { name: action }));
    fireEvent.change(screen.getByRole("textbox", { name: "Schedule name" }), {
      target: { value: name },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    return screen.findByRole("button", { name: "Preview " + name });
  }

  it("clears the working term during generation, keeps saved plans, and can undo", async () => {
    const older = { ...oldCourse, id: "older", term: "SP26" };
    mountPage({ events: [...saved, older] });
    await ready();
    await namePlan("Save Schedule", "Original");
    const worker = await generate();
    const previousDraft = localStorage.getItem(selectionsKey);
    const search = screen.getByRole("combobox", {
      name: "Quick course search",
    });
    fireEvent.change(search, { target: { value: "MATH" } });
    fireEvent.click(screen.getByRole("button", { name: "Clear Schedule" }));
    act(() => {
      worker.flush();
    });
    expect(worker.terminate).toHaveBeenCalled();
    expect(storedEvents()).toEqual([older]);
    expect(JSON.parse(localStorage.getItem(selectionsKey)!)).toEqual([]);
    expect(
      screen.getByRole("button", { name: "Preview Original" }),
    ).toBeEnabled();
    expect(
      screen.getByRole("button", { name: "Generate schedules" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Clear Schedule" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Save Schedule" }),
    ).toBeDisabled();
    await waitFor(() => expect(screen.getByRole("combobox")).toHaveFocus());
    expect(screen.getByRole("combobox")).toHaveValue("");
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(storedEvents()).toEqual(expect.arrayContaining([...saved, older]));
    expect(storedEvents()).toHaveLength(3);
    expect(localStorage.getItem(selectionsKey)).toBe(previousDraft);
    expect(
      screen.getByRole("button", { name: "Remove CSE 101" }),
    ).toBeEnabled();
    expect(
      screen.getByRole("button", { name: "Generate schedules" }),
    ).toBeEnabled();
  });

  it("clears and restores exam-only courses, including legacy records", async () => {
    const examCourse = {
      id: "exam-only",
      title: "CSE 100",
      color: "#aaa",
      exams: [],
    };
    const earlier = { ...examCourse, id: "previous-term", term: "SP26" };
    localStorage.setItem(
      "calendarExamOnlyCourses",
      JSON.stringify([earlier, examCourse]),
    );
    mountPage({ events: [], courses: [] });
    await ready();
    fireEvent.click(screen.getByRole("button", { name: "Clear Schedule" }));
    expect(
      JSON.parse(localStorage.getItem("calendarExamOnlyCourses")!),
    ).toEqual([earlier]);
    expect(
      screen.getByRole("button", { name: "Clear Schedule" }),
    ).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(
      JSON.parse(localStorage.getItem("calendarExamOnlyCourses")!),
    ).toEqual([earlier, examCourse]);
  });

  it("saves only the displayed course meetings, independently of the generation draft and other terms", async () => {
    const older = { ...oldCourse, id: "another-term", term: "SP26" };
    mountPage({ events: [...saved, older] });
    await ready();
    const card = await namePlan("Save Schedule", "Original");
    expect(card).toHaveAccessibleDescription("CSE 101");
    const library = JSON.parse(
      localStorage.getItem("savedSchedules:v1:" + TERM)!,
    );
    expect(library.plans[0].events).toEqual([oldCourse]);
    expect(storedEvents()).toEqual([...saved, older]);
    expect(within(card).getByText("Current")).toBeInTheDocument();
    fireEvent.click(card);
    expect(
      screen.getByRole("button", { name: "Remove CSE 101" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Remove MATH 109" }),
    ).toBeNull();
    expect(JSON.parse(localStorage.getItem(selectionsKey)!)).toHaveLength(2);
    const worker = await generate();
    expect(worker.postMessage).toHaveBeenCalledWith({
      type: "start",
      courses: [cse],
      blockedEvents: [personal],
    });
  });

  it("previews a saved combination after reload, applies it and restores the prior calendar", async () => {
    const older = { ...oldCourse, id: "previous-term", term: "WI26" };
    mountPage({ events: [...saved, older] });
    const worker = await generate();
    act(() => {
      worker.flush();
    });
    await namePlan("Save Schedule", "Two courses");
    expect(storedEvents()).toEqual([...saved, older]);
    fireEvent.click(
      screen.getByRole("button", { name: "Back to current schedule" }),
    );
    cleanup();
    mountPage({ seed: false });
    await ready();
    fireEvent.click(
      screen.getByRole("button", { name: "Preview Two courses" }),
    );
    expect(
      screen.getByRole("heading", { name: "Two courses" }),
    ).toBeInTheDocument();
    expect(storedEvents()).toEqual([...saved, older]);
    fireEvent.click(screen.getByRole("button", { name: "Use schedule" }));
    await screen.findByText("Schedule applied.");
    expect(storedEvents()).toContainEqual(older);
    expect(storedEvents()).toContainEqual(personal);
    expect(storedEvents()).not.toContainEqual(oldCourse);
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(storedEvents()).toEqual([...saved, older]);
  });

  it("previews and applies the saved sections' exams after reload", async () => {
    const final = {
      id: "exam",
      type: "final" as const,
      name: "Final",
      time: "2026-12-09 8:00am-10:00am",
      location: "CENTR 115",
    };
    const withExams = {
      ...cse,
      options: cse.options.map((option) => ({ ...option, exams: [final] })),
    };
    vi.mocked(getScheduleOptions).mockResolvedValue([withExams]);
    mountPage({ courses: [cse], events: [] });
    const worker = await generate();
    act(() => {
      worker.flush();
    });
    await namePlan("Save Schedule", "Finals plan");
    cleanup();
    mountPage({ seed: false });
    await ready();
    fireEvent.click(
      screen.getByRole("button", { name: "Preview Finals plan" }),
    );
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Exams" }), {
      button: 0,
    });
    expect(
      within(screen.getByRole("table", { name: "Finals" })).getByText(
        "CENTR 115",
      ),
    ).toBeInTheDocument();
    expect(storedEvents()).toEqual([]);
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Weekly classes" }), {
      button: 0,
    });
    fireEvent.click(screen.getByRole("button", { name: "Use schedule" }));
    await screen.findByText("Schedule applied.");
    expect(storedEvents()[0]?.exams).toEqual([final]);
  });

  it("rejects a saved option after catalog changes or a new personal time conflict", async () => {
    mountPage();
    const worker = await generate();
    act(() => {
      worker.flush();
    });
    await namePlan("Save Schedule", "Candidate");
    vi.mocked(getScheduleOptions).mockResolvedValueOnce([
      { ...cse, options: [] },
      math,
    ]);
    fireEvent.click(screen.getByRole("button", { name: "Use schedule" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The catalog changed",
    );
    expect(storedEvents()).toEqual(saved);
    cleanup();
    const conflict = {
      ...personal,
      id: "commitment",
      dayOfWeek: "Mon" as const,
      startTime: "11:00",
      endTime: "12:00",
    };
    mountPage({ events: [...saved, conflict] });
    await ready();
    fireEvent.click(screen.getByRole("button", { name: "Preview Candidate" }));
    fireEvent.click(screen.getByRole("button", { name: "Use schedule" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "personal event overlaps",
    );
    expect(storedEvents()).toEqual([...saved, conflict]);
  });

  it("does not show a saved card when browser storage rejects a write", async () => {
    mountPage();
    await ready();
    fireEvent.click(screen.getByRole("button", { name: "Save Schedule" }));
    const storage = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new Error("Storage unavailable");
      });
    try {
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
      expect(await screen.findByRole("alert")).toHaveTextContent(
        "Could not save",
      );
      expect(
        screen.queryByRole("button", { name: "Preview Schedule 1" }),
      ).toBeNull();
    } finally {
      storage.mockRestore();
    }
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(
      await screen.findByRole("button", { name: "Preview Schedule 1" }),
    ).toBeInTheDocument();
  });

  it("resumes a paused search and keeps the existing results", async () => {
    mountPage();
    const worker = await generate();
    act(() => {
      worker.flush(1);
    });
    expect(screen.getByText("1 schedule found")).toBeInTheDocument();
    expect(
      screen.getByText(
        "More combinations remain. Continue to find more schedules.",
      ),
    ).toBeInTheDocument();
    const firstPreview = screen
      .getByTitle(/^CSE 101: Algorithms/)
      .getAttribute("title");
    fireEvent.click(
      screen.getByRole("button", { name: "Find more schedules" }),
    );
    expect(worker.postMessage).toHaveBeenLastCalledWith({ type: "more" });
    expect(screen.getByRole("button", { name: "Use schedule" })).toBeDisabled();
    act(() => {
      worker.flush();
    });
    expect(screen.getByText("2 schedules found")).toBeInTheDocument();
    expect(screen.getByTitle(/^CSE 101: Algorithms/)).toHaveAttribute(
      "title",
      firstPreview,
    );
    expect(screen.queryByText("Search complete")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Find more schedules" }),
    ).not.toBeInTheDocument();
    expect(worker.terminate).toHaveBeenCalled();
    expect(storedEvents()).toEqual(saved);
  });

  it("invalidates results after course removal and ignores queued worker messages", async () => {
    mountPage();
    const worker = await generate();
    let batch: GeneratedSchedule[] = [];
    act(() => {
      batch = worker.flush(1);
    });
    fireEvent.click(screen.getByRole("button", { name: "Remove MATH 109" }));
    expect(worker.terminate).toHaveBeenCalled();
    expect(
      screen.getByText(
        "Courses or calendar events changed. Generate again to update this preview.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Use schedule" })).toBeDisabled();
    expect(
      screen.queryByRole("button", { name: "Find more schedules" }),
    ).not.toBeInTheDocument();
    act(() => {
      worker.emit({ type: "results", schedules: batch, total: 2 });
      worker.emit({ type: "complete", total: 2 });
    });
    expect(screen.getByText("1 schedule found")).toBeInTheDocument();
    expect(
      screen.getByText("Search stopped. Results may be incomplete."),
    ).toBeInTheDocument();
    expect(storedEvents()).toEqual(saved);
    expect(JSON.parse(localStorage.getItem(selectionsKey)!)).toEqual([
      { key: cse.key, term: TERM, code: cse.code, title: cse.title },
    ]);
  });

  it("cancels an options request and ignores its late response", async () => {
    const pending = deferred<ScheduleCourse[]>();
    vi.mocked(getScheduleOptions).mockReturnValueOnce(pending.promise);
    mountPage();
    await ready();
    fireEvent.click(screen.getByRole("button", { name: "Generate schedules" }));
    expect(screen.getByText("Loading course options…")).toBeInTheDocument();
    expect(
      within(screen.getByRole("region", { name: "Calendar" })).getByRole(
        "button",
        { name: "Cancel generation" },
      ),
    ).toBeEnabled();
    const signal = vi.mocked(getScheduleOptions).mock.calls[0][2]!;
    fireEvent.click(screen.getByRole("button", { name: "Cancel generation" }));
    expect(signal.aborted).toBe(true);
    await act(async () => pending.resolve([cse, math]));
    expect(GeneratorWorker.instances).toHaveLength(0);
    expect(
      screen.getByText("Search stopped. Results may be incomplete."),
    ).toBeInTheDocument();
    expect(storedEvents()).toEqual(saved);
  });

  it("cancels active generation and returns to the saved calendar", async () => {
    mountPage();
    const worker = await generate();
    fireEvent.click(screen.getByRole("button", { name: "Cancel generation" }));
    expect(worker.terminate).toHaveBeenCalled();
    act(() => {
      worker.flush();
    });
    expect(screen.getByText("0 schedules found")).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Back to saved schedule" }),
    );
    expect(screen.queryByText("0 schedules found")).not.toBeInTheDocument();
    expect(screen.getByTitle(/^CSE 101: Previous lecture/)).toBeInTheDocument();
    expect(storedEvents()).toEqual(saved);
  });

  it("blocks applying a preview when the current catalog changes", async () => {
    mountPage();
    const worker = await generate();
    act(() => {
      worker.flush();
    });
    const changed = {
      ...cse,
      options: cse.options.map((value) => ({
        ...value,
        meetings: value.meetings.map((meeting) => ({
          ...meeting,
          location: "NEW ROOM",
        })),
      })),
    };
    vi.mocked(getScheduleOptions).mockResolvedValueOnce([changed, math]);
    fireEvent.click(screen.getByRole("button", { name: "Use schedule" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The catalog changed. Generate again before keeping this schedule.",
    );
    expect(storedEvents()).toEqual(saved);
    expect(
      screen.queryByRole("button", { name: "Undo" }),
    ).not.toBeInTheDocument();
  });

  it("does not overwrite a calendar change while apply validation is pending", async () => {
    mountPage({ mutation: true });
    const worker = await generate();
    act(() => {
      worker.flush();
    });
    const refresh = deferred<ScheduleCourse[]>();
    vi.mocked(getScheduleOptions).mockReturnValueOnce(refresh.promise);
    fireEvent.click(screen.getByRole("button", { name: "Use schedule" }));
    const signal = vi.mocked(getScheduleOptions).mock.calls[1][2]!;
    fireEvent.click(screen.getByRole("button", { name: "Add personal event" }));
    expect(signal.aborted).toBe(true);
    await act(async () => refresh.resolve([cse, math]));
    expect(screen.getByRole("button", { name: "Use schedule" })).toBeDisabled();
    expect(storedEvents().map((event) => event.id)).toEqual([
      personal.id,
      oldCourse.id,
      "new-personal",
    ]);
    expect(
      screen.queryByRole("button", { name: "Undo" }),
    ).not.toBeInTheDocument();
  });

  it.each(["protocol", "runtime"])(
    "shows %s worker failures without allowing partial results to be applied",
    async (kind) => {
      mountPage();
      const worker = await generate();
      act(() => {
        worker.flush(1);
      });
      act(() => {
        if (kind === "protocol")
          worker.emit({ type: "error", message: "Invalid meeting times." });
        else worker.onerror?.(new Event("error"));
      });
      expect(screen.getByRole("alert")).toHaveTextContent(
        kind === "protocol"
          ? "Invalid meeting times."
          : "Generation stopped unexpectedly.",
      );
      expect(screen.getByText("Search incomplete.")).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Use schedule" }),
      ).toBeDisabled();
      expect(worker.terminate).toHaveBeenCalled();
      expect(storedEvents()).toEqual(saved);
    },
  );

  it("reports options-service errors and can generate again", async () => {
    vi.mocked(getScheduleOptions).mockRejectedValueOnce(
      new Error("Catalog unavailable."),
    );
    mountPage();
    await ready();
    fireEvent.click(screen.getByRole("button", { name: "Generate schedules" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Catalog unavailable.",
    );
    expect(GeneratorWorker.instances).toHaveLength(0);
    const worker = await generate();
    act(() => {
      worker.flush();
    });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByText("Search complete")).not.toBeInTheDocument();
  });

  it("explains missing verified options and qualifies the completed search", async () => {
    const unavailable = {
      ...cse,
      options: [],
      issues: ["Section A00 has no verified meeting time."],
    };
    vi.mocked(getScheduleOptions).mockResolvedValue([unavailable]);
    mountPage({ courses: [cse] });
    const worker = await generate();
    act(() => {
      worker.flush();
    });
    expect(
      screen.getByText("No schedules fit these courses"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Some course options need review"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("CSE 101: Section A00 has no verified meeting time."),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Use schedule" }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Edit courses" }));
    await waitFor(() =>
      expect(
        screen.getByRole("combobox", { name: "Quick course search" }),
      ).toHaveFocus(),
    );
    expect(storedEvents()).toEqual(saved);
  });

  it("uses personal commitments as conflicts and reports a complete zero-result search", async () => {
    const blocked = {
      ...personal,
      dayOfWeek: "Mon" as const,
      startTime: "09:30",
      endTime: "10:30",
    };
    vi.mocked(getScheduleOptions).mockResolvedValue([
      { ...cse, options: [cse.options[0]] },
    ]);
    mountPage({ courses: [cse], events: [blocked] });
    const worker = await generate();
    act(() => {
      worker.flush();
    });
    expect(
      screen.getByText("No schedules fit these courses"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Their meeting times conflict with each other or with your personal events. Try changing the course list.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText("Search complete")).not.toBeInTheDocument();
    expect(storedEvents()).toEqual([blocked]);
  });

  it("imports new saved courses while preserving a deliberate removal across visits", async () => {
    localStorage.setItem(selectionsKey, JSON.stringify([math]));
    localStorage.setItem("calendarEvents", JSON.stringify(saved));
    vi.mocked(searchScheduleCourses).mockResolvedValue([cse]);
    const firstVisit = mountPage({ seed: false });
    await ready();
    expect(searchScheduleCourses).toHaveBeenCalledWith(
      "CSE 101",
      TERM,
      expect.any(AbortSignal),
    );
    expect(screen.getByText("2 selected")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Remove CSE 101" }));
    firstVisit.unmount();
    vi.mocked(searchScheduleCourses).mockClear();
    mountPage({ seed: false });
    await ready();
    expect(screen.getByText("1 selected")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Remove CSE 101" }),
    ).not.toBeInTheDocument();
    expect(searchScheduleCourses).not.toHaveBeenCalled();
    expect(storedEvents()).toEqual(saved);
  });

  it("requires an explicit selection when a saved course cannot be resolved uniquely", async () => {
    localStorage.setItem("calendarEvents", JSON.stringify(saved));
    vi.mocked(searchScheduleCourses).mockResolvedValue([
      cse,
      { ...cse, key: "another-source" },
    ]);
    mountPage({ seed: false });
    await ready();
    expect(
      screen.getByText(
        "Some saved courses need to be selected again before generating alternatives.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("0 selected")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Generate schedules" }),
    ).toBeDisabled();
  });

  it("retries term discovery after a service error", async () => {
    vi.mocked(getScheduleTerm).mockRejectedValueOnce(
      new Error("Cannot load the current term."),
    );
    mountPage();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Cannot load the current term.",
    );
    expect(
      screen.getByRole("combobox", { name: "Quick course search" }),
    ).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await ready();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByText("2 selected")).toBeInTheDocument();
  });

  it("filters invalid, duplicate, and wrong-term stored choices", async () => {
    localStorage.setItem(
      selectionsKey,
      JSON.stringify([
        null,
        cse,
        cse,
        { ...math, term: "WI27" },
        { ...math, title: null },
      ]),
    );
    mountPage({ seed: false });
    await ready();
    expect(screen.getByText("1 selected")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Remove CSE 101" }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/section combinations/)).not.toBeInTheDocument();
  });

  it.each(["not-json", "null"])(
    "recovers safely from invalid stored choices: %s",
    async (value) => {
      localStorage.setItem(selectionsKey, value);
      mountPage({ seed: false });
      await ready();
      expect(screen.getByText("0 selected")).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Generate schedules" }),
      ).toBeDisabled();
    },
  );

  it("adds a quick-search result to generation without changing saved meetings", async () => {
    mountPage({ courses: [math] });
    await ready();
    vi.mocked(searchScheduleCourses).mockResolvedValue([cse]);
    fireEvent.change(
      screen.getByRole("combobox", { name: "Quick course search" }),
      { target: { value: "CSE 101" } },
    );
    fireEvent.click(await screen.findByRole("option", { name: "Add CSE 101" }));
    expect(screen.getByText("2 selected")).toBeInTheDocument();
    expect(storedEvents()).toEqual(saved);
    const worker = await generate();
    act(() => {
      worker.flush();
    });
    expect(getScheduleOptions).toHaveBeenCalledWith(
      TERM,
      [math.key, cse.key],
      expect.any(AbortSignal),
    );
    expect(screen.getByText("2 schedules found")).toBeInTheDocument();
  });

  it("deletes saved course meetings as a group and personal events individually", async () => {
    const secondMeeting = {
      ...oldCourse,
      id: "old-discussion",
      dayOfWeek: "Thu" as const,
    };
    mountPage({ events: [personal, oldCourse, secondMeeting] });
    await ready();
    const block = screen.getAllByTitle(/^CSE 101: Previous lecture/)[0];
    fireEvent.click(
      within(block).getByRole("button", {
        name: "Remove CSE 101: Previous lecture",
      }),
    );
    expect(storedEvents()).toEqual([personal]);
    fireEvent.click(
      within(screen.getByTitle(/^Work shift/)).getByRole("button", {
        name: "Remove Work shift",
      }),
    );
    expect(storedEvents()).toEqual([]);
  });
});
