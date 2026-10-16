import type {
  FitnessCheckIn,
  FitnessCheckInResult,
  FitnessClass,
  FitnessMember,
  FitnessPlan,
  FitnessStats,
  MemberStatus,
  Weekday,
} from "../../shared/fitness";

export class FitnessError extends Error {
  constructor(public code: string) {
    super(code);
  }
}

export const FITNESS_MIGRATIONS: string[] = [
  `CREATE TABLE fitness_plans (
     id TEXT PRIMARY KEY,
     name TEXT NOT NULL,
     price_monthly REAL NOT NULL DEFAULT 0,
     admission_fee REAL NOT NULL DEFAULT 0,
     duration_months INTEGER NOT NULL DEFAULT 12,
     includes_sauna INTEGER NOT NULL DEFAULT 0,
     includes_courses INTEGER NOT NULL DEFAULT 0,
     includes_drinks INTEGER NOT NULL DEFAULT 0,
     is_pass_10 INTEGER NOT NULL DEFAULT 0,
     active INTEGER NOT NULL DEFAULT 1
   );

   CREATE TABLE fitness_members (
     id TEXT PRIMARY KEY,
     member_number TEXT NOT NULL UNIQUE,
     first_name TEXT NOT NULL,
     last_name TEXT NOT NULL,
     email TEXT NOT NULL DEFAULT '',
     phone TEXT NOT NULL DEFAULT '',
     birth_date TEXT,
     plan_id TEXT NOT NULL,
     plan_name TEXT NOT NULL,
     monthly_fee REAL NOT NULL DEFAULT 0,
     status TEXT NOT NULL DEFAULT 'aktiv',
     join_date TEXT NOT NULL,
     valid_until TEXT,
     check_ins_count INTEGER NOT NULL DEFAULT 0,
     remaining_units INTEGER,
     notes TEXT NOT NULL DEFAULT '',
     emergency_contact TEXT NOT NULL DEFAULT '',
     iban TEXT NOT NULL DEFAULT '',
     created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
   );
   CREATE INDEX fitness_members_number ON fitness_members(member_number);
   CREATE INDEX fitness_members_status ON fitness_members(status);

   CREATE TABLE fitness_checkins (
     id TEXT PRIMARY KEY,
     member_id TEXT NOT NULL,
     member_number TEXT NOT NULL,
     member_name TEXT NOT NULL,
     plan_name TEXT NOT NULL,
     checked_in_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
     checked_out_at TEXT,
     status TEXT NOT NULL DEFAULT 'anwesend'
   );
   CREATE INDEX fitness_checkins_member ON fitness_checkins(member_id);
   CREATE INDEX fitness_checkins_status ON fitness_checkins(status);

   CREATE TABLE fitness_classes (
     id TEXT PRIMARY KEY,
     name TEXT NOT NULL,
     coach_name TEXT NOT NULL,
     weekday TEXT NOT NULL,
     start_time TEXT NOT NULL,
     end_time TEXT NOT NULL,
     room TEXT NOT NULL,
     max_participants INTEGER NOT NULL DEFAULT 15,
     booked_member_ids TEXT NOT NULL DEFAULT '[]',
     description TEXT NOT NULL DEFAULT ''
   );
   CREATE INDEX fitness_classes_weekday ON fitness_classes(weekday);`,
];

export class FitnessStore {
  constructor(private sql: SqlStorage) {
    this.ensureSeedData();
  }

