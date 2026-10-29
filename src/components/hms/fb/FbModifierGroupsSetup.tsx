"use client";

import { useMemo, useState } from "react";
import { ListChecks, Loader2, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { describeModifierRule, modifierLabel } from "@/lib/hms/fb-modifier-rules";
import type {
  FbMenuCategoryRow,
  FbMenuItemModifierLink,
  FbMenuItemRow,
  FbModifierGroupRow,
  FbOutletRow,
} from "@/lib/hms/fb-types";
import { formatPricingAmount } from "@/lib/hms/room-pricing";
import { useFbRealtime } from "@/hooks/useFbRealtime";
import { toastError, toastSuccess } from "@/lib/app-toast";
import { cn } from "@/lib/utils";
import { HmsAlert, HmsCard, HmsEmptyState, HmsField, HmsPill, hmsButton, hmsInput } from "@/components/hms/hms-ui";

type DraftOption = { key: string; id?: string; name: string; priceDelta: string; isActive: boolean };

type DraftGroup = {
  id?: string;
  name: string;
  minSelect: number;
  maxSelect: number | null;
  isActive: boolean;
  options: DraftOption[];
  menuItemIds: Set<string>;
};

let optionKeySeq = 0;
const nextOptionKey = () => `opt-${(optionKeySeq += 1)}`;

function blankOption(): DraftOption {
  return { key: nextOptionKey(), name: "", priceDelta: "", isActive: true };
}

function draftFromGroup(group: FbModifierGroupRow, links: FbMenuItemModifierLink[]): DraftGroup {
  return {
    id: group.id,
    name: group.name,
    minSelect: group.min_select,
    maxSelect: group.max_select,
    isActive: group.is_active,
    options: group.options.map((o) => ({
      key: nextOptionKey(),
      id: o.id,
      name: o.name,
      priceDelta: o.price_delta ? String(o.price_delta) : "",
      isActive: o.is_active,
    })),
    menuItemIds: new Set(links.filter((l) => l.group_id === group.id).map((l) => l.menu_item_id)),
  };
}

const MIN_CHOICES = [0, 1, 2, 3, 4, 5];
const MAX_CHOICES = [1, 2, 3, 4, 5, 6, 8, 10];

export function FbModifierGroupsSetup({
  slug,
  tenantId,
  currency,
  outlets: initialOutlets,
  categories: initialCategories,
  items: initialItems,
  initialGroups,
  initialLinks,
}: {
  slug: string;
  tenantId: string;
  currency: string;
  outlets: FbOutletRow[];
  categories: FbMenuCategoryRow[];
  items: FbMenuItemRow[];
  initialGroups: FbModifierGroupRow[];
  initialLinks: FbMenuItemModifierLink[];
}) {
  const [menu, setMenu] = useState({
    outlets: initialOutlets,
    categories: initialCategories,
    items: initialItems,
  });
  const { outlets, categories, items } = menu;

  // Items added or renamed in the menu editor above show up here without a reload.
  useFbRealtime(tenantId, {
    onMenuChange: () => {
      void fetch(`/api/hotel/fb/config?slug=${encodeURIComponent(slug)}&seed=0`)
        .then((res) => (res.ok ? res.json() : null))
        .then((cfg) => {
          if (!cfg) return;
          setMenu({ outlets: cfg.outlets ?? [], categories: cfg.categories ?? [], items: cfg.items ?? [] });
          setLinks(cfg.modifierLinks ?? []);
        });
    },
  });

  const [groups, setGroups] = useState(initialGroups);
  const [links, setLinks] = useState(initialLinks);
  const [draft, setDraft] = useState<DraftGroup | null>(null);
  const [itemQuery, setItemQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState("");

  const money = (n: number) => formatPricingAmount(n, currency);

  const linkCountByGroup = useMemo(() => {
    const map = new Map<string, number>();
    for (const l of links) map.set(l.group_id, (map.get(l.group_id) ?? 0) + 1);
    return map;
  }, [links]);

  // Menu items grouped by section, then category, for the "used on" checklist.
  const itemTree = useMemo(() => {
    const q = itemQuery.trim().toLowerCase();
    return outlets
      .map((outlet) => {
        const outletCats = categories.filter((c) => c.outlet_id === outlet.id);
        const sections = [
          ...outletCats.map((c) => ({ id: c.id, name: c.name })),
          { id: "none", name: "No category" },
        ]
          .map((cat) => ({
            ...cat,
            items: items.filter(
              (i) =>
                i.outlet_id === outlet.id &&
                (cat.id === "none" ? !outletCats.some((c) => c.id === i.category_id) : i.category_id === cat.id) &&
                (!q || i.name.toLowerCase().includes(q)),
            ),
          }))
          .filter((cat) => cat.items.length > 0);
        return { outlet, sections };
      })
      .filter((o) => o.sections.length > 0);
  }, [outlets, categories, items, itemQuery]);

  const startNew = () => {
    setDraft({
      name: "",
      minSelect: 0,
      maxSelect: 1,
      isActive: true,
      options: [blankOption(), blankOption()],
      menuItemIds: new Set(),
    });
    setItemQuery("");
    setConfirmDelete(false);
    setError("");
  };

  const startEdit = (group: FbModifierGroupRow) => {
    setDraft(draftFromGroup(group, links));
    setItemQuery("");
    setConfirmDelete(false);
    setError("");
  };

  const cancel = () => {
    setDraft(null);
    setError("");
    setConfirmDelete(false);
  };

  const patchDraft = (patch: Partial<DraftGroup>) => setDraft((d) => (d ? { ...d, ...patch } : d));
  const patchOption = (key: string, patch: Partial<DraftOption>) =>
    setDraft((d) => (d ? { ...d, options: d.options.map((o) => (o.key === key ? { ...o, ...patch } : o)) } : d));

  const toggleItems = (ids: string[], on: boolean) =>
    setDraft((d) => {
      if (!d) return d;
      const next = new Set(d.menuItemIds);
      for (const id of ids) {
        if (on) next.add(id);
        else next.delete(id);
      }
      return { ...d, menuItemIds: next };
    });

  const applySetup = (data: { groups?: FbModifierGroupRow[]; links?: FbMenuItemModifierLink[] }) => {
    if (data.groups) setGroups(data.groups);
    if (data.links) setLinks(data.links);
  };

  const save = async () => {
    if (!draft) return;
    const options = draft.options.filter((o) => o.name.trim() || o.id);
    const badPrice = options.find((o) => o.priceDelta.trim() && !Number.isFinite(Number(o.priceDelta)));
    if (!draft.name.trim()) return setError("Give the group a name, such as Doneness or Sides.");
    if (!options.length) return setError("Add at least one choice.");
    if (options.some((o) => !o.name.trim())) return setError("Every choice needs a name.");
    if (badPrice) return setError(`Check the extra price for ${badPrice.name}.`);

    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/hotel/fb/modifier-groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug,
          id: draft.id,
          name: draft.name,
          minSelect: draft.minSelect,
          maxSelect: draft.maxSelect,
          isActive: draft.isActive,
          options: options.map((o) => ({
            id: o.id,
            name: o.name,
            priceDelta: o.priceDelta.trim() ? Number(o.priceDelta) : 0,
            isActive: o.isActive,
          })),
          menuItemIds: [...draft.menuItemIds],
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not save. Try again.");
        return;
      }
      applySetup(data);
      toastSuccess(draft.id ? "Choices saved" : "Choice group added", draft.name.trim());
      setDraft(null);
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!draft?.id) return;
    setSaving(true);
    try {
      const res = await fetch(
        `/api/hotel/fb/modifier-groups?slug=${encodeURIComponent(slug)}&id=${draft.id}`,
        { method: "DELETE" },
      );
      const data = await res.json();
      if (!res.ok) {
        toastError("Could not delete", data.error ?? "Try again.");
        return;
      }
      applySetup(data);
      toastSuccess("Choice group deleted", "Past orders keep the choices they were made with.");
      setDraft(null);
    } finally {
      setSaving(false);
      setConfirmDelete(false);
    }
  };

  const editor = draft ? (
    <div className="space-y-5 rounded-2xl border border-orange-200 bg-orange-50/30 p-4 sm:p-5">
      <div className="grid gap-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <HmsField id="fb-mod-name" label="Group name" hint="What staff see, e.g. Doneness, Sides, Extras.">
          <input
            id="fb-mod-name"
            value={draft.name}
            maxLength={60}
            onChange={(e) => patchDraft({ name: e.target.value })}
            aria-describedby="fb-mod-name-hint"
            className={hmsInput}
            autoFocus
          />
        </HmsField>
        <HmsField id="fb-mod-min" label="Guests must choose">
          <select
            id="fb-mod-min"
            value={draft.minSelect}
            onChange={(e) => {
              const min = Number(e.target.value);
              patchDraft({
                minSelect: min,
                maxSelect: draft.maxSelect != null && draft.maxSelect < min ? min : draft.maxSelect,
              });
            }}
            className={hmsInput}
          >
            {MIN_CHOICES.map((n) => (
              <option key={n} value={n}>
                {n === 0 ? "Nothing (optional)" : `At least ${n}`}
              </option>
            ))}
          </select>
        </HmsField>
        <HmsField id="fb-mod-max" label="Most they can choose">
          <select
            id="fb-mod-max"
            value={draft.maxSelect ?? ""}
            onChange={(e) => patchDraft({ maxSelect: e.target.value ? Number(e.target.value) : null })}
            className={hmsInput}
          >
            {MAX_CHOICES.filter((n) => n >= Math.max(1, draft.minSelect)).map((n) => (
              <option key={n} value={n}>
                {n === 1 ? "1 (pick one)" : n}
              </option>
            ))}
            <option value="">No limit</option>
          </select>
        </HmsField>
      </div>
      <p className="text-sm text-slate-700">
        On the POS this reads: <span className="font-semibold">{describeModifierRule({ min_select: draft.minSelect, max_select: draft.maxSelect })}</span>
      </p>

      <fieldset>
        <legend className="mb-2 text-sm font-medium text-slate-800">Choices</legend>
        <ul className="space-y-2">
          {draft.options.map((o, index) => (
            <li key={o.key} className="flex flex-wrap items-end gap-2">
              <div className="min-w-0 flex-1 basis-48">
                <label htmlFor={`${o.key}-name`} className="sr-only">
                  Choice {index + 1} name
                </label>
                <input
                  id={`${o.key}-name`}
                  value={o.name}
                  maxLength={60}
                  placeholder={index === 0 ? "e.g. Well done" : "Another choice"}
                  onChange={(e) => patchOption(o.key, { name: e.target.value })}
                  className={hmsInput}
                />
              </div>
              <div className="w-36">
                <label htmlFor={`${o.key}-price`} className="mb-1 block text-xs text-slate-600">
                  Extra price
                </label>
                <input
                  id={`${o.key}-price`}
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  value={o.priceDelta}
                  placeholder="0"
                  onChange={(e) => patchOption(o.key, { priceDelta: e.target.value })}
                  className={hmsInput}
                />
              </div>
              {o.id ? (
                <label className="flex min-h-11 items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={o.isActive}
                    onChange={(e) => patchOption(o.key, { isActive: e.target.checked })}
                    className="h-4 w-4 rounded border-slate-300"
                  />
                  Offered
                </label>
              ) : null}
              <button
                type="button"
                onClick={() => patchDraft({ options: draft.options.filter((x) => x.key !== o.key) })}
                className={cn(hmsButton.danger, "min-h-11")}
                aria-label={`Remove choice ${o.name || index + 1}`}
              >
                <Trash2 className="h-4 w-4" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={() => patchDraft({ options: [...draft.options, blankOption()] })}
          className={cn(hmsButton.small, "mt-2")}
        >
          <Plus className="h-4 w-4" aria-hidden />
          Add a choice
        </button>
        <p className="mt-2 text-xs text-slate-600">
          Use a minus price for a cheaper choice, such as &ldquo;Half portion&rdquo;. Removing a choice doesn&rsquo;t change past orders.
        </p>
      </fieldset>

      <fieldset>
        <legend className="mb-1 text-sm font-medium text-slate-800">
          Used on these menu items <span className="font-normal text-slate-600">({draft.menuItemIds.size} chosen)</span>
        </legend>
        <div className="relative mb-2 max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
          <label htmlFor="fb-mod-item-search" className="sr-only">
            Find a menu item
          </label>
          <input
            id="fb-mod-item-search"
            value={itemQuery}
            onChange={(e) => setItemQuery(e.target.value)}
            placeholder="Find a menu item"
            className={cn(hmsInput, "pl-9")}
          />
        </div>
        {itemTree.length === 0 ? (
          <p className="text-sm text-slate-600">{items.length ? "No menu items match." : "Add menu items above first."}</p>
        ) : (
          <div className="max-h-80 space-y-4 overflow-y-auto rounded-xl border border-slate-200 bg-white p-3">
            {itemTree.map(({ outlet, sections }) => (
              <div key={outlet.id}>
                {outlets.length > 1 ? (
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-600">{outlet.name}</p>
                ) : null}
                {sections.map((cat) => {
                  const ids = cat.items.map((i) => i.id);
                  const allOn = ids.every((id) => draft.menuItemIds.has(id));
                  return (
                    <div key={cat.id} className="mb-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium text-slate-900">{cat.name}</p>
                        <button type="button" onClick={() => toggleItems(ids, !allOn)} className={hmsButton.quiet}>
                          {allOn ? "Clear" : "Choose all"}
                        </button>
                      </div>
                      <ul className="grid gap-1 sm:grid-cols-2">
                        {cat.items.map((item) => (
                          <li key={item.id}>
                            <label className="flex min-h-10 cursor-pointer items-center gap-2 rounded-lg px-2 text-sm text-slate-800 hover:bg-slate-50">
                              <input
                                type="checkbox"
                                checked={draft.menuItemIds.has(item.id)}
                                onChange={(e) => toggleItems([item.id], e.target.checked)}
                                className="h-4 w-4 rounded border-slate-300"
                              />
                              <span className="min-w-0 flex-1 truncate">{item.name}</span>
                              <span className="tabular-nums text-slate-600">{money(item.price)}</span>
                            </label>
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </fieldset>

      <label className="flex items-center gap-2 text-sm text-slate-800">
        <input
          type="checkbox"
          checked={draft.isActive}
          onChange={(e) => patchDraft({ isActive: e.target.checked })}
          className="h-4 w-4 rounded border-slate-300"
        />
        Offer this group on the POS
      </label>

      <HmsAlert message={error} />

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" disabled={saving} onClick={() => void save()} className={hmsButton.primary}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
          {draft.id ? "Save choices" : "Add choice group"}
        </button>
        <button type="button" disabled={saving} onClick={cancel} className={hmsButton.secondary}>
          Cancel
        </button>
        {draft.id ? (
          confirmDelete ? (
            <span className="flex flex-wrap items-center gap-2 text-sm text-slate-800">
              Delete {draft.name || "this group"}?
              <button type="button" disabled={saving} onClick={() => void remove()} className={cn(hmsButton.danger, "border border-red-200")}>
                Yes, delete
              </button>
              <button type="button" disabled={saving} onClick={() => setConfirmDelete(false)} className={hmsButton.quiet}>
                Keep it
              </button>
            </span>
          ) : (
            <button type="button" disabled={saving} onClick={() => setConfirmDelete(true)} className={cn(hmsButton.danger, "ml-auto")}>
              <Trash2 className="h-4 w-4" aria-hidden />
              Delete group
            </button>
          )
        ) : null}
      </div>
    </div>
  ) : null;

  return (
    <HmsCard
      id="menu-choices"
      icon={ListChecks}
      meaning="food"
      title="Choices on menu items"
      description="Let staff record how a dish should be made, such as doneness, sides or extras. The kitchen sees every choice on the ticket, and extras are added to the bill."
      actions={
        !draft ? (
          <button type="button" onClick={startNew} className={hmsButton.primary}>
            <Plus className="h-4 w-4" aria-hidden />
            Add choice group
          </button>
        ) : (
          <button type="button" onClick={cancel} className={hmsButton.quiet} aria-label="Close the editor">
            <X className="h-4 w-4" aria-hidden />
          </button>
        )
      }
      className="mt-6 scroll-mt-24"
    >
      {draft && !draft.id ? editor : null}
      {groups.length === 0 && !draft ? (
        <HmsEmptyState
          art="box"
          meaning="food"
          title="No choices yet"
          description="Add a group such as Doneness (Rare, Medium, Well done) and choose which dishes use it."
        />
      ) : (
        <ul className={cn("space-y-2", draft && !draft.id && groups.length ? "mt-4" : "")}>
          {groups.map((group) =>
            draft?.id === group.id ? (
              <li key={group.id}>{editor}</li>
            ) : (
              <li
                key={group.id}
                className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 font-medium text-slate-900">
                    {group.name}
                    <HmsPill tone="slate">{describeModifierRule(group)}</HmsPill>
                    {!group.is_active ? <HmsPill tone="amber">Not offered</HmsPill> : null}
                  </p>
                  <p className="mt-1 text-sm text-slate-700">
                    {group.options
                      .filter((o) => o.is_active)
                      .map((o) => modifierLabel(o, money))
                      .join(" · ") || "No choices offered"}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-600">
                    Used on {linkCountByGroup.get(group.id) ?? 0} menu item
                    {(linkCountByGroup.get(group.id) ?? 0) === 1 ? "" : "s"}
                  </p>
                </div>
                <button type="button" disabled={Boolean(draft)} onClick={() => startEdit(group)} className={hmsButton.small}>
                  <Pencil className="h-4 w-4" aria-hidden />
                  Edit
                  <span className="sr-only"> {group.name}</span>
                </button>
              </li>
            ),
          )}
        </ul>
      )}
    </HmsCard>
  );
}
