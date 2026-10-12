import { useEffect, useState, type FormEvent } from "react";
import { Check, Copy, Mail, Plus, Trash2, X } from "lucide-react";
import { api, type Me, type Role } from "../api";
import { Avatar, Field } from "../components";
import { useI18n } from "../i18n";

interface TeamMember {
  id: string;
  email: string;
  name: string;
  role: Role;
}

interface Invite {
  id: string;
  email: string;
  name: string;
  role: Role;
  expiresAt: string;
}

export function Team({ me }: { me: Me }) {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [form, setForm] = useState({ name: "", email: "", role: "staff" as Role });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [created, setCreated] = useState<{ email: string; link: string; sent: boolean } | null>(null);
  const [copied, setCopied] = useState(false);
  const { t, errorText, lang } = useI18n();

  const load = () => {
    api<{ users: TeamMember[] }>("/users").then((r) => setMembers(r.users));
    api<{ invites: Invite[] }>("/invites").then((r) => setInvites(r.invites));
  };
  useEffect(load, []);

  const invite = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const r = await api<{ link: string; sent: boolean }>("/invites", { method: "POST", body: { ...form, lang } });
      setCreated({ email: form.email, link: r.link, sent: r.sent });
      setCopied(false);
      setForm({ name: "", email: "", role: "staff" });
      setOpen(false);
      load();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(created.link);
      setCopied(true);
    } catch {
      /* Feld ist markierbar, notfalls von Hand kopieren */
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

  const withdraw = async (inv: Invite) => {
    await api(`/invites/${inv.id}`, { method: "DELETE" }).catch((err) => alert(errorText(err)));
    load();
  };

  const canRemove = (m: TeamMember) => m.id !== me.user.id && m.role !== "owner" && (m.role === "staff" || me.user.role === "owner");

  return (
    <div className="stack-lg">
      <header className="page-head">
        <div>
          <h1 className="display">{t("nav.team")}</h1>
          <p className="muted">{t("team.subtitle", { company: me.user.tenantName })}</p>
        </div>
        <button className={open ? "button" : "button primary"} onClick={() => { setOpen(!open); setCreated(null); }}>
          {open ? <><X size={18} /> {t("team.close")}</> : <><Plus size={18} /> {t("team.add")}</>}
        </button>
      </header>

      {open && (
        <form className="card form-grid" onSubmit={invite}>
          <Field label={t("team.name")}><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></Field>
          <Field label={t("team.email")}><input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required /></Field>
          <Field label={t("team.role")}>
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
              <option value="staff">{t("roles.staff")}</option>
              {me.user.role === "owner" && <option value="admin">{t("roles.admin")}</option>}
            </select>
          </Field>
          <p className="muted wide">{t("team.inviteHint")}</p>
          {error && <p className="error wide" role="alert">{error}</p>}
          <div className="wide actions"><button className="button primary" disabled={busy}><Mail size={18} /> {busy ? t("common.wait") : t("team.submit")}</button></div>
        </form>
      )}

      {created && (
        <section className="card invite-result" role="status">
          <p className={created.sent ? "success-text" : ""}>{created.sent ? t("team.inviteSent", { email: created.email }) : t("team.inviteNoMail", { email: created.email })}</p>
          {created.sent && <p className="muted">{t("team.inviteLink")}</p>}
          <div className="invite-link">
            <input readOnly value={created.link} onFocus={(e) => e.target.select()} aria-label={t("team.inviteLinkLabel")} />
            <button type="button" className="button" onClick={copy}>
              {copied ? <><Check size={16} /> {t("team.copied")}</> : <><Copy size={16} /> {t("team.copy")}</>}
            </button>
          </div>
        </section>
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

      {invites.length > 0 && (
        <section className="card list-card">
          <h2 className="list-title">{t("team.pending")}</h2>
          {invites.map((inv) => (
            <div key={inv.id} className="list-row">
              <Avatar name={inv.name} />
              <div className="list-main">
                <strong>{inv.name}</strong>
                <small className="muted">{inv.email} · {t(`roles.${inv.role}`)}</small>
              </div>
              <span className="pill">{t("team.invited")}</span>
              {inv.role === "staff" || me.user.role === "owner" ? (
                <button className="icon-button danger" onClick={() => withdraw(inv)} aria-label={t("team.withdraw", { name: inv.name })} title={t("team.withdraw", { name: inv.name })}><X size={18} /></button>
              ) : (
                <span className="icon-spacer" />
              )}
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
