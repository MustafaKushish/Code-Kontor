import { formatRate, standardVat, vatChoices } from "../../money";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft, BadgeCheck, Check, ClipboardCheck, Copy, Eye, FileText, History, KeyRound, Link2, ListChecks, Mail, Package, Pencil, Phone, Plus, Printer,
  MessageCircle, Receipt, Repeat, ShieldCheck, Smartphone, Tags, Trash2, TriangleAlert, Truck, Undo2, UserRound, Wrench, X,
} from "lucide-react";
import qrcode from "qrcode-generator";
import { api, type Me } from "../../api";
import { Link } from "../../components";
import { navigate } from "../../router";
import {
  PAYMENT_METHODS, PICKUP_STATUSES, canChangeStatus, computeTotals, isClosed, priceMatches,
  type CheckList, type Loaner, type PaymentMethod, type RepairItemKind, type RepairOrder, type RepairPart, type RepairPrice, type RepairSettings, type RepairStatus,
} from "../../../shared/repairs";
import { useRepairI18n } from "./i18n";
import { ChecksEditor, ChecksSummary, Dialog, MoneyInput, SignaturePad, StatusPill, deviceLabel } from "./parts";
import { MessageDialog, PhotosCard, SignatureCard } from "./Media";
import { startPurchase } from "./Purchases";
import { PrintView, type PrintKind } from "./Print";

const BASE = "/app/handy-it";

interface Related { id: string; number: number; status: RepairStatus; createdAt: string; warrantyUntil: string }

/** Der wichtigste nächste Schritt je Status; die übrigen erlaubten stehen darunter. */
const PRIMARY: Partial<Record<RepairStatus, RepairStatus>> = {
  received: "diagnosis",
  diagnosis: "repairing",
  waitingParts: "repairing",
  repairing: "ready",
  canceled: "received",
};
const EVENTS = ["quoteApproved", "quoteRejected", "edited", "loanerOut", "loanerBack", "outChecked", "signed", "signedPickup", "message", "partOrdered", "partArrived"];
const ALL: RepairStatus[] = ["received", "diagnosis", "quote", "waitingParts", "repairing", "ready", "notRepaired", "canceled"];

