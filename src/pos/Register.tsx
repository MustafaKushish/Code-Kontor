import { useEffect, useMemo, useState } from "react";
import { Barcode, Camera, CheckCircle2, Minus, Package, PackageCheck, Plus, Printer, ScanBarcode, Search, ShoppingCart, Smartphone, Trash2, UserRound } from "lucide-react";
import { api } from "../api";
import { Field } from "../components";
import { formatRate, standardVat, vatChoices } from "../money";
import { cleanBarcode, computeTotals, type PosArticle, type PosCustomer, type PosLine, type Receipt } from "../../shared/pos";
import { usePosI18n } from "./i18n";
import { PayPanel, usePosSettings } from "./PayPanel";
import { ReceiptPrint } from "./Print";
import { Dialog, MoneyInput } from "./ui";
import { CameraScan, cameraScanAvailable, useScanner } from "./scanner";
import { ItemDialog } from "./Items";

/** Eine Zeile im Warenkorb. Aufträge stehen als ein Block; ihre Positionen rechnet der Server. */
interface CartLine extends PosLine {
  key: string;
  single?: boolean;
  stock?: number;
  depositCents?: number;
  loaner?: string;
}

const EMPTY_CUSTOMER: PosCustomer = { id: null, name: "", address: "", phone: "", email: "" };
const CART_KEY = "ck-pos-cart";

function loadCart(): CartLine[] {
  try {
    return JSON.parse(sessionStorage.getItem(CART_KEY) ?? "[]") as CartLine[];
  } catch {
    return [];
  }
}

const ICONS: Record<string, typeof Package> = { item: Barcode, order: PackageCheck, used: Smartphone, part: Package };

