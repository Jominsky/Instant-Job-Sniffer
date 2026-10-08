"""Small in-memory TTL cache so detail-per-job connectors don't refetch every description every scan.
Trade-off: edits to a posting are noticed after the TTL (default 6h) rather than on the next scan."""
from __future__ import annotations
import threading
import time
from typing import Any, Optional


class DetailCache:
    def __init__(self, ttl_seconds: int = 6 * 3600):
        self.ttl = ttl_seconds
        self._d: dict[str, tuple[float, Any]] = {}
        self._lock = threading.Lock()

    def get(self, key: str) -> Optional[Any]:
        with self._lock:
            v = self._d.get(key)
            if v and time.monotonic() - v[0] < self.ttl:
                return v[1]
            self._d.pop(key, None)
            return None

    def put(self, key: str, value: Any) -> None:
        with self._lock:
            self._d[key] = (time.monotonic(), value)
