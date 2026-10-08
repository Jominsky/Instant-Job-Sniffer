"""Plain data containers shared across connectors and the pipeline."""
from __future__ import annotations
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Optional


@dataclass
class CompanyRef:
    id: str
    name: str
    slug: str
    ats: str                      # AtsProvider enum value
    ats_identifier: Optional[str]
    careers_url: Optional[str]
    priority: str = "P2"
    category: str = "OTHER"
    first_scan: bool = False      # never successfully scanned before (suppresses back-catalogue alerts)


@dataclass
class RawJob:
    """What a connector returns: source-shaped, minimally processed."""
    external_id: str
    title: str
    url: str                      # official application URL
    source_url: str
    description_html: str = ""
    location: Optional[str] = None
    department: Optional[str] = None
    employment_type: Optional[str] = None
    workplace_type: Optional[str] = None   # "remote" | "hybrid" | "onsite" if the source says so
    posted_at: Optional[datetime] = None
    compensation_text: Optional[str] = None
    deadline: Optional[datetime] = None
    extra: dict[str, Any] = field(default_factory=dict)


@dataclass
class NormalizedJob:
    external_id: str
    ats: str
    source: str
    title: str
    normalized_title: str
    location: Optional[str]
    work_mode: str
    experience_level: str
    role_category: str
    department: Optional[str]
    description: str
    qualifications: Optional[str]
    preferred_qualifications: Optional[str]
    technologies: list[str]
    compensation_min: Optional[int]
    compensation_max: Optional[int]
    compensation_raw: Optional[str]
    application_url: str
    source_url: str
    date_posted: Optional[datetime]
    application_deadline: Optional[datetime]
    target_season: Optional[str]
    target_year: Optional[int]
    season_provenance: str
    classification_provenance: str
    graduation_requirement: Optional[str]
    citizenship_requirement: Optional[str]
    sponsorship_info: Optional[str]
    school_year_requirement: Optional[str]
    dedupe_key: str
    posting_hash: str
    season_evidence: Optional[str] = None
    compensation_period: Optional[str] = None       # HOUR | MONTH | WEEK | YEAR (min/max are in this unit)
    compensation_annual_max: Optional[int] = None   # annualised max, for sorting and minimum-pay checks

    def snapshot(self) -> dict[str, Any]:
        d = dict(self.__dict__)
        for k in ("date_posted", "application_deadline"):
            if d[k] is not None:
                d[k] = d[k].isoformat()
        return d
