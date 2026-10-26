-- Batch automation: per-assessment automation settings and email attachments for the outbox.
ALTER TABLE "Assessment" ADD COLUMN "automation" JSONB NOT NULL DEFAULT '{}';
ALTER TABLE "OutboundMessage" ADD COLUMN "attachments" JSONB NOT NULL DEFAULT '[]';
