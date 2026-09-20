-- Full Supabase/Postgres schema for Project Management Tool
-- Safe to run multiple times (uses IF NOT EXISTS guards where possible).

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'role') THEN
    CREATE TYPE role AS ENUM ('USER', 'CLIENT', 'SUPER_ADMIN');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ticket_status') THEN
    CREATE TYPE ticket_status AS ENUM (
      'BACKLOG',
      'TODO',
      'REFINE',
      'IN_PROGRESS',
      'IN_REVIEW',
      'QA',
      'REVISIONS',
      'CLIENT_REVIEW',
      'COMPLETE'
    );
  END IF;
END $$;

DO $$ BEGIN
  ALTER TYPE ticket_status ADD VALUE IF NOT EXISTS 'IN_REVIEW';
  ALTER TYPE ticket_status ADD VALUE IF NOT EXISTS 'QA';
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ticket_priority') THEN
    CREATE TYPE ticket_priority AS ENUM (
      'NONE',
      'LOW',
      'MEDIUM',
      'HIGH',
      'URGENT'
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'project_status') THEN
    CREATE TYPE project_status AS ENUM (
      'PLANNING',
      'ACTIVE',
      'ON_HOLD',
      'COMPLETE',
      'ARCHIVED'
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'project_health') THEN
    CREATE TYPE project_health AS ENUM ('GREEN', 'AMBER', 'RED');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'sprint_status') THEN
    CREATE TYPE sprint_status AS ENUM (
      'PLANNED',
      'ACTIVE',
      'COMPLETED',
      'CLOSED'
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "Team" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "User" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  password text NOT NULL DEFAULT '',
  name text NOT NULL,
  phone text,
  role role NOT NULL DEFAULT 'USER',
  "teamId" uuid REFERENCES "Team"(id) ON DELETE SET NULL,
  "githubToken" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "UserNotificationPreference" (
  "userId" uuid PRIMARY KEY REFERENCES "User"(id) ON DELETE CASCADE,
  preferences text NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "Client" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text NOT NULL UNIQUE,
  "isInvited" boolean NOT NULL DEFAULT false,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "UserNotificationPreference" (
  "userId" uuid PRIMARY KEY REFERENCES "User"(id) ON DELETE CASCADE,
  preferences text NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "TeamMembership" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId" uuid NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  "teamId" uuid NOT NULL REFERENCES "Team"(id) ON DELETE CASCADE,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  UNIQUE ("userId", "teamId")
);

CREATE TABLE IF NOT EXISTS "Portfolio" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "Project" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  "teamDescription" text,
  status project_status,
  health project_health,
  progress integer NOT NULL DEFAULT 0,
  "teamId" uuid NOT NULL REFERENCES "Team"(id) ON DELETE CASCADE,
  "portfolioId" uuid REFERENCES "Portfolio"(id) ON DELETE SET NULL,
  "clientId" uuid REFERENCES "Client"(id) ON DELETE SET NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "Milestone" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "projectId" uuid NOT NULL REFERENCES "Project"(id) ON DELETE CASCADE,
  title text NOT NULL,
  "dueDate" timestamptz,
  "completedAt" timestamptz,
  "sortOrder" integer NOT NULL DEFAULT 0,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "Sprint" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "teamId" uuid NOT NULL REFERENCES "Team"(id) ON DELETE CASCADE,
  "projectId" uuid REFERENCES "Project"(id) ON DELETE SET NULL,
  "createdById" uuid NOT NULL REFERENCES "User"(id) ON DELETE RESTRICT,
  name text NOT NULL,
  goal text,
  status sprint_status NOT NULL DEFAULT 'PLANNED',
  "startsAt" timestamptz NOT NULL,
  "endsAt" timestamptz NOT NULL,
  "completedAt" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CHECK ("startsAt" < "endsAt")
);

CREATE TABLE IF NOT EXISTS "Ticket" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  "acceptanceCriteria" text,
  "workType" text NOT NULL DEFAULT 'chore' CHECK (
    "workType" IN (
      'feat',
      'fix',
      'bugfix',
      'chore',
      'docs',
      'refactor',
      'test',
      'perf',
      'hotfix'
    )
  ),
  status ticket_status NOT NULL DEFAULT 'BACKLOG',
  priority ticket_priority NOT NULL DEFAULT 'MEDIUM',
  "creatorId" uuid NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  "assigneeId" uuid REFERENCES "User"(id) ON DELETE SET NULL,
  "clientId" uuid REFERENCES "Client"(id) ON DELETE SET NULL,
  "teamId" uuid NOT NULL REFERENCES "Team"(id) ON DELETE CASCADE,
  "projectId" uuid REFERENCES "Project"(id) ON DELETE SET NULL,
  "startDate" timestamptz,
  "dueDate" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "TicketComment" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "ticketId" uuid NOT NULL REFERENCES "Ticket"(id) ON DELETE CASCADE,
  "authorId" uuid NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  body text NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "TicketAttachment" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "ticketId" uuid NOT NULL REFERENCES "Ticket"(id) ON DELETE CASCADE,
  "uploadedById" uuid NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  filename text NOT NULL,
  "mimeType" text,
  size integer NOT NULL,
  url text NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "TicketChecklistItem" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "ticketId" uuid NOT NULL REFERENCES "Ticket"(id) ON DELETE CASCADE,
  title text NOT NULL,
  completed boolean NOT NULL DEFAULT false,
  "sortOrder" integer NOT NULL DEFAULT 0,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "TicketActivity" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "ticketId" uuid NOT NULL REFERENCES "Ticket"(id) ON DELETE CASCADE,
  "actorId" uuid NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  type text NOT NULL,
  summary text NOT NULL,
  metadata text,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "AuditLog" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "actorId" uuid NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  action text NOT NULL,
  "entityType" text NOT NULL,
  "entityId" text NOT NULL,
  metadata text,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "Document" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  content text,
  "authorId" uuid REFERENCES "User"(id) ON DELETE SET NULL,
  "teamId" uuid REFERENCES "Team"(id) ON DELETE SET NULL,
  "projectId" uuid REFERENCES "Project"(id) ON DELETE SET NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "AutomationRule" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  "trigger" text NOT NULL,
  action text NOT NULL,
  "teamId" uuid REFERENCES "Team"(id) ON DELETE SET NULL,
  enabled boolean NOT NULL DEFAULT true,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "GithubBranch" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "ticketId" uuid NOT NULL REFERENCES "Ticket"(id) ON DELETE CASCADE,
  name text NOT NULL,
  url text NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  UNIQUE ("ticketId", name)
);

