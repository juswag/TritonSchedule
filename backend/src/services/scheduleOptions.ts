import { toLegacyMeeting } from "../ingestion/buildClassPlannerCatalog.js";
import type { ClassPlannerMeeting } from "../models/ClassPlannerCatalog.js";
import type { ScheduleCourse, ScheduleMeeting, ScheduleOption } from "../models/ScheduleOptions.js";
import { connectToDB } from "./connectToDB.js";

export class ScheduleOptionsError extends Error {
  constructor(message: string, public readonly status: number = 409) { super(message); }
}

export type OptionSection = {
  id: number;
  section_ref: string;
  section_code: string;
  instruction_type_name: string;
  instructors: string[];
  meetings: ClassPlannerMeeting[];
  packages: string[];
};
export type OptionOffering = {
  id: number;
  source_key: string;
  term_code: string;
  subject_code: string;
  course_code: string;
  module_name: string;
  section_count: number;
  sections: OptionSection[];
};

const TYPES: Record<string, string> = {
  le: "Lecture", lecture: "Lecture", se: "Seminar", seminar: "Seminar",
  in: "Independent study", "independent study": "Independent study",
  di: "Discussion", discussion: "Discussion", la: "Lab", lab: "Lab", laboratory: "Lab",
};
const PRIMARY = new Set(["Lecture", "Seminar", "Independent study"]);
const DAYS: Record<string, number> = { M: 0, T: 1, W: 2, R: 3, F: 4, S: 5, U: 6 };
const sectionType = (section: OptionSection) => TYPES[section.instruction_type_name.trim().toLowerCase()];

/** Keys retain offering/topic identity and fail explicitly if a refresh changes its sections. */
export function scheduleCourseKey(term: string, sourceKey: string): string {
  return JSON.stringify([term, sourceKey]);
}

