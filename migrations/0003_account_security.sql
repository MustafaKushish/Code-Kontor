-- E-Mail-Bestätigung, Passwort zurücksetzen und Einladungen.

ALTER TABLE users ADD COLUMN email_verified_at TEXT;

-- Einmal-Links per E-Mail. Gespeichert wird nur der Hash des Tokens.
CREATE TABLE user_tokens (
  token_hash  TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL CHECK (kind IN ('verify', 'reset')),
  expires_at  TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX user_tokens_user ON user_tokens(user_id);

-- Einladungen ins Team. Die Person wählt ihr Passwort selbst.
CREATE TABLE invites (
  id          TEXT PRIMARY KEY,
  token_hash  TEXT NOT NULL UNIQUE,
  tenant_id   TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email       TEXT NOT NULL COLLATE NOCASE,
  name        TEXT NOT NULL,
  role        TEXT NOT NULL CHECK (role IN ('admin', 'staff')),
  invited_by  TEXT REFERENCES users(id) ON DELETE SET NULL,
  expires_at  TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX invites_tenant ON invites(tenant_id);
