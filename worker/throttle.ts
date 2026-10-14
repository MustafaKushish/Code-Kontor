// Schutz gegen Passwort-Raten: Fehlversuche je E-Mail und je IP-Adresse zählen.
// Nach zu vielen Fehlversuchen in einem Zeitfenster ist die Anmeldung gesperrt, bis das Fenster abläuft.

export const LOGIN_WINDOW_MINUTES = 15;
export const MAX_FAILURES_PER_EMAIL = 5;
export const MAX_FAILURES_PER_IP = 30;

const windowStart = (now: number) => new Date(now - LOGIN_WINDOW_MINUTES * 60_000).toISOString();

export function attemptKeys(email: string, ip: string | undefined) {
  return [
    { key: `email:${email}`, limit: MAX_FAILURES_PER_EMAIL },
    ...(ip ? [{ key: `ip:${ip}`, limit: MAX_FAILURES_PER_IP }] : []),
  ];
}

/** true, wenn für eine der Kennungen schon zu viele Fehlversuche im aktuellen Fenster vorliegen. */
export async function isLocked(db: D1Database, keys: { key: string; limit: number }[], now = Date.now()): Promise<boolean> {
  const since = windowStart(now);
  for (const { key, limit } of keys) {
    const row = await db.prepare("SELECT failures FROM login_attempts WHERE key = ? AND window_start > ?")
      .bind(key, since)
      .first<{ failures: number }>();
    if (row && row.failures >= limit) return true;
  }
  return false;
}

/** Fehlversuch zählen. Ist das alte Fenster abgelaufen, beginnt ein neues. */
export async function recordFailure(db: D1Database, keys: { key: string }[], now = Date.now()): Promise<void> {
  const nowIso = new Date(now).toISOString();
  const since = windowStart(now);
  await db.batch(
    keys.map(({ key }) =>
      db.prepare(
        `INSERT INTO login_attempts (key, failures, window_start) VALUES (?1, 1, ?2)
         ON CONFLICT(key) DO UPDATE SET
           failures = CASE WHEN window_start > ?3 THEN failures + 1 ELSE 1 END,
           window_start = CASE WHEN window_start > ?3 THEN window_start ELSE ?2 END`,
      ).bind(key, nowIso, since),
    ),
  );
}

/** Nach erfolgreicher Anmeldung zählen die Fehlversuche für diese E-Mail nicht mehr. */
export async function clearFailures(db: D1Database, email: string): Promise<void> {
  await clearKey(db, `email:${email}`);
}

export async function clearKey(db: D1Database, key: string): Promise<void> {
  await db.prepare("DELETE FROM login_attempts WHERE key = ?").bind(key).run();
}

/** Fehlversuche beim Zwei-Faktor-Code je Benutzer, über alle Anmeldeversuche hinweg. */
export const twoFactorKey = (userId: string) => ({ key: `2fa:${userId}`, limit: 10 });

/** Neue Firmen je IP-Adresse, gegen massenhaft angelegte Konten und E-Mails an fremde Adressen. */
export const registerKey = (ip: string) => ({ key: `register-ip:${ip}`, limit: 5 });
