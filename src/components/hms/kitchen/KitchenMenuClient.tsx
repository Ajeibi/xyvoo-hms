"use client";

import { useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { useFbRealtime } from "@/hooks/useFbRealtime";
import { toastError, toastSuccess } from "@/lib/app-toast";
import { cn } from "@/lib/utils";
import { isMenuItemSoldOut } from "@/lib/hms/fb-menu-availability";
import type { FbConfigPayload } from "@/lib/hms/load-fb-pages";

type FbConfig = {
  outlets: FbConfigPayload["outlets"];
  categories: FbConfigPayload["categories"];
  items: FbConfigPayload["items"];
};

function pickDefaultOutletId(outlets: FbConfigPayload["outlets"]) {
  return outlets.find((o) => o.is_active)?.id ?? outlets[0]?.id ?? "";
}

export function KitchenMenuClient({
  slug,
  tenantId,
  initial,
}: {
  slug: string;
  tenantId: string;
  initial: { config: FbConfigPayload };
}) {
  const [config, setConfig] = useState<FbConfig>({
    outlets: initial.config.outlets,
    categories: initial.config.categories,
    items: initial.config.items,
  });
  const [outletId, setOutletId] = useState<string>(() => pickDefaultOutletId(initial.config.outlets));
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());

  const loadConfig = async () => {
    const res = await fetch(`/api/hotel/fb/config?slug=${encodeURIComponent(slug)}&seed=0`);
    const data = await res.json();
    if (res.ok) {
      setConfig({ outlets: data.outlets, categories: data.categories, items: data.items });
      setOutletId((prev) => {
        if (prev && data.outlets?.some((o: { id: string }) => o.id === prev)) return prev;
        return pickDefaultOutletId(data.outlets ?? []);
      });
    }
  };

  useFbRealtime(tenantId, { onMenuChange: () => void loadConfig() });

  const activeOutlets = useMemo(() => config.outlets.filter((o) => o.is_active), [config.outlets]);
  const outlet = activeOutlets.find((o) => o.id === outletId);
  const categories = useMemo(
    () => config.categories.filter((c) => c.outlet_id === outletId && c.is_active),
    [config.categories, outletId],
  );
  const items = useMemo(
    () => config.items.filter((i) => i.outlet_id === outletId),
    [config.items, outletId],
  );
  const soldOutCount = useMemo(
    () => config.items.filter((i) => isMenuItemSoldOut(i)).length,
    [config.items],
  );

  const toggleItem = async (item: FbConfigPayload["items"][number]) => {
    const soldOut = isMenuItemSoldOut(item);
    setBusyIds((prev) => new Set(prev).add(item.id));
    try {
      const endpoint = soldOut ? "restock" : "eighty-six";
      const res = await fetch(`/api/hotel/fb/menu-items/${item.id}/${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug }),
      });
      const data = await res.json();
      if (!res.ok) {
        toastError(soldOut ? "Could not restore item" : "Could not mark sold out", data.error ?? "Try again.");
        return;
      }
      toastSuccess(soldOut ? "Back in stock" : "Marked sold out", item.name);
      await loadConfig();
    } finally {
      setBusyIds((prev) => {
        const next = new Set(prev);
        next.delete(item.id);
        return next;
      });
    }
  };

  return (
    <div className="w-full space-y-4 px-6 py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Menu</h1>
          <p className="text-sm text-slate-500">
            Tap any item to mark it sold out or back in stock — no order needed.
            {soldOutCount > 0
              ? ` ${soldOutCount} item${soldOutCount === 1 ? "" : "s"} currently sold out.`
              : ""}
          </p>
        </div>
        {activeOutlets.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {activeOutlets.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => setOutletId(o.id)}
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
        ) : null}
      </div>

      {activeOutlets.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-6 py-12 text-center text-sm text-slate-600">
          No menu sections configured yet.
        </p>
      ) : outlet && items.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-6 py-10 text-center text-sm text-slate-600">
          No menu for {outlet.name} yet.
        </p>
      ) : (
        <div className="space-y-4">
          {categories.map((cat) => {
            const catItems = items.filter((i) => i.category_id === cat.id);
            if (!catItems.length) return null;
            return (
              <div key={cat.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                <h2 className="mb-3 text-sm font-semibold text-slate-800">{cat.name}</h2>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                  {catItems.map((item) => {
                    const soldOut = isMenuItemSoldOut(item);
                    const busy = busyIds.has(item.id);
                    return (
                      <button
                        key={item.id}
                        type="button"
                        disabled={busy}
                        onClick={() => void toggleItem(item)}
                        className={cn(
                          "relative rounded-xl border px-3 py-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60",
                          soldOut
                            ? "border-slate-300 bg-slate-100"
                            : "border-emerald-200 bg-emerald-50/60 hover:border-emerald-300 hover:bg-emerald-50",
                        )}
                      >
                        <span
                          className={cn(
                            "absolute right-2 top-2 flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                            soldOut
                              ? "bg-slate-500 text-white"
                              : "bg-emerald-600 text-white",
                          )}
                        >
                          {busy ? (
                            <Loader2 className="h-2.5 w-2.5 animate-spin" aria-hidden />
                          ) : null}
                          {soldOut ? "Sold out" : "In stock"}
                        </span>
                        <p
                          className={cn(
                            "pr-14 text-sm font-medium",
                            soldOut ? "text-slate-500 line-through" : "text-slate-900",
                          )}
                        >
                          {item.name}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
