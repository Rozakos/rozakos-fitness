import argparse
import sqlite3
import subprocess
from datetime import datetime, timezone
from pathlib import Path


def encrypt(plain: Path, recipients: Path, keep: int) -> Path:
    """age-encrypt a finished backup for the off-site pull (`/ops/backup`).

    The matching identity is not on this host, so anything that can read the
    `.age` file -- the API, its ops token, the tunnel -- reaches ciphertext only.
    """
    final_path = plain.with_name(plain.name + ".age")
    temporary_path = plain.with_name(plain.name + ".age.tmp")
    try:
        subprocess.run(
            ["age", "--encrypt", "--recipients-file", str(recipients), "--output",
             str(temporary_path), str(plain)],
            check=True,
            timeout=600,
        )
        with temporary_path.open("rb") as archive:
            if archive.read(21) != b"age-encryption.org/v1":
                raise RuntimeError("age did not produce an encrypted archive")
        temporary_path.replace(final_path)
    finally:
        temporary_path.unlink(missing_ok=True)
    archives = sorted(plain.parent.glob("fitness-*.db.age"), key=lambda p: p.name, reverse=True)
    for old_archive in archives[keep:]:
        old_archive.unlink()
    return final_path


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
    parser.add_argument(
        "--recipients",
        type=Path,
        help="age recipients file; when it exists, also write fitness-*.db.age",
    )
    parser.add_argument("--keep-encrypted", type=int, default=7)
    args = parser.parse_args()
    final_path = backup(args.source, args.destination, args.keep)
    print(final_path)
    if args.recipients and args.recipients.is_file():
        print(encrypt(final_path, args.recipients, args.keep_encrypted))


if __name__ == "__main__":
    main()
