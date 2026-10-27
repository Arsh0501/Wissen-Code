# Project structure and conventions

The repository has three applications: the React browser client, the Node.js API and workers, and the private Python transcription service. Application entry points, HTTP routes, environment variable names and database migrations remain stable.

```text
client/
  src/
    main.tsx                 Browser entry point and providers
    app/                     Application routing and Monaco initialization
    pages/
      account/               Profile screens
      admin/                 Administration and interview workspace screens
      auth/                  Login, invitation and account recovery screens
      candidate/             Assessment and interview screens
      interviewer/           Interviewer dashboard
      landing/               Public landing page and its styles
    components/
      ai/                    Shared AI interfaces
      assessments/           Invitations and sharing
      auth/                  Signup verification and authentication artwork
      dashboard/             Dashboard presentation
      editor/                Reusable code editor
      forms/                 Shared form controls
      interview/             Live interview components
      landing/               Landing page components
      layout/                Application shell, navigation and theme controls
      questions/             Question editing and selection
      ui/                    Shared UI primitives
    context/                 React application contexts
    hooks/                   Reusable state and realtime hooks
    services/                Browser API clients and data helpers
    styles/                  Global application styles
    types/                   Shared browser types
    test/                    Test setup and fixtures
server/
  src/
    index.ts                 API startup and middleware registration
    ai/                      AI gateway, agents, prompts, tools and queue support
    database/                Prisma client, seed scripts and development fixtures
    middleware/              Authentication and route authorization
    routes/                  REST handlers; auth/ contains account and SSO routes
    services/
      ai/                    Structured AI workflow adapter
      assessments/           Assessment policy, access, grading and statistics
      execution/             Judge0 execution adapter
      interviews/            Interview state, conversation evidence and reporting
      questions/             Question generation, contracts and payload helpers
    platform/
      auth/                  OTP and permission infrastructure
      jobs/                  Queue helpers and execution limits
      mail/                  Mail transport, durable outbox and webhooks
      observability/         Health checks and request metrics
      realtime/              Call signaling and transcript transport
    socket/                  Interview socket handlers and event types
    workers/                 AI, mail and grading process entry points
    scripts/                 Development verification utilities
    templates/               Report templates
    test/                    Backend regression and integration tests
  prisma/                    Schema and historical migrations
services/transcription/      Private Python speech recognition service
deployment/                  Reverse proxy and deployment configuration
scripts/                     Operational checks, backup and restore utilities
docs/                        Setup, API and workflow documentation
```

## File placement

- Keep browser tests and component-specific CSS beside their implementation. Shared fixtures and test setup belong in `client/src/test`.
- Keep request handlers in `server/src/routes`, domain operations in `server/src/services`, and transport/provider integration in `server/src/platform` or the existing AI and socket directories.
- Start background processes from `server/src/workers`. Workers use the same domain services as the API; they do not define an alternative business workflow.
- Keep database migrations in their original timestamped directories. Refactoring application files does not require a migration.
- Use direct relative imports. Import paths should identify dependencies explicitly; avoid broad barrel exports that introduce dependency cycles.

## Formatting

The root Prettier configuration formats TypeScript, TSX, JavaScript, CSS, JSON, YAML and Markdown consistently. `.editorconfig` defines editor whitespace, including four-space indentation for Python. Environment files, lockfiles, migrations, public assets, dependencies and generated output are excluded from formatting.

```sh
npm run format
npm run format:check
```

Formatting changes layout only. Do not combine business behavior changes with formatting or file moves. Preserve execution order, comments, SQL, validation rules and user-facing text when reorganizing modules.

## Commands

For a public deployment with a Vercel frontend and AWS backend, use [Vercel + AWS deployment](deploy-vercel-aws.md). The local launcher below is for development.

Existing npm command names are unchanged. Their underlying file paths follow the directory structure above:

```sh
npm run dev
npm run dev:all
npm run dev:check
npm run build
npm run worker:mail
npm run worker:grading
```

From `server`, use `npm run worker` for the AI worker and the existing `db:*` scripts for database tooling. Production worker commands are `node dist/workers/ai.js`, `node dist/workers/mail.js` and `node dist/workers/grading.js`. Docker Compose and Render worker definitions use these paths as well.

`npm run dev:all` runs the frontend, API, three background workers and Python transcription service together through `scripts/dev-all.mjs`. Windows users can launch the same command by opening `start-project.cmd`. `npm run dev:check` validates local startup prerequisites without starting services.

Run both application test suites after moving files. Backend integration tests require their documented local database, Redis and, for live API checks, a running API. Start that API before running tests that call port 4001. Never run the fixture suite against a production database.
