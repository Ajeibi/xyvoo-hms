"use client";

import { useCallback, useEffect, useState } from "react";
import { FileText, Loader2 } from "lucide-react";
import { SignaturePad } from "@/components/hms/SignaturePad";
import { HmsField, HmsPill, hmsButton, hmsInput } from "@/components/hms/hms-ui";
import { toastError, toastSuccess } from "@/lib/app-toast";
import { formatDateTime } from "@/lib/format-date";

type Card = { id: string; signedBy: string | null; signedAt: string; source: "online" | "desk"; url: string | null };

/** The signed registration card(s) kept on the stay, and a way to sign one on this device. */
export function ArrivalRegistrationCard({ slug, reservationId, guestName, canSign }: { slug: string; reservationId: string; guestName: string; canSign: boolean }) {
  const url = `/api/hotel/frontdesk/arrivals/${reservationId}/registration-card`;
  const [cards, setCards] = useState<Card[] | null>(null);
  const [hasOnline, setHasOnline] = useState(false);
  const [signing, setSigning] = useState(false);
  const [name, setName] = useState(guestName);
  const [signature, setSignature] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${url}?slug=${encodeURIComponent(slug)}`, { cache: "no-store" });
      const json = await res.json();
      setCards(json.cards ?? []);
      setHasOnline(Boolean(json.hasOnlineSignature));
    } catch {
      setCards([]);
    }
  }, [url, slug]);

  useEffect(() => {
    void load();
  }, [load]);

  async function make(body: Record<string, unknown>) {
    setBusy(true);
    try {
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slug, ...body }) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toastError("Card not saved", json.error ?? "Try again.");
        return;
      }
      toastSuccess("Registration card saved");
      setSigning(false);
      setSignature(null);
      await load();
    } finally {
      setBusy(false);
    }
  }

  if (!cards) return <Loader2 className="h-4 w-4 animate-spin text-slate-500" aria-label="Loading" />;

  return (
    <div className="space-y-4">
      {cards.length === 0 ? (
        <p className="text-sm text-slate-600">No signed card yet.</p>
      ) : (
        <ul className="space-y-2">
          {cards.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white p-3 text-sm">
              <span className="flex items-center gap-2 text-slate-900">
                <FileText className="h-4 w-4 text-slate-500" aria-hidden />
                Signed by {c.signedBy ?? "guest"} <span className="text-slate-600">· {formatDateTime(c.signedAt)}</span>
              </span>
              <span className="flex items-center gap-2">
                <HmsPill tone={c.source === "online" ? "blue" : "slate"}>{c.source === "online" ? "Online" : "At the desk"}</HmsPill>
                {c.url ? (
                  <a href={c.url} target="_blank" rel="noopener noreferrer" className={hmsButton.secondary}>
                    Open PDF
                  </a>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      )}

      {canSign ? (
        signing ? (
          <form
            className="space-y-3 border-t border-slate-100 pt-4"
            onSubmit={(e) => {
              e.preventDefault();
              void make({ signature, signedBy: name });
            }}
          >
            <HmsField id="reg-name" label="Name of the person signing">
              <input id="reg-name" className={hmsInput} maxLength={120} value={name} onChange={(e) => setName(e.target.value)} />
            </HmsField>
            <p className="text-xs text-slate-600">Hand the device to the guest. By signing they confirm their details and the hotel&apos;s terms.</p>
            <SignaturePad onChange={setSignature} label="Guest signs in the box" />
            <div className="flex gap-2">
              <button type="submit" className={hmsButton.primary} disabled={busy || !signature || !name.trim()}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                Save signed card
              </button>
              <button type="button" className={hmsButton.secondary} onClick={() => setSigning(false)}>
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
            <button type="button" className={hmsButton.primary} onClick={() => setSigning(true)}>
              Sign on this device
            </button>
            {hasOnline && !cards.some((c) => c.source === "online") ? (
              <button type="button" className={hmsButton.secondary} disabled={busy} onClick={() => void make({})}>
                Make card from online signature
              </button>
            ) : null}
          </div>
        )
      ) : null}
    </div>
  );
}
