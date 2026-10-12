-- Geräte-Übersicht und Zwei-Faktor-Anmeldung.

ALTER TABLE sessions ADD COLUMN created_at TEXT;
ALTER TABLE sessions ADD COLUMN last_seen_at TEXT;
ALTER TABLE sessions ADD COLUMN user_agent TEXT;

-- Geheimnis für die Authenticator-App (verschlüsselt) und Hashes der Notfall-Codes (JSON-Liste)
ALTER TABLE users ADD COLUMN totp_secret TEXT;
ALTER TABLE users ADD COLUMN recovery_codes TEXT;

-- Zwischenschritt bei der Anmeldung: Passwort stimmt, Code aus der App fehlt noch
CREATE TABLE login_challenges (
  token_hash  TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at  TEXT NOT NULL,
  attempts    INTEGER NOT NULL DEFAULT 0
);