/** Verkaufen: scannen, suchen oder antippen, Warenkorb, bezahlen, Beleg drucken. */
export function Register({ isManager, kiosk }: { isManager: boolean; kiosk?: boolean }) {
  const { p, money, posError } = usePosI18n();
  const [settings] = usePosSettings();
  const [query, setQuery] = useState("");
  const [articles, setArticles] = useState<PosArticle[]>([]);
  const [cart, setCart] = useState<CartLine[]>(loadCart);
  const [customer, setCustomer] = useState<PosCustomer>(EMPTY_CUSTOMER);
  const [showCustomer, setShowCustomer] = useState(false);
  const [free, setFree] = useState(false);
  const [paying, setPaying] = useState(false);
  const [loanerBack, setLoanerBack] = useState(false);
  const [done, setDone] = useState<{ receipt: Receipt | null } | null>(null);
  const [printing, setPrinting] = useState<"bon" | "a4" | null>(null);
  const [error, setError] = useState("");
  const [scanNote, setScanNote] = useState<{ code: string; unknown: boolean } | null>(null);
  const [creating, setCreating] = useState<string | null>(null);
  const [camera, setCamera] = useState(false);

  useEffect(() => {
    try {
      sessionStorage.setItem(CART_KEY, JSON.stringify(cart));
    } catch {
      // ohne Speicher geht der Warenkorb beim Neuladen verloren
    }
  }, [cart]);

  const search = (q: string) =>
    api<{ articles: PosArticle[] }>(`/pos/articles?q=${encodeURIComponent(q)}`)
      .then((d) => setArticles(d.articles))
      .catch((e) => setError(posError(e)));

  useEffect(() => {
    const timer = setTimeout(() => search(query), query ? 200 : 0);
    return () => clearTimeout(timer);
  }, [query]);

  // Übergabe aus einem System, z. B. „In der Kasse abrechnen“ im Reparaturauftrag
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const orderId = params.get("auftrag");
    if (!orderId) return;
    history.replaceState(null, "", location.pathname);
    api<{ articles: PosArticle[] }>("/pos/articles?q=")
      .then((d) => {
        const article = d.articles.find((a) => a.kind === "order" && a.refId === orderId);
        if (article) add(article);
        else setError(p("moduleErrors.statusNotAllowed"));
      })
      .catch((e) => setError(posError(e)));
  }, []);

  const add = (a: PosArticle) => {
    setDone(null);
    setScanNote(null);
    setCart((c) => {
      // Gleicher Artikel erhöht die Menge; freie Beträge nur, wenn Name, Preis und Satz gleich sind
      const same = a.refId
        ? c.find((l) => l.source === a.source && l.kind === a.kind && l.refId === a.refId)
        : c.find((l) => l.source === a.source && !l.refId && l.name === a.name && l.unitCents === a.priceCents && l.vatRate === a.vatRate);
      if (same && a.single) return c;
      if (same) return c.map((l) => (l === same ? { ...l, qty: l.qty + 1 } : l));
      return [...c, {
        key: crypto.randomUUID(), source: a.source, kind: a.kind, refId: a.refId,
        name: a.name, qty: 1, unitCents: a.priceCents, vatRate: a.vatRate, margin: a.margin, single: a.single, stock: a.stock, depositCents: a.depositCents, loaner: a.loaner,
      }];
    });
  };

  /** Barcode vom Scanner, von der Kamera oder Enter in der Suche. Gibt zurück, ob etwas gefunden wurde. */
  const scan = async (raw: string) => {
    const code = cleanBarcode(raw);
    if (!code) return false;
    setError("");
    try {
      const { articles: hits } = await api<{ articles: PosArticle[] }>(`/pos/scan?code=${encodeURIComponent(code)}`);
      if (hits.length === 1) {
        add(hits[0]!);
        setQuery("");
        return true;
      }
      if (hits.length > 1) {
        setArticles(hits);
        setScanNote({ code, unknown: false });
        return true;
      }
      setScanNote({ code, unknown: true });
    } catch (e) {
      setError(posError(e));
    }
    return false;
  };

  const onSearchEnter = async () => {
    const q = query.trim();
    if (!q) return;
    if (!q.includes(" ") && (await scan(q))) return;
    // Kein Barcode: Enter nimmt den einzigen Treffer der Suche
    if (/\d/.test(q) && !q.includes(" ")) return;
    setScanNote(null);
    const only = articles.filter((a) => !(a.single && cart.some((l) => l.kind === a.kind && l.refId === a.refId)));
    if (only.length === 1) {
      add(only[0]!);
      setQuery("");
    }
  };

  useScanner((code) => void scan(code), !paying && !free && !creating && !camera && !printing);
  const change = (key: string, patch: Partial<CartLine>) => setCart((c) => c.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const remove = (key: string) => setCart((c) => c.filter((l) => l.key !== key));

  const totals = useMemo(() => computeTotals(cart, settings?.smallBusiness ?? false), [cart, settings]);
  const deposit = cart.reduce((s, l) => s + (l.depositCents ?? 0), 0);
  const due = totals.grossCents - deposit;
  const loaner = cart.find((l) => l.loaner)?.loaner;

  const pay = async (payments: { method: string; cents: number }[]) => {
    const { receipt } = await api<{ receipt: Receipt | null }>("/pos/checkout", {
      method: "POST",
      body: {
        lines: cart.map(({ key, single, stock, depositCents, loaner: _, ...l }) => l),
        payments,
        customer: showCustomer ? customer : null,
        options: { loanerReturned: loanerBack },
      },
    });
    setPaying(false);
    setCart([]);
    setCustomer(EMPTY_CUSTOMER);
    setShowCustomer(false);
    setLoanerBack(false);
    setQuery("");
    setDone({ receipt });
    setScanNote(null);
    search("");
    if (receipt && settings?.print !== "ask") setPrinting(settings?.print ?? null);
  };

  const tiles = articles.filter((a) => a.tile);
  const groups = (["item", "order", "used", "part"] as const)
    .map((kind) => ({ kind, items: articles.filter((a) => a.kind === kind && !a.tile) }))
    .filter((g) => g.items.length);
  const inCart = (a: PosArticle) => !!a.single && cart.some((l) => l.kind === a.kind && l.refId === a.refId);

  return (
    <div className={kiosk ? "pos-layout pos-big" : "pos-layout"}>
      <div className="stack">
        <div className="row gap pos-toolbar">
          <label className="search">
            <Search size={18} />
            <input type="search" value={query} onChange={(e) => (setQuery(e.target.value), setScanNote(null))} placeholder={p("sell.search")} aria-label={p("sell.search")}
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), onSearchEnter())} />
          </label>
          {cameraScanAvailable && <button className="button" onClick={() => setCamera(true)} aria-label={p("scan.camera")} title={p("scan.camera")}><Camera size={18} /></button>}
          <button className="button" onClick={() => setFree(true)}><Plus size={18} /> {p("sell.free")}</button>
        </div>
        {kiosk && !scanNote && <p className="muted small pos-scan-ready"><ScanBarcode size={16} aria-hidden /> {p("scan.ready")}</p>}
        {scanNote && (
          <div className={scanNote.unknown ? "notice pos-scan-note warn" : "notice pos-scan-note"}>
            <ScanBarcode size={18} aria-hidden />
            <span>{scanNote.unknown ? p("scan.unknown", { code: scanNote.code }) : p("scan.several", { code: scanNote.code })}</span>
            {scanNote.unknown && isManager && <button className="button small-button" onClick={() => setCreating(scanNote.code)}><Plus size={15} /> {p("scan.create")}</button>}
          </div>
        )}
        {error && <p className="error">{error}</p>}
        {tiles.length === 0 && groups.length === 0 && <p className="card empty muted">{query ? p("sell.noMatch") : p("sell.nothingYet")}</p>}
        {tiles.length > 0 && (
          <section className="stack-sm">
            <h3 className="pos-group-title">{p("sell.groups.tile")}</h3>
            <div className="pos-tiles">
              {tiles.map((a) => (
                <button key={`${a.source}-${a.kind}-${a.refId}`} className="pos-tile" onClick={() => add(a)} disabled={inCart(a)}>
                  <span className="list-main"><strong>{a.name}</strong></span>
                  <strong className="pos-price">{money(a.priceCents)}</strong>
                </button>
              ))}
            </div>
          </section>
        )}
        {groups.map(({ kind, items }) => {
          const Icon = ICONS[kind]!;
          return (
            <section key={kind} className="stack-sm">
              <h3 className="pos-group-title">{p(`sell.groups.${kind}`)}</h3>
              <div className="card list-card pos-articles">
                {items.map((a) => (
                  <button key={`${a.source}-${a.kind}-${a.refId}`} className="list-row pos-article" onClick={() => add(a)} disabled={inCart(a)}>
                    <span className={`pos-icon ${kind}`}><Icon size={16} /></span>
                    <span className="list-main">
                      <strong>{a.name}</strong>
                      <small className={a.stock !== undefined && a.stock <= 0 ? "error" : "muted"}>
                        {[a.detail, a.stock !== undefined ? p("sell.stock", { n: a.stock }) : "", a.depositCents ? p("sell.deposit", { amount: money(a.depositCents) }) : "", a.loaner ? p("sell.loaner", { name: a.loaner }) : ""].filter(Boolean).join(" · ")}
                      </small>
                    </span>
                    <strong className="pos-price">{money(a.priceCents)}</strong>
                  </button>
                ))}
              </div>
            </section>
          );
        })}
      </div>

      <section className="card stack pos-cart" aria-label={p("sell.cart")}>
        <div className="section-head">
          <h2><ShoppingCart size={18} aria-hidden /> {p("sell.cart")}</h2>
          {cart.length > 0 && <button className="text-button" onClick={() => setCart([])}>{p("sell.clear")}</button>}
        </div>
        {done && (
          <div className="notice success pos-done">
            <CheckCircle2 size={18} />
            <span className="list-main">
              <strong>{done.receipt ? `${p("pay.done")} · ${done.receipt.number}` : p("pay.nothingToPay")}</strong>
              {done.receipt && <small>{done.receipt.changeCents ? p("pay.changeBig", { amount: money(done.receipt.changeCents) }) : p("pay.noChange")}</small>}
            </span>
            {done.receipt && (
              <span className="row gap-sm">
                <button className="button small-button" onClick={() => setPrinting("bon")}><Printer size={15} /> {p("pay.printBon")}</button>
                <button className="button small-button" onClick={() => setPrinting("a4")}>{p("pay.printA4")}</button>
              </span>
            )}
          </div>
        )}
        {cart.length === 0 && !done && <p className="muted">{p("sell.cartEmpty")}</p>}
        {cart.map((l) => (
          <div key={l.key} className="pos-line">
            <div className="row gap">
              <span className="list-main">
                <strong>{l.kind === "order" ? p("sell.orderLine", { label: l.name }) : l.name}</strong>
                {l.margin && <small className="muted">§ 25a</small>}
                {l.depositCents ? <small className="muted">{p("sell.deposit", { amount: money(l.depositCents) })}</small> : null}
              </span>
              <button className="icon-button" onClick={() => remove(l.key)} aria-label={p("sell.remove")}><Trash2 size={16} /></button>
            </div>
            {l.kind === "order" ? (
              <p className="pos-line-sum">{money(l.unitCents)}</p>
            ) : (
              <div className="pos-line-controls">
                {!l.single && (
                  <>
                    <button className="icon-button" onClick={() => change(l.key, { qty: Math.max(1, l.qty - 1) })} aria-label="−"><Minus size={16} /></button>
                    <span className="pos-qty">{l.qty}</span>
                    <button className="icon-button" onClick={() => change(l.key, { qty: l.qty + 1 })} aria-label="+"><Plus size={16} /></button>
                  </>
                )}
                <span className="pos-line-price"><MoneyInput cents={l.unitCents} onChange={(c) => c !== null && change(l.key, { unitCents: c })} /></span>
              </div>
            )}
          </div>
        ))}

        {cart.length > 0 && (
          <>
            {showCustomer ? (
              <div className="stack-sm pos-customer">
                <div className="grid two">
                  <Field label={p("sell.name")}><input value={customer.name} onChange={(e) => setCustomer({ ...customer, name: e.target.value })} /></Field>
                  <Field label={p("sell.phone")}><input value={customer.phone} onChange={(e) => setCustomer({ ...customer, phone: e.target.value })} /></Field>
                </div>
                <Field label={p("sell.address")}><textarea rows={2} value={customer.address} onChange={(e) => setCustomer({ ...customer, address: e.target.value })} /></Field>
                <Field label={p("sell.email")}><input type="email" value={customer.email} onChange={(e) => setCustomer({ ...customer, email: e.target.value })} /></Field>
              </div>
            ) : (
              <button className="text-button pos-customer-toggle" onClick={() => setShowCustomer(true)}><UserRound size={16} /> {p("sell.customerAdd")}</button>
            )}
            {totals.grossCents >= 25000 && !customer.address && !cart.some((l) => l.kind === "order") && <p className="muted small">{p("sell.customerHint")}</p>}
            <div className="repair-totals">
              {!settings?.smallBusiness && totals.vat.filter((v) => v.rate > 0).map((v) => (
                <p key={v.rate}><span className="muted">{p("sell.vat", { rate: v.rate })}</span><span>{money(v.vatCents)}</span></p>
              ))}
              <p><span>{p("sell.sum")}</span><strong>{money(totals.grossCents)}</strong></p>
              {deposit > 0 && <p><span className="muted">{p("sell.depositPaid")}</span><span>− {money(deposit)}</span></p>}
              <p className="grand"><span>{due < 0 ? p("sell.toRefund") : p("sell.toPay")}</span><strong>{money(Math.abs(due))}</strong></p>
            </div>
            <button className="button primary pos-pay" onClick={() => setPaying(true)}>{p("sell.pay")} · {money(Math.abs(due))}</button>
          </>
        )}
      </section>

      {free && <FreeLineDialog onClose={() => setFree(false)} onAdd={(l) => (add({ source: "pos", kind: "item", refId: null, name: l.name, detail: "", priceCents: l.unitCents, vatRate: l.vatRate }), setFree(false))} />}
      {camera && <CameraScan onClose={() => setCamera(false)} onCode={(code) => (setCamera(false), void scan(code))} />}
      {creating !== null && (
        <ItemDialog item={null} barcode={creating} onClose={() => setCreating(null)}
          onSaved={(item) => (setCreating(null), setScanNote(null), search(query), item.barcode ? void scan(item.barcode) : undefined)} />
      )}
      {paying && (
        <Dialog title={p("pay.title")} onClose={() => setPaying(false)}>
          <PayPanel
            dueCents={due}
            onPay={pay}
            blocked={!!loaner && !loanerBack}
            extra={loaner && (
              <label className="check notice">
                <input type="checkbox" checked={loanerBack} onChange={(e) => setLoanerBack(e.target.checked)} />
                <span>{p("pay.loanerBack", { name: loaner })}</span>
              </label>
            )}
          />
        </Dialog>
      )}
      {printing && done?.receipt && <ReceiptPrint receipt={done.receipt} format={printing} onClose={() => setPrinting(null)} />}
    </div>
  );
}