CREATE TABLE IF NOT EXISTS "GithubPullRequest" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "ticketId" uuid NOT NULL REFERENCES "Ticket"(id) ON DELETE CASCADE,
  number integer NOT NULL,
  title text NOT NULL,
  url text NOT NULL,
  state text NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  UNIQUE ("ticketId", number)
);

CREATE TABLE IF NOT EXISTS "GithubRepo" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "projectId" uuid NOT NULL REFERENCES "Project"(id) ON DELETE CASCADE,
  owner text NOT NULL,
  name text NOT NULL,
  url text NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  UNIQUE ("projectId", owner, name)
);

CREATE TABLE IF NOT EXISTS "Notification" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId" uuid NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  type text NOT NULL,
  title text NOT NULL,
  body text,
  "ticketId" uuid REFERENCES "Ticket"(id) ON DELETE SET NULL,
  read boolean NOT NULL DEFAULT false,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "ClientObligation" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "ticketId" uuid NOT NULL REFERENCES "Ticket"(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'PENDING',
  "dueAt" timestamptz,
  "submittedAt" timestamptz,
  "reviewedAt" timestamptz,
  "evidenceUrl" text,
  "evidenceNote" text,
  "createdById" uuid NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "ClientFeedback" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL DEFAULT 'PORTAL',
  status text NOT NULL DEFAULT 'NEW',
  "fromEmail" text NOT NULL,
  subject text NOT NULL,
  body text NOT NULL,
  "clientId" uuid REFERENCES "Client"(id) ON DELETE SET NULL,
  "ticketId" uuid REFERENCES "Ticket"(id) ON DELETE SET NULL,
  "teamId" uuid REFERENCES "Team"(id) ON DELETE SET NULL,
  "assignedToId" uuid REFERENCES "User"(id) ON DELETE SET NULL,
  "assignedAt" timestamptz,
  "attachmentJson" text,
  "rawPayload" text,
  "receivedAt" timestamptz NOT NULL DEFAULT now(),
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "SavedView" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId" uuid NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  name text NOT NULL,
  "teamId" uuid REFERENCES "Team"(id) ON DELETE SET NULL,
  filters text NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "OrganizationSettings" (
  id text PRIMARY KEY DEFAULT 'default',
  "ssoEnabled" boolean NOT NULL DEFAULT false,
  "ssoProvider" text,
  "allowedIpRaw" text,
  "dataRetentionDays" integer,
  "backupAutomatic" boolean NOT NULL DEFAULT true,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "PasswordReset" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token text NOT NULL UNIQUE,
  "userId" uuid NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  "expiresAt" timestamptz NOT NULL,
  used boolean NOT NULL DEFAULT false,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE "Ticket"
  ADD COLUMN IF NOT EXISTS "selectorId" integer;

ALTER TABLE "Ticket"
  ADD COLUMN IF NOT EXISTS "sprintId" uuid;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'Ticket_sprintId_fkey'
  ) THEN
    ALTER TABLE "Ticket"
      ADD CONSTRAINT "Ticket_sprintId_fkey"
      FOREIGN KEY ("sprintId") REFERENCES "Sprint"(id) ON DELETE SET NULL;
  END IF;
END $$;

ALTER TABLE "Ticket"
  ADD COLUMN IF NOT EXISTS "workType" text;

UPDATE "Ticket"
SET "workType" = 'chore'
WHERE "workType" IS NULL OR btrim("workType") = '';

ALTER TABLE "Ticket"
  ALTER COLUMN "workType" SET DEFAULT 'chore';

ALTER TABLE "Ticket"
  ALTER COLUMN "workType" SET NOT NULL;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'Ticket_workType_check'
  ) THEN
    ALTER TABLE "Ticket"
      ADD CONSTRAINT "Ticket_workType_check"
      CHECK (
        "workType" IN (
          'feat',
          'fix',
          'bugfix',
          'chore',
          'docs',
          'refactor',
          'test',
          'perf',
          'hotfix'
        )
      );
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "Ticket_selectorId_key"
  ON "Ticket"("selectorId")
  WHERE "selectorId" IS NOT NULL;

