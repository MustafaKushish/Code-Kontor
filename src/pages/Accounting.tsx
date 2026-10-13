import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Briefcase, CalendarDays, Clock, Download, Lock, Pencil, Plus, Save, Send, Trash2, UserRound, Users, Wallet, X } from "lucide-react";
import { api, ApiError, type Me } from "../api";
import { Avatar, Field } from "../components";
import { useI18n } from "../i18n";
import {
  EMPLOYMENT_TYPES, TAX_CLASSES, emptyAdvisor, emptyEmployee, employedInMonth,
  type Advisor, type Employee, type MonthEntry,
} from "../../shared/accounting";

type Tab = "employees" | "month" | "advisor";
type EmployeeForm = Omit<Employee, "id" | "personnelNumber">;

const currentMonth = () => new Date().toISOString().slice(0, 7);

/** Seite „Buchhaltung“: Mitarbeiter, Monatsmeldung und Steuerberater. Nur für Inhaber und Admins. */
export function AccountingPage({ me }: { me: Me }) {
  const { t } = useI18n();
  const [tab, setTab] = useState<Tab>("employees");
  const [employees, setEmployees] = useState<Employee[] | null>(null);
  const [advisor, setAdvisor] = useState<Advisor | null>(null);

  const loadEmployees = () => api<{ employees: Employee[] }>("/accounting/employees").then((r) => setEmployees(r.employees));
  useEffect(() => {
    loadEmployees();
    api<{ advisor: Advisor | null }>("/accounting/advisor").then((r) => setAdvisor(r.advisor ?? emptyAdvisor));
  }, []);

  const tabs: { id: Tab; label: string; icon: typeof Users }[] = [
    { id: "employees", label: t("accounting.tabEmployees"), icon: Users },
    { id: "month", label: t("accounting.tabMonth"), icon: CalendarDays },
    { id: "advisor", label: t("accounting.tabAdvisor"), icon: Briefcase },
  ];

  return (
    <div className="stack-lg">
      <header className="page-head">
        <div>
          <h1 className="display">{t("accounting.title")}</h1>
          <p className="muted">{t("accounting.subtitle")}</p>
        </div>
      </header>

      <div className="page-tabs" role="tablist" aria-label={t("accounting.title")}>
        {tabs.map(({ id, label, icon: Icon }) => (
          <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? "active" : ""} onClick={() => setTab(id)}>
            <Icon size={17} aria-hidden /> {label}
          </button>
        ))}
      </div>

      {employees === null || advisor === null ? (
        <p className="muted">{t("common.loading")}</p>
      ) : tab === "employees" ? (
        <EmployeesTab employees={employees} onChanged={loadEmployees} />
      ) : tab === "month" ? (
        <MonthTab me={me} employees={employees} advisor={advisor} onGoAdvisor={() => setTab("advisor")} />
      ) : (
        <AdvisorTab advisor={advisor} onSaved={setAdvisor} />
      )}
    </div>
  );
}

function EmployeesTab({ employees, onChanged }: { employees: Employee[]; onChanged: () => void }) {
  const { t, money } = useI18n();
  const [editing, setEditing] = useState<Employee | "new" | null>(null);

  if (editing)
    return (
      <EmployeeEditor
        employee={editing === "new" ? null : editing}
        onClose={() => setEditing(null)}
        onSaved={() => { setEditing(null); onChanged(); }}
      />
    );

  const active = employees.filter((e) => !e.endDate || e.endDate >= new Date().toISOString().slice(0, 10));
  const former = employees.filter((e) => !active.includes(e));
  const row = (e: Employee) => (
    <button key={e.id} className="list-row employee-row" onClick={() => setEditing(e)}>
      <Avatar name={`${e.firstName} ${e.lastName}`} />
      <div className="list-main">
        <strong>{e.firstName} {e.lastName}</strong>
        <small className="muted">
          {t("accounting.personnelNumber", { n: e.personnelNumber })} · {t(`accounting.types.${e.employmentType}`)}
        </small>
      </div>
      <span className="pill">
        {e.payAmount ? t(e.payType === "hourly" ? "accounting.perHour" : "accounting.perMonthPay", { amount: money(e.payAmount) }) : "–"}
      </span>
      <Pencil size={16} className="muted" aria-hidden />
    </button>
  );

  return (
    <>
      <div className="acc-toolbar">
        <p className="muted">{t("accounting.noPayroll")}</p>
        <button className="button primary" onClick={() => setEditing("new")}><Plus size={18} /> {t("accounting.addEmployee")}</button>
      </div>
      <section className="card list-card">
        {employees.length === 0 && <p className="muted empty">{t("accounting.noEmployees")}</p>}
        {active.map(row)}
      </section>
      {former.length > 0 && (
        <section className="card list-card">
          <h2 className="list-title">{t("accounting.former")}</h2>
          {former.map(row)}
        </section>
      )}
    </>
  );
}

