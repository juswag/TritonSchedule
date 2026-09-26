import type { PostgrestError } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import type { Course } from "../models/Course.js";
import type {
  ClassPlannerCatalogSnapshot,
  ClassPlannerCourse,
  ClassPlannerMeeting,
  ClassPlannerSection,
} from "../models/ClassPlannerCatalog.js";
import type { RMP } from "../models/RMP.js";
import type { Term } from "../models/Term.js";
import {
  buildLegacyCourses,
  buildLegacySections,
  isPrimaryInstructionType,
} from "../ingestion/buildClassPlannerCatalog.js";
import { SUBJECT_CODES } from "../ingestion/subjectCodes.js";
import {
  normalizeTeacherKey,
  teacherNamesMatch,
} from "../utils/normalizeTeacherKey.js";
import { connectToDB } from "./connectToDB.js";

type MeetingRow = ClassPlannerMeeting & {
  meeting_ordinal: number;
};

type TssPackageRow = {
  event_package_id: string;
  tss_booking_url: string | null;
};

type TssModuleRouteRow = {
  route_kind: "event_package" | "module";
  tss_url: string;
};

type SectionRow = Omit<ClassPlannerSection, "event_package_ids" | "meetings"> & {
  id: number;
  class_planner_section_meetings: MeetingRow[];
  tss_event_packages?: TssPackageRow[];
};

type OfferingRow = Omit<ClassPlannerCourse, "sections"> & {
  id: number;
  source_key: string;
  instructors_search: string;
  class_planner_sections: SectionRow[];
  tss_module_routes?: TssModuleRouteRow | TssModuleRouteRow[] | null;
};

type ProfessorRow = {
  name: string;
  name_key: string;
  avg_rating: number;
  avg_diff: number;
  take_again_percent: number;
  profile_url?: string | null;
};

type TermRow = {
  term: string;
  is_active: boolean;
};

const PAGE_SIZE = 1000;
const CATALOG_BATCH_SIZE = 250;
const PROFESSOR_BATCH_SIZE = 250;
const PROFESSOR_COLUMNS = "name,name_key,avg_rating,avg_diff,take_again_percent,profile_url";
const LEGACY_PROFESSOR_COLUMNS = "name,name_key,avg_rating,avg_diff,take_again_percent";
const NORMALIZED_SUBJECT_CODES = new Set(SUBJECT_CODES.map((subjectCode) => subjectCode.trim()));

function throwIfError(error: PostgrestError | null) {
  if (error) throw error;
}

function isMissingProfileUrlColumn(error: PostgrestError | null): boolean {
  if (!error) {
    return false;
  }

  return (
    (error.code === "42703" || error.code === "PGRST204") &&
    error.message.toLowerCase().includes("profile_url")
  );
}

async function selectProfessorRows(
  execute: (columns: string) => Promise<{ data: unknown; error: PostgrestError | null }>,
): Promise<ProfessorRow[]> {
  let result = await execute(PROFESSOR_COLUMNS);

  if (isMissingProfileUrlColumn(result.error)) {
    result = await execute(LEGACY_PROFESSOR_COLUMNS);
  }

  throwIfError(result.error);
  return (result.data ?? []) as ProfessorRow[];
}

function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, "\\$&");
}

function flexibleLikePattern(value: string) {
  const tokens = value.trim().split(/\s+/).filter(Boolean).map(escapeLike);
  return `%${tokens.join("%")}%`;
}

