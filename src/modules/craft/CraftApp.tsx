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
  Users,
  AlertCircle,
  PenTool,
} from "lucide-react";
import { api, type Me } from "../../api";
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

export default function CraftApp({ me, path }: { me: Me; path: string }) {
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

  const fmtEuro = (amount: number) =>
    new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(amount);

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
    // Auto-refresh every 12 seconds
    const interval = setInterval(() => loadData(true), 12000);
    return () => clearInterval(interval);
  }, [loadData]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[500px] text-slate-400 space-y-3">
        <HardHat className="w-10 h-10 animate-bounce text-amber-500" />
        <p className="text-sm">Handwerk & Baustelle wird geladen...</p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6 font-sans">
      {/* Top Banner: Module Title & KPIs */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-amber-500 text-slate-950 flex items-center justify-center font-bold shadow-md shadow-amber-500/10">
            <HardHat className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-slate-900 dark:text-white">
                Handwerk & Baustelle
              </h1>
              <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300">
                Meisterbetrieb
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Baustellenakte, mobiles Aufmaß, Rapportzettel mit Touch-Kundenunterschrift & § 35a Abrechnung
            </p>
          </div>
        </div>

        {/* Refresh button */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => loadData()}
            disabled={refreshing}
            className="p-2 text-slate-500 hover:text-slate-900 dark:hover:text-white rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            title="Daten neu laden"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin text-amber-500" : ""}`} />
          </button>
        </div>
      </div>

      {/* KPI Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {/* Aktive Baustellen */}
        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 text-xs">
            <span>Aktive Baustellen</span>
            <FolderKanban className="w-4 h-4 text-amber-500" />
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="text-2xl font-mono font-bold text-slate-900 dark:text-white">
              {stats.activeProjectsCount}
            </span>
            <span className="text-xs text-slate-400 font-mono">/ {stats.totalProjectsCount} gesamt</span>
          </div>
        </div>

        {/* Ausstehende Unterschriften */}
        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 text-xs">
            <span>Ausstehende Signatur</span>
            <PenTool className="w-4 h-4 text-amber-600" />
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="text-2xl font-mono font-bold text-amber-600 dark:text-amber-400">
              {stats.pendingSignaturesCount}
            </span>
            <span className="text-xs text-slate-400">Rapporte</span>
          </div>
        </div>

        {/* Offene Abrechnungen */}
        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 text-xs">
            <span>Offene Abrechnung</span>
            <FileText className="w-4 h-4 text-blue-500" />
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="text-2xl font-mono font-bold text-slate-900 dark:text-white">
              {stats.openReportsCount}
            </span>
            <span className="text-xs text-blue-600 dark:text-blue-400 font-medium">abnahmebereit</span>
          </div>
        </div>

        {/* Monteurstunden */}
        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 text-xs">
            <span>Monteurstunden</span>
            <Clock className="w-4 h-4 text-slate-500" />
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="text-2xl font-mono font-bold text-slate-900 dark:text-white">
              {stats.totalWageHoursMonth}
            </span>
            <span className="text-xs text-slate-400 font-mono">Std. erfasst</span>
          </div>
        </div>

        {/* Monatsvolumen */}
        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs col-span-2 sm:col-span-1">
          <div className="flex items-center justify-between text-slate-500 text-xs">
            <span>Rapport-Volumen</span>
            <TrendingUp className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="text-xl font-mono font-bold text-slate-900 dark:text-white">
              {fmtEuro(stats.revenueThisMonthGross)}
            </span>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 overflow-x-auto pb-px">
        <button
          onClick={() => setActiveTab("projects")}
          className={`flex items-center gap-2 py-3 px-4 text-xs font-semibold border-b-2 transition-all whitespace-nowrap ${
            activeTab === "projects"
              ? "border-amber-500 text-amber-600 dark:text-amber-400"
              : "border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
          }`}
        >
          <FolderKanban className="w-4 h-4" />
          <span>Baustellen & Bauvorhaben</span>
          {stats.activeProjectsCount > 0 && (
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 font-mono">
              {stats.activeProjectsCount}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab("measurements")}
          className={`flex items-center gap-2 py-3 px-4 text-xs font-semibold border-b-2 transition-all whitespace-nowrap ${
            activeTab === "measurements"
              ? "border-amber-500 text-amber-600 dark:text-amber-400"
              : "border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
          }`}
        >
          <Ruler className="w-4 h-4" />
          <span>Mobiles Raumaufmaß</span>
          {measurements.length > 0 && (
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-mono">
              {measurements.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab("reports")}
          className={`flex items-center gap-2 py-3 px-4 text-xs font-semibold border-b-2 transition-all whitespace-nowrap ${
            activeTab === "reports"
              ? "border-amber-500 text-amber-600 dark:text-amber-400"
              : "border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
          }`}
        >
          <FileText className="w-4 h-4" />
          <span>Arbeitsberichte & Signatur</span>
          {stats.pendingSignaturesCount > 0 && (
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 font-mono">
              {stats.pendingSignaturesCount}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab("diary")}
          className={`flex items-center gap-2 py-3 px-4 text-xs font-semibold border-b-2 transition-all whitespace-nowrap ${
            activeTab === "diary"
              ? "border-amber-500 text-amber-600 dark:text-amber-400"
              : "border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
          }`}
        >
          <BookOpen className="w-4 h-4" />
          <span>Bautagebuch</span>
          {diary.length > 0 && (
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-mono">
              {diary.length}
            </span>
          )}
        </button>
      </div>

      {/* Tab Panels */}
      <div>
        {activeTab === "projects" && (
          <ProjectsTab
            projects={projects}
            onRefresh={() => loadData(true)}
          />
        )}

        {activeTab === "measurements" && (
          <MeasurementsTab
            measurements={measurements}
            projects={projects}
            onRefresh={() => loadData(true)}
          />
        )}

        {activeTab === "reports" && (
          <ReportsTab
            reports={reports}
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
    </div>
  );
}
