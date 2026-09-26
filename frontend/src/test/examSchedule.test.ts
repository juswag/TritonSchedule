import { describe, expect, it } from "vitest";
import { getCourseExams, getExamSchedule, parseExamSchedule } from "@/lib/examSchedule";
import type { CalendarEvent } from "@/types/calendar";
import type { Course } from "@/data/sampleCourses";

export function examCourse(id: string, time: string, type: "midterm" | "final" = "midterm"): CalendarEvent {
  return {
    id, courseId: id, title: `${id}: Course title`, courseTitle: `${id}: Course title`,
    dayOfWeek: "Mon", startTime: "09:00", endTime: "09:50", eventType: "Lecture",
    color: "#2563eb", isCourse: true,
    exams: [{ id: `${id}-exam`, name: "Exam", type, time, location: "CENTR 101" }],
  };
}

describe("exam schedule", () => {
  it("deduplicates recurring lectures and sections, sorts exams, and finds only the conflicting pair", () => {
    const cse = examCourse("CSE 11", "2026-10-27 7:00pm-9:00pm");
    const result = getExamSchedule([
      examCourse("ECON 1", "2026-11-05 5:00pm-6:30pm"), cse,
      { ...cse, id: "cse-wed", dayOfWeek: "Wed" },
      { ...cse, id: "cse-discussion", eventType: "Discussion" },
      examCourse("MATH 20A", "2026-10-27 8:00pm-9:30pm"),
      examCourse("PHYS 2A", "2026-10-19 6:00pm-7:30pm"),
    ]);
    expect(result.exams.map((exam) => exam.courseCode)).toEqual(["PHYS 2A", "CSE 11", "MATH 20A", "ECON 1"]);
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0].first.courseCode).toBe("CSE 11");
    expect(result.conflicts[0].second.courseCode).toBe("MATH 20A");
    expect(result.exams[1].dateLabel).toBe("Tue, Oct 27, 2026");
    expect(result.exams[1].timeLabel).toBe("7:00 PM – 9:00 PM");
  });

  it("allows adjacent exams and equal times on different dates", () => {
    expect(getExamSchedule([
      examCourse("CSE 11", "2026-10-27 7:00pm-9:00pm"),
      examCourse("MATH 20A", "2026-10-27 9:00pm-10:00pm"),
      examCourse("PHYS 2A", "2026-10-28 7:00pm-9:00pm"),
    ]).conflicts).toEqual([]);
  });

  it("finds every distinct pair including contained and cross-type overlaps", () => {
    const result = getExamSchedule([
      examCourse("CSE 11", "2026-12-07 8:00am-11:00am", "final"),
      examCourse("MATH 20A", "2026-12-07 9:00am-10:00am", "final"),
      examCourse("PHYS 2A", "2026-12-07 9:30am-10:30am"),
    ]);
    expect(result.conflicts).toHaveLength(3);
  });

  it("removes exams and conflicts when the course is removed", () => {
    const a = examCourse("CSE 11", "2026-10-27 7:00pm-9:00pm");
    expect(getExamSchedule([a]).conflicts).toEqual([]);
    expect(getExamSchedule([]).exams).toEqual([]);
  });

  it("distinguishes legacy metadata from courses with no published exams and ignores custom events", () => {
    const a = examCourse("CSE 11", "TBA");
    const result = getExamSchedule([
      { ...a, exams: undefined },
      { ...a, courseId: "MATH 20A", exams: [] },
      { ...a, courseId: "study", isCourse: false },
    ]);
    expect(result.exams).toEqual([]);
    expect(result.missingCourses).toEqual([{ id: "CSE 11", title: a.title }]);
  });

  it("ignores malformed stored metadata and duplicate source exam entries", () => {
    const a = examCourse("CSE 11", "2026-10-27 7:00pm-9:00pm");
    const result = getExamSchedule([{ ...a, exams: [null, {}, ...a.exams!, ...a.exams!] } as CalendarEvent]);
    expect(result.exams).toHaveLength(1);
    expect(result.conflicts).toEqual([]);
  });

  it("does not flag the same course sitting listed in multiple rooms as a conflict", () => {
    const course = examCourse("CSE 11", "2026-10-27 7:00pm-9:00pm");
    course.exams!.push({ ...course.exams![0], id: "overflow-room", location: "SOLIS 107" });
    const result = getExamSchedule([course]);
    expect(result.conflicts).toEqual([]);
    expect(result.exams).toHaveLength(1);
    expect(result.exams[0].location).toBe("CENTR 101, SOLIS 107");
    const otherCourse = examCourse("MATH 20A", "2026-10-27 8:00pm-9:30pm");
    expect(getExamSchedule([course, otherCourse]).conflicts).toHaveLength(1);
  });

  it.each([
    "TBA", "Tue 7:00pm-9:00pm", "Oct 27 7:00pm-9:00pm", "2026-02-30 7:00pm-9:00pm",
    "2026-10-27 7:00pm", "2026-10-27 9:00pm-7:00pm", "2026-10-27 7:60pm-9:00pm",
    "2026-10-27 7-9pm", "2026-10-27 0:00pm-9:00pm",
  ])("does not invent a conflict range for incomplete or invalid source: %s", (source) => {
    expect(parseExamSchedule(source).start).toBeNull();
    expect(parseExamSchedule(source).end).toBeNull();
  });

  it("handles explicit numeric dates, noon, midnight, and 24-hour ranges", () => {
    expect(parseExamSchedule("10/27/2026 12:00pm-1:00pm").timeLabel).toBe("12:00 PM – 1:00 PM");
    expect(parseExamSchedule("2026-10-27 00:00-01:00").timeLabel).toBe("12:00 AM – 1:00 AM");
    expect(parseExamSchedule("2026-10-27 19:00-21:00").start).toBe(Date.UTC(2026, 9, 27, 19));
  });

  it("preserves all catalog midterms, final locations, and unknown dates when saving", () => {
    const course: Course = {
      id: "FA26:CSE", name: "CSE 11", instructor: "Instructor", description: "", color: "blue", schedule: "Mon 9:00am-10:00am",
      midtermSections: [
        { id: "m1", name: "Midterm 1", time: "2026-10-27 7:00pm-9:00pm", location: "CENTR 101" },
        { id: "m2", name: "Midterm 2", time: "TBA", location: "TBA" },
      ],
      finalSection: { id: "f", name: "Final", time: "2026-12-07 8:00am-11:00am", location: "SOLIS 107" },
    };
    expect(getCourseExams(course)).toEqual([
      { ...course.midtermSections![0], type: "midterm" },
      { ...course.midtermSections![1], type: "midterm" },
      { ...course.finalSection, type: "final" },
    ]);
  });

  it("keeps unknown sittings distinct and never guesses an overlap", () => {
    const course = examCourse("CSE 11", "TBA");
    course.exams!.push({ ...course.exams![0], id: "second-midterm", name: "Midterm 2", location: "" });
    const result = getExamSchedule([course, examCourse("MATH 20A", "TBA"), examCourse("PHYS 2A", "2026-10-27 19:00-21:00")]);
    expect(result.exams).toHaveLength(4);
    expect(result.exams[0].courseCode).toBe("PHYS 2A");
    expect(result.exams.filter((exam) => exam.start === null)).toHaveLength(3);
    expect(result.exams.some((exam) => exam.location === "TBA")).toBe(true);
    expect(result.conflicts).toEqual([]);
    expect(parseExamSchedule("").timeLabel).toBe("Time TBA");
  });

  it("uses legacy sample exam labels and includes only chosen lab metadata", () => {
    const course: Course = { id: "sample", name: "CSE 11", instructor: "", description: "", color: "blue", schedule: "TBA", midterm: "Oct 27", final: "Dec 7" };
    const lab = { id: "lab", name: "Lab", time: "Mon 9:00am-10:00am", location: "Room", exams: [{ id: "lab-exam", name: "Lab final", type: "final" as const, time: "TBA", location: "Room" }] };
    expect(getCourseExams(course, undefined, lab).map((exam) => exam.time)).toEqual(["Oct 27", "Dec 7", "TBA"]);
    expect(getCourseExams({ ...course, midterm: undefined, final: undefined })).toEqual([]);
  });
  it("preserves canonical primary finals and honors an explicitly empty primary list", () => {
    const course: Course = { id: "c", name: "CSE 11", instructor: "", description: "", color: "blue", schedule: "TBA", final: "legacy", exams: [
      { id: "f1", name: "Final", type: "final", time: "2026-12-07 08:00-11:00", location: "A" },
      { id: "f2", name: "Final", type: "final", time: "2026-12-07 08:00-11:00", location: "B" },
      { id: "f3", name: "Final", type: "final", time: "2026-12-08 08:00-11:00", location: "C" },
    ] };
    expect(getCourseExams(course)).toEqual(course.exams);
    const schedule = getExamSchedule([], [{ id: course.id, title: course.name, color: course.color, exams: getCourseExams(course) }]);
    expect(schedule.exams).toHaveLength(2);
    expect(schedule.exams[0].location).toBe("A, B");
    expect(getCourseExams({ ...course, exams: [] })).toEqual([]);
  });

  it("finds overlaps between exam-only and weekly courses without duplicate course entries", () => {
    const weekly = examCourse("CSE 11", "2026-10-27 19:00-21:00");
    const other = examCourse("MATH 20A", "2026-10-27 20:00-22:00");
    const examOnly = { id: other.courseId!, title: other.title, color: other.color, exams: other.exams! };
    expect(getExamSchedule([weekly], [examOnly]).conflicts).toHaveLength(1);
    expect(getExamSchedule([weekly, other], [examOnly]).exams).toHaveLength(2);
    expect(getExamSchedule([weekly], []).conflicts).toEqual([]);
  });

});
