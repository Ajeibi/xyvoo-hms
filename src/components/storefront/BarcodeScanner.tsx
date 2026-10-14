"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, X } from "lucide-react";
import { dashButton } from "./dashboard-ui";

/* The browser's built-in barcode reader, where there is one (not in every browser). */
type Detector = { detect: (source: CanvasImageSource) => Promise<{ rawValue: string }[]> };
type DetectorConstructor = new (options?: { formats?: string[] }) => Detector;

const focusRing = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-xyvoo-blue focus-visible:ring-offset-2";

const detectorConstructor = () => (typeof window !== "undefined" ? ((window as unknown as { BarcodeDetector?: DetectorConstructor }).BarcodeDetector ?? null) : null);

/**
 * "Scan with the camera": opens the camera, reads the first barcode it sees and
 * hands the number back. Shown only where the browser can read barcodes; a
 * handheld scanner works anywhere because it types the number like a keyboard.
 */
export default function BarcodeScanner({ onScan }: { onScan: (code: string) => void }) {
  const [supported, setSupported] = useState(false);
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const video = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    // Checked after mounting so the server and browser HTML match.
    const timer = window.setTimeout(() => setSupported(Boolean(detectorConstructor() && navigator.mediaDevices?.getUserMedia)), 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!open) return;
    const Detector = detectorConstructor();
    if (!Detector) return;
    let stopped = false;
    let stream: MediaStream | null = null;
    let frame = 0;

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        if (stopped || !video.current) return;
        video.current.srcObject = stream;
        await video.current.play();
        const detector = new Detector({ formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "itf"] });
        const look = async () => {
          if (stopped || !video.current) return;
          try {
            const found = await detector.detect(video.current);
            if (found[0]?.rawValue) {
              onScan(found[0].rawValue);
              setOpen(false);
              return;
            }
          } catch {
            // A frame that can't be read: try the next one.
          }
          frame = window.setTimeout(look, 250);
        };
        void look();
      } catch {
        setMessage("We couldn't use the camera. Check that you've allowed it, or type the number instead.");
      }
    })();

    return () => {
      stopped = true;
      window.clearTimeout(frame);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [open, onScan]);

  if (!supported) return null;

  return (
    <>
      <button type="button" onClick={() => { setMessage(""); setOpen(true); }} className={`${dashButton.secondary} ${focusRing}`}>
        <Camera className="h-4 w-4" aria-hidden /> Scan with the camera
      </button>
      {open ? (
        <div role="dialog" aria-modal="true" aria-label="Scan a barcode" className="fixed inset-0 z-[70] flex flex-col items-center justify-center gap-4 bg-black/80 p-4">
          <video ref={video} className="max-h-[70vh] w-full max-w-md rounded-2xl bg-black" muted playsInline aria-label="Camera view" />
          <p className="text-center text-sm text-white" role="status">
            {message || "Hold the barcode in front of the camera."}
          </p>
          <button type="button" onClick={() => setOpen(false)} className={`${dashButton.secondary} ${focusRing}`}>
            <X className="h-4 w-4" aria-hidden /> Close the camera
          </button>
        </div>
      ) : null}
    </>
  );
}
