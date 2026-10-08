"""Prisma stores DateTime as `timestamp(3) WITHOUT time zone` (always UTC). psycopg2 therefore returns naive datetimes,
and mixing them with timezone-aware ones raises TypeError. We register a caster that returns aware-UTC datetimes."""
from __future__ import annotations
from datetime import datetime, timezone
from typing import Optional


def parse_pg_timestamp(value: Optional[str], _cursor=None) -> Optional[datetime]:
    if value is None:
        return None
    return datetime.fromisoformat(value).replace(tzinfo=timezone.utc)
