import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Check, Eraser, Minus, X } from "lucide-react";
import { CHECKS_FOR, MAX_PHOTO_CHARS, parseEuro, type CheckItem, type CheckList, type CheckResult, type DeviceType, type RepairDevice, type RepairStatus } from "../../../shared/repairs";
import { centsToInput, useRepairI18n } from "./i18n";

const STATUS_TONE: Record<RepairStatus, string> = {
  received: "neutral",
  diagnosis: "info",
  quote: "warn",
  waitingParts: "warn",
  repairing: "info",
  ready: "ok",
  notRepaired: "bad",
  pickedUp: "done",
  canceled: "done",
};

export function StatusPill({ status }: { status: RepairStatus }) {
  const { r } = useRepairI18n();
  return <span className={`pill repair-status tone-${STATUS_TONE[status]}`}>{r(`status.${status}`)}</span>;
}

export const deviceLabel = (d: Pick<RepairDevice, "brand" | "model">) => [d.brand, d.model].filter(Boolean).join(" ") || "–";

/** Eingabe für Euro-Beträge; gibt Cent zurück (null bei ungültiger Eingabe). */
export function MoneyInput({ cents, onChange, id, placeholder }: { cents: number; onChange: (cents: number | null) => void; id?: string; placeholder?: string }) {
  const [text, setText] = useState(centsToInput(cents));
  useEffect(() => {
    if (parseEuro(text) !== cents) setText(centsToInput(cents));
  }, [cents]);
  return (
    <span className="money-input">
      <input id={id} inputMode="decimal" value={text} placeholder={placeholder ?? "0,00"} onChange={(e) => (setText(e.target.value), onChange(parseEuro(e.target.value)))} />
      <span aria-hidden>€</span>
    </span>
  );
}

