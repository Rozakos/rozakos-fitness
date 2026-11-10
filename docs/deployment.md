# Backend deployment

The production API runs in its own container on the office Proxmox cluster (verified
2026-11-10):

- host: **CT 216 `fitness`**, Debian, 1 core, 1 GB RAM, 8 GB `local-zfs`, office DHCP
  `192.168.1.164`. HA rule `office-pair` (biz2/biz3, strict), replication job `216-0` to
  `proxmoxbiz2` every 15 min. It normally runs on `proxmoxbiz3` (Tailscale `100.114.65.45`);
  `ha-manager status | grep ct:216` shows the current node. Shell: `pct enter 216` on that node.
- history: VM 100 at home until 2026-11-08, briefly CT 215 `web`, then CT 216 the same day.
  The VM 100 and CT 215 copies are stopped and disabled, not deleted.
- deployed commit: `090dcc9` (same as `main` on 2026-11-10)
- checkout: `/opt/rozakos-fitness` (root-owned)
- service user: `rozakos-fitness` (no login shell)
- SQLite database: `/var/lib/rozakos-fitness/fitness.db`
- environment: `/etc/rozakos-fitness.env` (`0640`, root/service group)
- listener: `127.0.0.1:8002`, one Uvicorn worker
- public hostname: `https://fitness-api.rozakos.eu` through the container's own Cloudflare Tunnel
  `fitness-office` (`171a8148-2e3e-467b-933d-468e8688ed23`, config `/etc/cloudflared/config.yml`)
- backups: `/var/backups/rozakos-fitness/`, daily SQLite online backup, 30 retained

The database enables WAL, foreign keys, a five-second busy timeout, and normal synchronous
mode on every SQLite connection. The systemd unit trusts forwarded client addresses only
from loopback, which is required for meaningful auth rate limits behind `cloudflared`.
The public API is for store clients; it is not a private tailnet-only service.

## First install

These steps describe the original VM 100 install (shared tunnel `vat`). On a new host, as root,
clone the public repository to `/opt/rozakos-fitness`, check out the intended commit, and run:

```bash
bash /opt/rozakos-fitness/deploy/install-server.sh
python3 /opt/rozakos-fitness/deploy/configure_cloudflared.py
cloudflared --config /etc/cloudflared/config.yml tunnel ingress validate
systemctl restart cloudflared
```

Create the DNS route once. The origin certificate is not in CT 216; it lives under the
`rozakos` account on VM 100 (`/home/rozakos/.cloudflared/cert.pem`), so run the route command
there. The hostname currently routes to `fitness-office`:

```bash
TUNNEL_ORIGIN_CERT=/home/rozakos/.cloudflared/cert.pem \
  cloudflared tunnel route dns --overwrite-dns 171a8148-2e3e-467b-933d-468e8688ed23 fitness-api.rozakos.eu
```

`install-server.sh` generates the JWT secret without printing it. It preserves an existing
environment file on later runs.

## Update

`git` and `unattended-upgrades` were installed in CT 216 on 2026-11-10 (the container had
neither, and was not applying security updates). Take an on-demand backup first:

```bash
systemctl start rozakos-fitness-backup.service
cd /opt/rozakos-fitness
git pull --ff-only origin main
bash deploy/install-server.sh
```

Python packages install against `backend/constraints.txt`, the exact versions production
runs, so a deploy or rollback gets the same set every time. To move them, install without
`-c` in a scratch virtualenv, run the tests, and commit a new freeze.

Do not replace `/etc/rozakos-fitness.env` during a deploy: changing the secret invalidates
every issued token. Do not put `fitness.db` in the checkout.

## Checks and recovery

```bash
systemctl status rozakos-fitness.service
journalctl -u rozakos-fitness.service -n 100 --no-pager
systemctl list-timers rozakos-fitness-backup.timer
curl --fail https://fitness-api.rozakos.eu/health
curl --fail https://fitness-api.rozakos.eu/privacy
curl --fail https://fitness-api.rozakos.eu/account-deletion
```

Monitoring, the encrypted off-site copy and how to restore from it: [operations](operations.md).

To restore, stop the API, copy a selected backup over the database as the service user,
remove any stale `fitness.db-wal` and `fitness.db-shm` files, then start the API. Preserve the
failed database separately until the restored copy passes `PRAGMA integrity_check`.

## Transactional email

Production uses Resend over authenticated SMTP. The sending domain is
`fitness.rozakos.eu`, and confirmation is required for new accounts. SPF, DKIM, and the
bounce MX record are managed through Resend's Cloudflare integration. Add the following to
`/etc/rozakos-fitness.env`; the API key is a send-only secret and must never be committed:

```dotenv
ROZAKOS_SMTP_HOST=smtp.resend.com
ROZAKOS_SMTP_PORT=587
ROZAKOS_SMTP_USERNAME=resend
ROZAKOS_SMTP_PASSWORD=<send-only Resend API key>
ROZAKOS_SMTP_FROM_EMAIL="Rozakos Fitness <noreply@fitness.rozakos.eu>"
ROZAKOS_SMTP_STARTTLS=true
ROZAKOS_REQUIRE_EMAIL_VERIFICATION=true
```

The service refuses to start if confirmation is enabled without both an SMTP host and From
address. Existing accounts were marked verified by the one-time schema backfill; new accounts
require the emailed link. Password-reset mail uses the same relay, but its endpoint always
returns the same generic response so it cannot disclose whether an address is registered.

The initial API key was placed directly in `/etc/rozakos-fitness.env`, owned by
`root:rozakos-fitness` with mode `0640`. Rotate it in Resend and replace only the password line
if it is ever disclosed. Start DMARC at `v=DMARC1; p=none;` on
`_dmarc.fitness.rozakos.eu`, monitor it, and tighten the policy after legitimate delivery is
confirmed.