  private ensureSeedData() {
    const existing = this.sql.exec<{ count: number }>("SELECT COUNT(*) AS count FROM fitness_plans").toArray();
    if (existing[0]?.count > 0) return;

    // 1. Tarife anlegen
    const pAll: FitnessPlan = {
      id: "plan-all",
      name: "All-Inclusive Premium",
      priceMonthly: 59.9,
      admissionFee: 29.0,
      durationMonths: 12,
      includesSauna: true,
      includesCourses: true,
      includesDrinks: true,
      isPass10: false,
      active: true,
    };
    const pBasic: FitnessPlan = {
      id: "plan-basic",
      name: "Basic Gym & Cardio",
      priceMonthly: 34.9,
      admissionFee: 29.0,
      durationMonths: 12,
      includesSauna: false,
      includesCourses: false,
      includesDrinks: false,
      isPass10: false,
      active: true,
    };
    const pPass: FitnessPlan = {
      id: "plan-10",
      name: "10er-Karte Flexibel",
      priceMonthly: 120.0,
      admissionFee: 0,
      durationMonths: 6,
      includesSauna: true,
      includesCourses: true,
      includesDrinks: false,
      isPass10: true,
      active: true,
    };
    const pStudent: FitnessPlan = {
      id: "plan-student",
      name: "Student & Azubi",
      priceMonthly: 29.9,
      admissionFee: 19.0,
      durationMonths: 6,
      includesSauna: false,
      includesCourses: true,
      includesDrinks: true,
      isPass10: false,
      active: true,
    };

    for (const p of [pAll, pBasic, pPass, pStudent]) {
      this.createPlan(p);
    }

    // 2. Mitglieder anlegen
    const m1: FitnessMember = {
      id: "mem-1001",
      memberNumber: "M-1001",
      firstName: "Felix",
      lastName: "Hoffmann",
      email: "felix.hoffmann@beispiel.de",
      phone: "+49 171 4589201",
      birthDate: "1991-05-14",
      planId: pAll.id,
      planName: pAll.name,
      monthlyFee: pAll.priceMonthly,
      status: "aktiv",
      joinDate: "2024-04-01",
      validUntil: "2026-03-31",
      checkInsCount: 54,
      notes: "Trainiert bevorzugt früh morgens und besucht Spinning.",
      emergencyContact: "Bruder Jan: +49 171 9922114",
      iban: "DE89370400440532013000",
      createdAt: "2024-04-01T09:00:00Z",
    };

    const m2: FitnessMember = {
      id: "mem-1002",
      memberNumber: "M-1002",
      firstName: "Sarah",
      lastName: "Schneider",
      email: "sarah.schneider@beispiel.de",
      phone: "+49 172 8765432",
      birthDate: "1995-11-20",
      planId: pAll.id,
      planName: pAll.name,
      monthlyFee: pAll.priceMonthly,
      status: "aktiv",
      joinDate: "2024-09-15",
      validUntil: "2026-09-14",
      checkInsCount: 38,
      notes: "Regelmäßige Teilnehmerin Vinyasa Yoga.",
      emergencyContact: "Mutter Anna: +49 172 1122334",
      iban: "DE27200411550987654321",
      createdAt: "2024-09-15T14:30:00Z",
    };

    const m3: FitnessMember = {
      id: "mem-1003",
      memberNumber: "M-1003",
      firstName: "David",
      lastName: "Weber",
      email: "david.weber@beispiel.de",
      phone: "+49 173 1239874",
      birthDate: "1988-02-03",
      planId: pPass.id,
      planName: pPass.name,
      monthlyFee: 0,
      status: "aktiv",
      joinDate: "2026-01-10",
      validUntil: "2026-07-10",
      checkInsCount: 8,
      remainingUnits: 2, // Nur noch 2 Einheiten übrig!
      notes: "10er-Karte Flex. Bei Check-In auf Restguthaben hinweisen.",
      emergencyContact: "+49 40 5544332",
      createdAt: "2026-01-10T11:00:00Z",
    };

    const m4: FitnessMember = {
      id: "mem-1004",
      memberNumber: "M-1004",
      firstName: "Laura",
      lastName: "Becker",
      email: "laura.becker@beispiel.de",
      phone: "+49 175 6677889",
      birthDate: "1993-08-12",
      planId: pBasic.id,
      planName: pBasic.name,
      monthlyFee: pBasic.priceMonthly,
      status: "pausiert",
      joinDate: "2024-02-01",
      validUntil: "2026-01-31",
      checkInsCount: 22,
      notes: "Verletzungspause bis zum 30. des Monats hinterlegt.",
      createdAt: "2024-02-01T10:00:00Z",
    };

    const m5: FitnessMember = {
      id: "mem-1005",
      memberNumber: "M-1005",
      firstName: "Kevin",
      lastName: "Fischer",
      email: "k.fischer@beispiel.de",
      phone: "+49 176 3344556",
      birthDate: "1997-04-25",
      planId: pBasic.id,
      planName: pBasic.name,
      monthlyFee: pBasic.priceMonthly,
      status: "gesperrt",
      joinDate: "2024-08-01",
      checkInsCount: 14,
      notes: "Beitrag offen für Vormonat. Bitte vor Einlass an die Kasse verweisen.",
      createdAt: "2024-08-01T15:00:00Z",
    };

    const m6: FitnessMember = {
      id: "mem-1006",
      memberNumber: "M-1006",
      firstName: "Lena",
      lastName: "Wagner",
      email: "lena.wagner@student.uni.de",
      phone: "+49 179 9876543",
      birthDate: "2002-07-19",
      planId: pStudent.id,
      planName: pStudent.name,
      monthlyFee: pStudent.priceMonthly,
      status: "aktiv",
      joinDate: "2025-10-01",
      validUntil: "2026-09-30",
      checkInsCount: 41,
      notes: "Gültiger Studentenausweis bis SS 2026 vorgelegt.",
      createdAt: "2025-10-01T16:00:00Z",
    };

    for (const m of [m1, m2, m3, m4, m5, m6]) {
      this.createMember(m);
    }

    // 3. Aktive Check-Ins anlegen (Gäste, die gerade trainieren)
    const now = Date.now();
    this.sql.exec(
      `INSERT INTO fitness_checkins (id, member_id, member_number, member_name, plan_name, checked_in_at, status)
       VALUES (?, ?, ?, ?, ?, ?, 'anwesend')`,
      "chk-1",
      m1.id,
      m1.memberNumber,
      `${m1.firstName} ${m1.lastName}`,
      m1.planName,
      new Date(now - 45 * 60 * 1000).toISOString(),
    );
    this.sql.exec(
      `INSERT INTO fitness_checkins (id, member_id, member_number, member_name, plan_name, checked_in_at, status)
       VALUES (?, ?, ?, ?, ?, ?, 'anwesend')`,
      "chk-2",
      m2.id,
      m2.memberNumber,
      `${m2.firstName} ${m2.lastName}`,
      m2.planName,
      new Date(now - 22 * 60 * 1000).toISOString(),
    );
    this.sql.exec(
      `INSERT INTO fitness_checkins (id, member_id, member_number, member_name, plan_name, checked_in_at, status)
       VALUES (?, ?, ?, ?, ?, ?, 'anwesend')`,
      "chk-3",
      m6.id,
      m6.memberNumber,
      `${m6.firstName} ${m6.lastName}`,
      m6.planName,
      new Date(now - 12 * 60 * 1000).toISOString(),
    );

    // 4. Wochenkursplan anlegen
    const courses: FitnessClass[] = [
      {
        id: "class-1",
        name: "Vinyasa Flow Yoga",
        coachName: "Elena Richter",
        weekday: "Montag",
        startTime: "18:00",
        endTime: "19:00",
        room: "Zen-Box (Raum 1)",
        maxParticipants: 16,
        bookedMemberIds: [m2.id, m6.id],
        attendedMemberIds: [],
        description: "Dynamische Yogapraxis mit Atemkontrolle und Tiefenentspannung für alle Level.",
      },
      {
        id: "class-2",
        name: "Indoor Cycling / Spinning HIIT",
        coachName: "Marco Bauer",
        weekday: "Montag",
        startTime: "19:15",
        endTime: "20:15",
        room: "Spinning Arena",
        maxParticipants: 20,
        bookedMemberIds: [m1.id],
        attendedMemberIds: [],
        description: "Hochenergetisches Intervalltraining auf modernen Bikes mit Beats und Wattanzeige.",
      },
      {
        id: "class-3",
        name: "HIIT Full-Body Workout",
        coachName: "Marcel Kraft",
        weekday: "Dienstag",
        startTime: "18:30",
        endTime: "19:30",
        room: "Functional Area",
        maxParticipants: 18,
        bookedMemberIds: [m1.id, m3.id],
        attendedMemberIds: [],
        description: "Kettlebells, Battle Ropes, Plyo-Boxen und maximale Fettverbrennung in Team-Zirkeln.",
      },
      {
        id: "class-4",
        name: "Rückenfit & Mobilität",
        coachName: "Sabine Vogt",
        weekday: "Mittwoch",
        startTime: "10:00",
        endTime: "11:00",
        room: "Zen-Box (Raum 1)",
        maxParticipants: 14,
        bookedMemberIds: [m2.id],
        attendedMemberIds: [],
        description: "Präventives Training für Wirbelsäule, Haltung und Rumpfmuskulatur.",
      },
      {
        id: "class-5",
        name: "Core & Pilates Power",
        coachName: "Elena Richter",
        weekday: "Donnerstag",
        startTime: "18:00",
        endTime: "19:00",
        room: "Zen-Box (Raum 1)",
        maxParticipants: 16,
        bookedMemberIds: [m6.id],
        attendedMemberIds: [],
        description: "Stärkung der Tiefenmuskulatur, des Beckenbodens und Verbesserung der Rumpfstabilität.",
      },
      {
        id: "class-6",
        name: "CrossFit Conditioning",
        coachName: "Marcel Kraft",
        weekday: "Freitag",
        startTime: "17:30",
        endTime: "18:45",
        room: "Functional Box",
        maxParticipants: 15,
        bookedMemberIds: [m1.id, m6.id],
        attendedMemberIds: [],
        description: "Funktionelles Kraft-Ausdauer-Training im WOD-Format mit olympischem Heben und Eigengewicht.",
      },
    ];

    for (const c of courses) {
      this.createClass(c);
    }
  }

