import { useEffect, useState, type FormEvent } from "react";
import qrcode from "qrcode-generator";
import { Download, History, KeyRound, LogOut, MailWarning, MonitorSmartphone, ShieldCheck, Smartphone, Trash2, TriangleAlert } from "lucide-react";
import { api, type Me } from "../api";
import { Field } from "../components";
import { useI18n } from "../i18n";

/** Bestätigungslink erneut senden. */
function useResend() {
  const [state, setState] = useState<"idle" | "busy" | "sent" | "error">("idle");
  const [error, setError] = useState("");
  const { lang, errorText } = useI18n();
  const resend = async () => {
    setState("busy");
    try {
      await api("/account/verify-email", { method: "POST", body: { lang } });
      setState("sent");
    } catch (err) {
      setError(errorText(err));
      setState("error");
    }
  };
  return { state, error, resend };
}

/** Hinweis oben auf jeder Seite, solange die E-Mail-Adresse nicht bestätigt ist. */
export function VerifyBanner({ me }: { me: Me }) {
  const { state, error, resend } = useResend();
  const { t } = useI18n();
  if (!me.mailEnabled || me.user.emailVerified) return null;
  return (
    <div className="notice verify-banner" role="status">
      <MailWarning size={18} aria-hidden />
      <span>{state === "sent" ? t("account.resent") : state === "error" ? error : t("account.banner", { email: me.user.email })}</span>
      {state !== "sent" && (
        <button type="button" className="text-button" onClick={resend} disabled={state === "busy"}>{t("account.resend")}</button>
      )}
    </div>
  );
}