function FreeLineDialog({ onClose, onAdd }: { onClose: () => void; onAdd: (l: { name: string; unitCents: number; vatRate: number }) => void }) {
  const { p, lang } = usePosI18n();
  const [name, setName] = useState("");
  const [cents, setCents] = useState<number | null>(0);
  const [vatRate, setVatRate] = useState(standardVat());
  return (
    <Dialog title={p("sell.free")} onClose={onClose}>
      <form className="stack" onSubmit={(e) => (e.preventDefault(), name.trim() && cents && onAdd({ name: name.trim(), unitCents: cents, vatRate }))}>
        <Field label={p("sell.lineName")}><input value={name} onChange={(e) => setName(e.target.value)} autoFocus /></Field>
        <div className="grid two">
          <Field label={p("sell.lineAmount")}><MoneyInput cents={cents ?? 0} onChange={setCents} /></Field>
          <Field label={p("sell.lineVat")}>
            <select value={vatRate} onChange={(e) => setVatRate(Number(e.target.value))}>
              {vatChoices(vatRate).map((v) => <option key={v} value={v}>{formatRate(v, lang)}</option>)}
            </select>
          </Field>
        </div>
        <button className="button primary" disabled={!name.trim() || !cents}>{p("sell.add")}</button>
      </form>
    </Dialog>
  );
}
