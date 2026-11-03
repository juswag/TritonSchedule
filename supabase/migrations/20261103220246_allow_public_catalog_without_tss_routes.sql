-- The public catalog supplies package/section IDs, but no TSS module IDs or URLs.
-- Preserve these relationships without inventing identifiers for missing routes.
alter table public.class_planner_course_offerings
  alter column module_id drop not null;

alter table public.tss_event_packages
  alter column module_id drop not null;
