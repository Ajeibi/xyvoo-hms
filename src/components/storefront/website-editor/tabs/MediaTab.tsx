"use client";

import { useEffect, useState } from "react";
import { Copy, ImagePlus } from "lucide-react";
import { DashAlert } from "../../dashboard-ui";
import { uploadStoreImage } from "../ImagePicker";
import type { TabProps } from "../WebsiteEditor";

type LibraryImage = { name: string; url: string; createdAt: string | null };

/** The store's uploaded images, for reuse across products and the website. */
export default function MediaTab({ slug }: TabProps) {
  const [images, setImages] = useState<LibraryImage[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");

  const load = () =>
    fetch(`/api/store/media?slug=${encodeURIComponent(slug)}`)
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error);
        setImages(data.images);
      })
      .catch(() => setError("We couldn't load your images."));

  useEffect(() => {
    void load();
    // Load once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  const upload = async (files: FileList) => {
    setError("");
    setBusy(true);
    try {
      for (const file of Array.from(files)) await uploadStoreImage(slug, file);
      setStatus(files.length === 1 ? "Image uploaded." : `${files.length} images uploaded.`);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">
        Everything you&rsquo;ve uploaded, including product photos. Choose any of these wherever the editor asks for an image. When you use an image, you&rsquo;ll be asked to
        describe it for customers who use screen readers.
      </p>
      <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-xyvoo-blue px-4 py-2 text-sm font-semibold text-white focus-within:ring-2 focus-within:ring-blue-300">
        <ImagePlus className="h-4 w-4" aria-hidden />
        {busy ? "Uploading…" : "Upload images"}
        <input type="file" accept="image/png,image/jpeg,image/webp" multiple className="sr-only" disabled={busy} onChange={(e) => e.target.files?.length && upload(e.target.files)} />
      </label>
      <DashAlert message={error} />
      <p role="status" className="text-sm text-emerald-700">
        {status}
      </p>
      {images === null ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : images.length === 0 ? (
        <p className="text-sm text-slate-500">No images yet.</p>
      ) : (
        <ul className="grid grid-cols-3 gap-2">
          {images.map((img) => (
            <li key={img.name} className="group relative overflow-hidden rounded-lg border border-slate-200">
              {/* eslint-disable-next-line @next/next/no-img-element -- library thumbnail */}
              <img src={img.url} alt="" className="aspect-square w-full object-cover" loading="lazy" />
              <button
                type="button"
                onClick={() => navigator.clipboard.writeText(img.url).then(() => setStatus("Image link copied."))}
                className="absolute bottom-1 right-1 inline-flex items-center gap-1 rounded-md bg-white/90 px-2 py-1 text-xs text-slate-800 opacity-0 focus:opacity-100 group-hover:opacity-100"
              >
                <Copy className="h-3 w-3" aria-hidden /> Copy link<span className="sr-only"> to {img.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
