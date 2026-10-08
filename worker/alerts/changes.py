"""Notify people who are TRACKING a job (saved, or an active application) when the employer materially edits it.
Cosmetic edits (description wording, qualification rewording) are ignored to avoid noise."""
from __future__ import annotations
from datetime import datetime
from typing import Any

import store
from alerts.logic import _clean, app_url

MATERIAL_FIELDS = {"application_deadline", "location", "compensation_raw", "target_season", "target_year",
                   "graduation_requirement", "experience_level", "title", "work_mode"}


def material_changes(changes: list[dict[str, Any]]) -> list[str]:
    return [c["summary"] for c in changes if c.get("field") in MATERIAL_FIELDS]


def format_change(company: str, title: str, summaries: list[str]) -> str:
    return _clean(f"Updated: {company} — {title}: " + "; ".join(summaries))


def notify_changes(conn, items: list[tuple[str, list[dict[str, Any]]]], now: datetime) -> int:
    """items = [(job_id, diff changes)]. Inserts in-app notifications for each tracking user. Returns rows inserted."""
    material: dict[str, list[str]] = {}
    for jid, ch in items:                      # merge, never overwrite: a job may appear more than once
        for summary in material_changes(ch):
            if summary not in material.setdefault(jid, []):
                material[jid].append(summary)
    if not material:
        return 0
    ids = list(material)
    with store.dict_cursor(conn) as cur:
        cur.execute('SELECT j.id, j.title, c.name AS company FROM "Job" j JOIN "Company" c ON c.id=j."companyId" WHERE j.id = ANY(%s)', (ids,))
        jobs = {r["id"]: r for r in cur.fetchall()}
        cur.execute('''SELECT DISTINCT "userId","jobId" FROM (
                         SELECT "userId","jobId" FROM "Application" WHERE "jobId" = ANY(%s) AND status NOT IN ('REJECTED','WITHDRAWN','DISCOVERED')
                         UNION SELECT "userId","jobId" FROM "SavedJob" WHERE "jobId" = ANY(%s) AND NOT "notInterested") t''', (ids, ids))
        tracking = [dict(r) for r in cur.fetchall()]
    n = 0
    with conn.cursor() as cur:
        for t in tracking:
            j = jobs.get(t["jobId"])
            if not j:
                continue
            cur.execute('INSERT INTO "Notification"(id,"userId",title,body,"jobId","createdAt") VALUES (%s,%s,%s,%s,%s,%s)',
                        (store.cuid(), t["userId"], format_change(j["company"], j["title"], material[j["id"]])[:300],
                         f"{app_url().rstrip('/')}/jobs/{j['id']}", j["id"], now))
            n += 1
    return n
