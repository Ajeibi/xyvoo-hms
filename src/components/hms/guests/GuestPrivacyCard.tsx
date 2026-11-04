"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Download, ShieldCheck, Trash2 } from "lucide-react";
import { toastError, toastSuccess } from "@/lib/app-toast";
import { HmsCard, HmsPill, HmsWarning, hmsButton, hmsInput } from "@/components/hms/hms-ui";
import { formatBoardDateTime } from "@/lib/hms/front-desk-board";
import {
  CONSENT_CHANNELS,
  CONSENT_CHANNEL_LABEL,
  CONSENT_SOURCE_LABEL,
  type ConsentChannel,
  type ConsentLogEntry,
  type ConsentState,
} from "@/lib/hms/guest-consent-shared";

/**
 * Marketing consent (NDPA), the guest's unsubscribe link, and their data rights: a copy of their data,
 * and erasure. Consent is only ever recorded when the guest has said yes; nothing is pre-ticked.
 */
export function GuestPrivacyCard({
  slug,
  guestId,
  guestName,
  state,
  updatedAt,
  log,
  unsubscribeUrl,
  canEdit,
  canManage,
  anonymised,
}: {
  slug: string;
  guestId: string;
  guestName: string;
  state: ConsentState;
  updatedAt: string | null;
  log: ConsentLogEntry[];
  unsubscribeUrl: string;
  canEdit: boolean;
  canManage: boolean;
  anonymised: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<ConsentChannel | null>(null);
  const [confirmErase, setConfirmErase] = useState(false);
  const [typed, setTyped] = useState("");
  const [erasing, setErasing] = useState(false);

  const toggle = async (channel: ConsentChannel, granted: boolean) => {
    setBusy(channel);
    try {
      const res = await fetch(`/api/hotel/guests/${guestId}/consent`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, channel, granted }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toastError("Could not save", data.error ?? "Try again.");
        return;
      }
      toastSuccess(granted ? `${CONSENT_CHANNEL_LABEL[channel]} agreed` : `${CONSENT_CHANNEL_LABEL[channel]} stopped`);
      router.refresh();
    } finally {
      setBusy(null);
    }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(new URL(unsubscribeUrl, window.location.origin).href);
      toastSuccess("Link copied", "Add it to any offer or news message you send this guest.");
    } catch {
      toastError("Could not copy", unsubscribeUrl);
    }
  };

  const erase = async () => {
    setErasing(true);
    try {
      const res = await fetch(`/api/hotel/guests/${guestId}/erase`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toastError("Could not erase", data.error ?? "Try again.");
        return;
      }
      toastSuccess("Details erased");
      setConfirmErase(false);
      router.refresh();
    } finally {
      setErasing(false);
    }
  };

  return (
    <HmsCard
      id="guest-privacy"
      icon={ShieldCheck}
      meaning="care"
      title="Marketing consent and privacy"
      description="Under Nigeria's data protection law (NDPA) you may only send offers and news to people who said yes."
    >
      <div className="space-y-5">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Offers and news</h3>
          <ul className="mt-2 divide-y divide-slate-100 rounded-xl border border-slate-200">
            {CONSENT_CHANNELS.map((channel) => (
              <li key={channel} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium text-slate-900">{CONSENT_CHANNEL_LABEL[channel]}</span>
                  <HmsPill tone={state[channel] ? "green" : "slate"}>{state[channel] ? "Agreed" : "Not agreed"}</HmsPill>
                </div>
                {canEdit && !anonymised ? (
                  <button
                    type="button"
                    className={hmsButton.small}
                    disabled={busy === channel}
                    onClick={() => toggle(channel, !state[channel])}
                    aria-label={state[channel] ? `Record that ${guestName} stopped ${CONSENT_CHANNEL_LABEL[channel]} offers` : `Record that ${guestName} agreed to ${CONSENT_CHANNEL_LABEL[channel]} offers`}
                  >
                    {state[channel] ? "They've stopped" : "They've agreed"}
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-slate-600">
            {updatedAt ? `Last changed ${formatBoardDateTime(updatedAt)}. ` : "Nothing recorded yet, so this guest gets no offers. "}
            Only press &ldquo;They&apos;ve agreed&rdquo; when the guest has told you yes themselves.
          </p>
        </div>

        {!anonymised ? (
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className={hmsButton.small} onClick={copyLink}>
              Copy unsubscribe link
            </button>
            {canEdit ? (
              <a className={hmsButton.small} href={`/api/hotel/guests/${guestId}/export?slug=${encodeURIComponent(slug)}`} download>
                <Download className="h-4 w-4" aria-hidden />
                Download their data
              </a>
            ) : null}
            {canManage ? (
              <button type="button" className={hmsButton.danger} onClick={() => setConfirmErase(true)}>
                <Trash2 className="h-4 w-4" aria-hidden />
                Erase their details
              </button>
            ) : null}
          </div>
        ) : null}

        {confirmErase ? (
          <div className="space-y-3 rounded-xl border border-red-200 bg-red-50 p-4">
            <HmsWarning title="This can't be undone">
              Their name, contact details, ID, notes, messages and ID photos will be wiped. Their stays and bills stay in your books, shown as
              &ldquo;Erased guest&rdquo;, because you must keep financial records.
            </HmsWarning>
            <label htmlFor="erase-confirm" className="block text-sm font-medium text-slate-800">
              Type <span className="font-semibold">erase</span> to confirm
            </label>
            <input id="erase-confirm" className={hmsInput} value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
            <div className="flex gap-2">
              <button type="button" className={hmsButton.secondary} onClick={() => setConfirmErase(false)} disabled={erasing}>
                Cancel
              </button>
              <button type="button" className={hmsButton.primary} onClick={erase} disabled={erasing || typed.trim().toLowerCase() !== "erase"}>
                {erasing ? "Erasing…" : "Erase details"}
              </button>
            </div>
          </div>
        ) : null}

        {log.length > 0 ? (
          <details>
            <summary className="cursor-pointer text-sm font-medium text-blue-700">History of consent ({log.length})</summary>
            <ul className="mt-2 space-y-1 text-sm text-slate-700">
              {log.map((l) => (
                <li key={l.id}>
                  {formatBoardDateTime(l.createdAt)}: {CONSENT_CHANNEL_LABEL[l.channel]} {l.granted ? "agreed" : "stopped"} · {CONSENT_SOURCE_LABEL[l.source]}
                  {l.recordedByName ? ` · by ${l.recordedByName}` : ""}
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </div>
    </HmsCard>
  );
}
