# CareConnect private-link assessments

React/Vite H5 and Nginx, with one FastAPI/SQLite service. Patients and staff open individually attributable private links without a login screen. No actual study approval is claimed. **Only synthetic enrollment is enabled by default.** Bundled questionnaire labels are test placeholders, not an authorized MDASI translation.

## Local development

```bash
uv venv backend/.venv --python 3.12
uv pip install --python backend/.venv/bin/python -r backend/requirements.txt pytest httpx
DB_PATH="$PWD/dev.sqlite3" PUBLIC_ORIGIN=http://localhost:5173 COOKIE_SECURE=false \
  backend/.venv/bin/uvicorn app:app --app-dir backend --host 127.0.0.1 --port 8000 --no-access-log
```

In another terminal:

```bash
cd h5
npm ci
npm run dev
```

Bootstrap an administrator link in a private terminal (stdout is a credential; do not put it in shared logs):

```bash
DB_PATH="$PWD/dev.sqlite3" PUBLIC_ORIGIN=http://localhost:5173 \
  backend/.venv/bin/python backend/bootstrap.py --actor staff-001 --role administrator
```

Use the printed link at **localhost**, matching the configured origin. The app exchanges its fragment token for a 12-hour HttpOnly, SameSite session, then clears the fragment. Private links expire after 90 days and can be revoked. Administrator links issue and revoke clinical/research staff links; clinical staff enroll, consent, schedule and review; research staff read/export. Patient grants access only that participant's assessments.

Enroll a synthetic participant, assign a baseline date, issue a downloadable QR, then open its link in a separate browser/profile. Dates are Asia/Shanghai calendar dates; timestamps are UTC. Patients must explicitly answer all 19 items before final submission. Staff can inspect unfinished drafts and immutable submissions, record review/intervention, schedule follow-up, amend original answers with a reason, and withdraw participants.

Every changed answer, note and position is written immediately to participant/assessment-specific device storage. Writes sync after 500ms idle, within two seconds of continuous input, in revision order. Refresh restores pending work after server access returns. Conflicts preserve local edits for explicit reload/reapply; submitting flushes pending saves and produces one stored receipt. The app needs server access to open a private link or cold-load an assessment. Clear local site data on shared devices; unfinished answers persist there by design. Old browser-only demo records are never imported.

## Verification

```bash
backend/.venv/bin/python -m pytest backend/test_app.py -q
npm --prefix h5 test
npm --prefix h5 run build
cd h5 && npx eslint src/App.tsx src/autosave.ts
```

See [verification.md](docs/verification.md) for integration evidence and remaining checks. Full-repo lint has legacy findings in unreachable demo modules; the active private-link code is checked separately.

## Deployment

The discovered existing deployment is **https://carepro.opcglobal.cn**, `root@119.45.7.98`, `/data/careconnect01`, through the existing Coolify/Traefik route to `careconnect-h5`. The original checkout at `/Users/af/cpro01/opcglobal/cyyycancare01` is left untouched.

If desktop SSH access is unavailable, set `CAREPRO_SSH_IDENTITY` to an existing authorized key file for the host.

After review and deployment authorization, `scripts/deploy-prod.sh` builds and validates locally, archives the existing server source, tags its frontend rollback image, syncs without deleting server-only files, backs up an existing database, and updates Compose services. It keeps the existing TLS/router configuration. Database and backup volumes are persistent; **never run `docker compose down -v`**. Production combines `docker-compose.yml` and `docker-compose.prod.yml`; `PUBLIC_ORIGIN` must exactly match HTTPS and `COOKIE_SECURE=true`.

The frontend image copies the already-tested local `h5/dist` bundle; the server does not rebuild it. Base images use the official Docker-library repositories on Amazon ECR Public because the host's configured Docker Hub mirror no longer resolves; no shared daemon settings are changed.

Only the Nginx service joins the existing `coolify` network. The API has no host port. Production enables trusted client-IP headers for exchange rate limits: Nginx overwrites `X-Careconnect-Client-IP` with the last Traefik-forwarded peer. This assumes the published route is through trusted Traefik, which appends the actual peer. The local host port binds only loopback. Do not expose the API or Nginx listener directly with arbitrary forwarded headers. Nginx and Uvicorn access logs are disabled; application audit events contain record IDs/actions, never access tokens or answer bodies.

For a new local Docker deployment, copy `.env.example`, configure origin/cookies (HTTP development only: `COOKIE_SECURE=false`), build the verified bundle with `npm --prefix h5 ci && npm --prefix h5 run build`, then `docker compose up -d --build --wait`. Persistent database-aware health checks run every 30 seconds. A backup worker makes SQLite online-consistent snapshots daily and retains 30 days. Store an additional encrypted off-host copy under institutional policy; the included backup volume is on the same server.

## Approved study materials

See [backend/README.md](backend/README.md). Real enrollment requires a validated read-only study material JSON with all 19 authorized items, exact order/anchors, language/instrument versions, 24-hour recall text, authorization reference, approved consent text/version and approval reference. Providing arbitrary references does not establish approval: the study owner must verify the files before enabling enrollment. Synthetic participants always use the synthetic instrument and remain explicitly tagged in exports. Each assessment pins its instrument snapshot; changing versions stops real collection until consent/version matches.

## Exports and recovery

CSV endpoints export participants, consent history, schedules, item-level original/amended responses, submissions, amendments, reviews, interventions and a field dictionary. No access tokens are exported. Unfinished drafts require the explicitly labeled `drafts.csv` export. Missing values remain blank; no zero imputation or combined health index is calculated. Symptom and interference means require their full 13/6-item domains. Formula-leading free text is prefixed with an apostrophe for spreadsheet safety.

See [backend/README.md](backend/README.md) for tested backup/restore and application rollback procedures. External messaging and automated clinical alerts are excluded.
