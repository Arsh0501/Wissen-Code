-- Proctoring: assessments can require the candidate camera; frames are stored per session.
ALTER TABLE "Assessment" ADD COLUMN "requireCamera" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "ProctorSnapshot" (
    "id" SERIAL NOT NULL,
    "sessionId" INTEGER NOT NULL,
    "takenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" TEXT NOT NULL DEFAULT 'interval',
    "image" BYTEA NOT NULL,
    CONSTRAINT "ProctorSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ProctorSnapshot_sessionId_takenAt_idx" ON "ProctorSnapshot"("sessionId", "takenAt");

ALTER TABLE "ProctorSnapshot" ADD CONSTRAINT "ProctorSnapshot_sessionId_fkey"
  FOREIGN KEY ("sessionId") REFERENCES "AssessmentSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
