"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * A box to sign in with a finger, stylus or mouse. Calls `onChange` with a PNG data URL while there
 * is a signature, and with null when it is empty or cleared.
 */
export function SignaturePad({
  onChange,
  label = "Sign here",
  className,
}: {
  onChange: (dataUrl: string | null) => void;
  label?: string;
  className?: string;
}) {
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const [signed, setSigned] = useState(false);

  // Sizes the drawing surface to its box and the screen's pixel density, so lines stay crisp.
  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const ratio = Math.max(1, window.devicePixelRatio || 1);
    const rect = c.getBoundingClientRect();
    c.width = Math.round(rect.width * ratio);
    c.height = Math.round(rect.height * ratio);
    const ctx = c.getContext("2d");
    if (ctx) {
      ctx.scale(ratio, ratio);
      ctx.lineWidth = 2.2;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = "#0f172a";
    }
  }, []);

  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const start = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const ctx = canvas.current?.getContext("2d");
    if (!ctx) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    const p = point(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x + 0.01, p.y + 0.01);
    ctx.stroke();
  };

  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const ctx = canvas.current?.getContext("2d");
    if (!ctx) return;
    const p = point(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  };

  const end = useCallback(() => {
    if (!drawing.current) return;
    drawing.current = false;
    setSigned(true);
    onChange(canvas.current?.toDataURL("image/png") ?? null);
  }, [onChange]);

  function clear() {
    const c = canvas.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.restore();
    setSigned(false);
    onChange(null);
  }

  return (
    <div className={cn("space-y-2", className)}>
      <canvas
        ref={canvas}
        role="img"
        aria-label={`${label}. Draw your signature with your finger or mouse.`}
        className="h-40 w-full touch-none rounded-xl border border-slate-300 bg-white"
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
      />
      <div className="flex items-center justify-between text-xs text-slate-600">
        <span>{signed ? "Signed" : label}</span>
        <button type="button" onClick={clear} disabled={!signed} className="min-h-8 rounded-lg px-2 font-medium text-blue-800 underline disabled:opacity-40">
          Clear
        </button>
      </div>
    </div>
  );
}
