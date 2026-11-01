import type {
  ClassPlannerCourse,
  ClassPlannerResolvedRoute,
  ClassPlannerScrape,
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

type CatalogPage = Readonly<{
  term_code: string;
  total: number;
  offset: number;
  limit: number;
  courses: ClassPlannerCourse[];
}>;

type ScheduleCourseDetail = Readonly<{
  sections: Array<Readonly<{ section_id: string }>>;
  module_id: string;
  event_package_id: string | null;
  tss_booking_url: string;
}>;

type ScheduleResponse = Readonly<{
  valid: boolean;
  course_details: Record<string, ScheduleCourseDetail>;
}>;

export type ScrapeClassPlannerDependencies = Readonly<{
  fetch: ClassPlannerFetch;
  sessionCookie?: string;
}>;

export async function scrapeClassPlanner(
  requestedTerm?: string,
  dependencies: ScrapeClassPlannerDependencies = {
    fetch: globalThis.fetch,
    sessionCookie: process.env.CLASS_PLANNER_SESSION_COOKIE,
  },
): Promise<ClassPlannerScrape> {
  const sessionCookie = dependencies.sessionCookie;
  if (sessionCookie && /[\r\n]/.test(sessionCookie)) {
    throw new Error("CLASS_PLANNER_SESSION_COOKIE must be a single-line Cookie header value");
  }

  // Keep the session scoped to this scrape, including pagination and route requests.
  const fetcher: ClassPlannerFetch = (url, init) => {
    const headers = new Headers(init?.headers);
    if (sessionCookie?.trim()) headers.set("Cookie", sessionCookie.trim());
    return dependencies.fetch(url, { ...init, headers });
  };
  const term = requestedTerm
    ? normalizeTerm(requestedTerm)
    : await fetchLatestTerm(fetcher);
  const courses = await fetchAllCourses(term, fetcher);
  const routes = await resolveRoutes(term, courses, fetcher);

  return { term, courses, routes };
}

async function fetchLatestTerm(fetcher: ClassPlannerFetch): Promise<string> {
  const payload = await fetchJson<{ terms: ClassPlannerTerm[] }>(
    `${CLASS_PLANNER_API}/planner/terms`,
    fetcher,
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
  fetcher: ClassPlannerFetch,
): Promise<ClassPlannerCourse[]> {
  const firstPage = await fetchCatalogPage(term, 0, fetcher);
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
    (offset) => fetchCatalogPage(term, offset, fetcher),
  );
  const pages = [firstPage, ...remainingPages].sort(
    (left, right) => left.offset - right.offset,
  );
  const courses = pages.flatMap(({ courses }) => courses);
  const sourceKeys = new Set(courses.map(classPlannerSourceKey));

  if (courses.length !== firstPage.total) {
    throw new Error(
      `Class Planner returned ${courses.length} of ${firstPage.total} courses for ${term}`,
    );
  }

  if (sourceKeys.size !== courses.length) {
    throw new Error(`Class Planner returned duplicate course offerings for ${term}`);
  }

  return courses;
}

async function fetchCatalogPage(
  term: string,
  offset: number,
  fetcher: ClassPlannerFetch,
): Promise<CatalogPage> {
  const query = new URLSearchParams({
    term_code: term,
    offset: String(offset),
    limit: String(CATALOG_PAGE_SIZE),
    sort: "course_code",
    direction: "asc",
  });

  return fetchJson<CatalogPage>(
    `${CLASS_PLANNER_API}/catalog/courses?${query}`,
    fetcher,
  );
}

async function resolveRoutes(
  term: string,
  courses: readonly ClassPlannerCourse[],
  fetcher: ClassPlannerFetch,
): Promise<ClassPlannerResolvedRoute[]> {
  const coursesWithSections = courses.filter(({ sections }) => sections.length > 0);
  const sourceKeyByRepresentativeSection = new Map<string, string>();

  for (const course of coursesWithSections) {
    sourceKeyByRepresentativeSection.set(
      course.sections[0]!.section_id,
      classPlannerSourceKey(course),
    );
  }

  const batches = chunk(coursesWithSections, ROUTE_BATCH_SIZE);
  const resolvedBatches = await parallelMap(
    batches,
    REQUEST_CONCURRENCY,
    async (batch) => {
      const sectionIds = batch.map(({ sections }) => sections[0]!.section_id);
      const scheduleRef = encodeScheduleRef(term, sectionIds);
      const response = await fetchJson<ScheduleResponse>(
        `${CLASS_PLANNER_API}/schedules/${scheduleRef}?context=standalone`,
        fetcher,
      );

      const routes: ClassPlannerResolvedRoute[] = [];

      for (const detail of Object.values(response.course_details)) {
        for (const section of detail.sections) {
          const sourceKey = sourceKeyByRepresentativeSection.get(
            section.section_id,
          );

          if (sourceKey) {
            routes.push({
              source_key: sourceKey,
              module_id: detail.module_id,
              representative_event_package_id: detail.event_package_id,
              tss_url: detail.tss_booking_url,
            });
          }
        }
      }

      return routes;
    },
  );
  const routesBySourceKey = new Map(
    resolvedBatches.flat().map((route) => [route.source_key, route]),
  );

  if (routesBySourceKey.size !== coursesWithSections.length) {
    const missing = coursesWithSections
      .map(classPlannerSourceKey)
      .filter((sourceKey) => !routesBySourceKey.has(sourceKey));
    throw new Error(
      `Class Planner did not resolve ${missing.length} TSS routes: ${missing.slice(0, 5).join(", ")}`,
    );
  }

  return Array.from(routesBySourceKey.values());
}

export function encodeScheduleRef(
  term: string,
  sectionIds: readonly string[],
): string {
  const payload = JSON.stringify({
    s: [...sectionIds].sort((left, right) => left.localeCompare(right)),
    t: normalizeTerm(term),
  });

  return `CS2${Buffer.from(payload).toString("base64url")}`;
}

function normalizeTerm(term: string): string {
  const normalized = term.trim().toUpperCase();

  if (!/^[A-Z0-9]{4,6}$/.test(normalized)) {
    throw new Error(`Invalid Class Planner term code: ${term}`);
  }

  return normalized;
}

async function fetchJson<T>(
  url: string,
  fetcher: ClassPlannerFetch,
): Promise<T> {
  for (let attempt = 1; attempt <= MAX_REQUEST_ATTEMPTS; attempt += 1) {
    const response = await fetcher(url, {
      headers: { Accept: "application/json" },
      // A sign-in redirect is not catalog data. Do not forward session credentials.
      redirect: "manual",
      signal: AbortSignal.timeout(30_000),
    });

    if (response.ok) {
      return response.json() as Promise<T>;
    }

    if (response.status === 401 || response.status === 403 ||
        (response.status >= 300 && response.status < 400)) {
      throw new Error(
        `Class Planner access failed (HTTP ${response.status}). ` +
        "Set or refresh CLASS_PLANNER_SESSION_COOKIE with an authorized Class Planner session. " +
        "See README.md for nightly ingestion setup.",
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

function chunk<T>(values: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];

  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }

  return chunks;
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