  // --- STATS & KPIS ---
  getStats(): FitnessStats {
    const totalMembers = this.sql.exec<{ count: number }>("SELECT COUNT(*) AS count FROM fitness_members").toArray()[0]?.count || 0;
    const activeMembers = this.sql.exec<{ count: number }>("SELECT COUNT(*) AS count FROM fitness_members WHERE status = 'aktiv'").toArray()[0]?.count || 0;
    const checkedInNow = this.sql.exec<{ count: number }>("SELECT COUNT(*) AS count FROM fitness_checkins WHERE status = 'anwesend'").toArray()[0]?.count || 0;
    const totalVisitsToday = this.sql.exec<{ count: number }>(
      "SELECT COUNT(*) AS count FROM fitness_checkins WHERE date(checked_in_at) = date('now')"
    ).toArray()[0]?.count || 0;

    // Monatliche Beitragssumme aller aktiven Mitglieder
    const revenueRow = this.sql.exec<{ sum: number }>(
      "SELECT SUM(monthly_fee) AS sum FROM fitness_members WHERE status = 'aktiv'"
    ).toArray()[0];
    const monthlyRevenueGross = Math.round((revenueRow?.sum || 0) * 100) / 100;

    // Kurse heute (Wochentag ermitteln)
    const weekdays: Weekday[] = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];
    const currentWeekday = weekdays[new Date().getDay()];
    const classesToday = this.sql.exec<{ count: number }>(
      "SELECT COUNT(*) AS count FROM fitness_classes WHERE weekday = ?",
      currentWeekday
    ).toArray()[0]?.count || 0;

