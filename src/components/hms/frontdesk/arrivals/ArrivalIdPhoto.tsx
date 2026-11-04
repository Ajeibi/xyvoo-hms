"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, Loader2, Trash2, Upload } from "lucide-react";
import { HmsAlert, HmsPill, hmsButton } from "@/components/hms/hms-ui";
import { toastError, toastSuccess } from "@/lib/app-toast";
import { formatDateTime } from "@/lib/format-date";
import { cn } from "@/lib/utils";

type Photo = { id: string; side: "front" | "back"; createdAt: string; url: string | null };

const MAX_EDGE = 1600;

/** Shrinks a photo to a sensible size so a phone camera's 12 MP picture uploads quickly. */
async function shrink(source: CanvasImageSource, width: number, height: number): Promise<Blob | null> {
  const scale = Math.min(1, MAX_EDGE / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  canvas.getContext("2d")?.drawImage(source, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
}

async function shrinkFile(file: File): Promise<Blob | null> {
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return null;
  const blob = await shrink(bitmap, bitmap.width, bitmap.height);
  bitmap.close();
  return blob;
}

export function ArrivalIdPhoto({ slug, reservationId, canAdd }: { slug: string; reservationId: string; canAdd: boolean }) {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [side, setSide] = useState<"front" | "back">("front");
  const [cameraOn, setCameraOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/hotel/frontdesk/arrivals/${reservationId}/id-photo?slug=${encodeURIComponent(slug)}`, {
        cache: "no-store",
      });
      const json = await res.json();
      setPhotos(json.photos ?? []);
    } catch {
      setPhotos([]);
    }
  }, [reservationId, slug]);

  useEffect(() => {
    void load();
  }, [load]);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraOn(false);
  }, []);

  useEffect(() => stopCamera, [stopCamera]);

  async function startCamera() {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      // No live camera here (older browser or plain http): the phone's own camera app opens instead.
      fileRef.current?.click();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
      streamRef.current = stream;
      setCameraOn(true);
      requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          void videoRef.current.play().catch(() => undefined);
        }
      });
    } catch {
      setError("The camera could not be opened. Allow camera access, or choose a photo instead.");
    }
  }

  async function upload(blob: Blob | null) {
    if (!blob) {
      setError("That photo could not be read. Try another.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const body = new FormData();
      body.set("slug", slug);
      body.set("side", side);
      body.set("photo", new File([blob], "id.jpg", { type: blob.type }));
      const res = await fetch(`/api/hotel/frontdesk/arrivals/${reservationId}/id-photo`, { method: "POST", body });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = json.error ?? "Could not save the photo.";
        setError(msg);
        toastError("Could not save the ID photo", msg);
        return;
      }
      toastSuccess("ID photo saved");
      if (side === "front") setSide("back");
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function snap() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const blob = await shrink(video, video.videoWidth, video.videoHeight);
    stopCamera();
    await upload(blob);
  }

  async function remove(photo: Photo) {
    if (!window.confirm("Remove this ID photo?")) return;
    const res = await fetch(
      `/api/hotel/frontdesk/arrivals/${reservationId}/id-photo?slug=${encodeURIComponent(slug)}&photoId=${photo.id}`,
      { method: "DELETE" },
    );
    if (!res.ok) {
      toastError("Could not remove the photo", (await res.json().catch(() => ({}))).error ?? "Try again.");
      return;
    }
    await load();
  }

  return (
    <div className="space-y-4">
      {photos.length === 0 ? (
        <p className="text-sm text-slate-600">No ID photo has been taken for this booking yet.</p>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {photos.map((p) => (
            <li key={p.id} className="rounded-xl border border-slate-200 bg-white p-2">
              {p.url ? (
                // eslint-disable-next-line @next/next/no-img-element -- short-lived signed link, not worth the image optimiser
                <img src={p.url} alt={`ID, ${p.side}`} className="h-40 w-full rounded-lg bg-slate-100 object-contain" />
              ) : (
                <div className="flex h-40 items-center justify-center rounded-lg bg-slate-100 text-sm text-slate-600">
                  Photo unavailable
                </div>
              )}
              <div className="mt-2 flex items-center justify-between gap-2 text-xs text-slate-600">
                <span className="flex items-center gap-2">
                  <HmsPill tone="blue">{p.side === "front" ? "Front" : "Back"}</HmsPill>
                  {formatDateTime(p.createdAt)}
                </span>
                {canAdd ? (
                  <button
                    type="button"
                    className="inline-flex min-h-9 items-center gap-1 rounded-lg px-2 text-red-700 hover:bg-red-50"
                    onClick={() => void remove(p)}
                    aria-label={`Remove ${p.side} photo`}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                    Remove
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}

      {canAdd ? (
        <div className="space-y-3 border-t border-slate-100 pt-4">
          <div className="flex gap-2" role="group" aria-label="Which side of the ID">
            {(["front", "back"] as const).map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={side === s}
                onClick={() => setSide(s)}
                className={cn(
                  "min-h-11 rounded-xl border px-4 text-sm font-medium",
                  side === s ? "border-blue-500 bg-blue-50 text-blue-900" : "border-slate-200 bg-white text-slate-800",
                )}
              >
                {s === "front" ? "Front of ID" : "Back of ID"}
              </button>
            ))}
          </div>

          {cameraOn ? (
            <div className="space-y-3">
              <video ref={videoRef} playsInline muted className="max-h-72 w-full rounded-xl bg-black object-contain" />
              <div className="flex gap-2">
                <button type="button" className={hmsButton.primary} onClick={() => void snap()} disabled={busy}>
                  <Camera className="h-4 w-4" aria-hidden />
                  Take photo
                </button>
                <button type="button" className={hmsButton.secondary} onClick={stopCamera}>
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <button type="button" className={hmsButton.primary} onClick={() => void startCamera()} disabled={busy}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Camera className="h-4 w-4" aria-hidden />}
                {busy ? "Saving…" : "Use camera"}
              </button>
              <button type="button" className={hmsButton.secondary} onClick={() => fileRef.current?.click()} disabled={busy}>
                <Upload className="h-4 w-4" aria-hidden />
                Choose a photo
              </button>
            </div>
          )}

          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="sr-only"
            aria-label="Choose an ID photo"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) await upload(await shrinkFile(file));
            }}
          />
          {error ? <HmsAlert message={error} /> : null}
          <p className="text-xs text-slate-600">Photos are private. Only front desk staff can open them.</p>
        </div>
      ) : null}
    </div>
  );
}
