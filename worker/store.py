"""PostgreSQL persistence (psycopg2, parameterised SQL only). Table/column names follow Prisma's defaults."""
from __future__ import annotations
import json
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from typing import Any, Iterator, Optional

import psycopg2
import psycopg2.extensions
import psycopg2.extras

import config
from models import CompanyRef, NormalizedJob
from pipeline.ingest import Plan
from pipeline.score import Profile, ScoreResult
from timeutil import parse_pg_timestamp

# TIMESTAMP (oid 1114) -> aware UTC datetimes, globally for every connection in this process.
psycopg2.extensions.register_type(psycopg2.extensions.new_type((1114,), "TIMESTAMP_UTC", parse_pg_timestamp))

J = psycopg2.extras.Json


def cuid() -> str:
    return "c" + uuid.uuid4().hex[:24]


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


@contextmanager
def connect() -> Iterator[Any]:
    conn = psycopg2.connect(config.DATABASE_URL, options="-c timezone=UTC")   # aware datetimes are written as UTC wall time
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def dict_cursor(conn):
    return conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)


# ---------------- reads ----------------
def load_profile(conn) -> Profile:
    """Single-user personal CRM: use the first user's profile + default resume text."""
    with dict_cursor(conn) as cur:
        cur.execute('SELECT p.*, u.id AS uid FROM "Profile" p JOIN "User" u ON u.id = p."userId" ORDER BY u."createdAt" LIMIT 1')
        p = cur.fetchone()
        if not p:
            return Profile(target_season=config.DEFAULT_TARGET_SEASON, target_year=config.DEFAULT_TARGET_YEAR)
        cur.execute('SELECT "extractedText" FROM "Resume" WHERE "userId"=%s ORDER BY "isDefault" DESC, "createdAt" LIMIT 1', (p["uid"],))
        r = cur.fetchone()
    return Profile(
        skills=p["skills"] or [], technologies=p["technologies"] or [],
        preferred_roles=p["preferredRoles"] or [], preferred_locations=p["preferredLocations"] or [],
        preferred_companies=[c.lower() for c in (p["preferredCompanies"] or [])],
        target_season=p["targetSeason"], target_year=p["targetYear"], graduation_year=p["graduationYear"],
        sponsorship_required=p["sponsorshipRequired"], keywords=p["keywords"] or [],
        excluded_keywords=p["excludedKeywords"] or [], min_compensation=p["minCompensation"],
        resume_text=(r or {}).get("extractedText") or "",
        **({"exclusion_rules": list(p["exclusionRules"])} if p.get("exclusionRules") else {}),
        weights={"role": p["weightRoleRelevance"], "experience": p["weightExperienceElig"],
                 "skills": p["weightSkillsMatch"], "company": p["weightCompanyPref"],
                 "location": p["weightLocationPref"], "resume": p["weightResumeSimilarity"]},
    )


def _company_ref(r: dict) -> CompanyRef:
    return CompanyRef(id=r["id"], name=r["name"], slug=r["slug"], ats=r["atsProvider"],
                      ats_identifier=r["atsIdentifier"], careers_url=r["careersUrl"],
                      priority=r["priority"], category=r["category"],
                      first_scan=r["lastSuccessfulScanAt"] is None)


def due_companies(conn, now: datetime, only_slug: Optional[str] = None, force: bool = False) -> list[CompanyRef]:
    """Active companies whose (backoff-adjusted) scan interval has elapsed, most important first."""
    with dict_cursor(conn) as cur:
        if only_slug:
            cur.execute('SELECT * FROM "Company" WHERE slug=%s', (only_slug,))
        else:
            cur.execute('SELECT * FROM "Company" WHERE "isActive" AND "atsProvider" <> %s', ("UNKNOWN",))
        rows = cur.fetchall()
    out = []
    for r in rows:
        if not force and r["lastCheckedAt"]:
            interval = config.SCAN_INTERVALS.get(r["priority"], 3600) * (2 ** min(r["consecutiveFailures"], 6))
            interval = min(interval, config.MAX_BACKOFF_SECONDS)
            if (now - r["lastCheckedAt"]).total_seconds() < interval:
                continue
        out.append(r)
    out.sort(key=lambda r: (r["priority"], r["lastCheckedAt"] or datetime.min.replace(tzinfo=timezone.utc)))
    return [_company_ref(r) for r in out]


def existing_jobs(conn, company_id: str) -> list[dict]:
    with dict_cursor(conn) as cur:
        cur.execute('''
            SELECT j.id, j.ats, j."externalJobId", j."dedupeKey", j."postingHash", j.status, j."applicationUrl",
                   j."normalizedTitle", j.location, j.description, j.version, j.source, j."missedScans",
                   (SELECT v.snapshot FROM "JobVersion" v WHERE v."jobId" = j.id ORDER BY v.version DESC LIMIT 1) AS snapshot
            FROM "Job" j WHERE j."companyId" = %s''', (company_id,))
        return [dict(r) for r in cur.fetchall()]


