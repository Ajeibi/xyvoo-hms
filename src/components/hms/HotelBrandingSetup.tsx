"use client";

import { useState } from "react";
import { ImagePlus, Palette } from "lucide-react";
import { toastError, toastSuccess } from "@/lib/app-toast";
import { SettingsSectionInfo } from "@/components/hms/settings/SettingsSectionInfo";
import { HmsAlert, HmsCard, HmsField, hmsButton, hmsInput } from "@/components/hms/hms-ui";

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

  const nameId = `hotel-name-${slug}`;

  return (
    <div id="hotel-branding-setup" className="scroll-mt-24">
      <HmsCard
        id="hotel-branding"
        title="Hotel branding"
        description="The name and logo your team sees at the top of every page."
        icon={Palette}
        meaning="guests"
        actions={
          <SettingsSectionInfo
            title="Hotel branding"
            text="The name and logo shown at the top-left of every HMS page, on printed registration cards, and on the public guest menu. Set this up once — it rarely needs to change."
          />
        }
      >
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <HmsField id={nameId} label="Hotel name" hint="Shown at the top of every page and on registration cards.">
              <input
                id={nameId}
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className={hmsInput}
                placeholder="Hotel name"
                aria-describedby={`${nameId}-hint`}
                required
              />
            </HmsField>
            <div>
              <p aria-hidden className="mb-1 block text-sm font-medium text-slate-800">
                Logo
              </p>
              <input
                id={fileInputId}
                type="file"
                accept="image/*"
                onChange={(e) => onLogoChange(e.target.files?.[0] || null)}
                aria-describedby={`${fileInputId}-hint`}
                className="peer sr-only"
              />
              <label
                htmlFor={fileInputId}
                className="flex cursor-pointer items-center gap-4 rounded-xl border border-dashed border-slate-300 bg-amber-50/50 px-4 py-4 transition-colors hover:border-amber-400 hover:bg-amber-50 peer-focus-visible:ring-2 peer-focus-visible:ring-blue-500"
              >
                <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-white">
                  {previewUrl ? (
                    <img src={previewUrl} alt="" className="h-full w-full object-contain" />
                  ) : (
                    <ImagePlus className="h-6 w-6 text-amber-600" aria-hidden />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900">{logoFile ? "Replace logo" : "Upload logo"}</p>
                  <p id={`${fileInputId}-hint`} className="mt-0.5 text-xs text-slate-600">
                    PNG, JPG or WEBP. A square image works best, up to 2MB.
                  </p>
                  <p className="mt-1 truncate text-xs text-slate-700">
                    {logoFile ? logoFile.name : "Choose an image"}
                  </p>
                </div>
              </label>
            </div>
          </div>

          {previewUrl ? (
            <div className="flex items-center gap-3 rounded-xl border border-slate-200 p-3">
              <img src={previewUrl} alt="Your current logo" className="h-10 w-10 rounded bg-slate-50 object-contain" />
              <p className="text-sm text-slate-700">Current logo</p>
            </div>
          ) : null}

          <HmsAlert message={error} />
          <button type="submit" disabled={loading} className={hmsButton.primary}>
            {loading ? "Saving…" : "Save branding"}
          </button>
        </form>
      </HmsCard>
    </div>
  );
}
