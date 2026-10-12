import { useState, type FormEvent, type ReactNode } from "react";
import { MonitorSmartphone, ShieldCheck, Sparkles } from "lucide-react";
import { api } from "../api";
import { AppIcon, Field, Logo } from "../components";
import { CATALOG } from "../../shared/apps";
import { useI18n } from "../i18n";
import { LanguageSwitch } from "../layout/LanguageSwitch";

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
        </div>
      </main>
    </div>
  );
}

export function AuthPage({ onDone }: { onDone: () => void }) {
  const [mode, setMode] = useState<"login" | "register" | "forgot">("login");
  const [form, setForm] = useState({ companyName: "", name: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);
  const { t, errorText, lang } = useI18n();
  const set = (key: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [key]: e.target.value });
  const switchTo = (next: typeof mode) => {
    setMode(next);
    setError("");
    setForgotSent(false);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (mode === "forgot") {
        await api("/auth/forgot", { method: "POST", body: { email: form.email, lang } });
        setForgotSent(true);
      } else {
        await api(`/auth/${mode}`, { method: "POST", body: { ...form, lang } });
        onDone();
      }
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

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
          <form onSubmit={submit} className="stack">
            <Field label={t("auth.email")}><input type="email" value={form.email} onChange={set("email")} autoComplete="email" required /></Field>
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
          <div className="segmented" role="tablist">
            <button role="tab" aria-selected={!register} className={!register ? "active" : ""} onClick={() => switchTo("login")}>{t("auth.login")}</button>
            <button role="tab" aria-selected={register} className={register ? "active" : ""} onClick={() => switchTo("register")}>{t("auth.register")}</button>
          </div>
          <div className="stack-sm">
            <h2 className="display auth-title">{register ? t("auth.registerTitle") : t("auth.loginTitle")}</h2>
            <p className="muted">
              {register ? t("auth.registerText") : t("auth.loginText")}
            </p>
          </div>
          <form onSubmit={submit} className="stack">
            {register && (
              <>
                <Field label={t("auth.companyName")}><input value={form.companyName} onChange={set("companyName")} autoComplete="organization" required /></Field>
                <Field label={t("auth.yourName")}><input value={form.name} onChange={set("name")} autoComplete="name" required /></Field>
              </>
            )}
            <Field label={t("auth.email")}><input type="email" value={form.email} onChange={set("email")} autoComplete="email" required /></Field>
            <Field label={t("auth.password")} hint={register ? t("auth.passwordHint") : undefined}>
              <input
                type="password"
                value={form.password}
                onChange={set("password")}
                autoComplete={register ? "new-password" : "current-password"}
                minLength={register ? 10 : undefined}
                required
              />
            </Field>
            {error && <p className="error" role="alert">{error}</p>}
            <button className="button primary block" disabled={busy}>
              {busy ? t("common.wait") : register ? t("auth.startFree") : t("auth.login")}
            </button>
          </form>
          {!register && <button type="button" className="text-button" onClick={() => switchTo("forgot")}>{t("auth.forgot")}</button>}
    </AuthLayout>
  );
}
