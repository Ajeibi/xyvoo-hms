"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Download, Minus, Plus } from "lucide-react";
import type { PDFDocumentProxy } from "pdfjs-dist";

const ZOOM_MIN = 0.5;
const ZOOM_MAX = 3;
const ZOOM_STEP = 0.25;

export function PdfViewer({ fileUrl, title }: { fileUrl: string; title: string }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const pdfRef = useRef<PDFDocumentProxy | null>(null);
  const canvasesRef = useRef<HTMLCanvasElement[]>([]);
  const renderTokenRef = useRef(0);
  const fitModeRef = useRef(true);
  const manualZoomRef = useRef(1);

  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [fitMode, setFitMode] = useState(true);
  const [manualZoom, setManualZoom] = useState(1);
  const [displayZoom, setDisplayZoom] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  fitModeRef.current = fitMode;
  manualZoomRef.current = manualZoom;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const pdfjsLib = await import("pdfjs-dist");
        pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdfjs/pdf.worker.min.mjs";
        const doc = await pdfjsLib.getDocument(fileUrl).promise;
        if (cancelled) return;
        pdfRef.current = doc;
        setNumPages(doc.numPages);
        setCurrentPage(1);
        setLoading(false);
      } catch {
        if (!cancelled) {
          setError("This document couldn't be loaded here. Try downloading it instead.");
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
      pdfRef.current?.destroy();
      pdfRef.current = null;
    };
  }, [fileUrl]);

  const render = useCallback(async () => {
    const doc = pdfRef.current;
    const scrollEl = scrollRef.current;
    const container = containerRef.current;
    if (!doc || !scrollEl || !container) return;

    const token = ++renderTokenRef.current;
    const firstPage = await doc.getPage(1);
    const baseViewport = firstPage.getViewport({ scale: 1 });
    const available = scrollEl.clientWidth - 32;
    const scale = fitModeRef.current ? available / baseViewport.width : manualZoomRef.current;
    if (token !== renderTokenRef.current) return;

    const prevScrollHeight = scrollEl.scrollHeight || 1;
    const prevRatio = scrollEl.scrollTop / prevScrollHeight;

    container.replaceChildren();
    canvasesRef.current = [];

    const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;

    for (let i = 1; i <= doc.numPages; i++) {
      if (token !== renderTokenRef.current) return;
      const page = await doc.getPage(i);
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      canvas.className = "mx-auto mb-4 block rounded-sm shadow-md last:mb-0";
      canvas.width = Math.floor(viewport.width * dpr);
      canvas.height = Math.floor(viewport.height * dpr);
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      canvas.dataset.pageNumber = String(i);
      const ctx = canvas.getContext("2d");
      if (!ctx) continue;
      ctx.scale(dpr, dpr);
      container.appendChild(canvas);
      canvasesRef.current.push(canvas);
      await page.render({ canvasContext: ctx, viewport }).promise;
      if (token !== renderTokenRef.current) return;
    }

    setDisplayZoom(scale);
    scrollEl.scrollTop = prevRatio * scrollEl.scrollHeight;
  }, []);

  useEffect(() => {
    if (!loading && !error) render();
  }, [loading, error, fitMode, manualZoom, render]);

  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const onResize = () => {
      clearTimeout(t);
      t = setTimeout(() => {
        if (fitModeRef.current) render();
      }, 200);
    };
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      clearTimeout(t);
    };
  }, [render]);

  useEffect(() => {
    const scrollEl = scrollRef.current;
    if (!scrollEl) return;
    const onScroll = () => {
      const scrollTop = scrollEl.scrollTop;
      let closest = 1;
      for (const canvas of canvasesRef.current) {
        if (canvas.offsetTop - 40 <= scrollTop) {
          closest = Number(canvas.dataset.pageNumber);
        }
      }
      setCurrentPage(closest);
    };
    scrollEl.addEventListener("scroll", onScroll, { passive: true });
    return () => scrollEl.removeEventListener("scroll", onScroll);
  }, [numPages]);

  const goTo = (page: number) => {
    const canvas = canvasesRef.current[page - 1];
    if (canvas && scrollRef.current) {
      scrollRef.current.scrollTo({ top: canvas.offsetTop - 16, behavior: "smooth" });
    }
  };

  const zoomBy = (delta: number) => {
    setFitMode(false);
    setManualZoom((z) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round((z + delta) * 100) / 100)));
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-white/95 px-4 py-3">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => goTo(currentPage - 1)}
            disabled={currentPage <= 1 || !!error}
            aria-label="Previous page"
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-xyvoo-navy/70 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-30"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="min-w-[92px] text-center text-sm font-medium text-xyvoo-navy/70" aria-live="polite">
            {error ? "—" : `Page ${currentPage} of ${numPages || "…"}`}
          </span>
          <button
            type="button"
            onClick={() => goTo(currentPage + 1)}
            disabled={currentPage >= numPages || !!error}
            aria-label="Next page"
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-xyvoo-navy/70 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-30"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => zoomBy(-ZOOM_STEP)}
            disabled={!!error}
            aria-label="Zoom out"
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-xyvoo-navy/70 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-30"
          >
            <Minus className="h-4 w-4" />
          </button>
          <span className="min-w-[48px] text-center text-sm font-medium text-xyvoo-navy/70">
            {error ? "—" : `${Math.round(displayZoom * 100)}%`}
          </span>
          <button
            type="button"
            onClick={() => zoomBy(ZOOM_STEP)}
            disabled={!!error}
            aria-label="Zoom in"
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-xyvoo-navy/70 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-30"
          >
            <Plus className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setFitMode(true)}
            aria-pressed={fitMode}
            disabled={!!error}
            className={`ml-1 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-30 ${
              fitMode ? "bg-xyvoo-blue/10 text-xyvoo-blue" : "text-xyvoo-navy/70 hover:bg-slate-100"
            }`}
          >
            Fit to width
          </button>
          <a
            href={fileUrl}
            download
            className="ml-1 inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-xyvoo-navy px-3 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-xyvoo-navy/90"
          >
            <Download className="h-3.5 w-3.5" />
            Download
          </a>
        </div>
      </div>

      {error ? (
        <div className="flex flex-col items-center justify-center gap-3 px-6 py-20 text-center">
          <p className="max-w-sm text-p text-xyvoo-navy/60">{error}</p>
          <a
            href={fileUrl}
            download
            className="inline-flex items-center gap-2 rounded-full bg-xyvoo-navy px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-xyvoo-navy/90"
          >
            <Download className="h-4 w-4" />
            Download {title}
          </a>
        </div>
      ) : (
        <div
          ref={scrollRef}
          className="thin-scrollbar max-h-[75vh] overflow-y-auto overflow-x-hidden bg-slate-100 px-4 py-8 sm:px-8"
        >
          {loading && (
            <div className="flex h-64 items-center justify-center">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-xyvoo-blue/30 border-t-xyvoo-blue" />
            </div>
          )}
          <div ref={containerRef} />
        </div>
      )}
    </div>
  );
}
