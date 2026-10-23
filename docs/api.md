# API reference

Local base URL: `http://localhost:4001/api`.

Protected routes require `Authorization: Bearer <accessToken>`. Candidates have one active login session. Refresh tokens expire after seven days; logout revokes the session and its authenticated sockets.

## Authentication and accounts

| Method | Route | Purpose |
| --- | --- | --- |
| POST | `/auth/register` | Register a candidate |
| POST | `/auth/login` | Return access token, refresh token and user |
| POST | `/auth/refresh` | Exchange a refresh token for an access token |
| POST | `/auth/logout` | Revoke the current session |
| GET / PUT | `/auth/me` | Read or update the profile |
| PUT | `/auth/password` | Change the password |
| GET | `/users`, `/roles` | Administrator account directory and roles |
| PUT | `/users/:id/role` | Change a role and revoke the user's sessions |
| GET | `/candidates` | Search candidates |

## Questions and assessments

| Method | Route | Purpose |
| --- | --- | --- |
| GET / POST | `/questions` | List or create questions |
| GET / PUT / DELETE | `/questions/:id` | Read, edit or delete a question |
| GET / POST | `/assessments` | List or create assessments |
| GET / PUT / DELETE | `/assessments/:id` | Read, edit or delete an assessment |
| GET | `/assessments/dashboard` | Dashboard totals, assessments and activity |
| POST | `/assessments/:id/start` | Start or resume an attempt |
| GET | `/attempts/:id` | Read an owned attempt |
| PUT | `/attempts/:id/answer` | Save a question's draft answer |
| POST | `/attempts/:id/save-all-drafts` | Save all draft answers |
| POST | `/attempts/:id/submit` | Finalize and grade saved answers |
| GET | `/assessments/:id/candidates` | Assessment participants and statistics |
| GET | `/candidates/:id/report?assessmentId=:id` | Candidate report |
| GET | `/submissions/:assessmentId/:candidateName` | Candidate results |
| POST | `/judge/run` | Run code using the configured judge |

Candidate attempts enforce ownership, question membership, permitted languages, attempt limits and time limits. A retake uses `{ "retake": true }` with the assessment start endpoint.

Invitation metadata and joining are public at `/public/invite/:token` and `/public/invite/:token/join`. Returning guests must use their existing authenticated session. Expired and revoked invitations cannot grant access.

## Interviews

Create and list interviews with `POST` and `GET /interviews`. Read an assigned interview at `/interviews/:id`. Interviewer actions are restricted to the assigned owner.

- `POST /interviews/:id/start` and `/interviews/:id/end`.
- `PUT /interviews/:id/current-question`.
- `POST /interviews/:id/execute`, `/interviews/:id/submit`, `/interviews/:id/notes`.
- `GET /interviews/:id/notes`.
- `GET /public/interview/:roomToken` and `PUT /public/interview/:roomToken/answer` for the candidate room.
- `GET /interview-workflows/:id/plan`, `POST /interview-workflows/:id/plan/generate` and `PUT /interview-workflows/:id/plan`.
- `GET` and `PUT /interview-workflows/:id/evaluations` for saved skill ratings and evidence.

Connect Socket.IO to the backend origin with `{ token }` or `{ roomToken }` in its auth payload. Emit `JOIN_INTERVIEW` with an interview ID or room token after connection. The server checks room assignment before joining.

Client events: `START_INTERVIEW`, `CHANGE_QUESTION`, `UPDATE_CODE`, `EXECUTE_CODE`, `SUBMIT_CODE`, `ADD_NOTE`, `END_INTERVIEW`.

Server events: `SYNC_STATE`, `CANDIDATE_JOINED`, `INTERVIEWER_JOINED`, `INTERVIEW_STARTED`, `QUESTION_CHANGED`, `CODE_CHANGED`, `CODE_EXECUTED`, `CODE_SUBMITTED`, `NOTE_ADDED`, `INTERVIEW_ENDED`, `ERROR`.

## AI workflows

Generated questions stay in the draft queue until validation and human approval.

- `GET /ai/status`, `GET /ai/drafts`, `POST /ai/generate`.
- `POST /ai/drafts`, `PUT /ai/drafts/:id`.
- `POST /ai/drafts/:id/validate` and `/ai/drafts/:id/approve`.

