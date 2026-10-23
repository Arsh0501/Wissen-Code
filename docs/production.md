# Running Wissen Code in production

This deployment is for one organization's hiring team. Separate organizations currently require separate deployments and databases. It does not provide multi-tenant isolation or a compliance certification.

## Configuration

Use Node.js 22, PostgreSQL 16, Redis 7, and a private, isolated Judge0 provider. Set `JUDGE_MODE=live`; production code execution refuses mock results. Configure `JUDGE0_API_URL` and, if required by your provider, `JUDGE0_API_KEY` (`X-Auth-Token`). Verify the provider supports SQLite language 82 before publishing SQL questions. No candidate code runs on the API host.

Set `APP_HOST` to your DNS hostname, `APP_URL=https://your-host`, `CORS_ORIGINS=https://your-host`, `TRUST_PROXY=1`, and long random values for `POSTGRES_PASSWORD`, `JWT_SECRET`, and `MONITORING_TOKEN`. Keep secrets outside version control. Point DNS to your server and allow ports 80 and 443 for Caddy certificate provisioning.

```sh
docker compose -f compose.yaml -f compose.production.yaml up -d --build
```

The overlay adds the frontend, HTTPS proxy, communication worker, and durable assessment-grading worker. Candidate submissions are acknowledged after answers are saved, then queued in Redis for background grading; the results page polls for completion and offers retry after provider failures. Readiness requires a grading-worker heartbeat when asynchronous grading is enabled. The API's host port is bound to localhost. PostgreSQL and Redis stay on the Docker network. Configure an initial administrator through the seed-user command in a private provisioning session and replace development credentials before opening access. Do not run the sample-data seed against production.

## Optional services

- **AI:** set `OPENAI_API_KEY` and `OPENAI_MODEL`; run the AI worker. Question approval requires reference execution and human review. Evaluate generated questions and evidence against your own role rubrics before relying on results.
- **Email:** set `RESEND_API_KEY` and `MAIL_FROM` to a verified sender; run `npm run worker:mail` in development. Invitations, reminders, password recovery, and email verification use the durable outbox. Delivery retries five times. “Sent” means provider acceptance; inbox delivery and bounces need provider monitoring. Recovery links expire after 30 minutes.
- **SSO:** configure `OIDC_ISSUER`, `OIDC_CLIENT_ID`, and `OIDC_CLIENT_SECRET`. Register `https://your-host/api/auth/sso/callback` as the provider callback. Create staff accounts first. The first login requires a provider-verified email matching an existing staff account, then binds issuer and subject. Authorization Code, PKCE, nonce, browser state, and single-use handoff protect sign-in. Candidate sign-in continues to enforce the one-device rule.
- **Video:** set `WEBRTC_ICE_SERVERS` to your STUN/TURN configuration as a JSON array. Calls require HTTPS and participant permission; media is not recorded. Static TURN credentials are visible to authorized room participants: use limited credentials and rotate them. Test browsers and restrictive networks before real interviews.
- **ATS:** set `ATS_WEBHOOK_URL` to a trusted HTTPS endpoint and `ATS_WEBHOOK_SECRET` to a separate random secret. The communication worker sends `assessment.completed` (attempt ID) and `interview.completed` (interview ID). This is a generic webhook connector; vendor-specific Greenhouse/Lever/Workday mappings are not included. Validate `X-Wissen-Signature` as HMAC-SHA256 over `id.timestamp.rawBody`, enforce timestamp freshness, and deduplicate `X-Wissen-Id`. Delivery is at least once and retries five times. It contains IDs, not candidate answer text.

## Operations

`GET /api/health` checks API liveness. `GET /api/ready` checks database and Redis access and returns 503 if unavailable. `GET /api/metrics` requires `Authorization: Bearer <MONITORING_TOKEN>` and exports request/error counters, accumulated request duration, and uptime. Connect these to your monitoring system and alert on readiness failures, sustained 5xx responses, and failed background jobs. Hiring Operations has been removed; use the API monitoring endpoints for operational checks.

Create a backup with `bash scripts/backup.sh /secure/backup-directory`. Store encrypted off-host copies and define retention for candidate data and interview history. Restore in a separate environment regularly. The restore command replaces the target database: stop traffic and workers, then run `bash scripts/restore.sh --replace-database path/to/backup.dump`, apply migrations, and verify before reopening traffic. These scripts use the base Compose project; supply the same environment/project name as your deployment.

Run `npm test` and `npm run build`. Backend tests use temporary records in the configured database; CI uses its own PostgreSQL and Redis services. Run browser verification with `node scripts/browser-check.mjs` against a development/test environment, with `CHROME_PATH` if needed. Run `node scripts/verify-execution.mjs` against the live development/staging backend to verify all five languages, rejection of wrong answers, isolated SQL fixtures, and weighted grading. It makes real execution requests and removes its test records. Run `node scripts/load-check.mjs` for an HTTP smoke load; set `LOAD_TEST_URL`, `LOAD_AUTH_TOKEN`, `LOAD_CONCURRENCY`, and `LOAD_REQUESTS` for an authenticated read endpoint. Never use a read smoke test as evidence of compiler capacity. Measure concurrent execution, assessment submission, reconnects, and provider outages on staging at your expected load. `EXECUTION_CONCURRENCY` defaults to four per API/worker process, with a bounded in-memory wait queue; size the total across all replicas to your compiler capacity. Production enables `ASYNC_GRADING=1` and the dedicated grading worker. Development defaults to synchronous grading; start `npm run worker:grading` before enabling asynchronous grading locally. Keep Redis persistence/backups and monitor failed queue jobs. Stalled processing leases are retried after the current lease expires rather than allowing concurrent grading of one attempt.

## Product boundaries

Written/project assessment results remain provisional; the Hiring Operations manual-scoring workflow, similarity review and role templates have been removed. SQL fixtures still execute in the judge runtime. Core assessment browser activity records remain available in reports.
