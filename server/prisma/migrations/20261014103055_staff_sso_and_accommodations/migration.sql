-- AlterTable
ALTER TABLE "AssessmentSession" ADD COLUMN     "durationMinutes" INTEGER;

-- CreateTable
CREATE TABLE "OIDCRequest" (
    "stateHash" TEXT NOT NULL,
    "verifier" TEXT NOT NULL,
    "nonce" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OIDCRequest_pkey" PRIMARY KEY ("stateHash")
);

-- CreateTable
CREATE TABLE "OIDCIdentity" (
    "id" SERIAL NOT NULL,
    "issuer" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,

    CONSTRAINT "OIDCIdentity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OIDCIdentity_issuer_subject_key" ON "OIDCIdentity"("issuer", "subject");
