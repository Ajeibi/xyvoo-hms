"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { HmsAlert, hmsButton } from "@/components/hms/hms-ui";

export function LeaveGroupButton({ slug, groupName }: { slug: string; groupName: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <div className="mt-4 space-y-2">
      <HmsAlert message={error} />
      <button
        type="button"
        disabled={busy}
        className={hmsButton.danger}
        onClick={async () => {
          if (!window.confirm(`Take this hotel out of ${groupName}? The group stops seeing its figures at once, and guest links with the other hotels are removed.`)) return;
          setBusy(true);
          setError("");
          try {
            const res = await fetch("/api/hotel/group-membership", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "leave", slug }) });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(json.error || "Couldn't leave the group.");
            router.refresh();
          } catch (e) {
            setError(e instanceof Error ? e.message : "Couldn't leave the group.");
          } finally {
            setBusy(false);
          }
        }}
      >
        Leave the group
      </button>
    </div>
  );
}
