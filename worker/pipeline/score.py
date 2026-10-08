"""Fit scoring (0-100), explanations, concerns, and intelligent exclusion rules."""
from __future__ import annotations
import re
from dataclasses import dataclass, field
from typing import Optional

from pipeline.dedupe import normalize_location
from pipeline.classify import SENIORITY

SOFTWARE_FAMILY = {"SWE", "BACKEND", "FRONTEND", "FULL_STACK", "INFRASTRUCTURE", "DISTRIBUTED_SYSTEMS",
                   "DATA_ENGINEERING", "DEVOPS_SRE", "ML_AI", "QUANT_DEVELOPER"}
PRIORITY_PREF = {"P0": 1.0, "P1": 0.8, "P2": 0.55, "P3": 0.35}


@dataclass
class Profile:
    skills: list[str] = field(default_factory=list)
    technologies: list[str] = field(default_factory=list)
    preferred_roles: list[str] = field(default_factory=list)
    preferred_locations: list[str] = field(default_factory=list)
    preferred_companies: list[str] = field(default_factory=list)   # lowercase names/slugs
    target_season: str = "Summer"
    target_year: int = 2027
    graduation_year: Optional[int] = None
    sponsorship_required: bool = False
    keywords: list[str] = field(default_factory=list)
    excluded_keywords: list[str] = field(default_factory=list)
    min_compensation: Optional[int] = None
    resume_text: str = ""
    weights: dict[str, int] = field(default_factory=lambda: {
        "role": 30, "experience": 20, "skills": 20, "company": 10, "location": 10, "resume": 10})
    exclusion_rules: list[str] = field(default_factory=lambda: [
        "senior", "staff", "principal", "manager", "phd-only", "hardware-only", "years:5"])


@dataclass
class ScoreResult:
    score: int
    reasons: list[str]
    concerns: list[str]
    components: dict[str, float]


# ---------- exclusions ----------
_MENTOR_PHRASE = re.compile(r"\b(?:with|alongside|under|from|by|and|mentored by|supervised by)\s+(?:\w+\s+){0,2}"
                            r"(?:senior|staff|principal|lead|sr\.?)\b[\w\s]*", re.I)


def _title_seniority(title: str) -> Optional[str]:
    """Seniority word in the TITLE, ignoring mentorship phrases like 'working with senior engineers'."""
    cleaned = _MENTOR_PHRASE.sub(" ", title)
    m = re.search(SENIORITY, cleaned, re.I)
    return m.group(1).lower() if m else None


def check_exclusions(title: str, description: str, experience_level: str, rules: list[str]) -> list[str]:
    """Return human-readable reasons this job should be suppressed (empty = keep).

    Context-aware: seniority terms only count in the TITLE (never the description), are ignored in
    mentorship phrases, and never exclude a job classified as an internship / new grad role."""
    reasons: list[str] = []
    t = title.lower()
    d = description[:8000].lower()
    junior = experience_level in ("INTERNSHIP", "NEW_GRAD", "ENTRY_LEVEL")
    seniority_rules = {"senior", "staff", "principal", "manager", "lead", "director"} & set(rules)
    if seniority_rules and not junior:
        hit = _title_seniority(title)
        if hit and (hit.rstrip(".") in seniority_rules or (hit in ("sr", "sr.") and "senior" in seniority_rules)):
            reasons.append(f"Title contains '{hit}'")
    if "phd-only" in rules:
        if re.search(r"\bph\.?d\.?\b[^.\n]{0,40}\b(required|only|candidates only)\b|\b(must be|currently) (?:pursuing|enrolled in) (?:a |an )?ph\.?d", d) \
           and not re.search(r"\b(bachelor|master|undergrad)", d[:3000]):
            reasons.append("PhD-only")
    if "hardware-only" in rules:
        if re.search(r"\b(hardware|asic|fpga|rtl|analog|vlsi|silicon|mechanical|electrical)\b", t) and \
           not re.search(r"\b(software|backend|full[- ]?stack|data|ml|machine learning|quant)\b", t):
            reasons.append("Hardware-only role")
    for r in rules:
        m = re.fullmatch(r"years:(\d+)", r)
        if m:
            n = int(m.group(1))
            ym = re.search(r"(\d+)\+?\s*(?:or more )?years", d)
            if ym and int(ym.group(1)) >= n and not junior:
                reasons.append(f"Requires {ym.group(1)}+ years of experience")
    for kw in rules:
        if kw.startswith("kw:") and re.search(r"\b" + re.escape(kw[3:].lower()) + r"\b", t):
            reasons.append(f"Title contains excluded keyword '{kw[3:]}'")
    return reasons


# ---------- scoring ----------
def _tokens(text: str) -> set[str]:
    return {w for w in re.findall(r"[a-z][a-z+#.]{2,}", text.lower()) if w not in _STOP}

_STOP = set("the and for with you your our will are that this have has from they their can all any not but who what work team role "
            "experience skills ability strong using use about more also other such into over per within including etc".split())


