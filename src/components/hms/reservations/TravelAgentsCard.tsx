"use client";

import { useEffect, useId, useState } from "react";
import { Plane } from "lucide-react";
import { HmsAlert, HmsCard, hmsButton, hmsInput } from "@/components/hms/hms-ui";
import { toastSuccess } from "@/lib/app-toast";

type Agent = { id: string; name: string; commissionPercent: number; email: string | null; phone: string | null };

/**
 * The hotel's travel agents and booking sites that earn commission. Each is also a supplier in
 * Accounts, so their commission bills are paid like any other.
 */
export function TravelAgentsCard({ slug }: { slug: string }) {
  const ids = useId();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [editing, setEditing] = useState<Agent | "new" | null>(null);
  const [name, setName] = useState("");
  const [percent, setPercent] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/hotel/travel-agents?slug=${encodeURIComponent(slug)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        setAgents(data.agents ?? []);
        setCanManage(Boolean(data.canManage));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [slug]);

  const start = (a: Agent | "new") => {
    setEditing(a);
    setName(a === "new" ? "" : a.name);
    setPercent(a === "new" ? "" : String(a.commissionPercent));
    setEmail(a === "new" ? "" : (a.email ?? ""));
    setPhone(a === "new" ? "" : (a.phone ?? ""));
    setError(null);
  };

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/hotel/travel-agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug,
          id: editing && editing !== "new" ? editing.id : undefined,
          name: name.trim(),
          commissionPercent: Number(percent),
          email: email.trim(),
          phone: phone.trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "That didn't save.");
        return;
      }
      setAgents(data.agents ?? []);
      toastSuccess("Travel agent saved", `${name.trim()} earns ${Number(percent)}% of the room on the stays they book.`);
      setEditing(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <HmsCard
      id="travel-agents"
      icon={Plane}
      meaning="money"
      title="Travel agents"
      description="Agents and booking sites that earn commission on the stays they send you. Commission is worked out on the room, without taxes, at check-out and sent to Accounts as a bill to pay."
    >
      {agents.length > 0 ? (
        <ul className="divide-y divide-slate-100 text-sm">
          {agents.map((a) => (
            <li key={a.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2">
              <span>
                <span className="font-medium text-slate-900">{a.name}</span>
                <span className="text-slate-700">: {a.commissionPercent}% of the room</span>
                {a.email || a.phone ? <span className="block text-xs text-slate-600">{[a.email, a.phone].filter(Boolean).join(" · ")}</span> : null}
              </span>
              {canManage ? (
                <button type="button" className={hmsButton.quiet} onClick={() => start(a)}>
                  Change<span className="sr-only"> {a.name}</span>
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-slate-700">No travel agents yet.</p>
      )}

      {canManage && !editing ? (
        <button type="button" className={`${hmsButton.small} mt-3`} onClick={() => start("new")}>
          Add a travel agent
        </button>
      ) : null}

      {editing ? (
        <fieldset className="mt-3 space-y-3 rounded-xl border border-slate-200 p-3 text-sm">
          <legend className="px-1 font-semibold text-slate-900">{editing === "new" ? "New travel agent" : editing.name}</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor={`${ids}-name`} className="mb-1 block font-medium text-slate-800">
                Name
              </label>
              <input id={`${ids}-name`} className={hmsInput} maxLength={120} value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <label htmlFor={`${ids}-percent`} className="mb-1 block font-medium text-slate-800">
                Commission (% of the room)
              </label>
              <input id={`${ids}-percent`} type="number" min="0" max="100" step="0.5" className={`${hmsInput} tabular-nums`} value={percent} onChange={(e) => setPercent(e.target.value)} />
            </div>
            <div>
              <label htmlFor={`${ids}-email`} className="mb-1 block font-medium text-slate-800">
                Email (optional)
              </label>
              <input id={`${ids}-email`} type="email" className={hmsInput} maxLength={120} value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div>
              <label htmlFor={`${ids}-phone`} className="mb-1 block font-medium text-slate-800">
                Phone (optional)
              </label>
              <input id={`${ids}-phone`} className={hmsInput} maxLength={40} value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
          </div>
          <p className="text-xs text-slate-600">A new rate applies to stays given this agent from now on; stays already booked keep the rate they were given.</p>
          {error ? <HmsAlert message={error} /> : null}
          <div className="flex flex-wrap gap-2">
            <button type="button" className={hmsButton.primary} disabled={busy || !name.trim() || percent === "" || Number(percent) < 0 || Number(percent) > 100} onClick={() => void save()}>
              {busy ? "Saving…" : "Save agent"}
            </button>
            <button type="button" className={hmsButton.secondary} disabled={busy} onClick={() => setEditing(null)}>
              Cancel
            </button>
          </div>
        </fieldset>
      ) : null}
      {!canManage ? <p className="mt-2 text-xs text-slate-600">Only an owner or admin can change travel agents.</p> : null}
    </HmsCard>
  );
}
