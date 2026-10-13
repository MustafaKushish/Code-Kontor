import { useEffect, useState, type FormEvent } from "react";
import { Plus, Trash2 } from "lucide-react";
import { api } from "../../api";
import { Field, Link } from "../../components";
import type { Loaner } from "../../../shared/repairs";
import { useRepairI18n } from "./i18n";
import { Dialog } from "./parts";

/** Leihgeräte, die Kunden während einer Reparatur bekommen. */
export function LoanersPanel({ isManager }: { isManager: boolean }) {
  const { r, day, repairError } = useRepairI18n();
  const [loaners, setLoaners] = useState<Loaner[] | null>(null);
  const [editing, setEditing] = useState<Loaner | "new" | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api<{ loaners: Loaner[] }>("/repairs/loaners").then((d) => setLoaners(d.loaners)).catch((e) => setError(repairError(e)));
  }, []);

  const free = (loaners ?? []).filter((l) => !l.orderId).length;

  return (
    <div className="stack">
      <p className="muted">{r("loaner.intro")}</p>
      <div className="row wrap gap">
        {loaners && loaners.length > 0 && <span className="muted">{r("loaner.freeCount", { n: free, total: loaners.length })}</span>}
        <button className="button primary push-end" onClick={() => setEditing("new")}><Plus size={18} /> {r("loaner.add")}</button>
      </div>
      {error && <p className="error">{error}</p>}
      {loaners && (
        <section className="card list-card">
          {loaners.length === 0 && <p className="empty muted">{r("loaner.empty")}</p>}
          {loaners.map((l) => (
            <div key={l.id} className="list-row">
              <button className="list-main plain-button" onClick={() => setEditing(l)}>
                <strong>{l.name}</strong>
                <small className="muted">{[l.serial, l.note].filter(Boolean).join(" · ")}</small>
              </button>
              {l.orderId ? (
                <Link to={`/app/handy-it/auftrag/${l.orderId}`} className="pill warn">{r("loaner.lentTo", { number: l.orderNumber ?? "", name: l.customerName ?? "" })}{l.lentAt ? ` · ${day(l.lentAt)}` : ""}</Link>
              ) : (
                <span className="pill pos">{r("loaner.available")}</span>
              )}
            </div>
          ))}
        </section>
      )}
      {editing && (
        <LoanerDialog
          loaner={editing === "new" ? null : editing}
          isManager={isManager}
          onClose={() => setEditing(null)}
          onSaved={(list) => (setLoaners(list), setEditing(null))}
        />
      )}
    </div>
  );
}

function LoanerDialog({ loaner, isManager, onClose, onSaved }: { loaner: Loaner | null; isManager: boolean; onClose: () => void; onSaved: (l: Loaner[]) => void }) {
  const { r, repairError } = useRepairI18n();
  const [name, setName] = useState(loaner?.name ?? "");
  const [serial, setSerial] = useState(loaner?.serial ?? "");
  const [note, setNote] = useState(loaner?.note ?? "");
  const [error, setError] = useState("");

  const call = async (fn: () => Promise<{ loaners: Loaner[] }>) => {
    setError("");
    try {
      onSaved((await fn()).loaners);
    } catch (e) {
      setError(repairError(e));
    }
  };
  const save = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setError(r("intake.errors.customerName"));
    call(() => api(loaner ? `/repairs/loaners/${loaner.id}` : "/repairs/loaners", { method: loaner ? "PUT" : "POST", body: { name, serial, note } }));
  };

  return (
    <Dialog title={loaner ? loaner.name : r("loaner.add")} onClose={onClose}>
      <form className="stack" onSubmit={save}>
        {error && <p className="error">{error}</p>}
        <Field label={r("loaner.name")}><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Samsung Galaxy A14" autoFocus /></Field>
        <Field label={r("intake.serial")}><input value={serial} onChange={(e) => setSerial(e.target.value)} autoComplete="off" spellCheck={false} /></Field>
        <Field label={r("loaner.note")}><input value={note} onChange={(e) => setNote(e.target.value)} placeholder={r("loaner.noteHint")} /></Field>
        <div className="row wrap gap">
          <button className="button primary">{r("stock.save")}</button>
          {loaner && isManager && !loaner.orderId && (
            <button type="button" className="button danger" onClick={() => confirm(r("loaner.removeConfirm", { name: loaner.name })) && call(() => api(`/repairs/loaners/${loaner.id}`, { method: "DELETE" }))}>
              <Trash2 size={16} /> {r("loaner.remove")}
            </button>
          )}
        </div>
      </form>
    </Dialog>
  );
}
