"""Human-readable diffs between job snapshots."""
from __future__ import annotations
from typing import Any

from pipeline.dedupe import similarity

TRACKED = {
    "title": "Title changed",
    "location": "Location",
    "compensation_raw": "Salary",
    "application_deadline": "Application deadline",
    "work_mode": "Work mode",
    "target_season": "Season",
    "target_year": "Target year",
    "graduation_requirement": "Graduation requirement",
    "qualifications": "Qualifications",
    "preferred_qualifications": "Preferred qualifications",
    "experience_level": "Experience level",
}


def diff_snapshots(old: dict[str, Any], new: dict[str, Any]) -> list[dict[str, Any]]:
    changes: list[dict[str, Any]] = []
    for field, label in TRACKED.items():
        a, b = old.get(field), new.get(field)
        if a == b:
            continue
        if a in (None, "") and b not in (None, ""):
            kind, text = "added", f"{label} added"
        elif b in (None, "") and a not in (None, ""):
            kind, text = "removed", f"{label} removed"
        else:
            kind, text = "changed", f"{label} updated" if field in ("compensation_raw",) else f"{label} changed"
        if field in ("qualifications", "preferred_qualifications") and a and b and similarity(str(a), str(b)) > 0.95:
            continue
        changes.append({"field": field, "kind": kind, "summary": text, "old": a, "new": b})
    da, db = old.get("description") or "", new.get("description") or ""
    if da != db and similarity(da, db) < 0.98:
        changes.append({"field": "description", "kind": "changed", "summary": "Description changed",
                        "old": None, "new": None, "similarity": round(similarity(da, db), 3)})
    return changes
