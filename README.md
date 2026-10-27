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

### Start the complete project

After completing the setup above and installing the [transcription environment](services/transcription/README.md#setup-powershell-from-repository-root), run this from the repository root:

```sh
npm run dev:all
```

On Windows, you can also double-click `start-project.cmd`. The launcher starts the frontend, API, AI worker, mail worker, grading worker and transcription service together, with labeled logs in one terminal. Press Ctrl+C to stop the launched processes.

PostgreSQL must already be running. If local Redis is stopped, the launcher can restart the existing `wissen-code-redis-1` Docker container when its published port matches `REDIS_URL`; Docker Desktop must be running. PostgreSQL and Redis stay running when the launcher exits. Existing mail queues are processed normally by the mail worker.

The launcher checks JavaScript/Python dependencies, required environment settings, dependency ports and occupied application ports before starting. It reuses an existing transcription service only when its health endpoint reports ready; reused services remain running on exit. Use `npm run dev:check` to run those checks without starting processes or restarting Redis. It does not install dependencies, change environment files, apply migrations, or verify database credentials/schema. Stop previously started frontend/backend processes before using it. Model loading or a first-time model download may delay transcription startup.

To load sample questions and assessment results, run `npm run db:seed` from `server`. This command replaces the development assessment data; it is optional.

Run `npm run worker` in a second terminal from `server` to process queued AI jobs when Redis is configured. Without `REDIS_URL`, manually requested AI jobs run directly through the API. Set an AI provider key to enable generation. The key stays on the backend. See [AI agent UI locations](docs/ai-agents-ui.md).

`JUDGE_MODE=mock` simulates execution for development. Use `JUDGE_MODE=live` and a working `JUDGE0_API_URL` for real code execution. AI-generated questions require real reference-solution verification and human approval before entering the question bank.

## Checks

Run `npm test` and `npm run build` from the project root. Backend tests require a local PostgreSQL database and Redis and create temporary test records.

## Docker

For Vercel frontend hosting with all backend services and databases on AWS EC2, follow the complete [Vercel + AWS deployment walkthrough](docs/deploy-vercel-aws.md). It covers Git, AWS console setup, a free DuckDNS hostname, HTTPS, environment variables, database initialization, workers, transcription, administrator creation and optional TURN relay.

For a Render Static Site frontend with the backend, workers, PostgreSQL, Redis and transcription on one EC2 instance, follow [Render + AWS demo deployment](docs/deploy-render-aws.md). That setup uses the separate `compose.aws.yaml` file and a free DuckDNS hostname; it does not use the combined frontend/backend production Compose setup below.

Set `POSTGRES_PASSWORD` and `JWT_SECRET`, then run:

```sh
docker compose up --build
```

Compose runs PostgreSQL, Redis, migrations, the API and the AI worker. Run the frontend separately with `npm run dev:client`; its development proxy points to port 4001.

## Project structure

See [Project structure and conventions](docs/project-structure.md) for the complete directory layout, file placement rules and formatting commands. Run `npm run format` to format supported source files and `npm run format:check` to check consistency.

- `client/src/pages`: administrator and candidate screens.
- `client/src/components`: shared UI and workflow components.
- `client/src/services`: API clients and workflow types.
- `client/src/test`: test setup and fixtures.
- `server/src/routes`: authenticated REST APIs.
- `server/src/ai`: AI gateway, agents, tools and workflow support.
- `server/src/services`: domain services grouped by assessment, interview, question, execution and AI responsibilities.
- `server/src/platform`: authentication, mail, job, realtime and monitoring infrastructure.
- `server/src/workers`: AI, mail and grading worker entry points.
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
