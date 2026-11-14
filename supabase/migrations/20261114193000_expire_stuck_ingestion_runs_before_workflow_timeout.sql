-- Expire a stuck nightly ingestion row before the 180 minute workflow timeout.
-- Seat polling moved this maintenance into private.maintain_catalog_ingestion_runs.
-- This migration runs after that change and only shortens the nightly timeout to 150 minutes.
-- Seat-poll expiry, retention, and kind filters stay as they are.
-- It does not replace public.begin_catalog_ingestion_run.
create or replace function private.maintain_catalog_ingestion_runs()
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
    error_message = 'Ingestion run abandoned after 150 minutes',
    completed_at = now()
  where status = 'running'
    and kind = 'nightly'
    and started_at < now() - interval '150 minutes';

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
