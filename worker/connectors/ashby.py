"""Ashby public job board API: https://api.ashbyhq.com/posting-api/job-board/{name}"""
from __future__ import annotations
from models import CompanyRef, RawJob
from connectors.base import Connector, parse_dt
from connectors.http import FetchError


class AshbyConnector(Connector):
    name = "ashby"
    ats = "ASHBY"

    def fetch(self, company: CompanyRef) -> list[RawJob]:
        if not company.ats_identifier:
            raise FetchError("Ashby job board name missing for company")
        url = f"https://api.ashbyhq.com/posting-api/job-board/{company.ats_identifier}?includeCompensation=true"
        return self.parse(self.http.get(url).json())

    @staticmethod
    def parse(data: dict) -> list[RawJob]:
        out: list[RawJob] = []
        for j in data.get("jobs", []):
            if j.get("isListed") is False:
                continue
            comp = (j.get("compensation") or {}).get("compensationTierSummary")
            wp = "remote" if j.get("isRemote") else (j.get("workplaceType") or "").lower() or None
            out.append(RawJob(
                external_id=str(j["id"]),
                title=(j.get("title") or "").strip(),
                url=j.get("applyUrl") or j.get("jobUrl") or "",
                source_url=j.get("jobUrl") or "",
                description_html=j.get("descriptionHtml") or j.get("descriptionPlain") or "",
                location=j.get("location"),
                department=j.get("department") or j.get("team"),
                employment_type=j.get("employmentType"),
                workplace_type=wp,
                posted_at=parse_dt(j.get("publishedAt")),
                compensation_text=comp,
            ))
        return out
