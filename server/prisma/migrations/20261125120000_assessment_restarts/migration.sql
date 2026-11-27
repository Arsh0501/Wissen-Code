ALTER TABLE "AssessmentSession" ADD COLUMN "invalidatedAt" TIMESTAMP(3);
CREATE TABLE "AssessmentRestart" (
 "id" SERIAL PRIMARY KEY, "assessmentId" INTEGER NOT NULL REFERENCES "Assessment"("id") ON DELETE CASCADE,
 "candidateUserId" INTEGER NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
 "adminId" INTEGER NOT NULL, "adminEmail" TEXT NOT NULL, "candidateName" TEXT NOT NULL,
 "reason" TEXT NOT NULL, "allowClosed" BOOLEAN NOT NULL DEFAULT false,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "consumedSessionId" INTEGER, "consumedAt" TIMESTAMP(3), "revokedAt" TIMESTAMP(3), "invalidatedSessionIds" JSONB NOT NULL
);
CREATE UNIQUE INDEX "AssessmentRestart_consumedSessionId_key" ON "AssessmentRestart"("consumedSessionId");
CREATE INDEX "AssessmentRestart_assessmentId_candidateUserId_createdAt_idx" ON "AssessmentRestart"("assessmentId", "candidateUserId", "createdAt");
