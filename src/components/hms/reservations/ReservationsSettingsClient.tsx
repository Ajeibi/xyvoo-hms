"use client";

import { useState } from "react";
import { Banknote, FileText, Gauge, KeyRound, Lock, LogOut, Percent } from "lucide-react";
import { HmsCard, HmsField, HmsPage, HmsPageHeader, hmsButton, hmsInput } from "@/components/hms/hms-ui";
import { toastError, toastSuccess } from "@/lib/app-toast";
import { formatPricingAmount } from "@/lib/hms/room-pricing";
import { DepositPoliciesCard } from "@/components/hms/reservations/DepositPoliciesCard";
import { TravelAgentsCard } from "@/components/hms/reservations/TravelAgentsCard";

const focusRing = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2";

type Settings = {
  allowCheckoutWithBalance: boolean;
  largeChargeThreshold: number;
  hasManagerPin: boolean;
  discountLimitPercent: number;
  invoicePrefix: string;
  nextInvoiceNumber: number;
  taxId: string;
  defaultCreditLimit: number | null;
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
  const [discountLimit, setDiscountLimit] = useState(String(initial.discountLimitPercent ?? 0));
  const [invoicePrefix, setInvoicePrefix] = useState(initial.invoicePrefix ?? "INV");
  const [taxId, setTaxId] = useState(initial.taxId ?? "");
  const [creditLimit, setCreditLimit] = useState(initial.defaultCreditLimit ? String(initial.defaultCreditLimit) : "");
  const [pin, setPin] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async (patch: {
    allowCheckoutWithBalance?: boolean;
    largeChargeThreshold?: number;
    managerPin?: string;
    discountLimitPercent?: number;
    invoicePrefix?: string;
    taxId?: string;
    defaultCreditLimit?: number | null;
  }) => {
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
    <HmsPage>
      <HmsPageHeader
        eyebrow="Reservations"
        meaning="rooms"
        title="Checkout and bill rules"
        description="The rules the front desk follows when guests settle their bills and check out."
      />

      {!canManage ? (
        <p className="flex items-center gap-2 rounded-xl bg-slate-100 px-4 py-3 text-sm text-slate-700">
          <Lock className="h-4 w-4 shrink-0 text-slate-600" aria-hidden />
          Only an owner or admin can change these settings.
        </p>
      ) : null}

      <HmsCard id="checkout-rules" icon={LogOut} meaning="rooms" title="Checking out with money owed">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p id="allow-balance-label" className="text-sm font-medium text-slate-900">
              Allow checkout with an unpaid balance
            </p>
            <p id="allow-balance-hint" className="mt-1 text-sm text-slate-600">
              When this is off, a manager has to approve checking out a guest who still owes money.
            </p>
          </div>
          <label className="relative inline-flex shrink-0 cursor-pointer items-center">
            <input
              type="checkbox"
              role="switch"
              aria-labelledby="allow-balance-label"
              aria-describedby="allow-balance-hint"
              className="peer sr-only"
              checked={settings.allowCheckoutWithBalance}
              disabled={!canManage || saving}
              onChange={(e) => void save({ allowCheckoutWithBalance: e.target.checked })}
            />
            <div className="h-6 w-11 rounded-full bg-slate-300 peer-checked:bg-emerald-600 peer-focus-visible:ring-2 peer-focus-visible:ring-blue-500 peer-focus-visible:ring-offset-2 peer-disabled:opacity-50" />
            <div className="absolute left-1 h-4 w-4 rounded-full bg-white shadow-sm transition-transform peer-checked:translate-x-5" />
            <span className="ml-2 w-7 text-sm font-medium text-slate-700" aria-hidden>
              {settings.allowCheckoutWithBalance ? "On" : "Off"}
            </span>
          </label>
        </div>
      </HmsCard>

      <HmsCard id="charge-rules" icon={Banknote} meaning="money" title="Large charges">
        <HmsField
          id="large-charge-threshold"
          label="Flag charges at or above"
          hint={`Currently ${formatPricingAmount(settings.largeChargeThreshold, currency)}. Charges of this amount or more are marked as large so they're easy to check.`}
        >
          <div className="flex flex-wrap gap-2">
            <input
              id="large-charge-threshold"
              type="number"
              min="1"
              step="0.01"
              value={threshold}
              disabled={!canManage}
              aria-describedby="large-charge-threshold-hint"
              onChange={(e) => setThreshold(e.target.value)}
              className={`${hmsInput} max-w-xs`}
            />
            <button
              type="button"
              className={`${hmsButton.secondary} ${focusRing}`}
              disabled={!canManage || saving || !Number(threshold)}
              onClick={() => void save({ largeChargeThreshold: Number(threshold) })}
            >
              Save amount
            </button>
          </div>
        </HmsField>
      </HmsCard>

      <HmsCard id="discount-rules" icon={Percent} meaning="money" title="Discounts">
        <HmsField
          id="discount-limit"
          label="Staff can give discounts up to (% of the bill)"
          hint={
            settings.discountLimitPercent > 0
              ? `Currently ${settings.discountLimitPercent}%. Bigger discounts need a manager's PIN. Owners and admins never need it.`
              : "Currently 0%, so every discount given by staff needs a manager's PIN. Owners and admins never need it."
          }
        >
          <div className="flex flex-wrap gap-2">
            <input
              id="discount-limit"
              type="number"
              min="0"
              max="100"
              step="0.5"
              value={discountLimit}
              disabled={!canManage}
              aria-describedby="discount-limit-hint"
              onChange={(e) => setDiscountLimit(e.target.value)}
              className={`${hmsInput} max-w-xs`}
            />
            <button
              type="button"
              className={`${hmsButton.secondary} ${focusRing}`}
              disabled={!canManage || saving || discountLimit === "" || Number(discountLimit) < 0 || Number(discountLimit) > 100}
              onClick={() => void save({ discountLimitPercent: Number(discountLimit) })}
            >
              Save limit
            </button>
          </div>
        </HmsField>
      </HmsCard>

      <HmsCard id="credit-limit" icon={Gauge} meaning="money" title="Credit limit">
        <HmsField
          id="default-credit-limit"
          label="Warn when a guest owes more than"
          hint={
            settings.defaultCreditLimit
              ? `Currently ${formatPricingAmount(settings.defaultCreditLimit, currency)}. The bill and the front desk board warn staff when a guest owes more. A stay can be given its own limit on its bill. Leave it empty for no limit.`
              : "No limit is set, so no stay is warned unless it's given its own limit on its bill. Charges billed to a company or travel agent don't count."
          }
        >
          <div className="flex flex-wrap gap-2">
            <input
              id="default-credit-limit"
              type="number"
              min="1"
              step="0.01"
              value={creditLimit}
              disabled={!canManage}
              aria-describedby="default-credit-limit-hint"
              onChange={(e) => setCreditLimit(e.target.value)}
              className={`${hmsInput} max-w-xs`}
            />
            <button
              type="button"
              className={`${hmsButton.secondary} ${focusRing}`}
              disabled={!canManage || saving || (creditLimit.trim() !== "" && !(Number(creditLimit) > 0))}
              onClick={() => void save({ defaultCreditLimit: creditLimit.trim() ? Number(creditLimit) : null })}
            >
              {creditLimit.trim() ? "Save limit" : "Remove limit"}
            </button>
          </div>
        </HmsField>
      </HmsCard>

      <DepositPoliciesCard slug={slug} currency={currency} />

      <TravelAgentsCard slug={slug} />

      <HmsCard id="invoice-settings" icon={FileText} meaning="money" title="Invoices">
        <div className="space-y-4">
          <HmsField
            id="invoice-prefix"
            label="Invoice number starts with"
            hint={`The next invoice will be ${(settings.invoicePrefix || "INV").toUpperCase()}-${String(settings.nextInvoiceNumber ?? 1).padStart(5, "0")}. Each stay gets its number at check-out.`}
          >
            <div className="flex flex-wrap gap-2">
              <input
                id="invoice-prefix"
                maxLength={10}
                value={invoicePrefix}
                disabled={!canManage}
                aria-describedby="invoice-prefix-hint"
                onChange={(e) => setInvoicePrefix(e.target.value)}
                className={`${hmsInput} max-w-[10rem] uppercase`}
              />
              <button
                type="button"
                className={`${hmsButton.secondary} ${focusRing}`}
                disabled={!canManage || saving || !/^[A-Za-z0-9-]{1,10}$/.test(invoicePrefix.trim())}
                onClick={() => void save({ invoicePrefix: invoicePrefix.trim() })}
              >
                Save
              </button>
            </div>
          </HmsField>
          <HmsField
            id="invoice-tax-id"
            label="Tax number (TIN)"
            hint="Printed on every invoice. Leave it empty if you don't have one."
          >
            <div className="flex flex-wrap gap-2">
              <input
                id="invoice-tax-id"
                maxLength={40}
                value={taxId}
                disabled={!canManage}
                aria-describedby="invoice-tax-id-hint"
                onChange={(e) => setTaxId(e.target.value)}
                className={`${hmsInput} max-w-xs`}
              />
              <button
                type="button"
                className={`${hmsButton.secondary} ${focusRing}`}
                disabled={!canManage || saving}
                onClick={() => void save({ taxId: taxId.trim() })}
              >
                Save
              </button>
            </div>
          </HmsField>
        </div>
      </HmsCard>

      <HmsCard id="manager-pin" icon={KeyRound} meaning="team" title="Manager PIN">
        <HmsField
          id="manager-pin-input"
          label={settings.hasManagerPin ? "New manager PIN" : "Manager PIN"}
          hint={
            settings.hasManagerPin
              ? "A PIN is set. Staff who aren't admins need it to void charges, give discounts and approve overrides."
              : "No PIN is set yet, so staff who aren't admins can't get past PIN checks until you set one. Use 4 to 12 digits."
          }
        >
          <div className="flex flex-wrap gap-2">
            <input
              id="manager-pin-input"
              type="password"
              inputMode="numeric"
              autoComplete="new-password"
              value={pin}
              disabled={!canManage}
              aria-describedby="manager-pin-input-hint"
              onChange={(e) => setPin(e.target.value)}
              className={`${hmsInput} max-w-xs`}
            />
            <button
              type="button"
              className={`${hmsButton.secondary} ${focusRing}`}
              disabled={!canManage || saving || pin.trim().length < 4}
              onClick={() => void save({ managerPin: pin.trim() })}
            >
              {settings.hasManagerPin ? "Change PIN" : "Set PIN"}
            </button>
          </div>
        </HmsField>
      </HmsCard>
    </HmsPage>
  );
}
