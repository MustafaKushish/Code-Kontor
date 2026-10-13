import { useEffect, useState, type FormEvent } from "react";
import { ArrowLeft, Mail, Phone, Plus, Receipt, Search, ShieldCheck, Smartphone, Trash2, Wrench } from "lucide-react";
import { api, ApiError } from "../../api";
import { Field, Link } from "../../components";
import { navigate } from "../../router";
import type { InvoiceKind, RepairCustomer, RepairErrors, RepairInvoice, RepairOrderRow } from "../../../shared/repairs";
import { useRepairI18n } from "./i18n";
import { startIntake } from "./IntakeForm";
import { Dialog, StatusPill, deviceLabel } from "./parts";
import { SaleInvoicePrint } from "./Print";

const BASE = "/app/handy-it";
type ListRow = RepairCustomer & { orders: number; lastAt: string; totalCents: number };
type CardInvoice = { number: string; kind: InvoiceKind; issuedAt: string; totalCents: number; orderId: string; warrantyUntil: string };
type Card = { customer: RepairCustomer; orders: RepairOrderRow[]; invoices: CardInvoice[] };

/** Kundenkartei: alle Kunden mit Aufträgen, Umsatz und letztem Besuch. */
export function CustomersTab() {
  const { r, euro, day, repairError } = useRepairI18n();
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<ListRow[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => {
      api<{ customers: ListRow[] }>(`/repairs/customer-list?q=${encodeURIComponent(query)}`).then((d) => setRows(d.customers)).catch((e) => setError(repairError(e)));
    }, query ? 200 : 0);
    return () => clearTimeout(timer);
  }, [query]);

  return (
    <div className="stack">
      <div className="row wrap gap stock-toolbar">
        <label className="search">
          <Search size={18} />
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={r("customers.search")} aria-label={r("customers.search")} />
        </label>
        <button className="button primary" onClick={() => setAdding(true)}><Plus size={18} /> {r("customers.add")}</button>
      </div>
      {error && <p className="error">{error}</p>}
      {rows && (
        <section className="card list-card">
          {rows.length === 0 && <p className="empty muted">{query ? r("customers.noMatch") : r("customers.empty")}</p>}
          {rows.map((c) => (
            <Link key={c.id} to={`${BASE}/kunden/${c.id}`} className="list-row">
              <span className="customer-avatar" aria-hidden>{initials(c.name)}</span>
              <span className="list-main">
                <strong>{c.name}</strong>
                <small className="muted">{[c.phone, c.email].filter(Boolean).join(" · ")}</small>
              </span>
              <span className="part-row-meta">
                <small className="muted">{r("customers.ordersCount", { n: c.orders })}{c.totalCents ? ` · ${euro(c.totalCents)}` : ""}</small>
                {c.lastAt && <small className="muted">{r("customers.lastVisit", { day: day(c.lastAt) })}</small>}
              </span>
            </Link>
          ))}
        </section>
      )}
      {adding && <CustomerDialog customer={null} onClose={() => setAdding(false)} onSaved={(c) => navigate(`${BASE}/kunden/${c.id}`)} />}
    </div>
  );
}

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join("") || "?";

