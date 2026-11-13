import type {
  ClassPlannerCourse,
  ClassPlannerMeeting,
  ClassPlannerScrape,
  ClassPlannerResolvedRoute,
  ClassPlannerSection,
  ClassPlannerTerm,
} from "../models/ClassPlannerCatalog.js";
import { classPlannerSourceKey } from "./buildClassPlannerCatalog.js";

const CLASS_PLANNER_API = "https://classplanner.apps.ucsd.edu/api/v1";
const CATALOG_PAGE_SIZE = 48;
const ROUTE_BATCH_SIZE = 10;
const REQUEST_CONCURRENCY = 4;
const MAX_REQUEST_ATTEMPTS = 3;

type FetchResponse = Pick<Response, "json" | "ok" | "status" | "statusText">;
export type ClassPlannerFetch = (
  input: string,
  init?: RequestInit,
) => Promise<FetchResponse>;

type LocationField = "building_code" | "building_name" | "room_code" | "room_name";
type CatalogMeeting = Omit<ClassPlannerMeeting, LocationField> &
  Partial<Pick<ClassPlannerMeeting, LocationField>>;
type CatalogCourse = Omit<ClassPlannerCourse, "availability_refresh_pending" | "metadata_source" | "sections"> & {
  availability_refresh_pending?: boolean;
  metadata_source?: string | null;
  sections: Array<Omit<ClassPlannerSection, "meetings"> & { meetings: CatalogMeeting[] }>;
};

type CatalogPage = Readonly<{
  term_code: string;
  total: number;
  offset: number;
  limit: number;
  courses: CatalogCourse[];
}>;

type ScheduleCourseDetail = Readonly<{
  sections: Array<Readonly<{ section_id: string }>>;
  module_id?: string | null;
  event_package_id?: string | null;
  tss_booking_url?: string | null;
}>;

type ScheduleResponse = Readonly<{
  course_details: Record<string, ScheduleCourseDetail>;
}>;

type CatalogAccess = Readonly<{
  fetch: ClassPlannerFetch;
  sessionCookie?: string;
}>;

export async function scrapeClassPlanner(
  requestedTerm?: string,
  dependencies: Readonly<{ fetch: ClassPlannerFetch }> = {
    fetch: globalThis.fetch,
  },
): Promise<ClassPlannerScrape> {
  const term = requestedTerm
    ? normalizeTerm(requestedTerm)
    : await fetchLatestTerm(dependencies.fetch);
  const courses = await fetchAllCourses(term, { fetch: dependencies.fetch });

  return { term, courses, routes: [] };
}

/** Reads the signed-in catalog and resolves booking routes for an explicit manual import. */
export async function scrapeClassPlannerDetails(
  term: string,
  sessionCookie: string,
  fetcher: ClassPlannerFetch = globalThis.fetch,
): Promise<ClassPlannerScrape> {
  if (!term.trim()) throw new Error("A term is required for the manual details import");
  if (!sessionCookie.trim()) throw new Error("Manual import requires CLASS_PLANNER_SESSION_COOKIE");
  const access = { fetch: fetcher, sessionCookie };
  const normalizedTerm = normalizeTerm(term);
  const courses = await fetchAllCourses(normalizedTerm, access);
  const routes = await resolveRoutes(normalizedTerm, courses, access);
  return { term: normalizedTerm, courses, routes };
}

async function fetchLatestTerm(fetch: ClassPlannerFetch): Promise<string> {
  const payload = await fetchJson<{ terms: ClassPlannerTerm[] }>(
    "/public/catalog/terms",
    { fetch },
  );
  const latest = payload.terms.find(
    ({ configured, course_count }) => configured && course_count > 0,
  );

  if (!latest) {
    throw new Error("Class Planner did not publish a configured term");
  }

  return normalizeTerm(latest.term_code);
}

