import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  CalendarDays, CalendarOff, Check, Clock, Copy, Inbox, LogIn, LogOut, MapPin, Nfc, Plus, Send, Settings2, Trash2, TriangleAlert, Undo2, Users, X,
} from "lucide-react";
import { api, type Me } from "../api";
import { Avatar, Field } from "../components";
import { useI18n } from "../i18n";
import {
  ABSENCE_TYPES, STATES, formatMinutes,
  type Absence, type AbsenceType, type DayResult, type StampKind, type TimeEntry, type TimeRequest, type TimeSettings, type YearAccount,
} from "../../shared/time";

interface PublicEmployee { id: string; name: string; personnelNumber: number; chip: boolean; linked: boolean }
interface MyTime {
  employee: PublicEmployee | null;
  next?: StampKind;
  lastAt?: string | null;
  today?: DayResult;
  account?: YearAccount;
  upcomingAbsences?: Absence[];
  requests?: TimeRequest[];
}
interface OverviewRow extends PublicEmployee { present: boolean; since: string | null; absentToday: AbsenceType | null; account: YearAccount }
interface MonthData {
  employee: PublicEmployee;
  days: DayResult[];
  totals: { hours: number; overtimeHours: number; vacationDays: number; sickDays: number };
  entries: TimeEntry[];
  absences: Absence[];
}
interface Terminal { id: string; name: string; createdAt: string; lastSeenAt: string | null }

type Tab = "me" | "requests" | "overview" | "month" | "absences" | "terminals" | "settings";

const today = () => new Date().toLocaleDateString("en-CA");
const thisMonth = () => today().slice(0, 7);

