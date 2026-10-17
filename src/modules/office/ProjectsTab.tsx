import { useEffect, useState } from "react";
import { Plus, FolderKanban, CheckCircle2, Clock, Check, Search, Pencil, Trash2, CheckSquare, Square, UserCheck, Receipt, ListTodo, Wallet } from "lucide-react";
import { api } from "../../api";
import { Field } from "../../components";
import { Dialog } from "../../pos/ui";
import type { OfficeClient, OfficeProject, OfficeTask, ProjectStatus } from "../../../shared/office";
import { useOfficeI18n } from "./i18n";

export function ProjectsTab({
  isManager,
  initialClientId,
  onNavigateToTime,
  onNavigateToExpenses,
}: {
  isManager: boolean;
  initialClientId?: string;
  onNavigateToTime?: (projectId: string) => void;
  onNavigateToExpenses?: (projectId: string) => void;
}) {
  const { o, euro, day, officeError } = useOfficeI18n();
  const [projects, setProjects] = useState<OfficeProject[]>([]);
  const [clients, setClients] = useState<OfficeClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<string>("all");
  const [clientFilter, setClientFilter] = useState<string>(initialClientId || "all");

  const [modalOpen, setModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<OfficeProject | null>(null);
  const [tasksModalProject, setTasksModalProject] = useState<OfficeProject | null>(null);
  const [projectTasks, setProjectTasks] = useState<OfficeTask[]>([]);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskHours, setNewTaskHours] = useState("");
  const [newTaskAssignee, setNewTaskAssignee] = useState("");
  const [newTaskDueDate, setNewTaskDueDate] = useState("");

  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

  const [form, setForm] = useState({
    name: "",
    clientId: "",
    status: "active" as ProjectStatus,
    budgetCents: 0,
    hourlyRateCents: 9500,
    startDate: new Date().toISOString().slice(0, 10),
    dueDate: "",
    description: "",
  });

  const loadData = async () => {
    try {
      const [pRes, cRes] = await Promise.all([
        api<{ projects: OfficeProject[] }>(`/office/projects${clientFilter !== "all" ? `?clientId=${clientFilter}` : ""}`),
        api<{ clients: OfficeClient[] }>("/office/clients"),
      ]);
      setProjects(pRes.projects);
      setClients(cRes.clients);
      if (cRes.clients.length > 0 && !form.clientId) {
        setForm((f) => ({ ...f, clientId: cRes.clients[0].id }));
      }
    } catch (err) {
      setErrorMsg(officeError(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [clientFilter]);

  const loadTasks = async (projectId: string) => {
    try {
      const res = await api<{ tasks: OfficeTask[] }>(`/office/tasks?projectId=${projectId}`);
      setProjectTasks(res.tasks);
    } catch (err) {
      console.error(err);
    }
  };

  const openTasksModal = (project: OfficeProject) => {
    setTasksModalProject(project);
    loadTasks(project.id);
  };

  const handleToggleTask = async (taskId: string) => {
    try {
      await api(`/office/tasks/${taskId}/toggle`, { method: "POST" });
      if (tasksModalProject) await loadTasks(tasksModalProject.id);
      await loadData();
    } catch (err) {
      alert(officeError(err));
    }
  };

  const handleAddTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tasksModalProject || !newTaskTitle.trim()) return;
    try {
      const estimatedMinutes = Math.round((parseFloat(newTaskHours) || 0) * 60);
      await api("/office/tasks", {
        method: "POST",
        body: {
          projectId: tasksModalProject.id,
          title: newTaskTitle.trim(),
          estimatedMinutes,
          assigneeName: newTaskAssignee.trim(),
          dueDate: newTaskDueDate,
        },
      });
      setNewTaskTitle("");
      setNewTaskHours("");
      setNewTaskAssignee("");
      setNewTaskDueDate("");
      await loadTasks(tasksModalProject.id);
      await loadData();
    } catch (err) {
      alert(officeError(err));
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    try {
      await api(`/office/tasks/${taskId}`, { method: "DELETE" });
      if (tasksModalProject) await loadTasks(tasksModalProject.id);
      await loadData();
    } catch (err) {
      alert(officeError(err));
    }
  };

  const openNew = () => {
    setEditingProject(null);
    setForm({
      name: "",
      clientId: clientFilter !== "all" ? clientFilter : (clients[0]?.id || ""),
      status: "active",
      budgetCents: 0,
      hourlyRateCents: 9500,
      startDate: new Date().toISOString().slice(0, 10),
      dueDate: "",
      description: "",
    });
    setErrorMsg("");
    setModalOpen(true);
  };

  const openEdit = (p: OfficeProject) => {
    setEditingProject(p);
    setForm({
      name: p.name,
      clientId: p.clientId,
      status: p.status,
      budgetCents: p.budgetCents,
      hourlyRateCents: p.hourlyRateCents,
      startDate: p.startDate,
      dueDate: p.dueDate,
      description: p.description,
    });
    setErrorMsg("");
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    try {
      const payload = {
        ...(editingProject ? { id: editingProject.id } : {}),
        ...form,
        budgetCents: Number(form.budgetCents) || 0,
        hourlyRateCents: Number(form.hourlyRateCents) || 0,
      };
      await api("/office/projects", { method: "POST", body: payload });
      setModalOpen(false);
      await loadData();
    } catch (err) {
      setErrorMsg(officeError(err));
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await api(`/office/projects/${id}`, { method: "DELETE" });
      setDeleteConfirmId(null);
      await loadData();
    } catch (err) {
      alert(officeError(err));
    }
  };

  const filteredProjects = projects.filter((p) => {
    const matchesStatus = filter === "all" || p.status === filter;
    const matchesSearch =
      !search ||
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.clientName.toLowerCase().includes(search.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  const activeCount = projects.filter((p) => p.status === "active").length;
  const completedCount = projects.filter((p) => p.status === "completed").length;
  const totalLoggedMinutes = projects.reduce((sum, p) => sum + p.totalMinutesLogged, 0);
  const totalLoggedCents = projects.reduce((sum, p) => sum + p.totalLoggedCents, 0);

  return (
    <div className="stack">
      <div className="office-stats">
        <div className="tile stat-tile">
          <span className="stat-icon"><FolderKanban size={18} /></span>
          <strong>{activeCount}</strong><small>Aktive Projekte</small>
        </div>
        <div className="tile stat-tile">
          <span className="stat-icon"><CheckCircle2 size={18} /></span>
          <strong>{completedCount}</strong><small>Abgeschlossen</small>
        </div>
        <div className="tile stat-tile">
          <span className="stat-icon"><Clock size={18} /></span>
          <strong>{(totalLoggedMinutes / 60).toFixed(1)} Std</strong><small>Geleistete Stunden</small>
        </div>
        <div className="tile stat-tile">
          <span className="stat-icon"><Wallet size={18} /></span>
          <strong>{euro(totalLoggedCents)}</strong><small>Erfasster Honorarwert</small>
        </div>
      </div>

      <div className="toolbar">
        <div className="chips" role="tablist">
          {["all", "active", "planned", "completed", "paused"].map((st) => (
            <button
              key={st}
              role="tab"
              aria-selected={filter === st}
              className={filter === st ? "chip active" : "chip"}
              onClick={() => setFilter(st)}
            >
              {st === "all" ? o("common.all") : o(`projects.status.${st}`)}
            </button>
          ))}
        </div>

        <div className="row wrap gap office-filters">
          <label className="search">
            <Search size={18} />
            <input
              type="search"
              placeholder={o("common.search")}
              aria-label={o("common.search")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          {clients.length > 0 && (
            <select value={clientFilter} onChange={(e) => setClientFilter(e.target.value)} aria-label="Kunde">
              <option value="all">Alle Kunden ({clients.length})</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          )}
          {isManager && (
            <div className="row gap push-end">
              <button className="button primary" onClick={openNew}>
                <Plus size={18} /> {o("projects.newProject")}
              </button>
            </div>
          )}
        </div>
      </div>

      {loading ? (
        <p className="muted">Laden...</p>
      ) : filteredProjects.length === 0 ? (
        <section className="card list-card">
          <p className="empty muted">
            {o("projects.noProjects")}
            {clients.length === 0 && <><br /><small>Tipp: Legen Sie zuerst einen Kunden im Reiter „Kunden“ an.</small></>}
          </p>
        </section>
      ) : (
        <div className="office-grid">
          {filteredProjects.map((p) => {
            const budgetPercent = p.budgetCents > 0 ? Math.min(100, Math.round((p.totalLoggedCents / p.budgetCents) * 100)) : 0;
            const isOver = p.budgetCents > 0 && p.totalLoggedCents > p.budgetCents;

            return (
              <article key={p.id} className="card office-card">
                <div className="section-head">
                  <div>
                    <h3>{p.name}</h3>
                    <small className="muted office-icon-line"><UserCheck size={14} /> {p.clientName}</small>
                  </div>
                  <span className={`pill ${p.status === "active" ? "role-owner" : p.status === "completed" ? "success" : ""}`}>
                    {o(`projects.status.${p.status}`)}
                  </span>
                </div>

                {p.description && <p className="small muted">{p.description}</p>}

                <div className="office-tasks">
                  <span className="office-icon-line">
                    <ListTodo size={15} />
                    <span><strong>{p.tasksCompleted || 0} von {p.tasksCount || 0}</strong> Aufgaben erledigt</span>
                  </span>
                  <button className="button small-button" onClick={() => openTasksModal(p)} title="Aufgaben & Meilensteine verwalten">
                    Aufgaben anzeigen
                  </button>
                </div>

                <div className="stack-sm">
                  <div className="office-facts">
                    <span>Budget: <strong>{p.budgetCents > 0 ? euro(p.budgetCents) : "Kein Limit"}</strong></span>
                    <span>Erfasst: <strong>{euro(p.totalLoggedCents)}</strong> ({(p.totalMinutesLogged / 60).toFixed(1)}h)</span>
                  </div>
                  {p.budgetCents > 0 && (
                    <div className={`office-progress ${isOver ? "over" : ""}`}>
                      <span style={{ width: `${budgetPercent}%` }} />
                    </div>
                  )}
                </div>

                <div className="office-facts foot">
                  <span>Satz: <strong>{euro(p.hourlyRateCents)}/h</strong></span>
                  {p.totalExpensesCents > 0 && <span>Auslagen: <strong>{euro(p.totalExpensesCents)}</strong></span>}
                  {p.dueDate ? <span>Fällig: <strong>{day(p.dueDate)}</strong></span> : <span>Start: {day(p.startDate)}</span>}
                </div>

                <div className="row wrap gap end">
                  {onNavigateToExpenses && (
                    <button className="button small-button" onClick={() => onNavigateToExpenses(p.id)} title="Auslagen für dieses Projekt">
                      <Receipt size={15} /> Auslagen
                    </button>
                  )}
                  {onNavigateToTime && (
                    <button className="button small-button" onClick={() => onNavigateToTime(p.id)} title="Zeiten für dieses Projekt erfassen">
                      <Clock size={15} /> Zeit erfassen
                    </button>
                  )}
                  {isManager && (
                    <span className="row">
                      <button className="icon-button" onClick={() => openEdit(p)} title={o("common.edit")} aria-label={o("common.edit")}>
                        <Pencil size={17} />
                      </button>
                      <button className="icon-button danger" onClick={() => setDeleteConfirmId(p.id)} title={o("common.delete")} aria-label={o("common.delete")}>
                        <Trash2 size={17} />
                      </button>
                    </span>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Dialog: Aufgaben & Meilensteine */}
      {tasksModalProject && (
        <Dialog title="Aufgaben & Meilensteine" onClose={() => setTasksModalProject(null)} wide>
          <div className="stack office-dialog">
            <p className="muted">Projekt: {tasksModalProject.name}</p>

            <form onSubmit={handleAddTask} className="office-panel">
              <strong>Neue Aufgabe hinzufügen</strong>
              <div className="office-add four">
                <Field label="Aufgabentitel" required>
                  <input
                    type="text"
                    required
                    placeholder="z.B. Design-Entwurf Freigabe..."
                    value={newTaskTitle}
                    onChange={(e) => setNewTaskTitle(e.target.value)}
                  />
                </Field>
                <Field label="Schätzung (h)">
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    placeholder="4.0"
                    value={newTaskHours}
                    onChange={(e) => setNewTaskHours(e.target.value)}
                  />
                </Field>
                <Field label="Zuständig">
                  <input
                    type="text"
                    placeholder="Name"
                    value={newTaskAssignee}
                    onChange={(e) => setNewTaskAssignee(e.target.value)}
                  />
                </Field>
                <button type="submit" className="button primary">
                  <Plus size={17} /> Hinzufügen
                </button>
              </div>
            </form>

            {projectTasks.length === 0 ? (
              <p className="empty muted">Noch keine Aufgaben angelegt.</p>
            ) : (
              <div className="office-sublist">
                {projectTasks.map((task) => (
                  <div key={task.id} className={`list-row ${task.completed ? "done" : ""}`}>
                    <button
                      type="button"
                      className={`icon-button ${task.completed ? "done" : ""}`}
                      onClick={() => handleToggleTask(task.id)}
                      aria-label={task.title}
                      aria-pressed={task.completed}
                    >
                      {task.completed ? <CheckSquare size={20} /> : <Square size={20} />}
                    </button>
                    <span className="list-main">
                      <strong>{task.title}</strong>
                      {(task.assigneeName || task.estimatedMinutes > 0) && (
                        <small className="muted">
                          {task.assigneeName && <span>Verantwortlich: {task.assigneeName} · </span>}
                          {task.estimatedMinutes > 0 && <span>Geschätzt: {(task.estimatedMinutes / 60).toFixed(1)}h</span>}
                        </small>
                      )}
                    </span>
                    <button
                      type="button"
                      className="icon-button danger"
                      onClick={() => handleDeleteTask(task.id)}
                      title="Aufgabe löschen"
                      aria-label="Aufgabe löschen"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Dialog>
      )}

      {/* Lösch-Bestätigung */}
      {deleteConfirmId && (
        <Dialog title={o("common.confirmDelete")} onClose={() => setDeleteConfirmId(null)}>
          <div className="stack office-dialog">
            <p className="muted">
              Möchten Sie dieses Projekt wirklich löschen? Alle zugehörigen Aufgaben, Auslagen und Zeiteinträge dieses Projekts werden dabei ebenfalls entfernt.
            </p>
            <div className="row wrap gap end">
              <button className="button" onClick={() => setDeleteConfirmId(null)}>{o("common.cancel")}</button>
              <button className="button danger" onClick={() => handleDelete(deleteConfirmId)}><Trash2 size={17} /> {o("common.delete")}</button>
            </div>
          </div>
        </Dialog>
      )}

      {/* Dialog: Projekt anlegen / bearbeiten */}
      {modalOpen && (
        <Dialog title={editingProject ? "Projekt bearbeiten" : o("projects.newProject")} onClose={() => setModalOpen(false)} wide>
          <form onSubmit={handleSave} className="stack office-dialog">
            {errorMsg && <p className="error" role="alert">{errorMsg}</p>}
            <div className="grid form-grid">
              <Field label={o("projects.fields.name")} required wide>
                <input
                  type="text"
                  required
                  placeholder="z.B. Website Relaunch & SEO Betreuung"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </Field>
              <Field label={o("projects.fields.client")} required>
                <select required value={form.clientId} onChange={(e) => setForm({ ...form, clientId: e.target.value })}>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </Field>
              <Field label={o("projects.fields.status")} required>
                <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as ProjectStatus })}>
                  <option value="active">{o("projects.status.active")}</option>
                  <option value="planned">{o("projects.status.planned")}</option>
                  <option value="completed">{o("projects.status.completed")}</option>
                  <option value="paused">{o("projects.status.paused")}</option>
                  <option value="canceled">{o("projects.status.canceled")}</option>
                </select>
              </Field>
              <Field label={o("projects.fields.budget")}>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00 = kein Limit"
                  value={(form.budgetCents / 100) || ""}
                  onChange={(e) => setForm({ ...form, budgetCents: Math.round(parseFloat(e.target.value || "0") * 100) })}
                />
              </Field>
              <Field label={o("projects.fields.hourlyRate")}>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="z.B. 95.00"
                  value={(form.hourlyRateCents / 100) || ""}
                  onChange={(e) => setForm({ ...form, hourlyRateCents: Math.round(parseFloat(e.target.value || "0") * 100) })}
                />
              </Field>
              <Field label={o("projects.fields.startDate")}>
                <input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
              </Field>
              <Field label={o("projects.fields.dueDate")}>
                <input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
              </Field>
              <Field label={o("projects.fields.description")} wide>
                <textarea
                  rows={3}
                  placeholder="Projektumfang, Meilensteine, Ansprechpartner..."
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
              </Field>
            </div>
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
    </div>
  );
}
