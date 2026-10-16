# Fitnessstudio & Kurse (Mitgliederkartei, Kursplan, Theken-Check-In & Tarife)

Vollständiges Branchenmodul für Fitnessstudios, Yoga- & Pilates-Studios, Kampfsportschulen und Sportstätten mit Theken-Check-In, Live-Studioauslastung, Mitgliederverwaltung, Kursbuchungen und Kassenanbindung.

## User Review & Critical Decisions

> [!IMPORTANT]
> Das Modul wird gemäß den bestätigten Benutzerentscheidungen auf die drei Säulen **Mitgliederverwaltung**, **wöchentlicher Kursplan** und **schneller Theken-Check-In mit QR-Code / Mitgliedsnummer** ausgerichtet. Beim Check-In am Empfang wird der Mitgliedsstatus sofort optisch validiert (Aktiv vs. Gesperrt / Abgelaufen) und die Studioauslastung in Echtzeit berechnet.

- **Bestätigte Entscheidungen aus Phase 1**:
  - **Funktionaler Schwerpunkt**: Mitgliederverwaltung, interaktiver Kursplan und schneller Check-In am Empfang.
  - **Check-In-Modus**: Schneller Theken-Check-In mit QR-Code, Barcode-Scanner oder Mitgliedsnummer mit sofortiger Statusanzeige.
- **Katalog-Integration**: Neues Modul `fitness` mit Icon `dumbbell` (bzw. HeartPulse/Activity), Status `"ready"` und Integration in Shell, Command-Palette und Rechtesystem.
- **Kassen- & Zusatzverkäufe**: Direkte Übergabe von Thekenkäufen (Proteindrinks, Riegel, Handtuchverleih) an die Plattform-Kasse (`kasse`).

---

## 1. Overview & Core Concept

- **Was es macht**: Eine vollständige Studio-Management-Lösung für den Empfangstresen, Trainer und Studiobetreiber. Ermöglicht die sekundenschnelle Erfassung von Mitgliederbesuchen per Barcode/QR-Code, zeigt die aktuelle Studioauslastung live an, verwaltet Mitgliedschaftstarife und organisiert Kursbuchungen mit Teilnehmerbegrenzung.
- **Zielgruppe**: Studioinhaber, Theken- und Empfangspersonal, Fitnesstrainer, Kursleiter und Servicemitarbeiter.
- **Kernwert**: Beseitigung von Staus am Empfangstresen, sofortige Erkennung ungültiger Mitgliedschaften, transparente Kursauslastung und lückenlose Erfassung aller Studiobesuche.

---

## 2. User Experience & Visual Design

Gemäß den Richtlinien für **SaaS & Dashboards** und **Mobile/Touch Apps**:

- **Touch-First Theken-Ergonomie**:
  - Schnelle Eingabemaske für Barcode-Scanner und Zahlenblock am Empfang.
  - Großformatige optische Statusanzeigen:
    - **Grünes Signal (`#16A34A`)**: *Check-In erfolgreich · Mitglied aktiv · All-Inclusive Tarif*
    - **Rotes Warnsignal (`#DC2626`)**: *Zugang verwehrt · Vertrag abgelaufen oder Beitrag offen*
    - **Gelbes Signal (`#D97706`)**: *10er-Karte fast aufgebraucht (noch 1 Besuch)*
- **Live-Auslastungsanzeige**:
  - Dynamischer Fortschrittsbalken mit Farbübergang: *48 / 120 Personen im Studio (40 % Auslastung)*.
- **Zero-Pill Disziplin**:
  - Typografisch geordnete Status- und Metadatenzeilen ohne störende bunte Kapseln: *#M-1042 · All-Inclusive · 3 Besuche diese Woche · Letzter Check-In vor 2 Std.*
