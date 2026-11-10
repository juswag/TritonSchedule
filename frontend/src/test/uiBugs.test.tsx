import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, useLocation } from "react-router-dom";
import { CalendarProvider } from "@/context/CalendarContext";
import App from "@/App";
import CalendarPage from "@/pages/CalendarPage";
import SearchCourses from "@/pages/SearchCourses";
import type { CalendarEvent } from "@/types/calendar";

const course = {
  Name: "CSE 110 - Software Engineering",
  Lecture: { Days: "TueThu", Time: "11:00-12:20p", Location: "CENTR 101" },
  Discussions: [],
};

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

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}{location.search}</div>;
}

function renderSearch(path = "/courses?q=CSE%20110") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <CalendarProvider>
        <SearchCourses />
        <LocationProbe />
      </CalendarProvider>
    </MemoryRouter>,
  );
}

describe("reported interface bugs", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    window.history.replaceState(null, "", "/");
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    localStorage.clear();
    sessionStorage.clear();
    window.history.replaceState(null, "", "/");
  });

  it("shows a recoverable not-found page for unknown routes", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    window.history.pushState(null, "", "/missing-page");
    render(<App />);

    expect(screen.getByRole("heading", { name: "This page does not exist" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Back to home" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: "TritonSchedule home" })).toBeVisible();
    expect(consoleError.mock.calls.some((call) => String(call[0]).includes("404"))).toBe(false);
  });

  it("keeps the address bar in step with the search the user typed", async () => {
    mockCatalog({ data: [course] });
    renderSearch("/courses?q=OLD");

    fireEvent.change(screen.getByRole("textbox", { name: "Search courses" }), { target: { value: "CSE 110" } });

    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("q=CSE+110"));
    expect(screen.getByTestId("location").textContent).not.toContain("OLD");
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
    renderSearch();
    expect(await screen.findByText("Search unavailable")).toBeVisible();
    const failedAttempts = courseRequests.length;

    respond({ data: [course] });
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findByRole("button", { name: "Add section" })).toBeEnabled();
    expect(courseRequests.length).toBeGreaterThan(failedAttempts);
  });

  it("places a single meridiem that crosses noon on the correct half of the day", async () => {
    mockCatalog({ data: [
      course,
      { Name: "MATH 20C", Lecture: { Days: "MonWed", Time: "11:00a-1:20" }, Discussions: [] },
    ] });
    renderSearch();
    fireEvent.click(await screen.findByRole("button", { name: /Select CSE 110/ }));
    fireEvent.click(screen.getByRole("button", { name: "Add section" }));
    await waitFor(() => expect(JSON.parse(localStorage.getItem("calendarEvents") ?? "[]")).toHaveLength(2));
    const first = JSON.parse(localStorage.getItem("calendarEvents") ?? "[]") as CalendarEvent[];
    expect(first.every((event) => event.startTime === "11:00" && event.endTime === "12:20")).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Remove from schedule" }));
    fireEvent.click(screen.getByRole("button", { name: /Select MATH 20C/ }));
    fireEvent.click(screen.getByRole("button", { name: "Add section" }));
    await waitFor(() => {
      const saved = JSON.parse(localStorage.getItem("calendarEvents") ?? "[]") as CalendarEvent[];
      expect(saved).toHaveLength(2);
      expect(saved.every((event) => event.startTime === "11:00" && event.endTime === "13:20")).toBe(true);
    });
  });

  it("keeps early and late meetings inside the week grid", () => {
    const events: CalendarEvent[] = [
      { id: "early", title: "Early lab", dayOfWeek: "Mon", startTime: "06:30", endTime: "07:45", color: "#2563eb" },
      { id: "late", title: "Late seminar", dayOfWeek: "Fri", startTime: "21:30", endTime: "22:45", color: "#2563eb" },
    ];
    localStorage.setItem("calendarEvents", JSON.stringify(events));
    render(
      <MemoryRouter>
        <CalendarProvider>
          <CalendarPage />
        </CalendarProvider>
      </MemoryRouter>,
    );

    for (const title of [/^Early lab/, /^Late seminar/]) {
      const block = screen.getByTitle(title);
      const frame = block.parentElement!;
      const top = parseFloat(frame.style.top);
      const height = parseFloat(frame.style.height);
      const grid = frame.parentElement!.parentElement as HTMLElement;
      expect(top).toBeGreaterThanOrEqual(0);
      expect(top + height).toBeLessThanOrEqual(parseFloat(grid.style.height) + 0.5);
    }
    expect(screen.getByRole("button", { name: "Mon" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Tue" })).toHaveAttribute("aria-pressed", "false");
  });
});