function EmployeeEditor({ employee, onClose, onSaved }: { employee: Employee | null; onClose: () => void; onSaved: () => void }) {
  const { t, errorText, lang } = useI18n();
  // 2024-01-01 war ein Montag
  const weekdayName = (d: number) => new Intl.DateTimeFormat(lang, { weekday: "short", timeZone: "UTC" }).format(new Date(Date.UTC(2024, 0, d)));
  const [form, setForm] = useState<EmployeeForm>(() => {
    if (!employee) return { ...emptyEmployee, startDate: new Date().toISOString().slice(0, 10) };
    const { id: _id, personnelNumber: _nr, ...rest } = employee;
    return rest;
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [users, setUsers] = useState<{ id: string; name: string; email: string }[]>([]);
  useEffect(() => {
    api<{ users: { id: string; name: string; email: string }[] }>("/users").then((r) => setUsers(r.users)).catch(() => setUsers([]));
  }, []);

  const set = <K extends keyof EmployeeForm>(key: K, value: EmployeeForm[K]) => setForm((f) => ({ ...f, [key]: value }));
  const text = (key: keyof EmployeeForm, props: { type?: string; autoComplete?: string; inputMode?: "numeric" | "decimal" } = {}) => (
    <input
      type={props.type ?? "text"}
      inputMode={props.inputMode}
      autoComplete={props.autoComplete ?? "off"}
      value={String(form[key] ?? "")}
      onChange={(e) => set(key, (props.type === "number" ? Number(e.target.value) : e.target.value) as never)}
      aria-invalid={!!errors[key]}
      step={props.type === "number" ? "any" : undefined}
      min={props.type === "number" ? 0 : undefined}
    />
  );
  const err = (key: string) => (errors[key] ? t(`accounting.errors.${errors[key]}`) : undefined);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    setErrors({});
    try {
      if (employee) await api(`/accounting/employees/${employee.id}`, { method: "PUT", body: form });
      else await api("/accounting/employees", { method: "POST", body: form });
      onSaved();
    } catch (e) {
      if (e instanceof ApiError && e.errors) setErrors(e.errors);
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!employee || !confirm(t("accounting.confirmDelete", { name: `${employee.firstName} ${employee.lastName}` }))) return;
    try {
      await api(`/accounting/employees/${employee.id}`, { method: "DELETE" });
      onSaved();
    } catch (e) {
      setError(errorText(e));
    }
  };

  return (
    <form className="stack" onSubmit={save} noValidate>
      <div className="acc-toolbar">
        <h2 className="section-title">
          {employee ? `${employee.firstName} ${employee.lastName}` : t("accounting.newEmployee")}
          {employee && <small className="muted"> · {t("accounting.personnelNumber", { n: employee.personnelNumber })}</small>}
        </h2>
        <button type="button" className="button" onClick={onClose}><X size={18} /> {t("common.cancel")}</button>
      </div>

      <section className="card form-grid">
        <h3 className="card-title wide"><UserRound size={20} /> {t("accounting.sectionPerson")}</h3>
        <Field label={t("accounting.firstName")} error={err("firstName")}>{text("firstName", { autoComplete: "off" })}</Field>
        <Field label={t("accounting.lastName")} error={err("lastName")}>{text("lastName")}</Field>
        <Field label={t("accounting.email")} error={err("email")}>{text("email", { type: "email" })}</Field>
        <Field label={t("accounting.phone")}>{text("phone", { type: "tel" })}</Field>
        <Field label={t("accounting.birthDate")}>{text("birthDate", { type: "date" })}</Field>
        <Field label={t("accounting.street")}>{text("street")}</Field>
        <Field label={t("accounting.postalCode")}>{text("postalCode", { inputMode: "numeric" })}</Field>
        <Field label={t("accounting.city")}>{text("city")}</Field>
      </section>

      <section className="card form-grid">
        <h3 className="card-title wide"><Briefcase size={20} /> {t("accounting.sectionJob")}</h3>
        <Field label={t("accounting.employmentType")}>
          <select value={form.employmentType} onChange={(e) => set("employmentType", e.target.value as EmployeeForm["employmentType"])}>
            {EMPLOYMENT_TYPES.map((type) => <option key={type} value={type}>{t(`accounting.types.${type}`)}</option>)}
          </select>
        </Field>
        <Field label={t("accounting.weeklyHours")}>{text("weeklyHours", { type: "number", inputMode: "decimal" })}</Field>
        <Field label={t("accounting.startDate")} error={err("startDate")}>{text("startDate", { type: "date" })}</Field>
        <Field label={t("accounting.endDate")} error={err("endDate")} hint={t("accounting.endDateHint")}>{text("endDate", { type: "date" })}</Field>
        <Field label={t("accounting.vacationDays")}>{text("vacationDays", { type: "number", inputMode: "decimal" })}</Field>
      </section>

      <section className="card form-grid">
        <h3 className="card-title wide"><Clock size={20} /> {t("accounting.sectionTime")}</h3>
        <Field label={t("accounting.chipId")} error={err("chipId")} hint={t("accounting.chipIdHint")}>{text("chipId")}</Field>
        <Field label={t("accounting.linkedUser")} error={err("userId")} hint={t("accounting.linkedUserHint")}>
          <select value={form.userId} onChange={(e) => set("userId", e.target.value)}>
            <option value="">{t("accounting.linkedUserNone")}</option>
            {users.map((u) => <option key={u.id} value={u.id}>{u.name} ({u.email})</option>)}
          </select>
        </Field>
        <fieldset className="wide weekdays">
          <legend>{t("accounting.workDays")}</legend>
          {[1, 2, 3, 4, 5, 6, 7].map((d) => (
            <label key={d} className={`weekday ${form.workDays.includes(d) ? "on" : ""}`}>
              <input
                type="checkbox" checked={form.workDays.includes(d)}
                onChange={(e) => set("workDays", e.target.checked ? [...form.workDays, d].sort() : form.workDays.filter((x) => x !== d))}
              />
              {weekdayName(d)}
            </label>
          ))}
        </fieldset>
        <Field label={t("accounting.openingBalance")} hint={t("accounting.openingBalanceHint")}>
          <input type="number" inputMode="decimal" step="any" value={form.openingBalance || ""} placeholder="0" onChange={(e) => set("openingBalance", Number(e.target.value) || 0)} />
        </Field>
        <Field label={t("accounting.vacationCarryover")} hint={t("accounting.vacationCarryoverHint")}>{text("vacationCarryover", { type: "number", inputMode: "decimal" })}</Field>
      </section>

      <section className="card form-grid">
        <h3 className="card-title wide"><Wallet size={20} /> {t("accounting.sectionPay")}</h3>
        <Field label={t("accounting.payType")}>
          <select value={form.payType} onChange={(e) => set("payType", e.target.value as EmployeeForm["payType"])}>
            <option value="monthly">{t("accounting.payMonthly")}</option>
            <option value="hourly">{t("accounting.payHourly")}</option>
          </select>
        </Field>
        <Field label={t("accounting.payAmount")}>{text("payAmount", { type: "number", inputMode: "decimal" })}</Field>
        <Field label={t("accounting.taxClass")}>
          <select value={form.taxClass} onChange={(e) => set("taxClass", e.target.value as EmployeeForm["taxClass"])}>
            {TAX_CLASSES.map((c) => <option key={c} value={c}>{c || t("accounting.taxClassNone")}</option>)}
          </select>
        </Field>
        <Field label={t("accounting.healthInsurance")}>{text("healthInsurance")}</Field>
      </section>

      <section className="card form-grid">
        <h3 className="card-title wide"><Lock size={20} /> {t("accounting.sectionTax")}</h3>
        <p className="muted wide">{t("accounting.sensitiveHint")}</p>
        <Field label={t("accounting.taxId")} error={err("taxId")}>{text("taxId", { inputMode: "numeric" })}</Field>
        <Field label={t("accounting.ssn")} error={err("socialSecurityNumber")}>{text("socialSecurityNumber")}</Field>
        <Field label={t("accounting.iban")} error={err("iban")} wide>{text("iban")}</Field>
        <Field label={t("accounting.notes")} wide>
          <textarea rows={3} value={form.notes} onChange={(e) => set("notes", e.target.value)} />
        </Field>
      </section>

      {error && <p className="error" role="alert">{error}</p>}
      <div className="actions spread">
        {employee ? (
          <button type="button" className="button danger" onClick={remove}><Trash2 size={18} /> {t("common.remove")}</button>
        ) : <span />}
        <button className="button primary" disabled={busy}><Save size={18} /> {busy ? t("common.wait") : t("accounting.save")}</button>
      </div>
    </form>
  );
}

type Row = Omit<MonthEntry, "employeeId" | "month">;
const emptyRow: Row = { hours: 0, overtimeHours: 0, vacationDays: 0, sickDays: 0, bonus: 0, note: "" };

function MonthTab({ me, employees, advisor, onGoAdvisor }: { me: Me; employees: Employee[]; advisor: Advisor; onGoAdvisor: () => void }) {
  const { t, errorText, lang } = useI18n();
  const [month, setMonth] = useState(currentMonth);
  const [rows, setRows] = useState<Record<string, Row>>({});
  const [loaded, setLoaded] = useState(false);
  const [status, setStatus] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const people = useMemo(() => employees.filter((e) => employedInMonth(e, month)), [employees, month]);

  useEffect(() => {
    if (!/^\d{4}-\d{2}$/.test(month)) return;
    setLoaded(false);
    setStatus(null);
    api<{ entries: MonthEntry[] }>(`/accounting/month/${month}`).then((r) => {
      setRows(Object.fromEntries(r.entries.map(({ employeeId, month: _m, ...rest }) => [employeeId, rest])));
      setLoaded(true);
    });
  }, [month]);

  const row = (id: string) => rows[id] ?? emptyRow;
  const setCell = (id: string, key: keyof Row, value: string) =>
    setRows((r) => ({ ...r, [id]: { ...row(id), [key]: key === "note" ? value : Number(value.replace(",", ".")) || 0 } }));

  const persist = () =>
    api(`/accounting/month/${month}`, { method: "PUT", body: { entries: people.map((e) => ({ employeeId: e.id, ...row(e.id) })) } });

  const run = async (action: () => Promise<string | void>) => {
    setBusy(true);
    setStatus(null);
    try {
      const text = await action();
      if (text) setStatus({ kind: "success", text });
    } catch (e) {
      setStatus({ kind: "error", text: errorText(e) });
    } finally {
      setBusy(false);
    }
  };

  const save = () => run(async () => { await persist(); return t("accounting.monthSaved"); });
  const fromTime = () => run(async () => {
    const r = await api<{ entries: { employeeId: string; hours: number; overtimeHours: number; vacationDays: number; sickDays: number }[] }>(`/accounting/month/${month}/from-time`);
    setRows((current) => {
      const next = { ...current };
      for (const { employeeId, ...values } of r.entries) next[employeeId] = { ...(current[employeeId] ?? emptyRow), ...values };
      return next;
    });
    return t("accounting.fromTimeDone");
  });
  const download = () => run(async () => { await persist(); window.location.href = `/api/accounting/month/${month}/export`; });
  const send = () => run(async () => {
    await persist();
    const r = await api<{ to: string }>(`/accounting/month/${month}/send`, { method: "POST", body: { lang } });
    return t("accounting.sent", { email: r.to });
  });

  const numberCell = (e: Employee, key: keyof Row, label: string) => (
    <td data-label={label}>
      <input
        type="number" inputMode="decimal" min={0} step="any" aria-label={`${label}: ${e.firstName} ${e.lastName}`}
        value={row(e.id)[key] || ""} placeholder="0" onChange={(ev) => setCell(e.id, key, ev.target.value)}
      />
    </td>
  );

  const canSend = me.mailEnabled && !!advisor.email;
  return (
    <div className="stack">
      <div className="acc-toolbar">
        <Field label={t("accounting.month")}>
          <input type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} />
        </Field>
        <p className="muted">{t("accounting.monthHint")}</p>
        <button className="button" onClick={fromTime} disabled={busy || !loaded}><Clock size={18} /> {t("accounting.fromTime")}</button>
      </div>

      <section className="card month-card">
        {!loaded ? (
          <p className="muted">{t("common.loading")}</p>
        ) : people.length === 0 ? (
          <p className="muted empty">{t("accounting.noEmployeesInMonth")}</p>
        ) : (
          <table className="month-table">
            <thead>
              <tr>
                <th>{t("accounting.employee")}</th>
                <th>{t("accounting.hours")}</th>
                <th>{t("accounting.overtime")}</th>
                <th>{t("accounting.vacation")}</th>
                <th>{t("accounting.sick")}</th>
                <th>{t("accounting.bonus")}</th>
                <th>{t("accounting.note")}</th>
              </tr>
            </thead>
            <tbody>
              {people.map((e) => (
                <tr key={e.id}>
                  <th scope="row">
                    <strong>{e.firstName} {e.lastName}</strong>
                    <small className="muted">{t(`accounting.types.${e.employmentType}`)}</small>
                  </th>
                  {numberCell(e, "hours", t("accounting.hours"))}
                  {numberCell(e, "overtimeHours", t("accounting.overtime"))}
                  {numberCell(e, "vacationDays", t("accounting.vacation"))}
                  {numberCell(e, "sickDays", t("accounting.sick"))}
                  {numberCell(e, "bonus", t("accounting.bonus"))}
                  <td data-label={t("accounting.note")}>
                    <input value={row(e.id).note} aria-label={`${t("accounting.note")}: ${e.firstName} ${e.lastName}`} onChange={(ev) => setCell(e.id, "note", ev.target.value)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {status && <p className={status.kind === "error" ? "error" : "notice success"} role="status">{status.text}</p>}
      {people.length > 0 && (
        <div className="actions month-actions">
          <button className="button" onClick={save} disabled={busy}><Save size={18} /> {t("accounting.saveMonth")}</button>
          <button className="button" onClick={download} disabled={busy}><Download size={18} /> {t("accounting.download")}</button>
          <button className="button primary" onClick={send} disabled={busy || !canSend}><Send size={18} /> {t("accounting.send")}</button>
        </div>
      )}
      {people.length > 0 && !canSend && (
        <p className="muted">
          {!me.mailEnabled ? t("accounting.sendNoMail") : (
            <>{t("accounting.sendNeedsAdvisor")} <button className="text-button" onClick={onGoAdvisor}>{t("accounting.tabAdvisor")}</button></>
          )}
        </p>
      )}
    </div>
  );
}

function AdvisorTab({ advisor, onSaved }: { advisor: Advisor; onSaved: (a: Advisor) => void }) {
  const { t, errorText } = useI18n();
  const [form, setForm] = useState<Advisor>(advisor);
  const [status, setStatus] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const field = (key: keyof Advisor, props: { type?: string; inputMode?: "numeric"; maxLength?: number } = {}) => (
    <input type={props.type ?? "text"} inputMode={props.inputMode} maxLength={props.maxLength} value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} />
  );

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setStatus(null);
    setErrors({});
    try {
      const r = await api<{ advisor: Advisor }>("/accounting/advisor", { method: "PUT", body: form });
      setForm(r.advisor);
      onSaved(r.advisor);
      setStatus({ kind: "success", text: t("accounting.advisorSaved") });
    } catch (e) {
      if (e instanceof ApiError && e.errors) setErrors(e.errors);
      setStatus({ kind: "error", text: errorText(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="card form-grid" onSubmit={save} noValidate>
      <h2 className="card-title wide"><Briefcase size={20} /> {t("accounting.tabAdvisor")}</h2>
      <Field label={t("accounting.firm")}>{field("firm")}</Field>
      <Field label={t("accounting.contactName")}>{field("contactName")}</Field>
      <Field label={t("accounting.email")} error={errors.email ? t(`accounting.errors.${errors.email}`) : undefined} hint={t("accounting.advisorEmailHint")}>{field("email", { type: "email" })}</Field>
      <Field label={t("accounting.phone")}>{field("phone", { type: "tel" })}</Field>
      <Field label={t("accounting.consultantNumber")}>{field("consultantNumber", { inputMode: "numeric", maxLength: 7 })}</Field>
      <Field label={t("accounting.clientNumber")}>{field("clientNumber", { inputMode: "numeric", maxLength: 5 })}</Field>
      <Field label={t("accounting.chartOfAccounts")}>
        <select value={form.chartOfAccounts} onChange={(e) => setForm({ ...form, chartOfAccounts: e.target.value as Advisor["chartOfAccounts"] })}>
          <option value="">{t("accounting.chartNone")}</option>
          <option value="SKR03">SKR03</option>
          <option value="SKR04">SKR04</option>
        </select>
      </Field>
      <p className="muted wide">{t("accounting.advisorHint")}</p>
      <Field label={t("accounting.notes")} wide>
        <textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
      </Field>
      {status && <p className={`wide ${status.kind === "error" ? "error" : "notice success"}`} role="status">{status.text}</p>}
      <div className="wide actions"><button className="button primary" disabled={busy}><Save size={18} /> {busy ? t("common.wait") : t("accounting.save")}</button></div>
    </form>
  );
}
