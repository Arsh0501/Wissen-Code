-- AlterTable
ALTER TABLE "Assessment" ADD COLUMN     "allowedDomains" TEXT NOT NULL DEFAULT '[]',
ADD COLUMN     "allowedEmails" TEXT NOT NULL DEFAULT '[]',
ADD COLUMN     "difficulty" TEXT NOT NULL DEFAULT 'mixed',
ADD COLUMN     "maxAttempts" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "questionCount" INTEGER,
ADD COLUMN     "questionTypes" TEXT NOT NULL DEFAULT '["coding"]',
ADD COLUMN     "requiredSkills" TEXT NOT NULL DEFAULT '[]',
ADD COLUMN     "topics" TEXT NOT NULL DEFAULT '[]';

-- AlterTable
ALTER TABLE "AssessmentSession" ADD COLUMN     "attemptNumber" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "candidateUserId" INTEGER;

-- AlterTable
ALTER TABLE "InterviewQuestion" ADD COLUMN     "candidateAnswer" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "Question" ADD COLUMN     "questionType" TEXT NOT NULL DEFAULT 'coding';

-- AlterTable
ALTER TABLE "Submission" ADD COLUMN     "sessionId" INTEGER;

-- CreateTable
CREATE TABLE "AIQuestionDraft" (
    "id" SERIAL NOT NULL,
    "authorId" INTEGER NOT NULL,
    "content" JSONB NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "validation" JSONB,
    "validatedRevision" INTEGER,
    "approvedBy" INTEGER,
    "approvedAt" TIMESTAMP(3),
    "questionId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AIQuestionDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InterviewPlan" (
    "id" SERIAL NOT NULL,
    "interviewId" INTEGER NOT NULL,
    "jobRequirements" TEXT NOT NULL,
    "candidateExperience" TEXT NOT NULL,
    "requiredSkills" JSONB NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "sections" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InterviewPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InterviewEvaluation" (
    "id" SERIAL NOT NULL,
    "interviewId" INTEGER NOT NULL,
    "questionId" INTEGER NOT NULL,
    "authorId" INTEGER NOT NULL,
    "candidateAnswer" TEXT NOT NULL DEFAULT '',
    "candidateCode" TEXT NOT NULL DEFAULT '',
    "executionResults" JSONB NOT NULL,
    "notes" TEXT NOT NULL DEFAULT '',
    "skills" JSONB NOT NULL,
    "observations" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "revision" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InterviewEvaluation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AIQuestionDraft_questionId_key" ON "AIQuestionDraft"("questionId");

-- CreateIndex
CREATE UNIQUE INDEX "InterviewPlan_interviewId_key" ON "InterviewPlan"("interviewId");

-- CreateIndex
CREATE UNIQUE INDEX "InterviewEvaluation_interviewId_questionId_authorId_key" ON "InterviewEvaluation"("interviewId", "questionId", "authorId");

-- CreateIndex
CREATE UNIQUE INDEX "AssessmentSession_assessmentId_candidateUserId_attemptNumbe_key" ON "AssessmentSession"("assessmentId", "candidateUserId", "attemptNumber");

-- AddForeignKey
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "AssessmentSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterviewPlan" ADD CONSTRAINT "InterviewPlan_interviewId_fkey" FOREIGN KEY ("interviewId") REFERENCES "Interview"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterviewEvaluation" ADD CONSTRAINT "InterviewEvaluation_interviewId_fkey" FOREIGN KEY ("interviewId") REFERENCES "Interview"("id") ON DELETE CASCADE ON UPDATE CASCADE;

