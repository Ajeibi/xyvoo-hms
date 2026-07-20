"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Loader2 } from "lucide-react";
import type { FbRoleCapabilities } from "@/lib/hms/fb-rbac";
import type { FbCategoryPrepRow } from "@/lib/hms/fb-menu";
import {
  DEFAULT_KITCHEN_OVERDUE_MINUTES,
  KITCHEN_OVERDUE_MINUTES_MAX,
  KITCHEN_OVERDUE_MINUTES_MIN,
  type TenantFbSettings,
} from "@/lib/hms/fb-settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toastError, toastSuccess } from "@/lib/app-toast";

const CATEGORY_PREP_MIN = 1;
const CATEGORY_PREP_MAX = 240;

function draftFromCategories(categories: FbCategoryPrepRow[]) {
  const map: Record<string, string> = {};
  for (const c of categories) {
    map[c.id] = c.prepMinutes == null ? "" : String(c.prepMinutes);
  }
  return map;
}

export function KitchenSettingsClient({
  slug,
  initial,
  categories: initialCategories = [],
}: {
  slug: string;
  initial: TenantFbSettings;
  categories?: FbCategoryPrepRow[];
}) {
  const [settings, setSettings] = useState(initial);
  const [draftMinutes, setDraftMinutes] = useState(String(initial.kitchenOverdueMinutes));
  const [capabilities, setCapabilities] = useState<FbRoleCapabilities | null>(null);
  const [busy, setBusy] = useState(false);

  const [categories, setCategories] = useState<FbCategoryPrepRow[]>(initialCategories);
  const [prepDraft, setPrepDraft] = useState<Record<string, string>>(
    draftFromCategories(initialCategories),
  );
  const [savingPrep, setSavingPrep] = useState(false);

  const canEdit = capabilities?.canConfigure !== false;

  const load = async () => {
    const res = await fetch(`/api/hotel/fb/settings?slug=${encodeURIComponent(slug)}`);
    const data = await res.json();
    if (!res.ok) return;
    setSettings({
      kitchenOverdueMinutes: data.kitchenOverdueMinutes ?? DEFAULT_KITCHEN_OVERDUE_MINUTES,
      kitchenOverdueMinutesConfigured: Boolean(data.kitchenOverdueMinutesConfigured),
    });
    setDraftMinutes(String(data.kitchenOverdueMinutes ?? DEFAULT_KITCHEN_OVERDUE_MINUTES));
    if (data.capabilities) setCapabilities(data.capabilities);
    if (Array.isArray(data.categories)) {
      setCategories(data.categories);
      setPrepDraft(draftFromCategories(data.categories));
    }
  };

  useEffect(() => {
    void load();
  }, [slug]);

  const save = async () => {
    const parsed = Number.parseInt(draftMinutes, 10);
    if (
      !Number.isFinite(parsed) ||
      parsed < KITCHEN_OVERDUE_MINUTES_MIN ||
      parsed > KITCHEN_OVERDUE_MINUTES_MAX
    ) {
      toastError(
        "Invalid timing",
        `Enter ${KITCHEN_OVERDUE_MINUTES_MIN}–${KITCHEN_OVERDUE_MINUTES_MAX} minutes.`,
      );
      return;
    }

    setBusy(true);
    const res = await fetch("/api/hotel/fb/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug, kitchenOverdueMinutes: parsed }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      toastError("Save failed", data.error ?? "Try again.");
      return;
    }
    setSettings({
      kitchenOverdueMinutes: data.kitchenOverdueMinutes,
      kitchenOverdueMinutesConfigured: true,
    });
    setDraftMinutes(String(data.kitchenOverdueMinutes));
    toastSuccess("Kitchen timing saved");
  };

  const parsePrep = (raw: string): number | null => {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    const n = Number.parseInt(trimmed, 10);
    if (!Number.isFinite(n)) return NaN as unknown as number;
    return n;
  };

  const changedPrep = useMemo(() => {
    const changes: FbCategoryPrepRow[] = [];
    for (const c of categories) {
      const parsed = parsePrep(prepDraft[c.id] ?? "");
      if (Number.isNaN(parsed)) continue;
      if ((parsed ?? null) !== (c.prepMinutes ?? null)) {
        changes.push({ ...c, prepMinutes: parsed });
      }
    }
    return changes;
  }, [categories, prepDraft]);

  const savePrepTimes = async () => {
    for (const c of categories) {
      const parsed = parsePrep(prepDraft[c.id] ?? "");
      if (Number.isNaN(parsed)) {
        toastError("Invalid cook time", `${c.name}: enter ${CATEGORY_PREP_MIN}–${CATEGORY_PREP_MAX} minutes or leave blank.`);
        return;
      }
      if (parsed != null && (parsed < CATEGORY_PREP_MIN || parsed > CATEGORY_PREP_MAX)) {
        toastError("Invalid cook time", `${c.name}: enter ${CATEGORY_PREP_MIN}–${CATEGORY_PREP_MAX} minutes or leave blank.`);
        return;
      }
    }

    if (changedPrep.length === 0) {
      toastSuccess("No changes", "Cook times are already up to date.");
      return;
    }

    setSavingPrep(true);
    for (const c of changedPrep) {
      const res = await fetch("/api/hotel/fb/menu", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug,
          type: "category",
          id: c.id,
          outletId: c.outletId,
          name: c.name,
          prepMinutes: c.prepMinutes,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        setSavingPrep(false);
        toastError("Save failed", data.error ?? `Could not save ${c.name}.`);
        return;
      }
    }
    setSavingPrep(false);
    toastSuccess("Cook times saved", "Kitchen timing now uses your per-category targets.");
    await load();
  };

  const groupedCategories = useMemo(() => {
    const groups = new Map<string, FbCategoryPrepRow[]>();
    for (const c of categories) {
      const key = c.outletName || "Menu";
      const list = groups.get(key) ?? [];
      list.push(c);
      groups.set(key, list);
    }
    return [...groups.entries()];
  }, [categories]);

  return (
    <div className="w-full space-y-6 px-6 py-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Kitchen settings</h1>
        <p className="text-sm text-slate-500">
          Configure how long tickets can wait before turning red and triggering overdue alerts.
        </p>
      </div>

      <Link
        href={`/hms/${slug}/restaurant-bar/settings`}
        className="flex items-center justify-between gap-3 rounded-2xl border border-dashed border-slate-300 bg-slate-50/60 px-5 py-3 text-sm text-slate-600 transition-colors hover:border-blue-300 hover:bg-blue-50/40 hover:text-blue-700"
      >
        <span>Menu items, kitchen stations, and 86&apos;ing dishes are managed on Restaurant &amp; Bar → Settings.</span>
        <ArrowRight className="size-4 shrink-0" aria-hidden />
      </Link>

      <div className="max-w-lg rounded-2xl border border-slate-200 bg-white p-5">
        <label className="mb-1 block text-sm font-medium text-slate-900">
          Default order wait threshold (minutes)
        </label>
        <p className="mb-4 text-sm text-slate-500">
          Ticket cards shift from green → amber → red over this window. Used for any category without
          its own cook-time target below.
          {!settings.kitchenOverdueMinutesConfigured ? (
            <span className="mt-2 block text-amber-700">
              Not configured yet — using the default {DEFAULT_KITCHEN_OVERDUE_MINUTES} minutes.
            </span>
          ) : null}
        </p>

        <div className="flex flex-wrap items-end gap-3">
          <div className="w-32">
            <Input
              type="number"
              min={KITCHEN_OVERDUE_MINUTES_MIN}
              max={KITCHEN_OVERDUE_MINUTES_MAX}
              value={draftMinutes}
              onChange={(e) => setDraftMinutes(e.target.value)}
              disabled={!canEdit || busy}
              className="rounded-xl"
            />
          </div>
          <span className="pb-2 text-sm text-slate-500">minutes</span>
          {canEdit ? (
            <Button type="button" disabled={busy} onClick={() => void save()} className="gap-1.5">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              Save
            </Button>
          ) : (
            <p className="pb-2 text-sm text-slate-500">Only hotel admins can change this.</p>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-medium text-slate-900">Cook time by category</h2>
            <p className="mt-1 max-w-xl text-sm text-slate-500">
              Different food takes different time to cook. Set a target per category — a ticket uses
              the slowest category it contains. Leave blank to fall back to the default
              ({settings.kitchenOverdueMinutes} min).
            </p>
          </div>
          {canEdit ? (
            <Button
              type="button"
              disabled={savingPrep}
              onClick={() => void savePrepTimes()}
              className="gap-1.5"
            >
              {savingPrep ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              Save cook times
            </Button>
          ) : null}
        </div>

        {categories.length === 0 ? (
          <p className="mt-4 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
            No menu categories yet. Add categories in Restaurant &amp; Bar → Settings.
          </p>
        ) : (
          <div className="mt-4 space-y-5">
            {groupedCategories.map(([outletName, cats]) => (
              <div key={outletName}>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                  {outletName}
                </p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {cats.map((c) => (
                    <div
                      key={c.id}
                      className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 px-3 py-2"
                    >
                      <span className="truncate text-sm font-medium text-slate-800">{c.name}</span>
                      <div className="flex items-center gap-1.5">
                        <Input
                          type="number"
                          min={CATEGORY_PREP_MIN}
                          max={CATEGORY_PREP_MAX}
                          value={prepDraft[c.id] ?? ""}
                          placeholder={String(settings.kitchenOverdueMinutes)}
                          onChange={(e) =>
                            setPrepDraft((prev) => ({ ...prev, [c.id]: e.target.value }))
                          }
                          disabled={!canEdit || savingPrep}
                          className="h-9 w-20 rounded-lg text-right"
                        />
                        <span className="text-xs text-slate-500">min</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {!canEdit ? (
          <p className="mt-4 text-sm text-slate-500">Only hotel admins can change cook times.</p>
        ) : null}
      </div>
    </div>
  );
}
