# Using the AI agents

| Agent | Role | UI location |
| --- | --- | --- |
| Question Generation | Admin | AI Questions → enter a topic, difficulty, count and starter languages → Generate |
| Question Validation | Admin | AI Questions → select a draft → save edits → Validate → review checks before approval |
| Interview Planner | Assigned interviewer | Interviews → Open workspace → Interview plan |
| Interview Assistant | Assigned interviewer | Open workspace → AI Tools → Suggest follow-ups, during a live interview |
| Note Writer | Assigned interviewer | Open workspace → AI Tools → Generate notes, during or after an interview |
| Evaluation | Assigned interviewer | Open workspace → AI Tools → Generate interview report, after completion |

The live room also retains its existing AI controls. AI Tools remains accessible after an interview finishes. Follow-ups can be reviewed, proposed notes can be edited and accepted/rejected, and the generated notes timeline and evidence-backed report are displayed there.

Configure an AI provider on the backend. When REDIS_URL is absent, manually requested AI jobs execute directly and persist results and failure status. With Redis configured, requests use the background AI worker (`npm run worker` from `server`); automatic event-triggered agents also require that queue. Direct execution does not replace Redis for other platform services such as queued mail or asynchronous grading.

Candidates cannot access staff AI tools. Admins manage question generation/validation and scheduling; the assigned interviewer operates interview agents.

Verification: the real interview-agent smoke check is `node --import tsx src/test/interview-agents-check.ts` from `server`. It creates and removes its own interview fixtures and calls the configured AI provider.
