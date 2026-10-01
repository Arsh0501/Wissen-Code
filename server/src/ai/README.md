# AI backend integration

The frontend never calls an AI vendor. It calls our own `/api/ai/*` endpoints (admin only), which
validate every request against the schemas in `contract.ts` and delegate to an `AIProvider`.

Until the real backend is connected, `standin.ts` serves realistic, deterministic responses so every
workflow works end to end. Its coding questions have verified test cases.

## Connecting the real provider (e.g. OpenAI)

1. Create `openai.ts` that exports an object implementing `AIProvider` from `provider.ts`:
   - `generateQuestions(req)` → `GeneratedQuestion[]`
   - `reviewQuestion(q)` → `AIQuestionReview` (correctness, ambiguity, assessed difficulty, missing edge cases)
   - `planInterview(req)` → `{ sections, rationale }`
   - `observe(req)` → `Observation[]`. Every observation must quote verbatim evidence from the inputs.
2. Use structured outputs with the zod schemas in `contract.ts` so responses match the contract exactly.
3. Register it in `getAIProvider()` in `provider.ts` (e.g. when `AI_PROVIDER=openai`), and keep the key
   in `server/.env` (never in the client).

Nothing else changes: routes re-validate generated questions against the contract, drop observations
without evidence, and map provider errors to user-facing messages.

## Endpoints

| Endpoint | Request | Response |
|---|---|---|
| `GET /api/ai/status` | none | `{ provider, canRunCode }` |
| `POST /api/ai/questions/generate` | `GenerateQuestionsRequest` | `{ questions: GeneratedQuestion[], provider }` |
| `POST /api/ai/questions/validate` | `{ questions: GeneratedQuestion[] }` | `{ reports: ValidationReport[] }` |
| `POST /api/ai/interviews/plan` | `InterviewPlanRequest` | `{ sections: PlanSection[], rationale, provider }` |
| `POST /api/ai/interviews/observations` | `ObservationsRequest` | `{ observations: Observation[], provider }` |

Validation (`validation.ts`) combines deterministic checks run here with the provider's judgement.
The deterministic checks are duplicate detection against the bank, test-case and answer-key
integrity, and running the reference solution through the judge when `JUDGE_MODE=live`.

AI-generated questions enter the bank only through `/api/question-review/*`. They are saved as
`pending_review`, and approval re-validates on the server and refuses questions that fail.
