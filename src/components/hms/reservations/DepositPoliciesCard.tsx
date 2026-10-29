"use client";

import { useEffect, useId, useState } from "react";
import { Landmark } from "lucide-react";
import { HmsCard, hmsButton, hmsInput } from "@/components/hms/hms-ui";
import { toastError, toastSuccess } from "@/lib/app-toast";
import { formatPricingAmount } from "@/lib/hms/room-pricing";
import { DEPOSIT_KINDS, DEPOSIT_KIND_LABEL, type DepositKind, type DepositPolicy } from "@/lib/hms/folio-deposits-shared";

type RoomType = { id: string; name: string; baseRate: number };

function describe(p: DepositPolicy, currency: string) {
  if (p.kind === "none") return "No deposit";
  const what =
    p.kind === "fixed" ? formatPricingAmount(p.value, currency) : p.kind === "percent" ? `${p.value}% of the stay` : "The first night";
  const when = p.dueDaysBeforeArrival > 0 ? `, due ${p.dueDaysBeforeArrival} day${p.dueDaysBeforeArrival === 1 ? "" : "s"} before arrival` : ", due when booking";
  return what + when;
}

/**
 * What deposit a booking is asked for: a default for every booking, and any room type that needs
 * something different. A booking keeps the deposit it was asked for when it was made.
 */
