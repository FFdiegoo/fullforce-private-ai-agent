/*
  # Fix profiles table email column issue

  1. Database Schema Fix
    - Add email column to profiles table if it doesn't exist
    - Ensure proper constraints and indexing
    - Update existing records if needed

  2. Security
    - Maintain existing RLS policies
    - Ensure data integrity
*/

-- Check if email column exists and add it if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'email'
  ) THEN
    -- Add email column
    ALTER TABLE profiles ADD COLUMN email text;
    
    -- Make it unique and not null
    ALTER TABLE profiles ALTER COLUMN email SET NOT NULL;
    ALTER TABLE profiles ADD CONSTRAINT profiles_email_unique UNIQUE (email);
    
    -- Create index for better performance
    CREATE INDEX IF NOT EXISTS idx_profiles_email ON profiles (email);
    
    -- Update existing records with email from auth.users if they exist
    UPDATE profiles 
    SET email = auth_users.email 
    FROM auth.users auth_users 
    WHERE profiles.id = auth_users.id 
    AND profiles.email IS NULL;
  END IF;
END $$;

-- Ensure the email column has proper constraints
DO $$
BEGIN
  -- Add unique constraint if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE table_name = 'profiles' 
    AND constraint_name = 'profiles_email_unique'
  ) THEN
    ALTER TABLE profiles ADD CONSTRAINT profiles_email_unique UNIQUE (email);
  END IF;
END $$;

-- Create index for better performance if it doesn't exist
CREATE INDEX IF NOT EXISTS idx_profiles_email ON profiles (email);

-- Update the handle_new_user function to ensure email is always set
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, email, name)
  VALUES (
    new.id, 
    new.email, 
    COALESCE(new.raw_user_meta_data->>'name', new.email)
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    name = COALESCE(EXCLUDED.name, profiles.name),
    updated_at = now();
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;