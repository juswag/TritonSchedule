import { describe, expect, it, jest } from "@jest/globals";
import {
  resolveProfessorRefresh,
  runCatalogIngestion,
  type CatalogIngestionDependencies,
} from "../../src/ingestion/runCatalogIngestion.js";
import { ProfessorEnrichmentUnavailableError } from "../../src/ingestion/enrichCoursesWithRatings.js";
import type { ClassPlannerCatalogSnapshot } from "../../src/models/ClassPlannerCatalog.js";
import type { Course } from "../../src/models/Course.js";
import { ingestCatalog } from "../../src/ingestion/ingestCatalog.js";
import { scrapeClassPlanner } from "../../src/ingestion/scrapeClassPlanner.js";
import { classPlannerCourse } from "./classPlannerFixtures.js";

const catalog: ClassPlannerCatalogSnapshot = {
  event_packages: [],
  meetings: [],
  module_routes: [],
  offerings: [],
  package_sections: [],
  sections: [],
};

const courses: Course[] = [{
  Discussions: [],
  Final: null,
  Labs: [],
  Lecture: null,
  Midterms: [],
  Name: "CSE 101",
  Teacher: "Ada Lovelace",
  Term: "FA26",
  nameKey: "ada lovelace",
  rmp: null,
}];

function dependencies(
  overrides: Partial<CatalogIngestionDependencies> = {},
): CatalogIngestionDependencies {
  return {
    beginRun: async () => undefined,
    completeRun: async () => undefined,
    enrichProfessors: async () => ({
      counts: {
        failed: 0,
        matched: 1,
        requested: 1,
        successfulRequests: 1,
        unmatched: 0,
      },
      courses,
      professors: [{
        avgDiff: 2,
        avgRating: 5,
        name: "ada lovelace",
        nameKey: "ada lovelace",
        takeAgainPercent: 90,
      }],
      unmatchedNameKeys: [],
      warnings: [],
    }),
    failRun: async () => undefined,
    ingest: async () => ({ catalog, courses, term: "FA26" }),
    publishCatalog: async () => undefined,
    shouldRetryProfessors: async () => false,
    upsertProfessors: async () => undefined,
    ...overrides,
  };
}

