import { useRef, useEffect, useState } from "react";
import { Eraser, Check, PenTool } from "lucide-react";
import { Dialog } from "../../pos/ui";
import { useCraftI18n } from "./i18n";

interface SignaturePadProps {
  onSave: (dataUrl: string) => void;
  onCancel: () => void;
  customerName?: string;
}

export function SignaturePad({ onSave, onCancel, customerName }: SignaturePadProps) {
  const { t } = useCraftI18n();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Handle high DPI displays
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * 2;
    canvas.height = rect.height * 2;
    ctx.scale(2, 2);

    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#0f172a"; // slate-900
    ctx.lineWidth = 2.5;
  }, []);

  const getCoordinates = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();

    if ("touches" in e) {
      const touch = e.touches[0];
      return {
        x: touch.clientX - rect.left,
        y: touch.clientY - rect.top,
      };
    } else {
      return {
        x: (e as React.MouseEvent).clientX - rect.left,
        y: (e as React.MouseEvent).clientY - rect.top,
      };
    }
  };

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { x, y } = getCoordinates(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    setIsDrawing(true);
    setHasDrawn(true);
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing) return;
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { x, y } = getCoordinates(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasDrawn(false);
  };

  const handleConfirm = () => {
    const canvas = canvasRef.current;
    if (!canvas || !hasDrawn) return;
    const dataUrl = canvas.toDataURL("image/png");
    onSave(dataUrl);
  };

  return (
    <Dialog title={t("signature.title")} onClose={onCancel}>
      <div className="stack craft-sign">
        {customerName && (
          <p className="craft-pill-icon">
            <PenTool size={16} aria-hidden /> <strong>{t("signature.client", { name: customerName })}</strong>
          </p>
        )}

        <p className="muted small">
          {t("signature.instructions")}
        </p>

        <div className="craft-sign-pad">
          <canvas
            ref={canvasRef}
            onMouseDown={startDrawing}
            onMouseMove={draw}
            onMouseUp={stopDrawing}
            onMouseLeave={stopDrawing}
            onTouchStart={startDrawing}
            onTouchMove={draw}
            onTouchEnd={stopDrawing}
          />

          {!hasDrawn && (
            <span className="craft-sign-hint">{t("signature.hint")}</span>
          )}

          <span className="craft-sign-line" aria-hidden />
        </div>

        <div className="craft-sign-actions">
          <button
            type="button"
            onClick={clearCanvas}
            disabled={!hasDrawn}
            className="button"
          >
            <Eraser size={18} /> {t("signature.clear")}
          </button>
          <button type="button" onClick={onCancel} className="button push-end">
            {t("common.cancel")}
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!hasDrawn}
            className="button primary"
          >
            <Check size={18} /> {t("signature.save")}
          </button>
        </div>
      </div>
    </Dialog>
  );
}
