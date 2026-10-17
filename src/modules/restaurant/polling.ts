import { useEffect, useRef } from "react";

/**
 * Ruft `poll` alle `ms` Millisekunden auf, aber nur solange die Seite sichtbar ist.
 * Wird der Tab wieder sichtbar, sofort einmal abfragen und den Takt neu starten.
 */
export function useVisiblePolling(poll: () => void, ms: number) {
  const latest = useRef(poll);
  latest.current = poll;

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined;
    const start = () => {
      if (timer === undefined) timer = setInterval(() => latest.current(), ms);
    };
    const stop = () => {
      if (timer !== undefined) clearInterval(timer);
      timer = undefined;
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        stop();
      } else {
        latest.current();
        start();
      }
    };
    if (document.visibilityState !== "hidden") start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [ms]);
}
