# TritonSchedule backend

This package serves the TritonSchedule API and runs the Class Planner catalog and Rate My Professors ingestion jobs.

## Directory layout

```text
backend/
├── src/                    # Production TypeScript
│   ├── controllers/        # HTTP request handlers
│   ├── ingestion/          # Class Planner and professor ingestion jobs
│   ├── middleware/         # Express middleware
│   ├── models/             # Shared domain types
│   ├── routes/             # Express route definitions
│   ├── services/           # Database integration
│   ├── utils/              # Small reusable helpers
│   ├── app.ts              # Express app configuration and Vercel entry point
│   └── server.ts           # Local and standalone server entry point
├── tests/                  # Automated tests and test setup
├── dist/                   # Generated production JavaScript
├── .env.example            # Local environment template
├── jest.config.cjs         # Test runner configuration
├── tsconfig.json           # Editor and full-project type checking
├── tsconfig.build.json     # Production-only compiler configuration
└── vercel.json             # Vercel build configuration
```

`dist/` is generated and must not be committed.
Its structure mirrors `src/` directly, so the server entry point is `dist/server.js` rather than `dist/src/server.js`.
Tests stay outside `src/` and are never emitted into the production build.

## Development

Install dependencies from this directory with `npm ci`.

Run the backend with automatic restart:

```bash
npm run dev
```

The repository-level `npm run dev` starts both the frontend and this backend in watch mode.
Use the repository-level `npm run setup` first to create environment files, align the frontend and backend API keys, and install all workspace dependencies.
The root [`README.md`](../README.md#environment-variables) documents every environment variable and the optional local Supabase setup.

## Course search and TSS metadata

`GET /course?course=<query>&term=<term>` responds with `{ data: Course[] }` and returns one course record for each matching primary section.
Primary sections include lecture, independent study, and seminar instruction types, including the Class Planner codes `LE`, `IN`, and `SE`.
Lecture, discussion, and lab entries retain the display fields `Days`, `Time`, and `Location` and may include the following Class Planner identifiers:

| Field | Meaning |
| --- | --- |
| `SectionId` | Class Planner section identifier. |
| `SectionRef` | Term-qualified Class Planner section reference. |
| `SectionCode` | Display code for the section. |
| `EventPackageIds` | TSS event packages that contain the section. |

Course records may also include `TssPackageUrls`, which maps event package IDs to their official TSS booking URLs for that primary section.
When Class Planner provides a module route instead of event-package deep links, the record exposes it as `TssFallbackUrl`.
These fields are optional because not every course or section combination has a valid TSS destination.
The frontend enables **Open in TSS** only after it resolves one package shared by the selected lecture, discussion, and lab, or a valid module fallback, and validates the exact HTTPS `tss.ucsd.edu/fiori` route before opening a new tab.

## Verification

```bash
npm run typecheck
npm run lint
npm test
npm run build
npm start
```

The first three commands validate source and test code.
The build command clears stale output and compiles production code only.
The start command runs the compiled server from `dist/server.js`.
Use `npm run test:watch` for interactive test development and `npm run clean` to remove generated build output.

## Catalog ingestion

Apply the Supabase migrations before running ingestion so the atomic catalog refresh and private ingestion audit functions are available.
The command requires `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`:

```bash
npm run ingest -- --term=FA26 --professors=auto
```

`--term` is optional and otherwise lets Class Planner select its current term.
`--professors` accepts the following modes and defaults to `auto`:

| Mode | Behavior |
| --- | --- |
| `auto` | Refresh ratings on Sunday in `America/Chicago`, or retry after the latest requested professor phase failed or completed with warnings. |
| `always` | Refresh ratings during this run. |
| `never` | Publish only the catalog. |

The job stages and atomically publishes a non-empty catalog before requesting professor ratings.
Professor requests use the Rate My Professors GraphQL API with a 30-second timeout, at most three attempts for network, rate-limit, and server failures, serialized requests, and longer exponential backoff after rate limits.
Partial professor failures update successful ratings, preserve previously stored ratings for failed requests, emit workflow warnings, and record `succeeded_with_warnings`.
If the school lookup fails or no professor request succeeds, the command exits unsuccessfully after recording the professor-phase failure; it does not roll back the published catalog or replace existing ratings.

Each run writes counts, warnings, publication state, and the workflow URL to `private.catalog_ingestion_runs` through service-role-only functions.
Starting a run rejects overlap with another active nightly run, marks nightly runs older than four hours as failed, and removes nightly audit rows and completed or failed catalog-refresh records older than 90 days.

`GET /api/seats/poll` refreshes seat counts between nightly publishes. Vercel Cron calls it every 15 minutes with `Authorization: Bearer <CRON_SECRET>`. A missing or wrong token returns 401 and does not scrape. The poll reuses the public Class Planner catalog search. `apply_seat_updates` then updates only section rows whose seat, enrollment, waitlist, or status values changed. Unknown section ids are counted and left for the nightly sync. A failed or partial scrape writes no seat rows. Seat poll audit rows use `kind = 'seats'` and are deleted after 14 days. A running seat poll does not block the nightly job. The nightly replace and a seat write share one advisory lock. An overlapping poll skips.

Set `CRON_SECRET` on the backend Vercel project. Vercel Cron sends that value as a bearer token. The `*/15` schedule needs a plan that allows crons more than once per day. Hobby plans allow a daily cron only. The poll function allows up to 300 seconds so a full catalog scrape can finish on Pro.

### Manual room and booking import

For a manual refresh, set `CLASS_PLANNER_SESSION_COOKIE` to a current signed-in Class Planner Cookie header. From the backend directory, run `npm run ingest:details -- WI27`. Add `--preview` to check counts before writing. Nightly ingestion uses the public API and cannot replace these separately stored details.

Course search attaches these details by term, course, and section ID. Rooms also require a matching meeting kind, date, day, and time. A rescheduled meeting displays an unknown location until a new import matches it.

## Deployment

Vercel uses `src/app.ts` directly as its Express entry point.
The app is exported separately from `src/server.ts` so serverless deployment does not create a long-lived listener, while local and standalone deployments can still use `npm start`.

The GitHub Actions workflow in [`.github/workflows/nightly-ingestion.yml`](../.github/workflows/nightly-ingestion.yml) runs catalog ingestion outside the Vercel request lifecycle.
It runs nightly at 3:17 AM in `America/Chicago` and also supports manual term and professor-mode inputs.
Manual dispatches preselect `always` so an operator-requested run refreshes professor ratings by default, while scheduled runs continue using `auto`.
Configure `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` as repository Actions secrets before enabling or dispatching it.
