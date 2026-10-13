import type { MailContent } from "../mail";

// E-Mails an Reparaturkunden: Kostenvoranschlag liegt vor, Gerät ist abholbereit.
// In der Sprache, die bei der Annahme für den Kunden gewählt wurde.

export type RepairMailKind = "quote" | "ready" | "notRepaired";

interface Texts {
  hello: string;
  subject: Record<RepairMailKind, string>;
  body: Record<RepairMailKind, string>;
  button: string;
}

const TEXTS: Record<string, Texts> = {
  de: {
    hello: "Guten Tag {name},",
    subject: { quote: "Kostenvoranschlag für Ihr {device} (Auftrag {number})", ready: "Ihr {device} ist fertig (Auftrag {number})", notRepaired: "Ihr {device} kann abgeholt werden (Auftrag {number})" },
    body: {
      quote: "wir haben Ihr Gerät geprüft. Der Kostenvoranschlag liegt bereit. Bitte stimmen Sie über den Link zu oder lehnen Sie ab.",
      ready: "die Reparatur ist abgeschlossen. Sie können Ihr Gerät zu unseren Öffnungszeiten abholen.",
      notRepaired: "Ihr Gerät wurde nicht repariert und kann zu unseren Öffnungszeiten abgeholt werden. Die Einzelheiten finden Sie über den Link.",
    },
    button: "Status ansehen",
  },
  en: {
    hello: "Hello {name},",
    subject: { quote: "Repair estimate for your {device} (order {number})", ready: "Your {device} is ready (order {number})", notRepaired: "Your {device} can be collected (order {number})" },
    body: {
      quote: "we have checked your device. The estimate is ready. Please approve or decline it using the link.",
      ready: "the repair is complete. You can collect your device during our opening hours.",
      notRepaired: "your device was not repaired and can be collected during our opening hours. You will find the details via the link.",
    },
    button: "View status",
  },
  tr: {
    hello: "Merhaba {name},",
    subject: { quote: "{device} için fiyat teklifi (sipariş {number})", ready: "{device} cihazınız hazır (sipariş {number})", notRepaired: "{device} cihazınızı teslim alabilirsiniz (sipariş {number})" },
    body: {
      quote: "cihazınızı inceledik. Fiyat teklifi hazır. Lütfen bağlantı üzerinden onaylayın veya reddedin.",
      ready: "onarım tamamlandı. Cihazınızı çalışma saatlerimizde teslim alabilirsiniz.",
      notRepaired: "cihazınız onarılmadı ve çalışma saatlerimizde teslim alınabilir. Ayrıntıları bağlantıda bulabilirsiniz.",
    },
    button: "Durumu görüntüle",
  },
  ar: {
    hello: "مرحبًا {name}،",
    subject: { quote: "عرض سعر لجهازك {device} (الطلب {number})", ready: "جهازك {device} جاهز (الطلب {number})", notRepaired: "يمكنك استلام جهازك {device} (الطلب {number})" },
    body: {
      quote: "قمنا بفحص جهازك. عرض السعر جاهز. يرجى الموافقة عليه أو رفضه عبر الرابط.",
      ready: "اكتمل الإصلاح. يمكنك استلام جهازك خلال ساعات العمل.",
      notRepaired: "لم يتم إصلاح جهازك ويمكن استلامه خلال ساعات العمل. تجد التفاصيل عبر الرابط.",
    },
    button: "عرض الحالة",
  },
  fr: {
    hello: "Bonjour {name},",
    subject: { quote: "Devis pour votre {device} (commande {number})", ready: "Votre {device} est prêt (commande {number})", notRepaired: "Votre {device} peut être récupéré (commande {number})" },
    body: {
      quote: "nous avons examiné votre appareil. Le devis est prêt. Merci de l'accepter ou de le refuser via le lien.",
      ready: "la réparation est terminée. Vous pouvez récupérer votre appareil pendant nos heures d'ouverture.",
      notRepaired: "votre appareil n'a pas été réparé et peut être récupéré pendant nos heures d'ouverture. Les détails sont disponibles via le lien.",
    },
    button: "Voir le statut",
  },
  es: {
    hello: "Hola {name}:",
    subject: { quote: "Presupuesto para su {device} (pedido {number})", ready: "Su {device} está listo (pedido {number})", notRepaired: "Puede recoger su {device} (pedido {number})" },
    body: {
      quote: "hemos revisado su dispositivo. El presupuesto está listo. Por favor, acéptelo o recházelo a través del enlace.",
      ready: "la reparación ha terminado. Puede recoger su dispositivo en nuestro horario de apertura.",
      notRepaired: "su dispositivo no se ha reparado y puede recogerlo en nuestro horario de apertura. Encontrará los detalles en el enlace.",
    },
    button: "Ver estado",
  },
  it: {
    hello: "Buongiorno {name},",
    subject: { quote: "Preventivo per il suo {device} (ordine {number})", ready: "Il suo {device} è pronto (ordine {number})", notRepaired: "Può ritirare il suo {device} (ordine {number})" },
    body: {
      quote: "abbiamo controllato il suo dispositivo. Il preventivo è pronto. La preghiamo di accettarlo o rifiutarlo tramite il link.",
      ready: "la riparazione è terminata. Può ritirare il dispositivo durante i nostri orari di apertura.",
      notRepaired: "il suo dispositivo non è stato riparato e può essere ritirato durante i nostri orari di apertura. Trova i dettagli tramite il link.",
    },
    button: "Vedi stato",
  },
  pl: {
    hello: "Dzień dobry {name},",
    subject: { quote: "Wycena naprawy: {device} (zlecenie {number})", ready: "Twoje urządzenie {device} jest gotowe (zlecenie {number})", notRepaired: "Możesz odebrać urządzenie {device} (zlecenie {number})" },
    body: {
      quote: "sprawdziliśmy Twoje urządzenie. Wycena jest gotowa. Zaakceptuj ją lub odrzuć za pomocą linku.",
      ready: "naprawa została zakończona. Urządzenie możesz odebrać w godzinach otwarcia.",
      notRepaired: "urządzenie nie zostało naprawione i można je odebrać w godzinach otwarcia. Szczegóły znajdziesz pod linkiem.",
    },
    button: "Zobacz status",
  },
  ru: {
    hello: "Здравствуйте, {name}!",
    subject: { quote: "Смета на ремонт {device} (заказ {number})", ready: "Ваше устройство {device} готово (заказ {number})", notRepaired: "Устройство {device} можно забрать (заказ {number})" },
    body: {
      quote: "Мы проверили ваше устройство. Смета готова. Пожалуйста, подтвердите или отклоните её по ссылке.",
      ready: "Ремонт завершён. Вы можете забрать устройство в часы работы.",
      notRepaired: "Устройство не было отремонтировано, его можно забрать в часы работы. Подробности по ссылке.",
    },
    button: "Посмотреть статус",
  },
  uk: {
    hello: "Добрий день, {name}!",
    subject: { quote: "Кошторис на ремонт {device} (замовлення {number})", ready: "Ваш пристрій {device} готовий (замовлення {number})", notRepaired: "Пристрій {device} можна забрати (замовлення {number})" },
    body: {
      quote: "Ми перевірили ваш пристрій. Кошторис готовий. Будь ласка, підтвердьте або відхиліть його за посиланням.",
      ready: "Ремонт завершено. Ви можете забрати пристрій у робочі години.",
      notRepaired: "Пристрій не було відремонтовано, його можна забрати в робочі години. Подробиці за посиланням.",
    },
    button: "Переглянути статус",
  },
};

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);
const fill = (s: string, vars: Record<string, string>) => s.replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? "");

