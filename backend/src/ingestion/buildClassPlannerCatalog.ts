import type { Course } from "../models/Course.js";
import type {
  ClassPlannerCatalogSnapshot,
  ClassPlannerCourse,
  ClassPlannerMeeting,
  ClassPlannerResolvedRoute,
  ClassPlannerSection,
} from "../models/ClassPlannerCatalog.js";
import type { Section, SectionExam } from "../models/Section.js";
import { normalizeTeacherKey } from "../utils/normalizeTeacherKey.js";

const TSS_EVENT_PACKAGE_ROUTE =
  /\/Detail\/EventPackage\/SM\/([^/]+)\/00000000\/0\/0\/0\/00000000-0000-0000-0000-000000000000\/([^/]+)\/([^/]+)\/([^/]+)\/\?/;

const DAY_LABELS: Readonly<Record<string, string>> = {
  M: "Mon",
  T: "Tue",
  W: "Wed",
  R: "Thu",
  F: "Fri",
  S: "Sat",
  U: "Sun",
};

const DAY_ORDER: Readonly<Record<string, number>> = {
  M: 1,
  T: 2,
  W: 3,
  R: 4,
  F: 5,
  S: 6,
  U: 7,
};

const PRIMARY_INSTRUCTION_TYPES = new Set([
  "in",
  "independent study",
  "le",
  "lecture",
  "se",
  "seminar",
]);

/** Returns whether Class Planner identifies a section as primary instruction. */
export function isPrimaryInstructionType(value: string): boolean {
  return PRIMARY_INSTRUCTION_TYPES.has(value.trim().toLowerCase());
}

export function classPlannerSourceKey(course: ClassPlannerCourse): string {
  const sectionIds = course.sections
    .map(({ section_id }) => section_id)
    .sort((left, right) => left.localeCompare(right));

  return `${course.module_code}:${sectionIds.join(",")}`;
}

