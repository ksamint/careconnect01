# CareConnect ePRO

Symptom-reporting platform for the day-chemotherapy symptom-cluster study (Study C-194): a WeChat-ready H5 app for patients and nurses, plus a small Node server that stores everything in SQLite.

## Repository layout

| Path | Description |
|------|-------------|
| `h5/` | React + Vite H5 app (patient, nurse, research and admin portals) |
| `server/` | API + static file server — `node:http` + built-in `node:sqlite`, **no npm dependencies** |
| `docs/` | Nurse data-collection guide and publication/data-collection timeline |
| `ecare-DESIGN.md` | Design system tokens |
| `Dockerfile`, `docker-compose.yml` | One container: builds the H5 app and runs the server (`linux/amd64`) |

## What the app does

- **Questionnaire**: 19 items (13 symptom severity + 6 interference), 0–10, past 24 h. One question per screen, large buttons, any item can be skipped (stored as missing — never as 0).
- **Visits**: T0 (day −1 to 0, before infusion), T1 (day 3 ± 1), T2 (day 8 ± 1) per chemo cycle. Out-of-window entries are kept and flagged.
- **Autosave**: every tap is saved on the phone and to the server; an unfinished questionnaire resumes where it stopped. Submissions made offline are queued and uploaded automatically.
- **Nurse H5**: today's follow-ups, enrol patients (creates a 6-digit patient login), fill on a tablet or read aloud, back-enter paper/phone answers, log reminders, mark visits missed, record alert responses, baseline/clinical/outcome CRF.
- **Editing patient answers** requires re-entering the nurse's password and a reason. The original submission is immutable (enforced by SQLite triggers); every change is a new revision with who/when/why.
- **Double-entry check**: paper/phone entries must be re-entered blind by a second nurse; mismatching items are highlighted.
- **Enrolment lock**: real (non-DEMO) enrolment stays blocked until an admin records the ethics approval, consent version and instrument licence, ticks the 11-item compliance checklist, and confirms with their password.
- **Exports** (research portal): long-format questionnaire data, visit status, baseline (Table 1), outcomes (RDI, unplanned visits), alerts with response time, reminders, revisions, audit log, data dictionary.

> The 19 item labels are short working labels, not the licensed MDASI-C wording. Replace them in `h5/src/study/instrument.ts` once the licence is in hand, and update the instrument version in **Admin → Study settings**.

## Development

```bash
# terminal 1 — API on :8787 (database in server/data/)
cd server && npm run dev

# terminal 2 — H5 on :5180, proxies /api to :8787
cd h5 && npm install && npm run dev -- --port 5180
```

Open http://localhost:5180/login. Run the server tests with `cd server && npm test`.

Requires Node ≥ 22.13 (for `node:sqlite`).

## Deployment (AMD64 server)

See **[DEPLOY.md](DEPLOY.md)** — including a paste-ready prompt for a local agent.

```bash
./scripts/deploy-amd.sh   # creates .env with random passwords on first run, builds, starts, health-checks
```

Default URL: **http://\<server-ip\>:8080/login**. Put a TLS reverse proxy (Caddy/Nginx) in front for WeChat.

### Data and backups

- The database is `/data/careconnect.db` in the `careconnect-data` Docker volume.
- The server writes a backup to `/data/backups/` at start-up and every 24 h (keeps the last 14). Admins can also press **Back up now** in Study settings.
- `scripts/backup.sh` copies a snapshot off the container into `./backups/` (run it daily from cron). Restore steps are in [DEPLOY.md](DEPLOY.md).

## Accounts

Created on first start (passwords from `.env`, default `123456a` — change them in **Admin → User management**):

| Username | Role |
|----------|------|
| `admin`, `orgadmin` | Administrators (study settings, users) |
| `user2`, `user4` | Nurses A and B (two nurses are needed for the double-entry check) |
| `user3` | Research coordinator (read-only + exports) |
| `user1` | Demo patient linked to `DEMO-001` |

Patient logins for real participants are created by nurses at enrolment (`c194-001` + 6-digit password).
