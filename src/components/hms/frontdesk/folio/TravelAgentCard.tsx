"use client";

import { useEffect, useId, useState } from "react";
import { Plane } from "lucide-react";
import { HmsAlert, HmsCard, hmsButton, hmsInput } from "@/components/hms/hms-ui";
import { toastSuccess } from "@/lib/app-toast";
import { formatPricingAmount } from "@/lib/hms/room-pricing";

export type StayAgent = { id: string; name: string; percent: number; base: number; commission: number; billed: boolean } | null;

/**
 * The travel agent who earns commission on this stay: who they are, the rate agreed, and the
 * commission so far on the room. At check-out it is sent to Accounts as a bill to pay.
 */
export function TravelAgentCard({
  slug,
  reservationId,
  currency,
  agent,
  editable,
  onChanged,
}: {
  slug: string;
  reservationId: string;
  currency: string;
  agent: StayAgent;
  editable: boolean;
  onChanged: () => void;
}) {
  const ids = useId();
  const [agents, setAgents] = useState<{ id: string; name: string; commissionPercent: number }[]>([]);
  // Only say there are no agents once the list has loaded.
  const [loaded, setLoaded] = useState(false);
  const [choice, setChoice] = useState(agent?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/hotel/travel-agents?slug=${encodeURIComponent(slug)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled) return;
        if (data) setAgents(data.agents ?? []);
        setLoaded(true);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [slug]);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/hotel/folio/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, reservationId, agentId: choice || null }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "That didn't save.");
        return;
      }
      toastSuccess(choice ? "Travel agent saved" : "Travel agent removed");
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  const canChange = editable && !agent?.billed;
  return (
    <HmsCard id="folio-travel-agent" icon={Plane} meaning="money" title="Travel agent" description="The agent or booking site that earns commission on this stay. It's worked out on the room, without taxes, and sent to Accounts as a bill to pay at check-out.">
      <div className="space-y-3 text-sm">
        {agent ? (
          <p className="text-slate-800">
            <span className="font-medium">{agent.name}</span>, {agent.percent}% of the room.{" "}
            {agent.billed
              ? `Commission of ${formatPricingAmount(agent.commission, currency)} has been sent to Accounts.`
              : `Commission so far: ${formatPricingAmount(agent.commission, currency)} on ${formatPricingAmount(agent.base, currency)} of room charges.`}
          </p>
        ) : (
          <p className="text-slate-700">No travel agent on this stay.</p>
        )}
        {canChange ? (
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-[14rem] flex-1">
              <label htmlFor={`${ids}-agent`} className="mb-1 block font-medium text-slate-800">
                {agent ? "Change the agent" : "Add an agent"}
              </label>
              <select id={`${ids}-agent`} className={`${hmsInput} cursor-pointer`} value={choice} onChange={(e) => setChoice(e.target.value)}>
                <option value="">None</option>
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.commissionPercent}%)
                  </option>
                ))}
              </select>
            </div>
            <button type="button" className={hmsButton.secondary} disabled={busy || choice === (agent?.id ?? "")} onClick={() => void save()}>
              {busy ? "Saving…" : "Save"}
            </button>
          </div>
        ) : null}
        {loaded && agents.length === 0 && canChange ? (
          <p className="text-xs text-slate-600">No travel agents yet. Add them under Reservations, Settings.</p>
        ) : null}
        {error ? <HmsAlert message={error} /> : null}
      </div>
    </HmsCard>
  );
}
