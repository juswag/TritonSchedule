import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import express from "express";
import request from "supertest";

type Row = Record<string, unknown>;
let tables: Record<string, Row[]>;
let markerReads: number;
let changeSnapshot: boolean;
const searchFilters: string[] = [];

// Model flat PostgREST reads with internal bigint foreign keys, not API section IDs.
const from = jest.fn((table: string) => {
  const filters: ((row: Row) => boolean)[] = [];
  let offset = 0;
  let end = Infinity;
  let limit = Infinity;
  let isMarker = false;
  const query = {
    select(columns: string, options?: unknown) { isMarker = table === "class_planner_course_offerings" && columns === "id" && !options; return query; },
    eq(column: string, value: unknown) { filters.push(row => row[column] === value); return query; },
    in(column: string, values: unknown[]) { filters.push(row => values.includes(row[column])); return query; },
    or(value: string) { searchFilters.push(value); return query; },
    order() { return query; },
    range(start: number, stop: number) { offset = start; end = stop; return query; },
    limit(value: number) { limit = value; return query; },
    then(resolve: (result: unknown) => void) {
      if (isMarker) {
        markerReads++;
        resolve({ data: [{ id: changeSnapshot && markerReads > 1 ? 11 : 10 }], error: null });
      } else {
        const rows = (tables[table] ?? []).filter(row => filters.every(filter => filter(row)));
        resolve({ data: rows.slice(offset, Math.min(end + 1, offset + limit)), count: rows.length, error: null });
      }
    },
  };
  return query;
});

jest.unstable_mockModule("../../src/services/connectToDB.js", () => ({ connectToDB: () => ({ from }) }));
jest.unstable_mockModule("../../src/services/supabaseRepository.js", () => ({ getActiveTermRow: async () => ({ Term: "FA26" }) }));
const { getScheduleOptions, scheduleCourseKey } = await import("../../src/services/scheduleOptions.js");
const { getCourseOptions } = await import("../../src/controllers/getCourseOptions.js");
const app = express();
app.use(express.json());
app.get("/course/options", getCourseOptions);
app.post("/course/options", getCourseOptions);

describe("schedule catalog reads", () => {
  beforeEach(() => {
    markerReads = 0; changeSnapshot = false; from.mockClear(); searchFilters.length = 0;
    tables = {
      class_planner_course_offerings: [{ id: 10, term_code: "FA26", source_key: "cse101:67890", subject_code: "CSE", course_code: "101", module_name: "Algorithms", section_count: 1 }],
      class_planner_sections: [{ id: 20, offering_id: 10, section_ref: "FA26:67890", section_code: "A00", instruction_type_name: "Lecture", instructors: ["Instructor"] }],
      tss_event_packages: [{ id: 30, offering_id: 10, event_package_id: "package-external-id" }],
      tss_event_package_sections: [{ event_package_id: 30, section_id: 20 }],
      class_planner_section_meetings: [{ id: 40, section_id: 20, meeting_kind: "class", day_code: "M", specific_date: null, start_minutes: 540, end_minutes: 590, is_tba: false, is_remote: false, room_code: "CENTR 101" }],
    };
  });

  it("joins internal IDs and returns public term-qualified section IDs", async () => {
    const key = scheduleCourseKey("FA26", "cse101:67890");
    const courses = await getScheduleOptions("FA26", "", [key]);
    expect(courses).toHaveLength(1);
    expect(courses[0]!.key).toBe(key);
    expect(courses[0]!.options[0]!.sections[0]!.id).toBe("FA26:67890");
    expect(courses[0]!.options[0]!.meetings[0]).toMatchObject({ sectionId: "FA26:67890", day: 0, start: 540, end: 590 });
    expect(markerReads).toBe(2);
  });

  it("fails when a selected offering is missing instead of returning fewer courses", async () => {
    await expect(getScheduleOptions("FA26", "", [scheduleCourseKey("FA26", "cse101:67890"), scheduleCourseKey("FA26", "missing")])).rejects.toThrow(/Remove it and search/);
  });

  it("does not mix catalogs across an atomic term refresh", async () => {
    changeSnapshot = true;
    await expect(getScheduleOptions("FA26", "CSE 101")).rejects.toThrow(/changed while loading/);
  });

  it("rejects stale term selections before reading the catalog", async () => {
    await expect(getScheduleOptions("FA26", "", [scheduleCourseKey("WI27", "cse101:67890")])).rejects.toThrow(/same term/);
    expect(from).not.toHaveBeenCalled();
  });

  it("normalizes compact codes and escapes filter operators in searches", async () => {
    await getScheduleOptions("FA26", "CSE101");
    expect(searchFilters[0]).toContain('module_code.ilike."%CSE%101%"');
    await getScheduleOptions("FA26", 'a,b"c');
    expect(searchFilters[1]).toContain('module_name.ilike."%a,b\\"c%"');
  });

  it("completes search, select, and fresh generation reads over HTTP", async () => {
    const search = await request(app).get("/course/options").query({ course: "CSE101" }).expect(200);
    const key = search.body.courses[0].key;
    const selected = await request(app).post("/course/options").send({ term: search.body.term, keys: [key] }).expect(200);
    expect(selected.body).toEqual(search.body);
    expect(selected.body.courses[0].options[0].meetings).toEqual([{ day: 0, start: 540, end: 590, type: "Lecture", sectionId: "FA26:67890", location: "CENTR 101" }]);

    tables.class_planner_course_offerings = [];
    const refreshed = await request(app).post("/course/options").send({ term: "FA26", keys: [key] }).expect(409);
    expect(refreshed.body.message).toMatch(/Remove it and search/);
  });
});
