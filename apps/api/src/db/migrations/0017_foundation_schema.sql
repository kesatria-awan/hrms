-- Section 1: Add new columns to users table
ALTER TABLE users ADD COLUMN avatar_url TEXT;--> statement-breakpoint
ALTER TABLE users ADD COLUMN password_hash TEXT;--> statement-breakpoint
ALTER TABLE users ADD COLUMN password_hasher TEXT;--> statement-breakpoint
ALTER TABLE users ADD COLUMN email_verified_at INTEGER;--> statement-breakpoint
ALTER TABLE users ADD COLUMN google_id TEXT;--> statement-breakpoint
ALTER TABLE users ADD COLUMN clerk_id TEXT;--> statement-breakpoint

-- Section 2: Copy current ID to clerk_id for all existing users
UPDATE users SET clerk_id = id;--> statement-breakpoint

-- Section 3: Add unique indexes for new columns
CREATE UNIQUE INDEX IF NOT EXISTS users_google_id_unique ON users(google_id) WHERE google_id IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS users_clerk_id_unique ON users(clerk_id) WHERE clerk_id IS NOT NULL;--> statement-breakpoint

-- Section 4: Create new auth tables
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  family_id TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  revoked_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS refresh_tokens_user_id_idx ON refresh_tokens(user_id);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS refresh_tokens_expires_at_idx ON refresh_tokens(expires_at);--> statement-breakpoint

CREATE TABLE IF NOT EXISTS email_verifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at INTEGER NOT NULL,
  used_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS email_verifications_user_id_idx ON email_verifications(user_id);--> statement-breakpoint

CREATE TABLE IF NOT EXISTS password_resets (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at INTEGER NOT NULL,
  used_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS password_resets_user_id_idx ON password_resets(user_id);
