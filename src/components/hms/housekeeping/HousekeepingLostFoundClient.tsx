"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useFrontDeskRealtime } from "@/hooks/useFrontDeskRealtime";
import { toastError, toastSuccess } from "@/lib/app-toast";
import type { LostFoundItemRow, LostFoundStatus } from "@/lib/hms/housekeeping-lost-found";
import { HousekeepingSubNav } from "@/components/hms/housekeeping/HousekeepingSubNav";

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
  canAccessAllDepartments,
}: {
  slug: string;
  tenantId: string;
  items: LostFoundItemRow[];
  canResolve: boolean;
  canAccessAllDepartments: boolean;
}) {
  const router = useRouter();
  const [roomCode, setRoomCode] = useState("");
  const [whereFound, setWhereFound] = useState("");
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
      const fullDescription = whereFound.trim()
        ? `${description.trim()} — found ${whereFound.trim()}`
        : description.trim();
      const res = await fetch("/api/hotel/housekeeping/lost-found", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, roomCode: roomCode.trim() || undefined, description: fullDescription }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toastError("Could not log item", data.error ?? "Try again.");
        return;
      }
      toastSuccess("Item logged.");
      setRoomCode("");
      setWhereFound("");
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
    <div className="w-full px-6 py-8 sm:px-8">
      <h1 className="text-xl font-semibold text-slate-900">Lost &amp; found</h1>
      <p className="mt-0.5 text-sm text-slate-500">Log items found during cleaning and track their return status.</p>

      <HousekeepingSubNav slug={slug} canAccessAllDepartments={canAccessAllDepartments} />

      <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-slate-800">Log a found item</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Input placeholder="Room (optional)" value={roomCode} onChange={(e) => setRoomCode(e.target.value)} />
          <Input
            placeholder="Where it was found (optional) — e.g. under the bed, bathroom counter"
            value={whereFound}
            onChange={(e) => setWhereFound(e.target.value)}
          />
        </div>
        <textarea
          className="mt-3 min-h-[88px] w-full rounded-lg border border-input px-3 py-2 text-sm"
          placeholder="Description — what the item is, color, brand, any identifying detail…"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <Button className="mt-3 rounded-lg" disabled={submitting} onClick={() => void logItem()}>
          Log item
        </Button>
      </div>

      {items.length === 0 ? (
        <div className="mt-6 rounded-xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
          No items logged yet.
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <div key={item.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between gap-2">
                <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-semibold text-slate-700">
                  {item.tag}
                </code>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 px-1.5 text-[10px]"
                  onClick={() => void navigator.clipboard.writeText(item.tag)}
                >
                  Copy
                </Button>
              </div>
              <p className="mt-2 text-sm font-medium text-slate-900">{item.description}</p>
              <p className="mt-1 text-xs text-slate-500">
                {item.roomCode ? `Room ${item.roomCode} · ` : ""}
                Found by {item.foundByName} · {new Date(item.foundAt).toLocaleDateString()}
              </p>
              <div className="mt-3">
                {canResolve ? (
                  <select
                    className="h-9 w-full rounded-lg border border-slate-200 px-3 text-sm"
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
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
