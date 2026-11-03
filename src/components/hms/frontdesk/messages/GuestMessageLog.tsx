import { HmsPill } from "@/components/hms/hms-ui";
import { formatDateTime } from "@/lib/format-date";
import { MESSAGE_CHANNEL_LABELS, type GuestMessageRow } from "@/lib/hms/guest-messages-shared";

const STATUS: Record<GuestMessageRow["status"], { label: string; tone: "green" | "blue" | "red" }> = {
  sent: { label: "Sent", tone: "green" },
  prepared: { label: "WhatsApp opened", tone: "blue" },
  failed: { label: "Not sent", tone: "red" },
};

/** A list of messages sent to guests, newest first. */
export function GuestMessageLog({ messages }: { messages: (GuestMessageRow & { guestName?: string })[] }) {
  if (messages.length === 0) return <p className="text-sm text-slate-600">No messages have been sent yet.</p>;
  return (
    <ul className="space-y-2">
      {messages.map((m) => (
        <li key={m.id} className="rounded-xl border border-slate-200 bg-white p-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
            <span>
              {m.guestName ? <span className="font-medium text-slate-900">{m.guestName} · </span> : null}
              {MESSAGE_CHANNEL_LABELS[m.channel]}
              {m.recipient ? ` to ${m.recipient}` : ""} · {formatDateTime(m.createdAt)}
              {m.broadcastId ? " · to everyone" : ""}
            </span>
            <HmsPill tone={STATUS[m.status].tone}>{STATUS[m.status].label}</HmsPill>
          </div>
          {m.subject ? <p className="mt-1 text-sm font-medium text-slate-900">{m.subject}</p> : null}
          <p className="mt-1 line-clamp-3 whitespace-pre-line text-sm text-slate-800">{m.body}</p>
          {m.error ? <p className="mt-1 text-xs text-red-800">{m.error}</p> : null}
        </li>
      ))}
    </ul>
  );
}
