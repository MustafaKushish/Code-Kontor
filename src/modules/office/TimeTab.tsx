import { useEffect, useRef, useState } from "react";
import { Play, Pause, Square, Plus, Clock, Trash2, Check, Receipt, Printer, Wallet, Hourglass } from "lucide-react";
import { api, type Me } from "../../api";
import { Field } from "../../components";
import { Dialog } from "../../pos/ui";
import type { OfficeClient, OfficeProject, OfficeTimeEntry, LineItem, OfficeTask, RoleRate, OfficeSettings } from "../../../shared/office";
import { useOfficeI18n } from "./i18n";
import { TimesheetPrint } from "./TimesheetPrint";

export function TimeTab({
  me,
  initialProjectId,
  onNavigateToNewInvoiceWithItems,
}: {
  me: Me;
  initialProjectId?: string;
  onNavigateToNewInvoiceWithItems?: (clientId: string, projectId: string | null, items: LineItem[]) => void;
}) {
  const { o, euro, day, officeError } = useOfficeI18n();
  const [times, setTimes] = useState<OfficeTimeEntry[]>([]);
  const [projects, setProjects] = useState<OfficeProject[]>([]);
  const [clients, setClients] = useState<OfficeClient[]>([]);
  const [projectTasks, setProjectTasks] = useState<OfficeTask[]>([]);
  const [roleRates, setRoleRates] = useState<RoleRate[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProjectId, setSelectedProjectId] = useState<string>(initialProjectId || "all");
  const [billableFilter, setBillableFilter] = useState<string>("all");
  const [showTimesheet, setShowTimesheet] = useState(false);

  // Live Timer State
  const [timerRunning, setTimerRunning] = useState(false);
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [timerProjectId, setTimerProjectId] = useState<string>("");
  const [timerDescription, setTimerDescription] = useState("");
  const timerRef = useRef<number | null>(null);

  // Manual Log Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [form, setForm] = useState({
    projectId: "",
    taskId: "",
    roleName: "",
    hourlyRateCents: 0,
    day: new Date().toISOString().slice(0, 10),
    hoursInput: "1.0",
    description: "",
    billable: true,
  });

  const loadData = async () => {
    try {
      const [tRes, pRes, cRes, sRes] = await Promise.all([
        api<{ times: OfficeTimeEntry[] }>(
          `/office/times${selectedProjectId !== "all" ? `?projectId=${selectedProjectId}` : ""}`,
        ),
        api<{ projects: OfficeProject[] }>("/office/projects"),
        api<{ clients: OfficeClient[] }>("/office/clients"),
        api<{ settings: OfficeSettings }>("/office/settings").catch(() => ({ settings: { roleRates: [] } as unknown as OfficeSettings })),
      ]);
      setTimes(tRes.times);
      setProjects(pRes.projects);
      setClients(cRes.clients);
      setRoleRates(sRes.settings.roleRates || []);

      if (pRes.projects.length > 0 && !timerProjectId) {
        const defaultProj = initialProjectId || pRes.projects[0].id;
        setTimerProjectId(defaultProj);
        setForm((f) => ({
          ...f,
          projectId: defaultProj,
          hourlyRateCents: pRes.projects.find((p) => p.id === defaultProj)?.hourlyRateCents || 9500,
        }));
      }
    } catch (err) {
      setErrorMsg(officeError(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [selectedProjectId]);

  useEffect(() => {
    if (form.projectId) {
      api<{ tasks: OfficeTask[] }>(`/office/tasks?projectId=${form.projectId}`)
        .then((r) => setProjectTasks(r.tasks))
        .catch(() => setProjectTasks([]));
    }
  }, [form.projectId]);

  // Live Timer tick
  useEffect(() => {
    if (timerRunning) {
      timerRef.current = window.setInterval(() => {
        setTimerSeconds((s) => s + 1);
      }, 1000);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [timerRunning]);

  const handleStartTimer = () => {
    if (!timerProjectId && projects.length > 0) {
      setTimerProjectId(projects[0].id);
    }
    setTimerRunning(true);
  };

  const handlePauseTimer = () => {
    setTimerRunning(false);
  };

  const handleStopAndSaveTimer = async () => {
    if (timerSeconds < 60) {
      if (!confirm("Weniger als 1 Minute vergangen. Trotzdem speichern (1 Min)?")) {
        setTimerRunning(false);
        setTimerSeconds(0);
        return;
      }
    }
    const minutes = Math.max(1, Math.round(timerSeconds / 60));
    setTimerRunning(false);
    try {
      await api("/office/times", {
        method: "POST",
        body: {
          projectId: timerProjectId,
          day: new Date().toISOString().slice(0, 10),
          minutes,
          description: timerDescription || "Projektarbeit",
          billable: true,
        },
      });
      setTimerSeconds(0);
      setTimerDescription("");
      await loadData();
    } catch (err) {
      alert(officeError(err));
    }
  };

  const handleSaveManual = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    try {
      let minutes = 0;
      if (form.hoursInput.includes(":")) {
        const [h, m] = form.hoursInput.split(":");
        minutes = (parseInt(h, 10) || 0) * 60 + (parseInt(m, 10) || 0);
      } else {
        minutes = Math.round((parseFloat(form.hoursInput) || 0) * 60);
      }
      if (minutes <= 0) {
        setErrorMsg("Bitte eine gültige Dauer angeben.");
        return;
      }

      await api("/office/times", {
        method: "POST",
        body: {
          projectId: form.projectId,
          taskId: form.taskId || null,
          roleName: form.roleName || "",
          hourlyRateCents: form.hourlyRateCents > 0 ? form.hourlyRateCents : undefined,
          day: form.day,
          minutes,
          description: form.description,
          billable: form.billable,
        },
      });
      setModalOpen(false);
      setForm((f) => ({ ...f, description: "", hoursInput: "1.0", taskId: "", roleName: "" }));
      await loadData();
    } catch (err) {
      setErrorMsg(officeError(err));
    }
  };

  const handleDeleteTime = async (id: string) => {
    if (!confirm(o("common.confirmDelete"))) return;
    try {
      await api(`/office/times/${id}`, { method: "DELETE" });
      await loadData();
    } catch (err) {
      alert(officeError(err));
    }
  };

  const filteredTimes = times.filter((t) => {
    if (billableFilter === "unbilled") return t.billable && !t.billedInvoiceId;
    if (billableFilter === "billed") return Boolean(t.billedInvoiceId);
    if (billableFilter === "nonbillable") return !t.billable;
    return true;
  });

  // Aggregates
  const unbilledEntries = times.filter((t) => t.billable && !t.billedInvoiceId);
  const unbilledMinutes = unbilledEntries.reduce((sum, t) => sum + t.minutes, 0);
  const unbilledCents = unbilledEntries.reduce((sum, t) => sum + Math.round((t.minutes * t.hourlyRateCents) / 60), 0);
  const totalMonthMinutes = times.reduce((sum, t) => sum + t.minutes, 0);

  const formatTimerDisplay = (sec: number) => {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  };

  const handleInvoiceUnbilled = () => {
    if (unbilledEntries.length === 0) return;
    // Find client ID of first project or entries
    const firstClient = unbilledEntries[0].clientId;
    const items: LineItem[] = unbilledEntries.map((entry) => ({
      id: crypto.randomUUID(),
      title: `${entry.projectName || "Projektarbeit"}: ${entry.description || "Dienstleistung"}`,
      description: `Leistungsdatum: ${day(entry.day)} (${(entry.minutes / 60).toFixed(2)} Std)`,
      qty: parseFloat((entry.minutes / 60).toFixed(2)),
      unit: "Std",
      unitCents: entry.hourlyRateCents,
      vatRate: 19,
      totalCents: Math.round((entry.minutes * entry.hourlyRateCents) / 60),
    }));

    if (onNavigateToNewInvoiceWithItems) {
      onNavigateToNewInvoiceWithItems(firstClient, unbilledEntries[0].projectId, items);
    }
  };

  return (
    <div className="stack">
      {/* Stoppuhr */}
      <section className="card office-timer">
        <div className="row gap">
          <span className={`office-timer-clock ${timerRunning ? "running" : ""}`}>{formatTimerDisplay(timerSeconds)}</span>
          {timerRunning && <span className="pill success">Läuft...</span>}
        </div>

        <div className="office-timer-inputs">
          <select value={timerProjectId} onChange={(e) => setTimerProjectId(e.target.value)} disabled={timerRunning} aria-label={o("time.fields.project")}>
            {projects.length === 0 && <option value="">Keine Projekte vorhanden</option>}
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name} ({p.clientName})</option>
            ))}
          </select>
          <input
            type="text"
            placeholder="Was tun Sie gerade?"
            aria-label={o("time.fields.description")}
            value={timerDescription}
            onChange={(e) => setTimerDescription(e.target.value)}
          />
        </div>

        <div className="row wrap gap">
          {!timerRunning ? (
            <button className="button primary" onClick={handleStartTimer} disabled={projects.length === 0}>
              <Play size={18} /> {timerSeconds > 0 ? "Fortsetzen" : o("time.timerStart")}
            </button>
          ) : (
            <button className="button" onClick={handlePauseTimer}>
              <Pause size={18} /> Pausieren
            </button>
          )}
          {timerSeconds > 0 && (
            <button className="button success-button" onClick={handleStopAndSaveTimer}>
              <Square size={17} /> {o("time.timerStop")} & Buchen
            </button>
          )}
        </div>
      </section>

      {/* Kennzahlen */}
      <div className="office-stats">
        <div className="tile stat-tile">
          <span className="stat-icon"><Wallet size={18} /></span>
          <strong>{euro(unbilledCents)}</strong><small>{o("time.unbilled")} · {(unbilledMinutes / 60).toFixed(1)} Stunden</small>
        </div>
        <div className="tile stat-tile">
          <span className="stat-icon"><Clock size={18} /></span>
          <strong>{(totalMonthMinutes / 60).toFixed(1)} Std</strong><small>Erfasste Stunden (Filter)</small>
        </div>
        <div className="tile stat-tile">
          <span className="stat-icon"><Hourglass size={18} /></span>
          <strong>{unbilledEntries.length}</strong><small>Offene Zeiteinträge</small>
        </div>
      </div>

      <div className="toolbar">
        <div className="chips" role="tablist">
          {[
            { id: "all", label: "Alle Einträge" },
            { id: "unbilled", label: "Offen zur Abrechnung" },
            { id: "billed", label: "Bereits abgerechnet" },
            { id: "nonbillable", label: "Nicht abrechenbar" },
          ].map((tab) => (
            <button
              key={tab.id}
              role="tab"
              aria-selected={billableFilter === tab.id}
              className={billableFilter === tab.id ? "chip active" : "chip"}
              onClick={() => setBillableFilter(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="row wrap gap office-filters">
          {projects.length > 0 && (
            <select value={selectedProjectId} onChange={(e) => setSelectedProjectId(e.target.value)} aria-label={o("time.fields.project")}>
              <option value="all">Alle Projekte</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          )}
          <div className="row wrap gap push-end">
            <button
              className="button"
              onClick={() => setShowTimesheet(true)}
              disabled={filteredTimes.length === 0}
              title="Druckbaren Leistungsnachweis / Timesheet erstellen"
            >
              <Printer size={18} /> Leistungsnachweis
            </button>
            {unbilledEntries.length > 0 && onNavigateToNewInvoiceWithItems && (
              <button className="button" onClick={handleInvoiceUnbilled} title="Rechnung aus offenen Zeiten generieren">
                <Receipt size={18} /> In Rechnung stellen
              </button>
            )}
            <button className="button primary" onClick={() => setModalOpen(true)}>
              <Plus size={18} /> {o("time.logTime")}
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <p className="muted">Laden...</p>
      ) : (
        <section className="card list-card">
          {filteredTimes.length === 0 && <p className="empty muted">{o("time.noEntries")}</p>}
          {filteredTimes.map((t) => {
            const feeCents = Math.round((t.minutes * t.hourlyRateCents) / 60);
            return (
              <div key={t.id} className="list-row office-row">
                <span className="office-date">{day(t.day)}</span>
                <span className="list-main">
                  <strong>{t.description || "—"}</strong>
                  <small className="muted">{t.projectName} · {t.clientName} · {t.userName || "Mitarbeiter"}</small>
                </span>
                <span className="office-row-meta">
                  <strong>{t.billable ? euro(feeCents) : "—"}</strong>
                  <small className="muted">{(t.minutes / 60).toFixed(2)}h · {t.minutes} Min · {euro(t.hourlyRateCents)}</small>
                  {t.billedInvoiceId ? (
                    <span className="pill success">Abgerechnet</span>
                  ) : t.billable ? (
                    <span className="pill warn">Offen</span>
                  ) : (
                    <span className="pill">Intern</span>
                  )}
                </span>
                {!t.billedInvoiceId ? (
                  <button className="icon-button danger" onClick={() => handleDeleteTime(t.id)} title={o("common.delete")} aria-label={o("common.delete")}>
                    <Trash2 size={16} />
                  </button>
                ) : (
                  <span className="icon-spacer" />
                )}
              </div>
            );
          })}
        </section>
      )}

      {/* Dialog: Zeit manuell erfassen */}
      {modalOpen && (
        <Dialog title={o("time.logTime")} onClose={() => setModalOpen(false)} wide>
          <form onSubmit={handleSaveManual} className="stack office-dialog">
            {errorMsg && <p className="error" role="alert">{errorMsg}</p>}
            <div className="grid form-grid">
              <Field label={o("time.fields.project")} required wide>
                <select
                  required
                  value={form.projectId}
                  onChange={(e) => {
                    const pId = e.target.value;
                    const proj = projects.find((p) => p.id === pId);
                    setForm({
                      ...form,
                      projectId: pId,
                      taskId: "",
                      hourlyRateCents: proj?.hourlyRateCents || 9500,
                    });
                  }}
                >
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>{p.name} ({p.clientName})</option>
                  ))}
                </select>
              </Field>

              {projectTasks.length > 0 && (
                <Field label="Aufgabe / Meilenstein (optional)" wide>
                  <select value={form.taskId} onChange={(e) => setForm({ ...form, taskId: e.target.value })}>
                    <option value="">Keine Aufgabe zuordnen (Allgemein)</option>
                    {projectTasks.map((t) => (
                      <option key={t.id} value={t.id}>{t.title} {t.completed ? "✓ (Erledigt)" : ""}</option>
                    ))}
                  </select>
                </Field>
              )}

              {roleRates.length > 0 && (
                <Field label="Rolle / Tätigkeitsstufe">
                  <select
                    value={form.roleName}
                    onChange={(e) => {
                      const rName = e.target.value;
                      const match = roleRates.find((r) => r.name === rName);
                      setForm({
                        ...form,
                        roleName: rName,
                        hourlyRateCents: match ? match.hourlyRateCents : form.hourlyRateCents,
                      });
                    }}
                  >
                    <option value="">Standard-Stundensatz des Projekts</option>
                    {roleRates.map((r) => (
                      <option key={r.id} value={r.name}>{r.name} ({euro(r.hourlyRateCents)}/Std)</option>
                    ))}
                  </select>
                </Field>
              )}

              <Field label="Stundensatz (€/Std)" wide={roleRates.length === 0}>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={(form.hourlyRateCents / 100) || ""}
                  onChange={(e) => setForm({ ...form, hourlyRateCents: Math.round(parseFloat(e.target.value || "0") * 100) })}
                />
              </Field>

              <Field label={o("time.fields.date")} required>
                <input type="date" required value={form.day} onChange={(e) => setForm({ ...form, day: e.target.value })} />
              </Field>
              <Field label="Dauer in Stunden (z.B. 1.5 oder 2:15)" required>
                <input
                  type="text"
                  required
                  placeholder="1.5"
                  value={form.hoursInput}
                  onChange={(e) => setForm({ ...form, hoursInput: e.target.value })}
                />
              </Field>

              <Field label={o("time.fields.description")} wide>
                <textarea
                  rows={2}
                  placeholder="z.B. Frontend-Komponenten implementiert, Abstimmung mit Kunde..."
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
              </Field>
            </div>

            <label className="check">
              <input type="checkbox" checked={form.billable} onChange={(e) => setForm({ ...form, billable: e.target.checked })} />
              <span>{o("time.billable")} (wird in Rechnungen zur Abrechnung vorgeschlagen)</span>
            </label>

            <div className="row wrap gap end">
              <button type="button" className="button" onClick={() => setModalOpen(false)}>
                {o("common.cancel")}
              </button>
              <button type="submit" className="button primary">
                <Check size={17} /> {o("common.save")}
              </button>
            </div>
          </form>
        </Dialog>
      )}

      {/* Leistungsnachweis (Druckansicht) */}
      {showTimesheet && (
        <TimesheetPrint
          project={projects.find((p) => p.id === selectedProjectId)}
          entries={filteredTimes}
          onClose={() => setShowTimesheet(false)}
        />
      )}
    </div>
  );
}