export function DepositPoliciesCard({ slug, currency }: { slug: string; currency: string }) {
  const [policies, setPolicies] = useState<DepositPolicy[]>([]);
  const [roomTypes, setRoomTypes] = useState<RoomType[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [editing, setEditing] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/hotel/reservations/deposit-policies?slug=${encodeURIComponent(slug)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        setPolicies(data.policies ?? []);
        setRoomTypes(data.roomTypes ?? []);
        setCanManage(Boolean(data.canManage));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [slug]);

  const post = async (body: Record<string, unknown>, done: string) => {
    const res = await fetch("/api/hotel/reservations/deposit-policies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug, ...body }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toastError("Not saved", data.error ?? "Please try again.");
      return false;
    }
    setPolicies(data.policies ?? []);
    toastSuccess("Saved", done);
    return true;
  };

  const defaultPolicy = policies.find((p) => p.roomTypeCode === null) ?? { roomTypeCode: null, kind: "none" as const, value: 0, dueDaysBeforeArrival: 0 };

  return (
    <HmsCard
      id="deposit-policies"
      icon={Landmark}
      meaning="money"
      title="Deposits"
      description="What a booking pays before the guest arrives. Deposits are held for the guest, then go on their bill at check-in. A booking keeps the deposit it was asked for when it was made."
    >
      <ul className="divide-y divide-slate-100 text-sm">
        <PolicyRow
          label="Every booking"
          note="The default"
          policy={defaultPolicy}
          currency={currency}
          canManage={canManage}
          editing={editing === null}
          onEdit={() => setEditing(null)}
          onCancel={() => setEditing(undefined)}
          onSave={async (p) => {
            if (await post({ action: "save", roomTypeCode: null, ...p }, "Default deposit saved.")) setEditing(undefined);
          }}
        />
        {roomTypes.map((t) => {
          const own = policies.find((p) => p.roomTypeCode === t.id);
          return (
            <PolicyRow
              key={t.id}
              label={t.name}
              note={own ? "Its own deposit" : "Uses the default"}
              policy={own ?? defaultPolicy}
              currency={currency}
              canManage={canManage}
              editing={editing === t.id}
              onEdit={() => setEditing(t.id)}
              onCancel={() => setEditing(undefined)}
              onSave={async (p) => {
                if (await post({ action: "save", roomTypeCode: t.id, ...p }, `${t.name} deposit saved.`)) setEditing(undefined);
              }}
              onRemove={own ? () => void post({ action: "remove", roomTypeCode: t.id }, `${t.name} now uses the default.`) : undefined}
            />
          );
        })}
      </ul>
      {!canManage ? <p className="mt-2 text-xs text-slate-600">Only an owner or admin can change deposits.</p> : null}
    </HmsCard>
  );
}

function PolicyRow({
  label,
  note,
  policy,
  currency,
  canManage,
  editing,
  onEdit,
  onCancel,
  onSave,
  onRemove,
}: {
  label: string;
  note: string;
  policy: DepositPolicy;
  currency: string;
  canManage: boolean;
  editing: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSave: (p: { kind: DepositKind; value: number; dueDaysBeforeArrival: number }) => Promise<void>;
  onRemove?: () => void;
}) {
  const ids = useId();
  const [kind, setKind] = useState<DepositKind>(policy.kind);
  const [value, setValue] = useState(String(policy.value || ""));
  const [days, setDays] = useState(String(policy.dueDaysBeforeArrival));
  const [busy, setBusy] = useState(false);

  const startEdit = () => {
    setKind(policy.kind);
    setValue(String(policy.value || ""));
    setDays(String(policy.dueDaysBeforeArrival));
    onEdit();
  };

  if (!editing) {
    return (
      <li className="flex flex-wrap items-baseline justify-between gap-2 py-2">
        <span>
          <span className="font-medium text-slate-900">{label}</span>
          <span className="text-slate-600"> ({note})</span>
          <span className="block text-slate-700">{describe(policy, currency)}</span>
        </span>
        {canManage ? (
          <span className="flex gap-1">
            <button type="button" className={hmsButton.quiet} onClick={startEdit}>
              Change<span className="sr-only"> deposit for {label}</span>
            </button>
            {onRemove ? (
              <button type="button" className={hmsButton.quiet} onClick={onRemove}>
                Use the default<span className="sr-only"> for {label}</span>
              </button>
            ) : null}
          </span>
        ) : null}
      </li>
    );
  }

  const needsValue = kind === "fixed" || kind === "percent";
  return (
    <li className="py-3">
      <fieldset className="space-y-3 rounded-xl border border-slate-200 p-3">
        <legend className="px-1 font-semibold text-slate-900">Deposit for {label === "Every booking" ? "every booking" : label}</legend>
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label htmlFor={`${ids}-kind`} className="mb-1 block font-medium text-slate-800">
              Deposit
            </label>
            <select id={`${ids}-kind`} className={`${hmsInput} cursor-pointer`} value={kind} onChange={(e) => setKind(e.target.value as DepositKind)}>
              {DEPOSIT_KINDS.map((k) => (
                <option key={k} value={k}>
                  {DEPOSIT_KIND_LABEL[k]}
                </option>
              ))}
            </select>
          </div>
          {needsValue ? (
            <div>
              <label htmlFor={`${ids}-value`} className="mb-1 block font-medium text-slate-800">
                {kind === "percent" ? "Percentage" : `Amount (${currency})`}
              </label>
              <input
                id={`${ids}-value`}
                type="number"
                min="0"
                max={kind === "percent" ? 100 : undefined}
                step={kind === "percent" ? "1" : "100"}
                className={`${hmsInput} tabular-nums`}
                value={value}
                onChange={(e) => setValue(e.target.value)}
              />
            </div>
          ) : null}
          {kind !== "none" ? (
            <div>
              <label htmlFor={`${ids}-days`} className="mb-1 block font-medium text-slate-800">
                Due, days before arrival
              </label>
              <input
                id={`${ids}-days`}
                type="number"
                min="0"
                max="365"
                className={`${hmsInput} tabular-nums`}
                aria-describedby={`${ids}-days-hint`}
                value={days}
                onChange={(e) => setDays(e.target.value)}
              />
              <p id={`${ids}-days-hint`} className="mt-1 text-xs text-slate-600">
                0 means due when the booking is made.
              </p>
            </div>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={hmsButton.primary}
            disabled={busy || (needsValue && !(Number(value) > 0))}
            onClick={async () => {
              setBusy(true);
              try {
                await onSave({ kind, value: Number(value) || 0, dueDaysBeforeArrival: Number(days) || 0 });
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "Saving…" : "Save"}
          </button>
          <button type="button" className={hmsButton.secondary} disabled={busy} onClick={onCancel}>
            Cancel
          </button>
        </div>
      </fieldset>
    </li>
  );
}
