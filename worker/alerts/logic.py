"""Pure helpers: digest timing and message formatting."""
from __future__ import annotations
import os
from datetime import datetime
from typing import Any, Optional
from zoneinfo import ZoneInfo

ROLE = {"SWE": "Software Engineering", "QUANT_DEVELOPER": "Quant Developer", "QUANT_RESEARCH": "Quant Research",
        "QUANT_TRADING": "Quant Trading", "ML_AI": "ML / AI", "DATA_ENGINEERING": "Data Engineering"}


def digest_due(frequency: str, last_digest_at: Optional[datetime], now: datetime,
               tz: str = "UTC", morning_hour: int = 8, evening_hour: int = 18) -> bool:
    """IMMEDIATE always delivers; HOURLY every 60 min; MORNING/EVENING once per day after the slot hour."""
    if frequency == "IMMEDIATE":
        return True
    if frequency == "HOURLY":
        return last_digest_at is None or (now - last_digest_at).total_seconds() >= 3600
    hour = morning_hour if frequency == "MORNING" else evening_hour
    zone = ZoneInfo(tz)
    now_l = now.astimezone(zone)
    slot = now_l.replace(hour=hour, minute=0, second=0, microsecond=0)
    if now_l < slot:
        return False
    return last_digest_at is None or last_digest_at.astimezone(zone) < slot


def _clean(text: str) -> str:
    """Job text comes from third parties: neutralise chat @-mentions before posting to Discord/Slack."""
    return (text or "").replace("@", "@\u200b").replace("\r", " ")


def job_line(job: dict[str, Any]) -> str:
    fit = f"{job['fitScore']}% · " if job.get("fitScore") is not None else ""
    season = ""
    if job.get("targetYear"):
        season = f" · {'' if job.get('seasonProvenance') == 'ATS' else 'likely '}{job.get('targetSeason') or ''} {job['targetYear']}".replace("  ", " ")
    loc = f" · {job['location']}" if job.get("location") else ""
    return _clean(f"{fit}{job['title']} @ {job.get('companyName', '')}{loc}{season}")


def build_message(job: dict[str, Any], reason: str, app_url: str) -> tuple[str, str]:
    tag = {"new": "New", "reopened": "Reopened", "reposted": "Reposted"}.get(reason, "New")
    title = f"{tag}: {job_line(job)}"
    posted = f"Posted {job['datePosted'].strftime('%Y-%m-%d %H:%M UTC')}\n" if job.get("datePosted") else ""
    body = (f"{posted}Official application: {job['applicationUrl']}\n"
            f"Details in JobIntel: {app_url.rstrip('/')}/jobs/{job['id']}")
    return title, body


def build_digest(jobs: list[dict[str, Any]], app_url: str, limit: int = 25) -> tuple[str, str]:
    title = f"{len(jobs)} new matching job{'s' if len(jobs) != 1 else ''}"
    lines = [f"• {job_line(j)}\n  {app_url.rstrip('/')}/jobs/{j['id']}" for j in jobs[:limit]]
    if len(jobs) > limit:
        lines.append(f"…and {len(jobs) - limit} more in JobIntel")
    return title, "\n".join(lines)


def app_url() -> str:
    return os.environ.get("NEXTAUTH_URL", "http://localhost:3000")
