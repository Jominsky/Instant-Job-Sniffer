"""Generic careers-page connector.

Reads schema.org JobPosting JSON-LD embedded in a public careers page. This only works for
server-rendered pages that publish structured data. It never executes JavaScript, never
bypasses logins/CAPTCHAs, and refuses any URL disallowed by robots.txt.

complete_listing is False: a page that exposes a subset of jobs can't prove absence, so this
connector never triggers closure detection.
"""
from __future__ import annotations
import hashlib
import json
import re
from models import CompanyRef, RawJob
from connectors.base import Connector, parse_dt
from connectors.http import BlockedByRobots, FetchError

_LD_JSON = re.compile(r'<script[^>]+type=["\']application/ld\+json["\'][^>]*>(.*?)</script>', re.S | re.I)


def _iter_postings(node):
    if isinstance(node, list):
        for n in node:
            yield from _iter_postings(n)
    elif isinstance(node, dict):
        t = node.get("@type")
        if t == "JobPosting" or (isinstance(t, list) and "JobPosting" in t):
            yield node
        for v in node.values():
            if isinstance(v, (list, dict)):
                yield from _iter_postings(v)


class GenericCareersConnector(Connector):
    name = "generic"
    ats = "GENERIC_CAREERS_PAGE"
    complete_listing = False

    def fetch(self, company: CompanyRef) -> list[RawJob]:
        if not company.careers_url:
            raise FetchError("No careers URL configured")
        if not self.http.allowed_by_robots(company.careers_url):
            raise BlockedByRobots(f"robots.txt disallows {company.careers_url}")
        html = self.http.get(company.careers_url).text
        return self.parse(html, company.careers_url)

    @staticmethod
    def parse(html: str, page_url: str) -> list[RawJob]:
        out: list[RawJob] = []
        for block in _LD_JSON.findall(html):
            try:
                data = json.loads(block)
            except json.JSONDecodeError:
                continue
            for p in _iter_postings(data):
                title = (p.get("title") or "").strip()
                if not title:
                    continue
                url = p.get("url") or (p.get("hiringOrganization") or {}).get("sameAs") or page_url
                ident = p.get("identifier")
                ext = ident.get("value") if isinstance(ident, dict) else ident
                ext = str(ext) if ext else hashlib.sha1(f"{url}|{title}".encode()).hexdigest()[:16]
                loc = p.get("jobLocation")
                if isinstance(loc, list):
                    loc = loc[0] if loc else None
                addr = (loc or {}).get("address", {}) if isinstance(loc, dict) else {}
                location = ", ".join(x for x in (addr.get("addressLocality"), addr.get("addressRegion"), addr.get("addressCountry")) if isinstance(x, str)) or None
                wp = "remote" if p.get("jobLocationType") == "TELECOMMUTE" else None
                sal = (p.get("baseSalary") or {}).get("value") or {}
                comp = None
                if isinstance(sal, dict) and sal.get("minValue") and sal.get("maxValue"):
                    comp = f"{sal['minValue']:,} - {sal['maxValue']:,} {sal.get('unitText', '')}".strip()
                out.append(RawJob(
                    external_id=ext, title=title, url=url, source_url=page_url,
                    description_html=p.get("description") or "", location=location,
                    employment_type=str(p.get("employmentType") or "") or None,
                    workplace_type=wp, posted_at=parse_dt(p.get("datePosted")),
                    deadline=parse_dt(p.get("validThrough")), compensation_text=comp,
                ))
        return out
