# Wissen-Code Complete API Reference & Testing Guide

> **Base URL:** `http://localhost:4000`  
> **WebSocket (Socket.IO) URL:** `ws://localhost:4000` (or `http://localhost:4000`)  
> **Authentication Header:** `Authorization: Bearer <JWT_TOKEN>`  
> **Default Admin Account:** Email: `admin@wissen.dev` | Password: `Admin@123`

---

## Table of Contents
1. [Authentication & Profile APIs](#1-authentication--profile-apis)
2. [Questions Bank APIs](#2-questions-bank-apis)
3. [Admin Question Markdown Import & Export APIs](#3-admin-question-markdown-import--export-apis)
4. [Assessment Management APIs](#4-assessment-management-apis)
5. [Assessment Attempts & Proctoring APIs](#5-assessment-attempts--proctoring-apis)
6. [Assessment Submissions & Grading APIs](#6-assessment-submissions--grading-apis)
7. [Shareable Invites & Guest Access APIs](#7-shareable-invites--guest-access-apis)
8. [Admin Reports, Analytics & PDF Export APIs](#8-admin-reports-analytics--pdf-export-apis)
9. [Judge0 Code Execution APIs](#9-judge0-code-execution-apis)
10. [AI Agents (DSA Generation & Resume Parsing) APIs](#10-ai-agents-dsa-generation--resume-parsing-apis)
11. [Live Technical Interviews (REST APIs)](#11-live-technical-interviews-rest-apis)
12. [Live Technical Interviews (Socket.IO Realtime WebSocket APIs)](#12-live-technical-interviews-socketio-realtime-websocket-apis)
13. [End-to-End Postman & cURL Testing Walkthrough](#13-end-to-end-postman--curl-testing-walkthrough)

---

## 1. Authentication & Profile APIs

### 1.1 Register New User
- **Method & Route:** `POST /api/auth/register`
- **Access:** Public (No Token Required)
- **Request Body:**
  ```json
  {
    "name": "Jane Doe",
    "email": "jane@example.com",
    "password": "Password@123",
    "role": "candidate" // or "admin"
  }
  ```
- **Response (201 Created):**
  ```json
  {
    "token": "eyJhbGciOi...",
    "user": {
      "id": 2,
      "email": "jane@example.com",
      "name": "Jane Doe",
      "role": "candidate"
    }
  }
  ```

### 1.2 Login User
- **Method & Route:** `POST /api/auth/login`
- **Access:** Public
- **Request Body:**
  ```json
  {
    "email": "admin@wissen.dev",
    "password": "Admin@123"
  }
  ```
- **Response (200 OK):**
  ```json
  {
    "token": "eyJhbGciOi...",
    "user": {
      "id": 1,
      "email": "admin@wissen.dev",
      "name": "Admin",
      "role": "admin"
    }
  }
  ```

### 1.3 Get Current User Profile
- **Method & Route:** `GET /api/auth/me` (or `GET /api/profile`)
- **Access:** Authenticated (Bearer Token)
- **Response (200 OK):**
  ```json
  {
    "user": {
      "id": 1,
      "email": "admin@wissen.dev",
      "name": "Admin",
      "role": "admin",
      "bio": null,
      "avatar": null
    }
  }
  ```

### 1.4 Update User Profile
- **Method & Route:** `PUT /api/profile`
- **Access:** Authenticated (Bearer Token)
- **Request Body:**
  ```json
  {
    "name": "Jane Updated",
    "bio": "Senior Software Engineer",
    "avatar": "https://example.com/avatar.png"
  }
  ```
- **Response (200 OK):** Updated user object.

---

## 2. Questions Bank APIs

### 2.1 List All Questions
- **Method & Route:** `GET /api/questions`
- **Access:** Authenticated
- **Query Params:**
  - `search` *(optional)*: Filter by title substring
  - `difficulty` *(optional)*: `easy` | `medium` | `hard`
  - `tag` *(optional)*: Filter by tag (e.g. `Arrays`, `Dynamic Programming`)
- **Response (200 OK):** Array of questions with count of test cases and starter codes.

### 2.2 Get Question by ID
- **Method & Route:** `GET /api/questions/:id`
- **Access:** Authenticated
- **Behavior:** Candidates receive sample test cases only; Admins receive both sample and hidden test cases.
- **Response (200 OK):** Full question object with starter codes and test cases.

### 2.3 Create Question
- **Method & Route:** `POST /api/questions`
- **Access:** Admin Only
- **Request Body:**
  ```json
  {
    "title": "Reverse Linked List",
    "statement": "Given the head of a singly linked list, reverse the list...",
    "difficulty": "easy",
    "tags": ["Linked List", "Recursion"],
    "timeLimit": 2,
    "memoryLimit": 256000,
    "starterCodes": [
      {
        "languageId": 71,
        "languageName": "Python",
        "code": "def reverseList(head):\n    pass"
      }
    ],
    "testCases": [
      {
        "input": "[1,2,3,4,5]",
        "expectedOutput": "[5,4,3,2,1]",
        "isSample": true
      },
      {
        "input": "[]",
        "expectedOutput": "[]",
        "isSample": false
      }
    ]
  }
  ```
- **Response (201 Created):** Created question with relations.

---

## 3. Admin Question Markdown Import & Export APIs

### 3.1 Export Question to Markdown File
- **Method & Route:** `GET /api/admin/questions/:id/export-md`
- **Access:** Admin Only
- **Response (200 OK):** Returns downloaded `.md` file with formatted headers, problem statement, sample/hidden test cases, and starter code.

### 3.2 Import Question from Markdown
- **Method & Route:** `POST /api/admin/questions/import-md`
- **Access:** Admin Only
- **Request Body:**
  ```json
  {
    "markdownContent": "# Two Sum\n\n**Difficulty:** Easy\n**Tags:** Arrays, Hash Table\n**CPU Time Limit (seconds):** 2\n**Memory Limit (KB):** 256000\n\n## Problem Statement\n\nGiven an array of integers...\n\n## Sample Test Cases\n\n### Sample 1\n**Input:**\n```\n[2,7,11,15]\n9\n```\n**Output:**\n```\n[0,1]\n```\n\n## Starter Code\n\n### Python\n```python\ndef twoSum(nums, target):\n    pass\n```"
  }
  ```
- **Response (200 OK):** Parsed question data ready to review/save.

---

## 4. Assessment Management APIs

### 4.1 Admin Assessment Dashboard Overview
- **Method & Route:** `GET /api/assessments/dashboard`
- **Access:** Admin Only
- **Response (200 OK):** Aggregated metrics: total assessments, published count, score distributions, and 20 recent candidate activity sessions.

### 4.2 List Assessments
- **Method & Route:** `GET /api/assessments`
- **Access:** Authenticated
- **Behavior:**
  - **Admin:** Receives all drafts, published, and archived assessments with pass rates and completion stats.
  - **Candidate:** Receives open published assessments and tests they have already taken.

### 4.3 Create Assessment
- **Method & Route:** `POST /api/assessments`
- **Access:** Admin Only
- **Request Body:**
  ```json
  {
    "name": "Backend Engineer Screening",
    "description": "90-minute screening test covering DSA and backend problem solving",
    "instructions": "No external compilers allowed. Three tab switches will auto-submit.",
    "timeLimitMinutes": 90,
    "passingScore": 70,
    "status": "draft",
    "startAt": "2026-10-15T10:00:00.000Z",
    "endAt": "2026-10-20T18:00:00.000Z",
    "shuffleQuestions": true,
    "showResults": true,
    "allowedLanguages": [71, 63, 62],
    "questions": [
      { "questionId": 14, "marks": 50 },
      { "questionId": 15, "marks": 50 }
    ]
  }
  ```
- **Response (201 Created):** Created assessment object.

### 4.4 Get Single Assessment Details
- **Method & Route:** `GET /api/assessments/:id`
- **Access:** Authenticated

### 4.5 Start Assessment Session
- **Method & Route:** `POST /api/assessments/:id/start`
- **Access:** Authenticated (Candidate or Admin)
- **Response (200 OK):**
  ```json
  {
    "sessionId": 12,
    "startedAt": "2026-10-13T13:30:00.000Z",
    "finishedAt": null,
    "timeLimitMinutes": 90,
    "remainingSeconds": 5400,
    "isFinished": false,
    "drafts": [],
    "tabSwitchCount": 0,
    "tabSwitchLimit": 3
  }
  ```

### 4.6 Update Assessment
- **Method & Route:** `PUT /api/assessments/:id`
- **Access:** Admin Only

### 4.7 Duplicate Assessment
- **Method & Route:** `POST /api/assessments/:id/duplicate`
- **Access:** Admin Only

### 4.8 Delete Assessment
- **Method & Route:** `DELETE /api/assessments/:id`
- **Access:** Admin Only

### 4.9 List Assessment Candidate Results
- **Method & Route:** `GET /api/assessments/:id/candidates`
- **Access:** Admin Only

---

## 5. Assessment Attempts & Proctoring APIs

### 5.1 Check Candidate Session Status
- **Method & Route:** `GET /api/attempts/status/:assessmentId`
- **Access:** Authenticated
- **Response (200 OK):** Checks if the candidate already has an active or completed attempt without creating a new one.

### 5.2 Get Attempt Details
- **Method & Route:** `GET /api/attempts/:id`
- **Access:** Authenticated

### 5.3 Upsert Question Draft Answer
- **Method & Route:** `PUT /api/attempts/:id/answer`
- **Access:** Authenticated
- **Request Body:**
  ```json
  {
    "questionId": 14,
    "languageId": 71,
    "languageName": "Python",
    "code": "def solution():\n    return True",
    "isFlagged": false,
    "isAnswered": true
  }
  ```

### 5.4 Batch Save Drafts
- **Method & Route:** `POST /api/attempts/:id/save-all-drafts`
- **Access:** Authenticated

### 5.5 Record Tab Switch Event (Anti-Cheating)
- **Method & Route:** `POST /api/attempts/:id/tab-switch`
- **Access:** Authenticated
- **Request Body:**
  ```json
  {
    "leftAt": "2026-10-13T13:35:10.000Z",
    "durationMs": 4200
  }
  ```
- **Response (200 OK):** Returns `{ count, limit: 3, autoSubmitted: boolean }`. If count reaches 3, the exam is automatically submitted and graded!

### 5.6 Record Code Paste Event (Anti-Cheating)
- **Method & Route:** `POST /api/attempts/:id/paste`
- **Access:** Authenticated
- **Request Body:**
  ```json
  {
    "questionId": 14,
    "charCount": 350,
    "lineCount": 18
  }
  ```

### 5.7 Finalize & Submit Entire Assessment
- **Method & Route:** `POST /api/attempts/:id/submit`
- **Access:** Authenticated
- **Response (200 OK):** Grades all saved draft answers against all test cases (sample + hidden) and marks session as `finishedAt`.

---

## 6. Assessment Submissions & Grading APIs

### 6.1 Direct Submit & Grade
- **Method & Route:** `POST /api/submissions`
- **Access:** Authenticated
- **Request Body:**
  ```json
  {
    "assessmentId": 1,
    "candidateName": "Jane Doe",
    "answers": [
      {
        "questionId": 14,
        "languageId": 71,
        "languageName": "Python",
        "code": "def twoSum(nums, target):\n    lookup = {}\n    for i, num in enumerate(nums):\n        if target - num in lookup:\n            return [lookup[target - num], i]\n        lookup[num] = i\n    return []"
      }
    ]
  }
  ```

### 6.2 Get Candidate Assessment Evaluation
- **Method & Route:** `GET /api/submissions/:assessmentId/:candidateName`
- **Access:** Authenticated (Admins, or Candidate requesting their own)

---

## 7. Shareable Invites & Guest Access APIs

### 7.1 Admin: List Invites for Assessment
- **Method & Route:** `GET /api/invites?assessmentId=1`
- **Access:** Admin Only

### 7.2 Admin: Create Shareable Invite Link
- **Method & Route:** `POST /api/invites`
- **Access:** Admin Only
- **Request Body:**
  ```json
  {
    "assessmentId": 1,
    "label": "Campus Drive 2026",
    "maxUses": 50,
    "expiresAt": "2026-10-25T23:59:59.000Z"
  }
  ```

### 7.3 Admin: Revoke Invite Link
- **Method & Route:** `POST /api/invites/:id/revoke`
- **Access:** Admin Only

### 7.4 Public: Check Invite Link Details
- **Method & Route:** `GET /api/public/invite/:token`
- **Access:** Public (No Token Required)

### 7.5 Public: Guest Join Assessment via Invite
- **Method & Route:** `POST /api/public/invite/:token/join`
- **Access:** Public
- **Request Body:**
  ```json
  {
    "name": "Alex Mercer",
    "email": "alex.mercer@gmail.com"
  }
  ```
- **Response (200 OK):** Returns a signed guest JWT token and assessment details so the candidate can start immediately without manual signup!

---

## 8. Admin Reports, Analytics & PDF Export APIs

### 8.1 List Assessment Submissions Summary
- **Method & Route:** `GET /api/admin/reports/submissions/:assessmentId`
- **Access:** Admin Only

### 8.2 Export Assessment Results as CSV (Excel Compatible)
- **Method & Route:** `GET /api/admin/reports/export/:assessmentId`
- **Access:** Admin Only
- **Response (200 OK):** Streams downloadable CSV file with rank, candidate email, score %, tab switches, paste events, and per-question marks.

### 8.3 Get Candidate Detailed Assessment Report Data
- **Method & Route:** `GET /api/admin/reports/:candidateName/:assessmentId/data`
- **Access:** Admin Only

### 8.4 Generate & Download Confidential Candidate PDF Report
- **Method & Route:** `GET /api/admin/reports/:candidateName/:assessmentId/download`
- **Access:** Admin Only
- **Response (200 OK):** Uses headless Puppeteer to generate an A4 PDF report with performance charts, code diffs, and anti-cheating audit logs.

### 8.5 Get Candidate Report Alias
- **Method & Route:** `GET /api/candidates/:id/report?assessmentId=1`
- **Access:** Admin Only

---

## 9. Judge0 Code Execution APIs

### 9.1 Run Code with Custom Stdin
- **Method & Route:** `POST /api/judge/run`
- **Access:** Authenticated
- **Request Body:**
  ```json
  {
    "sourceCode": "print(int(input()) * 2)",
    "languageId": 71,
    "stdin": "21"
  }
  ```
- **Response (200 OK):**
  ```json
  {
    "stdout": "42\n",
    "stderr": "",
    "compileOutput": "",
    "statusId": 3,
    "statusDescription": "Accepted",
    "executionTime": "0.021",
    "memoryUsed": 7432,
    "isError": false
  }
  ```

### 9.2 Test Code Against Sample Cases
- **Method & Route:** `POST /api/judge/run-tests`
- **Access:** Authenticated
- **Request Body:**
  ```json
  {
    "questionId": 14,
    "sourceCode": "def twoSum(nums, target):\n    return [0, 1]",
    "languageId": 71
  }
  ```

### 9.3 Get Supported Programming Languages
- **Method & Route:** `GET /api/judge/languages`
- **Access:** Authenticated
- **Response (200 OK):** List of languages: Python (71), JavaScript (63), C++ (54), Java (62), TypeScript (74), Go (60).

---

## 10. AI Agents (DSA Generation & Resume Parsing) APIs

### 10.1 Generate DSA Assessment Question
- **Method & Route:** `POST /api/agents/generate-question`
- **Access:** Authenticated
- **Request Body:**
  ```json
  {
    "topic": "Binary Search",
    "difficulty": "medium",
    "questionType": "Coding",
    "skills": ["Algorithms", "Arrays"],
    "experienceLevel": "mid"
  }
  ```

### 10.2 Generate Resume-Based Technical Questions
- **Method & Route:** `POST /api/agents/generate-resume-questions`
- **Access:** Authenticated
- **Request Body:**
  ```json
  {
    "resume": "Experienced Full Stack Engineer with 4 years building Node.js microservices and React apps...",
    "jobRole": "Senior Backend Engineer",
    "experienceLevel": "senior",
    "skills": ["Node.js", "PostgreSQL", "Kafka"]
  }
  ```

### 10.3 Upload & Parse Resume PDF
- **Method & Route:** `POST /api/agents/upload-resume-pdf`
- **Access:** Authenticated
- **Content-Type:** `multipart/form-data`
- **Form Field:** `resume` (PDF file, max 10MB)

### 10.4 One-Click Generate Questions from Resume PDF
- **Method & Route:** `POST /api/agents/generate-from-resume-file`
- **Access:** Authenticated
- **Content-Type:** `multipart/form-data`
- **Form Fields:** `resume` (PDF file), `targetType` (`interview` or `assessment`), `jobRole` *(optional)*.

---

## 11. Live Technical Interviews (REST APIs)

### 11.1 Public Candidate Room Resolver
- **Method & Route:** `GET /api/public/interview/:roomToken` (or `GET /api/interviews/room/:roomToken`)
- **Access:** Public (Protected by random 32-char hex `roomToken`)
- **Response (200 OK):** Sanitized room configuration, active question, time limit, interviewer name, and initial code.

### 11.2 List Interviews
- **Method & Route:** `GET /api/interviews`
- **Access:** Admin/Interviewer Only

### 11.3 Create Live Interview Session
- **Method & Route:** `POST /api/interviews`
- **Access:** Admin/Interviewer Only
- **Request Body:**
  ```json
  {
    "title": "Senior Frontend Interview - Alex Mercer",
    "description": "Technical round covering React and Algorithms",
    "candidateName": "Alex Mercer",
    "candidateEmail": "alex.mercer@gmail.com",
    "scheduledAt": "2026-10-14T15:00:00.000Z",
    "timeLimitMinutes": 60,
    "questionIds": [14, 15],
    "currentLanguageId": 71
  }
  ```
- **Response (201 Created):**
  ```json
  {
    "success": true,
    "interview": {
      "id": 5,
      "title": "Senior Frontend Interview - Alex Mercer",
      "roomToken": "b76e2157dbbb1ae6f43cf3c6ffd85c5f",
      "status": "pending",
      "currentQuestionId": 14
    },
    "candidateJoinUrl": "/interview/b76e2157dbbb1ae6f43cf3c6ffd85c5f"
  }
  ```

### 11.4 Get Interview Details
- **Method & Route:** `GET /api/interviews/:id`
- **Access:** Admin/Interviewer Only

### 11.5 Start Interview Session
- **Method & Route:** `POST /api/interviews/:id/start`
- **Access:** Admin/Interviewer Only
- **Action:** Updates status to `in_progress`, broadcasts `INTERVIEW_STARTED` to WebSocket room.

### 11.6 End Interview Session
- **Method & Route:** `POST /api/interviews/:id/end`
- **Access:** Admin/Interviewer Only
- **Action:** Flushes pending in-memory code to DB, sets status to `completed`, broadcasts `INTERVIEW_ENDED`.

### 11.7 Switch Active Question
- **Method & Route:** `PUT /api/interviews/:id/current-question`
- **Access:** Admin/Interviewer Only
- **Request Body:** `{ "questionId": 15 }`

### 11.8 Execute Live Interview Code (Run Code)
- **Method & Route:** `POST /api/interviews/:id/execute`
- **Access:** Authenticated / Interview Participant
- **Request Body:**
  ```json
  {
    "code": "print('Testing code')",
    "languageId": 71,
    "stdin": ""
  }
  ```

### 11.9 Submit & Grade Interview Code
- **Method & Route:** `POST /api/interviews/:id/submit`
- **Access:** Authenticated / Interview Participant
- **Request Body:**
  ```json
  {
    "code": "def twoSum(nums, target):\n    return [0, 1]",
    "languageId": 71,
    "questionId": 14
  }
  ```

### 11.10 Add Interviewer Evaluation Note
- **Method & Route:** `POST /api/interviews/:id/notes`
- **Access:** Admin/Interviewer Only
- **Request Body:**
  ```json
  {
    "category": "problem-solving",
    "rating": 5,
    "content": "Strong algorithmic thinking; proposed optimal O(n) solution immediately.",
    "isPrivate": true
  }
  ```

### 11.11 Get All Evaluation Notes
- **Method & Route:** `GET /api/interviews/:id/notes`
- **Access:** Admin/Interviewer Only

### 11.12 Delete Interview
- **Method & Route:** `DELETE /api/interviews/:id`
- **Access:** Admin/Interviewer Only

---

## 12. Live Technical Interviews (Socket.IO Realtime WebSocket APIs)

The real-time collaboration server runs at `ws://localhost:4000` with automatic room joining:
- Room Name Pattern: `room:interview:<interviewId>`

### 12.1 Handshake & Authentication
You can connect as either an **Interviewer** or a **Guest Candidate**:
- **Candidate Connection:**
  - URL Query: `http://localhost:4000?roomToken=<ROOM_TOKEN>`
  - Auth Object: `{ "roomToken": "<ROOM_TOKEN>", "candidateName": "Alex Mercer" }`
- **Interviewer Connection:**
  - URL Query: `http://localhost:4000?token=<JWT_TOKEN>`
  - Auth Object: `{ "token": "<JWT_TOKEN>", "interviewId": 5 }`

---

### 12.2 Real-Time Event Catalogue

| Event Sent (Client -> Server) | Broadcast Event (Server -> Room) | Who Triggers? | Description |
|---|---|---|---|
| `JOIN_INTERVIEW` | `CANDIDATE_JOINED` / `INTERVIEWER_JOINED` | Candidate or Interviewer | Joins interview room; server responds with `SYNC_STATE` containing code, active question, and timer. |
| `START_INTERVIEW` | `INTERVIEW_STARTED` | Interviewer | Begins the interview timer. |
| `CHANGE_QUESTION` | `QUESTION_CHANGED` | Interviewer | Switches active problem statement & loads starter code. |
| `UPDATE_CODE` or `CODE_CHANGED` | `CODE_CHANGED` | Candidate or Interviewer | Dual-editing keystroke sync. Dispatched at 0ms delay to peer; auto-debounced to PostgreSQL every 2 seconds. |
| `EXECUTE_CODE` or `CODE_EXECUTED` | `CODE_EXECUTING` -> `CODE_EXECUTED` | Either | Runs code against sample input in sandboxed Judge0. |
| `SUBMIT_CODE` or `CODE_SUBMITTED` | `CODE_SUBMITTING` -> `CODE_SUBMITTED` | Either | Grades code against all test cases and stores `InterviewSubmission`. |
| `ADD_NOTE` | `NOTE_ADDED` | Interviewer | Records private evaluation note (score 1-5, category, text). |
| `END_INTERVIEW` | `INTERVIEW_ENDED` | Interviewer | Flushes code to DB and concludes interview. |

---

## 13. End-to-End Postman & cURL Testing Walkthrough

### Step 1: Login as Admin to get JWT Token
```bash
curl -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@wissen.dev","password":"Admin@123"}'
```
*Save the returned `token` as `{{token}}`.*

---

### Step 2: Create a New Live Interview
```bash
curl -X POST http://localhost:4000/api/interviews \
  -H "Authorization: Bearer {{token}}" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Full Stack Live Coding - Sarah Connor",
    "candidateName": "Sarah Connor",
    "candidateEmail": "sarah@sky.net",
    "timeLimitMinutes": 45,
    "questionIds": [14],
    "currentLanguageId": 71
  }'
```
*Take note of the returned `id` (e.g. `5`) and `roomToken` (e.g. `b76e2157dbbb1ae6f43cf3c6ffd85c5f`).*

---

### Step 3: Test Candidate Public Room Info
```bash
curl -X GET http://localhost:4000/api/public/interview/b76e2157dbbb1ae6f43cf3c6ffd85c5f
```

---

### Step 4: Test in Postman Socket.IO

1. Open Postman -> Click **New** -> Select **Socket.IO**.
2. **Tab 1: Candidate Tab**
   - URL: `http://localhost:4000`
   - Under **Params** tab: Add `roomToken` = `b76e2157dbbb1ae6f43cf3c6ffd85c5f`
   - Under **Events** tab: Add listener for `SYNC_STATE`, `INTERVIEW_STARTED`, `QUESTION_CHANGED`, `CODE_CHANGED`, `CODE_EXECUTED`, `CODE_SUBMITTED`, `INTERVIEW_ENDED`.
   - Click **Connect**.
3. **Tab 2: Interviewer Tab**
   - URL: `http://localhost:4000`
   - Under **Headers** tab: Add `Authorization` = `Bearer {{token}}`
   - Under **Events** tab: Add listener for `CANDIDATE_JOINED`, `CODE_CHANGED`, `CODE_EXECUTED`, `CODE_SUBMITTED`, `NOTE_ADDED`.
   - Click **Connect**.
4. **Send Realtime Code Edit from Candidate Tab:**
   - Event Name: `UPDATE_CODE`
   - Message Body:
     ```json
     {
       "interviewId": 5,
       "code": "def twoSum(nums, target):\n    # Hello from Candidate!\n    return [0, 1]",
       "languageId": 71
     }
     ```
   - Click **Send**.
   - Inspect **Interviewer Tab**: The event `CODE_CHANGED` arrives instantly!
5. **Run Code from Candidate Tab:**
   - Event Name: `EXECUTE_CODE`
   - Message Body:
     ```json
     {
       "interviewId": 5,
       "code": "print(10 + 20)",
       "languageId": 71
     }
     ```
   - Click **Send**.
   - Both Candidate and Interviewer receive `CODE_EXECUTED` with `stdout: "30\n"`.
