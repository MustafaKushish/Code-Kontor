-- Fehlversuche bei der Anmeldung, je E-Mail und je IP-Adresse.
-- Nach zu vielen Fehlversuchen wird die Anmeldung für eine Weile gesperrt.
CREATE TABLE login_attempts (
  key           TEXT PRIMARY KEY,
  failures      INTEGER NOT NULL DEFAULT 0,
  window_start  TEXT NOT NULL
);
