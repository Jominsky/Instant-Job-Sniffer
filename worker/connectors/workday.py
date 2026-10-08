"""Workday career-site connector.

Workday career sites are single-page apps that load their data from a public JSON endpoint on the same host
(the same one the website itself calls):
    POST https://{host}/wday/cxs/{tenant}/{site}/jobs          {"limit":20,"offset":0,"searchText":"intern"}
    GET  https://{host}/wday/cxs/{tenant}/{site}{externalPath}  (job detail)
This is not a documented, contractual API, so the connector is conservative: it checks robots.txt, rate-limits,
only queries a few targeted search terms, and fetches details only for relevant-looking titles. Search-limited ⇒
complete_listing is False (it never closes jobs). Identifier format: "host|tenant|site".
"""
from __future__ import annotations
import re
from datetime import datetime, timezone
from typing import Optional

from models import CompanyRef, RawJob
from connectors.base import Connector
from connectors.detail_cache import DetailCache
from connectors.http import BlockedByRobots, FetchError
from pipeline.relevance import title_is_candidate

QUERIES = ["intern", "new grad", "university", "quantitative", "software engineer"]
PAGE = 20
MAX_PAGES_PER_QUERY = 5
MAX_DETAILS_PER_SCAN = 40


class WorkdayConnector(Connector):
    name = "workday"
    ats = "WORKDAY"
    complete_listing = False

    def __init__(self, http=None):
        super().__init__(http)
        self.cache = DetailCache()

    @staticmethod
    def split_identifier(ident: Optional[str]) -> tuple[str, str, str]:
        parts = (ident or "").split("|")
        if len(parts) != 3 or not all(parts):
            raise FetchError("Workday identifier must look like host|tenant|site")
        return parts[0], parts[1], parts[2]

    def fetch(self, company: CompanyRef) -> list[RawJob]:
        host, tenant, site = self.split_identifier(company.ats_identifier)
        base = f"https://{host}/wday/cxs/{tenant}/{site}"
        if not self.http.allowed_by_robots(f"https://{host}/{site}"):
            raise BlockedByRobots(f"robots.txt disallows {host}")
        listing: dict[str, dict] = {}
        for q in QUERIES:
            for page in range(MAX_PAGES_PER_QUERY):
                data = self.http.post_json(f"{base}/jobs", {"appliedFacets": {}, "limit": PAGE, "offset": page * PAGE, "searchText": q}).json()
                postings = data.get("jobPostings") or []
                for p in postings:
                    if p.get("externalPath"):
                        listing.setdefault(p["externalPath"], p)
                if len(postings) < PAGE:
                    break
        budget = MAX_DETAILS_PER_SCAN
        out: list[RawJob] = []
        for path, p in listing.items():
            raw = self.parse_item(p, host, site)
            if title_is_candidate(raw.title):
                detail = self.cache.get(f"{host}{path}")
                if detail is None and budget > 0:
                    budget -= 1
                    try:
                        detail = self.http.get(f"{base}{path}").json()
                        self.cache.put(f"{host}{path}", detail)
                    except FetchError:
                        detail = None
                if detail is not None:
                    self.apply_detail(raw, detail)
                else:
                    raw.extra["stub"] = True
            else:
                raw.extra["stub"] = True
            out.append(raw)
        return out

    @staticmethod
    def parse_item(p: dict, host: str, site: str) -> RawJob:
        path = p["externalPath"]
        req = next((b for b in (p.get("bulletFields") or []) if re.match(r"^[A-Za-z]{1,4}[-_ ]?\d+", str(b))), None)
        public = f"https://{host}/{site}{path}"
        return RawJob(external_id=str(req or path), title=(p.get("title") or "").strip(), url=public, source_url=public,
                      location=p.get("locationsText"), extra={"path": path, "posted_relative": p.get("postedOn")})

    @staticmethod
    def apply_detail(raw: RawJob, d: dict) -> None:
        info = d.get("jobPostingInfo") or {}
        raw.description_html = info.get("jobDescription") or ""
        raw.url = info.get("externalUrl") or raw.url
        raw.location = info.get("location") or raw.location
        # external_id is deliberately NOT changed here: it must be identical whether or not the detail was cached.
        raw.employment_type = info.get("timeType")
        # startDate is a real calendar date; the list's "Posted 3 Days Ago" is relative, so we don't derive a date from it.
        sd = info.get("startDate")
        if sd:
            try:
                raw.posted_at = datetime.strptime(sd[:10], "%Y-%m-%d").replace(tzinfo=timezone.utc)
            except ValueError:
                pass
