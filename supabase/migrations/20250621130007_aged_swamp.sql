/*
  # Create AI Feedback System

  1. New Tables
    - `message_feedback`
      - `id` (uuid, primary key)
      - `message_id` (uuid, references chat_messages)
      - `session_id` (uuid, references chat_sessions)
      - `user_id` (uuid, references profiles)
      - `feedback_type` ('thumbs_up' or 'thumbs_down')
      - `created_at` (timestamp)
      - `viewed_by_admin` (boolean, default false)

  2. Security
    - Enable RLS on feedback table
    - Add policies for user feedback and admin access

  3. Indexes
    - Performance indexes for feedback queries
*/

-- Create message_feedback table
CREATE TABLE IF NOT EXISTS message_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL,
  session_id uuid NOT NULL,
  user_id uuid NOT NULL,
  feedback_type text NOT NULL CHECK (feedback_type IN ('thumbs_up', 'thumbs_down')),
  created_at timestamptz DEFAULT now(),
  viewed_by_admin boolean DEFAULT false,
  FOREIGN KEY (message_id) REFERENCES chat_messages(id) ON DELETE CASCADE,
  FOREIGN KEY (session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE,
  UNIQUE(message_id, user_id) -- One feedback per message per user
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS message_feedback_message_id_idx ON message_feedback(message_id);
CREATE INDEX IF NOT EXISTS message_feedback_session_id_idx ON message_feedback(session_id);
CREATE INDEX IF NOT EXISTS message_feedback_user_id_idx ON message_feedback(user_id);
CREATE INDEX IF NOT EXISTS message_feedback_type_idx ON message_feedback(feedback_type);
CREATE INDEX IF NOT EXISTS message_feedback_viewed_idx ON message_feedback(viewed_by_admin);
CREATE INDEX IF NOT EXISTS message_feedback_created_at_idx ON message_feedback(created_at DESC);

-- Enable RLS
ALTER TABLE message_feedback ENABLE ROW LEVEL SECURITY;

-- Policies for message_feedback
CREATE POLICY "Users can read own feedback"
  ON message_feedback
  FOR SELECT
  TO authenticated
  USING (
    user_id IN (
      SELECT id FROM profiles WHERE email = (
        SELECT email FROM auth.users WHERE id = auth.uid()
      )
    )
  );

CREATE POLICY "Users can create own feedback"
  ON message_feedback
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id IN (
      SELECT id FROM profiles WHERE email = (
        SELECT email FROM auth.users WHERE id = auth.uid()
      )
    )
  );

CREATE POLICY "Users can update own feedback"
  ON message_feedback
  FOR UPDATE
  TO authenticated
  USING (
    user_id IN (
      SELECT id FROM profiles WHERE email = (
        SELECT email FROM auth.users WHERE id = auth.uid()
      )
    )
  );

CREATE POLICY "Users can delete own feedback"
  ON message_feedback
  FOR DELETE
  TO authenticated
  USING (
    user_id IN (
      SELECT id FROM profiles WHERE email = (
        SELECT email FROM auth.users WHERE id = auth.uid()
      )
    )
  );

CREATE POLICY "Admins can access all feedback"
  ON message_feedback
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

-- Function to get feedback statistics
CREATE OR REPLACE FUNCTION get_feedback_stats()
RETURNS TABLE (
  total_thumbs_up bigint,
  total_thumbs_down bigint,
  unviewed_thumbs_down bigint
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    (SELECT COUNT(*) FROM message_feedback WHERE feedback_type = 'thumbs_up'),
    (SELECT COUNT(*) FROM message_feedback WHERE feedback_type = 'thumbs_down'),
    (SELECT COUNT(*) FROM message_feedback WHERE feedback_type = 'thumbs_down' AND viewed_by_admin = false);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;