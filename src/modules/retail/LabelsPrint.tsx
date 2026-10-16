import { useEffect, useState } from "react";
import { Printer, X, Tag } from "lucide-react";
import { api } from "../../api";
import type { CompanyProfile } from "../../../shared/company";
import type { RetailProduct } from "../../../shared/retail";
import { useRetailI18n } from "./i18n";

export function LabelsPrint({
  products,
  onClose,
}: {
  products: RetailProduct[];
  onClose: () => void;
}) {
  const { euro } = useRetailI18n();
  const [company, setCompany] = useState<CompanyProfile | null>(null);

  useEffect(() => {
    document.body.classList.add("ck-printing");
    api<{ company: CompanyProfile | null }>("/company")
      .then((d) => setCompany(d.company))
      .catch(() => {});
    return () => document.body.classList.remove("ck-printing");
  }, []);

  return (
    <div className="print-layer">
      <div className="print-toolbar">
        <button className="button primary" onClick={() => window.print()}>
          <Printer size={18} /> Etiketten drucken ({products.length} Artikel)
        </button>
        <button className="button push-end" onClick={onClose}>
          <X size={18} /> Schließen
        </button>
      </div>

      <article className="print-sheet" style={{ maxWidth: "800px", margin: "0 auto", padding: "20px" }}>
        <header className="print-head" style={{ marginBottom: "16px", borderBottom: "1px dashed #cbd5e1", paddingBottom: "12px" }}>
          <div>
            <strong style={{ fontSize: "1.2rem" }}>{company?.name || "Code Kontor Einzelhandel"}</strong>
            <p style={{ margin: "2px 0 0", color: "#64748b", fontSize: "0.85rem" }}>
              Regal- & Artikeletiketten · Erstellt am {new Date().toLocaleDateString("de-DE")}
            </p>
          </div>
        </header>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))",
            gap: "14px",
          }}
        >
          {products.map((p) => (
            <div
              key={p.id}
              style={{
                border: "1.5px solid #0f172a",
                borderRadius: "8px",
                padding: "12px 14px",
                background: "#ffffff",
                color: "#0f172a",
                display: "grid",
                gap: "4px",
                position: "relative",
                pageBreakInside: "avoid",
              }}
            >
              {p.brand && (
                <span style={{ fontSize: "0.72rem", textTransform: "uppercase", fontWeight: 700, color: "#64748b", letterSpacing: "0.05em" }}>
                  {p.brand}
                </span>
              )}
              <strong style={{ fontSize: "0.95rem", lineHeight: 1.25, minHeight: "36px" }}>
                {p.name}
              </strong>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: "4px", borderTop: "1px solid #e2e8f0", paddingTop: "6px" }}>
                <div>
                  <span style={{ fontSize: "0.75rem", color: "#64748b" }}>inkl. {p.vatRate}% MwSt.</span>
                  {p.location && (
                    <div style={{ fontSize: "0.72rem", color: "#475569" }}>
                      Ort: <strong>{p.location}</strong>
                    </div>
                  )}
                </div>
                <div style={{ textAlign: "end" }}>
                  <span style={{ fontSize: "1.45rem", fontWeight: 900, color: "#047857" }}>
                    {euro(p.sellingPriceCents)}
                  </span>
                  <div style={{ fontSize: "0.75rem", color: "#64748b" }}>
                    pro {p.unit}
                  </div>
                </div>
              </div>

              {/* Barcode-Darstellung */}
              <div style={{ textAlign: "center", borderTop: "1px dashed #cbd5e1", paddingTop: "8px", marginTop: "4px" }}>
                <div style={{ fontFamily: "monospace", fontSize: "0.88rem", letterSpacing: "2px", fontWeight: 700 }}>
                  {p.ean}
                </div>
                <small style={{ fontSize: "0.68rem", color: "#64748b" }}>Art.-Nr. #{p.number}</small>
              </div>
            </div>
          ))}
        </div>
      </article>
    </div>
  );
}
