import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { CalendarProvider } from "@/context/CalendarContext";
import SearchCourses from "@/pages/SearchCourses";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
  sessionStorage.clear();
});

describe("course search without an active term", () => {
  it("stays idle and does not request courses when the term endpoint has no term", async () => {
    localStorage.clear();
    sessionStorage.clear();
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), "http://localhost");
      if (url.pathname.endsWith("/term")) {
        return new Response(JSON.stringify({ message: "No active term found" }), {
          status: 404,
          headers: { "content-type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ data: [{ Name: "CSE 11", Term: "FA25" }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }));

    render(
      <MemoryRouter initialEntries={["/courses?q=CSE%2011"]}>
        <CalendarProvider>
          <SearchCourses />
        </CalendarProvider>
      </MemoryRouter>,
    );

    await waitFor(() => {
      const courseRequests = vi.mocked(fetch).mock.calls.filter(([url]) => String(url).includes("/course"));
      expect(courseRequests).toHaveLength(0);
      expect(screen.queryByText("Searching")).not.toBeInTheDocument();
    });
    expect(screen.queryByRole("button", { name: /Select CSE 11/ })).not.toBeInTheDocument();
  });
});
