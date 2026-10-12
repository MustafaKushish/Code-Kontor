import { describe, expect, it } from "vitest";
import { mailEnabled, renderMail, sendMail } from "../worker/mail";

describe("E-Mails", () => {
  it("füllt Name, Firma und Link ein und schützt vor HTML", () => {
    const mail = renderMail("invite", "de", "https://x.dev/einladung/abc", { name: "Ali <b>", inviter: "Mustafa", company: "Salon Yildiz" });
    expect(mail.subject).toBe("Einladung zu Salon Yildiz bei Code Kontor");
    expect(mail.text).toContain("https://x.dev/einladung/abc");
    expect(mail.html).toContain("Ali &#60;b&#62;");
    expect(mail.html).not.toContain("<b>");
  });
  it("fällt bei unbekannter Sprache auf Englisch zurück und setzt RTL für Arabisch", () => {
    expect(renderMail("reset", "xx", "l", { name: "A" }).subject).toBe("New password for Code Kontor");
    expect(renderMail("verify", "ar", "l", { name: "A" }).html).toContain('dir="rtl"');
  });
  it("sendet ohne Einrichtung nichts", async () => {
    expect(mailEnabled({})).toBe(false);
    let called = false;
    const ok = await sendMail({}, "a@b.de", renderMail("verify", "de", "l", { name: "A" }), (async () => ((called = true), new Response())) as typeof fetch);
    expect(ok).toBe(false);
    expect(called).toBe(false);
  });
  it("schickt über Resend mit Schlüssel und Absender", async () => {
    let request: { url: string; init: RequestInit } | undefined;
    const fakeFetch = (async (url: string, init: RequestInit) => ((request = { url, init }), new Response("{}"))) as unknown as typeof fetch;
    const ok = await sendMail({ RESEND_API_KEY: "k", MAIL_FROM: "Code Kontor <no@x.de>" }, "a@b.de", renderMail("verify", "de", "l", { name: "A" }), fakeFetch);
    expect(ok).toBe(true);
    expect(request!.url).toBe("https://api.resend.com/emails");
    expect(JSON.parse(request!.init.body as string)).toMatchObject({ from: "Code Kontor <no@x.de>", to: ["a@b.de"] });
  });
});
