-- Add archived column to chat_sessions
ALTER TABLE chat_sessions ADD COLUMN IF NOT EXISTS archived boolean DEFAULT false;

-- Index for archived column
CREATE INDEX IF NOT EXISTS chat_sessions_archived_idx ON chat_sessions(archived);
