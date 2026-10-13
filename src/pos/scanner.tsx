import { useEffect, useRef, useState } from "react";
import { usePosI18n } from "./i18n";
import { Dialog } from "./ui";

/**
 * Barcode-Scanner am USB oder per Bluetooth tippen wie eine Tastatur: viele Zeichen sehr schnell, dann Enter.
 * Steht der Cursor in keinem Eingabefeld, fängt die Kasse das hier ab. In der Suche erledigt es das Feld selbst.
 */
export function useScanner(onCode: (code: string) => void, enabled = true) {
  const handler = useRef(onCode);
  handler.current = onCode;
  useEffect(() => {
    if (!enabled) return;
    let buffer = "";
    let last = 0;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest?.("input, textarea, select, [contenteditable=true]")) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const now = performance.now();
      if (now - last > 80) buffer = "";
      last = now;
      if (e.key === "Enter") {
        if (buffer.length >= 3) {
          e.preventDefault();
          handler.current(buffer);
        }
        buffer = "";
      } else if (e.key.length === 1) {
        buffer += e.key;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled]);
}

interface Detector {
  detect(source: HTMLVideoElement): Promise<{ rawValue: string }[]>;
}
type DetectorClass = new (options: { formats: string[] }) => Detector;
const BarcodeDetector = (globalThis as unknown as { BarcodeDetector?: DetectorClass }).BarcodeDetector;

/** Kamera-Scan gibt es nur, wo der Browser Barcodes selbst erkennt (z. B. Chrome auf Android). */
export const cameraScanAvailable = !!BarcodeDetector && typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia;

export function CameraScan({ onCode, onClose }: { onCode: (code: string) => void; onClose: () => void }) {
  const { p } = usePosI18n();
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!BarcodeDetector) return;
    let stream: MediaStream | null = null;
    let timer = 0;
    let stopped = false;
    const detector = new BarcodeDetector({ formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "qr_code"] });
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "environment" } })
      .then(async (s) => {
        stream = s;
        if (stopped || !video.current) return s.getTracks().forEach((t) => t.stop());
        video.current.srcObject = s;
        await video.current.play();
        const tick = async () => {
          if (stopped || !video.current) return;
          const found = await detector.detect(video.current).catch(() => []);
          if (found[0]?.rawValue) return onCode(found[0].rawValue);
          timer = window.setTimeout(tick, 200);
        };
        tick();
      })
      .catch(() => setError(p("scan.cameraError")));
    return () => {
      stopped = true;
      clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return (
    <Dialog title={p("scan.camera")} onClose={onClose}>
      <div className="stack">
        {error ? <p className="error">{error}</p> : <video ref={video} className="pos-camera" muted playsInline />}
        <p className="muted small">{p("scan.cameraHint")}</p>
      </div>
    </Dialog>
  );
}
