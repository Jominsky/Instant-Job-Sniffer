"""SmartRecruiters public Posting API: https://api.smartrecruiters.com/v1/companies/{companyId}/postings
List is paginated (limit<=100); each posting's description comes from the detail endpoint, which we only
call for titles that look relevant (see pipeline.relevance)."""
from __future__ import annotations
from typing import Any, Optional

from models import CompanyRef, RawJob
from connectors.base import Connector, parse_dt
from connectors.detail_cache import DetailCache
from connectors.http import FetchError
from pipeline.relevance import title_is_candidate

MAX_PAGES = 30           # 3000 postings
MAX_DETAILS_PER_SCAN = 80


def _location(loc: Optional[dict]) -> Optional[str]:
    if not loc:
        return None
    parts = [loc.get("city"), loc.get("region"), (loc.get("country") or "").upper() or None]
    s = ", ".join(p for p in parts if p)
    return ("Remote" + (f" ({s})" if s else "")) if loc.get("remote") else (s or None)


class SmartRecruitersConnector(Connector):
    name = "smartrecruiters"
    ats = "SMARTRECRUITERS"
    complete_listing = True      # the full list is read; absent ids really are gone

    def __init__(self, http=None):
        super().__init__(http)
        self.cache = DetailCache()

    def fetch(self, company: CompanyRef) -> list[RawJob]:
        cid = company.ats_identifier
        if not cid:
            raise FetchError("SmartRecruiters company identifier missing")
        base = f"https://api.smartrecruiters.com/v1/companies/{cid}/postings"
        items: list[dict] = []
        for page in range(MAX_PAGES):
            data = self.http.get(f"{base}?limit=100&offset={page * 100}").json()
            chunk = data.get("content") or []
            items += chunk
            if len(chunk) < 100 or len(items) >= int(data.get("totalFound", 0) or 0):
                break
        budget = MAX_DETAILS_PER_SCAN
        out: list[RawJob] = []
        for it in items:
            raw = self.parse_item(it, company)
            if title_is_candidate(raw.title):
                detail = self.cache.get(f"{cid}/{raw.external_id}")
                if detail is None and budget > 0:
                    budget -= 1
                    try:
                        detail = self.http.get(f"{base}/{raw.external_id}").json()
                        self.cache.put(f"{cid}/{raw.external_id}", detail)
                    except FetchError:
                        detail = None
                if detail is not None:
                    self.apply_detail(raw, detail)
                else:
                    raw.extra["stub"] = True      # seen (counts for closure) but not stored until its description is fetched
            else:
                raw.extra["stub"] = True
            out.append(raw)
        return out

    @staticmethod
    def parse_item(it: dict, company: CompanyRef) -> RawJob:
        pid = str(it["id"])
        public = f"https://jobs.smartrecruiters.com/{company.ats_identifier}/{pid}"
        return RawJob(external_id=pid, title=(it.get("name") or "").strip(), url=public, source_url=public,
                      location=_location(it.get("location")), department=(it.get("department") or {}).get("label"),
                      employment_type=(it.get("typeOfEmployment") or {}).get("label"),
                      workplace_type="remote" if (it.get("location") or {}).get("remote") else None,
                      posted_at=parse_dt(it.get("releasedDate")))

    @staticmethod
    def apply_detail(raw: RawJob, d: dict[str, Any]) -> None:
        secs = (d.get("jobAd") or {}).get("sections") or {}
        order = ["companyDescription", "jobDescription", "qualifications", "additionalInformation"]
        titles = {"qualifications": "Qualifications", "additionalInformation": "Additional information"}
        parts = []
        for k in order:
            sec = secs.get(k) or {}
            if sec.get("text"):
                parts.append((f"<h3>{titles[k]}</h3>" if k in titles else "") + sec["text"])
        raw.description_html = "\n".join(parts)
        raw.url = d.get("applyUrl") or d.get("postingUrl") or raw.url
        raw.source_url = d.get("postingUrl") or raw.source_url
