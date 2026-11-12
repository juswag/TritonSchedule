alter table private.catalog_ingestion_runs
  add column kind text not null default 'nightly';

alter table private.catalog_ingestion_runs
  add constraint catalog_ingestion_runs_kind
  check (kind in ('nightly', 'seats'));

alter table public.class_planner_sections
  add column seats_updated_at timestamptz;

alter table public.class_planner_course_offerings
  add column seats_updated_at timestamptz;

create function private.lock_catalog_ingestion()
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(741632871004);
end;
$$;

create function private.lock_catalog_replace()
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(741632871003);
end;
$$;

create function private.try_lock_catalog_replace()
returns boolean
language sql
security invoker
set search_path = ''
as $$
  select pg_try_advisory_xact_lock(741632871003);
$$;

revoke all on function private.lock_catalog_ingestion() from public, anon, authenticated;
revoke all on function private.lock_catalog_replace() from public, anon, authenticated;
revoke all on function private.try_lock_catalog_replace() from public, anon, authenticated;
grant execute on function private.lock_catalog_ingestion() to service_role;
grant execute on function private.lock_catalog_replace() to service_role;
grant execute on function private.try_lock_catalog_replace() to service_role;

create function private.maintain_catalog_ingestion_runs()
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update private.class_planner_catalog_refreshes
  set
    status = 'failed',
    error_message = 'Catalog refresh abandoned after four hours',
    completed_at = now()
  where status = 'staging'
    and created_at < now() - interval '4 hours';

  delete from private.class_planner_catalog_refresh_items as item
  using private.class_planner_catalog_refreshes as refresh
  where item.refresh_id = refresh.id
    and refresh.status = 'failed';

  update private.catalog_ingestion_runs
  set
    status = 'failed',
    error_message = 'Ingestion run abandoned after four hours',
    completed_at = now()
  where status = 'running'
    and kind = 'nightly'
    and started_at < now() - interval '4 hours';

  update private.catalog_ingestion_runs
  set
    status = 'failed',
    error_message = 'Seat poll abandoned after 20 minutes',
    completed_at = now()
  where status = 'running'
    and kind = 'seats'
    and started_at < now() - interval '20 minutes';

  delete from private.catalog_ingestion_runs
  where kind = 'nightly'
    and started_at < now() - interval '90 days';

  delete from private.catalog_ingestion_runs
  where kind = 'seats'
    and started_at < now() - interval '14 days';

  delete from private.class_planner_catalog_refreshes
  where status in ('complete', 'failed')
    and created_at < now() - interval '90 days';
end;
$$;

revoke all on function private.maintain_catalog_ingestion_runs()
from public, anon, authenticated;
grant execute on function private.maintain_catalog_ingestion_runs()
to service_role;

