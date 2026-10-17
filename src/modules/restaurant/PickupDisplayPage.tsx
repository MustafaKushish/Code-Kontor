import { useEffect, useState } from "react";
import { Utensils, Clock, CheckCircle2, Maximize, Minimize } from "lucide-react";
import type { RestaurantOrder } from "../../../shared/restaurant";
import "./restaurant.css";

interface PickupDisplayProps {
  tenantId: string;
}

export default function PickupDisplayPage({ tenantId }: PickupDisplayProps) {
  const [queue, setQueue] = useState<{ preparing: RestaurantOrder[]; ready: RestaurantOrder[] }>({
    preparing: [],
    ready: [],
  });
  const [companyName, setCompanyName] = useState("Restaurant & Café");
  const [currentTime, setCurrentTime] = useState(new Date().toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }));
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
    const interval = setInterval(fetchQueue, 4000);
    const clock = setInterval(() => {
      setCurrentTime(new Date().toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }));
    }, 1000);

    return () => {
      clearInterval(interval);
      clearInterval(clock);
    };
  }, [tenantId]);

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
            <h1 className="display">{companyName}</h1>
            <p className="muted">Bestell- und Abholaufruf</p>
          </div>
        </div>

        <div className="row gap">
          <span className="restaurant-display-clock">{currentTime}</span>
          <button onClick={toggleFullscreen} className="icon-button" title="Vollbild" aria-label="Vollbild">
            {isFullscreen ? <Minimize size={22} /> : <Maximize size={22} />}
          </button>
        </div>
      </header>

      <main className="restaurant-display-cols">
        <section className="card restaurant-display-col preparing">
          <div className="restaurant-display-head">
            <h2>
              <Clock size={30} aria-hidden />
              In Zubereitung
            </h2>
            <span className="muted">{queue.preparing.length} Bestellungen</span>
          </div>

          <div className="restaurant-display-grid">
            {queue.preparing.length === 0 ? (
              <p className="muted restaurant-display-empty">Aktuell keine Bestellungen in Arbeit</p>
            ) : (
              queue.preparing.map((order) => (
                <div key={order.id} className="restaurant-display-number">
                  <strong>#{order.pickupNumber || order.orderNumber.replace("BON-", "")}</strong>
                  {order.customerName && <small>{order.customerName}</small>}
                </div>
              ))
            )}
          </div>
        </section>

        <section className="card restaurant-display-col ready">
          <div className="restaurant-display-head">
            <h2>
              <CheckCircle2 size={30} aria-hidden />
              Bereit zur Abholung
            </h2>
            <span className="restaurant-display-call">Bitte am Schalter melden!</span>
          </div>

          <div className="restaurant-display-grid">
            {queue.ready.length === 0 ? (
              <p className="muted restaurant-display-empty">Noch keine fertigen Bestellungen</p>
            ) : (
              queue.ready.map((order) => (
                <div key={order.id} className="restaurant-display-number">
                  <strong>#{order.pickupNumber || order.orderNumber.replace("BON-", "")}</strong>
                  {order.customerName && <small>{order.customerName}</small>}
                </div>
              ))
            )}
          </div>
        </section>
      </main>

      <footer className="muted restaurant-display-foot">
        Bestellnummer auf dem Kassenbon oder Abholschein vergleichen · Bei Fragen gerne an unser Schalterteam wenden
      </footer>
    </div>
  );
}
