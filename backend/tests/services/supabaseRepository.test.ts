import { describe, expect, it } from "@jest/globals";
import {
  exactSubjectCodeFromSearch,
  isExactProfessorMatch,
  mapOfferingToCourses,
} from "../../src/services/supabaseRepository.js";
import { classPlannerCourse } from "../ingestion/classPlannerFixtures.js";

const classMeeting = {
  meeting_ordinal: 0,
  meeting_kind: "class",
  day_code: "T",
  day_name: "Tuesday",
  specific_date: null,
  start_minutes: 1020,
  end_minutes: 1100,
  start_time_display: "5:00pm",
  end_time_display: "6:20pm",
  building_code: "CENTR",
  room_code: "CENTR 101",
  building_name: "Center Hall",
  room_name: "Room 101",
  is_remote: false,
  is_tba: false,
};

describe("mapOfferingToCourse", () => {
  it("keeps exams scoped to their primary section without leaking optional section exams", () => {
    const course = classPlannerCourse();
    const makeSection = (index: number, kind: string, examDates: string[]) => ({
      ...course.sections[0]!,
      id: index,
      section_ref: `FA26:E ${index}`,
      section_code: `${index}-000`,
      instruction_type_name: kind,
      tss_event_packages: [{ event_package_id: "shared-package", tss_booking_url: null }],
      class_planner_section_meetings: [
        classMeeting,
        ...examDates.map((date, ordinal) => ({
          ...classMeeting,
          meeting_ordinal: ordinal + 1,
          meeting_kind: ordinal === 0 ? "midterm" : "final",
          specific_date: date,
        })),
      ],
    });
    const offering = {
      ...course,
      id: 1,
      source_key: "test-offering",
      instructors_search: "Ada Lovelace",
      tss_module_routes: [],
      class_planner_sections: [
        makeSection(1, "lecture", ["2026-10-27", "2026-12-07"]),
        makeSection(2, "lecture", ["2026-10-28", "2026-12-08"]),
        makeSection(3, "lecture", []),
        makeSection(4, "discussion", ["2026-10-29", "2026-12-09"]),
        makeSection(5, "lab", ["2026-10-30", "2026-12-10"]),
      ],
    };

    const result = mapOfferingToCourses(offering);

    expect(result).toHaveLength(3);
    expect(result[0]?.Midterms).toEqual([
      { Days: "2026-10-27", Time: "5:00pm-6:20pm", Location: "CENTR 101" },
    ]);
    expect(result[0]?.Final?.Days).toBe("2026-12-07");
    expect(result[1]?.Midterms).toEqual([
      { Days: "2026-10-28", Time: "5:00pm-6:20pm", Location: "CENTR 101" },
    ]);
    expect(result[1]?.Final?.Days).toBe("2026-12-08");
    expect(result[2]?.Midterms).toEqual([]);
    expect(result[2]?.Final).toBeNull();
    expect(result[0]?.Discussions[0]?.Exams).toEqual([
      { Days: "2026-10-29", Time: "5:00pm-6:20pm", Location: "CENTR 101", Type: "midterm" },
      { Days: "2026-12-09", Time: "5:00pm-6:20pm", Location: "CENTR 101", Type: "final" },
    ]);
    expect(result[0]?.Labs[0]?.Exams).toEqual([
      { Days: "2026-10-30", Time: "5:00pm-6:20pm", Location: "CENTR 101", Type: "midterm" },
      { Days: "2026-12-10", Time: "5:00pm-6:20pm", Location: "CENTR 101", Type: "final" },
    ]);

    const [withoutPrimary] = mapOfferingToCourses({
      ...offering,
      class_planner_sections: [offering.class_planner_sections[3]!],
    });
    expect(withoutPrimary?.Midterms).toEqual([]);
    expect(withoutPrimary?.Final).toBeNull();
  });

  it("retains every primary final room in section exam metadata", () => {
    const course = classPlannerCourse();
    const [result] = mapOfferingToCourses({
      ...course,
      id: 1,
      source_key: "test-offering",
      instructors_search: "Ada Lovelace",
      tss_module_routes: [],
      class_planner_sections: [{
        ...course.sections[0]!,
        id: 1,
        tss_event_packages: [],
        class_planner_section_meetings: [classMeeting, ...["CENTR 101", "CENTR 115"].map((room, index) => ({
          ...classMeeting,
          meeting_ordinal: index + 1,
          meeting_kind: "final",
          specific_date: "2026-12-07",
          room_code: room,
        }))],
      }],
    });

    expect(result?.Lecture?.Exams).toEqual([
      { Days: "2026-12-07", Time: "5:00pm-6:20pm", Location: "CENTR 101", Type: "final" },
      { Days: "2026-12-07", Time: "5:00pm-6:20pm", Location: "CENTR 115", Type: "final" },
    ]);
  });

  it("maps every primary section and meeting group into the course API shape", () => {
    const offering = {
      id: 401,
      source_key: "CSE-100:E 00000001,E 00000002,E 00000003",
      instructors_search: "Ada Lovelace Grace Hopper",
      term_code: "FA26",
      subject_code: "CSE",
      course_code: "100",
      module_code: "CSE-100",
      module_name: "Advanced Data Structures",
      course_title: null,
      section_count: 2,
      open_section_count: 2,
      open_seat_count: 20,
      waitlist_available_count: 0,
      instruction_types: ["lecture", "discussion"],
      instructors: ["Ada Lovelace"],
      availability_refresh_pending: false,
      is_topic_course: false,
      section_family: null,
      subject_name: "Computer Science and Engineering",
      academic_level: "UD",
      matching_section_count: 2,
      units_display: "4 units",
      prerequisites: [],
      restrictions: [],
      metadata_source: "UC San Diego course catalog",
      tss_module_routes: {
        route_kind: "event_package",
        tss_url: "https://tss.ucsd.edu/fiori#representative",
      },
      class_planner_sections: [
        {
          id: 9001,
          section_id: "E 00000001",
          section_ref: "FA26:E 00000001",
          section_code: "001-000-LE",
          instruction_type_name: "lecture",
          capacity: 100,
          enrolled: 90,
          seats_available: 10,
          waitlist_capacity: null,
          waitlist_enrolled: 0,
          waitlist_available: null,
          status: "AC",
          instructors: ["Ada Lovelace"],
          tss_event_packages: [
            {
              event_package_id: "156420",
              tss_booking_url: "https://tss.ucsd.edu/fiori#package-156420",
            },
            {
              event_package_id: "156421",
              tss_booking_url: "https://tss.ucsd.edu/fiori#package-156421",
            },
          ],
          class_planner_section_meetings: [
            classMeeting,
            {
              ...classMeeting,
              meeting_ordinal: 1,
              day_code: "W",
              day_name: "Wednesday",
              start_minutes: 1140,
              end_minutes: 1200,
              start_time_display: "7:00pm",
              end_time_display: "8:00pm",
            },
          ],
        },
        {
          id: 9003,
          section_id: "E 00000003",
          section_ref: "FA26:E 00000003",
          section_code: "002-000-SE",
          instruction_type_name: "se",
          capacity: 100,
          enrolled: 80,
          seats_available: 20,
          waitlist_capacity: null,
          waitlist_enrolled: 0,
          waitlist_available: null,
          status: "AC",
          instructors: ["Grace Hopper"],
          tss_event_packages: [
            {
              event_package_id: "156500",
              tss_booking_url: "https://tss.ucsd.edu/fiori#package-156500",
            },
          ],
          class_planner_section_meetings: [
            { ...classMeeting, day_code: "M", day_name: "Monday" },
          ],
        },
        {
          id: 9002,
          section_id: "E 00000002",
          section_ref: "FA26:E 00000002",
          section_code: "001-001-DI",
          instruction_type_name: "discussion",
          capacity: 30,
          enrolled: 25,
          seats_available: 5,
          waitlist_capacity: null,
          waitlist_enrolled: 0,
          waitlist_available: null,
          status: "AC",
          instructors: [],
          tss_event_packages: [
            {
              event_package_id: "156420",
              tss_booking_url: "https://tss.ucsd.edu/fiori#package-156420",
            },
          ],
          class_planner_section_meetings: [
            { ...classMeeting, day_code: "R", day_name: "Thursday" },
          ],
        },
      ],
    };
    const rating = {
      avgRating: 4.8,
      avgDiff: 2.1,
      takeAgainPercent: 91,
      name: "Ada Lovelace",
      nameKey: "ada lovelace",
    };

    const result = mapOfferingToCourses(
      offering as Parameters<typeof mapOfferingToCourses>[0],
      new Map([[rating.nameKey, rating]]),
    );

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      id: "FA26:E 00000001",
      Name: "CSE 100: Advanced Data Structures",
      Term: "FA26",
      Teacher: "Ada Lovelace",
      SectionCode: "001-000-LE",
      Lecture: {
        Days: "Tue",
        Time: "5:00pm-6:20pm",
        Location: "CENTR 101",
        SectionRef: "FA26:E 00000001",
        EventPackageIds: ["156420", "156421"],
      },
      Lectures: [
        { Days: "Tue" },
        { Days: "Wed", Time: "7:00pm-8:00pm" },
      ],
      Discussions: [{
        Days: "Thu",
        SectionRef: "FA26:E 00000002",
        EventPackageIds: ["156420"],
      }],
      TssPackageUrls: {
        "156420": "https://tss.ucsd.edu/fiori#package-156420",
        "156421": "https://tss.ucsd.edu/fiori#package-156421",
      },
      rmp: rating,
    });
    expect(result[1]).toMatchObject({
      id: "FA26:E 00000003",
      Teacher: "Grace Hopper",
      SectionCode: "002-000-SE",
      Lecture: {
        SectionRef: "FA26:E 00000003",
        EventPackageIds: ["156500"],
      },
      TssPackageUrls: {
        "156500": "https://tss.ucsd.edu/fiori#package-156500",
      },
    });
  });

  it("returns the module route only when no event-package deep link exists", () => {
    const offering = {
      id: 402,
      source_key: "CSE-290:E 00000290",
      instructors_search: "",
      term_code: "FA26",
      subject_code: "CSE",
      course_code: "290",
      module_code: "CSE-290",
      module_name: "Independent Study",
      course_title: null,
      section_count: 1,
      open_section_count: 1,
      open_seat_count: 1,
      waitlist_available_count: 0,
      instruction_types: ["independent study"],
      instructors: [],
      availability_refresh_pending: false,
      is_topic_course: false,
      section_family: null,
      subject_name: "Computer Science and Engineering",
      academic_level: "UD",
      matching_section_count: 1,
      units_display: "4 units",
      prerequisites: [],
      restrictions: [],
      metadata_source: "UC San Diego course catalog",
      tss_module_routes: {
        route_kind: "module",
        tss_url: "https://tss.ucsd.edu/fiori#module-290",
      },
      class_planner_sections: [],
    };

    const [result] = mapOfferingToCourses(
      offering as Parameters<typeof mapOfferingToCourses>[0],
    );

    expect(result?.TssFallbackUrl).toBe(
      "https://tss.ucsd.edu/fiori#module-290",
    );
  });
});

