"""Alert / watchlist rule matching (pure). Mirrors lib/rules.ts (ruleToWhere) on the web side; keep in sync.

Rule JSON (all keys optional; every key that is present must match; lists are OR within a key):
  minFit, experienceLevels, roleCategories, seasons, years, statedSeasonOnly,
  companyIds + categories  (a UNION: job's company must be in companyIds OR have one of the categories),
  priorities, keywords (title/description), locations (substring, or "remote"), technologies
"""
from __future__ import annotations
import re
from typing import Any, Optional

CRITERIA = ("minFit", "experienceLevels", "roleCategories", "seasons", "years", "companyIds", "categories",
            "priorities", "keywords", "locations", "technologies")


def _list(rule: dict, key: str) -> list:
    v = rule.get(key)
    return list(v) if isinstance(v, list) else []


def has_criteria(rule: Optional[dict]) -> bool:
    rule = rule or {}
    return any(rule.get(k) not in (None, [], "") for k in CRITERIA)


def rule_matches(rule: Optional[dict], job: dict[str, Any], *, allow_empty: bool = False) -> bool:
    """`job` uses DB column names plus companyId/category/priority from the company row."""
    rule = rule or {}
    if job.get("isExcluded") or job.get("status", "OPEN") != "OPEN":
        return False
    if not has_criteria(rule):
        return allow_empty

    min_fit = rule.get("minFit")
    if min_fit is not None and (job.get("fitScore") is None or job["fitScore"] < float(min_fit)):
        return False
    for key, col in (("experienceLevels", "experienceLevel"), ("roleCategories", "roleCategory")):
        vals = _list(rule, key)
        if vals and job.get(col) not in vals:
            return False
    seasons, years = _list(rule, "seasons"), [int(y) for y in _list(rule, "years")]
    if seasons and job.get("targetSeason") not in seasons:
        return False
    if years and job.get("targetYear") not in years:
        return False
    if (seasons or years) and rule.get("statedSeasonOnly") and job.get("seasonProvenance") != "ATS":
        return False

    ids, cats = _list(rule, "companyIds"), _list(rule, "categories")
    if (ids or cats) and not (job.get("companyId") in ids or job.get("category") in cats):
        return False
    pri = _list(rule, "priorities")
    if pri and job.get("priority") not in pri:
        return False

    kws = [k for k in _list(rule, "keywords") if str(k).strip()]
    if kws:
        text = f"{job.get('title', '')}\n{(job.get('description') or '')[:4000]}".lower()
        if not any(re.search(r"(?<![\w+#])" + re.escape(str(k).lower()) + r"(?![\w+#])", text) for k in kws):
            return False
    locs = [str(l).lower() for l in _list(rule, "locations")]
    if locs:
        loc = (job.get("location") or "").lower()
        ok = any((l == "remote" and job.get("workMode") == "REMOTE") or (l != "remote" and l in loc) for l in locs)
        if not ok:
            return False
    techs = {str(t).lower() for t in _list(rule, "technologies")}
    if techs and not (techs & {str(t).lower() for t in (job.get("technologies") or [])}):
        return False
    return True


def alert_applies(alert_rule: Optional[dict], watchlist_rule: Optional[dict], job: dict[str, Any]) -> bool:
    """An alert tied to a watchlist fires only for jobs matching BOTH the watchlist and the alert's own rule."""
    if not rule_matches(alert_rule, job, allow_empty=watchlist_rule is not None and has_criteria(watchlist_rule)):
        return False
    return rule_matches(watchlist_rule, job, allow_empty=True) if watchlist_rule is not None else True
