"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toastError, toastSuccess } from "@/lib/app-toast";
import type { HousekeepingEligibleItem, RoomTypePar } from "@/lib/hms/housekeeping-inventory";

export function HousekeepingRoomTypeParsClient({
  slug,
  roomTypes,
  eligibleItems,
  initialPars,
}: {
  slug: string;
  roomTypes: { code: string; name: string }[];
  eligibleItems: HousekeepingEligibleItem[];
  initialPars: RoomTypePar[];
}) {
  const router = useRouter();
  const [selectedRoomType, setSelectedRoomType] = useState(roomTypes[0]?.code ?? "");
  const [itemId, setItemId] = useState(eligibleItems[0]?.id ?? "");
  const [parQty, setParQty] = useState(1);
  const [saving, setSaving] = useState(false);

  const parsForRoomType = useMemo(
    () => initialPars.filter((p) => p.roomTypeCode === selectedRoomType),
    [initialPars, selectedRoomType],
  );

  const addPar = async () => {
    if (!selectedRoomType || !itemId) return;
    setSaving(true);
    try {
      const res = await fetch("/api/hotel/housekeeping/room-type-pars", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, roomTypeCode: selectedRoomType, itemId, parQty }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toastError("Could not save par", data.error ?? "Try again.");
        return;
      }
      toastSuccess("Par saved.");
      router.refresh();
    } finally {
      setSaving(false);
    }
  };

  const removePar = async (id: string) => {
    const res = await fetch(`/api/hotel/housekeeping/room-type-pars/${id}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toastError("Could not remove par", data.error ?? "Try again.");
      return;
    }
    toastSuccess("Par removed.");
    router.refresh();
  };

  if (roomTypes.length === 0) {
    return null;
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-6 pb-8">
      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-slate-800">Room-type supply pars</h2>
        <p className="mt-1 text-sm text-slate-500">
          Linen, amenities, and cleaning consumables expected per room type — drawn from Inventory&apos;s item
          catalog. Consumed automatically when an attendant completes a clean.
        </p>

        {eligibleItems.length === 0 ? (
          <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-700">
            No linen, amenity, or consumable items found in Inventory yet — add some under Inventory settings first.
          </p>
        ) : (
          <>
            <div className="mt-4 flex flex-wrap gap-2">
              {roomTypes.map((rt) => (
                <button
                  key={rt.code}
                  type="button"
                  onClick={() => setSelectedRoomType(rt.code)}
                  className={`rounded-lg border px-3 py-1.5 text-sm font-medium ${
                    selectedRoomType === rt.code
                      ? "border-blue-500 bg-blue-50 text-blue-700"
                      : "border-slate-200 text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {rt.name}
                </button>
              ))}
            </div>

            <div className="mt-4 divide-y divide-slate-100 rounded-lg border border-slate-100">
              {parsForRoomType.length === 0 ? (
                <p className="p-3 text-sm text-slate-500">No pars configured for this room type yet.</p>
              ) : (
                parsForRoomType.map((p) => (
                  <div key={p.id} className="flex items-center justify-between px-3 py-2 text-sm">
                    <span className="text-slate-700">
                      {p.itemName} <span className="text-slate-400">× {p.parQty}</span>
                    </span>
                    <Button type="button" size="sm" variant="outline" className="h-7 rounded-md text-xs" onClick={() => void removePar(p.id)}>
                      Remove
                    </Button>
                  </div>
                ))
              )}
            </div>

            <div className="mt-4 grid grid-cols-[1fr_100px_auto] gap-2">
              <select
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={itemId}
                onChange={(e) => setItemId(e.target.value)}
              >
                {eligibleItems.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} ({item.itemTypeName})
                  </option>
                ))}
              </select>
              <Input
                type="number"
                min={0}
                max={999}
                value={parQty}
                onChange={(e) => setParQty(Math.max(0, Number(e.target.value) || 0))}
              />
              <Button type="button" disabled={saving} onClick={() => void addPar()} className="rounded-lg">
                Add
              </Button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
