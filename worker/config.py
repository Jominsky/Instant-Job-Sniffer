"""Worker configuration, all from environment variables."""
import os

def _int(name: str, default: int) -> int:
    try:
        return int(os.environ.get(name, default))
    except ValueError:
        return default

DATABASE_URL = os.environ.get("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/jobintel")
USER_AGENT = os.environ.get("SCAN_USER_AGENT", "JobIntelBot/0.1 (personal use)")
CONCURRENCY = _int("WORKER_CONCURRENCY", 8)

# Seconds between scans of a company, by priority.
SCAN_INTERVALS = {
    "P0": _int("SCAN_INTERVAL_P0_SECONDS", 300),
    "P1": _int("SCAN_INTERVAL_P1_SECONDS", 900),
    "P2": _int("SCAN_INTERVAL_P2_SECONDS", 2700),
    "P3": _int("SCAN_INTERVAL_P3_SECONDS", 10800),
}

# Minimum seconds between requests to the same host (politeness / rate limit).
HOST_MIN_INTERVAL = {
    "boards-api.greenhouse.io": 0.5,
    "api.lever.co": 0.5,
    "api.eu.lever.co": 0.5,
    "api.ashbyhq.com": 0.5,
}
DEFAULT_HOST_MIN_INTERVAL = 2.0

# Closure detection: consecutive successful scans a job must be missing from.
MISSED_SCANS_POSSIBLY_CLOSED = 2
MISSED_SCANS_CLOSED = 4

# Failure backoff: interval *= 2**failures, capped.
MAX_BACKOFF_SECONDS = 6 * 3600

# Only persist jobs that look relevant (tech / intern / new grad). Set to true to keep everything.
STORE_ALL_JOBS = os.environ.get("STORE_ALL_JOBS", "false").lower() == "true"

DEFAULT_TARGET_SEASON = os.environ.get("DEFAULT_TARGET_SEASON", "Summer")
DEFAULT_TARGET_YEAR = _int("DEFAULT_TARGET_YEAR", 2027)

AI_PROVIDER = os.environ.get("AI_PROVIDER", "none").lower()
AI_MODEL = os.environ.get("AI_MODEL", "")
