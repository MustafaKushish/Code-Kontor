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
