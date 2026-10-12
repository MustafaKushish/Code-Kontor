-- Plattform-Verzeichnis. Die Geschäftsdaten jeder Firma liegen NICHT hier,
-- sondern in ihrer eigenen Datenbank (Durable Object "TenantDatabase").

CREATE TABLE tenants (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE users (
  id             TEXT PRIMARY KEY,
  tenant_id      TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email          TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name           TEXT NOT NULL,
  role           TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'staff')),
  password_hash  TEXT NOT NULL,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX users_tenant ON users(tenant_id);

CREATE TABLE sessions (
  token_hash  TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at  TEXT NOT NULL
);
CREATE INDEX sessions_user ON sessions(user_id);
