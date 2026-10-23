ALTER TABLE "Question" ADD COLUMN "ownerInterviewId" INTEGER;
CREATE INDEX "Question_ownerInterviewId_idx" ON "Question"("ownerInterviewId");

-- Earlier resume questions stored their generation metadata on the interview link.
-- Preserve assignments/results while removing these questions from reusable selection.
UPDATE "Question" q
SET "ownerInterviewId" = origin."interviewId"
FROM (
  SELECT DISTINCT ON (iq."questionId") iq."questionId", iq."interviewId"
  FROM "InterviewQuestion" iq
  WHERE iq.notes LIKE '%"keyDiscussionPoints"%'
     OR iq.notes LIKE '%"expectedSolution"%'
  ORDER BY iq."questionId", iq.id
) origin
WHERE q.id = origin."questionId";
