# Code Kontor

Eine Plattform mit fertigen Branchen-Systemen (Friseur, Werkstatt, Restaurant, Einzelhandel, Handyshop …),
monatlich mietbar. Der Kunde legt ein Konto an, trägt seine Firmendaten ein und installiert das passende System.
Läuft als installierbare App auf Handy, Tablet und Laptop.

## Aufbau

| Teil | Wo | Was |
|---|---|---|
| Oberfläche | `src/` | React-App (PWA): Anmeldung, Einrichtungs-Assistent, Übersicht, App-Katalog, Team, Firma |
| App-Katalog | `shared/apps.ts` | Alle Branchen-Systeme mit Funktionen, Farbe und Preis (Preise sind Platzhalter) |
| Server | `worker/` | Cloudflare Worker mit Hono, alle Wege unter `/api` |
| Plattform-Datenbank | `migrations/` (Cloudflare D1) | Firmen-Verzeichnis, Benutzer, Sitzungen |
| Datenbank je Kunde | `worker/tenant.ts` (Durable Object mit SQLite) | Firmendaten und später alle Geschäftsdaten, getrennt je Firma |
| Sprachen | `src/i18n/` | 10 Sprachen: Deutsch, Englisch, Türkisch, Arabisch (von rechts nach links), Französisch, Spanisch, Italienisch, Polnisch, Russisch, Ukrainisch. Deutsch ist die Vorlage, die anderen werden bei Bedarf nachgeladen |
| KI-Assistent | `worker/assistant.ts`, `src/layout/Assistant.tsx` | Chat für Inhaber und Team, antwortet in der gewählten Sprache (Claude, Modell `claude-opus-5-5`), 50 Fragen pro Person und Tag |
| Gemeinsame Prüfungen | `shared/` | IBAN, Steuernummer, USt-IdNr., PLZ – im Browser und auf dem Server gleich |

Jede Firma bekommt bei der Anmeldung automatisch ihre eigene SQLite-Datenbank (ein Durable Object je Firma).
Daten verschiedener Kunden liegen damit physisch getrennt.

Rollen: **Inhaber** (alles), **Admin** (Firmendaten, Mitarbeiter verwalten), **Mitarbeiter** (nur arbeiten).

## Lokal starten

```bash
npm install
npm run db:migrate:local
npm run dev          # baut die Oberfläche und startet http://localhost:8787
npm test             # Unit-Tests
npm run typecheck
```

## Bei Cloudflare veröffentlichen

1. `npx wrangler login`
2. `npx wrangler d1 create code-kontor-platform` und die ausgegebene `database_id` in `wrangler.jsonc` eintragen
3. `npm run db:migrate:remote`
4. `npx wrangler secret put ANTHROPIC_API_KEY` – Schlüssel aus der Claude Console für den KI-Assistenten (ohne Schlüssel zeigt der Chat „noch nicht eingerichtet“)
5. `npm run deploy`

Lokal liest `wrangler dev` den Schlüssel aus einer Datei `.dev.vars` mit der Zeile `ANTHROPIC_API_KEY=...` (nicht einchecken).

Neue Texte kommen zuerst in `src/i18n/de.ts`; TypeScript und `test/i18n.test.ts` melden jede Sprache, in der sie noch fehlen.
Fehler schickt der Server als Code (`worker/errors.ts`), übersetzt wird im Browser.

## Fahrplan

1. **Plattform-Kern** – Konto, Login, Rollen, Firmendaten-Assistent, Datenbank je Kunde, installierbare App ✔
2. **App-Katalog** – Branchen-System auswählen und mit einem Klick installieren, modernes Design ✔
3. **10 Sprachen und KI-Assistent** für Inhaber und Team ✔ (KI für Endkunden kommt mit den Kundenseiten der Module)
4. **Erstes fertiges System** – Einzelhandel: Artikel, Lager, Kasse
5. **Abo und Start** – Stripe-Abo, automatische Einrichtung, Admin-Konsole, erster Kunde
