import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import express from "express";
import pg from "pg";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "@jest/globals";
import { createPollSeatsHandler } from "../../src/controllers/pollSeats.js";
import { pollOpenSeats } from "../../src/ingestion/seatPoll.js";
import { scrapeClassPlanner, type ClassPlannerFetch } from "../../src/ingestion/scrapeClassPlanner.js";
import type { SeatApplyResult, SeatPollClaim } from "../../src/models/SeatUpdate.js";
import { classPlannerCourse } from "../ingestion/classPlannerFixtures.js";

const adminUrl = process.env.SEAT_POLL_ADMIN_URL ?? "postgres://postgres:postgres@127.0.0.1:5432/postgres";
const databaseName = "tritonschedule_seat_test";
const keptAt = "2020-01-01T00:00:00.000Z";

type SectionSnapshot = {
  seats_available: number | null;
  enrolled: number | null;
  status: string | null;
  seats_updated_at: Date | null;
  instructors: string[];
};

type OfferingSnapshot = {
  open_seat_count: number;
  open_section_count: number;
  waitlist_available_count: number;
  seats_updated_at: Date | null;
  course_title: string | null;
};

let client: pg.Client;

function databaseUrl(name: string): string {
  const url = new URL(adminUrl);
  url.pathname = `/${name}`;
  return url.toString();
}

async function withAdmin<T>(run: (admin: pg.Client) => Promise<T>): Promise<T> {
  const admin = new pg.Client({ connectionString: adminUrl });
  await admin.connect();
  try {
    return await run(admin);
  } finally {
    await admin.end();
  }
}

function sectionPayload(
  sectionId: string,
  seats: number,
  enrolled: number,
  overrides: Record<string, unknown> = {},
) {
  return {
    section_id: sectionId,
    capacity: 100,
    enrolled,
    seats_available: seats,
    waitlist_capacity: null,
    waitlist_enrolled: 0,
    waitlist_available: null,
    status: "AC",
    ...overrides,
  };
}

function offeringPayload(sectionId: string, openSeatCount: number) {
  return {
    section_ids: [sectionId],
    open_section_count: openSeatCount > 0 ? 1 : 0,
    open_seat_count: openSeatCount,
    waitlist_available_count: 0,
  };
}

async function claim(runId: string = randomUUID()): Promise<{ id: string; claim: SeatPollClaim }> {
  const result = await client.query<{ claim: SeatPollClaim }>(
    "select public.claim_seat_poll_run($1::uuid, 'cron') as claim",
    [runId],
  );
  return { id: runId, claim: result.rows[0]!.claim };
}

async function apply(
  runId: string,
  sections: readonly object[],
  offerings: readonly object[],
  term = "FA26",
): Promise<SeatApplyResult> {
  const result = await client.query<{ result: SeatApplyResult }>(
    "select public.apply_seat_updates($1::uuid, $2, $3::jsonb, $4::jsonb) as result",
    [runId, term, JSON.stringify(sections), JSON.stringify(offerings)],
  );
  return result.rows[0]!.result;
}

async function section(sectionId: string): Promise<SectionSnapshot> {
  const result = await client.query<SectionSnapshot>(
    `select seats_available, enrolled, status, seats_updated_at, instructors
     from public.class_planner_sections
     where term_code = 'FA26' and section_id = $1`,
    [sectionId],
  );
  return result.rows[0]!;
}

async function offering(sourceKey: string): Promise<OfferingSnapshot> {
  const result = await client.query<OfferingSnapshot>(
    `select open_seat_count, open_section_count, waitlist_available_count,
            seats_updated_at, course_title
     from public.class_planner_course_offerings
     where source_key = $1`,
    [sourceKey],
  );
  return result.rows[0]!;
}

