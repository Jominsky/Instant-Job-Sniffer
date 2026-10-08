"""Long-running scheduler. Each tick: find due companies (priority + backoff aware) and scan them
in parallel with a bounded worker pool. Per-host rate limiting lives in HttpClient."""
from __future__ import annotations
import logging
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone

import config
import store
from connectors.http import HttpClient
from pipeline.providers import get_provider
from scanner import scan_company, rescore_all
from alerts import dispatcher

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("scheduler")


def run_once(only_slug: str | None = None, force: bool = False) -> dict:
    http, llm = HttpClient(), get_provider()
    with store.connect() as conn:
        profile = store.load_profile(conn)
        companies = store.due_companies(conn, datetime.now(timezone.utc), only_slug, force)
    log.info("%d companies due", len(companies))
    summary = {"SUCCESS": 0, "FAILURE": 0, "SKIPPED": 0, "new": 0}
    with ThreadPoolExecutor(max_workers=config.CONCURRENCY) as pool:
        futs = {pool.submit(scan_company, c, profile, http, llm): c for c in companies}
        for f in as_completed(futs):
            c = futs[f]
            try:
                r = f.result()
            except Exception as e:   # one company must never take the scheduler down
                log.exception("unhandled error scanning %s", c.name)
                r = {"status": "FAILURE", "error": str(e)}
            summary[r["status"]] = summary.get(r["status"], 0) + 1
            summary["new"] += r.get("new", 0)
            log.info("%s [%s] -> %s", c.name, c.priority, {k: v for k, v in r.items() if k != "closure_note"})
    try:   # digests (hourly / morning / evening) and any retries of failed deliveries
        with store.connect() as conn:
            dispatcher.deliver(conn, datetime.now(timezone.utc))
    except Exception:
        log.exception("alert delivery failed")
    return summary


_profile_sig = None


def maybe_rescore() -> None:
    """Re-score every open job when the profile/resumes change (the web UI only edits the profile)."""
    global _profile_sig
    with store.connect() as conn:
        sig = store.profile_signature(conn)
    if _profile_sig is not None and sig != _profile_sig:
        log.info("profile changed: re-scoring %d jobs", rescore_all())
    _profile_sig = sig


def main(tick_seconds: int = 30) -> None:
    log.info("scheduler started (tick=%ss)", tick_seconds)
    while True:
        try:
            maybe_rescore()
            run_once()
        except Exception:
            log.exception("scheduler tick failed")
        time.sleep(tick_seconds)


if __name__ == "__main__":
    main()
