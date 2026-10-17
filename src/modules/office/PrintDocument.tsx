import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Printer, X, Download, FileCode, Check } from "lucide-react";
import qrcode from "qrcode-generator";
import { api } from "../../api";
import type { CompanyProfile } from "../../../shared/company";
import type { OfficeInvoice, OfficeQuote } from "../../../shared/office";
import { useOfficeI18n } from "./i18n";
import { currency as companyCurrency } from "../../money";

export function PrintDocument({
  doc,
  kind,
  onClose,
}: {
  doc: OfficeInvoice | OfficeQuote;
  kind: "invoice" | "quote";
  onClose: () => void;
}) {
  const { o, euro, day } = useOfficeI18n();
  const [company, setCompany] = useState<CompanyProfile | null>(null);
  const [xmlModalOpen, setXmlModalOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    document.body.classList.add("ck-printing");
    api<{ company: CompanyProfile | null }>("/company")
      .then((d) => setCompany(d.company))
      .catch(() => {});
    return () => document.body.classList.remove("ck-printing");
  }, []);

  const isInvoice = kind === "invoice";
  const invoice = isInvoice ? (doc as OfficeInvoice) : null;
  const quote = !isInvoice ? (doc as OfficeQuote) : null;

  // Generate EPC-QR (GiroCode) for SEPA credit transfer
  let qrDataUrl = "";
  if (isInvoice && company?.iban && doc.totalCents > 0) {
    try {
      const qr = qrcode(0, "M");
      const ibanClean = company.iban.replace(/\s+/g, "").toUpperCase();
      const bicClean = (company.bic || "").replace(/\s+/g, "").toUpperCase();
      const amountEur = (doc.totalCents / 100).toFixed(2);
      const recipient = (company.name || "").slice(0, 70);
      const purpose = doc.number.slice(0, 140);

      // European Payments Council Quick Response Code guidelines
      const epcPayload = [
        "BCD", // Service Tag
        "002", // Version
        "1",   // Character set (UTF-8)
        "SCT", // SEPA Credit Transfer
        bicClean,
        recipient,
        ibanClean,
        `EUR${amountEur}`,
        "",    // Purpose code
        purpose, // Remittance info
        "",
      ].join("\n");

      qr.addData(epcPayload);
      qr.make();
      qrDataUrl = qr.createDataURL(4);
    } catch {
      // ignore qr generation error
    }
  }

  // Generates valid EN16931 XRechnung / ZUGFeRD XML syntax
  const generateEInvoiceXml = () => {
    const issueDate = (invoice?.issuedAt || new Date().toISOString()).slice(0, 10);
    const dueDate = invoice?.dueDate || issueDate;
    const net = (doc.netCents / 100).toFixed(2);
    const vat = (doc.vatCents / 100).toFixed(2);
    const total = (doc.totalCents / 100).toFixed(2);

    const itemsXml = doc.items
      .map(
        (it, idx) => `
    <cac:InvoiceLine>
      <cbc:ID>${idx + 1}</cbc:ID>
      <cbc:InvoicedQuantity unitCode="HUR">${it.qty}</cbc:InvoicedQuantity>
      <cbc:LineExtensionAmount currencyID="${companyCurrency()}">${((it.qty * it.unitCents) / 100).toFixed(2)}</cbc:LineExtensionAmount>
      <cac:Item>
        <cbc:Description>${escapeXml(it.description || it.title)}</cbc:Description>
        <cbc:Name>${escapeXml(it.title)}</cbc:Name>
        <cac:ClassifiedTaxCategory>
          <cbc:ID>${it.vatRate > 0 ? "S" : "E"}</cbc:ID>
          <cbc:Percent>${it.vatRate}</cbc:Percent>
          <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
        </cac:ClassifiedTaxCategory>
      </cac:Item>
      <cac:Price>
        <cbc:PriceAmount currencyID="${companyCurrency()}">${(it.unitCents / 100).toFixed(2)}</cbc:PriceAmount>
      </cac:Price>
    </cac:InvoiceLine>`,
      )
      .join("");

    // Je Steuersatz eine Zwischensumme (vorher immer 19 %, auch bei 7 % oder 0 %)
    const factor = doc.discountPercent && doc.discountPercent > 0 && doc.discountPercent <= 100 ? (100 - doc.discountPercent) / 100 : 1;
    const rates = new Map<number, number>();
    for (const it of doc.items) rates.set(it.vatRate, (rates.get(it.vatRate) ?? 0) + Math.round(it.qty * it.unitCents));
    const taxSubtotals = [...rates]
      .map(([rate, netCents]) => {
        const base = Math.round(netCents * factor);
        const tax = Math.round(Math.round(netCents * (rate / 100)) * factor);
        return `    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="${companyCurrency()}">${(base / 100).toFixed(2)}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="${companyCurrency()}">${(tax / 100).toFixed(2)}</cbc:TaxAmount>
      <cac:TaxCategory>
        <cbc:ID>${rate > 0 ? "S" : "E"}</cbc:ID>
        <cbc:Percent>${rate}</cbc:Percent>${rate > 0 ? "" : "\n        <cbc:TaxExemptionReason>Steuerfrei</cbc:TaxExemptionReason>"}
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:TaxCategory>
    </cac:TaxSubtotal>`;
      })
      .join("\n");

    return `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:xoev-de:kosit:standard:xrechnung_2.3</cbc:CustomizationID>
  <cbc:ProfileID>urn:fdc:peppol.eu:2017:poacc:billing:01:1.0</cbc:ProfileID>
  <cbc:ID>${doc.number}</cbc:ID>
  <cbc:IssueDate>${issueDate}</cbc:IssueDate>
  <cbc:DueDate>${dueDate}</cbc:DueDate>
  <cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>${companyCurrency()}</cbc:DocumentCurrencyCode>
  <cbc:BuyerReference>${escapeXml(invoice?.buyerReference || "KUNDENREFERENZ")}</cbc:BuyerReference>
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cac:PartyName><cbc:Name>${escapeXml(company?.name || "Unternehmen")}</cbc:Name></cac:PartyName>
      <cac:PostalAddress>
        <cbc:StreetName>${escapeXml(company?.street || "")}</cbc:StreetName>
        <cbc:PostalZone>${escapeXml(company?.postalCode || "")}</cbc:PostalZone>
        <cbc:CityName>${escapeXml(company?.city || "")}</cbc:CityName>
        <cac:Country><cbc:IdentificationCode>${company?.country || "DE"}</cbc:IdentificationCode></cac:Country>
      </cac:PostalAddress>
      ${company?.vatId ? `<cac:PartyTaxScheme><cbc:CompanyID>${company.vatId}</cbc:CompanyID><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>` : ""}
    </cac:Party>
  </cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty>
    <cac:Party>
      <cac:PartyName><cbc:Name>${escapeXml(doc.clientName)}</cbc:Name></cac:PartyName>
      <cac:PostalAddress>
        <cbc:CityName>${escapeXml(invoice?.clientAddress || "")}</cbc:CityName>
        <cac:Country><cbc:IdentificationCode>DE</cbc:IdentificationCode></cac:Country>
      </cac:PostalAddress>
    </cac:Party>
  </cac:AccountingCustomerParty>
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="${companyCurrency()}">${vat}</cbc:TaxAmount>
${taxSubtotals}
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="${companyCurrency()}">${net}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="${companyCurrency()}">${net}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="${companyCurrency()}">${total}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="${companyCurrency()}">${total}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>${itemsXml}
</Invoice>`;
  };

  const handleDownloadXml = () => {
    const xml = generateEInvoiceXml();
    const blob = new Blob([xml], { type: "application/xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${doc.number}-XRechnung.xml`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return createPortal(
    <div className="print-layer">
      <div className="print-toolbar">
        <button className="button primary" onClick={() => window.print()}>
          <Printer size={18} /> {o("common.print")}
        </button>
        {isInvoice && (
          <button className="button" onClick={() => setXmlModalOpen(true)}>
            <FileCode size={18} /> {o("print.eInvoiceXml")}
          </button>
        )}
        <button className="button" onClick={onClose}>
          <X size={18} /> {o("common.cancel")}
        </button>
      </div>

      {/* XRechnung-XML: als Karte über dem Blatt, damit kein zweites Overlay über der Druckansicht liegt */}
      {xmlModalOpen && (
        <section className="card stack office-xml">
          <div className="section-head">
            <h2>{o("print.eInvoiceXml")}</h2>
            <button className="icon-button" onClick={() => setXmlModalOpen(false)} aria-label={o("common.close")}>
              <X size={20} />
            </button>
          </div>
          <p className="small muted">
            Diese Rechnung entspricht dem Standard EN 16931 / XRechnung (UBL 2.1). Die XML-Datei kann direkt an Behörden oder Geschäftskunden übermittelt werden.
          </p>
          <textarea readOnly rows={12} value={generateEInvoiceXml()} aria-label={o("print.eInvoiceXml")} />
          <div className="row wrap gap end">
            <button
              className="button"
              onClick={() => {
                navigator.clipboard.writeText(generateEInvoiceXml());
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
            >
              {copied ? <Check size={18} /> : <FileCode size={18} />} {copied ? o("print.copied") : o("print.copyXml")}
            </button>
            <button className="button primary" onClick={handleDownloadXml}>
              <Download size={18} /> {o("print.downloadXml")}
            </button>
          </div>
        </section>
      )}

      <article className="print-sheet">
        <header className="print-head">
          <div>
            {company?.logoDataUrl && <img src={company.logoDataUrl} alt="" className="print-logo" />}
            <strong className="print-company">{company?.name || "Code Kontor Mandant"}</strong>
            <p>
              {company?.street}
              <br />
              {company?.postalCode} {company?.city}
            </p>
            <p>{[company?.phone, company?.email].filter(Boolean).join(" · ")}</p>
          </div>
          <div className="print-meta">
            <h1>{isInvoice ? o("print.invoiceTitle") : o("print.quoteTitle")}</h1>
            <p>
              <strong>{doc.number}</strong>
            </p>
            <p>
              Datum: {day(isInvoice ? (invoice?.issuedAt || "") : (doc.createdAt || ""))}
            </p>
            {isInvoice && invoice?.dueDate && (
              <p>
                Fällig am: <strong>{day(invoice.dueDate)}</strong>
              </p>
            )}
            {!isInvoice && quote?.validUntil && (
              <p>
                Gültig bis: <strong>{day(quote.validUntil)}</strong>
              </p>
            )}
            {doc.projectName && <p>Projekt: {doc.projectName}</p>}
          </div>
        </header>

        {/* Empfänger */}
        <section>
          <h2>Empfänger:</h2>
          <p><strong>{doc.clientName}</strong></p>
          {invoice?.clientAddress && <p className="office-pre">{invoice.clientAddress}</p>}
          {invoice?.clientVatId && <p>USt-IdNr.: {invoice.clientVatId}</p>}
          {isInvoice && invoice?.buyerReference && (
            <p><small>Käuferreferenz / Leitweg-ID: <strong>{invoice.buyerReference}</strong></small></p>
          )}
        </section>

        {/* Betreff */}
        <section>
          <p className="office-print-title"><strong>{doc.title}</strong></p>
          {doc.notes && <p className="print-terms">{doc.notes}</p>}
        </section>

        {/* Positionstabelle */}
        <table className="print-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Position & Beschreibung</th>
              <th className="num">Menge</th>
              <th className="num">Einheit</th>
              <th className="num">Einzelpreis</th>
              <th className="num">MwSt.</th>
              <th className="num">Gesamt</th>
            </tr>
          </thead>
          <tbody>
            {doc.items.map((it, idx) => (
              <tr key={it.id || idx}>
                <td>{idx + 1}</td>
                <td>
                  <strong>{it.title}</strong>
                  {it.description && <><br /><small>{it.description}</small></>}
                </td>
                <td className="num">{it.qty}</td>
                <td className="num">{it.unit || "Std"}</td>
                <td className="num">{euro(it.unitCents)}</td>
                <td className="num">{it.vatRate}%</td>
                <td className="num">{euro(Math.round(it.qty * it.unitCents))}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Summen */}
        <div className="print-totals">
          {doc.discountPercent ? (
            <p>
              <span>Rabatt ({doc.discountPercent}%):</span>
              <span>enthalten</span>
            </p>
          ) : null}
          <p>
            <span>Nettobetrag:</span>
            <span>{euro(doc.netCents)}</span>
          </p>
          <p>
            <span>Umsatzsteuer:</span>
            <span>{euro(doc.vatCents)}</span>
          </p>
          <p className="grand">
            <span><strong>Gesamtbetrag:</strong></span>
            <strong>{euro(doc.totalCents)}</strong>
          </p>
        </div>

        {/* GiroCode / QR & Zahlungsanweisungen */}
        {isInvoice && (
          <section className="print-qr">
            {qrDataUrl && (
              <div className="stack-sm">
                <img src={qrDataUrl} alt="GiroCode" width={110} height={110} />
                <span className="small">GiroCode / EPC-QR</span>
              </div>
            )}
            <div className="stack-sm">
              <strong>
                {invoice?.paidAt
                  ? o("print.paidWith", { date: day(invoice.paidAt), method: invoice.paidMethod || "Überweisung" })
                  : o("print.payNotice", { days: 14 })}
              </strong>
              {invoice?.skontoDays && invoice?.skontoPercent ? (
                <p>
                  Skontovereinbarung: Bei Zahlung innerhalb von {invoice.skontoDays} Tagen gewähren wir {invoice.skontoPercent}% Skonto (Zahlbetrag: {euro(Math.round(invoice.totalCents * (1 - invoice.skontoPercent / 100)))}).
                </p>
              ) : null}
              {company?.iban && (
                <p className="small">
                  Bank: <strong>{company.bankName || "Geschäftskonto"}</strong><br />
                  IBAN: <strong>{company.iban}</strong> · BIC: <strong>{company.bic || "—"}</strong><br />
                  Verwendungszweck: <strong>{doc.number}</strong>
                </p>
              )}
            </div>
          </section>
        )}

        <footer className="print-foot">
          {company?.taxNumber && <span>Steuernummer: {company.taxNumber}</span>}
          {company?.vatId && <span>USt-IdNr.: {company.vatId}</span>}
          {company?.iban && <span>IBAN: {company.iban}</span>}
          {company?.bic && <span>BIC: {company.bic}</span>}
        </footer>
      </article>
    </div>,
    document.body,
  );
}

function escapeXml(unsafe: string): string {
  return (unsafe || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
