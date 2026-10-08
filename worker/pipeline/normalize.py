"""RawJob -> NormalizedJob. Everything the employer didn't state is marked as inferred."""
from __future__ import annotations
import re
from typing import NamedTuple, Optional

import config
from models import CompanyRef, NormalizedJob, RawJob
from pipeline.text import html_to_text
from pipeline.dedupe import normalize_title, dedupe_key, posting_hash, canonical_url
from pipeline import classify

# Vocabulary for technology extraction (word-boundary matched, case-insensitive).
TECH_VOCAB = [
    "Python", "Java", "C++", "C#", "C", "Rust", "Go", "Golang", "Kotlin", "Swift", "Scala", "TypeScript",
    "JavaScript", "React", "Node.js", "SQL", "PostgreSQL", "MySQL", "Redis", "Kafka", "Spark", "Hadoop",
    "AWS", "GCP", "Azure", "Kubernetes", "Docker", "Terraform", "Linux", "TCP/IP", "networking",
    "distributed systems", "multithreading", "low latency", "PyTorch", "TensorFlow", "CUDA", "OCaml",
    "Haskell", "KDB", "Pandas", "NumPy", "machine learning", "deep learning", "FPGA", "GraphQL", "gRPC",
]
_TECH_RE = {t: re.compile(r"(?<![\w+#])" + re.escape(t) + r"(?![\w+#])", re.I) for t in TECH_VOCAB}
# Case-sensitive for ambiguous single letters / words.
_CASE_SENSITIVE = {"C", "Go", "Swift", "Rust"}

_MONTHS = "jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec"
_SEASONS = {"summer": "Summer", "fall": "Fall", "autumn": "Fall", "winter": "Winter", "spring": "Spring"}


def extract_technologies(text: str) -> list[str]:
    found = []
    for t, rx in _TECH_RE.items():
        if t in _CASE_SENSITIVE:
            if re.search(r"(?<![\w+#])" + re.escape(t) + r"(?![\w+#])", text):
                found.append(t)
        elif rx.search(text):
            found.append(t)
    if "Golang" in found and "Go" in found:
        found.remove("Golang")
    return found


def infer_work_mode(workplace_type: Optional[str], location: Optional[str], text: str) -> str:
    """Only use explicit statements; UNKNOWN otherwise (we don't guess on-site)."""
    wt = (workplace_type or "").lower()
    if wt in ("remote", "hybrid"):
        return wt.upper()
    if wt in ("onsite", "on-site", "on_site"):
        return "ON_SITE"
    blob = f"{location or ''} {text[:1500]}".lower()
    if re.search(r"\bhybrid\b", blob):
        return "HYBRID"
    if re.search(r"\bremote\b", (location or "").lower()):
        return "REMOTE"
    if re.search(r"\bon-?site\b|\bin-office\b", blob):
        return "ON_SITE"
    return "UNKNOWN"


_MONEY = re.compile(r"\$\s?(\d{2,3}(?:,\d{3})+|\d{2,3}(?:\.\d+)?\s?[kK])")


def _to_int(s: str) -> int:
    s = s.replace(",", "").replace(" ", "")
    return int(float(s[:-1]) * 1000) if s[-1] in "kK" else int(float(s))


class Pay(NamedTuple):
    min: Optional[int]            # in the stated period's unit (e.g. dollars per hour)
    max: Optional[int]
    raw: Optional[str]            # the employer's own wording, always kept
    period: Optional[str]         # HOUR | MONTH | WEEK | YEAR, only when the posting says so (or the figures are unmistakably annual)
    annual_max: Optional[int]     # max annualised (hour x 2080, month x 12, week x 52): for sorting and "below your minimum" checks only


_PERIODS = [(r"hour|/\s?hr\b|hourly", "HOUR", 2080), (r"month|/\s?mo\b|monthly", "MONTH", 12),
            (r"week|/\s?wk\b|weekly", "WEEK", 52), (r"year|\byr\b|annum|annual|salary", "YEAR", 1)]
