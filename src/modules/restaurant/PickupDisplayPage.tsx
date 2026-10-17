import { useEffect, useState } from "react";
import { Utensils, Clock, CheckCircle2, Maximize, Minimize } from "lucide-react";

/** Was die Anzeige vom Server bekommt: nur Nummer und Vorname. */
interface Called { id: string; number: string; name: string }
import "./restaurant.css";
import { useRestaurantI18n } from "./i18n";
import { useVisiblePolling } from "./polling";

interface PickupDisplayProps {
  tenantId: string;
}

export default function PickupDisplayPage({ tenantId }: PickupDisplayProps) {
  const { t, time } = useRestaurantI18n();
  const [queue, setQueue] = useState<{ preparing: Called[]; ready: Called[] }>({
    preparing: [],
    ready: [],
  });
  const [companyName, setCompanyName] = useState("");
  const [now, setNow] = useState(() => new Date());
  const [isFullscreen, setIsFullscreen] = useState(false);

  const fetchQueue = async () => {
    try {
      const res = await fetch(`/api/restaurant/public/${tenantId}/pickup-queue`);
      if (res.ok) {
        const data = (await res.json()) as any;
        setQueue(data.queue || { preparing: [], ready: [] });
        if (data.company?.name) setCompanyName(data.company.name);
      }
    } catch {
      // Ignore background fetch errors
    }
  };

  useEffect(() => {
    fetchQueue();
    const clock = setInterval(() => {
      setNow(new Date());
    }, 1000);

    return () => {
      clearInterval(clock);
    };
  }, [tenantId]);

  // Alle 4 Sekunden neu abfragen, nur solange die Anzeige sichtbar ist
  useVisiblePolling(fetchQueue, 4000);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  return (
    <div className="restaurant-display">
      <header className="restaurant-display-top">
        <div className="restaurant-display-brand">
          <span className="restaurant-display-logo"><Utensils size={24} /></span>
          <div>
            <h1 className="display">{companyName || t("app.defaultName")}</h1>
            <p className="muted">{t("display.subtitle")}</p>
          </div>
        </div>

        <div className="row gap">
          <span className="restaurant-display-clock">{time(now)}</span>
          <button onClick={toggleFullscreen} className="icon-button" title={t("display.fullscreen")} aria-label={t("display.fullscreen")}>
            {isFullscreen ? <Minimize size={22} /> : <Maximize size={22} />}
          </button>
        </div>
      </header>

      <main className="restaurant-display-cols">
        <section className="card restaurant-display-col preparing">
          <div className="restaurant-display-head">
            <h2>
              <Clock size={30} aria-hidden />
              {t("display.preparing")}
            </h2>
            <span className="muted">{t("display.orders", { n: queue.preparing.length })}</span>
          </div>

          <div className="restaurant-display-grid">
            {queue.preparing.length === 0 ? (
              <p className="muted restaurant-display-empty">{t("display.noneInProgress")}</p>
            ) : (
              queue.preparing.map((order) => (
                <div key={order.id} className="restaurant-display-number">
                  <strong>#{order.number}</strong>
                  {order.name && <small>{order.name}</small>}
                </div>
              ))
            )}
          </div>
        </section>

        <section className="card restaurant-display-col ready">
          <div className="restaurant-display-head">
            <h2>
              <CheckCircle2 size={30} aria-hidden />
              {t("display.ready")}
            </h2>
            <span className="restaurant-display-call">{t("display.callout")}</span>
          </div>

          <div className="restaurant-display-grid">
            {queue.ready.length === 0 ? (
              <p className="muted restaurant-display-empty">{t("display.noneReady")}</p>
            ) : (
              queue.ready.map((order) => (
                <div key={order.id} className="restaurant-display-number">
                  <strong>#{order.number}</strong>
                  {order.name && <small>{order.name}</small>}
                </div>
              ))
            )}
          </div>
        </section>
      </main>

      <footer className="muted restaurant-display-foot">
        {t("display.footer")}
      </footer>
    </div>
  );
}
