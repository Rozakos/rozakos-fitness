# Backend deployment

The production API runs on VM 100 alongside the existing services:

- checkout: `/opt/rozakos-fitness` (root-owned)
- service user: `rozakos-fitness` (no login shell)
- SQLite database: `/var/lib/rozakos-fitness/fitness.db`
- environment: `/etc/rozakos-fitness.env` (`0640`, root/service group)
- listener: `127.0.0.1:8002`, one Uvicorn worker
- public hostname: `https://fitness-api.rozakos.eu` through the existing Cloudflare Tunnel
- backups: `/var/backups/rozakos-fitness/`, daily SQLite online backup, 30 retained

The database enables WAL, foreign keys, a five-second busy timeout, and normal synchronous
mode on every SQLite connection. The systemd unit trusts forwarded client addresses only
from loopback, which is required for meaningful auth rate limits behind `cloudflared`.

## First install

As root on VM 100, clone the public repository to `/opt/rozakos-fitness`, check out the
intended commit, and run:

```bash
bash /opt/rozakos-fitness/deploy/install-server.sh
python3 /opt/rozakos-fitness/deploy/configure_cloudflared.py
cloudflared --config /etc/cloudflared/config.yml tunnel ingress validate
systemctl restart cloudflared
```

Create the DNS route once (the origin certificate lives under the `rozakos` account):

```bash
TUNNEL_ORIGIN_CERT=/home/rozakos/.cloudflared/cert.pem \
  cloudflared tunnel route dns 24c4dd97-16fe-4721-ba2c-8ab9e7d36548 fitness-api.rozakos.eu
```

`install-server.sh` generates the JWT secret without printing it. It preserves an existing
environment file on later runs.

## Update

```bash
cd /opt/rozakos-fitness
git pull --ff-only origin main
bash deploy/install-server.sh
```

Do not replace `/etc/rozakos-fitness.env` during a deploy: changing the secret invalidates
every issued token. Do not put `fitness.db` in the checkout.

## Checks and recovery

```bash
systemctl status rozakos-fitness.service
journalctl -u rozakos-fitness.service -n 100 --no-pager
systemctl list-timers rozakos-fitness-backup.timer
curl --fail https://fitness-api.rozakos.eu/
curl --fail https://fitness-api.rozakos.eu/account-deletion
```

To restore, stop the API, copy a selected backup over the database as the service user,
remove any stale `fitness.db-wal` and `fitness.db-shm` files, then start the API. Preserve the
failed database separately until the restored copy passes `PRAGMA integrity_check`.
