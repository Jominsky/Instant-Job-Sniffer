"""Orchestrates one company scan: fetch -> normalize -> plan -> score -> persist."""
from __future__ import annotations
import logging
import traceback
from datetime import datetime, timezone

import config
import store
from connectors.registry import get_connector
from connectors.http import HttpClient
from pipeline.normalize import normalize, is_relevant
from pipeline.ingest import plan_ingest
from pipeline.score import Profile, score_job, check_exclusions
from pipeline.providers import get_provider
from alerts import dispatcher
from alerts.changes import notify_changes
from models import CompanyRef

log = logging.getLogger("scanner")


def urgency_score(job, now: datetime) -> int:
    """0-100: freshness (decays over ~72h) or deadline proximity, whichever is higher."""
    age_h = max(0.0, (now - (job.date_posted or now)).total_seconds() / 3600)
    fresh = max(0, 100 - age_h * (100 / 72))
    dl = 0.0
    if job.application_deadline:
        days = (job.application_deadline - now).total_seconds() / 86400
        dl = 100 if 0 <= days <= 2 else max(0, 100 - days * 8) if days > 0 else 0
    return int(max(fresh, dl))


def scan_company(company: CompanyRef, profile: Profile, http: HttpClient, llm=None) -> dict:
    connector = get_connector(company.ats, http)
    if connector is None:
        return {"status": "SKIPPED", "error": f"No connector for ATS {company.ats}"}

    with store.connect() as conn:
        scan_id = store.start_scan(conn, company.id, connector.name)

    try:
        raw_jobs = connector.fetch(company)
    except Exception as e:  # network/robots/format errors: record, never touch existing jobs
        msg = f"{type(e).__name__}: {e}"
        log.warning("scan failed for %s: %s", company.name, msg)
        with store.connect() as conn:
            store.finish_scan(conn, scan_id, "FAILURE", error=msg)
            store.mark_company(conn, company.id, False)
        return {"status": "FAILURE", "error": msg}

    try:
        now = datetime.now(timezone.utc)
        seen_ids = {r.external_id for r in raw_jobs}
        normalized = []
        for r in raw_jobs:
            if not r.title or not r.url:
                continue   # never fabricate: must have a title and a real link
            if r.extra.get("stub"):
                continue   # listed but description not fetched yet: counts as "seen" (closure) but is not stored
            try:
                n = normalize(r, company, connector.ats, connector.name, llm)
            except Exception:
                log.error("normalize failed for %s/%s:\n%s", company.name, r.external_id, traceback.format_exc())
                continue
            if is_relevant(n):
                normalized.append(n)

        with store.connect() as conn:
            existing = store.existing_jobs(conn, company.id)
            plan = plan_ingest(existing, normalized, seen_external_ids=seen_ids,
                               complete_listing=connector.complete_listing, source=connector.name,
                               ats=connector.ats, now=now)
            scored = {}
            for job in [i.job for i in plan.inserts] + [u.job for u in plan.updates]:
                res = score_job(job, company.priority, company.name, profile)
                excl = check_exclusions(job.title, job.description, job.experience_level, profile.exclusion_rules)
                scored[id(job)] = (res, excl, urgency_score(job, now))
            new_ids = store.apply_plan(conn, company, plan, scored, now)
            alert_pairs = ([(jid, "new") for jid in new_ids.values()]
                           + [(u.row_id, "reposted" if u.reposted else "reopened") for u in plan.updates if u.reopened or u.reposted]
                           + [(t.row_id, "reposted" if t.reposted else "reopened") for t in plan.touches if t.reopened or t.reposted])
            st = plan.stats
            store.finish_scan(conn, scan_id, "SUCCESS", found=len(raw_jobs), new=st["new"], updated=st["updated"], closed=st["closed"])
            store.mark_company(conn, company.id, True)
            store.refresh_company_counts(conn, company.id)
        _notify(alert_pairs, company.first_scan, now, [(u.row_id, u.changes) for u in plan.updates if u.changes])
        return {"status": "SUCCESS", "found": len(raw_jobs), **plan.stats, "closure_note": plan.skipped_closure_reason}
    except Exception as e:
        msg = f"{type(e).__name__}: {e}"
        log.error("persist failed for %s:\n%s", company.name, traceback.format_exc())
        with store.connect() as conn:   # fresh txn: previous one rolled back, existing jobs untouched
            store.finish_scan(conn, scan_id, "FAILURE", error=msg)
            store.mark_company(conn, company.id, False)
        return {"status": "FAILURE", "error": msg}


def _notify(alert_pairs, first_scan: bool, now: datetime, change_items=()) -> None:
    """Alerting must never fail or roll back a scan, so it runs after the scan transaction has committed."""
    try:
        if change_items:   # material edits to jobs you saved / are applying to
            with store.connect() as conn:
                notify_changes(conn, list(change_items), now)
        if not alert_pairs:
            return
        with store.connect() as conn:
            created = dispatcher.enqueue(conn, alert_pairs, first_scan, now)
        if created:
            with store.connect() as conn:
                dispatcher.deliver(conn, datetime.now(timezone.utc))
    except Exception:
        log.exception("alert dispatch failed (scan results were saved)")


def rescore_all() -> int:
    """Recompute fit/exclusions for every open job after a profile change."""
    from pipeline.normalize import normalize  # noqa: F401  (kept for symmetry)
    n = 0
    with store.connect() as conn:
        profile = store.load_profile(conn)
        with store.dict_cursor(conn) as cur:
            cur.execute('SELECT j.*, c.priority AS cprio, c.name AS cname FROM "Job" j JOIN "Company" c ON c.id=j."companyId" WHERE j.status IN (\'OPEN\',\'POSSIBLY_CLOSED\')')
            rows = cur.fetchall()
        for r in rows:
            job = type("J", (), {})()
            job.title, job.description = r["title"], r["description"]
            job.role_category, job.experience_level = r["roleCategory"], r["experienceLevel"]
            job.technologies, job.location, job.work_mode = r["technologies"] or [], r["location"], r["workMode"]
            job.target_season, job.target_year, job.season_provenance = r["targetSeason"], r["targetYear"], r["seasonProvenance"]
            job.graduation_requirement, job.citizenship_requirement = r["graduationRequirement"], r["citizenshipRequirement"]
            job.sponsorship_info = r["sponsorshipInfo"]
            # legacy rows (stored before pay periods existed) hold annual figures in compensationMax
            job.compensation_annual_max = r["compensationAnnualMax"] if r["compensationAnnualMax"] is not None else (r["compensationMax"] if r["compensationPeriod"] is None else None)
            res = score_job(job, r["cprio"], r["cname"], profile)
            excl = check_exclusions(job.title, job.description, job.experience_level, profile.exclusion_rules)
            with conn.cursor() as cur:
                cur.execute('UPDATE "Job" SET "fitScore"=%s,"fitExplanation"=%s,concerns=%s,"isExcluded"=%s,"exclusionReasons"=%s WHERE id=%s',
                            (res.score, store.J({"reasons": res.reasons, "components": res.components}), store.J(res.concerns),
                             bool(excl), excl, r["id"]))
            n += 1
    return n