export function Dialog({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const { r } = useRepairI18n();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return createPortal(
    <div className="repair-dialog-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`repair-dialog card ${wide ? "wide" : ""}`} role="dialog" aria-modal aria-label={title}>
        <div className="section-head">
          <h2>{title}</h2>
          <button className="icon-button" onClick={onClose} aria-label={r("print.close")}><X size={20} /></button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}

const NEXT_RESULT: Record<CheckResult | "none", CheckResult | undefined> = { none: "ok", ok: "fail", fail: "untested", untested: undefined };

/**
 * Funktions-Check: jeder Punkt wird durch Tippen ok → defekt → nicht prüfbar → leer geschaltet.
 * „Alles ok“ setzt alle offenen Punkte auf ok.
 */
export function ChecksEditor({ type, value, onChange }: { type: DeviceType; value: CheckList; onChange: (v: CheckList) => void }) {
  const { r } = useRepairI18n();
  const items = CHECKS_FOR[type];
  const cycle = (item: CheckItem) => {
    const next = NEXT_RESULT[value[item] ?? "none"];
    const copy = { ...value };
    if (next) copy[item] = next;
    else delete copy[item];
    onChange(copy);
  };
  return (
    <div className="stack-sm">
      <div className="checks-grid">
        {items.map((item) => {
          const v = value[item];
          return (
            <button type="button" key={item} className={`check-chip ${v ?? ""}`} onClick={() => cycle(item)} aria-label={`${r(`checks.items.${item}`)}: ${v ? r(`checks.result.${v}`) : r("checks.open")}`}>
              <span className="check-mark" aria-hidden>{v === "ok" ? <Check size={14} /> : v === "fail" ? <X size={14} /> : v === "untested" ? <Minus size={14} /> : null}</span>
              {r(`checks.items.${item}`)}
            </button>
          );
        })}
      </div>
      <div className="row wrap gap">
        <button type="button" className="text-button" onClick={() => onChange({ ...Object.fromEntries(items.map((i) => [i, "ok"])), ...Object.fromEntries(Object.entries(value).filter(([, v]) => v !== "ok")) })}>{r("checks.allOk")}</button>
        <button type="button" className="text-button" onClick={() => onChange(Object.fromEntries(items.map((i) => [i, "untested"])))}>{r("checks.noPower")}</button>
        <small className="muted">{r("checks.hint")}</small>
      </div>
    </div>
  );
}

/** Kurze Anzeige: defekte Punkte zuerst, dann wie viele ok sind. */
export function ChecksSummary({ value, compare }: { value: CheckList; compare?: CheckList | null }) {
  const { r } = useRepairI18n();
  const entries = Object.entries(value) as [CheckItem, CheckResult][];
  if (!entries.length) return <span className="muted">{r("checks.none")}</span>;
  const fails = entries.filter(([, v]) => v === "fail").map(([k]) => k);
  const untested = entries.filter(([, v]) => v === "untested").length;
  const ok = entries.filter(([, v]) => v === "ok").length;
  // Was bei Annahme ging und jetzt nicht mehr: deutlich markieren
  const worse = compare ? fails.filter((k) => compare[k] === "ok") : [];
  return (
    <span className="checks-summary">
      {fails.map((k) => <span key={k} className={`pill ${worse.includes(k) ? "neg" : "warn"}`}><X size={12} /> {r(`checks.items.${k}`)}</span>)}
      {ok > 0 && <span className="pill pos"><Check size={12} /> {r("checks.okCount", { n: ok })}</span>}
      {untested > 0 && <span className="pill">{r("checks.untestedCount", { n: untested })}</span>}
    </span>
  );
}

/** Foto im Browser verkleinern, damit es schnell hochlädt und wenig Platz braucht. */
export async function resizeImage(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  for (const [max, quality] of [[1600, 0.8], [1280, 0.7], [960, 0.6]] as const) {
    const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const url = canvas.toDataURL("image/jpeg", quality);
    if (url.length <= MAX_PHOTO_CHARS) return url;
  }
  throw new Error("tooLarge");
}

/**
 * Unterschriftenfeld zum Unterschreiben mit Finger oder Stift.
 * Gibt nach jedem Strich ein PNG als Data-URL zurück, null wenn leer.
 */
export function SignaturePad({ onChange, label }: { onChange: (dataUrl: string | null) => void; label?: string }) {
  const { r } = useRepairI18n();
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [empty, setEmpty] = useState(true);

  useEffect(() => {
    const c = canvas.current!;
    c.width = 900;
    c.height = 300;
    const ctx = c.getContext("2d")!;
    ctx.lineWidth = 4;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#111827";
  }, []);

  const point = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const rect = canvas.current!.getBoundingClientRect();
    return { x: ((e.clientX - rect.left) / rect.width) * canvas.current!.width, y: ((e.clientY - rect.top) / rect.height) * canvas.current!.height };
  };
  const start = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    canvas.current!.setPointerCapture(e.pointerId);
    drawing.current = true;
    const ctx = canvas.current!.getContext("2d")!;
    const { x, y } = point(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 0.1, y + 0.1);
    ctx.stroke();
  };
  const move = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const ctx = canvas.current!.getContext("2d")!;
    const { x, y } = point(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  };
  const end = () => {
    if (!drawing.current) return;
    drawing.current = false;
    setEmpty(false);
    onChange(canvas.current!.toDataURL("image/png"));
  };
  const clear = () => {
    const c = canvas.current!;
    c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
    setEmpty(true);
    onChange(null);
  };

  return (
    <div className="signature-pad">
      <canvas ref={canvas} aria-label={label ?? r("signature.pad")} onPointerDown={start} onPointerMove={move} onPointerUp={end} onPointerCancel={end} onPointerLeave={end} />
      <div className="signature-foot">
        <span className="muted small">{empty ? r("signature.hint") : "✓"}</span>
        {!empty && <button type="button" className="text-button" onClick={clear}><Eraser size={15} /> {r("signature.clear")}</button>}
      </div>
    </div>
  );
}
