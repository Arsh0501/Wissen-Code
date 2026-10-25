# Wissen Code

A coding assessment and interview platform built with React, TypeScript, Express, PostgreSQL and Prisma. The UI includes a question bank, assessment creation, candidate assessments, live interviews, reports and AI-assisted workflows.

## Local setup

Requires Node.js 22, PostgreSQL and Redis.

```sh
npm install
npm run install:all
cp server/.env.example server/.env
cp client/.env.example client/.env.local
```

Set `DATABASE_URL` and a random `JWT_SECRET` of at least 32 characters in `server/.env`. Set `REDIS_URL` for background jobs and realtime delivery. The example configuration uses backend port 4001.

```sh
cd server
npm run db:generate
npx prisma migrate deploy
npm run db:seed-users
cd ..
npm run dev
```

Open http://localhost:3000. The seeded local administrator account is `admin@wissen.dev` / `Admin@123`. Demo accounts are for local development only.

To load sample questions and assessment results, run `npm run db:seed` from `server`. This command replaces the development assessment data; it is optional.

Run `npm run worker` in a second terminal from `server` to process queued AI jobs when Redis is configured. Without `REDIS_URL`, manually requested AI jobs run directly through the API. Set an AI provider key to enable generation. The key stays on the backend. See [AI agent UI locations](docs/ai-agents-ui.md).

`JUDGE_MODE=mock` simulates execution for development. Use `JUDGE_MODE=live` and a working `JUDGE0_API_URL` for real code execution. AI-generated questions require real reference-solution verification and human approval before entering the question bank.

## Checks

Run `npm test` and `npm run build` from the project root. Backend tests require a local PostgreSQL database and Redis and create temporary test records.

## Docker

Set `POSTGRES_PASSWORD` and `JWT_SECRET`, then run:

```sh
docker compose up --build
```

Compose runs PostgreSQL, Redis, migrations, the API and the AI worker. Run the frontend separately with `npm run dev:client`; its development proxy points to port 4001.

## Project structure

- `client/src/pages`: administrator and candidate screens.
- `client/src/components`: shared UI and workflow components.
- `client/src/services`: API clients and workflow types.
- `client/src/test`: test setup and fixtures.
- `server/src/routes`: authenticated REST APIs.
- `server/src/ai`: OpenAI gateway, tools, workflows and background worker.
- `server/src/socket`: live interview events.
- `server/prisma`: database schema and migrations.

See [docs/api.md](docs/api.md) for the main API routes and realtime contract.

## Team and interview workflows

Interview planning and resume-based interview question generation are removed. **Prepare questions** provides only selection from the existing question bank and question sets. Resume viewing, live calls, transcript review, AI follow-ups and evaluations remain available.

### Bulk assessment invitations

In **Assessments**, publish an assessment and click **Bulk invite candidates**. Upload CSV or Excel `.xlsx` (up to 5 MB / 5,000 candidate rows per sheet), choose a worksheet if needed, and confirm the name/email header mapping. Column order does not matter; other columns are ignored. Ambiguous headers require manual mapping. Invalid/duplicate rows are flagged and cannot be selected. Older `.xls` files must first be saved as `.xlsx`.

Select imported candidates and optionally use **Add candidates from database** to search and combine existing candidates. Review selections before clicking **Send assessment invitations**. Up to 500 unique email addresses are accepted per batch. Each recipient gets a personalized email with a single-use assessment invitation link; imported recipients are not automatically created as accounts. Repeating the same request does not enqueue duplicate invitations. Status in the dialog reflects queued/sent/failed processing; sent means the provider accepted the email, not confirmed inbox delivery.

Configure `RESEND_API_KEY`, `MAIL_FROM`, and the public frontend `APP_URL` in the backend, then run `npm run worker:mail` from `server`. The database outbox is reused; no new database migration is required. Only administrators can submit bulk invitation batches.

Team Access manages administrator and interviewer permissions. Interviews include shared editing, chat, a whiteboard, browser calls, live transcription and reviewed-transcript follow-ups. Hiring Operations and its dedicated APIs and database tables have been removed. Core assessment reports and invitation links remain available. Written/project assessment answers remain provisional without an automatic scoring implementation.

Run `npm run worker:mail` for queued email and ATS delivery. Production uses `npm run worker:grading` and `ASYNC_GRADING=1` for durable assessment grading. See [production setup](docs/production.md) for HTTPS deployment, email, SSO, TURN, monitoring, backup/restore, and the remaining product boundaries.

## Groq free-tier AI

Create a private key at https://console.groq.com/keys and set these in `server/.env`:

```env
AI_PROVIDER=groq
GROQ_API_KEY=your_key_here
GROQ_MODEL=openai/gpt-oss-20b
```

Restart the backend and AI worker (`npm run worker` from `server`). Groq is different from xAI Grok. Free-plan quotas apply; see https://console.groq.com/docs/rate-limits. No OpenAI key is needed in Groq mode. For Docker, set the same variables in the Compose environment. On Render, set them on the API and sync the Blueprint so the AI worker receives them. Set `AI_PROVIDER=openai` to switch back.
