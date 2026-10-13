import { useEffect, useMemo, useState } from "react";
import { Banknote, Camera, CheckCircle2, CreditCard, Delete, Ellipsis, History, NotebookPen, PlusCircle, Printer, ScanBarcode, Search, Undo2, UserRound } from "lucide-react";
import { api } from "../api";
import { Field } from "../components";
import { formatRate, standardVat, vatChoices } from "../money";
import { cleanBarcode, computeTotals, type Payment, type PosArticle, type PosCustomer, type PosLine, type Receipt, type ReceiptRow } from "../../shared/pos";
import { usePosI18n } from "./i18n";
import { PayPanel, usePosSettings } from "./PayPanel";
import { ReceiptPrint } from "./Print";
import { ReceiptDialog } from "./Receipts";
import { deviceRegisterId } from "./registers";
import { Dialog, MoneyInput } from "./ui";
import { CameraScan, cameraScanAvailable, useScanner } from "./scanner";
import { ItemDialog } from "./Items";

/** Eine Zeile im Bon. Aufträge stehen als ein Block; ihre Positionen rechnet der Server. */
interface CartLine extends PosLine {
  key: string;
  single?: boolean;
  stock?: number;
  depositCents?: number;
  loaner?: string;
}

type PadMode = "qty" | "discount" | "price";

const EMPTY_CUSTOMER: PosCustomer = { id: null, name: "", address: "", phone: "", email: "" };
const CART_KEY = "ck-pos-cart";
const ALL = "";
const TILES = "*";

function loadCart(): CartLine[] {
  try {
    return JSON.parse(sessionStorage.getItem(CART_KEY) ?? "[]") as CartLine[];
  } catch {
    return [];
  }
}

const lineTotal = (l: { qty: number; unitCents: number }) => Math.round(l.qty * l.unitCents);
/** Zahl aus dem Ziffernblock, z. B. „1,5“ → 1.5 */
const padNumber = (text: string) => Number(text.replace(",", ".")) || 0;

/**
 * Verkaufen wie an einer Ladenkasse: Warengruppen oben, Artikel zum Antippen, rechts der Bon
 * mit Ziffernblock (Menge, Rabatt, Preis), Scanner und Artikelnummer über die Suche.
 */
