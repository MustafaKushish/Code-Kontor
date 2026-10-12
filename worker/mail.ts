// E-Mails für Bestätigung, Passwort vergessen und Einladungen.
// Versand über Resend (https://resend.com). Ohne RESEND_API_KEY und MAIL_FROM wird nichts gesendet,
// der Link erscheint dann nur im Worker-Protokoll (praktisch beim lokalen Entwickeln).

export type MailKind = "verify" | "reset" | "invite";

type LangTexts = { hello: string; ignore: string } & Record<MailKind, { subject: string; body: string; button: string }>;

const TEXTS: Record<string, LangTexts> = {
  de: {
    hello: "Hallo {name},",
    ignore: "Wenn du das nicht angefordert hast, kannst du diese E-Mail ignorieren.",
    verify: { subject: "Bitte bestätige deine E-Mail-Adresse", body: "bitte bestätige deine E-Mail-Adresse für Code Kontor. Der Link gilt 3 Tage.", button: "E-Mail bestätigen" },
    reset: { subject: "Neues Passwort für Code Kontor", body: "hier kannst du ein neues Passwort wählen. Der Link gilt 1 Stunde und funktioniert nur einmal.", button: "Neues Passwort wählen" },
    invite: { subject: "Einladung zu {company} bei Code Kontor", body: "{inviter} lädt dich ein, bei {company} mit Code Kontor zu arbeiten. Der Link gilt 7 Tage.", button: "Einladung annehmen" },
  },
  en: {
    hello: "Hi {name},",
    ignore: "If you didn't request this, you can ignore this email.",
    verify: { subject: "Please confirm your email address", body: "please confirm your email address for Code Kontor. The link is valid for 3 days.", button: "Confirm email" },
    reset: { subject: "New password for Code Kontor", body: "you can choose a new password here. The link is valid for 1 hour and works only once.", button: "Choose new password" },
    invite: { subject: "Invitation to {company} on Code Kontor", body: "{inviter} invites you to work with Code Kontor at {company}. The link is valid for 7 days.", button: "Accept invitation" },
  },
  tr: {
    hello: "Merhaba {name},",
    ignore: "Bunu sen istemediysen bu e-postayı yok sayabilirsin.",
    verify: { subject: "Lütfen e-posta adresini onayla", body: "lütfen Code Kontor için e-posta adresini onayla. Bağlantı 3 gün geçerlidir.", button: "E-postayı onayla" },
    reset: { subject: "Code Kontor için yeni şifre", body: "buradan yeni bir şifre seçebilirsin. Bağlantı 1 saat geçerlidir ve yalnızca bir kez çalışır.", button: "Yeni şifre seç" },
    invite: { subject: "Code Kontor'da {company} davetiyesi", body: "{inviter} seni {company} bünyesinde Code Kontor ile çalışmaya davet ediyor. Bağlantı 7 gün geçerlidir.", button: "Daveti kabul et" },
  },
  ar: {
    hello: "مرحبًا {name}،",
    ignore: "إذا لم تطلب ذلك، يمكنك تجاهل هذه الرسالة.",
    verify: { subject: "يرجى تأكيد بريدك الإلكتروني", body: "يرجى تأكيد بريدك الإلكتروني لـ Code Kontor. الرابط صالح لمدة 3 أيام.", button: "تأكيد البريد الإلكتروني" },
    reset: { subject: "كلمة مرور جديدة لـ Code Kontor", body: "يمكنك اختيار كلمة مرور جديدة من هنا. الرابط صالح لمدة ساعة واحدة ويعمل مرة واحدة فقط.", button: "اختيار كلمة مرور جديدة" },
    invite: { subject: "دعوة إلى {company} على Code Kontor", body: "يدعوك {inviter} للعمل مع Code Kontor في {company}. الرابط صالح لمدة 7 أيام.", button: "قبول الدعوة" },
  },
  fr: {
    hello: "Bonjour {name},",
    ignore: "Si tu n'es pas à l'origine de cette demande, tu peux ignorer cet e-mail.",
    verify: { subject: "Confirme ton adresse e-mail", body: "merci de confirmer ton adresse e-mail pour Code Kontor. Le lien est valable 3 jours.", button: "Confirmer l'e-mail" },
    reset: { subject: "Nouveau mot de passe pour Code Kontor", body: "tu peux choisir un nouveau mot de passe ici. Le lien est valable 1 heure et ne fonctionne qu'une fois.", button: "Choisir un mot de passe" },
    invite: { subject: "Invitation à {company} sur Code Kontor", body: "{inviter} t'invite à travailler avec Code Kontor chez {company}. Le lien est valable 7 jours.", button: "Accepter l'invitation" },
  },
  es: {
    hello: "Hola {name}:",
    ignore: "Si no lo has solicitado, puedes ignorar este correo.",
    verify: { subject: "Confirma tu correo electrónico", body: "confirma tu correo electrónico para Code Kontor. El enlace es válido durante 3 días.", button: "Confirmar correo" },
    reset: { subject: "Nueva contraseña para Code Kontor", body: "aquí puedes elegir una nueva contraseña. El enlace es válido durante 1 hora y solo funciona una vez.", button: "Elegir nueva contraseña" },
    invite: { subject: "Invitación a {company} en Code Kontor", body: "{inviter} te invita a trabajar con Code Kontor en {company}. El enlace es válido durante 7 días.", button: "Aceptar invitación" },
  },
  it: {
    hello: "Ciao {name},",
    ignore: "Se non l'hai richiesto tu, puoi ignorare questa e-mail.",
    verify: { subject: "Conferma il tuo indirizzo e-mail", body: "conferma il tuo indirizzo e-mail per Code Kontor. Il link è valido 3 giorni.", button: "Conferma e-mail" },
    reset: { subject: "Nuova password per Code Kontor", body: "qui puoi scegliere una nuova password. Il link è valido 1 ora e funziona una sola volta.", button: "Scegli nuova password" },
    invite: { subject: "Invito a {company} su Code Kontor", body: "{inviter} ti invita a lavorare con Code Kontor presso {company}. Il link è valido 7 giorni.", button: "Accetta invito" },
  },
  pl: {
    hello: "Cześć {name},",
    ignore: "Jeśli to nie Ty, zignoruj tę wiadomość.",
    verify: { subject: "Potwierdź swój adres e-mail", body: "potwierdź swój adres e-mail w Code Kontor. Link jest ważny 3 dni.", button: "Potwierdź e-mail" },
    reset: { subject: "Nowe hasło do Code Kontor", body: "tutaj możesz ustawić nowe hasło. Link jest ważny 1 godzinę i działa tylko raz.", button: "Ustaw nowe hasło" },
    invite: { subject: "Zaproszenie do {company} w Code Kontor", body: "{inviter} zaprasza Cię do pracy z Code Kontor w {company}. Link jest ważny 7 dni.", button: "Przyjmij zaproszenie" },
  },
  ru: {
    hello: "Здравствуйте, {name}!",
    ignore: "Если вы этого не запрашивали, просто проигнорируйте это письмо.",
    verify: { subject: "Подтвердите адрес эл. почты", body: "подтвердите, пожалуйста, адрес эл. почты для Code Kontor. Ссылка действует 3 дня.", button: "Подтвердить почту" },
    reset: { subject: "Новый пароль для Code Kontor", body: "здесь можно задать новый пароль. Ссылка действует 1 час и работает только один раз.", button: "Задать новый пароль" },
    invite: { subject: "Приглашение в {company} в Code Kontor", body: "{inviter} приглашает вас работать с Code Kontor в {company}. Ссылка действует 7 дней.", button: "Принять приглашение" },
  },
  uk: {
    hello: "Вітаємо, {name}!",
    ignore: "Якщо ви цього не запитували, просто проігноруйте цей лист.",
    verify: { subject: "Підтвердьте адресу ел. пошти", body: "підтвердьте, будь ласка, адресу ел. пошти для Code Kontor. Посилання діє 3 дні.", button: "Підтвердити пошту" },
    reset: { subject: "Новий пароль для Code Kontor", body: "тут можна задати новий пароль. Посилання діє 1 годину і працює лише один раз.", button: "Задати новий пароль" },
    invite: { subject: "Запрошення до {company} у Code Kontor", body: "{inviter} запрошує вас працювати з Code Kontor у {company}. Посилання діє 7 днів.", button: "Прийняти запрошення" },
  },
};

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);
const fill = (text: string, vars: Record<string, string>) => text.replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? "");

