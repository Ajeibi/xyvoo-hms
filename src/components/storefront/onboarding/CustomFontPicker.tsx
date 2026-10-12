"use client";

import { useEffect, useRef, useState } from "react";
import { Upload } from "lucide-react";
import { googleFontCssUrl, UPLOADED_FONT_FAMILY, type CustomFont } from "@/lib/store/site/fonts";
import { inputClass } from "./fields";

/** Makes a font available on this page so the merchant can see it before saving. */
function useFontPreview(font: CustomFont | null) {
  useEffect(() => {
    if (!font) return;
    if (font.source === "google") {
      const href = googleFontCssUrl(font.family, font.hasBold);
      if (document.querySelector(`link[data-font-preview="${CSS.escape(href)}"]`)) return;
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = href;
      link.dataset.fontPreview = href;
      document.head.appendChild(link);
      return;
    }
    const face = new FontFace(UPLOADED_FONT_FAMILY, `url("${encodeURI(font.url)}") format("${font.format}")`);
    face.load().then((loaded) => document.fonts.add(loaded)).catch(() => undefined);
    return () => {
      document.fonts.delete(face);
    };
  }, [font]);
}

/**
 * The merchant's own font: a Google Font by name, or a font file they upload.
 * Shows a sample in the chosen font so they can check it before saving.
 */
