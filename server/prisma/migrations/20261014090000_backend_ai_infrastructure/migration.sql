-- AlterTable
ALTER TABLE "AssessmentSession" ADD COLUMN     "gradingStartedAt" TIMESTAMP(3),
ADD COLUMN     "gradingStatus" TEXT NOT NULL DEFAULT 'pending';

-- CreateTable
CREATE TABLE "AIJob" (
    "id" TEXT NOT NULL,
    "authorId" INTEGER NOT NULL,
    "interviewId" INTEGER,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "input" JSONB NOT NULL,
    "output" JSONB,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AIJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AIJob_authorId_createdAt_idx" ON "AIJob"("authorId", "createdAt");

-- CreateIndex
CREATE INDEX "AIJob_interviewId_kind_idx" ON "AIJob"("interviewId", "kind");

