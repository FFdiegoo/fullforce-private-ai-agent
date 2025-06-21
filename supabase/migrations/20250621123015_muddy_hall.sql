/*
  # Fix Schema Issues

  1. Database Schema Fixes
    - Ensure auth_events table has user_email column
    - Ensure profiles table has email column with proper constraints
    - Fix any missing columns or constraints

  2. Security
    - Maintain existing RLS policies
    - Ensure data integrity
*/

-- Fix auth_events table
DO $$
BEGIN
  -- Check if auth_events table exists, create if not
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'auth_events') THEN
    CREATE TABLE auth_events (
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
          WHERE profiles.email = (
            SELECT email FROM auth.users WHERE id = auth.uid()
          )
          AND profiles.role = 'admin'
        )
      );
  ELSE
    -- Check if user_email column exists, add if missing
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'auth_events' AND column_name = 'user_email'
    ) THEN
      ALTER TABLE auth_events ADD COLUMN user_email text NOT NULL DEFAULT '';
    END IF;
  END IF;
END $$;

-- Fix profiles table
DO $$
BEGIN
  -- Check if profiles table exists, create if not
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'profiles') THEN
    CREATE TABLE profiles (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      email text UNIQUE NOT NULL,
      name text,
      role text DEFAULT 'user' CHECK (role IN ('user', 'admin')),
      created_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now()
    );
    
    ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
    
    -- Create policies
    CREATE POLICY "Users can read own profile"
      ON profiles
      FOR SELECT
      TO authenticated
      USING (email = (SELECT email FROM auth.users WHERE id = auth.uid()) OR EXISTS (
        SELECT 1 FROM profiles p 
        WHERE p.email = (SELECT email FROM auth.users WHERE id = auth.uid())
        AND p.role = 'admin'
      ));

    CREATE POLICY "Users can update own profile"
      ON profiles
      FOR UPDATE
      TO authenticated
      USING (email = (SELECT email FROM auth.users WHERE id = auth.uid()))
      WITH CHECK (email = (SELECT email FROM auth.users WHERE id = auth.uid()));

    CREATE POLICY "Admins can manage all profiles"
      ON profiles
      FOR ALL
      TO authenticated
      USING (EXISTS (
        SELECT 1 FROM profiles p 
        WHERE p.email = (SELECT email FROM auth.users WHERE id = auth.uid())
        AND p.role = 'admin'
      ));
  ELSE
    -- Check if email column exists, add if missing
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'profiles' AND column_name = 'email'
    ) THEN
      ALTER TABLE profiles ADD COLUMN email text;
      
      -- Update existing records with email from auth.users
      UPDATE profiles 
      SET email = auth_users.email 
      FROM auth.users auth_users 
      WHERE profiles.id = auth_users.id;
      
      -- Make email not null and unique
      ALTER TABLE profiles ALTER COLUMN email SET NOT NULL;
      ALTER TABLE profiles ADD CONSTRAINT profiles_email_unique UNIQUE (email);
    END IF;
  END IF;
END $$;

-- Create index for better performance if it doesn't exist
CREATE INDEX IF NOT EXISTS idx_profiles_email ON profiles (email);

-- Update or create the handle_new_user function
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, email, name)
  VALUES (
    new.id, 
    new.email, 
    COALESCE(new.raw_user_meta_data->>'name', new.email)
  )
  ON CONFLICT (email) DO UPDATE SET
    name = COALESCE(EXCLUDED.name, profiles.name),
    updated_at = now();
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recreate trigger for new user signup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- Update function for updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for updated_at if it doesn't exist
DROP TRIGGER IF EXISTS update_profiles_updated_at ON profiles;
CREATE TRIGGER update_profiles_updated_at
    BEFORE UPDATE ON profiles
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();