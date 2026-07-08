type TimedOrder = {
  sent_to_kitchen_at: string | null;
  created_at: string;
  closed_at?: string | null;
  voided_at?: string | null;
};

type KitchenItem = { kitchen_status: string };

export type TicketAgeColors = {
  borderColor: string;
  backgroundColor: string;
};

/** Default kitchen wait threshold (minutes) when not configured in back office. */
export const FB_ORDER_OVERDUE_MINUTES = 10;

export function resolveOverdueMinutes(overdueMinutes?: number | null) {
  if (overdueMinutes == null || !Number.isFinite(overdueMinutes) || overdueMinutes < 1) {
    return FB_ORDER_OVERDUE_MINUTES;
  }
  return Math.min(120, Math.max(1, Math.round(overdueMinutes)));
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function lerpRgb(
  from: [number, number, number],
  to: [number, number, number],
  t: number,
): string {
  const r = Math.round(lerp(from[0], to[0], t));
  const g = Math.round(lerp(from[1], to[1], t));
  const b = Math.round(lerp(from[2], to[2], t));
  return `rgb(${r}, ${g}, ${b})`;
}

export function orderStartMs(sentAt: string | null, createdAt: string) {
  return new Date(sentAt ?? createdAt).getTime();
}

/** Stable `now` for SSR / pre-hydration (0 minutes elapsed). */
export function resolveTimingNow(now: number | null, sentAt: string | null, createdAt: string) {
  return now ?? orderStartMs(sentAt, createdAt);
}

export function ticketWaitMinsFloat(sentAt: string | null, createdAt: string, now = Date.now()) {
  return Math.max(0, (now - orderStartMs(sentAt, createdAt)) / 60_000);
}

export function waitMinutes(sentAt: string | null, createdAt: string, now = Date.now()) {
  return Math.floor(ticketWaitMinsFloat(sentAt, createdAt, now));
}

/** e.g. 11m, 1h 30m, 96h 11m */
export function formatDurationMinutes(totalMins: number) {
  const mins = Math.max(0, Math.floor(totalMins));
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  const remainder = mins % 60;
  return remainder > 0 ? `${hours}h ${remainder}m` : `${hours}h`;
}

export function formatWaitMinutes(sentAt: string | null, createdAt: string, now = Date.now()) {
  return formatDurationMinutes(waitMinutes(sentAt, createdAt, now));
}

export function isOrderKitchenOverdue(
  sentAt: string | null,
  createdAt: string,
  now: number,
  hasOpenKitchenItems: boolean,
  overdueMinutes = FB_ORDER_OVERDUE_MINUTES,
) {
  const threshold = resolveOverdueMinutes(overdueMinutes);
  return hasOpenKitchenItems && ticketWaitMinsFloat(sentAt, createdAt, now) >= threshold;
}

/**
 * Card border + background: green at 0m → amber at half → red at threshold, then deepens if still open.
 */
export function ticketAgeStyle(
  sentAt: string | null,
  createdAt: string,
  now: number,
  options?: { kitchenComplete?: boolean; overdueMinutes?: number },
): TicketAgeColors {
  if (options?.kitchenComplete) {
    return {
      borderColor: "#6ee7b7",
      backgroundColor: "#ecfdf5",
    };
  }

  const threshold = resolveOverdueMinutes(options?.overdueMinutes);
  const mins = ticketWaitMinsFloat(sentAt, createdAt, now);

  const bgGreen: [number, number, number] = [236, 253, 245];
  const borderGreen: [number, number, number] = [110, 231, 183];
  const bgAmber: [number, number, number] = [255, 251, 235];
  const borderAmber: [number, number, number] = [251, 191, 36];
  const bgRed: [number, number, number] = [254, 202, 202];
  const borderRed: [number, number, number] = [220, 38, 38];
  const bgDeep: [number, number, number] = [254, 226, 226];
  const borderDeep: [number, number, number] = [185, 28, 28];

  if (mins >= threshold) {
    const extraT = Math.min(1, (mins - threshold) / 30);
    return {
      borderColor: lerpRgb(borderRed, borderDeep, extraT),
      backgroundColor: lerpRgb(bgRed, bgDeep, extraT),
    };
  }

  const t = mins / threshold;

  if (t < 0.5) {
    const local = t * 2;
    return {
      borderColor: lerpRgb(borderGreen, borderAmber, local),
      backgroundColor: lerpRgb(bgGreen, bgAmber, local),
    };
  }

  const local = (t - 0.5) * 2;
  return {
    borderColor: lerpRgb(borderAmber, borderRed, local),
    backgroundColor: lerpRgb(bgAmber, bgRed, local),
  };
}

export type BadgeColors = {
  backgroundColor: string;
  borderColor: string;
  color: string;
};

/**
 * Colour a finished duration using the same green → amber → red scale as the live KDS board.
 */
export function kitchenTimeBadgeStyle(
  minutes: number | null,
  overdueMinutes?: number,
): BadgeColors | null {
  if (minutes === null) return null;
  const threshold = resolveOverdueMinutes(overdueMinutes);
  const mins = Math.max(0, minutes);

  const textGreen: [number, number, number] = [4, 120, 87];
  const textAmber: [number, number, number] = [180, 83, 9];
  const textRed: [number, number, number] = [185, 28, 28];
  const textDeep: [number, number, number] = [127, 29, 29];

  // Reuse live-board colour curve: simulate elapsed time with end = start + minutes.
  const sentAt = new Date(0).toISOString();
  const endMs = mins * 60_000;
  const age = ticketAgeStyle(sentAt, sentAt, endMs, { overdueMinutes: threshold });

  let textT: number;
  if (mins >= threshold) {
    textT = Math.min(1, (mins - threshold) / 30);
    return {
      backgroundColor: age.backgroundColor,
      borderColor: age.borderColor,
      color: lerpRgb(textRed, textDeep, textT),
    };
  }

  const t = mins / threshold;
  if (t < 0.5) {
    textT = t * 2;
    return {
      backgroundColor: age.backgroundColor,
      borderColor: age.borderColor,
      color: lerpRgb(textGreen, textAmber, textT),
    };
  }

  textT = (t - 0.5) * 2;
  return {
    backgroundColor: age.backgroundColor,
    borderColor: age.borderColor,
    color: lerpRgb(textAmber, textRed, textT),
  };
}

export function kitchenTimeMinutes(order: TimedOrder) {
  if (!order.sent_to_kitchen_at) return null;
  const end = new Date(order.closed_at ?? order.voided_at ?? order.created_at).getTime();
  const start = new Date(order.sent_to_kitchen_at).getTime();
  return Math.max(0, Math.round((end - start) / 60_000));
}

export function formatKitchenTimeMinutes(order: TimedOrder) {
  const mins = kitchenTimeMinutes(order);
  return mins === null ? "—" : formatDurationMinutes(mins);
}

export function isKitchenWorkComplete(items: KitchenItem[]) {
  return (
    items.length > 0 &&
    items.every(
      (item) => item.kitchen_status !== "pending" && item.kitchen_status !== "preparing",
    )
  );
}

export function hasOpenKitchenItems(items: KitchenItem[]) {
  return items.some(
    (item) => item.kitchen_status === "pending" || item.kitchen_status === "preparing",
  );
}

export function isOrderFullyServed(items: KitchenItem[]) {
  const active = items.filter((item) => item.kitchen_status !== "voided");
  return active.length > 0 && active.every((item) => item.kitchen_status === "served");
}

export function canMarkOrderServed(order: { status: string; items: KitchenItem[] }) {
  return (
    order.status === "ready" &&
    isKitchenWorkComplete(order.items) &&
    !isOrderFullyServed(order.items)
  );
}
