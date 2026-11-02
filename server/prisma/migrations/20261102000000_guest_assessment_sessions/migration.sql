ALTER TABLE "UserSession" ADD COLUMN "guestAssessmentId" INTEGER;
CREATE TABLE "GuestAssessmentParticipation" (
  "id" SERIAL NOT NULL,
  "userId" INTEGER NOT NULL,
  "assessmentId" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GuestAssessmentParticipation_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "GuestAssessmentParticipation_userId_assessmentId_key"
ON "GuestAssessmentParticipation"("userId", "assessmentId");
INSERT INTO "GuestAssessmentParticipation" ("userId", "assessmentId")
SELECT r."userId", i."assessmentId" FROM "InviteRedemption" r
JOIN "InviteLink" i ON i.id = r."inviteId" JOIN "User" u ON u.id = r."userId"
WHERE u."isGuest" = true
UNION
SELECT a."candidateUserId", a."assessmentId" FROM "AssessmentSession" a
JOIN "User" u ON u.id = a."candidateUserId" WHERE u."isGuest" = true;
ALTER TABLE "GuestAssessmentParticipation" ADD CONSTRAINT "GuestAssessmentParticipation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GuestAssessmentParticipation" ADD CONSTRAINT "GuestAssessmentParticipation_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
