# JobIntel — Job Application Intelligence Platform (Phase 1)

A personal recruiting-intelligence system: discovers job and internship postings from public ATS APIs as early as
possible, de-duplicates and classifies them, scores them against your profile, and gives you one dashboard to apply
and track your pipeline.

> **Honest status.** Phases 1–3, the achievable parts of Phase 4, and a hardening/"speed to apply" step are implemented (see "What's built" and "Not built" below).
>
> **What has and hasn't been verified.** The worker has **94 Python tests (74 run without a database)** (`npm run worker:test`) and the dependency-free TypeScript libraries have **29 tests**
> (`npm run test:ts`, needs Node ≥ 22.18). Covered: normalization, classification, scoring, exclusions, dedup, diffs, closure safety, connector parsers + control flow (against canned
> responses), alert rules, digest timing, ATS detection (TS and Python agree), company import, analytics maths, resume recommendation, .ics output, rate limiting, draft-prompt safety,
> search-query parsing, RSS/Atom parsing (including rejection of hostile XML).
>
> **Database integration tests (20, opt-in).** The real scanner, `store.py`, alert dispatcher and change notifier run against a real PostgreSQL 16 whose schema is generated from
> `prisma/schema.prisma` (`worker/tests/db/prisma_to_sql.py`): first scans, idempotent rescans, versioned edits with diffs, closure and reopen, failed/empty scans never closing jobs, duplicate-source
> merging, scheduling/backoff, re-scoring, alert de-duplication, first-scan window, digests, burst roll-up, retry cap, tracked-job notifications, and RSS scans.
> Run from `worker/`: `JOBINTEL_TEST_DSN=postgresql://user:pw@localhost:5432/scratch python -m unittest tests.test_db_integration`
> (**it drops and recreates the `public` schema, so use a scratch database**). Without that variable they are skipped. If `psycopg2` is not installed they use a small psql-backed
> stand-in (`worker/tests/db/psql_driver.py`). These tests found and fixed real bugs, including a lost-change bug in change notifications.
>
> **Not verified:** the Next.js app and all React pages were never compiled or run (the build sandbox's npm/pip registries were blocked, so there was no `node_modules`). A type-check against
> stubbed libraries found no genuine type errors, but that is not a substitute for `npm run build`. No connector has talked to a live API; email/Discord/Slack/SMS delivery was never exercised.
> The committed migration is generated from the schema, not by Prisma itself. Expect to fix small type/runtime errors on the first `npm run build`, and verify board tokens in Diagnostics.
>
> See **`docs/SPEC_COVERAGE.md`** for a section-by-section status against the original spec, and `docs/preview.html` (open in a browser) for a clickable **mock-up** of the interface with sample data.

## Works with no external accounts

These need no phone, Gmail or calendar connection:
- Job search with plain-language queries, saved searches, per-job priority, CSV export of jobs and applications.
- Application tracker with a "Needs your attention" list on the dashboard (follow-ups, OA deadlines, interviews, no response after 14 days, pending referrals).
- Company research pages: open roles, hiring activity, which internship seasons they opened and when, stated pay.
- Pay comparison by company and role type. Pay is only compared per unit (hourly, monthly, weekly, yearly) and never guessed.
- Saved answers to common application questions, with one-click copy on each job page. Nothing is auto-submitted.
- Interview prep checklists by application stage, role and the technologies in the posting.

## Quick start

```bash
cp .env.example .env            # set NEXTAUTH_SECRET (openssl rand -base64 32)
docker compose up -d postgres   # or point DATABASE_URL at any Postgres 14+
npm install
npx prisma migrate deploy       # applies the committed initial migration (prisma/migrations/)
SEED_USER_EMAIL=you@example.com SEED_USER_PASSWORD='choose-a-password' npm run seed
npm run dev                     # http://localhost:3000

# worker (Python 3.11+)
npm run worker:install
npm run worker:scan             # one scan of all due companies (add: -- --company stripe --force)
npm run worker:schedule         # long-running scheduler (what docker compose runs as `worker`)
npm run worker:rescore          # recompute fit scores after editing your profile
npm run worker:test
npm test                        # worker tests + TypeScript lib tests
```

Full stack in Docker: `docker compose up --build`. Demo data: `npm run seed:demo` adds four clearly-labelled **sample** jobs
under an inactive "Demo Co (sample data)" company; `npm run seed:clear-demo` removes them. Real jobs only ever come from connectors.

## What's built (Phase 1)

Auth (credentials, bcrypt, JWT) · companies (add, paste list, CSV upload, bulk import, delete, pause, priority, category, tags,
custom + built-in editable lists, ATS auto-detection from URL) · Greenhouse, Lever, Ashby, generic JSON-LD and RSS/Atom connectors ·
normalization with provenance · deduplication · version history + diffs · closure detection · rule-based classification with an
optional LLM provider abstraction · configurable fit score with explanations and concerns · smart exclusions · job feed with
filters/sort/search · Just Opened · job detail · action-oriented dashboard · application tracker (table + pipeline) · diagnostics.

## Architecture

```
Company ─► detect ATS ─► Connector.fetch() ─► RawJob[]
        ─► normalize (sanitize HTML, classify, season, comp, eligibility, fingerprints) ─► NormalizedJob
        ─► plan_ingest(existing, incoming)   [pure, unit-tested]  ─► inserts / updates / touches / sources / missed
        ─► score + exclusions ─► apply_plan (one transaction) ─► Job, JobVersion, JobSource, ScanRun, Company counters
```

* **Connector interface** (`worker/connectors/base.py`): `fetch(company) -> list[RawJob]`, plus `complete_listing` (whether
  absence from a fetch proves closure). Add a source = one file + one line in `connectors/registry.py`.
* **Dedup** (`pipeline/dedupe.py`), in order: ATS+external id → canonical application URL → company+normalized title+location
  key → same title, compatible location, ≥0.85 5-word-shingle similarity. Different cities are distinct postings. All source links
  are kept in `JobSource`; official ATS sources outrank the generic careers-page scrape as the primary link.
* **New / changed / reopened / reposted**: `firstDiscoveredAt` is set once. Content hash change → new `JobVersion` with a field diff.
  Missing-then-back with the same id → reopened; back under a new id matching a closed job → reposted. The UI labels
  "newly indexed (older posting)" when the posted date is >2 days before discovery.
* **Closure**: only after a *successful, complete* fetch; a job must be missing 2 scans → Possibly Closed, 4 → Closed. An empty result for a
  company with >3 open jobs is treated as an outage and closes nothing. Failed scans never touch jobs. Nothing is deleted.
* **Scheduling** (`scheduler.py`): every 30s pick companies whose interval (P0 5m / P1 15m / P2 45m / P3 3h, env-configurable) elapsed,
  doubled per consecutive failure (capped 6h), run on a thread pool. Per-host rate limiting, Retry-After handling, ETag caching and
  robots.txt checks (generic connector) live in `connectors/http.py`. 401/403 are treated as access control and never worked around.
* **Matching** (`pipeline/score.py`): six weighted components (default 30/20/20/10/10/10, editable in `Profile`), explanations for
  every positive, concerns (grad degree, years, season/graduation window, clearance, hardware, not-an-internship, sponsorship, min pay).
  Borderline jobs are down-ranked, not rejected. Exclusion rules only look at the *title*, ignore mentorship phrases
  ("working with senior engineers") and never exclude internships on seniority words.
* **Provenance**: season, role and level carry `ATS` (stated in the posting) vs `AI_INFERENCE`; the UI shows "Likely Summer 2027" for inferred values.
* **Notification architecture (Phase 2 design)**: after `apply_plan`, an `alerts` stage evaluates each new/updated job against active `Alert.ruleJson`,
  inserts `AlertEvent(alertId, jobId)` (unique ⇒ no duplicate sends), and dispatches via channel adapters (email, Discord, Slack, push, SMS) or
  queues for hourly/morning/evening digests. Tables already exist.
* **Security**: server-side secrets only; bcrypt; HTML reduced to plain text before storage and rendered as text (no `dangerouslySetInnerHTML`);
  Prisma + parameterized SQL; zod validation on every mutating route; auth middleware on all non-login routes; NextAuth CSRF.
  **Not yet implemented:** API rate limiting and secret encryption at rest (nothing sensitive is stored in Phase 1).

## Layout

```
app/                Next.js routes (dashboard, jobs, just-opened, applications, companies, admin, api/*)
components/         JobCard, FilterBar, CompaniesManager, ApplicationsBoard, ...
lib/                db, auth, session, jobs (query builder), ATS detection, company import
prisma/             schema.prisma, seed.ts
worker/             connectors/, pipeline/ (normalize, classify, dedupe, score, diff, ingest), store.py, scanner.py, scheduler.py, tests/
```

## Search, saved searches and priority

The search box (top bar and Jobs page) understands plain language. It extracts filters and leaves everything else as free text, so no word is silently dropped:

| You type | Understood as |
|---|---|
| `quant internships chicago posted today` | quant roles · internship · Chicago · posted in the last 24 h |
| `jobs requiring C++ posted today` | mentions C++ · posted in the last 24 h |
| `Summer 2027 SWE internship NYC Python` | Summer 2027 · software-engineering roles · internship · New York · mentions Python |
| `companies with internships discovered this week` | internships discovered in the last 7 days, plus a per-company summary |
| `Palantir` | free text |

Filter-bar values always override what was parsed. "Understood as" chips show what the parser did. Any search can be saved and re-run from the Jobs page. Each job can be marked
High / Normal / Low priority (your own ranking; High and Low also save the job) and filtered by it. Parser: `lib/searchQuery.ts`.

## What's built (Phases 2–4)

**Phase 2** — Profile & matching UI (`/settings`: targets, skills, preferences, six editable weights, exclusion rules) with automatic re-scoring when the profile
or resumes change (scheduler detects it; or `npm run worker:rescore`) · resumes (paste/upload text, multiple versions, default) · watchlists with their own
feed and optional alert · alerts with a rule builder (min fit, level, role, season/year, company groups + named companies, priority, location, tech, keywords)
and channels: in-app/browser, email (SMTP), Discord, Slack, SMS (Twilio) · immediate, hourly, morning and evening digests · notification bell · application tracking with status history.
**Anti-spam:** `UNIQUE(alertId, jobId)` + `ON CONFLICT DO NOTHING`; a company's first scan only alerts on jobs posted in the last few hours; bursts beyond 5 are rolled into one
message; empty rules are refused; a Postgres advisory lock keeps one deliverer running; failed sends retry up to 3 times. Delivery is at-least-once (a crash between sending and committing can repeat a message).

**Phase 3** — SmartRecruiters and Workday connectors (detail pages fetched only for relevant-looking titles, cached 6 h, per-scan budget) · contacts & referral tracking
(`/contacts`, "Referral available" badges, nothing is ever sent to anyone) · analytics (discovered today/week, open internships, submitted, application/OA/interview/offer/rejection
rates using status history, by company/role/industry/location, weekly trend, discovery→apply delay, most active employers) · posting history & diffs (since Phase 1) · rule + optional-LLM classification (since Phase 1).

**Phase 4 (achievable parts)** — resume recommendation per job with covered/missing technologies (never suggests adding skills you lack) · advanced alerts (watchlist-scoped, digests) ·
calendar export (`/api/calendar`: deadlines, OA dates, follow-ups, interviews as an .ics download).

## Hardening & speed-to-apply step

* **Draft assistant** (job detail page): editable drafts for "Why this company?", "Why this role?", cover letters and short application questions, via the provider abstraction in `lib/llm.ts`
  (`AI_PROVIDER=anthropic|openai`, keys in `.env`, server-side only, 10 requests/min). The prompt forces use of *only* facts from your resume/notes, `[ADD: …]` placeholders instead of invention, no
  claims about the company beyond the posting, and treats posting/resume text as data (prompt-injection hardening). Drafts are never saved or submitted. Not yet run against a real provider.
* **Changed-posting notifications:** if you saved a job or are applying and the employer materially edits it (deadline, location, pay, season, graduation requirement, level, title), you get an in-app notification;
  wording-only edits are ignored.
* **Subscribable calendar feed** (Settings): secret URL, only a SHA-256 hash stored, rotatable/disableable, rate-limited. Plus the one-off `.ics` download.
* **Security:** per-user API rate limit (300/min), login brute-force limit (8 attempts / 15 min / email), security headers (no framing, nosniff, referrer policy, restrictive CSP directives).
  Limits are in-memory per process (fine for one instance; use Redis for several replicas). A full nonce-based `script-src` CSP is not set.

## Not built

* **Gmail integration** (detecting recruiter/OA emails) and **Google Calendar sync** — these need your own Google Cloud OAuth credentials and consent-screen setup; the `.ics` export is the stand-in.
* **Push notifications** (the `PUSH` channel returns "not implemented"; use browser, Discord, Slack or SMS), the **mobile app / Chrome extension**, automatic application-status detection,
  interview prep, salary comparison, company research.
* **Jobvite, iCIMS, SuccessFactors** connectors (detected, not scanned). **PDF résumé parsing** (paste text or upload .txt/.md).
* **Encryption of secrets at rest** (nothing sensitive is stored by the app; SMTP/webhook/API credentials live in environment variables).

## Known limitations

* **Workday** uses the JSON endpoint that Workday career sites call themselves; it is not a documented contract, so it may change or be blocked. The connector checks robots.txt,
  rate-limits, queries only five targeted search terms, and never closes jobs (search-limited). **SmartRecruiters/Workday response shapes were written from the public API
  descriptions and have not been checked against live responses** — if a parser misses fields, fix `parse_item`/`apply_detail` (they're small and unit-tested).
* Detail-per-job connectors notice edits to a posting after the 6-hour detail-cache TTL, not on the next scan.


* Jobvite, iCIMS and SuccessFactors are *detected* but have no connector. Many big firms
  (Google, Meta, Jane Street, Citadel, …) use custom or Workday sites; they are seeded without a scan URL — add a Greenhouse/Lever/Ashby URL or
  a server-rendered careers page that publishes schema.org JobPosting data. Nothing is scraped from JavaScript-rendered pages or behind logins.
* Seeded careers URLs are best-effort; verify them in Diagnostics. A 404 means the board token is wrong.
* Fit scores are computed once per job against the first user's profile (single-user design). Multi-user scoring would move scoring to query time.
* Only relevant jobs are stored (tech/intern/new-grad, non-"experienced"); set `STORE_ALL_JOBS=true` to keep everything.
* Postgres `ILIKE` search is fine for tens of thousands of jobs; add `pg_trgm`/full-text indexes before hundreds of thousands.
* `prisma/migrations/20261008000000_init` was generated from `schema.prisma` by `worker/tests/db/prisma_to_sql.py`, not by Prisma. After your first `npm install`, run
  `npx prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --shadow-database-url <scratch db>`; empty output means they match. If you change the schema, add a new migration with `prisma migrate dev`.
* RSS/Atom feeds only show recent items, so the RSS connector never closes jobs by absence.
