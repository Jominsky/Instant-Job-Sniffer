"""Connector interface. To add a new source, subclass Connector and register it."""
from __future__ import annotations
from abc import ABC, abstractmethod
from datetime import datetime, timezone
from typing import Optional

from models import CompanyRef, RawJob
from connectors.http import HttpClient


def parse_dt(value) -> Optional[datetime]:
    """Parse ISO-8601 strings or epoch milliseconds into aware UTC datetimes."""
    if value in (None, ""):
        return None
    try:
        if isinstance(value, (int, float)):
            return datetime.fromtimestamp(value / 1000, tz=timezone.utc)
        s = str(value).strip().replace("Z", "+00:00")
        dt = datetime.fromisoformat(s)
        return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
    except (ValueError, OSError, OverflowError):
        return None


class Connector(ABC):
    #: stable connector name stored in Job.source
    name: str = ""
    #: AtsProvider enum value this connector reads
    ats: str = "UNKNOWN"
    #: True when fetch() returns the company's COMPLETE open listing, so absence
    #: from a successful fetch is meaningful (enables closure detection).
    complete_listing: bool = True

    def __init__(self, http: Optional[HttpClient] = None):
        self.http = http or HttpClient()

    @abstractmethod
    def fetch(self, company: CompanyRef) -> list[RawJob]:
        """Return all currently open public postings. Raise FetchError on failure."""