export function renderRepairMail(kind: RepairMailKind, lang: string, link: string, vars: { name: string; device: string; number: string; company: string }): MailContent {
  const t = TEXTS[lang] ?? TEXTS.de!;
  const rtl = lang === "ar";
  const subject = `${fill(t.subject[kind], vars)} – ${vars.company}`;
  const hello = fill(t.hello, vars);
  const body = t.body[kind];
  const text = `${hello}\n\n${body}\n\n${t.button}: ${link}\n\n${vars.company}`;
  const html = `<!doctype html><html lang="${lang}" dir="${rtl ? "rtl" : "ltr"}"><body style="margin:0;background:#f4f2ed;font-family:Inter,Segoe UI,Arial,sans-serif;color:#12141c">
<div style="max-width:520px;margin:0 auto;padding:32px 20px">
<p style="font-size:20px;font-weight:700;margin:0 0 24px">${escapeHtml(vars.company)}</p>
<div style="background:#fffefb;border:1px solid #e4e0d6;border-radius:18px;padding:28px">
<p style="margin:0 0 12px">${escapeHtml(hello)}</p>
<p style="margin:0 0 24px;line-height:1.55">${escapeHtml(body)}</p>
<a href="${escapeHtml(link)}" style="display:inline-block;background:#0d9488;color:#fff;text-decoration:none;font-weight:600;padding:12px 22px;border-radius:12px">${escapeHtml(t.button)}</a>
<p style="margin:24px 0 0;font-size:13px;color:#6c6f7a;word-break:break-all">${escapeHtml(link)}</p>
</div></div></body></html>`;
  return { subject, text, html };
}

