ALTER TABLE "InviteLink" ADD COLUMN "recipientEmail" TEXT;

-- Bind previously emailed links too; do not infer ownership from editable labels.
UPDATE "InviteLink" AS invite
SET "recipientEmail" = lower(mail.recipient)
FROM "OutboundMessage" AS mail
WHERE mail.kind LIKE 'bulk-assessment:%'
  AND split_part(mail.kind, ':', 3) = invite."assessmentId"::text
  AND position('/invite/' || invite.token || E'\n' in mail.body) > 0;
