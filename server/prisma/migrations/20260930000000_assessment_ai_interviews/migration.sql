-- CreateTable
CREATE TABLE "AttemptHistory" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "assessmentId" INTEGER NOT NULL,
    "candidateName" TEXT NOT NULL,
    "attempt" INTEGER NOT NULL,
    "startedAt" DATETIME NOT NULL,
    "finishedAt" DATETIME,
    "percentage" REAL NOT NULL,
    "passed" BOOLEAN NOT NULL,
    "marksObtained" REAL NOT NULL,
    "totalMarks" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Interview" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "candidateName" TEXT NOT NULL,
    "candidateEmail" TEXT NOT NULL DEFAULT '',
    "role" TEXT NOT NULL DEFAULT '',
    "jobRequirements" TEXT NOT NULL DEFAULT '',
    "candidateExperience" TEXT NOT NULL DEFAULT '',
    "skills" TEXT NOT NULL DEFAULT '[]',
    "durationMinutes" INTEGER NOT NULL DEFAULT 45,
    "scheduledAt" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'planned',
    "plan" TEXT NOT NULL DEFAULT '[]',
    "skillRatings" TEXT NOT NULL DEFAULT '[]',
    "recommendation" TEXT NOT NULL DEFAULT '',
    "summary" TEXT NOT NULL DEFAULT '',
    "interviewerId" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "InterviewQuestion" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "interviewId" INTEGER NOT NULL,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "section" TEXT NOT NULL DEFAULT '',
    "prompt" TEXT NOT NULL,
    "answer" TEXT NOT NULL DEFAULT '',
    "code" TEXT NOT NULL DEFAULT '',
    "languageId" INTEGER NOT NULL DEFAULT 71,
    "executionResult" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "aiObservations" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "InterviewQuestion_interviewId_fkey" FOREIGN KEY ("interviewId") REFERENCES "Interview" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Assessment" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "instructions" TEXT NOT NULL DEFAULT '',
    "timeLimitMinutes" INTEGER NOT NULL DEFAULT 60,
    "passingScore" INTEGER NOT NULL DEFAULT 60,
    "status" TEXT NOT NULL DEFAULT 'published',
    "startAt" DATETIME,
    "endAt" DATETIME,
    "shuffleQuestions" BOOLEAN NOT NULL DEFAULT false,
    "allowedLanguages" TEXT NOT NULL DEFAULT '[]',
    "showResults" BOOLEAN NOT NULL DEFAULT true,
    "difficulty" TEXT NOT NULL DEFAULT 'mixed',
    "topics" TEXT NOT NULL DEFAULT '[]',
    "questionTypes" TEXT NOT NULL DEFAULT '["coding"]',
    "questionCount" INTEGER,
    "shuffleOptions" BOOLEAN NOT NULL DEFAULT false,
    "maxAttempts" INTEGER NOT NULL DEFAULT 1,
    "accessMode" TEXT NOT NULL DEFAULT 'anyone',
    "allowedEmails" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Assessment" ("allowedLanguages", "createdAt", "description", "endAt", "id", "instructions", "name", "passingScore", "showResults", "shuffleQuestions", "startAt", "status", "timeLimitMinutes", "updatedAt") SELECT "allowedLanguages", "createdAt", "description", "endAt", "id", "instructions", "name", "passingScore", "showResults", "shuffleQuestions", "startAt", "status", "timeLimitMinutes", "updatedAt" FROM "Assessment";
DROP TABLE "Assessment";
ALTER TABLE "new_Assessment" RENAME TO "Assessment";
CREATE TABLE "new_AssessmentSession" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "assessmentId" INTEGER NOT NULL,
    "candidateName" TEXT NOT NULL,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" DATETIME,
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "questionIds" TEXT NOT NULL DEFAULT '',
    CONSTRAINT "AssessmentSession_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_AssessmentSession" ("assessmentId", "candidateName", "finishedAt", "id", "startedAt") SELECT "assessmentId", "candidateName", "finishedAt", "id", "startedAt" FROM "AssessmentSession";
DROP TABLE "AssessmentSession";
ALTER TABLE "new_AssessmentSession" RENAME TO "AssessmentSession";
CREATE UNIQUE INDEX "AssessmentSession_assessmentId_candidateName_key" ON "AssessmentSession"("assessmentId", "candidateName");
CREATE TABLE "new_Question" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "title" TEXT NOT NULL,
    "statement" TEXT NOT NULL,
    "difficulty" TEXT NOT NULL,
    "tags" TEXT NOT NULL DEFAULT '[]',
    "timeLimit" REAL NOT NULL DEFAULT 2,
    "memoryLimit" INTEGER NOT NULL DEFAULT 256000,
    "type" TEXT NOT NULL DEFAULT 'coding',
    "options" TEXT NOT NULL DEFAULT '[]',
    "correctOptions" TEXT NOT NULL DEFAULT '[]',
    "explanation" TEXT NOT NULL DEFAULT '',
    "topic" TEXT NOT NULL DEFAULT '',
    "skills" TEXT NOT NULL DEFAULT '[]',
    "source" TEXT NOT NULL DEFAULT 'manual',
    "status" TEXT NOT NULL DEFAULT 'active',
    "validation" TEXT NOT NULL DEFAULT '',
    "referenceSolution" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Question" ("createdAt", "difficulty", "id", "memoryLimit", "statement", "tags", "timeLimit", "title", "updatedAt") SELECT "createdAt", "difficulty", "id", "memoryLimit", "statement", "tags", "timeLimit", "title", "updatedAt" FROM "Question";
DROP TABLE "Question";
ALTER TABLE "new_Question" RENAME TO "Question";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "AttemptHistory_assessmentId_candidateName_idx" ON "AttemptHistory"("assessmentId", "candidateName");

-- CreateIndex
CREATE INDEX "InterviewQuestion_interviewId_idx" ON "InterviewQuestion"("interviewId");

