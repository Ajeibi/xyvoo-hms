"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";
import { toastError, toastSuccess } from "@/lib/app-toast";

export function FrontDeskCheckoutButton({
  slug,
  reservationId,
  roomCode,
}: {
  slug: string;
  reservationId: string;
  roomCode: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const handleCheckout = async () => {
    if (!confirm(`Check out guest from room ${roomCode}?`)) return;
    setBusy(true);
    try {
      const res = await fetch("/api/hotel/frontdesk/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, reservationId, roomCode }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (res.ok) {
        toastSuccess(`Room ${roomCode} checked out`);
        router.refresh();
      } else {
        toastError("Checkout failed", data.error ?? "Try again.");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button type="button" disabled={busy} onClick={() => void handleCheckout()}>
      <LogOut className="h-4 w-4" />
      Check out
    </Button>
  );
}
