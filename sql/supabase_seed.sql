-- Supabase/Postgres seed for core tables and a SUPER_ADMIN user
-- Run this in Supabase SQL editor or psql against your database.

-- enable pgcrypto for gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Role enum
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'role') THEN
        CREATE TYPE role AS ENUM ('USER','CLIENT','SUPER_ADMIN');
    END IF;
END$$;

-- Users table (minimal fields required by app)
CREATE TABLE IF NOT EXISTS "User" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  password text,
  name text NOT NULL,
  role role NOT NULL DEFAULT 'USER',
  "teamId" uuid,
  "githubToken" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

-- Teams table (minimal)
CREATE TABLE IF NOT EXISTS "Team" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

-- TeamMembership table
CREATE TABLE IF NOT EXISTS "TeamMembership" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId" uuid NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  "teamId" uuid NOT NULL REFERENCES "Team"(id) ON DELETE CASCADE,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  UNIQUE ("userId", "teamId")
);

-- Client table (minimal)
CREATE TABLE IF NOT EXISTS "Client" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text NOT NULL UNIQUE,
  "isInvited" boolean NOT NULL DEFAULT false,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

-- Insert a SUPER_ADMIN if one doesn't exist
INSERT INTO "User" (email, name, role, password)
SELECT 'dev@lighthousemediagroup.com', 'Super Admin', 'SUPER_ADMIN', ''
WHERE NOT EXISTS (SELECT 1 FROM "User" WHERE role = 'SUPER_ADMIN');

-- Insert a test CLIENT user for portal testing (idempotent)
INSERT INTO "User" (email, name, role, password)
SELECT 'client.test@lighthousemediagroup.com', 'Test Client User', 'CLIENT', ''
WHERE NOT EXISTS (
  SELECT 1 FROM "User" WHERE email = 'client.test@lighthousemediagroup.com'
);

-- Ensure matching Client profile exists for role-based client scoping
INSERT INTO "Client" (name, email, "isInvited")
SELECT 'Test Client User', 'client.test@lighthousemediagroup.com', true
WHERE NOT EXISTS (
  SELECT 1 FROM "Client" WHERE email = 'client.test@lighthousemediagroup.com'
);

-- Helpful note:
-- The app uses Supabase magic links for sign-in. After running this seed,
-- also create a matching Supabase Auth user with the same email (or use
-- magic-link sign-in) so the app can complete passwordless login.
