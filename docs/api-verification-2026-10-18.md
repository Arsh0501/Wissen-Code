# Assessment and interview API verification

Checked locally on 18 October 2026 against PostgreSQL and the running API on port 4001. Temporary smoke-test users, assessments, questions, interviews and AI drafts were removed by the check scripts. These checks establish the behavior of the exercised paths, not exhaustive coverage of every possible request or production configuration.

## Results

| Area | Result |
| --- | --- |
| Backend automated tests | 54 passed across the full suite and the additional assessment-management test; two Redis integration tests skipped |
| Frontend automated tests | 85 passed |
| Client production build | Passed |
| Assessment management | Create, fetch, publish, duplicate, archive, delete; invalid input and candidate permission rejection passed |
| Assessment invitations | Create, list and revoke passed |
| Assessment attempts | Ownership, concurrent starts, retake limits, drafts, submit, MCQ, rubric review, accommodations and result redaction passed |
| Live code execution | Python, JavaScript, Java, C++ and SQL passed; correct/incorrect answers, hidden cases, SQL isolation and weighted grading passed |
| Assessment AI | Real Groq question generation and validation passed; final generated reference solution passed all four configured test cases |
| Interview scheduling | Assignment, rescheduling, cancellation, start windows, expiration, extensions, feedback timing and dashboard visibility passed |
| Interview resume/questions | PDF access restrictions, PDF text extraction, unreadable PDF errors, resume questions, bank questions and prestart question editing passed |
| Interview collaboration | Socket assignment, reconnect/rejoin, private notes, conflicting edits, revoked access, sample runs and hidden-case privacy passed |
| Interview AI | Real resume generation, plan generation and evidence-backed observations passed for an assigned interviewer |
| Reports | Report JSON, CSV and PDF returned HTTP 200; final PDF response was application/pdf, 121001 bytes |
| Role checks | Admin, interviewer and candidate smoke checks returned expected success/denial responses |
| Queued AI/background grading | Not verified end to end: Redis is not configured; queued AI returns 503. Synchronous grading is enabled and was verified |
| Readiness | Health returns 200/live; readiness returns 503 because Redis is unavailable |

## Repairs made

- Assigned interviewers can access interview planning/evaluation and their AI-job APIs. Ownership checks remain in place; bank question generation/validation remains admin-only.
- AI validation sends a bounded set of nearby question comparisons instead of the entire bank. Exact normalized duplicate checks still examine all loaded bank questions and drafts. Semantic comparisons use the retrieved subset.
- Candidate report PDF download uses the shared authenticated API client.
- Removed TypeScript build errors in interview components, tests and routes.
- Redis integration tests explicitly skip when Redis is not configured, avoiding indefinite retries against localhost.

AI can still produce a draft with incorrect reference code. One generated draft was correctly rejected after real execution failed; a later draft validated successfully. Successful generation does not bypass validation or approval.

## Repeatable live checks

From `server`, use `node --import tsx src/test/api-live-check.ts` for roles and real AI calls, `node --import tsx src/test/ai-validation-check.ts` for detailed reference validation, and `node --import tsx src/test/report-api-check.ts` for report downloads. These call the configured providers and create temporary fixtures. Run the normal API server first.

From the repository root, `node scripts/verify-execution.mjs` checks the configured live execution service and grading with temporary fixtures.
