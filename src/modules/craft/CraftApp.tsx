import { useEffect, useState, useCallback } from "react";
import {
  HardHat,
  FolderKanban,
  Ruler,
  FileText,
  BookOpen,
  Clock,
  TrendingUp,
  RefreshCw,
  PenTool,
} from "lucide-react";
import { api, type Me } from "../../api";
import { AppIcon } from "../../components";
import { findApp } from "../../../shared/apps";
import type {
  CraftMeasurement,
  CraftProject,
  CraftReport,
  CraftSiteDiaryEntry,
  CraftStats,
} from "../../../shared/craft";
import { ProjectsTab } from "./ProjectsTab";
import { MeasurementsTab } from "./MeasurementsTab";
import { ReportsTab } from "./ReportsTab";
import { SiteDiaryTab } from "./SiteDiaryTab";
import "./craft.css";
import { useCraftI18n } from "./i18n";

export default function CraftApp({ me, path }: { me: Me; path: string }) {
  // Löschen nur für Inhaber und Admins (prüft auch der Server)
  const isManager = me.user.role !== "staff";
  const { appText, t, money } = useCraftI18n();
  const app = findApp("handwerk")!;
  const [activeTab, setActiveTab] = useState<"projects" | "measurements" | "reports" | "diary">("projects");
  const [stats, setStats] = useState<CraftStats>({
    activeProjectsCount: 0,
    totalProjectsCount: 0,
    pendingSignaturesCount: 0,
    openReportsCount: 0,
    totalWageHoursMonth: 0,
    revenueThisMonthGross: 0,
  });
  const [projects, setProjects] = useState<CraftProject[]>([]);
  const [measurements, setMeasurements] = useState<CraftMeasurement[]>([]);
  const [reports, setReports] = useState<CraftReport[]>([]);
  const [diary, setDiary] = useState<CraftSiteDiaryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async (silent = false) => {
    if (!silent) setRefreshing(true);
    try {
      const [statsRes, projectsRes, measurementsRes, reportsRes, diaryRes] = await Promise.all([
        api<CraftStats>("/craft/stats"),
        api<CraftProject[]>("/craft/projects"),
        api<CraftMeasurement[]>("/craft/measurements"),
        api<CraftReport[]>("/craft/reports"),
        api<CraftSiteDiaryEntry[]>("/craft/site-diary"),
      ]);
      setStats(statsRes);
      setProjects(projectsRes);
      setMeasurements(measurementsRes);
      setReports(reportsRes);
      setDiary(diaryRes);
    } catch (err) {
      console.error("Failed to load craft data:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    // Alle 12 s still aktualisieren, aber nur solange die Seite sichtbar ist
    let interval: ReturnType<typeof setInterval> | undefined;
    const start = () => {
      if (interval === undefined) interval = setInterval(() => loadData(true), 12000);
    };
    const stop = () => {
      if (interval !== undefined) clearInterval(interval);
      interval = undefined;
    };
    const onVisibility = () => {
      if (document.hidden) {
        stop();
      } else {
        loadData(true);
        start();
      }
    };
    if (!document.hidden) start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [loadData]);

  if (loading) {
    return (
      <div className="craft craft-loading muted">
        <HardHat size={36} aria-hidden />
        <p>{t("app.loading")}</p>
      </div>
    );
  }

  const tabs = [
    { id: "projects" as const, label: t("tabs.projects"), icon: FolderKanban, count: stats.activeProjectsCount },
    { id: "measurements" as const, label: t("tabs.measurements"), icon: Ruler, count: measurements.length },
    { id: "reports" as const, label: t("tabs.reports"), icon: FileText, count: stats.pendingSignaturesCount },
    { id: "diary" as const, label: t("tabs.diary"), icon: BookOpen, count: diary.length },
  ];

  return (
    <div className="stack-lg craft">
      <header className="page-head with-icon craft-head">
        <AppIcon app={app} size="lg" />
        <div>
          <h1 className="display">{appText(app.id).name}</h1>
          <p className="muted">
            {t("app.subtitle")}
          </p>
        </div>
        <div className="row gap push-end craft-head-actions">
          <span className="pill">{t("app.badge")}</span>
          <button
            className="icon-button"
            onClick={() => loadData()}
            disabled={refreshing}
            title={t("app.refresh")}
            aria-label={t("app.refresh")}
          >
            <RefreshCw size={18} className={refreshing ? "craft-spin" : undefined} />
          </button>
        </div>
      </header>

      <div className="craft-stats">
        <div className="tile stat-tile">
          <span className="stat-icon"><FolderKanban size={18} /></span>
          <strong>{stats.activeProjectsCount}</strong>
          <small>{t("stats.activeProjects", { total: stats.totalProjectsCount })}</small>
        </div>
        <div className="tile stat-tile">
          <span className="stat-icon"><PenTool size={18} /></span>
          <strong>{stats.pendingSignaturesCount}</strong>
          <small>{t("stats.pendingSignatures")}</small>
        </div>
        <div className="tile stat-tile">
          <span className="stat-icon"><FileText size={18} /></span>
          <strong>{stats.openReportsCount}</strong>
          <small>{t("stats.openBilling")}</small>
        </div>
        <div className="tile stat-tile">
          <span className="stat-icon"><Clock size={18} /></span>
          <strong>{stats.totalWageHoursMonth}</strong>
          <small>{t("stats.wageHours")}</small>
        </div>
        <div className="tile stat-tile craft-stat-wide">
          <span className="stat-icon"><TrendingUp size={18} /></span>
          <strong>{money(stats.revenueThisMonthGross)}</strong>
          <small>{t("stats.revenue")}</small>
        </div>
      </div>

      <div className="page-tabs craft-tabs" role="tablist">
        {tabs.map(({ id, label, icon: Icon, count }) => (
          <button
            key={id}
            role="tab"
            aria-selected={activeTab === id}
            className={activeTab === id ? "active" : ""}
            onClick={() => setActiveTab(id)}
          >
            <Icon size={17} aria-hidden /> {label}
            {count > 0 && <span className="craft-count">{count}</span>}
          </button>
        ))}
      </div>

      {activeTab === "projects" && (
        <ProjectsTab
          projects={projects}
          isManager={isManager}
          onRefresh={() => loadData(true)}
        />
      )}

      {activeTab === "measurements" && (
        <MeasurementsTab
          measurements={measurements}
          isManager={isManager}
          projects={projects}
          onRefresh={() => loadData(true)}
        />
      )}

      {activeTab === "reports" && (
        <ReportsTab
          reports={reports}
          isManager={isManager}
          projects={projects}
          onRefresh={() => loadData(true)}
        />
      )}

      {activeTab === "diary" && (
        <SiteDiaryTab
          diary={diary}
          projects={projects}
          onRefresh={() => loadData(true)}
        />
      )}
    </div>
  );
}
