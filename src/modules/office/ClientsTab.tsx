import { useEffect, useState } from "react";
import { Plus, Users, Search, Building2, Mail, Phone, MapPin, Pencil, Trash2, X, AlertTriangle, ArrowRight } from "lucide-react";
import { api } from "../../api";
import { Field } from "../../components";
import type { OfficeClient } from "../../../shared/office";
import { useOfficeI18n } from "./i18n";

export function ClientsTab({
  isManager,
  onSelectClient,
}: {
  isManager: boolean;
  onSelectClient?: (clientId: string) => void;
}) {
  const { o, euro, officeError } = useOfficeI18n();
  const [clients, setClients] = useState<OfficeClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<OfficeClient | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

  const [form, setForm] = useState({
    name: "",
    contactPerson: "",
    email: "",
    phone: "",
    street: "",
    postalCode: "",
    city: "",
    country: "DE",
    vatId: "",
    paymentTermsDays: 14,
    hourlyRateCents: 9500,
    notes: "",
  });

  const loadClients = async () => {
    try {
      const res = await api<{ clients: OfficeClient[] }>(`/office/clients?q=${encodeURIComponent(search)}`);
      setClients(res.clients);
    } catch (err) {
      setErrorMsg(officeError(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(loadClients, search ? 200 : 0);
    return () => clearTimeout(timer);
  }, [search]);

  const openNew = () => {
    setEditingClient(null);
    setForm({
      name: "",
      contactPerson: "",
      email: "",
      phone: "",
      street: "",
      postalCode: "",
      city: "",
      country: "DE",
      vatId: "",
      paymentTermsDays: 14,
      hourlyRateCents: 9500,
      notes: "",
    });
    setErrorMsg("");
    setModalOpen(true);
  };

  const openEdit = (client: OfficeClient) => {
    setEditingClient(client);
    setForm({
      name: client.name,
      contactPerson: client.contactPerson,
      email: client.email,
      phone: client.phone,
      street: client.street,
      postalCode: client.postalCode,
      city: client.city,
      country: client.country,
      vatId: client.vatId,
      paymentTermsDays: client.paymentTermsDays || 14,
      hourlyRateCents: client.hourlyRateCents || 9500,
      notes: client.notes,
    });
    setErrorMsg("");
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    try {
      const payload = {
        ...(editingClient ? { id: editingClient.id } : {}),
        ...form,
        paymentTermsDays: Number(form.paymentTermsDays) || 14,
        hourlyRateCents: Number(form.hourlyRateCents) || 0,
      };
      await api("/office/clients", { method: "POST", body: payload });
      setModalOpen(false);
      await loadClients();
    } catch (err) {
      setErrorMsg(officeError(err));
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await api(`/office/clients/${id}`, { method: "DELETE" });
      setDeleteConfirmId(null);
      await loadClients();
    } catch (err) {
      alert(officeError(err));
      setDeleteConfirmId(null);
    }
  };

  const totalClients = clients.length;
  const clientsWithOpenInvoices = clients.filter((c) => (c.openInvoiceCount || 0) > 0);
  const totalOpenCents = clients.reduce((sum, c) => sum + (c.openInvoiceCents || 0), 0);

  return (
    <div className="stack">
      <div className="office-stats">
        <div className="office-stat-card">
          <span className="label">Kundenkartei</span>
          <span className="value" style={{ color: "var(--brand)" }}>{totalClients}</span>
        </div>
        <div className="office-stat-card">
          <span className="label">Mit offenen Rechnungen</span>
          <span className="value" style={{ color: "var(--warning, #eab308)" }}>{clientsWithOpenInvoices.length}</span>
        </div>
        <div className="office-stat-card">
          <span className="label">Gesamt offener Posten</span>
          <span className="value" style={{ color: "var(--accent)" }}>{euro(totalOpenCents)}</span>
        </div>
      </div>

      <div className="toolbar">
        <div className="search-wrap" style={{ maxWidth: "340px", flex: 1 }}>
          <Search size={18} className="search-icon" />
          <input
            type="search"
            className="input"
            placeholder={o("common.search")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {isManager && (
          <button className="button primary push-end" onClick={openNew}>
            <Plus size={18} /> {o("clients.newClient")}
          </button>
        )}
      </div>

      {loading ? (
        <p className="muted">Laden...</p>
      ) : clients.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: "40px" }}>
          <Users size={36} style={{ color: "var(--muted)", margin: "0 auto 12px" }} />
          <h3>{o("clients.noClients")}</h3>
        </div>
      ) : (
        <div className="office-grid">
          {clients.map((c) => (
            <div key={c.id} className="office-card">
              <div className="office-card-header">
                <div>
                  <h3 style={{ margin: "0 0 4px", display: "flex", alignItems: "center", gap: "8px" }}>
                    <Building2 size={18} style={{ color: "var(--accent)" }} />
                    {c.name}
                  </h3>
                  <small className="muted">Kunden-Nr. #{c.number}</small>
                </div>
                {(c.openInvoiceCount || 0) > 0 && (
                  <span className="pill warning" title="Offene Rechnungen">
                    {c.openInvoiceCount} offen ({euro(c.openInvoiceCents || 0)})
                  </span>
                )}
              </div>

              <div className="stack-sm" style={{ fontSize: "0.88rem", color: "var(--muted)" }}>
                {c.contactPerson && <div>Ansprechpartner: <strong style={{ color: "var(--text)" }}>{c.contactPerson}</strong></div>}
                {c.email && (
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <Mail size={15} /> <span>{c.email}</span>
                  </div>
                )}
                {c.phone && (
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <Phone size={15} /> <span>{c.phone}</span>
                  </div>
                )}
                {(c.street || c.city) && (
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <MapPin size={15} /> <span>{[c.street, `${c.postalCode} ${c.city}`.trim()].filter(Boolean).join(", ")}</span>
                  </div>
                )}
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.82rem", color: "var(--muted)", borderTop: "1px solid var(--line)", paddingTop: "10px" }}>
                <span>Satz: <strong>{c.hourlyRateCents > 0 ? `${euro(c.hourlyRateCents)}/h` : "Standard"}</strong></span>
                <span>Zahlungsziel: <strong>{c.paymentTermsDays || 14} Tage</strong></span>
              </div>

              {isManager && (
                <div className="row gap" style={{ justifyContent: "flex-end", marginTop: "4px" }}>
                  {onSelectClient && (
                    <button className="button small" onClick={() => onSelectClient(c.id)} title="Projekte anzeigen">
                      Projekte <ArrowRight size={14} />
                    </button>
                  )}
                  <button className="button small" onClick={() => openEdit(c)} title={o("common.edit")}>
                    <Pencil size={15} /> {o("common.edit")}
                  </button>
                  <button
                    className="button small danger"
                    onClick={() => setDeleteConfirmId(c.id)}
                    title={o("common.delete")}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Lösch-Bestätigung */}
      {deleteConfirmId && (
        <div className="office-modal-overlay" onClick={() => setDeleteConfirmId(null)}>
          <div className="office-modal" style={{ maxWidth: "440px" }} onClick={(e) => e.stopPropagation()}>
            <div className="office-modal-head">
              <h3>{o("common.confirmDelete")}</h3>
              <button className="icon-button" onClick={() => setDeleteConfirmId(null)}>
                <X size={20} />
              </button>
            </div>
            <p className="small muted">
              Möchten Sie diesen Kunden wirklich löschen? Kunden mit verknüpften Projekten können aus Sicherheitsgründen nicht gelöscht werden.
            </p>
            <div className="row gap" style={{ justifyContent: "flex-end" }}>
              <button className="button" onClick={() => setDeleteConfirmId(null)}>{o("common.cancel")}</button>
              <button className="button primary danger" onClick={() => handleDelete(deleteConfirmId)}>{o("common.delete")}</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Neu / Bearbeiten */}
      {modalOpen && (
        <div className="office-modal-overlay" onClick={() => setModalOpen(false)}>
          <div className="office-modal" onClick={(e) => e.stopPropagation()}>
            <div className="office-modal-head">
              <h3>{editingClient ? "Kunde bearbeiten" : o("clients.newClient")}</h3>
              <button className="icon-button" onClick={() => setModalOpen(false)}>
                <X size={20} />
              </button>
            </div>

            {errorMsg && (
              <div className="notice warning" style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                <AlertTriangle size={18} /> {errorMsg}
              </div>
            )}

            <form onSubmit={handleSave} className="stack">
              <Field label="Kundenname / Firma" required>
                <input
                  type="text"
                  required
                  className="input"
                  placeholder="z.B. Musterkanzlei Schmidt & Partner"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </Field>

              <div className="row-grid">
                <Field label={o("clients.contactPerson")}>
                  <input
                    type="text"
                    className="input"
                    placeholder="z.B. Dr. Michael Schmidt"
                    value={form.contactPerson}
                    onChange={(e) => setForm({ ...form, contactPerson: e.target.value })}
                  />
                </Field>
                <Field label={o("clients.vatId")}>
                  <input
                    type="text"
                    className="input"
                    placeholder="DE123456789"
                    value={form.vatId}
                    onChange={(e) => setForm({ ...form, vatId: e.target.value })}
                  />
                </Field>
              </div>

              <div className="row-grid">
                <Field label="E-Mail-Adresse">
                  <input
                    type="email"
                    className="input"
                    placeholder="kontakt@kunde.de"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                  />
                </Field>
                <Field label="Telefonnummer">
                  <input
                    type="tel"
                    className="input"
                    placeholder="+49 30 12345678"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  />
                </Field>
              </div>

              <Field label="Straße & Hausnummer">
                <input
                  type="text"
                  className="input"
                  placeholder="Hauptstraße 12"
                  value={form.street}
                  onChange={(e) => setForm({ ...form, street: e.target.value })}
                />
              </Field>

              <div className="row-grid" style={{ gridTemplateColumns: "1fr 2fr 1fr" }}>
                <Field label="PLZ">
                  <input
                    type="text"
                    className="input"
                    placeholder="10115"
                    value={form.postalCode}
                    onChange={(e) => setForm({ ...form, postalCode: e.target.value })}
                  />
                </Field>
                <Field label="Ort">
                  <input
                    type="text"
                    className="input"
                    placeholder="Berlin"
                    value={form.city}
                    onChange={(e) => setForm({ ...form, city: e.target.value })}
                  />
                </Field>
                <Field label="Land">
                  <input
                    type="text"
                    className="input"
                    value={form.country}
                    onChange={(e) => setForm({ ...form, country: e.target.value })}
                  />
                </Field>
              </div>

              <div className="row-grid">
                <Field label={o("clients.paymentTerms")}>
                  <input
                    type="number"
                    min="0"
                    max="180"
                    className="input"
                    value={form.paymentTermsDays}
                    onChange={(e) => setForm({ ...form, paymentTermsDays: parseInt(e.target.value, 10) || 14 })}
                  />
                </Field>
                <Field label="Individueller Stundensatz (€/h, netto)">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    className="input"
                    placeholder="0.00 = Standard"
                    value={(form.hourlyRateCents / 100) || ""}
                    onChange={(e) => setForm({ ...form, hourlyRateCents: Math.round(parseFloat(e.target.value || "0") * 100) })}
                  />
                </Field>
              </div>

              <Field label="Interne Notizen">
                <textarea
                  className="input"
                  rows={2}
                  placeholder="Besondere Vereinbarungen, Ansprechzeiten..."
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                />
              </Field>

              <div className="row gap" style={{ justifyContent: "flex-end", marginTop: "12px" }}>
                <button type="button" className="button" onClick={() => setModalOpen(false)}>
                  {o("common.cancel")}
                </button>
                <button type="submit" className="button primary">
                  {o("common.save")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
