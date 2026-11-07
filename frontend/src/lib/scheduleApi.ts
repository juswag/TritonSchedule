import { calendarExamSchema } from "@/lib/examSchedule";
import { z } from "zod";
import type { ScheduleCourse } from "@/types/generation";

const meetingSchema = z
  .object({
    day: z.number().int().min(0).max(6),
    start: z.number().int().min(0).max(1439),
    end: z.number().int().min(1).max(1440),
    location: z.string(),
    type: z.string(),
    sectionId: z.string(),
  })
  .refine((meeting) => meeting.start < meeting.end);

const courseSchema = z.object({
  key: z.string().min(1),
  term: z.string().min(1),
  code: z.string(),
  title: z.string(),
  issues: z.array(z.string()),
  options: z.array(
    z.object({
      id: z.string(),
      exams: z.array(calendarExamSchema).optional(),
      sections: z.array(
        z.object({
          id: z.string(),
          code: z.string(),
          type: z.string(),
          instructor: z.string(),
        }),
      ),
      meetings: z.array(meetingSchema),
    }),
  ),
});

const optionsSchema = z.object({
  term: z.string(),
  courses: z.array(courseSchema),
});

function normalizeBase(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

const primaryBase = normalizeBase(
  import.meta.env.VITE_API_BASE_URL ?? (import.meta.env.DEV ? "/api" : ""),
);
const fallbackBase = normalizeBase(
  import.meta.env.VITE_API_BASE_FALLBACK_URL ?? "",
);
const apiKey = [import.meta.env.VITE_API_KEY, import.meta.env.API_KEY]
  .find((value) => typeof value === "string" && value.trim())
  ?.trim();

async function request(
  path: string,
  signal?: AbortSignal,
  body?: unknown,
): Promise<unknown> {
  const base = primaryBase || fallbackBase;
  if (!base)
    throw new Error("Course search is not configured. Please try again later.");
  const init: RequestInit = {
    signal,
    method: body === undefined ? "GET" : "POST",
    headers: {
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  };
  let response = await fetch(`${base}${path}`, init);
  if (
    fallbackBase &&
    fallbackBase !== base &&
    !signal?.aborted &&
    ([404, 502, 503, 504].includes(response.status) ||
      response.headers.get("content-type")?.includes("text/html"))
  ) {
    response = await fetch(`${fallbackBase}${path}`, init);
  }
  const payload: unknown = await response.json().catch((error: unknown) => {
    if (
      signal?.aborted ||
      (error instanceof Error && error.name === "AbortError")
    )
      throw error;
    return null;
  });
  if (!response.ok) {
    const detail = z
      .object({ message: z.string().optional(), error: z.string().optional() })
      .safeParse(payload);
    throw new Error(
      (detail.success && (detail.data.message || detail.data.error)) ||
        "Course data could not be loaded. Please try again.",
    );
  }
  if (payload === null)
    throw new Error(
      "The course service returned an invalid response. Please try again.",
    );
  return payload;
}

export async function getScheduleTerm(signal?: AbortSignal): Promise<string> {
  const result = z
    .object({ Term: z.union([z.string(), z.object({ Term: z.string() })]) })
    .safeParse(await request("/term", signal));
  if (!result.success)
    throw new Error("The active term could not be loaded. Please try again.");
  const term =
    typeof result.data.Term === "string"
      ? result.data.Term
      : result.data.Term.Term;
  if (!term.trim()) throw new Error("No active term is available.");
  return term.trim();
}

async function readCourses(
  payload: Promise<unknown>,
  term: string,
): Promise<ScheduleCourse[]> {
  const result = optionsSchema.safeParse(await payload);
  if (
    !result.success ||
    result.data.term !== term ||
    result.data.courses.some((course) => course.term !== term)
  ) {
    throw new Error(
      "The catalog response is incomplete or belongs to another term. Please try again.",
    );
  }
  if (
    new Set(result.data.courses.map((course) => course.key)).size !==
    result.data.courses.length
  ) {
    throw new Error(
      "The catalog returned duplicate courses. Please try again.",
    );
  }
  return result.data.courses as ScheduleCourse[];
}

export function searchScheduleCourses(
  query: string,
  term: string,
  signal?: AbortSignal,
): Promise<ScheduleCourse[]> {
  if (!query.trim() || !term) return Promise.resolve([]);
  const params = new URLSearchParams({ course: query.trim(), term });
  return readCourses(request(`/course/options?${params}`, signal), term);
}

export async function getScheduleOptions(
  term: string,
  keys: string[],
  signal?: AbortSignal,
): Promise<ScheduleCourse[]> {
  const uniqueKeys = [...new Set(keys)];
  const courses = await readCourses(
    request("/course/options", signal, { term, keys: uniqueKeys }),
    term,
  );
  if (
    courses.length !== uniqueKeys.length ||
    courses.some((course) => !uniqueKeys.includes(course.key))
  ) {
    throw new Error(
      "Some selected courses are no longer in the catalog. Remove them and search again.",
    );
  }
  return courses;
}
