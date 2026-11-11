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
- Add course sections and custom events to a weekly calendar, with warnings for overlapping meetings.

## Environment variables

The backend reads these variables.

- `SUPABASE_URL` is the Supabase project URL.
- `SUPABASE_SERVICE_ROLE_KEY` is the service role key used by the API and catalog ingestion.
- `PORT` is the local listen port. It defaults to 3000.
- `NODE_ENV` is `production` on Vercel and `development` locally. Local development loads `backend/.env`.
- `CLASS_PLANNER_SESSION_COOKIE` is the signed-in Class Planner cookie for a manual room and booking import.

The frontend reads these variables. Vite exposes only names that start with `VITE_`.

- `VITE_API_BASE_URL` is the API origin. Local development uses `http://localhost:3000`. Production uses the deployed API origin.
- `VITE_API_BASE_FALLBACK_URL` is an optional second origin used when the primary response is unavailable.

`npm run setup` can start local Supabase and write `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` into `backend/.env`.

GitHub Actions provides `GITHUB_EVENT_NAME`, `GITHUB_SERVER_URL`, `GITHUB_REPOSITORY`, and `GITHUB_RUN_ID` to the nightly ingestion job. Those are not part of the local env files.

