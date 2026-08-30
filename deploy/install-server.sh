#!/usr/bin/env bash
set -euo pipefail

if [[ ${EUID} -ne 0 ]]; then
  echo "Run as root." >&2
  exit 1
fi

APP_DIR=/opt/rozakos-fitness
STATE_DIR=/var/lib/rozakos-fitness
BACKUP_DIR=/var/backups/rozakos-fitness
ENV_FILE=/etc/rozakos-fitness.env
SERVICE_USER=rozakos-fitness

if [[ ! -f "$APP_DIR/backend/requirements.txt" ]]; then
  echo "Expected a checkout at $APP_DIR." >&2
  exit 1
fi

if ! id -u "$SERVICE_USER" >/dev/null 2>&1; then
  useradd --system --home-dir "$STATE_DIR" --shell /usr/sbin/nologin "$SERVICE_USER"
fi

install -d -o "$SERVICE_USER" -g "$SERVICE_USER" -m 0700 "$STATE_DIR" "$BACKUP_DIR"

python3 -m venv "$APP_DIR/.venv"
"$APP_DIR/.venv/bin/pip" install --quiet --upgrade pip
"$APP_DIR/.venv/bin/pip" install --quiet -r "$APP_DIR/backend/requirements.txt"

if [[ ! -f "$ENV_FILE" ]]; then
  umask 0077
  secret=$(openssl rand -hex 32)
  printf 'ROZAKOS_DATABASE_URL=sqlite:////var/lib/rozakos-fitness/fitness.db\nROZAKOS_SECRET_KEY=%s\n' "$secret" > "$ENV_FILE"
fi
chown root:"$SERVICE_USER" "$ENV_FILE"
chmod 0640 "$ENV_FILE"

install -o root -g root -m 0644 "$APP_DIR/deploy/rozakos-fitness.service" /etc/systemd/system/rozakos-fitness.service
install -o root -g root -m 0644 "$APP_DIR/deploy/rozakos-fitness-backup.service" /etc/systemd/system/rozakos-fitness-backup.service
install -o root -g root -m 0644 "$APP_DIR/deploy/rozakos-fitness-backup.timer" /etc/systemd/system/rozakos-fitness-backup.timer

systemctl daemon-reload
systemctl enable --now rozakos-fitness.service rozakos-fitness-backup.timer

for _ in {1..20}; do
  if curl --fail --silent http://127.0.0.1:8002/ >/dev/null; then
    systemctl start rozakos-fitness-backup.service
    echo "Rozakos Fitness API is running on 127.0.0.1:8002."
    exit 0
  fi
  sleep 1
done

systemctl status --no-pager rozakos-fitness.service >&2 || true
exit 1
