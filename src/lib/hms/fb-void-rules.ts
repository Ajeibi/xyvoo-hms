/**
 * Rules for taking lines off a bill (voids), giving them free (comps) and
 * cancelling whole orders. Pure, shared by Open orders and the server.
 *
 * Anything the kitchen has started on is waste once removed, so it needs a
 * reason and a manager. A line still held or unsent can come off freely.
 * A comp always needs a reason and a manager.
 */

export const FB_VOID_REASONS = [
  "Guest changed their mind",
  "Entered by mistake",
  "Took too long",
  "Kitchen error",
] as const;

export const FB_COMP_REASONS = [
  "Quality complaint",
  "Long wait",
  "Manager's guest",
  "Staff meal",
] as const;

export const FB_WAIVE_REASONS = [
  "Guest asked",
  "Service complaint",
  "Hotel's guest",
] as const;

export const FB_REASON_MAX = 200;

type LineState = { kitchen_status: string; fired_at: string | null; price_snapshot?: number; comped_at?: string | null };

/** True once the kitchen could have started on the line. */
export function kitchenHasStarted(item: LineState) {
  return Boolean(item.fired_at) || ["preparing", "ready", "served"].includes(item.kitchen_status);
}

export type AdjustmentNeeds = { allowed: boolean; error?: string; needsReason: boolean; needsManager: boolean };

export function voidNeeds(item: LineState): AdjustmentNeeds {
  if (item.kitchen_status === "voided") {
    return { allowed: false, error: "That item is already off the bill.", needsReason: false, needsManager: false };
  }
  const started = kitchenHasStarted(item);
  return { allowed: true, needsReason: started, needsManager: started };
}

export function compNeeds(item: LineState): AdjustmentNeeds {
  if (item.kitchen_status === "voided") {
    return { allowed: false, error: "That item is off the bill, so it can't be given free.", needsReason: false, needsManager: false };
  }
  if (item.comped_at || (item.price_snapshot ?? 1) === 0) {
    return { allowed: false, error: "That item is already free.", needsReason: false, needsManager: false };
  }
  return { allowed: true, needsReason: true, needsManager: true };
}

/** Cancelling a whole order: free before the kitchen starts, otherwise reason and manager. */
export function cancelNeeds(items: LineState[]): AdjustmentNeeds {
  const started = items.some((i) => i.kitchen_status !== "voided" && kitchenHasStarted(i));
  return { allowed: true, needsReason: started, needsManager: started };
}

/** Tidies a reason; returns an error when one is needed and missing. */
export function checkReason(reason: string | null | undefined, needed: boolean) {
  const text = (reason ?? "").replace(/\s+/g, " ").trim().slice(0, FB_REASON_MAX);
  if (needed && !text) return { reason: null, error: "Give a reason." };
  return { reason: text || null, error: null };
}
