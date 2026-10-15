# Verification evidence — 2026-10-15

Fresh implementation checkout: `/Users/af/Documents/careconnect01`, based on `aeeb7f2` from the repository GitHub now resolves as `ksamint/careconnect01`. Existing local checkout/server files were inspected read-only during discovery; original local modifications remain untouched.

## Passed locally

- Eight FastAPI functional tests: full enrollment/schedule/draft/submission/review/amendment/export cycle; explicit zero versus missing; 19-item validation and separate domain scores; CAS conflicts; duplicate submission receipt; cross-participant and role isolation; CSRF/Origin checks; expired/revoked grants; consent and withdrawal; real enrollment gate; pinned material snapshots; synthetic instrument isolation; malformed material JSON fail-closed; trusted proxy rate limits; unfinished export filtering; 30-day backup retention; restart and consistent SQLite backup/restore comparing actual persisted answers.
- Five frontend autosave tests: immediate local persistence; offline reopening and explicit zero; serial in-flight writes preserve later edits; revision conflict reload/reapply; persistent idempotency key; 500ms debounce and two-second continuous-input limit.
- TypeScript/Vite production build and ESLint of active App/autosave files.
- Compose base/production configuration validation, shell syntax and `git diff --check`.
- Headless Chromium with separate staff/patient browser contexts, patient viewport 390×844: private fragment exchange clears URL, explicit zero remains selected, untouched answers stay missing, refresh restores notes/answers, offline edit reports local-only status then reconnect persists to independently authenticated staff view, all 19 items submit, domain counts/means displayed on receipt, staff records intervention/review and CSV includes persisted participant answers. Mobile receipt and questionnaire screenshots inspected. Staff UI additionally passed enrollment, pending-to-consented progression, scheduling, SVG QR creation/download, independent draft inspection and two-device explicit conflict reapply/reload. The 390px questionnaire had no horizontal overflow.

## Passed on the live domain

Deployment was explicitly authorized and completed at **https://carepro.opcglobal.cn** on `APUCH-cursor001` (`119.45.7.98`, `/data/careconnect01`). The existing Traefik route remains unchanged. Nginx, FastAPI and SQLite health checks pass; the backup worker reports its first verified daily snapshot.

The separate-browser patient/staff checks above also passed against live HTTPS, including the 390px patient workflow and staff UI enrollment/consent/scheduling/QR/conflict checks. Additional live checks confirmed the real-enrollment endpoint returns 403, original answers remain unchanged after a linked amendment, both completion and version timestamps are exported, submitted records are excluded from unfinished-draft exports, follow-up scheduling persists, and withdrawing the two synthetic participants stops future collection. Completion reports exactly one submission from three scheduled assessments (1/3).

A live consistent backup was restored to an isolated temporary database and every row compared across participants (2), schedules (3), submissions (1), amendments (1), reviews (1), and interventions (1). API container restart preserved those records and the administrator grant. The temporary synthetic verifier grant was revoked and confirmed rejected (401). Synthetic historical records are retained as withdrawn audit evidence; no real participants exist.

The live JavaScript bundle matches the tested local bundle SHA-256: `29d5d04473f7ccc1b3b8e42ded9b37b5939d699e70cdee3017b1430fcfb3de90`. Reviewed backend and Nginx source copies were compared to the server. Live headers confirm no-store, no-referrer, frame denial and content-type protection.

Release recovery: the host's configured Docker Hub mirror did not resolve. Official Docker-library Python/Nginx base images were obtained through ECR Public. A Node image download stalled; the frontend now uses the existing repository approach of deploying its already-tested local bundle. The disconnected desktop SSH agent was avoided with an existing authorized key, with no daemon, TLS, shared proxy or account-permission changes. The cancelled remote build reached a terminal state before retry.

## Limits and outstanding verification

Local Docker daemon returns HTTP 500, so local container acceptance is not claimed; production container build, startup, syntax, health, live browser workflow, restart and restore are verified.

Official instrument language/authorization and approved study consent were not supplied. Only synthetic placeholders are bundled and real enrollment remains disabled. Actual QR scanning and WeChat testing on physical phones were not performed. Mobile Chromium emulation is not a physical-device claim. Cold loading offline requires server access again; in-page offline edits remain stored and retry when connectivity returns.

Full-repo ESLint reports five pre-existing findings in unused demo `AppContext.tsx` and `navigation.tsx` modules. They are not imported by the active private-link app. No external messages or clinical alerts were sent, no demo local-storage records imported, and no real participants enrolled.

The 30-day backup volume is on the same host; off-host encrypted disaster recovery is not configured. Code rollback preserves the DB; restore is an explicit separate operation. Private links are credentials, and saved local draft data persists on the device by design. Administrator handoff uses a mode0600 private HTML file outside the repository; its token is not copied into the repo, release report or access logs.
