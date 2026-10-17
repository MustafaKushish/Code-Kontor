import { useState, useRef, useEffect, type FormEvent } from "react";
import {
  Scan,
  UserCheck,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Users,
  LogOut,
  Search,
  ShoppingCart,
  UserPlus,
  RefreshCw,
  Clock,
  Sparkles,
} from "lucide-react";
import { api } from "../../api";
import type {
  FitnessCheckIn,
  FitnessCheckInResult,
  FitnessMember,
  FitnessStats,
} from "../../../shared/fitness";
import { navigate } from "../../router";

interface CheckInTabProps {
  stats: FitnessStats;
  onRefresh: () => void;
  onOpenNewMemberModal: () => void;
  onSelectMember: (memberId: string) => void;
}

export function CheckInTab({
  stats,
  onRefresh,
  onOpenNewMemberModal,
  onSelectMember,
}: CheckInTabProps) {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [activeVisits, setActiveVisits] = useState<FitnessCheckIn[]>([]);
  const [activeFilter, setActiveFilter] = useState("");
  const [feedback, setFeedback] = useState<FitnessCheckInResult | null>(null);
  const [checkingOutId, setCheckingOutId] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);

  // Aktive Besuche laden
  const loadActiveVisits = async () => {
    try {
      const visits = await api<FitnessCheckIn[]>("/fitness/active-visits");
      setActiveVisits(visits);
    } catch {
      // Ignorieren falls fehlgeschlagen
    }
  };

  useEffect(() => {
    loadActiveVisits();
    // Automatisch Eingabefeld fokussieren für Barcode-Scanner
    inputRef.current?.focus();
  }, []);

  const handleCheckIn = async (e?: FormEvent) => {
    if (e) e.preventDefault();
    const term = query.trim();
    if (!term) return;

    setLoading(true);
    setFeedback(null);
    try {
      const result = await api<FitnessCheckInResult>("/fitness/check-in", {
        method: "POST",
        body: { query: term },
      });
      setFeedback(result);
      setQuery("");
      await loadActiveVisits();
      onRefresh();
    } catch (err: unknown) {
      setFeedback({
        success: false,
        message: err instanceof Error ? err.message : "Fehler bei der Check-In Abfrage",
        alertLevel: "error",
      });
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  };

  const handleCheckOut = async (checkInId: string) => {
    setCheckingOutId(checkInId);
    try {
      await api<{ success: boolean; message: string }>(`/fitness/check-out/${checkInId}`, {
        method: "POST",
      });
      await loadActiveVisits();
      onRefresh();
    } catch {
      // Fehlerbehandlung
    } finally {
      setCheckingOutId(null);
    }
  };

  // Studioauslastung kalkulieren
  const occupancyPercent = Math.min(
    100,
    Math.round((stats.checkedInNowCount / (stats.maxCapacity || 120)) * 100)
  );

  const occupancyTone = occupancyPercent > 80 ? "bad" : occupancyPercent > 55 ? "warn" : "";

  const filteredVisits = activeVisits.filter((v) => {
    if (!activeFilter) return true;
    const q = activeFilter.toLowerCase();
    return (
      v.memberName.toLowerCase().includes(q) ||
      v.memberNumber.toLowerCase().includes(q) ||
      v.planName.toLowerCase().includes(q)
    );
  });

  const timeAgo = (isoString: string) => {
    const diffMin = Math.floor((Date.now() - new Date(isoString).getTime()) / 60000);
    if (diffMin < 1) return "gerade eben";
    if (diffMin < 60) return `vor ${diffMin} Min.`;
    const hours = Math.floor(diffMin / 60);
    const mins = diffMin % 60;
    return `vor ${hours} Std. ${mins} Min.`;
  };

  return (
    <div className="stack">
      {/* --- OBERER EMPFANGS-TERMINAL BEREICH --- */}
      <div className="fitness-desk">
        {/* Check-In Scan-Terminal (Große Touch- & Scanner-Fläche) */}
        <section className="card stack">
          <div className="section-head">
            <h2 className="card-title"><Scan size={20} /> Theken-Check-In & Schnelleinlass</h2>
            <span className="pill mono">Barcode / QR / RFID</span>
          </div>

          <p className="muted">
            Halte den Mitgliedsausweis vor den Scanner oder tippe die Mitgliedsnummer (z. B.{" "}
            <strong className="mono">M-1001</strong>), Namen oder Telefonnummer ein.
          </p>

          <form onSubmit={handleCheckIn} className="fitness-scan">
            <label className="search">
              <Scan size={18} />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Ausweis scannen oder Mitgliedsnummer eingeben..."
                aria-label="Ausweis scannen oder Mitgliedsnummer eingeben..."
                autoFocus
              />
              {query && (
                <button type="button" onClick={() => setQuery("")} className="icon-button" aria-label="Eingabe leeren">
                  ×
                </button>
              )}
            </label>
            <button type="submit" disabled={loading || !query.trim()} className="button primary">
              {loading ? <RefreshCw size={18} className="spin" /> : <UserCheck size={18} />}
              Einchecken
            </button>
          </form>

          {/* Schnelltasten für Test/Empfang */}
          <div className="row wrap gap fitness-quick">
            <span className="small muted">Schnellwahl:</span>
            {["M-1001", "M-1002", "M-1003", "M-1004", "M-1005", "M-1006"].map((num) => (
              <button
                key={num}
                type="button"
                onClick={() => {
                  setQuery(num);
                  setTimeout(() => {
                    inputRef.current?.focus();
                  }, 50);
                }}
                className="chip mono"
              >
                {num}
              </button>
            ))}
          </div>

          {/* RÜCKMELDUNG / VALIDIERUNGS-SIGNAL (GRÜN / ROT / GELB) */}
          {feedback && (
            <div className={`fitness-feedback ${feedback.alertLevel}`} role="status">
              <span className="fitness-feedback-icon">
                {feedback.alertLevel === "success" ? (
                  <CheckCircle2 size={24} />
                ) : feedback.alertLevel === "warning" ? (
                  <AlertTriangle size={24} />
                ) : (
                  <XCircle size={24} />
                )}
              </span>
              <div className="fitness-feedback-body">
                <h3>
                  {feedback.alertLevel === "success"
                    ? "Check-In Erfolgreich!"
                    : feedback.alertLevel === "warning"
                    ? "Hinweis / Warnung"
                    : "Zugang Verwehrt"}
                </h3>
                <p>{feedback.message}</p>

                {feedback.member && (
                  <div className="row wrap gap small">
                    <span className="pill mono">{feedback.member.memberNumber}</span>
                    <strong>
                      {feedback.member.firstName} {feedback.member.lastName}
                    </strong>
                    <span>·</span>
                    <span>{feedback.member.planName}</span>
                    {feedback.member.remainingUnits !== undefined && (
                      <>
                        <span>·</span>
                        <span className="pill">{feedback.member.remainingUnits} Einheiten verbleibend</span>
                      </>
                    )}
                  </div>
                )}
              </div>

              {feedback.member && (
                <button onClick={() => onSelectMember(feedback.member!.id)} className="button small-button">
                  Mitgliederakte
                </button>
              )}
            </div>
          )}
        </section>

        {/* Studio-Auslastung & Schnellaktionen */}
        <div className="stack">
          {/* Live Auslastungskarte */}
          <section className="card stack-sm">
            <div className="section-head">
              <span className="tile-label">Live Auslastung</span>
              <span className="pill">Max. {stats.maxCapacity || 120} Personen</span>
            </div>
            <div className="fitness-big">
              <strong>{stats.checkedInNowCount}</strong>
              <span className="muted">anwesend ({occupancyPercent} %)</span>
            </div>
            {/* Auslastungs-Balken */}
            <div className="fitness-bar">
              <span className={occupancyTone} style={{ width: `${occupancyPercent}%` }} />
            </div>
            <p className="fitness-icon-line small muted">
              <Users size={14} />
              <span>{stats.visitsTodayCount} Studiobesuche heute registriert</span>
            </p>
          </section>

          {/* Empfang Schnellzugriff: Kasse & Neuanmeldung */}
          <section className="card stack-sm fitness-service">
            <span className="eyebrow"><Sparkles size={14} /> Thekenservice</span>
            <h3>Thekenverkauf & Getränke</h3>
            <p className="small muted">
              Verkäufe von Proteindrinks, Riegeln oder Handtüchern direkt in die Kasse einbuchen.
            </p>
            <div className="fitness-two">
              <button onClick={() => navigate("/app/kasse")} className="button primary">
                <ShoppingCart size={17} />
                Kasse öffnen
              </button>
              <button onClick={onOpenNewMemberModal} className="button">
                <UserPlus size={17} />
                Neues Mitglied
              </button>
            </div>
          </section>
        </div>
      </div>

      {/* --- LIVE-ANWESENHEITSLISTE (GÄSTE AKTUELL IM STUDIO) --- */}
      <section className="card list-card">
        <div className="section-head fitness-list-head">
          <div className="row gap">
            <span className="stat-icon"><Users size={18} /></span>
            <div>
              <h2>Aktuell im Studio ({activeVisits.length})</h2>
              <small className="muted">Echtzeitliste aller anwesenden Mitglieder mit Aufenthaltsdauer</small>
            </div>
          </div>
          <div className="row gap">
            <label className="search compact">
              <Search size={16} />
              <input
                type="search"
                value={activeFilter}
                onChange={(e) => setActiveFilter(e.target.value)}
                placeholder="In Anwesenden suchen..."
                aria-label="In Anwesenden suchen..."
              />
            </label>
            <button onClick={loadActiveVisits} className="icon-button" title="Liste aktualisieren" aria-label="Liste aktualisieren">
              <RefreshCw size={18} />
            </button>
          </div>
        </div>

        {filteredVisits.length === 0 ? (
          <p className="empty muted">
            {activeVisits.length === 0
              ? "Derzeit sind keine Gäste im Studio eingecheckt."
              : "Keine anwesenden Mitglieder zur Suchanfrage gefunden."}
          </p>
        ) : (
          filteredVisits.map((visit) => (
            <div key={visit.id} className="list-row fitness-visit-row">
              {/* Avatar-Initialen */}
              <span className="fitness-avatar" aria-hidden>
                {visit.memberName
                  .split(" ")
                  .map((n) => n[0])
                  .slice(0, 2)
                  .join("")}
              </span>
              <span className="list-main">
                <span className="fitness-row-title">
                  <strong>{visit.memberName}</strong>
                  <span className="pill mono">{visit.memberNumber}</span>
                </span>
                <small className="muted">
                  {visit.planName} ·{" "}
                  <span className="fitness-time">
                    <Clock size={13} />
                    {timeAgo(visit.checkedInAt)}
                  </span>
                </small>
              </span>
              <span className="fitness-row-actions">
                <button onClick={() => onSelectMember(visit.memberId)} className="button small-button">
                  Details
                </button>
                <button
                  onClick={() => handleCheckOut(visit.id)}
                  disabled={checkingOutId === visit.id}
                  className="button small-button danger"
                  title="Gast auschecken"
                >
                  {checkingOutId === visit.id ? <RefreshCw size={14} className="spin" /> : <LogOut size={14} />}
                  Check-Out
                </button>
              </span>
            </div>
          ))
        )}
      </section>
    </div>
  );
}
