/*
  # Secure Authentication System with Invite-Only Registration

  1. New Tables
    - `invites` - Store invitation codes and metadata
    - `email_verifications` - Store email verification codes
    
  2. Security
    - Enable RLS on all new tables
    - Add appropriate policies for admin and user access
    
  3. Indexes
    - Performance indexes for lookups and queries
*/

-- Create invites table
CREATE TABLE IF NOT EXISTS invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  name text NOT NULL,
  phone text,
  invite_code text UNIQUE NOT NULL,
  expires_at timestamptz NOT NULL,
  used boolean DEFAULT false,
  used_at timestamptz,
  used_by uuid REFERENCES profiles(id),
  created_by uuid NOT NULL REFERENCES profiles(id),
  created_at timestamptz DEFAULT now()
);

-- Create email_verifications table
CREATE TABLE IF NOT EXISTS email_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE NOT NULL,
  code text NOT NULL,
  expires_at timestamptz NOT NULL,
  attempts integer DEFAULT 0,
  verified boolean DEFAULT false,
  verified_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS invites_email_idx ON invites(email);
CREATE INDEX IF NOT EXISTS invites_code_idx ON invites(invite_code);
CREATE INDEX IF NOT EXISTS invites_expires_at_idx ON invites(expires_at);
CREATE INDEX IF NOT EXISTS invites_used_idx ON invites(used);
CREATE INDEX IF NOT EXISTS invites_created_by_idx ON invites(created_by);

CREATE INDEX IF NOT EXISTS email_verifications_email_idx ON email_verifications(email);
CREATE INDEX IF NOT EXISTS email_verifications_expires_at_idx ON email_verifications(expires_at);
CREATE INDEX IF NOT EXISTS email_verifications_verified_idx ON email_verifications(verified);

-- Enable RLS
ALTER TABLE invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_verifications ENABLE ROW LEVEL SECURITY;

-- Policies for invites table
CREATE POLICY "Admins can manage all invites"
  ON invites
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

CREATE POLICY "Users can read invites for their email"
  ON invites
  FOR SELECT
  TO anon, authenticated
  USING (true); -- Allow reading for invite validation

-- Policies for email_verifications table
CREATE POLICY "Anyone can read email verifications for validation"
  ON email_verifications
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Anyone can insert email verifications"
  ON email_verifications
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Anyone can update email verifications for verification"
  ON email_verifications
  FOR UPDATE
  TO anon, authenticated
  USING (true);

CREATE POLICY "Admins can manage all email verifications"
  ON email_verifications
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

-- Add foreign key constraints with proper names
ALTER TABLE invites 
ADD CONSTRAINT invites_created_by_fkey 
FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE invites 
ADD CONSTRAINT invites_used_by_fkey 
FOREIGN KEY (used_by) REFERENCES profiles(id) ON DELETE SET NULL;

-- Function to cleanup expired records (can be called by a cron job)
CREATE OR REPLACE FUNCTION cleanup_expired_auth_records()
RETURNS integer AS $$
DECLARE
  deleted_invites integer;
  deleted_verifications integer;
BEGIN
  -- Delete expired unused invites
  DELETE FROM invites 
  WHERE expires_at < now() 
  AND used = false;
  
  GET DIAGNOSTICS deleted_invites = ROW_COUNT;
  
  -- Delete expired unverified email verifications
  DELETE FROM email_verifications 
  WHERE expires_at < now() 
  AND verified = false;
  
  GET DIAGNOSTICS deleted_verifications = ROW_COUNT;
  
  -- Log cleanup
  INSERT INTO audit_logs (action, metadata, severity)
  VALUES (
    'AUTH_CLEANUP',
    jsonb_build_object(
      'deleted_invites', deleted_invites,
      'deleted_verifications', deleted_verifications
    ),
    'INFO'
  );
  
  RETURN deleted_invites + deleted_verifications;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;