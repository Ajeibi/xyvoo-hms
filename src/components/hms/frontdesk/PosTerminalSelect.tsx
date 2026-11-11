"use client";

import { useEffect, useState } from "react";
import { hmsInput } from "@/components/hms/hms-ui";

type Terminal = { id: string; name: string };

/**
 * "Which card machine?" for a payment recorded as Card machine (POS). Shows nothing for other methods.
 * Required when the hotel has set up any machines; a hotel with none sees a hint and is not blocked.
 * The HMS only records the payment: the guest's card is taken on the machine itself.
 */
export function PosTerminalSelect({
  slug,
  method,
  value,
  onChange,
  id,
  name = "posTerminalId",
}: {
  slug: string;
  method: string;
  value: string;
  onChange: (id: string) => void;
  id: string;
  name?: string;
}) {
  const [terminals, setTerminals] = useState<Terminal[] | null>(null);

  useEffect(() => {
    if (method !== "pos" || terminals !== null) return;
    let cancelled = false;
    fetch(`/api/hotel/pos-terminals?slug=${encodeURIComponent(slug)}`)
      .then((r) => (r.ok ? r.json() : { terminals: [] }))
      .then((d: { terminals?: Terminal[] }) => {
        if (!cancelled) setTerminals(d.terminals ?? []);
      })
      .catch(() => {
        if (!cancelled) setTerminals([]);
      });
    return () => {
      cancelled = true;
    };
  }, [method, slug, terminals]);

  if (method !== "pos") return null;
  if (terminals === null) return <p className="text-xs text-slate-600">Loading card machines…</p>;
  if (terminals.length === 0) {
    return <p className="text-xs text-slate-600">No card machines are set up yet. Add them in Settings so each card payment shows which machine took it.</p>;
  }
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-slate-800">
        Which card machine <span className="text-rose-600">*</span>
      </label>
      <select id={id} name={name} required value={value} onChange={(e) => onChange(e.target.value)} className={hmsInput}>
        <option value="">Choose a machine…</option>
        {terminals.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>
    </div>
  );
}
