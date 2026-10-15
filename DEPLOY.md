# Deploying CareConnect

One Docker container serves the H5 app and the API, and keeps its SQLite database in the `careconnect-data` volume.

Server requirements: Linux x86_64 (AMD64), Docker Engine with the Compose plugin, `git`, `curl`, ports 80/443 open if you add HTTPS. 1 vCPU / 1 GB RAM is plenty.

## Option A — paste this to your local agent (Claude Code on the server)

```text
Deploy CareConnect on this server.

1. Clone or update the repo:
   - If /opt/careconnect01 does not exist:
     git clone -b claude/inspiring-ritchie-ooq2vw https://github.com/ksamint/careconnect01 /opt/careconnect01
   - Otherwise: cd /opt/careconnect01 && git fetch origin && git checkout claude/inspiring-ritchie-ooq2vw && git pull --ff-only
2. Check prerequisites: `docker compose version` works and the machine is x86_64 (`uname -m`).
   If Docker is missing, stop and tell me instead of installing it.
3. Run: cd /opt/careconnect01 && ./scripts/deploy-amd.sh
   It creates .env with random passwords on the first run, builds the image, starts the
   container and waits for /api/health. Report the URL and the passwords it prints.
   Do not overwrite an existing .env.
4. Verify:
   - curl -fsS http://127.0.0.1:8080/api/health  → {"ok":true}
   - curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8080/login  → 200
   - docker compose ps shows the careconnect container as healthy
5. Install the daily off-container backup:
   (crontab -l 2>/dev/null; echo "15 2 * * * /opt/careconnect01/scripts/backup.sh >> /var/log/careconnect-backup.log 2>&1") | crontab -
   then run ./scripts/backup.sh once and confirm a .tar.gz appears in /opt/careconnect01/backups.
6. If I give you a domain name, set up HTTPS with Caddy as in DEPLOY.md section "HTTPS".
   Otherwise skip it and remind me WeChat needs HTTPS.
7. Summarise: URL, admin password, nurse password, backup location, anything that failed.
   If any step fails, show the last 50 lines of `docker compose logs careconnect` and stop.
```

## Option B — run the commands yourself

```bash
sudo git clone -b claude/inspiring-ritchie-ooq2vw https://github.com/ksamint/careconnect01 /opt/careconnect01
cd /opt/careconnect01
./scripts/deploy-amd.sh          # prints URL + generated passwords
./scripts/backup.sh              # test a backup
```

Open `http://<server-ip>:8080/login`.

## After the first start

1. Log in as `admin` → **User management** → set personal passwords for `user2` (Nurse A), `user4` (Nurse B), `user3` (research), `orgadmin`.
2. **Study settings**: enter ethics approval no./date, consent version, instrument version; tick the checklist as items are completed. Real enrolment stays locked until all are done.
3. To start without the `DEMO-` training patients, set `SEED_DEMO=0` in `.env` **before the first start** (or remove the volume, see below).

## HTTPS (needed for WeChat)

Point a domain's A record at the server, then:

```bash
sudo apt-get install -y caddy        # Debian/Ubuntu
sudo tee /etc/caddy/Caddyfile >/dev/null <<'EOF'
careconnect.example.com {
    reverse_proxy 127.0.0.1:8080
}
EOF
sudo systemctl reload caddy
```

Caddy gets and renews the certificate automatically. Then bind the app to localhost only by setting `HOST_PORT=127.0.0.1:8080` in `.env` and re-running `./scripts/deploy-amd.sh`. For WeChat, also complete the domain's ICP filing and add it to the official account's JS/business domain list.

## Update to a newer version

```bash
cd /opt/careconnect01
./scripts/backup.sh
git pull --ff-only
./scripts/deploy-amd.sh
```

The database volume is kept across rebuilds.

## Restore a backup

```bash
cd /opt/careconnect01
tar -xzf backups/careconnect-YYYY-MM-DD_HHMM.tar.gz -C /tmp      # → /tmp/careconnect-YYYY-MM-DD_HHMM/careconnect.db
docker compose stop careconnect
docker run --rm -v careconnect-data:/data -v /tmp/careconnect-YYYY-MM-DD_HHMM:/restore:ro alpine \
  sh -c 'cp /restore/careconnect.db /data/careconnect.db && rm -f /data/careconnect.db-wal /data/careconnect.db-shm && chown 1000:1000 /data/careconnect.db'
docker compose start careconnect
```

The server's own snapshots are in `/restore/backups/` of the same archive (and in `/data/backups/` inside the volume); restore one the same way.

## Useful commands

| What | Command |
|------|---------|
| Logs | `docker compose logs -f careconnect` |
| Status | `docker compose ps` |
| Restart | `docker compose restart careconnect` |
| Stop | `docker compose down` (keeps data) |
| **Wipe all data** | `docker compose down -v` — deletes the database; back up first |
