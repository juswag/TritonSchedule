import type { Course } from "./Course.js";

export type ClassPlannerTerm = Readonly<{
  term_code: string;
  term_name: string | null;
  calendar_year: number | null;
  course_count: number;
  section_count: number;
  meeting_count: number;
  last_full_refresh_at: string | null;
  configured: boolean;
}>;

export type ClassPlannerMeeting = Readonly<{
  meeting_kind: string;
  day_code: string | null;
  day_name: string | null;
  specific_date: string | null;
  start_minutes: number | null;
  end_minutes: number | null;
  start_time_display: string | null;
  end_time_display: string | null;
  building_code: string | null;
  room_code: string | null;
  building_name: string | null;
  room_name: string | null;
  is_remote: boolean;
  is_tba: boolean;
}>;

export type ClassPlannerSection = Readonly<{
  section_id: string;
  section_ref: string;
  section_code: string;
  instruction_type_name: string;
  event_package_ids: string[];
  capacity: number | null;
  enrolled: number | null;
  seats_available: number | null;
  waitlist_capacity: number | null;
  waitlist_enrolled: number | null;
  waitlist_available: number | null;
  status: string | null;
  seats_updated_at?: string | null;
  ingested_at?: string | null;
  instructors: string[];
  meetings: ClassPlannerMeeting[];
}>;

export type ClassPlannerCourse = Readonly<{
  term_code: string;
  subject_code: string;
  course_code: string;
  module_code: string;
  module_name: string;
  course_title: string | null;
  section_count: number;
  open_section_count: number;
  open_seat_count: number;
  waitlist_available_count: number;
  instruction_types: string[];
  instructors: string[];
  availability_refresh_pending: boolean;
  is_topic_course: boolean;
  section_family: string | null;
  subject_name: string | null;
  academic_level: string | null;
  matching_section_count: number;
  units_display: string | null;
  prerequisites: unknown[];
  restrictions: unknown[];
  metadata_source: string | null;
  sections: ClassPlannerSection[];
}>;

export type ClassPlannerResolvedRoute = Readonly<{
  source_key: string;
  module_id: string;
  representative_event_package_id: string | null;
  tss_url: string | null;
}>;

export type ClassPlannerOfferingRecord = Readonly<{
  source_key: string;
  term_code: string;
  subject_code: string;
  course_code: string;
  module_code: string;
  module_id: string | null;
  module_name: string;
  course_title: string | null;
  section_count: number;
  open_section_count: number;
  open_seat_count: number;
  waitlist_available_count: number;
  instruction_types: string[];
  instructors: string[];
  availability_refresh_pending: boolean;
  is_topic_course: boolean;
  section_family: string | null;
  subject_name: string | null;
  academic_level: string | null;
  matching_section_count: number;
  units_display: string | null;
  prerequisites: unknown[];
  restrictions: unknown[];
  metadata_source: string | null;
}>;

export type ClassPlannerSectionRecord = Readonly<{
  source_key: string;
  term_code: string;
  section_id: string;
  section_ref: string;
  section_code: string;
  instruction_type_name: string;
  capacity: number | null;
  enrolled: number | null;
  seats_available: number | null;
  waitlist_capacity: number | null;
  waitlist_enrolled: number | null;
  waitlist_available: number | null;
  status: string | null;
  instructors: string[];
}>;

export type ClassPlannerMeetingRecord = ClassPlannerMeeting &
  Readonly<{
    term_code: string;
    section_id: string;
    meeting_ordinal: number;
  }>;

export type ClassPlannerEventPackageRecord = Readonly<{
  source_key: string;
  term_code: string;
  module_id: string | null;
  event_package_id: string;
  tss_booking_url: string | null;
}>;

export type ClassPlannerPackageSectionRecord = Readonly<{
  source_key: string;
  term_code: string;
  event_package_id: string;
  section_id: string;
}>;

export type ClassPlannerModuleRouteRecord = Readonly<{
  source_key: string;
  term_code: string;
  module_id: string;
  route_kind: "event_package" | "module";
  representative_event_package_id: string | null;
  academic_year: string | null;
  academic_period: string | null;
  tss_url: string;
}>;

export type ClassPlannerCatalogSnapshot = Readonly<{
  offerings: ClassPlannerOfferingRecord[];
  sections: ClassPlannerSectionRecord[];
  meetings: ClassPlannerMeetingRecord[];
  event_packages: ClassPlannerEventPackageRecord[];
  package_sections: ClassPlannerPackageSectionRecord[];
  module_routes: ClassPlannerModuleRouteRecord[];
}>;

export type ClassPlannerScrape = Readonly<{
  term: string;
  courses: ClassPlannerCourse[];
  routes: ClassPlannerResolvedRoute[];
}>;

export type ClassPlannerIngestResult = Readonly<{
  term: string;
  courses: Course[];
  catalog: ClassPlannerCatalogSnapshot;
}>;