- **Hauptansichten**:
  1. **Empfang & Theken-Check-In (`CheckInTab`)**:
     - Schnelle Barcode-/Nummern-Suche mit Sofort-Validierung.
     - Liste aller aktuell im Studio eingecheckten Gäste mit Aufenthaltsdauer und 1-Klick-Check-Out.
  2. **Mitgliederkartei & Verträge (`MembersTab`)**:
     - Vollständige Mitgliederliste mit Such- und Statusfiltern (*Aktiv*, *Pausiert*, *Gekündigt*, *Gesperrt*).
     - Vertragsdetails: Tarif, Monatsbeitrag, Laufzeit, Zahlart, Notfallkontakt.
     - Detail-Drawer mit Check-In Historie und Besuchsfrequenz.
  3. **Kursplan & Kursbuchung (`ClassesTab`)**:
     - Wöchentliche Kursübersicht (Yoga, Spinning, HIIT, Pilates, CrossFit, Rückenfit).
     - Trainername, Raum, Uhrzeit, maximale Teilnehmerzahl und freie Plätze.
     - 1-Klick-Buchung für Mitglieder mit Warnung bei voller Teilnehmerzahl.
  4. **Tarife & 10er-Karten (`PlansTab`)**:
     - Tarifmodelle: Basic, Premium, All-Inclusive, 10er-Karte, Schüler/Student.
     - Monatsbeitrag, Kündigungsfristen, Inklusivleistungen (z. B. Sauna, Getränke-Flat).
  5. **Druckansichten (`FitnessPrint`)**:
     - DIN-A4-Mitgliedsvertrag mit SEPA-Lastschriftmandat und Hausordnung.
     - Druckbarer Mitgliedsausweis mit Barcode / QR-Code für den Schlüsselanhänger oder Geldbeutel.

---

## 3. Key Product Decisions & Trade-Offs

- **Entscheidung 1: Hybrid-Check-In (Hardware-Scanner & Touch-Zahlenblock)**:
  - *Gewählter Ansatz*: Das Check-In-Feld reagiert sowohl auf Tastatur-Eingaben gängiger USB-/Bluetooth-Barcodescanner als auch auf Touch-Suche per Name oder Mitgliedsnummer.
  - *Warum*: Ermöglicht blitzschnellen Check-In im laufenden Stoßzeitenbetrieb ohne Mausinteraktion.
- **Entscheidung 2: Live-Auslastungszähler mit Check-Out**:
  - *Gewählter Ansatz*: Gäste können beim Verlassen des Studios mit einem Klick oder Scan ausgecheckt werden; automatische Bereinigung überfälliger Check-Ins nach Betriebsschluss.
  - *Warum*: Brandschutz und Studioleiter benötigen exakte Zahlen, wie viele Personen sich zeitgleich im Gebäude befinden.
- **Entscheidung 3: Nahtlose Verknüpfung mit dem Kassenmodul**:
  - *Gewählter Ansatz*: Thekenverkäufe (Shakes, Riegel, Zubehör) können direkt auf das Mitgliedskonto gebucht oder bar/mit Karte an der Kasse bezahlt werden.

---

## 4. Technical Architecture & Data Strategy

