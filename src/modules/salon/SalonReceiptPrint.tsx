import { useEffect, useState } from "react";
import { Printer, X, Scissors, Heart, Calendar, Clock } from "lucide-react";
import { api } from "../../api";
import type { CompanyProfile } from "../../../shared/company";
import type { SalonAppointment } from "../../../shared/salon";
import { useSalonI18n } from "./i18n";

export function SalonReceiptPrint({
  appointment,
  payMethod = "bar",
  onClose,
}: {
  appointment: SalonAppointment;
  payMethod?: "bar" | "karte";
  onClose: () => void;
}) {
  const { s, euro, day: formatDay } = useSalonI18n();
  const [company, setCompany] = useState<CompanyProfile | null>(null);

  useEffect(() => {
    document.body.classList.add("ck-printing");
    api<{ company: CompanyProfile | null }>("/company")
      .then((d) => setCompany(d.company))
      .catch(() => {});
    return () => document.body.classList.remove("ck-printing");
  }, []);

  const vatCents = Math.round(appointment.totalCents - appointment.totalCents / 1.19);
  const netCents = appointment.totalCents - vatCents;

  return (
    <div className="print-layer">
      <div className="print-toolbar">
        <button className="button primary" onClick={() => window.print()}>
          <Printer size={18} /> Beleg / Terminzettel drucken
        </button>
        <button className="button push-end" onClick={onClose}>
          <X size={18} /> Schließen
        </button>
      </div>

      <article className="print-sheet" style={{ maxWidth: "420px", margin: "0 auto", padding: "30px 24px" }}>
        <header className="print-head" style={{ textAlign: "center", display: "grid", gap: "6px", borderBottom: "1px dashed #cbd5e1", paddingBottom: "16px" }}>
          <div>
            {company?.logoDataUrl && (
              <img src={company.logoDataUrl} alt="" className="print-logo" style={{ maxHeight: "48px", margin: "0 auto 8px" }} />
            )}
            <h2 style={{ fontSize: "1.4rem", margin: 0, fontWeight: 800 }}>{company?.name || "Salon & Beauty Studio"}</h2>
            <p style={{ margin: "2px 0 0", color: "#64748b", fontSize: "0.86rem" }}>
              {company?.street && `${company.street}, `}
              {company?.postalCode} {company?.city}
            </p>
            {company?.phone && (
              <p style={{ margin: "2px 0 0", color: "#64748b", fontSize: "0.84rem" }}>
                Tel: {company.phone}
              </p>
            )}
            {company?.vatId && (
              <p style={{ margin: "2px 0 0", color: "#64748b", fontSize: "0.8rem" }}>
                USt-IdNr.: {company.vatId}
              </p>
            )}
          </div>
        </header>

        <div style={{ paddingBlock: "16px", display: "grid", gap: "8px", fontSize: "0.9rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: "#64748b" }}>Belegdatum:</span>
            <strong>{formatDay(appointment.day)} {appointment.startTime} Uhr</strong>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: "#64748b" }}>Kunde:</span>
            <strong>{appointment.clientName}</strong>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: "#64748b" }}>Stylist:</span>
            <strong>{appointment.staffName}</strong>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: "#64748b" }}>Zahlart:</span>
            <span style={{ textTransform: "capitalize", fontWeight: 700 }}>
              {payMethod === "bar" ? "Barzahlung" : "Kartenzahlung (EC / Kredit)"}
            </span>
          </div>
        </div>

        <div style={{ borderTop: "1px dashed #cbd5e1", borderBottom: "1px dashed #cbd5e1", paddingBlock: "12px", marginBlock: "8px" }}>
          <strong style={{ fontSize: "0.85rem", textTransform: "uppercase", color: "#64748b", letterSpacing: "0.05em" }}>
            Erbrachte Leistungen
          </strong>
          <ul style={{ margin: "8px 0 0", padding: 0, listStyle: "none", display: "grid", gap: "6px" }}>
            {appointment.serviceNames.map((sn, idx) => (
              <li key={idx} style={{ display: "flex", justifyContent: "space-between", fontSize: "0.92rem" }}>
                <span>• {sn}</span>
              </li>
            ))}
          </ul>
        </div>

        <div style={{ display: "grid", gap: "6px", fontSize: "0.9rem", paddingBlock: "8px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", color: "#64748b" }}>
            <span>Nettobetrag:</span>
            <span>{euro(netCents)}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", color: "#64748b" }}>
            <span>inkl. 19% MwSt:</span>
            <span>{euro(vatCents)}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "1.25rem", fontWeight: 800, marginTop: "6px", borderTop: "2px solid #0f172a", paddingTop: "8px" }}>
            <span>Gesamtbetrag:</span>
            <span>{euro(appointment.totalCents)}</span>
          </div>
        </div>

        <footer style={{ marginTop: "24px", textAlign: "center", borderTop: "1px dashed #cbd5e1", paddingTop: "16px", color: "#64748b", fontSize: "0.85rem", display: "grid", gap: "6px" }}>
          <p style={{ margin: 0, fontWeight: 700, color: "#0f172a" }}>
            Vielen Dank für Ihren Besuch!
          </p>
          <p style={{ margin: 0 }}>
            Empfohlener nächster Termin: in ca. 4 bis 6 Wochen zur Frische & Pflege.
          </p>
        </footer>
      </article>
    </div>
  );
}
