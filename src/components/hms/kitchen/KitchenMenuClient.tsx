"use client";

import { useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { useFbRealtime } from "@/hooks/useFbRealtime";
import { toastError, toastSuccess } from "@/lib/app-toast";
import { cn } from "@/lib/utils";
import { HmsEmptyState, HmsPageHeader } from "@/components/hms/hms-ui";
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
    <div className="w-full space-y-4 px-4 py-6 sm:px-6">
      <HmsPageHeader
        eyebrow="Kitchen"
        meaning="food"
        title="Menu"
        description={
          <>
            Tap any dish to mark it sold out or back in stock. No order is needed.
            {soldOutCount > 0
              ? ` ${soldOutCount} item${soldOutCount === 1 ? " is" : "s are"} sold out right now.`
              : ""}
          </>
        }
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
                    onClick={() => setOutletId(o.id)}
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
          description="Menu sections such as Bar or Restaurant are set up in Restaurant & bar settings."
        />
      ) : outlet && items.length === 0 ? (
        <HmsEmptyState
          art="box"
          meaning="food"
          title={`No menu for ${outlet.name} yet`}
          description="Dishes appear here once they're added in Restaurant & bar settings."
        />
      ) : (
        <div className="space-y-4">
          {categories.map((cat) => {
            const catItems = items.filter((i) => i.category_id === cat.id);
            if (!catItems.length) return null;
            return (
              <section key={cat.id} aria-label={cat.name} className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
                <h2 className="mb-3 flex items-center gap-2 font-heading text-base font-semibold text-slate-900">
                  <span aria-hidden className="h-2 w-2 rounded-full bg-orange-500" />
                  {cat.name}
                </h2>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                  {catItems.map((item) => {
                    const soldOut = isMenuItemSoldOut(item);
                    const busy = busyIds.has(item.id);
                    return (
                      <button
                        key={item.id}
                        type="button"
                        disabled={busy}
                        aria-label={`${item.name}: ${soldOut ? "sold out. Tap to put back in stock" : "in stock. Tap to mark sold out"}`}
                        onClick={() => void toggleItem(item)}
                        className={cn(
                          "relative min-h-16 rounded-xl border px-3 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-60",
                          soldOut
                            ? "border-slate-300 bg-slate-100 hover:bg-slate-200/70"
                            : "border-emerald-200 bg-emerald-50/60 hover:border-emerald-300 hover:bg-emerald-50",
                        )}
                      >
                        <span
                          className={cn(
                            "absolute right-2 top-2 flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold",
                            soldOut ? "bg-slate-700 text-white" : "bg-emerald-700 text-white",
                          )}
                        >
                          {busy ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> : null}
                          {soldOut ? "Sold out" : "In stock"}
                        </span>
                        <p
                          className={cn(
                            "pr-20 text-sm font-semibold",
                            soldOut ? "text-slate-600 line-through" : "text-slate-900",
                          )}
                        >
                          {item.name}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
