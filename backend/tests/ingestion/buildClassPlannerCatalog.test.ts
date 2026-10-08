import { describe, expect, it } from "@jest/globals";
import {
  buildClassPlannerCatalog,
  buildLegacyCourses,
  classPlannerSourceKey,
} from "../../src/ingestion/buildClassPlannerCatalog.js";
import { classMeeting, classPlannerCourse } from "./classPlannerFixtures.js";

describe("buildClassPlannerCatalog", () => {
  it("normalizes packages, memberships, meetings, and TSS URLs", () => {
    const course = classPlannerCourse(10, {
      sections: [
        {
          ...classPlannerCourse(10).sections[0]!,
          event_package_ids: ["150888", "150889"],
          meetings: [classMeeting, { ...classMeeting, day_code: "R", day_name: "Thursday" }],
        },
        {
          ...classPlannerCourse(11).sections[0]!,
          event_package_ids: ["150888"],
          instruction_type_name: "discussion",
          section_code: "001-001-DI",
        },
      ],
    });
    const sourceKey = classPlannerSourceKey(course);
    const catalog = buildClassPlannerCatalog("FA26", [course], [
      {
        source_key: sourceKey,
        module_id: "4",
        representative_event_package_id: "150888",
        tss_url:
          "https://tss.ucsd.edu/fiori#ZUSModule-display?TileType=MYMOD&" +
          "/Detail/EventPackage/SM/4/00000000/0/0/0/" +
          "00000000-0000-0000-0000-000000000000/150888/2026/2/?",
      },
    ]);

    expect(catalog.offerings).toHaveLength(1);
    expect(catalog.sections).toHaveLength(2);
    expect(catalog.meetings).toHaveLength(3);
    expect(catalog.event_packages).toHaveLength(2);
    expect(catalog.package_sections).toHaveLength(3);
    expect(catalog.event_packages).toContainEqual(
      expect.objectContaining({
        event_package_id: "150889",
        tss_booking_url: expect.stringContaining("/150889/2026/2/?"),
      }),
    );
    expect(catalog.module_routes[0]).toMatchObject({
      route_kind: "event_package",
      academic_year: "2026",
      academic_period: "2",
    });
  });

  describe("meeting times", () => {
    function buildMeeting(meeting: typeof classMeeting) {
      const course = classPlannerCourse(10);
      const section = course.sections[0]!;
      const catalog = buildClassPlannerCatalog("FA26", [{
        ...course,
        sections: [{ ...section, meetings: [classMeeting, meeting] }],
      }], [{
        source_key: classPlannerSourceKey(course),
        module_id: "4",
        representative_event_package_id: null,
        tss_url: "https://tss.ucsd.edu/module/4",
      }]);

      expect(catalog.meetings[0]).toEqual({
        ...classMeeting,
        term_code: "FA26",
        section_id: section.section_id,
        meeting_ordinal: 0,
      });
      return catalog.meetings[1];
    }

    it.each(["class", "midterm", "final"])(
      "normalizes the TBA midnight placeholder for %s without losing metadata",
      (meetingKind) => {
        const meeting = Object.freeze({
          ...classMeeting,
          meeting_kind: meetingKind,
          specific_date: "2026-12-08",
          start_minutes: 0,
          end_minutes: 0,
          start_time_display: "12:00am",
          end_time_display: "12:00am",
          is_remote: true,
          is_tba: true,
        });

        expect(buildMeeting(meeting)).toEqual({
          ...meeting,
          start_minutes: null,
          end_minutes: null,
          start_time_display: null,
          end_time_display: null,
          term_code: "FA26",
          section_id: "E 00000010",
          meeting_ordinal: 1,
        });
        expect(meeting.start_minutes).toBe(0);
        expect(meeting.start_time_display).toBe("12:00am");
      },
    );

    it.each([
      ["already-null TBA", {
        is_tba: true,
        start_minutes: null,
        end_minutes: null,
        start_time_display: null,
        end_time_display: null,
      }],
      ["normal scheduled interval", {}],
      ["valid interval with TBA metadata", { is_tba: true }],
      ["valid midnight start", { start_minutes: 0, start_time_display: "12:00am" }],
      ["valid midnight start with TBA metadata", {
        is_tba: true, start_minutes: 0, start_time_display: "12:00am",
      }],
      ["non-TBA midnight zero-length interval", { start_minutes: 0, end_minutes: 0 }],
      ["non-TBA equal times", { end_minutes: classMeeting.start_minutes }],
      ["non-TBA reversed times", { end_minutes: 900 }],
      ["TBA non-placeholder equal times", { is_tba: true, end_minutes: classMeeting.start_minutes }],
      ["TBA reversed times", { is_tba: true, end_minutes: 900 }],
    ])("preserves %s for existing database validation", (_label, overrides) => {
      const meeting = { ...classMeeting, ...overrides };
      expect(buildMeeting(meeting)).toEqual({
        ...meeting,
        term_code: "FA26",
        section_id: "E 00000010",
        meeting_ordinal: 1,
      });
    });
  });

  it("keeps a module fallback and does not invent package deep links", () => {
    const course = classPlannerCourse(290);
    const sourceKey = classPlannerSourceKey(course);
    const catalog = buildClassPlannerCatalog("FA26", [course], [
      {
        source_key: sourceKey,
        module_id: "9876",
        representative_event_package_id: null,
        tss_url:
          "https://tss.ucsd.edu/fiori#YSchedule-view&/" +
          "YUCSD_CON_MODULE(AcademicYear='2026',AcademicPeriod='2',ModuleID='9876')" +
          "?layout=MidColumnFullScreen",
      },
    ]);

    expect(catalog.module_routes[0]?.route_kind).toBe("module");
    expect(catalog.event_packages[0]?.tss_booking_url).toBeNull();
  });
});

describe("buildLegacyCourses", () => {
  it("preserves the existing course search shape", () => {
    const result = buildLegacyCourses("FA26", [classPlannerCourse(100)]);

    expect(result[0]).toMatchObject({
      Name: "CSE 100: Course 100",
      Teacher: "Ada Lovelace",
      Lecture: {
        Days: "Tue",
        Time: "5:00pm-6:20pm",
        Location: "CENTR 101",
        SectionId: "E 00000100",
        SectionRef: "FA26:E 00000100",
        SectionCode: "001-000-LE",
        EventPackageIds: ["1500000100"],
      },
      nameKey: "ada lovelace",
    });
  });

  it("treats abbreviated seminar sections as primary sections", () => {
    const seminar = classPlannerCourse(101, {
      sections: [{
        ...classPlannerCourse(101).sections[0]!,
        instruction_type_name: "se",
        section_code: "001-000-SE",
      }],
    });

    const [result] = buildLegacyCourses("FA26", [seminar]);

    expect(result?.Lecture).toMatchObject({
      SectionCode: "001-000-SE",
      EventPackageIds: ["1500000101"],
    });
  });
});
