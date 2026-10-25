-- Remove the retired planner's persisted plans and background jobs.
DELETE FROM "AIJob" WHERE "kind" = 'interview-planner';
-- Negative question IDs were synthetic plan-only discussion prompts.
DELETE FROM "InterviewEvaluation" WHERE "questionId" < 0;
DROP TABLE "InterviewPlan";
