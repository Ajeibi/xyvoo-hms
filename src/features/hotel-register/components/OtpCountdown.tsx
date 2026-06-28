"use client";

import { useEffect, useState } from "react";

export default function OtpCountdown({ expiresAt, onExpired }: { expiresAt: number; onExpired?: () => void }) {
  const [secs, setSecs] = useState(() => Math.max(0, Math.floor((expiresAt - Date.now()) / 1000)));

  useEffect(() => {
    const iv = setInterval(() => {
      const s = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
      setSecs(s);
      if (s === 0) {
        clearInterval(iv);
        onExpired?.();
      }
    }, 1000);
    return () => clearInterval(iv);
  }, [expiresAt, onExpired]);

  const m = String(Math.floor(secs / 60)).padStart(2, "0");
  const s = String(secs % 60).padStart(2, "0");

  return <span className={`font-mono font-bold ${secs < 60 ? "text-red-500" : "text-slate-600"}`}>{m}:{s}</span>;
}