```
┌─────────────────────────────────────────────────────────────────────────┐
│                       Code Kontor Shell & Router                        │
│   ┌─────────────────────────────┬─────────────────────────────────┐     │
│   │ /app/fitness (App.tsx)      │ /katalog/fitness                │     │
│   └──────────────┬──────────────┴────────────────┬────────────────┘     │
└──────────────────┼───────────────────────────────┼──────────────────────┘
                   ▼                               ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        FitnessApp (Workspace)                           │
│ ├─ CheckInTab (Theken-Check-In, Barcode-Prüfung & Live-Auslastung)      │
│ ├─ MembersTab (Mitgliederkartei, Verträge & Check-In Historie)          │
│ ├─ ClassesTab (Wöchentlicher Kursplan, Trainer & Teilnehmerlisten)      │
│ ├─ PlansTab (Tarife, Monatsbeiträge & 10er-Karten)                      │
│ └─ FitnessPrint (Mitgliedsvertrag, SEPA-Mandat & Ausweis)               │
└──────────────────┬──────────────────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────────────────┐
│           Backend API (/worker/fitness/ & worker/tenant.ts)             │
│  ├─ GET /fitness/stats (Aktive Mitglieder, Auslastung live, Kurse)      │
│  ├─ POST /fitness/check-in (Schnell-Check-In mit Validierung & Signal)  │
│  ├─ POST /fitness/check-out/:id (Mitglied auschecken)                   │
│  ├─ GET /fitness/active-visits (Liste aller aktuell anwesenden Gäste)   │
│  ├─ GET/POST/PUT /fitness/members (Mitgliederkartei, Status, Tarife)    │
│  ├─ GET/POST/PUT /fitness/classes (Kurse, Termine, Buchungslisten)      │
│  ├─ POST /fitness/classes/:id/book (Mitglied in Kurs einbuchen)         │
│  └─ GET/POST/PUT /fitness/plans (Tarifmodelle & Monatsbeiträge)         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Datenmodelle (`shared/fitness.ts`)
- `FitnessMember`: ID, memberNumber (z. B. `M-1042`), firstName, lastName, email, phone, birthDate, planId, planName, monthlyFee, status (`aktiv`, `pausiert`, `gekuendigt`, `gesperrt`), joinDate, validUntil, checkInsCount, remainingUnits (für 10er-Karten), notes, emergencyContact.
- `FitnessCheckIn`: ID, memberId, memberNumber, memberName, planName, checkedInAt, checkedOutAt, status (`anwesend`, `verlassen`).
- `FitnessClass`: ID, name, coachName, weekday, startTime, endTime, room, maxParticipants, bookedMemberIds, description.
- `FitnessPlan`: ID, name, priceMonthly, admissionFee, durationMonths, includesSauna, includesCourses, includesDrinks, active.
- `FitnessStats`: activeMembersCount, checkedInNowCount, maxCapacity, classesTodayCount, monthlyRevenueGross, visitsTodayCount.

---

## 5. Execution Steps

1. **Typdefinitionen**: `shared/fitness.ts` mit Datenmodellen für Mitglieder, Check-Ins, Kurse, Tarife und Statistiken erstellen.
2. **Katalog & Navigation**: `shared/apps.ts` um `fitness` erweitern (`status: "ready"`), Icon `dumbbell` (Dumbbell) in `src/components.tsx` registrieren; alle Sprachdateien in `src/i18n/` synchronisieren.
3. **Backend-Implementierung**:
   - `worker/fitness/store.ts` mit SQLite-Tabellen, Check-In Validierung und realistischen Beispieldaten (Mitglieder, aktive Kurse, aktuelle Studiobesuche).
   - `worker/fitness/routes.ts` mit REST-Endpunkten für Check-In/Check-Out, Mitgliederverwaltung, Kursbuchungen und Tarife.
   - Bindung in `worker/tenant.ts` und `worker/index.ts`.
4. **Frontend-Komponenten (`src/modules/fitness/`)**:
   - `FitnessApp.tsx`: Shell mit Tab-Navigation und KPI-Leiste (Anwesend live, Studioauslastung, Aktive Mitglieder, Kurse heute).
   - `CheckInTab.tsx`: Großes Theken-Terminal mit Barcode-/Nummern-Scan, optischer Rückmeldung und Gästeliste.
   - `MembersTab.tsx`: Mitgliederkartei mit Detail-Drawer, Vertragsübersicht und Check-In Verlauf.
   - `ClassesTab.tsx`: Wöchentlicher Kursplan mit Trainer, Teilnehmer-Zähler und Schnell-Einbuchung.
   - `PlansTab.tsx`: Tarifverwaltung mit Monatsbeiträgen, Aufnahmegebühren und Inklusivleistungen.
   - `FitnessPrint.tsx`: DIN-A4-Mitgliedsvertrag mit SEPA-Mandat und druckbarem Mitgliedsausweis.
5. **Routing & Verifikation**:
   - `src/App.tsx` um `/app/fitness` erweitern.
   - Build mit `compile_applet` und Typencheck mit `lint_applet` verifizieren.
