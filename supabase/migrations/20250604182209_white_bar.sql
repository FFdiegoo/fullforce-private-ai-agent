/*
  # Create auth events tracking table

  1. New Tables
    - `auth_events`
      - `id` (uuid, primary key)
      - `user_email` (text)
      - `timestamp` (timestamptz)
      - `event_type` (text)

  2. Security
    - Enable RLS
    - Add policy for admin access
*/

CREATE TABLE IF NOT EXISTS auth_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email text NOT NULL,
  timestamp timestamptz DEFAULT now(),
  event_type text NOT NULL
);

ALTER TABLE auth_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Only admins can access auth events"
  ON auth_events
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );