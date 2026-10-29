"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { Clock, Flame, Loader2, Minus, Pencil, Plus, Receipt, Send, Settings, Trash2 } from "lucide-react";
import {
  draftLineKey,
  groupsForMenuItem,
  modifierLabel,
  needsChoices,
  normaliseItemNote,
  resolveModifierSelection,
} from "@/lib/hms/fb-modifier-rules";
import {
  defaultCourseFor,
  FB_COURSES,
  type FbFireMode,
  hasSeveralCourses,
} from "@/lib/hms/fb-course-rules";
import { computeBillTotals, NO_BILL_CHARGES } from "@/lib/hms/fb-bill-rules";
import { kitchenTicketPrintUrl, reservePrintWindow, useDevicePrintSetting } from "@/lib/hms/fb-print-links";
import { changeLabel, DEFAULT_FB_TIME_ZONE, priceWithRules, ruleCoversItem, ruleIsOn, shortTime } from "@/lib/hms/fb-price-rules";
import { useHotelClock } from "@/lib/hms/fb-price-clock";
import { formatPricingAmount } from "@/lib/hms/room-pricing";
import { FbItemChoicesDialog, type FbItemChoices } from "@/components/hms/fb/FbItemChoicesDialog";
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
  modifierGroups: FbConfigPayload["modifierGroups"];
  modifierLinks: FbConfigPayload["modifierLinks"];
  billRates?: FbConfigPayload["billRates"];
  priceRules: FbConfigPayload["priceRules"];
  timeZone: string;
};

type DraftLine = {
  /** Item + choices + note: the same dish made two ways is two lines. */
  key: string;
  menuItemId: string;
  outletId: string;
  name: string;
  /** Menu price including choices, before any happy hour (worked out when shown). */
  price: number;
  categoryId: string | null;
  quantity: number;
  optionIds: string[];
  choiceLabels: string[];
  note: string | null;
  course: number;
  /** Seat at the table, for splitting by seat later. */
  seat: number | null;
};

const FIRE_MODES: { value: FbFireMode; label: string; hint: string }[] = [
  { value: "first_course", label: "First course now", hint: "Later courses wait until you fire them from Open orders." },
  { value: "all", label: "Everything now", hint: "Every course goes to the kitchen at once." },
  { value: "hold", label: "Hold all courses", hint: "Only straight-away items go now. Fire the food from Open orders." },
];

/** The choices dialog is open for a new item, or to change a line already on the ticket. */
type ChoicesTarget = { menuItemId: string; editKey: string | null };

function pickDefaultOutletId(outlets: FbConfigPayload["outlets"]) {
  const restaurant = outlets.find((o) => o.outlet_type === "restaurant" && o.is_active);
  return restaurant?.id ?? outlets.find((o) => o.is_active)?.id ?? outlets[0]?.id ?? "";
}

function emptyDraft() {
  return { lines: [] as DraftLine[], rush: false, fireMode: "first_course" as FbFireMode };
}

function lineKey(menuItemId: string, optionIds: string[], note: string | null, course: number, seat: number | null) {
  return `${draftLineKey(menuItemId, optionIds, note)}|c${course}|s${seat ?? ""}`;
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
    modifierGroups: initial.config.modifierGroups ?? [],
    modifierLinks: initial.config.modifierLinks ?? [],
    billRates: initial.config.billRates,
    priceRules: initial.config.priceRules ?? [],
    timeZone: initial.config.timeZone ?? DEFAULT_FB_TIME_ZONE,
  });
  const [choicesTarget, setChoicesTarget] = useState<ChoicesTarget | null>(null);
  const [printTickets, setPrintTickets] = useDevicePrintSetting("kitchen-ticket-on-send");
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
        modifierGroups: cfg.modifierGroups ?? [],
        modifierLinks: cfg.modifierLinks ?? [],
        billRates: cfg.billRates,
        priceRules: cfg.priceRules ?? [],
        timeZone: cfg.timeZone ?? DEFAULT_FB_TIME_ZONE,
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

  // Happy hours: prices follow the hotel's clock, minute by minute. The
  // server fixes each line's price when the ticket is sent.
  const clock = useHotelClock(config.timeZone);
  const activeRules = useMemo(() => config.priceRules.filter((r) => r.is_active), [config.priceRules]);
  const ruledPrice = useCallback(
    (listPrice: number, item: { outlet_id: string; category_id: string | null }) =>
      clock
        ? priceWithRules(listPrice, item, activeRules, clock)
        : { price: listPrice, listPrice, rule: null },
    [activeRules, clock],
  );
  // Rules running now that touch at least one item on the menu being shown.
  const rulesOnHere = useMemo(
    () =>
      clock
        ? activeRules.filter(
            (r) => ruleIsOn(r, clock) && allMenuItems.some((item) => ruleCoversItem(r, item)),
          )
        : [],
    [activeRules, allMenuItems, clock],
  );

  const linePrice = useCallback(
    (line: DraftLine) => ruledPrice(line.price, { outlet_id: line.outletId, category_id: line.categoryId }),
    [ruledPrice],
  );
  const draftSubtotal = useMemo(
    () => draft.lines.reduce((sum, line) => sum + linePrice(line).price * line.quantity, 0),
    [draft.lines, linePrice],
  );
  // An estimate with the hotel's current rates; the bill keeps the rates it opens with.
  const draftTotals = useMemo(
    () => computeBillTotals(draftSubtotal, config.billRates ?? NO_BILL_CHARGES),
    [draftSubtotal, config.billRates],
  );

  const draftQtyByItemId = useMemo(() => {
    const map = new Map<string, number>();
    for (const line of draft.lines) map.set(line.menuItemId, (map.get(line.menuItemId) ?? 0) + line.quantity);
    return map;
  }, [draft.lines]);

  const defaultCourseForItem = useCallback(
    (item: { category_id: string | null; outlet_id: string }) =>
      defaultCourseFor(
        config.categories.find((c) => c.id === item.category_id)?.default_course ?? null,
        config.outlets.find((o) => o.id === item.outlet_id)?.outlet_type ?? null,
      ),
    [config.categories, config.outlets],
  );

  const ticketHasCourses = useMemo(
    () => hasSeveralCourses(draft.lines.map((l) => l.course)),
    [draft.lines],
  );

  /** Moves a ticket line to another course (merging with an identical line there). */
  const changeLineCourse = (key: string, course: number) => {
    const line = draft.lines.find((l) => l.key === key);
    if (!line || line.course === course) return;
    putLine(line.menuItemId, { optionIds: line.optionIds, note: line.note ?? "" }, key, { course });
  };

  /** Moves a ticket line to another seat (merging with an identical line there). */
  const changeLineSeat = (key: string, seat: number | null) => {
    const line = draft.lines.find((l) => l.key === key);
    if (!line || line.seat === seat) return;
    putLine(line.menuItemId, { optionIds: line.optionIds, note: line.note ?? "" }, key, { seat });
  };

  const itemGroups = useCallback(
    (menuItemId: string) =>
      groupsForMenuItem(menuItemId, { groups: config.modifierGroups, links: config.modifierLinks }),
    [config.modifierGroups, config.modifierLinks],
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

  /**
   * Puts an item on the ticket with the given choices and note. If the same
   * item, choices and note are already there, that line's quantity goes up.
   * `replaceKey` swaps out a line being edited (keeping its quantity).
   */
  const putLine = (
    menuItemId: string,
    choices: FbItemChoices,
    replaceKey: string | null = null,
    overrides: { course?: number; seat?: number | null } = {},
  ) => {
    const menuItem = config.items.find((i) => i.id === menuItemId);
    if (!menuItem) return;
    const groups = itemGroups(menuItemId);
    const check = resolveModifierSelection(groups, choices.optionIds, menuItem.price);
    if (!check.ok) {
      toastError("Check the choices", check.error);
      return;
    }
    const note = normaliseItemNote(choices.note);
    const editing = replaceKey ? draft.lines.find((l) => l.key === replaceKey) : undefined;
    const course = overrides.course ?? editing?.course ?? defaultCourseForItem(menuItem);
    const seat = overrides.seat !== undefined ? overrides.seat : (editing?.seat ?? null);
    const key = lineKey(menuItemId, choices.optionIds, note, course, seat);
    const fresh: Omit<DraftLine, "quantity"> = {
      course,
      seat,
      key,
      menuItemId,
      outletId: menuItem.outlet_id,
      name: menuItem.name,
      price: menuItem.price + check.priceDelta,
      categoryId: menuItem.category_id,
      optionIds: check.chosen.map((c) => c.optionId),
      choiceLabels: check.chosen.map((c) => modifierLabel({ name: c.optionName, price_delta: c.priceDelta }, (n) => formatPricingAmount(n, currency))),
      note,
    };

    setDraft((prev) => {
      const replaced = replaceKey ? prev.lines.find((l) => l.key === replaceKey) : undefined;
      const addQty = replaced?.quantity ?? 1;
      let lines = replaceKey ? prev.lines.filter((l) => l.key !== replaceKey) : prev.lines;
      const existing = lines.find((l) => l.key === key);
      if (existing) {
        lines = lines.map((l) => (l.key === key ? { ...l, quantity: l.quantity + addQty } : l));
      } else if (replaced) {
        // Keep the edited line where it was on the ticket.
        const at = prev.lines.findIndex((l) => l.key === replaceKey);
        lines = [...lines.slice(0, at), { ...fresh, quantity: addQty }, ...lines.slice(at)];
      } else {
        lines = [...lines, { ...fresh, quantity: 1 }];
      }
      return { ...prev, lines };
    });
  };

  const addItem = (menuItemId: string) => {
    const menuItem = allMenuItems.find((i) => i.id === menuItemId);
    if (!menuItem) return;
    if (isMenuItemSoldOut(menuItem)) {
      toastError("Sold out", `${menuItem.name} is off the menu until marked back in stock.`);
      return;
    }
    if (needsChoices(itemGroups(menuItemId))) {
      setChoicesTarget({ menuItemId, editKey: null });
      return;
    }
    putLine(menuItemId, { optionIds: [], note: "" });
  };

  const adjustDraftQuantity = (key: string, delta: number) => {
    setDraft((prev) => {
      const line = prev.lines.find((l) => l.key === key);
      if (!line) return prev;
      const nextQty = line.quantity + delta;
      if (nextQty <= 0) {
        return { ...prev, lines: prev.lines.filter((l) => l.key !== key) };
      }
      return {
        ...prev,
        lines: prev.lines.map((l) => (l.key === key ? { ...l, quantity: nextQty } : l)),
      };
    });
  };

  const removeDraftLine = (key: string) => {
    setDraft((prev) => ({
      ...prev,
      lines: prev.lines.filter((l) => l.key !== key),
    }));
  };

  const choicesItem = choicesTarget ? config.items.find((i) => i.id === choicesTarget.menuItemId) : undefined;
  const choicesLine = choicesTarget?.editKey
    ? draft.lines.find((l) => l.key === choicesTarget.editKey)
    : undefined;

  const sendToKitchen = async () => {
    if (!draft.lines.length || sending) return;

    // The order needs one "home" outlet even when the ticket mixes menus —
    // use whichever outlet the first item came from rather than whichever
    // menu happens to be on screen right now.
    const primaryOutletId = draft.lines[0]?.outletId ?? outletId;
    // Opened during the click so the browser doesn't block it as a pop-up.
    const printWindow = printTickets ? reservePrintWindow() : null;

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
            modifierOptionIds: line.optionIds,
            notes: line.note,
            course: line.course,
            seat: line.seat,
          })),
          rush: draft.rush,
          sendToKitchen: true,
          fireMode: ticketHasCourses ? draft.fireMode : "all",
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        printWindow?.cancel();
        toastError("Send failed", data.error ?? "Try again.");
        return;
      }
      if (printWindow && data.order?.id) printWindow.go(kitchenTicketPrintUrl(slug, data.order.id));
      else printWindow?.cancel();
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

      {outlet && hasMenu && rulesOnHere.length ? (
        <div
          role="status"
          className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-950"
        >
          <Clock className="h-4 w-4 shrink-0 text-violet-700" aria-hidden />
          {rulesOnHere.map((r) => (
            <span key={r.id}>
              <span className="font-semibold">{r.name}</span> on now: {changeLabel(r.change_percent)}
              {r.category_ids.length
                ? ` on ${config.categories.filter((c) => r.category_ids.includes(c.id)).map((c) => c.name).join(", ")}`
                : ""}{" "}
              until {shortTime(r.ends_at)}
            </span>
          ))}
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
                    const ruled = ruledPrice(item.price, item);
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
                          {ruled.rule && !soldOut ? (
                            <>
                              <span className="font-semibold text-violet-800">{formatPricingAmount(ruled.price, currency)}</span>{" "}
                              <span className="text-xs text-slate-600 line-through">
                                <span className="sr-only">was </span>
                                {formatPricingAmount(item.price, currency)}
                              </span>
                            </>
                          ) : (
                            formatPricingAmount(item.price, currency)
                          )}
                        </p>
                        {ruled.rule && !soldOut ? (
                          <p className="mt-0.5 text-xs font-medium text-violet-800">{ruled.rule.name}</p>
                        ) : null}
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
                  {[...draft.lines].sort((a, b) => a.course - b.course).map((line) => (
                    <li
                      key={line.key}
                      className="rounded-xl border border-orange-100 bg-orange-50/50 p-2.5"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-slate-900">{line.name}</p>
                          {line.choiceLabels.length ? (
                            <p className="text-sm text-slate-700">{line.choiceLabels.join(", ")}</p>
                          ) : null}
                          {line.note ? (
                            <p className="text-sm italic text-amber-900">Note: {line.note}</p>
                          ) : null}
                          {linePrice(line).rule ? (
                            <p className="text-xs font-medium text-violet-800">
                              {linePrice(line).rule?.name}: {changeLabel(linePrice(line).rule?.change_percent ?? 0)}
                            </p>
                          ) : null}
                          <div className="mt-1 flex flex-wrap items-center gap-3">
                          <label className="flex items-center gap-1.5 text-xs text-slate-700">
                            Course
                            <select
                              value={line.course}
                              disabled={sending}
                              onChange={(e) => changeLineCourse(line.key, Number(e.target.value))}
                              className="min-h-8 rounded-md border border-slate-300 bg-white px-1.5 py-0.5 text-xs font-medium text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                              aria-label={`Course for ${line.name}`}
                            >
                              {FB_COURSES.map((c) => (
                                <option key={c.value} value={c.value}>
                                  {c.label}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="flex items-center gap-1.5 text-xs text-slate-700">
                            Seat
                            <select
                              value={line.seat ?? ""}
                              disabled={sending}
                              onChange={(e) => changeLineSeat(line.key, e.target.value ? Number(e.target.value) : null)}
                              className="min-h-8 rounded-md border border-slate-300 bg-white px-1.5 py-0.5 text-xs font-medium text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                              aria-label={`Seat for ${line.name}`}
                            >
                              <option value="">Shared</option>
                              {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
                                <option key={n} value={n}>
                                  {n}
                                </option>
                              ))}
                            </select>
                          </label>
                          </div>
                          {activeOutlets.length > 1 ? (
                            <p className="text-xs text-slate-600">
                              {outletNameById.get(line.outletId) ?? ""}
                            </p>
                          ) : null}
                        </div>
                        <p className="shrink-0 tabular-nums font-medium text-slate-800">
                          {formatPricingAmount(linePrice(line).price * line.quantity, currency)}
                        </p>
                      </div>
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            disabled={sending}
                            onClick={() => adjustDraftQuantity(line.key, -1)}
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
                            onClick={() => adjustDraftQuantity(line.key, 1)}
                            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50"
                            aria-label={`Increase ${line.name}`}
                          >
                            <Plus className="h-4 w-4" aria-hidden />
                          </button>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            disabled={sending}
                            onClick={() => setChoicesTarget({ menuItemId: line.menuItemId, editKey: line.key })}
                            className="inline-flex min-h-9 items-center gap-1 rounded-lg px-2 text-sm font-medium text-blue-700 hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50"
                          >
                            <Pencil className="h-4 w-4" aria-hidden />
                            {needsChoices(itemGroups(line.menuItemId)) ? "Change" : line.note ? "Note" : "Add note"}
                            <span className="sr-only"> for {line.name}</span>
                          </button>
                          <button
                            type="button"
                            disabled={sending}
                            onClick={() => removeDraftLine(line.key)}
                            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-red-700 hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50"
                            aria-label={`Remove ${line.name}`}
                          >
                            <Trash2 className="h-4 w-4" aria-hidden />
                          </button>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
                <div className="rounded-xl bg-emerald-50 px-3 py-2.5">
                  {draftTotals.total !== draftTotals.itemsTotal || draftTotals.taxIncluded ? (
                    <dl className="mb-1 space-y-0.5 text-sm text-emerald-950">
                      <div className="flex justify-between">
                        <dt>Items</dt>
                        <dd className="tabular-nums">{formatPricingAmount(draftTotals.itemsTotal, currency)}</dd>
                      </div>
                      {draftTotals.serviceCharge > 0 ? (
                        <div className="flex justify-between">
                          <dt>Service charge</dt>
                          <dd className="tabular-nums">{formatPricingAmount(draftTotals.serviceCharge, currency)}</dd>
                        </div>
                      ) : null}
                      {draftTotals.levy > 0 ? (
                        <div className="flex justify-between">
                          <dt>State levy{draftTotals.taxIncluded ? " (in prices)" : ""}</dt>
                          <dd className="tabular-nums">{formatPricingAmount(draftTotals.levy, currency)}</dd>
                        </div>
                      ) : null}
                      {draftTotals.vat > 0 ? (
                        <div className="flex justify-between">
                          <dt>
                            VAT
                            {draftTotals.taxIncluded
                              ? draftTotals.serviceCharge > 0
                                ? " (in prices + on service)"
                                : " (in prices)"
                              : ""}
                          </dt>
                          <dd className="tabular-nums">{formatPricingAmount(draftTotals.vat, currency)}</dd>
                        </div>
                      ) : null}
                    </dl>
                  ) : null}
                  <div className="flex items-baseline justify-between">
                    <span className="text-sm font-medium text-emerald-900">Total</span>
                    <span className="font-heading text-xl font-bold tabular-nums text-slate-900">
                      {formatPricingAmount(draftTotals.total, currency)}
                    </span>
                  </div>
                </div>
                {ticketHasCourses ? (
                  <fieldset className="rounded-xl border border-slate-200 p-3">
                    <legend className="px-1 text-sm font-medium text-slate-800">When should the kitchen start?</legend>
                    <div className="space-y-1.5">
                      {FIRE_MODES.map((m) => (
                        <label key={m.value} className="flex cursor-pointer items-start gap-2 text-sm text-slate-800">
                          <input
                            type="radio"
                            name="fb-pos-fire-mode"
                            value={m.value}
                            checked={draft.fireMode === m.value}
                            disabled={sending}
                            onChange={() => setDraft((prev) => ({ ...prev, fireMode: m.value }))}
                            className="mt-0.5 h-4 w-4 accent-orange-600"
                          />
                          <span>
                            <span className="font-medium">{m.label}</span>
                            <span className="block text-xs text-slate-600">{m.hint}</span>
                          </span>
                        </label>
                      ))}
                    </div>
                  </fieldset>
                ) : null}
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
                  <label className="flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={printTickets}
                      onChange={(e) => setPrintTickets(e.target.checked)}
                      className="h-4 w-4 rounded border-slate-300"
                    />
                    Print a kitchen ticket when I send
                    <span className="sr-only"> (remembered on this device)</span>
                  </label>
                </div>
              </div>
            ) : (
              <p className="mt-4 text-sm text-slate-600">Tap menu items to build a ticket, then send it to the kitchen.</p>
            )}
          </div>
        </aside>
      </div>
      ) : null}

      {choicesTarget && choicesItem ? (
        <FbItemChoicesDialog
          key={`${choicesTarget.menuItemId}:${choicesTarget.editKey ?? "new"}`}
          open
          itemName={choicesItem.name}
          basePrice={choicesItem.price}
          currency={currency}
          groups={itemGroups(choicesTarget.menuItemId)}
          initial={
            choicesLine ? { optionIds: choicesLine.optionIds, note: choicesLine.note ?? "" } : undefined
          }
          confirmLabel={choicesLine ? "Update" : "Add to order"}
          onCancel={() => setChoicesTarget(null)}
          onConfirm={(choices) => {
            putLine(choicesTarget.menuItemId, choices, choicesTarget.editKey);
            setChoicesTarget(null);
          }}
        />
      ) : null}
    </div>
  );
}
