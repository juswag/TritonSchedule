import { readFileSync } from "node:fs";
import path from "node:path";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, useLocation } from "react-router-dom";
import { CalendarProvider } from "@/context/CalendarContext";
import App from "@/App";
import CalendarPage from "@/pages/CalendarPage";
import SearchCourses from "@/pages/SearchCourses";
import type { CalendarEvent } from "@/types/calendar";

const noonCourses = [
  { Name: "CSE 110 - Software Engineering", Lecture: { Days: "TueThu", Time: "11:00-12:20p", Location: "CENTR 101" }, Discussions: [] },
  { Name: "MATH 20C - Calculus", Lecture: { Days: "MonWed", Time: "11:00a-1:20", Location: "APM 101" }, Discussions: [] },
  { Name: "CSE 12 - Basic Data Structures", Lecture: { Days: "TueThu", Time: "9:00-10:20a", Location: "CENTR 109" }, Discussions: [] },
  { Name: "CSE 29 - Systems Programming", Lecture: { Days: "MonWed", Time: "1:10-2:20p", Location: "CENTR 115" }, Discussions: [] },
];

function mockCatalog(payload: unknown, status = 200) {
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input), "http://localhost");
    const body = url.pathname.endsWith("/term") ? { Term: "FA26" } : payload;
    const responseStatus = url.pathname.endsWith("/term") ? 200 : status;
    return new Response(JSON.stringify(body), {
      status: responseStatus,
      headers: { "content-type": "application/json" },
    });
  }));
}

function mockNarrowViewport(matches: boolean) {
  vi.spyOn(window, "matchMedia").mockImplementation((query: string) => ({
    matches: query.includes("max-width") ? matches : false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }) as MediaQueryList);
}

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}{location.search}</div>;
}

function renderSearch(path = "/courses?q=CSE") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <CalendarProvider>
        <SearchCourses />
        <LocationProbe />
      </CalendarProvider>
    </MemoryRouter>,
  );
}

function readEvents(): CalendarEvent[] {
  return JSON.parse(localStorage.getItem("calendarEvents") ?? "[]") as CalendarEvent[];
}

function renderSchedule(events: CalendarEvent[]) {
  localStorage.setItem("calendarEvents", JSON.stringify(events));
  return render(
    <MemoryRouter>
      <CalendarProvider>
        <CalendarPage />
      </CalendarProvider>
    </MemoryRouter>,
  );
}

