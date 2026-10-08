"""Greenhouse public Job Board API: https://boards-api.greenhouse.io/v1/boards/{token}/jobs"""
from __future__ import annotations
from models import CompanyRef, RawJob
from connectors.base import Connector, parse_dt
from connectors.http import FetchError


class GreenhouseConnector(Connector):
    name = "greenhouse"
    ats = "GREENHOUSE"

    def fetch(self, company: CompanyRef) -> list[RawJob]:
        if not company.ats_identifier:
            raise FetchError("Greenhouse board token missing for company")
        url = f"https://boards-api.greenhouse.io/v1/boards/{company.ats_identifier}/jobs?content=true"
        data = self.http.get(url).json()
        return self.parse(data)

    @staticmethod
    def parse(data: dict) -> list[RawJob]:
        out: list[RawJob] = []
        for j in data.get("jobs", []):
            depts = [d.get("name") for d in j.get("departments", []) if d.get("name")]
            pay = j.get("pay_input_ranges") or []
            comp = None
            if pay:
                p = pay[0]
                lo, hi = p.get("min_cents"), p.get("max_cents")
                if lo and hi:
                    cur = p.get("currency_type", "USD")
                    comp = f"{cur} {lo // 100:,} - {hi // 100:,}"
            out.append(RawJob(
                external_id=str(j["id"]),
                title=j.get("title", "").strip(),
                url=j.get("absolute_url", ""),
                source_url=j.get("absolute_url", ""),
                description_html=j.get("content", "") or "",
                location=(j.get("location") or {}).get("name"),
                department=depts[0] if depts else None,
                # first_published is the real publish date; updated_at is NOT a posting date.
                posted_at=parse_dt(j.get("first_published")),
                compensation_text=comp,
            ))
        return out