describe("exactSubjectCodeFromSearch", () => {
  it("recognizes subject-only searches regardless of case or surrounding whitespace", () => {
    expect(exactSubjectCodeFromSearch("math")).toBe("MATH");
    expect(exactSubjectCodeFromSearch(" CSE ")).toBe("CSE");
  });

  it("leaves course numbers and general keywords on the flexible search path", () => {
    expect(exactSubjectCodeFromSearch("MATH 20C")).toBeNull();
    expect(exactSubjectCodeFromSearch("mathematics")).toBeNull();
    expect(exactSubjectCodeFromSearch("smith")).toBeNull();
  });
});

describe("isExactProfessorMatch", () => {
  it("accepts punctuation differences normalized from the same instructor name", () => {
    expect(isExactProfessorMatch({
      avgDiff: 4.3,
      avgRating: 1.9,
      name: "Hsiao-Bing Cheng",
      nameKey: "hsiaobing cheng",
      takeAgainPercent: 20,
    })).toBe(true);
  });

  it("rejects a stale fuzzy match stored under another instructor's key", () => {
    expect(isExactProfessorMatch({
      avgDiff: 3.7,
      avgRating: 2.5,
      name: "Yousaf Habib",
      nameKey: "yizhuang you",
      takeAgainPercent: 44,
    })).toBe(false);
  });

  it("accepts a verified RMP alias stored under the catalog instructor key", () => {
    expect(isExactProfessorMatch({
      avgDiff: 2.1,
      avgRating: 4.2,
      name: "Joseph Politz",
      nameKey: "joe politz",
      takeAgainPercent: 90,
    })).toBe(true);
  });
});
