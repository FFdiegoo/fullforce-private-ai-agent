/*
  # Create chat_logs table for tracking RAG interactions

  1. New Tables
    - `chat_logs`
      - `id` (uuid, primary key)
      - `prompt` (text, user query)
      - `context` (text, retrieved context)
      - `response` (text, AI response)
      - `model` (text, model used)
      - `mode` (text, 'technical' or 'procurement')
      - `timestamp` (timestamptz)
      - `has_context` (boolean)

  2. Security
    - Enable RLS on chat_logs table
    - Add policy for admin access
*/

-- Create chat_logs table
CREATE TABLE IF NOT EXISTS chat_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prompt text NOT NULL,
  context text,
  response text NOT NULL,
  model text,
  mode text,
  timestamp timestamptz DEFAULT now(),
  has_context boolean DEFAULT false
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS chat_logs_timestamp_idx ON chat_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS chat_logs_has_context_idx ON chat_logs(has_context);
CREATE INDEX IF NOT EXISTS chat_logs_mode_idx ON chat_logs(mode);

-- Enable RLS
ALTER TABLE chat_logs ENABLE ROW LEVEL SECURITY;

-- Create policy for admin access
CREATE POLICY "Only admins can access chat logs"
  ON chat_logs
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE email = (
        SELECT email FROM auth.users WHERE id = auth.uid()
      )
      AND role = 'admin'
    )
  );