# ---------------- scan bookkeeping ----------------
def start_scan(conn, company_id: str, connector: str) -> str:
    sid = cuid()
    with conn.cursor() as cur:
        cur.execute('INSERT INTO "ScanRun"(id,"companyId",connector,status,"startedAt") VALUES (%s,%s,%s,%s,%s)',
                    (sid, company_id, connector, "RUNNING", now_utc()))
    return sid


def finish_scan(conn, scan_id: str, status: str, found=0, new=0, updated=0, closed=0, error: Optional[str] = None):
    with conn.cursor() as cur:
        cur.execute('UPDATE "ScanRun" SET status=%s,"jobsFound"=%s,"jobsNew"=%s,"jobsUpdated"=%s,"jobsClosed"=%s,'
                    '"errorMessage"=%s,"finishedAt"=%s WHERE id=%s',
                    (status, found, new, updated, closed, (error or None) and error[:2000], now_utc(), scan_id))


def mark_company(conn, company_id: str, success: bool):
    with conn.cursor() as cur:
        if success:
            cur.execute('UPDATE "Company" SET "lastCheckedAt"=%s,"lastSuccessfulScanAt"=%s,"consecutiveFailures"=0,"updatedAt"=%s WHERE id=%s',
                        (now_utc(), now_utc(), now_utc(), company_id))
        else:
            cur.execute('UPDATE "Company" SET "lastCheckedAt"=%s,"consecutiveFailures"="consecutiveFailures"+1,"updatedAt"=%s WHERE id=%s',
                        (now_utc(), now_utc(), company_id))


def refresh_company_counts(conn, company_id: str):
    with conn.cursor() as cur:
        cur.execute('''UPDATE "Company" SET
            "openMatchingJobsCount" = (SELECT count(*) FROM "Job" WHERE "companyId"=%(c)s AND status='OPEN' AND NOT "isExcluded"
                                       AND "experienceLevel" IN ('INTERNSHIP','NEW_GRAD','ENTRY_LEVEL')),
            "totalJobsDiscovered" = (SELECT count(*) FROM "Job" WHERE "companyId"=%(c)s)
            WHERE id=%(c)s''', {"c": company_id})


# ---------------- writes ----------------
def _job_values(j: NormalizedJob, s: ScoreResult, excluded: list[str], urgency: int) -> dict[str, Any]:
    return {
        "title": j.title, "normalizedTitle": j.normalized_title, "location": j.location, "workMode": j.work_mode,
        "experienceLevel": j.experience_level, "roleCategory": j.role_category, "department": j.department,
        "description": j.description, "qualifications": j.qualifications,
        "preferredQualifications": j.preferred_qualifications, "technologies": j.technologies,
        "compensationMin": j.compensation_min, "compensationMax": j.compensation_max,
        "compensationRaw": j.compensation_raw, "compensationPeriod": j.compensation_period, "compensationAnnualMax": j.compensation_annual_max, "applicationUrl": j.application_url, "sourceUrl": j.source_url,
        "dedupeKey": j.dedupe_key, "datePosted": j.date_posted, "applicationDeadline": j.application_deadline,
        "targetSeason": j.target_season, "targetYear": j.target_year, "seasonProvenance": j.season_provenance,
        "classificationProvenance": j.classification_provenance, "graduationRequirement": j.graduation_requirement,
        "citizenshipRequirement": j.citizenship_requirement, "sponsorshipInfo": j.sponsorship_info,
        "schoolYearRequirement": j.school_year_requirement, "fitScore": s.score,
        "fitExplanation": J({"reasons": s.reasons, "components": s.components, "seasonEvidence": j.season_evidence}),
        "concerns": J(s.concerns), "urgencyScore": urgency, "isExcluded": bool(excluded),
        "exclusionReasons": excluded, "postingHash": j.posting_hash,
    }