export default function CustomFontPicker({
  slug,
  value,
  onChange,
}: {
  slug: string;
  value: CustomFont | null;
  onChange: (font: CustomFont | null) => void;
}) {
  const [source, setSource] = useState<CustomFont["source"]>(value?.source ?? "google");
  const [name, setName] = useState(value?.source === "google" ? value.family : "");
  const [status, setStatus] = useState<{ tone: "info" | "error"; text: string }>({ tone: "info", text: "" });
  const [busy, setBusy] = useState(false);
  const [licensed, setLicensed] = useState(value?.source === "upload");
  const fileInput = useRef<HTMLInputElement>(null);
  useFontPreview(value);

  const useForBody = value?.useForBody ?? false;
  const shown = value && value.source === source ? value : null;

  const findGoogleFont = async () => {
    if (!name.trim()) return setStatus({ tone: "error", text: "Type the name of a Google Font, for example Poppins." });
    setBusy(true);
    setStatus({ tone: "info", text: "Looking for that font…" });
    try {
      const res = await fetch(`/api/store/fonts/google?slug=${encodeURIComponent(slug)}&family=${encodeURIComponent(name)}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        onChange(null);
        return setStatus({ tone: "error", text: typeof data.error === "string" ? data.error : "We couldn't check that font. Please try again." });
      }
      setName(data.family);
      onChange({ source: "google", family: data.family, hasBold: Boolean(data.hasBold), useForBody });
      setStatus({ tone: "info", text: `Found ${data.family}.` });
    } catch {
      setStatus({ tone: "error", text: "We couldn't connect. Check your internet connection and try again." });
    } finally {
      setBusy(false);
    }
  };

  const uploadFont = async (file: File) => {
    if (file.size > 2 * 1024 * 1024) return setStatus({ tone: "error", text: "Font files must be 2MB or less." });
    setBusy(true);
    setStatus({ tone: "info", text: "Uploading your font…" });
    try {
      const form = new FormData();
      form.append("slug", slug);
      form.append("file", file);
      const res = await fetch("/api/store/fonts/upload", { method: "POST", body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.url) return setStatus({ tone: "error", text: typeof data.error === "string" ? data.error : "We couldn't upload that font. Please try again." });
      onChange({ source: "upload", label: data.label, url: data.url, format: data.format, useForBody });
      setStatus({ tone: "info", text: `Uploaded ${data.label}.` });
    } catch {
      setStatus({ tone: "error", text: "We couldn't connect. Check your internet connection and try again." });
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  const sampleFamily = shown ? (shown.source === "google" ? `"${shown.family}"` : `"${UPLOADED_FONT_FAMILY}"`) : undefined;

  return (
    <div className="space-y-4 rounded-xl border border-slate-200 bg-slate-50/60 p-4">
      <fieldset>
        <legend className="mb-2 text-sm font-medium text-slate-800">Where is your font from?</legend>
        <div className="flex flex-wrap gap-2">
          {(
            [
              ["google", "Google Fonts"],
              ["upload", "I have a font file"],
            ] as const
          ).map(([key, label]) => (
            <label
              key={key}
              className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-full border bg-white px-4 text-sm ${source === key ? "border-xyvoo-teal-product-hover font-medium text-slate-900" : "border-slate-300 text-slate-700"}`}
            >
              <input
                type="radio"
                name="font-source"
                checked={source === key}
                onChange={() => {
                  setSource(key);
                  setStatus({ tone: "info", text: "" });
                }}
                className="accent-xyvoo-teal-product-hover"
              />
              {label}
            </label>
          ))}
        </div>
      </fieldset>

      {source === "google" ? (
        <div>
          <label htmlFor="custom-font-name" className="mb-1 block text-sm text-slate-700">
            Font name, as it appears on{" "}
            <a href="https://fonts.google.com" target="_blank" rel="noopener noreferrer" className="text-blue-800 underline">
              fonts.google.com<span className="sr-only"> (opens in a new tab)</span>
            </a>
          </label>
          <div className="flex gap-2">
            <input
              id="custom-font-name"
              className={inputClass}
              value={name}
              placeholder="e.g. Poppins"
              autoComplete="off"
              spellCheck={false}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void findGoogleFont();
                }
              }}
              aria-describedby="custom-font-status"
            />
            <button
              type="button"
              onClick={() => void findGoogleFont()}
              disabled={busy}
              className="shrink-0 rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-60"
            >
              Use this font
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <label className="flex items-start gap-3 text-sm text-slate-700">
            <input type="checkbox" className="mt-1 h-4 w-4" checked={licensed} onChange={(e) => setLicensed(e.target.checked)} />
            <span>I own this font or have a licence to use it on a website.</span>
          </label>
          <input
            ref={fileInput}
            id="custom-font-file"
            type="file"
            accept=".woff2,.woff,.ttf,.otf,font/woff2,font/woff,font/ttf,font/otf"
            className="sr-only"
            disabled={!licensed || busy}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void uploadFont(file);
            }}
          />
          <label
            htmlFor="custom-font-file"
            aria-disabled={!licensed || busy}
            className={`inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 ${licensed && !busy ? "cursor-pointer hover:bg-slate-50" : "cursor-not-allowed opacity-60"}`}
          >
            <Upload className="h-4 w-4" aria-hidden />
            {value?.source === "upload" ? "Upload a different file" : "Upload font file"}
          </label>
          <p className="text-xs text-slate-500">.woff2, .woff, .ttf or .otf, up to 2MB. Your designer can usually send you a .woff2 file.</p>
        </div>
      )}

      <p id="custom-font-status" role="status" className={`text-sm ${status.tone === "error" ? "text-red-700" : "text-slate-600"}`}>
        {status.text}
      </p>

      {shown ? (
        <div className="space-y-3">
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <p className="text-xs text-slate-500">Preview</p>
            <p className="mt-1 text-2xl text-slate-900" style={{ fontFamily: `${sampleFamily}, sans-serif` }}>
              Welcome to our shop
            </p>
            <p className="mt-1 text-sm text-slate-700" style={{ fontFamily: useForBody ? `${sampleFamily}, sans-serif` : undefined }}>
              New arrivals every week. Order today and we&rsquo;ll deliver to your door.
            </p>
          </div>
          <label className="flex items-start gap-3 text-sm text-slate-700">
            <input type="checkbox" className="mt-1 h-4 w-4" checked={useForBody} onChange={(e) => onChange({ ...shown, useForBody: e.target.checked })} />
            <span>
              Use it for all text, not just headings
              <span className="block text-xs text-slate-500">Leave this off if your font is decorative. Plain text stays easier to read.</span>
            </span>
          </label>
        </div>
      ) : null}
    </div>
  );
}
