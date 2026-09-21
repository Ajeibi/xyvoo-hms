"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toastError, toastSuccess } from "@/lib/app-toast";
import { formatPricingAmount } from "@/lib/hms/room-pricing";

type Settings = {
  allowCheckoutWithBalance: boolean;
  largeChargeThreshold: number;
  hasManagerPin: boolean;
};

export function ReservationsSettingsClient({
  slug,
  currency,
  initial,
  canManage,
}: {
  slug: string;
  currency: string;
  initial: Settings;
  canManage: boolean;
}) {
  const [settings, setSettings] = useState(initial);
  const [threshold, setThreshold] = useState(String(initial.largeChargeThreshold));
  const [pin, setPin] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async (patch: { allowCheckoutWithBalance?: boolean; largeChargeThreshold?: number; managerPin?: string }) => {
    setSaving(true);
    try {
      const res = await fetch("/api/hotel/reservations/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, ...patch }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toastError("Could not save", data.error ?? "Try again.");
        return;
      }
      setSettings(data.settings);
      toastSuccess("Settings saved");
      if (patch.managerPin) setPin("");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl px-6 py-8 sm:px-8">
      <h1 className="text-xl font-semibold text-slate-900">Reservations &amp; folio policy</h1>
      <p className="mt-0.5 text-sm text-slate-500">
        Checkout and manager-override rules used across Front Desk and Folio.
      </p>

      <section className="mt-6 rounded-xl border border-slate-200 bg-white p-6 space-y-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-slate-900">Allow checkout with an unpaid balance</p>
            <p className="mt-1 text-sm text-slate-500">
              When off, front desk needs a manager override to check out a guest with money still owed.
            </p>
          </div>
          <label className="relative inline-flex shrink-0 cursor-pointer items-center">
            <input
              type="checkbox"
              className="peer sr-only"
              checked={settings.allowCheckoutWithBalance}
              disabled={!canManage || saving}
              onChange={(e) => void save({ allowCheckoutWithBalance: e.target.checked })}
            />
            <div className="h-6 w-11 rounded-full bg-slate-200 peer-checked:bg-emerald-500 peer-disabled:opacity-50" />
            <div className="absolute left-1 h-4 w-4 rounded-full bg-white transition-transform peer-checked:translate-x-5" />
          </label>
        </div>

        <div className="border-t border-slate-100 pt-5">
          <p className="text-sm font-medium text-slate-900">Large charge threshold</p>
          <p className="mt-1 text-sm text-slate-500">
            Currently {formatPricingAmount(settings.largeChargeThreshold, currency)}. Charges at or above this amount are
            flagged as large postings.
          </p>
          <div className="mt-2 flex gap-2">
            <Input
              type="number"
              min="1"
              step="0.01"
              value={threshold}
              disabled={!canManage}
              onChange={(e) => setThreshold(e.target.value)}
              className="max-w-xs"
            />
            <Button
              type="button"
              variant="outline"
              disabled={!canManage || saving || !Number(threshold)}
              onClick={() => void save({ largeChargeThreshold: Number(threshold) })}
            >
              Save
            </Button>
          </div>
        </div>

        <div className="border-t border-slate-100 pt-5">
          <p className="text-sm font-medium text-slate-900">Manager PIN</p>
          <p className="mt-1 text-sm text-slate-500">
            {settings.hasManagerPin
              ? "A manager PIN is set — required from non-admin staff for voids, discounts, and overrides."
              : "No manager PIN is set yet — non-admin staff cannot pass PIN checks until one is set."}
          </p>
          <div className="mt-2 flex gap-2">
            <Input
              type="password"
              inputMode="numeric"
              placeholder="4–12 digit PIN"
              value={pin}
              disabled={!canManage}
              onChange={(e) => setPin(e.target.value)}
              className="max-w-xs"
            />
            <Button type="button" variant="outline" disabled={!canManage || saving || pin.trim().length < 4} onClick={() => void save({ managerPin: pin.trim() })}>
              {settings.hasManagerPin ? "Change PIN" : "Set PIN"}
            </Button>
          </div>
        </div>

        {!canManage ? (
          <p className="text-xs text-slate-400">Only an owner or admin can change these settings.</p>
        ) : null}
      </section>
    </div>
  );
}