def apply_plan(conn, company: CompanyRef, plan: Plan, scored: dict[int, tuple[ScoreResult, list[str], int]],
               now: datetime) -> dict[str, str]:
    """Persist a plan. `scored` maps id(NormalizedJob) -> (score, exclusion reasons, urgency).
    Returns mapping of 'new:<n>' placeholders to real job ids."""
    new_ids: dict[str, str] = {}
    with conn.cursor() as cur:
        for n, ins in enumerate(plan.inserts, start=1):
            j = ins.job
            s, excl, urg = scored[id(j)]
            vals = _job_values(j, s, excl, urg)
            jid = cuid()
            new_ids[f"new:{n}"] = jid
            cols = list(vals) + ["id", "companyId", "ats", "source", "externalJobId", "firstDiscoveredAt",
                                 "lastObservedAt", "lastUpdatedAt", "status", "version", "missedScans", "updatedAt"]
            params = list(vals.values()) + [jid, company.id, j.ats, j.source, j.external_id, now, now, now, "OPEN", 1, 0, now]
            cur.execute(f'INSERT INTO "Job"({",".join(chr(34)+c+chr(34) for c in cols)}) VALUES ({",".join(["%s"]*len(cols))})', params)
            cur.execute('INSERT INTO "JobVersion"(id,"jobId",version,snapshot,diff,"postingHash","capturedAt") VALUES (%s,%s,1,%s,NULL,%s,%s)',
                        (cuid(), jid, J(j.snapshot()), j.posting_hash, now))
            cur.execute('INSERT INTO "JobSource"(id,"jobId",ats,source,"externalJobId",url,"isPrimary","discoveredAt") VALUES (%s,%s,%s,%s,%s,%s,true,%s)',
                        (cuid(), jid, j.ats, j.source, j.external_id, j.application_url, now))

        for u in plan.updates:
            s, excl, urg = scored[id(u.job)]
            vals = _job_values(u.job, s, excl, urg)
            sets = ", ".join(f'"{c}"=%s' for c in vals)
            extra = ', "lastUpdatedAt"=%s, "lastObservedAt"=%s, version=%s, "missedScans"=0, "updatedAt"=%s'
            params = list(vals.values()) + [now, now, u.new_version, now]
            if u.reopened or u.reposted:
                extra += ', status=\'OPEN\', "reopenedAt"=%s, "closedAt"=NULL'
                params.append(now)
            if u.reposted:
                extra += ', "isReposted"=true'
            cur.execute(f'UPDATE "Job" SET {sets}{extra} WHERE id=%s', params + [u.row_id])
            cur.execute('INSERT INTO "JobVersion"(id,"jobId",version,snapshot,diff,"postingHash","capturedAt") VALUES (%s,%s,%s,%s,%s,%s,%s)',
                        (cuid(), u.row_id, u.new_version, J(u.job.snapshot()), J(u.changes), u.job.posting_hash, now))

        for t in plan.touches:
            if t.reopened or t.reposted:
                cur.execute('UPDATE "Job" SET "lastObservedAt"=%s,"missedScans"=0,status=\'OPEN\',"reopenedAt"=%s,"closedAt"=NULL,'
                            '"isReposted"="isReposted" OR %s,"updatedAt"=%s WHERE id=%s', (now, now, t.reposted, now, t.row_id))
            else:
                cur.execute('UPDATE "Job" SET "lastObservedAt"=%s,"missedScans"=0 WHERE id=%s', (now, t.row_id))

        for a in plan.add_sources:
            jid = new_ids.get(a.row_id, a.row_id)
            if a.make_primary:
                cur.execute('UPDATE "JobSource" SET "isPrimary"=false WHERE "jobId"=%s', (jid,))
                cur.execute('UPDATE "Job" SET "applicationUrl"=%s,"sourceUrl"=%s,ats=%s,source=%s,"externalJobId"=%s WHERE id=%s',
                            (a.job.application_url, a.job.source_url, a.job.ats, a.job.source, a.job.external_id, jid))
            cur.execute('INSERT INTO "JobSource"(id,"jobId",ats,source,"externalJobId",url,"isPrimary","discoveredAt") '
                        'VALUES (%s,%s,%s,%s,%s,%s,%s,%s) ON CONFLICT ("jobId",source,"externalJobId") DO NOTHING',
                        (cuid(), jid, a.job.ats, a.job.source, a.job.external_id, a.job.application_url, a.make_primary, now))

        for m in plan.missed:
            if m.new_status == "CLOSED":
                cur.execute('UPDATE "Job" SET "missedScans"=%s,status=%s,"closedAt"=%s,"updatedAt"=%s WHERE id=%s',
                            (m.missed_scans, m.new_status, now, now, m.row_id))
            else:
                cur.execute('UPDATE "Job" SET "missedScans"=%s,status=%s,"updatedAt"=%s WHERE id=%s',
                            (m.missed_scans, m.new_status, now, m.row_id))
    return new_ids


def profile_signature(conn) -> tuple:
    """Changes whenever the profile or resumes change; the scheduler uses it to trigger a re-score."""
    with conn.cursor() as cur:
        cur.execute('''SELECT (SELECT max("updatedAt") FROM "Profile"), (SELECT count(*) FROM "Resume"),
                              (SELECT max("createdAt") FROM "Resume"), (SELECT string_agg(id, ',' ORDER BY id) FROM "Resume" WHERE "isDefault")''')
        return tuple(cur.fetchone())
