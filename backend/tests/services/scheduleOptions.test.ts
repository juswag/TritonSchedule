import { describe, expect, it } from "@jest/globals";
import { mapScheduleOffering, readAllPages, scheduleCourseKey, type OptionOffering, type OptionSection } from "../../src/services/scheduleOptions.js";
import type { ClassPlannerMeeting } from "../../src/models/ClassPlannerCatalog.js";

const meeting = (day = "M", start = 540): ClassPlannerMeeting => ({
  meeting_kind: "class", day_code: day, day_name: null, specific_date: null,
  start_minutes: start, end_minutes: start + 50, start_time_display: null,
  end_time_display: null, building_code: "CENTR", room_code: "CENTR 101",
  building_name: null, room_name: null, is_remote: false, is_tba: false,
});
const section = (id: number, type: string, packages: string[], meetings = [meeting()]): OptionSection => ({
  id, section_ref: `FA26:${id}`, section_code: `A${id}`, instruction_type_name: type,
  instructors: ["Example Instructor"], packages, meetings,
});
const offering = (sections: OptionSection[]): OptionOffering => ({
  id: 1, term_code: "FA26", source_key: "CSE-101:1,2,3", subject_code: "CSE",
  course_code: "101", module_name: "Algorithms", section_count: sections.length, sections,
});

describe("structured schedule options", () => {
  it("preserves every meeting and only pairs sections that share a package", () => {
    const course = mapScheduleOffering(offering([
      section(1, "LE", ["one", "two"], [meeting("M"), meeting("W")]),
      section(2, "DI", ["one"], [meeting("T", 600)]),
      section(3, "DI", ["two"], [meeting("R", 600)]),
    ]));
    expect(course.options).toHaveLength(2);
    expect(course.options.map(option => option.sections.map(item => item.id))).toEqual([
      ["FA26:1", "FA26:2"], ["FA26:1", "FA26:3"],
    ]);
    expect(course.options[0]!.meetings.map(item => item.day)).toEqual([0, 2, 1]);
    expect(course.issues).toEqual([]);
  });

  it("returns exams only for sections in each generated option", () => {
    const exam = { ...meeting(), meeting_kind: "final", specific_date: "2026-12-09", start_time_display: "8:00am", end_time_display: "10:00am" };
    const course = mapScheduleOffering(offering([
      section(1, "Lecture", ["morning"], [meeting(), exam]),
      section(2, "Lecture", ["afternoon"], [meeting("T")]),
    ]));
    expect(course.options[0]?.exams).toEqual([expect.objectContaining({ type: "final", time: "2026-12-09 8:00am-10:00am", location: "CENTR 101" })]);
    expect(course.options[1]?.exams).toEqual([]);
  });

  it("keeps all meetings of a lab and puts the primary section first", () => {
    const result = mapScheduleOffering(offering([
      section(9, "Lecture", ["one"]),
      section(1, "Lab", ["one"], [meeting("T", 600), meeting("R", 780)]),
    ]));
    expect(result.options[0]!.sections[0]!.id).toBe("FA26:9");
    expect(result.options[0]!.meetings).toHaveLength(3);
  });

  it("deduplicates packages with identical section memberships", () => {
    expect(mapScheduleOffering(offering([
      section(1, "LE", ["one", "duplicate"]),
      section(2, "DI", ["one", "duplicate"], [meeting("T")]),
    ])).options).toHaveLength(1);
  });

  it.each([
    { is_tba: true }, { start_minutes: null }, { end_minutes: 500 },
    { specific_date: "2026-11-10" }, { day_code: "?" },
  ])("does not turn an unknown or unsupported meeting into free time: %j", patch => {
    const result = mapScheduleOffering(offering([section(1, "LE", ["one"], [{ ...meeting(), ...patch }])]));
    expect(result.options).toEqual([]);
    expect(result.issues.join(" ")).toMatch(/unknown or non-weekly/);
  });

  it("does not lose weekday meetings when a section also meets on the weekend", () => {
    const result = mapScheduleOffering(offering([section(1, "LE", ["one"], [meeting(), meeting("S")])]));
    expect(result.options[0]!.meetings.map(item => item.day)).toEqual([0, 5]);
  });

  it("flags incomplete packages instead of dropping the required discussion", () => {
    const result = mapScheduleOffering(offering([
      section(1, "LE", ["one"]), section(2, "DI", ["unrelated"], [meeting("T")]),
    ]));
    expect(result.options).toEqual([]);
    expect(result.issues.length).toBeGreaterThan(0);
  });

  it("allows independent lecture-only choices without package data", () => {
    const result = mapScheduleOffering(offering([section(1, "LE", []), section(2, "SE", [], [meeting("T")])]));
    expect(result.options).toHaveLength(2);
  });

  it("does not infer missing lecture/discussion links", () => {
    const result = mapScheduleOffering(offering([section(1, "LE", []), section(2, "DI", [], [meeting("T")])]));
    expect(result.options).toEqual([]);
    expect(result.issues.join(" ")).toMatch(/pairing/);
  });

  it("rejects incomplete section downloads and self-conflicting bundles", () => {
    const data = offering([section(1, "LE", ["one"]), section(2, "DI", ["one"])]);
    expect(mapScheduleOffering(data).options).toEqual([]);
    expect(mapScheduleOffering({ ...data, section_count: 3 }).issues).toEqual(["The catalog does not contain all sections for this course."]);
  });

  it("keeps topic/offerings distinct even when their course codes are identical", () => {
    expect(scheduleCourseKey("FA26", "CSE-190:1")).not.toBe(scheduleCourseKey("FA26", "CSE-190:2"));
  });
});

describe("complete pagination", () => {
  it("continues after a server-imposed short page until exact count is reached", async () => {
    const all = [1, 2, 3, 4, 5];
    expect(await readAllPages<number>(async from => ({ data: all.slice(from, from + 2), count: 5, error: null }))).toEqual(all);
  });
  it("rejects a catalog count change between pages", async () => {
    await expect(readAllPages(async from => ({ data: [from], count: from ? 3 : 2, error: null }))).rejects.toThrow(/changed/);
  });
  it("rejects an exhausted response instead of claiming all options were loaded", async () => {
    await expect(readAllPages(async () => ({ data: [], count: 3, error: null }))).rejects.toThrow(/incomplete/);
  });
});
