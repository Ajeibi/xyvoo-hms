"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Tags } from "lucide-react";
import { HmsCard, HmsField, HmsPill, hmsButton, hmsInput } from "@/components/hms/hms-ui";
import { Button } from "@/components/ui/button";
import { toastError, toastSuccess } from "@/lib/app-toast";
import { SettingsSectionInfo } from "@/components/hms/settings/SettingsSectionInfo";
import { mergeBookingOptions, type BookingOptionKind, type CustomBookingOption } from "@/lib/hms/booking-options-shared";

const COPY: Record<BookingOptionKind, { title: string; noun: string; example: string; help: string }> = {
  source: {
    title: "Booking sources",
    noun: "source",
    example: "For example, Radio ad",
    help: "How a guest found you or booked (phone, walk-in, OTA and so on). The standard choices are always there and cannot be removed. Add your own, rename them, or switch one off to stop it being offered; old stays keep their value and show the new name.",
  },
  segment: {
    title: "Market segments",
    noun: "segment",
    example: "For example, Sports team",
    help: "The kind of guest (transient, corporate, group and so on). The standard choices are always there and cannot be removed. Add your own, rename them, or switch one off to stop it being offered; old stays keep their value and show the new name.",
  },
};

function OptionList({ slug, kind, custom }: { slug: string; kind: BookingOptionKind; custom: CustomBookingOption[] }) {
  const router = useRouter();
  const copy = COPY[kind];
  const [newLabel, setNewLabel] = useState("");
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string; label: string } | null>(null);

  const own = custom.filter((c) => c.kind === kind).sort((a, b) => a.label.localeCompare(b.label));
  const builtIns = mergeBookingOptions(kind, [], { style: "reservation" });

  const add = async () => {
    if (!newLabel.trim()) {
      toastError("Enter a name", copy.example + ".");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/hotel/booking-options", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, kind, label: newLabel.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toastError(`Could not add the ${copy.noun}`, data.error ?? "Try again.");
        return;
      }
      toastSuccess(`${copy.title.replace(/s$/, "")} added.`);
      setNewLabel("");
      router.refresh();
    } finally {
      setSaving(false);
    }
  };

  const patch = async (id: string, body: { label?: string; isActive?: boolean }, done: string) => {
    setBusyId(id);
    try {
      const res = await fetch(`/api/hotel/booking-options/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, ...body }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toastError(`Could not update the ${copy.noun}`, data.error ?? "Try again.");
        return;
      }
      toastSuccess(done);
      setEditing(null);
      router.refresh();
    } finally {
      setBusyId(null);
    }
  };

  const inputId = `booking-option-new-${kind}`;
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-slate-900">{copy.title}</h3>
      <div className="divide-y divide-slate-100 rounded-xl border border-slate-200">
        {builtIns.map((o) => (
          <div key={o.value} className="flex items-center justify-between gap-2 px-4 py-2.5 text-sm">
            <span className="font-medium text-slate-900">{o.label}</span>
            <HmsPill>Standard</HmsPill>
          </div>
        ))}
        {own.map((row) => (
          <div key={row.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm">
            {editing?.id === row.id ? (
              <input
                aria-label={`New name for ${row.label}`}
                className={`${hmsInput} max-w-xs`}
                value={editing.label}
                maxLength={60}
                autoFocus
                onChange={(e) => setEditing({ id: row.id, label: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void patch(row.id, { label: editing.label.trim() }, "Renamed.");
                  }
                  if (e.key === "Escape") setEditing(null);
                }}
              />
            ) : (
              <span className="flex items-center gap-2">
                <span className={`font-medium ${row.isActive ? "text-slate-900" : "text-slate-600 line-through"}`}>{row.label}</span>
                {!row.isActive ? <HmsPill>Off</HmsPill> : null}
              </span>
            )}
            <div className="flex items-center gap-2">
              {editing?.id === row.id ? (
                <>
                  <Button type="button" size="sm" className="h-9 text-sm" disabled={busyId === row.id || !editing.label.trim()} onClick={() => void patch(row.id, { label: editing.label.trim() }, "Renamed.")}>
                    Save
                  </Button>
                  <Button type="button" size="sm" variant="outline" className="h-9 text-sm" onClick={() => setEditing(null)}>
                    Cancel
                  </Button>
                </>
              ) : (
                <>
                  <Button type="button" size="sm" variant="outline" className="h-9 text-sm" disabled={busyId === row.id} onClick={() => setEditing({ id: row.id, label: row.label })}>
                    Rename<span className="sr-only"> {row.label}</span>
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-9 text-sm"
                    disabled={busyId === row.id}
                    onClick={() => void patch(row.id, { isActive: !row.isActive }, row.isActive ? "Switched off." : "Switched on.")}
                  >
                    {row.isActive ? "Switch off" : "Switch on"}
                    <span className="sr-only"> {row.label}</span>
                  </Button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
        <HmsField id={inputId} label={`New ${copy.noun}`}>
          <input
            id={inputId}
            className={hmsInput}
            placeholder={copy.example}
            value={newLabel}
            maxLength={60}
            onChange={(e) => setNewLabel(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void add();
              }
            }}
          />
        </HmsField>
        <button type="button" disabled={saving} onClick={() => void add()} className={hmsButton.primary}>
          Add {copy.noun}
        </button>
      </div>
    </div>
  );
}

export function BookingOptionsManager({ slug, custom }: { slug: string; custom: CustomBookingOption[] }) {
  return (
    <HmsCard
      id="booking-options"
      title="Booking sources and market segments"
      description="The choices on the check-in and new-booking forms. Add your own beside the standard ones."
      icon={Tags}
      meaning="neutral"
      actions={<SettingsSectionInfo title="Booking sources and market segments" text={COPY.source.help} />}
    >
      <div className="space-y-8">
        <OptionList slug={slug} kind="source" custom={custom} />
        <OptionList slug={slug} kind="segment" custom={custom} />
      </div>
    </HmsCard>
  );
}
