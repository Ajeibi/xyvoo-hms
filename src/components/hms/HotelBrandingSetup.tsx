"use client";

import { useState } from "react";
import { ImagePlus } from "lucide-react";
import { toastError, toastSuccess } from "@/lib/app-toast";

export default function HotelBrandingSetup({
  slug,
  initialName,
  initialLogoUrl,
}: {
  slug: string;
  initialName: string;
  initialLogoUrl: string | null;
}) {
  const [displayName, setDisplayName] = useState(initialName);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [previewUrl, setPreviewUrl] = useState(initialLogoUrl);
  const fileInputId = `hotel-logo-upload-${slug}`;

  const onLogoChange = (file: File | null) => {
    setLogoFile(file);
    if (!file) return;
    setPreviewUrl(URL.createObjectURL(file));
  };

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError("");

    const formData = new FormData();
    formData.append("slug", slug);
    formData.append("display_name", displayName);
    if (logoFile) formData.append("logo", logoFile);

    const res = await fetch("/api/hotel/branding", { method: "POST", body: formData });
    const data = await res.json().catch(() => ({}));
    setLoading(false);

    if (!res.ok) {
      const msg = data.error || "Unable to save branding.";
      setError(msg);
      toastError("Could not save branding", msg);
      return;
    }

    toastSuccess("Branding saved", "Refresh to see updates across all pages.");
    if (data.logo_url) setPreviewUrl(data.logo_url);
  };

  return (
    <form onSubmit={handleSave} className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
      <h2 className="text-sm font-semibold text-slate-800">Hotel Branding</h2>
      <p className="text-xs text-slate-500">Update logo and dashboard name shown at the top-left of HMS.</p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1.5">Hotel name</label>
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-lg text-sm text-slate-800"
            placeholder="Hotel name"
            required
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1.5">Logo (max 2MB)</label>
          <input
            id={fileInputId}
            type="file"
            accept="image/*"
            onChange={(e) => onLogoChange(e.target.files?.[0] || null)}
            className="sr-only"
          />
          <label
            htmlFor={fileInputId}
            className="flex cursor-pointer items-center gap-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-4 transition-colors hover:border-blue-400 hover:bg-blue-50/40"
          >
            <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-white">
              {previewUrl ? (
                <img src={previewUrl} alt="Logo preview" className="h-full w-full object-contain" />
              ) : (
                <ImagePlus className="h-6 w-6 text-slate-400" />
              )}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-slate-800">
                {logoFile ? "Replace logo" : "Upload logo"}
              </p>
              <p className="mt-0.5 text-xs text-slate-500">
                PNG, JPG or WEBP. Recommended square image, up to 2MB.
              </p>
              <p className="mt-1 truncate text-xs text-slate-400">
                {logoFile ? logoFile.name : "Click to choose an image"}
              </p>
            </div>
          </label>
        </div>
      </div>

      {previewUrl ? (
        <div className="flex items-center gap-3 p-3 border border-slate-200 rounded-lg">
          <img src={previewUrl} alt="Logo preview" className="h-10 w-10 rounded object-contain bg-slate-50" />
          <p className="text-xs text-slate-500">Current logo preview</p>
        </div>
      ) : null}

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <button
        type="submit"
        disabled={loading}
        className="px-4 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-60"
      >
        {loading ? "Saving..." : "Save Branding"}
      </button>
    </form>
  );
}