export function OrderDetail({ id, me }: { id: string; me: Me }) {
  const { r, repairError, euro, day, dateTime } = useRepairI18n();
  const [order, setOrder] = useState<RepairOrder | null>(null);
  const [related, setRelated] = useState<Related[]>([]);
  const [settings, setSettings] = useState<{ settings: RepairSettings; mailEnabled: boolean } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [notify, setNotify] = useState(true);
  const [flash, setFlash] = useState("");
  const [unlock, setUnlock] = useState<string | null>(null);
  const [adding, setAdding] = useState<RepairItemKind | null>(null);
  const [pickup, setPickup] = useState(false);
  const [checking, setChecking] = useState(false);
  const [pricing, setPricing] = useState(false);
  const [lending, setLending] = useState(false);
  const [print, setPrint] = useState<PrintKind | null>(null);
  const [copied, setCopied] = useState(false);
  const [messaging, setMessaging] = useState(false);
  const isManager = me.user.role !== "staff";

  const apply = (d: { order: RepairOrder; related: Related[]; mailed?: boolean }) => {
    setOrder(d.order);
    setRelated(d.related);
    if (d.mailed) setFlash(r("order.mailed"));
  };

  useEffect(() => {
    api<{ order: RepairOrder; related: Related[] }>(`/repairs/orders/${id}`).then(apply).catch((e) => setError(repairError(e)));
    api<{ settings: RepairSettings; mailEnabled: boolean }>("/repairs/settings").then(setSettings).catch(() => {});
  }, [id]);

  const run = async (call: () => Promise<{ order: RepairOrder; related: Related[]; mailed?: boolean }>) => {
    setBusy(true);
    setError("");
    setFlash("");
    try {
      apply(await call());
      setNote("");
      return true;
    } catch (e) {
      setError(repairError(e));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const changeStatus = (status: RepairStatus) =>
    run(() => api(`/repairs/orders/${id}/status`, { method: "POST", body: { status, note, notify } }));
  const decide = (approve: boolean) => run(() => api(`/repairs/orders/${id}/quote`, { method: "POST", body: { approve, note } }));
  const removeItem = (itemId: string) => run(() => api(`/repairs/orders/${id}/items/${itemId}`, { method: "DELETE" }));

  const smallBusiness = settings?.settings.smallBusiness ?? false;
  const totals = useMemo(() => computeTotals(order?.items ?? [], smallBusiness), [order, smallBusiness]);
  const statusUrl = order ? `${location.origin}/status/${me.user.tenantId}/${order.publicToken}` : "";
  const qr = useMemo(() => {
    if (!statusUrl) return "";
    const q = qrcode(0, "M");
    q.addData(statusUrl);
    q.make();
    return q.createDataURL(4, 1);
  }, [statusUrl]);

  if (!order) return error ? <p className="error">{error}</p> : <p className="muted">…</p>;

  const closed = isClosed(order.status);
  const primary = order.status === "diagnosis" && order.items.length ? "quote" : PRIMARY[order.status];
  const others = ALL.filter((s) => s !== primary && canChangeStatus(order.status, s));
  const canNotify = !!order.customer.email && !!settings?.mailEnabled && !!settings?.settings.notifyByMail;
  const overLimit = order.intake.approvedUpToCents > 0 && totals.grossCents > order.intake.approvedUpToCents && order.quote !== "approved"
    && ["diagnosis", "waitingParts", "repairing"].includes(order.status);
  const lastPickup = [...order.history].reverse().find((e) => e.status === "pickedUp");

  const showUnlock = async () => {
    try {
      setUnlock((await api<{ code: string }>(`/repairs/orders/${id}/unlock`)).code);
    } catch (e) {
      setError(repairError(e));
    }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(statusUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      prompt(r("order.statusLink"), statusUrl);
    }
  };

  const messageNote = (note: string) => {
    const [channel, ...name] = note.split(":");
    return `${channel === "whatsapp" ? "WhatsApp" : channel === "sms" ? r("messages.sms") : r("messages.copied")}${name.join(":") ? ` · ${name.join(":")}` : ""}`;
  };

  const remove = async () => {
    if (!confirm(r("order.deleteConfirm", { number: order.number }))) return;
    try {
      await api(`/repairs/orders/${id}`, { method: "DELETE" });
      navigate(BASE);
    } catch (e) {
      setError(repairError(e));
    }
  };

  return (
    <div className="stack-lg repairs">
      <Link to={BASE} className="text-link back"><ArrowLeft size={16} className="flip-rtl" /> {r("order.back")}</Link>

      <header className="repair-detail-head">
        <div className="stack-sm">
          <div className="row wrap gap">
            <span className="repair-number big">#{order.number}</span>
            <StatusPill status={order.status} />
            {order.intake.warrantyRef && <span className="pill pos"><ShieldCheck size={13} /> {r("order.warrantyClaim", { ref: order.intake.warrantyRef })}</span>}
          </div>
          <h1 className="display">{deviceLabel(order.intake.device)}</h1>
          <p className="muted">
            {r(`devices.${order.intake.device.type}`)} · {r("order.createdAt", { day: day(order.createdAt) })}
            {order.createdBy ? ` ${r("order.createdBy", { name: order.createdBy })}` : ""}
          </p>
        </div>
        <div className="row wrap gap repair-head-actions">
          <button className="button" onClick={() => setPrint("intake")}><Printer size={17} /> {r("order.printIntake")}</button>
          {order.items.length > 0 && !order.invoice && <button className="button" onClick={() => setPrint("quote")}><FileText size={17} /> {r("order.printQuote")}</button>}
          {order.invoice && <button className="button" onClick={() => setPrint("invoice")}><Receipt size={17} /> {r("order.printInvoice")}</button>}
        </div>
      </header>

      {error && <p className="error" role="alert">{error}</p>}
      {flash && <p className="notice success"><Check size={17} /> {flash}</p>}

      <div className="repair-detail">
        <div className="stack">
          {/* ---------- Status ---------- */}
          <section className="card stack">
            {closed && order.status === "pickedUp" ? (
              <div className="stack-sm">
                <p className="notice success"><BadgeCheck size={17} /> {r("order.pickedUp", { day: lastPickup ? day(lastPickup.at) : "" })}</p>
                {order.invoice && (
                  <p className="muted">
                    {r("order.invoice", { number: order.invoice.number })} · {euro(order.invoice.totalCents)} · {r(`payment.${order.invoice.paymentMethod}`)}
                    {order.invoice.warrantyUntil && <> · {r("order.warrantyUntil", { day: day(order.invoice.warrantyUntil) })}</>}
                  </p>
                )}
              </div>
            ) : (
              <>
                <h2 className="card-title"><Wrench size={20} /> {r("order.nextStep")}</h2>
                {order.status === "quote" && order.quote === "pending" && (
                  <div className="stack-sm">
                    <p className="notice">{r("order.quoteWaiting")}</p>
                    <div className="row wrap gap">
                      <button className="button primary" disabled={busy} onClick={() => decide(true)}><Check size={18} /> {r("order.quoteApprove")}</button>
                      <button className="button danger" disabled={busy} onClick={() => decide(false)}><X size={18} /> {r("order.quoteReject")}</button>
                    </div>
                  </div>
                )}
                {overLimit && <p className="notice"><TriangleAlert size={16} /> {r("order.quoteOverLimit", { amount: euro(order.intake.approvedUpToCents) })}</p>}
                {order.status === "ready" && !order.outChecks && (
                  <p className="notice planned-row"><ListChecks size={16} /> <span>{r("checks.outMissing")}</span>
                    <button className="button small-button" onClick={() => setChecking(true)}>{r("checks.outDo")}</button>
                  </p>
                )}
                {PICKUP_STATUSES.includes(order.status) && (
                  <button className="button primary block" disabled={busy} onClick={() => setPickup(true)}><ClipboardCheck size={18} /> {r("order.pickup")}</button>
                )}
                {primary && (
                  <button className={`button ${PICKUP_STATUSES.includes(order.status) || (order.status === "quote" && order.quote === "pending") ? "" : "primary"} block`} disabled={busy} onClick={() => changeStatus(primary)}>
                    {r(`statusAction.${primary}`)}
                  </button>
                )}
                {others.length > 0 && (
                  <div className="stack-sm">
                    <span className="field-label muted">{r("order.more")}</span>
                    <div className="chips wrap">
                      {others.map((s) => (
                        <button key={s} className={`chip ${s === "canceled" || s === "notRepaired" ? "danger" : ""}`} disabled={busy} onClick={() => changeStatus(s)}>
                          {r(`statusAction.${s}`)}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={r("order.note")} aria-label={r("order.note")} />
                {canNotify && (
                  <label className="check"><input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} /> {r("order.notifyCustomer")}</label>
                )}
              </>
            )}
          </section>

          {/* ---------- Positionen ---------- */}
          <section className="card stack">
            <div className="section-head">
              <h2 className="card-title"><Package size={20} /> {r("order.items")}</h2>
            </div>
            {order.items.length === 0 ? (
              <p className="muted">{r("order.itemsEmpty")}</p>
            ) : (
              <div className="repair-items">
                {order.items.map((item) => (
                  <div key={item.id} className="repair-item">
                    <span className="list-main">
                      <strong>{item.name}</strong>
                      <small className="muted">{item.qty !== 1 ? `${item.qty} × ${euro(item.unitCents)} · ` : ""}{item.kind === "labor" ? r("order.addLabor") : item.kind === "part" ? r("stock.categories.part") : r("order.addOther")}</small>
                    </span>
                    <strong className="amount">{euro(Math.round(item.qty * item.unitCents))}</strong>
                    {!closed && !order.invoice && (
                      <button className="icon-button danger" onClick={() => removeItem(item.id)} aria-label={r("order.delete")} disabled={busy}><Trash2 size={17} /></button>
                    )}
                  </div>
                ))}
              </div>
            )}
            {order.items.length > 0 && (
              <div className="repair-totals">
                {!smallBusiness && totals.vat.filter((v) => v.rate > 0).map((v) => (
                  <p key={v.rate}><span className="muted">{r("order.vatAmount", { rate: v.rate })}</span><span>{euro(v.vatCents)}</span></p>
                ))}
                <p className="grand"><span>{r("order.total")}</span><strong>{euro(totals.grossCents)}</strong></p>
                {order.intake.depositCents > 0 && (
                  <>
                    <p><span className="muted">{r("order.deposit")}</span><span>− {euro(order.intake.depositCents)}</span></p>
                    <p className="grand"><span>{r("order.toPay")}</span><strong>{euro(Math.max(0, totals.grossCents - order.intake.depositCents))}</strong></p>
                  </>
                )}
              </div>
            )}
            {order.intake.estimateCents > 0 && <p className="muted small">{r("order.estimate", { amount: euro(order.intake.estimateCents) })}</p>}
            {!closed && order.intake.planned.filter((p) => !order.items.some((i) => i.name === p.name)).map((p) => (
              <div key={p.priceId} className="notice planned-row">
                <Tags size={16} />
                <span>{r("order.planned", { name: p.name, price: euro(p.cents) })}</span>
                <button className="button small-button" disabled={busy} onClick={() => run(() => api(`/repairs/orders/${id}/price`, { method: "POST", body: { priceId: p.priceId } }))}>{r("order.applyPlanned")}</button>
              </div>
            ))}
            {!closed && (
              <div className="row wrap gap">
                <button className="button" onClick={() => setPricing(true)}><Tags size={16} /> {r("order.fromPrices")}</button>
                <button className="button" onClick={() => setAdding("labor")}><Plus size={16} /> {r("order.addLabor")}</button>
                <button className="button" onClick={() => setAdding("part")}><Plus size={16} /> {r("order.addPart")}</button>
                <button className="button" onClick={() => setAdding("other")}><Plus size={16} /> {r("order.addOther")}</button>
              </div>
            )}
          </section>

          {/* ---------- Verlauf ---------- */}
          <section className="card stack">
            <h2 className="card-title"><History size={20} /> {r("order.history")}</h2>
            <ol className="repair-timeline">
              {[...order.history].reverse().map((e) => (
                <li key={e.id}>
                  <span className="dot" aria-hidden />
                  <div>
                    <strong>
                      {EVENTS.includes(e.event) ? r(`order.events.${e.event}`) : e.status ? r(`status.${e.status}`) : ""}
                    </strong>
                    <small className="muted"> · {dateTime(e.at)} · {e.userName ?? r("order.byCustomer")}</small>
                    {e.event === "message" ? <p>{messageNote(e.note)}</p> : e.note && !e.note.startsWith("deposit:") && <p>{e.note}</p>}
                  </div>
                </li>
              ))}
            </ol>
          </section>
        </div>

        <div className="stack">
          {/* ---------- Kunde ---------- */}
          <section className="card stack">
            <h2 className="card-title"><Link to={`${BASE}/kunden/${order.customer.id}`} className="text-link"><UserRound size={18} /> {order.customer.name}</Link></h2>
            <div className="row wrap gap">
              {order.customer.phone && <a className="button" href={`tel:${order.customer.phone.replace(/[^\d+]/g, "")}`}><Phone size={16} /> {order.customer.phone}</a>}
              {order.customer.email && <a className="button" href={`mailto:${order.customer.email}`}><Mail size={16} /> {r("order.mail")}</a>}
              {order.customer.phone && <button className="button" onClick={() => setMessaging(true)}><MessageCircle size={16} /> {r("messages.button")}</button>}
            </div>
            <div className="status-link">
              {qr && <img src={qr} alt="" width={96} height={96} />}
              <div className="stack-sm">
                <strong><Link2 size={15} /> {r("order.statusLink")}</strong>
                <a href={statusUrl} target="_blank" rel="noreferrer" className="muted small break">{statusUrl}</a>
                <button className="button" onClick={copyLink}>{copied ? <><Check size={16} /> {r("order.copied")}</> : <><Copy size={16} /> {r("order.copyLink")}</>}</button>
              </div>
            </div>
          </section>

          {/* ---------- Gerät ---------- */}
          <section className="card stack">
            <h2 className="card-title"><Smartphone size={20} /> {r("intake.device")}</h2>
            <dl className="repair-facts">
              {order.intake.device.serial && <><dt>{r("intake.serial")}</dt><dd className="mono">{order.intake.device.serial}</dd></>}
              {order.intake.device.color && <><dt>{r("intake.color")}</dt><dd>{order.intake.device.color}</dd></>}
              <dt>{r("intake.problem")}</dt><dd className="pre">{order.intake.problem}</dd>
              {(order.intake.accessories.length > 0 || order.intake.accessoriesOther) && (
                <><dt>{r("order.accessories")}</dt><dd>{[...order.intake.accessories.map((a) => r(`accessories.${a}`)), order.intake.accessoriesOther].filter(Boolean).join(", ")}</dd></>
              )}
              {order.intake.condition && <><dt>{r("order.condition")}</dt><dd className="pre">{order.intake.condition}</dd></>}
              {order.intake.approvedUpToCents > 0 && <><dt>{r("intake.approvedUpTo")}</dt><dd>{euro(order.intake.approvedUpToCents)}</dd></>}
              {order.intake.dueDay && <><dt>{r("intake.dueDay")}</dt><dd>{day(order.intake.dueDay)}</dd></>}
              {order.intake.internalNote && <><dt>{r("intake.internalNote")}</dt><dd className="pre">{order.intake.internalNote}</dd></>}
            </dl>
            <dl className="repair-facts">
              <dt>{r("checks.atIntake")}</dt><dd><ChecksSummary value={order.intake.checks} /></dd>
              <dt>{r("checks.atOutput")}</dt>
              <dd>
                {order.outChecks ? <ChecksSummary value={order.outChecks} compare={order.intake.checks} /> : <span className="muted">{r("checks.notYet")}</span>}
                {!closed && <> <button className="text-button" onClick={() => setChecking(true)}>{order.outChecks ? r("checks.outEdit") : r("checks.outDo")}</button></>}
              </dd>
            </dl>
            {order.intake.dataNotice && <p className="muted small"><ShieldCheck size={14} /> {r("order.dataNotice")}</p>}
            {!closed && (
              <div className="unlock-row">
                <KeyRound size={16} />
                <span>{r("order.unlock")}:</span>
                {order.hasUnlockCode ? (
                  unlock !== null ? <strong className="mono">{unlock}</strong> : <button className="text-button" onClick={showUnlock}><Eye size={15} /> {r("order.showUnlock")}</button>
                ) : <span className="muted">{r("order.noUnlock")}</span>}
              </div>
            )}
            {!closed && (
              <Link to={`${BASE}/auftrag/${order.id}/bearbeiten`} className="button"><Pencil size={16} /> {r("order.edit")}</Link>
            )}
          </section>

          <PhotosCard order={order} isManager={isManager} onChange={(photos) => setOrder({ ...order, photos })} />
          <SignatureCard order={order} onSigned={setOrder} />

          {/* ---------- Bestellte Teile ---------- */}
          {(order.partOrders.length > 0 || (!closed && ["diagnosis", "quote", "waitingParts", "repairing"].includes(order.status))) && (
            <section className="card stack-sm">
              <h2 className="card-title"><Truck size={20} /> {r("purchases.forOrder")}</h2>
              {order.partOrders.map((p, i) => (
                <Link key={i} to={`${BASE}/lager/bestellungen/${p.purchaseId}`} className="list-row">
                  <span className="list-main">
                    <strong>{p.qty} × {p.name}</strong>
                    <small className="muted">{r("purchases.numberShort", { n: p.purchaseNumber })} · {p.supplierName}</small>
                  </span>
                  <span className={`pill ${p.received >= p.qty ? "pos" : p.status === "ordered" ? "warn" : ""}`}>{p.received >= p.qty ? r("purchases.arrived") : r(`purchases.status.${p.status}`)}</span>
                </Link>
              ))}
              {!closed && <button className="button" onClick={() => startPurchase({ orderNumber: order.number, name: order.intake.planned[0]?.name ? `${order.intake.planned[0].name} ${deviceLabel(order.intake.device)}` : deviceLabel(order.intake.device) })}><Plus size={16} /> {r("purchases.orderPart")}</button>}
            </section>
          )}

          {/* ---------- Leihgerät ---------- */}
          {(order.loaner || !closed) && (
            <section className="card stack-sm">
              <h2 className="card-title"><Repeat size={20} /> {r("loaner.title")}</h2>
              {order.loaner ? (
                <>
                  <p><strong>{order.loaner.name}</strong>{order.loaner.serial && <span className="muted mono"> · {order.loaner.serial}</span>}</p>
                  <small className="muted">{r("loaner.since", { day: day(order.loaner.lentAt) })}</small>
                  <button className="button" disabled={busy} onClick={() => run(() => api(`/repairs/orders/${id}/loaner`, { method: "PUT", body: { loanerId: null } }))}><Undo2 size={16} /> {r("loaner.giveBack")}</button>
                </>
              ) : (
                <button className="button" onClick={() => setLending(true)}><Plus size={16} /> {r("loaner.lend")}</button>
              )}
            </section>
          )}

          {related.length > 0 && (
            <section className="card stack">
              <h2 className="card-title"><History size={20} /> {r("order.related")}</h2>
              {related.map((o) => {
                const active = o.warrantyUntil && o.warrantyUntil >= new Date().toLocaleDateString("en-CA");
                return (
                  <Link key={o.id} to={`${BASE}/auftrag/${o.id}`} className="list-row">
                    <span className="repair-number">#{o.number}</span>
                    <span className="list-main"><small className="muted">{day(o.createdAt)}</small></span>
                    {active ? <span className="pill pos"><ShieldCheck size={13} /> {r("order.warrantyActive")}</span> : <StatusPill status={o.status} />}
                  </Link>
                );
              })}
            </section>
          )}

          {isManager && !order.invoice && (
            <button className="button danger" onClick={remove}><Trash2 size={16} /> {r("order.delete")}</button>
          )}
        </div>
      </div>

      {adding && (
        <AddItemDialog
          kind={adding}
          defaultLabor={settings?.settings.laborCents ?? 0}
          onClose={() => setAdding(null)}
          onAdd={async (item) => {
            if (await run(() => api(`/repairs/orders/${id}/items`, { method: "POST", body: item }))) setAdding(null);
          }}
        />
      )}
      {checking && (
        <OutChecksDialog
          order={order}
          onClose={() => setChecking(false)}
          onSave={async (checks) => {
            if (await run(() => api(`/repairs/orders/${id}/out-checks`, { method: "PUT", body: { checks } }))) setChecking(false);
          }}
        />
      )}
      {pricing && (
        <PriceDialog
          order={order}
          onClose={() => setPricing(false)}
          onPick={async (priceId) => {
            if (await run(() => api(`/repairs/orders/${id}/price`, { method: "POST", body: { priceId } }))) setPricing(false);
          }}
        />
      )}
      {lending && (
        <LendDialog
          onClose={() => setLending(false)}
          onPick={async (loanerId) => {
            if (await run(() => api(`/repairs/orders/${id}/loaner`, { method: "PUT", body: { loanerId } }))) setLending(false);
          }}
        />
      )}
      {pickup && (
        <PickupDialog
          order={order}
          total={Math.max(0, totals.grossCents - order.intake.depositCents)}
          onClose={() => setPickup(false)}
          onConfirm={async (paymentMethod, loanerReturned, signature) => {
            if (await run(() => api(`/repairs/orders/${id}/pickup`, { method: "POST", body: { paymentMethod, loanerReturned, signature } }))) {
              setPickup(false);
              setPrint("invoice");
            }
          }}
        />
      )}
      {messaging && (
        <MessageDialog
          order={order}
          statusUrl={statusUrl}
          toPayCents={Math.max(0, totals.grossCents - order.intake.depositCents)}
          company={me.user.tenantName}
          onClose={() => setMessaging(false)}
          onLogged={setOrder}
        />
      )}
      {print && <PrintView kind={print} order={order} statusUrl={statusUrl} qr={qr} settings={settings?.settings ?? null} onClose={() => setPrint(null)} />}
    </div>
  );
}

function AddItemDialog({ kind: initialKind, defaultLabor, onClose, onAdd }: {
  kind: RepairItemKind; defaultLabor: number; onClose: () => void;
  onAdd: (item: { kind: RepairItemKind; partId: string | null; name: string; qty: number; unitCents: number; vatRate: number }) => void;
}) {
  const { r, euro, lang } = useRepairI18n();
  const [kind, setKind] = useState(initialKind);
  const [name, setName] = useState(initialKind === "labor" ? r("order.addLabor") : "");
  const [qty, setQty] = useState("1");
  const [cents, setCents] = useState<number | null>(initialKind === "labor" ? defaultLabor : 0);
  const [vatRate, setVatRate] = useState(standardVat);
  const [part, setPart] = useState<RepairPart | null>(null);
  const [query, setQuery] = useState("");
  const [parts, setParts] = useState<RepairPart[]>([]);

  useEffect(() => {
    if (kind !== "part") return;
    const timer = setTimeout(() => api<{ parts: RepairPart[] }>(`/repairs/parts?q=${encodeURIComponent(query)}`).then((d) => setParts(d.parts)).catch(() => {}), 200);
    return () => clearTimeout(timer);
  }, [kind, query]);

  const choose = (p: RepairPart) => {
    setPart(p);
    setName(p.name);
    setCents(p.priceCents);
    setVatRate(p.vatRate);
  };

  const quantity = Number(qty.replace(",", "."));
  const valid = name.trim() && cents !== null && quantity > 0 && (kind !== "part" || part);

  return (
    <Dialog title={kind === "labor" ? r("order.addLabor") : kind === "part" ? r("order.addPart") : r("order.addOther")} onClose={onClose}>
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) onAdd({ kind, partId: part?.id ?? null, name: name.trim(), qty: quantity, unitCents: cents!, vatRate });
        }}
      >
        <div className="segmented three">
          {(["labor", "part", "other"] as const).map((k) => (
            <button type="button" key={k} className={kind === k ? "active" : ""} onClick={() => (setKind(k), setPart(null))}>
              {k === "labor" ? r("order.addLabor") : k === "part" ? r("stock.categories.part") : r("order.addOther")}
            </button>
          ))}
        </div>
        {kind === "part" && !part && (
          <div className="stack-sm">
            <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder={r("order.pickPart")} aria-label={r("order.pickPart")} />
            <div className="part-picker">
              {parts.length === 0 && <p className="muted small">{r("stock.empty")}</p>}
              {parts.map((p) => (
                <button type="button" key={p.id} className="list-row" onClick={() => choose(p)}>
                  <span className="list-main">
                    <strong>{p.name}</strong>
                    <small className={p.stock > 0 ? "muted" : "error"}>{p.stock > 0 ? r("order.inStock", { n: p.stock }) : r("order.outOfStock")}{p.fits ? ` · ${p.fits}` : ""}</small>
                  </span>
                  <span>{euro(p.priceCents)}</span>
                </button>
              ))}
            </div>
          </div>
        )}
        {(kind !== "part" || part) && (
          <>
            <label className="field">
              <span className="field-label">{r("order.itemName")}</span>
              <input autoFocus={kind !== "part"} value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <div className="grid three">
              <label className="field">
                <span className="field-label">{r("order.qty")}</span>
                <input inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} />
              </label>
              <label className="field">
                <span className="field-label">{r("order.unitPrice")}</span>
                <MoneyInput cents={cents ?? 0} onChange={setCents} />
              </label>
              <label className="field">
                <span className="field-label">{r("order.vat")}</span>
                <select value={vatRate} onChange={(e) => setVatRate(Number(e.target.value))}>
                  {vatChoices(vatRate).map((v) => <option key={v} value={v}>{formatRate(v, lang)}</option>)}
                </select>
              </label>
            </div>
            {cents === null && <p className="error">{r("intake.errors.price")}</p>}
            <button className="button primary" disabled={!valid}><Plus size={18} /> {r("order.add")}</button>
          </>
        )}
      </form>
    </Dialog>
  );
}

function PickupDialog({ order, total, onClose, onConfirm }: {
  order: RepairOrder; total: number; onClose: () => void; onConfirm: (m: PaymentMethod, loanerReturned: boolean, signature: string | null) => void;
}) {
  const { r, euro } = useRepairI18n();
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [signature, setSignature] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loanerBack, setLoanerBack] = useState(false);
  return (
    <Dialog title={r("order.pickup")} onClose={onClose}>
      <div className="stack">
        <p>{r("order.pickupText")}</p>
        {order.items.length === 0 && <p className="muted small">{r("order.pickupFree")}</p>}
        <p className="pickup-total"><span>{r("order.toPay")}</span><strong>{euro(total)}</strong></p>
        {(order.items.length > 0 || order.intake.depositCents > 0) && (
          <div className="field">
            <span className="field-label">{r("order.paymentMethod")}</span>
            <div className="segmented three">
              {PAYMENT_METHODS.map((m) => (
                <button type="button" key={m} className={method === m ? "active" : ""} onClick={() => setMethod(m)}>{r(`payment.${m}`)}</button>
              ))}
            </div>
          </div>
        )}
        {order.status === "ready" && !order.outChecks && <p className="notice"><ListChecks size={16} /> {r("checks.outMissing")}</p>}
        {order.loaner && (
          <label className="check notice">
            <input type="checkbox" checked={loanerBack} onChange={(e) => setLoanerBack(e.target.checked)} />
            <span>{r("loaner.backConfirm", { name: order.loaner.name })}</span>
          </label>
        )}
        <div className="field">
          <span className="field-label">{r("signature.pickupTitle")}</span>
          <SignaturePad onChange={setSignature} />
        </div>
        <button className="button primary" disabled={busy || (!!order.loaner && !loanerBack)} onClick={() => (setBusy(true), onConfirm(method, loanerBack, signature))}><ClipboardCheck size={18} /> {r("order.pickupConfirm")}</button>
      </div>
    </Dialog>
  );
}

function OutChecksDialog({ order, onClose, onSave }: { order: RepairOrder; onClose: () => void; onSave: (checks: CheckList) => void }) {
  const { r } = useRepairI18n();
  // Vorschlag: wie bei Annahme, damit nur Abweichungen getippt werden müssen
  const [checks, setChecks] = useState<CheckList>(order.outChecks ?? order.intake.checks);
  return (
    <Dialog title={r("checks.outTitle")} onClose={onClose} wide>
      <div className="stack">
        <p className="muted">{r("checks.outText")}</p>
        <ChecksEditor type={order.intake.device.type} value={checks} onChange={setChecks} />
        <div className="stack-sm">
          <span className="field-label">{r("checks.atIntake")}</span>
          <ChecksSummary value={order.intake.checks} />
        </div>
        <button className="button primary" onClick={() => onSave(checks)}><Check size={18} /> {r("checks.save")}</button>
      </div>
    </Dialog>
  );
}

function PriceDialog({ order, onClose, onPick }: { order: RepairOrder; onClose: () => void; onPick: (priceId: string) => void }) {
  const { r, euro } = useRepairI18n();
  const [prices, setPrices] = useState<RepairPrice[] | null>(null);
  const [all, setAll] = useState(false);
  const [query, setQuery] = useState("");
  useEffect(() => {
    api<{ prices: RepairPrice[] }>("/repairs/prices").then((d) => setPrices(d.prices)).catch(() => setPrices([]));
  }, []);
  const matching = (prices ?? []).filter((p) => priceMatches(p, order.intake.device));
  const shown = (all || !matching.length ? prices ?? [] : matching).filter((p) => !query || `${p.brand} ${p.model} ${p.service}`.toLowerCase().includes(query.toLowerCase()));
  return (
    <Dialog title={r("order.fromPrices")} onClose={onClose} wide>
      <div className="stack">
        <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder={r("prices.search")} aria-label={r("prices.search")} />
        {matching.length > 0 && (
          <label className="check"><input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} /> {r("prices.showAll")}</label>
        )}
        <div className="part-picker">
          {prices && shown.length === 0 && <p className="muted small">{r("prices.emptyHint")}</p>}
          {shown.map((p) => (
            <button type="button" key={p.id} className="list-row" onClick={() => onPick(p.id)}>
              <span className="list-main">
                <strong>{p.service}</strong>
                <small className="muted">{[p.brand, p.model].filter(Boolean).join(" ") || r(`devices.${p.deviceType}`)}{p.minutes ? ` · ${r("prices.minutesShort", { n: p.minutes })}` : ""}</small>
              </span>
              <strong>{euro(p.priceCents)}</strong>
            </button>
          ))}
        </div>
      </div>
    </Dialog>
  );
}

function LendDialog({ onClose, onPick }: { onClose: () => void; onPick: (loanerId: string) => void }) {
  const { r } = useRepairI18n();
  const [loaners, setLoaners] = useState<Loaner[] | null>(null);
  useEffect(() => {
    api<{ loaners: Loaner[] }>("/repairs/loaners").then((d) => setLoaners(d.loaners)).catch(() => setLoaners([]));
  }, []);
  return (
    <Dialog title={r("loaner.lend")} onClose={onClose}>
      <div className="part-picker">
        {loaners && loaners.length === 0 && <p className="muted small">{r("loaner.emptyHint")}</p>}
        {(loaners ?? []).map((l) => (
          <button type="button" key={l.id} className="list-row" disabled={!!l.orderId} onClick={() => onPick(l.id)}>
            <span className="list-main">
              <strong>{l.name}</strong>
              <small className="muted">{l.orderId ? r("loaner.lentTo", { number: l.orderNumber ?? "", name: l.customerName ?? "" }) : [l.serial, l.note].filter(Boolean).join(" · ") || r("loaner.available")}</small>
            </span>
          </button>
        ))}
      </div>
    </Dialog>
  );
}
