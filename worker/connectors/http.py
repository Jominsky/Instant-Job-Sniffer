"""Polite HTTP client: per-host rate limiting, exponential backoff, ETag caching, robots.txt."""
from __future__ import annotations
import threading
import time
import urllib.robotparser
from typing import Optional
from urllib.parse import urlparse

import requests

import config


class FetchError(Exception):
    """A retryable or terminal failure fetching a source."""


class BlockedByRobots(FetchError):
    """robots.txt disallows fetching this URL. We never bypass this."""


class HttpClient:
    def __init__(self, session: Optional[requests.Session] = None):
        self.session = session or requests.Session()
        self.session.headers.update({"User-Agent": config.USER_AGENT, "Accept": "application/json, text/html;q=0.9"})
        self._last_request: dict[str, float] = {}
        self._host_locks: dict[str, threading.Lock] = {}
        self._meta_lock = threading.Lock()
        self._etags: dict[str, tuple[str, requests.Response]] = {}
        self._robots: dict[str, Optional[urllib.robotparser.RobotFileParser]] = {}

    def _lock_for(self, host: str) -> threading.Lock:
        with self._meta_lock:
            return self._host_locks.setdefault(host, threading.Lock())

    def _throttle(self, host: str) -> None:
        interval = config.HOST_MIN_INTERVAL.get(host, config.DEFAULT_HOST_MIN_INTERVAL)
        with self._lock_for(host):
            wait = self._last_request.get(host, 0) + interval - time.monotonic()
            if wait > 0:
                time.sleep(wait)
            self._last_request[host] = time.monotonic()

    def get(self, url: str, *, retries: int = 3, timeout: int = 25) -> requests.Response:
        return self._request("GET", url, None, retries, timeout)

    def post_json(self, url: str, payload: dict, *, retries: int = 3, timeout: int = 25) -> requests.Response:
        """POST JSON (used by ATS list endpoints that are queried via POST, e.g. Workday's public career-site API)."""
        return self._request("POST", url, payload, retries, timeout)

    def _request(self, method: str, url: str, payload, retries: int, timeout: int) -> requests.Response:
        host = urlparse(url).netloc
        cached = self._etags.get(url) if method == "GET" else None
        last_err: Optional[Exception] = None
        for attempt in range(retries + 1):
            self._throttle(host)
            headers = {"If-None-Match": cached[0]} if cached else {}
            try:
                resp = (self.session.get(url, headers=headers, timeout=timeout) if method == "GET"
                        else self.session.post(url, json=payload, headers={"Accept": "application/json"}, timeout=timeout))
            except requests.RequestException as e:
                last_err = e
                time.sleep(min(2 ** attempt, 30))
                continue

            if resp.status_code == 304 and cached:
                return cached[1]
            if resp.status_code == 429 or resp.status_code >= 500:
                retry_after = resp.headers.get("Retry-After", "")
                delay = int(retry_after) if retry_after.isdigit() else 2 ** (attempt + 1)
                last_err = FetchError(f"HTTP {resp.status_code} from {host}")
                time.sleep(min(delay, 60))
                continue
            if resp.status_code in (401, 403):
                # Access control: do not try to get around it.
                raise FetchError(f"HTTP {resp.status_code}: access denied by {host}")
            if resp.status_code == 404:
                raise FetchError(f"HTTP 404: {url} not found (check the company's ATS identifier)")
            resp.raise_for_status()
            etag = resp.headers.get("ETag")
            if etag and method == "GET":
                self._etags[url] = (etag, resp)
            return resp
        raise FetchError(f"Failed after {retries + 1} attempts: {last_err}")

    def allowed_by_robots(self, url: str) -> bool:
        parsed = urlparse(url)
        origin = f"{parsed.scheme}://{parsed.netloc}"
        if origin not in self._robots:
            rp = urllib.robotparser.RobotFileParser()
            try:
                self._throttle(parsed.netloc)
                r = self.session.get(origin + "/robots.txt", timeout=15)
                if r.status_code == 200:
                    rp.parse(r.text.splitlines())
                    self._robots[origin] = rp
                elif r.status_code in (401, 403):
                    self._robots[origin] = None
                    return False          # blanket disallow
                else:
                    self._robots[origin] = None   # no robots.txt => allowed
            except requests.RequestException:
                self._robots[origin] = None
                return False              # can't verify => be conservative
        rp = self._robots[origin]
        return True if rp is None else rp.can_fetch(config.USER_AGENT, url)
