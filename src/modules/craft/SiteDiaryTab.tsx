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
  Search,
  Calendar,
} from "lucide-react";
import { api } from "../../api";
import { Field } from "../../components";
import { Dialog } from "../../pos/ui";
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
        body: {
          projectId: newProjectId,
          date: newDate,
          author: newAuthor,
          weather: newWeather,
          temperatureCelsius: newTemp,
          tradesPresent: newTrades,
          activitiesSummary: newActivities,
          issuesOrDelays: newIssues.trim() || undefined,
        },
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
        return <Sun size={14} />;
      case "Regen":
        return <CloudRain size={14} />;
      case "Frost":
      case "Schnee":
        return <Snowflake size={14} />;
      default:
        return <Cloud size={14} />;
    }
  };

  return (
    <div className="stack">
      <div className="toolbar craft-toolbar">
        <div className="craft-toolbar-row">
          <label className="search">
            <Search size={18} />
            <input
              type="search"
              placeholder="Eintrag suchen..."
              aria-label="Eintrag suchen..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <select
            value={selectedProjectId}
            onChange={(e) => setSelectedProjectId(e.target.value)}
            aria-label="Bauvorhaben:"
            title="Bauvorhaben:"
          >
            <option value="alle">Alle Baustellen ({projects.length})</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.projectNumber} · {p.title}
              </option>
            ))}
          </select>
          <button onClick={() => setIsModalOpen(true)} className="button primary">
            <Plus size={18} /> Bautagebuch-Eintrag
          </button>
        </div>
      </div>

      {filteredDiary.length === 0 ? (
        <section className="card craft-empty">
          <BookOpen size={40} aria-hidden />
          <strong>Noch keine Bautagebuch-Einträge vorhanden</strong>
          <p className="muted small">
            Dokumentiere Witterung, anwesende Gewerke und den täglichen Baufortschritt vor Ort.
          </p>
        </section>
      ) : (
        <div className="stack">
          {filteredDiary.map((entry) => {
            const proj = projects.find((p) => p.id === entry.projectId);

            return (
              <article key={entry.id} className="card stack-sm craft-diary">
                <div className="craft-diary-head">
                  <span className="list-main">
                    <strong>
                      <Calendar size={15} aria-hidden />{" "}
                      {new Date(entry.date).toLocaleDateString("de-DE", {
                        weekday: "short",
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                      })}
                    </strong>
                    <small className="muted">
                      <span className="craft-number">{proj?.projectNumber}</span> {proj ? `(${proj.title})` : ""} · {entry.author}
                    </small>
                  </span>
                  <div className="row wrap gap">
                    <span className="pill craft-pill-icon">
                      {getWeatherIcon(entry.weather)}
                      {entry.weather}
                    </span>
                    {entry.temperatureCelsius !== undefined && (
                      <span className="pill craft-pill-icon">
                        <Thermometer size={14} />
                        {entry.temperatureCelsius} °C
                      </span>
                    )}
                  </div>
                </div>

                {entry.tradesPresent && entry.tradesPresent.length > 0 && (
                  <div className="row wrap gap craft-trades">
                    <small className="muted craft-pill-icon">
                      <Users size={13} /> Gewerke vor Ort:
                    </small>
                    {entry.tradesPresent.map((trade) => (
                      <span key={trade} className="pill">
                        {trade}
                      </span>
                    ))}
                  </div>
                )}

                <p className="craft-pre">{entry.activitiesSummary}</p>

                {entry.issuesOrDelays && (
                  <div className="craft-issue" role="note">
                    <AlertTriangle size={17} aria-hidden />
                    <div>
                      <strong>Behinderungsanzeige / Mangel:</strong>
                      <p>{entry.issuesOrDelays}</p>
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}

      {isModalOpen && (
        <Dialog title="Bautagebuch-Eintrag verfassen" onClose={() => setIsModalOpen(false)} wide>
          <form onSubmit={handleSaveEntry} className="stack">
            <div className="grid form-grid">
              <Field label="Bauvorhaben / Baustelle" required wide>
                <select
                  required
                  value={newProjectId}
                  onChange={(e) => setNewProjectId(e.target.value)}
                >
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.projectNumber} · {p.title}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Datum" required>
                <input
                  type="date"
                  required
                  value={newDate}
                  onChange={(e) => setNewDate(e.target.value)}
                />
              </Field>

              <Field label="Erfasser / Bauleiter" required>
                <input
                  type="text"
                  required
                  value={newAuthor}
                  onChange={(e) => setNewAuthor(e.target.value)}
                />
              </Field>

              <Field label="Witterung">
                <select
                  value={newWeather}
                  onChange={(e) => setNewWeather(e.target.value as any)}
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
                />
              </Field>

              <div className="field wide">
                <span className="field-label">Anwesende Gewerke auf der Baustelle:</span>
                <div className="chips wrap">
                  {availableTrades.map((trade) => {
                    const isSelected = newTrades.includes(trade);
                    return (
                      <button
                        type="button"
                        key={trade}
                        aria-pressed={isSelected}
                        onClick={() => toggleTrade(trade)}
                        className={isSelected ? "chip active" : "chip"}
                      >
                        {trade}
                      </button>
                    );
                  })}
                </div>
              </div>

              <Field label="Tätigkeitsbericht & Baufortschritt" required wide>
                <textarea
                  rows={3}
                  required
                  placeholder="Ausgeführte Arbeiten aller Monteure, erreichte Bauabschnitte..."
                  value={newActivities}
                  onChange={(e) => setNewActivities(e.target.value)}
                />
              </Field>

              <Field label="Behinderungen, Mängel oder Lieferverzug (optional)" wide>
                <input
                  type="text"
                  placeholder="z.B. Vorleistung Trockenbauer unvollständig, kein Baustrom vorhanden"
                  value={newIssues}
                  onChange={(e) => setNewIssues(e.target.value)}
                />
              </Field>
            </div>

            <div className="row gap craft-dialog-actions">
              <button type="button" onClick={() => setIsModalOpen(false)} className="button">
                Abbrechen
              </button>
              <button type="submit" disabled={isBusy} className="button primary">
                Eintrag speichern
              </button>
            </div>
          </form>
        </Dialog>
      )}
    </div>
  );
}