export interface MailContent {
  subject: string;
  text: string;
  html: string;
}

export function renderMail(kind: MailKind, lang: string, link: string, vars: Record<string, string>): MailContent {
  const t = TEXTS[lang] ?? TEXTS.en!;
  const part = t[kind];
  const subject = fill(part.subject, vars);
  const hello = fill(t.hello, vars);
  const body = fill(part.body, vars);
  const rtl = lang === "ar";
  const text = `${hello}\n\n${body}\n\n${part.button}: ${link}\n\n${t.ignore}\n\nCode Kontor`;
  const html = `<!doctype html><html lang="${lang}" dir="${rtl ? "rtl" : "ltr"}"><body style="margin:0;background:#f4f2ed;font-family:Inter,Segoe UI,Arial,sans-serif;color:#12141c">
<div style="max-width:520px;margin:0 auto;padding:32px 20px">
<p style="font-size:20px;font-weight:700;margin:0 0 24px">Code Kontor</p>
<div style="background:#fffefb;border:1px solid #e4e0d6;border-radius:18px;padding:28px">
<p style="margin:0 0 12px">${escapeHtml(hello)}</p>
<p style="margin:0 0 24px;line-height:1.55">${escapeHtml(body)}</p>
<a href="${escapeHtml(link)}" style="display:inline-block;background:#0d9488;color:#fff;text-decoration:none;font-weight:600;padding:12px 22px;border-radius:12px">${escapeHtml(part.button)}</a>
<p style="margin:24px 0 0;font-size:13px;color:#6c6f7a;word-break:break-all">${escapeHtml(link)}</p>
</div>
<p style="font-size:13px;color:#6c6f7a;margin:20px 4px 0">${escapeHtml(t.ignore)}</p>
</div></body></html>`;
  return { subject, text, html };
}

export interface MailConfig {
  RESEND_API_KEY?: string;
  MAIL_FROM?: string;
}

export const mailEnabled = (env: MailConfig) => !!(env.RESEND_API_KEY && env.MAIL_FROM);

/** Sendet die E-Mail. Gibt false zurück, wenn kein Versand eingerichtet ist oder er fehlschlägt. */
export async function sendMail(env: MailConfig, to: string, content: MailContent, doFetch: typeof fetch = fetch): Promise<boolean> {
  if (!mailEnabled(env)) {
    console.log(`[mail] Kein Versand eingerichtet. An ${to}: ${content.subject}\n${content.text}`);
    return false;
  }
  const response = await doFetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: env.MAIL_FROM, to: [to], subject: content.subject, text: content.text, html: content.html }),
  });
  if (!response.ok) console.error(`[mail] Versand fehlgeschlagen (${response.status}): ${await response.text().catch(() => "")}`);
  return response.ok;
}
