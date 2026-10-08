"""Notification channel adapters. Each returns (ok, detail) and never raises.
Credentials come from environment variables only (server-side)."""
from __future__ import annotations
import os
import smtplib
from email.message import EmailMessage

import requests

from alerts.logic import _clean

TIMEOUT = 15


def send_email(to: str, subject: str, body: str) -> tuple[bool, str]:
    host = os.environ.get("SMTP_HOST")
    if not host or not to:
        return False, "SMTP not configured"
    try:
        msg = EmailMessage()
        msg["Subject"], msg["To"] = subject.replace("\n", " ")[:200], to
        msg["From"] = os.environ.get("SMTP_FROM") or os.environ.get("SMTP_USER") or "alerts@localhost"
        msg.set_content(body)
        with smtplib.SMTP(host, int(os.environ.get("SMTP_PORT", "587")), timeout=TIMEOUT) as s:
            s.starttls()
            if os.environ.get("SMTP_USER"):
                s.login(os.environ["SMTP_USER"], os.environ.get("SMTP_PASSWORD", ""))
            s.send_message(msg)
        return True, "sent"
    except Exception as e:
        return False, f"{type(e).__name__}: {e}"


def _post(url: str, payload: dict) -> tuple[bool, str]:
    try:
        r = requests.post(url, json=payload, timeout=TIMEOUT)
        return (r.status_code < 300, f"HTTP {r.status_code}")
    except requests.RequestException as e:
        return False, f"{type(e).__name__}: {e}"


def send_discord(title: str, body: str) -> tuple[bool, str]:
    url = os.environ.get("DISCORD_WEBHOOK_URL")
    if not url:
        return False, "DISCORD_WEBHOOK_URL not set"
    return _post(url, {"content": _clean(f"**{title}**\n{body}")[:1900], "allowed_mentions": {"parse": []}})


def send_slack(title: str, body: str) -> tuple[bool, str]:
    url = os.environ.get("SLACK_WEBHOOK_URL")
    if not url:
        return False, "SLACK_WEBHOOK_URL not set"
    return _post(url, {"text": _clean(f"*{title}*\n{body}")[:3000]})


def send_sms(title: str, body: str) -> tuple[bool, str]:
    sid, token = os.environ.get("TWILIO_ACCOUNT_SID"), os.environ.get("TWILIO_AUTH_TOKEN")
    frm, to = os.environ.get("TWILIO_FROM_NUMBER"), os.environ.get("TWILIO_TO_NUMBER")
    if not all([sid, token, frm, to]):
        return False, "Twilio not configured"
    try:
        r = requests.post(f"https://api.twilio.com/2010-04-01/Accounts/{sid}/Messages.json", auth=(sid, token),
                          data={"From": frm, "To": to, "Body": f"{title}\n{body}"[:1500]}, timeout=TIMEOUT)
        return (r.status_code < 300, f"HTTP {r.status_code}")
    except requests.RequestException as e:
        return False, f"{type(e).__name__}: {e}"


def send_push(title: str, body: str) -> tuple[bool, str]:
    return False, "push not implemented (use BROWSER, Discord, Slack or SMS)"
