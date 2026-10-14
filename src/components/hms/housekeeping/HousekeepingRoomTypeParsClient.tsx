"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Package, Plus } from "lucide-react";
import { HmsCard, HmsField, hmsButton, hmsInput } from "@/components/hms/hms-ui";
import { HmsFilterChips } from "@/components/hms/hms-ui-client";
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
    <div className="mx-auto w-full max-w-6xl px-4 pb-8 sm:px-6 lg:px-8">
      <HmsCard
        id="hk-room-type-pars"
        title="Supplies for each room type"
        description="The linen, amenities and cleaning supplies each room type should have, taken from your Inventory items. They're used up automatically when an attendant finishes a clean."
        icon={Package}
        meaning="stock"
      >
        {eligibleItems.length === 0 ? (
          <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
            No linen, amenity or consumable items found in Inventory yet. Add some in Inventory settings first.
          </p>
        ) : (
          <>
            <HmsFilterChips
              label="Room type"
              meaning="care"
              value={selectedRoomType}
              onChange={setSelectedRoomType}
              options={roomTypes.map((rt) => ({
                value: rt.code,
                label: rt.name,
                count: initialPars.filter((p) => p.roomTypeCode === rt.code).length,
              }))}
            />

            <div className="mt-4 divide-y divide-slate-100 rounded-xl border border-slate-200">
              {parsForRoomType.length === 0 ? (
                <p className="p-3 text-sm text-slate-600">No supplies set for this room type yet.</p>
              ) : (
                parsForRoomType.map((p) => (
                  <div key={p.id} className="flex items-center justify-between px-3 py-2 text-sm">
                    <span className="text-slate-800">
                      {p.itemName} <span className="text-slate-600">× {p.parQty}</span>
                    </span>
                    <button type="button" className={hmsButton.danger} onClick={() => void removePar(p.id)}>
                      Remove<span className="sr-only"> {p.itemName}</span>
                    </button>
                  </div>
                ))
              )}
            </div>

            <div className="mt-4 grid grid-cols-1 items-end gap-2 sm:grid-cols-[1fr_110px_auto]">
              <HmsField id="hk-par-item" label="Item">
                <select id="hk-par-item" className={hmsInput} value={itemId} onChange={(e) => setItemId(e.target.value)}>
                  {eligibleItems.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name} ({item.itemTypeName})
                    </option>
                  ))}
                </select>
              </HmsField>
              <HmsField id="hk-par-qty" label="Quantity">
                <input
                  id="hk-par-qty"
                  type="number"
                  min={0}
                  max={999}
                  className={hmsInput}
                  value={parQty}
                  onChange={(e) => setParQty(Math.max(0, Number(e.target.value) || 0))}
                />
              </HmsField>
              <button type="button" disabled={saving} onClick={() => void addPar()} className={hmsButton.primary}>
                <Plus className="h-4 w-4" aria-hidden />
                Add
              </button>
            </div>
          </>
        )}
      </HmsCard>
    </div>
  );
}