// ---------- Online-Termine ----------

export type BookingMailKind = "received" | "confirmed" | "declined";

interface BookingTexts {
  hello: string;
  subject: Record<BookingMailKind, string>;
  body: Record<BookingMailKind, string>;
  button: string;
}

const BOOKING_TEXTS: Record<string, BookingTexts> = {
  de: {
    hello: "Guten Tag {name},",
    subject: { received: "Ihre Terminanfrage für {when}", confirmed: "Ihr Termin am {when} ist bestätigt", declined: "Ihr Termin am {when} ist leider nicht möglich" },
    body: {
      received: "vielen Dank für Ihre Terminanfrage für {when}. Wir melden uns, sobald wir den Termin bestätigt haben.",
      confirmed: "Ihr Termin am {when} ist bestätigt. Wir freuen uns auf Ihren Besuch{at}.",
      declined: "leider können wir den Termin am {when} nicht anbieten. Bitte wählen Sie über den Link einen anderen Termin.",
    },
    button: "Termin ansehen",
  },
  en: {
    hello: "Hello {name},",
    subject: { received: "Your appointment request for {when}", confirmed: "Your appointment on {when} is confirmed", declined: "Your appointment on {when} is not possible" },
    body: {
      received: "thank you for your appointment request for {when}. We will get back to you as soon as we have confirmed it.",
      confirmed: "your appointment on {when} is confirmed. We look forward to your visit{at}.",
      declined: "unfortunately we cannot offer the appointment on {when}. Please choose another time using the link.",
    },
    button: "View appointment",
  },
  tr: {
    hello: "Merhaba {name},",
    subject: { received: "{when} için randevu talebiniz", confirmed: "{when} tarihli randevunuz onaylandı", declined: "{when} tarihli randevu maalesef mümkün değil" },
    body: {
      received: "{when} için randevu talebiniz için teşekkür ederiz. Randevuyu onayladığımızda size haber vereceğiz.",
      confirmed: "{when} tarihli randevunuz onaylandı. Ziyaretinizi bekliyoruz{at}.",
      declined: "maalesef {when} tarihli randevuyu sunamıyoruz. Lütfen bağlantı üzerinden başka bir zaman seçin.",
    },
    button: "Randevuyu görüntüle",
  },
  ar: {
    hello: "مرحبًا {name}،",
    subject: { received: "طلب موعدك في {when}", confirmed: "تم تأكيد موعدك في {when}", declined: "للأسف الموعد في {when} غير ممكن" },
    body: {
      received: "شكرًا لطلب موعدك في {when}. سنتواصل معك فور تأكيد الموعد.",
      confirmed: "تم تأكيد موعدك في {when}. نتطلع إلى زيارتك{at}.",
      declined: "للأسف لا يمكننا تقديم الموعد في {when}. يرجى اختيار موعد آخر عبر الرابط.",
    },
    button: "عرض الموعد",
  },
  fr: {
    hello: "Bonjour {name},",
    subject: { received: "Votre demande de rendez-vous pour {when}", confirmed: "Votre rendez-vous du {when} est confirmé", declined: "Votre rendez-vous du {when} n'est pas possible" },
    body: {
      received: "merci pour votre demande de rendez-vous pour {when}. Nous vous recontacterons dès que nous l'aurons confirmé.",
      confirmed: "votre rendez-vous du {when} est confirmé. Nous nous réjouissons de votre visite{at}.",
      declined: "nous ne pouvons malheureusement pas proposer le rendez-vous du {when}. Veuillez choisir un autre créneau via le lien.",
    },
    button: "Voir le rendez-vous",
  },
  es: {
    hello: "Hola {name}:",
    subject: { received: "Su solicitud de cita para el {when}", confirmed: "Su cita del {when} está confirmada", declined: "Su cita del {when} no es posible" },
    body: {
      received: "gracias por su solicitud de cita para el {when}. Le avisaremos en cuanto la hayamos confirmado.",
      confirmed: "su cita del {when} está confirmada. Le esperamos{at}.",
      declined: "lamentablemente no podemos ofrecer la cita del {when}. Elija otra hora a través del enlace.",
    },
    button: "Ver la cita",
  },
  it: {
    hello: "Buongiorno {name},",
    subject: { received: "La sua richiesta di appuntamento per il {when}", confirmed: "Il suo appuntamento del {when} è confermato", declined: "Il suo appuntamento del {when} non è possibile" },
    body: {
      received: "grazie per la sua richiesta di appuntamento per il {when}. La ricontatteremo appena lo avremo confermato.",
      confirmed: "il suo appuntamento del {when} è confermato. La aspettiamo{at}.",
      declined: "purtroppo non possiamo offrire l'appuntamento del {when}. Scelga un altro orario tramite il link.",
    },
    button: "Vedi appuntamento",
  },
  pl: {
    hello: "Dzień dobry {name},",
    subject: { received: "Twoja prośba o wizytę: {when}", confirmed: "Twoja wizyta {when} jest potwierdzona", declined: "Wizyta {when} niestety nie jest możliwa" },
    body: {
      received: "dziękujemy za prośbę o wizytę: {when}. Odezwiemy się, gdy tylko ją potwierdzimy.",
      confirmed: "Twoja wizyta {when} jest potwierdzona. Czekamy na Ciebie{at}.",
      declined: "niestety nie możemy zaproponować wizyty {when}. Wybierz inny termin przez link.",
    },
    button: "Zobacz wizytę",
  },
  ru: {
    hello: "Здравствуйте, {name}!",
    subject: { received: "Ваша заявка на запись: {when}", confirmed: "Ваша запись на {when} подтверждена", declined: "Запись на {when}, к сожалению, невозможна" },
    body: {
      received: "Спасибо за заявку на запись: {when}. Мы сообщим, как только подтвердим время.",
      confirmed: "Ваша запись на {when} подтверждена. Ждём вас{at}.",
      declined: "К сожалению, мы не можем принять вас {when}. Пожалуйста, выберите другое время по ссылке.",
    },
    button: "Посмотреть запись",
  },
  uk: {
    hello: "Добрий день, {name}!",
    subject: { received: "Ваша заявка на запис: {when}", confirmed: "Ваш запис на {when} підтверджено", declined: "Запис на {when}, на жаль, неможливий" },
    body: {
      received: "Дякуємо за заявку на запис: {when}. Ми повідомимо, щойно підтвердимо час.",
      confirmed: "Ваш запис на {when} підтверджено. Чекаємо на вас{at}.",
      declined: "На жаль, ми не можемо прийняти вас {when}. Будь ласка, оберіть інший час за посиланням.",
    },
    button: "Переглянути запис",
  },
};

