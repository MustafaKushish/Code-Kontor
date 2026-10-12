import { useEffect, useState } from "react";
import { Building2, Landmark, Pencil, Receipt } from "lucide-react";
import { api, type Me } from "../api";
import type { CompanyProfile } from "../../shared/company";

export function Settings({ me, onEdit }: { me: Me; onEdit: () => void }) {
  const [company, setCompany] = useState<CompanyProfile | null>(null);
  const canEdit = me.user.role !== "staff";

  useEffect(() => {
    api<{ company: CompanyProfile | null }>("/company").then((r) => setCompany(r.company));
  }, []);

  const c = company;
  const maskedIban = c?.iban ? `${c.iban.slice(0, 4)} •••• •••• ${c.iban.slice(-4)}` : "–";
  return (
    <div className="stack-lg">
      <header className="page-head">
        <div>
          <h1>Firma</h1>
          <p className="muted">Diese Angaben stehen auf deinen Rechnungen und Belegen.</p>
        </div>
        {canEdit && <button className="button primary" onClick={onEdit}><Pencil size={18} /> Bearbeiten</button>}
      </header>

      {!me.setupComplete && <p className="notice">Die Firmendaten sind noch nicht vollständig.</p>}

      {c ? (
        <div className="columns">
          <section className="card">
            <h2 className="card-title"><Building2 size={20} /> Firma und Adresse</h2>
            {c.logoDataUrl && <img className="company-logo" src={c.logoDataUrl} alt="Firmenlogo" />}
            <dl className="facts">
              <dt>Name</dt><dd>{c.name || "–"}{c.legalForm && ` (${c.legalForm})`}</dd>
              <dt>Adresse</dt><dd>{[c.street, `${c.postalCode} ${c.city}`.trim()].filter(Boolean).join(", ") || "–"}</dd>
              <dt>E-Mail</dt><dd>{c.email || "–"}</dd>
              <dt>Telefon</dt><dd>{c.phone || "–"}</dd>
            </dl>
          </section>
          <section className="card">
            <h2 className="card-title"><Receipt size={20} /> Steuern</h2>
            <dl className="facts">
              <dt>Steuernummer</dt><dd>{c.taxNumber || "–"}</dd>
              <dt>USt-IdNr.</dt><dd>{c.vatId || "–"}</dd>
            </dl>
          </section>
          <section className="card">
            <h2 className="card-title"><Landmark size={20} /> Bank</h2>
            <dl className="facts">
              <dt>IBAN</dt><dd>{maskedIban}</dd>
              <dt>BIC</dt><dd>{c.bic || "–"}</dd>
              <dt>Bank</dt><dd>{c.bankName || "–"}</dd>
            </dl>
          </section>
        </div>
      ) : (
        <p className="muted">Lädt …</p>
      )}
    </div>
  );
}
