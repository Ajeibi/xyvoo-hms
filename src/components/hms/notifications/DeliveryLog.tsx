"use client";

import { useEffect, useState } from "react";
import { ScrollText } from "lucide-react";
import { HmsCard } from "@/components/hms/hms-ui";

type Delivery = { id: string; person: string; channel: string; status: string; detail: string | null; createdAt: string; title: string };

const CHANNEL = { email: "Email", whatsapp: "WhatsApp", push: "Push" } as Record<string, string>;
const STATUS = {
  sent: { label: "Sent", cls: "bg-green-50 text-green-800" },
  held: { label: "Held for quiet hours", cls: "bg-slate-100 text-slate-700" },
  failed: { label: "Failed", cls: "bg-red-50 text-red-800" },
  skipped: { label: "Not sent", cls: "bg-amber-50 text-amber-800" },
} as Record<string, { label: string; cls: string }>;

/** For owners and admins: who was sent what, by which channel, and what didn't go. */
export function DeliveryLog({ slug }: { slug: string }) {
  const [rows, setRows] = useState<Delivery[] | null>(null);

  useEffect(() => {
    fetch(`/api/hotel/notifications/deliveries?slug=${encodeURIComponent(slug)}`)
      .then((r) => (r.ok ? r.json() : { deliveries: [] }))
      .then((j: { deliveries: Delivery[] }) => setRows(j.deliveries))
      .catch(() => setRows([]));
  }, [slug]);

  return (
    <HmsCard id="delivery-log" title="Delivery log" description="The last 50 alerts sent by email, WhatsApp or push, and anything that didn't go." icon={ScrollText}>
      {rows === null ? (
        <p className="text-sm text-slate-600" role="status">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-slate-600">Nothing yet. Alerts appear here once someone chooses email, WhatsApp or push.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[36rem] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-600">
                <th scope="col" className="py-2 pr-3 font-medium">When</th>
                <th scope="col" className="py-2 pr-3 font-medium">Alert</th>
                <th scope="col" className="py-2 pr-3 font-medium">To</th>
                <th scope="col" className="py-2 pr-3 font-medium">How</th>
                <th scope="col" className="py-2 font-medium">Result</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const s = STATUS[r.status] ?? STATUS.skipped;
                return (
                  <tr key={r.id} className="border-b border-slate-100 last:border-0 align-top">
                    <td className="whitespace-nowrap py-2 pr-3 text-slate-700">
                      {new Date(r.createdAt).toLocaleString("en-GB", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                    </td>
                    <td className="py-2 pr-3 text-slate-900">{r.title}</td>
                    <td className="py-2 pr-3 text-slate-700">{r.person}</td>
                    <td className="py-2 pr-3 text-slate-700">{CHANNEL[r.channel] ?? r.channel}</td>
                    <td className="py-2">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${s.cls}`}>{s.label}</span>
                      {r.detail ? <span className="mt-0.5 block text-xs text-slate-600">{r.detail}</span> : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </HmsCard>
  );
}
