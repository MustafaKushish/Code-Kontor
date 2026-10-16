import { useEffect, useState } from "react";
import { Plus, Scissors, CheckCircle, Clock, Calendar, Search, Sparkles, Trash2, X, Play } from "lucide-react";
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

  return (
    <div className="stack">
      {/* KPI Stats */}
      <div className="salon-stats">
        <div className="salon-stat-card">
          <span className="label">Heutige Termine</span>
          <span className="value" style={{ color: "var(--accent)" }}>{todayApps.length}</span>
          <span className="small muted">{inProgressApps.length} aktuell auf dem Stuhl</span>
        </div>
        <div className="salon-stat-card">
          <span className="label">Tagesumsatz (Abgeschlossen)</span>
          <span className="value">{euro(completedTodayCents)}</span>
          <span className="small muted">Termine heute</span>
        </div>
        <div className="salon-stat-card">
          <span className="label">Gesamttermine</span>
          <span className="value">{appointments.length}</span>
          <span className="small muted">Alle erfassten Buchungen</span>
        </div>
      </div>

      {errorMessage && <div className="notice warning">{errorMessage}</div>}

      {/* Toolbar */}
      <div className="toolbar" style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: "12px" }}>
        <div className="row gap" style={{ flexWrap: "wrap", flex: 1, minWidth: "260px" }}>
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

          <div style={{ position: "relative", minWidth: "220px" }}>
            <input
              type="text"
              className="input"
              placeholder="Termine durchsuchen..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {onOpenNewAppointment && (
          <button className="button primary push-end" onClick={onOpenNewAppointment}>
            <Plus size={18} /> {s("actions.newAppointment")}
          </button>
        )}
      </div>

      {/* Table / List */}
      {loading ? (
        <p className="muted">Termine werden geladen...</p>
      ) : filteredAppointments.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: "40px" }}>
          <Scissors size={36} style={{ color: "var(--muted)", margin: "0 auto 12px" }} />
          <h3>Keine Termine gefunden</h3>
          <p className="muted">Wählen Sie einen anderen Filter oder legen Sie einen neuen Termin an.</p>
        </div>
      ) : (
        <div className="office-table-wrap">
          <table className="office-table">
            <thead>
              <tr>
                <th>Datum & Zeit</th>
                <th>Kunde</th>
                <th>Stylist</th>
                <th>Dienstleistungen</th>
                <th>Dauer</th>
                <th className="num">Betrag</th>
                <th>Status</th>
                <th className="num">Aktionen</th>
              </tr>
            </thead>
            <tbody>
              {filteredAppointments.map((app) => (
                <tr key={app.id}>
                  <td>
                    <strong>{formatDay(app.day)}</strong>
                    <div style={{ fontSize: "0.82rem", color: "var(--muted)" }}>
                      {app.startTime} - {app.endTime}
                    </div>
                  </td>
                  <td>
                    <strong>{app.clientName}</strong>
                    {app.clientPhone && (
                      <small className="muted" style={{ display: "block" }}>
                        {app.clientPhone}
                      </small>
                    )}
                  </td>
                  <td>
                    <strong>{app.staffName}</strong>
                  </td>
                  <td>
                    <div style={{ maxWidth: "260px" }}>
                      {app.serviceNames.join(", ")}
                    </div>
                    {app.notes && (
                      <small className="muted" style={{ display: "block" }}>
                        {app.notes}
                      </small>
                    )}
                  </td>
                  <td>{app.durationMinutes} Min</td>
                  <td className="num" style={{ fontWeight: 700 }}>{euro(app.totalCents)}</td>
                  <td>
                    <span
                      className={`pill ${
                        app.status === "in_progress"
                          ? "warning"
                          : app.status === "completed"
                          ? "success"
                          : app.status === "canceled"
                          ? "danger"
                          : ""
                      }`}
                    >
                      {s(`status.${app.status}`)}
                    </span>
                  </td>
                  <td className="num">
                    <div className="row gap" style={{ justifyContent: "flex-end", flexWrap: "wrap", minWidth: "160px" }}>
                      {app.status === "booked" || app.status === "confirmed" ? (
                        <button
                          className="button small"
                          onClick={() => handleUpdateStatus(app.id, "in_progress")}
                          title="Behandlung starten"
                        >
                          <Play size={14} /> Start
                        </button>
                      ) : null}

                      {app.status !== "completed" && app.status !== "canceled" ? (
                        <button
                          className="button small success"
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
                          <div className="row gap" style={{ alignItems: "center" }}>
                            <button
                              className="button danger small"
                              onClick={() => handleDelete(app.id)}
                              title="Unwiderruflich löschen"
                            >
                              Löschen
                            </button>
                            <button
                              className="button small"
                              onClick={() => setDeleteConfirmId(null)}
                            >
                              Abbr.
                            </button>
                          </div>
                        ) : (
                          <button
                            className="icon-button danger"
                            onClick={() => setDeleteConfirmId(app.id)}
                            title="Termin löschen"
                          >
                            <Trash2 size={15} />
                          </button>
                        )
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
