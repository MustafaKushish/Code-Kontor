import { useEffect, useState } from "react";
import { Plus, Users, Search, Building2, Mail, Phone, MapPin, Pencil, Trash2, Check, AlertTriangle, ArrowRight, Wallet } from "lucide-react";
import { api } from "../../api";
import { Field } from "../../components";
import { Dialog } from "../../pos/ui";
import type { OfficeClient } from "../../../shared/office";
import { useOfficeI18n } from "./i18n";

export function ClientsTab({
  isManager,
  onSelectClient,
}: {
  isManager: boolean;
  onSelectClient?: (clientId: string) => void;
}) {
  const { o, euro, cur, officeError } = useOfficeI18n();
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
    sepaIban: "",
    sepaBic: "",
    sepaMandateRef: "",
    sepaMandateDate: "",
    skontoDays: 0,
    skontoPercent: 0,
    discountPercent: 0,
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
      sepaIban: "",
      sepaBic: "",
      sepaMandateRef: "",
      sepaMandateDate: "",
      skontoDays: 0,
      skontoPercent: 0,
      discountPercent: 0,
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
      sepaIban: client.sepaIban || "",
      sepaBic: client.sepaBic || "",
      sepaMandateRef: client.sepaMandateRef || "",
      sepaMandateDate: client.sepaMandateDate || "",
      skontoDays: client.skontoDays || 0,
      skontoPercent: client.skontoPercent || 0,
      discountPercent: client.discountPercent || 0,
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
        skontoDays: Number(form.skontoDays) || 0,
        skontoPercent: Number(form.skontoPercent) || 0,
        discountPercent: Number(form.discountPercent) || 0,
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
        <div className="tile stat-tile">
          <span className="stat-icon"><Users size={18} /></span>
          <strong>{totalClients}</strong><small>{o("clients.title")}</small>
        </div>
        <div className="tile stat-tile">
          <span className="stat-icon"><AlertTriangle size={18} /></span>
          <strong>{clientsWithOpenInvoices.length}</strong><small>{o("clients.statWithOpen")}</small>
        </div>
        <div className="tile stat-tile">
          <span className="stat-icon"><Wallet size={18} /></span>
          <strong>{euro(totalOpenCents)}</strong><small>{o("clients.statOpenTotal")}</small>
        </div>
      </div>

      <div className="toolbar">
        <div className="row wrap gap office-filters">
          <label className="search">
            <Search size={18} />
            <input
              type="search"
              placeholder={o("common.search")}
              aria-label={o("common.search")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          {isManager && (
            <div className="row gap push-end">
              <button className="button primary" onClick={openNew}>
                <Plus size={18} /> {o("clients.newClient")}
              </button>
            </div>
          )}
        </div>
      </div>

      {loading ? (
        <p className="muted">{o("common.loading")}</p>
      ) : clients.length === 0 ? (
        <section className="card list-card">
          <p className="empty muted">{o("clients.noClients")}</p>
        </section>
      ) : (
        <div className="office-grid">
          {clients.map((c) => (
            <article key={c.id} className="card office-card">
              <div className="section-head">
                <div>
                  <h3 className="office-icon-line"><Building2 size={18} /> {c.name}</h3>
                  <small className="muted">{o("clients.customerNo", { number: c.number })}</small>
                </div>
                {(c.openInvoiceCount || 0) > 0 && (
                  <span className="pill warn" title={o("clients.openInvoices")}>
                    {o("clients.openBadge", { count: c.openInvoiceCount ?? 0, amount: euro(c.openInvoiceCents || 0) })}
                  </span>
                )}
              </div>

              <div className="stack-sm small muted">
                {c.contactPerson && <span>{o("clients.contactPerson")}: <strong>{c.contactPerson}</strong></span>}
                {c.email && <span className="office-icon-line"><Mail size={15} /> {c.email}</span>}
                {c.phone && <span className="office-icon-line"><Phone size={15} /> {c.phone}</span>}
                {(c.street || c.city) && (
                  <span className="office-icon-line"><MapPin size={15} /> {[c.street, `${c.postalCode} ${c.city}`.trim()].filter(Boolean).join(", ")}</span>
                )}
              </div>

              {!!(c.sepaIban || (c.skontoDays && c.skontoDays > 0) || (c.discountPercent && c.discountPercent > 0)) && (
                <div className="row wrap gap">
                  {c.sepaIban ? <span className="pill success" title={`IBAN: ${c.sepaIban}`}>{o("clients.sepaBadge")}</span> : null}
                  {c.skontoDays && c.skontoDays > 0 ? (
                    <span className="pill" title={o("clients.skontoTitle", { percent: c.skontoPercent ?? 0, days: c.skontoDays })}>
                      {o("clients.skontoBadge", { percent: c.skontoPercent ?? 0, days: c.skontoDays })}
                    </span>
                  ) : null}
                  {c.discountPercent && c.discountPercent > 0 ? (
                    <span className="pill warn" title={o("clients.discountTitle", { percent: c.discountPercent })}>{o("clients.discountBadge", { percent: c.discountPercent })}</span>
                  ) : null}
                </div>
              )}

              <div className="office-facts foot">
                <span>{o("clients.rate")}: <strong>{c.hourlyRateCents > 0 ? o("common.perHour", { amount: euro(c.hourlyRateCents) }) : o("clients.rateStandard")}</strong></span>
                <span>{o("clients.paymentTermsShort")}: <strong>{o("clients.daysValue", { days: c.paymentTermsDays || 14 })}</strong></span>
              </div>

              {isManager && (
                <div className="row wrap gap end">
                  {onSelectClient && (
                    <button className="button small-button" onClick={() => onSelectClient(c.id)} title={o("clients.showProjectsHint")}>
                      {o("clients.showProjects")} <ArrowRight size={15} />
                    </button>
                  )}
                  <button className="button small-button" onClick={() => openEdit(c)} title={o("common.edit")}>
                    <Pencil size={15} /> {o("common.edit")}
                  </button>
                  <button className="icon-button danger" onClick={() => setDeleteConfirmId(c.id)} title={o("common.delete")} aria-label={o("common.delete")}>
                    <Trash2 size={17} />
                  </button>
                </div>
              )}
            </article>
          ))}
        </div>
      )}

      {/* Lösch-Bestätigung */}
      {deleteConfirmId && (
        <Dialog title={o("common.confirmDelete")} onClose={() => setDeleteConfirmId(null)}>
          <div className="stack office-dialog">
            <p className="muted">
              {o("clients.deleteText")}
            </p>
            <div className="row wrap gap end">
              <button className="button" onClick={() => setDeleteConfirmId(null)}>{o("common.cancel")}</button>
              <button className="button danger" onClick={() => handleDelete(deleteConfirmId)}><Trash2 size={17} /> {o("common.delete")}</button>
            </div>
          </div>
        </Dialog>
      )}

      {/* Dialog: Neu / Bearbeiten */}
      {modalOpen && (
        <Dialog title={editingClient ? o("clients.editClient") : o("clients.newClient")} onClose={() => setModalOpen(false)} wide>
          <form onSubmit={handleSave} className="stack office-dialog">
            {errorMsg && <p className="error" role="alert">{errorMsg}</p>}
            <div className="grid form-grid">
              <Field label={o("clients.name")} required wide>
                <input
                  type="text"
                  required
                  placeholder={o("clients.namePlaceholder")}
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </Field>
              <Field label={o("clients.contactPerson")}>
                <input
                  type="text"
                  placeholder={o("clients.contactPlaceholder")}
                  value={form.contactPerson}
                  onChange={(e) => setForm({ ...form, contactPerson: e.target.value })}
                />
              </Field>
              <Field label={o("clients.vatId")}>
                <input type="text" placeholder="DE123456789" value={form.vatId} onChange={(e) => setForm({ ...form, vatId: e.target.value })} />
              </Field>
              <Field label={o("clients.email")}>
                <input type="email" placeholder={o("clients.emailPlaceholder")} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </Field>
              <Field label={o("clients.phone")}>
                <input type="tel" placeholder="+49 30 12345678" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </Field>
              <Field label={o("clients.street")} wide>
                <input type="text" placeholder={o("clients.streetPlaceholder")} value={form.street} onChange={(e) => setForm({ ...form, street: e.target.value })} />
              </Field>
            </div>

            <div className="grid three">
              <Field label={o("clients.postalCode")}>
                <input type="text" placeholder="10115" value={form.postalCode} onChange={(e) => setForm({ ...form, postalCode: e.target.value })} />
              </Field>
              <Field label={o("clients.city")}>
                <input type="text" placeholder={o("clients.cityPlaceholder")} value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
              </Field>
              <Field label={o("clients.country")}>
                <input type="text" value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} />
              </Field>
            </div>

            <div className="grid form-grid">
              <Field label={o("clients.paymentTerms")}>
                <input
                  type="number"
                  min="0"
                  max="180"
                  value={form.paymentTermsDays}
                  onChange={(e) => setForm({ ...form, paymentTermsDays: parseInt(e.target.value, 10) || 14 })}
                />
              </Field>
              <Field label={o("clients.individualRate", { currency: cur() })}>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder={o("clients.individualRatePlaceholder")}
                  value={(form.hourlyRateCents / 100) || ""}
                  onChange={(e) => setForm({ ...form, hourlyRateCents: Math.round(parseFloat(e.target.value || "0") * 100) })}
                />
              </Field>
            </div>

            {/* Skonto- & Rabatt-Konditionen */}
            <div className="office-section">
              <h3 className="card-subtitle">{o("clients.conditionsTitle")}</h3>
              <div className="grid three">
                <Field label={o("clients.skontoDaysField")}>
                  <input
                    type="number"
                    min="0"
                    max="60"
                    placeholder={o("common.example", { value: 7 })}
                    value={form.skontoDays || ""}
                    onChange={(e) => setForm({ ...form, skontoDays: parseInt(e.target.value, 10) || 0 })}
                  />
                </Field>
                <Field label={o("clients.skontoPercentField")}>
                  <input
                    type="number"
                    min="0"
                    max="10"
                    step="0.5"
                    placeholder={o("common.example", { value: 2 })}
                    value={form.skontoPercent || ""}
                    onChange={(e) => setForm({ ...form, skontoPercent: parseFloat(e.target.value) || 0 })}
                  />
                </Field>
                <Field label={o("clients.discountField")}>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.5"
                    placeholder={o("common.example", { value: 5 })}
                    value={form.discountPercent || ""}
                    onChange={(e) => setForm({ ...form, discountPercent: parseFloat(e.target.value) || 0 })}
                  />
                </Field>
              </div>
            </div>

            {/* SEPA-Lastschriftmandat */}
            <div className="office-section">
              <h3 className="card-subtitle">{o("clients.sepaTitle")}</h3>
              <div className="grid form-grid">
                <Field label="IBAN">
                  <input
                    type="text"
                    placeholder="DE89 3704 0044 0532 0130 00"
                    value={form.sepaIban}
                    onChange={(e) => setForm({ ...form, sepaIban: e.target.value.toUpperCase() })}
                  />
                </Field>
                <Field label="BIC">
                  <input
                    type="text"
                    placeholder="COBADEFFXXX"
                    value={form.sepaBic}
                    onChange={(e) => setForm({ ...form, sepaBic: e.target.value.toUpperCase() })}
                  />
                </Field>
                <Field label={o("clients.sepaMandateRef")}>
                  <input
                    type="text"
                    placeholder="MANDAT-1001"
                    value={form.sepaMandateRef}
                    onChange={(e) => setForm({ ...form, sepaMandateRef: e.target.value })}
                  />
                </Field>
                <Field label={o("clients.sepaMandateDate")}>
                  <input type="date" value={form.sepaMandateDate} onChange={(e) => setForm({ ...form, sepaMandateDate: e.target.value })} />
                </Field>
              </div>
            </div>

            <Field label={o("clients.notes")}>
              <textarea
                rows={2}
                placeholder={o("clients.notesPlaceholder")}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </Field>

            <div className="row wrap gap end">
              <button type="button" className="button" onClick={() => setModalOpen(false)}>
                {o("common.cancel")}
              </button>
              <button type="submit" className="button primary">
                <Check size={17} /> {o("common.save")}
              </button>
            </div>
          </form>
        </Dialog>
      )}
    </div>
  );
}
