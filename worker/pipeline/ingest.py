"""Pure ingestion planning: given what's in the DB and what a scan returned, decide what to do.

No I/O here, so the critical logic (new vs changed vs reopened vs reposted vs missing, and the
safety rules around failed/empty scans) is fully unit-testable."""
from __future__ import annotations
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Optional

import config
from models import NormalizedJob
from pipeline.dedupe import find_duplicate
from pipeline.diff import diff_snapshots

SOURCE_PREFERENCE = {"greenhouse": 3, "lever": 3, "ashby": 3, "generic": 1}


@dataclass
class Insert:
    job: NormalizedJob


@dataclass
class Update:
    row_id: str
    job: NormalizedJob
    changes: list[dict[str, Any]]
    new_version: int
    reopened: bool = False
    reposted: bool = False


@dataclass
class Touch:
    row_id: str
    reopened: bool = False
    reposted: bool = False


@dataclass
class AddSource:
    row_id: str          # existing job row id, or "new:<n>" for a job inserted in this same plan
    job: NormalizedJob
    make_primary: bool = False


@dataclass
class Missed:
    row_id: str
    missed_scans: int
    new_status: str      # OPEN | POSSIBLY_CLOSED | CLOSED


@dataclass
class Plan:
    inserts: list[Insert] = field(default_factory=list)
    updates: list[Update] = field(default_factory=list)
    touches: list[Touch] = field(default_factory=list)
    add_sources: list[AddSource] = field(default_factory=list)
    missed: list[Missed] = field(default_factory=list)
    skipped_closure_reason: Optional[str] = None

    @property
    def stats(self) -> dict[str, int]:
        return {"new": len(self.inserts), "updated": len(self.updates),
                "reopened": sum(1 for u in self.updates if u.reopened) + sum(1 for t in self.touches if t.reopened),
                "closed": sum(1 for m in self.missed if m.new_status == "CLOSED")}


def plan_ingest(existing: list[dict], incoming: list[NormalizedJob], *, seen_external_ids: set[str],
                complete_listing: bool, source: str, ats: str, now: datetime) -> Plan:
    plan = Plan()
    working = [dict(r) for r in existing]          # rows we can match against
    matched_ids: set[str] = set()
    seq = 0

    for job in incoming:
        row, reason = find_duplicate(job, working)
        if row is None:
            seq += 1
            plan.inserts.append(Insert(job))
            working.append({
                "id": f"new:{seq}", "ats": job.ats, "externalJobId": job.external_id, "dedupeKey": job.dedupe_key,
                "applicationUrl": job.application_url, "normalizedTitle": job.normalized_title,
                "location": job.location, "description": job.description, "status": "OPEN",
                "postingHash": job.posting_hash, "version": 1, "source": job.source,
            })
            matched_ids.add(f"new:{seq}")
            continue

        rid = row["id"]
        matched_ids.add(rid)
        was_closed = row.get("status") in ("CLOSED", "POSSIBLY_CLOSED", "APPLICATION_REMOVED")
        reposted = was_closed and reason != "external_id"
        reopened = was_closed and not reposted

        if reason != "external_id" or row.get("source") != job.source:
            make_primary = SOURCE_PREFERENCE.get(job.source, 0) > SOURCE_PREFERENCE.get(row.get("source", ""), 0)
            plan.add_sources.append(AddSource(rid, job, make_primary))

        if rid.startswith("new:"):
            continue  # duplicate within the same scan; nothing more to do

        if row.get("postingHash") != job.posting_hash:
            old_snap = row.get("snapshot") or {}
            changes = diff_snapshots(old_snap, job.snapshot()) if old_snap else []
            plan.updates.append(Update(rid, job, changes, int(row.get("version", 1)) + 1, reopened, reposted))
        else:
            plan.touches.append(Touch(rid, reopened, reposted))

    # ---- closure detection (only after a SUCCESSFUL, COMPLETE fetch) ----
    if not complete_listing:
        plan.skipped_closure_reason = "connector does not return a complete listing"
        return plan
    open_rows = [r for r in existing if r.get("source") == source and r.get("ats") == ats
                 and r.get("status") in ("OPEN", "POSSIBLY_CLOSED")]
    if not seen_external_ids and len(open_rows) > 3:
        # An empty board for a company that had many jobs is more likely an outage than a mass closure.
        plan.skipped_closure_reason = "empty result for a company with many open jobs; treating as suspect"
        return plan
    for r in open_rows:
        if r["id"] in matched_ids or r.get("externalJobId") in seen_external_ids:
            continue
        missed = int(r.get("missedScans", 0)) + 1
        if missed >= config.MISSED_SCANS_CLOSED:
            status = "CLOSED"
        elif missed >= config.MISSED_SCANS_POSSIBLY_CLOSED:
            status = "POSSIBLY_CLOSED"
        else:
            status = r["status"]
        plan.missed.append(Missed(r["id"], missed, status))
    return plan
