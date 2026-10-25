-- Restore missing platform tables without replacing existing tables or data.
-- CreateTable
CREATE TABLE IF NOT EXISTS "AuditEvent" (
    "id" SERIAL NOT NULL,
    "actorId" INTEGER,
    "action" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "detail" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "IntegrityReview" (
    "id" SERIAL NOT NULL,
    "assessmentId" INTEGER NOT NULL,
    "submissionId" INTEGER NOT NULL,
    "comparedSubmissionId" INTEGER NOT NULL,
    "reviewerId" INTEGER NOT NULL,
    "decision" TEXT NOT NULL,
    "notes" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntegrityReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "AssessmentAccommodation" (
    "id" SERIAL NOT NULL,
    "assessmentId" INTEGER NOT NULL,
    "candidateUserId" INTEGER NOT NULL,
    "extraMinutes" INTEGER NOT NULL DEFAULT 0,
    "reason" TEXT NOT NULL,
    "authorId" INTEGER NOT NULL,

    CONSTRAINT "AssessmentAccommodation_pkey" PRIMARY KEY ("id")
);


CREATE INDEX IF NOT EXISTS "AuditEvent_resource_resourceId_createdAt_idx" ON "AuditEvent"("resource", "resourceId", "createdAt");
CREATE UNIQUE INDEX IF NOT EXISTS "IntegrityReview_submissionId_comparedSubmissionId_key" ON "IntegrityReview"("submissionId", "comparedSubmissionId");
CREATE UNIQUE INDEX IF NOT EXISTS "AssessmentAccommodation_assessmentId_candidateUserId_key" ON "AssessmentAccommodation"("assessmentId", "candidateUserId");
