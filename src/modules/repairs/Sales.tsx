import { formatRate, vatChoices } from "../../money";
import { useEffect, useState } from "react";
import { Minus, Plus, Printer, Search, ShoppingCart, Smartphone, Trash2, UserCheck, UserRound } from "lucide-react";
import { api } from "../../api";
import { Field } from "../../components";
import {
  PAYMENT_METHODS, computeTotals,
  type InvoiceKind, type PaymentMethod, type RepairCustomer, type RepairInvoice, type RepairPart, type SaleLine, type UsedDevice,
} from "../../../shared/repairs";
import { useRepairI18n } from "./i18n";
import { Dialog, MoneyInput, deviceLabel } from "./parts";
import { SaleInvoicePrint } from "./Print";

type CartLine = SaleLine & { key: string; stock?: number };
type SaleInvoice = RepairInvoice & { kind: InvoiceKind; orderId: string };
interface InvoiceRow { number: string; kind: InvoiceKind; issuedAt: string; totalCents: number; paymentMethod: PaymentMethod; customerName: string }

const EMPTY_CUSTOMER = { name: "", address: "", phone: "", email: "" };

/** Verkauf an der Theke: Zubehör und Teile aus dem Lager, Gebrauchtgeräte, freie Positionen. */
export function SalesTab() {
  const { r, euro, day, repairError } = useRepairI18n();
  const [query, setQuery] = useState("");
  const [parts, setParts] = useState<RepairPart[]>([]);
  const [used, setUsed] = useState<UsedDevice[]>([]);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [customer, setCustomer] = useState(EMPTY_CUSTOMER);
  const [showCustomer, setShowCustomer] = useState(false);
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<RepairCustomer[]>([]);
  const [payment, setPayment] = useState<PaymentMethod>("cash");
  const [smallBusiness, setSmallBusiness] = useState(false);
  const [other, setOther] = useState(false);
  const [printing, setPrinting] = useState<SaleInvoice | null>(null);
  const [recent, setRecent] = useState<InvoiceRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const loadRecent = () =>
    api<{ invoices: InvoiceRow[] }>(`/repairs/invoices?year=${new Date().getFullYear()}`)
      .then((d) => setRecent(d.invoices.filter((i) => i.kind === "sale").slice(0, 10)))
      .catch(() => {});

  useEffect(() => {
    loadRecent();
    api<{ settings: { smallBusiness: boolean } }>("/repairs/settings").then((d) => setSmallBusiness(d.settings.smallBusiness)).catch(() => {});
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      const q = encodeURIComponent(query);
      api<{ parts: RepairPart[] }>(`/repairs/parts?q=${q}`).then((d) => setParts(d.parts)).catch((e) => setError(repairError(e)));
      api<{ devices: UsedDevice[] }>(`/repairs/used?status=inStock&q=${q}`).then((d) => setUsed(d.devices)).catch(() => {});
    }, query ? 200 : 0);
    return () => clearTimeout(timer);
  }, [query]);

  // Bekannte Kunden vorschlagen, damit der Verkauf in der Kundenkartei landet
  useEffect(() => {
    if (!showCustomer || customerId) return setSuggestions([]);
    const q = customer.phone.length >= 4 ? customer.phone : customer.name;
    if (q.trim().length < 2) return setSuggestions([]);
    const timer = setTimeout(() => {
      api<{ customers: RepairCustomer[] }>(`/repairs/customers?q=${encodeURIComponent(q)}`).then((d) => setSuggestions(d.customers)).catch(() => {});
    }, 250);
    return () => clearTimeout(timer);
  }, [customer.name, customer.phone, customerId, showCustomer]);

  // Zubehör zuerst, dann Ersatzteile
  const sortedParts = [...parts].sort((a, b) => (a.category === b.category ? 0 : a.category === "accessory" ? -1 : 1));
  const inCart = (kind: SaleLine["kind"], id: string) => cart.find((l) => l.kind === kind && l.refId === id);

  const addPart = (p: RepairPart) => {
    const line = inCart("part", p.id);
    if (line) return changeQty(line.key, 1);
    setCart((c) => [...c, { key: crypto.randomUUID(), kind: "part", refId: p.id, name: p.name, qty: 1, unitCents: p.priceCents, vatRate: p.vatRate, stock: p.stock }]);
  };
  const addUsed = (d: UsedDevice) => {
    if (inCart("used", d.id)) return;
    const name = [deviceLabel(d.device), d.device.storage, d.device.serial ? `${r("used.serialShort")} ${d.device.serial}` : "", `A-${d.number}`].filter(Boolean).join(" · ");
    setCart((c) => [...c, { key: crypto.randomUUID(), kind: "used", refId: d.id, name, qty: 1, unitCents: d.priceCents, vatRate: 0 }]);
  };
  const changeQty = (key: string, delta: number) =>
    setCart((c) => c.map((l) => (l.key === key ? { ...l, qty: Math.max(1, l.qty + delta) } : l)));
  const setPrice = (key: string, cents: number) => setCart((c) => c.map((l) => (l.key === key ? { ...l, unitCents: cents } : l)));
  const remove = (key: string) => setCart((c) => c.filter((l) => l.key !== key));

  const totals = computeTotals(cart.map((l) => ({ ...l, margin: l.kind === "used" })), smallBusiness);
  const hasUsed = cart.some((l) => l.kind === "used");

  const sell = async () => {
    setBusy(true);
    setError("");
    try {
      const { invoice } = await api<{ invoice: SaleInvoice }>("/repairs/sales", {
        method: "POST",
        body: { lines: cart.map(({ key, stock, ...l }) => l), customer, customerId, paymentMethod: payment },
      });
      setCart([]);
      setCustomer(EMPTY_CUSTOMER);
      setCustomerId(null);
      setShowCustomer(false);
      setPrinting(invoice);
      setQuery("");
      loadRecent();
    } catch (e) {
      setError(repairError(e));
    } finally {
      setBusy(false);
    }
  };

  const reprint = async (number: string) => {
    try {
      setPrinting((await api<{ invoice: SaleInvoice }>(`/repairs/invoices/${encodeURIComponent(number)}`)).invoice);
    } catch (e) {
      setError(repairError(e));
    }
  };

  return (
    <div className="sale-layout">
      <div className="stack">
        <label className="search">
          <Search size={18} />
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={r("sale.search")} aria-label={r("sale.search")} />
        </label>
        <section className="card list-card sale-products">
          {used.length === 0 && parts.length === 0 && <p className="empty muted">{query ? r("sale.noMatch") : r("sale.emptyStock")}</p>}
          {used.map((d) => (
            <button key={d.id} className="list-row part-row" onClick={() => addUsed(d)} disabled={!!inCart("used", d.id)}>
              <span className="sale-icon used"><Smartphone size={16} /></span>
              <span className="list-main">
                <strong>{deviceLabel(d.device)}{d.device.storage ? ` · ${d.device.storage}` : ""}</strong>
                <small className="muted">A-{d.number} · {r(`used.grades.${d.grade}`)}</small>
              </span>
              <strong>{euro(d.priceCents)}</strong>
            </button>
          ))}
          {sortedParts.map((p) => (
            <button key={p.id} className="list-row part-row" onClick={() => addPart(p)}>
              <span className="sale-icon"><ShoppingCart size={16} /></span>
              <span className="list-main">
                <strong>{p.name}</strong>
                <small className={p.stock > 0 ? "muted" : "error"}>
                  {r(`stock.categories.${p.category}`)} · {p.stock > 0 ? r("order.inStock", { n: p.stock }) : r("order.outOfStock")}
                </small>
              </span>
              <strong>{euro(p.priceCents)}</strong>
            </button>
          ))}
        </section>
        <button className="button" onClick={() => setOther(true)}><Plus size={17} /> {r("sale.addOther")}</button>
      </div>

      <section className="card stack sale-cart">
        <h2 className="card-title"><ShoppingCart size={20} /> {r("sale.cart")}</h2>
        {cart.length === 0 ? (
          <p className="muted">{r("sale.cartEmpty")}</p>
        ) : (
          <div className="repair-items">
            {cart.map((l) => (
              <div key={l.key} className="sale-line">
                <div className="list-main">
                  <strong>{l.name}</strong>
                  {l.kind === "used" && <small className="muted">{r("sale.marginNote")}</small>}
                  {l.kind === "part" && l.stock !== undefined && l.qty > l.stock && <small className="error">{r("sale.notEnough", { n: l.stock })}</small>}
                </div>
                <div className="sale-line-controls">
                  {l.kind !== "used" && (
                    <span className="row gap-sm">
                      <button className="icon-button" onClick={() => changeQty(l.key, -1)} disabled={l.qty <= 1} aria-label="−"><Minus size={15} /></button>
                      <span className="sale-qty">{l.qty}</span>
                      <button className="icon-button" onClick={() => changeQty(l.key, 1)} aria-label="+"><Plus size={15} /></button>
                    </span>
                  )}
                  <span className="sale-price"><MoneyInput cents={l.unitCents} onChange={(c) => c !== null && setPrice(l.key, c)} /></span>
                  <button className="icon-button" onClick={() => remove(l.key)} aria-label={r("sale.remove")}><Trash2 size={16} /></button>
                </div>
              </div>
            ))}
          </div>
        )}

        {showCustomer ? (
          <div className="grid form-grid">
            <Field label={r("intake.name")}><input value={customer.name} onChange={(e) => (setCustomer({ ...customer, name: e.target.value }), setCustomerId(null))} autoComplete="off" /></Field>
            <Field label={r("intake.phone")}><input type="tel" value={customer.phone} onChange={(e) => setCustomer({ ...customer, phone: e.target.value })} autoComplete="off" /></Field>
            {customerId && <p className="wide success-text"><UserCheck size={15} /> {r("sale.knownCustomer")}</p>}
            {suggestions.length > 0 && (
              <div className="wide customer-suggestions">
                {suggestions.slice(0, 5).map((c) => (
                  <button type="button" key={c.id} className="chip" onClick={() => (setCustomer({ name: c.name, phone: c.phone, email: c.email, address: c.address ?? "" }), setCustomerId(c.id), setSuggestions([]))}>
                    <UserCheck size={14} /> {c.name}{c.phone ? ` · ${c.phone}` : ""}
                  </button>
                ))}
              </div>
            )}
            <Field label={r("used.address")} wide><textarea rows={2} value={customer.address} onChange={(e) => setCustomer({ ...customer, address: e.target.value })} /></Field>
            <Field label={r("intake.email")} wide><input type="email" value={customer.email} onChange={(e) => setCustomer({ ...customer, email: e.target.value })} autoComplete="off" /></Field>
          </div>
        ) : (
          <button className="text-button sale-customer" onClick={() => setShowCustomer(true)}><UserRound size={16} /> {r("sale.addCustomer")}</button>
        )}
        {hasUsed && !customer.name && <p className="notice">{r("sale.usedNeedsCustomer")}</p>}

        <div className="field">
          <span className="field-label">{r("order.paymentMethod")}</span>
          <div className="segmented three">
            {PAYMENT_METHODS.map((m) => (
              <button type="button" key={m} className={payment === m ? "active" : ""} onClick={() => setPayment(m)}>{r(`payment.${m}`)}</button>
            ))}
          </div>
        </div>
        <div className="pickup-total"><span>{r("order.total")}</span><strong>{euro(totals.grossCents)}</strong></div>
        {error && <p className="error">{error}</p>}
        <button className="button primary" disabled={busy || cart.length === 0} onClick={sell}><Printer size={18} /> {r("sale.sell")}</button>
      </section>

      {recent.length > 0 && (
        <section className="stack-sm sale-recent">
          <h2>{r("sale.recent")}</h2>
          <div className="card list-card">
            {recent.map((x) => (
              <button key={x.number} className="list-row part-row" onClick={() => reprint(x.number)}>
                <span className="list-main">
                  <strong>{x.number}</strong>
                  <small className="muted">{day(x.issuedAt)}{x.customerName ? ` · ${x.customerName}` : ""}</small>
                </span>
                <span className="part-row-meta">
                  <strong>{euro(x.totalCents)}</strong>
                  <small className="muted">{r(`payment.${x.paymentMethod}`)}</small>
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      {other && (
        <OtherLineDialog
          onClose={() => setOther(false)}
          onAdd={(l) => (setCart((c) => [...c, { ...l, key: crypto.randomUUID() }]), setOther(false))}
        />
      )}
      {printing && <SaleInvoicePrint invoice={printing} onClose={() => setPrinting(null)} />}
    </div>
  );
}

function OtherLineDialog({ onClose, onAdd }: { onClose: () => void; onAdd: (l: SaleLine) => void }) {
  const { r, lang } = useRepairI18n();
  const [name, setName] = useState("");
  const [cents, setCents] = useState(0);
  const [vat, setVat] = useState(19);
  return (
    <Dialog title={r("sale.addOther")} onClose={onClose}>
      <form className="stack" onSubmit={(e) => (e.preventDefault(), name.trim() && onAdd({ kind: "other", refId: null, name: name.trim(), qty: 1, unitCents: cents, vatRate: vat }))}>
        <Field label={r("order.itemName")}><input autoFocus value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <div className="grid form-grid">
          <Field label={r("order.unitPrice")}><MoneyInput cents={cents} onChange={(c) => c !== null && setCents(c)} /></Field>
          <Field label={r("order.vat")}>
            <select value={vat} onChange={(e) => setVat(Number(e.target.value))}>
              {vatChoices().map((v) => <option key={v} value={v}>{formatRate(v, lang)}</option>)}
            </select>
          </Field>
        </div>
        <button className="button primary" disabled={!name.trim()}>{r("sale.add")}</button>
      </form>
    </Dialog>
  );
}
