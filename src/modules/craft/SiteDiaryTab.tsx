import { useState } from "react";
import {
  BookOpen,
  Plus,
  Sun,
  Cloud,
  CloudRain,
  Snowflake,
  Thermometer,
  Users,
  AlertTriangle,
  X,
  Search,
  Calendar,
} from "lucide-react";
import { api } from "../../api";
import { Field } from "../../components";
import type {
  CraftProject,
  CraftSiteDiaryEntry,
} from "../../../shared/craft";

interface SiteDiaryTabProps {
  diary: CraftSiteDiaryEntry[];
  projects: CraftProject[];
  onRefresh: () => void;
}

export function SiteDiaryTab({ diary, projects, onRefresh }: SiteDiaryTabProps) {
  const [selectedProjectId, setSelectedProjectId] = useState<string>("alle");
  const [search, setSearch] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isBusy, setIsBusy] = useState(false);

  // New Entry Form State
  const [newProjectId, setNewProjectId] = useState(projects[0]?.id || "");
  const [newDate, setNewDate] = useState(new Date().toISOString().slice(0, 10));
  const [newAuthor, setNewAuthor] = useState("Markus Krause (Bauleiter)");
  const [newWeather, setNewWeather] = useState<CraftSiteDiaryEntry["weather"]>("Sonnig");
  const [newTemp, setNewTemp] = useState(19);
  const [newTrades, setNewTrades] = useState<string[]>(["Elektro", "Sanitär"]);
  const [newActivities, setNewActivities] = useState("");
  const [newIssues, setNewIssues] = useState("");

  const filteredDiary = diary.filter((entry) => {
    const matchesProj = selectedProjectId === "alle" || entry.projectId === selectedProjectId;
    const matchesSearch =
      !search ||
      entry.activitiesSummary.toLowerCase().includes(search.toLowerCase()) ||
      entry.author.toLowerCase().includes(search.toLowerCase()) ||
      (entry.issuesOrDelays && entry.issuesOrDelays.toLowerCase().includes(search.toLowerCase()));
    return matchesProj && matchesSearch;
  });

  const availableTrades = [
    "Elektro",
    "Sanitär & Heizung",
    "Maler",
    "Trockenbau",
    "Estrichleger",
    "Fliesenleger",
    "Dachdecker",
    "Zimmerer",
    "Rohbau",
  ];

  const toggleTrade = (trade: string) => {
    if (newTrades.includes(trade)) {
      setNewTrades(newTrades.filter((t) => t !== trade));
    } else {
      setNewTrades([...newTrades, trade]);
    }
  };

  const handleSaveEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjectId || !newAuthor || !newActivities) return;
    setIsBusy(true);
    try {
      await api("/craft/site-diary", {
        method: "POST",
        body: JSON.stringify({
          projectId: newProjectId,
          date: newDate,
          author: newAuthor,
          weather: newWeather,
          temperatureCelsius: newTemp,
          tradesPresent: newTrades,
          activitiesSummary: newActivities,
          issuesOrDelays: newIssues.trim() || undefined,
        }),
      });
      setIsModalOpen(false);
      setNewActivities("");
      setNewIssues("");
      onRefresh();
    } catch (err) {
      console.error(err);
    } finally {
      setIsBusy(false);
    }
  };

  const getWeatherIcon = (weather?: CraftSiteDiaryEntry["weather"]) => {
    switch (weather) {
      case "Sonnig":
        return <Sun className="w-4 h-4 text-amber-500" />;
      case "Regen":
        return <CloudRain className="w-4 h-4 text-blue-500" />;
      case "Frost":
      case "Schnee":
        return <Snowflake className="w-4 h-4 text-cyan-500" />;
      default:
        return <Cloud className="w-4 h-4 text-slate-400" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Filter and Controls */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        {/* Project Selector */}
        <div className="flex items-center gap-2 w-full md:w-auto">
          <label className="text-xs text-slate-500 font-semibold whitespace-nowrap">
            Bauvorhaben:
          </label>
          <select
            value={selectedProjectId}
            onChange={(e) => setSelectedProjectId(e.target.value)}
            className="w-full md:w-72 px-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
          >
            <option value="alle">Alle Baustellen ({projects.length})</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.projectNumber} · {p.title}
              </option>
            ))}
          </select>
        </div>

        {/* Search & Add */}
        <div className="flex items-center gap-3 w-full md:w-auto justify-end">
          <div className="relative w-full sm:w-48">
            <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="Eintrag suchen..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
            />
          </div>

          <button
            onClick={() => setIsModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            Bautagebuch-Eintrag
          </button>
        </div>
      </div>

      {/* Diary Entries List */}
      <div className="space-y-4">
        {filteredDiary.length === 0 ? (
          <div className="text-center py-20 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 text-slate-400">
            <BookOpen className="w-12 h-12 mx-auto mb-2 opacity-30" />
            <p className="text-sm font-semibold">Noch keine Bautagebuch-Einträge vorhanden</p>
            <p className="text-xs text-slate-500 mt-1">
              Dokumentiere Witterung, anwesende Gewerke und den täglichen Baufortschritt vor Ort.
            </p>
          </div>
        ) : (
          filteredDiary.map((entry) => {
            const proj = projects.find((p) => p.id === entry.projectId);

            return (
              <div
                key={entry.id}
                className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-xs space-y-3"
              >
                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-xs font-bold text-slate-900 dark:text-white">
                      {new Date(entry.date).toLocaleDateString("de-DE", {
                        weekday: "short",
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                      })}
                    </span>
                    <span className="text-xs text-slate-400">·</span>
                    <span className="text-xs font-semibold text-amber-600 dark:text-amber-400 font-mono">
                      {proj?.projectNumber} {proj ? `(${proj.title})` : ""}
                    </span>
                    <span className="text-xs text-slate-400">·</span>
                    <span className="text-xs text-slate-500">{entry.author}</span>
                  </div>

                  {/* Weather and Temp */}
                  <div className="flex items-center gap-3 text-xs text-slate-600 dark:text-slate-300">
                    <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-800 px-2.5 py-1 rounded-lg border border-slate-200/60 dark:border-slate-700/60">
                      {getWeatherIcon(entry.weather)}
                      <span>{entry.weather}</span>
                    </div>

                    {entry.temperatureCelsius !== undefined && (
                      <div className="flex items-center gap-1 bg-slate-50 dark:bg-slate-800 px-2.5 py-1 rounded-lg border border-slate-200/60 dark:border-slate-700/60 font-mono">
                        <Thermometer className="w-3.5 h-3.5 text-red-500" />
                        <span>{entry.temperatureCelsius} °C</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Trades present */}
                {entry.tradesPresent && entry.tradesPresent.length > 0 && (
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[11px] text-slate-400 mr-1 flex items-center gap-1">
                      <Users className="w-3 h-3" /> Gewerke vor Ort:
                    </span>
                    {entry.tradesPresent.map((trade) => (
                      <span
                        key={trade}
                        className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-medium"
                      >
                        {trade}
                      </span>
                    ))}
                  </div>
                )}

                {/* Activity summary */}
                <div className="text-xs leading-relaxed text-slate-800 dark:text-slate-200 whitespace-pre-wrap">
                  {entry.activitiesSummary}
                </div>

                {/* Issues / Delays */}
                {entry.issuesOrDelays && (
                  <div className="p-3 bg-red-50 dark:bg-red-950/30 rounded-xl border border-red-200/80 dark:border-red-900/60 text-xs flex items-start gap-2 text-red-900 dark:text-red-200">
                    <AlertTriangle className="w-4 h-4 text-red-600 mt-0.5 shrink-0" />
                    <div>
                      <span className="font-bold block">Behinderungsanzeige / Mangel:</span>
                      <p className="mt-0.5">{entry.issuesOrDelays}</p>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Modal: Add Diary Entry */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-100 dark:border-slate-800">
              <h3 className="font-bold text-slate-900 dark:text-white text-base">
                Bautagebuch-Eintrag verfassen
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEntry} className="space-y-4">
              <Field label="Bauvorhaben / Baustelle" required>
                <select
                  required
                  value={newProjectId}
                  onChange={(e) => setNewProjectId(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg font-medium"
                >
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.projectNumber} · {p.title}
                    </option>
                  ))}
                </select>
              </Field>

              <div className="grid grid-cols-2 gap-4">
                <Field label="Datum" required>
                  <input
                    type="date"
                    required
                    value={newDate}
                    onChange={(e) => setNewDate(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                  />
                </Field>

                <Field label="Erfasser / Bauleiter" required>
                  <input
                    type="text"
                    required
                    value={newAuthor}
                    onChange={(e) => setNewAuthor(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                  />
                </Field>
              </div>

              {/* Weather & Temp */}
              <div className="grid grid-cols-2 gap-4">
                <Field label="Witterung">
                  <select
                    value={newWeather}
                    onChange={(e) => setNewWeather(e.target.value as any)}
                    className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                  >
                    <option value="Sonnig">Sonnig</option>
                    <option value="Bewölkt">Bewölkt</option>
                    <option value="Regen">Regen</option>
                    <option value="Frost">Frost</option>
                    <option value="Schnee">Schnee</option>
                  </select>
                </Field>

                <Field label="Temperatur (°C)">
                  <input
                    type="number"
                    value={newTemp}
                    onChange={(e) => setNewTemp(parseInt(e.target.value) || 0)}
                    className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg font-mono font-bold"
                  />
                </Field>
              </div>

              {/* Trades selection */}
              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1.5">
                  Anwesende Gewerke auf der Baustelle:
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {availableTrades.map((trade) => {
                    const isSelected = newTrades.includes(trade);
                    return (
                      <button
                        type="button"
                        key={trade}
                        onClick={() => toggleTrade(trade)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                          isSelected
                            ? "bg-amber-600 text-white shadow-xs"
                            : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200"
                        }`}
                      >
                        {trade}
                      </button>
                    );
                  })}
                </div>
              </div>

              <Field label="Tätigkeitsbericht & Baufortschritt" required>
                <textarea
                  rows={3}
                  required
                  placeholder="Ausgeführte Arbeiten aller Monteure, erreichte Bauabschnitte..."
                  value={newActivities}
                  onChange={(e) => setNewActivities(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                />
              </Field>

              <Field label="Behinderungen, Mängel oder Lieferverzug (optional)">
                <input
                  type="text"
                  placeholder="z.B. Vorleistung Trockenbauer unvollständig, kein Baustrom vorhanden"
                  value={newIssues}
                  onChange={(e) => setNewIssues(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-red-600 dark:text-red-400"
                />
              </Field>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-xs text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Abbrechen
                </button>
                <button
                  type="submit"
                  disabled={isBusy}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold shadow-sm"
                >
                  Eintrag speichern
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
