/*
  # Add admin profile for existing admin user

  1. Profile Creation
    - Insert admin profile for admin@csrental.nl
    - Set role to 'admin'
    - Handle conflicts gracefully

  2. Security
    - Ensure admin has proper permissions
*/

-- Insert admin user profile for the existing auth user
INSERT INTO profiles (id, email, name, role, created_at, updated_at)
VALUES (
  'dde37635-c1fb-460e-85bc-b423725fa756', -- The actual ID from your auth.users
  'admin@csrental.nl',
  'Admin User',
  'admin',
  now(),
  now()
) ON CONFLICT (email) DO UPDATE SET
  role = 'admin',
  name = 'Admin User',
  updated_at = now();

-- Also ensure the ID matches if there's a conflict on ID
INSERT INTO profiles (id, email, name, role, created_at, updated_at)
VALUES (
  'dde37635-c1fb-460e-85bc-b423725fa756',
  'admin@csrental.nl',
  'Admin User', 
  'admin',
  now(),
  now()
) ON CONFLICT (id) DO UPDATE SET
  email = 'admin@csrental.nl',
  role = 'admin',
  name = 'Admin User',
  updated_at = now();