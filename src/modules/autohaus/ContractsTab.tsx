import { useEffect, useState, type FormEvent } from "react";
import { Ban, Check, FilePlus2, PenLine, Printer, Truck, Wrench } from "lucide-react";
import { api } from "../../api";
import { Field } from "../../components";
import { navigate } from "../../router";
import { Dialog } from "../../pos/ui";
import { contractBalance, contractTotal, PAYMENT_LABEL, round2, vehicleLabel, type Lead, type PaymentMethod, type SalesContract, type StockVehicle, type TradeIn } from "../../../shared/autohaus";
import type { TabProps } from "./AutohausApp";
import { ContractPrint } from "./ContractPrint";
import { BASE, ContractStatusPill, dateLabel, errorText, euro, vehicleFacts, sym } from "./parts";

export function ContractsTab({ contracts, vehicles, leads, tradeIns, me, reload, preset, sub }: TabProps) {
  const [creating, setCreating] = useState<string | null>(null);
  const [printing, setPrinting] = useState<SalesContract | null>(null);

  useEffect(() => {
    if (preset !== null) setCreating(preset);
  }, [preset]);

  const closeCreating = () => {
    setCreating(null);
    if (preset !== null) navigate(`${BASE}/vertraege`);
  };

  // Ein geöffneter Vertrag steht in der Adresse (…/vertraege/<id>), damit Zurück und Neuladen funktionieren
  const open = sub && sub !== "neu" ? (contracts.find((c) => c.id === sub) ?? null) : null;

  return (
    <div className="stack">
      <div className="toolbar">
        <p className="muted autohaus-hint">Ein Entwurf reserviert das Fahrzeug. Mit der Unterschrift gilt es als verkauft.</p>
        <button className="button primary push-end" onClick={() => setCreating("")}><FilePlus2 size={18} /> Kaufvertrag</button>
      </div>

      <section className="card list-card">
        {contracts.length === 0 && <p className="empty muted">Noch keine Kaufverträge. Öffne ein Fahrzeug im Bestand und tippe auf „Kaufvertrag“.</p>}
        {contracts.map((c) => (
          <button key={c.id} className="list-row" onClick={() => navigate(`${BASE}/vertraege/${c.id}`)}>
            <span className="autohaus-mono autohaus-number">{c.contractNumber}</span>
            <span className="list-main">
              <strong>{c.buyerName}</strong>
              <small className="muted">{vehicleLabel(c.vehicle)} · {dateLabel(c.createdAt)}</small>
            </span>
            <strong className="autohaus-num">{euro(contractTotal(c))}</strong>
            <ContractStatusPill status={c.status} />
          </button>
        ))}
      </section>

      {creating !== null && (
        <ContractForm
          vehicles={vehicles}
          leads={leads}
          tradeIns={tradeIns}
          vehicleId={creating}
          onClose={closeCreating}
          onSaved={async (c) => {
            setCreating(null);
            await reload();
            navigate(`${BASE}/vertraege/${c.id}`);
          }}
        />
      )}
      {open && <ContractDetail contract={open} isManager={me.user.role !== "staff"} hasWorkshop={me.installedApps.includes("werkstatt")} reload={reload} onPrint={() => setPrinting(open)} onClose={() => navigate(`${BASE}/vertraege`)} />}
      {printing && <ContractPrint contract={printing} tradeIn={tradeIns.find((t) => t.id === printing.tradeInId) ?? null} onClose={() => setPrinting(null)} />}
    </div>
  );
}

