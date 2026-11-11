-- Expire a stuck running ingestion row before the 180 minute workflow timeout.
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
  perform pg_advisory_xact_lock(741632871004);

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
    error_message = 'Ingestion run abandoned after 150 minutes',
    completed_at = now()
  where status = 'running'
    and started_at < now() - interval '150 minutes';

  if exists (
    select 1
    from private.catalog_ingestion_runs
    where status = 'running'
  ) then
    raise exception 'another catalog ingestion run is already active';
  end if;

  delete from private.catalog_ingestion_runs
  where started_at < now() - interval '90 days';

  delete from private.class_planner_catalog_refreshes
  where status in ('complete', 'failed')
    and created_at < now() - interval '90 days';

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
