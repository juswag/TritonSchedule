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

The `Nightly catalog ingestion` workflow reads UCSD Class Planner and publishes
the catalog using the existing `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`
repository secrets. Class Planner now requires UCSD sign-in: anonymous requests
to `/api/v1/planner/terms` return HTTP 401, and `/start` redirects to login.

For session-based access, set the repository Actions secret
`CLASS_PLANNER_SESSION_COOKIE` to the Cookie header value from an authorized,
signed-in Class Planner API request. Supply only the cookie name/value pairs,
not a `Cookie:` prefix, `Set-Cookie` attributes, or a UCSD password. Use only a
session authorized for this ingestion. The workflow exposes it only to the
ingestion step; do not commit it or paste it into logs or issues.

For local ingestion, provide the same variable through the process environment
or an untracked `backend/.env`, then run:

```sh
cd backend
npm ci
npm run ingest -- --professors=never
```

The scraper includes the session on term discovery, all catalog pages, and TSS
route lookups. Authentication errors and redirects fail the run before catalog
publication, preserving the last published catalog. A missing or expired session
produces an error naming the secret to set or refresh.

Session cookies expire. This supports a supplied session; it does not automate
UCSD sign-in, MFA, or session renewal. Reliable unattended access still needs a
UCSD-approved credential and renewal process. A passing unit-test run does not
verify that a supplied session is accepted by UCSD. After configuring the secret,
run the workflow manually and check catalog publication before relying on the
nightly schedule.
