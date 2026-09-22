# Wissen Code — In-House Coding Assessment Platform

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

### 2. Set Up Database

```bash
cd server
npx prisma generate
npx prisma migrate dev --name init
```

### 3. Seed Sample Data (Optional)

Creates 3 sample questions (Two Sum, Fizz Buzz, Reverse String) and a "TCS Assessment 2021":

```bash
cd server
npx tsx src/seed.ts
```

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
1. Go to http://localhost:3000
2. Enter your name, select **Admin**, click "Continue"
3. Click **"New Question"** to create a question:
   - Fill in title, problem statement (Markdown), difficulty, tags
   - Switch to **Test Cases** tab: add sample (visible) and hidden test cases
   - Switch to **Starter Code** tab: write starter code per language
   - Click **Save Question**
4. Go to **Assessments** → **New Assessment**
   - Name it, set time limit, select questions
   - Click **Create Assessment**

### Examinee Flow
1. Go to http://localhost:3000
2. Enter your name, select **Examinee**, click "Continue"
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
After submission, the results page shows:
- Overall score percentage
- Per-question pass/fail with test case breakdown
- Hidden test cases are graded but never revealed

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
│   │   │   └── examinee/
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
| `/api/assessments` | GET, POST | List/create assessments |
| `/api/assessments/:id` | GET, PUT, DELETE | Read/update/delete assessment |
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
