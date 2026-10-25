# Using the AI agents

| Agent | Role | UI location |
| --- | --- | --- |
| Question Generation | Admin | AI Questions → enter a topic, difficulty, count and starter languages → Generate |
| Question Validation | Admin | AI Questions → select a draft → save edits → Validate → review checks before approval |
| Interview Assistant | Assigned interviewer | Open workspace → AI Tools → Suggest follow-ups, during a live interview |
| Note Writer | Assigned interviewer | Open workspace → AI Tools → Generate notes, during or after an interview |
| Evaluation | Assigned interviewer | Open workspace → AI Tools → Generate interview report, after completion |

The live room also retains its existing AI controls. AI Tools remains accessible after an interview finishes. Follow-ups can be reviewed, proposed notes can be edited and accepted/rejected, and the generated notes timeline and evidence-backed report are displayed there.

Configure an AI provider on the backend. When REDIS_URL is absent, manually requested AI jobs execute directly and persist results and failure status. With Redis configured, requests use the background AI worker (`npm run worker` from `server`); automatic event-triggered agents also require that queue. Direct execution does not replace Redis for other platform services such as queued mail or asynchronous grading.

Candidates cannot access staff AI tools. Admins manage question generation/validation and scheduling; the assigned interviewer operates interview agents.

Verification: the real interview-agent smoke check is `node --import tsx src/test/interview-agents-check.ts` from `server`. It creates and removes its own interview fixtures and calls the configured AI provider.

### Coding and single-choice MCQ generation

In **AI Question Studio**, choose Coding or MCQ (single choice). Enter comma-separated topics and a total count of 1 to 10 questions (at least one per topic). Questions are distributed across topics in the order entered; for example, Arrays and SQL with a total of three creates Arrays, SQL, Arrays. Topics are persisted in draft content and in the approved question bank's existing `tags` field; no new database table is required.

MCQ drafts contain 2 to 6 distinct options, one `correctOptionId`, and an explanation. The MCQ editor permits one selected correct answer. AI validation independently reviews the answer and distractors; a code judge is unnecessary. After approval, settings use `multiple: false`, `options`, and one `correctOptionIds` entry. Use the existing assessment question picker to filter by topic and MCQ type and select the approved questions. Candidates see radio buttons; automatic grading uses the private answer key.

The generation API accepts `topics: ["Arrays", "SQL"]`, `questionType: "mcq"`, `difficulty: "easy"`, and `count: 3`. The legacy `topic` string still works. Generation remains resumable through `requestId` and human approval is required before drafts appear in the shared bank.