describe("apply_seat_updates", () => {
  beforeAll(async () => {
    await withAdmin(async (admin) => {
      await admin.query(`
        do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
        do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
        do $$ begin create role service_role nologin; exception when duplicate_object then null; end $$;
      `);
      await admin.query(
        "select pg_terminate_backend(pid) from pg_stat_activity where datname = $1 and pid <> pg_backend_pid()",
        [databaseName],
      );
      await admin.query(`drop database if exists ${databaseName} with (force)`);
      await admin.query(`create database ${databaseName}`);
    });

    const setup = new pg.Client({ connectionString: databaseUrl(databaseName) });
    await setup.connect();
    const migrationDir = path.resolve(process.cwd(), "../supabase/migrations");
    const files = (await readdir(migrationDir)).filter((file) => file.endsWith(".sql")).sort();
    for (const file of files) {
      await setup.query(await readFile(path.join(migrationDir, file), "utf8"));
    }
    await setup.end();

    client = new pg.Client({ connectionString: databaseUrl(databaseName) });
    await client.connect();
  }, 120_000);

  afterAll(async () => {
    await client?.end();
    await withAdmin(async (admin) => {
      await admin.query(`drop database if exists ${databaseName} with (force)`);
    });
  });

  beforeEach(async () => {
    await client.query(`
      truncate table
        public.class_planner_sections,
        public.class_planner_course_offerings,
        public.terms,
        private.catalog_ingestion_runs
      restart identity cascade
    `);
    await client.query(`
      insert into public.terms (term, is_active) values ('FA26', true);
      insert into public.class_planner_course_offerings (
        term_code, source_key, subject_code, course_code, module_code, module_name,
        course_title, section_count, open_section_count, open_seat_count,
        waitlist_available_count, matching_section_count
      ) values
        ('FA26', 'offering-a', 'CSE', '11', 'CSE-11', 'Changed', 'Changed title', 1, 1, 10, 0, 1),
        ('FA26', 'offering-b', 'CSE', '12', 'CSE-12', 'Unchanged', 'Keep title', 1, 1, 7, 0, 1);
    `);
    await client.query(`
      insert into public.class_planner_sections (
        offering_id, term_code, section_id, section_ref, section_code,
        instruction_type_name, capacity, enrolled, seats_available,
        waitlist_enrolled, status, instructors
      )
      select id, 'FA26', 'section-a', 'FA26:section-a', 'A01', 'lecture', 100, 90, 10, 0, 'AC', array['Ada Lovelace']
      from public.class_planner_course_offerings where source_key = 'offering-a'
    `);
    await client.query(`
      insert into public.class_planner_sections (
        offering_id, term_code, section_id, section_ref, section_code,
        instruction_type_name, capacity, enrolled, seats_available,
        waitlist_enrolled, status, instructors, seats_updated_at
      )
      select id, 'FA26', 'section-b', 'FA26:section-b', 'B01', 'lecture', 100, 93, 7, 0, 'AC', array['Grace Hopper'], $1::timestamptz
      from public.class_planner_course_offerings where source_key = 'offering-b'
    `, [keptAt]);
    await client.query(`
      update public.class_planner_course_offerings
      set seats_updated_at = $1::timestamptz
      where source_key = 'offering-b'
    `, [keptAt]);
  });

  it("updates a changed seat, leaves an unchanged row alone, and counts unknown sections", async () => {
    const { id } = await claim();
    const before = await section("section-b");

    const sections = [
      sectionPayload("section-a", 4, 96),
      sectionPayload("section-b", 7, 93),
      sectionPayload("section-missing", 1, 1),
    ];
    const offerings = [
      offeringPayload("section-a", 4),
      offeringPayload("section-b", 7),
      offeringPayload("section-missing", 1),
    ];
    const result = await apply(id, sections, offerings);

    expect(result).toMatchObject({
      applied: true,
      changed: 1,
      unchanged: 1,
      unknown: 1,
      offeringsUpdated: 1,
    });

    const changed = await section("section-a");
    const unchanged = await section("section-b");
    const changedOffering = await offering("offering-a");
    const unchangedOffering = await offering("offering-b");

    expect(changed.seats_available).toBe(4);
    expect(changed.enrolled).toBe(96);
    expect(changed.seats_updated_at).not.toBeNull();
    expect(changed.instructors).toEqual(["Ada Lovelace"]);
    expect(unchanged).toEqual(before);
    expect(unchanged.seats_updated_at?.toISOString()).toBe(keptAt);
    expect(changedOffering.open_seat_count).toBe(4);
    expect(changedOffering.seats_updated_at).not.toBeNull();
    expect(changedOffering.course_title).toBe("Changed title");
    expect(unchangedOffering.open_seat_count).toBe(7);
    expect(unchangedOffering.seats_updated_at?.toISOString()).toBe(keptAt);
    expect(unchangedOffering.course_title).toBe("Keep title");

    const again = await apply((await claim()).id, sections, offerings);
    const afterRepeat = await section("section-a");

    expect(again).toMatchObject({ applied: true, changed: 0, unchanged: 2, unknown: 1 });
    expect(afterRepeat.seats_updated_at?.toISOString()).toBe(changed.seats_updated_at?.toISOString());
  });

  it("writes no seat rows when the payload is invalid", async () => {
    const { id } = await claim();
    const beforeChanged = await section("section-a");
    const beforeUnchanged = await section("section-b");

    await expect(apply(id, [
      sectionPayload("section-a", 4, 96),
      sectionPayload("section-b", -1, 93),
    ], [
      offeringPayload("section-a", 4),
      offeringPayload("section-b", 7),
    ])).rejects.toThrow("seat update payload contains invalid seat values");

    expect(await section("section-a")).toEqual(beforeChanged);
    expect(await section("section-b")).toEqual(beforeUnchanged);
    const run = await client.query<{ status: string }>(
      "select status from private.catalog_ingestion_runs where id = $1",
      [id],
    );
    expect(run.rows[0]?.status).toBe("running");
  });

  it("writes no seat rows when duplicate section ids are supplied", async () => {
    const { id } = await claim();
    const before = await section("section-a");

    await expect(apply(id, [
      sectionPayload("section-a", 4, 96),
      sectionPayload("section-a", 3, 97),
    ], [offeringPayload("section-a", 4)])).rejects.toThrow("duplicate section ids");

    expect(await section("section-a")).toEqual(before);
  });

  it("writes no seat rows when the catalog replace lock is held", async () => {
    const { id } = await claim();
    const lock = new pg.Client({ connectionString: databaseUrl(databaseName) });
    await lock.connect();
    try {
      await lock.query("select pg_advisory_lock(741632871003)");
      const result = await apply(id, [sectionPayload("section-a", 4, 96)], [offeringPayload("section-a", 4)]);
      expect(result).toMatchObject({ applied: false, reason: "locked", changed: 0 });
      expect((await section("section-a")).seats_available).toBe(10);
      expect((await section("section-a")).seats_updated_at).toBeNull();
    } finally {
      await lock.query("select pg_advisory_unlock(741632871003)");
      await lock.end();
    }
  });

  it("lets a nightly run start while a seat poll is active, and skips an overlapping poll", async () => {
    const nightlyId = randomUUID();
    await client.query(
      "select public.begin_catalog_ingestion_run($1::uuid, 'schedule', 'FA26', null, false)",
      [nightlyId],
    );
    const blocked = await claim();
    expect(blocked.claim).toEqual({ status: "skipped", reason: "nightly" });
    await expect(client.query(
      "select public.begin_catalog_ingestion_run($1::uuid, 'schedule', 'FA26', null, false)",
      [randomUUID()],
    )).rejects.toThrow("another catalog ingestion run is already active");

    await client.query(
      "update private.catalog_ingestion_runs set status = 'succeeded', completed_at = now() where id = $1",
      [nightlyId],
    );
    const started = await claim();
    expect(started.claim).toEqual({ status: "started" });

    const duringPoll = randomUUID();
    await client.query(
      "select public.begin_catalog_ingestion_run($1::uuid, 'schedule', 'FA26', null, false)",
      [duringPoll],
    );
    const kinds = await client.query<{ kind: string }>(
      "select kind from private.catalog_ingestion_runs where id = any($1::uuid[]) order by kind",
      [[started.id, duringPoll]],
    );
    expect(kinds.rows.map((row) => row.kind)).toEqual(["nightly", "seats"]);

    await client.query(
      "update private.catalog_ingestion_runs set status = 'succeeded', completed_at = now() where id = $1",
      [duringPoll],
    );
    const overlap = await claim();
    expect(overlap.claim).toEqual({ status: "skipped", reason: "poll" });
  });

  it("updates a changed seat through the poll route and leaves the unchanged row untouched", async () => {
    process.env.CRON_SECRET = "cron-secret";
    const changedCourse = classPlannerCourse(1, {
      open_seat_count: 4,
      sections: [{
        ...classPlannerCourse().sections[0]!,
        section_id: "section-a",
        section_ref: "FA26:section-a",
        seats_available: 4,
        enrolled: 96,
      }],
    });
    const unchangedCourse = classPlannerCourse(2, {
      module_code: "CSE-12",
      open_seat_count: 7,
      sections: [{
        ...classPlannerCourse(2).sections[0]!,
        section_id: "section-b",
        section_ref: "FA26:section-b",
        seats_available: 7,
        enrolled: 93,
      }],
    });
    const unknownCourse = classPlannerCourse(3, {
      sections: [{
        ...classPlannerCourse(3).sections[0]!,
        section_id: "section-missing",
      }],
    });
    const courses = [changedCourse, unchangedCourse, unknownCourse];
    const fetcher: ClassPlannerFetch = async (_input, init) => {
      const body = JSON.parse(String(init?.body)) as { offset: number };
      return Response.json({
        term_code: "FA26",
        total: courses.length,
        offset: body.offset,
        limit: 48,
        courses,
      });
    };
    const before = await section("section-b");
    const app = express();
    app.use("/api/seats", express.Router().get("/poll", createPollSeatsHandler(() => pollOpenSeats({
      claimRun: async (id) => (await claim(id)).claim,
      activeTerm: async () => "FA26",
      scrape: (term) => scrapeClassPlanner(term, { fetch: fetcher }),
      apply: (runId, term, update) => apply(runId, [...update.sections], [...update.offerings], term),
      failRun: async () => {
        throw new Error("seat poll should have applied");
      },
    }))));

    const response = await request(app)
      .get("/api/seats/poll")
      .set("Authorization", "Bearer cron-secret")
      .expect(200);

    expect(response.body).toMatchObject({
      status: "updated",
      term: "FA26",
      changed: 1,
      unchanged: 1,
      unknown: 1,
      offeringsUpdated: 1,
    });
    expect((await section("section-a")).seats_available).toBe(4);
    expect((await section("section-a")).seats_updated_at).not.toBeNull();
    expect(await section("section-b")).toEqual(before);

    await request(app)
      .get("/api/seats/poll")
      .set("Authorization", "Bearer wrong")
      .expect(401);
    expect((await section("section-a")).seats_available).toBe(4);
  });

  it("writes no seat rows when the scrape fails", async () => {
    process.env.CRON_SECRET = "cron-secret";
    const before = await section("section-a");
    const fetcher: ClassPlannerFetch = async () => new Response(null, { status: 500, statusText: "nope" });
    const app = express();
    app.use("/api/seats", express.Router().get("/poll", createPollSeatsHandler(() => pollOpenSeats({
      claimRun: async (id) => (await claim(id)).claim,
      activeTerm: async () => "FA26",
      scrape: (term) => scrapeClassPlanner(term, { fetch: fetcher }),
      apply: async () => {
        throw new Error("apply should not run after a failed scrape");
      },
      failRun: async ({ id, error }) => {
        await client.query(
          "select public.fail_catalog_ingestion_run($1::uuid, 'FA26', false, '{}'::jsonb, '{}'::jsonb, '{}'::text[], $2)",
          [id, error],
        );
      },
    }))));

    await request(app)
      .get("/api/seats/poll")
      .set("Authorization", "Bearer cron-secret")
      .expect(500);

    expect(await section("section-a")).toEqual(before);
    const run = await client.query<{ status: string; error_message: string }>(
      "select status, error_message from private.catalog_ingestion_runs where kind = 'seats' order by started_at desc limit 1",
    );
    expect(run.rows[0]?.status).toBe("failed");
    expect(run.rows[0]?.error_message).toContain("Class Planner request failed");
  });
});
