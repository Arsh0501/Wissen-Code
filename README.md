# WissenCode — In-House Coding Assessment Platform

A fully working end-to-end demo of a proctored coding assessment platform with **real code compilation** via Judge0 CE.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + TypeScript + Tailwind CSS v3 |
| Code Editor | Monaco Editor (`@monaco-editor/react`) |
| Backend | Node.js + Express |
| Database | SQLite via Prisma ORM (PostgreSQL-portable) |
| Code Execution | Judge0 CE (public API) |
| Languages | Python, Java, C++, JavaScript |

## Quick Start

### Prerequisites
- Node.js 18+ installed
- npm 9+

### 1. Install Dependencies

```bash
# From the project root
cd server && npm install
cd ../client && npm install
```

### 2. Configure & Set Up Database

Create `server/.env`:

```bash
DATABASE_URL="file:./wissen.db"
PORT=4000
JUDGE0_API_URL=https://ce.judge0.com
# mock = simulated verdicts, no Judge0 calls (good for demos); live = real Judge0 execution
JUDGE_MODE=mock
```

```bash
cd server
npx prisma migrate dev
```

### 3. Seed Mock Data (Optional)

Creates 13 questions across topics (arrays, strings, stacks, DP, graphs, heaps), 5 assessments in
different states (live, scheduled/draft, closed, results-hidden) and ~23 mock candidates with graded results:

```bash
cd server
npm run db:seed          # resets the database
npm run db:verify-mock   # checks every mock test case against its Python reference solution
```

**Mock judge:** with `JUDGE_MODE=mock`, code is never executed. Unbalanced brackets → compile/runtime
error, untouched starter code (`pass`, `TODO`) → wrong answer, anything else → accepted. The admin header
shows a "Mock judge" badge while this mode is on.

### 4. Start Development Servers

**Terminal 1 — Backend (port 4000):**
```bash
cd server
npm run dev
```

**Terminal 2 — Frontend (port 3000):**
```bash
cd client
npm run dev
```

Open **http://localhost:3000** in your browser.

## How to Use

### Admin Flow
1. Go to http://localhost:3000, enter your name, select **Admin**
2. **Dashboard** (`/admin`) — KPIs, score distribution, recent activity, per-assessment stats
3. **Question Bank** (`/admin/questions`) — filter by difficulty/topic, preview, create/edit/import questions
4. **Assessments** → **New Assessment** — a 4-step flow:
   - **Details**: name, description, Markdown instructions
   - **Questions**: pick from the bank, reorder, set marks per question
   - **Configuration**: duration, passing score, open/close window, shuffle order, allowed languages, show/hide results
   - **Review**: then **Save draft** or **Publish**
5. From the list: publish/unpublish, duplicate, archive, delete, or open **Results** for per-candidate marks and pass/fail

### Candidate Flow
1. Go to http://localhost:3000
2. Enter your name, select **Candidate**, click "Continue"
3. Click **Start** on an assessment
4. You'll see the full coding exam UI:
   - Left panel: problem statement + sample I/O
   - Right panel: Monaco code editor + language selector
5. Write your solution, click **Run code** → see real compilation output
6. Click **Confirm** to mark your answer (green pill)
7. Use **Flag** to bookmark questions (orange pill)
8. Navigate between questions — your code is preserved
9. Click **Submit Test** when done → graded against ALL test cases

### Verify Grading
After submission, the evaluation screen shows:
- Score as a percentage of total marks, marks obtained, and pass/fail against the passing score
- Time taken, questions fully solved, tests passed
- Per-question marks with a test case breakdown (hidden test outputs are never revealed)
- If the admin turned off "Show results", candidates only see a submission confirmation

The timer starts only when the candidate clicks **Start Assessment**, is enforced on the server
(drafts are rejected 30s after time is up), shows warnings at 5 and 1 minute, and auto-submits at zero.

## Project Structure

```
Wissen-Code/
├── server/                 # Express + Prisma backend
│   ├── prisma/
│   │   └── schema.prisma   # Database schema (7 models)
│   ├── src/
│   │   ├── index.ts        # Express server entry
│   │   ├── prisma.ts       # Prisma client singleton
│   │   ├── seed.ts         # Database seed script
│   │   ├── routes/
│   │   │   ├── questions.ts    # Question CRUD + test cases + starter code
│   │   │   ├── assessments.ts  # Assessment CRUD
│   │   │   ├── judge.ts        # Code execution via Judge0
│   │   │   └── submissions.ts  # Submit + grade against all test cases
│   │   └── services/
│   │       └── judge0.ts       # Judge0 CE API integration
│   └── .env
│
├── client/                 # React + Vite + Tailwind frontend
│   ├── src/
│   │   ├── pages/
│   │   │   ├── LoginPage.tsx           # Role switcher
│   │   │   ├── admin/
│   │   │   │   ├── AdminDashboard.tsx  # Question bank table
│   │   │   │   ├── QuestionForm.tsx    # Create/edit questions
│   │   │   │   └── AssessmentManager.tsx # Assessment CRUD
│   │   │   └── candidate/
│   │   │       ├── ExamDashboard.tsx   # Available assessments
│   │   │       ├── AssessmentView.tsx  # THE exam page (split panel)
│   │   │       └── SubmissionResult.tsx # Post-submission scores
│   │   ├── context/AuthContext.tsx     # Mock auth
│   │   ├── services/api.ts            # Axios API client
│   │   └── types/index.ts             # TypeScript interfaces
│   └── vite.config.ts
│
└── README.md
```

## API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/questions` | GET, POST | List/create questions |
| `/api/questions/:id` | GET, PUT, DELETE | Read/update/delete question |
| `/api/questions/:id/testcases` | POST | Add test cases |
| `/api/questions/:id/starter-code` | POST | Add/update starter code |
| `/api/assessments` | GET, POST | List (admin: with stats; candidate: published + own status) / create |
| `/api/assessments/dashboard` | GET | Admin dashboard totals, score distribution, recent activity |
| `/api/assessments/:id` | GET, PUT, DELETE | Read/update/delete assessment |
| `/api/assessments/:id/duplicate` | POST | Copy an assessment as a draft |
| `/api/sessions/status/:assessmentId` | GET | Candidate's existing session (never starts the timer) |
| `/api/judge/run` | POST | Run code (Judge0 CE) |
| `/api/judge/languages` | GET | Supported languages |
| `/api/submissions` | POST | Submit & grade assessment |
| `/api/submissions/:assessmentId/:name` | GET | Get results |

## Database Schema

7 Prisma models designed for PostgreSQL portability:
- **Question** — title, statement, difficulty, tags, limits
- **StarterCode** — per-language templates (linked to Question)
- **TestCase** — input/output with sample vs hidden flag
- **Assessment** — named exam with time limit
- **AssessmentQuestion** — join table with ordering
- **Submission** — per-question answer with code + score
- **TestCaseResult** — per-test-case pass/fail

## Notes

- **Judge0 CE Rate Limits**: The public API has ~100 requests/day. For heavier use, switch to RapidAPI's free tier (add `X-RapidAPI-Key` header in `server/src/services/judge0.ts`).
- **PostgreSQL Migration**: Change `provider = "sqlite"` to `provider = "postgresql"` in `schema.prisma`, update `DATABASE_URL`, run `npx prisma migrate dev`.
- **No real auth**: Uses mock role headers (`x-role`, `x-candidate-name`). Replace with a real auth provider for production.
