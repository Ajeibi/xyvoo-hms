"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search, UserRoundCheck } from "lucide-react";
import { toastError, toastSuccess } from "@/lib/app-toast";
import { HmsCard, hmsButton, hmsInput } from "@/components/hms/hms-ui";

type Pick = { id: string; name: string; phone: string; email: string; stays: number };

function GuestSlot({ slug, label, picked, onPick, exclude }: { slug: string; label: string; picked: Pick | null; onPick: (p: Pick | null) => void; exclude?: string }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Pick[]>([]);
  const [searching, setSearching] = useState(false);

  const search = async () => {
    if (q.trim().length < 2) return toastError("Type at least two letters");
    setSearching(true);
    try {
      const res = await fetch(`/api/hotel/guests?slug=${encodeURIComponent(slug)}&q=${encodeURIComponent(q.trim())}&pageSize=8`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return toastError("Could not search", data.error ?? "Try again.");
      setResults(
        ((data.rows ?? []) as { id: string; displayName: string; phone: string; email: string; visitCount: number; anonymised?: boolean }[])
          .filter((r) => !r.anonymised && r.id !== exclude)
          .map((r) => ({ id: r.id, name: r.displayName, phone: r.phone, email: r.email, stays: r.visitCount })),
      );
    } finally {
      setSearching(false);
    }
  };

  if (picked) {
    return (
      <div className="min-w-0 flex-1 rounded-xl border border-slate-200 p-4 text-sm">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
        <p className="mt-1 font-semibold text-slate-900">{picked.name}</p>
        <p className="text-slate-700">{picked.phone || "No phone"}</p>
        <p className="break-all text-slate-700">{picked.email || "No email"}</p>
        <p className="text-slate-700">
          {picked.stays} {picked.stays === 1 ? "stay" : "stays"}
        </p>
        <button type="button" className="mt-2 text-sm font-medium text-blue-700 hover:underline" onClick={() => onPick(null)}>
          Choose someone else
        </button>
      </div>
    );
  }
  return (
    <div className="min-w-0 flex-1 rounded-xl border border-dashed border-slate-300 p-4 text-sm">
      <label htmlFor={`merge-${label}`} className="text-xs font-medium uppercase tracking-wide text-slate-500">
        {label}
      </label>
      <form
        className="mt-2 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void search();
        }}
      >
        <input id={`merge-${label}`} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, phone or email" className={hmsInput} />
        <button type="submit" className={hmsButton.secondary} disabled={searching} aria-label="Search guests">
          <Search className="h-4 w-4" aria-hidden />
        </button>
      </form>
      {results.length > 0 ? (
        <ul className="mt-2 divide-y divide-slate-100 rounded-lg border border-slate-200">
          {results.map((r) => (
            <li key={r.id}>
              <button type="button" className="block w-full px-3 py-2 text-left hover:bg-slate-50" onClick={() => onPick(r)}>
                <span className="font-medium text-slate-900">{r.name}</span>
                <span className="block text-xs text-slate-600">{[r.phone, r.email].filter(Boolean).join(" · ") || "No contact details"}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** Pick any two guests and merge them, for pairs the suggestions did not catch. */
export function GuestMergePicker({ slug }: { slug: string }) {
  const router = useRouter();
  const [a, setA] = useState<Pick | null>(null);
  const [b, setB] = useState<Pick | null>(null);
  const [busy, setBusy] = useState(false);

  const merge = async (keep: Pick, other: Pick) => {
    const ok = window.confirm(
      `Merge ${other.name} into ${keep.name}?\n\nEvery stay, bill, note, request and photo of ${other.name} moves to ${keep.name}, and the duplicate is removed. You can undo it from the list of recent merges.`,
    );
    if (!ok) return;
    setBusy(true);
    try {
      const res = await fetch("/api/hotel/guests/duplicates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, action: "merge", keepId: keep.id, otherId: other.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return toastError("Could not merge", data.error ?? "Try again.");
      toastSuccess("Guests merged");
      setA(null);
      setB(null);
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <HmsCard id="merge-picker" icon={UserRoundCheck} meaning="guests" title="Merge two guests yourself" description="For two profiles the list above did not catch.">
      <div className="flex flex-col gap-3 sm:flex-row">
        <GuestSlot slug={slug} label="First guest" picked={a} onPick={setA} exclude={b?.id} />
        <GuestSlot slug={slug} label="Second guest" picked={b} onPick={setB} exclude={a?.id} />
      </div>
      {a && b ? (
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" className={hmsButton.primary} disabled={busy} onClick={() => merge(a, b)}>
            Keep {a.name}
          </button>
          <button type="button" className={hmsButton.primary} disabled={busy} onClick={() => merge(b, a)}>
            Keep {b.name}
          </button>
        </div>
      ) : (
        <p className="mt-3 text-sm text-slate-600">Choose both guests, then pick which profile to keep.</p>
      )}
    </HmsCard>
  );
}