export function buildClassPlannerCatalog(
  term: string,
  courses: readonly ClassPlannerCourse[],
  routes: readonly ClassPlannerResolvedRoute[],
): ClassPlannerCatalogSnapshot {
  const routeBySourceKey = new Map(
    routes.map((route) => [route.source_key, route]),
  );
  const offerings: ClassPlannerCatalogSnapshot["offerings"] = [];
  const sections: ClassPlannerCatalogSnapshot["sections"] = [];
  const meetings: ClassPlannerCatalogSnapshot["meetings"] = [];
  const eventPackages: ClassPlannerCatalogSnapshot["event_packages"] = [];
  const packageSections: ClassPlannerCatalogSnapshot["package_sections"] = [];
  const moduleRoutes: ClassPlannerCatalogSnapshot["module_routes"] = [];

  for (const course of courses) {
    const sourceKey = classPlannerSourceKey(course);
    const route = routeBySourceKey.get(sourceKey);

    if (!route) {
      throw new Error(`Class Planner did not resolve a TSS route for ${sourceKey}`);
    }

    const packageRoute = parseEventPackageRoute(route.tss_url);
    const routeKind = packageRoute ? "event_package" : "module";

    if (route.representative_event_package_id && !packageRoute) {
      throw new Error(`Unsupported TSS event package route for ${sourceKey}`);
    }

    offerings.push({
      source_key: sourceKey,
      term_code: term,
      subject_code: course.subject_code,
      course_code: course.course_code,
      module_code: course.module_code,
      module_id: route.module_id,
      module_name: course.module_name,
      course_title: course.course_title,
      section_count: course.section_count,
      open_section_count: course.open_section_count,
      open_seat_count: course.open_seat_count,
      waitlist_available_count: course.waitlist_available_count,
      instruction_types: course.instruction_types,
      instructors: course.instructors,
      availability_refresh_pending: course.availability_refresh_pending,
      is_topic_course: course.is_topic_course,
      section_family: course.section_family,
      subject_name: course.subject_name,
      academic_level: course.academic_level,
      matching_section_count: course.matching_section_count,
      units_display: course.units_display,
      prerequisites: course.prerequisites,
      restrictions: course.restrictions,
      metadata_source: course.metadata_source,
    });

    const packageIds = new Set<string>();

    for (const section of course.sections) {
      sections.push({
        source_key: sourceKey,
        term_code: term,
        section_id: section.section_id,
        section_ref: section.section_ref,
        section_code: section.section_code,
        instruction_type_name: section.instruction_type_name,
        capacity: section.capacity,
        enrolled: section.enrolled,
        seats_available: section.seats_available,
        waitlist_capacity: section.waitlist_capacity,
        waitlist_enrolled: section.waitlist_enrolled,
        waitlist_available: section.waitlist_available,
        status: section.status,
        instructors: section.instructors,
      });

      section.meetings.forEach((meeting, meetingOrdinal) => {
        // Class Planner uses midnight-to-midnight as an unknown-time placeholder.
        // A TBA flag alone can accompany real times, so preserve every other interval.
        const hasTbaTimePlaceholder = meeting.is_tba &&
          meeting.start_minutes === 0 && meeting.end_minutes === 0;
        meetings.push({
          ...meeting,
          ...(hasTbaTimePlaceholder ? {
            start_minutes: null,
            end_minutes: null,
            start_time_display: null,
            end_time_display: null,
          } : {}),
          term_code: term,
          section_id: section.section_id,
          meeting_ordinal: meetingOrdinal,
        });
      });

      for (const eventPackageId of section.event_package_ids) {
        packageIds.add(eventPackageId);
        packageSections.push({
          source_key: sourceKey,
          term_code: term,
          event_package_id: eventPackageId,
          section_id: section.section_id,
        });
      }
    }

    for (const eventPackageId of packageIds) {
      eventPackages.push({
        source_key: sourceKey,
        term_code: term,
        module_id: route.module_id,
        event_package_id: eventPackageId,
        tss_booking_url: packageRoute
          ? buildEventPackageUrl(
              route.module_id,
              eventPackageId,
              packageRoute.academicYear,
              packageRoute.academicPeriod,
            )
          : null,
      });
    }

    moduleRoutes.push({
      source_key: sourceKey,
      term_code: term,
      module_id: route.module_id,
      route_kind: routeKind,
      representative_event_package_id:
        route.representative_event_package_id,
      academic_year: packageRoute?.academicYear ?? null,
      academic_period: packageRoute?.academicPeriod ?? null,
      tss_url: route.tss_url,
    });
  }

  return {
    offerings,
    sections,
    meetings,
    event_packages: eventPackages,
    package_sections: packageSections,
    module_routes: moduleRoutes,
  };
}

export function buildLegacyCourses(
  term: string,
  courses: readonly ClassPlannerCourse[],
): Course[] {
  return courses.map((course) => {
    const primarySections = course.sections.filter(({ instruction_type_name }) =>
      isPrimaryInstructionType(instruction_type_name),
    );
    const discussions = course.sections.filter(({ instruction_type_name }) =>
      instruction_type_name.toLowerCase().includes("discussion"),
    );
    const labs = course.sections.filter(({ instruction_type_name }) =>
      instruction_type_name.toLowerCase().includes("lab"),
    );
    const teacher = course.instructors[0] ?? "";
    const examMeetings = uniqueMeetings(
      course.sections.flatMap(({ meetings }) =>
        meetings.filter(({ meeting_kind }) => meeting_kind !== "class"),
      ),
    );

    return {
      Name: `${course.subject_code} ${course.course_code}: ${course.module_name}`,
      Term: term,
      Teacher: teacher,
      Lecture: firstLegacySection(primarySections),
      Labs: buildLegacySections(labs),
      Discussions: buildLegacySections(discussions),
      Midterms: examMeetings
        .filter(({ meeting_kind }) => meeting_kind.toLowerCase() !== "final")
        .map(toLegacyMeeting),
      Final:
        examMeetings.find(
          ({ meeting_kind }) => meeting_kind.toLowerCase() === "final",
        ) ? toLegacyMeeting(
            examMeetings.find(
              ({ meeting_kind }) => meeting_kind.toLowerCase() === "final",
            )!,
          ) : null,
      nameKey: normalizeTeacherKey(teacher),
      rmp: null,
    };
  });
}

