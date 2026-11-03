"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, MessageSquare, Send } from "lucide-react";
import { HmsCard, HmsPage, HmsPageHeader } from "@/components/hms/hms-ui";
import { GuestMessageComposer } from "./GuestMessageComposer";
import { GuestMessageLog } from "./GuestMessageLog";
import type { GuestMessageRow, MessageRecipient } from "@/lib/hms/guest-messages-shared";

export function FrontDeskMessagesClient({ slug }: { slug: string }) {
  const [recipients, setRecipients] = useState<MessageRecipient[]>([]);
  const [recent, setRecent] = useState<(GuestMessageRow & { guestName: string })[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/hotel/frontdesk/messages?slug=${encodeURIComponent(slug)}`, { cache: "no-store" });
      const json = await res.json();
      setRecipients(json.recipients ?? []);
      setRecent(json.recent ?? []);
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    void load();
  }, [load]);

  const withEmail = recipients.filter((r) => r.email).length;
  const withPhone = recipients.filter((r) => r.whatsapp).length;

  return (
    <HmsPage wide>
      <HmsPageHeader
        eyebrow="Front desk"
        meaning="guests"
        title="Message guests"
        description="Write to everyone in the house by email or WhatsApp. To write to one guest, open their booking in Arrivals or Guests staying."
      />

      <HmsCard
        id="broadcast"
        icon={Send}
        meaning="guests"
        title="Message everyone in the house"
        description={
          loading
            ? "Counting guests…"
            : `${recipients.length} guest${recipients.length === 1 ? "" : "s"} staying: ${withEmail} with an email, ${withPhone} with a phone number.`
        }
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin text-slate-500" aria-label="Loading" />
        ) : recipients.length === 0 ? (
          <p className="text-sm text-slate-600">Nobody is in the house right now.</p>
        ) : (
          <GuestMessageComposer slug={slug} onSent={() => void load()} />
        )}
      </HmsCard>

      <HmsCard id="recent-messages" icon={MessageSquare} meaning="guests" title="Recently sent" description="The latest messages sent to guests, kept on each guest's stay.">
        <GuestMessageLog messages={recent} />
      </HmsCard>
    </HmsPage>
  );
}
