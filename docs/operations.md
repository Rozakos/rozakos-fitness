# Monitoring and off-site backup

The API runs in office CT 216. An independent agent on the home VM (VM 100,
`rozakos-dev-1`) watches it and pulls an encrypted copy of the database every day,
so an office outage or loss is noticed and survivable from another site. The
pattern is the one Rozakos IoT uses (`rozakos-iot/docs/operations.md`).

## Office side (CT 216)

- `GET /health` is public and unauthenticated: `{"status":"ok","database":true}`,
  or 503 when SQLite cannot be read. `install-server.sh` waits on it after a restart.
- `rozakos-fitness-backup.timer` takes the daily online SQLite backup
  (`fitness-<stamp>.db`, 30 kept). When `/etc/rozakos-fitness-backup-recipients.txt`
  exists, the same run also writes `fitness-<stamp>.db.age` (7 kept), encrypted with
  `age` to the public key in that file. The matching identity is only at home, so the
  container, the API and the ops token can reach ciphertext only.
- The private operations API needs `ROZAKOS_OPS_TOKEN` (32+ characters) in
  `/etc/rozakos-fitness.env`. Without it the routes answer 404.
  - `GET /ops/status` (header `X-Ops-Key`): checks `database`, `backupFresh` and
    `archiveFresh` (newest file under 30 hours old) and `diskSpace` (under 80% used).
    200 when all pass, 503 otherwise, with the numbers either way.
  - `GET /ops/backup` (header `X-Ops-Key`): streams the newest `.db.age`. Five
    downloads an hour. It never serves the plaintext `.db`.
  - A missing or wrong key gets 404. Treat the token like an administrator secret
    even though the download is ciphertext: never in URLs, logs or screenshots.

## Home side (VM 100)

Directory `/home/rozakos/services/rozakos-fitness-ops` (mode 0700):

- `ops-agent.py`, deployed from `deploy/home/ops-agent.py`.
- `config.json` (0600): the ops token, the send-only mail key, sender, alert
  recipient, and the paths of the age identity and Restic repository. Never commit it.
- `latest-fitness.db.age`, `last-backup.json`, `monitor-state.json`.

It deliberately reuses two things from the IoT agent, so there is no new secret to
keep safe: the age identity `~/services/rozakos-iot-ops/.age-identity` and the Restic
repository `/mnt/unraid-data/rozakos-iot-backups/restic` with its password file.
Fitness snapshots carry the tag `rozakos-fitness`, and the agent's `forget` is
limited to that tag.

The timers are **user** units of `rozakos` (lingering is on), installed from
`deploy/home/*.service|*.timer` into `~/.config/systemd/user/`:

- `rozakos-fitness-monitor.timer`, every two minutes. Three consecutive failures
  send an email; an unresolved alert repeats at most every six hours; recovery sends
  a notice.
- `rozakos-fitness-offsite.timer`, daily at 05:30 Europe/Athens (after the 03:15
  office backup and the 05:00 IoT pull). It downloads the archive, checks it is age
  ciphertext, proves it decrypts to a SQLite database in memory, snapshots it with
  Restic and prunes Fitness snapshots older than 30 days.

Check by hand:

```bash
systemctl --user list-timers 'rozakos-fitness-*'
python3 ~/services/rozakos-fitness-ops/ops-agent.py check
```

## Restore from the off-site copy

```bash
restic -r /mnt/unraid-data/rozakos-iot-backups/restic snapshots --tag rozakos-fitness
restic -r … restore <id> --target /tmp/fitness-restore
age --decrypt --identity ~/services/rozakos-iot-ops/.age-identity \
  /tmp/fitness-restore/…/latest-fitness.db.age > fitness.db
sqlite3 fitness.db 'PRAGMA integrity_check'
```

Then follow "Checks and recovery" in [deployment](deployment.md). The archive holds
the database only. `/etc/rozakos-fitness.env` (JWT secret, mail credential) and the
tunnel credential are covered by the nightly Proxmox backup of the whole container,
which stays at the office; without them a rebuilt server works but every issued
token is invalid and mail needs a new key.

## Limits

The monitor notices an office outage because it runs at home. It cannot send mail
if the home site itself is offline.
