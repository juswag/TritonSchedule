import type {
  ClassPlannerCourse,
  ClassPlannerMeeting,
  ClassPlannerScrape,
  ClassPlannerSection,
  ClassPlannerTerm,
} from "../models/ClassPlannerCatalog.js";
import { classPlannerSourceKey } from "./buildClassPlannerCatalog.js";

const CLASS_PLANNER_API = "https://classplanner.apps.ucsd.edu/api/v1/public/catalog";
const CATALOG_PAGE_SIZE = 48;
const REQUEST_CONCURRENCY = 4;
const MAX_REQUEST_ATTEMPTS = 3;

type FetchResponse = Pick<Response, "json" | "ok" | "status" | "statusText">;
export type ClassPlannerFetch = (
  input: string,
  init?: RequestInit,
) => Promise<FetchResponse>;

type LocationField = "building_code" | "building_name" | "room_code" | "room_name";
type PublicMeeting = Omit<ClassPlannerMeeting, LocationField> &
  Partial<Pick<ClassPlannerMeeting, LocationField>>;
type PublicCourse = Omit<ClassPlannerCourse, "availability_refresh_pending" | "metadata_source" | "sections"> & {
  sections: Array<Omit<ClassPlannerSection, "meetings"> & { meetings: PublicMeeting[] }>;
};

type CatalogPage = Readonly<{
  term_code: string;
  total: number;
  offset: number;
  limit: number;
  courses: PublicCourse[];
}>;

export type ScrapeClassPlannerDependencies = Readonly<{
  fetch: ClassPlannerFetch;
}>;

export async function scrapeClassPlanner(
  requestedTerm?: string,
  dependencies: ScrapeClassPlannerDependencies = {
    fetch: globalThis.fetch,
  },
): Promise<ClassPlannerScrape> {
  const term = requestedTerm
    ? normalizeTerm(requestedTerm)
    : await fetchLatestTerm(dependencies.fetch);
  const courses = await fetchAllCourses(term, dependencies.fetch);

  // Public catalog responses do not include authenticated TSS route metadata.
  return { term, courses, routes: [] };
}

async function fetchLatestTerm(fetcher: ClassPlannerFetch): Promise<string> {
  const payload = await fetchJson<{ terms: ClassPlannerTerm[] }>(
    `${CLASS_PLANNER_API}/terms`,
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
  if (firstPage.total === 0) {
    throw new Error(`Public Class Planner returned an empty catalog for ${term}`);
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
    (offset) => fetchCatalogPage(term, offset, fetcher),
  );
  const pages = [firstPage, ...remainingPages].sort(
    (left, right) => left.offset - right.offset,
  );
  if (pages.some(({ total }) => total !== firstPage.total)) {
    throw new Error(`Public Class Planner catalog changed during pagination for ${term}`);
  }
  const courses = pages.flatMap(({ courses }) => courses.map(normalizePublicCourse));
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
    throw new Error(`Public Class Planner returned a course from a different term than ${term}`);
  }
  const sectionIds = courses.flatMap(({ sections }) => sections.map(({ section_id }) => section_id));
  if (new Set(sectionIds).size !== sectionIds.length) {
    throw new Error(`Public Class Planner returned duplicate section IDs for ${term}`);
  }

  return courses;
}

async function fetchCatalogPage(
  term: string,
  offset: number,
  fetcher: ClassPlannerFetch,
): Promise<CatalogPage> {
  const page = await fetchJson<CatalogPage>(
    `${CLASS_PLANNER_API}/courses/search`,
    fetcher,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        term_code: term, q: "", offset, limit: CATALOG_PAGE_SIZE,
        sort: "course_code", direction: "asc",
      }),
    },
  );
  if (!page || page.term_code !== term || page.offset !== offset ||
      page.limit !== CATALOG_PAGE_SIZE || !Number.isSafeInteger(page.total) ||
      page.total < offset || !Array.isArray(page.courses) ||
      page.courses.length !== Math.min(CATALOG_PAGE_SIZE, page.total - offset)) {
    throw new Error(`Invalid public Class Planner catalog page for ${term} at offset ${offset}`);
  }
  return page;
}

function normalizePublicCourse(course: PublicCourse): ClassPlannerCourse {
  return {
    ...course,
    availability_refresh_pending: false,
    metadata_source: null,
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
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  for (let attempt = 1; attempt <= MAX_REQUEST_ATTEMPTS; attempt += 1) {
    const response = await fetcher(url, {
      ...init,
      headers,
      // Stop if the public API starts requiring sign-in.
      redirect: "manual",
      signal: AbortSignal.timeout(30_000),
    });

    if (response.ok) {
      return response.json() as Promise<T>;
    }

    if (response.status === 401 || response.status === 403 ||
        (response.status >= 300 && response.status < 400)) {
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
