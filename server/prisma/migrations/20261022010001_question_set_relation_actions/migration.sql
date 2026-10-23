ALTER TABLE "InterviewQuestionSet" DROP CONSTRAINT "InterviewQuestionSet_createdById_fkey";
ALTER TABLE "InterviewQuestionSetItem" DROP CONSTRAINT "InterviewQuestionSetItem_setId_fkey";
ALTER TABLE "InterviewQuestionSet" ADD CONSTRAINT "InterviewQuestionSet_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InterviewQuestionSetItem" ADD CONSTRAINT "InterviewQuestionSetItem_setId_fkey" FOREIGN KEY ("setId") REFERENCES "InterviewQuestionSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;
