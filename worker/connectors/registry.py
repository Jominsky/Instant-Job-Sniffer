"""Connector registry and ATS auto-detection from a careers URL."""
from __future__ import annotations
import re
from typing import Optional
from urllib.parse import urlparse

from connectors.base import Connector
from connectors.greenhouse import GreenhouseConnector
from connectors.lever import LeverConnector
from connectors.ashby import AshbyConnector
from connectors.generic import GenericCareersConnector
from connectors.smartrecruiters import SmartRecruitersConnector
from connectors.workday import WorkdayConnector
from connectors.rss import RssFeedConnector

# Add new connectors here.
CONNECTORS: dict[str, type[Connector]] = {
    "GREENHOUSE": GreenhouseConnector,
    "LEVER": LeverConnector,
    "ASHBY": AshbyConnector,
    "SMARTRECRUITERS": SmartRecruitersConnector,
    "WORKDAY": WorkdayConnector,
    "GENERIC_CAREERS_PAGE": GenericCareersConnector,
    "RSS_FEED": RssFeedConnector,
}


def get_connector(ats: str, http=None) -> Optional[Connector]:
    cls = CONNECTORS.get(ats)
    return cls(http) if cls else None


_PATTERNS: list[tuple[str, re.Pattern]] = [
    ("GREENHOUSE", re.compile(r"(?:boards|job-boards)(?:\.eu)?\.greenhouse\.io/(?:embed/job_board\?for=)?([\w-]+)", re.I)),
    ("LEVER", re.compile(r"jobs\.(eu\.)?lever\.co/([\w-]+)", re.I)),
    ("ASHBY", re.compile(r"jobs\.ashbyhq\.com/([\w.%-]+)", re.I)),
]
_UNSUPPORTED = {"jobvite.com": "JOBVITE", "icims.com": "ICIMS", "successfactors": "SUCCESSFACTORS"}
# A URL that is itself an RSS/Atom feed (checked after the specific ATSes so e.g. a Greenhouse board URL is never mistaken for a feed).
_FEED = re.compile(r"(?:\.(?:rss|atom|xml)(?:[?#]|$)|/(?:rss|feed|atom)/?(?:[?#]|$)|[?&]format=(?:rss|atom))", re.I)
_SR = re.compile(r"(?:jobs|careers)\.smartrecruiters\.com/([\w%-]+)", re.I)
_WD = re.compile(r"^(?:https?://)?([\w-]+)\.wd\d+\.myworkdayjobs\.com(?:/(?:[a-z]{2}-[A-Za-z]{2}))?/([\w%-]+)", re.I)


def detect_ats(careers_url: Optional[str]) -> tuple[str, Optional[str]]:
    """Return (AtsProvider, identifier) for a careers URL. Unsupported ATSes are recognised
    but have no connector yet, so they are scanned with the generic connector if at all."""
    if not careers_url:
        return "UNKNOWN", None
    for ats, pat in _PATTERNS:
        m = pat.search(careers_url)
        if m:
            if ats == "LEVER":
                return ats, ("eu:" if m.group(1) else "") + m.group(2)
            return ats, m.group(1)
    m = _SR.search(careers_url)
    if m:
        return "SMARTRECRUITERS", m.group(1)
    m = _WD.search(careers_url.strip())
    if m:
        host = urlparse(careers_url if "//" in careers_url else "//" + careers_url).netloc.lower()
        return "WORKDAY", f"{host}|{m.group(1).lower()}|{m.group(2)}"
    if _FEED.search(careers_url.strip()):
        return "RSS_FEED", careers_url.strip()
    host = urlparse(careers_url if "//" in careers_url else "//" + careers_url).netloc.lower()
    for needle, ats in _UNSUPPORTED.items():
        if needle in host or needle in careers_url.lower():
            return ats, None
    return "GENERIC_CAREERS_PAGE", None
