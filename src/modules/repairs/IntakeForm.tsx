import { useEffect, useState, type FormEvent } from "react";
import { ArrowLeft, Check, ListChecks, ShieldCheck, Smartphone, Tags, User, UserCheck, Wallet } from "lucide-react";
import { api, ApiError } from "../../api";
import { Field, Link } from "../../components";
import { navigate } from "../../router";
import { LANGUAGES } from "../../i18n";
import {
  ACCESSORIES, DEVICE_TYPES, isValidImei, looksLikeImei, normalizeSerial, priceMatches,
  type RepairCustomer, type RepairErrors, type RepairIntake, type RepairOrder, type RepairPrice,
} from "../../../shared/repairs";
import { useRepairI18n } from "./i18n";
import { ChecksEditor, MoneyInput } from "./parts";

const BASE = "/app/handy-it";
const CLAIM_KEY = "ck-repairs-warranty-claim";

interface IntakePrefill {
  /** Garantiefall: Rechnungsnummer */
  ref?: string;
  customer: Pick<RepairCustomer, "name" | "phone" | "email">;
  customerId?: string;
  device?: RepairIntake["device"];
}

/** Annahme mit vorausgefüllten Daten öffnen (Garantiefall oder Kunde aus der Kartei). */
export function startIntake(claim: IntakePrefill) {
  try {
    sessionStorage.setItem(CLAIM_KEY, JSON.stringify(claim));
  } catch {
    // ohne Speicher eben leer
  }
  navigate(`${BASE}/neu`);
}

function takePrefill(): IntakePrefill | null {
  try {
    const raw = sessionStorage.getItem(CLAIM_KEY);
    sessionStorage.removeItem(CLAIM_KEY);
    return raw ? (JSON.parse(raw) as IntakePrefill) : null;
  } catch {
    return null;
  }
}

const BRANDS = ["Apple", "Samsung", "Xiaomi", "Google", "Huawei", "OnePlus", "Oppo", "Motorola", "Nokia", "Sony", "Lenovo", "HP", "Dell", "Asus", "Acer", "Microsoft", "Nintendo"];

