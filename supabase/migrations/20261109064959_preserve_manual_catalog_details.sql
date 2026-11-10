-- The public catalog replaces its row IDs on every refresh. Keep signed-in
-- details under UCSD's term and section IDs, independent of that cascade.
create table public.class_planner_manual_section_details (
  term_code text not null,
  section_id text not null,
  module_code text not null,
  module_id text,
  rooms jsonb not null,
  packages jsonb not null,
  route jsonb,
  imported_at timestamptz not null default now(),
  primary key (term_code, section_id)
);

alter table public.class_planner_manual_section_details enable row level security;
revoke all on public.class_planner_manual_section_details from public, anon, authenticated;
grant select, insert, delete on public.class_planner_manual_section_details to service_role;

-- PostgREST embeds this as one optional object for each current section.
create function public.manual_details(s public.class_planner_sections)
returns setof public.class_planner_manual_section_details
rows 1
language sql stable security invoker set search_path = ''
as $$
  select d.* from public.class_planner_manual_section_details d
  join public.class_planner_course_offerings o on o.id = s.offering_id
  where d.term_code = s.term_code and d.section_id = s.section_id
    and d.module_code = o.module_code;
$$;
revoke all on function public.manual_details(public.class_planner_sections) from public, anon, authenticated;
grant execute on function public.manual_details(public.class_planner_sections) to service_role;

create function private.class_planner_room_detail(m jsonb)
returns jsonb language sql immutable set search_path = ''
as $$
  select jsonb_build_object(
    'meeting_kind', m->'meeting_kind', 'day_code', m->'day_code',
    'specific_date', m->'specific_date', 'start_minutes', m->'start_minutes',
    'end_minutes', m->'end_minutes', 'is_remote', m->'is_remote',
    'building_code', m->'building_code', 'room_code', m->'room_code',
    'building_name', m->'building_name', 'room_name', m->'room_name'
  );
$$;
revoke all on function private.class_planner_room_detail(jsonb) from public, anon, authenticated;
grant execute on function private.class_planner_room_detail(jsonb) to service_role;

-- Preserve enriched rows already present when upgrading an existing catalog.
insert into public.class_planner_manual_section_details
  (term_code, section_id, module_code, module_id, rooms, packages, route, imported_at)
select s.term_code, s.section_id, o.module_code, o.module_id,
       coalesce(m.rooms, '[]'), coalesce(p.packages, '[]'),
       to_jsonb(r) - 'offering_id' - 'ingested_at', s.ingested_at
from public.class_planner_sections s
join public.class_planner_course_offerings o on o.id = s.offering_id
left join public.tss_module_routes r on r.offering_id = o.id
left join lateral (
  select jsonb_agg(private.class_planner_room_detail(to_jsonb(m))) as rooms
  from public.class_planner_section_meetings m
  where m.section_id = s.id
    and coalesce(m.building_code, m.room_code, m.building_name, m.room_name) is not null
) m on true
left join lateral (
  select jsonb_agg(to_jsonb(p) - 'id' - 'offering_id' - 'ingested_at') as packages
  from public.tss_event_package_sections ps
  join public.tss_event_packages p on p.id = ps.event_package_id
  where ps.section_id = s.id and (p.tss_booking_url is not null or p.module_id is not null)
) p on true
where m.rooms is not null or p.packages is not null or r.offering_id is not null or o.module_id is not null;

-- Reuse the catalog batch uploader. Only this finalizer writes manual details.
create function public.finalize_class_planner_manual_details(p_refresh_id uuid)
returns void language plpgsql security invoker set search_path = '' set statement_timeout = '5min'
as $$
declare
  refresh private.class_planner_catalog_refreshes%rowtype;
  inserted_count integer;
begin
  select * into strict refresh from private.class_planner_catalog_refreshes
  where id = p_refresh_id for update;
  if refresh.status <> 'staging' then
    raise exception 'manual catalog import is not ready to finalize';
  end if;
  perform pg_advisory_xact_lock(741632872, hashtext(refresh.term_code));

  if (refresh.expected_counts->>'sections')::int <= 0 or exists (
    select 1
    from jsonb_each_text(refresh.expected_counts) c
    left join (
      select item_kind, count(*) as n from private.class_planner_catalog_refresh_items
      where refresh_id = p_refresh_id group by item_kind
    ) actual on actual.item_kind = c.key
    where c.value::int <> coalesce(actual.n, 0)
  ) then
    raise exception 'incomplete manual catalog import';
  end if;

  delete from public.class_planner_manual_section_details where term_code = refresh.term_code;
  with items as not materialized (
    select item_kind, item_key, payload from private.class_planner_catalog_refresh_items
    where refresh_id = p_refresh_id
  ), rooms as (
    select payload->>'section_id' as section_id,
      jsonb_agg(private.class_planner_room_detail(payload)) as rooms
    from items where item_kind = 'meetings' group by 1
  ), packages as (
    select ps.payload->>'section_id' as section_id, jsonb_agg(p.payload - 'source_key') as packages
    from items ps join items p on p.item_kind = 'event_packages'
      and p.item_key = private.class_planner_refresh_item_key('event_packages', ps.payload)
    where ps.item_kind = 'package_sections' group by 1
  )
  insert into public.class_planner_manual_section_details
    (term_code, section_id, module_code, module_id, rooms, packages, route)
  select refresh.term_code, s.item_key, o.payload->>'module_code', o.payload->>'module_id',
         coalesce(m.rooms, '[]'), coalesce(p.packages, '[]'), r.payload - 'source_key'
  from items s
  join items o on o.item_kind = 'offerings' and o.item_key = s.payload->>'source_key'
  left join items r on r.item_kind = 'module_routes' and r.item_key = o.item_key
  left join rooms m on m.section_id = s.item_key
  left join packages p on p.section_id = s.item_key
  where s.item_kind = 'sections';

  get diagnostics inserted_count = row_count;
  if inserted_count <> (refresh.expected_counts->>'sections')::int then
    raise exception 'manual catalog import has sections without a course';
  end if;
  update private.class_planner_catalog_refreshes set status = 'complete', completed_at = now()
  where id = p_refresh_id;
  delete from private.class_planner_catalog_refresh_items where refresh_id = p_refresh_id;
end;
$$;

revoke all on function public.finalize_class_planner_manual_details(uuid) from public, anon, authenticated;
grant execute on function public.finalize_class_planner_manual_details(uuid) to service_role;
