"""RSS / Atom feed connector for employers that publish job postings as a public feed.

Feeds usually list only the most recent N items, so absence from a feed does not mean a job closed:
complete_listing is False and this connector never triggers closure detection.

The feed URL is the company's ats_identifier (falling back to careers_url). robots.txt is honoured.
XML from the network is untrusted: documents that declare a DTD or entities are rejected outright
(feeds never need them, and they are the vector for entity-expansion attacks), and size is capped.
"""
from __future__ import annotations
import hashlib
import re
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from typing import Optional

from models import CompanyRef, RawJob
from connectors.base import Connector, parse_dt
from connectors.http import BlockedByRobots, FetchError

MAX_CHARS = 5_000_000
_DTD = re.compile(r"<!\s*(?:DOCTYPE|ENTITY)", re.I)


def _local(tag) -> str:
    return tag.rsplit("}", 1)[-1].lower() if isinstance(tag, str) else ""


def _children(el, *names):
    return [c for c in el if _local(c.tag) in names]


def _text(el, *names) -> str:
    """Text of the first non-empty child, trying the names in priority order (not document order); nested markup is flattened."""
    for name in names:
        for c in _children(el, name):
            t = "".join(c.itertext()).strip()
            if t:
                return t
    return ""


def _date(value: str) -> Optional[datetime]:
    if not value:
        return None
    try:
        dt = parsedate_to_datetime(value)                     # RFC 822 (RSS pubDate)
        return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
    except (TypeError, ValueError, IndexError):
        return parse_dt(value)                                # ISO 8601 (Atom)


def _link(entry) -> str:
    for c in _children(entry, "link"):
        href = c.get("href")
        if href and c.get("rel", "alternate") == "alternate":  # Atom
            return href.strip()
        if (c.text or "").strip():                             # RSS
            return c.text.strip()
    return ""


class RssFeedConnector(Connector):
    name = "rss"
    ats = "RSS_FEED"
    complete_listing = False

    def fetch(self, company: CompanyRef) -> list[RawJob]:
        ident = company.ats_identifier or ""
        url = ident if ident.lower().startswith(("http://", "https://")) else (company.careers_url or "")
        if not url:
            raise FetchError("No feed URL configured (set it as the company's careers URL)")
        if not self.http.allowed_by_robots(url):
            raise BlockedByRobots(f"robots.txt disallows {url}")
        return self.parse(self.http.get(url).text)

    @staticmethod
    def parse(xml_text: str) -> list[RawJob]:
        if len(xml_text) > MAX_CHARS:
            raise FetchError("Feed is too large")
        if _DTD.search(xml_text):
            raise FetchError("Feed declares a DTD/entities; refusing to parse it")
        try:
            root = ET.fromstring(xml_text.encode("utf-8") if xml_text.lstrip().startswith("<?xml") else xml_text)
        except ET.ParseError as e:
            raise FetchError(f"Feed is not valid XML: {e}")
        if _local(root.tag) not in ("rss", "feed", "rdf"):
            raise FetchError("Not an RSS or Atom feed")
        out: list[RawJob] = []
        for el in root.iter():
            if _local(el.tag) not in ("item", "entry"):
                continue
            title, link = _text(el, "title"), _link(el)
            if not title or not link:
                continue
            ident = _text(el, "guid", "id") or link or hashlib.sha1(f"{title}|{link}".encode()).hexdigest()
            out.append(RawJob(
                external_id=ident[:300], title=title, url=link, source_url=link,
                description_html=_text(el, "encoded", "content", "description", "summary"),
                location=_text(el, "location") or None,
                department=_text(el, "category") or None,
                posted_at=_date(_text(el, "pubdate", "published", "updated", "date")),
            ))
        return out
