import { randomUUID } from "node:crypto";
import type { ClassPlannerCourse } from "../models/ClassPlannerCatalog.js";
import type {
  SeatApplyResult,
  SeatPollClaim,
  SeatUpdateBatch,
} from "../models/SeatUpdate.js";
import {
  applySeatUpdates,
  claimSeatPollRun,
  failCatalogIngestionRun,
  getActiveTermRow,
} from "../services/supabaseRepository.js";
import { scrapeClassPlanner } from "./scrapeClassPlanner.js";

export type SeatPollResult = Readonly<{
  status: "updated" | "skipped" | "failed";
  term?: string;
  changed?: number;
  unchanged?: number;
  unknown?: number;
  offeringsUpdated?: number;
  reason?: string;
}>;

export type SeatPollDependencies = Readonly<{
  claimRun: (id: string) => Promise<SeatPollClaim>;
  activeTerm: () => Promise<string | null>;
  scrape: (term: string) => Promise<{ term: string; courses: readonly ClassPlannerCourse[] }>;
  apply: (runId: string, term: string, update: SeatUpdateBatch) => Promise<SeatApplyResult>;
  failRun: (input: { id: string; term?: string; error: string }) => Promise<void>;
}>;

const productionDependencies: SeatPollDependencies = {
  claimRun: claimSeatPollRun,
  activeTerm: async () => {
    const term = await getActiveTermRow();
    const value = term?.Term.trim() ?? "";
    return value.length > 0 ? value : null;
  },
  scrape: (term) => scrapeClassPlanner(term),
  apply: applySeatUpdates,
  failRun: async ({ id, term, error }) => {
    await failCatalogIngestionRun({
      catalogCounts: {},
      catalogPublished: false,
      error,
      id,
      professorCounts: {},
      resolvedTerm: term,
      warnings: [],
    });
  },
};

export function seatUpdatesFromCourses(
  courses: readonly ClassPlannerCourse[],
): SeatUpdateBatch {
  return {
    sections: courses.flatMap((course) => course.sections.map((section) => ({
      section_id: section.section_id,
      capacity: section.capacity,
      enrolled: section.enrolled,
      seats_available: section.seats_available,
      waitlist_capacity: section.waitlist_capacity,
      waitlist_enrolled: section.waitlist_enrolled,
      waitlist_available: section.waitlist_available,
      status: section.status,
    }))),
    offerings: courses.map((course) => ({
      section_ids: course.sections.map((section) => section.section_id),
      open_section_count: course.open_section_count,
      open_seat_count: course.open_seat_count,
      waitlist_available_count: course.waitlist_available_count,
    })),
  };
}

export async function pollOpenSeats(
  dependencies: SeatPollDependencies = productionDependencies,
): Promise<SeatPollResult> {
  const runId = randomUUID();
  const claim = await dependencies.claimRun(runId);

  if (claim.status === "skipped") {
    return {
      status: "skipped",
      reason: claim.reason ?? "overlap",
    };
  }

  let term: string | undefined;

  try {
    const activeTerm = await dependencies.activeTerm();
    if (!activeTerm) {
      await dependencies.failRun({ error: "no active term", id: runId });
      return { status: "skipped", reason: "no_active_term" };
    }

    term = activeTerm;
    const scraped = await dependencies.scrape(activeTerm);
    if (scraped.term !== activeTerm) {
      throw new Error(`Class Planner returned ${scraped.term} for requested term ${activeTerm}`);
    }

    const applied = await dependencies.apply(
      runId,
      activeTerm,
      seatUpdatesFromCourses(scraped.courses),
    );

    if (!applied.applied) {
      return {
        status: "skipped",
        reason: applied.reason ?? "locked",
        term: activeTerm,
      };
    }

    console.info(
      `Seat poll ${activeTerm}: changed ${applied.changed}, unchanged ${applied.unchanged}, unknown ${applied.unknown}`,
    );

    return {
      status: "updated",
      term: activeTerm,
      changed: applied.changed,
      unchanged: applied.unchanged,
      unknown: applied.unknown,
      offeringsUpdated: applied.offeringsUpdated,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    try {
      await dependencies.failRun({ error: message, id: runId, term });
    } catch (auditError) {
      console.error(
        "Failed to record seat poll failure:",
        auditError instanceof Error ? auditError.message : auditError,
      );
    }

    console.error("Seat poll failed:", message);
    return { status: "failed", term };
  }
}
