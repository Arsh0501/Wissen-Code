-- InterviewEvent is also used for live activity and AI evidence. Remove only
-- CODE_CHANGED editor snapshots, which AI context explicitly excludes.
-- Other event payloads, current editor state and submissions are untouched.
-- Handle legacy non-JSON event payloads without aborting the migration.
CREATE FUNCTION pg_temp.remove_interview_code_snapshots(event_payload TEXT)
RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE
  document JSONB;
BEGIN
  document := event_payload::JSONB;
  IF jsonb_typeof(document) = 'object' THEN
    RETURN (document - 'code' - 'starterCode' - 'codeSnapshot')::TEXT;
  END IF;
  RETURN event_payload;
EXCEPTION WHEN invalid_text_representation THEN
  RETURN event_payload;
END;
$$;

UPDATE "InterviewEvent"
SET "payload" = pg_temp.remove_interview_code_snapshots("payload")
WHERE "eventType" = 'CODE_CHANGED'
  AND ("payload" LIKE '%"code"%'
    OR "payload" LIKE '%"starterCode"%'
    OR "payload" LIKE '%"codeSnapshot"%');

DROP FUNCTION pg_temp.remove_interview_code_snapshots(TEXT);
