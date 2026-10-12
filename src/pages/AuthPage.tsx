import { useState, type FormEvent } from "react";
import { MonitorSmartphone, ShieldCheck, Sparkles } from "lucide-react";
import { api, ApiError } from "../api";
import { AppIcon, Field, Logo } from "../components";
import { CATALOG } from "../../shared/apps";

export function AuthPage({ onDone }: { onDone: () => void }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [form, setForm] = useState({ companyName: "", name: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (key: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [key]: e.target.value });

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api(`/auth/${mode}`, { method: "POST", body: form });
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Keine Verbindung zum Server.");
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
          <h1 className="display">Ein System für jedes Geschäft.</h1>
          <p>Friseur, Werkstatt, Restaurant, Laden oder Handyshop: fertig eingerichtet, monatlich mietbar.</p>
        </div>
        <div className="auth-apps">
          {CATALOG.map((app) => <AppIcon key={app.id} app={app} size="md" />)}
        </div>
        <ul className="auth-points">
          <li><ShieldCheck size={18} /> Eigene Datenbank für jede Firma</li>
          <li><MonitorSmartphone size={18} /> Handy, Tablet und Laptop</li>
          <li><Sparkles size={18} /> In wenigen Minuten startklar</li>
        </ul>
      </aside>

      <main className="auth-main">
        <div className="auth-form">
          <div className="auth-mobile-logo"><Logo /></div>
          <div className="segmented" role="tablist">
            <button role="tab" aria-selected={!register} className={!register ? "active" : ""} onClick={() => { setMode("login"); setError(""); }}>Anmelden</button>
            <button role="tab" aria-selected={register} className={register ? "active" : ""} onClick={() => { setMode("register"); setError(""); }}>Konto anlegen</button>
          </div>
          <div className="stack-sm">
            <h2 className="display auth-title">{register ? "Starte mit Code Kontor" : "Willkommen zurück"}</h2>
            <p className="muted">
              {register ? "Deine Firma bekommt sofort ihre eigene, getrennte Datenbank." : "Melde dich mit deiner E-Mail-Adresse an."}
            </p>
          </div>
          <form onSubmit={submit} className="stack">
            {register && (
              <>
                <Field label="Firmenname"><input value={form.companyName} onChange={set("companyName")} autoComplete="organization" required /></Field>
                <Field label="Dein Name"><input value={form.name} onChange={set("name")} autoComplete="name" required /></Field>
              </>
            )}
            <Field label="E-Mail"><input type="email" value={form.email} onChange={set("email")} autoComplete="email" required /></Field>
            <Field label="Passwort" hint={register ? "Mindestens 10 Zeichen." : undefined}>
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
              {busy ? "Bitte warten …" : register ? "Kostenlos starten" : "Anmelden"}
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
