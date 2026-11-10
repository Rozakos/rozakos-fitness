"""Private operations endpoints for the independent home-site monitor.

Both routes need the `X-Ops-Key` header to match `ROZAKOS_OPS_TOKEN`. Without a
configured token, or with a wrong one, they answer 404 like any unknown path.
`/ops/backup` serves only age ciphertext; the identity that decrypts it never
lives on this host.
"""
import hashlib
import hmac
import os
import re
import time
from pathlib import Path

from fastapi import APIRouter, Depends, Header, HTTPException
from fastapi.responses import FileResponse, JSONResponse
from sqlalchemy import text

from ..config import get_settings
from ..database import engine
from ..rate_limit import auth_rate_limiter

settings = get_settings()

PLAIN_BACKUP = re.compile(r"^fitness-\d{8}T\d{6}Z\.db$")
ENCRYPTED_BACKUP = re.compile(r"^fitness-\d{8}T\d{6}Z\.db\.age$")
FRESH_HOURS = 30
DISK_LIMIT_PERCENT = 80
NO_STORE = {"Cache-Control": "no-store"}


def require_ops_key(x_ops_key: str | None = Header(default=None)) -> None:
    expected = settings.ops_token
    digest = lambda value: hashlib.sha256(value.encode()).digest()  # noqa: E731
    if not expected or not x_ops_key or not hmac.compare_digest(digest(x_ops_key), digest(expected)):
        raise HTTPException(status_code=404, detail="Not Found")


router = APIRouter(
    prefix="/ops", include_in_schema=False, dependencies=[Depends(require_ops_key)]
)


def newest(pattern: re.Pattern[str]) -> Path | None:
    directory = Path(settings.backup_directory)
    try:
        names = sorted((n for n in os.listdir(directory) if pattern.match(n)), reverse=True)
    except OSError:
        return None
    return directory / names[0] if names else None


def age_hours(path: Path | None) -> float | None:
    if path is None:
        return None
    try:
        return round((time.time() - path.stat().st_mtime) / 3600, 2)
    except OSError:
        return None


@router.get("/status")
def status():
    database = False
    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
        database = True
    except Exception:
        pass
    backup_age = age_hours(newest(PLAIN_BACKUP))
    archive_age = age_hours(newest(ENCRYPTED_BACKUP))
    disk_used = None
    try:
        disk = os.statvfs(settings.backup_directory)
        disk_used = round(100 * (1 - disk.f_bavail / disk.f_blocks), 1)
    except (OSError, ZeroDivisionError):
        pass
    checks = {
        "database": database,
        "backupFresh": backup_age is not None and backup_age < FRESH_HOURS,
        "archiveFresh": archive_age is not None and archive_age < FRESH_HOURS,
        "diskSpace": disk_used is not None and disk_used < DISK_LIMIT_PERCENT,
    }
    return JSONResponse(
        {
            "checks": checks,
            "backupAgeHours": backup_age,
            "archiveAgeHours": archive_age,
            "diskUsedPercent": disk_used,
        },
        status_code=200 if all(checks.values()) else 503,
        headers=NO_STORE,
    )


@router.get("/backup")
def backup():
    auth_rate_limiter.hit("ops-backup", 5, 3600, "Too many backup downloads")
    archive = newest(ENCRYPTED_BACKUP)
    if archive is None:
        raise HTTPException(status_code=503, detail="Backup not available")
    return FileResponse(
        archive,
        media_type="application/octet-stream",
        filename=archive.name,
        headers=NO_STORE,
    )
