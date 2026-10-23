CREATE TABLE "InterviewFollowUp" (
  "id" TEXT PRIMARY KEY,
  "interviewId" INTEGER NOT NULL,
  "questionId" INTEGER NOT NULL,
  "question" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "createdById" INTEGER NOT NULL,
  "askedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "InterviewFollowUp_interviewId_fkey" FOREIGN KEY ("interviewId") REFERENCES "Interview"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "InterviewFollowUp_interviewId_questionId_idx" ON "InterviewFollowUp"("interviewId", "questionId");
