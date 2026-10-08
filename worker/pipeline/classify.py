"""Role + experience classification. Rules first (fast, free, deterministic); an optional LLM
resolves only what the rules cannot (UNKNOWN / OTHER). LLM results are provenance AI_INFERENCE."""
from __future__ import annotations
import re
from typing import Optional

VALID_EXP = {"INTERNSHIP", "NEW_GRAD", "ENTRY_LEVEL", "EXPERIENCED", "UNKNOWN"}
VALID_ROLE = {"SWE", "BACKEND", "FRONTEND", "FULL_STACK", "INFRASTRUCTURE", "DISTRIBUTED_SYSTEMS", "ML_AI",
              "DATA_ENGINEERING", "QUANT_DEVELOPER", "QUANT_RESEARCH", "QUANT_TRADING", "DEVOPS_SRE",
              "SECURITY", "PRODUCT", "OTHER"}

SENIORITY = r"\b(senior|sr\.?|staff|principal|lead|manager|director|head of|vp|vice president|distinguished|architect)\b"


def classify_experience(title: str, description: str) -> str:
    t = title.lower()
    if re.search(r"\b(intern|internship|co-?op)\b", t):
        return "INTERNSHIP"
    if re.search(r"\b(new grad|new graduate|university grad|recent grad|graduate (?:software|engineer|developer|program|trader|quant)|early career|campus|class of 20\d\d)\b", t) \
            or re.search(r"\b(20\d\d) (?:graduate|grad)\b", t):
        return "NEW_GRAD"
    if re.search(r"\b(entry[- ]level|junior|associate (?:software|engineer|developer))\b", t) or re.search(r"\b(software engineer|developer) i\b", t):
        return "ENTRY_LEVEL"
    if re.search(SENIORITY, t) or re.search(r"\b(software engineer|developer|engineer) (?:ii|iii|iv|v|2|3|4)\b", t):
        return "EXPERIENCED"
    d = description[:6000].lower()
    if re.search(r"\b(?:currently )?(?:enrolled|pursuing) (?:in )?(?:a|an) (?:bachelor|master|undergraduate|graduate|ph\.?d|degree)", d) and \
       re.search(r"\b(internship|intern)\b", d):
        return "INTERNSHIP"
    yrs = re.search(r"(\d+)\+?\s*(?:or more )?years", d)
    if yrs and int(yrs.group(1)) >= 3:
        return "EXPERIENCED"
    return "UNKNOWN"


# Ordered: first match wins. Quant roles before generic SWE.
_ROLE_RULES: list[tuple[str, str]] = [
    ("QUANT_RESEARCH", r"quant\w*\s+research|research\s+(?:intern|analyst|scientist).*quant|alpha research|strat(?:egy)? research"),
    ("QUANT_TRADING", r"quant\w*\s+trad|trading intern|trader|systematic trading|market making"),
    ("QUANT_DEVELOPER", r"quant\w*\s+(?:dev|software|engineer|technolog|analyst)|trading (?:systems|technology|software)|low[- ]latency|algorithmic trading (?:dev|eng)"),
    ("ML_AI", r"machine learning|\bml\b|\bai\b|artificial intelligence|deep learning|applied scientist|\bnlp\b|computer vision|research (?:engineer|scientist)|\bllm\b"),
    ("SECURITY", r"security|appsec|cryptograph|penetration|vulnerab"),
    ("DEVOPS_SRE", r"\bsre\b|site reliability|devops|platform reliability|release engineer"),
    ("DATA_ENGINEERING", r"data (?:engineer|platform|infrastructure|pipeline)|analytics engineer|\betl\b"),
    ("DISTRIBUTED_SYSTEMS", r"distributed systems|\bdistributed\b"),
    ("INFRASTRUCTURE", r"infrastructure|\binfra\b|systems (?:engineer|software)|cloud (?:engineer|platform)|networking|kernel|compiler|database engineer|storage"),
    ("FULL_STACK", r"full[- ]?stack"),
    ("FRONTEND", r"front[- ]?end|\bui engineer|web developer|\bui\b"),
    ("BACKEND", r"back[- ]?end|server[- ]side|\bapi\b engineer"),
    ("PRODUCT", r"product manage|product design|program manage|\bpm\b intern"),
    ("SWE", r"software|\bswe\b|\bsde\b|developer|programmer|engineering intern|technology (?:analyst|intern)|\bengineer"),
]


def classify_role(title: str, description: str = "") -> str:
    t = title.lower()
    for role, pat in _ROLE_RULES:
        if re.search(pat, t):
            return role
    # Fall back to the first part of the description only for strong quant signals.
    d = description[:800].lower()
    if re.search(r"quantitative (?:research|trading|develop)", d):
        return "QUANT_RESEARCH" if "research" in d else "QUANT_DEVELOPER"
    return "OTHER"


def classify(title: str, description: str, llm=None) -> tuple[str, str, str]:
    """Return (experience, role, provenance). Provenance is ATS when rules decided from
    explicit title/description text, AI_INFERENCE when an LLM filled a gap."""
    exp, role = classify_experience(title, description), classify_role(title, description)
    prov = "ATS"
    if llm is not None and (exp == "UNKNOWN" or role == "OTHER"):
        res = llm.classify(title, description) or {}
        if exp == "UNKNOWN" and res.get("experience") in VALID_EXP:
            exp, prov = res["experience"], "AI_INFERENCE"
        if role == "OTHER" and res.get("role") in VALID_ROLE:
            role, prov = res["role"], "AI_INFERENCE"
    return exp, role, prov