export function IntakeForm({ editId }: { editId?: string }) {
  const { r, lang, repairError, euro } = useRepairI18n();
  const [customer, setCustomer] = useState<Omit<RepairCustomer, "id">>({ name: "", phone: "", email: "" });
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [known, setKnown] = useState<RepairCustomer | null>(null);
  const [suggestions, setSuggestions] = useState<RepairCustomer[]>([]);
  const [intake, setIntake] = useState<RepairIntake>({
    device: { type: "phone", brand: "", model: "", serial: "", color: "" },
    problem: "", accessories: [], accessoriesOther: "", condition: "", approvedUpToCents: 0, estimateCents: 0, depositCents: 0,
    dataNotice: false, dueDay: "", internalNote: "", customerLang: lang, warrantyRef: "", checks: {}, planned: [],
  });
  const [prices, setPrices] = useState<RepairPrice[]>([]);
  const [unlockCode, setUnlockCode] = useState("");
  const [hasUnlock, setHasUnlock] = useState(false);
  const [number, setNumber] = useState<number | null>(null);
  const [errors, setErrors] = useState<RepairErrors>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(!editId);

  useEffect(() => {
    if (!editId) return;
    api<{ order: RepairOrder }>(`/repairs/orders/${editId}`)
      .then(({ order }) => {
        const { id, orders, ...c } = order.customer;
        setCustomer(c);
        setCustomerId(id);
        setIntake(order.intake);
        setHasUnlock(order.hasUnlockCode);
        setNumber(order.number);
        setLoaded(true);
      })
      .catch((e) => setError(repairError(e)));
  }, [editId]);

  // Garantiefall aus der Garantie-Übersicht: Kunde und Gerät sind schon ausgefüllt
  useEffect(() => {
    if (editId) return;
    const claim = takePrefill();
    if (!claim) return;
    setCustomer({ name: claim.customer.name, phone: claim.customer.phone, email: claim.customer.email });
    if (claim.customerId) setCustomerId(claim.customerId);
    setIntake((i) => ({ ...i, device: { ...i.device, ...claim.device }, warrantyRef: claim.ref ?? "" }));
  }, [editId]);

  useEffect(() => {
    api<{ prices: RepairPrice[] }>("/repairs/prices").then((d) => setPrices(d.prices)).catch(() => {});
  }, []);

  // Bekannte Kunden vorschlagen, während Name oder Telefon getippt wird
  useEffect(() => {
    if (editId || customerId) return;
    const q = customer.phone.length >= 4 ? customer.phone : customer.name;
    if (q.trim().length < 2) return setSuggestions([]);
    const timer = setTimeout(() => {
      api<{ customers: RepairCustomer[] }>(`/repairs/customers?q=${encodeURIComponent(q)}`).then((d) => setSuggestions(d.customers)).catch(() => {});
    }, 250);
    return () => clearTimeout(timer);
  }, [customer.name, customer.phone, customerId]);

  const setDevice = (patch: Partial<RepairIntake["device"]>) => setIntake((i) => ({ ...i, device: { ...i.device, ...patch } }));
  const set = (patch: Partial<RepairIntake>) => setIntake((i) => ({ ...i, ...patch }));
  const money = (key: "estimateCents" | "approvedUpToCents" | "depositCents") => (cents: number | null) => {
    setErrors((e) => ({ ...e, price: cents === null ? "invalid" : undefined }));
    if (cents !== null) set({ [key]: cents });
  };

  const pickCustomer = (c: RepairCustomer) => {
    setCustomer({ name: c.name, phone: c.phone, email: c.email });
    setCustomerId(c.id);
    setKnown(c);
    setSuggestions([]);
  };

  // Passende Preise zum Gerät; Tippen merkt die Leistung vor und setzt den voraussichtlichen Preis
  const matchingPrices = intake.device.brand || intake.device.model ? prices.filter((p) => priceMatches(p, intake.device)).slice(0, 12) : [];
  const togglePlanned = (p: RepairPrice) => {
    const on = intake.planned.some((x) => x.priceId === p.id);
    const planned = on ? intake.planned.filter((x) => x.priceId !== p.id) : [...intake.planned, { priceId: p.id, name: p.service, cents: p.priceCents }];
    set({ planned, estimateCents: planned.reduce((sum, x) => sum + x.cents, 0) });
  };

  const serialWarning = looksLikeImei(intake.device.serial) && normalizeSerial(intake.device.serial).length === 15 && !isValidImei(intake.device.serial);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (errors.price) return;
    setBusy(true);
    setError("");
    setErrors({});
    try {
      const body = { customer, customerId, intake, ...(unlockCode || !editId ? { unlockCode } : {}) };
      const { order } = await api<{ order: RepairOrder }>(editId ? `/repairs/orders/${editId}` : "/repairs/orders", { method: editId ? "PUT" : "POST", body });
      navigate(`${BASE}/auftrag/${order.id}${editId ? "" : "?neu=1"}`);
    } catch (err) {
      if (err instanceof ApiError && err.errors) setErrors(err.errors as RepairErrors);
      setError(repairError(err));
      window.scrollTo({ top: 0, behavior: "smooth" });
    } finally {
      setBusy(false);
    }
  };

  const fieldError = (key: keyof RepairErrors) => (errors[key] ? r(`intake.errors.${key}`) : undefined);

  if (!loaded) return error ? <p className="error">{error}</p> : <p className="muted">…</p>;

  return (
    <form className="stack-lg repairs repair-form" onSubmit={submit} noValidate>
      <Link to={editId ? `${BASE}/auftrag/${editId}` : BASE} className="text-link back"><ArrowLeft size={16} className="flip-rtl" /> {r("order.back")}</Link>
      <h1 className="display">{editId ? r("intake.editTitle", { number: number ?? "" }) : r("intake.title")}</h1>
      {error && <p className="error" role="alert">{error}</p>}
      {intake.warrantyRef && (
        <p className="notice success"><ShieldCheck size={17} /> {r("order.warrantyClaim", { ref: intake.warrantyRef })}
          <button type="button" className="text-button" onClick={() => set({ warrantyRef: "" })}>{r("warranty.notAClaim")}</button>
        </p>
      )}

      <section className="card stack">
        <h2 className="card-title"><User size={20} /> {r("intake.customer")}</h2>
        {known && (
          <p className="notice success"><UserCheck size={17} /> {r("intake.customerFound", { n: known.orders ?? 0 })}
            <button type="button" className="text-button" onClick={() => (setKnown(null), setCustomerId(null), setCustomer({ name: "", phone: "", email: "" }))}>{r("intake.newCustomer")}</button>
          </p>
        )}
        <div className="grid form-grid">
          <Field label={r("intake.name")} error={fieldError("customerName")}>
            <input value={customer.name} autoComplete="off" onChange={(e) => setCustomer({ ...customer, name: e.target.value })} required />
          </Field>
          <Field label={r("intake.phone")} error={fieldError("contact")}>
            <input type="tel" value={customer.phone} autoComplete="off" onChange={(e) => setCustomer({ ...customer, phone: e.target.value })} />
          </Field>
          {suggestions.length > 0 && !customerId && (
            <div className="wide customer-suggestions">
              {suggestions.slice(0, 5).map((c) => (
                <button type="button" key={c.id} className="chip" onClick={() => pickCustomer(c)}>
                  <UserCheck size={14} /> {c.name}{c.phone ? ` · ${c.phone}` : ""}
                </button>
              ))}
            </div>
          )}
          <Field label={r("intake.email")} error={fieldError("email")} hint={r("intake.emailHint")}>
            <input type="email" value={customer.email} autoComplete="off" onChange={(e) => setCustomer({ ...customer, email: e.target.value })} />
          </Field>
          <Field label={r("intake.customerLang")}>
            <select value={intake.customerLang} onChange={(e) => set({ customerLang: e.target.value })}>
              {LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.name}</option>)}
            </select>
          </Field>
        </div>
      </section>

      <section className="card stack">
        <h2 className="card-title"><Smartphone size={20} /> {r("intake.device")}</h2>
        <div className="chips device-types">
          {DEVICE_TYPES.map((type) => (
            <button type="button" key={type} className={intake.device.type === type ? "chip active" : "chip"} onClick={() => setDevice({ type })}>
              {r(`devices.${type}`)}
            </button>
          ))}
        </div>
        <div className="grid form-grid">
          <Field label={r("intake.brand")} error={fieldError("model")}>
            <input value={intake.device.brand} list="repair-brands" onChange={(e) => setDevice({ brand: e.target.value })} />
          </Field>
          <Field label={r("intake.model")}>
            <input value={intake.device.model} onChange={(e) => setDevice({ model: e.target.value })} placeholder="iPhone 13" />
          </Field>
          <Field label={r("intake.serial")} hint={r("intake.serialHint")} error={serialWarning || errors.serial ? r("intake.errors.serial") : undefined}>
            <input value={intake.device.serial} onChange={(e) => setDevice({ serial: e.target.value })} autoComplete="off" spellCheck={false} />
          </Field>
          <Field label={r("intake.color")}>
            <input value={intake.device.color} onChange={(e) => setDevice({ color: e.target.value })} />
          </Field>
          <Field label={r("intake.unlockCode")} hint={hasUnlock && !unlockCode ? r("intake.unlockKeep") : r("intake.unlockHint")}>
            <input value={unlockCode} onChange={(e) => setUnlockCode(e.target.value)} autoComplete="off" spellCheck={false} placeholder={hasUnlock ? "••••" : ""} />
          </Field>
        </div>
        <datalist id="repair-brands">{BRANDS.map((b) => <option key={b} value={b} />)}</datalist>
        {matchingPrices.length > 0 && (
          <div className="field">
            <span className="field-label"><Tags size={15} /> {r("intake.pricesFor", { device: [intake.device.brand, intake.device.model].filter(Boolean).join(" ") })}</span>
            <div className="chips wrap">
              {matchingPrices.map((p) => {
                const on = intake.planned.some((x) => x.priceId === p.id);
                return (
                  <button type="button" key={p.id} aria-pressed={on} className={on ? "chip active" : "chip"} onClick={() => togglePlanned(p)}>
                    {on && <Check size={14} />} {p.service} · {euro(p.priceCents)}
                  </button>
                );
              })}
            </div>
            <small className="muted">{r("intake.pricesHint")}</small>
          </div>
        )}
        <Field label={r("intake.problem")} error={fieldError("problem")} wide>
          <textarea rows={3} value={intake.problem} onChange={(e) => set({ problem: e.target.value })} placeholder={r("intake.problemHint")} />
        </Field>
        <div className="field">
          <span className="field-label">{r("intake.accessories")}</span>
          <div className="chips wrap">
            {ACCESSORIES.map((a) => {
              const on = intake.accessories.includes(a);
              return (
                <button type="button" key={a} aria-pressed={on} className={on ? "chip active" : "chip"}
                  onClick={() => set({ accessories: on ? intake.accessories.filter((x) => x !== a) : [...intake.accessories, a] })}>
                  {on && <Check size={14} />} {r(`accessories.${a}`)}
                </button>
              );
            })}
          </div>
          <input value={intake.accessoriesOther} onChange={(e) => set({ accessoriesOther: e.target.value })} placeholder={r("intake.accessoriesOther")} aria-label={r("intake.accessoriesOther")} />
        </div>
        <Field label={r("intake.condition")} wide>
          <textarea rows={2} value={intake.condition} onChange={(e) => set({ condition: e.target.value })} placeholder={r("intake.conditionHint")} />
        </Field>
        <label className="check">
          <input type="checkbox" checked={intake.dataNotice} onChange={(e) => set({ dataNotice: e.target.checked })} /> {r("intake.dataNotice")}
        </label>
      </section>

      <section className="card stack">
        <h2 className="card-title"><ListChecks size={20} /> {r("checks.intakeTitle")}</h2>
        <p className="muted small">{r("checks.intakeText")}</p>
        <ChecksEditor type={intake.device.type} value={intake.checks} onChange={(checks) => set({ checks })} />
      </section>

      <section className="card stack">
        <h2 className="card-title"><Wallet size={20} /> {r("intake.money")}</h2>
        {errors.price && <p className="error">{r("intake.errors.price")}</p>}
        <div className="grid form-grid">
          <Field label={r("intake.estimate")}>
            <MoneyInput cents={intake.estimateCents} onChange={money("estimateCents")} />
          </Field>
          <Field label={r("intake.approvedUpTo")} hint={r("intake.approvedUpToHint")}>
            <MoneyInput cents={intake.approvedUpToCents} onChange={money("approvedUpToCents")} />
          </Field>
          <Field label={r("intake.deposit")}>
            <MoneyInput cents={intake.depositCents} onChange={money("depositCents")} />
          </Field>
          <Field label={r("intake.dueDay")}>
            <input type="date" value={intake.dueDay} onChange={(e) => set({ dueDay: e.target.value })} />
          </Field>
        </div>
        <Field label={r("intake.internalNote")} hint={r("intake.internalNoteHint")} wide>
          <textarea rows={2} value={intake.internalNote} onChange={(e) => set({ internalNote: e.target.value })} />
        </Field>
      </section>

      <div className="repair-form-actions">
        <button className="button primary" disabled={busy}><Check size={18} /> {editId ? r("intake.saveChanges") : r("intake.save")}</button>
      </div>
    </form>
  );
}
