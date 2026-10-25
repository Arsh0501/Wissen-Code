# Application architecture

The application has three runtime boundaries: the React client, the HTTP/realtime API, and background workers. PostgreSQL is the source of truth. Redis transports jobs and realtime events; it is not the primary record store.

## Backend boundaries

- `src/config/environment.ts` loads environment files consistently for the API, Prisma CLI, seeds and workers. Injected values take precedence over files. Startup validates mandatory settings without displaying credentials.
- `src/app.ts` composes middleware, authorization, route modules and error handling. It does not open a network port.
- `src/index.ts` owns the HTTP lifecycle and realtime initialization.
- `src/routes` and `src/platform/*routes.ts` own HTTP contracts, input validation and authorization. Keep route-specific behavior here; move shared business rules to services as they acquire multiple callers.
- `src/services` owns assessment, judge and AI workflow operations. `src/ai` and the worker entrypoints own asynchronous execution, retries and provider boundaries.
- `src/prisma.ts` owns one Prisma client per process. All database changes belong in reviewed, additive Prisma migrations.

Do not bypass session verification in new routes. Candidate payload filtering and staff permission middleware apply to authenticated API modules. Keep third-party credentials exclusively in server configuration.

## Environments

Use Node 22.12+ (`nvm use`). Set `NODE_ENV` in the process before launching; production must inject it explicitly. Accepted values: development, test, staging, production.

File precedence, highest first: `.env.<environment>.local`, `.env.<environment>`, `.env.local`, `.env`. Existing process variables always win. Test, staging and production load only their own environment files to prevent accidental development database access. Every secret-bearing environment file is ignored by Git; example files are committed.

Use separate PostgreSQL databases, database users, Redis instances or logical databases, JWT secrets and provider credentials for each environment. Never copy production candidate data into development. Set Prisma `connection_limit` and `pool_timeout` in each `DATABASE_URL` according to replica count and database capacity. Localhost defaults belong only in local templates.

`npm run setup:local` creates local configuration and generates a cryptographically random JWT secret if absent or too short. It preserves other configuration. `npm run doctor` validates settings, checks all application tables and failed migration history, and checks Redis. `npm run db:setup` applies migrations; it never seeds or resets data.

For tests, copy `server/.env.test.example` to `server/.env.test`, generate a separate 32+ character secret, create `wissen_code_test`, then run `NODE_ENV=test npm run db:setup`. Tests create and remove fixtures and must have their own database. `npm test` selects that environment automatically.

For staging/production, start with `server/.env.production.example`, supply real credentials and explicit HTTPS origins, and use a live judge. Start mail, grading and AI workers according to enabled features. The API validates configuration before listening. `/api/health` checks process liveness; `/api/ready` checks PostgreSQL and Redis availability. The browser displays service unavailability in the workspace.

## Data model and indexes

The relational model covers users and sessions, questions and test cases, assessments and attempts, invitations, interviews and events, AI jobs, outbound delivery, account tokens and audit records. Existing JSON payloads remain compatible; arbitrary future entities are not pre-created.

The query-index migration adds indexes for session ownership/expiry, question lists, assessment lists, submission reports, grading recovery, relation lookups, realtime replay, author histories and token cleanup. Composite index order follows equality filters before ordered/range fields. Primary keys and existing unique constraints already provide indexes; additional indexes are not needed for every column. Confirm real query plans and write overhead before adding more at production scale.

The platform-table repair migration creates missing audit, integrity-review and accommodation tables on installations with inconsistent older migration history. Existing tables and records are preserved. Historical extra tables/columns are retained in the current local database; removing them requires an explicit data-retention decision.

For large production tables, schedule index creation during a maintenance window or deploy reviewed concurrent-index SQL separately. The committed migration uses ordinary transactional index creation.

## Client boundaries and device behavior

`components/layout` owns the shared shell, navigation and service status. Pages compose shared UI, API services and feature components. `services/api.ts` owns authentication refresh, request timeouts and user-facing connection messages. AI generation, code execution and synchronous grading use explicit extended timeouts.

Responsive behavior uses viewport and input capabilities: desktop sidebar, narrower tablet sidebar, scrollable phone navigation, wrapping page actions, touch target sizing and keyboard-visible focus. Theme tokens support light and dark modes. Keep tables inside horizontal-scroll containers rather than shrinking readable data; editors and interview media remain feature-specific layouts.

## Verification

Run `npm run doctor`, `npm test`, `npm run build`, and audits in the root, server and client packages. `scripts/browser-check.mjs` exercises major workflows using temporary fixtures and the running local API. Use a dedicated environment when running browser or load checks against shared infrastructure.
