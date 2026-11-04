"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { GitMerge, Undo2 } from "lucide-react";
import { GuestMergePicker } from "@/components/hms/guests/GuestMergePicker";
import { toastError, toastSuccess } from "@/lib/app-toast";
import { HmsCard, HmsEmptyState, HmsPage, HmsPageHeader, HmsPill, hmsButton } from "@/components/hms/hms-ui";
import { HmsSectionIntro } from "@/components/hms/hms-ui-client";
import { GuestsNav } from "@/components/hms/guests/GuestsNav";
import { formatBoardDateTime } from "@/lib/hms/front-desk-board";
import { formatPricingAmount } from "@/lib/hms/room-pricing";
import { REASON_LABEL } from "@/lib/hms/guest-duplicates-shared";
import type { DuplicateCandidate, DuplicateSide, RecentMerge } from "@/lib/hms/guest-merge";

const CONFIDENCE = {
  very_likely: { label: "Very likely the same person", tone: "red" },
  likely: { label: "Likely the same person", tone: "amber" },
  possible: { label: "Possibly the same person", tone: "slate" },
} as const;

function Side({ slug, s, currency }: { slug: string; s: DuplicateSide; currency: string }) {
  return (
    <div className="min-w-0 flex-1 rounded-xl border border-slate-200 p-4 text-sm">
      <Link href={`/hms/${slug}/guests/${s.id}`} className="font-semibold text-blue-700 hover:underline">
        {s.name}
      </Link>
      <dl className="mt-2 space-y-1 text-slate-700">
        <div>{s.phone || "No phone"}</div>
        <div className="break-all">{s.email || "No email"}</div>
        <div>ID {s.idNumber}</div>
        <div>
          {s.completedStays} {s.completedStays === 1 ? "stay" : "stays"} · {formatPricingAmount(s.spend, currency)}
        </div>
        <div>{s.lastStayAt ? `Last stay ${formatBoardDateTime(s.lastStayAt)}` : "Never stayed"}</div>
        <div className="text-xs text-slate-500">Added {formatBoardDateTime(s.createdAt)}</div>
      </dl>
    </div>
  );
}

export function GuestDuplicatesClient({
  slug,
  candidates,
  recentMerges,
  canManage,
  currency,
}: {
  slug: string;
  candidates: DuplicateCandidate[];
  recentMerges: RecentMerge[];
  canManage: boolean;
  currency: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  const send = async (c: DuplicateCandidate, action: "merge" | "dismiss", keep: DuplicateSide, other: DuplicateSide) => {
    if (action === "merge") {
      const ok = window.confirm(
        `Merge ${other.name} into ${keep.name}?\n\nEvery stay, bill, note, request and photo of ${other.name} moves to ${keep.name}, and the duplicate is removed. You can undo it from the list of recent merges.`,
      );
      if (!ok) return;
    }
    setBusy(`${c.a}|${c.b}`);
    try {
      const res = await fetch("/api/hotel/guests/duplicates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, action, keepId: keep.id, otherId: other.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return toastError(action === "merge" ? "Could not merge" : "Could not save", data.error ?? "Try again.");
      toastSuccess(action === "merge" ? "Guests merged" : "Marked as different people");
      router.refresh();
    } finally {
      setBusy(null);
    }
  };

  const undo = async (m: RecentMerge) => {
    if (!window.confirm(`Undo the merge of ${m.mergedName} into ${m.keptName}? ${m.mergedName} comes back with their own stays, bills and notes.`)) return;
    setBusy(m.id);
    try {
      const res = await fetch("/api/hotel/guests/duplicates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, action: "undo", mergeId: m.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return toastError("Could not undo", data.error ?? "Try again.");
      toastSuccess("Merge undone", `${m.mergedName} is back.`);
      router.refresh();
    } finally {
      setBusy(null);
    }
  };

  return (
    <HmsPage wide>
      <GuestsNav slug={slug} />
      <HmsPageHeader
        eyebrow="Guests"
        meaning="guests"
        title="Duplicate guests"
        description="Guests who share an ID, an email, a phone number, or a name and birthday."
      />
      <HmsSectionIntro
        id="guest-duplicates"
        meaning="guests"
        art="people"
        title="One guest, one record"
        points={[
          "Check-in can add the same person twice. Merging joins their stays, bills, notes and points under one profile.",
          "Pick the profile to keep. The other one is removed after everything has moved across.",
          canManage ? "If two profiles are different people, say so and they won't be suggested again." : "Only a manager can merge guests.",
        ]}
      />

      <HmsCard id="duplicates-list" icon={GitMerge} meaning="guests" title="Possible duplicates" description={`${candidates.length} found.`}>
        {candidates.length === 0 ? (
          <HmsEmptyState bare art="people" meaning="guests" title="No duplicates found" description="Nobody on your list shares an ID, email, phone number, or name and birthday." />
        ) : (
          <ul className="space-y-5">
            {candidates.map((c) => {
              const key = `${c.a}|${c.b}`;
              const conf = CONFIDENCE[c.confidence];
              return (
                <li key={key} className="space-y-3 rounded-2xl border border-slate-200 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <HmsPill tone={conf.tone}>{conf.label}</HmsPill>
                    {c.reasons.map((r) => (
                      <HmsPill key={r}>{REASON_LABEL[r]}</HmsPill>
                    ))}
                  </div>
                  <div className="flex flex-col gap-3 sm:flex-row">
                    <Side slug={slug} s={c.left} currency={currency} />
                    <Side slug={slug} s={c.right} currency={currency} />
                  </div>
                  {canManage ? (
                    <div className="flex flex-wrap gap-2">
                      <button type="button" className={hmsButton.primary} disabled={busy === key} onClick={() => send(c, "merge", c.left, c.right)}>
                        Keep {c.left.name}
                      </button>
                      <button type="button" className={hmsButton.primary} disabled={busy === key} onClick={() => send(c, "merge", c.right, c.left)}>
                        Keep {c.right.name}
                      </button>
                      <button type="button" className={hmsButton.secondary} disabled={busy === key} onClick={() => send(c, "dismiss", c.left, c.right)}>
                        They&apos;re different people
                      </button>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </HmsCard>

      {canManage ? <GuestMergePicker slug={slug} /> : null}

      {canManage && recentMerges.length > 0 ? (
        <HmsCard id="recent-merges" icon={Undo2} meaning="guests" title="Recent merges" description="Changed your mind? Undo a merge and the guest comes back with their stays and notes.">
          <ul className="divide-y divide-slate-100">
            {recentMerges.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                <span className="text-slate-800">
                  <strong>{m.mergedName}</strong> merged into{" "}
                  <Link href={`/hms/${slug}/guests/${m.keptGuestId}`} className="font-semibold text-blue-700 hover:underline">
                    {m.keptName}
                  </Link>
                  <span className="block text-xs text-slate-500">{formatBoardDateTime(m.mergedAt)}</span>
                </span>
                {m.canUndo ? (
                  <button type="button" className={hmsButton.secondary} disabled={busy === m.id} onClick={() => undo(m)}>
                    Undo merge
                  </button>
                ) : (
                  <span className="text-xs text-slate-500">Made before undo existed</span>
                )}
              </li>
            ))}
          </ul>
        </HmsCard>
      ) : null}
    </HmsPage>
  );
}
