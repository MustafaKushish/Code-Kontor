import { useEffect, useState, type FormEvent } from "react";
import { api, ApiError, roleLabel, type Me, type Role } from "../api";
import { Logo } from "../components";
import type { CompanyProfile } from "../../shared/company";

interface TeamMember {
  id: string;
  email: string;
  name: string;
  role: Role;
}

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
}

export function Dashboard({ me, onEditCompany, onLogout }: { me: Me; onEditCompany: () => void; onLogout: () => void }) {
  const [company, setCompany] = useState<CompanyProfile | null>(null);
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const canManage = me.user.role !== "staff";

  useEffect(() => {
    api<{ company: CompanyProfile | null }>("/company").then((r) => setCompany(r.company));
    const handler = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e as InstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  return (
    <main className="page">
      <header className="topbar">
        <Logo />
        <div className="row">
          <span className="muted hide-small">{me.user.name} · {roleLabel[me.user.role]}</span>
          <button className="link" onClick={onLogout}>Abmelden</button>
        </div>
      </header>

      <section className="hero">
        <p className="eyebrow">{company?.name || me.user.tenantName}</p>
        <h1>Hallo {me.user.name.split(" ")[0]}!</h1>
        {!me.setupComplete && (
          <p className="notice">Die Firmendaten sind noch nicht vollständig. Der Inhaber oder ein Admin kann sie einrichten.</p>
        )}
      </section>

      <div className="columns">
        <section className="card">
          <div className="card-head">
            <h2>Firmendaten</h2>
            {canManage && <button className="link" onClick={onEditCompany}>Bearbeiten</button>}
          </div>
          {company ? <CompanySummary company={company} /> : <p className="muted">Lädt …</p>}
        </section>

        <section className="card">
          <h2>Deine Systeme</h2>
          {me.installedApps.length === 0 ? (
            <p className="muted">
              Hier erscheinen bald die Branchen-Systeme, die du aus dem App-Katalog installierst, zum Beispiel für
              Friseur, Werkstatt, Restaurant oder Einzelhandel.
            </p>
          ) : (
            <ul>{me.installedApps.map((a) => <li key={a}>{a}</li>)}</ul>
          )}
          {installPrompt && (
            <button className="primary" onClick={() => installPrompt.prompt().then(() => setInstallPrompt(null))}>
              Code Kontor als App installieren
            </button>
          )}
        </section>

        {canManage && <Team me={me} />}
      </div>
    </main>
  );
}

function CompanySummary({ company }: { company: CompanyProfile }) {
  const maskedIban = company.iban ? `${company.iban.slice(0, 4)} •••• ${company.iban.slice(-4)}` : "–";
  return (
    <dl className="facts">
      {company.logoDataUrl && <img className="company-logo" src={company.logoDataUrl} alt="Firmenlogo" />}
      <dt>Adresse</dt>
      <dd>{[company.street, `${company.postalCode} ${company.city}`.trim()].filter(Boolean).join(", ") || "–"}</dd>
      <dt>Steuernummer</dt>
      <dd>{company.taxNumber || "–"}</dd>
      <dt>USt-IdNr.</dt>
      <dd>{company.vatId || "–"}</dd>
      <dt>IBAN</dt>
      <dd>{maskedIban}</dd>
    </dl>
  );
}

function Team({ me }: { me: Me }) {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "staff" as Role });
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);

  const load = () => api<{ users: TeamMember[] }>("/users").then((r) => setMembers(r.users));
  useEffect(() => {
    load();
  }, []);

  const add = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    try {
      await api("/users", { method: "POST", body: form });
      setForm({ name: "", email: "", password: "", role: "staff" });
      setOpen(false);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Keine Verbindung zum Server.");
    }
  };

  const remove = async (member: TeamMember) => {
    if (!confirm(`${member.name} wirklich entfernen?`)) return;
    try {
      await api(`/users/${member.id}`, { method: "DELETE" });
      load();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Keine Verbindung zum Server.");
    }
  };

  const canRemove = (m: TeamMember) => m.id !== me.user.id && m.role !== "owner" && (m.role === "staff" || me.user.role === "owner");

  return (
    <section className="card">
      <div className="card-head">
        <h2>Team</h2>
        <button className="link" onClick={() => setOpen(!open)}>{open ? "Schließen" : "Person hinzufügen"}</button>
      </div>
      <ul className="team">
        {members.map((m) => (
          <li key={m.id}>
            <div>
              <strong>{m.name}</strong>
              <small className="muted">{m.email}</small>
            </div>
            <span className="badge">{roleLabel[m.role]}</span>
            {canRemove(m) && <button className="link danger" onClick={() => remove(m)}>Entfernen</button>}
          </li>
        ))}
      </ul>
      {open && (
        <form className="stack" onSubmit={add}>
          <label>Name<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></label>
          <label>E-Mail<input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required /></label>
          <label>
            Startpasswort
            <input type="text" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} minLength={10} required />
            <small className="muted">Gib es der Person persönlich weiter.</small>
          </label>
          <label>
            Rolle
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
              <option value="staff">Mitarbeiter</option>
              {me.user.role === "owner" && <option value="admin">Admin</option>}
            </select>
          </label>
          {error && <p className="error" role="alert">{error}</p>}
          <button className="primary">Hinzufügen</button>
        </form>
      )}
    </section>
  );
}
