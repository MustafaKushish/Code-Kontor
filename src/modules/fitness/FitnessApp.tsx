import { useEffect, useState, useCallback } from "react";
import { UserCheck, Users, Calendar, CreditCard, RefreshCw, TrendingUp, Activity } from "lucide-react";
import { api, type Me } from "../../api";
import { AppIcon } from "../../components";
import { findApp } from "../../../shared/apps";
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
import "./fitness.css";
import { useFitnessI18n } from "./i18n";

export default function FitnessApp({ me, path }: { me: Me; path: string }) {
  const { t, money } = useFitnessI18n();
  const isManager = me.user.role !== "staff";
  const app = findApp("fitness")!;
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

  const fmtEuro = money;

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

  const tabs = [
    { id: "checkin" as const, label: t("tabs.checkin"), icon: UserCheck },
    { id: "members" as const, label: t("tabs.members", { n: stats.totalMembersCount }), icon: Users },
    { id: "classes" as const, label: t("tabs.classes"), icon: Calendar },
    // Tarife pflegen nur Inhaber und Admins (prüft auch der Server)
    ...(isManager ? [{ id: "plans" as const, label: t("tabs.plans"), icon: CreditCard }] : []),
  ];

  return (
    <div className="stack-lg fitness">
      {/* --- KOPFZEILE --- */}
      <header className="page-head with-icon fitness-head">
        <AppIcon app={app} size="lg" />
        <div>
          <h1 className="display">
            {t("app.title")} <span className="pill pos">{t("app.live")}</span>
          </h1>
          <p className="muted">{t("app.subtitle")}</p>
        </div>
        <div className="row gap push-end">
          <button className="button" onClick={() => loadData()} disabled={refreshing} title={t("app.refreshTitle")}>
            <RefreshCw size={18} className={refreshing ? "spin" : ""} /> {t("app.refresh")}
          </button>
        </div>
      </header>

      {/* --- TAB NAVIGATION --- */}
      <div className="page-tabs fitness-tabs" role="tablist">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button key={id} role="tab" aria-selected={activeTab === id} className={activeTab === id ? "active" : ""} onClick={() => setActiveTab(id)}>
            <Icon size={17} aria-hidden /> {label}
          </button>
        ))}
      </div>

      {/* --- KPI-KACHELN --- */}
      <div className="fitness-stats">
        <div className="tile stat-tile">
          <span className="stat-icon"><Activity size={18} /></span>
          <strong>{stats.checkedInNowCount}<span className="unit">/ {stats.maxCapacity} ({occupancyPercent}%)</span></strong>
          <small>{t("stats.occupancy")}</small>
        </div>
        <div className="tile stat-tile">
          <span className="stat-icon"><Users size={18} /></span>
          <strong>{stats.activeMembersCount}<span className="unit">{t("stats.ofTotal", { n: stats.totalMembersCount })}</span></strong>
          <small>{t("stats.activeMembers")}</small>
        </div>
        <div className="tile stat-tile">
          <span className="stat-icon"><TrendingUp size={18} /></span>
          <strong>{fmtEuro(stats.monthlyRevenueGross)}</strong>
          <small>{t("stats.revenue")}</small>
        </div>
        <div className="tile stat-tile">
          <span className="stat-icon"><Calendar size={18} /></span>
          <strong>{stats.classesTodayCount}<span className="unit">{t("stats.unitsPlanned")}</span></strong>
          <small>{t("stats.classesToday")}</small>
        </div>
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
          isManager={isManager}
        />
      )}

      {activeTab === "classes" && <ClassesTab onRefreshStats={() => loadData(true)} isManager={isManager} />}

      {activeTab === "plans" && isManager && <PlansTab plans={plans} onRefreshPlans={() => loadData(true)} />}

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
