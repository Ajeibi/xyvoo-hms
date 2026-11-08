"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Cog } from "lucide-react";
import { HmsAlert, HmsCard, HmsEmptyState, HmsField, HmsPill, hmsButton, hmsInput } from "@/components/hms/hms-ui";
import { callApi } from "@/components/hms/maintenance/maint-ui";
import { formatMinutes, money } from "@/lib/hms/maintenance-shared";
import type { AssetWithStats } from "@/lib/hms/maintenance-assets";
import type { AssetStatus, MaintenanceAsset } from "@/lib/hms/maintenance-shared";

type RoomChoice = { id: string; code: string };
type FixedChoice = { id: string; label: string };

export function AssetForm({
  slug,
  asset,
  rooms,
  fixedAssets,
  categories,
  onDone,
  onCancel,
}: {
  slug: string;
  asset?: MaintenanceAsset;
  rooms: RoomChoice[];
  fixedAssets: FixedChoice[];
  categories: string[];
  onDone: () => void;
  onCancel: () => void;
}) {
  const [f, setF] = useState({
    name: asset?.name ?? "",
    assetTag: asset?.assetTag ?? "",
    category: asset?.category ?? "",
    roomUnitId: asset?.roomUnitId ?? "",
    locationText: asset?.locationText ?? "",
    make: asset?.make ?? "",
    model: asset?.model ?? "",
    serialNumber: asset?.serialNumber ?? "",
    installedOn: asset?.installedOn ?? "",
    warrantyUntil: asset?.warrantyUntil ?? "",
    fixedAssetId: asset?.fixedAssetId ?? "",
    status: (asset?.status ?? "in_service") as AssetStatus,
    notes: asset?.notes ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!f.name.trim()) return setError("Give the equipment a name.");
    setBusy(true);
    const { error: err } = await callApi("/api/hotel/maintenance/assets", "POST", {
      slug,
      id: asset?.id,
      name: f.name,
      assetTag: f.assetTag || null,
      category: f.category || null,
      roomUnitId: f.roomUnitId || null,
      locationText: f.locationText || null,
      make: f.make || null,
      model: f.model || null,
      serialNumber: f.serialNumber || null,
      installedOn: f.installedOn || null,
      warrantyUntil: f.warrantyUntil || null,
      fixedAssetId: f.fixedAssetId || null,
      status: f.status,
      notes: f.notes || null,
    });
    setBusy(false);
    if (err) return setError(err);
    onDone();
  }

  return (
    <HmsCard id="asset-form" title={asset ? `Edit ${asset.name}` : "Add equipment"} description="Anything you service or repair: air conditioners, pumps, generators, lifts, door locks.">
      <form onSubmit={submit} className="space-y-4">
        <HmsAlert message={error} />
        <div className="grid gap-4 sm:grid-cols-2">
          <HmsField id="a-name" label="Name">
            <input id="a-name" className={hmsInput} value={f.name} onChange={(e) => set("name", e.target.value)} maxLength={160} placeholder="Split AC, Room 204" />
          </HmsField>
          <HmsField id="a-tag" label="Tag" optional hint={asset ? undefined : "Leave empty to number it automatically."}>
            <input id="a-tag" className={hmsInput} value={f.assetTag} onChange={(e) => set("assetTag", e.target.value)} maxLength={40} />
          </HmsField>
          <HmsField id="a-cat" label="Type" optional>
            <input id="a-cat" list="a-cats" className={hmsInput} value={f.category} onChange={(e) => set("category", e.target.value)} maxLength={80} />
            <datalist id="a-cats">
              {categories.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </HmsField>
          <HmsField id="a-status" label="Status">
            <select id="a-status" className={hmsInput} value={f.status} onChange={(e) => set("status", e.target.value)}>
              <option value="in_service">In service</option>
              <option value="out_of_service">Out of service</option>
              <option value="retired">Retired</option>
            </select>
          </HmsField>
          <HmsField id="a-room" label="Room" optional>
            <select id="a-room" className={hmsInput} value={f.roomUnitId} onChange={(e) => set("roomUnitId", e.target.value)}>
              <option value="">Not in a guest room</option>
              {rooms.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.code}
                </option>
              ))}
            </select>
          </HmsField>
          <HmsField id="a-loc" label="Or area" optional>
            <input id="a-loc" className={hmsInput} value={f.locationText} onChange={(e) => set("locationText", e.target.value)} maxLength={200} placeholder="Generator house, roof, pool" />
          </HmsField>
          <HmsField id="a-make" label="Make" optional>
            <input id="a-make" className={hmsInput} value={f.make} onChange={(e) => set("make", e.target.value)} maxLength={80} />
          </HmsField>
          <HmsField id="a-model" label="Model" optional>
            <input id="a-model" className={hmsInput} value={f.model} onChange={(e) => set("model", e.target.value)} maxLength={80} />
          </HmsField>
          <HmsField id="a-serial" label="Serial number" optional>
            <input id="a-serial" className={hmsInput} value={f.serialNumber} onChange={(e) => set("serialNumber", e.target.value)} maxLength={80} />
          </HmsField>
          <HmsField id="a-installed" label="Installed on" optional>
            <input id="a-installed" type="date" className={hmsInput} value={f.installedOn} onChange={(e) => set("installedOn", e.target.value)} />
          </HmsField>
          <HmsField id="a-warranty" label="Warranty ends" optional>
            <input id="a-warranty" type="date" className={hmsInput} value={f.warrantyUntil} onChange={(e) => set("warrantyUntil", e.target.value)} />
          </HmsField>
          {fixedAssets.length > 0 ? (
            <HmsField id="a-fixed" label="Fixed asset in Accounts" optional hint="Links the equipment to the asset register that is depreciated.">
              <select id="a-fixed" className={hmsInput} value={f.fixedAssetId} onChange={(e) => set("fixedAssetId", e.target.value)}>
                <option value="">Not linked</option>
                {fixedAssets.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.label}
                  </option>
                ))}
              </select>
            </HmsField>
          ) : null}
        </div>
        <HmsField id="a-notes" label="Notes" optional>
          <textarea id="a-notes" className={hmsInput} rows={2} value={f.notes} onChange={(e) => set("notes", e.target.value)} maxLength={2000} />
        </HmsField>
        <div className="flex gap-2">
          <button type="submit" disabled={busy} className={hmsButton.primary}>
            {busy ? "Saving…" : "Save"}
          </button>
          <button type="button" onClick={onCancel} className={hmsButton.secondary}>
            Cancel
          </button>
        </div>
      </form>
    </HmsCard>
  );
}

