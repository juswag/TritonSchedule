import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ScheduleCourse } from "@/types/generation";

const term = "FA26";
const course: ScheduleCourse = {
  key: "fa26:cse110",
  term,
  code: "CSE 110",
  title: "Software Engineering",
  issues: [],
  options: [
    {
      id: "cse110:a01",
      sections: [
        { id: "12345", code: "A00", type: "LE", instructor: "Instructor" },
      ],
      meetings: [
        {
          day: 0,
          start: 600,
          end: 650,
          location: "CENTR 101",
          type: "LE",
          sectionId: "12345",
        },
      ],
    },
  ],
};
const anotherCourse: ScheduleCourse = {
  ...course,
  key: "fa26:math109",
  code: "MATH 109",
  title: "Mathematical Reasoning",
};
const fetchMock = vi.fn<typeof fetch>();
let api: typeof import("@/lib/scheduleApi");

function response(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function catalog(courses: unknown[] = [course], responseTerm = term) {
  return response({ term: responseTerm, courses });
}

async function reloadApi() {
  vi.resetModules();
  api = await import("@/lib/scheduleApi");
}

beforeEach(async () => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("VITE_API_BASE_URL", " https://catalog.example/api/// ");
  vi.stubEnv("VITE_API_BASE_FALLBACK_URL", "");
  vi.stubEnv("VITE_API_KEY", "");
  vi.stubEnv("API_KEY", "");
  await reloadApi();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("schedule catalog requests", () => {
  it("encodes search text and term, preserves course options, and forwards cancellation", async () => {
    fetchMock.mockResolvedValueOnce(catalog());
    const controller = new AbortController();

    await expect(
      api.searchScheduleCourses("  CSE & math  ", term, controller.signal),
    ).resolves.toEqual([course]);

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith(
      "https://catalog.example/api/course/options?course=CSE+%26+math&term=FA26",
      { method: "GET", headers: {}, signal: controller.signal },
    );
  });

  it.each([
    ["   ", term],
    ["CSE", ""],
  ])(
    "does not fetch an incomplete search (%j, %j)",
    async (query, activeTerm) => {
      await expect(
        api.searchScheduleCourses(query, activeTerm),
      ).resolves.toEqual([]);
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it("refreshes the exact selected set, deduplicates requested keys, and accepts a reordered response", async () => {
    fetchMock.mockResolvedValueOnce(catalog([anotherCourse, course]));
    const controller = new AbortController();

    await expect(
      api.getScheduleOptions(
        term,
        [course.key, anotherCourse.key, course.key],
        controller.signal,
      ),
    ).resolves.toEqual([anotherCourse, course]);

    expect(fetchMock).toHaveBeenCalledWith(
      "https://catalog.example/api/course/options",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({ term, keys: [course.key, anotherCourse.key] }),
      },
    );
  });

  it.each([
    { name: "a missing selected course", courses: [] },
    { name: "an unexpected replacement course", courses: [anotherCourse] },
    { name: "an extra unselected course", courses: [course, anotherCourse] },
  ])(
    "rejects $name instead of generating a partial or different schedule",
    async ({ courses }) => {
      fetchMock.mockResolvedValueOnce(catalog(courses));
      await expect(api.getScheduleOptions(term, [course.key])).rejects.toThrow(
        "Some selected courses are no longer in the catalog",
      );
    },
  );

  it("accepts an empty successful search and an empty selection refresh", async () => {
    fetchMock
      .mockResolvedValueOnce(catalog([]))
      .mockResolvedValueOnce(catalog([]));
    await expect(api.searchScheduleCourses("unknown", term)).resolves.toEqual(
      [],
    );
    await expect(api.getScheduleOptions(term, [])).resolves.toEqual([]);
  });

  it("preserves catalog issues for courses without usable options", async () => {
    const unavailable = {
      ...course,
      options: [],
      issues: ["No published meeting times."],
    };
    fetchMock.mockResolvedValueOnce(catalog([unavailable]));
    await expect(api.getScheduleOptions(term, [course.key])).resolves.toEqual([
      unavailable,
    ]);
  });
});

describe("schedule catalog response boundaries", () => {
  it.each([
    { name: "the response term", payload: { term: "WI27", courses: [course] } },
    {
      name: "an individual course term",
      payload: { term, courses: [{ ...course, term: "WI27" }] },
    },
  ])("rejects a mismatch in $name", async ({ payload }) => {
    fetchMock.mockResolvedValueOnce(response(payload));
    await expect(api.searchScheduleCourses("CSE", term)).rejects.toThrow(
      "belongs to another term",
    );
  });

  it("rejects duplicate course keys before selected-set validation", async () => {
    fetchMock.mockResolvedValueOnce(
      catalog([course, { ...course, title: "Duplicate" }]),
    );
    await expect(api.getScheduleOptions(term, [course.key])).rejects.toThrow(
      "duplicate courses",
    );
  });

  it.each([
    { name: "missing courses", payload: { term } },
    { name: "non-array courses", payload: { term, courses: { course } } },
    {
      name: "missing options",
      payload: {
        term,
        courses: [
          {
            key: course.key,
            term,
            code: course.code,
            title: course.title,
            issues: [],
          },
        ],
      },
    },
    {
      name: "invalid section data",
      payload: {
        term,
        courses: [
          {
            ...course,
            options: [{ ...course.options[0], sections: [{ id: 12345 }] }],
          },
        ],
      },
    },
    {
      name: "invalid issues",
      payload: { term, courses: [{ ...course, issues: [null] }] },
    },
  ])("rejects malformed catalog data: $name", async ({ payload }) => {
    fetchMock.mockResolvedValueOnce(response(payload));
    await expect(api.searchScheduleCourses("CSE", term)).rejects.toThrow(
      "catalog response is incomplete",
    );
  });

  it.each([
    { name: "day outside the week", meeting: { day: 7 } },
    { name: "fractional day", meeting: { day: 1.5 } },
    { name: "negative start", meeting: { start: -1 } },
    { name: "end after midnight", meeting: { end: 1441 } },
    { name: "fractional minute", meeting: { start: 600.5 } },
    { name: "zero-length meeting", meeting: { start: 650, end: 650 } },
    { name: "backward interval", meeting: { start: 660, end: 650 } },
    { name: "invalid section reference", meeting: { sectionId: 12345 } },
  ])("rejects malformed meeting data: $name", async ({ meeting }) => {
    fetchMock.mockResolvedValueOnce(
      catalog([
        {
          ...course,
          options: [
            {
              ...course.options[0],
              meetings: [{ ...course.options[0].meetings[0], ...meeting }],
            },
          ],
        },
      ]),
    );
    await expect(api.getScheduleOptions(term, [course.key])).rejects.toThrow(
      "catalog response is incomplete",
    );
  });

  it("accepts weekend meetings and day-boundary times", async () => {
    const fullDay = {
      ...course,
      options: [
        {
          ...course.options[0],
          meetings: [
            { ...course.options[0].meetings[0], day: 6, start: 0, end: 1440 },
          ],
        },
      ],
    };
    fetchMock.mockResolvedValueOnce(catalog([fullDay]));
    await expect(api.getScheduleOptions(term, [course.key])).resolves.toEqual([
      fullDay,
    ]);
  });
});

describe("active schedule term", () => {
  it.each([{ Term: " FA26 " }, { Term: { Term: " FA26 " } }])(
    "reads and trims the supported term shape %j",
    async (payload) => {
      fetchMock.mockResolvedValueOnce(response(payload));
      const controller = new AbortController();
      await expect(api.getScheduleTerm(controller.signal)).resolves.toBe(term);
      expect(fetchMock).toHaveBeenCalledWith(
        "https://catalog.example/api/term",
        expect.objectContaining({ signal: controller.signal }),
      );
    },
  );

  it.each([{ term }, { Term: 2026 }, { Term: { Term: null } }])(
    "rejects a malformed term payload %j",
    async (payload) => {
      fetchMock.mockResolvedValueOnce(response(payload));
      await expect(api.getScheduleTerm()).rejects.toThrow(
        "The active term could not be loaded",
      );
    },
  );

  it("rejects a blank active term", async () => {
    fetchMock.mockResolvedValueOnce(response({ Term: "  " }));
    await expect(api.getScheduleTerm()).rejects.toThrow(
      "No active term is available",
    );
  });
});

describe("catalog failures and cancellation", () => {
  it.each([
    {
      payload: { message: "Catalog is refreshing.", error: "Internal detail" },
      expected: "Catalog is refreshing.",
    },
    {
      payload: { error: "Selected course was removed." },
      expected: "Selected course was removed.",
    },
    {
      payload: { message: "", error: "Try another term." },
      expected: "Try another term.",
    },
    {
      payload: { unexpected: true },
      expected: "Course data could not be loaded. Please try again.",
    },
    {
      payload: { message: 123 },
      expected: "Course data could not be loaded. Please try again.",
    },
  ])(
    "surfaces a useful HTTP error: $expected",
    async ({ payload, expected }) => {
      fetchMock.mockResolvedValueOnce(response(payload, 400));
      await expect(api.searchScheduleCourses("CSE", term)).rejects.toThrow(
        expected,
      );
    },
  );

  it("rejects a successful response with invalid JSON", async () => {
    fetchMock.mockResolvedValueOnce(new Response("not json", { status: 200 }));
    await expect(api.getScheduleTerm()).rejects.toThrow(
      "The course service returned an invalid response",
    );
  });

  it("uses the generic HTTP error when the error body is not JSON", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response("Bad gateway", { status: 502 }),
    );
    await expect(api.getScheduleTerm()).rejects.toThrow(
      "Course data could not be loaded",
    );
  });

  it("preserves network failures", async () => {
    const failure = new TypeError("Failed to fetch");
    fetchMock.mockRejectedValueOnce(failure);
    await expect(api.searchScheduleCourses("CSE", term)).rejects.toBe(failure);
  });

  it("forwards cancellation to an in-flight fetch without converting it to a catalog error", async () => {
    const controller = new AbortController();
    const aborted = new DOMException(
      "The operation was aborted.",
      "AbortError",
    );
    fetchMock.mockImplementationOnce(
      (_input, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(aborted), {
            once: true,
          });
        }),
    );
    const pending = api.getScheduleOptions(
      term,
      [course.key],
      controller.signal,
    );
    const rejected = expect(pending).rejects.toBe(aborted);
    controller.abort();
    await rejected;
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("preserves cancellation while the response body is being read", async () => {
    const controller = new AbortController();
    const aborted = new DOMException(
      "The operation was aborted.",
      "AbortError",
    );
    const pendingResponse = catalog();
    vi.spyOn(pendingResponse, "json").mockImplementation(async () => {
      controller.abort();
      throw aborted;
    });
    fetchMock.mockResolvedValueOnce(pendingResponse);
    await expect(
      api.searchScheduleCourses("CSE", term, controller.signal),
    ).rejects.toBe(aborted);
  });
});

describe("catalog API configuration", () => {
  it("normalizes the fallback base and uses it when the primary base is empty", async () => {
    vi.stubEnv("VITE_API_BASE_URL", "");
    vi.stubEnv(
      "VITE_API_BASE_FALLBACK_URL",
      " https://fallback.example/api/// ",
    );
    await reloadApi();
    fetchMock.mockResolvedValueOnce(response({ Term: term }));
    await expect(api.getScheduleTerm()).resolves.toBe(term);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://fallback.example/api/term",
      expect.anything(),
    );
  });

  it("reports missing service configuration before fetching", async () => {
    vi.stubEnv("VITE_API_BASE_URL", "");
    await reloadApi();
    await expect(api.getScheduleTerm()).rejects.toThrow(
      "Course search is not configured",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([404, 502, 503, 504])(
    "retries a %i response against the fallback without changing the selected-course request",
    async (status) => {
      vi.stubEnv("VITE_API_BASE_FALLBACK_URL", "https://fallback.example/api");
      vi.stubEnv("VITE_API_KEY", " client-key ");
      await reloadApi();
      fetchMock
        .mockResolvedValueOnce(response({ error: "Unavailable" }, status))
        .mockResolvedValueOnce(catalog());
      await expect(api.getScheduleOptions(term, [course.key])).resolves.toEqual(
        [course],
      );
      expect(fetchMock).toHaveBeenCalledTimes(2);
      const firstInit = fetchMock.mock.calls[0][1];
      expect(firstInit).toMatchObject({
        method: "POST",
        headers: {
          Authorization: "Bearer client-key",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ term, keys: [course.key] }),
      });
      expect(fetchMock).toHaveBeenLastCalledWith(
        "https://fallback.example/api/course/options",
        firstInit,
      );
    },
  );

  it("retries an HTML application response against the fallback", async () => {
    vi.stubEnv("VITE_API_BASE_FALLBACK_URL", "https://fallback.example/api");
    await reloadApi();
    fetchMock
      .mockResolvedValueOnce(
        new Response("<!doctype html>", {
          headers: { "Content-Type": "text/html" },
        }),
      )
      .mockResolvedValueOnce(response({ Term: term }));
    await expect(api.getScheduleTerm()).resolves.toBe(term);
    expect(fetchMock).toHaveBeenLastCalledWith(
      "https://fallback.example/api/term",
      expect.anything(),
    );
  });

  it("does not retry an authorization error against a fallback", async () => {
    vi.stubEnv("VITE_API_BASE_FALLBACK_URL", "https://fallback.example/api");
    await reloadApi();
    fetchMock.mockResolvedValueOnce(
      response({ message: "Authorization required." }, 401),
    );
    await expect(api.getScheduleTerm()).rejects.toThrow(
      "Authorization required.",
    );
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("does not retry the same normalized base", async () => {
    vi.stubEnv("VITE_API_BASE_FALLBACK_URL", "https://catalog.example/api/");
    await reloadApi();
    fetchMock.mockResolvedValueOnce(response({ message: "Unavailable." }, 503));
    await expect(api.getScheduleTerm()).rejects.toThrow("Unavailable.");
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("uses the alternate API key when the primary key is blank", async () => {
    vi.stubEnv("VITE_API_KEY", "  ");
    vi.stubEnv("API_KEY", " alternate-key ");
    await reloadApi();
    fetchMock.mockResolvedValueOnce(response({ Term: term }));
    await api.getScheduleTerm();
    expect(fetchMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: { Authorization: "Bearer alternate-key" },
      }),
    );
  });
});