export function mapScheduleOffering(offering: OptionOffering): ScheduleCourse {
  const issues = new Set<string>();
  const key = scheduleCourseKey(offering.term_code, offering.source_key);
  const result: ScheduleCourse = {
    key, term: offering.term_code, code: `${offering.subject_code} ${offering.course_code}`,
    title: offering.module_name, options: [], issues: [],
  };
  const sections = offering.sections;
  if (sections.length !== offering.section_count || !sections.length) {
    result.issues = ["The catalog does not contain all sections for this course."];
    return result;
  }
  const requiredTypes = new Set(sections.map(sectionType).filter(type => !PRIMARY.has(type)));
  const packages = new Map<string, OptionSection[]>();
  for (const section of sections) {
    for (const packageId of section.packages) {
      const members = packages.get(packageId) ?? [];
      if (!members.some(member => member.id === section.id)) members.push(section);
      packages.set(packageId, members);
    }
  }
  // A standalone primary section needs no cross-component pairing. Never infer lab/discussion links.
  if (packages.size === 0 && sections.every(section => PRIMARY.has(sectionType(section)))) {
    for (const section of sections) packages.set(section.section_ref, [section]);
  } else if (sections.some(section => section.packages.length === 0)) {
    issues.add("Some sections have no verified section-pairing information.");
  }
  if (!packages.size) issues.add("Section-pairing information is unavailable for this course.");
  const seen = new Set<string>();
  for (const members of packages.values()) {
    const types = new Set(members.map(sectionType));
    if (members.some(section => !sectionType(section)) || members.filter(section => PRIMARY.has(sectionType(section))).length !== 1 ||
        [...requiredTypes].some(type => !types.has(type))) {
      issues.add("Some section combinations are incomplete or have unsupported instruction types.");
      continue;
    }
    const option: ScheduleOption = { id: "", sections: [], meetings: [], exams: [] };
    let invalid = false;
    for (const section of members.slice().sort((a, b) =>
      Number(PRIMARY.has(sectionType(b))) - Number(PRIMARY.has(sectionType(a))) || a.section_ref.localeCompare(b.section_ref))) {
      const type = sectionType(section);
      option.sections.push({ id: section.section_ref, code: section.section_code, type, instructor: section.instructors.join(", ") });
      for (const exam of section.meetings.filter(m => m.meeting_kind.toLowerCase() !== "class")) {
        const display = toLegacyMeeting(exam);
        const type = exam.meeting_kind.toLowerCase() === "final" ? "final" : "midterm";
        option.exams.push({
          id: JSON.stringify([section.section_ref, type, display.Days, display.Time, display.Location]),
          name: type === "final" ? "Final" : "Midterm", type,
          time: [display.Days, display.Time].join(" "), location: display.Location,
        });
      }
      const meetings = section.meetings.filter(meeting => meeting.meeting_kind === "class");
      if (!meetings.length) invalid = true;
      for (const meeting of meetings) {
        const day = DAYS[meeting.day_code ?? ""];
        const start = meeting.start_minutes;
        const end = meeting.end_minutes;
        if (meeting.is_tba || meeting.specific_date || day === undefined ||
            start === null || end === null || !Number.isInteger(start) || !Number.isInteger(end) ||
            start < 0 || end > 1440 || start >= end) {
          invalid = true;
          continue;
        }
        option.meetings.push({ day, start, end, type, sectionId: section.section_ref,
          location: meeting.is_remote ? "Remote" : meeting.room_code || meeting.building_code || "Location unavailable" });
      }
    }
    if (invalid) { issues.add("Some sections have unknown or non-weekly meeting times and were excluded."); continue; }
    // Repeated catalog meetings do not create false self-conflicts.
    option.meetings = [...new Map(option.meetings.map(meeting => [JSON.stringify(meeting), meeting])).values()];
    const overlaps = (a: ScheduleMeeting, b: ScheduleMeeting) => a.day === b.day && a.start < b.end && b.start < a.end;
    if (option.meetings.some((meeting, i) => option.meetings.slice(i + 1).some(other => overlaps(meeting, other)))) {
      issues.add("Some section combinations have overlapping required meetings and were excluded.");
      continue;
    }
    option.id = JSON.stringify(option.sections.map(section => section.id));
    if (!seen.has(option.id)) { seen.add(option.id); result.options.push(option); }
  }
  result.options.sort((a, b) => a.id.localeCompare(b.id));
  result.issues = [...issues];
  return result;
}

type RawOffering = Omit<OptionOffering, "sections">;
type RawSection = Omit<OptionSection, "meetings" | "packages"> & { offering_id: number };
type RawMeeting = ClassPlannerMeeting & { section_id: number; meeting_ordinal: number };
type RawPackage = { id: number; offering_id: number; event_package_id: string };
type RawMembership = { event_package_id: number; section_id: number };
const PAGE_SIZE = 500;

// Exact counts detect server row caps. Flat reads avoid silently truncated embedded children.
export async function readAllPages<T>(fetchPage: (from: number, to: number) => PromiseLike<{
  data: unknown[] | null; count: number | null; error: unknown;
}>): Promise<T[]> {
  const rows: T[] = [];
  let expected: number | null = null;
  while (true) {
    const { data, count, error } = await fetchPage(rows.length, rows.length + PAGE_SIZE - 1);
    if (error) throw error;
    if (count === null || (expected !== null && count !== expected)) {
      throw new ScheduleOptionsError("The catalog changed while loading. Please generate again.");
    }
    expected = count;
    const page = (data ?? []) as T[];
    rows.push(...page);
    if (rows.length === count) return rows;
    if (!page.length || rows.length > count) throw new ScheduleOptionsError("The catalog response is incomplete. Please try again.");
  }
}

