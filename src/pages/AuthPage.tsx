import { useState, type FormEvent } from "react";
import { MonitorSmartphone, ShieldCheck, Sparkles } from "lucide-react";
import { api } from "../api";
import { AppIcon, Field, Logo } from "../components";
import { CATALOG } from "../../shared/apps";
import { useI18n } from "../i18n";
import { LanguageSwitch } from "../layout/LanguageSwitch";

export function AuthPage({ onDone }: { onDone: () => void }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [form, setForm] = useState({ companyName: "", name: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const { t, errorText } = useI18n();
  const set = (key: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [key]: e.target.value });

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api(`/auth/${mode}`, { method: "POST", body: form });
      onDone();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const register = mode === "register";
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
          <div className="segmented" role="tablist">
            <button role="tab" aria-selected={!register} className={!register ? "active" : ""} onClick={() => { setMode("login"); setError(""); }}>{t("auth.login")}</button>
            <button role="tab" aria-selected={register} className={register ? "active" : ""} onClick={() => { setMode("register"); setError(""); }}>{t("auth.register")}</button>
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
        </div>
      </main>
    </div>
  );
}
