import { describe, expect, it, jest } from "@jest/globals";
import {
  encodeScheduleRef,
  scrapeClassPlanner,
  type ClassPlannerFetch,
} from "../../src/ingestion/scrapeClassPlanner.js";
import { classPlannerCourse } from "./classPlannerFixtures.js";

function jsonResponse(body: unknown) {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    json: async () => body,
  };
}

describe("encodeScheduleRef", () => {
  it("sorts section IDs before base64url encoding", () => {
    expect(encodeScheduleRef("fa26", ["E 00001998", "E 00001997"]))
      .toBe("CS2eyJzIjpbIkUgMDAwMDE5OTciLCJFIDAwMDAxOTk4Il0sInQiOiJGQTI2In0");
  });
});

describe("scrapeClassPlanner", () => {
  it.each([undefined, "planner_session=test-session"])(
    "discovers the term, paginates courses, and resolves routes with session %s",
    async (sessionCookie) => {
      const courses = Array.from({ length: 49 }, (_, index) =>
        classPlannerCourse(index + 1),
      );
      const fetcher = jest.fn<ClassPlannerFetch>(async (input, init) => {
        const headers = new Headers(init?.headers);
        expect(headers.get("Cookie")).toBe(sessionCookie ?? null);
        expect(headers.get("Accept")).toBe("application/json");
        expect(init?.redirect).toBe("manual");
        const url = new URL(input);

        if (url.pathname.endsWith("/planner/terms")) {
          return jsonResponse({
            terms: [
              {
                term_code: "FA26",
                term_name: "Fall 2026",
                calendar_year: 2026,
                course_count: courses.length,
                section_count: courses.length,
                meeting_count: courses.length,
                last_full_refresh_at: null,
                configured: true,
              },
            ],
          });
        }

        if (url.pathname.endsWith("/catalog/courses")) {
          const offset = Number(url.searchParams.get("offset"));
          return jsonResponse({
            term_code: "FA26",
            total: courses.length,
            offset,
            limit: 48,
            courses: courses.slice(offset, offset + 48),
          });
        }

        const encoded = url.pathname.split("/schedules/")[1]!;
        const schedule = JSON.parse(
          Buffer.from(encoded.slice(3), "base64url").toString("utf8"),
        ) as { s: string[] };
        const courseDetails = Object.fromEntries(
          schedule.s.map((sectionId, index) => [
            `course-${index}`,
            {
              sections: [{ section_id: sectionId }],
              module_id: sectionId.replace(/\D/g, ""),
              event_package_id: null,
              tss_booking_url: `https://tss.ucsd.edu/module/${sectionId}`,
            },
          ]),
        );

        return jsonResponse({ valid: false, course_details: courseDetails });
      });

      const result = await scrapeClassPlanner(undefined, { fetch: fetcher, sessionCookie });

      expect(result.term).toBe("FA26");
      expect(result.courses).toHaveLength(49);
      expect(result.routes).toHaveLength(49);
      expect(fetcher).toHaveBeenCalledTimes(8);
    },
  );

  it.each([401, 403, 302, 303, 307, 308])(
    "reports authentication failures without retrying or exposing credentials (%s)",
    async (status) => {
      const sessionCookie = "planner_session=expired-secret";
      const json = jest.fn(async () => ({ detail: sessionCookie }));
      const fetcher = jest.fn<ClassPlannerFetch>(async () => ({
        ok: false,
        status,
        statusText: "Authentication required",
        json,
      }));

      await expect(scrapeClassPlanner(undefined, { fetch: fetcher, sessionCookie }))
        .rejects.toThrow("Set or refresh CLASS_PLANNER_SESSION_COOKIE");
      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(json).not.toHaveBeenCalled();
    },
  );

  it("explains how to configure authentication when no session is supplied", async () => {
    const fetcher = jest.fn<ClassPlannerFetch>(async () => ({
      ok: false,
      status: 401,
      statusText: "Unauthorized",
      json: async () => ({ detail: "Sign in to continue" }),
    }));

    await expect(scrapeClassPlanner(undefined, { fetch: fetcher }))
      .rejects.toThrow("Set or refresh CLASS_PLANNER_SESSION_COOKIE");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("reads the production session at call time and preserves it across retries", async () => {
    const previousCookie = process.env.CLASS_PLANNER_SESSION_COOKIE;
    process.env.CLASS_PLANNER_SESSION_COOKIE = "planner_session=configured-secret";
    const fetcher = jest.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(Response.json({
        total: 0, offset: 0, limit: 48, courses: [],
      }));

    try {
      const result = await scrapeClassPlanner("fa26");
      expect(result).toEqual({ term: "FA26", courses: [], routes: [] });
      expect(fetcher).toHaveBeenCalledTimes(2);
      for (const [url, init] of fetcher.mock.calls) {
        expect(String(url)).toContain("/catalog/courses?term_code=FA26");
        expect(new Headers(init?.headers).get("Cookie"))
          .toBe("planner_session=configured-secret");
        expect(init?.redirect).toBe("manual");
      }
    } finally {
      fetcher.mockRestore();
      if (previousCookie === undefined) delete process.env.CLASS_PLANNER_SESSION_COOKIE;
      else process.env.CLASS_PLANNER_SESSION_COOKIE = previousCookie;
    }
  });

  it("rejects multiline session values without exposing them or sending a request", async () => {
    const fetcher = jest.fn<ClassPlannerFetch>();
    await expect(scrapeClassPlanner(undefined, {
      fetch: fetcher,
      sessionCookie: "planner_session=secret\r\nInjected: value",
    })).rejects.toThrow("CLASS_PLANNER_SESSION_COOKIE must be a single-line Cookie header value");
    expect(fetcher).not.toHaveBeenCalled();
  });
});