function ContractDetail({ contract: c, isManager, hasWorkshop, reload, onPrint, onClose }: { contract: SalesContract; isManager: boolean; hasWorkshop: boolean; reload: () => Promise<void>; onPrint: () => void; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [confirmCancel, setConfirmCancel] = useState(false);

  const setStatus = async (status: string) => {
    setBusy(true);
    setError("");
    try {
      await api(`/autohaus/contracts/${c.id}/status`, { method: "POST", body: { status } });
      await reload();
      setConfirmCancel(false);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  // Werkstatt-Anbindung: Das verkaufte Fahrzeug landet mit dem Käufer als Halter in der Fahrzeugakte der Werkstatt
  const toWorkshop = async () => {
    setBusy(true);
    setError("");
    try {
      const v = c.vehicle;
      await api("/workshop/vehicles", {
        method: "POST",
        body: {
          licensePlate: v.licensePlate || "OHNE KZ",
          vin: v.vin,
          brand: v.make,
          model: [v.model, v.variant].filter(Boolean).join(" "),
          year: Number(v.firstRegistration.slice(0, 4)) || new Date().getFullYear(),
          mileage: v.mileage,
          fuelType: v.fuel,
          powerHp: Math.round(v.powerKw * 1.35962) || undefined,
          nextInspection: v.nextInspection,
          customerName: c.buyerName,
          customerPhone: c.buyerPhone,
          customerEmail: c.buyerEmail || undefined,
          notes: `Gekauft im Autohaus, Vertrag ${c.contractNumber}`,
        },
      });
      setNotice("Das Fahrzeug steht jetzt in der Fahrzeugakte der Werkstatt.");
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const rows: [string, string][] = [
    ["Kaufpreis", euro(c.price)],
    ...(c.discount ? [["Nachlass", `− ${euro(c.discount)}`] as [string, string]] : []),
    ...(c.tradeInAmount ? [["Inzahlungnahme", `− ${euro(c.tradeInAmount)}`] as [string, string]] : []),
    ...(c.deposit ? [["Anzahlung", `− ${euro(c.deposit)}`] as [string, string]] : []),
  ];

  return (
    <Dialog title={`Kaufvertrag ${c.contractNumber}`} onClose={onClose} wide>
      <div className="stack autohaus-dialog">
        {error && <p className="error" role="alert">{error}</p>}
        {notice && <p className="notice success">{notice}</p>}
        <div className="autohaus-detail-head">
          <div>
            <strong>{vehicleLabel(c.vehicle)}</strong>
            <small className="muted">{vehicleFacts(c.vehicle)}{c.vehicle.vin ? ` · FIN ${c.vehicle.vin}` : ""}</small>
          </div>
          <ContractStatusPill status={c.status} />
        </div>
        <div className="autohaus-two">
          <div className="autohaus-panel">
            <h3 className="card-subtitle">Käufer</h3>
            <strong>{c.buyerName}</strong>
            {c.buyerAddress && <small className="muted autohaus-pre">{c.buyerAddress}</small>}
            <small className="muted">{[c.buyerPhone, c.buyerEmail].filter(Boolean).join(" · ")}</small>
          </div>
          <div className="autohaus-panel">
            <h3 className="card-subtitle">Bezahlung</h3>
            {rows.map(([k, v]) => <p key={k} className="autohaus-sum"><span>{k}</span><span>{v}</span></p>)}
            <p className="autohaus-sum grand"><span>Noch zu zahlen</span><span>{euro(contractBalance(c))}</span></p>
            <small className="muted">{PAYMENT_LABEL[c.paymentMethod]}{c.deliveryDate ? ` · Übergabe ${dateLabel(c.deliveryDate)}` : ""}</small>
          </div>
        </div>
        {c.warranty && <p className="muted">Gewährleistung: {c.warranty}</p>}
        {c.notes && <p className="muted autohaus-notes">{c.notes}</p>}

        <div className="row wrap gap">
          <button className="button" onClick={onPrint}><Printer size={18} /> Drucken</button>
          {c.status === "entwurf" && <button className="button primary" disabled={busy} onClick={() => setStatus("unterschrieben")}><PenLine size={18} /> Unterschrieben</button>}
          {c.status === "unterschrieben" && <button className="button primary" disabled={busy} onClick={() => setStatus("ausgeliefert")}><Truck size={18} /> Fahrzeug übergeben</button>}
          {hasWorkshop && (c.status === "unterschrieben" || c.status === "ausgeliefert") && !notice && (
            <button className="button" disabled={busy} onClick={toWorkshop}><Wrench size={18} /> An Werkstatt übergeben</button>
          )}
          {isManager && (c.status === "entwurf" || c.status === "unterschrieben") && (
            confirmCancel ? (
              <span className="row gap push-end">
                <button className="button danger" disabled={busy} onClick={() => setStatus("storniert")}>Vertrag stornieren</button>
                <button className="text-button" onClick={() => setConfirmCancel(false)}>Abbrechen</button>
              </span>
            ) : (
              <button className="button push-end" onClick={() => setConfirmCancel(true)}><Ban size={18} /> Stornieren</button>
            )
          )}
        </div>
        {confirmCancel && <p className="muted small">Das Fahrzeug wird wieder verfügbar, eine Inzahlungnahme wird wieder frei.</p>}
      </div>
    </Dialog>
  );
}

const WARRANTIES = ["12 Monate Sachmängelhaftung", "24 Monate Sachmängelhaftung (Neuwagen)", "Gebrauchtwagengarantie 12 Monate", "Gewährleistung ausgeschlossen (Gewerbekunde)"];

function ContractForm({ vehicles, leads, tradeIns, vehicleId, onClose, onSaved }: { vehicles: StockVehicle[]; leads: Lead[]; tradeIns: TradeIn[]; vehicleId: string; onClose: () => void; onSaved: (c: SalesContract) => void }) {
  const available = vehicles.filter((v) => v.status === "verfuegbar" || v.status === "aufbereitung");
  const start = available.find((v) => v.id === vehicleId);
  const lead = leads.find((l) => l.vehicleId === vehicleId && l.status !== "gewonnen" && l.status !== "verloren");
  const [form, setForm] = useState({
    vehicleId: start?.id ?? "",
    leadId: lead?.id ?? "",
    buyerName: lead?.name ?? "",
    buyerAddress: "",
    buyerPhone: lead?.phone ?? "",
    buyerEmail: lead?.email ?? "",
    price: start?.price ? String(start.price) : "",
    discount: "",
    tradeInId: "",
    deposit: "",
    paymentMethod: "ueberweisung" as PaymentMethod,
    deliveryDate: "",
    warranty: start?.condition === "neu" ? WARRANTIES[1]! : WARRANTIES[0]!,
    notes: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const set = (key: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const freeTradeIns = tradeIns.filter((t) => t.status === "bewertet");
  const openLeads = leads.filter((l) => l.status !== "gewonnen" && l.status !== "verloren");
  const tradeIn = freeTradeIns.find((t) => t.id === form.tradeInId);
  const n = (s: string) => Number(s.replace(",", ".")) || 0;
  const summary = { price: n(form.price), discount: n(form.discount), tradeInAmount: tradeIn?.offeredPrice ?? 0, deposit: n(form.deposit) };
  const vehicle = available.find((v) => v.id === form.vehicleId);

  const pickVehicle = (id: string) => {
    const v = available.find((x) => x.id === id);
    setForm((f) => ({ ...f, vehicleId: id, price: v?.price ? String(v.price) : f.price, warranty: v?.condition === "neu" ? WARRANTIES[1]! : f.warranty }));
  };
  const pickLead = (id: string) => {
    const l = leads.find((x) => x.id === id);
    setForm((f) => ({ ...f, leadId: id, buyerName: l?.name ?? f.buyerName, buyerPhone: l?.phone ?? f.buyerPhone, buyerEmail: l?.email ?? f.buyerEmail }));
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      onSaved(await api<SalesContract>("/autohaus/contracts", { method: "POST", body: form }));
    } catch (err) {
      setError(errorText(err));
      setSaving(false);
    }
  };

  return (
    <Dialog title="Neuer Kaufvertrag" onClose={onClose} wide>
      <form className="stack autohaus-dialog" onSubmit={submit}>
        {error && <p className="error" role="alert">{error}</p>}
        {available.length === 0 && <p className="notice">Es gibt kein freies Fahrzeug im Bestand.</p>}
        <div className="grid form-grid">
          <Field label="Fahrzeug" required wide hint={vehicle ? vehicleFacts(vehicle) : undefined}>
            <select value={form.vehicleId} onChange={(e) => pickVehicle(e.target.value)} required>
              <option value="">Fahrzeug wählen</option>
              {available.map((v) => <option key={v.id} value={v.id}>{vehicleLabel(v)} · {v.stockNumber}{v.price ? ` · ${euro(v.price)}` : ""}</option>)}
            </select>
          </Field>
        </div>

        <h3 className="card-subtitle">Käufer</h3>
        <div className="grid form-grid">
          {openLeads.length > 0 && (
            <Field label="Aus Interessenten übernehmen" wide>
              <select value={form.leadId} onChange={(e) => pickLead(e.target.value)}>
                <option value="">Neuer Kunde</option>
                {openLeads.map((l) => <option key={l.id} value={l.id}>{l.name}{l.vehicleLabel ? ` · ${l.vehicleLabel}` : ""}</option>)}
              </select>
            </Field>
          )}
          <Field label="Name oder Firma" required wide>
            <input value={form.buyerName} onChange={set("buyerName")} required />
          </Field>
          <Field label="Anschrift" wide>
            <textarea rows={2} value={form.buyerAddress} onChange={set("buyerAddress")} placeholder={"Straße Nr.\nPLZ Ort"} />
          </Field>
          <Field label="Telefon">
            <input type="tel" value={form.buyerPhone} onChange={set("buyerPhone")} />
          </Field>
          <Field label="E-Mail">
            <input type="email" value={form.buyerEmail} onChange={set("buyerEmail")} />
          </Field>
        </div>

        <h3 className="card-subtitle">Preis und Bezahlung</h3>
        <div className="grid form-grid">
          <Field label={`Kaufpreis brutto (${sym()})`} required>
            <input inputMode="decimal" value={form.price} onChange={set("price")} required />
          </Field>
          <Field label={`Nachlass (${sym()})`}>
            <input inputMode="decimal" value={form.discount} onChange={set("discount")} placeholder="0" />
          </Field>
          <Field label="Inzahlungnahme" hint={freeTradeIns.length ? undefined : "Bewertungen legst du unter „Inzahlungnahme“ an"}>
            <select value={form.tradeInId} onChange={set("tradeInId")} disabled={!freeTradeIns.length}>
              <option value="">Keine</option>
              {freeTradeIns.map((t) => <option key={t.id} value={t.id}>{t.make} {t.model}{t.ownerName ? ` (${t.ownerName})` : ""} · {euro(t.offeredPrice)}</option>)}
            </select>
          </Field>
          <Field label={`Anzahlung (${sym()})`}>
            <input inputMode="decimal" value={form.deposit} onChange={set("deposit")} placeholder="0" />
          </Field>
          <Field label="Zahlungsart">
            <select value={form.paymentMethod} onChange={set("paymentMethod")}>
              {Object.entries(PAYMENT_LABEL).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
            </select>
          </Field>
          <Field label="Übergabe am">
            <input type="date" value={form.deliveryDate} onChange={set("deliveryDate")} />
          </Field>
          <Field label="Gewährleistung" wide>
            <input list="autohaus-warranties" value={form.warranty} onChange={set("warranty")} />
            <datalist id="autohaus-warranties">{WARRANTIES.map((w) => <option key={w} value={w} />)}</datalist>
          </Field>
          <Field label="Vereinbarungen" wide>
            <textarea rows={2} value={form.notes} onChange={set("notes")} placeholder="z. B. neue HU vor Übergabe, Winterräder inklusive" />
          </Field>
        </div>

        <div className="autohaus-panel">
          <p className="autohaus-sum"><span>Kaufpreis nach Nachlass</span><span>{euro(contractTotal(summary))}</span></p>
          {summary.tradeInAmount > 0 && <p className="autohaus-sum"><span>Inzahlungnahme</span><span>− {euro(summary.tradeInAmount)}</span></p>}
          {summary.deposit > 0 && <p className="autohaus-sum"><span>Anzahlung</span><span>− {euro(summary.deposit)}</span></p>}
          <p className="autohaus-sum grand"><span>Noch zu zahlen</span><span>{euro(round2(contractBalance(summary)))}</span></p>
        </div>

        <div className="row gap autohaus-actions">
          <button type="button" className="button" onClick={onClose}>Abbrechen</button>
          <button type="submit" className="button primary" disabled={saving || !available.length}><Check size={18} /> {saving ? "Wird angelegt …" : "Vertrag anlegen"}</button>
        </div>
      </form>
    </Dialog>
  );
}