export function AssetsClient({
  slug,
  assets,
  rooms,
  fixedAssets,
  categories,
  currency,
  canManage,
  threshold,
}: {
  slug: string;
  assets: AssetWithStats[];
  rooms: RoomChoice[];
  fixedAssets: FixedChoice[];
  categories: string[];
  currency: string;
  canManage: boolean;
  threshold: number;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<AssetWithStats | "new" | null>(null);

  function done() {
    setEditing(null);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {canManage ? (
        <div className="flex justify-end">
          <button type="button" className={hmsButton.primary} onClick={() => setEditing("new")}>
            <Plus className="h-4 w-4" aria-hidden /> Add equipment
          </button>
        </div>
      ) : null}
      {editing ? (
        <AssetForm slug={slug} asset={editing === "new" ? undefined : editing} rooms={rooms} fixedAssets={fixedAssets} categories={categories} onDone={done} onCancel={() => setEditing(null)} />
      ) : null}
      {assets.length === 0 ? (
        <HmsEmptyState icon={Cog} meaning="care" title="No equipment yet" description="Add the equipment you service, then every repair is kept on its history." />
      ) : (
        <HmsCard flush title={`${assets.length} ${assets.length === 1 ? "item" : "items"}`} description={`An item that fails ${threshold} times in a year is flagged.`}>
          <ul className="divide-y divide-slate-100">
            {assets.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-3 px-3 py-3 sm:px-6">
                <div className="min-w-0 flex-1 basis-64">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/hms/${slug}/maintenance/assets/${a.id}`} className="font-semibold text-slate-900 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
                      {a.name}
                    </Link>
                    {a.repeatFault ? <HmsPill tone="red">Keeps failing</HmsPill> : null}
                    {a.underWarranty ? <HmsPill tone="green">In warranty</HmsPill> : null}
                    {a.status !== "in_service" ? <HmsPill tone="amber">{a.status === "retired" ? "Retired" : "Out of service"}</HmsPill> : null}
                    {a.openOrders > 0 ? <HmsPill tone="blue">{a.openOrders} open</HmsPill> : null}
                  </div>
                  <p className="text-sm text-slate-600">
                    {a.assetTag} · {a.roomCode ? `Room ${a.roomCode}` : (a.locationText ?? "No location")}
                    {a.make || a.model ? ` · ${[a.make, a.model].filter(Boolean).join(" ")}` : ""}
                  </p>
                  <p className="text-xs text-slate-500">
                    {a.orderCount} {a.orderCount === 1 ? "repair" : "repairs"} · {money(a.totalPartsCost, currency)} parts · {formatMinutes(a.totalLabourMinutes)} labour
                  </p>
                </div>
                {canManage ? (
                  <button type="button" className={hmsButton.small} onClick={() => setEditing(a)}>
                    Edit
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </HmsCard>
      )}
    </div>
  );
}
