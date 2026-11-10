#!/usr/bin/env python3
"""Independent home-site monitor and encrypted off-site backup pull for Rozakos Fitness.

Runs on the home VM, away from the office host it watches. Private `config.json`
lives beside this script and never in Git. The API serves only age ciphertext and
this script never writes a plaintext database to disk.

config.json keys:
  opsKey          value of ROZAKOS_OPS_TOKEN on the server
  mailKey         send-only Resend API key
  mailFrom        verified sender
  alertTo         administrator address
  ageIdentity     path of the age identity that decrypts the archives
  resticRepository, resticPasswordFile
"""
import fcntl
import json
import os
from pathlib import Path
import subprocess
import sys
import time
import urllib.error
import urllib.request

ROOT = Path(__file__).resolve().parent
CONFIG = json.loads((ROOT / "config.json").read_text(encoding="utf-8"))
BASE = "https://fitness-api.rozakos.eu"
AGENT = "Rozakos-Fitness-Ops/1"
CHECKS = ["database", "backupFresh", "archiveFresh", "diskSpace"]


def request(path):
    return urllib.request.urlopen(
        urllib.request.Request(BASE + path, headers={"X-Ops-Key": CONFIG["opsKey"], "User-Agent": AGENT}),
        timeout=45,
    )


def save(path, value):
    temporary = path.with_suffix(".tmp")
    temporary.write_text(json.dumps(value), encoding="utf-8")
    temporary.chmod(0o600)
    temporary.replace(path)


def notify(subject, body, recipient=None):
    req = urllib.request.Request(
        "https://api.resend.com/emails",
        data=json.dumps(
            {"from": CONFIG["mailFrom"], "to": [recipient or CONFIG["alertTo"]], "subject": subject, "text": body}
        ).encode(),
        headers={
            "Authorization": "Bearer " + CONFIG["mailKey"],
            "Content-Type": "application/json",
            "User-Agent": AGENT,
        },
    )
    with urllib.request.urlopen(req, timeout=20) as response:
        if response.status != 200:
            raise RuntimeError("Alert delivery failed")


def restic(*args):
    repository = Path(CONFIG["resticRepository"])
    if not repository.is_dir():
        raise RuntimeError("Backup repository is unavailable")
    env = os.environ.copy()
    env["RESTIC_PASSWORD_FILE"] = CONFIG["resticPasswordFile"]
    return subprocess.run(
        ["restic", "-r", str(repository), *args], env=env, check=True, capture_output=True, text=True, timeout=1800
    )


def backup():
    target = ROOT / "latest-fitness.db.age"
    temporary = ROOT / "latest-fitness.tmp"
    try:
        with request("/ops/backup") as response, temporary.open("wb") as output:
            os.chmod(temporary, 0o600)
            size = 0
            while block := response.read(1024 * 1024):
                size += len(block)
                if size > 2 * 1024**3:
                    raise RuntimeError("Archive exceeded the backup limit")
                output.write(block)
        with temporary.open("rb") as archive:
            if archive.read(21) != b"age-encryption.org/v1":
                raise RuntimeError("Archive is not age-encrypted")
        # Prove it decrypts to a SQLite database without writing plaintext.
        decrypt = subprocess.run(
            ["age", "--decrypt", "--identity", CONFIG["ageIdentity"], str(temporary)],
            capture_output=True,
            timeout=300,
        )
        if decrypt.returncode != 0 or not decrypt.stdout.startswith(b"SQLite format 3\x00"):
            raise RuntimeError("Archive did not decrypt to a SQLite database")
        temporary.replace(target)
        result = restic("backup", "--json", "--tag", "rozakos-fitness", str(target))
        summary = next(
            json.loads(line) for line in result.stdout.splitlines() if json.loads(line).get("message_type") == "summary"
        )
        if not summary.get("snapshot_id"):
            raise RuntimeError("Restic snapshot was not created")
        # Scoped by tag so this never prunes another service's snapshots.
        restic("forget", "--tag", "rozakos-fitness", "--keep-within", "30d", "--prune", "--quiet")
        save(ROOT / "last-backup.json", {"at": time.time(), "snapshot": summary["snapshot_id"], "bytes": size})
        print("Encrypted off-site snapshot verified:", summary["snapshot_id"])
    finally:
        temporary.unlink(missing_ok=True)


def monitor(check_only=False):
    issues = []
    try:
        with request("/ops/status") as response:
            status = json.load(response)
    except urllib.error.HTTPError as error:
        if error.code == 503:
            try:
                status = json.load(error)
            except ValueError:  # Cloudflare's own 503 page when the origin is down
                status = {}
                issues.append("Public Fitness API is unreachable")
        else:
            status = {}
            issues.append("Operations endpoint returned HTTP " + str(error.code))
    except Exception:
        status = {}
        issues.append("Public Fitness API is unreachable")
    if status:
        for name in CHECKS:
            if status.get("checks", {}).get(name) is not True:
                issues.append("Backend check failed: " + name)
    try:
        last = json.loads((ROOT / "last-backup.json").read_text())
        if time.time() - last["at"] > 30 * 3600:
            issues.append("Off-site backup is older than 30 hours")
    except (OSError, ValueError, KeyError):
        issues.append("Off-site backup has not completed")
    if (ROOT / "backup-error.json").exists():
        issues.append("The last off-site backup failed")
    if check_only:
        print(json.dumps({"healthy": not issues, "issues": issues, "backend": status}))
        return not issues
    state_path = ROOT / "monitor-state.json"
    try:
        state = json.loads(state_path.read_text())
    except (OSError, ValueError):
        state = {"failures": 0}
    if issues:
        state["failures"] = state.get("failures", 0) + 1
        if state["failures"] >= 3 and time.time() - state.get("notifiedAt", 0) > 6 * 3600:
            try:
                notify(
                    "Rozakos Fitness service alert",
                    "\n".join(issues)
                    + "\n\nObserved by the independent home-site monitor. Check CT 216 on the office"
                    " cluster. No credentials are included in this alert.",
                )
                state["notifiedAt"] = time.time()
            except Exception:
                print("Alert delivery unavailable; will retry.", file=sys.stderr)
    else:
        if state.get("notifiedAt"):
            try:
                notify(
                    "Rozakos Fitness service recovered",
                    "The public API, database, disk, office backup and off-site backup checks are healthy again.",
                )
            except Exception:
                save(state_path, state)
                return False
        state = {"failures": 0}
    save(state_path, state)
    print("Monitor healthy" if not issues else "Monitor found " + str(len(issues)) + " failing checks")
    return not issues


if __name__ == "__main__":
    os.umask(0o077)
    mode = sys.argv[1] if len(sys.argv) > 1 else "monitor"
    with (ROOT / (".backup.lock" if mode == "backup" else ".monitor.lock")).open("w") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        if mode == "backup":
            try:
                backup()
                (ROOT / "backup-error.json").unlink(missing_ok=True)
            except Exception as error:
                save(ROOT / "backup-error.json", {"at": time.time()})
                print("Off-site backup failed (" + type(error).__name__ + "); the monitor will alert.", file=sys.stderr)
                sys.exit(1)
        elif mode == "check":
            sys.exit(0 if monitor(True) else 1)
        elif mode == "monitor":
            monitor()
        else:
            raise SystemExit("Expected backup, monitor or check")
