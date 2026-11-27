# Using the AI agents

| Agent               | Role                 | UI location                                                                                             |
| ------------------- | -------------------- | ------------------------------------------------------------------------------------------------------- |
| Coding Wizard       | Admin                | AI Questions → Coding → question → starters → test cases → solution → verification → approve |
| MCQ Validation      | Admin                | AI Questions → MCQ → select a saved draft → Validate → review checks                                    |
| Interview Assistant | Assigned interviewer | Open workspace → AI Tools → Suggest follow-ups, during a live interview                                 |
| Note Writer         | Assigned interviewer | Open workspace → AI Tools → Generate notes, during or after an interview                                |
| Evaluation          | Assigned interviewer | Open workspace → AI Tools → Generate interview report, after completion                                 |

The live room also retains its existing AI controls. AI Tools remains accessible after an interview finishes. Follow-ups can be reviewed, proposed notes can be edited and accepted/rejected, and the generated notes timeline and evidence-backed report are displayed there.

Configure an AI provider on the backend. When REDIS_URL is absent, manually requested AI jobs execute directly and persist results and failure status. With Redis configured, requests use the background AI worker (`npm run worker` from `server`); automatic event-triggered agents also require that queue. Direct execution does not replace Redis for other platform services such as queued mail or asynchronous grading.

Candidates cannot access staff AI tools. Admins manage question generation/validation and scheduling; the assigned interviewer operates interview agents.

Verification: the real interview-agent smoke check is `node --import tsx src/test/interview-agents-check.ts` from `server`. It creates and removes its own interview fixtures and calls the configured AI provider.

### Coding wizard

Coding questions are generated one part at a time. The wizard displays only the active step, with Back/Next controls and an internally scrollable panel. Collapse the saved-drafts sidebar using its panel icon to widen the workspace. Test cases use compact expandable cards.

1. Generate the problem and its function/input/output contract from a topic and difficulty; edit and save the question.
2. Select starter languages. Each language is a separate model request. Additional requests can add or regenerate one language while preserving the others. Starters implement all input/output handling, with an empty marked core and no solution hints.
3. Choose sample/non-hidden and hidden counts, totalling 10–30 with at least one of each. The model generates distinct valid inputs, expected outputs, and edge-case descriptions; the server assigns visibility. Inputs and expected outputs can be edited together.
4. Write a solution using a saved starter, or request a solution from the model for the selected language. The proposed solution is saved separately from candidate starters. Only the marked core needs implementation.
5. Verify the saved solution against every generated input/output pair using live execution, then check starter drivers. Any mismatch blocks verification and leaves the draft unchanged; review the solution and expected answers in Test cases before retrying. No review-confirmation form is required. Expand case cards to compare expected and actual output or inspect compiler/runtime details. Edit inputs/answers or add a manual case directly in Verification, then save the cases before rerunning. Use Edit starter code or Edit solution to return to the relevant editor. Saving changes invalidates old verification; unsaved case edits block navigation. Keep 10–30 distinct cases with sample and hidden visibility. The solution may use any generated language. Additional solutions can run against the verified cases in the test runner. This checks agreement with generated answers, not independent proof of correctness. Older drafts with blank outputs must regenerate their test cases first.
6. Review and approve into the shared Question Bank. Approval cannot bypass execution verification. No brute-force checker is used.

Each model request has a stable `requestId`; retrying a failed or interrupted stage preserves completed stages. A lost-response retry reuses the same request ID rather than creating another draft. Question-contract edits clear dependent code and test inputs; subsequent changes invalidate reference verification. Existing unapproved coding drafts can be resumed in the wizard. Published questions and assessments are unchanged.

### Single-choice MCQ generation

The separate MCQ tab accepts comma-separated topics and a total count of 1–10 questions, distributed evenly across topics. MCQs have 2–6 distinct choices and one answer key; explanations are optional. Saved MCQs support independent AI review, individual approval, rejection, and batch approval. They never enter the coding wizard or use a code judge.

The MCQ generation API accepts `topics`, `questionType: "mcq"`, `difficulty`, `count`, and a resumable `requestId`. The old single-request coding generation and AI coding validation/unchecked approval paths are retired.