_BOUNDS = {"HOUR": (8, 500), "MONTH": (500, 60_000), "WEEK": (200, 20_000), "YEAR": (10_000, 3_000_000)}
_OTHER_CURRENCY = re.compile(r"[£€]|\b(?:EUR|GBP|CAD|INR|CHF|AUD|SGD|JPY)\b", re.I)
_AMOUNT = r"\d[\d,]*(?:\.\d+)?\s?[kK]?"
_PAY_IN_TEXT = re.compile(rf"\$\s?{_AMOUNT}(?:\s?(?:-|–|—|to)\s?\$?\s?{_AMOUNT})?(?:\s?(?:/|per\s|a\s)\s?(?:hour|hr|year|yr|month|mo|week|wk|annum))?", re.I)


def _amount(tok: str) -> float:
    tok = tok.replace(",", "").replace(" ", "")
    return float(tok[:-1]) * 1000 if tok[-1] in "kK" else float(tok)


def parse_pay(raw: Optional[str], text: str) -> Pay:
    """Understand pay stated as a range or single figure per hour / month / week / year. Never guesses a period:
    with no unit, figures >= 10,000 are taken as annual and anything smaller is left unparsed. Non-USD amounts are kept as
    raw text only (they cannot be compared). Text found in a description must start with '$' and be a range or carry a unit."""
    src = (raw or "").strip()
    if not src:
        m = _PAY_IN_TEXT.search(text)
        if m:
            cand = m.group(0)
            has_range = re.search(rf"{_AMOUNT}\s?(?:-|–|—|to)\s?\$?\s?{_AMOUNT}", cand, re.I)
            has_unit = re.search(r"/|per\s|\ba\s", cand, re.I)
            src = cand if (has_range or has_unit) else ""
    if not src:
        return Pay(None, None, None, None, None)
    if _OTHER_CURRENCY.search(src):
        return Pay(None, None, src, None, None)
    low = src.lower()
    period = next((p for pat, p, _ in _PERIODS if re.search(pat, low)), None)
    nums = [_amount(n) for n in re.findall(_AMOUNT, src)]
    if period is None:
        period = "YEAR" if nums and all(n >= 10_000 for n in nums) else None
    if period is None:
        return Pay(None, None, src, None, None)
    lo, hi = _BOUNDS[period]
    nums = [n for n in nums if lo <= n <= hi]
    if not nums:
        return Pay(None, None, src, None, None)
    factor = next(f for _, p, f in _PERIODS if p == period)
    return Pay(int(min(nums)), int(max(nums)), src, period, int(round(max(nums) * factor)))


def infer_season(title: str, text: str) -> tuple[Optional[str], Optional[int], str, Optional[str]]:
    """Return (season, year, provenance, evidence).

    Explicit 'Summer 2027' in the posting text -> provenance ATS (employer stated it).
    Anything weaker ('May-August 2027', 'Class of 2028') -> AI_INFERENCE (likely, not stated).
    """
    blob = f"{title}\n{text[:4000]}"
    m = re.search(r"\b(summer|fall|autumn|winter|spring)\s+(20\d{2})\b", blob, re.I) or \
        re.search(r"\b(20\d{2})\s+(summer|fall|autumn|winter|spring)\b", blob, re.I)
    if m:
        g = [x for x in m.groups()]
        season = next(x for x in g if not x.isdigit()).lower()
        year = int(next(x for x in g if x.isdigit()))
        return _SEASONS[season], year, "ATS", m.group(0)
    m = re.search(rf"\b(may|jun(?:e)?)\w*\s*[-–to ]+\s*(aug(?:ust)?|sep(?:tember)?)\w*\s+(20\d{{2}})\b", blob, re.I)
    if m:
        return "Summer", int(m.group(3)), "AI_INFERENCE", m.group(0)
    m = re.search(r"\b(20\d{2})\s+(?:internship|intern\b)", blob, re.I)
    if m:
        return None, int(m.group(1)), "AI_INFERENCE", m.group(0)
    return None, None, "AI_INFERENCE", None