create or replace function public.begin_catalog_ingestion_run(
  p_run_id uuid,
  p_trigger text,
  p_requested_term text,
  p_workflow_url text,
  p_professors_requested boolean
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform private.lock_catalog_ingestion();
  perform private.maintain_catalog_ingestion_runs();

  if exists (
    select 1
    from private.catalog_ingestion_runs
    where status = 'running'
      and kind = 'nightly'
  ) then
    raise exception 'another catalog ingestion run is already active';
  end if;

  p_requested_term := nullif(upper(trim(p_requested_term)), '');

  if p_run_id is null then
    raise exception 'run id is required';
  end if;

  if coalesce(length(trim(p_trigger)), 0) = 0 then
    raise exception 'trigger is required';
  end if;

  if p_requested_term is not null
     and p_requested_term !~ '^[A-Z0-9]{4,6}$' then
    raise exception 'requested term is invalid';
  end if;

  insert into private.catalog_ingestion_runs (
    id,
    trigger_name,
    requested_term,
    workflow_url,
    professors_requested
  ) values (
    p_run_id,
    left(trim(p_trigger), 100),
    p_requested_term,
    nullif(left(trim(p_workflow_url), 2000), ''),
    coalesce(p_professors_requested, false)
  );
end;
$$;

create function public.claim_seat_poll_run(
  p_run_id uuid,
  p_trigger text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  skip_reason text;
begin
  perform private.lock_catalog_ingestion();
  perform private.maintain_catalog_ingestion_runs();

  if p_run_id is null then
    raise exception 'run id is required';
  end if;

  if coalesce(length(trim(p_trigger)), 0) = 0 then
    raise exception 'trigger is required';
  end if;

  if exists (
    select 1
    from private.catalog_ingestion_runs
    where status = 'running'
      and kind = 'nightly'
  ) then
    skip_reason := 'nightly';
  elsif exists (
    select 1
    from private.catalog_ingestion_runs
    where status = 'running'
      and kind = 'seats'
  ) then
    skip_reason := 'poll';
  end if;

  if skip_reason is not null then
    insert into private.catalog_ingestion_runs (
      id,
      trigger_name,
      kind,
      professors_requested,
      status,
      catalog_counts,
      completed_at
    ) values (
      p_run_id,
      left(trim(p_trigger), 100),
      'seats',
      false,
      'succeeded',
      jsonb_build_object('outcome', 'skipped', 'reason', skip_reason),
      now()
    );

    return jsonb_build_object('status', 'skipped', 'reason', skip_reason);
  end if;

  insert into private.catalog_ingestion_runs (
    id,
    trigger_name,
    kind,
    professors_requested
  ) values (
    p_run_id,
    left(trim(p_trigger), 100),
    'seats',
    false
  );

  return jsonb_build_object('status', 'started');
end;
$$;

create function public.apply_seat_updates(
  p_run_id uuid,
  p_term text,
  p_sections jsonb,
  p_offerings jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
set statement_timeout = '2min'
as $$
declare
  lock_acquired boolean;
  skip_reason text;
  changed_count integer := 0;
  matched_count integer := 0;
  unknown_count integer := 0;
  offerings_updated integer := 0;
  offering_ids bigint[];
  result jsonb;
begin
  if not exists (
    select 1
    from private.catalog_ingestion_runs
    where id = p_run_id
      and kind = 'seats'
      and status = 'running'
  ) then
    raise exception 'active seat poll run does not exist';
  end if;

  p_term := nullif(upper(trim(p_term)), '');

  if p_term is null or p_term !~ '^[A-Z0-9]{4,6}$' then
    raise exception 'seat update term is invalid';
  end if;

  if p_sections is null or jsonb_typeof(p_sections) <> 'array' then
    raise exception 'seat update payload must be an array';
  end if;

  if jsonb_array_length(p_sections) = 0 then
    result := jsonb_build_object(
      'applied', true,
      'changed', 0,
      'unchanged', 0,
      'unknown', 0,
      'offeringsUpdated', 0
    );

    update private.catalog_ingestion_runs
    set
      resolved_term = p_term,
      status = 'succeeded',
      catalog_published = false,
      catalog_counts = result,
      completed_at = now()
    where id = p_run_id
      and status = 'running';

    return result;
  end if;

  drop table if exists pg_temp.seat_update_input;
  create temp table seat_update_input (
    section_id text,
    capacity integer,
    enrolled integer,
    seats_available integer,
    waitlist_capacity integer,
    waitlist_enrolled integer,
    waitlist_available integer,
    status text
  ) on commit drop;

  drop table if exists pg_temp.seat_offering_input;
  create temp table seat_offering_input (
    section_id text,
    open_section_count integer,
    open_seat_count integer,
    waitlist_available_count integer
  ) on commit drop;

  insert into pg_temp.seat_update_input (
    section_id,
    capacity,
    enrolled,
    seats_available,
    waitlist_capacity,
    waitlist_enrolled,
    waitlist_available,
    status
  )
  select
    nullif(btrim(item ->> 'section_id'), ''),
    (item ->> 'capacity')::integer,
    (item ->> 'enrolled')::integer,
    (item ->> 'seats_available')::integer,
    (item ->> 'waitlist_capacity')::integer,
    (item ->> 'waitlist_enrolled')::integer,
    (item ->> 'waitlist_available')::integer,
    item ->> 'status'
  from jsonb_array_elements(p_sections) as item;

  if p_offerings is null or jsonb_typeof(p_offerings) <> 'array' then
    raise exception 'seat update offerings must be an array';
  end if;

  insert into pg_temp.seat_offering_input (
    section_id,
    open_section_count,
    open_seat_count,
    waitlist_available_count
  )
  select
    nullif(btrim(section_id), ''),
    (offering ->> 'open_section_count')::integer,
    (offering ->> 'open_seat_count')::integer,
    (offering ->> 'waitlist_available_count')::integer
  from jsonb_array_elements(p_offerings) as offering
  cross join lateral jsonb_array_elements_text(
    case
      when jsonb_typeof(offering -> 'section_ids') = 'array' then offering -> 'section_ids'
      else '[]'::jsonb
    end
  ) as section_id;

  if exists (
    select 1
    from pg_temp.seat_update_input
    where section_id is null
  ) then
    raise exception 'seat update payload contains an invalid section id';
  end if;

  if exists (
    select 1
    from pg_temp.seat_update_input
    group by section_id
    having count(*) > 1
  ) then
    raise exception 'seat update payload contains duplicate section ids';
  end if;

  if exists (
    select 1
    from pg_temp.seat_update_input
    where capacity < 0
      or enrolled < 0
      or seats_available < 0
      or waitlist_capacity < 0
      or waitlist_enrolled < 0
      or waitlist_available < 0
  ) then
    raise exception 'seat update payload contains invalid seat values';
  end if;

  if exists (
    select 1
    from pg_temp.seat_offering_input
    where section_id is null
      or open_section_count is null
      or open_seat_count is null
      or waitlist_available_count is null
      or open_section_count < 0
      or open_seat_count < 0
      or waitlist_available_count < 0
  ) then
    raise exception 'seat update payload contains invalid offering rollups';
  end if;

  if exists (
    select 1
    from pg_temp.seat_offering_input
    group by section_id
    having count(distinct row(
      open_section_count,
      open_seat_count,
      waitlist_available_count
    )) > 1
  ) then
    raise exception 'seat update payload disagrees on offering rollups';
  end if;

  if exists (
    select 1
    from pg_temp.seat_update_input as incoming
    join public.class_planner_sections as section
      on section.term_code = p_term
     and section.section_id = incoming.section_id
    left join pg_temp.seat_offering_input as rollup
      on rollup.section_id = incoming.section_id
    where rollup.section_id is null
      and (
        section.capacity is distinct from incoming.capacity
        or section.enrolled is distinct from incoming.enrolled
        or section.seats_available is distinct from incoming.seats_available
        or section.waitlist_capacity is distinct from incoming.waitlist_capacity
        or section.waitlist_enrolled is distinct from incoming.waitlist_enrolled
        or section.waitlist_available is distinct from incoming.waitlist_available
        or section.status is distinct from incoming.status
      )
  ) then
    raise exception 'seat update payload is missing an offering rollup';
  end if;

  lock_acquired := private.try_lock_catalog_replace();

  if not lock_acquired then
    skip_reason := 'locked';
  elsif exists (
    select 1
    from private.class_planner_catalog_refreshes
    where term_code = p_term
      and status = 'staging'
  ) then
    skip_reason := 'replace';
  end if;

  if skip_reason is not null then
    result := jsonb_build_object(
      'applied', false,
      'reason', skip_reason,
      'changed', 0,
      'unchanged', 0,
      'unknown', 0,
      'offeringsUpdated', 0
    );

    update private.catalog_ingestion_runs
    set
      resolved_term = p_term,
      status = 'succeeded',
      catalog_published = false,
      catalog_counts = result,
      completed_at = now()
    where id = p_run_id
      and status = 'running';

    return result;
  end if;

  with updated as (
    update public.class_planner_sections as section
    set
      capacity = incoming.capacity,
      enrolled = incoming.enrolled,
      seats_available = incoming.seats_available,
      waitlist_capacity = incoming.waitlist_capacity,
      waitlist_enrolled = incoming.waitlist_enrolled,
      waitlist_available = incoming.waitlist_available,
      status = incoming.status,
      seats_updated_at = now()
    from pg_temp.seat_update_input as incoming
    where section.term_code = p_term
      and section.section_id = incoming.section_id
      and (
        section.capacity is distinct from incoming.capacity
        or section.enrolled is distinct from incoming.enrolled
        or section.seats_available is distinct from incoming.seats_available
        or section.waitlist_capacity is distinct from incoming.waitlist_capacity
        or section.waitlist_enrolled is distinct from incoming.waitlist_enrolled
        or section.waitlist_available is distinct from incoming.waitlist_available
        or section.status is distinct from incoming.status
      )
    returning section.offering_id
  )
  select
    coalesce(array_agg(distinct offering_id), '{}'::bigint[]),
    count(*)::integer
  into offering_ids, changed_count
  from updated;

  select count(*)::integer
  into matched_count
  from pg_temp.seat_update_input as incoming
  join public.class_planner_sections as section
    on section.term_code = p_term
   and section.section_id = incoming.section_id;

  unknown_count := (select count(*)::integer from pg_temp.seat_update_input) - matched_count;

  update public.class_planner_course_offerings as offering
  set
    open_section_count = rollup.open_section_count,
    open_seat_count = rollup.open_seat_count,
    waitlist_available_count = rollup.waitlist_available_count,
    seats_updated_at = now()
  from (
    select distinct on (section.offering_id)
      section.offering_id,
      incoming.open_section_count,
      incoming.open_seat_count,
      incoming.waitlist_available_count
    from public.class_planner_sections as section
    join pg_temp.seat_offering_input as incoming
      on incoming.section_id = section.section_id
    where section.term_code = p_term
      and section.offering_id = any(offering_ids)
    order by section.offering_id
  ) as rollup
  where offering.id = rollup.offering_id
    and (
      offering.open_section_count is distinct from rollup.open_section_count
      or offering.open_seat_count is distinct from rollup.open_seat_count
      or offering.waitlist_available_count is distinct from rollup.waitlist_available_count
    );

  get diagnostics offerings_updated = row_count;

  result := jsonb_build_object(
    'applied', true,
    'changed', changed_count,
    'unchanged', matched_count - changed_count,
    'unknown', unknown_count,
    'offeringsUpdated', offerings_updated
  );

  update private.catalog_ingestion_runs
  set
    resolved_term = p_term,
    status = case
      when unknown_count > 0 then 'succeeded_with_warnings'
      else 'succeeded'
    end,
    catalog_published = false,
    catalog_counts = result,
    warning_messages = case
      when unknown_count > 0
        then array['Class Planner returned sections that are not in the stored catalog']
      else '{}'::text[]
    end,
    completed_at = now()
  where id = p_run_id
    and status = 'running';

  return result;
end;
$$;

revoke all on function public.claim_seat_poll_run(uuid, text)
from public, anon, authenticated;
revoke all on function public.apply_seat_updates(uuid, text, jsonb, jsonb)
from public, anon, authenticated;

grant execute on function public.claim_seat_poll_run(uuid, text)
to service_role;
grant execute on function public.apply_seat_updates(uuid, text, jsonb, jsonb)
to service_role;

do $$
declare
  definition text := pg_get_functiondef('public.finalize_class_planner_catalog_refresh(uuid)'::regprocedure);
  rewritten text;
begin
  rewritten := replace(
    definition,
    'perform pg_advisory_xact_lock(741632871003);',
    'perform private.lock_catalog_replace();'
  );
  if rewritten = definition then
    raise exception 'catalog replace lock call was not found';
  end if;
  execute rewritten;
end $$;
