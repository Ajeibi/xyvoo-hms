"use client";

import { useEffect, useState } from "react";
import { MessageCircle } from "lucide-react";
import type { WhatsAppLogEntry } from "@/lib/store/whatsapp-messages";
import { DashAlert, DashCard, DashPill } from "./dashboard-ui";

const STATUS: Record<string, { label: string; tone: "green" | "blue" | "amber" | "red" | "slate" }> = {
  logged: { label: "Test only", tone: "amber" },
  pending: { label: "Sending", tone: "blue" },
  sent: { label: "Sent", tone: "blue" },
  delivered: { label: "Delivered", tone: "green" },
  read: { label: "Read", tone: "green" },
  failed: { label: "Not sent", tone: "red" },
  skipped: { label: "Not sent", tone: "slate" },
};

const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/** The shop's recent WhatsApp order messages: what went to the shop and to customers, and whether it arrived. */
export default function WhatsAppMessagesCard({ slug }: { slug: string }) {
  const [data, setData] = useState<{ messages: WhatsAppLogEntry[]; testMode: boolean } | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`/api/store/whatsapp?slug=${encodeURIComponent(slug)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setData)
      .catch(() => setError("We couldn't load your WhatsApp messages. Please refresh the page."));
  }, [slug]);

  return (
    <DashCard
      id="whatsapp-messages"
      icon={MessageCircle}
      title="WhatsApp messages"
      description="Order messages sent from XYVOO's WhatsApp number: alerts to you, and updates to customers who asked for them at checkout."
    >
      <DashAlert message={error} />
      {!data && !error ? <div aria-hidden className="h-24 animate-pulse rounded-xl bg-slate-100 motion-reduce:animate-none" /> : null}
      {data ? (
        <div className="space-y-3">
          {data.testMode ? (
            <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">Test mode: these messages are recorded here but not sent to anyone yet.</p>
          ) : null}
          {data.messages.length === 0 ? (
            <p className="text-sm text-slate-600">No WhatsApp messages yet. They&rsquo;ll appear here with your next order.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {data.messages.map((m) => {
                const status = STATUS[m.status] ?? STATUS.pending;
                return (
                  <li key={m.id} className="py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                      <span>
                        {m.audience === "shop" ? "To you" : "To customer"} · +{m.toPhone} · {when(m.createdAt)}
                      </span>
                      <DashPill tone={status.tone}>{status.label}</DashPill>
                    </div>
                    <p className="mt-1 text-sm text-slate-800">{m.body}</p>
                    {m.error ? <p className="mt-1 text-xs text-red-700">{m.error}</p> : null}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : null}
    </DashCard>
  );
}
