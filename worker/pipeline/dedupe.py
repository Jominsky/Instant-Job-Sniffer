"""Fingerprinting, canonicalisation and duplicate matching."""
from __future__ import annotations
import hashlib
import re
from typing import Iterable, Optional
from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse

_TRACKING = {"gh_src", "gh_jid", "lever-source", "lever-origin", "source", "src", "ref", "referrer", "utm_source",
             "utm_medium", "utm_campaign", "utm_term", "utm_content", "fbclid", "gclid"}


def normalize_title(title: str) -> str:
    t = title.lower()
    t = re.sub(r"\((?:[^)]*)\)", " ", t)                                  # parentheticals
    t = re.sub(r"\b(summer|fall|autumn|winter|spring)\s*20\d{2}\b|\b20\d{2}\s*(summer|fall|winter|spring)\b", " ", t)
    t = re.sub(r"\b20\d{2}\b", " ", t)
    t = re.sub(r"\binternship\b|\bintern\b|\bco-?op\b", " intern ", t)
    t = re.sub(r"\bsoftware development engineer\b|\bsde\b|\bsoftware developer\b|\bswe\b", "software engineer", t)
    t = re.sub(r"\bquantitative\b", "quant", t)
    t = re.sub(r"\bengineering\b(?=\s+intern)", "engineer", t)      # "Software Engineering Intern" == "Software Engineer Intern"
    t = re.sub(r"\bdevelopment\b(?=\s+intern)", "developer", t)
    t = re.sub(r"[^a-z0-9+# ]+", " ", t)
    t = re.sub(r"\b(the|a|an|and|for|of|at|in)\b", " ", t)
    return re.sub(r"\s+", " ", t).strip()


def normalize_location(loc: Optional[str]) -> str:
    if not loc:
        return ""
    l = loc.lower()
    l = re.sub(r"\b(united states|usa|u\.s\.a?\.?|us)\b", " ", l)
    l = l.replace("new york city", "new york").replace("nyc", "new york")
    l = re.sub(r"\bnew york,?\s*(ny|new york)\b", "new york", l)
    l = re.sub(r"[^a-z ]+", " ", l)
    return re.sub(r"\s+", " ", l).strip()


def canonical_url(url: str) -> str:
    try:
        p = urlparse(url.strip())
    except ValueError:
        return url
    q = [(k, v) for k, v in parse_qsl(p.query, keep_blank_values=False) if k.lower() not in _TRACKING]
    path = p.path.rstrip("/") or "/"
    return urlunparse((p.scheme.lower(), p.netloc.lower(), path, "", urlencode(sorted(q)), ""))


def dedupe_key(company_slug: str, norm_title: str, location: Optional[str]) -> str:
    return hashlib.sha1(f"{company_slug}|{norm_title}|{normalize_location(location)}".encode()).hexdigest()


def _norm_text(s: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9 ]+", " ", s.lower())).strip()


def posting_hash(title: str, location: Optional[str], description: str, comp: Optional[str], deadline) -> str:
    """Content fingerprint; changes iff something material changes (whitespace/markup ignored)."""
    payload = "|".join([_norm_text(title), normalize_location(location), _norm_text(description), _norm_text(comp or ""),
                        deadline.date().isoformat() if deadline else ""])
    return hashlib.sha1(payload.encode()).hexdigest()


def shingles(text: str, k: int = 5) -> set[str]:
    words = _norm_text(text).split()
    if len(words) < k:
        return {" ".join(words)} if words else set()
    return {" ".join(words[i:i + k]) for i in range(len(words) - k + 1)}


def similarity(a: str, b: str) -> float:
    """Jaccard similarity over 5-word shingles (text fingerprinting)."""
    sa, sb = shingles(a), shingles(b)
    if not sa or not sb:
        return 0.0
    return len(sa & sb) / len(sa | sb)


def find_duplicate(candidate, existing: Iterable[dict], threshold: float = 0.85):
    """Match `candidate` (NormalizedJob) against existing job rows (dicts).

    Returns (row, reason) or (None, None). Order of confidence:
      1. same ATS + external id            (exact)
      2. same canonical application URL    (exact)
      3. same dedupe key                   (company + title + location)
      4. same normalized title + compatible location + description similarity >= threshold
    """
    rows = list(existing)
    for r in rows:
        if r["ats"] == candidate.ats and r["externalJobId"] == candidate.external_id:
            return r, "external_id"
    cu = canonical_url(candidate.application_url)
    for r in rows:
        if r.get("applicationUrl") and canonical_url(r["applicationUrl"]) == cu:
            return r, "application_url"
    for r in rows:
        if r.get("dedupeKey") == candidate.dedupe_key:
            return r, "dedupe_key"
    cl = normalize_location(candidate.location)
    for r in rows:
        if r.get("normalizedTitle") != candidate.normalized_title:
            continue
        rl = normalize_location(r.get("location"))
        if cl and rl and cl != rl:
            continue   # same title in different cities is a distinct posting
        if similarity(candidate.description, r.get("description") or "") >= threshold:
            return r, "description_similarity"
    return None, None
