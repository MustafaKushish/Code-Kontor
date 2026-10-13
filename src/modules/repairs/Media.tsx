import { useEffect, useState } from "react";
import { Camera, Check, Copy, MessageCircle, MessageSquareText, PenLine, Trash2, ZoomIn } from "lucide-react";
import { api } from "../../api";
import {
  MAX_PHOTOS, fillTemplate, internationalPhone,
  type MessageTemplate, type PhotoStage, type RepairOrder, type RepairPhoto, type RepairSettings,
} from "../../../shared/repairs";
import { useRepairI18n } from "./i18n";
import { Dialog, SignaturePad, deviceLabel, resizeImage } from "./parts";

const photoUrl = (orderId: string, photoId: string) => `/api/repairs/orders/${orderId}/photos/${photoId}`;

/** Passender Abschnitt für neue Fotos: vor der Reparatur, währenddessen, bei Ausgabe. */
const stageFor = (order: RepairOrder): PhotoStage =>
  ["received", "diagnosis", "quote"].includes(order.status) ? "intake" : ["ready", "notRepaired", "pickedUp"].includes(order.status) ? "output" : "repair";

/** Fotos zum Auftrag: Zustand bei Annahme, während der Reparatur und bei Ausgabe. */
export function PhotosCard({ order, isManager, onChange }: { order: RepairOrder; isManager: boolean; onChange: (photos: RepairPhoto[]) => void }) {
  const { r, dateTime, repairError } = useRepairI18n();
  const [stage, setStage] = useState<PhotoStage>(stageFor(order));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [open, setOpen] = useState<RepairPhoto | null>(null);

  const add = async (files: FileList | null) => {
    if (!files) return;
    setBusy(true);
    setError("");
    try {
      for (const file of [...files].slice(0, MAX_PHOTOS - order.photos.length)) {
        const data = await resizeImage(file);
        onChange((await api<{ photos: RepairPhoto[] }>(`/repairs/orders/${order.id}/photos`, { method: "POST", body: { stage, data } })).photos);
      }
    } catch (e) {
      setError(e instanceof Error && e.message === "tooLarge" ? r("photos.failed") : repairError(e));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (photo: RepairPhoto) => {
    if (!confirm(r("photos.removeConfirm"))) return;
    try {
      onChange((await api<{ photos: RepairPhoto[] }>(`/repairs/orders/${order.id}/photos/${photo.id}`, { method: "DELETE" })).photos);
      setOpen(null);
    } catch (e) {
      setError(repairError(e));
    }
  };

  return (
    <section className="card stack">
      <h2 className="card-title"><Camera size={20} /> {r("photos.title")}{order.photos.length > 0 && <span className="muted"> · {order.photos.length}</span>}</h2>
      {error && <p className="error">{error}</p>}
      {order.photos.length === 0 && <p className="muted small">{r("photos.empty")}</p>}
      {(["intake", "repair", "output"] as const).map((s) => {
        const list = order.photos.filter((p) => p.stage === s);
        if (!list.length) return null;
        return (
          <div key={s} className="stack-sm">
            <span className="field-label muted">{r(`photos.stages.${s}`)}</span>
            <div className="photo-grid">
              {list.map((p) => (
                <button key={p.id} type="button" className="photo-thumb" onClick={() => setOpen(p)} aria-label={r("photos.open")}>
                  <img src={photoUrl(order.id, p.id)} alt="" loading="lazy" />
                </button>
              ))}
            </div>
          </div>
        );
      })}
      {order.photos.length < MAX_PHOTOS && (
        <div className="row wrap gap">
          <select value={stage} onChange={(e) => setStage(e.target.value as PhotoStage)} aria-label={r("photos.stage")} className="photo-stage">
            {(["intake", "repair", "output"] as const).map((s) => <option key={s} value={s}>{r(`photos.stages.${s}`)}</option>)}
          </select>
          <label className={`button ${busy ? "disabled" : ""}`}>
            <Camera size={16} /> {busy ? "…" : r("photos.add")}
            <input type="file" accept="image/*" capture="environment" multiple hidden disabled={busy} onChange={(e) => (add(e.target.files), (e.target.value = ""))} />
          </label>
        </div>
      )}
      {open && (
        <Dialog title={`${r(`photos.stages.${open.stage}`)} · ${dateTime(open.at)}`} onClose={() => setOpen(null)} wide>
          <div className="stack">
            <img src={photoUrl(order.id, open.id)} alt="" className="photo-full" />
            <div className="row wrap gap">
              <a className="button" href={photoUrl(order.id, open.id)} target="_blank" rel="noreferrer"><ZoomIn size={16} /> {r("photos.original")}</a>
              {open.userName && <span className="muted small">{open.userName}</span>}
              {isManager && <button className="button danger push-end" onClick={() => remove(open)}><Trash2 size={16} /> {r("photos.remove")}</button>}
            </div>
          </div>
        </Dialog>
      )}
    </section>
  );
}

/** Unterschriften bei Annahme und Abholung; fehlt eine, kann sie nachgeholt werden. */
export function SignatureCard({ order, onSigned }: { order: RepairOrder; onSigned: (order: RepairOrder) => void }) {
  const { r, repairError } = useRepairI18n();
  const [signing, setSigning] = useState<"intake" | "pickup" | null>(null);
  const [data, setData] = useState<string | null>(null);
  const [error, setError] = useState("");

  const save = async () => {
    if (!signing || !data) return;
    try {
      onSigned((await api<{ order: RepairOrder }>(`/repairs/orders/${order.id}/signature`, { method: "PUT", body: { kind: signing, data } })).order);
      setSigning(null);
      setData(null);
    } catch (e) {
      setError(repairError(e));
    }
  };

  return (
    <section className="card stack-sm">
      <h2 className="card-title"><PenLine size={20} /> {r("signature.title")}</h2>
      <div className="signature-row">
        <span className="field-label muted">{r("signature.atIntake")}</span>
        {order.signature.intake ? <img src={order.signature.intake} alt={r("signature.atIntake")} className="signature-img" /> : (
          <button className="text-button" onClick={() => setSigning("intake")}>{r("signature.signNow")}</button>
        )}
      </div>
      {(order.status === "pickedUp" || order.signature.pickup) && (
        <div className="signature-row">
          <span className="field-label muted">{r("signature.atPickup")}</span>
          {order.signature.pickup ? <img src={order.signature.pickup} alt={r("signature.atPickup")} className="signature-img" /> : (
            <button className="text-button" onClick={() => setSigning("pickup")}>{r("signature.signNow")}</button>
          )}
        </div>
      )}
      {signing && (
        <Dialog title={signing === "intake" ? r("signature.intakeTitle") : r("signature.pickupTitle")} onClose={() => (setSigning(null), setData(null))}>
          <div className="stack">
            <p className="muted small">{signing === "intake" ? r("signature.intakeText") : r("signature.pickupText")}</p>
            {error && <p className="error">{error}</p>}
            <SignaturePad onChange={setData} />
            <button className="button primary" disabled={!data} onClick={save}><Check size={18} /> {r("signature.save")}</button>
          </div>
        </Dialog>
      )}
    </section>
  );
}

/** Mitgelieferte Vorlagen in der Sprache der App. */
export function defaultTemplates(r: (path: string) => string): MessageTemplate[] {
  return (["received", "quote", "waitingParts", "ready", "reminder"] as const).map((k) => ({ id: `default-${k}`, name: r(`messages.defaults.${k}.name`), text: r(`messages.defaults.${k}.text`) }));
}

/** Passende Vorlage zum Status vorschlagen. */
const SUGGEST: Record<string, string> = { received: "received", diagnosis: "received", quote: "quote", waitingParts: "waitingParts", ready: "ready", notRepaired: "ready" };

/**
 * Nachricht an den Kunden: Vorlage wählen, Text anpassen, dann WhatsApp oder SMS auf dem Gerät öffnen.
 * Gesendet wird vom Handy oder Rechner des Mitarbeiters; die App merkt sich nur, dass es geschah.
 */
export function MessageDialog({ order, statusUrl, toPayCents, company, onClose, onLogged }: {
  order: RepairOrder; statusUrl: string; toPayCents: number; company: string; onClose: () => void; onLogged: (order: RepairOrder) => void;
}) {
  const { r, euro } = useRepairI18n();
  const [settings, setSettings] = useState<RepairSettings | null>(null);
  const [templateId, setTemplateId] = useState("");
  const [text, setText] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    api<{ settings: RepairSettings }>("/repairs/settings").then((d) => setSettings(d.settings)).catch(() => setSettings(null));
  }, []);

  const templates = settings?.messages.length ? settings.messages : defaultTemplates(r);
  const vars = {
    name: order.customer.name, device: deviceLabel(order.intake.device), number: `#${order.number}`, status: r(`status.${order.status}`),
    link: statusUrl, total: euro(toPayCents), company,
  };
  const pick = (t: MessageTemplate) => (setTemplateId(t.id), setText(fillTemplate(t.text, vars)));

  // Beim Öffnen die Vorlage zum aktuellen Status wählen
  useEffect(() => {
    if (templateId || !templates.length) return;
    const suggested = templates.find((t) => t.id === `default-${SUGGEST[order.status]}`) ?? templates[0]!;
    pick(suggested);
  }, [settings]);

  const phone = internationalPhone(order.customer.phone, settings?.countryCode ?? "49");
  const name = templates.find((t) => t.id === templateId)?.name ?? "";
  const log = (channel: "whatsapp" | "sms" | "copy") =>
    api<{ order: RepairOrder }>(`/repairs/orders/${order.id}/message`, { method: "POST", body: { channel, name } }).then((d) => onLogged(d.order)).catch(() => {});

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      log("copy");
    } catch {
      prompt("", text);
    }
  };

  return (
    <Dialog title={r("messages.title")} onClose={onClose} wide>
      <div className="stack">
        <div className="chips wrap">
          {templates.map((t) => <button type="button" key={t.id} className={templateId === t.id ? "chip active" : "chip"} onClick={() => pick(t)}>{t.name}</button>)}
        </div>
        <textarea rows={6} value={text} onChange={(e) => setText(e.target.value)} aria-label={r("messages.text")} />
        {!phone && <p className="notice">{r("messages.noPhone")}</p>}
        <div className="row wrap gap">
          {phone && (
            <a className="button primary whatsapp" href={`https://wa.me/${phone}?text=${encodeURIComponent(text)}`} target="_blank" rel="noreferrer" onClick={() => log("whatsapp")}>
              <MessageCircle size={17} /> WhatsApp
            </a>
          )}
          {phone && (
            <a className="button" href={`sms:+${phone}?body=${encodeURIComponent(text)}`} onClick={() => log("sms")}>
              <MessageSquareText size={17} /> {r("messages.sms")}
            </a>
          )}
          <button type="button" className="button" onClick={copy}>{copied ? <><Check size={16} /> {r("order.copied")}</> : <><Copy size={16} /> {r("messages.copy")}</>}</button>
        </div>
        <p className="muted small">{r("messages.hint")}</p>
      </div>
    </Dialog>
  );
}