ALTER TABLE "Document"
  ADD COLUMN IF NOT EXISTS "authorId" uuid;

ALTER TABLE "Document"
  ADD COLUMN IF NOT EXISTS "teamId" uuid;

ALTER TABLE "Document"
  ADD COLUMN IF NOT EXISTS "projectId" uuid;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'Document_authorId_fkey'
  ) THEN
    ALTER TABLE "Document"
      ADD CONSTRAINT "Document_authorId_fkey"
      FOREIGN KEY ("authorId") REFERENCES "User"(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'Document_teamId_fkey'
  ) THEN
    ALTER TABLE "Document"
      ADD CONSTRAINT "Document_teamId_fkey"
      FOREIGN KEY ("teamId") REFERENCES "Team"(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'Document_projectId_fkey'
  ) THEN
    ALTER TABLE "Document"
      ADD CONSTRAINT "Document_projectId_fkey"
      FOREIGN KEY ("projectId") REFERENCES "Project"(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "InviteToken" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token text NOT NULL UNIQUE,
  email text NOT NULL,
  role role NOT NULL DEFAULT 'USER',
  "expiresAt" timestamptz NOT NULL,
  used boolean NOT NULL DEFAULT false,
  "createdBy" uuid REFERENCES "User"(id) ON DELETE SET NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "BackupSnapshot" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL,
  "triggerType" text NOT NULL,
  "generatedAt" timestamptz NOT NULL DEFAULT now(),
  "generatedById" uuid REFERENCES "User"(id) ON DELETE SET NULL,
  "generatedByEmail" text,
  "generatedByName" text,
  snapshot text NOT NULL,
  "tableCounts" text NOT NULL,
  "restoredAt" timestamptz,
  "restoredById" uuid REFERENCES "User"(id) ON DELETE SET NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ticket_team ON "Ticket"("teamId");
CREATE INDEX IF NOT EXISTS idx_ticket_creator ON "Ticket"("creatorId");
CREATE INDEX IF NOT EXISTS idx_ticket_assignee ON "Ticket"("assigneeId");
CREATE INDEX IF NOT EXISTS idx_ticket_client ON "Ticket"("clientId");
CREATE INDEX IF NOT EXISTS idx_ticket_project ON "Ticket"("projectId");
CREATE INDEX IF NOT EXISTS idx_ticket_sprint ON "Ticket"("sprintId");
CREATE INDEX IF NOT EXISTS idx_ticket_status ON "Ticket"(status);
CREATE INDEX IF NOT EXISTS idx_ticket_priority ON "Ticket"(priority);
CREATE INDEX IF NOT EXISTS idx_project_team ON "Project"("teamId");
CREATE INDEX IF NOT EXISTS idx_project_client ON "Project"("clientId");
CREATE INDEX IF NOT EXISTS idx_project_portfolio ON "Project"("portfolioId");
CREATE INDEX IF NOT EXISTS idx_milestone_project ON "Milestone"("projectId");
CREATE INDEX IF NOT EXISTS idx_sprint_team ON "Sprint"("teamId");
CREATE INDEX IF NOT EXISTS idx_sprint_project ON "Sprint"("projectId");
CREATE INDEX IF NOT EXISTS idx_sprint_team_status ON "Sprint"("teamId", status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_sprint_one_active_per_team
  ON "Sprint"("teamId")
  WHERE status = 'ACTIVE';
CREATE INDEX IF NOT EXISTS idx_comment_ticket ON "TicketComment"("ticketId");
CREATE INDEX IF NOT EXISTS idx_attachment_ticket ON "TicketAttachment"("ticketId");
CREATE INDEX IF NOT EXISTS idx_checklist_ticket ON "TicketChecklistItem"("ticketId");
CREATE INDEX IF NOT EXISTS idx_activity_ticket ON "TicketActivity"("ticketId");
CREATE INDEX IF NOT EXISTS idx_activity_actor ON "TicketActivity"("actorId");
CREATE INDEX IF NOT EXISTS idx_audit_actor ON "AuditLog"("actorId");
CREATE INDEX IF NOT EXISTS idx_document_author ON "Document"("authorId");
CREATE INDEX IF NOT EXISTS idx_document_team ON "Document"("teamId");
CREATE INDEX IF NOT EXISTS idx_document_project ON "Document"("projectId");
CREATE INDEX IF NOT EXISTS idx_notification_user ON "Notification"("userId");
CREATE INDEX IF NOT EXISTS idx_client_obligation_ticket ON "ClientObligation"("ticketId");
CREATE INDEX IF NOT EXISTS idx_client_obligation_status ON "ClientObligation"(status);
CREATE INDEX IF NOT EXISTS idx_client_feedback_status ON "ClientFeedback"(status);
CREATE INDEX IF NOT EXISTS idx_client_feedback_received ON "ClientFeedback"("receivedAt");
CREATE INDEX IF NOT EXISTS idx_client_feedback_team ON "ClientFeedback"("teamId");
CREATE INDEX IF NOT EXISTS idx_client_feedback_ticket ON "ClientFeedback"("ticketId");
CREATE INDEX IF NOT EXISTS idx_client_feedback_assignee ON "ClientFeedback"("assignedToId");
CREATE INDEX IF NOT EXISTS idx_saved_view_user ON "SavedView"("userId");
CREATE INDEX IF NOT EXISTS idx_passwordreset_user ON "PasswordReset"("userId");
CREATE INDEX IF NOT EXISTS idx_passwordreset_token ON "PasswordReset"(token);
CREATE INDEX IF NOT EXISTS idx_invitetoken_email ON "InviteToken"(email);
CREATE INDEX IF NOT EXISTS idx_invitetoken_expiresat ON "InviteToken"("expiresAt");
CREATE INDEX IF NOT EXISTS idx_backups_generatedat ON "BackupSnapshot"("generatedAt");
CREATE INDEX IF NOT EXISTS idx_backups_trigger ON "BackupSnapshot"("triggerType");
CREATE INDEX IF NOT EXISTS idx_backups_createdat ON "BackupSnapshot"("createdAt");

INSERT INTO "OrganizationSettings" (id)
VALUES ('default')
ON CONFLICT (id) DO NOTHING;
