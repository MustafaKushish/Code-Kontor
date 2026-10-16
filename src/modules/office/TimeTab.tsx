import { useEffect, useRef, useState } from "react";
import { Play, Pause, Square, Plus, Clock, Trash2, CheckCircle2, AlertCircle, X, Receipt, Filter, Printer } from "lucide-react";
import { api, type Me } from "../../api";
import { Field } from "../../components";
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
      {/* Live Stopwatch Widget */}
      <div className="card" style={{ background: "linear-gradient(135deg, var(--panel), color-mix(in srgb, var(--accent) 8%, var(--panel)))", border: "1px solid color-mix(in srgb, var(--accent) 30%, var(--line))" }}>
        <div className="stopwatch-inner">
          <div className="stopwatch-clock-row">
            <div className="stopwatch-clock" style={{ color: timerRunning ? "var(--accent)" : "var(--ink)" }}>
              {formatTimerDisplay(timerSeconds)}
            </div>
            {timerRunning && <span className="pill success" style={{ animation: "pulse 1.5s infinite" }}>Läuft...</span>}
          </div>

          <div className="stopwatch-inputs">
            <select
              className="input"
              value={timerProjectId}
              onChange={(e) => setTimerProjectId(e.target.value)}
              disabled={timerRunning}
            >
              {projects.length === 0 && <option value="">Keine Projekte vorhanden</option>}
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name} ({p.clientName})</option>
              ))}
            </select>
            <input
              type="text"
              className="input"
              placeholder="Was tun Sie gerade?"
              value={timerDescription}
              onChange={(e) => setTimerDescription(e.target.value)}
            />
          </div>

          <div className="stopwatch-actions">
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
              <button className="button success" onClick={handleStopAndSaveTimer}>
                <Square size={17} /> {o("time.timerStop")} & Buchen
              </button>
            )}
          </div>
        </div>
      </div>

      {/* KPI Stats */}
      <div className="office-stats">
        <div className="office-stat-card">
          <span className="label">{o("time.unbilled")}</span>
          <span className="value" style={{ color: "var(--accent)" }}>{euro(unbilledCents)}</span>
          <span className="small muted">{(unbilledMinutes / 60).toFixed(1)} Stunden</span>
        </div>
        <div className="office-stat-card">
          <span className="label">Erfasste Stunden (Filter)</span>
          <span className="value">{(totalMonthMinutes / 60).toFixed(1)} Std</span>
        </div>
        <div className="office-stat-card">
          <span className="label">Offene Zeiteinträge</span>
          <span className="value" style={{ color: "var(--brand)" }}>{unbilledEntries.length}</span>
        </div>
      </div>

      {/* Toolbar */}
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

        {projects.length > 0 && (
          <select
            className="input"
            style={{ maxWidth: "220px" }}
            value={selectedProjectId}
            onChange={(e) => setSelectedProjectId(e.target.value)}
          >
            <option value="all">Alle Projekte</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        )}

        <div className="row gap push-end">
          <button
            className="button"
            onClick={() => setShowTimesheet(true)}
            disabled={filteredTimes.length === 0}
            title="Druckbaren Leistungsnachweis / Timesheet erstellen"
          >
            <Printer size={17} /> Leistungsnachweis
          </button>
          {unbilledEntries.length > 0 && onNavigateToNewInvoiceWithItems && (
            <button className="button" onClick={handleInvoiceUnbilled} title="Rechnung aus offenen Zeiten generieren">
              <Receipt size={17} /> In Rechnung stellen
            </button>
          )}
          <button className="button primary" onClick={() => setModalOpen(true)}>
            <Plus size={18} /> {o("time.logTime")}
          </button>
        </div>
      </div>

      {/* Time Entries Table */}
      {loading ? (
        <p className="muted">Laden...</p>
      ) : filteredTimes.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: "40px" }}>
          <Clock size={36} style={{ color: "var(--muted)", margin: "0 auto 12px" }} />
          <h3>{o("time.noEntries")}</h3>
        </div>
      ) : (
        <div className="office-table-wrap">
          <table className="office-table">
            <thead>
              <tr>
                <th>Datum</th>
                <th>Projekt & Kunde</th>
                <th>Tätigkeit</th>
                <th>Mitarbeiter</th>
                <th className="num">Dauer</th>
                <th className="num">Satz</th>
                <th className="num">Honorar</th>
                <th>Status</th>
                <th className="num">Aktion</th>
              </tr>
            </thead>
            <tbody>
              {filteredTimes.map((t) => {
                const feeCents = Math.round((t.minutes * t.hourlyRateCents) / 60);
                return (
                  <tr key={t.id}>
                    <td><strong>{day(t.day)}</strong></td>
                    <td>
                      <div><strong>{t.projectName}</strong></div>
                      <small className="muted">{t.clientName}</small>
                    </td>
                    <td>{t.description || "—"}</td>
                    <td><small className="muted">{t.userName || "Mitarbeiter"}</small></td>
                    <td className="num">
                      <strong>{(t.minutes / 60).toFixed(2)}h</strong>
                      <div style={{ fontSize: "0.75rem", color: "var(--muted)" }}>{t.minutes} Min</div>
                    </td>
                    <td className="num">{euro(t.hourlyRateCents)}</td>
                    <td className="num" style={{ fontWeight: 600 }}>{t.billable ? euro(feeCents) : "—"}</td>
                    <td>
                      {t.billedInvoiceId ? (
                        <span className="pill success">Abgerechnet</span>
                      ) : t.billable ? (
                        <span className="pill warning">Offen</span>
                      ) : (
                        <span className="pill">Intern</span>
                      )}
                    </td>
                    <td className="num">
                      {!t.billedInvoiceId && (
                        <button
                          className="icon-button danger"
                          onClick={() => handleDeleteTime(t.id)}
                          title={o("common.delete")}
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Manual Entry Modal */}
      {modalOpen && (
        <div className="office-modal-overlay" onClick={() => setModalOpen(false)}>
          <div className="office-modal" onClick={(e) => e.stopPropagation()}>
            <div className="office-modal-head">
              <h3>{o("time.logTime")}</h3>
              <button className="icon-button" onClick={() => setModalOpen(false)}>
                <X size={20} />
              </button>
            </div>

            {errorMsg && <div className="notice warning">{errorMsg}</div>}

            <form onSubmit={handleSaveManual} className="stack">
              <Field label={o("time.fields.project")} required>
                <select
                  required
                  className="input"
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
                <Field label="Aufgabe / Meilenstein (optional)">
                  <select
                    className="input"
                    value={form.taskId}
                    onChange={(e) => setForm({ ...form, taskId: e.target.value })}
                  >
                    <option value="">Keine Aufgabe zuordnen (Allgemein)</option>
                    {projectTasks.map((t) => (
                      <option key={t.id} value={t.id}>{t.title} {t.completed ? "✓ (Erledigt)" : ""}</option>
                    ))}
                  </select>
                </Field>
              )}

              <div className="row-grid">
                {roleRates.length > 0 && (
                  <Field label="Rolle / Tätigkeitsstufe">
                    <select
                      className="input"
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

                <Field label="Stundensatz (€/Std)">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    className="input"
                    value={(form.hourlyRateCents / 100) || ""}
                    onChange={(e) => setForm({ ...form, hourlyRateCents: Math.round(parseFloat(e.target.value || "0") * 100) })}
                  />
                </Field>
              </div>

              <div className="row-grid">
                <Field label={o("time.fields.date")} required>
                  <input
                    type="date"
                    required
                    className="input"
                    value={form.day}
                    onChange={(e) => setForm({ ...form, day: e.target.value })}
                  />
                </Field>
                <Field label="Dauer in Stunden (z.B. 1.5 oder 2:15)" required>
                  <input
                    type="text"
                    required
                    className="input"
                    placeholder="1.5"
                    value={form.hoursInput}
                    onChange={(e) => setForm({ ...form, hoursInput: e.target.value })}
                  />
                </Field>
              </div>

              <Field label={o("time.fields.description")}>
                <textarea
                  className="input"
                  rows={2}
                  placeholder="z.B. Frontend-Komponenten implementiert, Abstimmung mit Kunde..."
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
              </Field>

              <label className="checkbox-label" style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={form.billable}
                  onChange={(e) => setForm({ ...form, billable: e.target.checked })}
                />
                <span>{o("time.billable")} (wird in Rechnungen zur Abrechnung vorgeschlagen)</span>
              </label>

              <div className="row gap" style={{ justifyContent: "flex-end", marginTop: "12px" }}>
                <button type="button" className="button" onClick={() => setModalOpen(false)}>
                  {o("common.cancel")}
                </button>
                <button type="submit" className="button primary">
                  {o("common.save")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Timesheet Print Modal */}
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