def concerns_for(job, profile: Profile) -> list[str]:
    out: list[str] = []
    t, d = job.title.lower(), job.description.lower()
    if re.search(r"\b(master'?s|m\.?s\.?|graduate degree|ph\.?d\.?)\b[^.\n]{0,40}\b(required|only)\b|\bcurrently pursuing (?:a |an )?(?:master|ph\.?d)", d):
        out.append("Requires graduate degree")
    ym = re.search(r"(\d+)\+?\s*(?:or more )?years", d)
    if ym and int(ym.group(1)) >= 3 and job.experience_level not in ("INTERNSHIP",):
        out.append(f"Requires {ym.group(1)}+ years experience")
    if job.target_year and job.target_year != profile.target_year and job.experience_level == "INTERNSHIP":
        out.append(f"Wrong season window ({job.target_season or ''} {job.target_year} vs target {profile.target_season} {profile.target_year})".replace("  ", " "))
    if profile.graduation_year and job.graduation_requirement:
        years = [int(y) for y in re.findall(r"20\d{2}", job.graduation_requirement)]
        if years and profile.graduation_year not in years:
            out.append("Wrong graduation window")
    if re.search(r"security clearance|ts/sci|top secret|active clearance", d):
        out.append("Requires security clearance")
    if re.search(r"\b(hardware|asic|fpga|rtl|vlsi)\b", t):
        out.append("Role is primarily hardware")
    if job.experience_level not in ("INTERNSHIP",) and re.search(r"\bintern", d[:300]) is None and "intern" in profile.preferred_roles:
        pass
    if job.experience_level == "EXPERIENCED":
        out.append("Not an internship / new grad role")
    if profile.sponsorship_required and job.citizenship_requirement and re.search(r"u\.?s\.? citizen|no sponsorship|not (?:provide|offer) sponsorship|unable to sponsor", job.citizenship_requirement.lower() + (job.sponsorship_info or "").lower()):
        out.append("May not sponsor visas")
    annual = getattr(job, "compensation_annual_max", None)   # annualised, so hourly/monthly internship pay is compared fairly
    if profile.min_compensation and annual and annual < profile.min_compensation:
        out.append("Compensation below your minimum")
    for kw in profile.excluded_keywords:
        if kw and re.search(r"\b" + re.escape(kw.lower()) + r"\b", t + " " + d[:3000]):
            out.append(f"Mentions excluded keyword '{kw}'")
    return out


def score_job(job, company_priority: str, company_name: str, profile: Profile) -> ScoreResult:
    reasons: list[str] = []
    comp: dict[str, float] = {}

    # Role relevance
    if profile.preferred_roles:
        if job.role_category in profile.preferred_roles:
            comp["role"] = 1.0
            reasons.append(f"Role matches preference ({job.role_category.replace('_', ' ').title()})")
        elif job.role_category in SOFTWARE_FAMILY and any(r in SOFTWARE_FAMILY for r in profile.preferred_roles):
            comp["role"] = 0.6
        else:
            comp["role"] = 0.15
    else:
        comp["role"] = 0.85 if job.role_category in SOFTWARE_FAMILY or job.role_category.startswith("QUANT") else 0.15

    # Experience / season eligibility (borderline cases are lowered, never rejected)
    exp = job.experience_level
    if exp == "INTERNSHIP":
        if job.target_year == profile.target_year and (job.target_season in (None, profile.target_season)):
            comp["experience"] = 1.0
            reasons.append(f"Internship, {job.target_season or ''} {job.target_year}".replace("  ", " ").strip()
                           + ("" if job.season_provenance == "ATS" else " (inferred)"))
        elif job.target_year is None:
            comp["experience"] = 0.7
            reasons.append("Internship (season not stated)")
        else:
            comp["experience"] = 0.3
    elif exp in ("NEW_GRAD", "ENTRY_LEVEL"):
        comp["experience"] = 0.75 if profile.graduation_year and profile.graduation_year <= profile.target_year else 0.55
    elif exp == "UNKNOWN":
        comp["experience"] = 0.45
    else:
        comp["experience"] = 0.05

    # Skills
    mine = {s.lower() for s in profile.skills + profile.technologies}
    theirs = {t_.lower() for t_ in job.technologies}
    if theirs:
        hits = sorted(mine & theirs)
        comp["skills"] = min(1.0, len(hits) / max(1, min(len(theirs), 6)))
        for h in hits[:4]:
            reasons.append(f"{next(t_ for t_ in job.technologies if t_.lower() == h)} listed")
    else:
        comp["skills"] = 0.5

    # Company preference
    pref = PRIORITY_PREF.get(company_priority, 0.5)
    if company_name.lower() in profile.preferred_companies:
        pref = 1.0
    comp["company"] = pref
    if pref >= 0.8:
        reasons.append("Preferred company" if company_name.lower() in profile.preferred_companies else f"{company_priority} priority company")

    # Location
    jl = normalize_location(job.location)
    prefs = [normalize_location(p) for p in profile.preferred_locations]
    if not prefs:
        comp["location"] = 0.6
    elif any(p and p in jl for p in prefs):
        comp["location"] = 1.0
        reasons.append(f"{job.location} is a preferred location")
    elif job.work_mode == "REMOTE":
        comp["location"] = 0.8
    else:
        comp["location"] = 0.3

    # Resume similarity (token overlap vs job text)
    if profile.resume_text:
        rt, jt = _tokens(profile.resume_text), _tokens(job.title + " " + job.description)
        comp["resume"] = min(1.0, (len(rt & jt) / max(1, len(jt))) * 3) if jt else 0.5
    else:
        comp["resume"] = 0.5

    w = profile.weights
    total_w = sum(w.values()) or 1
    raw = sum(comp[k] * w.get(k, 0) for k in comp) / total_w * 100

    concerns = concerns_for(job, profile)
    # Concerns lower rank but do not reject.
    penalty = 0
    for c in concerns:
        if c.startswith("Wrong"):
            penalty += 10
        elif c.startswith(("Requires", "Not an", "Role is")):
            penalty += 8
        else:
            penalty += 5
    for kw in profile.keywords:
        if kw and re.search(r"\b" + re.escape(kw.lower()) + r"\b", (job.title + " " + job.description[:3000]).lower()):
            reasons.append(f"Keyword '{kw}' present")
            raw += 2
    score = max(0, min(100, round(raw - penalty)))
    return ScoreResult(score=score, reasons=reasons, concerns=concerns, components={k: round(v, 2) for k, v in comp.items()})