def extract_sections(text: str) -> tuple[Optional[str], Optional[str]]:
    """Split out qualifications / preferred qualifications by common headings."""
    heads = r"(?:basic |minimum |required )?(?:qualifications|requirements|what you(?:'|’)ll need|what we(?:'|’)re looking for|who you are)"
    pref = r"(?:preferred|nice to have|bonus|plus|desired)(?: qualifications| skills)?"
    quals = None
    m = re.search(rf"(?im)^\W*{heads}\W*$", text)
    if m:
        rest = text[m.end():]
        n = re.search(rf"(?im)^\W*{pref}\W*$|^\W*(?:benefits|compensation|about us|perks)\W*$", rest)
        quals = (rest[: n.start()] if n else rest[:2500]).strip() or None
    preferred = None
    m = re.search(rf"(?im)^\W*{pref}\W*$", text)
    if m:
        rest = text[m.end():]
        n = re.search(r"(?im)^\W*(?:benefits|compensation|about us|perks|salary)\W*$", rest)
        preferred = (rest[: n.start()] if n else rest[:1500]).strip() or None
    return (quals[:5000] if quals else None), (preferred[:3000] if preferred else None)


def extract_eligibility(text: str) -> dict[str, Optional[str]]:
    """Only report what the text EXPLICITLY states (no inference here)."""
    out: dict[str, Optional[str]] = {"citizenship": None, "sponsorship": None, "graduation": None, "school_year": None}
    sent = re.split(r"(?<=[.!?\n])\s+", text)
    for s in sent:
        sl = s.lower()
        if not out["citizenship"] and re.search(r"u\.?s\.? citizen|security clearance|citizenship", sl):
            out["citizenship"] = s.strip()[:300]
        if not out["sponsorship"] and re.search(r"sponsorship|visa|work authorization|authorized to work", sl):
            out["sponsorship"] = s.strip()[:300]
        if not out["graduation"] and re.search(r"(graduat\w+|class of)\s*(?:in|between|by|:)?\s*(?:\w+\s+)?20\d{2}|expected graduation", sl):
            out["graduation"] = s.strip()[:300]
        if not out["school_year"] and re.search(r"penultimate|rising (?:junior|senior)|junior|sophomore|senior year|final[- ]year|pursuing (?:a|an) (?:bachelor|master|ph\.?d|undergraduate|graduate)", sl):
            out["school_year"] = s.strip()[:300]
    return out


def normalize(raw: RawJob, company: CompanyRef, ats: str, source: str, llm=None) -> NormalizedJob:
    description = html_to_text(raw.description_html)
    title = re.sub(r"\s+", " ", raw.title).strip()
    location = re.sub(r"\s+", " ", raw.location).strip() if raw.location else None
    text = f"{title}\n{description}"

    exp, role, class_prov = classify.classify(title, description, llm)
    season, year, season_prov, evidence = infer_season(title, description)
    pay = parse_pay(raw.compensation_text, description)
    quals, preferred = extract_sections(description)
    elig = extract_eligibility(description)
    norm_title = normalize_title(title)
    app_url = canonical_url(raw.url) if raw.url else raw.source_url

    return NormalizedJob(
        external_id=raw.external_id, ats=ats, source=source, title=title,
        normalized_title=norm_title, location=location,
        work_mode=infer_work_mode(raw.workplace_type, location, description),
        experience_level=exp, role_category=role, department=raw.department,
        description=description, qualifications=quals, preferred_qualifications=preferred,
        technologies=extract_technologies(text), compensation_min=pay.min, compensation_max=pay.max,
        compensation_raw=pay.raw, compensation_period=pay.period, compensation_annual_max=pay.annual_max, application_url=app_url, source_url=raw.source_url or app_url,
        date_posted=raw.posted_at, application_deadline=raw.deadline,
        target_season=season, target_year=year, season_provenance=season_prov,
        classification_provenance=class_prov, graduation_requirement=elig["graduation"],
        citizenship_requirement=elig["citizenship"], sponsorship_info=elig["sponsorship"],
        school_year_requirement=elig["school_year"],
        dedupe_key=dedupe_key(company.slug, norm_title, location),
        posting_hash=posting_hash(title, location, description, pay.raw, raw.deadline),
        season_evidence=evidence,
    )


def is_relevant(job: NormalizedJob) -> bool:
    """Gate to keep the DB focused. Experienced non-technical roles are skipped unless STORE_ALL_JOBS."""
    if config.STORE_ALL_JOBS:
        return True
    if job.experience_level == "EXPERIENCED":
        return False
    if job.role_category != "OTHER":
        return True
    return bool(re.search(r"\b(software|engineer|developer|quant|data|machine learning|research|trader|intern)\b", job.title, re.I))