export function CustomerCard({ id, isManager }: { id: string; isManager: boolean }) {
  const { r, euro, day, repairError } = useRepairI18n();
  const [card, setCard] = useState<Card | null>(null);
  const [editing, setEditing] = useState(false);
  const [printing, setPrinting] = useState<RepairInvoice | null>(null);
  const [error, setError] = useState("");

  const load = () => api<Card>(`/repairs/customer-list/${id}`).then(setCard).catch((e) => setError(repairError(e)));
  useEffect(() => {
    load();
  }, [id]);

  if (!card) return error ? <p className="error">{error}</p> : <p className="muted">…</p>;
  const c = card.customer;
  const today = new Date().toLocaleDateString("en-CA");
  const total = card.invoices.reduce((s, i) => s + i.totalCents, 0);
  const activeWarranties = card.invoices.filter((i) => i.warrantyUntil >= today).length;

  // Geräte aus allen Aufträgen, nach IMEI bzw. Modell zusammengefasst
  const devices = new Map<string, RepairOrderRow["device"] & { n: number }>();
  for (const o of card.orders) {
    const key = o.device.serial || deviceLabel(o.device);
    const d = devices.get(key);
    devices.set(key, d ? { ...d, n: d.n + 1 } : { ...o.device, n: 1 });
  }

  const openInvoice = (i: CardInvoice) => {
    if (i.kind === "repair") return navigate(`${BASE}/auftrag/${i.orderId}`);
    api<{ invoice: RepairInvoice }>(`/repairs/invoices/${encodeURIComponent(i.number)}`).then((d) => setPrinting(d.invoice)).catch((e) => setError(repairError(e)));
  };

  const remove = async () => {
    if (!confirm(r("customers.removeConfirm", { name: c.name }))) return;
    try {
      await api(`/repairs/customer-list/${id}`, { method: "DELETE" });
      navigate(`${BASE}/kunden`);
    } catch (e) {
      setError(repairError(e));
    }
  };

  return (
    <div className="stack">
      <Link to={`${BASE}/kunden`} className="text-link back"><ArrowLeft size={16} className="flip-rtl" /> {r("customers.back")}</Link>
      {error && <p className="error">{error}</p>}
      <div className="repair-detail">
        <div className="stack">
          <section className="card stack">
            <div className="customer-head">
              <span className="customer-avatar big" aria-hidden>{initials(c.name)}</span>
              <div className="stack-sm">
                <h2>{c.name}</h2>
                <div className="row wrap gap">
                  {c.phone && <a className="button" href={`tel:${c.phone.replace(/[^\d+]/g, "")}`}><Phone size={16} /> {c.phone}</a>}
                  {c.email && <a className="button" href={`mailto:${c.email}`}><Mail size={16} /> {c.email}</a>}
                </div>
              </div>
            </div>
            <div className="repairs-stats">
              <div className="tile stat-tile"><strong>{card.orders.length}</strong><small>{r("customers.statOrders")}</small></div>
              <div className="tile stat-tile"><strong>{euro(total)}</strong><small>{r("customers.statRevenue")}</small></div>
              <div className="tile stat-tile"><strong>{activeWarranties}</strong><small>{r("customers.statWarranty")}</small></div>
            </div>
            <div className="row wrap gap">
              <button className="button primary" onClick={() => startIntake({ customer: c, customerId: c.id })}><Plus size={17} /> {r("newOrder")}</button>
              <button className="button" onClick={() => setEditing(true)}>{r("customers.edit")}</button>
            </div>
          </section>

          <section className="card stack">
            <h2 className="card-title"><Wrench size={20} /> {r("customers.orders")}</h2>
            {card.orders.length === 0 && <p className="muted">{r("customers.noOrders")}</p>}
            {card.orders.map((o) => (
              <Link key={o.id} to={`${BASE}/auftrag/${o.id}`} className="list-row repair-row">
                <span className="repair-number">#{o.number}</span>
                <span className="list-main">
                  <strong>{deviceLabel(o.device)}</strong>
                  <small className="muted">{day(o.createdAt)}{o.problem ? ` · ${o.problem}` : ""}</small>
                </span>
                <span className="repair-row-meta">
                  <StatusPill status={o.status} />
                  {!!o.totalCents && <small className="muted">{euro(o.totalCents)}</small>}
                </span>
              </Link>
            ))}
          </section>

          <section className="card stack">
            <h2 className="card-title"><Receipt size={20} /> {r("customers.invoices")}</h2>
            {card.invoices.length === 0 && <p className="muted">{r("customers.noInvoices")}</p>}
            {card.invoices.map((i) => (
              <button key={i.number} className="list-row part-row" onClick={() => openInvoice(i)}>
                <span className="list-main">
                  <strong>{i.number}</strong>
                  <small className="muted">{day(i.issuedAt)} · {i.kind === "sale" ? r("invoices.sale") : r("invoices.repair")}</small>
                </span>
                <span className="part-row-meta">
                  <strong>{euro(i.totalCents)}</strong>
                  {i.warrantyUntil && (
                    <small className={i.warrantyUntil >= today ? "success-text" : "muted"}><ShieldCheck size={13} /> {r("warranty.until", { day: day(i.warrantyUntil) })}</small>
                  )}
                </span>
              </button>
            ))}
          </section>
        </div>

        <div className="stack">
          <section className="card stack-sm">
            <h2 className="card-title">{r("customers.details")}</h2>
            <dl className="repair-facts">
              <dt>{r("used.address")}</dt><dd className="pre">{c.address || "–"}</dd>
              <dt>{r("customers.note")}</dt><dd className="pre">{c.note || "–"}</dd>
            </dl>
          </section>
          <section className="card stack-sm">
            <h2 className="card-title"><Smartphone size={20} /> {r("customers.devices")}</h2>
            {devices.size === 0 && <p className="muted">–</p>}
            {[...devices.values()].map((d, i) => (
              <div key={i} className="list-row">
                <span className="list-main">
                  <strong>{deviceLabel(d)}</strong>
                  <small className="muted">{[r(`devices.${d.type}`), d.serial, d.color].filter(Boolean).join(" · ")}</small>
                </span>
                <small className="muted">{r("customers.ordersCount", { n: d.n })}</small>
              </div>
            ))}
          </section>
          {isManager && <button className="button danger" onClick={remove}><Trash2 size={16} /> {r("customers.remove")}</button>}
        </div>
      </div>
      {editing && <CustomerDialog customer={c} onClose={() => setEditing(false)} onSaved={() => (setEditing(false), load())} />}
      {printing && <SaleInvoicePrint invoice={printing} onClose={() => setPrinting(null)} />}
    </div>
  );
}

