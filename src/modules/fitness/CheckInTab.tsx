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
import { useFitnessI18n } from "./i18n";

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
  const { t, fitnessError, checkInMessage } = useFitnessI18n();
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
        message: err instanceof Error ? fitnessError(err) : t("checkin.failed"),
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
    } catch (err: unknown) {
      setFeedback({ success: false, message: fitnessError(err), alertLevel: "error" });
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
    if (diffMin < 1) return t("checkin.justNow");
    if (diffMin < 60) return t("checkin.minutesAgo", { m: diffMin });
    const hours = Math.floor(diffMin / 60);
    const mins = diffMin % 60;
    return t("checkin.hoursAgo", { h: hours, m: mins });
  };

  return (
    <div className="stack">
      {/* --- OBERER EMPFANGS-TERMINAL BEREICH --- */}
      <div className="fitness-desk">
        {/* Check-In Scan-Terminal (Große Touch- & Scanner-Fläche) */}
        <section className="card stack">
          <div className="section-head">
            <h2 className="card-title"><Scan size={20} /> {t("checkin.title")}</h2>
            <span className="pill mono">{t("checkin.scanTypes")}</span>
          </div>

          <p className="muted">
            {t("checkin.introBefore")}{" "}
            <strong className="mono">M-1001</strong>{t("checkin.introAfter")}
          </p>

          <form onSubmit={handleCheckIn} className="fitness-scan">
            <label className="search">
              <Scan size={18} />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("checkin.placeholder")}
                aria-label={t("checkin.placeholder")}
                autoFocus
              />
              {query && (
                <button type="button" onClick={() => setQuery("")} className="icon-button" aria-label={t("checkin.clear")}>
                  ×
                </button>
              )}
            </label>
            <button type="submit" disabled={loading || !query.trim()} className="button primary">
              {loading ? <RefreshCw size={18} className="spin" /> : <UserCheck size={18} />}
              {t("checkin.submit")}
            </button>
          </form>

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
                    ? t("checkin.success")
                    : feedback.alertLevel === "warning"
                    ? t("checkin.warning")
                    : t("checkin.denied")}
                </h3>
                <p>{checkInMessage(feedback)}</p>

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
                        <span className="pill">{t("common.unitsLeft", { n: feedback.member.remainingUnits })}</span>
                      </>
                    )}
                  </div>
                )}
              </div>

              {feedback.member && (
                <button onClick={() => onSelectMember(feedback.member!.id)} className="button small-button">
                  {t("checkin.memberFile")}
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
              <span className="tile-label">{t("checkin.liveOccupancy")}</span>
              <span className="pill">{t("checkin.maxPeople", { n: stats.maxCapacity || 120 })}</span>
            </div>
            <div className="fitness-big">
              <strong>{stats.checkedInNowCount}</strong>
              <span className="muted">{t("checkin.present", { p: occupancyPercent })}</span>
            </div>
            {/* Auslastungs-Balken */}
            <div className="fitness-bar">
              <span className={occupancyTone} style={{ width: `${occupancyPercent}%` }} />
            </div>
            <p className="fitness-icon-line small muted">
              <Users size={14} />
              <span>{t("checkin.visitsToday", { n: stats.visitsTodayCount })}</span>
            </p>
          </section>

          {/* Empfang Schnellzugriff: Kasse & Neuanmeldung */}
          <section className="card stack-sm fitness-service">
            <span className="eyebrow"><Sparkles size={14} /> {t("checkin.serviceEyebrow")}</span>
            <h3>{t("checkin.serviceTitle")}</h3>
            <p className="small muted">
              {t("checkin.serviceText")}
            </p>
            <div className="fitness-two">
              <button onClick={() => navigate("/app/kasse")} className="button primary">
                <ShoppingCart size={17} />
                {t("checkin.openPos")}
              </button>
              <button onClick={onOpenNewMemberModal} className="button">
                <UserPlus size={17} />
                {t("common.newMember")}
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
              <h2>{t("checkin.inStudio", { n: activeVisits.length })}</h2>
              <small className="muted">{t("checkin.inStudioHint")}</small>
            </div>
          </div>
          <div className="row gap">
            <label className="search compact">
              <Search size={16} />
              <input
                type="search"
                value={activeFilter}
                onChange={(e) => setActiveFilter(e.target.value)}
                placeholder={t("checkin.searchPresent")}
                aria-label={t("checkin.searchPresent")}
              />
            </label>
            <button onClick={loadActiveVisits} className="icon-button" title={t("checkin.refreshList")} aria-label={t("checkin.refreshList")}>
              <RefreshCw size={18} />
            </button>
          </div>
        </div>

        {filteredVisits.length === 0 ? (
          <p className="empty muted">
            {activeVisits.length === 0
              ? t("checkin.emptyNone")
              : t("checkin.emptySearch")}
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
                  {t("common.details")}
                </button>
                <button
                  onClick={() => handleCheckOut(visit.id)}
                  disabled={checkingOutId === visit.id}
                  className="button small-button danger"
                  title={t("checkin.checkOutTitle")}
                >
                  {checkingOutId === visit.id ? <RefreshCw size={14} className="spin" /> : <LogOut size={14} />}
                  {t("checkin.checkOut")}
                </button>
              </span>
            </div>
          ))
        )}
      </section>
    </div>
  );
}
