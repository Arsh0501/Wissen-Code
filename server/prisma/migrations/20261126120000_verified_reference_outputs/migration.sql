ALTER TABLE "AIQuestionDraft" ADD COLUMN "requiresReferenceReview" BOOLEAN NOT NULL DEFAULT false, ADD COLUMN "referenceVerification" JSONB;
UPDATE "AIQuestionDraft" SET "requiresReferenceReview" = true WHERE "questionId" IS NULL AND "status" NOT IN ('approved','rejected') AND "content"->>'questionType' IN ('coding','debugging');
