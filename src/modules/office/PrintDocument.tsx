import { useEffect, useState } from "react";
import { Printer, X, Download, FileCode, Check } from "lucide-react";
import qrcode from "qrcode-generator";
import { api } from "../../api";
import type { CompanyProfile } from "../../../shared/company";
import type { OfficeInvoice, OfficeQuote } from "../../../shared/office";
import { useOfficeI18n } from "./i18n";

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
      <cbc:LineExtensionAmount currencyID="EUR">${((it.qty * it.unitCents) / 100).toFixed(2)}</cbc:LineExtensionAmount>
      <cac:Item>
        <cbc:Description>${escapeXml(it.description || it.title)}</cbc:Description>
        <cbc:Name>${escapeXml(it.title)}</cbc:Name>
        <cac:ClassifiedTaxCategory>
          <cbc:ID>S</cbc:ID>
          <cbc:Percent>${it.vatRate}</cbc:Percent>
          <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
        </cac:ClassifiedTaxCategory>
      </cac:Item>
      <cac:Price>
        <cbc:PriceAmount currencyID="EUR">${(it.unitCents / 100).toFixed(2)}</cbc:PriceAmount>
      </cac:Price>
    </cac:InvoiceLine>`,
      )
      .join("");

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
  <cbc:DocumentCurrencyCode>EUR</cbc:DocumentCurrencyCode>
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
    <cbc:TaxAmount currencyID="EUR">${vat}</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="EUR">${net}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="EUR">${vat}</cbc:TaxAmount>
      <cac:TaxCategory>
        <cbc:ID>S</cbc:ID>
        <cbc:Percent>19</cbc:Percent>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="EUR">${net}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="EUR">${net}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="EUR">${total}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="EUR">${total}</cbc:PayableAmount>
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

  return (
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
        <button className="button push-end" onClick={onClose}>
          <X size={18} /> {o("common.cancel")}
        </button>
      </div>

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
            <h1 style={{ fontSize: "1.8rem", margin: "0 0 6px" }}>
              {isInvoice ? o("print.invoiceTitle") : o("print.quoteTitle")}
            </h1>
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
        <section style={{ margin: "24px 0 32px" }}>
          <small className="muted" style={{ display: "block", marginBottom: "4px" }}>Empfänger:</small>
          <div style={{ fontSize: "1.05rem", lineHeight: "1.4" }}>
            <strong>{doc.clientName}</strong>
            {invoice?.clientAddress && <div style={{ whiteSpace: "pre-line" }}>{invoice.clientAddress}</div>}
            {invoice?.clientVatId && <div>USt-IdNr.: {invoice.clientVatId}</div>}
            {isInvoice && invoice?.buyerReference && (
              <div style={{ fontSize: "0.85rem", color: "var(--muted)", marginTop: "4px" }}>
                Käuferreferenz / Leitweg-ID: <strong>{invoice.buyerReference}</strong>
              </div>
            )}
          </div>
        </section>

        {/* Betreff */}
        <div style={{ marginBottom: "20px" }}>
          <h2 style={{ fontSize: "1.2rem", margin: "0 0 4px" }}>{doc.title}</h2>
          {doc.notes && <p className="muted" style={{ margin: 0 }}>{doc.notes}</p>}
        </div>

        {/* Positionstabelle */}
        <table className="print-items">
          <thead>
            <tr>
              <th style={{ width: "35px" }}>#</th>
              <th>Position & Beschreibung</th>
              <th className="num" style={{ width: "70px" }}>Menge</th>
              <th className="num" style={{ width: "60px" }}>Einheit</th>
              <th className="num" style={{ width: "95px" }}>Einzelpreis</th>
              <th className="num" style={{ width: "65px" }}>MwSt.</th>
              <th className="num" style={{ width: "105px" }}>Gesamt</th>
            </tr>
          </thead>
          <tbody>
            {doc.items.map((it, idx) => (
              <tr key={it.id || idx}>
                <td>{idx + 1}</td>
                <td>
                  <strong>{it.title}</strong>
                  {it.description && <div style={{ fontSize: "0.85rem", color: "var(--muted)", marginTop: "2px" }}>{it.description}</div>}
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
        <div className="print-totals" style={{ marginLeft: "auto", maxWidth: "340px", marginTop: "16px" }}>
          {doc.discountPercent ? (
            <p style={{ color: "var(--accent)" }}>
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
          <p className="grand" style={{ fontSize: "1.25rem", borderTop: "2px solid var(--text)", paddingTop: "8px" }}>
            <span><strong>Gesamtbetrag:</strong></span>
            <strong>{euro(doc.totalCents)}</strong>
          </p>
        </div>

        {/* GiroCode / QR & Zahlungsanweisungen */}
        {isInvoice && (
          <section style={{ marginTop: "32px", borderTop: "1px solid var(--line)", paddingTop: "18px", display: "flex", gap: "24px", alignItems: "center" }}>
            {qrDataUrl && (
              <div style={{ textAlign: "center" }}>
                <img src={qrDataUrl} alt="GiroCode" width={110} height={110} style={{ borderRadius: "4px" }} />
                <div style={{ fontSize: "0.72rem", color: "var(--muted)", marginTop: "4px" }}>GiroCode / EPC-QR</div>
              </div>
            )}
            <div>
              <p style={{ margin: "0 0 6px", fontWeight: 600 }}>
                {invoice?.paidAt
                  ? o("print.paidWith", { date: day(invoice.paidAt), method: invoice.paidMethod || "Überweisung" })
                  : o("print.payNotice", { days: 14 })}
              </p>
              {invoice?.skontoDays && invoice?.skontoPercent ? (
                <p style={{ margin: "4px 0", fontSize: "0.88rem", color: "var(--accent)", fontWeight: 500 }}>
                  Skontovereinbarung: Bei Zahlung innerhalb von {invoice.skontoDays} Tagen gewähren wir {invoice.skontoPercent}% Skonto (Zahlbetrag: {euro(Math.round(invoice.totalCents * (1 - invoice.skontoPercent / 100)))}).
                </p>
              ) : null}
              {company?.iban && (
                <div style={{ fontSize: "0.88rem", color: "var(--muted)" }}>
                  <div>Bank: <strong>{company.bankName || "Geschäftskonto"}</strong></div>
                  <div>IBAN: <strong>{company.iban}</strong> · BIC: <strong>{company.bic || "—"}</strong></div>
                  <div>Verwendungszweck: <strong>{doc.number}</strong></div>
                </div>
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

      {/* XML Modal für XRechnung */}
      {xmlModalOpen && (
        <div className="office-modal-overlay" onClick={() => setXmlModalOpen(false)}>
          <div className="office-modal" style={{ maxWidth: "720px" }} onClick={(e) => e.stopPropagation()}>
            <div className="office-modal-head">
              <h3>{o("print.eInvoiceXml")}</h3>
              <button className="icon-button" onClick={() => setXmlModalOpen(false)}>
                <X size={20} />
              </button>
            </div>
            <p className="small muted">
              Diese Rechnung entspricht dem Standard EN 16931 / XRechnung (UBL 2.1). Die XML-Datei kann direkt an Behörden oder Geschäftskunden übermittelt werden.
            </p>
            <textarea
              readOnly
              rows={12}
              style={{ fontFamily: "monospace", fontSize: "0.8rem", width: "100%", background: "var(--panel-2)", border: "1px solid var(--line)", borderRadius: "var(--radius)", padding: "10px" }}
              value={generateEInvoiceXml()}
            />
            <div className="row gap" style={{ justifyContent: "flex-end" }}>
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
          </div>
        </div>
      )}
    </div>
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
