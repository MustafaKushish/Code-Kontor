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
| KI-Assistent | `worker/assistant.ts`, `src/layout/Assistant.tsx` | Chat für Inhaber und Team, antwortet in der gewählten Sprache (Google Gemini, Modell `gemini-flash-latest`, kostenlos nutzbar), 50 Fragen pro Person und Tag |
| Kasse | `worker/pos/`, `src/pos/`, `shared/pos.ts` | Eine Kasse für alle Systeme unter `/kasse`: Bar, Karte, Überweisung, Gutschein, Aufteilen, Rückgeld, ein Nummernkreis für alle Belege, Storno als Gegenbeleg, Kassenbuch mit Tagesabschluss (Z-Bon). Buchbar als Zusatzmodul `kasse` im App-Katalog: Artikelstamm mit EAN und Bestand, Barcode-Scanner (Tastatur-Scanner und Kamera), mehrere Kassenplätze mit eigenem Kassenbuch (Gerät schickt `x-pos-register`), Vollbild-Kassenmodus unter `/kasse/modus` (startet direkt, abschaltbar) mit Warengruppen-Leiste, Artikelraster, Bon und Ziffernblock (Menge, Rabatt, Preis, Rücknahme), Artikelnummern zum Eintippen, Schnellknöpfe Bar und Karte (ein Tipp bucht passend), Storno, Bon-Schalter (automatischer Druck an/aus, pro Gerät) und letzte Belege des Kassenplatzes zum Nachdrucken. Kassenmodus im Stil der Übersicht: dunkle Kopfleiste mit Uhr, Farbton je Warengruppe. Module liefern ihr Sortiment mit Warengruppe über `catalog()` (`@modul.gruppe` übersetzt die Kasse). Module liefern nur Posten (`PosModule` in `worker/pos/store.ts`, optional `scan`) und reagieren auf Buchung und Storno |
| Auswertung | `src/pages/Insights.tsx`, `shared/insights.ts`, `GET /api/insights` | Ein Dashboard unter `/auswertung` für Inhaber und Admins: Umsatz mit Vergleich zum Zeitraum davor (laufender Zeitraum nur bis zum selben Tag), Verlauf, Belege, Ø pro Beleg, Stornos, Zahlarten, Warengruppen, Top-Artikel, Stoßzeiten, Umsatz je System, offene Aufträge des Handy- & IT-Service und gestempelte Arbeitszeit. Zeitraum Tag, Woche, Monat oder Jahr. Umsatz kommt nur aus den Belegen der Kasse (dort laufen auch die Module durch), deshalb zählt nichts doppelt |
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

**Automatisch über GitHub:** Jeder Push auf `main` (und den Arbeitsbranch) veröffentlicht die App über `.github/workflows/deploy.yml`.
Dafür braucht das Repository die Secrets `CLOUDFLARE_API_TOKEN` und `CLOUDFLARE_ACCOUNT_ID`, für den KI-Assistenten zusätzlich `GEMINI_API_KEY`, für den E-Mail-Versand `RESEND_API_KEY` und `MAIL_FROM` (z. B. `Code Kontor <noreply@deine-domain.de>`, die Domain muss bei Resend bestätigt sein), für die Abo-Bezahlung `STRIPE_SECRET_KEY` (`sk_test_…` zum Testen, später `sk_live_…`). Den Stripe-Webhook legt das Veröffentlichen selbst an (Adresse aus der Repository-Variable `APP_URL`, sonst `https://codekontor.net`).
Die Plattform-Datenbank wird beim ersten Lauf automatisch angelegt. Die Adresse steht danach in der Zusammenfassung des Laufs.

**Von Hand:**

1. `npx wrangler login`
2. `npx wrangler d1 create code-kontor-platform` und die ausgegebene `database_id` in `wrangler.jsonc` eintragen
3. `npm run db:migrate:remote`
4. `npx wrangler secret put GEMINI_API_KEY` – kostenloser Schlüssel aus Google AI Studio (aistudio.google.com) für den KI-Assistenten (ohne Schlüssel zeigt der Chat „noch nicht eingerichtet“)
5. `npm run deploy`

Ohne E-Mail-Versand funktioniert alles weiter: Einladungslinks zeigt die App zum Weitergeben an, Bestätigungs- und Passwort-Links stehen nur im Worker-Protokoll.

Lokal liest `wrangler dev` den Schlüssel aus einer Datei `.dev.vars` mit der Zeile `GEMINI_API_KEY=...` (nicht einchecken).

## Datenspeicherung nur in der EU

Plattform-Datenbank (D1 `code-kontor-platform-eu`) und alle Firmen-Datenbanken (Durable Objects) liegen in der Cloudflare-Jurisdiktion „eu“.
`wrangler dev` kennt keine Jurisdiktionen, deshalb lokal in `.dev.vars` die Zeile `LOCAL_NO_JURISDICTION="1"` eintragen. Online nie setzen.

Neue Texte kommen zuerst in `src/i18n/de.ts`; TypeScript und `test/i18n.test.ts` melden jede Sprache, in der sie noch fehlen.
Fehler schickt der Server als Code (`worker/errors.ts`), übersetzt wird im Browser.

## Fahrplan

1. **Plattform-Kern** – Konto, Login, Rollen, Firmendaten-Assistent, Datenbank je Kunde, installierbare App ✔
2. **App-Katalog** – Branchen-System auswählen und mit einem Klick installieren, modernes Design ✔
3. **10 Sprachen und KI-Assistent** für Inhaber und Team ✔ (KI für Endkunden kommt mit den Kundenseiten der Module)
4. **Erstes fertiges System** – Einzelhandel: Artikel, Lager, Kasse (die gemeinsame Kasse steht; als Nächstes TSE-Anbindung für Deutschland, z. B. fiskaly, und Kartenterminal)
5. **Abo und Start** – Stripe-Abo, automatische Einrichtung, Admin-Konsole, erster Kunde
