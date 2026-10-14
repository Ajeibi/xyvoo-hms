import { z } from "zod";

/*
 * Returns: the rules for asking to send something back and for what the shop
 * can do next. No server code, so the account page, the dashboard and the
 * checks all agree.
 */

export const RETURN_REASONS = ["wrong_size", "not_as_described", "damaged", "changed_mind", "other"] as const;
export type ReturnReason = (typeof RETURN_REASONS)[number];

export const RETURN_REASON_LABELS: Record<ReturnReason, string> = {
  wrong_size: "It doesn't fit or is the wrong size",
  not_as_described: "It isn't what I expected",
  damaged: "It arrived damaged or faulty",
  changed_mind: "I changed my mind",
  other: "Something else",
};

export const RETURN_STATUSES = ["requested", "approved", "declined", "received", "completed", "cancelled"] as const;
export type ReturnStatus = (typeof RETURN_STATUSES)[number];

export const RETURN_STATUS_LABELS: Record<ReturnStatus, string> = {
  requested: "Waiting for the shop",
  approved: "Approved: send it back",
  declined: "Not accepted",
  received: "Received by the shop",
  completed: "Completed",
  cancelled: "Cancelled",
};

/** The shop's default number of days after delivery, used when a product doesn't set its own. */
export const DEFAULT_RETURN_DAYS = 14;

export const returnRequestSchema = z.object({
  orderId: z.string().uuid(),
  items: z
    .array(z.object({ orderItemId: z.string().uuid(), quantity: z.number().int().min(1).max(999) }))
    .min(1, "Choose what you'd like to return.")
    .max(50)
    .refine((items) => new Set(items.map((i) => i.orderItemId)).size === items.length, "Each item can only be listed once."),
  reason: z.enum(RETURN_REASONS, { message: "Choose a reason." }),
  note: z.string().trim().max(500, "Keep your note under 500 characters.").optional(),
});

export const RETURN_ACTIONS = ["approve", "decline", "received", "complete", "cancel"] as const;
export type ReturnAction = (typeof RETURN_ACTIONS)[number];

export const returnDecisionSchema = z.object({
  action: z.enum(RETURN_ACTIONS),
  message: z.string().trim().max(500, "Keep your message under 500 characters.").optional(),
});

/** The status an action moves a return to, or null when the action doesn't apply to where it is now. */
export function nextReturnStatus(status: ReturnStatus, action: ReturnAction): ReturnStatus | null {
  switch (action) {
    case "approve":
      return status === "requested" ? "approved" : null;
    case "decline":
      return status === "requested" ? "declined" : null;
    case "received":
      return status === "approved" ? "received" : null;
    case "complete":
      return status === "received" ? "completed" : null;
    case "cancel":
      return status === "requested" || status === "approved" ? "cancelled" : null;
  }
}

/** Which buttons the shop sees for a return in this status, in order. */
export function availableReturnActions(status: ReturnStatus): ReturnAction[] {
  return RETURN_ACTIONS.filter((a) => nextReturnStatus(status, a) !== null);
}

export const RETURN_ACTION_LABELS: Record<ReturnAction, string> = {
  approve: "Approve the return",
  decline: "Decline",
  received: "Mark as received",
  complete: "Mark as completed",
  cancel: "Cancel the return",
};

/** The last day a return can be asked for, from the delivery date and the window in days. */
export function returnDeadline(deliveredAt: string | Date, windowDays: number) {
  const end = new Date(deliveredAt);
  end.setUTCDate(end.getUTCDate() + windowDays);
  return end;
}

/** A window of 0 days means returns aren't accepted; otherwise it's open until the end of the last day. */
export function returnWindowOpen(deliveredAt: string | Date, windowDays: number, now: Date) {
  if (windowDays <= 0) return false;
  return now.getTime() <= returnDeadline(deliveredAt, windowDays).getTime();
}

export type ReturnableLine = { orderItemId: string; name: string; quantity: number; alreadyRequested: number; returnable: boolean; windowDays: number };

/** What of an order can still be returned, and how many of each. */
export function returnableQuantity(line: Pick<ReturnableLine, "quantity" | "alreadyRequested" | "returnable" | "windowDays">, deliveredAt: string | Date, now: Date) {
  if (!line.returnable || !returnWindowOpen(deliveredAt, line.windowDays, now)) return 0;
  return Math.max(0, line.quantity - line.alreadyRequested);
}
