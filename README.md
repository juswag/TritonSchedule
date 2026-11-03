<div align="center">
  <img src="./frontend/public/favicon.svg" alt="TritonSchedule trident logo" width="112" />
  <h1>TritonSchedule</h1>
  <h3>Making UCSD scheduling easier</h3>
  <em></em>
 <img src="https://img.shields.io/github/actions/workflow/status/wangj000/TritonSchedule/ci-cd.yml?branch=main&label=build&style=flat-square" alt="Build" />
  <img src="https://img.shields.io/github/actions/workflow/status/wangj000/TritonSchedule/ci-cd.yml?branch=main&label=tests&style=flat-square" alt="Tests" />
  <img src="https://img.shields.io/badge/license-MIT-blue?style=flat-square" alt="License: MIT" />
</div>

## Features

- Search the active UCSD Class Planner catalog by course, title, or instructor and compare lecture, discussion, and lab choices against the current schedule.
- Open the selected section combination in TSS when Class Planner supplies an official route that TritonSchedule can validate.
- Add conflict-free course sections to a weekly calendar alongside custom events.

## Nightly catalog ingestion

The nightly workflow reads the unauthenticated Class Planner public catalog:

- `GET https://classplanner.apps.ucsd.edu/api/v1/public/catalog/terms`
- `POST https://classplanner.apps.ucsd.edu/api/v1/public/catalog/courses/search`

Only the existing `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` repository
secrets are needed. No UCSD session cookie or automated sign-in is used.

Apply `20261103220246_allow_public_catalog_without_tss_routes.sql` before running
this ingestion version. It makes the TSS module ID nullable on offerings and
packages; all other table constraints and atomic publication remain in place.

The scraper uses the search response's total for pagination and rejects empty,
incomplete, inconsistent, or duplicate results before publication. A failed
refresh preserves the last published catalog. Term-summary counts can differ
from search totals and are not used to size the scrape.

Courses, sections, instructors, enrollment counts, weekly meetings, exams, and
package memberships are retained. The public feed does not supply TSS module
IDs, booking URLs, or room/building details. Those fields are stored as null,
and no module-route rows are created. A successful refresh replaces previous
location and route data rather than retaining potentially stale values.
The app continues to support course search and calendar planning; it shows
unknown locations as TBA and disables unavailable TSS links.

Available terms and data freshness depend on UCSD. A successful scrape does not
prove that seat counts were refreshed at the same time.

After applying migrations and configuring the existing database environment,
run ingestion locally or dispatch the nightly workflow manually:

```sh
cd backend
npm ci
npm run ingest -- --professors=never
```
