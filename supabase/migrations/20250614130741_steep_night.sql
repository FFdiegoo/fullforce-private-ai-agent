/*
  # Create admin user profile

  1. Admin User Setup
    - Insert admin profile for admin@csrental.nl
    - Set role to 'admin'
    - Handle conflicts gracefully

  2. Security
    - Ensure admin has proper permissions
*/

-- Insert admin user profile (will be created when they first log in)
INSERT INTO profiles (id, email, name, role, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  'admin@csrental.nl',
  'Admin User',
  'admin',
  now(),
  now()
) ON CONFLICT (email) DO UPDATE SET
  role = 'admin',
  name = 'Admin User',
  updated_at = now();

-- Also create some dummy users for testing
INSERT INTO profiles (id, email, name, role, created_at, updated_at)
VALUES 
  (gen_random_uuid(), 'john.doe@csrental.nl', 'John Doe', 'user', now(), now()),
  (gen_random_uuid(), 'jane.smith@csrental.nl', 'Jane Smith', 'user', now(), now()),
  (gen_random_uuid(), 'mike.johnson@csrental.nl', 'Mike Johnson', 'user', now(), now()),
  (gen_random_uuid(), 'sarah.wilson@csrental.nl', 'Sarah Wilson', 'user', now(), now()),
  (gen_random_uuid(), 'david.brown@csrental.nl', 'David Brown', 'user', now(), now()),
  (gen_random_uuid(), 'lisa.davis@csrental.nl', 'Lisa Davis', 'user', now(), now()),
  (gen_random_uuid(), 'tom.miller@csrental.nl', 'Tom Miller', 'user', now(), now()),
  (gen_random_uuid(), 'emma.garcia@csrental.nl', 'Emma Garcia', 'user', now(), now()),
  (gen_random_uuid(), 'alex.martinez@csrental.nl', 'Alex Martinez', 'user', now(), now())
ON CONFLICT (email) DO NOTHING;