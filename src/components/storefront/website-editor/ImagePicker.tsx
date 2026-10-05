"use client";

import { useState } from "react";
import { ImagePlus, Images, Trash2 } from "lucide-react";
import { DashField, dashInput } from "../dashboard-ui";

type LibraryImage = { name: string; url: string };

export async function uploadStoreImage(slug: string, file: File): Promise<string> {
  if (file.size > 5 * 1024 * 1024) throw new Error("Please choose an image of 5MB or less.");
  const form = new FormData();
  form.append("slug", slug);
  form.append("file", file);
  const res = await fetch("/api/store/products/upload-image", { method: "POST", body: form });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.url) throw new Error(typeof data.error === "string" ? data.error : "We couldn't upload that image.");
  return data.url as string;
}

/**
 * Pick an image for the website: upload a new one or reuse one from the
 * store's library. When `alt` is given, a description is asked for (and
 * required by the caller) so the image is described to screen-reader users.
 */
export default function ImagePicker({
  id,
  label,
  slug,
  url,
  onChange,
  alt,
  onAltChange,
  decorative = false,
}: {
  id: string;
  label: string;
  slug: string;
  url: string | null;
  onChange: (url: string | null) => void;
  alt?: string;
  onAltChange?: (alt: string) => void;
  /** Purely decorative images (e.g. behind text) don't need a description. */
  decorative?: boolean;
}) {
  const [library, setLibrary] = useState<LibraryImage[] | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const openLibrary = async () => {
    setOpen((o) => !o);
    if (library) return;
    try {
      const res = await fetch(`/api/store/media?slug=${encodeURIComponent(slug)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setLibrary(data.images);
    } catch {
      setError("We couldn't load your images.");
    }
  };

  const upload = async (file: File) => {
    setError("");
    setBusy(true);
    try {
      onChange(await uploadStoreImage(slug, file));
      setLibrary(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-slate-800" id={`${id}-label`}>
        {label}
      </p>
      <div className="flex flex-wrap items-center gap-3" role="group" aria-labelledby={`${id}-label`}>
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element -- editor preview of a chosen image
          <img src={url} alt="" className="h-16 w-24 rounded-lg border border-slate-200 object-cover" />
        ) : (
          <span className="flex h-16 w-24 items-center justify-center rounded-lg border border-dashed border-slate-300 text-xs text-slate-500">No image</span>
        )}
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-800 focus-within:ring-2 focus-within:ring-xyvoo-blue hover:bg-slate-50">
          <ImagePlus className="h-4 w-4" aria-hidden />
          {busy ? "Uploading…" : "Upload"}
          <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" disabled={busy} onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
        </label>
        <button type="button" onClick={openLibrary} aria-expanded={open} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-800 hover:bg-slate-50">
          <Images className="h-4 w-4" aria-hidden /> Your images
        </button>
        {url ? (
          <button type="button" onClick={() => onChange(null)} className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-red-700">
            <Trash2 className="h-4 w-4" aria-hidden /> Remove
          </button>
        ) : null}
      </div>
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      {open ? (
        <div className="rounded-xl border border-slate-200 p-3">
          {library === null ? (
            <p className="text-sm text-slate-500">Loading…</p>
          ) : library.length === 0 ? (
            <p className="text-sm text-slate-500">No images uploaded yet.</p>
          ) : (
            <ul className="grid max-h-56 grid-cols-4 gap-2 overflow-y-auto">
              {library.map((img) => (
                <li key={img.name}>
                  <button
                    type="button"
                    onClick={() => {
                      onChange(img.url);
                      setOpen(false);
                    }}
                    className={`block w-full overflow-hidden rounded-lg border-2 ${img.url === url ? "border-xyvoo-blue" : "border-transparent"} focus:outline-none focus:ring-2 focus:ring-xyvoo-blue`}
                    aria-label={`Use image ${img.name}`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- library thumbnail */}
                    <img src={img.url} alt="" className="aspect-square w-full object-cover" loading="lazy" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
      {url && onAltChange && !decorative ? (
        <DashField id={`${id}-alt`} label="Describe the image" hint="Read aloud to customers who use screen readers, e.g. “Woman wearing a green ankara dress”.">
          <input id={`${id}-alt`} className={dashInput} value={alt ?? ""} onChange={(e) => onAltChange(e.target.value)} aria-describedby={`${id}-alt-hint`} maxLength={200} />
        </DashField>
      ) : null}
    </div>
  );
}
