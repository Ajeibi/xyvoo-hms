"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { ExternalLink, Loader2, Minus, Plus, Send, Trash2 } from "lucide-react";
import { formatPricingAmount } from "@/lib/hms/room-pricing";
import { useFbRealtime } from "@/hooks/useFbRealtime";
import { toastError, toastSuccess } from "@/lib/app-toast";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { isMenuItemSoldOut } from "@/lib/hms/fb-menu-availability";
import type { FbConfigPayload } from "@/lib/hms/load-fb-pages";

type FbConfig = {
  outlets: FbConfigPayload["outlets"];
  categories: FbConfigPayload["categories"];
  items: FbConfigPayload["items"];
  tables: FbConfigPayload["tables"];
};

type DraftLine = {
  menuItemId: string;
  outletId: string;
  name: string;
  price: number;
  quantity: number;
};

function pickDefaultOutletId(outlets: FbConfigPayload["outlets"]) {
  const restaurant = outlets.find((o) => o.outlet_type === "restaurant" && o.is_active);
  return restaurant?.id ?? outlets.find((o) => o.is_active)?.id ?? outlets[0]?.id ?? "";
}

function emptyDraft() {
  return { lines: [] as DraftLine[], rush: false };
}

export function FbPosClient({
  slug,
  tenantId,
  currency,
  initial,
}: {
  slug: string;
  tenantId: string;
  currency: string;
  initial: { config: FbConfigPayload };
}) {
  const [config, setConfig] = useState<FbConfig>({
    outlets: initial.config.outlets,
    categories: initial.config.categories,
    items: initial.config.items,
    tables: initial.config.tables,
  });
  const [outletId, setOutletId] = useState<string>(() => pickDefaultOutletId(initial.config.outlets));
  const [tableId, setTableId] = useState<string | null>(null);
  const [tabLabel, setTabLabel] = useState("");
  const [draft, setDraft] = useState(emptyDraft);
  const [sending, setSending] = useState(false);

  const settingsMenuUrl = `/hms/${slug}/settings#menu-setup`;

  const loadConfig = useCallback(async () => {
    const res = await fetch(`/api/hotel/fb/config?slug=${encodeURIComponent(slug)}&seed=0`);
    const cfg = await res.json();
    if (res.ok) {
      setConfig({
        outlets: cfg.outlets,
        categories: cfg.categories,
        items: cfg.items,
        tables: cfg.tables ?? [],
      });
      setOutletId((prev) => {
        if (prev && cfg.outlets?.some((o: { id: string }) => o.id === prev)) return prev;
        return pickDefaultOutletId(cfg.outlets ?? []);
      });
    }
  }, [slug]);

  useFbRealtime(tenantId, {
    onMenuChange: () => void loadConfig(),
  });

  const activeOutlets = useMemo(
    () => config.outlets.filter((o) => o.is_active),
    [config.outlets],
  );

  const outlet = activeOutlets.find((o) => o.id === outletId);
  const categories = useMemo(
    () => (config.categories ?? []).filter((c) => c.outlet_id === outletId && c.is_active),
    [config, outletId],
  );
  const allMenuItems = useMemo(
    () => (config.items ?? []).filter((i) => i.outlet_id === outletId),
    [config, outletId],
  );

  // Table (restaurant) and tab (bar) context are independent of which menu is
  // currently being browsed — a single ticket can mix items from every active
  // outlet, so both controls stay available whenever that outlet type exists.
  const restaurantOutletIds = useMemo(
    () => activeOutlets.filter((o) => o.outlet_type === "restaurant").map((o) => o.id),
    [activeOutlets],
  );
  const hasRestaurantOutlet = restaurantOutletIds.length > 0;
  const hasBarOutlet = activeOutlets.some((o) => o.outlet_type === "bar");
  const outletTables = useMemo(
    () => (config.tables ?? []).filter((t) => restaurantOutletIds.includes(t.outlet_id)),
    [config.tables, restaurantOutletIds],
  );

  const draftSubtotal = useMemo(
    () => draft.lines.reduce((sum, line) => sum + line.price * line.quantity, 0),
    [draft.lines],
  );

  const draftQtyByItemId = useMemo(
    () => new Map(draft.lines.map((line) => [line.menuItemId, line.quantity])),
    [draft.lines],
  );

  const outletNameById = useMemo(
    () => new Map(config.outlets.map((o) => [o.id, o.name])),
    [config.outlets],
  );

  /** Switches which menu is being browsed. The ticket in progress (and any
   * table/tab already chosen) is untouched — items from every outlet the
   * tenant has can land in the same order. */
  const switchOutlet = (id: string) => {
    setOutletId(id);
  };

  const addItem = (menuItemId: string) => {
    const menuItem = allMenuItems.find((i) => i.id === menuItemId);
    if (!menuItem) return;
    if (isMenuItemSoldOut(menuItem)) {
      toastError("Sold out", `${menuItem.name} is off the menu until marked back in stock.`);
      return;
    }
    setDraft((prev) => {
      const existing = prev.lines.find((line) => line.menuItemId === menuItemId);
      if (existing) {
        return {
          ...prev,
          lines: prev.lines.map((line) =>
            line.menuItemId === menuItemId
              ? { ...line, quantity: line.quantity + 1 }
              : line,
          ),
        };
      }
      return {
        ...prev,
        lines: [
          ...prev.lines,
          {
            menuItemId,
            outletId: menuItem.outlet_id,
            name: menuItem.name,
            price: menuItem.price,
            quantity: 1,
          },
        ],
      };
    });
  };

  const adjustDraftQuantity = (menuItemId: string, delta: number) => {
    setDraft((prev) => {
      const line = prev.lines.find((l) => l.menuItemId === menuItemId);
      if (!line) return prev;
      const nextQty = line.quantity + delta;
      if (nextQty <= 0) {
        return { ...prev, lines: prev.lines.filter((l) => l.menuItemId !== menuItemId) };
      }
      return {
        ...prev,
        lines: prev.lines.map((l) =>
          l.menuItemId === menuItemId ? { ...l, quantity: nextQty } : l,
        ),
      };
    });
  };

  const removeDraftLine = (menuItemId: string) => {
    setDraft((prev) => ({
      ...prev,
      lines: prev.lines.filter((l) => l.menuItemId !== menuItemId),
    }));
  };

  const sendToKitchen = async () => {
    if (!draft.lines.length || sending) return;

    // The order needs one "home" outlet even when the ticket mixes menus —
    // use whichever outlet the first item came from rather than whichever
    // menu happens to be on screen right now.
    const primaryOutletId = draft.lines[0]?.outletId ?? outletId;

    setSending(true);
    try {
      const res = await fetch("/api/hotel/fb/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug,
          outletId: primaryOutletId,
          tableId: hasRestaurantOutlet ? tableId : null,
          tabLabel: hasBarOutlet ? tabLabel || null : null,
          items: draft.lines.map((line) => ({
            menuItemId: line.menuItemId,
            quantity: line.quantity,
          })),
          rush: draft.rush,
          sendToKitchen: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toastError("Send failed", data.error ?? "Try again.");
        return;
      }
      toastSuccess("Sent to kitchen", data.order?.order_number ? `#${data.order.order_number}` : undefined);
      setDraft(emptyDraft());
      setTableId(null);
      setTabLabel("");
    } finally {
      setSending(false);
    }
  };

  const clearDraft = () => {
    setDraft(emptyDraft());
    setTableId(null);
    setTabLabel("");
  };

  const hasMenu = allMenuItems.length > 0;
  const hasDraft = draft.lines.length > 0;

  return (
    <div className="w-full space-y-4 px-6 py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">POS</h1>
          <p className="text-sm text-slate-500">Build the ticket locally, then send to kitchen.</p>
        </div>
        {activeOutlets.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {activeOutlets.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => switchOutlet(o.id)}
                className={cn(
                  "rounded-xl px-4 py-2 text-sm font-medium transition-colors",
                  outletId === o.id
                    ? "bg-blue-600 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200",
                )}
              >
                {o.name}
              </button>
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-500">No menu sections configured yet.</p>
        )}
      </div>

      {activeOutlets.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-6 py-12 text-center">
          <p className="text-sm text-slate-600">Add your first menu section (Bar, Restaurant, etc.) before taking orders.</p>
          <Button asChild className="mt-4 gap-2">
            <Link href={settingsMenuUrl}>
              <ExternalLink className="h-4 w-4" />
              Set up menu sections
            </Link>
          </Button>
        </div>
      ) : null}

      {outlet && !hasMenu ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-6 py-10 text-center">
          <p className="text-sm font-medium text-slate-800">No menu for {outlet.name} yet</p>
          <p className="mt-1 text-sm text-slate-500">
            Add categories and items for this section in Settings before staff can take orders here.
          </p>
          <Button asChild className="mt-4 gap-2">
            <Link href={settingsMenuUrl}>
              <ExternalLink className="h-4 w-4" />
              Set up {outlet.name} menu
            </Link>
          </Button>
        </div>
      ) : null}

      {hasBarOutlet ? (
        <div className="max-w-xs">
          <label className="mb-1 block text-xs font-medium text-slate-500">Tab name</label>
          <input
            value={tabLabel}
            onChange={(e) => setTabLabel(e.target.value)}
            placeholder="e.g. Bar tab"
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
        </div>
      ) : null}

      {hasRestaurantOutlet ? (
        <div className="max-w-md space-y-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">
              Table <span className="font-normal text-slate-400">(optional — for floor service)</span>
            </label>
            {outletTables.length > 0 ? (
              <select
                value={tableId ?? ""}
                onChange={(e) => setTableId(e.target.value || null)}
                className="w-full max-w-xs rounded-lg border border-slate-200 px-3 py-2 text-sm"
              >
                <option value="">No table</option>
                {outletTables.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.table_code} ({t.covers} covers)
                  </option>
                ))}
              </select>
            ) : (
              <p className="text-sm text-slate-500">
                No tables set up yet.{" "}
                <Link
                  href={`${settingsMenuUrl}#restaurant-tables`}
                  className="font-medium text-blue-600 underline"
                >
                  Add tables in Settings
                </Link>{" "}
                to track which seat an order is for — the kitchen only sees items.
              </p>
            )}
          </div>
        </div>
      ) : null}

      {outlet && hasMenu ? (
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start lg:gap-4">
        <div className="min-w-0 space-y-4">
          {categories.map((cat) => {
            const catItems = allMenuItems.filter((i) => i.category_id === cat.id);
            if (!catItems.length) return null;
            return (
              <div key={cat.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                <h2 className="mb-3 text-sm font-semibold text-slate-800">{cat.name}</h2>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {catItems.map((item) => {
                    const qty = draftQtyByItemId.get(item.id) ?? 0;
                    const inDraft = qty > 0;
                    const soldOut = isMenuItemSoldOut(item);
                    return (
                      <button
                        key={item.id}
                        type="button"
                        disabled={sending || soldOut}
                        onClick={() => addItem(item.id)}
                        className={cn(
                          "relative rounded-xl border px-3 py-3 text-left transition-colors disabled:cursor-not-allowed",
                          soldOut
                            ? "border-slate-200 bg-slate-100 opacity-60"
                            : inDraft
                              ? "border-green-500 bg-green-50 ring-2 ring-green-500/35 shadow-sm hover:bg-green-100/80 disabled:opacity-60"
                              : "border-slate-200 bg-slate-50 hover:border-blue-300 hover:bg-blue-50 disabled:opacity-60",
                        )}
                      >
                        {soldOut ? (
                          <span className="absolute right-2 top-2 rounded-full bg-slate-500 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                            Sold out
                          </span>
                        ) : inDraft ? (
                          <span className="absolute right-2 top-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-green-600 px-1 text-[10px] font-bold text-white">
                            {qty}
                          </span>
                        ) : null}
                        <p
                          className={cn(
                            "pr-6 text-sm font-medium",
                            soldOut
                              ? "text-slate-400 line-through"
                              : inDraft
                                ? "text-green-950"
                                : "text-slate-900",
                          )}
                        >
                          {item.name}
                        </p>
                        <p
                          className={cn(
                            "mt-1 text-xs",
                            soldOut ? "text-slate-400" : inDraft ? "text-green-800/70" : "text-slate-500",
                          )}
                        >
                          {formatPricingAmount(item.price, currency)}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        <aside className="mt-4 lg:sticky lg:top-20 lg:mt-0 lg:self-start">
          <div
            className={cn(
              "rounded-2xl border bg-white p-4 shadow-sm transition-colors",
              draft.rush ? "border-2 border-red-500" : "border-slate-200",
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-slate-800">Current order</h2>
              {draft.rush ? (
                <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-red-700">
                  Rush
                </span>
              ) : null}
            </div>
            {hasDraft ? (
              <div className="mt-3 space-y-3">
                <p className="text-xs text-slate-500">Draft — not sent yet</p>
                <ul className="space-y-3 text-sm">
                  {draft.lines.map((line) => (
                    <li
                      key={line.menuItemId}
                      className="rounded-lg border border-slate-100 bg-slate-50/80 p-2.5"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-slate-900">{line.name}</p>
                          {activeOutlets.length > 1 ? (
                            <p className="text-[11px] uppercase tracking-wide text-slate-400">
                              {outletNameById.get(line.outletId) ?? ""}
                            </p>
                          ) : null}
                        </div>
                        <p className="shrink-0 tabular-nums text-slate-700">
                          {formatPricingAmount(line.price * line.quantity, currency)}
                        </p>
                      </div>
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            disabled={sending}
                            onClick={() => adjustDraftQuantity(line.menuItemId, -1)}
                            className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 disabled:opacity-50"
                            aria-label={`Decrease ${line.name}`}
                          >
                            <Minus className="h-3.5 w-3.5" />
                          </button>
                          <span className="w-8 text-center text-sm font-semibold tabular-nums">
                            {line.quantity}
                          </span>
                          <button
                            type="button"
                            disabled={sending}
                            onClick={() => adjustDraftQuantity(line.menuItemId, 1)}
                            className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 disabled:opacity-50"
                            aria-label={`Increase ${line.name}`}
                          >
                            <Plus className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        <button
                          type="button"
                          disabled={sending}
                          onClick={() => removeDraftLine(line.menuItemId)}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-red-500 hover:bg-red-50 disabled:opacity-50"
                          aria-label={`Remove ${line.name}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
                <p className="text-lg font-bold tabular-nums">
                  {formatPricingAmount(draftSubtotal, currency)}
                </p>
                <div className="flex flex-col gap-2">
                  <Button
                    type="button"
                    disabled={sending}
                    onClick={() => void sendToKitchen()}
                    className="w-full gap-2"
                  >
                    {sending ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                    {sending ? "Sending..." : "Send to kitchen"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={sending}
                    onClick={() => setDraft((prev) => ({ ...prev, rush: !prev.rush }))}
                  >
                    {draft.rush ? "Remove rush" : "Mark rush"}
                  </Button>
                  <Button type="button" variant="secondary" disabled={sending} onClick={clearDraft}>
                    Clear ticket
                  </Button>
                </div>
              </div>
            ) : (
              <p className="mt-4 text-sm text-slate-500">Tap menu items to build a ticket, then send to kitchen.</p>
            )}
          </div>
        </aside>
      </div>
      ) : null}
    </div>
  );
}