function parseEventPackageRoute(tssUrl: string): {
  academicYear: string;
  academicPeriod: string;
} | null {
  const match = tssUrl.match(TSS_EVENT_PACKAGE_ROUTE);

  if (!match) {
    return null;
  }

  return {
    academicYear: match[3]!,
    academicPeriod: match[4]!,
  };
}

function buildEventPackageUrl(
  moduleId: string,
  eventPackageId: string,
  academicYear: string,
  academicPeriod: string,
): string {
  return "https://tss.ucsd.edu/fiori#ZUSModule-display?TileType=MYMOD&" +
    `/Detail/EventPackage/SM/${moduleId}/00000000/0/0/0/` +
    "00000000-0000-0000-0000-000000000000/" +
    `${eventPackageId}/${academicYear}/${academicPeriod}/?`;
}

function firstLegacySection(
  sections: readonly ClassPlannerSection[],
): Section | null {
  return buildLegacySections(sections)[0] ?? null;
}

export function buildLegacySections(
  sections: readonly ClassPlannerSection[],
): Section[] {
  return sections.flatMap((section) => {
    const metadata = {
      SectionId: section.section_id,
      SectionRef: section.section_ref,
      SectionCode: section.section_code,
      EventPackageIds: section.event_package_ids,
      Exams: uniqueMeetings(section.meetings.filter(
        ({ meeting_kind }) => meeting_kind.toLowerCase() !== "class",
      )).map((meeting): SectionExam => ({
        ...toLegacyMeeting(meeting),
        Type: meeting.meeting_kind.toLowerCase() === "final" ? "final" : "midterm",
      })),
    };
    const classMeetings = section.meetings.filter(
      ({ meeting_kind }) => meeting_kind === "class",
    );

    if (classMeetings.length === 0) {
      return [{ Days: "TBA", Time: "TBA", Location: "TBA", ...metadata }];
    }

    const grouped = new Map<string, ClassPlannerMeeting[]>();

    for (const meeting of classMeetings) {
      const key = [
        meeting.start_minutes,
        meeting.end_minutes,
        meeting.building_code,
        meeting.room_code,
        meeting.is_remote,
        meeting.is_tba,
      ].join("|");
      const current = grouped.get(key) ?? [];
      current.push(meeting);
      grouped.set(key, current);
    }

    return Array.from(grouped.values(), (meetings) => ({
      Days: meetings
        .slice()
        .sort((left, right) =>
          (DAY_ORDER[left.day_code ?? ""] ?? 99) -
          (DAY_ORDER[right.day_code ?? ""] ?? 99))
        .map(({ day_code, day_name }) =>
          day_code ? (DAY_LABELS[day_code] ?? day_name ?? day_code) : "",
        )
        .filter(Boolean)
        .join(""),
      Time: displayTime(meetings[0]!),
      Location: displayLocation(meetings[0]!),
      ...metadata,
    }));
  });
}

function toLegacyMeeting(meeting: ClassPlannerMeeting): Section {
  return {
    Days: meeting.specific_date ?? meeting.day_name ?? meeting.day_code ?? "TBA",
    Time: displayTime(meeting),
    Location: displayLocation(meeting),
  };
}

function displayTime(meeting: ClassPlannerMeeting): string {
  if (meeting.is_tba) {
    return "TBA";
  }

  if (meeting.start_time_display && meeting.end_time_display) {
    return `${meeting.start_time_display}-${meeting.end_time_display}`;
  }

  return "TBA";
}

function displayLocation(meeting: ClassPlannerMeeting): string {
  if (meeting.is_remote) {
    return "REMOTE";
  }

  if (meeting.is_tba) {
    return "TBA";
  }

  if (meeting.room_code) {
    return meeting.room_code;
  }

  return meeting.building_code ?? "TBA";
}

function uniqueMeetings(
  meetings: readonly ClassPlannerMeeting[],
): ClassPlannerMeeting[] {
  const byKey = new Map<string, ClassPlannerMeeting>();

  for (const meeting of meetings) {
    const key = [
      meeting.meeting_kind,
      meeting.specific_date,
      meeting.day_code,
      meeting.start_minutes,
      meeting.end_minutes,
      meeting.room_code,
    ].join("|");
    byKey.set(key, meeting);
  }

  return Array.from(byKey.values());
}
