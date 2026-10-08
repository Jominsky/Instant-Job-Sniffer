"""Lever public Postings API: https://api.lever.co/v0/postings/{site}?mode=json
Identifier may be prefixed with 'eu:' for the EU region (api.eu.lever.co)."""
from __future__ import annotations
from models import CompanyRef, RawJob
from connectors.base import Connector, parse_dt
from connectors.http import FetchError


class LeverConnector(Connector):
    name = "lever"
    ats = "LEVER"

    def fetch(self, company: CompanyRef) -> list[RawJob]:
        ident = company.ats_identifier
        if not ident:
            raise FetchError("Lever site identifier missing for company")
        host = "api.lever.co"
        if ident.startswith("eu:"):
            host, ident = "api.eu.lever.co", ident[3:]
        data = self.http.get(f"https://{host}/v0/postings/{ident}?mode=json").json()
        if not isinstance(data, list):
            raise FetchError("Unexpected Lever response shape")
        return self.parse(data)

    @staticmethod
    def parse(data: list) -> list[RawJob]:
        out: list[RawJob] = []
        for j in data:
            cats = j.get("categories") or {}
            parts = [j.get("description") or ""]
            for lst in j.get("lists") or []:
                parts.append(f"<h3>{lst.get('text', '')}</h3><ul>{lst.get('content', '')}</ul>")
            parts.append(j.get("additional") or "")
            sal = j.get("salaryRange")
            comp = None
            if sal and sal.get("min") and sal.get("max"):
                comp = f"{sal.get('currency', 'USD')} {int(sal['min']):,} - {int(sal['max']):,} {sal.get('interval', '')}".strip()
            out.append(RawJob(
                external_id=str(j["id"]),
                title=(j.get("text") or "").strip(),
                url=j.get("hostedUrl") or j.get("applyUrl") or "",
                source_url=j.get("hostedUrl") or "",
                description_html="\n".join(parts),
                location=cats.get("location"),
                department=cats.get("team") or cats.get("department"),
                employment_type=cats.get("commitment"),
                workplace_type=j.get("workplaceType"),
                posted_at=parse_dt(j.get("createdAt")),
                compensation_text=comp,
            ))
        return out
