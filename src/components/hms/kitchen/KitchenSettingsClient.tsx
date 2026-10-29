"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, ChefHat, Loader2, Timer } from "lucide-react";
import type { FbRoleCapabilities } from "@/lib/hms/fb-rbac";
import type { FbCategoryPrepRow } from "@/lib/hms/fb-menu";
import {
  DEFAULT_KITCHEN_OVERDUE_MINUTES,
  KITCHEN_OVERDUE_MINUTES_MAX,
  KITCHEN_OVERDUE_MINUTES_MIN,
  type TenantFbSettings,
} from "@/lib/hms/fb-settings";
import { HmsCard, HmsEmptyState, HmsPageHeader, hmsButton, hmsInput } from "@/components/hms/hms-ui";
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
  const [settings, setSettings] = useState<Pick<TenantFbSettings, "kitchenOverdueMinutes" | "kitchenOverdueMinutesConfigured">>(initial);
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
    <div className="w-full max-w-5xl space-y-6 px-4 py-6 sm:px-6">
      <HmsPageHeader
        eyebrow="Kitchen"
        meaning="food"
        title="Kitchen settings"
        description="Choose how long a ticket can wait before it turns red and the overdue alert sounds."
      />

      <Link
        href={`/hms/${slug}/restaurant-bar/settings`}
        className="flex items-center justify-between gap-3 rounded-2xl bg-orange-50 px-5 py-3 text-sm text-slate-800 transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
      >
        <span>Menu items, kitchen stations and marking dishes sold out are managed in Restaurant &amp; bar settings.</span>
        <ArrowRight className="size-4 shrink-0 text-orange-600" aria-hidden />
      </Link>

      <HmsCard
        id="kitchen-wait-threshold"
        title="Default wait before a ticket is overdue"
        description="Ticket cards turn from green to amber to red over this time. Used for any category without its own cook time below."
        icon={Timer}
        meaning="food"
        className="max-w-2xl"
      >
        {!settings.kitchenOverdueMinutesConfigured ? (
          <p className="mb-4 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Not set yet, so the default of {DEFAULT_KITCHEN_OVERDUE_MINUTES} minutes is being used.
          </p>
        ) : null}

        <div className="flex flex-wrap items-end gap-3">
          <div className="w-36">
            <label htmlFor="kitchen-overdue-minutes" className="mb-1 block text-sm font-medium text-slate-800">
              Minutes
            </label>
            <input
              id="kitchen-overdue-minutes"
              type="number"
              min={KITCHEN_OVERDUE_MINUTES_MIN}
              max={KITCHEN_OVERDUE_MINUTES_MAX}
              value={draftMinutes}
              onChange={(e) => setDraftMinutes(e.target.value)}
              disabled={!canEdit || busy}
              aria-describedby={!canEdit ? "kitchen-settings-admin-only" : undefined}
              className={hmsInput}
            />
          </div>
          {canEdit ? (
            <button type="button" disabled={busy} onClick={() => void save()} className={hmsButton.primary}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              Save
            </button>
          ) : (
            <p id="kitchen-settings-admin-only" className="pb-2.5 text-sm text-slate-600">Only hotel admins can change this.</p>
          )}
        </div>
      </HmsCard>

      <HmsCard
        id="kitchen-cook-times"
        title="Cook time by category"
        description={`Different food takes different time to cook. Set a target for each category; a ticket uses the slowest category on it. Leave blank to use the default (${settings.kitchenOverdueMinutes} minutes).`}
        icon={ChefHat}
        meaning="food"
        actions={
          canEdit && categories.length > 0 ? (
            <button type="button" disabled={savingPrep} onClick={() => void savePrepTimes()} className={hmsButton.primary}>
              {savingPrep ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              Save cook times
            </button>
          ) : null
        }
      >
        {categories.length === 0 ? (
          <HmsEmptyState
            bare
            art="box"
            meaning="food"
            title="No menu categories yet"
            description="Add categories in Restaurant & bar settings, then set their cook times here."
          />
        ) : (
          <div className="space-y-5">
            {groupedCategories.map(([outletName, cats]) => (
              <div key={outletName}>
                <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-800">
                  <span aria-hidden className="h-2 w-2 rounded-full bg-orange-500" />
                  {outletName}
                </h3>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {cats.map((c) => (
                    <div
                      key={c.id}
                      className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 px-3 py-2"
                    >
                      <label htmlFor={`kitchen-prep-${c.id}`} className="truncate text-sm font-medium text-slate-800">
                        {c.name}
                      </label>
                      <div className="flex items-center gap-1.5">
                        <input
                          id={`kitchen-prep-${c.id}`}
                          type="number"
                          min={CATEGORY_PREP_MIN}
                          max={CATEGORY_PREP_MAX}
                          value={prepDraft[c.id] ?? ""}
                          placeholder={String(settings.kitchenOverdueMinutes)}
                          onChange={(e) =>
                            setPrepDraft((prev) => ({ ...prev, [c.id]: e.target.value }))
                          }
                          disabled={!canEdit || savingPrep}
                          className="h-10 w-20 rounded-lg border border-slate-300 bg-white px-2 text-right text-sm text-slate-900 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-xyvoo-blue disabled:bg-slate-50"
                        />
                        <span className="text-sm text-slate-600">min</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {!canEdit ? (
          <p className="mt-4 text-sm text-slate-600">Only hotel admins can change cook times.</p>
        ) : null}
      </HmsCard>
    </div>
  );
}