export async function getScheduleOptions(term: string, queryText: string, keys?: readonly string[]): Promise<ScheduleCourse[]> {
  const db = connectToDB();
  const sourceKeys = keys?.map(key => {
    let value: unknown;
    try { value = JSON.parse(key); } catch { throw new ScheduleOptionsError("Invalid course selection. Search for the course again.", 400); }
    if (!Array.isArray(value) || value.length !== 2 || value[0] !== term || typeof value[1] !== "string") {
      throw new ScheduleOptionsError("Selected courses must belong to the same term.", 400);
    }
    return value[1];
  });
  if (sourceKeys && new Set(sourceKeys).size !== sourceKeys.length) {
    throw new ScheduleOptionsError("Select distinct courses.", 400);
  }
  const marker = async () => {
    const { data, error } = await db.from("class_planner_course_offerings").select("id").eq("term_code", term).order("id", { ascending: false }).limit(1);
    if (error) throw error;
    return data?.[0]?.id ?? null;
  };
  const before = await marker();
  const offerings = await readAllPages<RawOffering>((from, to) => {
    let query = db.from("class_planner_course_offerings")
      .select("id,source_key,term_code,subject_code,course_code,module_name,section_count", { count: "exact" })
      .eq("term_code", term).order("id").range(from, to);
    if (sourceKeys) query = query.in("source_key", sourceKeys);
    else {
      const tokens = queryText.replace(/([a-z])(?=\d)/gi, "$1 ").trim().split(/\s+/);
      const pattern = `%${tokens.map(token => token.replace(/[\\%_]/g, "\\$&")).join("%")}%`;
      const quoted = `"${pattern.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
      query = query.or(`module_code.ilike.${quoted},module_name.ilike.${quoted},course_title.ilike.${quoted}`);
    }
    return query;
  });
  if (sourceKeys && offerings.length !== new Set(sourceKeys).size) {
    throw new ScheduleOptionsError("A selected course changed or is unavailable. Remove it and search for it again.");
  }
  if (sourceKeys) offerings.sort((a, b) => sourceKeys.indexOf(a.source_key) - sourceKeys.indexOf(b.source_key));
  if (!offerings.length) return [];
  // Prevent unbounded public searches without returning a misleading partial catalog.
  if (offerings.length > 100) throw new ScheduleOptionsError("Please narrow your search with a course number or title.", 400);
  const ids = offerings.map(offering => offering.id);
  const sections = await readAllPages<RawSection>((from, to) => db.from("class_planner_sections")
    .select("id,offering_id,section_ref,section_code,instruction_type_name,instructors", { count: "exact" }).in("offering_id", ids).order("id").range(from, to));
  const sectionIds = sections.map(section => section.id);
  const packages = await readAllPages<RawPackage>((from, to) => db.from("tss_event_packages")
    .select("id,offering_id,event_package_id", { count: "exact" }).in("offering_id", ids).order("id").range(from, to));
  const meetings: RawMeeting[] = [];
  const memberships: RawMembership[] = [];
  // Keep URL filters bounded even for offerings with many sections.
  for (let start = 0; start < sectionIds.length; start += 100) {
    const batch = sectionIds.slice(start, start + 100);
    meetings.push(...await readAllPages<RawMeeting>((from, to) => db.from("class_planner_section_meetings")
      .select("*", { count: "exact" }).in("section_id", batch).order("id").range(from, to)));
    memberships.push(...await readAllPages<RawMembership>((from, to) => db.from("tss_event_package_sections")
      .select("event_package_id,section_id", { count: "exact" }).in("section_id", batch).order("event_package_id").order("section_id").range(from, to)));
  }
  if (before !== await marker()) throw new ScheduleOptionsError("The catalog changed while loading. Please generate again.");
  return offerings.map(offering => mapScheduleOffering({ ...offering, sections: sections
    .filter(section => section.offering_id === offering.id)
    .map(section => ({ ...section,
      meetings: meetings.filter(meeting => meeting.section_id === section.id),
      packages: memberships.filter(member => member.section_id === section.id).flatMap(member => {
        const found = packages.find(pkg => pkg.id === member.event_package_id && pkg.offering_id === offering.id);
        return found ? [found.event_package_id] : [];
      }),
    })),
  }));
}
