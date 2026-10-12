import { useEffect, useState, type FormEvent } from "react";
import { Plus, Trash2, X } from "lucide-react";
import { api, type Me, type Role } from "../api";
import { Avatar, Field } from "../components";
import { useI18n } from "../i18n";

interface TeamMember {
  id: string;
  email: string;
  name: string;
  role: Role;
}

export function Team({ me }: { me: Me }) {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "staff" as Role });
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const { t, errorText } = useI18n();

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
      setError(errorText(err));
    }
  };

  const remove = async (member: TeamMember) => {
    if (!confirm(t("team.confirmRemove", { name: member.name }))) return;
    try {
      await api(`/users/${member.id}`, { method: "DELETE" });
      load();
    } catch (err) {
      alert(errorText(err));
    }
  };

  const canRemove = (m: TeamMember) => m.id !== me.user.id && m.role !== "owner" && (m.role === "staff" || me.user.role === "owner");

  return (
    <div className="stack-lg">
      <header className="page-head">
        <div>
          <h1 className="display">{t("nav.team")}</h1>
          <p className="muted">{t("team.subtitle", { company: me.user.tenantName })}</p>
        </div>
        <button className={open ? "button" : "button primary"} onClick={() => setOpen(!open)}>
          {open ? <><X size={18} /> {t("team.close")}</> : <><Plus size={18} /> {t("team.add")}</>}
        </button>
      </header>

      {open && (
        <form className="card form-grid" onSubmit={add}>
          <Field label={t("team.name")}><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></Field>
          <Field label={t("team.email")}><input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required /></Field>
          <Field label={t("team.startPassword")} hint={t("team.startPasswordHint")}>
            <input type="text" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} minLength={10} required />
          </Field>
          <Field label={t("team.role")}>
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
              <option value="staff">{t("roles.staff")}</option>
              {me.user.role === "owner" && <option value="admin">{t("roles.admin")}</option>}
            </select>
          </Field>
          {error && <p className="error wide" role="alert">{error}</p>}
          <div className="wide actions"><button className="button primary">{t("team.submit")}</button></div>
        </form>
      )}

      <section className="card list-card">
        {members.map((m) => (
          <div key={m.id} className="list-row">
            <Avatar name={m.name} />
            <div className="list-main">
              <strong>{m.name}{m.id === me.user.id && <span className="muted"> {t("common.you")}</span>}</strong>
              <small className="muted">{m.email}</small>
            </div>
            <span className={`pill role-${m.role}`}>{t(`roles.${m.role}`)}</span>
            {canRemove(m) ? (
              <button className="icon-button danger" onClick={() => remove(m)} aria-label={t("team.removeLabel", { name: m.name })}><Trash2 size={18} /></button>
            ) : (
              <span className="icon-spacer" />
            )}
          </div>
        ))}
      </section>
    </div>
  );
}
