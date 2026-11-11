"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { HmsAlert, hmsButton } from "@/components/hms/hms-ui";

export function AcceptGroupInvite({ token, hotelSlug }: { token: string; hotelSlug: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <div className="space-y-2">
      <HmsAlert message={error} />
      <button
        type="button"
        disabled={busy}
        className={hmsButton.primary}
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            const res = await fetch("/api/hotel/group-membership", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "accept", token }) });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(json.error || "Couldn't join the group.");
            // Joining doesn't give the hotel's owner a group role (the group owner decides that), so
            // they go back to their hotel, where Settings shows the group it's now in.
            router.push(`/hms/${hotelSlug}/settings#hotel-group`);
          } catch (e) {
            setError(e instanceof Error ? e.message : "Couldn't join the group.");
            setBusy(false);
          }
        }}
      >
        Join the group
      </button>
    </div>
  );
}
