"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, Loader2, PackagePlus } from "lucide-react";
import { HmsCard, HmsEmptyState, HmsField, HmsPage, HmsPageHeader, HmsPill, hmsButton, hmsInput } from "@/components/hms/hms-ui";
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

const STATUS_TONE: Record<LostFoundStatus, "slate" | "green" | "amber" | "blue"> = {
  logged: "amber",
  guest_notified: "blue",
  returned: "green",
  disposed: "slate",
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
    <HmsPage wide>
      <HmsPageHeader
        eyebrow="Housekeeping"
        meaning="guests"
        title="Lost & found"
        description="Log anything found while cleaning, and keep track of whether it's gone back to the guest."
      />

      <HousekeepingSubNav slug={slug} canAccessAllDepartments={canAccessAllDepartments} />

      <HmsCard id="hk-lost-found-log" title="Log a found item" icon={PackagePlus} meaning="guests">
        <div className="grid gap-3 sm:grid-cols-2">
          <HmsField id="hk-lf-room" label="Room" optional>
            <input id="hk-lf-room" className={hmsInput} value={roomCode} onChange={(e) => setRoomCode(e.target.value)} />
          </HmsField>
          <HmsField id="hk-lf-where" label="Where it was found" optional hint="For example, under the bed or on the bathroom counter.">
            <input
              id="hk-lf-where"
              className={hmsInput}
              aria-describedby="hk-lf-where-hint"
              value={whereFound}
              onChange={(e) => setWhereFound(e.target.value)}
            />
          </HmsField>
        </div>
        <div className="mt-3">
          <HmsField id="hk-lf-description" label="Description" hint="What the item is, its colour, brand and anything that helps identify it.">
            <textarea
              id="hk-lf-description"
              className={`${hmsInput} min-h-[88px]`}
              aria-describedby="hk-lf-description-hint"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </HmsField>
        </div>
        <button type="button" className={`${hmsButton.primary} mt-4`} disabled={submitting} onClick={() => void logItem()}>
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <PackagePlus className="h-4 w-4" aria-hidden />}
          Log item
        </button>
      </HmsCard>

      {items.length === 0 ? (
        <HmsEmptyState
          art="box"
          meaning="guests"
          title="No items logged yet"
          description="Items you log above appear here with a tag, so they're easy to find when a guest asks."
        />
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <li key={item.id} className="rounded-2xl border border-amber-100 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between gap-2">
                <code className="rounded-lg bg-amber-50 px-2 py-0.5 text-sm font-semibold text-amber-900">{item.tag}</code>
                <button
                  type="button"
                  className={hmsButton.quiet}
                  onClick={() => void navigator.clipboard.writeText(item.tag)}
                >
                  <Copy className="h-4 w-4" aria-hidden />
                  Copy<span className="sr-only"> tag {item.tag}</span>
                </button>
              </div>
              <p className="mt-2 text-sm font-medium text-slate-900">{item.description}</p>
              <p className="mt-1 text-sm text-slate-700">
                {item.roomCode ? `Room ${item.roomCode} · ` : ""}
                Found by {item.foundByName} · {new Date(item.foundAt).toLocaleDateString("en-GB")}
              </p>
              <div className="mt-3">
                {canResolve ? (
                  <>
                    <label htmlFor={`hk-lf-status-${item.id}`} className="mb-1 block text-sm font-medium text-slate-800">
                      Status
                    </label>
                    <select
                      id={`hk-lf-status-${item.id}`}
                      className={`${hmsInput} min-h-10`}
                      value={item.status}
                      onChange={(e) => void updateStatus(item.id, e.target.value as LostFoundStatus)}
                    >
                      {Object.entries(STATUS_LABEL).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </>
                ) : (
                  <HmsPill tone={STATUS_TONE[item.status]}>{STATUS_LABEL[item.status]}</HmsPill>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </HmsPage>
  );
}
