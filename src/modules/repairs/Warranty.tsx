import { useEffect, useState } from "react";
import { Search, ShieldAlert, ShieldCheck, ShieldX } from "lucide-react";
import { api } from "../../api";
import { Link } from "../../components";
import type { WarrantyRow } from "../../../shared/repairs";
import { useRepairI18n } from "./i18n";
import { startIntake } from "./IntakeForm";
import { deviceLabel } from "./parts";

type Filter = "active" | "expired" | "all";

/** Alle Garantien aus Reparaturen und verkauften Gebrauchtgeräten; ein Garantiefall wird als neue Annahme angelegt. */
export function WarrantyTab() {
  const { r, day, repairError } = useRepairI18n();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("active");
  const [rows, setRows] = useState<WarrantyRow[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => {
      api<{ warranties: WarrantyRow[] }>(`/repairs/warranties?q=${encodeURIComponent(query)}`)
        .then((d) => (setRows(d.warranties), setError("")))
        .catch((e) => setError(repairError(e)));
    }, query ? 250 : 0);
    return () => clearTimeout(timer);
  }, [query]);

  const today = new Date().toLocaleDateString("en-CA");
  const soon = new Date(Date.now() + 30 * 86_400_000).toLocaleDateString("en-CA");
  const shown = (rows ?? []).filter((w) => filter === "all" || (filter === "active" ? w.until >= today : w.until < today));
  const activeCount = (rows ?? []).filter((w) => w.until >= today).length;

  const claim = (w: WarrantyRow) =>
    startIntake({
      ref: w.invoice,
      customer: w.customer,
      device: { type: w.device.type, brand: w.device.brand, model: w.device.model, serial: w.device.serial, color: w.device.color },
    });

  return (
    <div className="stack">
      <p className="muted">{r("warranty.intro")}</p>
      <div className="toolbar">
        <label className="search">
          <Search size={18} />
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={r("warranty.search")} aria-label={r("warranty.search")} />
        </label>
        <div className="chips" role="tablist">
          {(["active", "expired", "all"] as const).map((f) => (
            <button key={f} role="tab" aria-selected={filter === f} className={filter === f ? "chip active" : "chip"} onClick={() => setFilter(f)}>
              {r(`warranty.filter.${f}`)}{f === "active" && rows ? ` · ${activeCount}` : ""}
            </button>
          ))}
        </div>
      </div>
      {error && <p className="error">{error}</p>}
      {rows && (
        <section className="card list-card">
          {shown.length === 0 && <p className="empty muted">{query ? r("warranty.noMatch") : r("warranty.empty")}</p>}
          {shown.map((w) => {
            const active = w.until >= today;
            const ending = active && w.until <= soon;
            const Icon = !active ? ShieldX : ending ? ShieldAlert : ShieldCheck;
            return (
              <div key={`${w.source}-${w.refId}`} className="list-row warranty-row">
                <span className={`warranty-icon ${!active ? "off" : ending ? "warn" : ""}`}><Icon size={18} /></span>
                <span className="list-main">
                  <strong>{deviceLabel(w.device)}</strong>
                  <small className="muted">
                    {[w.customer.name, w.customer.phone, w.device.serial].filter(Boolean).join(" · ")}
                  </small>
                  <small className="muted">
                    {r(`warranty.source.${w.source}`)} · {w.source === "repair"
                      ? <Link to={`/app/handy-it/auftrag/${w.refId}`} className="text-link">{w.invoice}</Link>
                      : `${w.invoice} · ${w.label}`}
                  </small>
                </span>
                <span className="part-row-meta">
                  <span className={`pill ${active ? (ending ? "warn" : "pos") : ""}`}>{active ? r("warranty.until", { day: day(w.until) }) : r("warranty.expired", { day: day(w.until) })}</span>
                  {active && <button className="button small-button" onClick={() => claim(w)}>{r("warranty.claim")}</button>}
                </span>
              </div>
            );
          })}
        </section>
      )}
    </div>
  );
}
