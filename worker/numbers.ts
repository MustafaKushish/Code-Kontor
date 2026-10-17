// Fortlaufende Nummern für Aufträge, Bons, Projekte und Mitglieder.
// Höchste vergebene Nummer plus eins: Zählen der Zeilen würde nach einem Löschen
// eine Nummer doppelt vergeben, und das Anlegen scheitert dann an UNIQUE.

/** Nächste Nummer hinter prefix, z. B. prefix „WO-2026-“ und vorhandenes „WO-2026-0042“ → 43. */
export function nextNumber(sql: SqlStorage, table: string, column: string, prefix: string, first = 1): number {
  const row = sql
    .exec<{ n: number | null }>(
      `SELECT MAX(CAST(substr(${column}, ?) AS INTEGER)) AS n FROM ${table} WHERE substr(${column}, 1, ?) = ? AND substr(${column}, ?) GLOB '[0-9]*'`,
      prefix.length + 1, prefix.length, prefix, prefix.length + 1,
    )
    .toArray()[0];
  return row?.n ? Math.max(first, row.n + 1) : first;
}

export const berlinYear = () => Number(new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Berlin" }).slice(0, 4));

/** Kalendertag in Deutschland zu einem Zeitpunkt; nimmt auch „YYYY-MM-DD HH:MM:SS“ aus SQLite (UTC ohne Zone). */
export function berlinDayOf(stamp: string): string {
  const iso = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(stamp) ? `${stamp.replace(" ", "T")}Z` : stamp;
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: "Europe/Berlin" });
}
