# Wissen Code

A coding assessment and interview platform built with React, TypeScript, Express, PostgreSQL and Prisma. The UI includes a question bank, assessment creation, candidate assessments, live interviews, reports and AI-assisted workflows.

## Local setup

Requires Node.js 22.12+ (`nvm use`), PostgreSQL and Redis.

```sh
npm install
npm run install:all
npm run setup:local
```

`setup:local` generates a private random JWT secret and preserves existing database credentials. Set `DATABASE_URL` in `server/.env`. Set `REDIS_URL` for background jobs and realtime delivery. The example configuration uses backend port 4001.

```sh
cd server
npm run db:generate
npx prisma migrate deploy
npm run db:seed-users
cd ..
npm run doctor
npm run dev
```

Open http://localhost:3000. The seeded local administrator account is `admin@wissen.dev` / `Admin@123`. Demo accounts are for local development only.

To load sample questions and assessment results, run `npm run db:seed` from `server`. This command replaces the development assessment data; it is optional.

Run `npm run worker` in a second terminal from `server` to process AI jobs. Set `OPENAI_API_KEY` to enable generation. The key stays on the backend.

`JUDGE_MODE=mock` simulates execution for development. Use `JUDGE_MODE=live` and a working `JUDGE0_API_URL` for real code execution. AI-generated questions require real reference-solution verification and human approval before entering the question bank.

## Checks

Run `npm test` and `npm run build` from the project root. Backend tests use `NODE_ENV=test` and require a separate test database and Redis configuration. Copy `server/.env.test.example` to `server/.env.test`, set a separate random JWT secret, create the test database, and run `NODE_ENV=test npm run db:setup` before testing. They create temporary records.

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

## Hiring operations

The Hiring Operations page includes candidate comparison, question analytics, manual rubric scoring, code-similarity review, role templates, extra-time accommodations, bulk invitations, delivery status, readiness checks, and audit history. Team Access manages recruiter and interviewer permissions. Interviews include shared editing with conflict detection, chat, a whiteboard, browser video, calendar exports, and replay.

The question bank supports coding, debugging, MCQ, SQL, written responses, and multi-file projects. Written and project answers require human scoring; projects do not run hosted build environments.

Run `npm run worker:mail` for queued email and ATS delivery. Production uses `npm run worker:grading` and `ASYNC_GRADING=1` for durable assessment grading. See [production setup](docs/production.md) for HTTPS deployment, email, SSO, TURN, monitoring, backup/restore, and the remaining product boundaries.

See [architecture and environment guide](docs/architecture.md) for runtime boundaries, environment precedence, database isolation, indexes and responsive layout conventions.