/** Karte in den Einstellungen: E-Mail-Status und Passwort ändern. */
export function AccountCard({ me }: { me: Me }) {
  const [form, setForm] = useState({ currentPassword: "", newPassword: "" });
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const { state, error, resend } = useResend();
  const { t, errorText } = useI18n();

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      await api("/account/password", { method: "POST", body: form });
      setForm({ currentPassword: "", newPassword: "" });
      setMessage({ ok: true, text: t("account.saved") });
    } catch (err) {
      setMessage({ ok: false, text: errorText(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card">
      <h2 className="card-title"><ShieldCheck size={20} /> {t("account.title")}</h2>
      <dl className="facts">
        <dt>{t("account.email")}</dt>
        <dd>
          {me.user.email}{" "}
          <span className={me.user.emailVerified ? "pill success" : "pill"}>{me.user.emailVerified ? t("account.verified") : t("account.notVerified")}</span>
        </dd>
      </dl>
      {!me.user.emailVerified && me.mailEnabled && (
        state === "sent" ? <p className="muted">{t("account.resent")}</p> : (
          <p>
            <button type="button" className="text-button" onClick={resend} disabled={state === "busy"}>{t("account.resend")}</button>
            {state === "error" && <small className="error"> {error}</small>}
          </p>
        )
      )}
      <form className="stack account-password" onSubmit={submit}>
        <h3 className="card-subtitle"><KeyRound size={17} /> {t("account.changePassword")}</h3>
        <input type="email" value={me.user.email} autoComplete="username" readOnly hidden />
        <Field label={t("account.currentPassword")}>
          <input type="password" value={form.currentPassword} onChange={(e) => setForm({ ...form, currentPassword: e.target.value })} autoComplete="current-password" required />
        </Field>
        <Field label={t("account.newPassword")} hint={t("auth.passwordHint")}>
          <input type="password" value={form.newPassword} onChange={(e) => setForm({ ...form, newPassword: e.target.value })} autoComplete="new-password" minLength={10} required />
        </Field>
        {message && <p className={message.ok ? "success-text" : "error"} role={message.ok ? "status" : "alert"}>{message.text}</p>}
        <div><button className="button" disabled={busy}>{busy ? t("common.wait") : t("account.save")}</button></div>
      </form>
    </section>
  );
}

const formatDate = (iso: string | null, lang: string) =>
  iso ? new Intl.DateTimeFormat(lang, { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso)) : "–";

/** Grobe Gerätebeschreibung aus dem User-Agent, z. B. „Chrome · Windows“. */
export function describeDevice(ua: string | null): string {
  if (!ua) return "?";
  const os = /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows"
    : /Mac OS X|Macintosh/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "";
  const browser = /Edg\//.test(ua) ? "Edge" : /OPR\//.test(ua) ? "Opera" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome"
    : /Safari\//.test(ua) ? "Safari" : "";
  return [browser, os].filter(Boolean).join(" · ") || ua.slice(0, 40);
}

/** Zwei-Faktor-Anmeldung einschalten (QR-Code scannen, Code bestätigen) oder ausschalten. */
export function TwoFactorCard({ me, onChanged }: { me: Me; onChanged: () => void }) {
  const [setup, setSetup] = useState<{ secret: string; url: string } | null>(null);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [recovery, setRecovery] = useState<string[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [disabling, setDisabling] = useState(false);
  const { t, errorText } = useI18n();

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const start = () => run(async () => setSetup(await api<{ secret: string; url: string }>("/account/2fa/setup", { method: "POST" })));
  const enable = (e: FormEvent) => {
    e.preventDefault();
    run(async () => {
      const r = await api<{ recoveryCodes: string[] }>("/account/2fa/enable", { method: "POST", body: { secret: setup!.secret, code } });
      setRecovery(r.recoveryCodes);
      setSetup(null);
      setCode("");
    });
  };
  const disable = (e: FormEvent) => {
    e.preventDefault();
    run(async () => {
      await api("/account/2fa/disable", { method: "POST", body: { password } });
      setPassword("");
      setDisabling(false);
      onChanged();
    });
  };

  const qr = (() => {
    if (!setup) return "";
    const q = qrcode(0, "M");
    q.addData(setup.url);
    q.make();
    return q.createDataURL(5, 2);
  })();

  return (
    <section className="card stack">
      <h2 className="card-title"><Smartphone size={20} /> {t("security.twoFactor")}</h2>
      {recovery ? (
        <div className="stack">
          <p className="success-text">{t("security.twoFactorOn")}</p>
          <p>{t("security.recoveryText")}</p>
          <ul className="recovery-codes">{recovery.map((r) => <li key={r}><code>{r}</code></li>)}</ul>
          <div><button className="button primary" onClick={() => { setRecovery(null); onChanged(); }}>{t("security.recoverySaved")}</button></div>
        </div>
      ) : me.user.twoFactor ? (
        <>
          <p><span className="pill success">{t("security.active")}</span> {t("security.twoFactorActiveText")}</p>
          {disabling ? (
            <form className="stack" onSubmit={disable}>
              <input type="email" value={me.user.email} autoComplete="username" readOnly hidden />
              <Field label={t("account.currentPassword")}>
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
              </Field>
              {error && <p className="error" role="alert">{error}</p>}
              <div className="row">
                <button className="button danger" disabled={busy}>{t("security.disable")}</button>
                <button type="button" className="button" onClick={() => setDisabling(false)}>{t("common.cancel")}</button>
              </div>
            </form>
          ) : (
            <div><button className="button" onClick={() => setDisabling(true)}>{t("security.disable")}</button></div>
          )}
        </>
      ) : setup ? (
        <form className="stack" onSubmit={enable}>
          <p>{t("security.scanText")}</p>
          <div className="totp-setup">
            <img src={qr} alt={t("security.qrAlt")} width={180} height={180} />
            <div className="stack-sm">
              <small className="muted">{t("security.manualKey")}</small>
              <code className="totp-secret">{setup.secret.match(/.{1,4}/g)!.join(" ")}</code>
            </div>
          </div>
          <Field label={t("security.code")}>
            <input value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" maxLength={7} required />
          </Field>
          {error && <p className="error" role="alert">{error}</p>}
          <div className="row">
            <button className="button primary" disabled={busy}>{t("security.enable")}</button>
            <button type="button" className="button" onClick={() => setSetup(null)}>{t("common.cancel")}</button>
          </div>
        </form>
      ) : (
        <>
          <p className="muted">{me.user.role === "staff" ? t("security.twoFactorText") : t("security.twoFactorTextManager")}</p>
          {error && <p className="error" role="alert">{error}</p>}
          <div><button className="button primary" onClick={start} disabled={busy}><ShieldCheck size={18} /> {t("security.setup")}</button></div>
        </>
      )}
    </section>
  );
}

interface Device {
  id: string;
  createdAt: string | null;
  lastSeen: string | null;
  userAgent: string | null;
  current: boolean;
}

export function DevicesCard() {
  const [devices, setDevices] = useState<Device[]>([]);
  const { t, lang, errorText } = useI18n();
  const load = () => api<{ sessions: Device[] }>("/account/sessions").then((r) => setDevices(r.sessions));
  useEffect(() => {
    load();
  }, []);
  const signOut = (d: Device) => api(`/account/sessions/${d.id}`, { method: "DELETE" }).then(load, (err) => alert(errorText(err)));
  const signOutOthers = () => api("/account/sessions/sign-out-others", { method: "POST" }).then(load, (err) => alert(errorText(err)));

  return (
    <section className="card stack">
      <h2 className="card-title"><MonitorSmartphone size={20} /> {t("security.devices")}</h2>
      <p className="muted">{t("security.devicesText")}</p>
      <div className="device-list">
        {devices.map((d) => (
          <div key={d.id} className="device-row">
            <div className="list-main">
              <strong>{describeDevice(d.userAgent)}{d.current && <span className="pill success">{t("security.thisDevice")}</span>}</strong>
              <small className="muted">{t("security.lastActive", { date: formatDate(d.lastSeen ?? d.createdAt, lang) })}</small>
            </div>
            {!d.current && (
              <button className="icon-button danger" onClick={() => signOut(d)} aria-label={t("security.signOutDevice")} title={t("security.signOutDevice")}><LogOut size={18} /></button>
            )}
          </div>
        ))}
      </div>
      {devices.length > 1 && <div><button className="button" onClick={signOutOthers}>{t("security.signOutOthers")}</button></div>}
    </section>
  );
}

interface AuditEntry {
  id: number;
  at: string;
  userName: string | null;
  action: string;
  detail: Record<string, unknown> | null;
}

const FIELD_LABELS: Record<string, string> = {
  name: "settings.name", legalForm: "settings.name", street: "settings.address", postalCode: "settings.address", city: "settings.address",
  country: "settings.address", email: "settings.email", phone: "settings.phone", taxNumber: "settings.taxNumber", vatId: "settings.vatId",
  iban: "settings.iban", bic: "settings.bic", bankName: "settings.bankName", logoDataUrl: "settings.logoAlt",
};

export function AuditCard() {
  const [entries, setEntries] = useState<AuditEntry[] | null>(null);
  const { t, lang, appText } = useI18n();
  useEffect(() => {
    api<{ entries: AuditEntry[] }>("/audit?limit=100").then((r) => setEntries(r.entries));
  }, []);

  const detail = (e: AuditEntry) => {
    const d = e.detail ?? {};
    if (typeof d.email === "string") return d.email;
    if (typeof d.app === "string") return appText(d.app).name;
    if (Array.isArray(d.fields)) return [...new Set(d.fields.map((f) => t(FIELD_LABELS[String(f)] ?? String(f))))].join(", ");
    if (typeof d.device === "string") return describeDevice(d.device);
    return "";
  };

  return (
    <section className="card stack wide-card">
      <h2 className="card-title"><History size={20} /> {t("security.audit")}</h2>
      <p className="muted">{t("security.auditText")}</p>
      {entries === null ? <p className="muted">{t("common.loading")}</p> : entries.length === 0 ? <p className="muted">{t("security.auditEmpty")}</p> : (
        <ol className="audit-list">
          {entries.map((e) => (
            <li key={e.id} className={e.action === "loginFailed" ? "warn" : ""}>
              <time dateTime={e.at}>{formatDate(e.at, lang)}</time>
              <span><strong>{e.userName ?? "–"}</strong> {t(`auditActions.${e.action}`)}{detail(e) && <small className="muted"> · {detail(e)}</small>}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

/** Datenexport und Löschen der Firma (nur Inhaber). */
export function DataCard({ me }: { me: Me }) {
  const [deleting, setDeleting] = useState(false);
  const [form, setForm] = useState({ password: "", companyName: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const { t, errorText } = useI18n();

  const remove = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/account/delete-company", { method: "POST", body: form });
      location.href = "/";
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  };

  return (
    <section className="card stack">
      <h2 className="card-title"><Download size={20} /> {t("security.data")}</h2>
      <p className="muted">{t("security.exportText")}</p>
      <div><a className="button" href="/api/account/export" download><Download size={18} /> {t("security.export")}</a></div>
      <div className="danger-zone stack">
        <h3 className="card-subtitle"><TriangleAlert size={17} /> {t("security.deleteTitle")}</h3>
        <p className="muted">{t("security.deleteText")}</p>
        {deleting ? (
          <form className="stack" onSubmit={remove}>
            <Field label={t("security.deleteConfirmName", { company: me.user.tenantName })}>
              <input value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} autoComplete="off" required />
            </Field>
            <input type="email" value={me.user.email} autoComplete="username" readOnly hidden />
            <Field label={t("account.currentPassword")}>
              <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} autoComplete="current-password" required />
            </Field>
            {error && <p className="error" role="alert">{error}</p>}
            <div className="row">
              <button className="button danger" disabled={busy || form.companyName !== me.user.tenantName}><Trash2 size={18} /> {t("security.deleteFinal")}</button>
              <button type="button" className="button" onClick={() => setDeleting(false)}>{t("common.cancel")}</button>
            </div>
          </form>
        ) : (
          <div><button className="button danger" onClick={() => setDeleting(true)}><Trash2 size={18} /> {t("security.deleteButton")}</button></div>
        )}
      </div>
    </section>
  );
}

/** Seite „Konto“: eigenes Konto, Sicherheit, Protokoll und Daten. */
export function AccountPage({ me, onChanged }: { me: Me; onChanged: () => void }) {
  const { t } = useI18n();
  const isManager = me.user.role !== "staff";
  return (
    <div className="stack-lg">
      <header className="page-head">
        <div>
          <h1 className="display">{t("nav.account")}</h1>
          <p className="muted">{t("security.subtitle")}</p>
        </div>
      </header>
      <div className="columns two">
        <AccountCard me={me} />
        <TwoFactorCard me={me} onChanged={onChanged} />
        <DevicesCard />
        {me.user.role === "owner" && <DataCard me={me} />}
        {isManager && <AuditCard />}
      </div>
    </div>
  );
}