function useTimeFormat() {
  const { lang } = useI18n();
  const clock = (iso: string) => new Intl.DateTimeFormat(lang, { hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
  const day = (d: string, opts: Intl.DateTimeFormatOptions = { weekday: "short", day: "2-digit", month: "2-digit" }) =>
    new Intl.DateTimeFormat(lang, { ...opts, timeZone: "UTC" }).format(new Date(`${d}T00:00:00Z`));
  const days = (n: number) => new Intl.NumberFormat(lang, { maximumFractionDigits: 1 }).format(n);
  return { clock, day, days };
}

/** Saldo mit Vorzeichen, z. B. „+3:15“ */
const signed = (min: number) => (min > 0 ? `+${formatMinutes(min)}` : formatMinutes(min));

/** Seite „Zeiten“: Stempeln für alle, Zeit- und Urlaubskonten für Inhaber und Admins. */
export function TimePage({ me }: { me: Me }) {
  const { t } = useI18n();
  const isManager = me.user.role !== "staff";
  const [tab, setTab] = useState<Tab>(isManager ? "overview" : "me");
  const [focus, setFocus] = useState<string | null>(null);
  const [openRequests, setOpenRequests] = useState(me.timeRequests ?? 0);

  const tabs: { id: Tab; label: string; icon: typeof Users; badge?: number }[] = [
    { id: "me", label: t("time.tabMe"), icon: Clock },
    ...(isManager
      ? [
          { id: "overview" as const, label: t("time.tabOverview"), icon: Users },
          { id: "requests" as const, label: t("time.tabRequests"), icon: Inbox, badge: openRequests },
          { id: "month" as const, label: t("time.tabMonth"), icon: CalendarDays },
          { id: "absences" as const, label: t("time.tabAbsences"), icon: CalendarOff },
          { id: "terminals" as const, label: t("time.tabTerminals"), icon: Nfc },
          { id: "settings" as const, label: t("time.tabSettings"), icon: Settings2 },
        ]
      : []),
  ];

  return (
    <div className="stack-lg">
      <header className="page-head">
        <div>
          <h1 className="display">{t("time.title")}</h1>
          <p className="muted">{t(isManager ? "time.subtitle" : "time.subtitleStaff")}</p>
        </div>
      </header>

      {tabs.length > 1 && (
        <div className="page-tabs time-tabs" role="tablist" aria-label={t("time.title")}>
          {tabs.map(({ id, label, icon: Icon, badge }) => (
            <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? "active" : ""} onClick={() => setTab(id)}>
              <Icon size={17} aria-hidden /> {label}
              {!!badge && <span className="count-badge" aria-label={t("time.openRequests", { n: badge })}>{badge}</span>}
            </button>
          ))}
        </div>
      )}

      {tab === "me" && <MyTimeTab isManager={isManager} />}
      {tab === "requests" && <RequestsTab onCount={setOpenRequests} />}
      {tab === "overview" && <OverviewTab onOpen={(id) => { setFocus(id); setTab("month"); }} />}
      {tab === "month" && <MonthTab focus={focus} onFocus={setFocus} />}
      {tab === "absences" && <AbsencesTab />}
      {tab === "terminals" && <TerminalsTab />}
      {tab === "settings" && <SettingsTab />}
    </div>
  );
}

// ---------- Meine Zeit ----------

function MyTimeTab({ isManager }: { isManager: boolean }) {
  const { t, errorText } = useI18n();
  const { clock, day, days } = useTimeFormat();
  const [data, setData] = useState<MyTime | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    api<MyTime>("/time/me").then(setData).catch((e) => setError(errorText(e)));
    const timer = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const stampNow = async () => {
    if (!data?.next) return;
    setBusy(true);
    setError("");
    try {
      setData(await api<MyTime>("/time/me/stamp", { method: "POST", body: { kind: data.next } }));
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  if (!data) return error ? <p className="error">{error}</p> : <p className="muted">{t("common.loading")}</p>;
  if (!data.employee || !data.account || !data.today)
    return <section className="card"><p className="notice">{t(isManager ? "time.notLinkedManager" : "time.notLinked")}</p></section>;

  const present = data.next === "out";
  const a = data.account;
  // Laufende Schicht live mitzählen
  const running = present && data.lastAt ? Math.max(0, Math.round((now.getTime() - Date.parse(data.lastAt)) / 60_000)) : 0;
  const closedToday = data.today.sessions.reduce((s, x) => s + (x.to ? x.minutes : 0), 0);
  const workedToday = closedToday + running;

  return (
    <div className="time-me">
      <section className={`card stamp-card ${present ? "is-in" : ""}`}>
        <p className="stamp-clock" aria-live="polite">{clock(now.toISOString())}</p>
        <p className="muted">{present && data.lastAt ? t("time.presentSince", { time: clock(data.lastAt) }) : t("time.notPresent")}</p>
        <button className={`button stamp-button ${present ? "out" : "in"}`} onClick={stampNow} disabled={busy}>
          {present ? <LogOut size={26} /> : <LogIn size={26} />} {present ? t("time.clockOut") : t("time.clockIn")}
        </button>
        {error && <p className="error" role="alert">{error}</p>}
      </section>

      <section className="card time-stats">
        <div><small>{t("time.todayWorked")}</small><strong>{formatMinutes(workedToday)}</strong><small className="muted">{t("time.ofTarget", { target: formatMinutes(data.today.target) })}</small></div>
        <div><small>{t("time.balance")}</small><strong className={a.balanceTotal < 0 ? "neg" : "pos"}>{signed(a.balanceTotal)}</strong><small className="muted">{t("time.hoursUntilToday")}</small></div>
        <div><small>{t("time.vacationLeft")}</small><strong>{days(a.vacationLeft)}</strong><small className="muted">{t("time.vacationOf", { n: days(a.vacationEntitlement) })}</small></div>
        <div><small>{t("time.sickDays")}</small><strong>{days(a.sickDays)}</strong><small className="muted">{t("time.thisYear", { year: a.year })}</small></div>
      </section>

      {data.today.sessions.length > 0 && (
        <section className="card">
          <h2 className="card-title"><Clock size={20} /> {t("time.todayStamps")}</h2>
          <ul className="stamp-list">
            {data.today.sessions.map((s, i) => (
              <li key={i}><span>{s.from || "?"}</span> – <span>{s.to ?? (present && i === data.today!.sessions.length - 1 ? t("time.now") : "?")}</span></li>
            ))}
          </ul>
        </section>
      )}

      <RequestForm onSent={() => api<MyTime>("/time/me").then(setData)} />
      <MyRequests requests={data.requests ?? []} onChanged={() => api<MyTime>("/time/me").then(setData)} />

      {(data.upcomingAbsences ?? []).length > 0 && (
        <section className="card">
          <h2 className="card-title"><CalendarOff size={20} /> {t("time.upcoming")}</h2>
          <ul className="stamp-list">
            {data.upcomingAbsences!.map((ab) => (
              <li key={ab.id}><span>{t(`time.types.${ab.type}`)}</span> <span className="muted">{day(ab.from)}{ab.to !== ab.from && ` – ${day(ab.to)}`}</span></li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

// ---------- Anträge ----------

/** Kurzbeschreibung eines Antrags, z. B. „Kommen · Mo., 12.10. 08:00“ oder „Urlaub · 01.11. – 05.11.“ */
function useRequestText() {
  const { t } = useI18n();
  const { clock, day } = useTimeFormat();
  return (r: TimeRequest) => {
    const d = r.data;
    if (d.type === "stamp") return `${t(d.kind === "in" ? "time.clockIn" : "time.clockOut")} · ${day(new Date(d.at).toLocaleDateString("en-CA"))} ${clock(d.at)}`;
    const range = d.to !== d.from ? `${day(d.from)} – ${day(d.to)}` : day(d.from);
    return `${t(`time.types.${d.absence}`)}${d.halfDay ? ` (${t("time.half")})` : ""} · ${range}`;
  };
}

function RequestForm({ onSent }: { onSent: () => void }) {
  const { t, errorText } = useI18n();
  const [mode, setMode] = useState<"stamp" | "absence">("stamp");
  const [stamp, setStamp] = useState({ date: today(), time: "08:00", kind: "in" as StampKind });
  const [absence, setAbsence] = useState({ absence: "vacation" as AbsenceType, from: today(), to: today(), halfDay: false });
  const [note, setNote] = useState("");
  const [status, setStatus] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const send = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setStatus(null);
    try {
      const body = mode === "stamp"
        ? { type: "stamp", kind: stamp.kind, at: new Date(`${stamp.date}T${stamp.time}`).toISOString(), note }
        : { type: "absence", ...absence, note };
      await api("/time/me/requests", { method: "POST", body });
      setNote("");
      setStatus({ kind: "success", text: t("time.requestSent") });
      onSent();
    } catch (e) {
      setStatus({ kind: "error", text: errorText(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="card form-grid" onSubmit={send}>
      <h2 className="card-title wide"><Send size={20} /> {t("time.requestTitle")}</h2>
      <div className="segmented wide" role="radiogroup" aria-label={t("time.requestTitle")}>
        <button type="button" role="radio" aria-checked={mode === "stamp"} className={mode === "stamp" ? "active" : ""} onClick={() => setMode("stamp")}>{t("time.requestStamp")}</button>
        <button type="button" role="radio" aria-checked={mode === "absence"} className={mode === "absence" ? "active" : ""} onClick={() => setMode("absence")}>{t("time.requestAbsence")}</button>
      </div>
      {mode === "stamp" ? (
        <>
          <Field label={t("time.date")}><input type="date" value={stamp.date} max={today()} onChange={(e) => setStamp({ ...stamp, date: e.target.value })} /></Field>
          <Field label={t("time.time")}><input type="time" value={stamp.time} onChange={(e) => setStamp({ ...stamp, time: e.target.value })} /></Field>
          <Field label={t("time.kind")}>
            <select value={stamp.kind} onChange={(e) => setStamp({ ...stamp, kind: e.target.value as StampKind })}>
              <option value="in">{t("time.clockIn")}</option>
              <option value="out">{t("time.clockOut")}</option>
            </select>
          </Field>
        </>
      ) : (
        <>
          <Field label={t("time.absenceType")}>
            <select value={absence.absence} onChange={(e) => setAbsence({ ...absence, absence: e.target.value as AbsenceType })}>
              {ABSENCE_TYPES.map((type) => <option key={type} value={type}>{t(`time.types.${type}`)}</option>)}
            </select>
          </Field>
          <Field label={t("time.from")}><input type="date" value={absence.from} onChange={(e) => setAbsence({ ...absence, from: e.target.value, to: e.target.value > absence.to ? e.target.value : absence.to })} /></Field>
          <Field label={t("time.to")}><input type="date" value={absence.to} min={absence.from} onChange={(e) => setAbsence({ ...absence, to: e.target.value })} /></Field>
          <label className="check">
            <input type="checkbox" checked={absence.halfDay} disabled={absence.from !== absence.to} onChange={(e) => setAbsence({ ...absence, halfDay: e.target.checked })} />
            {t("time.halfDay")}
          </label>
        </>
      )}
      <Field label={t("time.reason")} wide><input value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} /></Field>
      <p className="muted wide">{t("time.requestHint")}</p>
      {status && <p className={`wide ${status.kind === "error" ? "error" : "notice success"}`} role="status">{status.text}</p>}
      <div className="wide actions"><button className="button primary" disabled={busy}><Send size={18} /> {t("time.requestSend")}</button></div>
    </form>
  );
}

const statusPill = (status: TimeRequest["status"]) => (status === "approved" ? "pill pos" : status === "rejected" ? "pill neg" : "pill warn");

function MyRequests({ requests, onChanged }: { requests: TimeRequest[]; onChanged: () => void }) {
  const { t } = useI18n();
  const describe = useRequestText();
  if (requests.length === 0) return null;
  const withdraw = async (r: TimeRequest) => {
    if (!confirm(t("time.confirmWithdraw"))) return;
    await api(`/time/me/requests/${r.id}`, { method: "DELETE" }).catch(() => undefined);
    onChanged();
  };
  return (
    <section className="card list-card">
      <h2 className="list-title">{t("time.myRequests")}</h2>
      {requests.map((r) => (
        <div key={r.id} className="list-row">
          <div className="list-main">
            <strong>{describe(r)}</strong>
            <small className="muted">
              {r.note}{r.note && r.reply && " · "}{r.reply && t("time.replyFrom", { name: r.decidedBy ?? "", text: r.reply })}
            </small>
          </div>
          <span className={statusPill(r.status)}>{t(`time.status.${r.status}`)}</span>
          {r.status === "pending" && (
            <button className="icon-button" onClick={() => withdraw(r)} aria-label={t("time.withdraw")} title={t("time.withdraw")}><Undo2 size={17} /></button>
          )}
        </div>
      ))}
    </section>
  );
}

function RequestsTab({ onCount }: { onCount: (n: number) => void }) {
  const { t, errorText, lang } = useI18n();
  const describe = useRequestText();
  const [requests, setRequests] = useState<(TimeRequest & { name: string })[] | null>(null);
  const [error, setError] = useState("");
  const when = (iso: string) => new Intl.DateTimeFormat(lang, { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));

  const load = () =>
    api<{ requests: (TimeRequest & { name: string })[] }>("/time/requests").then((r) => {
      setRequests(r.requests);
      onCount(r.requests.filter((x) => x.status === "pending").length);
    });
  useEffect(() => { load(); }, []);

  const decide = async (r: TimeRequest, approve: boolean) => {
    const reply = approve ? "" : prompt(t("time.rejectReason")) ?? null;
    if (reply === null) return;
    setError("");
    try {
      await api(`/time/requests/${r.id}/decide`, { method: "POST", body: { approve, reply } });
      load();
    } catch (e) {
      setError(errorText(e));
    }
  };

  if (!requests) return <p className="muted">{t("common.loading")}</p>;
  const open = requests.filter((r) => r.status === "pending");
  const done = requests.filter((r) => r.status !== "pending");
  return (
    <div className="stack">
      <p className="muted">{t("time.requestsHint")}</p>
      {error && <p className="error" role="alert">{error}</p>}
      <section className="card list-card">
        <h2 className="list-title">{t("time.openRequestsTitle")}</h2>
        {open.length === 0 && <p className="muted empty">{t("time.noOpenRequests")}</p>}
        {open.map((r) => (
          <div key={r.id} className="list-row request-row">
            <Avatar name={r.name} />
            <div className="list-main">
              <strong>{r.name} · {describe(r)}</strong>
              <small className="muted">{t("time.requestedAt", { when: when(r.createdAt) })}{r.note && ` · ${r.note}`}</small>
            </div>
            <div className="row request-actions">
              <button className="button success-button" onClick={() => decide(r, true)}><Check size={17} /> {t("time.approve")}</button>
              <button className="button" onClick={() => decide(r, false)}><X size={17} /> {t("time.reject")}</button>
            </div>
          </div>
        ))}
      </section>
      {done.length > 0 && (
        <section className="card list-card">
          <h2 className="list-title">{t("time.decidedRequests")}</h2>
          {done.map((r) => (
            <div key={r.id} className="list-row">
              <div className="list-main">
                <strong>{r.name} · {describe(r)}</strong>
                <small className="muted">{r.decidedBy}{r.decidedAt && `, ${when(r.decidedAt)}`}{r.reply && ` · ${r.reply}`}</small>
              </div>
              <span className={statusPill(r.status)}>{t(`time.status.${r.status}`)}</span>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}

// ---------- Übersicht ----------

function YearPicker({ year, onChange }: { year: number; onChange: (y: number) => void }) {
  const { t } = useI18n();
  const current = new Date().getFullYear();
  return (
    <Field label={t("time.year")}>
      <select value={year} onChange={(e) => onChange(Number(e.target.value))}>
        {[current + 1, current, current - 1, current - 2].map((y) => <option key={y} value={y}>{y}</option>)}
      </select>
    </Field>
  );
}

function OverviewTab({ onOpen }: { onOpen: (id: string) => void }) {
  const { t } = useI18n();
  const { clock, days } = useTimeFormat();
  const [year, setYear] = useState(new Date().getFullYear());
  const [rows, setRows] = useState<OverviewRow[] | null>(null);

  useEffect(() => {
    setRows(null);
    api<{ employees: OverviewRow[] }>(`/time/overview?year=${year}`).then((r) => setRows(r.employees));
  }, [year]);

  const present = rows?.filter((r) => r.present).length ?? 0;
  return (
    <div className="stack">
      <div className="acc-toolbar">
        <YearPicker year={year} onChange={setYear} />
        {rows && year === new Date().getFullYear() && <p className="muted">{t("time.presentNow", { n: present, total: rows.length })}</p>}
      </div>
      <section className="card list-card">
        {rows === null ? <p className="muted empty">{t("common.loading")}</p>
          : rows.length === 0 ? <p className="muted empty">{t("time.noEmployees")}</p>
          : rows.map((r) => (
            <button key={r.id} className="list-row employee-row time-row" onClick={() => onOpen(r.id)}>
              <Avatar name={r.name} />
              <div className="list-main">
                <strong>{r.name}</strong>
                <small className="muted">
                  {r.present && r.since ? t("time.presentSince", { time: clock(r.since) })
                    : r.absentToday ? t(`time.types.${r.absentToday}`) : t("time.notPresent")}
                  {!r.chip && ` · ${t("time.noChip")}`}
                </small>
              </div>
              <div className="time-figures">
                <span className={`pill ${r.account.balanceTotal < 0 ? "neg" : "pos"}`} title={t("time.balance")}>{signed(r.account.balanceTotal)} h</span>
                <span className="pill" title={t("time.vacationLeft")}>{t("time.vacationShort", { n: days(r.account.vacationLeft) })}</span>
                {r.account.incompleteDays > 0 && <span className="pill warn" title={t("time.incompleteHint")}><TriangleAlert size={14} /> {r.account.incompleteDays}</span>}
              </div>
              <span className={`presence ${r.present ? "on" : ""}`} aria-label={r.present ? t("time.present") : t("time.notPresent")} />
            </button>
          ))}
      </section>
      <p className="muted">{t("time.overviewHint")}</p>
    </div>
  );
}

// ---------- Monat einer Person ----------

function useEmployees() {
  const [list, setList] = useState<PublicEmployee[] | null>(null);
  useEffect(() => {
    api<{ employees: OverviewRow[] }>(`/time/overview`).then((r) => setList(r.employees));
  }, []);
  return list;
}

function MonthTab({ focus, onFocus }: { focus: string | null; onFocus: (id: string) => void }) {
  const { t, errorText } = useI18n();
  const { clock, day } = useTimeFormat();
  const employees = useEmployees();
  const [month, setMonth] = useState(thisMonth);
  const [data, setData] = useState<MonthData | null>(null);
  const [error, setError] = useState("");
  const [add, setAdd] = useState({ date: today(), time: "08:00", kind: "in" as StampKind, note: "" });
  const employeeId = focus ?? employees?.[0]?.id ?? null;

  const load = () => {
    if (!employeeId || !/^\d{4}-\d{2}$/.test(month)) return;
    api<MonthData>(`/time/days/${employeeId}/${month}`).then(setData).catch((e) => setError(errorText(e)));
  };
  useEffect(() => { setData(null); load(); }, [employeeId, month]);

  const addEntry = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    try {
      await api("/time/entries", { method: "POST", body: { employeeId, kind: add.kind, at: new Date(`${add.date}T${add.time}`).toISOString(), note: add.note } });
      setAdd({ ...add, note: "" });
      load();
    } catch (e) {
      setError(errorText(e));
    }
  };
  const removeEntry = async (entry: TimeEntry) => {
    if (!confirm(t("time.confirmDeleteStamp"))) return;
    await api(`/time/entries/${entry.id}`, { method: "DELETE" }).catch((e) => setError(errorText(e)));
    load();
  };

  if (employees === null) return <p className="muted">{t("common.loading")}</p>;
  if (employees.length === 0) return <section className="card"><p className="muted">{t("time.noEmployees")}</p></section>;

  // Soll und Saldo nur bis heute, die Zukunft ist noch offen
  const todayDay = today();
  const sum = (key: "target" | "worked" | "credited") => data?.days.filter((d) => d.day < todayDay || (d.day === todayDay && d.worked + d.credited >= d.target)).reduce((s, d) => s + d[key], 0) ?? 0;
  return (
    <div className="stack">
      <div className="acc-toolbar">
        <Field label={t("time.person")}>
          <select value={employeeId ?? ""} onChange={(e) => onFocus(e.target.value)}>
            {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        </Field>
        <Field label={t("accounting.month")}>
          <input type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} />
        </Field>
      </div>

      {data && (
        <section className="card time-stats">
          <div><small>{t("time.target")}</small><strong>{formatMinutes(sum("target"))}</strong></div>
          <div><small>{t("time.actual")}</small><strong>{formatMinutes(sum("worked") + sum("credited"))}</strong></div>
          <div><small>{t("time.difference")}</small><strong className={sum("worked") + sum("credited") - sum("target") < 0 ? "neg" : "pos"}>{signed(sum("worked") + sum("credited") - sum("target"))}</strong></div>
          <div><small>{t("time.vacationSick")}</small><strong>{data.totals.vacationDays} / {data.totals.sickDays}</strong></div>
        </section>
      )}

      <section className="card month-card">
        {!data ? <p className="muted">{t("common.loading")}</p> : (
          <table className="month-table day-table">
            <thead>
              <tr>
                <th>{t("time.day")}</th>
                <th>{t("time.stamps")}</th>
                <th>{t("time.target")}</th>
                <th>{t("time.actual")}</th>
                <th>{t("time.difference")}</th>
              </tr>
            </thead>
            <tbody>
              {data.days.map((d) => {
                const actual = d.worked + d.credited;
                const future = d.day > todayDay;
                const off = (d.target === 0 || future) && actual === 0 && d.sessions.length === 0 && !d.absence;
                return (
                  <tr key={d.day} className={`${off ? "off" : ""} ${d.incomplete ? "incomplete" : ""}`}>
                    <th scope="row">
                      <strong>{day(d.day)}</strong>
                      {(d.holiday || d.absence) && <small className="muted">{d.holiday ?? t(`time.types.${d.absence}`)}{d.absenceHalf && ` (${t("time.half")})`}</small>}
                    </th>
                    <td data-label={t("time.stamps")}>
                      {d.sessions.length === 0 ? <span className="muted">–</span> : d.sessions.map((s, i) => (
                        <span key={i} className="session">{s.from || "?"}–{s.to ?? "…"}</span>
                      ))}
                      {d.autoBreak > 0 && <small className="muted"> {t("time.autoBreak", { n: d.autoBreak })}</small>}
                      {d.incomplete && <small className="error"> {t("time.incomplete")}</small>}
                    </td>
                    <td data-label={t("time.target")}>{d.target ? formatMinutes(d.target) : "–"}</td>
                    <td data-label={t("time.actual")}>{actual ? formatMinutes(actual) : "–"}</td>
                    <td data-label={t("time.difference")} className={future ? "" : actual - d.target < 0 ? "neg" : actual - d.target > 0 ? "pos" : ""}>
                      {!future && (actual || d.target) ? signed(actual - d.target) : "–"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      <form className="card form-grid" onSubmit={addEntry}>
        <h2 className="card-title wide"><Plus size={20} /> {t("time.addStamp")}</h2>
        <p className="muted wide">{t("time.addStampHint")}</p>
        <Field label={t("time.date")}><input type="date" value={add.date} onChange={(e) => setAdd({ ...add, date: e.target.value })} /></Field>
        <Field label={t("time.time")}><input type="time" value={add.time} onChange={(e) => setAdd({ ...add, time: e.target.value })} /></Field>
        <Field label={t("time.kind")}>
          <select value={add.kind} onChange={(e) => setAdd({ ...add, kind: e.target.value as StampKind })}>
            <option value="in">{t("time.clockIn")}</option>
            <option value="out">{t("time.clockOut")}</option>
          </select>
        </Field>
        <Field label={t("time.reason")}><input value={add.note} maxLength={300} onChange={(e) => setAdd({ ...add, note: e.target.value })} /></Field>
        {error && <p className="error wide" role="alert">{error}</p>}
        <div className="wide actions"><button className="button primary"><Plus size={18} /> {t("time.addStampButton")}</button></div>
      </form>

      {data && data.entries.length > 0 && (
        <section className="card list-card">
          <h2 className="list-title">{t("time.allStamps")}</h2>
          {[...data.entries].reverse().map((e) => (
            <div key={e.id} className="list-row">
              <div className="list-main">
                <strong>{day(e.at.slice(0, 10))} · {clock(e.at)} · {t(e.kind === "in" ? "time.clockIn" : "time.clockOut")}</strong>
                <small className="muted">{t(`time.sources.${e.source}`)}{e.note && ` · ${e.note}`}</small>
              </div>
              <button className="icon-button" onClick={() => removeEntry(e)} aria-label={t("common.remove")} title={t("common.remove")}><Trash2 size={17} /></button>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}

// ---------- Abwesenheiten ----------

function AbsencesTab() {
  const { t, errorText } = useI18n();
  const { day } = useTimeFormat();
  const employees = useEmployees();
  const [year, setYear] = useState(new Date().getFullYear());
  const [absences, setAbsences] = useState<Absence[] | null>(null);
  const [form, setForm] = useState({ employeeId: "", type: "vacation" as AbsenceType, from: today(), to: today(), halfDay: false, note: "" });
  const [error, setError] = useState("");
  const names = useMemo(() => Object.fromEntries((employees ?? []).map((e) => [e.id, e.name])), [employees]);

  const load = () => api<{ absences: Absence[] }>(`/time/absences?year=${year}`).then((r) => setAbsences(r.absences));
  useEffect(() => { load(); }, [year]);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    try {
      await api("/time/absences", { method: "POST", body: { ...form, employeeId: form.employeeId || employees?.[0]?.id } });
      setForm({ ...form, note: "", halfDay: false });
      load();
    } catch (e) {
      setError(errorText(e));
    }
  };
  const remove = async (a: Absence) => {
    if (!confirm(t("time.confirmDeleteAbsence"))) return;
    await api(`/time/absences/${a.id}`, { method: "DELETE" });
    load();
  };

  if (employees === null) return <p className="muted">{t("common.loading")}</p>;
  if (employees.length === 0) return <section className="card"><p className="muted">{t("time.noEmployees")}</p></section>;

  return (
    <div className="stack">
      <form className="card form-grid" onSubmit={save}>
        <h2 className="card-title wide"><CalendarOff size={20} /> {t("time.addAbsence")}</h2>
        <Field label={t("time.person")}>
          <select value={form.employeeId || employees[0]!.id} onChange={(e) => setForm({ ...form, employeeId: e.target.value })}>
            {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        </Field>
        <Field label={t("time.absenceType")}>
          <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as AbsenceType })}>
            {ABSENCE_TYPES.map((type) => <option key={type} value={type}>{t(`time.types.${type}`)}</option>)}
          </select>
        </Field>
        <Field label={t("time.from")}><input type="date" value={form.from} onChange={(e) => setForm({ ...form, from: e.target.value, to: e.target.value > form.to ? e.target.value : form.to })} /></Field>
        <Field label={t("time.to")}><input type="date" value={form.to} min={form.from} onChange={(e) => setForm({ ...form, to: e.target.value })} /></Field>
        <label className="check wide">
          <input type="checkbox" checked={form.halfDay} disabled={form.from !== form.to} onChange={(e) => setForm({ ...form, halfDay: e.target.checked })} />
          {t("time.halfDay")}
        </label>
        <Field label={t("accounting.note")} wide><input value={form.note} maxLength={300} onChange={(e) => setForm({ ...form, note: e.target.value })} /></Field>
        <p className="muted wide">{t("time.absenceHint")}</p>
        {error && <p className="error wide" role="alert">{error}</p>}
        <div className="wide actions"><button className="button primary"><Plus size={18} /> {t("time.addAbsenceButton")}</button></div>
      </form>

      <div className="acc-toolbar"><YearPicker year={year} onChange={setYear} /></div>
      <section className="card list-card">
        {absences === null ? <p className="muted empty">{t("common.loading")}</p>
          : absences.length === 0 ? <p className="muted empty">{t("time.noAbsences")}</p>
          : absences.map((a) => (
            <div key={a.id} className="list-row">
              <span className={`absence-dot type-${a.type}`} aria-hidden />
              <div className="list-main">
                <strong>{names[a.employeeId] ?? "?"} · {t(`time.types.${a.type}`)}{a.halfDay && ` (${t("time.half")})`}</strong>
                <small className="muted">{day(a.from, { day: "2-digit", month: "2-digit", year: "numeric" })}{a.to !== a.from && ` – ${day(a.to, { day: "2-digit", month: "2-digit", year: "numeric" })}`}{a.note && ` · ${a.note}`}</small>
              </div>
              <button className="icon-button" onClick={() => remove(a)} aria-label={t("common.remove")} title={t("common.remove")}><Trash2 size={17} /></button>
            </div>
          ))}
      </section>
    </div>
  );
}

// ---------- Stempeluhren ----------

function TerminalsTab() {
  const { t, errorText, lang } = useI18n();
  const [terminals, setTerminals] = useState<Terminal[] | null>(null);
  const [name, setName] = useState("");
  const [created, setCreated] = useState<{ link: string; token: string } | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const when = (iso: string | null) => (iso ? new Intl.DateTimeFormat(lang, { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso.endsWith("Z") ? iso : `${iso.replace(" ", "T")}Z`)) : t("time.never"));

  const load = () => api<{ terminals: Terminal[] }>("/time/terminals").then((r) => setTerminals(r.terminals));
  useEffect(() => { load(); }, []);

  const create = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    try {
      setCreated(await api<{ link: string; token: string }>("/time/terminals", { method: "POST", body: { name } }));
      setName("");
      setCopied(false);
      load();
    } catch (e) {
      setError(errorText(e));
    }
  };
  const remove = async (terminal: Terminal) => {
    if (!confirm(t("time.confirmDeleteTerminal", { name: terminal.name }))) return;
    await api(`/time/terminals/${terminal.id}`, { method: "DELETE" });
    load();
  };
  const copy = async () => {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(created.link);
      setCopied(true);
    } catch {
      // Zwischenablage gesperrt: Link bleibt sichtbar zum Abschreiben
    }
  };

  return (
    <div className="stack">
      <section className="card stack">
        <h2 className="card-title"><Nfc size={20} /> {t("time.terminalsTitle")}</h2>
        <p>{t("time.terminalsText")}</p>
        <ol className="steps">
          <li>{t("time.terminalStep1")}</li>
          <li>{t("time.terminalStep2")}</li>
          <li>{t("time.terminalStep3")}</li>
        </ol>
      </section>

      {created && (
        <section className="card stack terminal-created">
          <p className="notice success">{t("time.terminalCreated")}</p>
          <code className="terminal-link">{created.link}</code>
          <div className="row">
            <button className="button" onClick={copy}><Copy size={18} /> {copied ? t("time.copied") : t("time.copyLink")}</button>
            <a className="button" href={created.link} target="_blank" rel="noreferrer">{t("time.openTerminal")}</a>
          </div>
          <p className="muted">{t("time.terminalApi")}</p>
        </section>
      )}

      <form className="card form-grid" onSubmit={create}>
        <Field label={t("time.terminalName")} hint={t("time.terminalNameHint")}><input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} /></Field>
        <div className="actions"><button className="button primary"><Plus size={18} /> {t("time.addTerminal")}</button></div>
        {error && <p className="error wide" role="alert">{error}</p>}
      </form>

      <section className="card list-card">
        {terminals === null ? <p className="muted empty">{t("common.loading")}</p>
          : terminals.length === 0 ? <p className="muted empty">{t("time.noTerminals")}</p>
          : terminals.map((terminal) => (
            <div key={terminal.id} className="list-row">
              <MapPin size={18} className="muted" aria-hidden />
              <div className="list-main">
                <strong>{terminal.name}</strong>
                <small className="muted">{t("time.lastSeen", { when: when(terminal.lastSeenAt) })}</small>
              </div>
              <button className="icon-button" onClick={() => remove(terminal)} aria-label={t("common.remove")} title={t("common.remove")}><Trash2 size={17} /></button>
            </div>
          ))}
      </section>
    </div>
  );
}

// ---------- Einstellungen ----------

function SettingsTab() {
  const { t, errorText } = useI18n();
  const [settings, setSettings] = useState<TimeSettings | null>(null);
  const [status, setStatus] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    api<{ settings: TimeSettings }>(`/time/overview`).then((r) => setSettings(r.settings));
  }, []);

  const save = async (next: TimeSettings) => {
    setSettings(next);
    try {
      await api("/time/settings", { method: "PUT", body: next });
      setStatus({ kind: "success", text: t("time.settingsSaved") });
    } catch (e) {
      setStatus({ kind: "error", text: errorText(e) });
    }
  };

  if (!settings) return <p className="muted">{t("common.loading")}</p>;
  return (
    <section className="card form-grid">
      <h2 className="card-title wide"><Settings2 size={20} /> {t("time.tabSettings")}</h2>
      <Field label={t("time.state")} hint={t("time.stateHint")}>
        <select value={settings.state} onChange={(e) => save({ ...settings, state: e.target.value as TimeSettings["state"] })}>
          {STATES.map((s) => <option key={s} value={s}>{t(`time.states.${s || "none"}`)}</option>)}
        </select>
      </Field>
      <Field label={t("time.since")} hint={t("time.sinceHint")}>
        <input type="date" value={settings.since} onChange={(e) => e.target.value && save({ ...settings, since: e.target.value })} />
      </Field>
      <div className="wide stack time-rules">
        <h3>{t("time.rulesTitle")}</h3>
        <ul>
          <li>{t("time.rule1")}</li>
          <li>{t("time.rule2")}</li>
          <li>{t("time.rule3")}</li>
          <li>{t("time.rule4")}</li>
          <li>{t("time.rule5")}</li>
        </ul>
      </div>
      {status && <p className={`wide ${status.kind === "error" ? "error" : "notice success"}`} role="status">{status.text}</p>}
    </section>
  );
}
