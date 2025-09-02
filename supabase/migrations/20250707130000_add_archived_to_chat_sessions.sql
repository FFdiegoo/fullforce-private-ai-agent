-- Add archived column to chat_sessions for soft deletes
ALTER TABLE chat_sessions ADD COLUMN IF NOT EXISTS archived boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS chat_sessions_archived_idx ON chat_sessions(archived);
