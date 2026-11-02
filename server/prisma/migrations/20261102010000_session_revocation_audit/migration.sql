CREATE TABLE "SessionRevocationAudit" (
 "id" SERIAL NOT NULL,
 "actorUserId" INTEGER NOT NULL,
 "targetUserId" INTEGER NOT NULL,
 "revokedSessions" INTEGER NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "SessionRevocationAudit_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "SessionRevocationAudit_targetUserId_createdAt_idx" ON "SessionRevocationAudit"("targetUserId", "createdAt");
