import { describe, expect, it, jest } from "@jest/globals";
import { scrapeClassPlanner, scrapeClassPlannerDetails, type ClassPlannerFetch } from "../../src/ingestion/scrapeClassPlanner.js";
import { buildClassPlannerCatalog } from "../../src/ingestion/buildClassPlannerCatalog.js";
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

function page(courses: unknown[] = [publicCourse()], overrides: object = {}) {
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

  it("resolves booking routes only during the explicit manual import", async () => {
    const course = classPlannerCourse();
    const detail = {
      sections: [{ section_id: course.sections[0]!.section_id }],
      module_id: "1234", event_package_id: null, tss_booking_url: "https://tss.ucsd.edu/fiori#module",
    };
    const fetcher = jest.fn<ClassPlannerFetch>()
      .mockResolvedValueOnce(Response.json(page([course])))
      .mockResolvedValueOnce(Response.json({ course_details: { course: detail } }));
    const result = await scrapeClassPlannerDetails("fa26", "session=example", fetcher);
    expect(result.routes).toEqual([{
      source_key: `CSE-1:${course.sections[0]!.section_id}`,
      module_id: "1234", representative_event_package_id: null, tss_url: detail.tss_booking_url,
    }]);
    const [routeUrl, init] = fetcher.mock.calls[1]!;
    const ref = new URL(routeUrl).pathname.split("/schedules/CS2")[1]!;
    expect(JSON.parse(Buffer.from(ref, "base64url").toString())).toEqual({
      t: "FA26", s: [course.sections[0]!.section_id],
    });
    expect(new Headers(init?.headers).get("Cookie")).toBe("session=example");
  });

  it("keeps UCSD module and package IDs when the live API omits the booking URL", async () => {
    const course = classPlannerCourse();
    const section = course.sections[0]!;
    const fetcher = jest.fn<ClassPlannerFetch>()
      .mockResolvedValueOnce(Response.json(page([course])))
      .mockResolvedValueOnce(Response.json({ course_details: { c: {
        sections: [section], module_id: "395", event_package_id: section.event_package_ids[0],
      } } }));
    const { courses, routes } = await scrapeClassPlannerDetails("FA26", "session=example", fetcher);
    const catalog = buildClassPlannerCatalog("FA26", courses, routes);
    expect(catalog.offerings[0]?.module_id).toBe("395");
    expect(catalog.event_packages[0]).toMatchObject({
      module_id: "395", event_package_id: section.event_package_ids[0], tss_booking_url: null,
    });
    expect(catalog.module_routes).toHaveLength(0);
  });

  it("keeps rooms for a section with no booking destination", async () => {
    const course = classPlannerCourse();
    const fetcher = jest.fn<ClassPlannerFetch>()
      .mockResolvedValueOnce(Response.json(page([course])))
      .mockResolvedValueOnce(Response.json({ course_details: { c: {
        sections: course.sections, event_package_id: null, module_id: null, tss_booking_url: null,
      } } }));
    const result = await scrapeClassPlannerDetails("FA26", "session=example", fetcher);
    expect(result.courses[0]?.sections[0]?.meetings[0]?.room_code).toBe("CENTR 101");
    expect(result.routes).toEqual([]);
  });

  it("rejects an incomplete manual response before publishing any details", async () => {
    const fetcher = jest.fn<ClassPlannerFetch>()
      .mockResolvedValueOnce(Response.json(page([classPlannerCourse()])))
      .mockResolvedValueOnce(Response.json({ course_details: {} }));
    await expect(scrapeClassPlannerDetails("FA26", "session=example", fetcher))
      .rejects.toThrow("Missing or invalid TSS route");
    await expect(scrapeClassPlannerDetails("FA26", "", fetcher)).rejects.toThrow("requires CLASS_PLANNER_SESSION_COOKIE");
    await expect(scrapeClassPlannerDetails("FA26", "session=example", async () => Response.json(page())))
      .rejects.toThrow("omitted location fields");
  });

  it.each([401, 403, 302, 307])("aborts on a rejected session without following redirects or falling back (%s)", async (status) => {
    const fetcher = jest.fn<ClassPlannerFetch>(async () => new Response(null, {
      status, headers: { Location: "https://sso.example.edu/login" },
    }));
    await expect(scrapeClassPlannerDetails("FA26", "session=expired", fetcher))
      .rejects.toThrow(`Authenticated Class Planner access failed (HTTP ${status})`);
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, init] = fetcher.mock.calls[0]!;
    expect(new URL(url).pathname).toBe("/api/v1/catalog/courses");
    expect(init?.redirect).toBe("manual");
  });

  it("discards fetched pages if the session expires during pagination", async () => {
    const firstPage = Array.from({ length: 48 }, (_, index) => classPlannerCourse(index + 1));
    const fetcher = jest.fn<ClassPlannerFetch>()
      .mockResolvedValueOnce(Response.json(page(firstPage, { total: 49 })))
      .mockResolvedValueOnce(new Response(null, { status: 401 }));
    await expect(scrapeClassPlannerDetails("FA26", "session=example", fetcher))
      .rejects.toThrow("Renew CLASS_PLANNER_SESSION_COOKIE");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("does not include a malformed cookie in an error", async () => {
    const fetcher = jest.fn<ClassPlannerFetch>();
    await expect(scrapeClassPlannerDetails("FA26", "session=secret\ninvalid", fetcher))
      .rejects.toThrow(/^Invalid CLASS_PLANNER_SESSION_COOKIE header value$/);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each([
    new TypeError("fetch failed"),
    new DOMException("request timed out", "TimeoutError"),
  ])("retries transport failures with the same body and a fresh timeout: %s", async (error) => {
    const fetcher = jest.fn<ClassPlannerFetch>()
      .mockRejectedValueOnce(error)
      .mockResolvedValueOnce(Response.json(page()));
    expect((await scrapeClassPlanner("FA26", { fetch: fetcher })).courses).toHaveLength(1);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[1]?.[1]?.body).toBe(fetcher.mock.calls[0]?.[1]?.body);
    expect(fetcher.mock.calls[1]?.[1]?.signal).not.toBe(fetcher.mock.calls[0]?.[1]?.signal);
  });

  it("caps transport retries and does not expose error messages or causes", async () => {
    const fetcher = jest.fn<ClassPlannerFetch>().mockRejectedValue(
      new TypeError("session=secret", { cause: new Error("secret-token") }),
    );
    await expect(scrapeClassPlanner("FA26", { fetch: fetcher }))
      .rejects.toThrow(/^Class Planner transport request failed after 3 attempt\(s\)$/);
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it("does not retry unexpected errors from the fetch implementation", async () => {
    const fetcher = jest.fn<ClassPlannerFetch>().mockRejectedValue(new Error("unexpected"));
    await expect(scrapeClassPlanner("FA26", { fetch: fetcher }))
      .rejects.toThrow("failed after 1 attempt(s)");
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
    })).rejects.toThrow("Invalid Class Planner catalog page");
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
