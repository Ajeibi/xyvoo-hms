"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, ExternalLink, Monitor, Smartphone, Tablet, type LucideIcon } from "lucide-react";
import { XYVOO_AUTH_ROUTES } from "@/constants/auth-links";
import { cn } from "@/lib/utils";
import type { WebsiteTemplate } from "@/types";

type Device = "desktop" | "tablet" | "mobile";

/** Width presets per device, in CSS pixels. `null` means "fit the space available". */
const DEVICES: { id: Device; label: string; icon: LucideIcon; widths: (number | null)[]; defaultWidth: number | null }[] = [
  { id: "desktop", label: "Desktop", icon: Monitor, widths: [null, 1280, 1440, 1920], defaultWidth: null },
  { id: "tablet", label: "Tablet", icon: Tablet, widths: [768, 834, 1024], defaultWidth: 834 },
  { id: "mobile", label: "Phone", icon: Smartphone, widths: [360, 390, 430], defaultWidth: 390 },
];

/**
 * Framed, fully interactive preview of a website template with a device-size
 * switcher and page picker. The template is same-origin static HTML, so the
 * picker can follow the visitor as they click around inside the frame.
 */
export function TemplatePreviewer({ template }: { template: WebsiteTemplate }) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [device, setDevice] = useState<Device>("desktop");
  const [width, setWidth] = useState<number | null>(null);
  const [stage, setStage] = useState({ width: 0, height: 0 });
  const [file, setFile] = useState(template.pages[0].file);
  const [src, setSrc] = useState(`${template.previewPath}/${template.pages[0].file}`);

  const currentLabel = template.pages.find((p) => p.file === file)?.label ?? "Page";
  const deviceWidths = DEVICES.find((d) => d.id === device)?.widths ?? [null];

  /** Track the space the frame can occupy, so wider widths are zoomed out rather than overflowing. */
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      setStage({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const frameWidth = width ?? stage.width;
  const scale = stage.width && frameWidth > stage.width ? stage.width / frameWidth : 1;

  function selectDevice(next: Device) {
    setDevice(next);
    setWidth(DEVICES.find((d) => d.id === next)?.defaultWidth ?? null);
  }

  function openPage(nextFile: string) {
    setFile(nextFile);
    setSrc(`${template.previewPath}/${nextFile}`);
  }

  /** Keep the picker in step when the visitor follows links inside the template. */
  function syncFromFrame() {
    try {
      const path = frameRef.current?.contentWindow?.location.pathname ?? "";
      const visited = path.split("/").pop() || "index.html";
      setFile(visited);
    } catch {
      /* cross-origin: leave the picker as it is */
    }
  }

  const pickerHasFile = template.pages.some((p) => p.file === file);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/templates"
            className="inline-flex min-h-11 items-center gap-2 rounded-xl px-2 text-sm font-semibold text-xyvoo-navy/70 transition-colors hover:text-xyvoo-navy"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            All templates
          </Link>
          <label className="flex items-center gap-2 text-sm font-semibold text-xyvoo-navy">
            <span>Page</span>
            <select
              value={pickerHasFile ? file : ""}
              onChange={(e) => openPage(e.target.value)}
              className="min-h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm font-medium text-xyvoo-navy focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--xyvoo-teal-product-hover)]"
            >
              {!pickerHasFile && <option value="">Other page</option>}
              {template.pages.map((p) => (
                <option key={p.file} value={p.file}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <a
            href={`${template.previewPath}/${file}`}
            target="_blank"
            rel="noopener"
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-300 px-4 text-sm font-semibold text-xyvoo-navy transition-colors hover:border-slate-400"
          >
            Open full screen
            <ExternalLink className="h-4 w-4" aria-hidden />
            <span className="sr-only">(opens in a new tab)</span>
          </a>
          <Link
            href={template.kind === "hotel" ? XYVOO_AUTH_ROUTES.hms.register : XYVOO_AUTH_ROUTES.storefront.register}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl px-4 text-sm font-bold text-xyvoo-navy transition-opacity hover:opacity-90"
            style={{ background: "var(--xyvoo-teal-product)" }}
          >
            Start with this template
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>
      </div>

      <div className="rounded-2xl bg-slate-200/70 p-2 sm:p-4">
        <div className="mb-2 hidden flex-wrap items-center justify-center gap-2 sm:mb-4 md:flex">
          <div className="flex items-center gap-1 rounded-xl bg-white/70 p-1" role="group" aria-label="Preview size">
            {DEVICES.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                aria-pressed={device === id}
                onClick={() => selectDevice(id)}
                className={cn(
                  "inline-flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-semibold transition-colors",
                  device === id ? "bg-white text-xyvoo-navy shadow-sm" : "text-xyvoo-navy/60 hover:text-xyvoo-navy"
                )}
              >
                <Icon className="h-4 w-4" aria-hidden />
                {label}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2 text-sm font-semibold text-xyvoo-navy">
            <span className="sr-only">Preview width</span>
            <select
              value={width ?? "fit"}
              onChange={(e) => setWidth(e.target.value === "fit" ? null : Number(e.target.value))}
              className="min-h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm font-medium text-xyvoo-navy focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--xyvoo-teal-product-hover)]"
            >
              {deviceWidths.map((w) => (
                <option key={w ?? "fit"} value={w ?? "fit"}>
                  {w === null ? "Fit to screen" : `${w}px`}
                </option>
              ))}
            </select>
          </label>
          {scale < 1 && (
            <span className="text-xs font-semibold text-xyvoo-navy/60" aria-live="polite">
              Zoomed to {Math.round(scale * 100)}%
            </span>
          )}
        </div>
        <div ref={stageRef} className="flex h-[calc(100dvh-15rem)] min-h-[560px] justify-center">
          {stage.width > 0 && (
            <div
              className={cn(
                "relative overflow-hidden bg-white shadow-xl transition-[width] duration-300 motion-reduce:transition-none",
                device === "desktop" ? "rounded-lg" : "rounded-[1.75rem] ring-8 ring-xyvoo-navy"
              )}
              style={{ width: frameWidth * scale, height: stage.height }}
            >
              <iframe
                ref={frameRef}
                key={src}
                src={src}
                onLoad={syncFromFrame}
                title={`${template.name} template preview: ${currentLabel}`}
                className="absolute left-0 top-0 origin-top-left border-0"
                style={{ width: frameWidth, height: stage.height / scale, transform: `scale(${scale})` }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
