"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useFrontDeskRealtime } from "@/hooks/useFrontDeskRealtime";
import { toastError, toastSuccess } from "@/lib/app-toast";
import type { LostFoundItemRow, LostFoundStatus } from "@/lib/hms/housekeeping-lost-found";

const STATUS_LABEL: Record<LostFoundStatus, string> = {
  logged: "Logged",
  guest_notified: "Guest notified",
  returned: "Returned",
  disposed: "Disposed",
};

export function HousekeepingLostFoundClient({
  slug,
  tenantId,
  items,
  canResolve,
}: {
  slug: string;
  tenantId: string;
  items: LostFoundItemRow[];
  canResolve: boolean;
}) {
  const router = useRouter();
  const [roomCode, setRoomCode] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  useFrontDeskRealtime(tenantId, true);

  const logItem = async () => {
    if (!description.trim()) {
      toastError("Description required", "Describe the item before logging it.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/hotel/housekeeping/lost-found", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, roomCode: roomCode.trim() || undefined, description: description.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toastError("Could not log item", data.error ?? "Try again.");
        return;
      }
      toastSuccess("Item logged.");
      setRoomCode("");
      setDescription("");
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  };

  const updateStatus = async (itemId: string, status: LostFoundStatus) => {
    const res = await fetch(`/api/hotel/housekeeping/lost-found/${itemId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug, status }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toastError("Could not update item", data.error ?? "Try again.");
      return;
    }
    toastSuccess("Item updated.");
    router.refresh();
  };

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-8">
      <h1 className="text-xl font-semibold text-slate-900">Lost &amp; found</h1>
      <p className="mt-0.5 text-sm text-slate-500">Log items found during cleaning and track their return status.</p>

      <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-slate-800">Log a found item</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-[140px_1fr]">
          <Input placeholder="Room (optional)" value={roomCode} onChange={(e) => setRoomCode(e.target.value)} />
          <Input placeholder="Description" value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <Button className="mt-3 rounded-lg" disabled={submitting} onClick={() => void logItem()}>
          Log item
        </Button>
      </div>

      <div className="mt-6 space-y-2">
        {items.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
            No items logged yet.
          </div>
        ) : (
          items.map((item) => (
            <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4">
              <div>
                <p className="text-sm font-medium text-slate-900">{item.description}</p>
                <p className="text-xs text-slate-500">
                  {item.roomCode ? `Room ${item.roomCode} · ` : ""}
                  Found by {item.foundByName} · {new Date(item.foundAt).toLocaleDateString()}
                </p>
              </div>
              {canResolve ? (
                <select
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm"
                  value={item.status}
                  onChange={(e) => void updateStatus(item.id, e.target.value as LostFoundStatus)}
                >
                  {Object.entries(STATUS_LABEL).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                  {STATUS_LABEL[item.status]}
                </span>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
