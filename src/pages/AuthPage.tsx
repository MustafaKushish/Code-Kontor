import { useState, type FormEvent, type ReactNode } from "react";
import { countryTax, guessCountry, sortedCountries } from "../../shared/countries";
import { countryMethods, PAYMENT_METHOD_NAMES } from "../../shared/payments";
import { MonitorSmartphone, ShieldCheck, Sparkles } from "lucide-react";
import { api, ApiError, setStoredToken } from "../api";
import { AppIcon, Field, Logo } from "../components";
import { CATALOG } from "../../shared/apps";
import { useI18n } from "../i18n";
import { LanguageSwitch } from "../layout/LanguageSwitch";
import { LegalLinks } from "./Legal";

/** Rahmen für alle Seiten ohne Anmeldung: Marke links, Formular rechts. */
export function AuthLayout({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  return (
    <div className="auth">
      <aside className="auth-brand">
        <div className="aurora" aria-hidden><span /><span /><span /></div>
        <Logo />
        <div className="stack">
          <h1 className="display">{t("auth.heroTitle")}</h1>
          <p>{t("auth.heroText")}</p>
        </div>
        <div className="auth-apps">
          {CATALOG.map((app) => <AppIcon key={app.id} app={app} size="md" />)}
        </div>
        <ul className="auth-points">
          <li><ShieldCheck size={18} /> {t("auth.point1")}</li>
          <li><MonitorSmartphone size={18} /> {t("auth.point2")}</li>
          <li><Sparkles size={18} /> {t("auth.point3")}</li>
        </ul>
      </aside>

      <main className="auth-main">
        <div className="auth-form">
          <div className="auth-top">
            <div className="auth-mobile-logo"><Logo /></div>
            <LanguageSwitch />
          </div>
          {children}
          <LegalLinks />
        </div>
      </main>
    </div>
  );
}

export function AuthPage({ onDone }: { onDone: () => void }) {
  const [mode, setMode] = useState<"login" | "register" | "forgot">("login");
  const [form, setForm] = useState({ companyName: "", name: "", email: "", password: "", country: guessCountry(navigator.languages ?? [navigator.language]) });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);
  const [ticket, setTicket] = useState("");
  const [code, setCode] = useState("");
  const { t, errorText, lang } = useI18n();
  // Immer vom neuesten Stand ausgehen: Beim automatischen Ausfüllen kommen E-Mail und Passwort im selben Moment.
  const set = (key: keyof typeof form) => (e: { target: { value: string } }) => {
    const value = e.target.value;
    setForm((f) => ({ ...f, [key]: value }));
  };
  const switchTo = (next: typeof mode) => {
    setMode(next);
    setError("");
    setForgotSent(false);
  };

  const loginAsDemo = async () => {
    setBusy(true);
    setError("");
    try {
      const r = await api<{ token?: string }>("/auth/demo", { method: "POST" });
      if (r.token) setStoredToken(r.token);
      onDone();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    // Manche Browser füllen Felder aus, ohne das Formular zu benachrichtigen: Werte direkt aus den Feldern lesen
    const fields = event.currentTarget;
    const filled = {
      email: fields.querySelector<HTMLInputElement>("input[type=email]")?.value ?? form.email,
      password: fields.querySelector<HTMLInputElement>("input[type=password]")?.value ?? form.password,
    };
    setBusy(true);
    setError("");
    try {
      if (mode === "forgot") {
        await api("/auth/forgot", { method: "POST", body: { email: filled.email, lang } });
        setForgotSent(true);
      } else if (ticket) {
        const r = await api<{ token?: string }>("/auth/login/2fa", { method: "POST", body: { ticket, code } });
        if (r.token) setStoredToken(r.token);
        onDone();
      } else {
        const r = await api<{ twoFactor?: boolean; ticket?: string; token?: string }>(`/auth/${mode}`, { method: "POST", body: { ...form, ...filled, lang } });
        if (r.twoFactor && r.ticket) setTicket(r.ticket);
        else {
          if (r.token) setStoredToken(r.token);
          onDone();
        }
      }
    } catch (err) {
      setError(errorText(err));
      // Abgelaufener Zwischenschritt: zurück zur Passwort-Eingabe
      if (ticket && err instanceof ApiError && err.code === "loginExpired") {
        setTicket("");
        setCode("");
      }
    } finally {
      setBusy(false);
    }
  };

  if (ticket)
    return (
      <AuthLayout>
        <div className="stack-sm">
          <h2 className="display auth-title">{t("auth.codeTitle")}</h2>
          <p className="muted">{t("auth.codeText")}</p>
        </div>
        <form onSubmit={submit} className="stack">
          <Field label={t("auth.codeLabel")} hint={t("auth.codeHint")}>
            <input value={code} onChange={(e) => setCode(e.target.value)} autoComplete="one-time-code" inputMode="text" autoFocus required />
          </Field>
          {error && <p className="error" role="alert">{error}</p>}
          <button className="button primary block" disabled={busy}>{busy ? t("common.wait") : t("auth.codeSubmit")}</button>
        </form>
        <button type="button" className="text-button" onClick={() => { setTicket(""); setCode(""); setError(""); }}>{t("auth.backToLogin")}</button>
      </AuthLayout>
    );

  if (mode === "forgot")
    return (
      <AuthLayout>
        <div className="stack-sm">
          <h2 className="display auth-title">{t("auth.forgotTitle")}</h2>
          <p className="muted">{t("auth.forgotText")}</p>
        </div>
        {forgotSent ? (
          <p className="notice success" role="status">{t("auth.forgotSent")}</p>
        ) : (
          <form onSubmit={submit} className="stack" noValidate>
            <Field label={t("auth.email")}><input type="email" name="email" defaultValue={form.email} onChange={set("email")} autoComplete="email" autoCapitalize="none" /></Field>
            {error && <p className="error" role="alert">{error}</p>}
            <button className="button primary block" disabled={busy}>{busy ? t("common.wait") : t("auth.forgotSubmit")}</button>
          </form>
        )}
        <button type="button" className="text-button" onClick={() => switchTo("login")}>{t("auth.backToLogin")}</button>
      </AuthLayout>
    );

  const register = mode === "register";
  return (
    <AuthLayout>
          <div className="card" style={{ background: "linear-gradient(135deg, var(--panel), var(--panel-2))", border: "1.5px solid var(--brand)", padding: "16px 18px", borderRadius: "18px", display: "grid", gap: "10px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", fontWeight: "700" }}>
              <Sparkles size={18} style={{ color: "var(--brand)" }} />
              <span>Direkter Demo-Zugang</span>
            </div>
            <p className="muted small" style={{ margin: 0 }}>
              Klicke hier, um dich sofort ohne Passworteingabe mit einem voll eingerichteten Demo-Konto anzumelden (inkl. Handy- & IT-Service, Kasse und Daten):
            </p>
            <button
              type="button"
              className="button primary block"
              onClick={loginAsDemo}
              disabled={busy}
            >
              <Sparkles size={18} /> {busy ? t("common.wait") : "Demo-Konto öffnen (1-Klick Login)"}
            </button>
            <div className="small muted" style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: "4px", fontSize: "0.8rem", borderTop: "1px solid var(--line)", paddingTop: "8px" }}>
              <span>E-Mail: <strong>demo@code-kontor.de</strong></span>
              <span>Passwort: <strong>Password123!</strong></span>
            </div>
          </div>

          <div className="segmented" role="tablist" style={{ marginTop: "12px" }}>
            <button role="tab" aria-selected={!register} className={!register ? "active" : ""} onClick={() => switchTo("login")}>{t("auth.login")}</button>
            <button role="tab" aria-selected={register} className={register ? "active" : ""} onClick={() => switchTo("register")}>{t("auth.register")}</button>
          </div>
          <div className="stack-sm">
            <h2 className="display auth-title">{register ? t("auth.registerTitle") : t("auth.loginTitle")}</h2>
            <p className="muted">
              {register ? t("auth.registerText") : t("auth.loginText")}
            </p>
          </div>
          {/* Ohne Browser-Prüfung: Safari auf dem iPhone blockiert sonst still, wenn das automatische Ausfüllen nicht gemeldet wird. Der Server prüft alles und antwortet mit einer Meldung. */}
          <form onSubmit={submit} className="stack" noValidate>
            {register && (
              <>
                <Field label={t("auth.companyName")}><input value={form.companyName} onChange={set("companyName")} autoComplete="organization" required /></Field>
                <Field label={t("auth.yourName")}><input value={form.name} onChange={set("name")} autoComplete="name" required /></Field>
                <Field label={t("auth.country")} hint={t("auth.countryHint")}>
                  <select value={form.country} onChange={set("country")} autoComplete="country">
                    {sortedCountries(lang).map(([code, name]) => <option key={code} value={code}>{name}</option>)}
                  </select>
                </Field>
                <p className="country-facts small" aria-live="polite">
                  <span>{t("auth.factCurrency")}: <strong>{countryTax(form.country).currency}</strong></span>
                  <span>{t("auth.factBank")}: <strong>{t(countryTax(form.country).iban ? "auth.bankIban" : "auth.bankLocal")}</strong></span>
                  <span>{t("auth.factPay")}: <strong>{countryMethods(form.country).map((id) => PAYMENT_METHOD_NAMES[id]).join(", ")}</strong></span>
                </p>
              </>
            )}
            <Field label={t("auth.email")}><input type="email" name="email" defaultValue={form.email} onChange={set("email")} autoComplete="email" autoCapitalize="none" /></Field>
            <Field label={t("auth.password")} hint={register ? t("auth.passwordHint") : undefined}>
              <input
                type="password"
                name="password"
                defaultValue={form.password}
                onChange={set("password")}
                autoComplete={register ? "new-password" : "current-password"}
              />
            </Field>
            {error && <p className="error" role="alert">{error}</p>}
            <button className="button primary block" disabled={busy}>
              {busy ? t("common.wait") : register ? t("auth.startFree") : t("auth.login")}
            </button>
          </form>
          {!register && (
            <div className="stack" style={{ marginTop: "4px" }}>
              <button type="button" className="text-button" onClick={() => switchTo("forgot")}>{t("auth.forgot")}</button>
            </div>
          )}
    </AuthLayout>
  );
}
