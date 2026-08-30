import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path


HOSTNAME = "fitness-api.rozakos.eu"
RULE = f"  - hostname: {HOSTNAME}\n    service: http://127.0.0.1:8002\n"
CATCH_ALL = "  - service: http_status:404\n"


def main() -> None:
    path = Path(sys.argv[1] if len(sys.argv) > 1 else "/etc/cloudflared/config.yml")
    content = path.read_text(encoding="utf-8")
    if f"hostname: {HOSTNAME}" in content:
        print(f"{HOSTNAME} is already configured")
        return
    if content.count(CATCH_ALL) != 1:
        raise RuntimeError("expected exactly one catch-all ingress rule")

    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    backup = path.with_name(f"{path.name}.bak-{stamp}")
    shutil.copy2(path, backup)
    path.write_text(content.replace(CATCH_ALL, RULE + CATCH_ALL), encoding="utf-8")
    print(f"added {HOSTNAME}; backup: {backup}")


if __name__ == "__main__":
    main()
