"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { Flame, Loader2, Minus, Plus, Receipt, Send, Settings, Trash2 } from "lucide-react";
import { formatPricingAmount } from "@/lib/hms/room-pricing";
import { useFbRealtime } from "@/hooks/useFbRealtime";
import { toastError, toastSuccess } from "@/lib/app-toast";
import { cn } from "@/lib/utils";
import { HmsEmptyState, HmsField, HmsPageHeader, HmsPill, hmsButton, hmsInput } from "@/components/hms/hms-ui";

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

  const settingsMenuUrl = `/hms/${slug}/restaurant-bar/settings#menu-setup`;

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
    <div className="w-full space-y-4 px-4 py-6 sm:px-6">
      <HmsPageHeader
        eyebrow="Restaurant & bar"
        meaning="food"
        title="POS"
        description="Tap items to build the ticket, then send it to the kitchen."
        actions={
          activeOutlets.length > 0 ? (
            <div role="group" aria-label="Menu to show" className="flex flex-wrap gap-2">
              {activeOutlets.map((o) => {
                const on = outletId === o.id;
                return (
                  <button
                    key={o.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => switchOutlet(o.id)}
                    className={cn(
                      "min-h-11 rounded-full border px-4 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1",
                      on
                        ? "border-orange-600 bg-orange-50 text-orange-900"
                        : "border-slate-200 bg-white text-slate-700 hover:border-orange-300 hover:bg-slate-50",
                    )}
                  >
                    {o.name}
                  </button>
                );
              })}
            </div>
          ) : null
        }
      />

      {activeOutlets.length === 0 ? (
        <HmsEmptyState
          art="box"
          meaning="food"
          title="No menu sections yet"
          description="Add your first menu section, such as Bar or Restaurant, before taking orders."
          action={
            <Link href={settingsMenuUrl} className={hmsButton.primary}>
              <Settings className="h-4 w-4" aria-hidden />
              Set up menu sections
            </Link>
          }
        />
      ) : null}

      {outlet && !hasMenu ? (
        <HmsEmptyState
          art="box"
          meaning="food"
          title={`No menu for ${outlet.name} yet`}
          description="Add categories and items for this section in Settings so staff can take orders here."
          action={
            <Link href={settingsMenuUrl} className={hmsButton.primary}>
              <Settings className="h-4 w-4" aria-hidden />
              Set up {outlet.name} menu
            </Link>
          }
        />
      ) : null}

      {hasBarOutlet || hasRestaurantOutlet ? (
        <div className="flex flex-wrap items-start gap-4 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
          {hasBarOutlet ? (
            <div className="w-full max-w-xs">
              <HmsField id="fb-pos-tab-name" label="Tab name" optional>
                <input
                  id="fb-pos-tab-name"
                  value={tabLabel}
                  onChange={(e) => setTabLabel(e.target.value)}
                  placeholder="e.g. Bar tab"
                  className={hmsInput}
                />
              </HmsField>
            </div>
          ) : null}

          {hasRestaurantOutlet ? (
            <div className="w-full max-w-md">
              {outletTables.length > 0 ? (
                <HmsField id="fb-pos-table" label="Table" optional hint="For floor service, so the order reaches the right seat.">
                  <select
                    id="fb-pos-table"
                    value={tableId ?? ""}
                    onChange={(e) => setTableId(e.target.value || null)}
                    aria-describedby="fb-pos-table-hint"
                    className={cn(hmsInput, "max-w-xs")}
                  >
                    <option value="">No table</option>
                    {outletTables.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.table_code} ({t.covers} covers)
                      </option>
                    ))}
                  </select>
                </HmsField>
              ) : (
                <div>
                  <p className="mb-1 text-sm font-medium text-slate-800">Table</p>
                  <p className="text-sm text-slate-600">
                    No tables set up yet.{" "}
                    <Link
                      href={`${settingsMenuUrl}#restaurant-tables`}
                      className="font-medium text-blue-700 underline underline-offset-2 hover:text-blue-900"
                    >
                      Add tables in Settings
                    </Link>{" "}
                    to track which seat an order is for. The kitchen only sees items.
                  </p>
                </div>
              )}
            </div>
          ) : null}
        </div>
      ) : null}

      {outlet && hasMenu ? (
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start lg:gap-4">
        <div className="min-w-0 space-y-4">
          {categories.map((cat) => {
            const catItems = allMenuItems.filter((i) => i.category_id === cat.id);
            if (!catItems.length) return null;
            return (
              <section key={cat.id} aria-label={cat.name} className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
                <h2 className="mb-3 flex items-center gap-2 font-heading text-base font-semibold text-slate-900">
                  <span aria-hidden className="h-2 w-2 rounded-full bg-orange-500" />
                  {cat.name}
                </h2>
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
                          "relative min-h-16 rounded-xl border px-3 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 disabled:cursor-not-allowed",
                          soldOut
                            ? "border-slate-200 bg-slate-100"
                            : inDraft
                              ? "border-orange-500 bg-orange-50 ring-2 ring-orange-500/30 shadow-sm hover:bg-orange-100/80 disabled:opacity-60"
                              : "border-slate-200 bg-white hover:border-orange-300 hover:bg-orange-50/60 disabled:opacity-60",
                        )}
                      >
                        {soldOut ? (
                          <span className="absolute right-2 top-2 rounded-full bg-slate-700 px-2 py-0.5 text-xs font-semibold text-white">
                            Sold out
                          </span>
                        ) : inDraft ? (
                          <span className="absolute right-2 top-2 flex h-6 min-w-6 items-center justify-center rounded-full bg-orange-600 px-1.5 text-xs font-bold text-white">
                            {qty}
                            <span className="sr-only"> on this ticket</span>
                          </span>
                        ) : null}
                        <p
                          className={cn(
                            "pr-8 text-sm font-semibold",
                            soldOut
                              ? "text-slate-600 line-through"
                              : inDraft
                                ? "text-orange-950"
                                : "text-slate-900",
                          )}
                        >
                          {item.name}
                        </p>
                        <p
                          className={cn(
                            "mt-1 text-sm tabular-nums",
                            soldOut ? "text-slate-600" : inDraft ? "text-orange-900" : "text-slate-700",
                          )}
                        >
                          {formatPricingAmount(item.price, currency)}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>

        <aside aria-labelledby="fb-pos-ticket-title" className="mt-4 lg:sticky lg:top-20 lg:mt-0 lg:self-start">
          <div
            className={cn(
              "rounded-2xl border bg-white p-4 shadow-sm transition-colors",
              draft.rush ? "border-2 border-rose-500" : "border-slate-200/80",
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <h2 id="fb-pos-ticket-title" className="flex items-center gap-2 font-heading text-base font-semibold text-slate-900">
                <span aria-hidden className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-50 text-orange-600">
                  <Receipt className="h-4 w-4" />
                </span>
                Current order
              </h2>
              {draft.rush ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-0.5 text-xs font-bold text-rose-800 ring-1 ring-rose-200">
                  <Flame className="h-3.5 w-3.5" aria-hidden />
                  Rush
                </span>
              ) : null}
            </div>
            {hasDraft ? (
              <div className="mt-3 space-y-3">
                <HmsPill tone="amber">Draft, not sent yet</HmsPill>
                <ul className="space-y-2 text-sm">
                  {draft.lines.map((line) => (
                    <li
                      key={line.menuItemId}
                      className="rounded-xl border border-orange-100 bg-orange-50/50 p-2.5"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-slate-900">{line.name}</p>
                          {activeOutlets.length > 1 ? (
                            <p className="text-xs text-slate-600">
                              {outletNameById.get(line.outletId) ?? ""}
                            </p>
                          ) : null}
                        </div>
                        <p className="shrink-0 tabular-nums font-medium text-slate-800">
                          {formatPricingAmount(line.price * line.quantity, currency)}
                        </p>
                      </div>
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            disabled={sending}
                            onClick={() => adjustDraftQuantity(line.menuItemId, -1)}
                            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50"
                            aria-label={`Decrease ${line.name}`}
                          >
                            <Minus className="h-4 w-4" aria-hidden />
                          </button>
                          <span className="w-8 text-center text-sm font-semibold tabular-nums text-slate-900">
                            {line.quantity}
                          </span>
                          <button
                            type="button"
                            disabled={sending}
                            onClick={() => adjustDraftQuantity(line.menuItemId, 1)}
                            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50"
                            aria-label={`Increase ${line.name}`}
                          >
                            <Plus className="h-4 w-4" aria-hidden />
                          </button>
                        </div>
                        <button
                          type="button"
                          disabled={sending}
                          onClick={() => removeDraftLine(line.menuItemId)}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-red-700 hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50"
                          aria-label={`Remove ${line.name}`}
                        >
                          <Trash2 className="h-4 w-4" aria-hidden />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
                <div className="flex items-baseline justify-between rounded-xl bg-emerald-50 px-3 py-2.5">
                  <span className="text-sm font-medium text-emerald-900">Total</span>
                  <span className="font-heading text-xl font-bold tabular-nums text-slate-900">
                    {formatPricingAmount(draftSubtotal, currency)}
                  </span>
                </div>
                <div className="flex flex-col gap-2">
                  <button
                    type="button"
                    disabled={sending}
                    onClick={() => void sendToKitchen()}
                    className={cn(hmsButton.primary, "min-h-11 w-full")}
                  >
                    {sending ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    ) : (
                      <Send className="h-4 w-4" aria-hidden />
                    )}
                    {sending ? "Sending..." : "Send to kitchen"}
                  </button>
                  <button
                    type="button"
                    aria-pressed={draft.rush}
                    disabled={sending}
                    onClick={() => setDraft((prev) => ({ ...prev, rush: !prev.rush }))}
                    className={cn(
                      hmsButton.secondary,
                      "min-h-11 w-full",
                      draft.rush && "border-rose-300 bg-rose-50 text-rose-900 hover:bg-rose-100",
                    )}
                  >
                    <Flame className="h-4 w-4" aria-hidden />
                    {draft.rush ? "Remove rush" : "Mark rush"}
                  </button>
                  <button type="button" disabled={sending} onClick={clearDraft} className={cn(hmsButton.secondary, "min-h-11 w-full")}>
                    Clear ticket
                  </button>
                </div>
              </div>
            ) : (
              <p className="mt-4 text-sm text-slate-600">Tap menu items to build a ticket, then send it to the kitchen.</p>
            )}
          </div>
        </aside>
      </div>
      ) : null}
    </div>
  );
}
