import math
from collections import deque
from threading import Lock
from time import monotonic

from fastapi import HTTPException, Request, status


class SlidingWindowRateLimiter:
    """Small in-process limiter for the single-worker SQLite deployment."""

    def __init__(self) -> None:
        self._events: dict[str, deque[float]] = {}
        self._lock = Lock()

    def _prune(self, key: str, now: float, window_seconds: int) -> deque[float]:
        events = self._events.setdefault(key, deque())
        cutoff = now - window_seconds
        while events and events[0] <= cutoff:
            events.popleft()
        return events

    def check(self, key: str, limit: int, window_seconds: int, detail: str) -> None:
        """Reject a full bucket without consuming another attempt."""
        now = monotonic()
        with self._lock:
            events = self._prune(key, now, window_seconds)
            if len(events) >= limit:
                retry_after = max(1, math.ceil(window_seconds - (now - events[0])))
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail=detail,
                    headers={"Retry-After": str(retry_after)},
                )

    def hit(self, key: str, limit: int, window_seconds: int, detail: str) -> None:
        """Consume one attempt, rejecting it when the bucket is already full."""
        now = monotonic()
        with self._lock:
            events = self._prune(key, now, window_seconds)
            if len(events) >= limit:
                retry_after = max(1, math.ceil(window_seconds - (now - events[0])))
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail=detail,
                    headers={"Retry-After": str(retry_after)},
                )
            events.append(now)

    def record(self, key: str, window_seconds: int) -> None:
        now = monotonic()
        with self._lock:
            self._prune(key, now, window_seconds).append(now)

    def clear(self, key: str) -> None:
        with self._lock:
            self._events.pop(key, None)

    def reset(self) -> None:
        with self._lock:
            self._events.clear()


def client_ip(request: Request) -> str:
    # Uvicorn resolves trusted proxy headers before populating request.client.
    # The deployment must restrict --forwarded-allow-ips to the local tunnel.
    return request.client.host if request.client else "unknown"


auth_rate_limiter = SlidingWindowRateLimiter()
