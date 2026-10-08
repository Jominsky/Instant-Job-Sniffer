# Coverage of the product spec

Each of the 36 sections of *Job Application Intelligence Platform* and where it stands. Labels:

* **Built, tested**: implemented, and its logic is covered by automated tests (Python unit tests, TypeScript tests, or the Postgres integration tests).
* **Built, UI unverified**: implemented, but it lives in the Next.js app, which could not be compiled or run in the build sandbox (no npm registry access). Expect small fixes on the first `npm run build`.
* **Partial** / **Not built**: see the notes.

Nothing has talked to a live ATS API, a live SMTP/Discord/Slack/SMS service or a live LLM provider.

| # | Section | Status | Notes |
|---|---|---|---|
| 1 | Job discovery engine | Built, tested | Connectors: Greenhouse, Lever, Ashby, SmartRecruiters, Workday (unofficial JSON endpoint), generic JSON-LD careers pages, RSS/Atom. Connector control flow tested against canned responses. robots.txt honoured, 401/403 never bypassed. **Not built:** Jobvite, iCIMS, SuccessFactors connectors (URLs are detected, not scanned); search-engine-indexed pages. |
| 2 | Company universe | Built, UI unverified | Add, paste list, CSV upload, bulk import, delete, pause, priority, category, tags, custom and built-in editable lists. Import and ATS-detection logic tested. Logo is a URL field. |
| 3 | Job normalization | Built, tested | Every listed field exists in the schema, including citizenship/sponsorship/school-year requirements, version hash, first/last observed timestamps. |
| 4 | Duplicate detection | Built, tested | ATS id, canonical URL, dedupe key, title + location + text-shingle similarity. Extra sources are kept; the official page is the primary link. |
| 5 | New job detection | Built, tested | New, materially changed, reposted, closed, reopened. First scan of a company only alerts on recently posted jobs, so a back catalogue never floods you. |
| 6 | Intelligent matching | Built, tested | Six configurable weights, 0-100 score, reasons and concerns. Borderline roles are ranked lower with an explanation, never auto-rejected. Profile form is UI unverified. |
| 7 | AI classification | Built, tested | Rule-based by default; an optional LLM provider fills gaps and is recorded as AI inference. Not run against a real provider. |
| 8 | Job feed | Built, UI unverified | Card contents, Apply / Save / Not interested / Details, and all listed filters and sorts. Search understands plain-language queries (see section 15). |
| 9 | "Just Opened" | Built, UI unverified | Windows: 15 min, 1 h, 3 h, today, 24 h, 3 days. |
| 10 | Alert system | Built, tested | Rules, immediate / hourly / morning / evening digests, duplicate prevention, retries; channels: in-app and browser, email, Discord, Slack, SMS. Verified against real Postgres. **Not built:** push notifications. Delivery code for external services was never run against them. |
| 11 | Application tracker | Built, UI unverified | All 13 statuses, all listed record fields, status history, table and pipeline views, status editable from the feed. |
| 12 | Referral tracking | Built, UI unverified | All contact fields; "Referral available at this company" badge. Nothing is ever sent to anyone. |
| 13 | Application speed features | Built, UI unverified | Apply button, resume recommendation, referral contacts, notes/checklist, draft assistant (needs an AI provider). Never submits anything. |
| 14 | Resume matching | Built, tested | Multiple versions; recommendation with covered and missing technologies; never suggests claiming skills you lack. **Not built:** PDF parsing (paste text or upload .txt/.md). |
| 15 | Search | Built, tested | Free text over every historical job plus structured parsing: "Summer 2027 SWE internship NYC Python", "quant internships Chicago", "jobs requiring C++ posted today", "Palantir", "companies with internships discovered this week" all work (tests in `tests/search.test.ts`). Saved searches. Postgres `ILIKE`: add trigram/full-text indexes before hundreds of thousands of jobs. |
| 16 | Watchlists | Built, UI unverified | Own page/feed and optional notification rules. |
| 17 | Analytics | Built, UI unverified | Every listed metric, plus most-active employers. The maths helpers are tested. |
| 18 | Closure detection | Built, tested | Open, Possibly Closed, Closed, Application Removed. Needs 2 and 4 consecutive missed *successful* scans; never closes anything after a failed, incomplete or suspiciously empty scan. History is kept. |
| 19 | Job changes | Built, tested | Snapshots and field diffs; material changes notify people tracking the job. |
| 20 | Favorites and priority | Built, UI unverified | Company P0-P3 (also drives scan frequency); per-user job priority High / Normal / Low with a filter. |
| 21 | Exclusion rules | Built, tested | Title-based seniority rules; "working with senior engineers" does not exclude an internship. |
| 22 | Admin / monitoring | Built, UI unverified | Totals, errors, last and next scan, source health, jobs per source, connector failures. |
| 23 | Scanning frequency | Built, tested | P0 5 min, P1 15, P2 45, P3 3 h (env-configurable), per-host throttling, ETag caching, exponential backoff. |
| 24 | Database design | Built, tested | Prisma schema; generated SQL applied to real PostgreSQL 16 (19 tables, 12 enums, 22 foreign keys). Spec entities all present except a separate `sources` table (the source name lives on `Job` and `JobSource`). |
| 25 | Recommended stack | Partial | Next.js, TypeScript, React, Tailwind, Prisma, PostgreSQL, Python worker, NextAuth, Docker, LLM provider abstraction: yes. **Deviations:** custom Tailwind components instead of shadcn/ui; no FastAPI (the worker is a scheduler, not an API); no Redis (the scheduler is Postgres-backed with advisory locks and an in-process thread pool). |
| 26 | Design | Built, UI unverified | Sidebar and top bar as specified, plus Diagnostics; dark mode follows the system theme. |
| 27 | Dashboard | Built, UI unverified | "New strong matches today", Apply Now, Just Opened, target companies, deadlines, pipeline. |
| 28 | Job detail page | Built, UI unverified | Every listed section including similar roles and posting history. |
| 29 | Data quality / provenance | Built, tested | Official page, ATS, search discovery, AI inference, user input. AI-inferred seasons show as "Likely …", never as employer-stated. |
| 30 | Failure handling | Built, tested | Logged, retried with backoff, no duplicates, no mass closure, persistent failures surfaced in Diagnostics. |
| 31 | Security | Built, partly tested | Server-side keys, validated input, sanitized HTML (tested), parameterized SQL (exercised against real Postgres), protected routes, per-user and login rate limits, security headers, hashed calendar token. CSRF: NextAuth's own protection plus same-site session cookies and JSON-only API bodies; there are no extra per-request CSRF tokens. In-memory rate limits suit one instance. |
| 32 | Performance | Partial | Concurrent scans, caching, incremental ETag requests, per-connector scheduling. No external queue; not load-tested. |
| 33 | Future features | Partial | Architecture leaves room (connector interface, provider abstraction, status history). Calendar `.ics` export and feed exist; Gmail, mobile app, Chrome extension, interview prep and the rest are not built. |
| 34 | MVP order | Done through Phase 3 | Phase 4: advanced alerts, resume selection and calendar export done; Gmail/Calendar sync and a mobile app are not. |
| 35 | Product principles | Upheld | Never auto-applies, never bypasses access controls, never fabricates jobs, keeps closed jobs, de-duplicates alerts. Principle 10 (real functionality, not mock-ups): the code is real, but the web UI has not been run. `docs/preview.html` is a **mock-up with sample data** for looking only. |
| 36 | Development instructions | Built | README, setup instructions, `.env.example`, database migration, seed script, Docker configuration, development scripts, tests. The migration was generated from the schema by a script and applied cleanly to a fresh database; `npx prisma migrate diff` will confirm it matches Prisma's own output. |


## Added later
Pay-period capture and comparison, reminders, company research pages, saved answers, interview prep, CSV export, GitHub Actions CI. See README "Works with no external accounts".