Background jobs use `POST /ai/jobs` with `{ kind, interviewId?, input }`. The response is 202 with a job ID. Supported kinds are `question-generation`, `question-validation`, `interview-planner`, `interview-assistant`, `note-writer` and `evaluation`.

Read owned jobs with `GET /ai/jobs` or `/ai/jobs/:id`; retry failed jobs with `POST /ai/jobs/:id/retry`. Interview evaluation requires a completed interview.

Review a suggestion with `POST /ai/jobs/:id/review` and `{ itemId, decision, content? }`. Decisions are `ask`/`dismiss` for follow-ups or `accept`/`reject` for notes. Accepting notes saves a private interviewer note; repeated acceptance does not create duplicates.

`GET /interview-workflows/:id/ai-results` returns persisted results, jobs and configuration status. Interviewer-only `AI_RESULTS` socket events contain `interviewId`, `followUps`, `notes` and `evaluation`. Rejoining restores these through `SYNC_STATE.aiResults`.

OpenAI responses are schema-validated. Observation quotes must match recorded source text. Legacy `/agents` APIs and direct `POST /submissions` return 410.

## Shared production services

Bulk assessment email endpoints (administrator only):

- `GET /api/invites/candidates?search=...`: up to 100 matching database candidates, with `hasMore` for narrowing the search.
- `POST /api/invites/bulk-assessment`: `{ assessmentId, requestId, recipients: [{name,email}], candidateIds: [] }`. Validates published/non-closed assessments, resolves database candidates, deduplicates normalized emails, and transactionally creates single-use links and outbox messages. Maximum 500 unique recipients; a stable UUID requestId makes retries idempotent. Returns 202 for a new batch or 200 for a repeat.
- `GET /api/invites/bulk-assessment/status?assessmentId=...&requestId=...`: current administrator's batch email status. CSV/XLSX files are parsed locally for preview; only selected name/email records and database candidate IDs are submitted.

Hiring Operations endpoints for analytics, integrity decisions, manual scoring, accommodations, bulk email invitations, templates, email inspection/retry, readiness UI and audit history have been removed. Their dedicated database tables are removed by migration.

The shared `/api/platform/interviews/:id/calendar` and `/api/platform/interviews/:id/invitation` endpoints remain for assigned interviewers. API health/ready/metrics endpoints remain for deployment monitoring. Core assessment invitation links, reports and activity records are unchanged.

`POST /api/users/invite` onboards staff through an emailed password-setup link. Role updates support `admin`, `interviewer`, and `candidate`; they revoke existing sessions. The `role` field in authentication responses remains `admin` for staff UI compatibility, while `accessRole` carries the actual server-enforced team permission.

Account routes: `POST /api/auth/forgot-password`, `/reset-password`, `/request-verification`, `/verify-email`. Company SSO routes are `/api/auth/sso/config`, `/start`, `/callback`, and `/session`. Single-use handoff tokens travel in HttpOnly cookies, not query strings.

Questions support `coding`, `debugging`, `mcq`, `sql`, `written`, and `project`. The `settings` object holds MCQ choices/answer keys, a public SQL schema, rubric text, or project files. Candidate responses omit answer keys and private explanations. The question-bank endpoints require staff access. Assessment question content remains locked until the candidate starts a server-timed attempt, and candidate sample execution requires an active eligible attempt. MCQ answers use a JSON array of choice IDs in the existing draft `code` field. Written answers use text; project answers use a JSON array of `{path, content}` files. SQL test inputs hold fixture setup executed in the isolated SQLite runtime before the query.

With `ASYNC_GRADING=1`, attempt submission returns HTTP 202 after saving the submission boundary and queueing grading. Results return `resultsPending: true` until the worker finishes, and `gradingFailed: true` only for missing/exhausted work. Reposting the saved attempt retries grading; existing drafts cannot be modified after submission. `/api/ready` includes the grading-worker heartbeat check.

Realtime additions: `UPDATE_CODE` requires `baseRevision`; stale edits return the latest saved state for conflict resolution. `CODE_CHANGED` includes `revision`, `authorRole`, and `authorName`. `CURSOR_CHANGED`, `CHAT_MESSAGE`, `WHITEBOARD_STROKE`, `WHITEBOARD_CLEARED`, `ROOM_TOOLS`, and `RTC_SIGNAL` require an authorized room. Private notes and AI results remain private. Chat, board strokes, and code snapshots are retained as interview events; video/audio are not recorded.

See [production setup](production.md) for deployment and external service requirements.
