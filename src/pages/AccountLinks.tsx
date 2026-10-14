import { useEffect, useState, type FormEvent } from "react";
import { CheckCircle2 } from "lucide-react";
import { api, setStoredToken, type Role } from "../api";
import { Field } from "../components";
import { useI18n } from "../i18n";
import { navigate } from "../router";
import { AuthLayout } from "./AuthPage";

// Seiten für die Links aus E-Mails: Einladung annehmen, neues Passwort, E-Mail bestätigen.

function Invalid() {
  const { t } = useI18n();
  return (
    <AuthLayout>
      <p className="notice" role="alert">{t("links.invalid")}</p>
      <button type="button" className="button primary block" onClick={() => navigate("/")}>{t("links.toApp")}</button>
    </AuthLayout>
  );
}

export function InvitePage({ token, onDone }: { token: string; onDone: () => void }) {
  const [invite, setInvite] = useState<{ email: string; name: string; role: Role; companyName: string } | null | undefined>();
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const { t, errorText } = useI18n();

  useEffect(() => {
    api<{ invite: NonNullable<typeof invite> }>(`/auth/invite/${token}`)
      .then((r) => {
        setInvite(r.invite);
        setName(r.invite.name);
      })
      .catch(() => setInvite(null));
  }, [token]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const r = await api<{ token?: string }>(`/auth/invite/${token}`, { method: "POST", body: { name, password } });
      if (r.token) setStoredToken(r.token);
      navigate("/");
      onDone();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  if (invite === undefined) return <div className="splash"><img src="/icon.svg" alt="" width={56} height={56} /></div>;
  if (invite === null) return <Invalid />;
  return (
    <AuthLayout>
      <div className="stack-sm">
        <h2 className="display auth-title">{t("links.inviteTitle", { company: invite.companyName })}</h2>
        <p className="muted">{t("links.inviteText", { role: t(`roles.${invite.role}`) })}</p>
      </div>
      <form onSubmit={submit} className="stack">
        <Field label={t("auth.email")}><input type="email" value={invite.email} readOnly autoComplete="username" /></Field>
        <Field label={t("auth.yourName")}><input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required /></Field>
        <Field label={t("auth.password")} hint={t("auth.passwordHint")}>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" minLength={10} required />
        </Field>
        {error && <p className="error" role="alert">{error}</p>}
        <button className="button primary block" disabled={busy}>{busy ? t("common.wait") : t("links.inviteSubmit")}</button>
      </form>
    </AuthLayout>
  );
}

export function ResetPage({ token, onDone }: { token: string; onDone: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const { t, errorText } = useI18n();

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const r = await api<{ token?: string }>("/auth/reset", { method: "POST", body: { token, password } });
      if (r.token) setStoredToken(r.token);
      navigate("/");
      onDone();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout>
      <div className="stack-sm">
        <h2 className="display auth-title">{t("links.resetTitle")}</h2>
        <p className="muted">{t("links.resetText")}</p>
      </div>
      <form onSubmit={submit} className="stack">
        <Field label={t("links.newPassword")} hint={t("auth.passwordHint")}>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" minLength={10} required />
        </Field>
        {error && <p className="error" role="alert">{error}</p>}
        <button className="button primary block" disabled={busy}>{busy ? t("common.wait") : t("links.resetSubmit")}</button>
      </form>
    </AuthLayout>
  );
}

export function VerifyPage({ token, onDone }: { token: string; onDone: () => void }) {
  const [state, setState] = useState<"busy" | "ok" | "invalid">("busy");
  const { t } = useI18n();

  useEffect(() => {
    api("/auth/verify", { method: "POST", body: { token } })
      .then(() => setState("ok"))
      .catch(() => setState("invalid"));
  }, [token]);

  if (state === "invalid") return <Invalid />;
  return (
    <AuthLayout>
      {state === "busy" ? (
        <p className="muted">{t("links.verifying")}</p>
      ) : (
        <>
          <p className="notice success" role="status"><CheckCircle2 size={18} /> {t("links.verified")}</p>
          <button type="button" className="button primary block" onClick={() => { navigate("/"); onDone(); }}>{t("links.toApp")}</button>
        </>
      )}
    </AuthLayout>
  );
}