describe("interaction bugs from the courses and schedule pages", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    document.body.style.overflow = "";
    window.history.replaceState(null, "", "/");
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    localStorage.clear();
    sessionStorage.clear();
    document.body.style.overflow = "";
    window.history.replaceState(null, "", "/");
  });

  it("shows a not-found page inside the app shell for unknown routes", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    window.history.pushState(null, "", "/does-not-exist");
    render(<App />);

    expect(screen.getByRole("heading", { name: "404" })).toBeVisible();
    expect(screen.getByText("Oops! Page not found")).toBeVisible();
    expect(screen.getByRole("link", { name: "Return to Home" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: "TritonSchedule home" })).toBeVisible();
    expect(consoleError.mock.calls.some((call) => String(call[0]).includes("404"))).toBe(false);
  });

  it("keeps the former standalone /not-found address inside the shell without logging", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    window.history.pushState(null, "", "/not-found");
    render(<App />);

    expect(consoleError.mock.calls.some((call) => String(call[0]).includes("404"))).toBe(false);
    expect(screen.getByRole("heading", { name: "404" })).toBeVisible();
    expect(screen.getByRole("link", { name: "TritonSchedule home" })).toBeVisible();
  });

  it("puts a single noon-crossing meridiem on the correct half of the day", async () => {
    mockCatalog({ data: noonCourses });
    renderSearch();
    expect(await screen.findByRole("button", { name: /Select CSE 110/ })).toBeEnabled();

    const ranges: Array<[string, string]> = [];
    for (const name of [/Select CSE 110/, /Select MATH 20C/, /Select CSE 12/, /Select CSE 29/]) {
      fireEvent.click(screen.getByRole("button", { name }));
      fireEvent.click(screen.getByRole("button", { name: "Add section" }));
      await waitFor(() => expect(readEvents()).toHaveLength(2));
      ranges.push([readEvents()[0].startTime, readEvents()[0].endTime]);
      fireEvent.click(screen.getByRole("button", { name: "Remove from schedule" }));
      await waitFor(() => expect(readEvents()).toHaveLength(0));
    }

    expect(ranges).toEqual([
      ["11:00", "12:20"],
      ["11:00", "13:20"],
      ["09:00", "10:20"],
      ["13:10", "14:20"],
    ]);
  });

  it("keeps meetings outside 7:00 AM–10:00 PM inside the week grid", () => {
    renderSchedule([
      { id: "midnight", title: "Midnight lab", dayOfWeek: "Mon", startTime: "00:15", endTime: "01:00", color: "#2563eb" },
      { id: "early", title: "Early lab", dayOfWeek: "Mon", startTime: "06:30", endTime: "07:45", color: "#2563eb" },
      { id: "late", title: "Late seminar", dayOfWeek: "Fri", startTime: "21:30", endTime: "22:45", color: "#2563eb" },
    ]);

    for (const title of [/^Midnight lab/, /^Early lab/, /^Late seminar/]) {
      const block = screen.getByTitle(title);
      const frame = block.parentElement!;
      const top = parseFloat(frame.style.top);
      const height = parseFloat(frame.style.height);
      const grid = frame.parentElement!.parentElement as HTMLElement;
      expect(top, title.source).toBeGreaterThanOrEqual(0);
      expect(top + height, title.source).toBeLessThanOrEqual(parseFloat(grid.style.height) + 0.5);
    }
    expect(screen.getByText("12 AM")).toBeInTheDocument();
    expect(screen.getByText("6 AM")).toBeInTheDocument();
    expect(screen.getByText("10 PM")).toBeInTheDocument();
  });

  it("leaves the 7:00 AM grid in place when every meeting is inside it", () => {
    renderSchedule([
      { id: "lecture", title: "CSE 100: Advanced Data Structures", dayOfWeek: "Tue", startTime: "09:00", endTime: "09:50", color: "#2563eb" },
    ]);

    expect(screen.getByTitle(/^CSE 100:/).parentElement?.style.top).toBe("144px");
    expect(screen.getByText("7 AM")).toBeInTheDocument();
    expect(screen.queryByText("6 AM")).not.toBeInTheDocument();
    expect(screen.queryByText("10 PM")).not.toBeInTheDocument();
  });

  it("retries a failed search without editing the query", async () => {
    const courseRequests: string[] = [];
    const respond = (payload: unknown, status = 200) => {
      vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(String(input), "http://localhost");
        if (url.pathname.endsWith("/course")) courseRequests.push(url.search);
        const body = url.pathname.endsWith("/term") ? { Term: "FA26" } : payload;
        return new Response(JSON.stringify(body), {
          status: url.pathname.endsWith("/term") ? 200 : status,
          headers: { "content-type": "application/json" },
        });
      }));
    };

    respond({}, 500);
    renderSearch("/courses?q=CSE%20110");
    expect(await screen.findByText("Search unavailable")).toBeVisible();
    const failedAttempts = courseRequests.length;

    respond({ data: noonCourses });
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findByRole("button", { name: /Select CSE 110/ })).toBeEnabled();
    expect(courseRequests.length).toBeGreaterThan(failedAttempts);
    expect(screen.getByRole("textbox", { name: "Search courses" })).toHaveValue("CSE 110");
  });

  it("replaces a stale search query in the address bar", async () => {
    mockCatalog({ data: noonCourses });
    renderSearch("/courses?q=OLD");

    fireEvent.change(screen.getByRole("textbox", { name: "Search courses" }), {
      target: { value: "CSE 110" },
    });

    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("q=CSE+110"));
    expect(screen.getByTestId("location").textContent).not.toContain("OLD");

    fireEvent.change(screen.getByRole("textbox", { name: "Search courses" }), {
      target: { value: "" },
    });
    await waitFor(() => expect(screen.getByTestId("location").textContent).not.toMatch(/[?&]q=/));
  });

  it("keeps week-grid removal available without hover", () => {
    renderSchedule([
      { id: "early", title: "Early lab", dayOfWeek: "Mon", startTime: "09:00", endTime: "10:00", color: "#2563eb" },
    ]);

    const gridRemove = screen.getAllByRole("button", { name: "Remove Early lab" })
      .find((button) => button.classList.contains("absolute"));
    expect(gridRemove).toBeDefined();
    expect(gridRemove!.className.split(/\s+/)).not.toContain("opacity-0");
    expect(gridRemove).toHaveClass("schedule-remove");

    const css = readFileSync(path.resolve(process.cwd(), "src/index.css"), "utf8");
    expect(css).toMatch(/\.schedule-remove\s*\{[^}]*opacity:\s*1/);
    expect(css).toMatch(/@media\s*\(hover:\s*hover\)\s*and\s*\(pointer:\s*fine\)/);
    expect(css).toMatch(/\.schedule-remove:focus-visible\s*\{[^}]*opacity:\s*1/);
  });

  it("locks background scroll and closes the narrow course sheet on Escape", async () => {
    mockNarrowViewport(true);
    mockCatalog({ data: [noonCourses[0]] });
    renderSearch("/courses?q=CSE%20110");

    fireEvent.click(await screen.findByRole("button", { name: /Select CSE 110/ }));
    const dialog = await screen.findByRole("dialog", { name: "Selected course details" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(document.body.style.overflow).toBe("hidden");

    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(document.body.style.overflow).toBe("");
    expect(screen.getByRole("complementary", { name: "Selected course details" })).toBeInTheDocument();
  });

  it("leaves the desktop course details in the page", async () => {
    mockNarrowViewport(false);
    mockCatalog({ data: [noonCourses[0]] });
    renderSearch("/courses?q=CSE%20110");

    fireEvent.click(await screen.findByRole("button", { name: /Select CSE 110/ }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(document.body.style.overflow).not.toBe("hidden");
    expect(screen.getByRole("complementary", { name: "Selected course details" })).toBeInTheDocument();
  });

  it("exposes the selected mobile day by name, not only by color", () => {
    renderSchedule([]);

    expect(screen.getByRole("button", { name: "Mon" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Tue" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByText("No classes on Monday")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Tue" }));
    expect(screen.getByRole("button", { name: "Tue" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Mon" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByText("No classes on Tuesday")).toBeVisible();
  });
});
