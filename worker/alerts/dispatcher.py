"""DB-backed alert pipeline: enqueue events for matching jobs, then deliver (immediately or as digests).

Dedup: AlertEvent has UNIQUE(alertId, jobId) and inserts use ON CONFLICT DO NOTHING, so a job can
notify a given alert at most once, even across scans, restarts or concurrent workers."""
from __future__ import annotations
import logging
import os
from datetime import datetime, timedelta
from typing import Any, Iterable

import store
from alerts import channels
from alerts.logic import app_url, build_digest, build_message, digest_due
from alerts.rules import alert_applies

log = logging.getLogger("alerts")
MAX_IMMEDIATE_PER_RUN = 5          # beyond this, the rest of a burst is rolled into one digest message
MAX_ATTEMPTS = 3
FIRST_SCAN_WINDOW_HOURS = int(os.environ.get("FIRST_SCAN_ALERT_WINDOW_HOURS", "6"))

JOB_SQL = '''SELECT j.*, c.category, c.priority, c.name AS "companyName", j."companyId"
             FROM "Job" j JOIN "Company" c ON c.id = j."companyId" WHERE j.id = ANY(%s)'''


def _active_alerts(conn) -> list[dict]:
    with store.dict_cursor(conn) as cur:
        cur.execute('''SELECT a.id, a."userId", a.name, a."ruleJson", a.channels::text[] AS channels, a.frequency, a."lastDigestAt",
                              w."filterJson" AS wl, u.email
                       FROM "Alert" a JOIN "User" u ON u.id = a."userId" LEFT JOIN "Watchlist" w ON w.id = a."watchlistId"
                       WHERE a."isActive"''')
        return [dict(r) for r in cur.fetchall()]


def enqueue(conn, job_reasons: Iterable[tuple[str, str]], first_scan: bool, now: datetime) -> int:
    """Create PENDING events for every (alert, job) match. On a company's first scan only jobs posted
    very recently qualify, so adding a company never floods you with its entire back catalogue."""
    pairs = list(job_reasons)
    if not pairs:
        return 0
    reasons = dict(pairs)
    with store.dict_cursor(conn) as cur:
        cur.execute(JOB_SQL, (list(reasons),))
        jobs = [dict(r) for r in cur.fetchall()]
    alerts = _active_alerts(conn)
    created = 0
    with conn.cursor() as cur:
        for job in jobs:
            if first_scan and not (job.get("datePosted") and now - job["datePosted"] <= timedelta(hours=FIRST_SCAN_WINDOW_HOURS)):
                continue
            for a in alerts:
                if alert_applies(a["ruleJson"], a["wl"], job):
                    cur.execute('INSERT INTO "AlertEvent"(id,"alertId","jobId",reason,status,attempts,"createdAt") VALUES (%s,%s,%s,%s,\'PENDING\',0,%s) '
                                'ON CONFLICT ("alertId","jobId") DO NOTHING', (store.cuid(), a["id"], job["id"], reasons[job["id"]], now))
                    created += cur.rowcount
    return created


def _send(alert: dict, title: str, body: str, job_id: str | None, conn, now) -> dict[str, Any]:
    results: dict[str, Any] = {}
    for ch in alert["channels"] or ["BROWSER"]:
        if ch == "BROWSER":
            with conn.cursor() as cur:
                cur.execute('INSERT INTO "Notification"(id,"userId",title,body,"jobId","alertId","createdAt") VALUES (%s,%s,%s,%s,%s,%s,%s)',
                            (store.cuid(), alert["userId"], title[:300], body[:2000], job_id, alert["id"], now))
            results[ch] = {"ok": True}
            continue
        ok, detail = {"EMAIL": lambda: channels.send_email(alert["email"], title, body),
                      "DISCORD": lambda: channels.send_discord(title, body), "SLACK": lambda: channels.send_slack(title, body),
                      "SMS": lambda: channels.send_sms(title, body), "PUSH": lambda: channels.send_push(title, body)}[ch]()
        results[ch] = {"ok": ok, "detail": detail}
    return results


def _mark(conn, ids: list[str], results: dict, now: datetime) -> None:
    ok = any(r["ok"] for r in results.values())
    with conn.cursor() as cur:
        cur.execute('UPDATE "AlertEvent" SET attempts=attempts+1, status=%s, "deliveredAt"=%s, "channelResults"=%s WHERE id = ANY(%s)',
                    ("SENT" if ok else "FAILED", now if ok else None, store.J(results), ids))


def deliver(conn, now: datetime) -> dict[str, int]:
    """Deliver pending events: IMMEDIATE alerts right away; digest alerts when their window is due."""
    tz = os.environ.get("DIGEST_TZ", "UTC")
    mh, eh = int(os.environ.get("DIGEST_MORNING_HOUR", "8")), int(os.environ.get("DIGEST_EVENING_HOUR", "18"))
    stats = {"messages": 0, "events": 0}
    with conn.cursor() as cur:   # one deliverer at a time across threads/processes (lock held until commit)
        cur.execute("SELECT pg_try_advisory_xact_lock(727001)")
        if not cur.fetchone()[0]:
            return {"messages": 0, "events": 0, "skipped": 1}
    base = app_url()
    for a in _active_alerts(conn):
        with store.dict_cursor(conn) as cur:
            cur.execute('''SELECT e.id AS eid, e.reason, j.*, c.name AS "companyName" FROM "AlertEvent" e
                           JOIN "Job" j ON j.id=e."jobId" JOIN "Company" c ON c.id=j."companyId"
                           WHERE e."alertId"=%s AND e.status IN ('PENDING','FAILED') AND e.attempts < %s
                             AND j.status='OPEN' AND NOT j."isExcluded" ORDER BY j."firstDiscoveredAt" LIMIT 200''', (a["id"], MAX_ATTEMPTS))
            events = [dict(r) for r in cur.fetchall()]
        if not events or not digest_due(a["frequency"], a["lastDigestAt"], now, tz, mh, eh):
            continue
        singles, rollup = (events[:MAX_IMMEDIATE_PER_RUN], events[MAX_IMMEDIATE_PER_RUN:]) if a["frequency"] == "IMMEDIATE" else ([], events)
        for e in singles:
            title, body = build_message(e, e["reason"], base)
            _mark(conn, [e["eid"]], _send(a, title, body, e["id"], conn, now), now)
            stats["messages"] += 1; stats["events"] += 1
        if rollup:
            title, body = build_digest(rollup, base)
            _mark(conn, [e["eid"] for e in rollup], _send(a, title, body, None, conn, now), now)
            stats["messages"] += 1; stats["events"] += len(rollup)
        if a["frequency"] != "IMMEDIATE":
            with conn.cursor() as cur:
                cur.execute('UPDATE "Alert" SET "lastDigestAt"=%s WHERE id=%s', (now, a["id"]))
    return stats
