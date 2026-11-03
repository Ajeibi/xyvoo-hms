"use client";

import { useCallback, useEffect, useState } from "react";
import { GuestMessageComposer } from "@/components/hms/frontdesk/messages/GuestMessageComposer";
import { GuestMessageLog } from "@/components/hms/frontdesk/messages/GuestMessageLog";
import type { GuestMessageRow } from "@/lib/hms/guest-messages-shared";

/** What this stay's guest has been sent, and a way to send one more. */
export function ArrivalMessages({ slug, reservationId }: { slug: string; reservationId: string }) {
  const [messages, setMessages] = useState<GuestMessageRow[]>([]);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/hotel/frontdesk/messages?slug=${encodeURIComponent(slug)}&reservationId=${reservationId}`, { cache: "no-store" });
      const json = await res.json();
      setMessages(json.messages ?? []);
    } catch {
      setMessages([]);
    }
  }, [slug, reservationId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-4">
      <GuestMessageLog messages={messages} />
      <div className="border-t border-slate-100 pt-4">
        <GuestMessageComposer slug={slug} reservationId={reservationId} onSent={() => void load()} />
      </div>
    </div>
  );
}
