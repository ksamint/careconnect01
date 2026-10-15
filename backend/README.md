# API, materials and recovery

Start `uvicorn app:app` from this directory (Docker does this). The database path is `DB_PATH`; the default container path is `/data/careconnect.sqlite3`. `PUBLIC_ORIGIN` is the exact browser origin used for write-origin checks. `COOKIE_SECURE=true` is required in HTTPS production. `TRUST_PROXY_HEADERS` defaults false; production enables it only behind isolated Nginx with an overwritten, valid `X-Careconnect-Client-IP` header. Invalid trusted headers are rejected. Exchange allows 20 attempts/client/minute, including failed credentials.

Private URLs contain a 256-bit random token in the fragment. Only token/session hashes are persisted. Sessions check grant expiry/revocation on every request, including reads. Writes require the configured Origin and a session CSRF header. Use `bootstrap.py --actor attributable-staff-id --role administrator` privately to create initial access. The CLI prints a credential; never add its output to shared logs.

## Configuring approved materials

Mount `materials/` read-only; set `MATERIALS_PATH=/materials/study.json`. Missing/malformed files disable real enrollment. A complete file needs these nonempty fields:

```json
{
  "instrument_version": "AUTHORIZED-INSTRUMENT-VERSION",
  "language_version": "AUTHORIZED-LANGUAGE-VERSION",
  "recall_period": "AUTHORIZED-24-HOUR-RECALL-WORDING",
  "authorization_reference": "INSTRUMENT-USE-AUTHORIZATION-REFERENCE",
  "consent_version": "APPROVED-CONSENT-VERSION",
  "consent_text": "COMPLETE-APPROVED-CONSENT-TEXT",
  "approval_reference": "ETHICS-APPROVAL-REFERENCE",
  "items": [
    {"id": "s1", "label": "AUTHORIZED-ITEM-WORDING", "anchor_min": "AUTHORIZED-ANCHOR", "anchor_max": "AUTHORIZED-ANCHOR"}
  ]
}
```

The example is deliberately incomplete and **will not enable real enrollment**. `items` must contain all IDs in exact order: `s1` through `s13`, then `i1` through `i6`, with the official authorized wording/order/anchors. The study owner must validate legal authorization and study approval; a JSON reference alone cannot prove them. Do not substitute the demo labels or invent translations. The official [MD Anderson instrument description](https://www.mdanderson.org/research/departments-labs-institutes/departments-divisions/symptom-research/symptom-assessment-tools/md-anderson-symptom-inventory.html) defines the 13/6-item core and 24-hour recall. No authorized materials were supplied for this implementation.

Real participants require consented status and configured consent version before schedules/grants can be issued. Pending/declined consent can be updated through staff UI. Withdrawing revokes access, prevents future collection, records reason and preserves history. Changing configured instrument/language/consent versions stops writes to older real schedules until reconciled; schedules pin their exact instrument snapshot. Synthetic schedules always pin the synthetic placeholder instrument even when real materials exist.

## Backup and restore

`backup.py` uses SQLite's online backup API, verifies integrity before publishing a file with mode 0600, and deletes snapshots older than 30 days. It never copies a live DB file without its WAL. The backup loop retries failures after one minute and prints no credentials/answers.

Run on production using the same Compose files:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml exec -T careconnect-backup \
  python backup.py backup --directory /backups
```

For recovery, stop API and backup services first; leave frontend unavailable until verified. Preserve the current DB, WAL and SHM together in a separate directory. Restore **to a new destination**; the tool refuses an existing DB or sidecar files:

```bash
python backend/backup.py restore --source /path/to/snapshot.sqlite3 --destination /path/to/new.sqlite3
python backend/backup.py check --database /path/to/new.sqlite3
```

Container volume recovery procedure:

1. Stop `careconnect-api` and `careconnect-backup` using the same Compose project/files.
2. Use `docker compose run --rm --no-deps --user 0 careconnect-backup sh` to access `/data` and `/backups` while services are stopped. Create a dated preservation directory under `/data`; move the current DB and any `-wal`/`-shm` sidecars into it.
3. Run `python backup.py restore --source /backups/SELECTED.sqlite3 --destination /data/careconnect.sqlite3`, then `python backup.py check --database /data/careconnect.sqlite3`. Restore owner with `chown 10001:10001 /data/careconnect.sqlite3`.
4. Start API/backup with `up -d --wait`; verify `/api/health`, participant metadata, schedules and known submitted answers before reopening collection. Do not delete the preserved database until recovery is accepted.

Tests restore an actual consistent snapshot to a separate DB and compare persisted submitted answers. Restore intentionally rolls data back to snapshot time; retain/reconcile newer data separately. Access credentials may also return to snapshot state; revoke suspect grants after restore.

## Application rollback

Do not revert or remove data volumes. Preserve a consistent snapshot before rollback. The deployment script tags the previous frontend image `careconnect-h5:rollback-TIMESTAMP`. Tag it back as `careconnect-h5:latest` and recreate **only** the frontend (`up -d --no-deps careconnect-h5`) to restore the prior static app, keeping API/data running. This first release's prior demo frontend cannot collect research assessments; keep collection paused during that rollback. For later API rollbacks use a known schema-compatible image and verify health/persisted records. Do not downgrade the DB or automatically restore a historical snapshot during code rollback.

## API outline

- `POST /api/access/exchange`, `GET /api/me`
- `GET /api/assessments`, `GET /api/assessments/{id}`
- `PUT /api/assessments/{id}/draft`: revision CAS, complete current draft payload
- `POST /api/assessments/{id}/submit`: acknowledged revision, persisted retry key, one immutable submission/assessment
- Staff participant enrollment/consent, schedules, private grants/revocation, withdrawal
- Attributable staff-grant creation/list/revocation (administrator only)
- Review queue, review/intervention records and linked amendments
- `GET /api/exports/{name}.csv`: administrator/research only, explicit unfinished `drafts`, comprehensive `dictionary`
- `GET /api/health`: SQLite quick-check

Interactive OpenAPI docs are FastAPI defaults; all data routes enforce sessions/permissions server-side. Identifiers and item scores are validated; blank scores are absent rather than zero. Unanswered draft domains have missing means plus answered counts. Exports preserve the original submission and linked amendment records as separate versions.
