// Zahlarten je Land: Karten, Wallets und Bezahl-Apps, mit denen Kunden einer Firma üblicherweise zahlen.
// Die Firma wählt bei der Einrichtung aus, was sie annimmt; das steht dann auf Rechnungen und Belegen.
// Code Kontor speichert dabei nie Kartennummern, nur die Auswahl und auf Wunsch eine Empfänger-Nummer (z. B. Telefon).

/** Markennamen werden nicht übersetzt. "cash" und "transfer" übersetzt die App selbst. */
export const PAYMENT_METHOD_NAMES: Record<string, string> = {
  visa_mc: "Visa / Mastercard",
  amex: "American Express",
  mobile: "Apple Pay / Google Pay",
  paypal: "PayPal",
  girocard: "girocard",
  wero: "Wero",
  cb: "Carte Bancaire",
  bancontact: "Bancontact",
  ideal: "iDEAL",
  payconiq: "Payconiq",
  satispay: "Satispay",
  bizum: "Bizum",
  mbway: "MB WAY",
  blik: "BLIK",
  swish: "Swish",
  mobilepay: "MobilePay",
  vipps: "Vipps",
  twint: "TWINT",
  troy: "Troy",
  papara: "Papara",
  privat24: "Privat24",
  monobank: "monobank",
  dinacard: "DinaCard",
  qi: "Qi Card",
  zaincash: "ZainCash",
  fastpay: "FastPay",
  asiahawala: "AsiaHawala",
  mada: "mada",
  stcpay: "STC Pay",
  knet: "KNET",
  naps: "NAPS",
  benefit: "BenefitPay",
  omannet: "OmanNet",
  cliq: "CliQ",
  whish: "Whish Money",
  omt: "OMT Pay",
  bit: "Bit",
  meeza: "Meeza",
  instapay: "InstaPay",
  vodafonecash: "Vodafone Cash",
  fawry: "Fawry",
  cmi: "CMI",
  d17: "D17",
  venmo: "Venmo",
  cashapp: "Cash App",
  zelle: "Zelle",
  interac: "Interac",
  oxxo: "OXXO Pay",
  spei: "SPEI",
  pix: "Pix",
  boleto: "Boleto",
  eftpos: "EFTPOS",
  jcb: "JCB",
  paypay: "PayPay",
  paynow: "PayNow",
  nets: "NETS",
  fps: "FPS",
  octopus: "Octopus",
  upi: "UPI",
  rupay: "RuPay",
  paytm: "Paytm",
  alipay: "Alipay",
  wechat: "WeChat Pay",
  unionpay: "UnionPay",
};

/** Immer wählbar, Text kommt aus der Übersetzung. */
export const BASIC_METHODS = ["cash", "transfer"] as const;

const EU = ["visa_mc", "mobile", "paypal"];

