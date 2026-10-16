import { useEffect, useState } from "react";
import { Utensils, Clock, CheckCircle2, Maximize, Minimize } from "lucide-react";
import type { RestaurantOrder } from "../../../shared/restaurant";

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
    <div className="min-h-screen bg-slate-950 text-white flex flex-col font-sans select-none overflow-hidden">
      {/* Top Header */}
      <header className="px-8 py-5 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500 text-slate-950 flex items-center justify-center font-bold">
            <Utensils className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white">{companyName}</h1>
            <p className="text-xs text-slate-400">Bestell- und Abholaufruf</p>
          </div>
        </div>

        <div className="flex items-center gap-6">
          <span className="font-mono text-2xl font-bold text-amber-400 tracking-wider">{currentTime}</span>
          <button
            onClick={toggleFullscreen}
            className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
            title="Vollbild"
          >
            {isFullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
          </button>
        </div>
      </header>

      {/* 2-Spalten Hauptanzeige */}
      <main className="flex-1 grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-slate-800 p-6 md:p-8 gap-8">
        {/* Linke Spalte: IN ZUBEREITUNG */}
        <div className="flex flex-col space-y-6">
          <div className="flex items-center justify-between pb-4 border-b border-slate-800">
            <div className="flex items-center gap-2.5">
              <Clock className="w-6 h-6 text-amber-400" />
              <h2 className="text-2xl font-black uppercase tracking-wider text-amber-400">In Zubereitung</h2>
            </div>
            <span className="font-mono text-slate-500 font-bold">{queue.preparing.length} Bestellungen</span>
          </div>

          <div className="flex-1 grid grid-cols-2 sm:grid-cols-3 gap-4 content-start">
            {queue.preparing.length === 0 ? (
              <div className="col-span-full py-16 text-center text-slate-600 text-base">
                Aktuell keine Bestellungen in Arbeit
              </div>
            ) : (
              queue.preparing.map((order) => (
                <div
                  key={order.id}
                  className="bg-slate-900/90 border border-amber-500/20 rounded-2xl p-6 text-center shadow-lg transition-transform"
                >
                  <span className="font-mono font-black text-4xl sm:text-5xl text-amber-300 block">
                    #{order.pickupNumber || order.orderNumber.replace("BON-", "")}
                  </span>
                  {order.customerName && (
                    <span className="text-xs text-slate-400 truncate block mt-2 font-medium">
                      {order.customerName}
                    </span>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Rechte Spalte: BEREIT ZUR ABHOLUNG */}
        <div className="flex flex-col space-y-6 pl-0 md:pl-8">
          <div className="flex items-center justify-between pb-4 border-b border-slate-800">
            <div className="flex items-center gap-2.5">
              <CheckCircle2 className="w-6 h-6 text-emerald-400" />
              <h2 className="text-2xl font-black uppercase tracking-wider text-emerald-400">Bereit zur Abholung</h2>
            </div>
            <span className="font-mono text-emerald-500 font-bold animate-pulse">Bitte am Schalter melden!</span>
          </div>

          <div className="flex-1 grid grid-cols-2 sm:grid-cols-3 gap-4 content-start">
            {queue.ready.length === 0 ? (
              <div className="col-span-full py-16 text-center text-slate-600 text-base">
                Noch keine fertigen Bestellungen
              </div>
            ) : (
              queue.ready.map((order) => (
                <div
                  key={order.id}
                  className="bg-emerald-950/40 border-2 border-emerald-500/60 rounded-2xl p-6 text-center shadow-xl ring-2 ring-emerald-500/20 animate-pulse"
                >
                  <span className="font-mono font-black text-4xl sm:text-5xl text-emerald-300 block">
                    #{order.pickupNumber || order.orderNumber.replace("BON-", "")}
                  </span>
                  {order.customerName && (
                    <span className="text-xs text-emerald-200 truncate block mt-2 font-semibold">
                      {order.customerName}
                    </span>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </main>

      {/* Fußzeile mit Hinweisen */}
      <footer className="px-8 py-3 bg-slate-900/60 border-t border-slate-800/80 text-center text-xs text-slate-500">
        Bestellnummer auf dem Kassenbon oder Abholschein vergleichen · Bei Fragen gerne an unser Schalterteam wenden
      </footer>
    </div>
  );
}