const AT: Record<string, string> = { de: " in {address}", en: " at {address}", tr: " ({address})", ar: " في {address}", fr: " à l'adresse {address}", es: " en {address}", it: " in {address}", pl: " pod adresem {address}", ru: " по адресу {address}", uk: " за адресою {address}" };

type BookingVars = { name: string; company: string; day: string; time: string; address: string; device?: string; problem?: string };

const when = (lang: string, day: string, time: string) => {
  const date = new Intl.DateTimeFormat(lang, { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${day}T00:00:00Z`));
  return `${date}, ${time}`;
};

/** Termin-E-Mails an Kunden; „shopNew“ geht auf Deutsch an den Laden. */
export function renderBookingMail(kind: BookingMailKind | "shopNew", lang: string, link: string, vars: BookingVars): MailContent {
  if (kind === "shopNew") {
    const at = when("de", vars.day, vars.time);
    const lines = [`Neue Terminanfrage für ${at}`, "", `Name: ${vars.name}`, vars.device ? `Gerät: ${vars.device}` : "", vars.problem ? `Anliegen: ${vars.problem}` : ""].filter((l, i) => i < 2 || l);
    const text = `${lines.join("\n")}\n\nBitte bestätigen oder absagen: ${link}`;
    return { subject: `Neue Terminanfrage: ${at} – ${vars.name}`, text, html: mailHtml("de", vars.company || "Code Kontor", lines.join("\n"), "Termine öffnen", link) };
  }
  const t = BOOKING_TEXTS[lang] ?? BOOKING_TEXTS.de!;
  const w = when(BOOKING_TEXTS[lang] ? lang : "de", vars.day, vars.time);
  const at = vars.address ? fill(AT[lang] ?? AT.de!, { address: vars.address }) : "";
  const all = { ...vars, when: w, at };
  const subject = `${fill(t.subject[kind], all)} – ${vars.company}`;
  const body = `${fill(t.hello, all)}\n\n${fill(t.body[kind], all)}`;
  return { subject, text: `${body}\n\n${t.button}: ${link}\n\n${vars.company}`, html: mailHtml(lang, vars.company, body, t.button, link) };
}

function mailHtml(lang: string, company: string, body: string, button: string, link: string) {
  const paragraphs = body.split(/\n\n/).map((p) => `<p style="margin:0 0 12px;line-height:1.55">${escapeHtml(p).replace(/\n/g, "<br>")}</p>`).join("");
  return `<!doctype html><html lang="${lang}" dir="${lang === "ar" ? "rtl" : "ltr"}"><body style="margin:0;background:#f4f2ed;font-family:Inter,Segoe UI,Arial,sans-serif;color:#12141c">
<div style="max-width:520px;margin:0 auto;padding:32px 20px">
<p style="font-size:20px;font-weight:700;margin:0 0 24px">${escapeHtml(company)}</p>
<div style="background:#fffefb;border:1px solid #e4e0d6;border-radius:18px;padding:28px">
${paragraphs}
<a href="${escapeHtml(link)}" style="display:inline-block;margin-top:12px;background:#0d9488;color:#fff;text-decoration:none;font-weight:600;padding:12px 22px;border-radius:12px">${escapeHtml(button)}</a>
<p style="margin:24px 0 0;font-size:13px;color:#6c6f7a;word-break:break-all">${escapeHtml(link)}</p>
</div></div></body></html>`;
}