    return {
      activeMembersCount: activeMembers,
      totalMembersCount: totalMembers,
      checkedInNowCount: checkedInNow,
      maxCapacity: 120, // Maximale Studioauslastung nach Brandschutz
      classesTodayCount: classesToday,
      monthlyRevenueGross,
      visitsTodayCount: totalVisitsToday,
    };
  }

  // --- CHECK-IN / CHECK-OUT SYSTEM ---
  getActiveVisits(): FitnessCheckIn[] {
    const rows = this.sql.exec<{
      id: string;
      member_id: string;
      member_number: string;
      member_name: string;
      plan_name: string;
      checked_in_at: string;
      checked_out_at: string | null;
      status: string;
    }>("SELECT * FROM fitness_checkins WHERE status = 'anwesend' ORDER BY checked_in_at DESC").toArray();

    return rows.map((r) => ({
      id: r.id,
      memberId: r.member_id,
      memberNumber: r.member_number,
      memberName: r.member_name,
      planName: r.plan_name,
      checkedInAt: r.checked_in_at,
      checkedOutAt: r.checked_out_at || undefined,
      status: r.status as "anwesend" | "verlassen",
    }));
  }

  checkIn(query: string): FitnessCheckInResult {
    const term = query.trim().toUpperCase();
    if (!term) throw new FitnessError("emptyQuery");

    // Suche nach Mitgliedsnummer, ID, E-Mail oder Nachname
    const memberRows = this.sql.exec<{
      id: string;
      member_number: string;
      first_name: string;
      last_name: string;
      email: string;
      phone: string;
      birth_date: string | null;
      plan_id: string;
      plan_name: string;
      monthly_fee: number;
      status: string;
      join_date: string;
      valid_until: string | null;
      check_ins_count: number;
      remaining_units: number | null;
      notes: string;
      emergency_contact: string;
      iban: string;
      created_at: string;
    }>(
      `SELECT * FROM fitness_members 
       WHERE upper(member_number) = ? 
          OR upper(id) = ? 
          OR upper(email) = ? 
          OR upper(phone) = ?
          OR upper(last_name) = ?
       LIMIT 1`,
      term,
      term,
      term,
      term,
      term
    ).toArray();

    if (memberRows.length === 0) {
      return {
        success: false,
        message: `Kein Mitglied mit Nummer oder Kennung „${query}“ gefunden.`,
        alertLevel: "error",
      };
    }

    const raw = memberRows[0];
    const member: FitnessMember = {
      id: raw.id,
      memberNumber: raw.member_number,
      firstName: raw.first_name,
      lastName: raw.last_name,
      email: raw.email,
      phone: raw.phone || undefined,
      birthDate: raw.birth_date || undefined,
      planId: raw.plan_id,
      planName: raw.plan_name,
      monthlyFee: raw.monthly_fee,
      status: raw.status as MemberStatus,
      joinDate: raw.join_date,
      validUntil: raw.valid_until || undefined,
      checkInsCount: raw.check_ins_count,
      remainingUnits: raw.remaining_units !== null ? raw.remaining_units : undefined,
      notes: raw.notes || undefined,
      emergencyContact: raw.emergency_contact || undefined,
      iban: raw.iban || undefined,
      createdAt: raw.created_at,
    };

    // 1. Status prüfen: Gesperrt?
    if (member.status === "gesperrt") {
      return {
        success: false,
        member,
        message: `Zugang verwehrt! Mitgliedschaft ist gesperrt. ${member.notes ? `Hinweis: ${member.notes}` : "Bitte an die Kasse verweisen."}`,
        alertLevel: "error",
      };
    }

    // 2. Status prüfen: Pausiert?
    if (member.status === "pausiert") {
      return {
        success: false,
        member,
        message: `Mitgliedschaft ist derzeit stillgelegt / pausiert. ${member.notes ? `Hinweis: ${member.notes}` : "Reaktivierung am Empfang erforderlich."}`,
        alertLevel: "warning",
      };
    }

    // 3. Status prüfen: Gekündigt / abgelaufen?
    if (member.status === "gekuendigt") {
      return {
        success: false,
        member,
        message: "Mitgliedschaft ist abgelaufen / gekündigt. Kein Einlass möglich.",
        alertLevel: "error",
      };
    }

    // 4. Prüfung 10er-Karte: verbleibende Einheiten
    let remaining = member.remainingUnits;
    let alertLevel: "success" | "warning" = "success";
    let message = `Willkommen, ${member.firstName}! Check-In erfolgreich gebucht (${member.planName}).`;

    if (remaining !== undefined) {
      if (remaining <= 0) {
        return {
          success: false,
          member,
          message: "10er-Karte aufgebraucht (0 Einheiten verbleibend). Bitte neue Karte an der Kasse buchen.",
          alertLevel: "error",
          remainingUnits: 0,
        };
      }
      // Einheit abziehen
      remaining -= 1;
      this.sql.exec("UPDATE fitness_members SET remaining_units = ? WHERE id = ?", remaining, member.id);
      member.remainingUnits = remaining;

      if (remaining <= 1) {
        alertLevel = "warning";
        message = `Willkommen, ${member.firstName}! Check-In erfasst. Achtung: Nur noch ${remaining} Einheit auf der 10er-Karte!`;
      } else {
        message = `Willkommen, ${member.firstName}! Check-In erfasst (Noch ${remaining} Einheiten verfügbar).`;
      }
    }

    // Prüfen, ob das Mitglied bereits als anwesend eingetragen ist (z. B. Doppel-Scan)
    const alreadyIn = this.sql.exec<{ id: string }>(
      "SELECT id FROM fitness_checkins WHERE member_id = ? AND status = 'anwesend'",
      member.id
    ).toArray();

    if (alreadyIn.length > 0) {
      return {
        success: true,
        member,
        message: `${member.firstName} ${member.lastName} ist bereits im Studio eingecheckt.`,
        alertLevel: "warning",
      };
    }

    // Neuen Check-In eintragen
    const checkInId = "chk-" + Math.random().toString(36).slice(2, 9);
    const nowIso = new Date().toISOString();
    this.sql.exec(
      `INSERT INTO fitness_checkins (id, member_id, member_number, member_name, plan_name, checked_in_at, status)
       VALUES (?, ?, ?, ?, ?, ?, 'anwesend')`,
      checkInId,
      member.id,
      member.memberNumber,
      `${member.firstName} ${member.lastName}`,
      member.planName,
      nowIso
    );

    // Gesamte Check-Ins des Mitglieds hochzählen
    const newTotal = member.checkInsCount + 1;
    this.sql.exec("UPDATE fitness_members SET check_ins_count = ? WHERE id = ?", newTotal, member.id);
    member.checkInsCount = newTotal;

    const checkIn: FitnessCheckIn = {
      id: checkInId,
      memberId: member.id,
      memberNumber: member.memberNumber,
      memberName: `${member.firstName} ${member.lastName}`,
      planName: member.planName,
      checkedInAt: nowIso,
      status: "anwesend",
    };

    return {
      success: true,
      member,
      checkIn,
      message,
      alertLevel,
      remainingUnits: remaining,
    };
  }

  checkOut(checkInId: string): { success: boolean; message: string } {
    const existing = this.sql.exec<{ member_name: string; status: string }>(
      "SELECT member_name, status FROM fitness_checkins WHERE id = ?",
      checkInId
    ).toArray();

    if (existing.length === 0) throw new FitnessError("checkInNotFound");

    const nowIso = new Date().toISOString();
    this.sql.exec(
      "UPDATE fitness_checkins SET checked_out_at = ?, status = 'verlassen' WHERE id = ?",
      nowIso,
      checkInId
    );

    return {
      success: true,
      message: `${existing[0].member_name} erfolgreich ausgecheckt. Auf Wiedersehen!`,
    };
  }

  // --- MITGLIEDERVERWALTUNG ---
  listMembers(search?: string, status?: string): FitnessMember[] {
    let query = "SELECT * FROM fitness_members WHERE 1=1";
    const params: unknown[] = [];

    if (status && status !== "alle") {
      query += " AND status = ?";
      params.push(status);
    }

    if (search && search.trim()) {
      const term = `%${search.trim().toLowerCase()}%`;
      query += " AND (lower(first_name) LIKE ? OR lower(last_name) LIKE ? OR lower(member_number) LIKE ? OR lower(email) LIKE ? OR lower(phone) LIKE ?)";
      params.push(term, term, term, term, term);
    }

    query += " ORDER BY last_name ASC, first_name ASC";

    const rows = this.sql.exec<{
      id: string;
      member_number: string;
      first_name: string;
      last_name: string;
      email: string;
      phone: string;
      birth_date: string | null;
      plan_id: string;
      plan_name: string;
      monthly_fee: number;
      status: string;
      join_date: string;
      valid_until: string | null;
      check_ins_count: number;
      remaining_units: number | null;
      notes: string;
      emergency_contact: string;
      iban: string;
      created_at: string;
    }>(query, ...params).toArray();

    return rows.map((r) => ({
      id: r.id,
      memberNumber: r.member_number,
      firstName: r.first_name,
      lastName: r.last_name,
      email: r.email,
      phone: r.phone || undefined,
      birthDate: r.birth_date || undefined,
      planId: r.plan_id,
      planName: r.plan_name,
      monthlyFee: r.monthly_fee,
      status: r.status as MemberStatus,
      joinDate: r.join_date,
      validUntil: r.valid_until || undefined,
      checkInsCount: r.check_ins_count,
      remainingUnits: r.remaining_units !== null ? r.remaining_units : undefined,
      notes: r.notes || undefined,
      emergencyContact: r.emergency_contact || undefined,
      iban: r.iban || undefined,
      createdAt: r.created_at,
    }));
  }

  getMember(id: string): { member: FitnessMember; history: FitnessCheckIn[] } {
    const rows = this.sql.exec<{
      id: string;
      member_number: string;
      first_name: string;
      last_name: string;
      email: string;
      phone: string;
      birth_date: string | null;
      plan_id: string;
      plan_name: string;
      monthly_fee: number;
      status: string;
      join_date: string;
      valid_until: string | null;
      check_ins_count: number;
      remaining_units: number | null;
      notes: string;
      emergency_contact: string;
      iban: string;
      created_at: string;
    }>("SELECT * FROM fitness_members WHERE id = ?", id).toArray();

    if (rows.length === 0) throw new FitnessError("memberNotFound");
    const r = rows[0];

    const member: FitnessMember = {
      id: r.id,
      memberNumber: r.member_number,
      firstName: r.first_name,
      lastName: r.last_name,
      email: r.email,
      phone: r.phone || undefined,
      birthDate: r.birth_date || undefined,
      planId: r.plan_id,
      planName: r.plan_name,
      monthlyFee: r.monthly_fee,
      status: r.status as MemberStatus,
      joinDate: r.join_date,
      validUntil: r.valid_until || undefined,
      checkInsCount: r.check_ins_count,
      remainingUnits: r.remaining_units !== null ? r.remaining_units : undefined,
      notes: r.notes || undefined,
      emergencyContact: r.emergency_contact || undefined,
      iban: r.iban || undefined,
      createdAt: r.created_at,
    };

    const historyRows = this.sql.exec<{
      id: string;
      member_id: string;
      member_number: string;
      member_name: string;
      plan_name: string;
      checked_in_at: string;
      checked_out_at: string | null;
      status: string;
    }>(
      "SELECT * FROM fitness_checkins WHERE member_id = ? ORDER BY checked_in_at DESC LIMIT 30",
      id
    ).toArray();

    const history: FitnessCheckIn[] = historyRows.map((h) => ({
      id: h.id,
      memberId: h.member_id,
      memberNumber: h.member_number,
      memberName: h.member_name,
      planName: h.plan_name,
      checkedInAt: h.checked_in_at,
      checkedOutAt: h.checked_out_at || undefined,
      status: h.status as "anwesend" | "verlassen",
    }));

    return { member, history };
  }

  createMember(data: Partial<FitnessMember>): FitnessMember {
    const id = data.id || "mem-" + Math.random().toString(36).slice(2, 9);
    
    // Automatische Mitgliedsnummer generieren, falls nicht vergeben
    let memberNumber = data.memberNumber;
    if (!memberNumber) {
      const maxRow = this.sql.exec<{ num: string }>(
        "SELECT member_number AS num FROM fitness_members WHERE member_number LIKE 'M-%' ORDER BY member_number DESC LIMIT 1"
      ).toArray();
      let nextSeq = 1001;
      if (maxRow.length > 0 && maxRow[0].num) {
        const parsed = parseInt(maxRow[0].num.replace("M-", ""), 10);
        if (!isNaN(parsed)) nextSeq = parsed + 1;
      }
      memberNumber = `M-${nextSeq}`;
    }

    const planName = data.planName || "Standard-Tarif";
    const monthlyFee = typeof data.monthlyFee === "number" ? data.monthlyFee : 39.9;
    const status: MemberStatus = data.status || "aktiv";
    const joinDate = data.joinDate || new Date().toISOString().slice(0, 10);
    const createdAt = data.createdAt || new Date().toISOString();

    this.sql.exec(
      `INSERT INTO fitness_members (
        id, member_number, first_name, last_name, email, phone, birth_date,
        plan_id, plan_name, monthly_fee, status, join_date, valid_until,
        check_ins_count, remaining_units, notes, emergency_contact, iban, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      memberNumber,
      data.firstName || "Neues",
      data.lastName || "Mitglied",
      data.email || "",
      data.phone || "",
      data.birthDate || null,
      data.planId || "plan-standard",
      planName,
      monthlyFee,
      status,
      joinDate,
      data.validUntil || null,
      data.checkInsCount || 0,
      data.remainingUnits !== undefined ? data.remainingUnits : null,
      data.notes || "",
      data.emergencyContact || "",
      data.iban || "",
      createdAt
    );

    return {
      id,
      memberNumber,
      firstName: data.firstName || "Neues",
      lastName: data.lastName || "Mitglied",
      email: data.email || "",
      phone: data.phone,
      birthDate: data.birthDate,
      planId: data.planId || "plan-standard",
      planName,
      monthlyFee,
      status,
      joinDate,
      validUntil: data.validUntil,
      checkInsCount: data.checkInsCount || 0,
      remainingUnits: data.remainingUnits,
      notes: data.notes,
      emergencyContact: data.emergencyContact,
      iban: data.iban,
      createdAt,
    };
  }

  updateMember(id: string, data: Partial<FitnessMember>): FitnessMember {
    const existing = this.getMember(id).member;
    const updated: FitnessMember = {
      ...existing,
      ...data,
      id, // unveränderlich
    };

    this.sql.exec(
      `UPDATE fitness_members SET
        first_name = ?,
        last_name = ?,
        email = ?,
        phone = ?,
        birth_date = ?,
        plan_id = ?,
        plan_name = ?,
        monthly_fee = ?,
        status = ?,
        join_date = ?,
        valid_until = ?,
        remaining_units = ?,
        notes = ?,
        emergency_contact = ?,
        iban = ?
       WHERE id = ?`,
      updated.firstName,
      updated.lastName,
      updated.email,
      updated.phone || "",
      updated.birthDate || null,
      updated.planId,
      updated.planName,
      updated.monthlyFee,
      updated.status,
      updated.joinDate,
      updated.validUntil || null,
      updated.remainingUnits !== undefined ? updated.remainingUnits : null,
      updated.notes || "",
      updated.emergencyContact || "",
      updated.iban || "",
      id
    );

    return updated;
  }

  deleteMember(id: string): { success: boolean } {
    this.sql.exec("DELETE FROM fitness_checkins WHERE member_id = ?", id);
    this.sql.exec("DELETE FROM fitness_members WHERE id = ?", id);
    return { success: true };
  }

  // --- KURSPLAN & BUCHUNGEN ---
  listClasses(weekday?: string): FitnessClass[] {
    let query = "SELECT * FROM fitness_classes";
    const params: unknown[] = [];
    if (weekday && weekday !== "alle") {
      query += " WHERE weekday = ?";
      params.push(weekday);
    }
    query += " ORDER BY start_time ASC";

    const rows = this.sql.exec<{
      id: string;
      name: string;
      coach_name: string;
      weekday: string;
      start_time: string;
      end_time: string;
      room: string;
      max_participants: number;
      booked_member_ids: string;
      description: string;
    }>(query, ...params).toArray();

    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      coachName: r.coach_name,
      weekday: r.weekday as Weekday,
      startTime: r.start_time,
      endTime: r.end_time,
      room: r.room,
      maxParticipants: r.max_participants,
      bookedMemberIds: JSON.parse(r.booked_member_ids || "[]"),
      attendedMemberIds: [],
      description: r.description || undefined,
    }));
  }

  createClass(data: Partial<FitnessClass>): FitnessClass {
    const id = data.id || "class-" + Math.random().toString(36).slice(2, 9);
    const item: FitnessClass = {
      id,
      name: data.name || "Neuer Kurs",
      coachName: data.coachName || "Trainer/in",
      weekday: data.weekday || "Montag",
      startTime: data.startTime || "18:00",
      endTime: data.endTime || "19:00",
      room: data.room || "Kursraum 1",
      maxParticipants: data.maxParticipants || 15,
      bookedMemberIds: data.bookedMemberIds || [],
      attendedMemberIds: data.attendedMemberIds || [],
      description: data.description || "",
    };

    this.sql.exec(
      `INSERT INTO fitness_classes (id, name, coach_name, weekday, start_time, end_time, room, max_participants, booked_member_ids, description)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      item.id,
      item.name,
      item.coachName,
      item.weekday,
      item.startTime,
      item.endTime,
      item.room,
      item.maxParticipants,
      JSON.stringify(item.bookedMemberIds),
      item.description || ""
    );

    return item;
  }

  updateClass(id: string, data: Partial<FitnessClass>): FitnessClass {
    const classes = this.listClasses().find((c) => c.id === id);
    if (!classes) throw new FitnessError("classNotFound");

    const updated: FitnessClass = {
      ...classes,
      ...data,
      id,
    };

    this.sql.exec(
      `UPDATE fitness_classes SET
        name = ?,
        coach_name = ?,
        weekday = ?,
        start_time = ?,
        end_time = ?,
        room = ?,
        max_participants = ?,
        booked_member_ids = ?,
        description = ?
       WHERE id = ?`,
      updated.name,
      updated.coachName,
      updated.weekday,
      updated.startTime,
      updated.endTime,
      updated.room,
      updated.maxParticipants,
      JSON.stringify(updated.bookedMemberIds),
      updated.description || "",
      id
    );

    return updated;
  }

  deleteClass(id: string): { success: boolean } {
    this.sql.exec("DELETE FROM fitness_classes WHERE id = ?", id);
    return { success: true };
  }

  bookClass(classId: string, memberId: string): { success: boolean; course: FitnessClass } {
    const course = this.listClasses().find((c) => c.id === classId);
    if (!course) throw new FitnessError("classNotFound");

    // Prüfen, ob bereits eingebucht
    if (course.bookedMemberIds.includes(memberId)) {
      return { success: true, course };
    }

    if (course.bookedMemberIds.length >= course.maxParticipants) {
      throw new FitnessError("classFull");
    }

    const updatedBookings = [...course.bookedMemberIds, memberId];
    this.sql.exec("UPDATE fitness_classes SET booked_member_ids = ? WHERE id = ?", JSON.stringify(updatedBookings), classId);
    course.bookedMemberIds = updatedBookings;

    return { success: true, course };
  }

  cancelClassBooking(classId: string, memberId: string): { success: boolean; course: FitnessClass } {
    const course = this.listClasses().find((c) => c.id === classId);
    if (!course) throw new FitnessError("classNotFound");

    const updatedBookings = course.bookedMemberIds.filter((id) => id !== memberId);
    this.sql.exec("UPDATE fitness_classes SET booked_member_ids = ? WHERE id = ?", JSON.stringify(updatedBookings), classId);
    course.bookedMemberIds = updatedBookings;

    return { success: true, course };
  }

  // --- TARIFE & PLÄNE ---
  listPlans(): FitnessPlan[] {
    const rows = this.sql.exec<{
      id: string;
      name: string;
      price_monthly: number;
      admission_fee: number;
      duration_months: number;
      includes_sauna: number;
      includes_courses: number;
      includes_drinks: number;
      is_pass_10: number;
      active: number;
    }>("SELECT * FROM fitness_plans ORDER BY is_pass_10 ASC, price_monthly DESC").toArray();

    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      priceMonthly: r.price_monthly,
      admissionFee: r.admission_fee,
      durationMonths: r.duration_months,
      includesSauna: Boolean(r.includes_sauna),
      includesCourses: Boolean(r.includes_courses),
      includesDrinks: Boolean(r.includes_drinks),
      isPass10: Boolean(r.is_pass_10),
      active: Boolean(r.active),
    }));
  }

  createPlan(data: Partial<FitnessPlan>): FitnessPlan {
    const id = data.id || "plan-" + Math.random().toString(36).slice(2, 9);
    const plan: FitnessPlan = {
      id,
      name: data.name || "Neuer Tarif",
      priceMonthly: typeof data.priceMonthly === "number" ? data.priceMonthly : 49.9,
      admissionFee: typeof data.admissionFee === "number" ? data.admissionFee : 29.0,
      durationMonths: data.durationMonths || 12,
      includesSauna: Boolean(data.includesSauna),
      includesCourses: Boolean(data.includesCourses),
      includesDrinks: Boolean(data.includesDrinks),
      isPass10: Boolean(data.isPass10),
      active: data.active !== undefined ? Boolean(data.active) : true,
    };

    this.sql.exec(
      `INSERT INTO fitness_plans (id, name, price_monthly, admission_fee, duration_months, includes_sauna, includes_courses, includes_drinks, is_pass_10, active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      plan.id,
      plan.name,
      plan.priceMonthly,
      plan.admissionFee,
      plan.durationMonths,
      plan.includesSauna ? 1 : 0,
      plan.includesCourses ? 1 : 0,
      plan.includesDrinks ? 1 : 0,
      plan.isPass10 ? 1 : 0,
      plan.active ? 1 : 0
    );

    return plan;
  }

  updatePlan(id: string, data: Partial<FitnessPlan>): FitnessPlan {
    const existing = this.listPlans().find((p) => p.id === id);
    if (!existing) throw new FitnessError("planNotFound");

    const updated: FitnessPlan = {
      ...existing,
      ...data,
      id,
    };

    this.sql.exec(
      `UPDATE fitness_plans SET
        name = ?,
        price_monthly = ?,
        admission_fee = ?,
        duration_months = ?,
        includes_sauna = ?,
        includes_courses = ?,
        includes_drinks = ?,
        is_pass_10 = ?,
        active = ?
       WHERE id = ?`,
      updated.name,
      updated.priceMonthly,
      updated.admissionFee,
      updated.durationMonths,
      updated.includesSauna ? 1 : 0,
      updated.includesCourses ? 1 : 0,
      updated.includesDrinks ? 1 : 0,
      updated.isPass10 ? 1 : 0,
      updated.active ? 1 : 0,
      id
    );

    return updated;
  }
}