function CustomerDialog({ customer, onClose, onSaved }: { customer: RepairCustomer | null; onClose: () => void; onSaved: (c: RepairCustomer) => void }) {
  const { r, repairError } = useRepairI18n();
  const [form, setForm] = useState({ name: customer?.name ?? "", phone: customer?.phone ?? "", email: customer?.email ?? "", address: customer?.address ?? "", note: customer?.note ?? "" });
  const [errors, setErrors] = useState<RepairErrors>({});
  const [error, setError] = useState("");
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));
  const err = (key: keyof RepairErrors) => (errors[key] ? r(`intake.errors.${key}`) : undefined);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setErrors({});
    try {
      const { customer: saved } = await api<{ customer: RepairCustomer }>(customer ? `/repairs/customer-list/${customer.id}` : "/repairs/customer-list", { method: customer ? "PUT" : "POST", body: form });
      onSaved(saved);
    } catch (err) {
      if (err instanceof ApiError && err.errors) setErrors(err.errors as RepairErrors);
      setError(repairError(err));
    }
  };

  return (
    <Dialog title={customer ? customer.name : r("customers.add")} onClose={onClose} wide>
      <form className="stack" onSubmit={save} noValidate>
        {error && <p className="error">{error}</p>}
        <div className="grid form-grid">
          <Field label={r("intake.name")} error={err("customerName")}><input value={form.name} onChange={(e) => set({ name: e.target.value })} autoFocus /></Field>
          <Field label={r("intake.phone")} error={err("contact")}><input type="tel" value={form.phone} onChange={(e) => set({ phone: e.target.value })} /></Field>
          <Field label={r("intake.email")} error={err("email")} wide><input type="email" value={form.email} onChange={(e) => set({ email: e.target.value })} /></Field>
          <Field label={r("used.address")} wide><textarea rows={2} value={form.address} onChange={(e) => set({ address: e.target.value })} /></Field>
          <Field label={r("customers.note")} hint={r("customers.noteHint")} wide><textarea rows={3} value={form.note} onChange={(e) => set({ note: e.target.value })} /></Field>
        </div>
        <button className="button primary">{r("stock.save")}</button>
      </form>
    </Dialog>
  );
}
