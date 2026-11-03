"use client";

import { useState } from "react";
import { ExternalLink, Loader2 } from "lucide-react";
import { HmsAlert, HmsField, HmsPill, hmsButton, hmsInput } from "@/components/hms/hms-ui";
import { toastError, toastSuccess } from "@/lib/app-toast";
import {
  MESSAGE_CHANNEL_LABELS,
  MESSAGE_CHANNELS,
  MESSAGE_TEMPLATES,
  type MessageChannel,
} from "@/lib/hms/guest-messages-shared";
import { cn } from "@/lib/utils";

type Outcome = {
  reservationId: string;
  name: string;
  roomCode: string | null;
  status: "sent" | "prepared" | "failed";
  link?: string;
  error?: string;
};

/**
 * Writes and sends one message. With a `reservationId` it goes to that stay's guest; without one it
 * goes to everyone in the house. WhatsApp gives a chat to open per guest, since it is sent from the
 * hotel's own WhatsApp.
 */
export function GuestMessageComposer({
  slug,
  reservationId,
  onSent,
}: {
  slug: string;
  reservationId?: string;
  onSent?: () => void;
}) {
  const [channel, setChannel] = useState<MessageChannel>("email");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<Outcome[] | null>(null);
  const everyone = !reservationId;

  async function send() {
    if (everyone && !window.confirm("Send this to every guest in the house?")) return;
    setBusy(true);
    setError(null);
    setResults(null);
    try {
      const res = await fetch("/api/hotel/frontdesk/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, channel, subject, body, reservationId }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error ?? "Could not send.");
        toastError("Message not sent", json.error ?? "Try again.");
        return;
      }
      const out = json.results as Outcome[];
      setResults(out);
      const failed = out.filter((o) => o.status === "failed").length;
      if (channel === "email") {
        toastSuccess(`${out.length - failed} email${out.length - failed === 1 ? "" : "s"} sent${failed ? `, ${failed} could not be` : ""}`);
      }
      if (channel === "email" || out.every((o) => o.status === "failed")) setBody("");
      onSent?.();
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        void send();
      }}
    >
      <div className="flex flex-wrap gap-2" role="group" aria-label="How to send">
        {MESSAGE_CHANNELS.map((c) => (
          <button
            key={c}
            type="button"
            aria-pressed={channel === c}
            onClick={() => setChannel(c)}
            className={cn(
              "min-h-11 rounded-xl border px-4 text-sm font-medium",
              channel === c ? "border-blue-500 bg-blue-50 text-blue-900" : "border-slate-200 bg-white text-slate-800",
            )}
          >
            {MESSAGE_CHANNEL_LABELS[c]}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Start from">
        {MESSAGE_TEMPLATES.map((t) => (
          <button
            key={t.key}
            type="button"
            className={cn(hmsButton.secondary, "px-3 py-1.5")}
            onClick={() => {
              setSubject(t.subject);
              setBody(t.body);
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {channel === "email" ? (
        <HmsField id={`msg-subject-${reservationId ?? "all"}`} label="Subject">
          <input
            id={`msg-subject-${reservationId ?? "all"}`}
            className={hmsInput}
            maxLength={150}
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
          />
        </HmsField>
      ) : null}

      <HmsField
        id={`msg-body-${reservationId ?? "all"}`}
        label="Message"
        hint="Type {name}, {room} or {hotel} and each guest's own details are filled in."
      >
        <textarea
          id={`msg-body-${reservationId ?? "all"}`}
          aria-describedby={`msg-body-${reservationId ?? "all"}-hint`}
          className={cn(hmsInput, "min-h-[110px]")}
          maxLength={1500}
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
      </HmsField>

      {error ? <HmsAlert message={error} /> : null}

      <button type="submit" className={hmsButton.primary} disabled={busy || !body.trim() || (channel === "email" && !subject.trim())}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
        {channel === "email" ? (everyone ? "Email everyone in the house" : "Send email") : everyone ? "Get WhatsApp chats for everyone" : "Get the WhatsApp chat"}
      </button>

      {results ? (
        <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 text-sm">
          {results.map((o) => (
            <li key={o.reservationId} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
              <span className="text-slate-900">
                {o.name}
                {o.roomCode ? <span className="text-slate-600"> · Room {o.roomCode}</span> : null}
              </span>
              {o.status === "prepared" && o.link ? (
                <a href={o.link} target="_blank" rel="noopener noreferrer" className={cn(hmsButton.secondary, "px-3 py-1.5")}>
                  Open WhatsApp
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                </a>
              ) : (
                <span className="flex items-center gap-2">
                  {o.error ? <span className="text-slate-600">{o.error}</span> : null}
                  <HmsPill tone={o.status === "sent" ? "green" : "red"}>{o.status === "sent" ? "Sent" : "Not sent"}</HmsPill>
                </span>
              )}
            </li>
          ))}
        </ul>
      ) : null}
    </form>
  );
}
