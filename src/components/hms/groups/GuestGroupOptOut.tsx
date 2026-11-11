"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { HmsAlert, hmsButton } from "@/components/hms/hms-ui";

/** Keep one guest out of the group (they asked not to be shared), or let them back in. */
export function GuestGroupOptOut({ slug, guestId, optedOut }: { slug: string; guestId: string; optedOut: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <div className="mt-4 space-y-2">
      <HmsAlert message={error} />
      <button
        type="button"
        disabled={busy}
        className={optedOut ? hmsButton.small : hmsButton.danger}
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            const res = await fetch("/api/hotel/group-membership", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action: "guest-optout", slug, guestId, optOut: !optedOut }),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(json.error || "That didn't work.");
            router.refresh();
          } catch (e) {
            setError(e instanceof Error ? e.message : "That didn't work.");
          } finally {
            setBusy(false);
          }
        }}
      >
        {optedOut ? "Let the group see this guest again" : "Keep this guest out of the group"}
      </button>
    </div>
  );
}
