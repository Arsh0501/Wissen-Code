-- CreateTable
CREATE TABLE "PasteEvent" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "sessionId" INTEGER NOT NULL,
    "questionId" INTEGER NOT NULL,
    "charCount" INTEGER NOT NULL,
    "lineCount" INTEGER NOT NULL,
    "occurredAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PasteEvent_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "AssessmentSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "PasteEvent_sessionId_idx" ON "PasteEvent"("sessionId");
