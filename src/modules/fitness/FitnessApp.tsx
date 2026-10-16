import { useEffect, useState, useCallback } from "react";
import {
  Dumbbell,
  UserCheck,
  Users,
  Calendar,
  CreditCard,
  RefreshCw,
  Clock,
  TrendingUp,
  Sparkles,
  Activity,
  Award,
} from "lucide-react";
import { api, type Me } from "../../api";
import type {
  FitnessMember,
  FitnessPlan,
  FitnessStats,
} from "../../../shared/fitness";
import { CheckInTab } from "./CheckInTab";
import { MembersTab } from "./MembersTab";
import { ClassesTab } from "./ClassesTab";
import { PlansTab } from "./PlansTab";
import { FitnessPrint } from "./FitnessPrint";

export default function FitnessApp({ me, path }: { me: Me; path: string }) {
  const [activeTab, setActiveTab] = useState<"checkin" | "members" | "classes" | "plans">("checkin");
  const [stats, setStats] = useState<FitnessStats>({
    activeMembersCount: 0,
    totalMembersCount: 0,
    checkedInNowCount: 0,
    maxCapacity: 120,
    classesTodayCount: 0,
    monthlyRevenueGross: 0,
    visitsTodayCount: 0,
  });
  const [plans, setPlans] = useState<FitnessPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Druckdialog State
  const [printState, setPrintState] = useState<{
    member: FitnessMember;
    plan?: FitnessPlan;
    type: "contract" | "card";
  } | null>(null);

  // Gesteuertes Auswählen eines Mitglieds (z.B. nach Klick auf Akte)
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);

  const fmtEuro = (amount: number) =>
    new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(amount);

  const loadData = useCallback(async (silent = false) => {
    if (!silent) setRefreshing(true);
    try {
      const [statsRes, plansRes] = await Promise.all([
        api<FitnessStats>("/fitness/stats"),
        api<FitnessPlan[]>("/fitness/plans"),
      ]);
      setStats(statsRes);
      setPlans(plansRes);
    } catch {
      // Fehler ignorieren
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSelectMemberFromOtherTab = (memberId: string) => {
    setSelectedMemberId(memberId);
    setActiveTab("members");
  };

  const occupancyPercent = Math.min(
    100,
    Math.round((stats.checkedInNowCount / (stats.maxCapacity || 120)) * 100)
  );

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      {/* --- KOPFZEILE & KPIs --- */}
      <div className="bg-white rounded-2xl border border-zinc-200 shadow-xs p-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-600 to-teal-700 text-white flex items-center justify-center shadow-md shadow-emerald-500/20 shrink-0">
              <Dumbbell className="w-7 h-7" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-extrabold text-zinc-900 tracking-tight">
                  Fitnessstudio & Kurse
                </h1>
                <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                  Live
                </span>
              </div>
              <p className="text-xs text-zinc-500 mt-1">
                Empfangstresen, Barcode-Check-In, Studioauslastung, Mitgliederkartei und Kursplan
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end lg:self-auto">
            <button
              onClick={() => loadData()}
              disabled={refreshing}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-zinc-600 hover:text-zinc-900 bg-zinc-100 hover:bg-zinc-200 rounded-xl transition-colors cursor-pointer"
              title="Daten aktualisieren"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
              <span>Aktualisieren</span>
            </button>
          </div>
        </div>

        {/* KPI-Kacheln */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6 pt-6 border-t border-zinc-100">
          {/* 1. Studioauslastung */}
          <div className="p-3.5 bg-zinc-50 rounded-xl border border-zinc-100">
            <div className="flex items-center justify-between text-xs text-zinc-500 mb-1">
              <span className="font-medium">Studioauslastung</span>
              <Activity className="w-3.5 h-3.5 text-emerald-600" />
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-extrabold text-zinc-900">
                {stats.checkedInNowCount}
              </span>
              <span className="text-xs text-zinc-400">
                / {stats.maxCapacity} ({occupancyPercent}%)
              </span>
            </div>
          </div>

          {/* 2. Aktive Mitglieder */}
          <div className="p-3.5 bg-zinc-50 rounded-xl border border-zinc-100">
            <div className="flex items-center justify-between text-xs text-zinc-500 mb-1">
              <span className="font-medium">Aktive Mitglieder</span>
              <Users className="w-3.5 h-3.5 text-emerald-600" />
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-extrabold text-zinc-900">
                {stats.activeMembersCount}
              </span>
              <span className="text-xs text-zinc-400">von {stats.totalMembersCount}</span>
            </div>
          </div>

          {/* 3. Beitrags-Volumen */}
          <div className="p-3.5 bg-zinc-50 rounded-xl border border-zinc-100">
            <div className="flex items-center justify-between text-xs text-zinc-500 mb-1">
              <span className="font-medium">Beiträge / Monat</span>
              <TrendingUp className="w-3.5 h-3.5 text-emerald-600" />
            </div>
            <div className="text-2xl font-extrabold text-zinc-900">
              {fmtEuro(stats.monthlyRevenueGross)}
            </div>
          </div>

          {/* 4. Kurse heute */}
          <div className="p-3.5 bg-zinc-50 rounded-xl border border-zinc-100">
            <div className="flex items-center justify-between text-xs text-zinc-500 mb-1">
              <span className="font-medium">Kurse heute</span>
              <Calendar className="w-3.5 h-3.5 text-emerald-600" />
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-extrabold text-zinc-900">
                {stats.classesTodayCount}
              </span>
              <span className="text-xs text-zinc-400">Einheiten geplant</span>
            </div>
          </div>
        </div>
      </div>

      {/* --- TAB NAVIGATION --- */}
      <div className="flex items-center gap-2 border-b border-zinc-200 pb-1 overflow-x-auto">
        <button
          onClick={() => setActiveTab("checkin")}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-colors cursor-pointer whitespace-nowrap ${
            activeTab === "checkin"
              ? "bg-emerald-600 text-white shadow-xs"
              : "text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100"
          }`}
        >
          <UserCheck className="w-4 h-4" />
          <span>Theken-Check-In</span>
        </button>

        <button
          onClick={() => setActiveTab("members")}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-colors cursor-pointer whitespace-nowrap ${
            activeTab === "members"
              ? "bg-emerald-600 text-white shadow-xs"
              : "text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100"
          }`}
        >
          <Users className="w-4 h-4" />
          <span>Mitgliederkartei ({stats.totalMembersCount})</span>
        </button>

        <button
          onClick={() => setActiveTab("classes")}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-colors cursor-pointer whitespace-nowrap ${
            activeTab === "classes"
              ? "bg-emerald-600 text-white shadow-xs"
              : "text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100"
          }`}
        >
          <Calendar className="w-4 h-4" />
          <span>Wochenkursplan</span>
        </button>

        <button
          onClick={() => setActiveTab("plans")}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-colors cursor-pointer whitespace-nowrap ${
            activeTab === "plans"
              ? "bg-emerald-600 text-white shadow-xs"
              : "text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100"
          }`}
        >
          <CreditCard className="w-4 h-4" />
          <span>Tarife & 10er-Karten</span>
        </button>
      </div>

      {/* --- TAB INHALTE --- */}
      {activeTab === "checkin" && (
        <CheckInTab
          stats={stats}
          onRefresh={() => loadData(true)}
          onOpenNewMemberModal={() => setActiveTab("members")}
          onSelectMember={handleSelectMemberFromOtherTab}
        />
      )}

      {activeTab === "members" && (
        <MembersTab
          plans={plans}
          selectedMemberId={selectedMemberId}
          onClearSelectedMember={() => setSelectedMemberId(null)}
          onSelectMember={(id) => setSelectedMemberId(id)}
          onOpenContractPrint={(m, p) => setPrintState({ member: m, plan: p, type: "contract" })}
          onOpenCardPrint={(m, p) => setPrintState({ member: m, plan: p, type: "card" })}
          onRefreshStats={() => loadData(true)}
        />
      )}

      {activeTab === "classes" && <ClassesTab onRefreshStats={() => loadData(true)} />}

      {activeTab === "plans" && <PlansTab plans={plans} onRefreshPlans={() => loadData(true)} />}

      {/* --- DRUCKANSICHT MODAL --- */}
      {printState && (
        <FitnessPrint
          member={printState.member}
          plan={printState.plan}
          type={printState.type}
          onClose={() => setPrintState(null)}
        />
      )}
    </div>
  );
}
