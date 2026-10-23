-- AlterTable
ALTER TABLE "Interview" ADD COLUMN     "codeRevision" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Question" ADD COLUMN     "settings" JSONB NOT NULL DEFAULT '{}';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "emailVerifiedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "AccountToken" (
    "id" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "purpose" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutboundMessage" (
    "id" TEXT NOT NULL,
    "authorId" INTEGER,
    "recipient" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'email',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "scheduledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "providerId" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OutboundMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
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
CREATE TABLE "IntegrityReview" (
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
CREATE TABLE "AssessmentAccommodation" (
    "id" SERIAL NOT NULL,
    "assessmentId" INTEGER NOT NULL,
    "candidateUserId" INTEGER NOT NULL,
    "extraMinutes" INTEGER NOT NULL DEFAULT 0,
    "reason" TEXT NOT NULL,
    "authorId" INTEGER NOT NULL,

    CONSTRAINT "AssessmentAccommodation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AccountToken_tokenHash_key" ON "AccountToken"("tokenHash");

-- CreateIndex
CREATE INDEX "AccountToken_userId_purpose_idx" ON "AccountToken"("userId", "purpose");

-- CreateIndex
CREATE INDEX "OutboundMessage_status_scheduledAt_idx" ON "OutboundMessage"("status", "scheduledAt");

-- CreateIndex
CREATE INDEX "AuditEvent_resource_resourceId_createdAt_idx" ON "AuditEvent"("resource", "resourceId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "IntegrityReview_submissionId_comparedSubmissionId_key" ON "IntegrityReview"("submissionId", "comparedSubmissionId");

-- CreateIndex
CREATE UNIQUE INDEX "AssessmentAccommodation_assessmentId_candidateUserId_key" ON "AssessmentAccommodation"("assessmentId", "candidateUserId");
