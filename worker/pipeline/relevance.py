"""Cheap title-only relevance check. Connectors that must fetch one detail page per job (SmartRecruiters, Workday)
use it to avoid downloading hundreds of irrelevant descriptions. Deliberately a superset of is_relevant()."""
from __future__ import annotations
import re

from pipeline.classify import classify_experience, classify_role

_HINT = re.compile(r"\b(software|engineer|developer|quant\w*|data|machine learning|research|trader|trading|intern|internship|new grad|graduate|analyst|technolog\w*)\b", re.I)


def title_is_candidate(title: str) -> bool:
    if classify_experience(title, "") == "EXPERIENCED":
        return False
    return classify_role(title, "") != "OTHER" or bool(_HINT.search(title))