/** Übliche Karten und Bezahl-Apps je Land, die wichtigsten zuerst. */
export const COUNTRY_METHODS: Record<string, string[]> = {
  DE: ["girocard", "visa_mc", "mobile", "paypal", "wero"],
  AT: ["visa_mc", "mobile", "paypal"],
  BE: ["bancontact", "visa_mc", "mobile", "payconiq", "wero"],
  FR: ["cb", "visa_mc", "mobile", "paypal", "wero"],
  NL: ["ideal", "visa_mc", "mobile", "paypal"],
  LU: ["visa_mc", "payconiq", "mobile", "paypal"],
  IT: ["visa_mc", "mobile", "satispay", "paypal"],
  ES: ["visa_mc", "bizum", "mobile", "paypal"],
  PT: ["visa_mc", "mbway", "mobile", "paypal"],
  PL: ["blik", "visa_mc", "mobile", "paypal"],
  SE: ["swish", "visa_mc", "mobile"],
  DK: ["mobilepay", "visa_mc", "mobile"],
  FI: ["visa_mc", "mobilepay", "mobile"],
  CH: ["twint", "visa_mc", "mobile", "paypal"],
  LI: ["twint", "visa_mc", "mobile"],
  NO: ["vipps", "visa_mc", "mobile"],
  GB: ["visa_mc", "amex", "mobile", "paypal"],
  TR: ["troy", "visa_mc", "papara", "mobile"],
  UA: ["visa_mc", "privat24", "monobank", "mobile"],
  RS: ["dinacard", "visa_mc", "mobile"],
  // Naher Osten und Nordafrika
  IQ: ["qi", "zaincash", "fastpay", "asiahawala", "visa_mc"],
  AE: ["visa_mc", "mobile", "amex"],
  SA: ["mada", "stcpay", "visa_mc", "mobile"],
  QA: ["naps", "visa_mc", "mobile"],
  KW: ["knet", "visa_mc", "mobile"],
  BH: ["benefit", "visa_mc", "mobile"],
  OM: ["omannet", "visa_mc", "mobile"],
  JO: ["cliq", "visa_mc", "mobile"],
  LB: ["whish", "omt", "visa_mc"],
  IL: ["visa_mc", "bit", "mobile"],
  EG: ["meeza", "instapay", "vodafonecash", "fawry", "visa_mc"],
  MA: ["cmi", "visa_mc"],
  TN: ["d17", "visa_mc"],
  // Amerika, Asien, Ozeanien
  US: ["visa_mc", "amex", "mobile", "zelle", "venmo", "cashapp", "paypal"],
  CA: ["interac", "visa_mc", "mobile", "paypal"],
  MX: ["visa_mc", "spei", "oxxo", "mobile"],
  BR: ["pix", "visa_mc", "boleto"],
  AU: ["eftpos", "visa_mc", "mobile", "paypal"],
  NZ: ["eftpos", "visa_mc", "mobile"],
  JP: ["visa_mc", "jcb", "paypay", "mobile"],
  SG: ["paynow", "nets", "visa_mc", "mobile"],
  HK: ["octopus", "fps", "visa_mc", "alipay", "mobile"],
  IN: ["upi", "rupay", "visa_mc", "paytm"],
  CN: ["alipay", "wechat", "unionpay"],
};

const DEFAULT_METHODS = ["visa_mc", "mobile"];

/** Übliche Zahlarten im Land, ohne Bargeld und Überweisung. */
export function countryMethods(country: string): string[] {
  const code = country.toUpperCase();
  return COUNTRY_METHODS[code] ?? (EU_COUNTRIES.has(code) ? EU : DEFAULT_METHODS);
}

const EU_COUNTRIES = new Set(["BG", "HR", "CY", "CZ", "EE", "GR", "HU", "IE", "LV", "LT", "MT", "RO", "SK", "SI"]);

export function isKnownMethod(id: string): boolean {
  return id in PAYMENT_METHOD_NAMES || (BASIC_METHODS as readonly string[]).includes(id);
}

/** Gespeichert als Text "cash,qi,zaincash"; Unbekanntes und Doppeltes fällt weg. */
export function parseMethods(value: string): string[] {
  return [...new Set(value.split(",").map((s) => s.trim()).filter(isKnownMethod))].slice(0, 16);
}

/** Vorschlag für eine neue Firma: Bargeld, die üblichste Karte des Landes und Überweisung. */
export function defaultMethods(country: string): string[] {
  return ["cash", countryMethods(country)[0], "transfer"];
}

/** Luhn-Prüfung: erkennt Kartennummern (13 bis 19 Ziffern), damit niemand eine Karte einträgt. */
export function containsCardNumber(value: string): boolean {
  for (const match of value.matchAll(/\d[\d -]{11,}\d/g)) {
    const digits = match[0].replace(/\D/g, "");
    if (digits.length < 13 || digits.length > 19) continue;
    let sum = 0;
    for (let i = 0; i < digits.length; i++) {
      let d = Number(digits[digits.length - 1 - i]);
      if (i % 2 === 1) {
        d *= 2;
        if (d > 9) d -= 9;
      }
      sum += d;
    }
    if (sum % 10 === 0) return true;
  }
  return false;
}

/** Gewählte Zahlarten als lesbare Liste; Bargeld und Überweisung kommen aus der Übersetzung. */
export function methodLabels(value: string | undefined, basic: { cash: string; transfer: string }): string {
  return parseMethods(value ?? "")
    .map((id) => (id === "cash" ? basic.cash : id === "transfer" ? basic.transfer : PAYMENT_METHOD_NAMES[id]))
    .join(", ");
}
