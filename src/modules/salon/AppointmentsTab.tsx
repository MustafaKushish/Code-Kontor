import { useEffect, useState } from "react";
import { Plus, Clock, Calendar, Search, Sparkles, Trash2, Play } from "lucide-react";
import { api } from "../../api";
import type { AppointmentStatus, SalonAppointment } from "../../../shared/salon";
import { useSalonI18n } from "./i18n";

export function AppointmentsTab({
  isManager,
  onNavigateToCheckout,
  onOpenNewAppointment,
}: {
  isManager: boolean;
  onNavigateToCheckout?: (app: SalonAppointment) => void;
  onOpenNewAppointment?: () => void;
}) {
  const { s, euro, day: formatDay } = useSalonI18n();
  const [appointments, setAppointments] = useState<SalonAppointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  const loadData = async () => {
    try {
      const res = await api<{ appointments: SalonAppointment[] }>("/salon/appointments");
      setAppointments(res.appointments);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleUpdateStatus = async (appId: string, status: AppointmentStatus) => {
    setErrorMessage(null);
    try {
      await api(`/salon/appointments/${appId}/status`, {
        method: "POST",
        body: { status },
      });
      await loadData();
    } catch (err: any) {
      setErrorMessage(err?.message || "Fehler beim Aktualisieren des Terminstatus");
    }
  };

  const handleDelete = async (appId: string) => {
    setErrorMessage(null);
    try {
      await api(`/salon/appointments/${appId}`, { method: "DELETE" });
      setDeleteConfirmId(null);
      await loadData();
    } catch (err: any) {
      setErrorMessage(err?.message || "Fehler beim Löschen des Termins");
    }
  };

  const filteredAppointments = appointments.filter((a) => {
    if (statusFilter !== "all" && a.status !== statusFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        a.clientName.toLowerCase().includes(q) ||
        a.staffName.toLowerCase().includes(q) ||
        a.serviceNames.some((sn) => sn.toLowerCase().includes(q))
      );
    }
    return true;
  });

  const today = new Date().toISOString().slice(0, 10);
  const todayApps = appointments.filter((a) => a.day === today && a.status !== "canceled");
  const inProgressApps = appointments.filter((a) => a.status === "in_progress");
  const completedTodayCents = appointments
    .filter((a) => a.day === today && a.status === "completed")
    .reduce((s, a) => s + a.totalCents, 0);

  const statusPill = (status: AppointmentStatus) =>
    status === "in_progress" ? "pill warn" : status === "completed" ? "pill pos" : status === "canceled" ? "pill neg" : "pill";

  return (
    <div className="stack">
      {/* Kennzahlen */}
      <div className="salon-stats">
        <div className="tile stat-tile">
          <span className="stat-icon"><Calendar size={18} /></span>
          <strong>{todayApps.length}</strong>
          <small>Heutige Termine</small>
          <small>{inProgressApps.length} aktuell auf dem Stuhl</small>
        </div>
        <div className="tile stat-tile">
          <span className="stat-icon"><Sparkles size={18} /></span>
          <strong>{euro(completedTodayCents)}</strong>
          <small>Tagesumsatz (Abgeschlossen)</small>
          <small>Termine heute</small>
        </div>
        <div className="tile stat-tile">
          <span className="stat-icon"><Clock size={18} /></span>
          <strong>{appointments.length}</strong>
          <small>Gesamttermine</small>
          <small>Alle erfassten Buchungen</small>
        </div>
      </div>

      {errorMessage && <p className="error" role="alert">{errorMessage}</p>}

      {/* Suche & Filter */}
      <div className="toolbar">
        <div className="salon-toolbar">
          <label className="search">
            <Search size={18} />
            <input type="search" placeholder="Termine durchsuchen..." aria-label="Termine durchsuchen..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </label>
          {onOpenNewAppointment && (
            <button className="button primary" onClick={onOpenNewAppointment}>
              <Plus size={18} /> {s("actions.newAppointment")}
            </button>
          )}
        </div>
        <div className="chips" role="tablist">
          {["all", "booked", "confirmed", "in_progress", "completed", "canceled"].map((st) => (
            <button
              key={st}
              role="tab"
              aria-selected={statusFilter === st}
              className={statusFilter === st ? "chip active" : "chip"}
              onClick={() => setStatusFilter(st)}
            >
              {st === "all" ? "Alle Status" : s(`status.${st}`)}
            </button>
          ))}
        </div>
      </div>

      {/* Liste */}
      {loading ? (
        <p className="muted">Termine werden geladen...</p>
      ) : (
        <section className="card list-card">
          {filteredAppointments.length === 0 && (
            <p className="empty muted">
              <strong>Keine Termine gefunden</strong> · Wählen Sie einen anderen Filter oder legen Sie einen neuen Termin an.
            </p>
          )}
          {filteredAppointments.map((app) => (
            <div key={app.id} className="list-row salon-row">
              <span className="salon-time">
                {app.startTime}
                <small>{formatDay(app.day)}</small>
              </span>
              <span className="list-main">
                <strong>{app.clientName}{app.clientPhone ? ` · ${app.clientPhone}` : ""}</strong>
                <small className="muted">
                  {app.staffName} · {app.serviceNames.join(", ")} · {app.durationMinutes} Min ({app.startTime} - {app.endTime})
                </small>
                {app.notes && <small className="muted">{app.notes}</small>}
              </span>
              <span className="salon-row-meta">
                <span className={statusPill(app.status)}>{s(`status.${app.status}`)}</span>
                <strong>{euro(app.totalCents)}</strong>
                <span className="salon-row-actions">
                  {app.status === "booked" || app.status === "confirmed" ? (
                    <button className="button small-button" onClick={() => handleUpdateStatus(app.id, "in_progress")} title="Behandlung starten">
                      <Play size={14} /> Start
                    </button>
                  ) : null}

                  {app.status !== "completed" && app.status !== "canceled" ? (
                    <button
                      className="button small-button"
                      onClick={() => {
                        if (onNavigateToCheckout) onNavigateToCheckout(app);
                        else handleUpdateStatus(app.id, "completed");
                      }}
                      title="Abrechnen & abschließen"
                    >
                      <Sparkles size={14} /> Kasse
                    </button>
                  ) : null}

                  {isManager && (
                    deleteConfirmId === app.id ? (
                      <>
                        <button className="button danger small-button" onClick={() => handleDelete(app.id)} title="Unwiderruflich löschen">
                          Löschen
                        </button>
                        <button className="button small-button" onClick={() => setDeleteConfirmId(null)}>
                          Abbr.
                        </button>
                      </>
                    ) : (
                      <button className="icon-button danger" onClick={() => setDeleteConfirmId(app.id)} title="Termin löschen" aria-label="Termin löschen">
                        <Trash2 size={16} />
                      </button>
                    )
                  )}
                </span>
              </span>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
