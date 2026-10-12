import { useState, type FormEvent } from "react";
import { KeyRound, MailWarning, ShieldCheck } from "lucide-react";
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
