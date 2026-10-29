"use client";

import { useEffect, useSyncExternalStore } from "react";

/**
 * A slip-sized page for receipt and kitchen printers (80mm by default; 58mm
 * with ?width=58). With ?auto=1 it opens the print dialog on load. The
 * buttons never print.
 */
export function FbPrintFrame({
  auto,
  widthMm,
  children,
}: {
  auto: boolean;
  widthMm: 58 | 80;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!auto) return;
    // Let fonts and the logo settle before the dialog opens.
    const id = window.setTimeout(() => window.print(), 300);
    return () => window.clearTimeout(id);
  }, [auto]);

  return (
    <div className="min-h-screen bg-slate-100 py-6 print:bg-white print:py-0">
      <style>{`
        @page { size: ${widthMm}mm auto; margin: 3mm; }
        @media print { html, body { background: #fff !important; } }
      `}</style>
      <div className="mx-auto mb-4 flex justify-center gap-2 print:hidden">
        <button
          type="button"
          onClick={() => window.print()}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          Print
        </button>
        <button
          type="button"
          onClick={() => window.close()}
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          Close
        </button>
      </div>
      <div
        className="mx-auto bg-white p-3 font-mono text-[12px] leading-snug text-black shadow print:p-0 print:shadow-none"
        style={{ width: `${widthMm}mm` }}
      >
        {children}
      </div>
    </div>
  );
}

/** Date and time in the device's own time zone (the till's clock), worked out in the browser. */
export function PrintTime({ iso }: { iso: string }) {
  const text = useSyncExternalStore(
    noSubscribe,
    () =>
      new Date(iso).toLocaleString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }),
    () => "",
  );
  return <span>{text}</span>;
}

const noSubscribe = () => () => {};