async function fetchAllCourses(
  term: string,
  access: CatalogAccess,
): Promise<ClassPlannerCourse[]> {
  const firstPage = await fetchCatalogPage(term, 0, access);
  if (firstPage.total === 0) {
    throw new Error(`Class Planner returned an empty catalog for ${term}`);
  }
  const offsets: number[] = [];

  for (
    let offset = CATALOG_PAGE_SIZE;
    offset < firstPage.total;
    offset += CATALOG_PAGE_SIZE
  ) {
    offsets.push(offset);
  }

  const remainingPages = await parallelMap(
    offsets,
    REQUEST_CONCURRENCY,
    (offset) => fetchCatalogPage(term, offset, access),
  );
  const pages = [firstPage, ...remainingPages].sort(
    (left, right) => left.offset - right.offset,
  );
  if (pages.some(({ total }) => total !== firstPage.total)) {
    throw new Error(`Class Planner catalog changed during pagination for ${term}`);
  }
  const courses = pages.flatMap(({ courses }) => courses.map(normalizeCourse));
  const sourceKeys = new Set(courses.map(classPlannerSourceKey));

  if (courses.length !== firstPage.total) {
    throw new Error(
      `Class Planner returned ${courses.length} of ${firstPage.total} courses for ${term}`,
    );
  }

  if (sourceKeys.size !== courses.length) {
    throw new Error(`Class Planner returned duplicate course offerings for ${term}`);
  }

  if (courses.some((course) => course.term_code !== term)) {
    throw new Error(`Class Planner returned a course from a different term than ${term}`);
  }
  const sectionIds = courses.flatMap(({ sections }) => sections.map(({ section_id }) => section_id));
  if (new Set(sectionIds).size !== sectionIds.length) {
    throw new Error(`Class Planner returned duplicate section IDs for ${term}`);
  }

  return courses;
}

async function fetchCatalogPage(
  term: string,
  offset: number,
  access: CatalogAccess,
): Promise<CatalogPage> {
  const query = {
    term_code: term, q: "", offset, limit: CATALOG_PAGE_SIZE,
    sort: "course_code", direction: "asc",
  };
  let page: CatalogPage;
  if (access.sessionCookie) {
    const params = new URLSearchParams({
      ...query, offset: String(offset), limit: String(CATALOG_PAGE_SIZE),
    });
    page = await fetchJson<CatalogPage>(`/catalog/courses?${params}`, access);
  } else {
    page = await fetchJson<CatalogPage>("/public/catalog/courses/search", access, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(query),
    });
  }
  if (!page || page.term_code !== term || page.offset !== offset ||
      page.limit !== CATALOG_PAGE_SIZE || !Number.isSafeInteger(page.total) ||
      page.total < offset || !Array.isArray(page.courses) ||
      page.courses.length !== Math.min(CATALOG_PAGE_SIZE, page.total - offset)) {
    throw new Error(`Invalid Class Planner catalog page for ${term} at offset ${offset}`);
  }
  if (access.sessionCookie) {
    for (const course of page.courses) {
      for (const section of course.sections) {
        for (const meeting of section.meetings) {
          if (!("room_code" in meeting || "room_name" in meeting ||
                "building_code" in meeting || "building_name" in meeting)) {
            throw new Error("Authenticated catalog response omitted location fields");
          }
        }
      }
    }
  }
  return page;
}

function normalizeCourse(course: CatalogCourse): ClassPlannerCourse {
  return {
    ...course,
    availability_refresh_pending: course.availability_refresh_pending ?? false,
    metadata_source: course.metadata_source ?? null,
    sections: course.sections.map((section) => ({
      ...section,
      meetings: section.meetings.map((meeting) => ({
        ...meeting,
        building_code: meeting.building_code ?? null,
        building_name: meeting.building_name ?? null,
        room_code: meeting.room_code ?? null,
        room_name: meeting.room_name ?? null,
      })),
    })),
  };
}

