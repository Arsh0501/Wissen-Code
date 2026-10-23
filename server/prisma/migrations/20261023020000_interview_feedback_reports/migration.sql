CREATE TABLE "InterviewFeedbackReport" (
  "interviewId" INTEGER PRIMARY KEY,
  "feedbackRevision" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "content" JSONB NOT NULL DEFAULT '{}',
  "pdf" BYTEA,
  "error" TEXT,
  "generatedAt" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "InterviewFeedbackReport_interviewId_fkey"
    FOREIGN KEY ("interviewId") REFERENCES "Interview"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
