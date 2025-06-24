/*
  # Add 2FA columns to profiles table

  1. New Columns
    - `two_factor_enabled` (boolean, default false)
    - `two_factor_secret` (text, nullable)
    - `backup_codes` (text array, nullable)

  2. Audit Logs Table
    - `audit_logs` table for security logging
*/

-- Add 2FA columns to profiles table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'two_factor_enabled'
  ) THEN
    ALTER TABLE profiles ADD COLUMN two_factor_enabled boolean DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'two_factor_secret'
  ) THEN
    ALTER TABLE profiles ADD COLUMN two_factor_secret text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'backup_codes'
  ) THEN
    ALTER TABLE profiles ADD COLUMN backup_codes text[];
  END IF;
END $$;

-- Create audit_logs table if it doesn't exist
CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text,
  action text NOT NULL,
  metadata jsonb,
  ip_address text,
  user_agent text,
  severity text DEFAULT 'INFO' CHECK (severity IN ('DEBUG', 'INFO', 'WARN', 'ERROR', 'CRITICAL')),
  created_at timestamptz DEFAULT now()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS audit_logs_user_id_idx ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS audit_logs_action_idx ON audit_logs(action);
CREATE INDEX IF NOT EXISTS audit_logs_created_at_idx ON audit_logs(created_at DESC);

-- Enable RLS on audit_logs
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Create policy for audit logs (only admins can read)
CREATE POLICY "Only admins can access audit logs"
  ON audit_logs
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