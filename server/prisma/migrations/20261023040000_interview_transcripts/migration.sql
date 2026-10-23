CREATE TABLE "InterviewTranscriptSegment" (
 "id" TEXT NOT NULL PRIMARY KEY,
 "interviewId" INTEGER NOT NULL REFERENCES "Interview"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "questionId" INTEGER,
 "sessionId" TEXT NOT NULL,
 "sequence" INTEGER NOT NULL,
 "speaker" TEXT NOT NULL DEFAULT 'candidate',
 "text" TEXT NOT NULL,
 "startedAt" TIMESTAMP(3) NOT NULL,
 "endedAt" TIMESTAMP(3) NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "InterviewTranscriptSegment_sessionId_sequence_key" ON "InterviewTranscriptSegment"("sessionId", "sequence");
CREATE INDEX "InterviewTranscriptSegment_interviewId_startedAt_idx" ON "InterviewTranscriptSegment"("interviewId", "startedAt");
