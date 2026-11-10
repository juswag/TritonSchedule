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

## Catalog locations and booking links

Nightly ingestion uses the public Class Planner API for schedules, exams, seats, and available event-package IDs. Before a term's first enrollment window, run the [manual details import](backend/README.md#manual-room-and-booking-import) to add rooms and TSS booking links. Repeat it when assignments change. Public refreshes preserve the saved details for matching sections and meetings.

Apply the Supabase migrations before deploying the course API or the manual importer.
