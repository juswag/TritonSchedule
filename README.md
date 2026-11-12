<div align="center">
  <img src="./frontend/public/favicon.svg" alt="TritonSchedule trident logo" width="112" />
  <h1>TritonSchedule</h1>
  <h3>Making UCSD scheduling easier</h3>
  <em></em>
 <img src="https://img.shields.io/github/actions/workflow/status/wangj000/TritonSchedule/ci-cd.yml?branch=main&label=build&style=flat-square" alt="Build" />
  <img src="https://img.shields.io/github/actions/workflow/status/wangj000/TritonSchedule/ci-cd.yml?branch=main&label=tests&style=flat-square" alt="Tests" />
  <img src="https://img.shields.io/badge/license-MIT-blue?style=flat-square" alt="License: MIT" />
</div>

## Environment

GitHub Actions polls seats every 15 minutes. Set the repository Actions variable `SEAT_POLL_BASE_URL` to the production backend origin and the Actions secret `CRON_SECRET` to the same value used by the backend. See [seat polling setup](backend/README.md#seat-polling).

## Features

- Search the active UCSD Class Planner catalog by course, title, or instructor and compare lecture, discussion, and lab choices against the current schedule.
- Open the selected section combination in TSS when Class Planner supplies an official route that TritonSchedule can validate.
- Add course sections and custom events to a weekly calendar, with warnings for overlapping meetings.

