"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { ExternalLink, Loader2, Send } from "lucide-react";
import type { FbOrderWithItems } from "@/lib/hms/fb-types";
import { formatPricingAmount } from "@/lib/hms/room-pricing";
import { useFbRealtime } from "@/hooks/useFbRealtime";
import { toastError, toastSuccess } from "@/lib/app-toast";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import type { FbConfigPayload } from "@/lib/hms/load-fb-pages";

type FbConfig = {
  outlets: FbConfigPayload["outlets"];
  categories: FbConfigPayload["categories"];
  items: FbConfigPayload["items"];
  tables: FbConfigPayload["tables"];
};

function pickDefaultOutletId(outlets: FbConfigPayload["outlets"]) {
  const restaurant = outlets.find((o) => o.outlet_type === "restaurant" && o.is_active);
  return restaurant?.id ?? outlets.find((o) => o.is_active)?.id ?? outlets[0]?.id ?? "";
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
  initial: { config: FbConfigPayload; orders: FbOrderWithItems[] };
}) {
  const [config, setConfig] = useState<FbConfig>({
    outlets: initial.config.outlets,
    categories: initial.config.categories,
    items: initial.config.items,
    tables: initial.config.tables,
  });
  const [orders, setOrders] = useState<FbOrderWithItems[]>(initial.orders);
  const [outletId, setOutletId] = useState<string>(() => pickDefaultOutletId(initial.config.outlets));
  const [activeOrderId, setActiveOrderId] = useState<string | null>(null);
  const [tableId, setTableId] = useState<string | null>(null);
  const [tabLabel, setTabLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [addingItemId, setAddingItemId] = useState<string | null>(null);

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

  const loadOrders = useCallback(async () => {
    const res = await fetch(`/api/hotel/fb/orders?slug=${encodeURIComponent(slug)}`);
    const ord = await res.json();
    if (res.ok) setOrders(ord.orders ?? []);
  }, [slug]);

  useFbRealtime(tenantId, {
    onDataChange: () => void loadOrders(),
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
  const menuItems = useMemo(
    () => (config.items ?? []).filter((i) => i.outlet_id === outletId && i.is_available),
    [config, outletId],
  );
  const outletTables = useMemo(
    () => (config.tables ?? []).filter((t) => t.outlet_id === outletId),
    [config.tables, outletId],
  );

  const activeOrder = orders.find((o) => o.id === activeOrderId) ?? null;

  const applyOrderUpdate = useCallback((order: FbOrderWithItems) => {
    setOrders((prev) => {
      const idx = prev.findIndex((o) => o.id === order.id);
      if (idx === -1) return [order, ...prev];
      const next = [...prev];
      next[idx] = order;
      return next;
    });
  }, []);

  const addItem = async (menuItemId: string) => {
    if (addingItemId) return;
    setAddingItemId(menuItemId);

    try {
      if (!activeOrderId) {
        const res = await fetch("/api/hotel/fb/orders", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            slug,
            outletId,
            tableId: outlet?.outlet_type === "restaurant" ? tableId : null,
            tabLabel: outlet?.outlet_type === "bar" ? tabLabel || null : null,
            menuItemId,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          toastError("Could not add item", data.error ?? "Try again.");
          return;
        }
        setActiveOrderId(data.order.id);
        applyOrderUpdate(data.order);
        return;
      }

      const res = await fetch(`/api/hotel/fb/orders/${activeOrderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, action: "add_item", menuItemId }),
      });
      const data = await res.json();
      if (!res.ok) {
        toastError("Could not add item", data.error ?? "Try again.");
        return;
      }
      if (data.order) applyOrderUpdate(data.order);
    } finally {
      setAddingItemId(null);
    }
  };

  const sendToKitchen = async () => {
    if (!activeOrderId) return;
    setBusy(true);
    const res = await fetch(`/api/hotel/fb/orders/${activeOrderId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug, action: "send_to_kitchen" }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      toastError("Send failed", data.error ?? "Try again.");
      return;
    }
    toastSuccess("Sent to kitchen");
    if (data.order) applyOrderUpdate(data.order);
    else await loadOrders();
  };

  const toggleRush = async () => {
    if (!activeOrder) return;
    setBusy(true);
    const res = await fetch(`/api/hotel/fb/orders/${activeOrder.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug, action: "rush", rush: !activeOrder.rush }),
    });
    setBusy(false);
    if (!res.ok) {
      const data = await res.json();
      toastError("Could not update rush", data.error ?? "Try again.");
      return;
    }
    await loadOrders();
  };

  const closeOrder = async () => {
    if (!activeOrderId) return;
    setBusy(true);
    const res = await fetch(`/api/hotel/fb/orders/${activeOrderId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug, action: "close" }),
    });
    setBusy(false);
    if (!res.ok) {
      const data = await res.json();
      toastError("Could not close", data.error ?? "Try again.");
      return;
    }
    toastSuccess("Order closed");
    setActiveOrderId(null);
    setTableId(null);
    setTabLabel("");
    await loadOrders();
  };

  const hasMenu = menuItems.length > 0;
  const isRestaurant = outlet?.outlet_type === "restaurant";
  const isBar = outlet?.outlet_type === "bar";

  return (
    <div className="mx-auto max-w-[1500px] space-y-4 px-6 py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">POS</h1>
          <p className="text-sm text-slate-500">Take orders and send to kitchen.</p>
        </div>
        {activeOutlets.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {activeOutlets.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => {
                  setOutletId(o.id);
                  setActiveOrderId(null);
                  setTableId(null);
                  setTabLabel("");
                }}
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

      {outlet && hasMenu && isBar ? (
        <div className="max-w-xs">
          <label className="mb-1 block text-xs font-medium text-slate-500">Tab name</label>
          <input
            value={tabLabel}
            onChange={(e) => setTabLabel(e.target.value)}
            placeholder={`e.g. ${outlet.name} tab`}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
        </div>
      ) : null}

      {outlet && hasMenu && isRestaurant ? (
        <div className="space-y-3">
          {outletTables.length === 0 ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
              <p className="font-medium">No restaurant tables configured</p>
              <p className="mt-1 text-amber-900/80">
                Add tables in Settings so staff can assign orders to seats.
              </p>
              <Link href={`${settingsMenuUrl}#restaurant-tables`} className="mt-2 inline-flex items-center gap-1 font-medium underline">
                <ExternalLink className="h-3.5 w-3.5" />
                Configure tables
              </Link>
            </div>
          ) : (
            <div className="max-w-xs">
              <label className="mb-1 block text-xs font-medium text-slate-500">Table</label>
              <select
                value={tableId ?? ""}
                onChange={(e) => setTableId(e.target.value || null)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              >
                <option value="">Select table</option>
                {outletTables.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.table_code} ({t.covers} covers)
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      ) : null}

      {outlet && hasMenu ? (
      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          {categories.map((cat) => {
            const catItems = menuItems.filter((i) => i.category_id === cat.id);
            if (!catItems.length) return null;
            return (
              <div key={cat.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                <h2 className="mb-3 text-sm font-semibold text-slate-800">{cat.name}</h2>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {catItems.map((item) => {
                    const itemBusy = addingItemId === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        disabled={Boolean(addingItemId) || busy}
                        onClick={() => void addItem(item.id)}
                        className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-left hover:border-blue-300 hover:bg-blue-50 disabled:opacity-60"
                      >
                        <p className="flex items-center gap-2 text-sm font-medium text-slate-900">
                          {itemBusy ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden /> : null}
                          <span>{item.name}</span>
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
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

        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-slate-800">Current order</h2>
          {activeOrder ? (
            <div className="mt-3 space-y-3">
              <p className="text-xs text-slate-500">#{activeOrder.order_number}</p>
              <ul className="max-h-64 space-y-2 overflow-y-auto text-sm">
                {activeOrder.items.map((item) => (
                  <li key={item.id} className="flex justify-between gap-2 border-b border-slate-50 pb-2">
                    <span>
                      {item.quantity}× {item.name_snapshot}
                      <span className="ml-2 text-xs text-slate-400">{item.kitchen_status}</span>
                    </span>
                    <span className="tabular-nums">
                      {formatPricingAmount(item.price_snapshot * item.quantity, currency)}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="text-lg font-bold tabular-nums">
                {formatPricingAmount(activeOrder.subtotal, currency)}
              </p>
              <div className="flex flex-col gap-2">
                <Button
                  type="button"
                  disabled={busy || !activeOrder.items.length}
                  onClick={() => void sendToKitchen()}
                  className="w-full gap-2"
                >
                  <Send className="h-4 w-4" />
                  Send to kitchen
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() => void toggleRush()}
                >
                  {activeOrder.rush ? "Remove rush" : "Mark rush"}
                </Button>
                <Button type="button" variant="secondary" disabled={busy} onClick={() => void closeOrder()}>
                  Close &amp; settle
                </Button>
              </div>
            </div>
          ) : (
            <p className="mt-4 text-sm text-slate-500">Tap a menu item to start an order.</p>
          )}
        </div>
      </div>
      ) : null}
    </div>
  );
}
