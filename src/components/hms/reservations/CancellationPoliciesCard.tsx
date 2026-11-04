"use client";

import { useEffect, useId, useState } from "react";
import { CalendarX } from "lucide-react";
import { HmsCard, hmsButton, hmsInput } from "@/components/hms/hms-ui";
import { toastError, toastSuccess } from "@/lib/app-toast";
import {
  DEFAULT_CANCELLATION_POLICY,
  describePolicy,
  FEE_KINDS,
  FEE_KIND_LABEL,
  type CancellationPolicy,
  type FeeKind,
} from "@/lib/hms/reservation-cancellation-shared";

type RoomType = { id: string; name: string };

/**
 * How late a guest can cancel for free, and what it costs after that. A default for every booking
 * and an optional policy per room type. A booking keeps the policy it was made under.
 */
export function CancellationPoliciesCard({ slug, currency }: { slug: string; currency: string }) {
  const [policies, setPolicies] = useState<CancellationPolicy[]>([]);
  const [roomTypes, setRoomTypes] = useState<RoomType[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [editing, setEditing] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/hotel/reservations/cancellation-policies?slug=${encodeURIComponent(slug)}`)
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
    const res = await fetch("/api/hotel/reservations/cancellation-policies", {
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

  const defaultPolicy = policies.find((p) => p.roomTypeCode === null) ?? DEFAULT_CANCELLATION_POLICY;

  return (
    <HmsCard
      id="cancellation-policies"
      icon={CalendarX}
      meaning="rooms"
      title="Cancellation policy"
      description="How late a guest can cancel for free, and the fee after that. A booking keeps the policy it was made under, and the guest sees it in their confirmation email."
    >
      <ul className="divide-y divide-slate-100 text-sm">
        <Row
          label="Every booking"
          note={policies.some((p) => p.roomTypeCode === null) ? "The default" : "The default (built in: free until 2 days before, then the first night)"}
          policy={defaultPolicy}
          currency={currency}
          canManage={canManage}
          editing={editing === null}
          onEdit={() => setEditing(null)}
          onCancel={() => setEditing(undefined)}
          onSave={async (p) => {
            if (await post({ action: "save", roomTypeCode: null, ...p }, "Default policy saved.")) setEditing(undefined);
          }}
        />
        {roomTypes.map((t) => {
          const own = policies.find((p) => p.roomTypeCode === t.id);
          return (
            <Row
              key={t.id}
              label={t.name}
              note={own ? "Its own policy" : "Uses the default"}
              policy={own ?? defaultPolicy}
              currency={currency}
              canManage={canManage}
              editing={editing === t.id}
              onEdit={() => setEditing(t.id)}
              onCancel={() => setEditing(undefined)}
              onSave={async (p) => {
                if (await post({ action: "save", roomTypeCode: t.id, ...p }, `${t.name} policy saved.`)) setEditing(undefined);
              }}
              onRemove={own ? () => void post({ action: "remove", roomTypeCode: t.id }, `${t.name} now uses the default.`) : undefined}
            />
          );
        })}
      </ul>
      {!canManage ? <p className="mt-2 text-xs text-slate-600">Only an owner or admin can change cancellation policies.</p> : null}
    </HmsCard>
  );
}

type Draft = { freeDaysBeforeArrival: number; lateFeeKind: FeeKind; lateFeeValue: number; noShowFeeKind: FeeKind; noShowFeeValue: number };

function Row({
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
  policy: CancellationPolicy;
  currency: string;
  canManage: boolean;
  editing: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSave: (d: Draft) => Promise<void>;
  onRemove?: () => void;
}) {
  const ids = useId();
  const [draft, setDraft] = useState<Draft>(policy);
  const [busy, setBusy] = useState(false);

  if (!editing) {
    return (
      <li className="flex flex-wrap items-start justify-between gap-2 py-3">
        <div>
          <p className="font-medium text-slate-900">{label}</p>
          <p className="text-xs text-slate-600">{note}</p>
          <ul className="mt-1 space-y-0.5 text-slate-700">
            {describePolicy(policy, currency).map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        </div>
        {canManage ? (
          <div className="flex items-center gap-1">
            <button
              type="button"
              className={hmsButton.small}
              onClick={() => {
                setDraft({
                  freeDaysBeforeArrival: policy.freeDaysBeforeArrival,
                  lateFeeKind: policy.lateFeeKind,
                  lateFeeValue: policy.lateFeeValue,
                  noShowFeeKind: policy.noShowFeeKind,
                  noShowFeeValue: policy.noShowFeeValue,
                });
                onEdit();
              }}
            >
              Change
            </button>
            {onRemove ? (
              <button type="button" className={hmsButton.quiet} onClick={onRemove}>
                Use the default
              </button>
            ) : null}
          </div>
        ) : null}
      </li>
    );
  }

  const valueField = (kind: FeeKind, value: number, set: (n: number) => void, idSuffix: string) =>
    kind === "percent" || kind === "fixed" ? (
      <div>
        <label htmlFor={`${ids}-${idSuffix}`} className="mb-1 block text-slate-700">
          {kind === "percent" ? "Percent" : `Amount (${currency})`}
        </label>
        <input id={`${ids}-${idSuffix}`} type="number" min={0} max={kind === "percent" ? 100 : undefined} className={hmsInput} value={value} onChange={(e) => set(Number(e.target.value))} />
      </div>
    ) : null;

  return (
    <li className="py-3">
      <p className="font-medium text-slate-900">{label}</p>
      <div className="mt-2 grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor={`${ids}-free`} className="mb-1 block text-slate-700">
            Free to cancel up to this many days before arrival
          </label>
          <input id={`${ids}-free`} type="number" min={0} max={365} className={hmsInput} value={draft.freeDaysBeforeArrival} onChange={(e) => setDraft({ ...draft, freeDaysBeforeArrival: Number(e.target.value) })} />
        </div>
        <div />
        <div>
          <label htmlFor={`${ids}-late`} className="mb-1 block text-slate-700">
            Fee for a later cancellation
          </label>
          <select id={`${ids}-late`} className={hmsInput} value={draft.lateFeeKind} onChange={(e) => setDraft({ ...draft, lateFeeKind: e.target.value as FeeKind })}>
            {FEE_KINDS.map((k) => (
              <option key={k} value={k}>
                {FEE_KIND_LABEL[k]}
              </option>
            ))}
          </select>
        </div>
        {valueField(draft.lateFeeKind, draft.lateFeeValue, (n) => setDraft({ ...draft, lateFeeValue: n }), "late-value")}
        <div>
          <label htmlFor={`${ids}-ns`} className="mb-1 block text-slate-700">
            Charge if the guest doesn&apos;t arrive
          </label>
          <select id={`${ids}-ns`} className={hmsInput} value={draft.noShowFeeKind} onChange={(e) => setDraft({ ...draft, noShowFeeKind: e.target.value as FeeKind })}>
            {FEE_KINDS.map((k) => (
              <option key={k} value={k}>
                {FEE_KIND_LABEL[k]}
              </option>
            ))}
          </select>
        </div>
        {valueField(draft.noShowFeeKind, draft.noShowFeeValue, (n) => setDraft({ ...draft, noShowFeeValue: n }), "ns-value")}
      </div>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          className={hmsButton.primary}
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            await onSave(draft);
            setBusy(false);
          }}
        >
          Save
        </button>
        <button type="button" className={hmsButton.secondary} onClick={onCancel} disabled={busy}>
          Cancel
        </button>
      </div>
    </li>
  );
}