export function Register({ isManager, kiosk }: { isManager: boolean; kiosk?: boolean }) {
  const { p, money, posError } = usePosI18n();
  const [settings] = usePosSettings();
  const [catalog, setCatalog] = useState<PosArticle[]>([]);
  const [group, setGroup] = useState(ALL);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PosArticle[] | null>(null);
  const [cart, setCart] = useState<CartLine[]>(loadCart);
  const [selected, setSelected] = useState<string | null>(null);
  const [mode, setMode] = useState<PadMode>("qty");
  const [buffer, setBuffer] = useState<string | null>(null);
  const [customer, setCustomer] = useState<PosCustomer>(EMPTY_CUSTOMER);
  const [note, setNote] = useState("");
  const [dialog, setDialog] = useState<"customer" | "note" | "free" | "pay" | "camera" | "recent" | null>(null);
  const [last, setLast] = useState<Receipt | null>(null);
  const [opened, setOpened] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);
  const [creating, setCreating] = useState<string | null>(null);
  const [loanerBack, setLoanerBack] = useState(false);
  const [done, setDone] = useState<{ receipt: Receipt | null } | null>(null);
  const [printing, setPrinting] = useState<"bon" | "a4" | null>(null);
  const [scanNote, setScanNote] = useState<{ code: string; unknown: boolean } | null>(null);
  const [view, setView] = useState<"products" | "order">("products");
  const [error, setError] = useState("");

  useEffect(() => {
    try {
      sessionStorage.setItem(CART_KEY, JSON.stringify(cart));
    } catch {
      // ohne Speicher geht der Bon beim Neuladen verloren
    }
  }, [cart]);

  const loadCatalog = () =>
    api<{ articles: PosArticle[] }>("/pos/catalog")
      .then((d) => (setCatalog(d.articles), d.articles))
      .catch((e) => (setError(posError(e)), [] as PosArticle[]));

  // Erster Aufruf; dabei auch die Übergabe aus einem System, z. B. „In der Kasse abrechnen“ im Reparaturauftrag
  useEffect(() => {
    const orderId = new URLSearchParams(location.search).get("auftrag");
    if (orderId) history.replaceState(null, "", location.pathname);
    loadCatalog().then((articles) => {
      if (!orderId) return;
      const article = articles.find((a) => a.kind === "order" && a.refId === orderId);
      if (article) add(article);
      else setError(p("moduleErrors.statusNotAllowed"));
    });
  }, []);

  // Suche über alle Systeme (auch Kundennamen bei Aufträgen); leer = Raster nach Warengruppe
  useEffect(() => {
    if (!query.trim()) return setResults(null);
    const timer = setTimeout(
      () => api<{ articles: PosArticle[] }>(`/pos/articles?q=${encodeURIComponent(query.trim())}`).then((d) => setResults(d.articles)).catch((e) => setError(posError(e))),
      200,
    );
    return () => clearTimeout(timer);
  }, [query]);

  const groups = useMemo(() => {
    const seen: string[] = [];
    for (const a of catalog) if (!seen.includes(a.group ?? "")) seen.push(a.group ?? "");
    return seen;
  }, [catalog]);
  const hasTiles = catalog.some((a) => a.tile);
  const groupLabel = (g: string) => (g.startsWith("@") ? p(`moduleGroups.${g.slice(1)}`) : g || p("sell.noGroup"));
  const shown = results ?? (group === ALL ? catalog : group === TILES ? catalog.filter((a) => a.tile) : catalog.filter((a) => (a.group ?? "") === group));

  const add = (a: PosArticle) => {
    setDone(null);
    setScanNote(null);
    setError("");
    setCart((c) => {
      // Gleicher Artikel erhöht die Menge; freie Beträge nur, wenn Name, Preis und Satz gleich sind
      const same = a.refId
        ? c.find((l) => l.source === a.source && l.kind === a.kind && l.refId === a.refId && !l.discountPct && l.qty > 0)
        : c.find((l) => l.source === a.source && !l.refId && l.name === a.name && l.unitCents === a.priceCents && l.vatRate === a.vatRate);
      if (same && a.single) return c;
      if (same) {
        setSelected(same.key);
        return c.map((l) => (l === same ? { ...l, qty: l.qty + 1 } : l));
      }
      const key = crypto.randomUUID();
      setSelected(key);
      return [...c, {
        key, source: a.source, kind: a.kind, refId: a.refId,
        name: a.name, qty: 1, unitCents: a.priceCents, vatRate: a.vatRate, margin: a.margin, single: a.single, stock: a.stock, depositCents: a.depositCents, loaner: a.loaner,
      }];
    });
    setMode("qty");
    setBuffer(null);
  };
  const change = (key: string, patch: Partial<CartLine>) => setCart((c) => c.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const remove = (key: string) => {
    setCart((c) => {
      const rest = c.filter((l) => l.key !== key);
      setSelected(rest.at(-1)?.key ?? null);
      return rest;
    });
    setBuffer(null);
  };

  /** Barcode vom Scanner, von der Kamera oder Enter in der Suche (auch Artikelnummer). Gibt zurück, ob etwas gefunden wurde. */
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
        setResults(hits);
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
    // Kein Code: Enter nimmt den einzigen Treffer der Suche
    if (/\d/.test(q) && !q.includes(" ")) return;
    setScanNote(null);
    const only = (results ?? []).filter((a) => !inCart(a));
    if (only.length === 1) {
      add(only[0]!);
      setQuery("");
    }
  };

  const busy = dialog !== null || creating !== null || printing !== null || opened !== null;
  useScanner((code) => void scan(code), !busy);

  // ---------- Ziffernblock ----------

  const line = cart.find((l) => l.key === selected) ?? null;
  const fixed = (l: CartLine) => l.kind === "order";
  const canQty = (l: CartLine) => !fixed(l) && !l.single;
  const canSign = (l: CartLine) => l.source === "pos";

  const apply = (l: CartLine, m: PadMode, text: string) => {
    const n = padNumber(text);
    if (m === "qty") return change(l.key, { qty: (l.qty < 0 ? -1 : 1) * Math.min(Math.abs(n), 10_000) });
    if (m === "price") return change(l.key, { unitCents: Math.round(n * 100) * (l.unitCents < 0 ? -1 : 1), discountPct: undefined, listCents: undefined });
    const pct = Math.min(Math.max(Math.round(n), 0), 100);
    const list = l.listCents ?? l.unitCents;
    change(l.key, pct ? { discountPct: pct, listCents: list, unitCents: Math.round((list * (100 - pct)) / 100) } : { discountPct: undefined, listCents: undefined, unitCents: list });
  };

  const press = (key: string) => {
    if (!line || fixed(line)) return;
    if (mode === "qty" && !canQty(line)) return;
    if (key === "sign") {
      if (!canSign(line)) return;
      if (mode === "price") change(line.key, { unitCents: -line.unitCents });
      else change(line.key, { qty: -line.qty });
      return;
    }
    if (key === "back") {
      const text = (buffer ?? "").slice(0, -1);
      // Leere Menge löscht die Zeile, wie an jeder Ladenkasse
      if (mode === "qty" && !buffer) return remove(line.key);
      setBuffer(text);
      apply(line, mode, text);
      return;
    }
    if (key === "," && (buffer ?? "").includes(",")) return;
    const text = ((buffer ?? "") + key).slice(0, 9);
    setBuffer(text);
    apply(line, mode, text);
  };
  const pickMode = (m: PadMode) => (setMode(m), setBuffer(null));

  const select = (key: string) => {
    setSelected(key);
    setMode("qty");
    setBuffer(null);
  };

  // ---------- Summen und Bezahlen ----------

  const payable = cart.filter((l) => l.qty !== 0);
  const totals = useMemo(() => computeTotals(payable, settings?.smallBusiness ?? false), [cart, settings]);
  const taxes = totals.vat.reduce((s, v) => s + v.vatCents, 0);
  const deposit = cart.reduce((s, l) => s + (l.depositCents ?? 0), 0);
  const due = totals.grossCents - deposit;
  const loaner = cart.find((l) => l.loaner)?.loaner;
  const count = cart.reduce((s, l) => s + (canQty(l) ? Math.abs(l.qty) : 1), 0);

  const pay = async (payments: Payment[]) => {
    const { receipt } = await api<{ receipt: Receipt | null }>("/pos/checkout", {
      method: "POST",
      body: {
        lines: payable.map(({ key, single, stock, depositCents, loaner: _, ...l }) => l),
        payments,
        customer: customer.name || customer.address || customer.phone || customer.email ? customer : null,
        note,
        options: { loanerReturned: loanerBack },
      },
    });
    setDialog(null);
    setCart([]);
    setSelected(null);
    setCustomer(EMPTY_CUSTOMER);
    setNote("");
    setLoanerBack(false);
    setQuery("");
    setDone({ receipt });
    if (receipt) setLast(receipt);
    setView("order");
    loadCatalog();
    if (receipt && settings?.print !== "ask") setPrinting(settings?.print ?? null);
  };

  /** Ein Tipp: genau passend bar oder mit Karte (nach „Zahlung erfolgt“ am Terminal). */
  const quickPay = async (method: "cash" | "card") => {
    if (loaner && !loanerBack) return setDialog("pay");
    setPaying(true);
    setError("");
    try {
      await pay(due === 0 ? [] : [{ method, cents: due }]);
    } catch (e) {
      setError(posError(e));
      setView("order");
    } finally {
      setPaying(false);
    }
  };
  const cardOn = settings?.methods.includes("card") ?? false;

  /** Storno: offenen Bon leeren, sonst den gerade gebuchten Beleg öffnen (dort mit Gegenbeleg stornieren). */
  const storno = () => {
    if (cart.length) {
      if (confirm(p("sell.voidConfirm"))) (setCart([]), setSelected(null), setNote(""), setCustomer(EMPTY_CUSTOMER));
    } else if (last) setOpened(last.number);
  };

  const inCart = (a: PosArticle) => !!a.single && cart.some((l) => l.kind === a.kind && l.refId === a.refId);

  const PAD: { key: string; label: string; mode?: PadMode; className?: string }[] = [
    { key: "1", label: "1" }, { key: "2", label: "2" }, { key: "3", label: "3" }, { key: "qty", label: p("sell.padQty"), mode: "qty" },
    { key: "4", label: "4" }, { key: "5", label: "5" }, { key: "6", label: "6" }, { key: "discount", label: "%", mode: "discount" },
    { key: "7", label: "7" }, { key: "8", label: "8" }, { key: "9", label: "9" }, { key: "price", label: p("sell.padPrice"), mode: "price" },
    { key: "sign", label: "+/−", className: "sign" }, { key: "0", label: "0" }, { key: ",", label: ",", className: "comma" }, { key: "back", label: "", className: "back" },
  ];

  return (
    <div className={`pos-register ${kiosk ? "pos-big" : ""} show-${view}`}>
      <section className="pos-products" aria-label={p("sell.products")}>
        <div className="pos-toolbar">
          <label className="search">
            <Search size={18} />
            <input type="search" value={query} onChange={(e) => (setQuery(e.target.value), setScanNote(null))} placeholder={p("sell.search")} aria-label={p("sell.search")}
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), onSearchEnter())} />
          </label>
          {cameraScanAvailable && <button className="button icon-only" onClick={() => setDialog("camera")} aria-label={p("scan.camera")} title={p("scan.camera")}><Camera size={18} /></button>}
          <button className="button icon-only" onClick={() => setDialog("free")} aria-label={p("sell.free")} title={p("sell.free")}><PlusCircle size={18} /></button>
        </div>
        {!query && (groups.length > 1 || hasTiles) && (
          <div className="pos-groups" role="tablist" aria-label={p("sell.groupsLabel")}>
            {[ALL, ...(hasTiles ? [TILES] : []), ...groups].map((g) => (
              <button key={g || "all"} role="tab" aria-selected={group === g} className={group === g ? "active" : ""} onClick={() => setGroup(g)}>
                {g === ALL ? p("sell.all") : g === TILES ? p("sell.groups.tile") : groupLabel(g)}
              </button>
            ))}
          </div>
        )}
        {kiosk && !scanNote && <p className="muted small pos-scan-ready"><ScanBarcode size={16} aria-hidden /> {p("scan.ready")}</p>}
        {scanNote && (
          <div className={scanNote.unknown ? "notice pos-scan-note warn" : "notice pos-scan-note"}>
            <ScanBarcode size={18} aria-hidden />
            <span>{scanNote.unknown ? p("scan.unknown", { code: scanNote.code }) : p("scan.several", { code: scanNote.code })}</span>
            {scanNote.unknown && isManager && <button className="button small-button" onClick={() => setCreating(scanNote.code)}>{p("scan.create")}</button>}
          </div>
        )}
        {error && <p className="error">{error}</p>}
        {shown.length === 0 && <p className="card empty muted">{query ? p("sell.noMatch") : p("sell.nothingYet")}</p>}
        <div className="pos-grid">
          {shown.map((a) => (
            <button key={`${a.source}-${a.kind}-${a.refId ?? a.name}`} className={`pos-product ${a.kind}`} onClick={() => add(a)} disabled={inCart(a)}>
              <strong className="pos-product-name">{a.kind === "order" ? p("sell.orderLine", { label: a.name }) : a.name}</strong>
              <small className={a.stock !== undefined && a.stock <= 0 ? "error" : "muted"}>
                {[a.kind === "order" ? a.detail : a.code ? `${p("sell.nr")} ${a.code}` : "", a.stock !== undefined ? p("sell.stock", { n: a.stock }) : "", a.loaner ? p("sell.loaner", { name: a.loaner }) : ""].filter(Boolean).join(" · ")}
              </small>
              <span className="pos-product-price">{money(a.priceCents)}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="pos-order" aria-label={p("sell.order")}>
        <div className="pos-order-lines">
          {done && (
            <div className="pos-done">
              <CheckCircle2 size={34} aria-hidden />
              <strong>{done.receipt ? `${p("pay.done")} · ${done.receipt.number}` : p("pay.nothingToPay")}</strong>
              {done.receipt && <span className="pos-done-change">{done.receipt.changeCents ? p("pay.changeBig", { amount: money(done.receipt.changeCents) }) : p("pay.noChange")}</span>}
              {done.receipt && (
                <span className="row gap-sm wrap">
                  <button className="button small-button" onClick={() => setPrinting("bon")}><Printer size={15} /> {p("pay.printBon")}</button>
                  <button className="button small-button" onClick={() => setPrinting("a4")}>{p("pay.printA4")}</button>
                </span>
              )}
              <button className="button primary" onClick={() => (setDone(null), setView("products"))}>{p("pay.newSale")}</button>
            </div>
          )}
          {!done && cart.length === 0 && <p className="muted pos-order-empty">{p("sell.cartEmpty")}</p>}
          {cart.map((l) => (
            <button key={l.key} className={`pos-order-line ${l.key === selected ? "selected" : ""} ${l.qty < 0 ? "return" : ""}`} onClick={() => select(l.key)}>
              <span className="pos-order-qty">{canQty(l) ? l.qty.toLocaleString() : 1}</span>
              <span className="pos-order-name">
                {l.kind === "order" ? p("sell.orderLine", { label: l.name }) : l.name}
                <small>
                  {[
                    canQty(l) && l.qty !== 1 ? p("sell.each", { price: money(l.unitCents) }) : "",
                    l.discountPct ? p("sell.discount", { n: l.discountPct }) : "",
                    l.margin ? "§ 25a" : "",
                    l.depositCents ? p("sell.deposit", { amount: money(l.depositCents) }) : "",
                  ].filter(Boolean).join(" · ")}
                </small>
              </span>
              <strong className="pos-order-sum">{money(lineTotal(l))}</strong>
            </button>
          ))}
        </div>

        <div className="pos-order-totals">
          {!settings?.smallBusiness && <p className="muted"><span>{p("sell.taxes")}</span><span>{money(taxes)}</span></p>}
          {deposit > 0 && <p className="muted"><span>{p("sell.depositPaid")}</span><span>− {money(deposit)}</span></p>}
          <p className="grand"><span>{due < 0 ? p("sell.toRefund") : p("sell.total")}</span><strong>{money(Math.abs(due))}</strong></p>
        </div>

        <div className="pos-order-actions">
          <button className={`button ${customer.name ? "set" : ""}`} onClick={() => setDialog("customer")} title={customer.name || p("sell.customer")}><UserRound size={17} /> <span>{customer.name || p("sell.customer")}</span></button>
          <button className={`button ${note ? "set" : ""}`} onClick={() => setDialog("note")} title={p("sell.noteTitle")}><NotebookPen size={17} /> <span>{p("sell.note")}</span></button>
          <button className="button" onClick={storno} disabled={!cart.length && !last} title={cart.length ? p("sell.voidCart") : p("sell.voidLast")}><Undo2 size={17} /> <span>{p("sell.void")}</span></button>
          <button className="button" onClick={() => last && setPrinting("bon")} disabled={!last} title={p("sell.printLast")}><Printer size={17} /> <span>{p("sell.bon")}</span></button>
          <button className="button" onClick={() => setDialog("recent")} title={p("sell.recentTitle")}><History size={17} /> <span>{p("sell.recent")}</span></button>
        </div>

        <div className="pos-pad">
          {PAD.map((b) => (
            <button key={b.key} className={`${b.className ?? ""} ${b.mode ? "mode" : ""} ${b.mode && mode === b.mode ? "active" : ""}`}
              disabled={!line || fixed(line) || (b.mode === "qty" && !canQty(line)) || (b.key === "sign" && !canSign(line))}
              onClick={() => (b.mode ? pickMode(b.mode) : press(b.key))} aria-label={b.key === "back" ? p("sell.remove") : b.label}>
              {b.key === "back" ? <Delete size={20} /> : b.label}
            </button>
          ))}
        </div>

        <div className="pos-pay-row">
          <button className="button pos-pay pay-cash" disabled={payable.length === 0 || paying} onClick={() => quickPay("cash")}>
            <Banknote size={22} aria-hidden /> <span>{p("methods.cash")}{payable.length > 0 ? <small>{money(Math.abs(due))}</small> : null}</span>
          </button>
          {cardOn && (
            <button className="button pos-pay pay-card" disabled={payable.length === 0 || paying} onClick={() => quickPay("card")}>
              <CreditCard size={22} aria-hidden /> <span>{p("methods.card")}{payable.length > 0 ? <small>{money(Math.abs(due))}</small> : null}</span>
            </button>
          )}
          <button className="button pos-pay pay-more" disabled={payable.length === 0 || paying} onClick={() => setDialog("pay")} aria-label={p("sell.payMore")} title={p("sell.payMore")}>
            <Ellipsis size={22} />
          </button>
        </div>
      </section>

      <nav className="pos-switch" aria-label={p("sell.order")}>
        <button className={view === "products" ? "active" : ""} onClick={() => setView("products")}>{p("sell.products")}</button>
        <button className={view === "order" ? "active" : ""} onClick={() => setView("order")}>{p("sell.order")}{count ? ` (${count.toLocaleString()}) · ${money(Math.abs(due))}` : ""}</button>
      </nav>

      {dialog === "free" && <FreeLineDialog onClose={() => setDialog(null)} onAdd={(l) => (add({ source: "pos", kind: "item", refId: null, name: l.name, detail: "", priceCents: l.unitCents, vatRate: l.vatRate }), setDialog(null))} />}
      {dialog === "customer" && <CustomerDialog customer={customer} onClose={() => setDialog(null)} onSave={(c) => (setCustomer(c), setDialog(null))} hint={totals.grossCents >= 25000 && !cart.some((l) => l.kind === "order")} />}
      {dialog === "note" && <NoteDialog note={note} onClose={() => setDialog(null)} onSave={(n) => (setNote(n), setDialog(null))} />}
      {dialog === "camera" && <CameraScan onClose={() => setDialog(null)} onCode={(code) => (setDialog(null), void scan(code))} />}
      {creating !== null && (
        <ItemDialog item={null} barcode={creating} onClose={() => setCreating(null)}
          onSaved={(item) => (setCreating(null), setScanNote(null), loadCatalog(), item.barcode ? void scan(item.barcode) : undefined)} />
      )}
      {dialog === "pay" && (
        <Dialog title={p("pay.title")} onClose={() => setDialog(null)}>
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
      {printing && (done?.receipt ?? last) && <ReceiptPrint receipt={(done?.receipt ?? last)!} format={printing} onClose={() => setPrinting(null)} />}
      {dialog === "recent" && <RecentDialog onClose={() => setDialog(null)} onOpen={(n) => (setDialog(null), setOpened(n))} />}
      {opened && <ReceiptDialog number={opened} isManager={isManager} onClose={() => setOpened(null)} onChanged={() => (loadCatalog(), setDone(null))} onOpen={setOpened} />}
    </div>
  );
}

function CustomerDialog({ customer, hint, onClose, onSave }: { customer: PosCustomer; hint: boolean; onClose: () => void; onSave: (c: PosCustomer) => void }) {
  const { p } = usePosI18n();
  const [form, setForm] = useState(customer);
  return (
    <Dialog title={p("sell.customerAdd")} onClose={onClose}>
      <form className="stack" onSubmit={(e) => (e.preventDefault(), onSave(form))}>
        <div className="grid two">
          <Field label={p("sell.name")}><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus /></Field>
          <Field label={p("sell.phone")}><input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
        </div>
        <Field label={p("sell.address")}><textarea rows={2} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></Field>
        <Field label={p("sell.email")}><input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
        {hint && !form.address && <p className="muted small">{p("sell.customerHint")}</p>}
        <div className="row gap">
          <button className="button primary">{p("sell.apply")}</button>
          {customer.name && <button type="button" className="button" onClick={() => onSave(EMPTY_CUSTOMER)}>{p("sell.remove")}</button>}
        </div>
      </form>
    </Dialog>
  );
}

function NoteDialog({ note, onClose, onSave }: { note: string; onClose: () => void; onSave: (n: string) => void }) {
  const { p } = usePosI18n();
  const [text, setText] = useState(note);
  return (
    <Dialog title={p("sell.noteTitle")} onClose={onClose}>
      <form className="stack" onSubmit={(e) => (e.preventDefault(), onSave(text.trim()))}>
        <textarea rows={3} maxLength={300} value={text} placeholder={p("sell.notePlaceholder")} onChange={(e) => setText(e.target.value)} autoFocus />
        <button className="button primary">{p("sell.apply")}</button>
      </form>
    </Dialog>
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

/** Letzte Belege dieses Kassenplatzes von heute, z. B. wenn ein Kunde seinen Kassenzettel vergessen hat. */
function RecentDialog({ onClose, onOpen }: { onClose: () => void; onOpen: (number: string) => void }) {
  const { p, money, time, posError } = usePosI18n();
  const [rows, setRows] = useState<ReceiptRow[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    // Der Server zählt Tage nach deutscher Ortszeit
    const day = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Berlin" });
    api<{ receipts: ReceiptRow[] }>(`/pos/receipts?day=${day}&register=${encodeURIComponent(deviceRegisterId())}`)
      .then((d) => setRows(d.receipts.slice(0, 30)))
      .catch((e) => setError(posError(e)));
  }, []);
  return (
    <Dialog title={p("sell.recentTitle")} onClose={onClose}>
      <div className="stack-sm">
        <p className="muted small">{p("sell.recentHint")}</p>
        {error && <p className="error">{error}</p>}
        {rows && rows.length === 0 && <p className="muted">{p("receipts.empty")}</p>}
        <div className="list-card pos-recent">
          {rows?.map((r) => (
            <button key={r.number} className="list-row pos-article" onClick={() => onOpen(r.number)}>
              <span className="list-main">
                <strong>{r.number}{r.canceledBy && <span className="pos-badge cancel">{p("receipts.canceled")}</span>}</strong>
                <small className="muted">{[time(r.issuedAt), r.label].filter(Boolean).join(" · ")}</small>
              </span>
              <span className="pos-row-meta">
                <strong className={r.dueCents < 0 ? "error" : ""}>{money(r.dueCents)}</strong>
                <small className="muted">{r.payments.map((x) => p(`methods.${x.method}`)).join(" + ")}</small>
              </span>
            </button>
          ))}
        </div>
      </div>
    </Dialog>
  );
}
