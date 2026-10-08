"""LLM provider abstraction. The classifier depends only on LLMProvider.classify(); swap vendors via AI_PROVIDER.
Uses plain HTTPS (no vendor SDK) so there is no hard dependency on any one vendor."""
from __future__ import annotations
import json
import os
from typing import Optional, Protocol

import requests

import config

PROMPT = """Classify this job posting. Reply with ONLY a JSON object:
{"experience": one of ["INTERNSHIP","NEW_GRAD","ENTRY_LEVEL","EXPERIENCED","UNKNOWN"],
 "role": one of ["SWE","BACKEND","FRONTEND","FULL_STACK","INFRASTRUCTURE","DISTRIBUTED_SYSTEMS","ML_AI","DATA_ENGINEERING","QUANT_DEVELOPER","QUANT_RESEARCH","QUANT_TRADING","DEVOPS_SRE","SECURITY","PRODUCT","OTHER"]}
Only use UNKNOWN/OTHER if the text truly does not say.

Title: {title}

Description (truncated):
{description}"""


class LLMProvider(Protocol):
    def classify(self, title: str, description: str) -> Optional[dict]: ...


class NullProvider:
    def classify(self, title: str, description: str) -> Optional[dict]:
        return None


def _parse_json(text: str) -> Optional[dict]:
    try:
        s, e = text.index("{"), text.rindex("}") + 1
        return json.loads(text[s:e])
    except (ValueError, json.JSONDecodeError):
        return None


class AnthropicProvider:
    def classify(self, title: str, description: str) -> Optional[dict]:
        key = os.environ.get("ANTHROPIC_API_KEY")
        if not key:
            return None
        try:
            r = requests.post(
                "https://api.anthropic.com/v1/messages",
                headers={"x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json"},
                json={"model": config.AI_MODEL or "claude-haiku-4-5-20251001", "max_tokens": 120,
                      "messages": [{"role": "user", "content": PROMPT.format(title=title, description=description[:3000])}]},
                timeout=30)
            r.raise_for_status()
            return _parse_json(r.json()["content"][0]["text"])
        except (requests.RequestException, KeyError, IndexError):
            return None


class OpenAIProvider:
    def classify(self, title: str, description: str) -> Optional[dict]:
        key = os.environ.get("OPENAI_API_KEY")
        if not key:
            return None
        try:
            r = requests.post(
                "https://api.openai.com/v1/chat/completions",
                headers={"Authorization": f"Bearer {key}"},
                json={"model": config.AI_MODEL or "gpt-4o-mini", "max_tokens": 120,
                      "messages": [{"role": "user", "content": PROMPT.format(title=title, description=description[:3000])}]},
                timeout=30)
            r.raise_for_status()
            return _parse_json(r.json()["choices"][0]["message"]["content"])
        except (requests.RequestException, KeyError, IndexError):
            return None


def get_provider() -> LLMProvider:
    return {"anthropic": AnthropicProvider, "openai": OpenAIProvider}.get(config.AI_PROVIDER, NullProvider)()