function quotePostgrestValue(value: string) {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

export function exactSubjectCodeFromSearch(value: string): string | null {
  const normalizedValue = value.trim().toUpperCase();
  return NORMALIZED_SUBJECT_CODES.has(normalizedValue) ? normalizedValue : null;
}

export function mapOfferingToCourses(
  row: OfferingRow,
  ratingsByNameKey: ReadonlyMap<string, RMP> = new Map(),
): Array<Course & { id: string }> {
  const classPlannerCourse: ClassPlannerCourse = {
    ...row,
    sections: row.class_planner_sections
      .map((section): ClassPlannerSection => ({
        ...section,
        event_package_ids: (section.tss_event_packages ?? [])
          .map(({ event_package_id }) => event_package_id),
        meetings: section.class_planner_section_meetings
          .slice()
          .sort((left, right) => left.meeting_ordinal - right.meeting_ordinal),
      }))
      .sort((left, right) => left.section_code.localeCompare(right.section_code)),
  };
  const baseCourse = buildLegacyCourses(row.term_code, [classPlannerCourse])[0]!;
  const primarySections = classPlannerCourse.sections.filter((section) =>
    isPrimaryInstructionType(section.instruction_type_name),
  );
  const sectionChoices: Array<ClassPlannerSection | undefined> =
    primarySections.length > 0 ? primarySections : [undefined];
  const tssPackageUrls = Object.fromEntries(
    row.class_planner_sections.flatMap((section) =>
      (section.tss_event_packages ?? []).flatMap((eventPackage) =>
        eventPackage.tss_booking_url
          ? [[eventPackage.event_package_id, eventPackage.tss_booking_url] as const]
          : [],
      ),
    ),
  );
  const route = Array.isArray(row.tss_module_routes)
    ? row.tss_module_routes[0]
    : row.tss_module_routes;
  const tssFallbackUrl = route?.route_kind === "module"
    ? route.tss_url
    : undefined;

  return sectionChoices.map((primarySection) => {
    // Other primary sections and optional discussions can have different exams.
    // Only publish exams belonging to the section represented by this course.
    const sectionCourse = buildLegacyCourses(row.term_code, [{
      ...classPlannerCourse,
      sections: primarySection ? [primarySection] : [],
    }])[0]!;
    const lectures = primarySection
      ? buildLegacySections([primarySection])
      : [];
    const teacher = primarySection?.instructors[0] ?? row.instructors[0] ?? "";
    const nameKey = normalizeTeacherKey(teacher);
    const relevantTssPackageUrls = primarySection
      ? Object.fromEntries(
          primarySection.event_package_ids.flatMap((packageId) =>
            tssPackageUrls[packageId]
              ? [[packageId, tssPackageUrls[packageId]] as const]
              : [],
          ),
        )
      : tssPackageUrls;

    return {
      ...baseCourse,
      Midterms: sectionCourse.Midterms,
      Final: sectionCourse.Final,
      id: primarySection?.section_ref ?? `${row.term_code}:${row.source_key}`,
      Teacher: teacher,
      Lecture: lectures[0] ?? null,
      Lectures: lectures,
      SectionCode: primarySection?.section_code ?? row.module_code,
      nameKey,
      rmp: ratingsByNameKey.get(nameKey) ?? null,
      TssPackageUrls: relevantTssPackageUrls,
      TssFallbackUrl: tssFallbackUrl,
    };
  });
}

function toRmpDocument(row: ProfessorRow): RMP {
  return {
    avgRating: Number(row.avg_rating),
    avgDiff: Number(row.avg_diff),
    takeAgainPercent: Number(row.take_again_percent),
    name: row.name,
    nameKey: row.name_key,
    profileUrl: row.profile_url ?? undefined,
  };
}

export function isExactProfessorMatch(professor: RMP): boolean {
  return normalizeTeacherKey(professor.name) === professor.nameKey ||
    teacherNamesMatch(professor.name, professor.nameKey);
}

function toExactRmpDocuments(rows: readonly ProfessorRow[]): RMP[] {
  return rows
    .map(toRmpDocument)
    .filter((professor) => professor.avgRating > 0 && isExactProfessorMatch(professor));
}

function toTermDocument(row: TermRow): Term {
  return {
    Term: row.term,
    IsActive: row.is_active,
  };
}

export async function searchCourses(course: string, term: string) {
  const supabase = connectToDB();
  const rows: OfferingRow[] = [];
  let offset = 0;

  while (true) {
    let query = supabase
      .from("class_planner_course_offerings")
      .select(`
        id,
        source_key,
        term_code,
        subject_code,
        course_code,
        module_code,
        module_name,
        course_title,
        section_count,
        open_section_count,
        open_seat_count,
        waitlist_available_count,
        instruction_types,
        instructors,
        instructors_search,
        availability_refresh_pending,
        is_topic_course,
        section_family,
        subject_name,
        academic_level,
        matching_section_count,
        units_display,
        prerequisites,
        restrictions,
        metadata_source,
        class_planner_sections (
          id,
          section_id,
          section_ref,
          section_code,
          instruction_type_name,
          capacity,
          enrolled,
          seats_available,
          waitlist_capacity,
          waitlist_enrolled,
          waitlist_available,
          status,
          instructors,
          tss_event_packages (
            event_package_id,
            tss_booking_url
          ),
          class_planner_section_meetings (
            meeting_ordinal,
            meeting_kind,
            day_code,
            day_name,
            specific_date,
            start_minutes,
            end_minutes,
            start_time_display,
            end_time_display,
            building_code,
            room_code,
            building_name,
            room_name,
            is_remote,
            is_tba
          )
        ),
        tss_module_routes (
          route_kind,
          tss_url
        )
      `)
      .order("module_code", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);

    if (course.length > 0) {
      const subjectCode = exactSubjectCodeFromSearch(course);

      if (subjectCode) {
        query = query.eq("subject_code", subjectCode);
      } else {
        const pattern = quotePostgrestValue(flexibleLikePattern(course));
        query = query.or([
          `module_code.ilike.${pattern}`,
          `module_name.ilike.${pattern}`,
          `course_title.ilike.${pattern}`,
          `instructors_search.ilike.${pattern}`,
        ].join(","));
      }
    }

    if (term.length > 0) {
      query = query.eq("term_code", term.toUpperCase());
    }

    const { data, error } = await query;
    throwIfError(error);

    const page = (data ?? []) as unknown as OfferingRow[];
    rows.push(...page);

    if (page.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  const courses = rows.flatMap((row) => mapOfferingToCourses(row));

  if (courses.length === 0) {
    return courses;
  }

  const nameKeys = Array.from(new Set(
    courses.map(({ nameKey }) => nameKey).filter(Boolean),
  ));
  const ratings = nameKeys.length <= 100
    ? await searchProfessorRows(nameKeys)
    : await searchProfessor();
  const ratingsByNameKey = new Map(
    ratings.map((rating) => [rating.nameKey, rating]),
  );

  return courses.map((courseDocument) => ({
    ...courseDocument,
    rmp: ratingsByNameKey.get(courseDocument.nameKey) ?? null,
  }));
}

async function searchProfessorRows(nameKeys: string[]) {
  if (nameKeys.length === 0) {
    return [];
  }

  const supabase = connectToDB();
  const rows = await selectProfessorRows(async (columns) => {
    const { data, error } = await supabase
      .from("professor")
      .select(columns)
      .in("name_key", nameKeys)
      .order("name", { ascending: true });
    return { data, error };
  });

  return toExactRmpDocuments(rows);
}

/** Atomically replaces a non-empty catalog without modifying professor rows. */
export async function replaceCatalog(
  term: string,
  catalog: ClassPlannerCatalogSnapshot,
) {
  if (catalog.offerings.length <= 0) {
    throw new Error("Refusing to replace catalog with no offerings");
  }

  const supabase = connectToDB();
  const refreshId = randomUUID();
  const batches = [
    ["offerings", catalog.offerings],
    ["sections", catalog.sections],
    ["meetings", catalog.meetings],
    ["event_packages", catalog.event_packages],
    ["package_sections", catalog.package_sections],
    ["module_routes", catalog.module_routes],
    ["professors", []],
  ] as const;
  const expectedCounts = Object.fromEntries(
    batches.map(([kind, items]) => [kind, items.length]),
  );

  const { error: beginError } = await supabase.rpc(
    "begin_class_planner_catalog_refresh",
    {
      p_expected_counts: expectedCounts,
      p_refresh_id: refreshId,
      p_term: term,
    },
  );
  throwIfError(beginError);

  try {
    for (const [kind, items] of batches) {
      for (let offset = 0; offset < items.length; offset += CATALOG_BATCH_SIZE) {
        const { error: stageError } = await supabase.rpc(
          "stage_class_planner_catalog_batch",
          {
            p_item_kind: kind,
            p_items: items.slice(offset, offset + CATALOG_BATCH_SIZE),
            p_refresh_id: refreshId,
          },
        );
        throwIfError(stageError);
      }
    }

    const { error: finalizeError } = await supabase.rpc(
      "finalize_class_planner_catalog_refresh",
      { p_refresh_id: refreshId },
    );
    throwIfError(finalizeError);
  } catch (error) {
    await supabase.rpc("fail_class_planner_catalog_refresh", {
      p_error: error instanceof Error ? error.message : "Catalog refresh failed",
      p_refresh_id: refreshId,
    });
    throw error;
  }
}

/** Upserts verified professor matches while preserving unmatched and failed rows. */
export async function upsertProfessors(professors: readonly RMP[]) {
  const supabase = connectToDB();

  for (let offset = 0; offset < professors.length; offset += PROFESSOR_BATCH_SIZE) {
    const rows = professors
      .slice(offset, offset + PROFESSOR_BATCH_SIZE)
      .map((professor) => ({
        avg_diff: professor.avgDiff,
        avg_rating: professor.avgRating,
        name: professor.name,
        name_key: professor.nameKey,
        profile_url: professor.profileUrl ?? null,
        take_again_percent: professor.takeAgainPercent,
      }));
    const { error } = await supabase
      .from("professor")
      .upsert(rows, { onConflict: "name_key" });
    throwIfError(error);
  }
}

/** Metadata recorded when an ingestion run starts. */
export type CatalogIngestionRunStart = Readonly<{
  id: string;
  trigger: string;
  requestedTerm?: string;
  workflowUrl?: string;
  professorsRequested: boolean;
}>;

/** Publication and enrichment outcome recorded when an ingestion run finishes. */
export type CatalogIngestionRunFinish = Readonly<{
  id: string;
  resolvedTerm?: string;
  catalogPublished: boolean;
  catalogCounts: object;
  professorCounts: object;
  warnings: readonly string[];
}>;

/** Starts an audited run after stale-run cleanup and overlap validation. */
export async function beginCatalogIngestionRun(input: CatalogIngestionRunStart) {
  const supabase = connectToDB();
  const { error } = await supabase.rpc("begin_catalog_ingestion_run", {
    p_professors_requested: input.professorsRequested,
    p_requested_term: input.requestedTerm ?? null,
    p_run_id: input.id,
    p_trigger: input.trigger,
    p_workflow_url: input.workflowUrl ?? null,
  });
  throwIfError(error);
}

/** Records a successful audited run, including any warning status. */
export async function completeCatalogIngestionRun(
  input: CatalogIngestionRunFinish,
) {
  const supabase = connectToDB();
  const { error } = await supabase.rpc("complete_catalog_ingestion_run", {
    p_catalog_counts: input.catalogCounts,
    p_catalog_published: input.catalogPublished,
    p_professor_counts: input.professorCounts,
    p_resolved_term: input.resolvedTerm ?? null,
    p_run_id: input.id,
    p_warnings: input.warnings,
  });
  throwIfError(error);
}

/** Records a failed audited run without changing its published data. */
export async function failCatalogIngestionRun(
  input: CatalogIngestionRunFinish & Readonly<{ error: string }>,
) {
  const supabase = connectToDB();
  const { error } = await supabase.rpc("fail_catalog_ingestion_run", {
    p_catalog_counts: input.catalogCounts,
    p_catalog_published: input.catalogPublished,
    p_error: input.error,
    p_professor_counts: input.professorCounts,
    p_resolved_term: input.resolvedTerm ?? null,
    p_run_id: input.id,
    p_warnings: input.warnings,
  });
  throwIfError(error);
}

/** Reports whether the latest requested professor phase warned or failed. */
export async function shouldRetryProfessorRefresh(): Promise<boolean> {
  const supabase = connectToDB();
  const { data, error } = await supabase.rpc("should_retry_professor_refresh");
  throwIfError(error);
  return data === true;
}

export async function getActiveTermRow() {
  const supabase = connectToDB();
  const { data, error } = await supabase
    .from("terms")
    .select("term,is_active")
    .eq("is_active", true)
    .maybeSingle();

  throwIfError(error);

  return data ? toTermDocument(data as TermRow) : null;
}

export async function searchProfessor(nameKey?: string) {
  const supabase = connectToDB();

  if (nameKey) {
    const rows = await selectProfessorRows(async (columns) => {
      const { data, error } = await supabase
        .from("professor")
        .select(columns)
        .eq("name_key", nameKey)
        .order("name", { ascending: true });
      return { data, error };
    });

    return toExactRmpDocuments(rows);
  }

  const rows: ProfessorRow[] = [];
  let offset = 0;

  while (true) {
    const page = await selectProfessorRows(async (columns) => {
      const { data, error } = await supabase
        .from("professor")
        .select(columns)
        .order("name", { ascending: true })
        .range(offset, offset + PAGE_SIZE - 1);
      return { data, error };
    });
    rows.push(...page);

    if (page.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return toExactRmpDocuments(rows);
}
