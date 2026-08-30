import argparse
import sqlite3
from datetime import datetime, timezone
from pathlib import Path


def backup(source: Path, destination: Path, keep: int) -> Path:
    if keep < 1:
        raise ValueError("keep must be at least 1")
    if not source.is_file():
        raise FileNotFoundError(source)

    destination.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    final_path = destination / f"fitness-{stamp}.db"
    temporary_path = final_path.with_suffix(".db.tmp")

    source_db = sqlite3.connect(f"file:{source}?mode=ro", uri=True)
    destination_db = sqlite3.connect(temporary_path)
    try:
        source_db.backup(destination_db)
        result = destination_db.execute("PRAGMA integrity_check").fetchone()
        if result != ("ok",):
            raise RuntimeError(f"backup integrity check failed: {result}")
    finally:
        destination_db.close()
        source_db.close()

    temporary_path.replace(final_path)
    backups = sorted(destination.glob("fitness-*.db"), key=lambda path: path.name, reverse=True)
    for old_backup in backups[keep:]:
        old_backup.unlink()
    return final_path


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("destination", type=Path)
    parser.add_argument("--keep", type=int, default=30)
    args = parser.parse_args()
    print(backup(args.source, args.destination, args.keep))


if __name__ == "__main__":
    main()
