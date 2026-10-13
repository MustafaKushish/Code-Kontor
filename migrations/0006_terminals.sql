-- Stempel-Terminals (Tablet am Eingang oder eigenes Gerät mit Chip-Leser). Gespeichert wird nur der Hash des Schlüssels.
CREATE TABLE terminals (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  last_seen_at TEXT
);
CREATE INDEX terminals_tenant ON terminals(tenant_id);
