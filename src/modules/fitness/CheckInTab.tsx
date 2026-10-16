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
  QrCode,
  ShieldAlert,
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
        body: JSON.stringify({ query: term }),
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

  const occupancyColor =
    occupancyPercent > 80
      ? "bg-rose-500"
      : occupancyPercent > 55
      ? "bg-amber-500"
      : "bg-emerald-500";

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
    <div className="space-y-6">
      {/* --- OBERER EMPFANGS-TERMINAL BEREICH --- */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Check-In Scan-Terminal (Große Touch- & Scanner-Fläche) */}
        <div className="lg:col-span-2 bg-white rounded-2xl p-6 border border-zinc-200 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2 text-zinc-900 font-bold text-lg">
                <Scan className="w-5 h-5 text-emerald-600" />
                <span>Theken-Check-In & Schnelleinlass</span>
              </div>
              <span className="text-xs font-mono text-zinc-400 bg-zinc-100 px-2 py-1 rounded-md">
                Barcode / QR / RFID
              </span>
            </div>

            <p className="text-sm text-zinc-500 mb-6">
              Halte den Mitgliedsausweis vor den Scanner oder tippe die Mitgliedsnummer (z. B.{" "}
              <span className="font-mono font-medium text-zinc-800">M-1001</span>), Namen oder Telefonnummer ein.
            </p>

            <form onSubmit={handleCheckIn} className="flex gap-3 mb-6">
              <div className="relative flex-1">
                <input
                  ref={inputRef}
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Ausweis scannen oder Mitgliedsnummer eingeben..."
                  className="w-full pl-11 pr-4 py-3.5 bg-zinc-50 border-2 border-zinc-200 focus:border-emerald-600 focus:bg-white rounded-xl text-base font-semibold text-zinc-900 placeholder:text-zinc-400 focus:outline-hidden transition-all shadow-inner"
                  autoFocus
                />
                <Scan className="w-5 h-5 text-zinc-400 absolute left-3.5 top-4" />
                {query && (
                  <button
                    type="button"
                    onClick={() => setQuery("")}
                    className="absolute right-3.5 top-3.5 text-zinc-400 hover:text-zinc-600 p-1"
                  >
                    ×
                  </button>
                )}
              </div>
              <button
                type="submit"
                disabled={loading || !query.trim()}
                className="px-6 py-3.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl font-bold text-sm transition-colors shadow-xs flex items-center gap-2 cursor-pointer"
              >
                {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <UserCheck className="w-4 h-4" />}
                Einchecken
              </button>
            </form>

            {/* Schnelltasten für Test/Empfang */}
            <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-zinc-100">
              <span className="text-xs text-zinc-400 font-medium">Schnellwahl:</span>
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
                  className="px-2.5 py-1 text-xs font-mono font-medium bg-zinc-100 hover:bg-zinc-200 text-zinc-700 rounded-lg transition-colors cursor-pointer"
                >
                  {num}
                </button>
              ))}
            </div>
          </div>

          {/* RÜCKMELDUNG / VALIDIERUNGS-SIGNAL (GRÜN / ROT / GELB) */}
          {feedback && (
            <div
              className={`mt-6 p-5 rounded-xl border transition-all animate-in fade-in duration-200 ${
                feedback.alertLevel === "success"
                  ? "bg-emerald-50/80 border-emerald-300 text-emerald-950"
                  : feedback.alertLevel === "warning"
                  ? "bg-amber-50/80 border-amber-300 text-amber-950"
                  : "bg-rose-50/80 border-rose-300 text-rose-950"
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3.5">
                  <div
                    className={`p-2.5 rounded-xl mt-0.5 ${
                      feedback.alertLevel === "success"
                        ? "bg-emerald-600 text-white"
                        : feedback.alertLevel === "warning"
                        ? "bg-amber-600 text-white"
                        : "bg-rose-600 text-white"
                    }`}
                  >
                    {feedback.alertLevel === "success" ? (
                      <CheckCircle2 className="w-6 h-6" />
                    ) : feedback.alertLevel === "warning" ? (
                      <AlertTriangle className="w-6 h-6" />
                    ) : (
                      <XCircle className="w-6 h-6" />
                    )}
                  </div>
                  <div>
                    <h3 className="text-lg font-bold">
                      {feedback.alertLevel === "success"
                        ? "Check-In Erfolgreich!"
                        : feedback.alertLevel === "warning"
                        ? "Hinweis / Warnung"
                        : "Zugang Verwehrt"}
                    </h3>
                    <p className="text-sm mt-0.5 font-medium leading-relaxed">{feedback.message}</p>

                    {feedback.member && (
                      <div className="flex flex-wrap items-center gap-3 mt-3 text-xs font-semibold">
                        <span className="font-mono bg-white/70 px-2 py-0.5 rounded border border-black/10">
                          {feedback.member.memberNumber}
                        </span>
                        <span>
                          {feedback.member.firstName} {feedback.member.lastName}
                        </span>
                        <span>·</span>
                        <span className="opacity-80">{feedback.member.planName}</span>
                        {feedback.member.remainingUnits !== undefined && (
                          <>
                            <span>·</span>
                            <span className="bg-white/70 px-2 py-0.5 rounded border border-black/10">
                              {feedback.member.remainingUnits} Einheiten verbleibend
                            </span>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {feedback.member && (
                  <button
                    onClick={() => onSelectMember(feedback.member!.id)}
                    className="text-xs font-semibold px-3 py-1.5 bg-white/80 hover:bg-white text-zinc-900 rounded-lg shadow-2xs border border-black/10 cursor-pointer"
                  >
                    Mitgliederakte
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Studio-Auslastung & Schnellaktionen */}
        <div className="space-y-6">
          {/* Live Auslastungskarte */}
          <div className="bg-white rounded-2xl p-6 border border-zinc-200 shadow-xs">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                Live Auslastung
              </span>
              <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-700">
                Max. {stats.maxCapacity || 120} Personen
              </span>
            </div>

            <div className="flex items-baseline gap-2 mb-3">
              <span className="text-3xl font-extrabold text-zinc-900">
                {stats.checkedInNowCount}
              </span>
              <span className="text-sm font-medium text-zinc-500">
                anwesend ({occupancyPercent} %)
              </span>
            </div>

            {/* Auslastungs-Balken */}
            <div className="w-full bg-zinc-100 rounded-full h-3 overflow-hidden mb-4">
              <div
                className={`h-full ${occupancyColor} transition-all duration-500 rounded-full`}
                style={{ width: `${occupancyPercent}%` }}
              />
            </div>

            <p className="text-xs text-zinc-500 flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5 text-zinc-400" />
              <span>{stats.visitsTodayCount} Studiobesuche heute registriert</span>
            </p>
          </div>

          {/* Empfang Schnellzugriff: Kasse & Neuanmeldung */}
          <div className="bg-gradient-to-br from-zinc-900 to-zinc-800 text-white rounded-2xl p-6 shadow-xs flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm uppercase tracking-wider mb-2">
                <Sparkles className="w-4 h-4" />
                <span>Thekenservice</span>
              </div>
              <h3 className="text-base font-bold text-white mb-1">
                Thekenverkauf & Getränke
              </h3>
              <p className="text-xs text-zinc-300 mb-4 leading-relaxed">
                Verkäufe von Proteindrinks, Riegeln oder Handtüchern direkt in die Kasse einbuchen.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-2">
              <button
                onClick={() => navigate("/app/kasse")}
                className="flex items-center justify-center gap-1.5 px-3 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
              >
                <ShoppingCart className="w-3.5 h-3.5" />
                Kasse öffnen
              </button>
              <button
                onClick={onOpenNewMemberModal}
                className="flex items-center justify-center gap-1.5 px-3 py-2.5 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
              >
                <UserPlus className="w-3.5 h-3.5" />
                Neues Mitglied
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* --- LIVE-ANWESENHEITSLISTE (GÄSTE AKTUELL IM STUDIO) --- */}
      <div className="bg-white rounded-2xl border border-zinc-200 shadow-xs overflow-hidden">
        <div className="p-5 border-b border-zinc-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-50 text-emerald-700 rounded-xl">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-zinc-900">
                Aktuell im Studio ({activeVisits.length})
              </h3>
              <p className="text-xs text-zinc-500">
                Echtzeitliste aller anwesenden Mitglieder mit Aufenthaltsdauer
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={activeFilter}
                onChange={(e) => setActiveFilter(e.target.value)}
                placeholder="In Anwesenden suchen..."
                className="pl-9 pr-3 py-1.5 text-xs bg-zinc-50 border border-zinc-200 focus:border-emerald-600 rounded-lg text-zinc-900 focus:outline-hidden"
              />
            </div>
            <button
              onClick={loadActiveVisits}
              className="p-2 text-zinc-500 hover:text-zinc-800 hover:bg-zinc-100 rounded-lg transition-colors cursor-pointer"
              title="Liste aktualisieren"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {filteredVisits.length === 0 ? (
          <div className="p-12 text-center text-zinc-400 text-sm">
            {activeVisits.length === 0
              ? "Derzeit sind keine Gäste im Studio eingecheckt."
              : "Keine anwesenden Mitglieder zur Suchanfrage gefunden."}
          </div>
        ) : (
          <div className="divide-y divide-zinc-100">
            {filteredVisits.map((visit) => (
              <div
                key={visit.id}
                className="p-4 hover:bg-zinc-50/80 transition-colors flex items-center justify-between gap-4"
              >
                <div className="flex items-center gap-4">
                  {/* Avatar-Initialen */}
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-600 to-teal-700 text-white font-bold text-sm flex items-center justify-center shadow-xs">
                    {visit.memberName
                      .split(" ")
                      .map((n) => n[0])
                      .slice(0, 2)
                      .join("")}
                  </div>

                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-zinc-900">{visit.memberName}</span>
                      <span className="text-xs font-mono font-medium text-zinc-500 bg-zinc-100 px-1.5 py-0.5 rounded">
                        {visit.memberNumber}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-zinc-500 mt-0.5">
                      <span>{visit.planName}</span>
                      <span>·</span>
                      <span className="flex items-center gap-1 text-emerald-700 font-medium">
                        <Clock className="w-3 h-3" />
                        {timeAgo(visit.checkedInAt)}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => onSelectMember(visit.memberId)}
                    className="px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:text-zinc-900 hover:bg-zinc-100 rounded-lg transition-colors cursor-pointer"
                  >
                    Details
                  </button>
                  <button
                    onClick={() => handleCheckOut(visit.id)}
                    disabled={checkingOutId === visit.id}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-100 hover:bg-rose-50 text-zinc-700 hover:text-rose-700 rounded-lg text-xs font-semibold transition-colors border border-zinc-200 hover:border-rose-200 cursor-pointer"
                    title="Gast auschecken"
                  >
                    {checkingOutId === visit.id ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <LogOut className="w-3.5 h-3.5" />
                    )}
                    <span>Check-Out</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
