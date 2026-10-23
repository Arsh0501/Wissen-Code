-- Some development databases already received this column outside migration history.
-- Fresh installations and CI must receive it through migrations as well.
ALTER TABLE "Interview"
ADD COLUMN IF NOT EXISTS "extendedMinutes" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "Interview"
ADD COLUMN IF NOT EXISTS "candidateResume" TEXT,
ADD COLUMN IF NOT EXISTS "candidateResumeUrl" TEXT,
ADD COLUMN IF NOT EXISTS "finalFeedback" TEXT,
ADD COLUMN IF NOT EXISTS "finalRating" INTEGER,
ADD COLUMN IF NOT EXISTS "finalRecommendation" TEXT;