describe("runCatalogIngestion", () => {
  it("keeps the published catalog when the session expires during route lookup", async () => {
    const publishCatalog = jest.fn<CatalogIngestionDependencies["publishCatalog"]>();
    const completeRun = jest.fn<CatalogIngestionDependencies["completeRun"]>();
    const failRun = jest.fn<CatalogIngestionDependencies["failRun"]>();
    const sessionCookie = "planner_session=expired-secret";

    await expect(runCatalogIngestion(
      { professorMode: "never", requestedTerm: "FA26", trigger: "schedule" },
      dependencies({
        publishCatalog,
        completeRun,
        failRun,
        ingest: (term) => ingestCatalog(term, {
          scrapeClassPlanner: (requestedTerm) => scrapeClassPlanner(requestedTerm, {
            sessionCookie,
            fetch: async (url) => url.includes("/catalog/courses?")
              ? Response.json({
                total: 1, offset: 0, limit: 48, courses: [classPlannerCourse(101)],
              })
              : new Response(null, { status: 401 }),
          }),
        }),
      }),
    )).rejects.toThrow("Set or refresh CLASS_PLANNER_SESSION_COOKIE");

    expect(publishCatalog).not.toHaveBeenCalled();
    expect(completeRun).not.toHaveBeenCalled();
    expect(failRun).toHaveBeenCalledWith(expect.objectContaining({
      catalogPublished: false,
      error: expect.stringContaining("Set or refresh CLASS_PLANNER_SESSION_COOKIE"),
    }));
    expect(JSON.stringify(failRun.mock.calls)).not.toContain(sessionCookie);
  });

  it("publishes the catalog before starting professor enrichment", async () => {
    const calls: string[] = [];
    const result = await runCatalogIngestion(
      {
        professorMode: "always",
        trigger: "workflow_dispatch",
      },
      dependencies({
        enrichProfessors: async () => {
          calls.push("professors");
          return dependencies().enrichProfessors(courses);
        },
        publishCatalog: async () => {
          calls.push("catalog");
        },
      }),
    );

    expect(calls).toEqual(["catalog", "professors"]);
    expect(result.catalogPublished).toBe(true);
  });

  it("enriches every instructor displayed by offerings and sections", async () => {
    const enrichProfessors = jest.fn<CatalogIngestionDependencies["enrichProfessors"]>(
      async (_courses, options) => {
        expect(options?.additionalInstructorNames).toEqual([
          "Ada Lovelace",
          "Grace Hopper",
          "Barbara Liskov",
        ]);
        return dependencies().enrichProfessors(courses);
      },
    );
    const displayedInstructorCatalog: ClassPlannerCatalogSnapshot = {
      ...catalog,
      offerings: [{
        source_key: "CSE-293",
        instructors: ["Ada Lovelace", "Grace Hopper"],
      }] as unknown as ClassPlannerCatalogSnapshot["offerings"],
      sections: [{
        instructors: ["Barbara Liskov", "Grace Hopper"],
      }] as unknown as ClassPlannerCatalogSnapshot["sections"],
    };

    await runCatalogIngestion(
      { professorMode: "always", trigger: "workflow_dispatch" },
      dependencies({
        enrichProfessors,
        ingest: async () => ({
          catalog: displayedInstructorCatalog,
          courses,
          term: "FA26",
        }),
      }),
    );

    expect(enrichProfessors).toHaveBeenCalledTimes(1);
  });

  it("completes with warnings after a partial professor failure", async () => {
    const completeRun = jest.fn<CatalogIngestionDependencies["completeRun"]>();
    const failRun = jest.fn<CatalogIngestionDependencies["failRun"]>();

    await runCatalogIngestion(
      { professorMode: "always", trigger: "schedule" },
      dependencies({
        completeRun,
        enrichProfessors: async () => ({
          counts: {
            failed: 1,
            matched: 1,
            requested: 2,
            successfulRequests: 1,
            unmatched: 0,
          },
          courses,
          professors: [],
          unmatchedNameKeys: [],
          warnings: ["grace hopper: request failed"],
        }),
        failRun,
      }),
    );

    expect(completeRun).toHaveBeenCalledWith(expect.objectContaining({
      catalogPublished: true,
      warnings: ["grace hopper: request failed"],
    }));
    expect(failRun).not.toHaveBeenCalled();
  });

  it("records a failed run without rolling back a published catalog", async () => {
    const failRun = jest.fn<CatalogIngestionDependencies["failRun"]>();
    const error = new ProfessorEnrichmentUnavailableError(
      "school lookup failed",
      {
        failed: 0,
        matched: 0,
        requested: 1,
        successfulRequests: 0,
        unmatched: 0,
      },
    );

    await expect(runCatalogIngestion(
      { professorMode: "always", trigger: "schedule" },
      dependencies({
        enrichProfessors: async () => { throw error; },
        failRun,
      }),
    )).rejects.toThrow("school lookup failed");

    expect(failRun).toHaveBeenCalledWith(expect.objectContaining({
      catalogPublished: true,
      error: "school lookup failed",
    }));
  });
});

describe("resolveProfessorRefresh", () => {
  it("runs automatically on Sunday in Central time", async () => {
    const shouldRetry = jest.fn(async () => false);

    await expect(resolveProfessorRefresh(
      "auto",
      new Date("2026-08-23T08:17:00Z"),
      shouldRetry,
    )).resolves.toBe(true);
    expect(shouldRetry).not.toHaveBeenCalled();
  });

  it("runs automatically after the previous professor phase warned or failed", async () => {
    await expect(resolveProfessorRefresh(
      "auto",
      new Date("2026-08-24T08:17:00Z"),
      async () => true,
    )).resolves.toBe(true);
  });
});
