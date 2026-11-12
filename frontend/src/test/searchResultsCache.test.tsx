import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { CalendarProvider } from "@/context/CalendarContext";
import SearchCourses from "@/pages/SearchCourses";
import {
  isSearchCacheFresh,
  SEARCH_RESULTS_CACHE_KEY,
  SEARCH_RESULTS_CACHE_TTL_MS,
  type CachedSearch,
} from "@/lib/searchResultsCache";

const cachedCourse = {
  id: "cached-cse11",
  name: "CSE 11: Cached Title",
  instructor: "Cached Professor",
  schedule: "TBA",
  description: "Term: FA26",
  color: "blue",
  enrollment: {
    enrolled: 90,
    capacity: 100,
    seatsAvailable: 9,
    waitlisted: 0,
    seatsUpdatedAt: "2026-11-12T20:15:00.000Z",
  },
};

const freshCourse = {
  id: "fresh-cse11",
  Name: "CSE 11: Fresh Title",
  Term: "FA26",
  Teacher: "Fresh Professor",
  Lecture: {
    Days: "Mon",
    Time: "10:00 AM - 10:50 AM",
    Location: "CENTR 101",
    Enrollment: {
      enrolled: 91,
      capacity: 100,
      seatsAvailable: 8,
      waitlisted: 0,
      seatsUpdatedAt: "2026-11-12T20:15:00.000Z",
    },
  },
  Discussions: [],
};

function storeCache(cachedAt?: number) {
  const cache: CachedSearch = {
    query: "CSE 11",
    term: "FA26",
    results: [cachedCourse],
    searchState: "success",
    ...(cachedAt === undefined ? {} : { cachedAt }),
  };
  sessionStorage.setItem(SEARCH_RESULTS_CACHE_KEY, JSON.stringify(cache));
  sessionStorage.setItem("searchCoursesQuery", "CSE 11");
}

function renderSearch() {
  return render(
    <MemoryRouter initialEntries={["/courses?q=CSE%2011"]}>
      <CalendarProvider>
        <SearchCourses />
      </CalendarProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input), "http://localhost");
    const body = url.pathname.endsWith("/term") ? { Term: "FA26" } : { data: [freshCourse] };
    return new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } });
  }));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  localStorage.clear();
  sessionStorage.clear();
});

describe("search result cache", () => {
  it("treats a missing timestamp as stale and a recent timestamp as fresh", () => {
    const now = 1_700_000_000_000;
    expect(isSearchCacheFresh({
      query: "CSE 11",
      term: "FA26",
      results: [],
      searchState: "not_found",
    }, now)).toBe(false);
    expect(isSearchCacheFresh({
      query: "CSE 11",
      term: "FA26",
      results: [],
      searchState: "not_found",
      cachedAt: now - SEARCH_RESULTS_CACHE_TTL_MS,
    }, now)).toBe(false);
    expect(isSearchCacheFresh({
      query: "CSE 11",
      term: "FA26",
      results: [],
      searchState: "not_found",
      cachedAt: now - SEARCH_RESULTS_CACHE_TTL_MS + 1,
    }, now)).toBe(true);
  });

  it("keeps a fresh cached search without another course request", async () => {
    storeCache(Date.now());
    renderSearch();

    expect((await screen.findAllByText("Cached Title")).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/seats as of/).length).toBeGreaterThan(0);
    await waitFor(() => {
      expect(screen.getByText("Fall 2026")).toBeVisible();
    });
    const courseRequests = vi.mocked(fetch).mock.calls.filter(([url]) => String(url).includes("/course?"));
    expect(courseRequests).toHaveLength(0);
  });

  it("refetches an open search when the five minute cache expires", async () => {
    storeCache(Date.now() - SEARCH_RESULTS_CACHE_TTL_MS + 400);
    renderSearch();

    expect((await screen.findAllByText("Cached Title")).length).toBeGreaterThan(0);
    await screen.findByText("Fall 2026");
    const beforeExpiry = vi.mocked(fetch).mock.calls.filter(([url]) => String(url).includes("/course?"));
    expect(beforeExpiry).toHaveLength(0);
    expect((await screen.findAllByText("Fresh Title", {}, { timeout: 2000 })).length).toBeGreaterThan(0);
  });

  it("shows a stale cached search and then replaces it from GET /course", async () => {
    let releaseCourse: (response: Response) => void = () => {};
    vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), "http://localhost");
      if (url.pathname.endsWith("/term")) {
        return new Response(JSON.stringify({ Term: "FA26" }), {
          headers: { "content-type": "application/json" },
        });
      }
      return new Promise((resolve) => {
        releaseCourse = resolve;
      });
    });
    storeCache(Date.now() - SEARCH_RESULTS_CACHE_TTL_MS - 1_000);
    renderSearch();

    expect((await screen.findAllByText("Cached Title")).length).toBeGreaterThan(0);
    await waitFor(() => {
      expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url).includes("/course?"))).toBe(true);
    });
    releaseCourse(new Response(JSON.stringify({ data: [freshCourse] }), {
      headers: { "content-type": "application/json" },
    }));
    expect((await screen.findAllByText("Fresh Title")).length).toBeGreaterThan(0);
    expect(screen.queryByText("Cached Title")).not.toBeInTheDocument();
    expect(screen.getAllByText(/seats as of/).length).toBeGreaterThan(0);
    const courseRequests = vi.mocked(fetch).mock.calls.filter(([url]) => String(url).includes("/course?"));
    expect(courseRequests.length).toBeGreaterThan(0);
  });
});
