"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Mail } from "lucide-react";
import { toastError, toastSuccess } from "@/lib/app-toast";
import { HmsCard, HmsField, hmsButton, hmsInput } from "@/components/hms/hms-ui";
import { formatBoardDateTime } from "@/lib/hms/front-desk-board";
import type { CampaignRecord } from "@/lib/hms/guest-campaigns";

type Option = { key: string; label: string; emailable: number };

/** Email an offer to a group. Only guests who agreed to email offers receive it. */
export function SendOfferCard({ slug, options, recent }: { slug: string; options: Option[]; recent: CampaignRecord[] }) {
  const router = useRouter();
  const [key, setKey] = useState(options.find((o) => o.emailable > 0)?.key ?? options[0]?.key ?? "");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState<"test" | "send" | null>(null);
  const chosen = options.find((o) => o.key === key);

  const send = async (testOnly: boolean) => {
    if (!subject.trim() || !message.trim()) return toastError("Write a subject and a message first");
    if (!testOnly && !window.confirm(`Email "${subject.trim()}" to ${chosen?.emailable ?? 0} ${chosen?.emailable === 1 ? "guest" : "guests"} in ${chosen?.label}? This can't be taken back.`)) return;
    setBusy(testOnly ? "test" : "send");
    try {
      const res = await fetch("/api/hotel/guests/segments/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, segmentKey: key, subject, message, testOnly }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return toastError(testOnly ? "Could not send the test" : "Could not send the offer", data.error ?? "Try again.");
      if (testOnly) toastSuccess("Test sent", "Check your own inbox.");
      else {
        toastSuccess("Offer sent", `${data.sent} sent${data.failed ? `, ${data.failed} could not be delivered` : ""}.`);
        setSubject("");
        setMessage("");
        router.refresh();
      }
    } finally {
      setBusy(null);
    }
  };

  return (
    <HmsCard id="send-offer" icon={Mail} meaning="guests" title="Send an offer by email" description="Goes only to guests who agreed to email offers. Every email has a link to stop them.">
      <div className="grid grid-cols-1 gap-4">
        <HmsField id="offer-group" label="Who to send to">
          <select id="offer-group" className={hmsInput} value={key} onChange={(e) => setKey(e.target.value)}>
            {options.map((o) => (
              <option key={o.key} value={o.key}>
                {o.label} ({o.emailable} can be emailed)
              </option>
            ))}
          </select>
        </HmsField>
        <HmsField id="offer-subject" label="Subject">
          <input id="offer-subject" className={hmsInput} maxLength={150} value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="A weekend away, on us" />
        </HmsField>
        <HmsField id="offer-message" label="Message" hint="Write {first_name} where you want their first name to appear.">
          <textarea
            id="offer-message"
            aria-describedby="offer-message-hint"
            className={`${hmsInput} min-h-[140px]`}
            maxLength={5000}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder={"Hello {first_name},\n\nThank you for staying with us. Book again before the end of the month and enjoy a free breakfast."}
          />
        </HmsField>
        {chosen && chosen.emailable === 0 ? (
          <p className="text-sm text-amber-800">Nobody in this group has agreed to email offers yet. Record consent on a guest&apos;s profile, or ask guests at online check-in.</p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <button type="button" className={hmsButton.secondary} disabled={busy !== null} onClick={() => send(true)}>
            {busy === "test" ? "Sending test…" : "Send me a test"}
          </button>
          <button type="button" className={hmsButton.primary} disabled={busy !== null || !chosen || chosen.emailable === 0} onClick={() => send(false)}>
            {busy === "send" ? "Sending…" : `Send to ${chosen?.emailable ?? 0} ${chosen?.emailable === 1 ? "guest" : "guests"}`}
          </button>
        </div>
      </div>

      {recent.length > 0 ? (
        <div className="mt-6 border-t border-slate-100 pt-4">
          <h3 className="text-sm font-semibold text-slate-900">Recent sends</h3>
          <ul className="mt-2 divide-y divide-slate-100 text-sm">
            {recent.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="text-slate-800">
                  <strong>{c.subject}</strong> to {c.segmentLabel}
                  {c.isTest ? " (test)" : ""}
                  <span className="block text-xs text-slate-500">{formatBoardDateTime(c.createdAt)}</span>
                </span>
                <span className="text-slate-700">
                  {c.sent} of {c.recipients} sent{c.failed ? `, ${c.failed} failed` : ""}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </HmsCard>
  );
}
