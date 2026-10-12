import { useState, type FormEvent } from "react";
import { api, ApiError } from "../api";
import { Logo } from "../components";

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
    <main className="auth">
      <div className="card auth-card">
        <Logo />
        <h1>{register ? "Konto anlegen" : "Anmelden"}</h1>
        <p className="muted">
          {register
            ? "Deine Firma bekommt sofort ihre eigene, getrennte Datenbank."
            : "Willkommen zurück bei Code Kontor."}
        </p>
        <form onSubmit={submit} className="stack">
          {register && (
            <>
              <label>
                Firmenname
                <input value={form.companyName} onChange={set("companyName")} autoComplete="organization" required />
              </label>
              <label>
                Dein Name
                <input value={form.name} onChange={set("name")} autoComplete="name" required />
              </label>
            </>
          )}
          <label>
            E-Mail
            <input type="email" value={form.email} onChange={set("email")} autoComplete="email" required />
          </label>
          <label>
            Passwort
            <input
              type="password"
              value={form.password}
              onChange={set("password")}
              autoComplete={register ? "new-password" : "current-password"}
              minLength={register ? 10 : undefined}
              required
            />
            {register && <small className="muted">Mindestens 10 Zeichen.</small>}
          </label>
          {error && <p className="error" role="alert">{error}</p>}
          <button className="primary" disabled={busy}>
            {busy ? "Bitte warten …" : register ? "Konto anlegen" : "Anmelden"}
          </button>
        </form>
        <button className="link" onClick={() => { setMode(register ? "login" : "register"); setError(""); }}>
          {register ? "Schon ein Konto? Anmelden" : "Neu hier? Konto anlegen"}
        </button>
      </div>
    </main>
  );
}