async function resolveRoutes(
  term: string,
  courses: readonly ClassPlannerCourse[],
  access: CatalogAccess,
): Promise<ClassPlannerResolvedRoute[]> {
  const representatives = courses.filter(({ sections }) => sections.length > 0);
  const batches: ClassPlannerCourse[][] = [];
  for (let i = 0; i < representatives.length; i += ROUTE_BATCH_SIZE) {
    batches.push(representatives.slice(i, i + ROUTE_BATCH_SIZE));
  }

  const routes = await parallelMap(batches, REQUEST_CONCURRENCY, async (batch) => {
    const sectionIds = batch.map(({ sections }) => sections[0]!.section_id);
    const ref = Buffer.from(JSON.stringify({ s: sectionIds.sort(), t: term })).toString("base64url");
    const response = await fetchJson<ScheduleResponse>(
      `/schedules/CS2${ref}?context=planner`, access,
    );
    const bySection = new Map(Object.values(response.course_details).flatMap(
      (detail) => detail.sections.map(({ section_id }) => [section_id, detail] as const),
    ));
    return batch.flatMap((course) => {
      const detail = bySection.get(course.sections[0]!.section_id);
      if (!detail || (detail.tss_booking_url != null &&
          (!detail.module_id || !detail.tss_booking_url.startsWith("https://tss.ucsd.edu/fiori#")))) {
        throw new Error(`Missing or invalid TSS route for ${classPlannerSourceKey(course)}`);
      }
      if (!detail.module_id) return [];
      return {
        source_key: classPlannerSourceKey(course),
        module_id: detail.module_id,
        representative_event_package_id: detail.event_package_id ?? null,
        tss_url: detail.tss_booking_url ?? null,
      };
    });
  });
  return routes.flat();
}

export function normalizeTerm(term: string): string {
  const normalized = term.trim().toUpperCase();

  if (!/^[A-Z0-9]{4,6}$/.test(normalized)) {
    throw new Error(`Invalid Class Planner term code: ${term}`);
  }

  return normalized;
}

async function fetchJson<T>(
  path: string,
  access: CatalogAccess,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  if (access.sessionCookie) {
    // Header validation errors can include the supplied value. Keep it out of logs.
    if (/[^\x20-\x7E]/.test(access.sessionCookie) || !access.sessionCookie.trim()) {
      throw new Error("Invalid CLASS_PLANNER_SESSION_COOKIE header value");
    }
    headers.set("Cookie", access.sessionCookie);
  }
  const url = CLASS_PLANNER_API + path;
  for (let attempt = 1; attempt <= MAX_REQUEST_ATTEMPTS; attempt += 1) {
    let response: FetchResponse;
    try {
      response = await access.fetch(url, {
        ...init,
        headers,
        // An SSO redirect means the session expired. Never forward the cookie.
        redirect: "manual",
        signal: AbortSignal.timeout(30_000),
      });
    } catch (error) {
      // Fetch rejects for transport failures/timeouts before an HTTP response exists.
      // Never log the original message or cause: either may contain credentials.
      const retryable = typeof error === "object" && error !== null && "name" in error &&
        ["TypeError", "TimeoutError", "AbortError"].includes(String(error.name));
      if (!retryable || attempt === MAX_REQUEST_ATTEMPTS) {
        throw new Error(`Class Planner transport request failed after ${attempt} attempt(s)`);
      }
      await delay(250 * 2 ** (attempt - 1));
      continue;
    }

    if (response.ok) {
      return response.json() as Promise<T>;
    }

    if (response.status === 401 || response.status === 403 ||
        (response.status >= 300 && response.status < 400)) {
      if (access.sessionCookie) {
        throw new Error(
          `Authenticated Class Planner access failed (HTTP ${response.status}). ` +
          "Renew CLASS_PLANNER_SESSION_COOKIE and rerun ingestion.",
        );
      }
      throw new Error(
        `Public Class Planner access failed (HTTP ${response.status}). ` +
        "The catalog must be accessible without sign-in; check the upstream public API.",
      );
    }

    const retryable = response.status === 429 || response.status >= 500;

    if (!retryable || attempt === MAX_REQUEST_ATTEMPTS) {
      throw new Error(
        `Class Planner request failed (${response.status} ${response.statusText}): ${url}`,
      );
    }

    await delay(250 * 2 ** (attempt - 1));
  }

  throw new Error(`Class Planner request failed: ${url}`);
}

async function parallelMap<T, R>(
  values: readonly T[],
  concurrency: number,
  operation: (value: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < values.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await operation(values[currentIndex]!);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, values.length) }, () => worker()),
  );
  return results;
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
