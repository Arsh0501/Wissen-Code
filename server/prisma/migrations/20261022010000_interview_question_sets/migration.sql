CREATE TABLE "InterviewQuestionSet" (
 "id" SERIAL PRIMARY KEY, "title" TEXT NOT NULL, "description" TEXT NOT NULL DEFAULT '',
 "createdById" INTEGER NOT NULL REFERENCES "User"("id"), "revision" INTEGER NOT NULL DEFAULT 1,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE TABLE "InterviewQuestionSetItem" (
 "id" SERIAL PRIMARY KEY, "setId" INTEGER NOT NULL REFERENCES "InterviewQuestionSet"("id") ON DELETE CASCADE,
 "title" TEXT NOT NULL, "statement" TEXT NOT NULL, "answer" TEXT, "source" TEXT NOT NULL DEFAULT 'manual',
 "orderIndex" INTEGER NOT NULL DEFAULT 0, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "InterviewQuestionSetItem_setId_orderIndex_idx" ON "InterviewQuestionSetItem"("setId", "orderIndex");
ALTER TABLE "InterviewQuestion" ADD COLUMN "referenceAnswer" TEXT, ADD COLUMN "sourceSetItemId" INTEGER, ADD COLUMN "sourceSetTitle" TEXT;
CREATE UNIQUE INDEX "InterviewQuestion_interviewId_sourceSetItemId_key" ON "InterviewQuestion"("interviewId", "sourceSetItemId");
