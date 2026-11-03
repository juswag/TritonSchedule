import { describe, expect, it, jest } from "@jest/globals";
import { scrapeClassPlanner, type ClassPlannerFetch } from "../../src/ingestion/scrapeClassPlanner.js";
import { classPlannerCourse } from "./classPlannerFixtures.js";

function publicCourse(index = 1) {
  const course = classPlannerCourse(index);
  return {
    ...course, availability_refresh_pending: undefined, metadata_source: undefined,
    sections: course.sections.map((section) => ({
      ...section,
      meetings: section.meetings.map((meeting) => ({
        ...meeting, building_code: undefined, building_name: undefined,
        room_code: undefined, room_name: undefined,
      })),
    })),
  };
}

function page(courses = [publicCourse()], overrides: object = {}) {
  return { term_code: "FA26", total: courses.length, offset: 0, limit: 48, courses, ...overrides };
}

describe("scrapeClassPlanner", () => {
  it("discovers the public term and paginates without credentials or route requests", async () => {
    const courses = Array.from({ length: 49 }, (_, index) => publicCourse(index + 1));
    const fetcher = jest.fn<ClassPlannerFetch>(async (input, init) => {
      const url = new URL(input);
      expect(new Headers(init?.headers).has("Cookie")).toBe(false);
      expect(new Headers(init?.headers).has("Authorization")).toBe(false);
      expect(init?.redirect).toBe("manual");
      if (url.pathname === "/api/v1/public/catalog/terms") {
        return Response.json({ terms: [{ term_code: "FA26", configured: true, course_count: 40 }] });
      }
      expect(url.pathname).toBe("/api/v1/public/catalog/courses/search");
      expect(init?.method).toBe("POST");
      expect(new Headers(init?.headers).get("Content-Type")).toBe("application/json");
      const body = JSON.parse(String(init?.body)) as { offset: number };
      expect(body).toMatchObject({ term_code: "FA26", q: "", limit: 48, sort: "course_code", direction: "asc" });
      return Response.json(page(courses.slice(body.offset, body.offset + 48), {
        total: courses.length, offset: body.offset,
      }));
    });
    const result = await scrapeClassPlanner(undefined, { fetch: fetcher });
    expect(result.term).toBe("FA26");
    expect(result.courses).toHaveLength(49);
    expect(result.routes).toEqual([]);
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(result.courses[0]).toMatchObject({ availability_refresh_pending: false, metadata_source: null });
    expect(result.courses[0]?.sections[0]).toMatchObject({ event_package_ids: ["1500000001"] });
    expect(result.courses[0]?.sections[0]?.meetings[0]).toMatchObject({
      start_minutes: 1020, end_minutes: 1100,
      building_code: null, building_name: null, room_code: null, room_name: null,
    });
  });

  it.each([401, 403, 302, 303, 307, 308])("fails public access errors without retrying (%s)", async (status) => {
    const fetcher = jest.fn<ClassPlannerFetch>(async () => new Response(null, { status }));
    await expect(scrapeClassPlanner("FA26", { fetch: fetcher }))
      .rejects.toThrow(`Public Class Planner access failed (HTTP ${status})`);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it.each([429, 503])("retries the same public search body after HTTP %s", async (status) => {
    const fetcher = jest.fn<ClassPlannerFetch>()
      .mockResolvedValueOnce(new Response(null, { status }))
      .mockResolvedValueOnce(Response.json(page()));
    const result = await scrapeClassPlanner("fa26", { fetch: fetcher });
    expect(result.courses).toHaveLength(1);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[1]?.[1]?.body).toBe(fetcher.mock.calls[0]?.[1]?.body);
  });

  it.each([
    { term_code: "WI27" }, { offset: 48 }, { total: -1 },
    { limit: 24 }, { total: 2 }, { courses: null },
  ])("rejects an invalid or truncated catalog page: %j", async (override) => {
    await expect(scrapeClassPlanner("FA26", {
      fetch: async () => Response.json(page(undefined, override)),
    })).rejects.toThrow("Invalid public Class Planner catalog page");
  });

  it("rejects an empty catalog", async () => {
    await expect(scrapeClassPlanner("FA26", { fetch: async () => Response.json(page([])) }))
      .rejects.toThrow("empty catalog");
  });

  it("rejects totals that change between pages", async () => {
    const first = Array.from({ length: 48 }, (_, index) => publicCourse(index + 1));
    const fetcher = jest.fn<ClassPlannerFetch>()
      .mockResolvedValueOnce(Response.json(page(first, { total: 49 })))
      .mockResolvedValueOnce(Response.json(page([publicCourse(49), publicCourse(50)], { total: 50, offset: 48 })));
    await expect(scrapeClassPlanner("FA26", { fetch: fetcher })).rejects.toThrow("changed during pagination");
  });

  it("rejects duplicate offerings", async () => {
    await expect(scrapeClassPlanner("FA26", {
      fetch: async () => Response.json(page([publicCourse(), publicCourse()])),
    })).rejects.toThrow("duplicate course offerings");
  });

  it("rejects a section shared by different offerings", async () => {
    const duplicate = { ...publicCourse(2), sections: publicCourse().sections };
    await expect(scrapeClassPlanner("FA26", {
      fetch: async () => Response.json(page([publicCourse(), duplicate])),
    })).rejects.toThrow("duplicate section IDs");
  });

  it("rejects courses from a different term", async () => {
    await expect(scrapeClassPlanner("FA26", {
      fetch: async () => Response.json(page([{ ...publicCourse(), term_code: "WI27" }])),
    })).rejects.toThrow("course from a different term");
  });
});
